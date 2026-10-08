import { test } from 'node:test'
import assert from 'node:assert/strict'
import { separarFarois, farolParaLista } from '../farois.ts'
import type { ComputedTag } from '../contrato-tags.ts'

const tag = (id: string, state: ComputedTag['state'], extra: Partial<ComputedTag> = {}): ComputedTag =>
  ({ id, emoji: '•', state, label: id, tooltip: '', ...extra }) as ComputedTag

test('concluídas (feito + não tem) em cima, pendentes embaixo, ordem preservada', () => {
  const { concluidas, pendentes } = separarFarois([
    tag('pelinho', 'rejected'),
    tag('pagamento', 'alert'),
    tag('urna', 'completed'),
    tag('rescaldo', 'in_progress', { count: 2 }),
    tag('foto', 'pending', { count: 1 }),
    tag('indicacao', 'hidden'),
  ])
  assert.deepEqual(concluidas.map(c => c.id), ['pelinho', 'urna'])
  assert.deepEqual(pendentes.map(c => c.id), ['pagamento', 'rescaldo', 'foto'])
})

test('textos dos estados (item 6 e 33)', () => {
  assert.equal(farolParaLista(tag('pelinho', 'rejected'))!.texto, 'Sem pelinho')
  assert.equal(farolParaLista(tag('rescaldo', 'rejected'))!.texto, 'Não tem')
  assert.equal(farolParaLista(tag('urna', 'rejected'))!.texto, 'Não quer')
  assert.equal(farolParaLista(tag('urna', 'completed'))!.texto, null)
  assert.equal(farolParaLista(tag('pagamento', 'alert'))!.texto, 'Em aberto')
  assert.equal(farolParaLista(tag('rescaldo', 'in_progress', { count: 3 }))!.texto, 'Em andamento · 3')
  assert.equal(farolParaLista(tag('foto', 'pending', { count: 1 }))!.texto, '1 pendente')
  assert.equal(farolParaLista(tag('foto', 'pending', { count: 2 }))!.texto, '2 pendentes')
  assert.equal(farolParaLista(tag('urna', 'pending'))!.texto, 'A definir')
  assert.equal(farolParaLista(tag('urna', 'ghost')), null)
})
