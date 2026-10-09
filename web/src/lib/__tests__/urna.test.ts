import { test } from 'node:test'
import assert from 'node:assert/strict'
import { descontoDaUrna, valorFinalDaUrna, trocaPreservaLinha } from '../urna.ts'

test('desconto em % e em R$, por unidade', () => {
  assert.equal(descontoDaUrna(300, { tipo: 'percent', percent: 10, valor: '' }), 30)
  assert.equal(descontoDaUrna(300, { tipo: 'valor', percent: '', valor: 50 }), 50)
  assert.equal(valorFinalDaUrna(300, { tipo: 'percent', percent: 25, valor: '' }), 225)
})

test('desconto nunca passa do preço nem fica negativo; 100% = grátis', () => {
  assert.equal(descontoDaUrna(300, { tipo: 'valor', percent: '', valor: 500 }), 300)
  assert.equal(descontoDaUrna(300, { tipo: 'valor', percent: '', valor: -20 }), 0)
  assert.equal(valorFinalDaUrna(300, { tipo: 'percent', percent: 100, valor: '' }), 0)
  assert.equal(descontoDaUrna(300, { tipo: 'percent', percent: '', valor: 50 }), 0)   // tipo manda
})

test('troca preserva a linha só com o mesmo tipo de personalizado', () => {
  assert.equal(trocaPreservaLinha(null, undefined), true)                 // urna comum → urna comum
  assert.equal(trocaPreservaLinha('molde_patinha', 'molde_patinha'), true) // porta-retrato a definir → cor real
  assert.equal(trocaPreservaLinha('molde_patinha', null), false)          // porta-retrato → urna comum
  assert.equal(trocaPreservaLinha(null, 'molde_patinha'), false)
})
