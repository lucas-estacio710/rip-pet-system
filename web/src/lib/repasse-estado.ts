// ESTADO DO REPASSE NA UNIDADE (16/10/2026, Lucas) — a mesma régua da fatura do cartão
// (lib/fatura-estado.ts), usada na tela de conferência, no + Lançar e na Conciliação com Extrato.
//
//   · Em aberto            — a unidade ainda não conferiu (ou a Matriz mudou o repasse depois)
//   · Pronto pra pagar     — conferido e o vencimento (dia 20 do mês seguinte) ainda não passou
//   · Pronto pra conciliar — conferido e já venceu: falta só o extrato do banco
//   · Pago em parte        — os pagamentos somam menos que o total (o repasse aceita partes, mig 159)
//   · Pago                 — os pagamentos somam o total
//
// "Conferido" não se calcula: é um ato da unidade (mig 170 — `fin_repasses.conferido_*`). Vale
// enquanto o total for o que ela viu (`conferido_total`); se a Matriz mexer, cai sozinho.
// O pagamento nasce na Conciliação, da linha do banco; só conta sem extrato registra "Paguei".

import { vencimentoNoMes } from './vencimentos.ts'

export type RepasseResumo = {
  id: string
  /** mês das cremações, YYYY-MM */
  ref: string
  /** total a pagar (vw_repasse_totais.total_a_pagar) */
  total: number
  /** soma dos pagamentos (fin_movimentos com repasse_id; o antigo pago_movimento_id conta também) */
  pago: number
  /** o total que a unidade viu ao conferir; null = nunca conferiu (ou mig 170 não aplicada) */
  conferidoTotal: number | null
  /** status do fin_repasses (aberto/enviado/pago) — 'pago' marcado à mão também quita */
  status?: string
}

export type EstadoRepasse = 'em_aberto' | 'pronto_pagar' | 'pronto_conciliar' | 'pago_parte' | 'pago'

const c2 = (n: number) => Math.round(n * 100) / 100
const igual = (a: number, b: number) => Math.abs(a - b) < 0.005
const brl = (n: number) => `R$ ${Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const rotuloRef = (ref: string) => `${MESES[Number(ref.slice(5, 7)) - 1]}/${ref.slice(2, 4)}`

/** O repasse de um mês vence no dia 20 do mês SEGUINTE (dia útil depois) — a regra do calendário. */
export function vencimentoRepasse(ref: string): string {
  const a = Number(ref.slice(0, 4)), m0 = Number(ref.slice(5, 7)) - 1
  const proxA = m0 === 11 ? a + 1 : a, proxM0 = (m0 + 1) % 12
  return vencimentoNoMes({ regra: 'dia', dia: 20, ajuste: 'depois' }, proxA, proxM0)?.data || `${proxA}-${String(proxM0 + 1).padStart(2, '0')}-20`
}

export const faltaRepasse = (r: RepasseResumo) => (r.status === 'pago' ? 0 : Math.max(0, c2(r.total - r.pago)))
export const conferido = (r: RepasseResumo) => r.conferidoTotal !== null && igual(r.conferidoTotal, r.total)

export function estadoDoRepasse(r: RepasseResumo, hoje: string): EstadoRepasse {
  if (r.status === 'pago' || (r.pago > 0.005 && faltaRepasse(r) < 0.005)) return 'pago'
  if (r.pago > 0.005) return 'pago_parte'
  if (!conferido(r)) return 'em_aberto'
  return vencimentoRepasse(r.ref) < hoje ? 'pronto_conciliar' : 'pronto_pagar'
}

export const ROTULO_ESTADO_REPASSE: Record<EstadoRepasse, string> = {
  em_aberto: 'Em aberto', pronto_pagar: 'Pronto pra pagar', pronto_conciliar: 'Pronto pra conciliar',
  pago_parte: 'Pago em parte', pago: 'Pago',
}

/** O que falta para ficar pronto, em uma frase. */
export function pendenciaRepasse(r: RepasseResumo): string | null {
  if (conferido(r)) return null
  if (r.conferidoTotal !== null) return `a Matriz mudou o repasse depois da sua conferência: era ${brl(r.conferidoTotal)}, agora ${brl(r.total)}. Confira de novo`
  return 'confira os pets e os acertos e marque "Conferi"'
}

export type CasamentoRepasse =
  | { tipo: 'bate'; repasse: RepasseResumo }
  | { tipo: 'difere'; repasse: RepasseResumo; aviso: string; podeParcial: boolean }

/**
 * A linha do banco que parece PAGAMENTO DE REPASSE (Pix pra Matriz): de qual mês é?
 * A unidade paga quando paga (M, M−1, M−2), então não há janela de data: vale o que está em aberto,
 * do mais antigo pro mais novo.
 *  · bate   — um repasse conferido em que falta exatamente esse valor
 *  · difere — achou o provável, mas não está conferido ou o valor não fecha; `podeParcial` quando
 *             conferido e o banco pagou MENOS que o que falta
 *  · null   — nenhum repasse em aberto
 */
export function casarPagamentoRepasse(valor: number, repasses: RepasseResumo[]): CasamentoRepasse | null {
  const v = Math.abs(valor)
  const abertos = repasses.filter(r => faltaRepasse(r) >= 0.005).sort((a, b) => a.ref.localeCompare(b.ref))
  if (!abertos.length) return null
  const bate = abertos.find(r => igual(faltaRepasse(r), v) && conferido(r))
  if (bate) return { tipo: 'bate', repasse: bate }
  const provavel = abertos.find(r => igual(faltaRepasse(r), v)) || abertos[0]
  const f = faltaRepasse(provavel)
  const nome = `repasse de ${rotuloRef(provavel.ref)}`
  const podeParcial = conferido(provavel) && v < f - 0.005
  const cabeca = igual(f, v)
    ? `Parece o pagamento do ${nome} (${brl(v)}), mas ele ainda não está conferido`
    : `Parece o pagamento do ${nome}, mas o banco pagou ${brl(v)} e ${provavel.pago > 0.005 ? `faltam ${brl(f)} dele` : `o repasse é de ${brl(f)}`} (diferença de ${brl(c2(v - f))})`
  const pend = pendenciaRepasse(provavel)
  const oque = pend ? `O que fazer: ${pend} (+ Lançar › Repasse).`
    : podeParcial ? 'Se foi uma parte do repasse, marque abaixo: o resto continua em aberto.'
    : 'Confira com a Matriz o valor cobrado até bater com o que o banco pagou.'
  return { tipo: 'difere', repasse: provavel, aviso: `${cabeca}. ${oque}`, podeParcial }
}
