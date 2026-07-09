'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import AnimatedNumber from './AnimatedNumber'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { computePreviousRange, type PeriodRange } from '@/lib/dashboard-period'
import { filtroModo, STATUS_REMOVIDO, type DashboardModo } from '@/lib/dashboard-modo'

type Props = {
  range: PeriodRange
  comparePrev: boolean
  modo: DashboardModo
}

// Paleta validada (dataviz: CVD + contraste 3:1 nas superfícies claro #fff e escuro #1e293b)
const COLOR_PLANO    = '#2a78d6' // azul
const COLOR_CATALOGO = '#c98500' // âmbar
const COLOR_RECEBIDO = '#199e70' // verde
const COLOR_ABERTO   = '#c98500' // âmbar (atenção)
const METODO_META: { key: string; label: string; color: string }[] = [
  { key: 'pix',      label: 'Pix',      color: '#199e70' },
  { key: 'credito',  label: 'Crédito',  color: '#8b5cf6' },
  { key: 'debito',   label: 'Débito',   color: '#2a78d6' },
  { key: 'dinheiro', label: 'Dinheiro', color: '#c98500' },
]

// Regime de COMPETÊNCIA: a base são os CONTRATOS do período (data de corte segue o
// toggle Remoções/Contratos — data_acolhimento ou data_contrato). "Vendido" usa a
// mesma fórmula do detalhe do contrato (calcFinanceiroProtocolo):
//   plano líquido      = valor_plano − desconto_plano_unificado
//   acessórios líquido = valor_acessorios − desconto_acessorios − desconto_acessorios_ajuste
// "Recebido" = TODOS os pagamentos desses contratos (mesmo pagos fora do período;
// inclui seguradora, que quita saldo). "Em aberto" = Σ max(0, vendido − pago) por contrato.

type ContratoRow = {
  id: string
  codigo: string | null
  pet_nome: string | null
  tutor_nome: string | null
  valor_plano: number | null
  desconto_plano_unificado: number | null
  valor_acessorios: number | null
  desconto_acessorios: number | null
  desconto_acessorios_ajuste: number | null
  data_contrato: string | null
  data_acolhimento: string | null
}

type PendenteItem = {
  id: string
  codigo: string | null
  pet_nome: string | null
  tutor_nome: string | null
  saldo: number
}

type PagRow = {
  contrato_id: string
  valor: number | null
  metodo: string
  is_seguradora: boolean
}

type Agg = {
  vendido: number
  vendidoPlano: number
  vendidoCatalogo: number
  bruto: number
  descontos: number
  recebido: number
  recebidoSeguradora: number
  emAberto: number
  pendentes: PendenteItem[]
  metodos: Record<string, number>
  nContratos: number
}

const AGG_ZERO: Agg = {
  vendido: 0, vendidoPlano: 0, vendidoCatalogo: 0, bruto: 0, descontos: 0,
  recebido: 0, recebidoSeguradora: 0, emAberto: 0, pendentes: [],
  metodos: {}, nContratos: 0,
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

function vendidoPlanoDe(c: ContratoRow): number {
  return (c.valor_plano || 0) - (c.desconto_plano_unificado || 0)
}
function vendidoCatalogoDe(c: ContratoRow): number {
  return (c.valor_acessorios || 0) - (c.desconto_acessorios || 0) - (c.desconto_acessorios_ajuste || 0)
}

// Contratos do período conforme o modo (mesma base dos KPIs operacionais), paginado
async function fetchContratos(
  supabase: ReturnType<typeof createClient>,
  unidadeId: string,
  modo: DashboardModo,
  from: Date,
  to: Date,
): Promise<ContratoRow[]> {
  const PAGE = 1000
  const all: ContratoRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const base = supabase
      .from('contratos')
      .select('id, codigo, pet_nome, tutor_nome, valor_plano, desconto_plano_unificado, valor_acessorios, desconto_acessorios, desconto_acessorios_ajuste, data_contrato, data_acolhimento')
      .eq('unidade_id', unidadeId)
      .range(offset, offset + PAGE - 1)
    const { data, error } = await filtroModo(base, modo, from, to)
    if (error) { console.error('[FinanceiroTab] contratos', error); break }
    const rows = (data ?? []) as ContratoRow[]
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}

// TODOS os pagamentos dos contratos do período (mesmo pagos em outro mês).
// Filtro replica o filtroModo com prefixo no embed contratos!inner.
async function fetchPagamentosDosContratos(
  supabase: ReturnType<typeof createClient>,
  unidadeId: string,
  modo: DashboardModo,
  from: Date,
  to: Date,
): Promise<PagRow[]> {
  const PAGE = 1000
  const all: PagRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    // Mesmo recorte do filtroModo, com prefixo 'contratos.' (filtro no embed !inner)
    const base = supabase
      .from('pagamentos')
      .select('contrato_id, valor, metodo, is_seguradora, contratos!inner(id)')
      .eq('contratos.unidade_id', unidadeId)
      .range(offset, offset + PAGE - 1)
    const query = modo === 'contratos'
      ? base
          .gte('contratos.data_contrato', ymd(from))
          .lte('contratos.data_contrato', ymd(to))
      : base
          .in('contratos.status', STATUS_REMOVIDO)
          .gte('contratos.data_acolhimento', from.toISOString())
          .lte('contratos.data_acolhimento', to.toISOString())
    const { data, error } = await query
    if (error) { console.error('[FinanceiroTab] pagamentos', error); break }
    const rows = (data ?? []) as unknown as PagRow[]
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}

function aggregate(contratos: ContratoRow[], pagamentos: PagRow[]): Agg {
  const acc: Agg = { ...AGG_ZERO, metodos: {}, pendentes: [] }
  const pagoPorContrato = new Map<string, number>()
  for (const p of pagamentos) {
    const valor = p.valor ?? 0
    acc.recebido += valor
    if (p.is_seguradora) acc.recebidoSeguradora += valor
    acc.metodos[p.metodo] = (acc.metodos[p.metodo] ?? 0) + valor
    pagoPorContrato.set(p.contrato_id, (pagoPorContrato.get(p.contrato_id) ?? 0) + valor)
  }
  for (const c of contratos) {
    const plano = vendidoPlanoDe(c)
    const catalogo = vendidoCatalogoDe(c)
    acc.vendidoPlano += plano
    acc.vendidoCatalogo += catalogo
    acc.bruto += (c.valor_plano || 0) + (c.valor_acessorios || 0)
    const saldo = Math.max(0, plano + catalogo - (pagoPorContrato.get(c.id) ?? 0))
    acc.emAberto += saldo
    if (saldo > 0.005) {
      acc.pendentes.push({ id: c.id, codigo: c.codigo, pet_nome: c.pet_nome, tutor_nome: c.tutor_nome, saldo })
    }
  }
  acc.pendentes.sort((a, b) => b.saldo - a.saldo)
  acc.vendido = acc.vendidoPlano + acc.vendidoCatalogo
  acc.descontos = acc.bruto - acc.vendido
  acc.nContratos = contratos.length
  return acc
}

type SerieBucket = { key: string; label: string; plano: number; catalogo: number }

// Série temporal do vendido, pela data de corte do modo: diária até ~2 meses, mensal acima
function buildSerie(contratos: ContratoRow[], modo: DashboardModo, from: Date, to: Date): SerieBucket[] {
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

  for (const c of contratos) {
    const dataCorte = modo === 'contratos' ? c.data_contrato : c.data_acolhimento
    if (!dataCorte) continue
    const dia = dataCorte.slice(0, 10)
    const b = buckets.get(monthly ? dia.slice(0, 7) : dia)
    if (!b) continue
    b.plano += vendidoPlanoDe(c)
    b.catalogo += vendidoCatalogoDe(c)
  }
  return Array.from(buckets.values())
}

export default function FinanceiroTab({ range, comparePrev, modo }: Props) {
  const { currentUnit } = useUnit()
  const [contratos, setContratos] = useState<ContratoRow[]>([])
  const [pagamentos, setPagamentos] = useState<PagRow[]>([])
  const [prevAgg, setPrevAgg] = useState<Agg>(AGG_ZERO)
  const [loading, setLoading] = useState(true)
  const [pendentesAberto, setPendentesAberto] = useState(false)

  useEffect(() => {
    if (!currentUnit) return
    const supabase = createClient()
    let cancelled = false
    setLoading(true)

    const prev = computePreviousRange(range)
    Promise.all([
      fetchContratos(supabase, currentUnit.id, modo, range.from, range.to),
      fetchPagamentosDosContratos(supabase, currentUnit.id, modo, range.from, range.to),
      comparePrev
        ? Promise.all([
            fetchContratos(supabase, currentUnit.id, modo, prev.from, prev.to),
            fetchPagamentosDosContratos(supabase, currentUnit.id, modo, prev.from, prev.to),
          ]).then(([c, p]) => aggregate(c, p))
        : Promise.resolve(AGG_ZERO),
    ]).then(([currC, currP, prevA]) => {
      if (cancelled) return
      setContratos(currC)
      setPagamentos(currP)
      setPrevAgg(prevA)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [range.key, range.from.getTime(), range.to.getTime(), comparePrev, modo, currentUnit?.id])

  const agg = useMemo(() => aggregate(contratos, pagamentos), [contratos, pagamentos])
  const serie = useMemo(
    () => buildSerie(contratos, modo, range.from, range.to),
    [contratos, modo, range.from.getTime(), range.to.getTime()]
  )

  const ticket = agg.nContratos > 0 ? agg.vendido / agg.nContratos : 0
  const prevTicket = prevAgg.nContratos > 0 ? prevAgg.vendido / prevAgg.nContratos : 0
  const pctPlano = agg.vendido > 0 ? Math.round((agg.vendidoPlano / agg.vendido) * 100) : 0
  const pctCatalogo = agg.vendido > 0 ? 100 - pctPlano : 0
  const totalRecAberto = agg.recebido + agg.emAberto
  const pctRecebido = totalRecAberto > 0 ? Math.round((agg.recebido / totalRecAberto) * 100) : 0
  const maxMetodo = Math.max(0, ...METODO_META.map(m => agg.metodos[m.key] ?? 0))
  const dataCorteLabel = modo === 'contratos' ? 'data de contrato' : 'data de acolhimento'

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

  if (agg.nContratos === 0) {
    return (
      <div className="card p-8 text-center text-sm text-[var(--surface-400)]">
        Sem contratos no período (por {dataCorteLabel})
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Vendido no período (competência) */}
        <div className="card p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs uppercase tracking-wide text-[var(--surface-500)]">Vendido no período</span>
            {renderDelta(agg.vendido, prevAgg.vendido)}
          </div>
          <div className="font-mono text-3xl sm:text-4xl font-bold text-[var(--surface-800)] tabular-nums leading-none">
            R$&nbsp;<AnimatedNumber value={Math.round(agg.vendido)} />
          </div>
          <div className="mt-3 space-y-0.5 text-[11px] text-[var(--surface-500)]">
            <div>Bruto: <span className="font-mono text-[var(--surface-600)]">{fmtBRL(agg.bruto)}</span></div>
            <div>Descontos: <span className="font-mono text-[var(--surface-600)]">{fmtBRL(agg.descontos)}</span></div>
            <div className="text-[var(--surface-400)]">Contratos do período, por {dataCorteLabel}</div>
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
            Vendido ÷ {agg.nContratos.toLocaleString('pt-BR')} contrato{agg.nContratos === 1 ? '' : 's'} do período
          </div>
        </div>

        {/* Planos × Catálogo */}
        <div className="card p-6 sm:p-8">
          <div className="text-xs uppercase tracking-wide text-[var(--surface-500)] mb-4">Planos × Catálogo</div>
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR_PLANO }} />
                <span className="text-[11px] text-[var(--surface-500)] font-medium">Planos</span>
                {renderDelta(agg.vendidoPlano, prevAgg.vendidoPlano)}
              </div>
              <div className="font-mono text-xl sm:text-2xl font-bold text-[var(--surface-800)] tabular-nums leading-none">
                {fmtBRL(agg.vendidoPlano)}
                <span className="text-xs font-normal text-[var(--surface-400)] ml-1">({pctPlano}%)</span>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 justify-end mb-1">
                {renderDelta(agg.vendidoCatalogo, prevAgg.vendidoCatalogo)}
                <span className="text-[11px] text-[var(--surface-500)] font-medium">Catálogo</span>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR_CATALOGO }} />
              </div>
              <div className="font-mono text-xl sm:text-2xl font-bold text-[var(--surface-800)] tabular-nums leading-none">
                {fmtBRL(agg.vendidoCatalogo)}
                <span className="text-xs font-normal text-[var(--surface-400)] ml-1">({pctCatalogo}%)</span>
              </div>
            </div>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-[var(--surface-200)] gap-[2px]">
            <div className="transition-all duration-700 rounded-l-full" style={{ width: `${pctPlano}%`, background: COLOR_PLANO }} />
            <div className="transition-all duration-700 rounded-r-full" style={{ width: `${pctCatalogo}%`, background: COLOR_CATALOGO }} />
          </div>
        </div>

        {/* Recebido × Em aberto */}
        <div className="card p-6 sm:p-8">
          <div className="text-xs uppercase tracking-wide text-[var(--surface-500)] mb-4">Recebido × Em aberto</div>
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR_RECEBIDO }} />
                <span className="text-[11px] text-[var(--surface-500)] font-medium">Recebido</span>
                {renderDelta(agg.recebido, prevAgg.recebido)}
              </div>
              <div className="font-mono text-xl sm:text-2xl font-bold text-[var(--surface-800)] tabular-nums leading-none">
                {fmtBRL(agg.recebido)}
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 justify-end mb-1">
                <span className="text-[11px] text-[var(--surface-500)] font-medium">Em aberto</span>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR_ABERTO }} />
              </div>
              <div className="font-mono text-xl sm:text-2xl font-bold text-[var(--surface-800)] tabular-nums leading-none">
                {fmtBRL(agg.emAberto)}
              </div>
            </div>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-[var(--surface-200)] gap-[2px]">
            <div className="transition-all duration-700 rounded-l-full" style={{ width: `${pctRecebido}%`, background: COLOR_RECEBIDO }} />
            <div className="transition-all duration-700 rounded-r-full" style={{ width: `${100 - pctRecebido}%`, background: COLOR_ABERTO }} />
          </div>
          <div className="mt-2 text-[11px] text-[var(--surface-500)]">
            {agg.pendentes.length > 0 ? (
              <button
                onClick={() => setPendentesAberto(v => !v)}
                className="inline-flex items-center gap-1 font-medium text-[var(--surface-600)] hover:text-[var(--surface-800)] transition-colors"
              >
                {pendentesAberto ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {agg.pendentes.length.toLocaleString('pt-BR')} contrato{agg.pendentes.length === 1 ? '' : 's'} com saldo em aberto
              </button>
            ) : 'Nenhum saldo em aberto'}
            {agg.recebidoSeguradora > 0 && <> · inclui seguradora {fmtBRL(agg.recebidoSeguradora)}</>}
          </div>
          {pendentesAberto && agg.pendentes.length > 0 && (
            <ul className="mt-2 max-h-44 overflow-y-auto divide-y divide-[var(--surface-200)] rounded-lg border border-[var(--surface-200)]">
              {agg.pendentes.map(p => (
                <li key={p.id}>
                  <Link
                    href={`/contratos/${p.id}`}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] hover:bg-[var(--surface-100)] transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-[var(--surface-700)]">
                        {p.pet_nome || '(sem pet)'}
                        <span className="font-normal text-[var(--surface-400)]"> · {p.tutor_nome || '(sem tutor)'}</span>
                      </span>
                      {p.codigo && <span className="block font-mono text-[10px] text-[var(--surface-400)] truncate">{p.codigo}</span>}
                    </span>
                    <span className="font-mono font-semibold tabular-nums shrink-0" style={{ color: COLOR_ABERTO }}>
                      {fmtBRL2(p.saldo)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Série temporal do vendido */}
        <div className="card p-4 sm:p-6 xl:col-span-2">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <div className="text-xs uppercase tracking-wide text-[var(--surface-500)]">
              Vendido por {serie.length > 0 && serie[0].key.length === 7 ? 'mês' : 'dia'}
              <span className="normal-case tracking-normal text-[var(--surface-400)]"> · por {dataCorteLabel}</span>
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
                <Bar dataKey="plano" stackId="vend" fill={COLOR_PLANO} maxBarSize={40} />
                <Bar dataKey="catalogo" stackId="vend" fill={COLOR_CATALOGO} maxBarSize={40} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Métodos de pagamento (dos pagamentos desses contratos) */}
        <div className="card p-6 sm:p-8">
          <div className="text-xs uppercase tracking-wide text-[var(--surface-500)] mb-1">Métodos de pagamento</div>
          <div className="text-[11px] text-[var(--surface-400)] mb-4">Como os contratos do período pagaram</div>
          <div className="space-y-2.5">
            {METODO_META.map(m => {
              const valor = agg.metodos[m.key] ?? 0
              const pct = agg.recebido > 0 ? Math.round((valor / agg.recebido) * 100) : 0
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
    </div>
  )
}
