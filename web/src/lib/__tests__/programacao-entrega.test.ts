import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparProgramacao, mensagemDoPeriodo, rotuloDoDia } from '../programacao-entrega.ts'

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
  assert.deepEqual(r.dias[2].periodos.map(p => p.rotulo), ['Manhã', 'Tarde'])
  assert.deepEqual(r.dias[0].periodos.map(p => p.rotulo), ['Sem período'])
})

test('mensagem do período: título relativo, lacre - pet, endereço alterado e observação', () => {
  const msg = mensagemDoPeriodo('2026-10-27', 'manha', HOJE, [
    { lacre: '4988', pet: 'OZZY', local: 'Gonzaga, Santos', endereco: 'Av Hugo Maia 51', obs: 'Após as 10h' },
    { lacre: null, pet: 'SKY ', local: 'Boqueirão, Santos' },
    { lacre: '7', pet: 'REX' },
  ])
  assert.equal(msg, '*Entregas de hoje de manhã (27/out)*\n4988 - OZZY\n   📍 Av Hugo Maia 51 (endereço alterado)\n   📝 Após as 10h\ns/ lacre - SKY - Boqueirão, Santos\n7 - REX')
  assert.equal(mensagemDoPeriodo('2026-10-28', 'tarde', HOJE, []), '*Entregas de amanhã à tarde (28/out)*')
  assert.equal(mensagemDoPeriodo('2026-10-29', 'sem_periodo', HOJE, []), '*Entregas de quinta (sem período) (29/out)*')
  assert.equal(mensagemDoPeriodo('sem_data', 'dia_todo', HOJE, []), '*Entregas sem data (dia todo)*')
})
