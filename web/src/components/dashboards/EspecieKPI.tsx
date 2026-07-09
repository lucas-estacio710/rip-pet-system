'use client'

import { useEffect, useState } from 'react'
import { Dog, Cat, Bird, TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react'
import AnimatedNumber from './AnimatedNumber'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { computePreviousRange, type PeriodRange } from '@/lib/dashboard-period'
import { filtroModo, type DashboardModo } from '@/lib/dashboard-modo'

type Props = {
  range: PeriodRange
  comparePrev: boolean
  modo: DashboardModo
}

type EspKey = 'canina' | 'felina' | 'exotica'

const ESPECIES: { key: EspKey; label: string; color: string; icon: LucideIcon }[] = [
  { key: 'canina',  label: 'Canina',  color: '#ca8a04', icon: Dog },
  { key: 'felina',  label: 'Felina',  color: '#ec4899', icon: Cat },
  { key: 'exotica', label: 'Exótica', color: '#6366f1', icon: Bird },
]

const ZERO: Record<EspKey, number> = { canina: 0, felina: 0, exotica: 0 }

export default function EspecieKPI({ range, comparePrev, modo }: Props) {
  const { currentUnit } = useUnit()
  const [counts, setCounts] = useState<Record<EspKey, number>>(ZERO)
  const [prevCounts, setPrevCounts] = useState<Record<EspKey, number>>(ZERO)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentUnit) return
    const supabase = createClient()
    let cancelled = false
    setLoading(true)

    const queryBreakdown = async (from: Date, to: Date): Promise<Record<EspKey, number>> => {
      const acc: Record<EspKey, number> = { ...ZERO }
      const base = supabase
        .from('contratos')
        .select('pet_especie')
        .eq('unidade_id', currentUnit.id)
      const { data, error } = await filtroModo(base, modo, from, to)
      if (error) { console.error('[EspecieKPI]', error); return acc }
      const rows = (data ?? []) as { pet_especie: EspKey | null }[]
      for (const row of rows) {
        if (row.pet_especie && row.pet_especie in acc) acc[row.pet_especie]++
      }
      return acc
    }

    const prev = computePreviousRange(range)
    Promise.all([
      queryBreakdown(range.from, range.to),
      comparePrev ? queryBreakdown(prev.from, prev.to) : Promise.resolve({ ...ZERO }),
    ]).then(([curr, prevR]) => {
      if (cancelled) return
      setCounts(curr)
      setPrevCounts(prevR)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [range.key, range.from.getTime(), range.to.getTime(), comparePrev, modo, currentUnit?.id])

  const total = (Object.values(counts) as number[]).reduce((a, b) => a + b, 0)

  return (
    <div className="card p-4 sm:p-6">
      <div className="text-xs uppercase tracking-wide text-[var(--surface-500)] mb-4">
        Espécie
      </div>

      {loading ? (
        <div className="h-24 flex items-center justify-center text-3xl text-[var(--surface-300)]">…</div>
      ) : total === 0 ? (
        <div className="text-sm text-[var(--surface-400)] py-8 text-center">Sem dados no período</div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {ESPECIES.map(e => {
            const count = counts[e.key]
            const prev = prevCounts[e.key]
            const pct = total > 0 ? Math.round((count / total) * 100) : 0
            const delta = count - prev
            const showTrend = comparePrev && delta !== 0
            const trendPct = prev > 0 ? Math.round((delta / prev) * 100) : (count > 0 ? 100 : 0)
            const trendColor = delta > 0 ? '#10b981' : '#ef4444'
            const TrendIcon = delta > 0 ? TrendingUp : TrendingDown
            const Icon = e.icon
            return (
              <div key={e.key} className="flex flex-col items-center text-center px-1 py-2">
                <Icon className="h-5 w-5 mb-1.5" style={{ color: e.color }} />
                <div className="font-mono text-2xl font-bold text-[var(--surface-800)] tabular-nums leading-none">
                  <AnimatedNumber value={count} />
                </div>
                <div className="text-[10px] text-[var(--surface-500)] mt-1 font-medium">{e.label}</div>
                <div className="text-[10px] text-[var(--surface-400)] font-mono">{pct}%</div>
                {showTrend && (
                  <div className="mt-1 inline-flex items-center gap-0.5 text-[9px] font-mono font-medium" style={{ color: trendColor }}>
                    <TrendIcon className="h-2 w-2" />
                    {delta > 0 ? '+' : ''}{trendPct}%
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
