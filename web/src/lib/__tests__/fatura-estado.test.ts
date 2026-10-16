import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoDaFatura, pendenciasDaFatura, casarPagamentoFatura, encadearFaturas, faltaPagar, situacaoParcial, type FaturaResumo } from '../fatura-estado.ts'

const inter = (x: Partial<FaturaResumo> = {}): FaturaResumo => ({
  cartaoId: 'inter', cartaoNome: 'Inter', venc: '2026-10-10', soma: 7771.26, totalPdf: 7771.26,
  semCat: 0, pago: 0, pagaConciliada: false, ...x,
})

test('estado: em aberto, pronta pra pagar, pronta pra conciliar (o vencimento decide), paga', () => {
  assert.equal(estadoDaFatura(inter({ soma: 7701.26 }), '2026-10-05'), 'em_aberto')   // faltam as floriculturas
  assert.equal(estadoDaFatura(inter({ semCat: 2 }), '2026-10-05'), 'em_aberto')
  assert.equal(estadoDaFatura(inter({ totalPdf: null }), '2026-10-05'), 'em_aberto')   // sem o PDF não se sabe o total
  assert.equal(estadoDaFatura(inter(), '2026-10-05'), 'pronta_pagar')
  assert.equal(estadoDaFatura(inter(), '2026-10-10'), 'pronta_pagar')                  // vence hoje: ainda é pagar
  assert.equal(estadoDaFatura(inter(), '2026-10-11'), 'pronta_conciliar')
  assert.equal(estadoDaFatura(inter({ pago: 7771.26 }), '2026-10-11'), 'paga')
  assert.equal(estadoDaFatura(inter({ pago: 1000 }), '2026-10-11'), 'paga_parte')
  assert.equal(faltaPagar(inter({ pago: 1000 })), 6771.26)
})

test('pendências dizem o que fazer', () => {
  const p = pendenciasDaFatura(inter({ soma: 7701.26, semCat: 1 }))
  assert.equal(p.length, 2)
  assert.match(p[0], /faltam R\$ 70,00 em compras/)
  assert.match(p[1], /1 compra sem categoria/)
  assert.match(pendenciasDaFatura(inter({ soma: 7800 }))[0], /a mais/)
})

test('casar pagamento: bate, difere com aviso, sem fatura perto', () => {
  assert.equal(casarPagamentoFatura(-7771.26, '2026-10-09', [inter()])?.tipo, 'bate')
  // sem PDF, o banco confirma o total quando a soma bate
  assert.equal(casarPagamentoFatura(-7771.26, '2026-10-09', [inter({ totalPdf: null })])?.tipo, 'bate')
  const d = casarPagamentoFatura(-7771.26, '2026-10-09', [inter({ soma: 7701.26 })])
  assert.equal(d?.tipo, 'difere')
  assert.match(d!.tipo === 'difere' ? d!.aviso : '', /ainda não está conferida.*faltam R\$ 70,00/)
  assert.equal(d!.tipo === 'difere' && d!.podeParcial, false)                          // não conferida: não oferece parcial
  const e = casarPagamentoFatura(-7701.26, '2026-10-09', [inter()])
  assert.match(e!.tipo === 'difere' ? e!.aviso : '', /banco pagou R\$ 7\.701,26 e a fatura está com R\$ 7\.771,26 \(diferença de R\$ 70,00\)/)
  assert.equal(e!.tipo === 'difere' && e!.podeParcial, true)                           // pagou menos de uma conferida
  const mais = casarPagamentoFatura(-7800, '2026-10-09', [inter()])
  assert.equal(mais!.tipo === 'difere' && mais!.podeParcial, false)                    // pagou a mais: não é parcial
  assert.equal(casarPagamentoFatura(-7771.26, '2026-12-01', [inter()]), null)          // longe do vencimento
  assert.equal(casarPagamentoFatura(-7771.26, '2026-10-09', [inter({ pago: 7771.26 })]), null)
  // duas faturas: escolhe a que bate, não a mais perto
  const nov = inter({ venc: '2026-10-25', soma: 500, totalPdf: 500, cartaoNome: 'Itaú' })
  const r = casarPagamentoFatura(-500, '2026-10-12', [inter(), nov])
  assert.equal(r?.tipo === 'bate' && r.fatura.cartaoNome, 'Itaú')
  // o resto de uma paga em parte bate com o 2º pagamento
  assert.equal(casarPagamentoFatura(-6771.26, '2026-10-15', [inter({ pago: 1000 })])?.tipo, 'bate')
})

test('parcial: o resto vai pra fatura seguinte, que fecha com soma + carregado', () => {
  const out = inter({ pago: 1000 })                                                    // pagou R$ 1.000 de 7.771,26
  // a de novembro: compras 3.000 + juros 200 (lançados) e o PDF soma o saldo anterior 6.771,26
  const nov = inter({ venc: '2026-11-10', soma: 3200, totalPdf: 9971.26 })
  const [a, b] = encadearFaturas([nov, out]).sort((x, y) => x.venc.localeCompare(y.venc))
  assert.equal(b.carregado, 6771.26)
  assert.equal(a.restoNaSeguinte, '2026-11-10')
  assert.equal(estadoDaFatura(a, '2026-11-01'), 'paga_parte')
  assert.equal(faltaPagar(a), 0)                                                       // não espera mais pagamento
  assert.match(situacaoParcial(a), /o resto \(R\$ 6\.771,26\) foi para a fatura de 10\/11/)
  assert.equal(estadoDaFatura(b, '2026-11-01'), 'pronta_pagar')                        // fecha com o PDF
  assert.equal(casarPagamentoFatura(-9971.26, '2026-11-10', [a, b])?.tipo, 'bate')
  // juros ainda não lançados: o PDF traz resto + juros → passa o resto e os juros aparecem como compra a lançar
  const [, b2] = encadearFaturas([out, inter({ venc: '2026-11-10', soma: 3000, totalPdf: 9971.26 })])
  assert.equal(b2.carregado, 6771.26)
  assert.match(pendenciasDaFatura(b2)[0], /faltam R\$ 200,00 em compras/)
})

test('parcial: sem o PDF da seguinte (ou se ela não trouxe o resto), o resto segue devido na de origem', () => {
  const out = inter({ pago: 1000 })
  const novSemPdf = inter({ venc: '2026-11-10', soma: 300, totalPdf: null })          // compra nova já no próximo vencimento
  const [a, b] = encadearFaturas([out, novSemPdf])
  assert.equal(a.restoNaSeguinte, undefined)
  assert.equal(b.carregado, undefined)
  assert.equal(faltaPagar(a), 6771.26)
  // pagou o resto antes do fechamento: o 2º pagamento bate com a de origem, mesmo com a seguinte na lista
  assert.equal(casarPagamentoFatura(-6771.26, '2026-10-20', [a, b])?.tipo === 'bate' && casarPagamentoFatura(-6771.26, '2026-10-20', [a, b])!.fatura.venc, '2026-10-10')
  // o PDF da seguinte NÃO trouxe o resto (já pago): não encadeia
  const [a2] = encadearFaturas([out, inter({ venc: '2026-11-10', soma: 300, totalPdf: 300 })])
  assert.equal(a2.restoNaSeguinte, undefined)
})

test('a linha do saldo anterior na fatura seguinte não é compra', async () => {
  const { foraDoCartao } = await import('../extrato.ts')
  assert.match(foraDoCartao('SALDO ANTERIOR') || '', /^saldo da fatura anterior/)
  assert.match(foraDoCartao('Saldo em atraso') || '', /^saldo da fatura anterior/)
  assert.match(foraDoCartao('PAGAMENTO ON LINE') || '', /^pagamento/)
  assert.equal(foraDoCartao('JUROS DE ROTATIVO'), null)                                // juros é despesa
  assert.equal(foraDoCartao('FLORICULTURA BOM JESUS'), null)
})
