import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarVizinhos, vizinhosDe } from '../vizinhos-contrato.ts'

const statusDe = { a: 'pinda', b: 'pinda', x: 'ativo', c: 'pinda', d: 'pinda' }

test('montarVizinhos: ordem da tela, sem repetidos, só o mesmo status', () => {
  const v = montarVizinhos(['a', 'x', 'b', 'a', 'c', 'd'], statusDe, 'b', { a: 'Thor', b: 'Mel' }, 1000)
  assert.deepEqual(v, { status: 'pinda', ids: ['a', 'b', 'c', 'd'], nomes: { a: 'Thor', b: 'Mel' }, em: 1000 })
})

test('montarVizinhos: contrato aberto fora da tela ou sem status → null', () => {
  assert.equal(montarVizinhos(['a', 'b'], statusDe, 'c'), null)
  assert.equal(montarVizinhos(['a', 'b'], statusDe, 'zzz'), null)
})

test('vizinhosDe: meio, primeiro e último', () => {
  const lista = { status: 'pinda', ids: ['a', 'b', 'c'], nomes: { a: 'Thor', c: 'Bolinha' }, em: 0 }
  assert.deepEqual(vizinhosDe(lista, 'b', 'pinda', 10), { anterior: 'a', proximo: 'c', nomeAnterior: 'Thor', nomeProximo: 'Bolinha' })
  assert.deepEqual(vizinhosDe(lista, 'a', 'pinda', 10), { anterior: null, proximo: 'b', nomeAnterior: null, nomeProximo: null })
  assert.deepEqual(vizinhosDe(lista, 'c', 'pinda', 10), { anterior: 'b', proximo: null, nomeAnterior: null, nomeProximo: null })
})

test('vizinhosDe: sem lista, fora da lista, mudou de status ou lista velha → null', () => {
  const lista = { status: 'pinda', ids: ['a', 'b'], em: 0 }
  assert.equal(vizinhosDe(null, 'a', 'pinda', 10), null)
  assert.equal(vizinhosDe(lista, 'zzz', 'pinda', 10), null)
  assert.equal(vizinhosDe(lista, 'a', 'retorno', 10), null)
  assert.equal(vizinhosDe(lista, 'a', 'pinda', 13 * 60 * 60 * 1000), null)
})
