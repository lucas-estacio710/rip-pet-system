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

// A Evolução tem o SEU próprio toggle (pedido do Lucas em 02/09/2026): ela não compartilha o
// filtro de período com as outras abas — tem janela própria de 6/12/24 meses — e trocar o modo
// lá estava mudando o Operacional junto, e vice-versa. Chave separada pra cada aba lembrar a
// sua escolha. Operacional e Financeiro continuam compartilhando `MODO_STORAGE_KEY`, porque
// esses dois também compartilham o mesmo filtro de período.
export const MODO_EVOLUCAO_STORAGE_KEY = 'dashboards.modo.evolucao'

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

/**
 * Dia local (YYYY-MM-DD) da data de corte de um contrato, para agrupar séries NO CLIENTE.
 *
 * 🔴 As duas colunas do toggle têm naturezas diferentes, e cada uma tem a sua armadilha —
 * usar o mesmo truque nas duas erra em uma delas, sempre:
 *
 *  - `data_contrato` é `date` puro ("2026-08-01"). `new Date(str)` lê ISO date-only como
 *    meia-noite **UTC**, que em Brasília é 21h do dia ANTERIOR — então `getMonth()` jogava
 *    todo contrato do **dia 1º** para o mês anterior. Era o bug do gráfico de Evolução no modo
 *    Contratos (medido em 02/09/2026: SP divergia em todos os meses — abr +12, mai −5, jun +3,
 *    jul +5, ago −7). Aqui a string JÁ é a data local: basta cortar, nunca instanciar Date.
 *
 *  - `data_acolhimento` é `timestamptz` ("2026-08-31T22:00:00+00:00"). Cortar a string pega a
 *    data **UTC**, e o pet acolhido depois das 21h vira "amanhã" — 454 de 3.533 acolhimentos
 *    de 2026 (12,9%) caem em dia diferente, e 15 caem em mês diferente. É exatamente o erro
 *    que a **migration 113** corrigiu no repasse, vivendo de novo no front. Aqui é preciso
 *    converter o instante para o fuso local.
 *
 * Por isso as duas leituras vivem nesta função e não copiadas nas abas: era a divergência
 * entre cópias que fazia Operacional (conta no servidor) e Evolução/Financeiro (agrupam no
 * cliente) mostrarem números diferentes para o mesmo período.
 */
export function diaLocalDeCorte(dataStr: string): string {
  if (dataStr.length <= 10) return dataStr.slice(0, 10)
  const d = new Date(dataStr)
  return ymd(d)
}

/** Mês local (YYYY-MM) da data de corte. Mesmas regras de `diaLocalDeCorte`. */
export function mesLocalDeCorte(dataStr: string): string {
  return diaLocalDeCorte(dataStr).slice(0, 7)
}
