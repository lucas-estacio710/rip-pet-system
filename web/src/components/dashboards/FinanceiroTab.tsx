'use client'

import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import AnimatedNumber from './AnimatedNumber'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { computePreviousRange, type PeriodRange } from '@/lib/dashboard-period'

type Props = {
  range: PeriodRange
  comparePrev: boolean
}

// Paleta validada (dataviz: CVD + contraste 3:1 nas superfícies claro #fff e escuro #1e293b)
const COLOR_PLANO    = '#2a78d6' // azul
const COLOR_CATALOGO = '#c98500' // âmbar
const METODO_META: { key: string; label: string; color: string }[] = [
  { key: 'pix',      label: 'Pix',      color: '#199e70' },
  { key: 'credito',  label: 'Crédito',  color: '#8b5cf6' },
  { key: 'debito',   label: 'Débito',   color: '#2a78d6' },
  { key: 'dinheiro', label: 'Dinheiro', color: '#c98500' },
]

type PagRow = {
  data_pagamento: string // YYYY-MM-DD (coluna date)
  tipo: string           // 'plano' | 'catalogo'
  metodo: string         // pix | dinheiro | credito | debito
  valor: number | null
  taxa: number | null
  valor_liquido: number | null
  is_seguradora: boolean
  contrato_id: string
}

type Agg = {
  bruto: number
  liquido: number
  taxas: number
  seguradora: number
  plano: number
  catalogo: number
  metodos: Record<string, number>
  nContratos: number
  nPagamentos: number
}

const AGG_ZERO: Agg = {
  bruto: 0, liquido: 0, taxas: 0, seguradora: 0, plano: 0, catalogo: 0,
  metodos: {}, nContratos: 0, nPagamentos: 0,
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
function fmtBRL2(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtCompact(v: number): string {
  if (v === 0) return '0'
  return 'R$ ' + new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
}

// Pagamentos da unidade no intervalo (por data_pagamento), paginado — Supabase corta em 1000
async function fetchPagamentos(
  supabase: ReturnType<typeof createClient>,
  unidadeId: string,
  from: Date,
  to: Date,
): Promise<PagRow[]> {
  const PAGE = 1000
  const all: PagRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('pagamentos')
      .select('data_pagamento, tipo, metodo, valor, taxa, valor_liquido, is_seguradora, contrato_id, contratos!inner(unidade_id)')
      .eq('contratos.unidade_id', unidadeId)
      .gte('data_pagamento', ymd(from))
      .lte('data_pagamento', ymd(to))
      .order('data_pagamento', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) { console.error('[FinanceiroTab]', error); break }
    const rows = (data ?? []) as unknown as PagRow[]
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}

// Receita direta exclui seguradora (FLOW §3.2) — ela aparece à parte
function aggregate(rows: PagRow[]): Agg {
  const acc: Agg = { ...AGG_ZERO, metodos: {} }
  const contratos = new Set<string>()
  for (const r of rows) {
    const valor = r.valor ?? 0
    if (r.is_seguradora) { acc.seguradora += valor; continue }
    acc.bruto += valor
    acc.liquido += r.valor_liquido ?? valor
    acc.taxas += r.taxa ?? 0
    if (r.tipo === 'catalogo') acc.catalogo += valor
    else acc.plano += valor
    acc.metodos[r.metodo] = (acc.metodos[r.metodo] ?? 0) + valor
    acc.nPagamentos++
    contratos.add(r.contrato_id)
  }
  acc.nContratos = contratos.size
  return acc
}

type SerieBucket = { key: string; label: string; plano: number; catalogo: number }

// Série temporal: diária até ~2 meses, mensal acima (buckets vazios preenchidos)
function buildSerie(rows: PagRow[], from: Date, to: Date): SerieBucket[] {
  const spanDays = Math.round((to.getTime() - from.getTime()) / 86_400_000)
  const monthly = spanDays > 62
  const buckets = new Map<string, SerieBucket>()

  const cursor = new Date(from.getFullYear(), from.getMonth(), monthly ? 1 : from.getDate())
  while (cursor <= to) {
    const key = monthly ? ymd(cursor).slice(0, 7) : ymd(cursor)
    const label = monthly
      ? cursor.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '')
      : cursor.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    buckets.set(key, { key, label, plano: 0, catalogo: 0 })
    if (monthly) cursor.setMonth(cursor.getMonth() + 1)
    else cursor.setDate(cursor.getDate() + 1)
  }

  for (const r of rows) {
    if (r.is_seguradora) continue
    const key = monthly ? r.data_pagamento.slice(0, 7) : r.data_pagamento
    const b = buckets.get(key)
    if (!b) continue
    const valor = r.valor ?? 0
    if (r.tipo === 'catalogo') b.catalogo += valor
    else b.plano += valor
  }
  return Array.from(buckets.values())
}

export default function FinanceiroTab({ range, comparePrev }: Props) {
  const { currentUnit } = useUnit()
  const [rows, setRows] = useState<PagRow[]>([])
  const [prevAgg, setPrevAgg] = useState<Agg>(AGG_ZERO)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentUnit) return
    const supabase = createClient()
    let cancelled = false
    setLoading(true)

    const prev = computePreviousRange(range)
    Promise.all([
      fetchPagamentos(supabase, currentUnit.id, range.from, range.to),
      comparePrev
        ? fetchPagamentos(supabase, currentUnit.id, prev.from, prev.to).then(aggregate)
        : Promise.resolve(AGG_ZERO),
    ]).then(([curr, prevA]) => {
      if (cancelled) return
      setRows(curr)
      setPrevAgg(prevA)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [range.key, range.from.getTime(), range.to.getTime(), comparePrev, currentUnit?.id])

  const agg = useMemo(() => aggregate(rows), [rows])
  const serie = useMemo(() => buildSerie(rows, range.from, range.to), [rows, range.from.getTime(), range.to.getTime()])

  const ticket = agg.nContratos > 0 ? agg.bruto / agg.nContratos : 0
  const prevTicket = prevAgg.nContratos > 0 ? prevAgg.bruto / prevAgg.nContratos : 0
  const totalTipos = agg.plano + agg.catalogo
  const pctPlano = totalTipos > 0 ? Math.round((agg.plano / totalTipos) * 100) : 0
  const pctCatalogo = totalTipos > 0 ? 100 - pctPlano : 0
  const maxMetodo = Math.max(0, ...METODO_META.map(m => agg.metodos[m.key] ?? 0))

  function renderDelta(curr: number, prev: number) {
    if (!comparePrev) return null
    const delta = curr - prev
    if (Math.round(delta) === 0) return <span className="text-[10px] text-[var(--surface-400)]">—</span>
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

  if (loading) {
    return (
      <div className="card p-8 text-center text-3xl text-[var(--surface-300)]">…</div>
    )
  }

  if (agg.nPagamentos === 0 && agg.seguradora === 0) {
    return (
      <div className="card p-8 text-center text-sm text-[var(--surface-400)]">
        Sem pagamentos no período (por data de pagamento)
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Faturamento */}
        <div className="card p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs uppercase tracking-wide text-[var(--surface-500)]">Faturamento</span>
            {renderDelta(agg.bruto, prevAgg.bruto)}
          </div>
          <div className="font-mono text-3xl sm:text-4xl font-bold text-[var(--surface-800)] tabular-nums leading-none">
            R$&nbsp;<AnimatedNumber value={Math.round(agg.bruto)} />
          </div>
          <div className="mt-3 space-y-0.5 text-[11px] text-[var(--surface-500)]">
            <div>Líquido de taxas: <span className="font-mono text-[var(--surface-600)]">{fmtBRL(agg.liquido)}</span></div>
            <div>Taxas de cartão: <span className="font-mono text-[var(--surface-600)]">{fmtBRL(agg.taxas)}</span></div>
            {agg.seguradora > 0 && (
              <div>+ Seguradora (fora da receita): <span className="font-mono text-[var(--surface-600)]">{fmtBRL(agg.seguradora)}</span></div>
            )}
          </div>
        </div>

        {/* Ticket médio */}
        <div className="card p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs uppercase tracking-wide text-[var(--surface-500)]">Ticket médio</span>
            {renderDelta(ticket, prevTicket)}
          </div>
          <div className="font-mono text-3xl sm:text-4xl font-bold text-[var(--surface-800)] tabular-nums leading-none">
            R$&nbsp;<AnimatedNumber value={Math.round(ticket)} />
          </div>
          <div className="mt-3 text-[11px] text-[var(--surface-500)]">
            {agg.nContratos.toLocaleString('pt-BR')} contrato{agg.nContratos === 1 ? '' : 's'} com pagamento ·{' '}
            {agg.nPagamentos.toLocaleString('pt-BR')} pagamento{agg.nPagamentos === 1 ? '' : 's'}
          </div>
        </div>

        {/* Planos vs Catálogo */}
        <div className="card p-6 sm:p-8">
          <div className="text-xs uppercase tracking-wide text-[var(--surface-500)] mb-4">Planos × Catálogo</div>
          {totalTipos === 0 ? (
            <div className="text-sm text-[var(--surface-400)] py-6 text-center">Sem dados no período</div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR_PLANO }} />
                    <span className="text-[11px] text-[var(--surface-500)] font-medium">Planos</span>
                    {renderDelta(agg.plano, prevAgg.plano)}
                  </div>
                  <div className="font-mono text-xl sm:text-2xl font-bold text-[var(--surface-800)] tabular-nums leading-none">
                    {fmtBRL(agg.plano)}
                    <span className="text-xs font-normal text-[var(--surface-400)] ml-1">({pctPlano}%)</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end mb-1">
                    {renderDelta(agg.catalogo, prevAgg.catalogo)}
                    <span className="text-[11px] text-[var(--surface-500)] font-medium">Catálogo</span>
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR_CATALOGO }} />
                  </div>
                  <div className="font-mono text-xl sm:text-2xl font-bold text-[var(--surface-800)] tabular-nums leading-none">
                    {fmtBRL(agg.catalogo)}
                    <span className="text-xs font-normal text-[var(--surface-400)] ml-1">({pctCatalogo}%)</span>
                  </div>
                </div>
              </div>
              <div className="flex h-2.5 rounded-full overflow-hidden bg-[var(--surface-200)] gap-[2px]">
                <div className="transition-all duration-700 rounded-l-full" style={{ width: `${pctPlano}%`, background: COLOR_PLANO }} />
                <div className="transition-all duration-700 rounded-r-full" style={{ width: `${pctCatalogo}%`, background: COLOR_CATALOGO }} />
              </div>
            </>
          )}
        </div>

        {/* Métodos de pagamento */}
        <div className="card p-6 sm:p-8">
          <div className="text-xs uppercase tracking-wide text-[var(--surface-500)] mb-4">Métodos de pagamento</div>
          <div className="space-y-2.5">
            {METODO_META.map(m => {
              const valor = agg.metodos[m.key] ?? 0
              const pct = agg.bruto > 0 ? Math.round((valor / agg.bruto) * 100) : 0
              const width = maxMetodo > 0 ? (valor / maxMetodo) * 100 : 0
              return (
                <div key={m.key}>
                  <div className="flex items-center justify-between text-[11px] mb-0.5">
                    <span className="flex items-center gap-1.5 text-[var(--surface-600)] font-medium">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: m.color }} />
                      {m.label}
                    </span>
                    <span className="font-mono text-[var(--surface-600)]">{fmtBRL(valor)} <span className="text-[var(--surface-400)]">({pct}%)</span></span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--surface-200)] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${width}%`, background: m.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Série temporal */}
      <div className="card p-4 sm:p-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div className="text-xs uppercase tracking-wide text-[var(--surface-500)]">
            Faturamento por {serie.length > 0 && serie[0].key.length === 7 ? 'mês' : 'dia'}
            <span className="normal-case tracking-normal text-[var(--surface-400)]"> · por data de pagamento</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-[var(--surface-500)]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR_PLANO }} /> Planos
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR_CATALOGO }} /> Catálogo
            </span>
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serie} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <CartesianGrid vertical={false} stroke="var(--surface-200)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'var(--surface-500)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--surface-300)' }}
                interval="preserveStartEnd"
                minTickGap={16}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--surface-500)' }}
                tickFormatter={fmtCompact}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip
                cursor={{ fill: 'var(--surface-200)', opacity: 0.4 }}
                contentStyle={{
                  background: 'var(--surface-0)',
                  border: '1px solid var(--surface-300)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'var(--surface-800)',
                }}
                formatter={(value, name) => [
                  fmtBRL2(Number(value ?? 0)),
                  name === 'plano' ? 'Planos' : 'Catálogo',
                ]}
              />
              <Bar dataKey="plano" stackId="fat" fill={COLOR_PLANO} maxBarSize={40} />
              <Bar dataKey="catalogo" stackId="fat" fill={COLOR_CATALOGO} maxBarSize={40} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
