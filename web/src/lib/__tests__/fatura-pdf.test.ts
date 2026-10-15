import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prepararFatura } from '../fatura-pdf.ts'

// Trecho do formato real (fatura-inter-2026-10.pdf): a palavra "Inter" mora no cabeçalho e no
// rodapé, FORA do recorte das compras.
const PDF = [
  'Banco Inter S.A.',
  'Resumo da fatura',
  '2500****3168 10/10/2026 R$ 7.771,26',
  'Despesas da fatura',
  'CARTÃO 2500****3168',
  'Data Movimentação Beneficiário Valor',
  '20 de set. 2026 DA BALANCA - R$ 216,56',
  'Total CARTÃO 2500****3168 R$ 216,56',
  'Boleto 34191.79001 01043.510047',
].join('\n')

test('fatura do Inter: reconhece pelo PDF inteiro e só então recorta (o recorte não tem "Inter")', () => {
  const r = prepararFatura(PDF)
  assert.equal(r.inter, true)
  assert.ok(!/\binter\b/i.test(r.texto))                 // o recorte de fato perde a palavra
  assert.ok(r.texto.startsWith('2500****3168 10/10/2026'))
  assert.ok(r.texto.includes('DA BALANCA'))
  assert.ok(!r.texto.includes('Boleto'))                 // o boleto fica de fora
})

test('PDF que não é fatura do Inter: volta inteiro e marcado como não-Inter', () => {
  const r = prepararFatura('Holerite\nSalário R$ 2.000,00')
  assert.equal(r.inter, false)
  assert.equal(r.texto, 'Holerite\nSalário R$ 2.000,00')
})
