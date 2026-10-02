import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatarIdade, podeMarcarFeitoSemFoto } from '../atribuir-tarefa.ts'

test('formatarIdade', () => {
  assert.equal(formatarIdade(0), 'agora')
  assert.equal(formatarIdade(0.9), 'agora')
  assert.equal(formatarIdade(NaN), 'agora')
  assert.equal(formatarIdade(5.7), '5h')
  assert.equal(formatarIdade(24), '1d')
  assert.equal(formatarIdade(52), '2d 4h')
  assert.equal(formatarIdade(1200), '50d')
})

test('podeMarcarFeitoSemFoto espelha o trigger da mig 147', () => {
  const base = { exigeFoto: true, unidadeTemOperacional: true, isSuperAdmin: false }
  assert.equal(podeMarcarFeitoSemFoto({ ...base, role: 'operador' }), false)
  assert.equal(podeMarcarFeitoSemFoto({ ...base, role: 'gerente' }), true)
  assert.equal(podeMarcarFeitoSemFoto({ ...base, role: 'operador', isSuperAdmin: true }), true)
  // tipo sem exigência de foto, ou unidade sem o Operacional: ninguém é barrado
  assert.equal(podeMarcarFeitoSemFoto({ ...base, role: 'operador', exigeFoto: false }), true)
  assert.equal(podeMarcarFeitoSemFoto({ ...base, role: 'operador', unidadeTemOperacional: false }), true)
})
