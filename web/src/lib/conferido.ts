// CONFERIDO COM O BANCO — a regra numa porta só (15/10/2026, mig 169), usada pelo Balanço do
// Caixa (VisaoBlocos) e pelo calendário de contas (ContasDoMes). Antes cada um tinha a sua cópia.
//
//   · bateu com o extrato/fatura (fin_conciliacoes) → conferido
//   · conta NÃO conciliável (contas.conciliavel = false: Dinheiro, aplicação sem extrato) → conferido
//   · de antes da 1ª conciliação daquela conta → conferido (o Importar só guarda a batida desde a mig 153)
//   · conta conciliável que NUNCA conciliou → pendente (até a mig 169 contava como conferida:
//     o Itaú de CP e SJ, iniciados e sem OFX importado, apareciam verdes)
//
// Sem a mig 169 (`naoConciliaveis` = null) vale a regra antiga: nunca conciliou = conferida.

import type { SupabaseClient } from '@supabase/supabase-js'

export type CtxConferido = {
  /** conta → data da 1ª linha conciliada */
  inicio: Map<string, string>
  /** contas com conciliavel = false; null = a coluna não existe (mig 169 não aplicada) */
  naoConciliaveis: Set<string> | null
}

export function conferidoNoBanco(conciliado: boolean, conta: string | null | undefined, data: string, ctx: CtxConferido): boolean {
  if (conciliado) return true
  if (!conta) return false
  if (ctx.naoConciliaveis?.has(conta)) return true
  const ini = ctx.inicio.get(conta)
  if (!ini) return ctx.naoConciliaveis === null
  return data.slice(0, 10) < ini
}

/** As contas marcadas como não conciliáveis; null se a mig 169 ainda não foi aplicada. */
export async function buscarNaoConciliaveis(sb: SupabaseClient): Promise<Set<string> | null> {
  const { data, error } = await sb.from('contas').select('id').eq('conciliavel', false)
  if (error) return null
  return new Set(((data as { id: string }[] | null) || []).map(c => c.id))
}
