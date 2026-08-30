'use client'

import { useEffect, useState } from 'react'
import { Moon, Sunrise, Sun, Sunset, TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react'
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

export type PeriodoKey = 'madrugada' | 'manha' | 'tarde' | 'noite'

export const PERIODOS_DIA: { key: PeriodoKey; label: string; faixa: string; color: string; icon: LucideIcon }[] = [
  { key: 'madrugada', label: 'Madrugada', faixa: '0h–6h',   color: '#4c1d95', icon: Moon },
  { key: 'manha',     label: 'Manhã',     faixa: '6h–12h',  color: '#f59e0b', icon: Sunrise },
  { key: 'tarde',     label: 'Tarde',     faixa: '12h–18h', color: '#0ea5e9', icon: Sun },
  { key: 'noite',     label: 'Noite',     faixa: '18h–24h', color: '#1e293b', icon: Sunset },
]

const ZERO: Record<PeriodoKey, number> = { madrugada: 0, manha: 0, tarde: 0, noite: 0 }

/** Bucket por hora LOCAL do acolhimento — mesma premissa de fuso das outras telas (browser em horário de Brasília). */
export function periodoDoDia(dataStr: string): PeriodoKey {
  const h = new Date(dataStr).getHours()
  if (h < 6) return 'madrugada'
  if (h < 12) return 'manha'
  if (h < 18) return 'tarde'
  return 'noite'
}

export default function PeriodoRemocaoKPI({ range, comparePrev, modo }: Props) {
  const { currentUnit } = useUnit()
  const [counts, setCounts] = useState<Record<PeriodoKey, number>>(ZERO)
  const [prevCounts, setPrevCounts] = useState<Record<PeriodoKey, number>>(ZERO)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentUnit) return
    const supabase = createClient()
    let cancelled = false
    setLoading(true)

    const queryBreakdown = async (from: Date, to: Date): Promise<Record<PeriodoKey, number>> => {
      const acc: Record<PeriodoKey, number> = { ...ZERO }
      const base = supabase
        .from('contratos')
        .select('data_acolhimento')
        .eq('unidade_id', currentUnit.id)
      const { data, error } = await filtroModo(base, modo, from, to)
      if (error) { console.error('[PeriodoRemocaoKPI]', error); return acc }
      const rows = (data ?? []) as { data_acolhimento: string | null }[]
      for (const row of rows) {
        if (!row.data_acolhimento) continue
        acc[periodoDoDia(row.data_acolhimento)]++
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
        Período de remoção
      </div>

      {loading ? (
        <div className="h-24 flex items-center justify-center text-3xl text-[var(--surface-300)]">…</div>
      ) : total === 0 ? (
        <div className="text-sm text-[var(--surface-400)] py-8 text-center">Sem dados no período</div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {PERIODOS_DIA.map(p => {
            const count = counts[p.key]
            const prev = prevCounts[p.key]
            const pct = total > 0 ? Math.round((count / total) * 100) : 0
            const delta = count - prev
            const showTrend = comparePrev && delta !== 0
            const trendPct = prev > 0 ? Math.round((delta / prev) * 100) : (count > 0 ? 100 : 0)
            const trendColor = delta > 0 ? '#10b981' : '#ef4444'
            const TrendIcon = delta > 0 ? TrendingUp : TrendingDown
            const Icon = p.icon
            return (
              <div key={p.key} className="flex flex-col items-center text-center px-1 py-2">
                <Icon className="h-5 w-5 mb-1.5" style={{ color: p.color }} />
                <div className="font-mono text-2xl font-bold text-[var(--surface-800)] tabular-nums leading-none">
                  <AnimatedNumber value={count} />
                </div>
                <div className="text-[10px] text-[var(--surface-500)] mt-1 font-medium">{p.label}</div>
                <div className="text-[9px] text-[var(--surface-400)]">{p.faixa}</div>
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
      <p className="text-[9px] text-[var(--surface-400)] mt-3">Baseado na hora do acolhimento — contratos sem essa data não entram.</p>
    </div>
  )
}
