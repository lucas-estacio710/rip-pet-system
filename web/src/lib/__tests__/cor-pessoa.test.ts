import { test } from 'node:test'
import assert from 'node:assert/strict'
import { corDaPessoa, PALETA_PESSOAS } from '../cor-pessoa.ts'

test('mesma pessoa, mesma cor; sem id, sem cor', () => {
  const id = '3f1c2a9e-1111-4c4c-9d9d-0123456789ab'
  assert.equal(corDaPessoa(id), corDaPessoa(id))
  assert.ok(PALETA_PESSOAS.includes(corDaPessoa(id) as (typeof PALETA_PESSOAS)[number]))
  assert.equal(corDaPessoa(null), undefined)
  assert.equal(corDaPessoa(''), undefined)
})

test('ids parecidos se espalham pela paleta', () => {
  const cores = new Set<string>()
  for (let i = 0; i < 40; i++) cores.add(corDaPessoa(`3f1c2a9e-1111-4c4c-9d9d-0123456789${String(i).padStart(2, '0')}`)!)
  assert.ok(cores.size >= 8, `só ${cores.size} cores distintas em 40 ids`)
})

test('paleta de 40 cores, nenhuma repetida', () => {
  assert.equal(PALETA_PESSOAS.length, 40)
  assert.equal(new Set(PALETA_PESSOAS).size, 40)
})
