// Módulo financeiro — regras de lançamento (puro, sem I/O).
//
// PRINCÍPIO (doc §2, "contabilidade invisível"): o operador responde só O QUE FOI,
// QUANTO e COMO PAGOU. Conta contábil, custo × despesa, opex × capex e as duas
// datas saem DERIVADOS daqui — ele nunca escolhe nada disso.

export type MetodoPagamento = 'pix' | 'dinheiro' | 'debito' | 'credito' | 'boleto' | 'transferencia' | 'outro'

export const METODOS: { valor: MetodoPagamento; label: string }[] = [
  { valor: 'pix', label: 'Pix' },
  { valor: 'debito', label: 'Débito' },
  { valor: 'credito', label: 'Crédito' },
  { valor: 'dinheiro', label: 'Dinheiro' },
  { valor: 'boleto', label: 'Boleto' },
  { valor: 'transferencia', label: 'Transferência' },
]

/**
 * AS DUAS DATAS, derivadas sem perguntar nada.
 *
 * competência = quando o gasto aconteceu (a data que o operador informa).
 * caixa       = quando o dinheiro sai. À vista é o mesmo dia; no CRÉDITO ainda
 *               não se sabe (depende do vencimento da fatura), então fica NULA —
 *               que é exatamente o estado que o modelo prevê.
 *
 * É isso que permite a DRE alternar entre competência e caixa depois, sem que
 * ninguém tenha ouvido as palavras "competência" ou "caixa".
 */
export function derivarDatas(dataGasto: string, metodo: MetodoPagamento | ''): {
  data_competencia: string
  data_caixa: string | null
} {
  const aVista = metodo === 'pix' || metodo === 'dinheiro' || metodo === 'debito' || metodo === 'transferencia'
  return { data_competencia: dataGasto, data_caixa: aVista ? dataGasto : null }
}

/**
 * O CAIXA, perguntado sem dizer "caixa".
 *
 * O operador vê um campo de data e uma conta — não vê que está alimentando o
 * fluxo de caixa. O rótulo muda conforme o método, e é o rótulo que ENSINA:
 * no crédito ele lê "Vence a fatura em" e entende sozinho por que a data é
 * outra. Ninguém precisa explicar regime de caixa.
 */
export function rotuloCaixa(metodo: MetodoPagamento | ''): { label: string; dica: string | null } {
  if (metodo === 'credito') return {
    label: 'Vence a fatura em',
    dica: 'A compra é de hoje, mas o dinheiro só sai quando a fatura vencer.',
  }
  if (metodo === 'boleto') return {
    label: 'Vence em',
    dica: 'O dinheiro sai na data de vencimento do boleto.',
  }
  return { label: 'Saiu da conta em', dica: null }
}

/** Rótulo curto do porquê da data de caixa — usado só em tela de conferência. */
export function explicarCaixa(metodo: MetodoPagamento | ''): string | null {
  if (metodo === 'credito') return 'sai na fatura'
  if (metodo === 'boleto') return 'sai no vencimento'
  return null
}

/**
 * ESCOLHA DA CONTA POR MÉTODO (mig 122).
 *
 * A conta declara o que recebe (`entradas`) e o que paga (`saidas`). Antes disso,
 * o acerto pré-selecionava `contas[0]` — a primeira em ordem alfabética — e o
 * mega pagamento do pipeline tinha **UUID de conta de Santos chumbado no
 * código**, o que fazia toda outra unidade gravar o recebimento na conta errada.
 *
 * ⚠️ LISTA VAZIA = SEM RESTRIÇÃO. Conta que ninguém configurou continua servindo
 * pra tudo, senão a migration deixaria as telas sem nenhuma conta selecionável.
 */
export type ContaEscolhivel = {
  id: string
  entradas?: string[] | null
  saidas?: string[] | null
  preferencial_recebimento?: boolean | null
}

/** Contas que aceitam este método no lado indicado. */
export function contasQueAceitam<T extends ContaEscolhivel>(
  contas: T[], metodo: string, lado: 'entradas' | 'saidas' = 'entradas'
): T[] {
  return contas.filter(c => {
    const lista = c[lado] || []
    return lista.length === 0 || lista.includes(metodo)
  })
}

/**
 * Qual conta já vem escolhida. A preferencial só DESEMPATA — se ela não recebe
 * o método em questão, perde pra quem recebe. Sem candidata, devolve ''.
 */
export function contaPadraoPara<T extends ContaEscolhivel>(contas: T[], metodo: string): string {
  const aceitam = contasQueAceitam(contas, metodo, 'entradas')
  return (aceitam.find(c => c.preferencial_recebimento) || aceitam[0])?.id || ''
}

/**
 * PRODUTO DA CONTA (mig 130) — o que ela é define o que ela faz.
 *
 * Antes, cadastrar conta era marcar 10 chips na mão: o que recebe, o que paga,
 * se é cartão. Tudo isso o produto já determina. Aqui fica a tabela de verdade,
 * e a tela só pergunta "o que vocês têm nesta instituição?".
 */
export type ProdutoConta = 'conta_corrente' | 'conta_pagamento' | 'maquininha' | 'cartao_credito' | 'dinheiro'

export const PRODUTOS: {
  v: ProdutoConta
  label: string
  desc: string
  tipo: 'corrente' | 'dinheiro' | 'cartao'
  entradas: string[]
  saidas: string[]
  liquidacao?: number      // dias até o dinheiro cair (informativo por ora)
  varios?: boolean         // faz sentido ter mais de um
}[] = [
  {
    v: 'conta_corrente', label: 'Conta corrente',
    desc: 'Recebe e paga de tudo.',
    tipo: 'corrente',
    entradas: ['pix', 'dinheiro'], saidas: ['pix', 'boleto', 'transferencia', 'debito'],
  },
  {
    v: 'conta_pagamento', label: 'Conta de pagamento',
    desc: 'Tipo Nubank PJ ou PicPay: pix entra e sai, boleto sai.',
    tipo: 'corrente',
    entradas: ['pix'], saidas: ['pix', 'boleto'],
  },
  {
    v: 'maquininha', label: 'Maquininha',
    desc: 'Recebe crédito e débito. O dinheiro cai depois, já sem a taxa.',
    tipo: 'corrente',
    entradas: ['credito', 'debito'], saidas: [],
    liquidacao: 30, varios: true,
  },
  {
    v: 'cartao_credito', label: 'Cartão corporativo',
    desc: 'Só paga. A despesa acumula e sai quando a fatura é paga.',
    tipo: 'cartao',
    entradas: [], saidas: ['credito'],
    varios: true,
  },
  {
    v: 'dinheiro', label: 'Dinheiro',
    desc: 'Caixa físico da unidade.',
    tipo: 'dinheiro',
    entradas: ['dinheiro'], saidas: ['dinheiro'],
  },
]

/** Instituições que aparecem como sugestão — a lista é aberta, dá pra digitar. */
export const INSTITUICOES = [
  'Itaú', 'Bradesco', 'Banco do Brasil', 'Santander', 'Caixa', 'Sicoob', 'Sicredi',
  'Inter', 'Nubank', 'C6', 'PagBank', 'Mercado Pago',
  'Stone', 'Cielo', 'Rede', 'GetNet', 'InfinitePay', 'SumUp',
]

/** O que gravar quando o produto é escolhido — o comportamento sai daqui. */
export function camposDoProduto(p: ProdutoConta) {
  const d = PRODUTOS.find(x => x.v === p)!
  return {
    produto: p,
    tipo: d.tipo,
    entradas: d.entradas,
    saidas: d.saidas,
    liquidacao_dias: d.liquidacao ?? null,
  }
}

/** Nome que a conta ganha: "Itaú · Cartão corporativo 2". */
export function nomeDaConta(instituicao: string, p: ProdutoConta, indice?: number): string {
  const d = PRODUTOS.find(x => x.v === p)!
  const base = `${instituicao.trim()} · ${d.label}`
  return indice && indice > 1 ? `${base} ${indice}` : base
}

export const fmtBRL = (v?: number | null) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const fmtData = (d?: string | null) =>
  d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '—'

export const hojeISO = () => new Date().toISOString().slice(0, 10)

/** Primeiro e último dia do mês de uma data ISO — pro filtro da lista. */
export function limitesDoMes(mesISO: string): { ini: string; fim: string } {
  const [a, m] = mesISO.split('-').map(Number)
  const fim = new Date(a, m, 0).getDate()
  return { ini: `${mesISO}-01`, fim: `${mesISO}-${String(fim).padStart(2, '0')}` }
}

/** Caminho do comprovante no bucket privado `financeiro`. */
export function caminhoComprovante(unidadeCodigo: string, arquivo: File): string {
  const ext = arquivo.name.split('.').pop()?.toLowerCase() || 'jpg'
  return `${unidadeCodigo || 'un'}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
}
