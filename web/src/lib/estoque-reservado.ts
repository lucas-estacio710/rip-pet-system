import { createClient } from '@/lib/supabase/client'

/**
 * Estoque reservado por PV (Opção B — robusta).
 *
 * A "reserva" NÃO depende mais da flag `contrato_produtos.is_reserva_pv` (morta:
 * 0 linhas no banco). É derivada de contratos em status `preventivo`, via a view
 * `vw_estoque_reservado_pv` (migration 096). A regra mora num lugar só (o banco),
 * e qualquer tela consome por aqui.
 *
 * Ver FLOW.md: Estoque virtual = Real (físico) − PVs reservados − Empréstimos.
 * (Empréstimos ainda não entram no cálculo — extensão futura.)
 */

type Supa = ReturnType<typeof createClient>

/** Map produto_id → qtde reservada para PV na unidade. */
export type ReservadoPVMap = Map<string, number>

/**
 * Quanto de cada produto está reservado para contratos preventivos da unidade.
 * Retorna Map vazio se não houver unidade.
 */
export async function fetchReservadoPV(
  supabase: Supa,
  unidadeId: string | null | undefined
): Promise<ReservadoPVMap> {
  const map: ReservadoPVMap = new Map()
  if (!unidadeId) return map

  const { data, error } = await supabase
    .from('vw_estoque_reservado_pv')
    .select('produto_id, reservado')
    .eq('unidade_id', unidadeId)

  if (error) {
    // View ainda não aplicada (migration 096 pendente no SQL Editor): estado
    // conhecido e benigno — degrada pra "0 reservado" sem barulho no console.
    // 42P01 = relation não existe · PGRST20x = relation fora do schema cache.
    const benigno = error.code === '42P01' || error.code?.startsWith('PGRST20')
    if (!benigno) {
      console.error('fetchReservadoPV falhou', error.message || error.code || error)
    }
    return map
  }

  ;(data as { produto_id: string; reservado: number }[] | null)?.forEach(r => {
    map.set(r.produto_id, r.reservado)
  })
  return map
}

/**
 * Estoque livre = físico − reservado PV.
 * Produto com estoque_infinito não tem "livre" aplicável → retorna null (∞).
 * Pode ficar negativo (mais reservado que físico) — sinaliza ruptura.
 */
export function calcularLivre(
  estoqueAtual: number,
  reservadoPV: number,
  estoqueInfinito?: boolean
): number | null {
  if (estoqueInfinito) return null
  return estoqueAtual - reservadoPV
}
