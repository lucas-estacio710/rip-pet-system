import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarBusca, tokenLacre, classificarBusca, filtroDaBusca, ordenarPorRelevancia,
  etapaComResultado, trechosDestacados,
} from '../busca-contratos.ts'

test('normaliza acento, caixa e espaço (espelho do busca_normaliza do SQL)', () => {
  assert.equal(normalizarBusca('  JOÃO   da  Conceição '), 'joao da conceicao')
  assert.equal(normalizarBusca('Ñandú Ýgor'), 'nandu ygor')
  assert.equal(normalizarBusca(null), '')
})

test('token do lacre: sem zeros à esquerda e sem espaço; não numérico = vazio', () => {
  assert.equal(tokenLacre('0412'), '412')
  assert.equal(tokenLacre(' 412 '), '412')
  assert.equal(tokenLacre('000'), '0')
  assert.equal(tokenLacre('TROUXE'), '')
})

test('classifica pelo formato: lacre, telefone, código, texto', () => {
  assert.deepEqual(classificarBusca('0412'), { tipo: 'lacre', original: '0412', termos: [], valor: '412' })
  assert.equal(classificarBusca('(13) 99123-4567')?.tipo, 'telefone')
  assert.equal(classificarBusca('(13) 99123-4567')?.valor, '13991234567')
  assert.equal(classificarBusca('st260921ind')?.tipo, 'codigo')
  assert.equal(classificarBusca('Rex 2')?.tipo, 'texto')          // letra + número = texto
  assert.equal(classificarBusca('   '), null)
})

test('filtros: lacre exato pelo token, texto AND palavra a palavra, curinga escapado', () => {
  assert.deepEqual(filtroDaBusca(classificarBusca('412')!), { eq: [], ilike: [['busca', '#412#%']] })
  assert.deepEqual(filtroDaBusca(classificarBusca('Luna Silva')!).ilike, [['busca', '%luna%'], ['busca', '%silva%']])
  assert.deepEqual(filtroDaBusca(classificarBusca('50%_off')!).ilike, [['busca', '%50\\%\\_off%']])
})

test('relevância: pet igual > pet começa > só contém; empate mantém a data', () => {
  const b = classificarBusca('luna')!
  const lista = [
    { pet_nome: 'Lunatica', tutor_nome: 'Ana' },
    { pet_nome: 'Mel', tutor_nome: 'Luna Souza' },
    { pet_nome: 'LUNA', tutor_nome: 'Carlos' },
  ]
  assert.deepEqual(ordenarPorRelevancia(lista, b).map(c => c.pet_nome), ['LUNA', 'Lunatica', 'Mel'])
})

test('pular de etapa só quando a aberta está vazia', () => {
  const ordem = ['preventivo', 'ativo', 'pinda', 'retorno', 'pendente', 'finalizado']
  assert.equal(etapaComResultado({ finalizado: 2 }, 'ativo', ordem), 'finalizado')
  assert.equal(etapaComResultado({ ativo: 1, finalizado: 2 }, 'ativo', ordem), null)
  assert.equal(etapaComResultado({}, 'ativo', ordem), null)
})

test('destaque ignora acento: "joao" marca "JOÃO"', () => {
  assert.deepEqual(trechosDestacados('JOÃO Silva', ['joao']), [{ t: 'JOÃO', hit: true }, { t: ' Silva', hit: false }])
})
