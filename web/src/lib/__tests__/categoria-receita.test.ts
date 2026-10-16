import { test } from 'node:test'
import assert from 'node:assert/strict'
import { idsDoRamoReceitas, semReceitas, folhasDeReceita } from '../categoria-receita.ts'

const cats = [
  { id: 'op', nome: 'Operacional', parent_id: null },
  { id: 'comb', nome: 'Combustível', parent_id: 'op' },
  { id: 'rec', nome: 'Receitas', parent_id: null },
  { id: 'outras', nome: 'Outras receitas', parent_id: 'rec' },
  { id: 'corp', nome: 'Contrato corporativo', parent_id: 'rec' },
]

test('mig 171: o ramo Receitas sai dos seletores de despesa', () => {
  assert.deepEqual([...idsDoRamoReceitas(cats)].sort(), ['corp', 'outras', 'rec'])
  assert.deepEqual(semReceitas(cats).map(c => c.id), ['op', 'comb'])
  assert.deepEqual(folhasDeReceita(cats).map(c => c.id), ['outras', 'corp'])
})

test('sem o ramo Receitas, nada muda', () => {
  const so = cats.slice(0, 2)
  assert.equal(semReceitas(so), so)
  assert.deepEqual(folhasDeReceita(so), [])
})
