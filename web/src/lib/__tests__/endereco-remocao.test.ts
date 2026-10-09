import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enderecoDeRemocao } from '../endereco-remocao.ts'

test('residência: rua + número, bairro, cidade, cep da casa', () => {
  assert.deepEqual(
    enderecoDeRemocao('residencia', { residencia: { endereco: 'Rua A', numero: '10', bairro: 'Gonzaga', cidade: 'Santos', cep: '11000' } }),
    { remocao_endereco: 'Rua A, 10', remocao_bairro: 'Gonzaga', remocao_cidade: 'Santos', remocao_cep: '11000' },
  )
})

test('clínica: endereço do estabelecimento; sem endereço, o nome', () => {
  assert.equal(enderecoDeRemocao('clinica', { clinica: { nome: 'Vet Center', endereco: 'Av. B, 5', cidade: 'Santos' } }).remocao_endereco, 'Av. B, 5')
  assert.equal(enderecoDeRemocao('clinica', { clinica: { nome: 'Hospital Estima', endereco: '' } }).remocao_endereco, 'Hospital Estima')
})

test('outro: o texto digitado; unidade: endereço e cidade da unidade', () => {
  assert.equal(enderecoDeRemocao('outro', { outro: '  Sítio X, km 3 ' }).remocao_endereco, 'Sítio X, km 3')
  assert.deepEqual(enderecoDeRemocao('unidade', { unidade: { endereco: null, cidade: 'Campinas' } }),
    { remocao_endereco: null, remocao_bairro: null, remocao_cidade: 'Campinas', remocao_cep: null })
})

test('sem local: nada', () => {
  assert.deepEqual(enderecoDeRemocao('', {}), { remocao_endereco: null, remocao_bairro: null, remocao_cidade: null, remocao_cep: null })
})
