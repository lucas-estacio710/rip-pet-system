'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { computePreviousRange, type PeriodRange } from '@/lib/dashboard-period'
import { filtroModo, type DashboardModo } from '@/lib/dashboard-modo'

type Props = {
  range: PeriodRange
  comparePrev: boolean
  modo: DashboardModo
}

const SEM_RESPONSAVEL = '(sem responsável)'

type RankItem = { nome: string; count: number; prevCount: number }

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

// Contagem de contratos por funcionario_id no período (paginado — Supabase corta em 1000)
async function countPorFuncionario(
  supabase: ReturnType<typeof createClient>,
  unidadeId: string,
  modo: DashboardModo,
  from: Date,
  to: Date,
): Promise<Map<string | null, number>> {
  const PAGE = 1000
  const counts = new Map<string | null, number>()
  for (let offset = 0; ; offset += PAGE) {
    const base = supabase
      .from('contratos')
      .select('funcionario_id')
      .eq('unidade_id', unidadeId)
      .range(offset, offset + PAGE - 1)
    const { data, error } = await filtroModo(base, modo, from, to)
    if (error) { console.error('[ResponsavelKPI]', error); break }
    const rows = (data ?? []) as { funcionario_id: string | null }[]
    for (const r of rows) counts.set(r.funcionario_id, (counts.get(r.funcionario_id) ?? 0) + 1)
    if (rows.length < PAGE) break
  }
  return counts
}

export default function ResponsavelKPI({ range, comparePrev, modo }: Props) {
  const { currentUnit } = useUnit()
  const [items, setItems] = useState<RankItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentUnit) return
    const supabase = createClient()
    let cancelled = false
    setLoading(true)

    const prev = computePreviousRange(range)
    Promise.all([
      supabase.from('funcionarios').select('id, nome').eq('unidade_id', currentUnit.id),
      countPorFuncionario(supabase, currentUnit.id, modo, range.from, range.to),
      comparePrev
        ? countPorFuncionario(supabase, currentUnit.id, modo, prev.from, prev.to)
        : Promise.resolve(new Map<string | null, number>()),
    ]).then(([funcRes, curr, prevC]) => {
      if (cancelled) return
      const funcionarios = (funcRes.data ?? []) as unknown as { id: string; nome: string }[]
      const nomes = new Map(funcionarios.map(f => [f.id, f.nome]))
      const porNome = new Map<string, RankItem>()
      const add = (funcId: string | null, count: number, isPrev: boolean) => {
        const nome = funcId ? (nomes.get(funcId) ?? SEM_RESPONSAVEL) : SEM_RESPONSAVEL
        const item = porNome.get(nome) ?? { nome, count: 0, prevCount: 0 }
        if (isPrev) item.prevCount += count
        else item.count += count
        porNome.set(nome, item)
      }
      curr.forEach((count, funcId) => add(funcId, count, false))
      prevC.forEach((count, funcId) => add(funcId, count, true))

      const lista = Array.from(porNome.values())
        .filter(i => i.count > 0 || i.prevCount > 0)
        .sort((a, b) => b.count - a.count || a.nome.localeCompare(b.nome))
      setItems(lista)
      setTotal(lista.reduce((s, i) => s + i.count, 0))
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [range.key, range.from.getTime(), range.to.getTime(), comparePrev, modo, currentUnit?.id])

  const max = items[0]?.count ?? 0

  return (
    <div className="card p-4 sm:p-6">
      <div className="text-xs uppercase tracking-wide text-[var(--surface-500)] mb-4">
        Responsável pelo acolhimento
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
            const showTrend = comparePrev && delta !== 0
            const trendPct = item.prevCount > 0 ? Math.round((delta / item.prevCount) * 100) : (item.count > 0 ? 100 : 0)
            const trendColor = delta > 0 ? '#10b981' : '#ef4444'
            const TrendIcon = delta > 0 ? TrendingUp : TrendingDown
            const isSem = item.nome === SEM_RESPONSAVEL
            return (
              <li key={item.nome} className={`flex items-center gap-2.5 text-xs ${item.count === 0 ? 'opacity-40' : ''}`}>
                <span
                  className="w-5 h-5 rounded-full inline-flex items-center justify-center shrink-0 text-[9px] font-bold"
                  style={{
                    background: isSem ? 'var(--surface-200)' : 'var(--brand-500)',
                    color: isSem ? 'var(--surface-500)' : '#fff',
                  }}
                >
                  {isSem ? '?' : iniciais(item.nome)}
                </span>
                <div className="w-24 sm:w-32 truncate text-[var(--surface-700)] font-medium" title={item.nome}>
                  {item.nome}
                </div>
                <div
                  className="flex-1 h-2 rounded-full overflow-hidden min-w-0"
                  style={{ background: item.count === 0 ? 'var(--surface-100)' : 'var(--surface-200)' }}
                >
                  <div
                    className="h-full transition-all duration-700 ease-out"
                    style={{ width: `${pct}%`, background: isSem ? 'var(--surface-400)' : 'var(--brand-500)' }}
                  />
                </div>
                <div className="font-mono font-semibold text-[var(--surface-800)] tabular-nums w-12 text-right">
                  {item.count.toLocaleString('pt-BR')}
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
