import { test } from 'node:test'
import assert from 'node:assert/strict'
import { haQuantoTempo } from '../ha-quanto-tempo.ts'

test('há quanto tempo: hoje, ontem, dias, semanas, meses, anos', () => {
  const h = '2026-10-15'
  assert.equal(haQuantoTempo('2026-10-15', h), 'Hoje')
  assert.equal(haQuantoTempo('2026-10-14', h), 'Ontem')
  assert.equal(haQuantoTempo('2026-10-11', h), 'Há 4 dias')
  assert.equal(haQuantoTempo('2026-10-08', h), 'Há 1 semana')       // exatamente 7
  assert.equal(haQuantoTempo('2026-10-06', h), 'Há +1 semana')      // 9 dias
  assert.equal(haQuantoTempo('2026-10-01', h), 'Há 2 semanas')      // 14
  assert.equal(haQuantoTempo('2026-09-20', h), 'Há +3 semanas')     // 25
  assert.equal(haQuantoTempo('2026-09-10', h), 'Há +1 mês')         // 35
  assert.equal(haQuantoTempo('2026-07-01', h), 'Há +3 meses')
  assert.equal(haQuantoTempo('2025-09-01', h), 'Há +1 ano')
  assert.equal(haQuantoTempo('2026-10-16', h), 'Futuro')
  assert.equal(haQuantoTempo('2026-03-01', '2026-03-31'), 'Há +1 mês')   // 30 dias, sem fuso
})
