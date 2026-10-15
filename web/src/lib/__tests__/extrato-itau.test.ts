import { test } from 'node:test'
import assert from 'node:assert/strict'
import { naoEDespesa, quitacaoDe, metodoDe } from '../extrato.ts'

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
