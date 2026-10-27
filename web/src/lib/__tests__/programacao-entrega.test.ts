import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparProgramacao, rotuloDoDia } from '../programacao-entrega.ts'

const HOJE = '2026-10-27'

test('rótulos relativos a hoje', () => {
  assert.equal(rotuloDoDia('2026-10-27', HOJE), 'Hoje (27/out)')
  assert.equal(rotuloDoDia('2026-10-28', HOJE), 'Amanhã (28/out)')
  assert.equal(rotuloDoDia('2026-10-26', HOJE), 'Ontem (26/out)')
  assert.equal(rotuloDoDia('2026-10-24', HOJE), 'Há 3 dias (24/out)')
  assert.equal(rotuloDoDia('2026-10-29', HOJE), 'qui (29/out)')
  assert.equal(rotuloDoDia('2026-11-02', HOJE), 'seg (02/nov)')
})

test('pool, dias em ordem cronológica e "Sem data" no fim', () => {
  const prog: Record<string, { prevData?: string; prevPeriodo?: string } | null> = {
    a: null,
    b: { prevData: '2026-10-28', prevPeriodo: 'tarde' },
    c: { prevData: '2026-10-28', prevPeriodo: 'manha' },
    d: {},
    e: { prevData: '2026-10-24' },
    f: { prevData: '2026-10-27', prevPeriodo: 'dia_todo' },
  }
  const r = agruparProgramacao(Object.keys(prog), k => prog[k], HOJE)
  assert.deepEqual(r.pool, ['a'])
  assert.deepEqual(r.dias.map(d => d.chave), ['2026-10-24', '2026-10-27', '2026-10-28', 'sem_data'])
  assert.deepEqual(r.dias[2].itens, ['c', 'b'])           // manhã antes da tarde
  assert.equal(r.dias[0].atrasado, true)
  assert.equal(r.dias[1].hoje, true)
  assert.equal(r.dias[3].rotulo, 'Sem data')
})
