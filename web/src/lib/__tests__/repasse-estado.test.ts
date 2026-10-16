import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoDoRepasse, vencimentoRepasse, pendenciaRepasse, casarPagamentoRepasse, faltaRepasse, type RepasseResumo } from '../repasse-estado.ts'

const set = (x: Partial<RepasseResumo> = {}): RepasseResumo => ({ id: 'r9', ref: '2026-09', total: 11450, pago: 0, conferidoTotal: 11450, ...x })

test('vencimento: dia 20 do mês seguinte, dia útil', () => {
  assert.equal(vencimentoRepasse('2026-09'), '2026-10-20')
  assert.equal(vencimentoRepasse('2026-12'), '2027-01-20')
  assert.equal(vencimentoRepasse('2026-05'), '2026-06-22')                             // 20/06/2026 é sábado
})

test('estado: em aberto, pronto pra pagar/conciliar pelo vencimento, pago em parte, pago', () => {
  assert.equal(estadoDoRepasse(set({ conferidoTotal: null }), '2026-10-16'), 'em_aberto')
  assert.equal(estadoDoRepasse(set({ conferidoTotal: 11000 }), '2026-10-16'), 'em_aberto')   // a Matriz mudou depois
  assert.equal(estadoDoRepasse(set(), '2026-10-20'), 'pronto_pagar')
  assert.equal(estadoDoRepasse(set(), '2026-10-21'), 'pronto_conciliar')
  assert.equal(estadoDoRepasse(set({ pago: 5000 }), '2026-10-21'), 'pago_parte')
  assert.equal(estadoDoRepasse(set({ pago: 11450 }), '2026-10-21'), 'pago')
  assert.equal(estadoDoRepasse(set({ status: 'pago', pago: 11000 }), '2026-10-21'), 'pago')  // quitado à mão com desconto
  assert.equal(faltaRepasse(set({ pago: 5000 })), 6450)
})

test('pendência diz o que fazer', () => {
  assert.equal(pendenciaRepasse(set()), null)
  assert.match(pendenciaRepasse(set({ conferidoTotal: null }))!, /marque "Conferi"/)
  assert.match(pendenciaRepasse(set({ conferidoTotal: 11000 }))!, /era R\$ 11\.000,00, agora R\$ 11\.450,00/)
})

test('casar pagamento: bate, difere, parcial, o mais antigo primeiro', () => {
  assert.equal(casarPagamentoRepasse(-11450, [set()])?.tipo, 'bate')
  const naoConf = casarPagamentoRepasse(-11450, [set({ conferidoTotal: null })])
  assert.match(naoConf!.tipo === 'difere' ? naoConf!.aviso : '', /ainda não está conferido/)
  const menos = casarPagamentoRepasse(-5000, [set()])
  assert.equal(menos!.tipo === 'difere' && menos!.podeParcial, true)
  assert.match(menos!.tipo === 'difere' ? menos!.aviso : '', /banco pagou R\$ 5\.000,00 e o repasse é de R\$ 11\.450,00/)
  // o resto de um pago em parte bate com o 2º pagamento
  assert.equal(casarPagamentoRepasse(-6450, [set({ pago: 5000 })])?.tipo, 'bate')
  // dois em aberto: o valor escolhe; sem valor igual, o mais antigo
  const ago = set({ id: 'r8', ref: '2026-08', total: 9000, conferidoTotal: 9000 })
  const r = casarPagamentoRepasse(-11450, [set(), ago])
  assert.equal(r?.tipo === 'bate' && r.repasse.ref, '2026-09')
  const s = casarPagamentoRepasse(-100, [set(), ago])
  assert.equal(s?.repasse.ref, '2026-08')
  assert.equal(casarPagamentoRepasse(-100, [set({ pago: 11450 })]), null)
})
