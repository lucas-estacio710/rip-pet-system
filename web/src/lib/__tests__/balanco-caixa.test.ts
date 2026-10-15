import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classificarCaixa, SEM_CATEGORIA, type LinhaCaixa, type MovInfo } from '../balanco-caixa.ts'

const L = (conta_id: string, valor: number, origem: string, origem_id: string, descricao = ''): LinhaCaixa =>
  ({ conta_id, data: '2026-10-05', tipo: '', valor, origem, origem_id, descricao })

const ctx = {
  contasCaixa: new Set(['inter', 'itau', 'dinheiro']),
  maquininhas: new Set(['rede']),
  movs: new Map<string, MovInfo>([
    ['t1', { tipo: 'transferencia', conta_id: 'inter', conta_destino_id: 'itau', repasse: false }],
    ['t2', { tipo: 'transferencia', conta_id: 'rede', conta_destino_id: 'inter', repasse: false }],
    ['t3', { tipo: 'transferencia', conta_id: 'inter', conta_destino_id: 'contaDeFora', repasse: false }],
    ['rp', { tipo: 'transferencia', conta_id: 'inter', conta_destino_id: null, repasse: true }],
    ['fc', { tipo: 'fatura_cartao', conta_id: 'inter', conta_destino_id: 'cartao', repasse: false }],
    ['aj', { tipo: 'ajuste', conta_id: 'inter', conta_destino_id: null, repasse: false }],
  ]),
  categoriaDe: new Map([['d1', 'Pessoal'], ['d2', 'Pessoal'], ['d3', 'Administrativo']]),
  comprasDaFatura: new Map([['fc', [
    { id: 'c1', valor: 400, data: '2026-09-12', descricao: 'Combustível', grupo: 'Operacional' },
    { id: 'c2', valor: 200, data: '2026-09-20', descricao: 'Sistema', grupo: 'Administrativo' },
  ]]]),
}

test('o dinheiro do mês, do jeito que o banco vê', () => {
  const b = classificarCaixa([
    L('inter', 500, 'pagamento', 'p1'),                       // pix de cliente
    L('rede', 3000, 'pagamento', 'p2'),                       // venda no cartão: NÃO é caixa
    L('inter', 2800, 'movimento', 't2'),                      // a maquininha liquidou
    L('inter', -1000, 'movimento', 't1'), L('itau', 1000, 'movimento', 't1'),   // entre contas: nada
    L('inter', -900, 'lancamento', 'd1'), L('inter', -300, 'lancamento', 'd2'), L('inter', -200, 'lancamento', 'd3'),
    L('inter', 50, 'lancamento', 'd3'),                       // estorno abate o grupo
    L('inter', -80, 'lancamento', 'sem'),                     // lançado sem categoria
    L('inter', -1500, 'movimento', 'rp'),                     // repasse pago → Cremação
    L('inter', -700, 'movimento', 'fc', 'Fatura Inter'),      // fatura: 600 em compras + 100 sem compra lançada
    L('inter', -120, 'movimento', 't3'),                      // transferência pra fora: sem nome
    L('inter', 90000, 'movimento', 'aj'),                     // ajuste inicial: à parte
  ], ctx)
  assert.equal(b.entrou, 3300)
  assert.equal(b.saiu, 3750)
  assert.equal(b.ajustes, 90000)
  // a linha "Ajustes de saldo" abre neles: um a um, com sinal, já conferidos
  assert.deepEqual(b.ajustesItens.map(i => [i.origem_id, i.valor, i.conciliado]), [['aj', 90000, true]])
  assert.deepEqual(b.saidas.map(g => [g.nome, g.valor]), [
    ['Cremação', 1500], ['Pessoal', 1200], ['Administrativo', 350], ['Operacional', 400], [SEM_CATEGORIA, 300],
  ].sort((a, b) => Number(a[0] === SEM_CATEGORIA) - Number(b[0] === SEM_CATEGORIA) || (b[1] as number) - (a[1] as number)))
  const sem = b.saidas.find(g => g.nome === SEM_CATEGORIA)!
  assert.deepEqual(sem.itens.map(i => [i.valor, i.acao]).sort(), [[100, 'lancar'], [120, 'extrato'], [80, 'editar']].sort())
  assert.equal(b.saidas.at(-1)!.nome, SEM_CATEGORIA)
})

test('na Matriz o repasse que chega é entrada', () => {
  const b = classificarCaixa([L('itau', 1500, 'movimento', 'rpM')], {
    ...ctx, movs: new Map([['rpM', { tipo: 'transferencia', conta_id: 'contaST', conta_destino_id: 'itau', repasse: true }]]),
  })
  assert.deepEqual(b.entradas.map(g => [g.nome, g.valor]), [['Repasse das unidades', 1500]])
})

test('devolução ao cliente (pagamento negativo no contrato) tem nome próprio', () => {
  const b = classificarCaixa([L('inter', -100, 'pagamento', 'dev', 'ST260707 CRISTAL')], ctx)
  assert.deepEqual(b.saidas.map(g => [g.nome, g.valor]), [['Devoluções a clientes', 100]])
})

test('Contas disponíveis: ir pra reserva e voltar dela têm nome próprio', () => {
  const movs = new Map<string, MovInfo>([
    ['ap', { tipo: 'transferencia', conta_id: 'inter', conta_destino_id: 'invest', repasse: false }],
    ['rs', { tipo: 'transferencia', conta_id: 'invest', conta_destino_id: 'inter', repasse: false }],
  ])
  const b = classificarCaixa([L('inter', -5000, 'movimento', 'ap'), L('invest', 5000, 'movimento', 'ap'), L('inter', 4056.98, 'movimento', 'rs')],
    { ...ctx, movs, guardadas: new Set(['invest']) })
  assert.deepEqual(b.saidas.map(g => [g.nome, g.valor]), [['Guardado na reserva', 5000]])
  assert.deepEqual(b.entradas.map(g => [g.nome, g.valor]), [['Resgate da reserva', 4056.98]])
})

test('conciliado: o item bate com o banco; a compra da fatura herda o pagamento da fatura', () => {
  const b = classificarCaixa([L('inter', -900, 'lancamento', 'd1'), L('inter', -300, 'lancamento', 'd2'), L('inter', -700, 'movimento', 'fc')],
    { ...ctx, conferidos: new Set(['d1', 'fc']) })
  const todos = b.saidas.flatMap(g => g.itens)
  assert.equal(todos.find(i => i.origem_id === 'd1')!.conciliado, true)
  assert.equal(todos.find(i => i.origem_id === 'd2')!.conciliado, false)
  assert.equal(todos.find(i => i.origem_id === 'c1')!.conciliado, true)
})
