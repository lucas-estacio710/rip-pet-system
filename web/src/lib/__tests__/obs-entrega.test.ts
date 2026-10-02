import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarObsEntrega, lerObsEntrega, formatarPrevisao, limparTextoObs } from '../obs-entrega.ts'

test('monta o formato completo, na ordem Prev → End → texto', () => {
  assert.equal(
    montarObsEntrega({ prevData: '2026-10-05', prevPeriodo: 'tarde', endereco: 'Rua X, 123 - Centro', texto: 'tocar o interfone' }),
    '[Prev: 05/10/2026 · Tarde] [End: Rua X, 123 - Centro] tocar o interfone',
  )
})

test('monta só o que existe; nada → null', () => {
  assert.equal(montarObsEntrega({ prevPeriodo: 'manha', texto: '' }), '[Prev: Manhã]')
  assert.equal(montarObsEntrega({ prevData: '2026-10-05', texto: '' }), '[Prev: 05/10/2026]')
  assert.equal(montarObsEntrega({ endereco: 'Av. Y', texto: '' }), '[End: Av. Y]')
  assert.equal(montarObsEntrega({ texto: '  só texto ' }), 'só texto')
  assert.equal(montarObsEntrega({ texto: '   ', endereco: '  ' }), null)
})

test('colchete digitado pelo usuário não vira tag', () => {
  const raw = montarObsEntrega({ texto: 'cuidado [End: Rua Falsa] no portão' })
  assert.equal(raw, 'cuidado End: Rua Falsa no portão')
  assert.equal(lerObsEntrega(raw).endereco, undefined)
  assert.equal(limparTextoObs('[a]b]'), 'ab')
})

test('ida e volta preserva tudo', () => {
  const o = { prevData: '2026-12-31', prevPeriodo: 'dia_todo' as const, endereco: 'Rua A, 1', texto: 'deixar com a vizinha' }
  assert.deepEqual(lerObsEntrega(montarObsEntrega(o)), o)
})

test('legado sem tag cai inteiro em texto', () => {
  assert.deepEqual(lerObsEntrega('Entregar depois das 14h'), { texto: 'Entregar depois das 14h' })
  assert.deepEqual(lerObsEntrega(null), { texto: '' })
  assert.deepEqual(lerObsEntrega(''), { texto: '' })
})

test('leitura tolerante: tag sem conteúdo válido não inventa dado', () => {
  assert.deepEqual(lerObsEntrega('[Prev: 31/02/2026 · Noite] oi'), { texto: 'oi' })
  assert.deepEqual(lerObsEntrega('[End: ] oi'), { texto: 'oi' })
  assert.deepEqual(lerObsEntrega('[Prev: tarde]'), { prevPeriodo: 'tarde', texto: '' })
})

test('formatarPrevisao', () => {
  assert.equal(formatarPrevisao({ prevData: '2026-10-05', prevPeriodo: 'tarde' }), '📅 05/10 · Tarde')
  assert.equal(formatarPrevisao({ prevPeriodo: 'manha' }), '📅 Manhã')
  assert.equal(formatarPrevisao({ prevData: '2026-10-05' }), '📅 05/10')
  assert.equal(formatarPrevisao({}), null)
})
