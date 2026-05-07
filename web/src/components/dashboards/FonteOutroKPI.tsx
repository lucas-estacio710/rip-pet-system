'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import type { PeriodRange } from '@/lib/dashboard-period'

type Props = {
  range: PeriodRange
}

const STATUS_REMOVIDO = ['ativo', 'pinda', 'retorno', 'pendente', 'finalizado']

type ContratoRow = { fonte_outro_especificar: string | null }
type Item = { texto: string; count: number }

export default function FonteOutroKPI({ range }: Props) {
  const { currentUnit } = useUnit()
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentUnit) return
    const supabase = createClient()
    let cancelled = false
    setLoading(true)

    async function load() {
      const { data, error } = await supabase
        .from('contratos')
        .select('fonte_outro_especificar')
        .eq('unidade_id', currentUnit!.id)
        .in('status', STATUS_REMOVIDO)
        .not('fonte_outro_especificar', 'is', null)
        .neq('fonte_outro_especificar', '')
        .gte('data_acolhimento', range.from.toISOString())
        .lte('data_acolhimento', range.to.toISOString())

      if (cancelled) return

      if (error) {
        console.error('[FonteOutroKPI]', error)
        setItems([]); setTotal(0); setLoading(false); return
      }

      const rows = (data ?? []) as ContratoRow[]
      const counts = new Map<string, number>()
      for (const row of rows) {
        const t = row.fonte_outro_especificar
        if (!t) continue
        counts.set(t, (counts.get(t) ?? 0) + 1)
      }

      const list: Item[] = Array.from(counts.entries())
        .map(([texto, count]) => ({ texto, count }))
        .sort((a, b) => b.count - a.count)

      setItems(list)
      setTotal(list.reduce((s, x) => s + x.count, 0))
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [range.key, range.from.getTime(), range.to.getTime(), currentUnit?.id])

  const max = items[0]?.count ?? 0

  return (
    <div className="card p-4 sm:p-6">
      <div className="flex items-baseline gap-2 mb-4">
        <div className="text-xs uppercase tracking-wide text-[var(--surface-500)]">
          Outros — texto livre
        </div>
        {!loading && total > 0 && (
          <span className="text-[10px] text-[var(--surface-400)] font-mono">
            {total} {total === 1 ? 'menção' : 'menções'} · {items.length} {items.length === 1 ? 'distinto' : 'distintos'}
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-32 flex items-center justify-center text-3xl text-[var(--surface-300)]">…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-[var(--surface-400)] py-8 text-center">
          Sem texto preenchido em &quot;Outro&quot; no período
        </div>
      ) : (
        <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {items.map((item, idx) => {
            const pct = max > 0 ? (item.count / max) * 100 : 0
            return (
              <li key={`${idx}-${item.texto}`} className="flex items-center gap-2.5 text-xs">
                <div className="w-32 sm:w-40 truncate text-[var(--surface-700)]" title={item.texto}>
                  {item.texto}
                </div>
                <div className="flex-1 h-2 bg-[var(--surface-200)] rounded-full overflow-hidden min-w-0">
                  <div
                    className="h-full transition-all duration-700 ease-out"
                    style={{ width: `${pct}%`, background: '#64748b' }}
                  />
                </div>
                <div className="font-mono font-semibold text-[var(--surface-800)] tabular-nums w-8 text-right">
                  {item.count}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
