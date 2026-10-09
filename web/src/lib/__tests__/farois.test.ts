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
  // Item 3 (09/10): o "a definir" (❓) é pendente, não some — senão não dá pra responder 💎/📜.
  assert.deepEqual(farolParaLista(tag('rescaldo', 'ghost')), { id: 'rescaldo', emoji: '•', label: 'rescaldo', tipo: 'pendente', texto: 'A definir' })
  // Item 10: finalizado pelo sistema é concluído, com texto próprio
  assert.equal(farolParaLista(tag('urna', 'sistema'))!.tipo, 'sistema')
  assert.equal(farolParaLista(tag('urna', 'sistema'))!.texto, 'Finalizado pelo sistema')
})

test('farol de entrega usa o texto pronto (D10)', () => {
  assert.equal(farolParaLista(tag('entrega', 'pending', { tooltip: 'A entregar' }))!.texto, 'A entregar')
  assert.equal(farolParaLista(tag('entrega', 'in_progress', { tooltip: 'Com Juliana' }))!.texto, 'Com Juliana')
})

test('farol 🚐: pendente diz Sem viagem/Sem lacre; concluído mostra a viagem (2.13b)', () => {
  const base = { id: 'encaminhamento', emoji: '🚐', label: 'Encaminhamento' }
  assert.equal(farolParaLista({ ...base, state: 'pending', tooltip: 'Sem lacre' } as ComputedTag)?.texto, 'Sem lacre')
  assert.equal(farolParaLista({ ...base, state: 'pending', tooltip: '' } as ComputedTag)?.texto, 'Sem viagem')
  const feito = farolParaLista({ ...base, state: 'completed', tooltip: '', sublabel: 'ST172' } as ComputedTag)
  assert.equal(feito?.tipo, 'feito')
  assert.equal(feito?.texto, 'ST172')
  assert.equal(farolParaLista({ id: 'urna', emoji: '⚱️', label: 'Urna', state: 'completed', tooltip: '', sublabel: 'X' } as ComputedTag)?.texto, null)
})
