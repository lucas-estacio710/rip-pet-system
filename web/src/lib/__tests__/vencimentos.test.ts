import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vencimentoNoMes, proximosVencimentos, porQueNaoUtil, descreverRegra } from '../vencimentos.ts'

// Outubro/2026: dia 10 é sábado e 12 é feriado (N. Sra. Aparecida) — o caso que o Lucas descreveu.
test('dia 10 de outubro/2026 cai na terça 13 (sábado, domingo e feriado riscados)', () => {
  const v = vencimentoNoMes({ regra: 'dia', dia: 10, ajuste: 'depois' }, 2026, 9)
  assert.deepEqual(v, { original: '2026-10-10', data: '2026-10-13', riscados: ['2026-10-10', '2026-10-11', '2026-10-12'] })
})

test('ajuste "antes" volta pra sexta', () => {
  const v = vencimentoNoMes({ regra: 'dia', dia: 10, ajuste: 'antes' }, 2026, 9)
  assert.equal(v?.data, '2026-10-09')
})

test('5º dia útil de outubro/2026 é quarta 07; de novembro (Finados na segunda 02) é 09', () => {
  assert.equal(vencimentoNoMes({ regra: 'dia_util', dia: 5, ajuste: 'depois' }, 2026, 9)?.data, '2026-10-07')
  assert.equal(vencimentoNoMes({ regra: 'dia_util', dia: 5, ajuste: 'depois' }, 2026, 10)?.data, '2026-11-09')
})

test('último dia útil de outubro/2026 é sexta 30 (31 é sábado)', () => {
  assert.equal(vencimentoNoMes({ regra: 'ultimo_util', dia: null, ajuste: 'antes' }, 2026, 9)?.data, '2026-10-30')
})

test('dia 31 em mês de 30 vira o último dia; janeiro/2027 dia 10 (domingo) vai pra segunda 11', () => {
  assert.equal(vencimentoNoMes({ regra: 'dia', dia: 31, ajuste: 'depois' }, 2026, 10)?.original, '2026-11-30')
  assert.equal(vencimentoNoMes({ regra: 'dia', dia: 10, ajuste: 'depois' }, 2027, 0)?.data, '2027-01-11')
})

test('prévia: os próximos 4 do aluguel', () => {
  const p = proximosVencimentos({ regra: 'dia', dia: 10, ajuste: 'depois' }, 2026, 9, 4).map(v => v.data)
  assert.deepEqual(p, ['2026-10-13', '2026-11-10', '2026-12-10', '2027-01-11'])
})

test('porQueNaoUtil e descreverRegra', () => {
  assert.equal(porQueNaoUtil('2026-10-10'), 'sábado')
  assert.equal(porQueNaoUtil('2026-10-12'), 'feriado (N. Sra. Aparecida)')
  assert.equal(porQueNaoUtil('2026-10-13'), '')
  assert.equal(descreverRegra({ regra: 'dia_util', dia: 5, ajuste: 'depois' }), '5º dia útil')
})
