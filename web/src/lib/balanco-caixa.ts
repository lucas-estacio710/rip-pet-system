// BALANÇO DE CAIXA DO MÊS (14/10/2026) — "aqui falamos de caixa, se não estaremos repetindo a
// info" (Lucas): o resultado por competência é a DRE; o Livro-Caixa mostra o DINHEIRO que
// entrou e saiu das contas no mês.
//
// As contas são as mesmas do "Saldo das Contas" (as que pagam + as guardadas): sem maquininha
// (é a receber) e sem cartão (é fatura). Por isso:
//   · venda no cartão NÃO é entrada — entra quando a maquininha LIQUIDA;
//   · a FATURA paga abre nas COMPRAS dela, cada uma na sua categoria (as compras do cartão são
//     lançamentos na conta do cartão com data_caixa = vencimento) — o que a fatura cobrou e
//     ninguém lançou vai pra "Sem categoria";
//   · o REPASSE pago à Matriz é custo de cremação → grupo "Cremação";
//   · transferência entre duas contas do caixa não é nada (o dinheiro só mudou de bolso);
//   · ajuste de saldo fica À PARTE; o "Ajuste inicial"/"Abertura de caixa" é o saldo que a conta
//     já tinha — vai pro "Começou com" (ehAberturaDeConta, filtrado em caixaDoMes).
//
// 🔴 REGRA DO LUCAS (14/10/2026): "o que está categorizado — foi LANÇADO, nomeado direitinho —
// entra no balanço; o que não está fica em 'Sem categoria'", abrindo pra ver o que é e onde, e
// categorizar ali mesmo. Cada item diz a AÇÃO que resolve (editar o lançamento, lançar a compra
// que falta, ver no extrato).
//
// Função pura: quem busca é o BalancoMes (VisaoBlocos.tsx).

import { RAIZ_RECEITAS } from './categoria-receita.ts'

export const SEM_CATEGORIA = 'Sem categoria'

/** O "Ajuste inicial" (abrir caixa, VisaoMesTab) é o saldo que a conta JÁ TINHA no dia em que
 *  começou: no Balanço ele é o "Começou com", não um ajuste do mês (SJ, 16/10/2026: abriu com
 *  −785,46 e o mês aparecia começando em zero, com o negativo no fim como "Ajustes de saldo"). */
export const ehAberturaDeConta = (l: Pick<LinhaCaixa, 'origem' | 'descricao'>) => {
  // dois nomes pra mesma coisa: "Ajuste inicial · X" (VisaoMesTab) e "Abertura de caixa · X" (CaixaTab)
  const d = (l.descricao || '').trim().toLowerCase()
  return l.origem === 'movimento' && (d.startsWith('ajuste inicial') || d.startsWith('abertura de caixa'))
}

export type LinhaCaixa = { conta_id: string; data: string; tipo: string; valor: number; origem: string; origem_id: string; descricao?: string | null; unidade_id?: string | null }
export type MovInfo = { tipo: string; conta_id: string | null; conta_destino_id: string | null; repasse: boolean }
export type CompraFatura = { id: string; valor: number; data: string; descricao: string; grupo: string | null; unidade_id?: string | null }
/** editar = abre o lançamento · lancar = falta lançar (compra da fatura) · extrato = ver/corrigir na conta */
export type AcaoItem = 'editar' | 'lancar' | 'extrato' | null
/** conciliado = já bateu com o extrato/fatura (ou é de antes da conta começar a conciliar) */
/** fatura = a compra veio de dentro de uma fatura paga: o pagamento é UMA linha no banco */
export type ItemCaixa = { data: string; descricao: string; valor: number; conta_id: string; origem_id: string; acao: AcaoItem; conciliado: boolean; unidade_id?: string | null; fatura?: { id: string; descricao: string; data: string; valor: number } }
export type Grupo = { nome: string; valor: number; itens: ItemCaixa[] }
/** ajustesItens (15/10/2026): os ajustes de saldo, um a um, COM sinal — a linha "Ajustes de saldo" abre neles */
export type BalancoCaixa = { entrou: number; saiu: number; ajustes: number; ajustesItens: ItemCaixa[]; entradas: Grupo[]; saidas: Grupo[] }

const c2 = (n: number) => Math.round(n * 100) / 100

export function classificarCaixa(
  linhas: LinhaCaixa[],
  ctx: {
    contasCaixa: Set<string>
    maquininhas: Set<string>
    movs: Map<string, MovInfo>
    categoriaDe: Map<string, string>          // id do lançamento → grupo (1º nível da árvore)
    comprasDaFatura?: Map<string, CompraFatura[]>   // id do movimento fatura_cartao → compras
    /** contas guardadas (reserva) FORA do conjunto — modo "Contas disponíveis": ir pra elas ou voltar delas tem nome */
    guardadas?: Set<string>
    /** ids (origem) já conferidos com o banco; ausente = tudo conferido */
    conferidos?: Set<string>
  },
): BalancoCaixa {
  const ent = new Map<string, ItemCaixa[]>(), sai = new Map<string, ItemCaixa[]>()
  let ajustes = 0
  const ajustesItens: ItemCaixa[] = []
  const por = (m: Map<string, ItemCaixa[]>, g: string, it: ItemCaixa) => { if (!m.has(g)) m.set(g, []); m.get(g)!.push(it) }

  for (const l of linhas) {
    if (!ctx.contasCaixa.has(l.conta_id)) continue
    const v = Number(l.valor)
    if (Math.abs(v) < 0.005) continue
    const it = (valor: number, acao: AcaoItem, descricao = l.descricao || l.tipo): ItemCaixa =>
      ({ data: l.data, descricao, valor: c2(valor), conta_id: l.conta_id, origem_id: l.origem_id, acao, conciliado: ctx.conferidos ? ctx.conferidos.has(l.origem_id) : true, unidade_id: l.unidade_id ?? null })

    if (l.origem === 'pagamento') {
      // pagamento NEGATIVO = devolução registrada no contrato (casada com o extrato pela
      // conciliação) — já está identificada, não é "Sem categoria"
      if (v >= 0) por(ent, 'Clientes (Pix e dinheiro)', it(v, null))
      else por(sai, 'Devoluções a clientes', it(-v, null))
      continue
    }
    if (l.origem === 'lancamento') {
      // despesa paga direto da conta; valor positivo é estorno e abate o mesmo grupo
      const g = ctx.categoriaDe.get(l.origem_id)
      // mig 171: OUTRA RECEITA — lançamento do ramo Receitas (gravado negativo: entra no caixa)
      if (g === RAIZ_RECEITAS) { por(ent, 'Outras receitas', it(v, 'editar')); continue }
      por(sai, g || SEM_CATEGORIA, it(-v, 'editar'))
      continue
    }
    // movimento
    const m = ctx.movs.get(l.origem_id)
    const tipo = m?.tipo || l.tipo
    // o ajuste É a conferência com o banco: nasce conferido, e guarda o sinal (sobe ou desce o saldo)
    if (tipo === 'ajuste') { ajustes += v; ajustesItens.push({ ...it(v, null, l.descricao || 'Ajuste de saldo'), conciliado: true }); continue }
    if (tipo === 'fatura_cartao' && v < 0) {
      // a fatura abre nas compras; o que ela cobrou sem compra lançada → Sem categoria
      const compras = ctx.comprasDaFatura?.get(l.origem_id) || []
      let resto = -v
      for (const c of compras) {
        por(sai, c.grupo || SEM_CATEGORIA, { data: c.data, descricao: c.descricao, valor: c2(c.valor), conta_id: l.conta_id, origem_id: c.id, acao: 'editar', conciliado: ctx.conferidos ? ctx.conferidos.has(l.origem_id) : true, unidade_id: c.unidade_id ?? null,
          fatura: { id: l.origem_id, descricao: l.descricao || 'Fatura do cartão', data: l.data, valor: c2(-v) } })
        resto -= c.valor
      }
      if (Math.abs(resto) >= 0.005) {
        por(sai, SEM_CATEGORIA, it(resto, 'lancar', `${l.descricao || 'Fatura do cartão'} — ${resto > 0 ? 'cobrado sem compra lançada' : 'compras lançadas a mais que a fatura'}`))
      }
      continue
    }
    if (tipo === 'aporte' || tipo === 'emprestimo') {
      if (v >= 0) por(ent, 'Aportes e empréstimos', it(v, null)); else por(sai, SEM_CATEGORIA, it(-v, 'extrato'))
      continue
    }
    // mig 168: rendimento entra; pagar o principal do empréstimo e devolver aporte saem
    if (tipo === 'rendimento') { if (v >= 0) por(ent, 'Rendimentos', it(v, null)); else por(sai, SEM_CATEGORIA, it(-v, 'extrato')); continue }
    if (tipo === 'amortizacao' || tipo === 'devolucao_aporte') {
      if (v < 0) por(sai, tipo === 'amortizacao' ? 'Empréstimos pagos' : 'Aportes devolvidos', it(-v, null)); else por(ent, SEM_CATEGORIA, it(v, 'extrato'))
      continue
    }
    // mig 171: empréstimo DADO pela unidade (sai) e a devolução dele (entra) — fora da DRE
    if (tipo === 'emprestimo_concedido' || tipo === 'emprestimo_devolvido') {
      if (tipo === 'emprestimo_concedido' && v < 0) por(sai, 'Empréstimos concedidos', it(-v, null))
      else if (tipo === 'emprestimo_devolvido' && v >= 0) por(ent, 'Empréstimos devolvidos', it(v, null))
      else if (v >= 0) por(ent, SEM_CATEGORIA, it(v, 'extrato')); else por(sai, SEM_CATEGORIA, it(-v, 'extrato'))
      continue
    }
    if (tipo === 'transferencia' && m) {
      const outra = v > 0 ? m.conta_id : m.conta_destino_id
      if (outra && ctx.contasCaixa.has(outra)) continue          // entre contas do caixa: nada
      if (outra && ctx.guardadas?.has(outra)) { if (v < 0) por(sai, 'Guardado na reserva', it(-v, null)); else por(ent, 'Resgate da reserva', it(v, null)); continue }
      if (m.repasse) {
        // repasse pago = custo da cremação; na Matriz, o repasse que chega é receita
        if (v < 0) por(sai, 'Cremação', it(-v, null)); else por(ent, 'Repasse das unidades', it(v, null))
        continue
      }
      if (v > 0 && outra && ctx.maquininhas.has(outra)) { por(ent, 'Maquininha (liquidações)', it(v, null)); continue }
    }
    // o resto não tem nome: transferência pra fora, estorno de fatura, outros movimentos
    if (v >= 0) por(ent, SEM_CATEGORIA, it(v, 'extrato')); else por(sai, SEM_CATEGORIA, it(-v, 'extrato'))
  }

  const lista = (m: Map<string, ItemCaixa[]>) => [...m]
    .map(([nome, itens]) => ({ nome, valor: c2(itens.reduce((a, i) => a + i.valor, 0)), itens: itens.sort((a, b) => a.data.localeCompare(b.data)) }))
    .filter(g => Math.abs(g.valor) >= 0.005 || g.nome === SEM_CATEGORIA && g.itens.length)
    // "Sem categoria" sempre por último — é a pendência, não um grupo
    .sort((a, b) => Number(a.nome === SEM_CATEGORIA) - Number(b.nome === SEM_CATEGORIA) || b.valor - a.valor)
  const entradas = lista(ent), saidas = lista(sai)
  return {
    entrou: c2(entradas.reduce((a, g) => a + g.valor, 0)),
    saiu: c2(saidas.reduce((a, g) => a + g.valor, 0)),
    ajustes: c2(ajustes),
    ajustesItens: ajustesItens.sort((a, b) => a.data.localeCompare(b.data)),
    entradas, saidas,
  }
}
