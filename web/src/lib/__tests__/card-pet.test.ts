import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dataDoCard, pesoDoCard, especieDoCard, nomeDoCard } from '../card-pet.ts'

test('dataDoCard: dd/mmm e Www hh:mm, com dias escritos à mão', () => {
  // 03/10/2026 é sábado
  const d = dataDoCard('2026-10-03T14:05:00')
  assert.deepEqual(d, { diaMes: '03/out', semanaHora: 'Sáb 14:05' })
  assert.equal(dataDoCard(null), null)
  assert.equal(dataDoCard('não é data'), null)
})

test('pesoDoCard', () => {
  assert.equal(pesoDoCard(28), '28kg')
  assert.equal(pesoDoCard(4.5), '4,5kg')
  assert.equal(pesoDoCard(4.56), '4,6kg')
  assert.equal(pesoDoCard(0), null)
  assert.equal(pesoDoCard(null), null)
})

test('especieDoCard segue a régua de porte do pipeline antigo', () => {
  assert.deepEqual(especieDoCard('canina', 5), { emoji: '🐕', cor: '#b45309' })
  assert.deepEqual(especieDoCard('canina', 12), { emoji: '🐕', cor: '#c2410c' })
  assert.deepEqual(especieDoCard('canina', 30), { emoji: '🐕', cor: '#b91c1c' })
  assert.equal(especieDoCard('felina', 4).emoji, '🐱')
  assert.equal(especieDoCard('exotica', 1).cor, '#0d9488')
  assert.equal(especieDoCard(null, null).emoji, '🐾')
})

test('nomeDoCard tira espaço do fim e espaço duplo', () => {
  assert.equal(nomeDoCard('BOLINHA  DA SILVA '), 'BOLINHA DA SILVA')
  assert.equal(nomeDoCard(null), '')
})

test('enderecoParaNavegar: cadastro primeiro, snapshot de fallback, null sem rua', async () => {
  const { enderecoParaNavegar, linksNavegacao } = await import('../card-pet.ts')
  assert.equal(
    enderecoParaNavegar({ endereco: 'Rua Bahia', numero: '40', complemento: 'casa', bairro: 'Gonzaga', cidade: 'Santos', cep: '11060-000' }, {}),
    'Rua Bahia, 40 - casa - Gonzaga - Santos - 11060-000',
  )
  assert.equal(enderecoParaNavegar({ endereco: '  ' }, { endereco: 'Av. X', bairro: 'Centro', cidade: 'SP' }), 'Av. X - Centro - SP')
  assert.equal(enderecoParaNavegar(null, {}), null)
  assert.ok(linksNavegacao('Rua A, 1').waze.includes('navigate=yes'))
})
