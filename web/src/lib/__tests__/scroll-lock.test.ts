import { test } from 'node:test'
import assert from 'node:assert/strict'

// document falso: só o que a lib toca
const body = { style: { overflow: 'auto' } }
;(globalThis as unknown as { document: unknown }).document = { body }

const { travarRolagem } = await import('../scroll-lock.ts')

test('popup sobre popup: fechar um não destrava o fundo; o último devolve o valor de antes', () => {
  const soltaEditar = travarRolagem()          // "Editar encaminhamento"
  assert.equal(body.style.overflow, 'hidden')
  const soltaConfirmar = travarRolagem()       // "Tirar LUNA?" por cima
  soltaEditar()                                // fecha o de BAIXO primeiro
  assert.equal(body.style.overflow, 'hidden')  // antes do contador, aqui já destravava
  soltaConfirmar()
  assert.equal(body.style.overflow, 'auto')
})

test('soltar duas vezes não desconta duas', () => {
  const a = travarRolagem()
  const b = travarRolagem()
  a(); a()
  assert.equal(body.style.overflow, 'hidden')
  b()
  assert.equal(body.style.overflow, 'auto')
})
