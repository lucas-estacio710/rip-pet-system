'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import AnimatedNumber from './AnimatedNumber'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { computePreviousRange, type PeriodRange } from '@/lib/dashboard-period'

type Props = {
  range: PeriodRange
  comparePrev: boolean
}

const STATUS_REMOVIDO = ['ativo', 'pinda', 'retorno', 'pendente', 'finalizado']
const COLOR_IND = '#10b981' // verde
const COLOR_COL = '#a855f7' // roxo

export default function TipoCremacaoKPI({ range, comparePrev }: Props) {
  const { currentUnit } = useUnit()
  const [ind, setInd] = useState(0)
  const [col, setCol] = useState(0)
  const [prevInd, setPrevInd] = useState(0)
  const [prevCol, setPrevCol] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentUnit) return
    const supabase = createClient()
    let cancelled = false
    setLoading(true)

    const queryByTipo = async (tipo: 'individual' | 'coletiva', from: Date, to: Date): Promise<number> => {
      const { count, error } = await supabase
        .from('contratos')
        .select('id', { count: 'exact', head: true })
        .eq('unidade_id', currentUnit.id)
        .in('status', STATUS_REMOVIDO)
        .eq('tipo_cremacao', tipo)
        .gte('data_acolhimento', from.toISOString())
        .lte('data_acolhimento', to.toISOString())
      if (error) { console.error('[TipoCremacaoKPI]', error); return 0 }
      return count ?? 0
    }

    const prev = computePreviousRange(range)
    Promise.all([
      queryByTipo('individual', range.from, range.to),
      queryByTipo('coletiva',   range.from, range.to),
      comparePrev ? queryByTipo('individual', prev.from, prev.to) : Promise.resolve(0),
      comparePrev ? queryByTipo('coletiva',   prev.from, prev.to) : Promise.resolve(0),
    ]).then(([i, c, pi, pc]) => {
      if (cancelled) return
      setInd(i); setCol(c); setPrevInd(pi); setPrevCol(pc)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [range.key, range.from.getTime(), range.to.getTime(), comparePrev, currentUnit?.id])

  const total = ind + col
  const pctInd = total > 0 ? Math.round((ind / total) * 100) : 0
  const pctCol = total > 0 ? 100 - pctInd : 0

  function renderDelta(curr: number, prev: number) {
    if (!comparePrev) return null
    const delta = curr - prev
    if (delta === 0) return <span className="text-[10px] text-[var(--surface-400)]">—</span>
    const pct = prev > 0 ? Math.round((delta / prev) * 100) : (curr > 0 ? 100 : 0)
    const Icon = delta > 0 ? TrendingUp : TrendingDown
    const color = delta > 0 ? '#10b981' : '#ef4444'
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium" style={{ color }}>
        <Icon className="h-2.5 w-2.5" />
        {delta > 0 ? '+' : ''}{pct}%
      </span>
    )
  }

  return (
    <div className="card p-6 sm:p-8">
      <div className="text-xs uppercase tracking-wide text-[var(--surface-500)] mb-4">
        Tipo de cremação
      </div>

      {loading ? (
        <div className="h-24 flex items-center text-3xl text-[var(--surface-300)]">…</div>
      ) : total === 0 ? (
        <div className="text-sm text-[var(--surface-400)] py-8 text-center">Sem dados no período</div>
      ) : (
        <>
          {/* Linha de números */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR_IND }} />
                <span className="text-[11px] text-[var(--surface-500)] font-medium">Individual</span>
                {renderDelta(ind, prevInd)}
              </div>
              <div className="font-mono text-3xl sm:text-4xl font-bold text-[var(--surface-800)] tabular-nums leading-none">
                <AnimatedNumber value={ind} />
                <span className="text-sm font-normal text-[var(--surface-400)] ml-1.5">({pctInd}%)</span>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 justify-end mb-1">
                {renderDelta(col, prevCol)}
                <span className="text-[11px] text-[var(--surface-500)] font-medium">Coletiva</span>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR_COL }} />
              </div>
              <div className="font-mono text-3xl sm:text-4xl font-bold text-[var(--surface-800)] tabular-nums leading-none">
                <AnimatedNumber value={col} />
                <span className="text-sm font-normal text-[var(--surface-400)] ml-1.5">({pctCol}%)</span>
              </div>
            </div>
          </div>

          {/* Barra segmentada */}
          <div className="flex h-2.5 rounded-full overflow-hidden bg-[var(--surface-200)]">
            <div className="transition-all duration-700" style={{ width: `${pctInd}%`, background: COLOR_IND }} />
            <div className="transition-all duration-700" style={{ width: `${pctCol}%`, background: COLOR_COL }} />
          </div>
        </>
      )}
    </div>
  )
}
