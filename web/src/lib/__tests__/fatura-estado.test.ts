import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoDaFatura, pendenciasDaFatura, casarPagamentoFatura, type FaturaResumo } from '../fatura-estado.ts'

const inter = (x: Partial<FaturaResumo> = {}): FaturaResumo => ({
  cartaoId: 'inter', cartaoNome: 'Inter', venc: '2026-10-10', soma: 7771.26, totalPdf: 7771.26,
  semCat: 0, paga: false, pagaConciliada: false, ...x,
})

test('estado: em aberto, pronta pra pagar, pronta pra conciliar (o vencimento decide), paga', () => {
  assert.equal(estadoDaFatura(inter({ soma: 7701.26 }), '2026-10-05'), 'em_aberto')   // faltam as floriculturas
  assert.equal(estadoDaFatura(inter({ semCat: 2 }), '2026-10-05'), 'em_aberto')
  assert.equal(estadoDaFatura(inter({ totalPdf: null }), '2026-10-05'), 'em_aberto')   // sem o PDF não se sabe o total
  assert.equal(estadoDaFatura(inter(), '2026-10-05'), 'pronta_pagar')
  assert.equal(estadoDaFatura(inter(), '2026-10-10'), 'pronta_pagar')                  // vence hoje: ainda é pagar
  assert.equal(estadoDaFatura(inter(), '2026-10-11'), 'pronta_conciliar')
  assert.equal(estadoDaFatura(inter({ paga: true, soma: 1 }), '2026-10-11'), 'paga')
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
  const e = casarPagamentoFatura(-7701.26, '2026-10-09', [inter()])
  assert.match(e!.tipo === 'difere' ? e!.aviso : '', /banco pagou R\$ 7\.701,26 e a fatura está com R\$ 7\.771,26 \(diferença de R\$ 70,00\)/)
  assert.equal(casarPagamentoFatura(-7771.26, '2026-12-01', [inter()]), null)          // longe do vencimento
  assert.equal(casarPagamentoFatura(-7771.26, '2026-10-09', [inter({ paga: true })]), null)
  // duas faturas: escolhe a que bate, não a mais perto
  const nov = inter({ venc: '2026-10-25', soma: 500, totalPdf: 500, cartaoNome: 'Itaú' })
  const r = casarPagamentoFatura(-500, '2026-10-12', [inter(), nov])
  assert.equal(r?.tipo === 'bate' && r.fatura.cartaoNome, 'Itaú')
})
