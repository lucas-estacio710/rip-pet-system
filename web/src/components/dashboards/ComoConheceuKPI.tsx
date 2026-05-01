'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { computePreviousRange, type PeriodRange } from '@/lib/dashboard-period'

type Props = {
  range: PeriodRange
  comparePrev: boolean
}

const STATUS_REMOVIDO = ['ativo', 'pinda', 'retorno', 'pendente', 'finalizado']
const TOP_N = 6
const MODE_KEY = 'dashboards.comoConheceu.mode'

type Mode = 'fracionario' | 'absoluto'

// Config visual por fonte (busca case-insensitive)
type FonteConfig = { color: string; img?: string; icon?: string }
const FONTE_CONFIG: Record<string, FonteConfig> = {
  'google':                { color: '#3b82f6', img: '/icons/google.svg' },     // azul
  'instagram/facebook':    { color: '#f97316', img: '/icons/meta.svg' },       // laranja
  'indicação em clínica':  { color: '#10b981', img: '/icons/hospital.svg' },   // verde
  'cliente':               { color: '#7c3aed', icon: '🔄' },                   // roxo
  'parente/amigo':         { color: '#a78bfa', icon: '👥' },                   // lilás
  'seguradora':            { color: '#4338ca', icon: '🛡️' },
  'ponto':                 { color: '#dc2626', icon: '📍' },
  'outro':                 { color: '#64748b', icon: '📝' },                   // cinza
}
const FONTE_FALLBACK: FonteConfig = { color: 'var(--surface-400)' }
const FONTE_OUTROS:   FonteConfig = { color: 'var(--surface-500)' }

function getFonteConfig(nome: string, isOutros: boolean): FonteConfig {
  if (isOutros) return FONTE_OUTROS
  return FONTE_CONFIG[nome.toLowerCase().trim()] ?? FONTE_FALLBACK
}

type FonteRow = { id: string; nome: string }
type ContratoRow = {
  fonte_conhecimento_id: string | null
  fonte_conhecimento_ids: string[] | null
}
type RankItem = { id: string; nome: string; count: number; prevCount: number }

export default function ComoConheceuKPI({ range, comparePrev }: Props) {
  const { currentUnit } = useUnit()
  const [items, setItems] = useState<RankItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<Mode>('fracionario')

  // Hidrata modo do localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY) as Mode | null
      if (saved === 'fracionario' || saved === 'absoluto') setMode(saved)
    } catch { /* ignora */ }
  }, [])

  function selectMode(m: Mode) {
    setMode(m)
    try { localStorage.setItem(MODE_KEY, m) } catch { /* ignora */ }
  }

  useEffect(() => {
    if (!currentUnit) return
    const supabase = createClient()
    let cancelled = false
    setLoading(true)

    async function load() {
      // 1. Carregar nomes das fontes
      const { data: fontesData } = await supabase
        .from('fontes_conhecimento')
        .select('id,nome')
      const fontesMap = new Map<string, string>()
      const fontes = (fontesData ?? []) as FonteRow[]
      fontes.forEach(f => fontesMap.set(f.id, f.nome))

      // 2. Aggregate respeitando o modo (fracionário 1/N ou absoluto 1)
      const aggregate = async (from: Date, to: Date): Promise<Map<string, number>> => {
        const counts = new Map<string, number>()
        const { data, error } = await supabase
          .from('contratos')
          .select('fonte_conhecimento_id, fonte_conhecimento_ids')
          .eq('unidade_id', currentUnit!.id)
          .in('status', STATUS_REMOVIDO)
          .gte('data_acolhimento', from.toISOString())
          .lte('data_acolhimento', to.toISOString())
        if (error) { console.error('[ComoConheceuKPI]', error); return counts }
        const rows = (data ?? []) as ContratoRow[]
        for (const row of rows) {
          const ids = (row.fonte_conhecimento_ids && row.fonte_conhecimento_ids.length > 0)
            ? row.fonte_conhecimento_ids
            : (row.fonte_conhecimento_id ? [row.fonte_conhecimento_id] : [])
          if (ids.length === 0) continue
          const w = mode === 'fracionario' ? 1 / ids.length : 1
          for (const id of ids) {
            counts.set(id, (counts.get(id) ?? 0) + w)
          }
        }
        return counts
      }

      const prev = computePreviousRange(range)
      const [currMap, prevMap] = await Promise.all([
        aggregate(range.from, range.to),
        comparePrev ? aggregate(prev.from, prev.to) : Promise.resolve(new Map<string, number>()),
      ])

      if (cancelled) return

      // 3. Lista ordenada
      const list: RankItem[] = Array.from(currMap.entries())
        .map(([id, count]) => ({
          id,
          nome: fontesMap.get(id) ?? '— sem nome —',
          count,
          prevCount: prevMap.get(id) ?? 0,
        }))
        .sort((a, b) => b.count - a.count)

      // 4. Top N + agrupar resto em "Outros"
      let topList = list
      if (list.length > TOP_N) {
        const top = list.slice(0, TOP_N)
        const rest = list.slice(TOP_N)
        const restCount = rest.reduce((s, x) => s + x.count, 0)
        const restPrev  = rest.reduce((s, x) => s + x.prevCount, 0)
        topList = [...top, { id: '_outros', nome: 'Outros', count: restCount, prevCount: restPrev }]
      }

      const sumCurr = list.reduce((s, x) => s + x.count, 0)
      setItems(topList)
      setTotal(sumCurr)
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [range.key, range.from.getTime(), range.to.getTime(), comparePrev, currentUnit?.id, mode])

  const max = items[0]?.count ?? 0

  function fmt(n: number): string {
    return Number.isInteger(n)
      ? n.toLocaleString('pt-BR')
      : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  }

  return (
    <div className="card p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="text-xs uppercase tracking-wide text-[var(--surface-500)]">
          Como nos conheceu
        </div>
        <div className="inline-flex rounded-full border border-[var(--surface-300)] p-0.5 text-[10px] font-medium">
          {(['fracionario', 'absoluto'] as const).map(m => {
            const active = mode === m
            return (
              <button
                key={m}
                onClick={() => selectMode(m)}
                className="px-2.5 py-0.5 rounded-full transition-colors"
                style={{
                  background: active ? 'var(--brand-500)' : 'transparent',
                  color: active ? '#fff' : 'var(--surface-500)',
                }}
                title={m === 'fracionario' ? 'Total = nº de contratos (1/N quando múltiplas fontes)' : 'Cada fonte conta inteira (total > nº de contratos)'}
              >
                {m === 'fracionario' ? 'Fracionário' : 'Absoluto'}
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="h-32 flex items-center justify-center text-3xl text-[var(--surface-300)]">…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-[var(--surface-400)] py-8 text-center">Sem dados no período</div>
      ) : (
        <ul className="space-y-2">
          {items.map(item => {
            const pct = max > 0 ? (item.count / max) * 100 : 0
            const totalPct = total > 0 ? Math.round((item.count / total) * 100) : 0
            const delta = item.count - item.prevCount
            const showTrend = comparePrev && Math.abs(delta) >= 0.5
            const trendPct = item.prevCount > 0 ? Math.round((delta / item.prevCount) * 100) : (item.count > 0 ? 100 : 0)
            const trendColor = delta > 0 ? '#10b981' : '#ef4444'
            const TrendIcon = delta > 0 ? TrendingUp : TrendingDown

            const isOutros = item.id === '_outros'
            const cfg = getFonteConfig(item.nome, isOutros)
            return (
              <li key={item.id} className="flex items-center gap-2.5 text-xs">
                <span
                  className="w-5 h-5 rounded-full inline-flex items-center justify-center shrink-0 overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)',
                    border: '1px solid #cbd5e1',
                  }}
                >
                  {cfg.img ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={cfg.img} alt={item.nome} className="w-3.5 h-3.5 object-contain" />
                  ) : cfg.icon ? (
                    <span className="text-[11px] leading-none">{cfg.icon}</span>
                  ) : (
                    <span className="w-2 h-2 rounded-full" style={{ background: cfg.color }} />
                  )}
                </span>
                <div className="w-24 sm:w-32 truncate text-[var(--surface-700)] font-medium" title={item.nome}>
                  {item.nome}
                </div>
                <div className="flex-1 h-2 bg-[var(--surface-200)] rounded-full overflow-hidden min-w-0">
                  <div
                    className="h-full transition-all duration-700 ease-out"
                    style={{ width: `${pct}%`, background: cfg.color }}
                  />
                </div>
                <div className="font-mono font-semibold text-[var(--surface-800)] tabular-nums w-12 text-right">
                  {fmt(item.count)}
                </div>
                <div className="font-mono text-[var(--surface-400)] tabular-nums w-10 text-right">
                  {totalPct}%
                </div>
                {showTrend && (
                  <div
                    className="inline-flex items-center gap-0.5 font-mono font-medium tabular-nums w-14 justify-end"
                    style={{ color: trendColor }}
                  >
                    <TrendIcon className="h-2.5 w-2.5 shrink-0" />
                    {Math.abs(trendPct)}%
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
