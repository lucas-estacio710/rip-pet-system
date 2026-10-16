// Os repasses de uma unidade, com o que a régua de lib/repasse-estado.ts precisa: total a pagar
// (vw_repasse_totais), o que já foi pago (Σ movimentos com repasse_id — mais o antigo
// pago_movimento_id, de antes da mig 159) e a conferência da unidade (mig 170).
// Uma porta só para a tela de conferência, o + Lançar e a Conciliação com Extrato.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { RepasseResumo } from './repasse-estado'

export type RepasseDaUnidade = RepasseResumo & {
  conferidoEm: string | null
  conferidoPorNome: string | null
  pagoMovimentoId: string | null
}

const c2 = (n: number) => Math.round(n * 100) / 100

export async function carregarRepassesDaUnidade(sb: SupabaseClient, unidadeId: string): Promise<RepasseDaUnidade[]> {
  type R = { id: string; mes_referencia: string; status: string; pago_movimento_id: string | null; conferido_total?: number | null; conferido_em?: string | null; conferido_por_nome?: string | null }
  const base = 'id, mes_referencia, status, pago_movimento_id'
  const com = await sb.from('fin_repasses').select(`${base}, conferido_total, conferido_em, conferido_por_nome`)
    .eq('unidade_id', unidadeId).neq('status', 'cancelado')
  // sem a mig 170 as colunas não existem: segue sem conferência (tudo "em aberto")
  const res = com.error && /conferido/i.test(com.error.message)
    ? await sb.from('fin_repasses').select(base).eq('unidade_id', unidadeId).neq('status', 'cancelado')
    : com
  const reps = (res.data as R[] | null) || []
  if (!reps.length) return []
  const ids = reps.map(r => r.id)
  const [{ data: tot }, { data: mv }] = await Promise.all([
    sb.from('vw_repasse_totais').select('repasse_id, total_a_pagar').in('repasse_id', ids),
    sb.from('fin_movimentos').select('id, repasse_id, valor').in('repasse_id', ids),
  ])
  const total = new Map(((tot as { repasse_id: string; total_a_pagar: number }[] | null) || []).map(t => [t.repasse_id, Number(t.total_a_pagar) || 0]))
  const pago = new Map<string, number>()
  const vistos = new Set<string>()
  for (const m of (mv as { id: string; repasse_id: string; valor: number }[] | null) || []) { vistos.add(m.id); pago.set(m.repasse_id, c2((pago.get(m.repasse_id) || 0) + Number(m.valor))) }
  // pagamento antigo (mig 150): só o pago_movimento_id, sem repasse_id no movimento
  const antigos = reps.filter(r => r.pago_movimento_id && !vistos.has(r.pago_movimento_id))
  if (antigos.length) {
    const { data: am } = await sb.from('fin_movimentos').select('id, valor').in('id', antigos.map(r => r.pago_movimento_id!))
    const val = new Map(((am as { id: string; valor: number }[] | null) || []).map(m => [m.id, Number(m.valor)]))
    for (const r of antigos) pago.set(r.id, c2((pago.get(r.id) || 0) + (val.get(r.pago_movimento_id!) || 0)))
  }
  return reps.map(r => ({
    id: r.id, ref: r.mes_referencia.slice(0, 7), status: r.status,
    total: total.get(r.id) ?? 0, pago: pago.get(r.id) || 0,
    conferidoTotal: r.conferido_total == null ? null : Number(r.conferido_total),
    conferidoEm: r.conferido_em ?? null, conferidoPorNome: r.conferido_por_nome ?? null,
    pagoMovimentoId: r.pago_movimento_id,
  })).sort((a, b) => a.ref.localeCompare(b.ref))
}
