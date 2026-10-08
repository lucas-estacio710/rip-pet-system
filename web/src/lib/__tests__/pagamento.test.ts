import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularRecebimento, saldosDoContrato, proporcionalizar, cobrancaDeTerceiro, type FormRecebimento, type ContratoParaReceber } from '../pagamento.ts'

const contrato = (o: Partial<ContratoParaReceber> = {}): ContratoParaReceber => ({
  id: 'c1', codigo: 'ST1', unidade_id: 'u1',
  valor_plano: 1000, desconto_plano_unificado: 0,
  valor_acessorios: 300, desconto_acessorios: 0, desconto_acessorios_ajuste: 0,
  pagamentos: [], ...o,
})
const form = (o: Partial<FormRecebimento> = {}): FormRecebimento => ({
  valorPlano: '', descontoPlano: '', valorAcessorio: '', descontoAcessorio: '',
  planoFechado: false, pfTotal: '', pfPlanoPuro: '', ...o,
})

test('2026/109: desconto NÃO conta duas vezes — pagamento é o que entrou, desconto vai pro contrato', () => {
  const c = contrato()
  const r = calcularRecebimento(form({ valorPlano: '1000', descontoPlano: '100' }), c, 0)
  assert.equal(r.erro, null)
  assert.deepEqual(r.linhas.map(l => [l.tipo, l.valor]), [['plano', 900]])
  assert.equal(r.descontoPlano, 100)
  // depois de gravar: a pagar 1000−100 = 900, pago 900 → saldo zero (antes ficava −100)
  const depois = saldosDoContrato({ ...c, desconto_plano_unificado: 100, pagamentos: [{ tipo: 'plano', valor: 900 }] })
  assert.equal(depois.plano, 0)
})

test('desconto de acessório vai pro ajuste; total e líquido com a taxa da maquininha', () => {
  const r = calcularRecebimento(form({ valorPlano: '1000', valorAcessorio: '300', descontoAcessorio: '50' }), contrato(), 4.99)
  assert.deepEqual(r.linhas.map(l => [l.tipo, l.valor, l.taxa]), [['plano', 1000, 49.9], ['catalogo', 250, 12.48]])
  assert.equal(r.descontoAcessorios, 50)
  assert.equal(r.total, 1250)
  assert.equal(r.totalLiquido, 1187.62)
})

test('só desconto, sem dinheiro: grava o desconto e nenhum pagamento', () => {
  const r = calcularRecebimento(form({ valorPlano: '100', descontoPlano: '100' }), contrato(), 0)
  assert.equal(r.erro, null)
  assert.equal(r.linhas.length, 0)
  assert.equal(r.descontoPlano, 100)
})

test('erros: desconto maior que o valor, negativo, vazio', () => {
  assert.match(calcularRecebimento(form({ valorPlano: '100', descontoPlano: '150' }), contrato(), 0).erro || '', /desconto do plano/)
  assert.match(calcularRecebimento(form({ valorPlano: '-1' }), contrato(), 0).erro || '', /negativos/)
  assert.match(calcularRecebimento(form(), contrato(), 0).erro || '', /ao menos um valor/)
})

test('Plano fechado: plano puro, sobra em acessórios e desconto automático do que faltar', () => {
  const c = contrato({ valor_plano: 1500, valor_acessorios: 400 })
  const r = calcularRecebimento(form({ planoFechado: true, pfTotal: '1500', pfPlanoPuro: '1290' }), c, 0)
  assert.equal(r.erro, null)
  assert.deepEqual(r.linhas.map(l => [l.tipo, l.valor]), [['plano', 1290], ['catalogo', 210]])
  assert.equal(r.descontoAcessorios, 190)   // pendente 400 − sobra 210
  assert.equal(r.valorPlanoNovo, 1290)
  assert.equal(r.aviso, null)
})

test('Plano fechado: puro maior que o total é erro; sobra maior que o pendente só avisa', () => {
  assert.match(calcularRecebimento(form({ planoFechado: true, pfTotal: '1000', pfPlanoPuro: '1200' }), contrato(), 0).erro || '', /maior que o total/)
  const r = calcularRecebimento(form({ planoFechado: true, pfTotal: '1800', pfPlanoPuro: '1000' }), contrato(), 0)
  assert.equal(r.erro, null)
  assert.equal(r.descontoAcessorios, 0)
  assert.match(r.aviso || '', /Sobra maior/)
})

test('saldos descontam o que já foi pago e os dois descontos de acessório', () => {
  const s = saldosDoContrato(contrato({ desconto_plano_unificado: 100, desconto_acessorios: 20, desconto_acessorios_ajuste: 30, pagamentos: [{ tipo: 'plano', valor: 400 }, { tipo: 'catalogo', valor: 50 }] }))
  assert.deepEqual(s, { plano: 500, acessorios: 200 })
})

test('proporcionalizar fecha a soma exata', () => {
  assert.deepEqual(proporcionalizar(100, 1000, 300), { plano: 76.92, acessorio: 23.08 })
  assert.equal(proporcionalizar(100, 0, 0), null)
})

test('acerto entre unidades só quando o contrato é de outra e há módulo', () => {
  const base = { contrato: { unidade_id: 'u1', codigo: 'X' }, temFinanceiro: true, total: 900, dataPagamento: '2026-10-08', pagamentoId: 'p', contaId: 'k', criadoPorNome: 'Ana' }
  assert.equal(cobrancaDeTerceiro({ ...base, unidadeLogadaId: 'u1' }), null)
  assert.equal(cobrancaDeTerceiro({ ...base, unidadeLogadaId: 'u2', temFinanceiro: false }), null)
  const c = cobrancaDeTerceiro({ ...base, unidadeLogadaId: 'u2' })
  assert.equal(c?.valor, 900)
  assert.equal(c?.unidade_credora, 'u1')
  assert.equal(c?.unidade_devedora, 'u2')
})
