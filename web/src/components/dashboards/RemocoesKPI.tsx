'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import AnimatedNumber from './AnimatedNumber'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { computePreviousRange, type PeriodRange } from '@/lib/dashboard-period'

type Props = {
  range: PeriodRange
  comparePrev: boolean
}

const STATUS_REMOVIDO = ['ativo', 'pinda', 'retorno', 'pendente', 'finalizado']

export default function RemocoesKPI({ range, comparePrev }: Props) {
  const { currentUnit } = useUnit()
  const [count, setCount] = useState(0)
  const [prevCount, setPrevCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentUnit) return
    const supabase = createClient()
    let cancelled = false
    setLoading(true)

    const queryCount = async (from: Date, to: Date): Promise<number> => {
      const { count, error } = await supabase
        .from('contratos')
        .select('id', { count: 'exact', head: true })
        .eq('unidade_id', currentUnit.id)
        .in('status', STATUS_REMOVIDO)
        .gte('data_acolhimento', from.toISOString())
        .lte('data_acolhimento', to.toISOString())
      if (error) { console.error('[RemocoesKPI]', error); return 0 }
      return count ?? 0
    }

    Promise.all([
      queryCount(range.from, range.to),
      comparePrev ? (() => { const p = computePreviousRange(range); return queryCount(p.from, p.to) })() : Promise.resolve(0),
    ]).then(([c, p]) => {
      if (cancelled) return
      setCount(c)
      setPrevCount(p)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [range.key, range.from.getTime(), range.to.getTime(), comparePrev, currentUnit?.id])

  const delta = count - prevCount
  const pct = prevCount > 0 ? Math.round((delta / prevCount) * 100) : (count > 0 ? 100 : 0)
  const trend: 'up' | 'down' | 'flat' = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const trendColor = trend === 'up' ? '#10b981' : trend === 'down' ? '#ef4444' : 'var(--surface-500)'
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  return (
    <div className="card p-6 sm:p-10 text-center">
      <div className="text-xs uppercase tracking-wide text-[var(--surface-500)] mb-3">
        Remoções no período
      </div>

      <div className="font-mono text-6xl sm:text-7xl font-bold text-[var(--surface-800)] tabular-nums leading-none">
        {loading ? <span className="text-[var(--surface-300)]">…</span> : <AnimatedNumber value={count} />}
      </div>

      <div className="text-xs text-[var(--surface-400)] mt-3">
        {range.label}
      </div>

      {comparePrev && !loading && (
        <div
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium"
          style={{ color: trendColor }}
        >
          <span className="inline-flex items-center gap-0.5">
            <TrendIcon className="h-3.5 w-3.5" />
            {trend === 'flat' ? 'sem variação' : `${delta > 0 ? '+' : ''}${pct}%`}
          </span>
          <span className="text-[var(--surface-400)] font-normal">
            vs. período anterior ({prevCount.toLocaleString('pt-BR')})
          </span>
        </div>
      )}
    </div>
  )
}
