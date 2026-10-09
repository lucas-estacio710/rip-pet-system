import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeRescaldo, computeAllTags, finalizarPeloSistema, estadoConcluido, estadoPendente, type ContratoTagData, type ComputedTag } from '../contrato-tags.ts'

const base = (o: Partial<ContratoTagData> = {}): ContratoTagData => ({
  status: 'ativo', tipo_cremacao: 'individual', certificado_confirmado: null,
  valor_plano: 1000, desconto_plano_unificado: 0, valor_acessorios: 0, desconto_acessorios: 0, desconto_acessorios_ajuste: 0,
  pagamentos: [], protocolo_data: null, contato_id: null, estabelecimento_indicacao_id: null,
  indicacao_clinica: null, indicacao_contato: null, fonte_conhecimento_ids: null, indicacaoFonteId: null,
  contrato_produtos: [], ...o,
})
const prod = (rescaldo_tipo: string, feito = false) =>
  ({ foto_recebida: false, rescaldo_feito: feito, produto: { codigo: rescaldo_tipo, tipo: 'acessorio', precisa_foto: false, rescaldo_tipo } })

test('item 8: personalizado "outro" (sem tarefa) não deixa o 💎 pendente com cb_operacional', () => {
  const c = base({ contrato_produtos: [prod('outro')] })
  assert.equal(computeRescaldo(c).state, 'in_progress')                       // sem o módulo: ○/✓ manual
  assert.equal(computeRescaldo({ ...c, temOperacional: true }).state, 'completed')
  const misto = base({ contrato_produtos: [prod('outro'), prod('molde_patinha')], temOperacional: true })
  assert.equal(computeRescaldo(misto).count, 1)                               // só o molde pendente
})

test('item 10: finalizado → aberto vira "Finalizado pelo sistema", menos pagamento e indicação', () => {
  const t = (id: string, state: ComputedTag['state']): ComputedTag => ({ id, emoji: '•', state, label: id, tooltip: '' })
  assert.equal(finalizarPeloSistema(t('urna', 'ghost'), 'finalizado').state, 'sistema')
  assert.equal(finalizarPeloSistema(t('rescaldo', 'in_progress'), 'finalizado').state, 'sistema')
  assert.equal(finalizarPeloSistema(t('pagamento', 'alert'), 'finalizado').state, 'alert')
  assert.equal(finalizarPeloSistema(t('indicacao', 'pending'), 'finalizado').state, 'pending')
  assert.equal(finalizarPeloSistema(t('urna', 'completed'), 'finalizado').state, 'completed')   // feito continua feito
  assert.equal(finalizarPeloSistema(t('urna', 'rejected'), 'finalizado').state, 'rejected')
  assert.equal(finalizarPeloSistema(t('urna', 'ghost'), 'retorno').state, 'ghost')              // só finalizado
})

test('item 10 no cálculo completo: contrato finalizado sem pendência além de pagamento', () => {
  const c = base({ status: 'finalizado', contrato_produtos: [prod('molde_patinha')] })
  const tags = computeAllTags(c)
  assert.ok(tags.every(t => t.id === 'pagamento' || t.id === 'indicacao' || !estadoPendente(t.state)))
  assert.equal(tags.find(t => t.id === 'rescaldo')?.state, 'sistema')
})

test('concluído × pendente: sistema conclui; ghost pende', () => {
  assert.equal(estadoConcluido('sistema'), true)
  assert.equal(estadoPendente('ghost'), true)
  assert.equal(estadoPendente('sistema'), false)
})
