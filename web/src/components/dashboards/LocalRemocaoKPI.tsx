'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
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

const CATS = [
  { key: 'Residência', label: 'Residência', color: '#ef4444' }, // vermelho
  { key: 'Clínica',    label: 'Clínica',    color: '#059669' }, // verde escuro
  { key: 'Unidade',    label: 'Unidade',    color: '#38bdf8' }, // azul claro
] as const

type CatKey = typeof CATS[number]['key']
const ZERO: Record<CatKey, number> = { 'Residência': 0, 'Clínica': 0, 'Unidade': 0 }

function bucketize(value: string | null): CatKey {
  if (value === 'Clínica') return 'Clínica'
  if (value === 'Unidade') return 'Unidade'
  return 'Residência' // 'Residência', 'Outro' e null caem aqui
}

export default function LocalRemocaoKPI({ range, comparePrev, modo }: Props) {
  const { currentUnit } = useUnit()
  const [counts, setCounts] = useState<Record<CatKey, number>>(ZERO)
  const [prevCounts, setPrevCounts] = useState<Record<CatKey, number>>(ZERO)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentUnit) return
    const supabase = createClient()
    let cancelled = false
    setLoading(true)

    const queryBreakdown = async (from: Date, to: Date): Promise<Record<CatKey, number>> => {
      const acc: Record<CatKey, number> = { ...ZERO }
      const base = supabase
        .from('contratos')
        .select('local_coleta')
        .eq('unidade_id', currentUnit.id)
      const { data, error } = await filtroModo(base, modo, from, to)
      if (error) { console.error('[LocalRemocaoKPI]', error); return acc }
      const rows = (data ?? []) as { local_coleta: string | null }[]
      for (const row of rows) acc[bucketize(row.local_coleta)]++
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
  const segments = CATS.map(c => ({
    ...c,
    count: counts[c.key],
    prev: prevCounts[c.key],
    pct: total > 0 ? Math.round((counts[c.key] / total) * 100) : 0,           // pra display
    pctRaw: total > 0 ? counts[c.key] / total : 0,                            // pra desenho (sem arredondar)
  })).filter(s => s.count > 0)

  return (
    <div className="card p-4 sm:p-6 flex flex-col overflow-hidden">
      <div className="text-xs uppercase tracking-wide text-[var(--surface-500)] mb-4">
        Local de remoção
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center text-3xl text-[var(--surface-300)]">…</div>
      ) : total === 0 ? (
        <div className="text-sm text-[var(--surface-400)] py-12 text-center">Sem dados no período</div>
      ) : (
        <DonutWithCallouts segments={segments} total={total} comparePrev={comparePrev} />
      )}
    </div>
  )
}

// ============================================
// Donut com callouts (leader lines + labels)
// ============================================

type Segment = {
  key: string
  label: string
  color: string
  count: number
  prev: number
  pct: number     // arredondado, pra display
  pctRaw: number  // 0..1, pra desenho
}

function DonutWithCallouts({
  segments,
  total,
  comparePrev,
}: {
  segments: Segment[]
  total: number
  comparePrev: boolean
}) {
  // Geometria
  const W = 280
  const H = 200
  const cx = W / 2
  const cy = H / 2
  const innerR = 32
  const outerR = 56
  const leaderOut = 10  // comprimento da linha radial saindo da fatia

  // Calcula slices acumulados começando do topo (-π/2). Usa pctRaw pra fechar 100%.
  let acc = 0
  const slices = segments.map(s => {
    const startAngle = acc * 2 * Math.PI - Math.PI / 2
    acc += s.pctRaw
    const endAngle = acc * 2 * Math.PI - Math.PI / 2
    const midAngle = (startAngle + endAngle) / 2
    return { ...s, startAngle, endAngle, midAngle }
  })

  return (
    <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 w-full h-full"
      >
        {/* Trilho de fundo */}
        <circle cx={cx} cy={cy} r={(innerR + outerR) / 2} fill="none" stroke="var(--surface-200)" strokeWidth={outerR - innerR} />

        {/* Fatias */}
        {slices.map(s => (
          <path
            key={s.key}
            d={arcPath(cx, cy, innerR, outerR, s.startAngle, s.endAngle)}
            fill={s.color}
            style={{ transition: 'd 700ms ease-out' }}
          />
        ))}

        {/* Percentuais dentro das fatias */}
        {slices.map(s => {
          if (s.pct < 5) return null
          const r = (innerR + outerR) / 2
          const x = cx + r * Math.cos(s.midAngle)
          const y = cy + r * Math.sin(s.midAngle)
          return (
            <text
              key={`pct-${s.key}`}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fontWeight={700}
              fontFamily="ui-monospace, monospace"
              fill="#fff"
              style={{ paintOrder: 'stroke fill', stroke: 'rgba(0,0,0,0.15)', strokeWidth: 2 }}
            >
              {s.pct}%
            </text>
          )
        })}

        {/* Total no centro (animado) */}
        <foreignObject x={cx - innerR} y={cy - 14} width={innerR * 2} height={28}>
          <div className="w-full h-full flex items-center justify-center">
            <span className="font-mono text-xl font-bold text-[var(--surface-800)] tabular-nums leading-none">
              <AnimatedNumber value={total} />
            </span>
          </div>
        </foreignObject>

        {/* Leader lines */}
        {slices.map(s => {
          const cosA = Math.cos(s.midAngle)
          const sinA = Math.sin(s.midAngle)
          const p1x = cx + outerR * cosA
          const p1y = cy + outerR * sinA
          const p2x = cx + (outerR + leaderOut) * cosA
          const p2y = cy + (outerR + leaderOut) * sinA
          return (
            <line key={`line-${s.key}`} x1={p1x} y1={p1y} x2={p2x} y2={p2y} stroke={s.color} strokeWidth={1} />
          )
        })}
      </svg>

      {/* Callouts em HTML — respeitam max-width e quebram linha */}
      {slices.map(s => {
        const cosA = Math.cos(s.midAngle)
        const sinA = Math.sin(s.midAngle)
        const isRight = cosA >= 0
        const tipX = ((cx + (outerR + leaderOut + 2) * cosA) / W) * 100
        const tipY = ((cy + (outerR + leaderOut + 2) * sinA) / H) * 100
        const delta = s.count - s.prev
        const trendColor = delta > 0 ? '#10b981' : delta < 0 ? '#ef4444' : 'var(--surface-400)'
        const showTrend = comparePrev && delta !== 0
        const trendPct = s.prev > 0 ? Math.round((delta / s.prev) * 100) : (s.count > 0 ? 100 : 0)
        const TrendIcon = delta > 0 ? TrendingUp : TrendingDown

        return (
          <div
            key={`callout-${s.key}`}
            className="absolute text-[10px] leading-tight pointer-events-none"
            style={{
              left: `${tipX}%`,
              top: `${tipY}%`,
              transform: `translateY(-50%)${isRight ? '' : ' translateX(-100%)'}`,
              maxWidth: isRight ? `calc(${100 - tipX}% - 2px)` : `calc(${tipX}% - 2px)`,
              textAlign: isRight ? 'left' : 'right',
            }}
          >
            <div className="text-[var(--surface-700)]">
              <span className="font-mono font-semibold">{s.count}</span>{' '}
              <span className="text-[var(--surface-500)]">em</span>{' '}
              <span className="font-medium">{s.label}</span>
            </div>
            {showTrend && (
              <div style={{ color: trendColor }}>
                <span className="inline-flex items-center gap-0.5 font-mono font-medium align-middle">
                  <TrendIcon className="h-2.5 w-2.5 shrink-0" />
                  {Math.abs(trendPct)}%
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Path de uma fatia de anel (donut slice) */
function arcPath(cx: number, cy: number, innerR: number, outerR: number, startAngle: number, endAngle: number): string {
  const x1 = cx + outerR * Math.cos(startAngle)
  const y1 = cy + outerR * Math.sin(startAngle)
  const x2 = cx + outerR * Math.cos(endAngle)
  const y2 = cy + outerR * Math.sin(endAngle)
  const x3 = cx + innerR * Math.cos(endAngle)
  const y3 = cy + innerR * Math.sin(endAngle)
  const x4 = cx + innerR * Math.cos(startAngle)
  const y4 = cy + innerR * Math.sin(startAngle)
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0
  return `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4} Z`
}
