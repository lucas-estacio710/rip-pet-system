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
