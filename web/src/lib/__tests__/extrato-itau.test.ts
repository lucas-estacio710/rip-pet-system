import { test } from 'node:test'
import assert from 'node:assert/strict'
import { naoEDespesa, quitacaoDe, metodoDe, ehRendimento } from '../extrato.ts'

test('Itaú: "FATURA CARTAO DEBITO" é compra no débito, não pagamento de fatura', () => {
  const t = 'FATURA CARTAO DEBITO CAMPINAS MO-001008'
  assert.equal(naoEDespesa(t), null)
  assert.equal(quitacaoDe(t), null)
  assert.equal(metodoDe(t), 'debito')
})

test('pagamento de fatura de verdade continua sendo fatura', () => {
  for (const t of ['Pagamento fatura cartao Inter', 'PAGAMENTO DE FATURA', 'FATURA CARTAO ITAU PERSONNALITE']) {
    assert.equal(quitacaoDe(t), 'fatura')
    assert.notEqual(naoEDespesa(t), null)
  }
})

test('Itaú: rendimento automático da conta vira rendimento sozinho; aluguel de maquininha não', () => {
  assert.equal(ehRendimento('RENDIMENTOS REND PAGO APLIC AUT MAIS', 0.02), true)
  assert.equal(ehRendimento('REND PAGO APLIC AUT MAIS', 1.5), true)
  assert.equal(ehRendimento('RENDIMENTOS REND PAGO APLIC AUT MAIS', -0.02), false)
  assert.equal(ehRendimento('REMUNERACAO POS', 10), false)
  assert.equal(ehRendimento('PIX RECEBIDO MARIA', 100), false)
  assert.equal(ehRendimento('RESGATE RENDIMENTO CDB', 500), false)
  assert.equal(ehRendimento('RESGATE APLICACAO AUT', 500), false)
})
