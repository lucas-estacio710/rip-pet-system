import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarTrilha, type CobTrilha, type LancTrilha } from '../trilha-custo.ts'

const cob = (p: Partial<CobTrilha> & Pick<CobTrilha, 'id' | 'unidade_credora' | 'unidade_devedora' | 'valor'>): CobTrilha => ({
  status: 'aceita', data: '2026-09-10', descricao: null, repasse_id: null,
  lancamento_origem_id: null, lancamento_aceite_id: null, lancamento_reembolso_id: null, ...p,
})
const lanc = (id: string, unidade_id: string, valor: number, origem = 'manual'): LancTrilha =>
  ({ id, unidade_id, valor, origem, descricao: null, data_competencia: '2026-09-10' })

test('o caso do tráfego: Santos → Matriz (acerto do repasse) → Pinda; fica tudo com Pinda', () => {
  // acerto do repasse: origem = reembolso (não é compra original)
  const a = cob({ id: 'a', unidade_credora: 'ST', unidade_devedora: 'MA', valor: 1266, status: 'liquidada', repasse_id: 'r1',
    lancamento_origem_id: 'reembST', lancamento_reembolso_id: 'reembST', lancamento_aceite_id: 'despMA' })
  const b = cob({ id: 'b', unidade_credora: 'MA', unidade_devedora: 'PI', valor: 1266, status: 'liquidada',
    lancamento_origem_id: 'despMA', lancamento_aceite_id: 'despPI', lancamento_reembolso_id: 'dedMA' })
  const lancs = new Map([['reembST', lanc('reembST', 'ST', -1266, 'sistema')], ['despMA', lanc('despMA', 'MA', 1266, 'sistema')]])
  const t = montarTrilha([b, a], lancs)
  assert.equal(t.raiz, null)
  assert.deepEqual(t.passos.map(p => [p.cob.id, p.nivel]), [['a', 0], ['b', 1]])
  const fica = Object.fromEntries(t.saldos.map(s => [s.unidade, s.fica]))
  assert.deepEqual(fica, { PI: 1266, ST: 0, MA: 0 })
})

test('compra original dividida: Matriz pagou 1000, Pinda reconheceu 600, SJ ainda não reconheceu 300', () => {
  const lancs = new Map([['compra', lanc('compra', 'MA', 1000)]])
  const t = montarTrilha([
    cob({ id: 'p', unidade_credora: 'MA', unidade_devedora: 'PI', valor: 600, lancamento_origem_id: 'compra', lancamento_aceite_id: 'dPI' }),
    cob({ id: 's', unidade_credora: 'MA', unidade_devedora: 'SJ', valor: 300, status: 'emitida', lancamento_origem_id: 'compra' }),
    cob({ id: 'x', unidade_credora: 'MA', unidade_devedora: 'RS', valor: 100, status: 'recusada', lancamento_origem_id: 'compra' }),
  ], lancs)
  assert.equal(t.raiz?.id, 'compra')
  assert.equal(t.passos.length, 2)   // a recusada fica fora
  const ma = t.saldos.find(s => s.unidade === 'MA')!
  assert.deepEqual([ma.recebeu, ma.repassou, ma.pendente, ma.fica], [1000, 600, 300, 400])
  assert.equal(t.saldos.find(s => s.unidade === 'SJ')!.fica, 0)
})
