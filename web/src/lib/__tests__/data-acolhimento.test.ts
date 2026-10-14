import { test } from 'node:test'
import assert from 'node:assert/strict'
import { erroDataAcolhimento, limitesDataAcolhimento } from '../data-acolhimento.ts'

const agora = new Date('2026-10-14T15:00:00')

test('vazio não é erro (obrigatoriedade é de quem chama)', () => {
  assert.equal(erroDataAcolhimento('', { agora }), null)
  assert.equal(erroDataAcolhimento(null, { agora }), null)
})

test('hoje e 3 semanas atrás passam', () => {
  assert.equal(erroDataAcolhimento('2026-10-14T09:30', { agora }), null)
  assert.equal(erroDataAcolhimento('2026-09-23T09:30', { agora }), null)
})

test('mais de 1 mês atrás é recusado', () => {
  assert.match(erroDataAcolhimento('2026-09-10T09:30', { agora })!, /mais de 1 mês/)
})

test('os anos errados reais são recusados', () => {
  for (const v of ['0026-05-23T19:06', '0206-05-14T16:16', '0006-06-02T10:48', '1726-05-07T17:32']) {
    assert.match(erroDataAcolhimento(v, { agora })!, /ano/)
  }
  for (const v of ['2027-07-29T11:32', '2029-06-12T11:35']) {
    assert.match(erroDataAcolhimento(v, { agora })!, /futuro/)
  }
})

test('correção de contrato antigo: sem limite de 1 mês, mas o ano ainda trava', () => {
  assert.equal(erroDataAcolhimento('2026-05-14T16:16', { agora, semLimiteAtras: true }), null)
  assert.match(erroDataAcolhimento('0026-05-14T16:16', { agora, semLimiteAtras: true })!, /ano/)
})

test('limites do input', () => {
  assert.deepEqual(limitesDataAcolhimento(agora), { min: '2026-09-14T15:00', max: '2026-10-14T23:59' })
})
