// Repasse de cremações — cálculo puro (sem I/O, fácil de testar).
// A "planilha do dia 20": a Matriz cobra de cada unidade os pets acolhidos no mês.
// Ver migration 104 e FLOW.md §4.

export type DeflatorTipo = 'nenhum' | 'percentual' | 'valor'

export type ItemRepasse = {
  contrato_id: string
  contrato_codigo: string | null
  pet_nome: string | null
  tutor_nome: string | null
  numero_lacre: string | null
  data_acolhimento: string | null
  tipo_cremacao: 'individual' | 'coletiva' | null
  valor_base: number
  deflator_tipo: DeflatorTipo
  deflator_valor: number
  deflator_motivo?: string | null
}

/** Quanto foi abatido nesta linha (nunca passa do valor base, nunca negativo). */
export function calcularAbatimento(item: Pick<ItemRepasse, 'valor_base' | 'deflator_tipo' | 'deflator_valor'>): number {
  const base = Number(item.valor_base || 0)
  const v = Number(item.deflator_valor || 0)
  if (!v || item.deflator_tipo === 'nenhum') return 0
  const bruto = item.deflator_tipo === 'percentual' ? (base * v) / 100 : v
  return Math.min(Math.max(bruto, 0), base)
}

export function calcularValorFinal(item: Pick<ItemRepasse, 'valor_base' | 'deflator_tipo' | 'deflator_valor'>): number {
  return arredondar(Number(item.valor_base || 0) - calcularAbatimento(item))
}

export function totalizar(itens: ItemRepasse[]) {
  const bruto = itens.reduce((s, i) => s + Number(i.valor_base || 0), 0)
  const abatido = itens.reduce((s, i) => s + calcularAbatimento(i), 0)
  return {
    qtd: itens.length,
    bruto: arredondar(bruto),
    deflator: arredondar(abatido),
    liquido: arredondar(bruto - abatido),
  }
}

const arredondar = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export const fmtBRL = (v?: number | null) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const fmtData = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—'

/** '2026-07' -> '2026-07-01' (mes_referencia é sempre dia 1) */
export const mesParaData = (mes: string) => `${mes}-01`

/** '2026-07-01' -> 'julho/2026' */
export function rotuloMes(mesRef: string): string {
  const [a, m] = mesRef.split('-')
  const nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return `${nomes[Number(m) - 1]}/${a}`
}

// ── Permutas: o encontro de contas (mig 106) ───────────────────────────────

export type Permuta = {
  id?: string
  descricao: string
  valor: number
  direcao: 'abate' | 'acresce'
}

/** Cremações − o que abate + o que acresce. É o valor que a unidade paga de fato. */
export function totalAPagar(itens: ItemRepasse[], permutas: Permuta[]) {
  const t = totalizar(itens)
  const abate = permutas.filter(p => p.direcao === 'abate').reduce((s, p) => s + Number(p.valor || 0), 0)
  const acresce = permutas.filter(p => p.direcao === 'acresce').reduce((s, p) => s + Number(p.valor || 0), 0)
  return {
    ...t,
    abate: arredondar(abate),
    acresce: arredondar(acresce),
    aPagar: arredondar(t.liquido - abate + acresce),
  }
}

/**
 * Planilha da cobrança (CSV que o Excel abre em colunas).
 * Separador `;` e número com vírgula decimal = padrão pt-BR do Excel.
 * O BOM (﻿) é o que faz o Excel entender os acentos.
 */
export function planilhaRepasse(
  nomeUnidade: string,
  mesRef: string,
  itens: ItemRepasse[],
  permutas: Permuta[] = [],
): string {
  const t = totalAPagar(itens, permutas)
  const num = (v: number) => Number(v || 0).toFixed(2).replace('.', ',')
  const txt = (s?: string | null) => `"${(s || '').replace(/"/g, '""')}"`
  const L: string[] = []

  L.push(txt(`RIP Pet — Repasse de cremações`))
  L.push(txt(`${nomeUnidade} — ${rotuloMes(mesRef)}`))
  L.push('')
  L.push(['Acolhimento', 'Lacre', 'Pet', 'Tutor', 'Tipo', 'Valor tabela', 'Deflator', 'Motivo', 'Valor final'].join(';'))

  itens.forEach(i => {
    L.push([
      txt(fmtData(i.data_acolhimento)),
      txt(i.numero_lacre),
      txt(i.pet_nome),
      txt(i.tutor_nome),
      txt(i.tipo_cremacao === 'individual' ? 'Individual' : 'Coletiva'),
      num(i.valor_base),
      num(calcularAbatimento(i)),
      txt(i.deflator_motivo),
      num(calcularValorFinal(i)),
    ].join(';'))
  })

  L.push('')
  L.push([txt(`Cremações (${t.qtd} pets)`), '', '', '', '', '', '', '', num(t.liquido)].join(';'))
  permutas.forEach(p => {
    L.push([
      txt(`${p.direcao === 'abate' ? 'Abate' : 'Acresce'}: ${p.descricao}`),
      '', '', '', '', '', '', '',
      num(p.direcao === 'abate' ? -Number(p.valor) : Number(p.valor)),
    ].join(';'))
  })
  L.push([txt('TOTAL A PAGAR'), '', '', '', '', '', '', '', num(t.aPagar)].join(';'))

  return '﻿' + L.join('\r\n')
}

/** Nome do arquivo: repasse-santos-2026-07.csv */
export function nomeArquivoRepasse(nomeUnidade: string, mesRef: string): string {
  const slug = (nomeUnidade || 'unidade')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `repasse-${slug}-${mesRef.slice(0, 7)}.csv`
}

/** Texto pronto pra mandar à unidade junto com a cobrança. */
export function mensagemRepasse(
  nomeUnidade: string,
  mesRef: string,
  itens: ItemRepasse[],
  permutas: Permuta[] = [],
  limite = 40,
): string {
  const t = totalAPagar(itens, permutas)
  const linhas = itens
    .slice(0, limite)
    .map(i => {
      const fim = calcularValorFinal(i)
      const desc = calcularAbatimento(i) > 0 ? ` (de ${fmtBRL(i.valor_base)})` : ''
      const lacre = i.numero_lacre ? ` · lacre ${i.numero_lacre}` : ''
      return `• ${fmtData(i.data_acolhimento)}${lacre} — ${i.pet_nome || 'pet'} · ${
        i.tipo_cremacao === 'individual' ? 'Individual' : 'Coletiva'} · ${fmtBRL(fim)}${desc}`
    })
    .join('\n')
  const resto = itens.length > limite ? `\n_...e mais ${itens.length - limite}._` : ''
  const blocoPermutas = permutas.length
    ? '\n' + permutas
        .map(p => `${p.direcao === 'abate' ? '-' : '+'} ${p.descricao}: ${fmtBRL(p.valor)}`)
        .join('\n') + '\n'
    : ''
  return (
    `*RIP Pet — Repasse de cremações*\n` +
    `*${nomeUnidade}* · ${rotuloMes(mesRef)}\n\n` +
    `${t.qtd} ${t.qtd === 1 ? 'pet' : 'pets'}\n` +
    (t.deflator > 0 ? `Bruto: ${fmtBRL(t.bruto)}\nDescontos: -${fmtBRL(t.deflator)}\n` : '') +
    (permutas.length ? `Cremações: ${fmtBRL(t.liquido)}${blocoPermutas}` : '') +
    `*Total: ${fmtBRL(t.aPagar)}*\n\n${linhas}${resto}`
  )
}
