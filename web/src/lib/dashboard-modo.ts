// Modo de contagem dos dashboards operacionais: Remoções vs Contratos.
//
// - 'remocoes'  (default, comportamento histórico): conta contratos que já viraram
//   atendimento real (status removido) filtrando por data_acolhimento (data da remoção).
// - 'contratos': conta TODOS os contratos (inclui preventivos ainda vivos) filtrando
//   por data_contrato (data em que o contrato foi fechado/vendido).
//
// Centraliza o filtro pra os KPIs não divergirem — todos aplicam filtroModo().

export type DashboardModo = 'remocoes' | 'contratos'

// Status que indicam que o pet JÁ foi removido (≠ 'preventivo').
export const STATUS_REMOVIDO = ['ativo', 'pinda', 'retorno', 'pendente', 'finalizado']

export const MODO_STORAGE_KEY = 'dashboards.modo'

// Data local YYYY-MM-DD (data_contrato é coluna `date`, sem timezone).
function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/**
 * Aplica o filtro de status + janela temporal numa query PostgREST de `contratos`,
 * conforme o modo. Retorna a própria query (encadeável).
 *   - contratos: sem filtro de status; janela por data_contrato (date)
 *   - remocoes:  status IN removido; janela por data_acolhimento (timestamptz)
 */
export function filtroModo<Q extends {
  in: (col: string, vals: string[]) => Q
  gte: (col: string, val: string) => Q
  lte: (col: string, val: string) => Q
}>(query: Q, modo: DashboardModo, from: Date, to: Date): Q {
  if (modo === 'contratos') {
    return query
      .gte('data_contrato', ymd(from))
      .lte('data_contrato', ymd(to))
  }
  return query
    .in('status', STATUS_REMOVIDO)
    .gte('data_acolhimento', from.toISOString())
    .lte('data_acolhimento', to.toISOString())
}

export function modoLabel(modo: DashboardModo): string {
  return modo === 'contratos' ? 'Contratos' : 'Remoções'
}
