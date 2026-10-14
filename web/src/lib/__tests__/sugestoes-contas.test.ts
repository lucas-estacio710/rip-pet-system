import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sugerirContas, mesesFechados, type LancHist } from '../sugestoes-contas.ts'

const L = (cat: string, data: string, valor: number, extra: Partial<LancHist> = {}): LancHist => ({
  categoria_id: cat, fornecedor_nome: null, valor, data_caixa: data, metodo_pagamento: 'pix',
  conta_pagamento_id: 'inter', conta_codigo: '4.2.01', conta_fixa_id: null, ...extra,
})
const base = { hoje: '2026-10-14', contasCartao: new Set(['cartao']), categoriasJaUsadas: new Set<string>() }

test('mesesFechados: os 5 meses antes do atual', () => {
  assert.deepEqual(mesesFechados('2026-02-10'), ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01'])
})

test('aluguel fixo vira sugestão de dia 10, valor do último mês', () => {
  const r = sugerirContas([L('alu', '2026-06-10', 6951.59), L('alu', '2026-07-11', 7087.14), L('alu', '2026-08-10', 7087.14), L('alu', '2026-09-10', 7087.14)], base)
  assert.equal(r.length, 1)
  assert.equal(r[0].valor, 7087.14); assert.equal(r[0].varia, false); assert.equal(r[0].regra, 'dia'); assert.equal(r[0].dia, 10)
})

test('fim do mês vira último dia útil', () => {
  const r = sugerirContas([L('ces', '2026-07-31', 400), L('ces', '2026-08-29', 400), L('ces', '2026-09-30', 400)], base)
  assert.equal(r[0].regra, 'ultimo_util'); assert.equal(r[0].dia, null)
})

test('cartão, distribuição, várias por mês e categoria já usada ficam de fora', () => {
  const cartao = ['06', '07', '08'].map(m => L('hosp', `2026-${m}-10`, 108, { conta_pagamento_id: 'cartao' }))
  const ret = ['06', '07', '08'].map(m => L('ret', `2026-${m}-05`, 5000, { conta_codigo: '6.1.01' }))
  const comb = ['06', '07', '08'].flatMap(m => [L('comb', `2026-${m}-03`, 100), L('comb', `2026-${m}-20`, 150)])
  const agua = ['06', '07', '08'].map(m => L('agua', `2026-${m}-15`, 160))
  const r = sugerirContas([...cartao, ...ret, ...comb, ...agua], { ...base, categoriasJaUsadas: new Set(['agua']) })
  assert.equal(r.length, 0)
})

test('valor que muda fica com a mediana e marca varia', () => {
  const r = sugerirContas([L('ene', '2026-06-15', 353.91), L('ene', '2026-07-17', 538.06), L('ene', '2026-08-24', 563.6), L('ene', '2026-09-10', 379.69)], base)
  assert.equal(r[0].varia, true); assert.equal(r[0].diaVaria, true)
})
