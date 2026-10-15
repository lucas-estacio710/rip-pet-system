import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conferidoNoBanco } from '../conferido.ts'

const inicio = new Map([['inter', '2026-07-21']])

test('conferido: conciliado, não conciliável, antes da 1ª conciliação, nunca conciliou', () => {
  const ctx = { inicio, naoConciliaveis: new Set(['dinheiro']) }
  assert.equal(conferidoNoBanco(true, 'itau', '2026-10-01', ctx), true)          // bateu com o extrato
  assert.equal(conferidoNoBanco(false, 'dinheiro', '2026-10-01', ctx), true)     // conta sem extrato
  assert.equal(conferidoNoBanco(false, 'inter', '2026-07-20', ctx), true)        // antes da 1ª conciliação
  assert.equal(conferidoNoBanco(false, 'inter', '2026-07-21', ctx), false)       // depois: pré-lançamento
  assert.equal(conferidoNoBanco(false, 'itau', '2026-10-01', ctx), false)        // conciliável que nunca conciliou
  assert.equal(conferidoNoBanco(false, null, '2026-10-01', ctx), false)
})

test('sem a mig 169: conta que nunca conciliou continua conferida (regra antiga)', () => {
  assert.equal(conferidoNoBanco(false, 'itau', '2026-10-01', { inicio, naoConciliaveis: null }), true)
  assert.equal(conferidoNoBanco(false, 'inter', '2026-08-01', { inicio, naoConciliaveis: null }), false)
})
