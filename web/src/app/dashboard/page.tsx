'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  LayoutDashboard, TrendingUp, Users, FileText, Boxes, DollarSign,
  Calendar, Filter, Building2, MapPin, CreditCard, PawPrint, Flame,
  ArrowRight, Clock, ChevronDown
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/Skeleton'
import ChartCard from '@/components/dashboard/ChartCard'
import MiniKPI from '@/components/dashboard/MiniKPI'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from 'recharts'

// ============================================
// Types
// ============================================
type Contrato = {
  id: string
  status: string
  tipo_cremacao: string | null
  tipo_plano: string | null
  data_contrato: string | null
  created_at: string
  valor_plano: number | null
  custo_cremacao: number | null
  pet_especie: string | null
  pet_peso: number | null
  tutor_cidade: string | null
  tutor_bairro: string | null
  fonte_conhecimento_id: string | null
  estabelecimento_id: string | null
  seguradora: string | null
  velorio_deseja: boolean | null
}

type Pagamento = {
  id: string
  contrato_id: string
  tipo: string
  metodo: string
  valor: number
  valor_liquido: number | null
  data_pagamento: string | null
  is_seguradora: boolean | null
  parcelas: number | null
}

type FonteConhecimento = { id: string; nome: string }
type Estabelecimento = { id: string; nome: string }

type Periodo = '7d' | '30d' | '90d' | '12m' | 'all'
type DrillView = null | 'cremacao' | 'plano' | 'clinicas' | 'fontes' | 'pagamentos' | 'cidades' | 'especies'

// ============================================
// Constants
// ============================================
const STATUS_CARDS = [
  { key: 'ativo', label: 'Ativos', sublabel: 'Santos', color: 'border-l-red-500', bgIcon: 'bg-red-900/30', textIcon: 'text-red-400', textValue: 'text-red-400' },
  { key: 'pinda', label: 'Em Pinda', sublabel: 'Crematorio', color: 'border-l-orange-500', bgIcon: 'bg-orange-900/30', textIcon: 'text-orange-400', textValue: 'text-orange-400' },
  { key: 'retorno', label: 'Retorno', sublabel: 'Cinzas prontas', color: 'border-l-cyan-500', bgIcon: 'bg-cyan-900/30', textIcon: 'text-cyan-400', textValue: 'text-cyan-400' },
  { key: 'preventivo', label: 'Preventivos', sublabel: 'Pet vivo', color: 'border-l-amber-500', bgIcon: 'bg-amber-900/30', textIcon: 'text-amber-400', textValue: 'text-amber-400' },
  { key: 'pendente', label: 'Pendentes', sublabel: 'Acao necessaria', color: 'border-l-purple-500', bgIcon: 'bg-purple-900/30', textIcon: 'text-purple-400', textValue: 'text-purple-400' },
  { key: 'finalizado', label: 'Finalizados', sublabel: 'Concluidos', color: 'border-l-gray-400', bgIcon: 'bg-slate-700/50', textIcon: 'text-slate-400', textValue: 'text-slate-400' },
]

const CHART_COLORS = {
  primary: '#8b5cf6',
  secondary: '#06b6d4',
  tertiary: '#f59e0b',
  quaternary: '#ef4444',
  quinary: '#10b981',
  senary: '#ec4899',
  gradient1: '#7c3aed',
  gradient2: '#a78bfa',
}

const PIE_COLORS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#ec4899', '#6366f1', '#14b8a6']

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: '12m', label: '12 meses' },
  { key: 'all', label: 'Tudo' },
]

const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// ============================================
// Helpers
// ============================================
function formatCurrency(value: number): string {
  if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(1)}k`
  return `R$ ${value.toFixed(0)}`
}

function formatCurrencyFull(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function getDateFromPeriod(periodo: Periodo): Date | null {
  const now = new Date()
  switch (periodo) {
    case '7d': return new Date(now.getTime() - 7 * 86400000)
    case '30d': return new Date(now.getTime() - 30 * 86400000)
    case '90d': return new Date(now.getTime() - 90 * 86400000)
    case '12m': return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
    case 'all': return null
  }
}

function getContratoDate(c: Contrato): string {
  return c.data_contrato || c.created_at?.split('T')[0] || ''
}

// ============================================
// Custom Tooltip
// ============================================
function ChartTooltip({ active, payload, label, formatter }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
  formatter?: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--surface-0)] border border-[var(--surface-200)] rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-[var(--surface-700)] mb-1.5">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: entry.color }} />
          <span className="text-[var(--surface-500)]">{entry.name}:</span>
          <span className="font-semibold text-mono text-[var(--surface-800)]">
            {formatter ? formatter(entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) {
  if (percent < 0.05) return null
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {name} {(percent * 100).toFixed(0)}%
    </text>
  )
}

// ============================================
// Main Component
// ============================================
export default function DashboardPage() {
  const supabase = createClient()

  // Raw data
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [fontes, setFontes] = useState<FonteConhecimento[]>([])
  const [estabelecimentos, setEstabelecimentos] = useState<Estabelecimento[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [periodo, setPeriodo] = useState<Periodo>('12m')
  const [drillView, setDrillView] = useState<DrillView>(null)
  const [periodoOpen, setPeriodoOpen] = useState(false)

  // ============================================
  // Data Loading
  // ============================================
  useEffect(() => {
    async function loadAll() {
      const [
        { data: contratosData },
        { data: pagamentosData },
        { data: fontesData },
        { data: estabsData },
      ] = await Promise.all([
        supabase.from('contratos').select('id,status,tipo_cremacao,tipo_plano,data_contrato,created_at,valor_plano,custo_cremacao,pet_especie,pet_peso,tutor_cidade,tutor_bairro,fonte_conhecimento_id,estabelecimento_id,seguradora,velorio_deseja'),
        supabase.from('pagamentos').select('id,contrato_id,tipo,metodo,valor,valor_liquido,data_pagamento,is_seguradora,parcelas'),
        supabase.from('fontes_conhecimento').select('id,nome'),
        supabase.from('estabelecimentos').select('id,nome'),
      ])

      setContratos((contratosData || []) as Contrato[])
      setPagamentos((pagamentosData || []) as Pagamento[])
      setFontes((fontesData || []) as FonteConhecimento[])
      setEstabelecimentos((estabsData || []) as Estabelecimento[])
      setLoading(false)
    }
    loadAll()
  }, [])

  // ============================================
  // Filtered Data
  // ============================================
  const filteredContratos = useMemo(() => {
    const minDate = getDateFromPeriod(periodo)
    if (!minDate) return contratos
    const minStr = minDate.toISOString().split('T')[0]
    return contratos.filter(c => {
      const d = getContratoDate(c)
      return d >= minStr
    })
  }, [contratos, periodo])

  const filteredPagamentos = useMemo(() => {
    const minDate = getDateFromPeriod(periodo)
    if (!minDate) return pagamentos
    const minStr = minDate.toISOString().split('T')[0]
    return pagamentos.filter(p => {
      const d = p.data_pagamento || ''
      return d >= minStr
    })
  }, [pagamentos, periodo])

  // Previous period for trend calculation
  const prevContratos = useMemo(() => {
    const minDate = getDateFromPeriod(periodo)
    if (!minDate) return []
    const periodMs = Date.now() - minDate.getTime()
    const prevMin = new Date(minDate.getTime() - periodMs).toISOString().split('T')[0]
    const prevMax = minDate.toISOString().split('T')[0]
    return contratos.filter(c => {
      const d = getContratoDate(c)
      return d >= prevMin && d < prevMax
    })
  }, [contratos, periodo])

  const prevPagamentos = useMemo(() => {
    const minDate = getDateFromPeriod(periodo)
    if (!minDate) return []
    const periodMs = Date.now() - minDate.getTime()
    const prevMin = new Date(minDate.getTime() - periodMs).toISOString().split('T')[0]
    const prevMax = minDate.toISOString().split('T')[0]
    return pagamentos.filter(p => {
      const d = p.data_pagamento || ''
      return d >= prevMin && d < prevMax
    })
  }, [pagamentos, periodo])

  // ============================================
  // Computed Metrics
  // ============================================
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    contratos.forEach(c => {
      counts[c.status] = (counts[c.status] || 0) + 1
    })
    return counts
  }, [contratos])

  const calcTrend = useCallback((current: number, previous: number): number | null => {
    if (periodo === 'all') return null
    if (previous === 0) return current > 0 ? 100 : 0
    return Math.round(((current - previous) / previous) * 100)
  }, [periodo])

  // Financial KPIs
  const kpis = useMemo(() => {
    const receitaBruta = filteredPagamentos.reduce((s, p) => s + (p.valor || 0), 0)
    const receitaLiquida = filteredPagamentos.reduce((s, p) => s + (p.valor_liquido || p.valor || 0), 0)
    const custoCremacao = filteredContratos.reduce((s, c) => s + (c.custo_cremacao || 0), 0)
    const resultado = receitaLiquida - custoCremacao
    const totalContratos = filteredContratos.length
    const ticketMedio = totalContratos > 0 ? receitaBruta / totalContratos : 0

    // Pending (contratos sem pagamento)
    const contratoIdsComPgto = new Set(filteredPagamentos.map(p => p.contrato_id))
    const contratosAtivos = filteredContratos.filter(c => !['finalizado', 'preventivo'].includes(c.status))
    const contratosSemPgto = contratosAtivos.filter(c => !contratoIdsComPgto.has(c.id))
    const valorPendente = contratosSemPgto.reduce((s, c) => s + (c.valor_plano || 0), 0)

    // Previous period
    const prevReceita = prevPagamentos.reduce((s, p) => s + (p.valor || 0), 0)
    const prevTotal = prevContratos.length

    return {
      receitaBruta,
      receitaLiquida,
      custoCremacao,
      resultado,
      totalContratos,
      ticketMedio,
      valorPendente,
      contratosSemPgto: contratosSemPgto.length,
      trendReceita: calcTrend(receitaBruta, prevReceita),
      trendVolume: calcTrend(totalContratos, prevTotal),
    }
  }, [filteredContratos, filteredPagamentos, prevContratos, prevPagamentos, calcTrend])

  // ============================================
  // Chart Data Generators
  // ============================================

  // 1. Evolucao Mensal (Area Chart)
  const evolucaoMensal = useMemo(() => {
    const byMonth: Record<string, { contratos: number; receita: number; individual: number; coletiva: number }> = {}

    filteredContratos.forEach(c => {
      const d = getContratoDate(c)
      if (!d) return
      const key = d.slice(0, 7) // YYYY-MM
      if (!byMonth[key]) byMonth[key] = { contratos: 0, receita: 0, individual: 0, coletiva: 0 }
      byMonth[key].contratos++
      byMonth[key].receita += c.valor_plano || 0
      if (c.tipo_cremacao === 'individual') byMonth[key].individual++
      else byMonth[key].coletiva++
    })

    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => {
        const [y, m] = key.split('-')
        return {
          name: `${MESES_CURTO[parseInt(m) - 1]}/${y.slice(2)}`,
          Contratos: val.contratos,
          Receita: val.receita,
          Individual: val.individual,
          Coletiva: val.coletiva,
        }
      })
  }, [filteredContratos])

  // 2. IND vs COL (Donut)
  const cremacaoData = useMemo(() => {
    const ind = filteredContratos.filter(c => c.tipo_cremacao === 'individual').length
    const col = filteredContratos.filter(c => c.tipo_cremacao === 'coletiva').length
    return [
      { name: 'Individual', value: ind, color: CHART_COLORS.primary },
      { name: 'Coletiva', value: col, color: CHART_COLORS.secondary },
    ].filter(d => d.value > 0)
  }, [filteredContratos])

  // 3. EM vs PV (Donut)
  const planoData = useMemo(() => {
    const em = filteredContratos.filter(c => c.tipo_plano === 'emergencial').length
    const pv = filteredContratos.filter(c => c.tipo_plano === 'preventivo').length
    return [
      { name: 'Emergencial', value: em, color: CHART_COLORS.quaternary },
      { name: 'Preventivo', value: pv, color: CHART_COLORS.tertiary },
    ].filter(d => d.value > 0)
  }, [filteredContratos])

  // 4. Top Clinicas (Bar horizontal)
  const topClinicas = useMemo(() => {
    const byEstab: Record<string, number> = {}
    filteredContratos.forEach(c => {
      if (c.estabelecimento_id) {
        byEstab[c.estabelecimento_id] = (byEstab[c.estabelecimento_id] || 0) + 1
      }
    })
    return Object.entries(byEstab)
      .map(([id, count]) => ({
        name: estabelecimentos.find(e => e.id === id)?.nome || 'Desconhecido',
        Indicacoes: count,
      }))
      .sort((a, b) => b.Indicacoes - a.Indicacoes)
      .slice(0, 10)
  }, [filteredContratos, estabelecimentos])

  // 5. Fontes de Conhecimento (Donut)
  const fontesData = useMemo(() => {
    const byFonte: Record<string, number> = {}
    filteredContratos.forEach(c => {
      if (c.fonte_conhecimento_id) {
        byFonte[c.fonte_conhecimento_id] = (byFonte[c.fonte_conhecimento_id] || 0) + 1
      }
    })
    return Object.entries(byFonte)
      .map(([id, count]) => ({
        name: fontes.find(f => f.id === id)?.nome || 'Outro',
        value: count,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [filteredContratos, fontes])

  // 6. Metodos de Pagamento (Bar)
  const pagamentoMetodos = useMemo(() => {
    const byMetodo: Record<string, { count: number; valor: number }> = {}
    filteredPagamentos.forEach(p => {
      if (!byMetodo[p.metodo]) byMetodo[p.metodo] = { count: 0, valor: 0 }
      byMetodo[p.metodo].count++
      byMetodo[p.metodo].valor += p.valor || 0
    })

    const labels: Record<string, string> = { pix: 'PIX', dinheiro: 'Dinheiro', credito: 'Credito', debito: 'Debito' }
    return Object.entries(byMetodo)
      .map(([metodo, data]) => ({
        name: labels[metodo] || metodo,
        Quantidade: data.count,
        Valor: data.valor,
      }))
      .sort((a, b) => b.Valor - a.Valor)
  }, [filteredPagamentos])

  // 7. Distribuicao por Cidade (Bar)
  const cidadesData = useMemo(() => {
    const byCidade: Record<string, number> = {}
    filteredContratos.forEach(c => {
      const cidade = c.tutor_cidade?.trim() || 'N/A'
      byCidade[cidade] = (byCidade[cidade] || 0) + 1
    })
    return Object.entries(byCidade)
      .map(([name, Contratos]) => ({ name, Contratos }))
      .sort((a, b) => b.Contratos - a.Contratos)
      .slice(0, 8)
  }, [filteredContratos])

  // 8. Especies (Donut)
  const especiesData = useMemo(() => {
    const byEspecie: Record<string, number> = {}
    filteredContratos.forEach(c => {
      const esp = c.pet_especie || 'n/a'
      byEspecie[esp] = (byEspecie[esp] || 0) + 1
    })
    const labels: Record<string, string> = { canina: 'Canina', felina: 'Felina', exotica: 'Exotica' }
    return Object.entries(byEspecie)
      .map(([esp, count]) => ({ name: labels[esp] || esp, value: count }))
      .sort((a, b) => b.value - a.value)
  }, [filteredContratos])

  // 9. Faixa de Peso (Bar)
  const pesoData = useMemo(() => {
    const faixas = [
      { label: '0-5 kg', min: 0, max: 5 },
      { label: '5-10 kg', min: 5, max: 10 },
      { label: '10-20 kg', min: 10, max: 20 },
      { label: '20-40 kg', min: 20, max: 40 },
      { label: '40+ kg', min: 40, max: 999 },
    ]
    const counts = faixas.map(f => ({
      name: f.label,
      Pets: filteredContratos.filter(c => c.pet_peso && c.pet_peso >= f.min && c.pet_peso < f.max).length,
    }))
    return counts.filter(c => c.Pets > 0)
  }, [filteredContratos])

  // 10. Seguradora vs Particular
  const seguradoraData = useMemo(() => {
    const seg = filteredContratos.filter(c => c.seguradora).length
    const part = filteredContratos.filter(c => !c.seguradora).length
    return [
      { name: 'Particular', value: part, color: CHART_COLORS.primary },
      { name: 'Seguradora', value: seg, color: CHART_COLORS.quinary },
    ].filter(d => d.value > 0)
  }, [filteredContratos])

  // 11. Receita por tipo (plano vs catalogo)
  const receitaPorTipo = useMemo(() => {
    const plano = filteredPagamentos.filter(p => p.tipo === 'plano').reduce((s, p) => s + (p.valor || 0), 0)
    const catalogo = filteredPagamentos.filter(p => p.tipo === 'catalogo').reduce((s, p) => s + (p.valor || 0), 0)
    return [
      { name: 'Planos', value: plano, color: CHART_COLORS.primary },
      { name: 'Catalogo', value: catalogo, color: CHART_COLORS.tertiary },
    ].filter(d => d.value > 0)
  }, [filteredPagamentos])

  // ============================================
  // Drill-down handler
  // ============================================
  function toggleDrill(view: DrillView) {
    setDrillView(prev => prev === view ? null : view)
  }

  // ============================================
  // Render
  // ============================================
  return (
    <div className="animate-fade-in pb-8">
      {/* Header + Period Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-[var(--brand-700)]/20 items-center justify-center">
            <LayoutDashboard className="h-5 w-5 text-[var(--brand-500)]" />
          </div>
          <div>
            <h1 className="text-title text-[var(--shell-text)]">Dashboard</h1>
            <p className="text-small text-[var(--shell-text-muted)]">Visao geral do CRM</p>
          </div>
        </div>

        {/* Period Selector */}
        <div className="relative">
          {/* Mobile: dropdown */}
          <div className="sm:hidden">
            <button
              onClick={() => setPeriodoOpen(!periodoOpen)}
              className="btn-secondary text-sm flex items-center gap-2 w-full justify-between"
            >
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {PERIODOS.find(p => p.key === periodo)?.label}
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${periodoOpen ? 'rotate-180' : ''}`} />
            </button>
            {periodoOpen && (
              <div className="absolute right-0 mt-1 w-full bg-[var(--surface-0)] border border-[var(--surface-200)] rounded-lg shadow-lg z-10 overflow-hidden">
                {PERIODOS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => { setPeriodo(p.key); setPeriodoOpen(false) }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      periodo === p.key
                        ? 'bg-[var(--brand-500)] text-white font-semibold'
                        : 'text-[var(--surface-600)] hover:bg-[var(--surface-50)]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Desktop: pill buttons */}
          <div className="hidden sm:flex items-center gap-1 bg-[var(--surface-0)] border border-[var(--surface-200)] rounded-lg p-1">
            <Filter className="h-3.5 w-3.5 text-[var(--surface-400)] ml-2 mr-1" />
            {PERIODOS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriodo(p.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  periodo === p.key
                    ? 'bg-[var(--brand-500)] text-white shadow-sm'
                    : 'text-[var(--surface-500)] hover:text-[var(--surface-700)] hover:bg-[var(--surface-50)]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ========== ROW 1: Status Pipeline ========== */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3 mb-6 stagger-children">
        {STATUS_CARDS.map(card => (
          <Link
            key={card.key}
            href={`/contratos?status=${card.key}`}
            className={`card card-hover p-3 md:p-4 border-l-4 ${card.color}`}
          >
            <p className="text-[10px] md:text-caption text-[var(--surface-400)] mb-0.5 md:mb-1 truncate">{card.label}</p>
            {loading ? (
              <Skeleton className="h-7 w-10" />
            ) : (
              <p className={`text-xl md:text-display text-mono ${card.textValue}`}>
                {statusCounts[card.key] || 0}
              </p>
            )}
            <p className="text-[9px] md:text-xs text-[var(--surface-400)] mt-0.5 hidden md:block">{card.sublabel}</p>
          </Link>
        ))}
      </div>

      {/* ========== ROW 2: Financial KPIs ========== */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6 stagger-children">
        <MiniKPI
          label="Receita Bruta"
          value={loading ? '...' : formatCurrency(kpis.receitaBruta)}
          trend={kpis.trendReceita}
          trendLabel="vs periodo ant."
          icon={<DollarSign className="h-4 w-4" />}
          color="#10b981"
        />
        <MiniKPI
          label="Contratos"
          value={loading ? '...' : String(kpis.totalContratos)}
          trend={kpis.trendVolume}
          trendLabel="vs periodo ant."
          icon={<FileText className="h-4 w-4" />}
          color="#8b5cf6"
        />
        <MiniKPI
          label="Ticket Medio"
          value={loading ? '...' : formatCurrency(kpis.ticketMedio)}
          icon={<TrendingUp className="h-4 w-4" />}
          color="#06b6d4"
        />
        <MiniKPI
          label="Pgto Pendente"
          value={loading ? '...' : formatCurrency(kpis.valorPendente)}
          icon={<Clock className="h-4 w-4" />}
          color="#f59e0b"
          onClick={() => {}}
        />
        <MiniKPI
          label="Resultado"
          value={loading ? '...' : formatCurrency(kpis.resultado)}
          icon={<Flame className="h-4 w-4" />}
          color={kpis.resultado >= 0 ? '#10b981' : '#ef4444'}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-5">
              <Skeleton className="h-4 w-32 mb-4" />
              <Skeleton className="h-48 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* ========== ROW 3: Evolucao Mensal (full width) ========== */}
          <div className="mb-4">
            <ChartCard
              title="Evolucao Mensal"
              subtitle={`${filteredContratos.length} contratos no periodo`}
              expandable
            >
              <div className="h-64 md:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={evolucaoMensal} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradContratos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradReceita" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.quinary} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS.quinary} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-200)" strokeOpacity={0.5} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--surface-400)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--surface-400)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="Contratos" stroke={CHART_COLORS.primary} fill="url(#gradContratos)" strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />
                    <Area type="monotone" dataKey="Individual" stroke={CHART_COLORS.secondary} fill="none" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                    <Area type="monotone" dataKey="Coletiva" stroke={CHART_COLORS.tertiary} fill="none" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          {/* ========== ROW 4: Breakdown Donuts ========== */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {/* IND vs COL */}
            <ChartCard
              title="Tipo de Cremacao"
              subtitle="Individual vs Coletiva"
              action={
                <button onClick={() => toggleDrill('cremacao')} className="text-[10px] text-[var(--brand-400)] hover:text-[var(--brand-300)] font-medium flex items-center gap-0.5">
                  Detalhes <ArrowRight className="h-3 w-3" />
                </button>
              }
            >
              <div className="h-44">
                {cremacaoData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={cremacaoData}
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                        labelLine={false}
                        label={PieLabel}
                      >
                        {cremacaoData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-[var(--surface-400)]">Sem dados</div>
                )}
              </div>
              {drillView === 'cremacao' && (
                <div className="mt-2 pt-2 border-t border-[var(--surface-200)] space-y-1 animate-slide-up">
                  {cremacaoData.map(d => {
                    const pct = filteredContratos.length > 0 ? ((d.value / filteredContratos.length) * 100).toFixed(1) : '0'
                    return (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                          <span className="text-[var(--surface-600)]">{d.name}</span>
                        </div>
                        <span className="text-mono font-semibold text-[var(--surface-700)]">{d.value} ({pct}%)</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </ChartCard>

            {/* EM vs PV */}
            <ChartCard
              title="Tipo de Plano"
              subtitle="Emergencial vs Preventivo"
              action={
                <button onClick={() => toggleDrill('plano')} className="text-[10px] text-[var(--brand-400)] hover:text-[var(--brand-300)] font-medium flex items-center gap-0.5">
                  Detalhes <ArrowRight className="h-3 w-3" />
                </button>
              }
            >
              <div className="h-44">
                {planoData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={planoData}
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                        labelLine={false}
                        label={PieLabel}
                      >
                        {planoData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-[var(--surface-400)]">Sem dados</div>
                )}
              </div>
              {drillView === 'plano' && (
                <div className="mt-2 pt-2 border-t border-[var(--surface-200)] space-y-1 animate-slide-up">
                  {planoData.map(d => {
                    const pct = filteredContratos.length > 0 ? ((d.value / filteredContratos.length) * 100).toFixed(1) : '0'
                    return (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                          <span className="text-[var(--surface-600)]">{d.name}</span>
                        </div>
                        <span className="text-mono font-semibold text-[var(--surface-700)]">{d.value} ({pct}%)</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </ChartCard>

            {/* Especies */}
            <ChartCard
              title="Especies"
              subtitle="Distribuicao de pets"
              action={
                <button onClick={() => toggleDrill('especies')} className="text-[10px] text-[var(--brand-400)] hover:text-[var(--brand-300)] font-medium flex items-center gap-0.5">
                  Detalhes <ArrowRight className="h-3 w-3" />
                </button>
              }
            >
              <div className="h-44">
                {especiesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={especiesData}
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                        labelLine={false}
                        label={PieLabel}
                      >
                        {especiesData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-[var(--surface-400)]">Sem dados</div>
                )}
              </div>
              {drillView === 'especies' && (
                <div className="mt-2 pt-2 border-t border-[var(--surface-200)] space-y-1 animate-slide-up">
                  {especiesData.map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i] }} />
                        <span className="text-[var(--surface-600)]">{d.name}</span>
                      </div>
                      <span className="text-mono font-semibold text-[var(--surface-700)]">{d.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </ChartCard>

            {/* Seguradora vs Particular */}
            <ChartCard
              title="Seguradora vs Particular"
              subtitle="Origem do pagamento"
            >
              <div className="h-44">
                {seguradoraData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={seguradoraData}
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                        labelLine={false}
                        label={PieLabel}
                      >
                        {seguradoraData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-[var(--surface-400)]">Sem dados</div>
                )}
              </div>
            </ChartCard>
          </div>

          {/* ========== ROW 5: Bar Charts ========== */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Top Clinicas */}
            <ChartCard
              title="Top Clinicas Indicadoras"
              subtitle={`${topClinicas.length} estabelecimentos com indicacoes`}
              expandable
              action={
                <Link href="/contratos" className="text-[10px] text-[var(--brand-400)] hover:text-[var(--brand-300)] font-medium flex items-center gap-0.5">
                  Ver todos <ArrowRight className="h-3 w-3" />
                </Link>
              }
            >
              <div className="h-64">
                {topClinicas.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topClinicas} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-200)" strokeOpacity={0.5} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--surface-400)' }} axisLine={false} tickLine={false} />
                      <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10, fill: 'var(--surface-500)' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="Indicacoes" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-[var(--surface-400)]">Sem dados de clinicas</div>
                )}
              </div>
            </ChartCard>

            {/* Metodos de Pagamento */}
            <ChartCard
              title="Metodos de Pagamento"
              subtitle="Volume e valor por metodo"
              expandable
            >
              <div className="h-64">
                {pagamentoMetodos.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pagamentoMetodos} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-200)" strokeOpacity={0.5} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--surface-400)' }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--surface-400)' }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--surface-400)' }} axisLine={false} tickLine={false} tickFormatter={formatCurrency} />
                      <Tooltip content={<ChartTooltip formatter={v => formatCurrencyFull(v)} />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar yAxisId="left" dataKey="Quantidade" fill={CHART_COLORS.secondary} radius={[4, 4, 0, 0]} barSize={24} />
                      <Bar yAxisId="right" dataKey="Valor" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-[var(--surface-400)]">Sem pagamentos</div>
                )}
              </div>
            </ChartCard>
          </div>

          {/* ========== ROW 6: Geography + Sources ========== */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Distribuicao por Cidade */}
            <ChartCard
              title="Distribuicao por Cidade"
              subtitle="Onde estao os tutores"
              expandable
            >
              <div className="h-56">
                {cidadesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cidadesData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-200)" strokeOpacity={0.5} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--surface-400)' }} axisLine={false} tickLine={false} angle={-20} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--surface-400)' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="Contratos" radius={[4, 4, 0, 0]} barSize={28}>
                        {cidadesData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-[var(--surface-400)]">Sem dados</div>
                )}
              </div>
            </ChartCard>

            {/* Fontes de Conhecimento */}
            <ChartCard
              title="Como nos Conheceram"
              subtitle="Canais de aquisicao"
              expandable
            >
              <div className="h-56 flex items-center">
                {fontesData.length > 0 ? (
                  <div className="w-full flex flex-col md:flex-row items-center gap-4">
                    <div className="w-40 h-40 flex-shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={fontesData}
                            innerRadius={30}
                            outerRadius={60}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {fontesData.map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
                            ))}
                          </Pie>
                          <Tooltip content={<ChartTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-1.5 w-full">
                      {fontesData.map((d, i) => {
                        const total = fontesData.reduce((s, f) => s + f.value, 0)
                        const pct = total > 0 ? (d.value / total * 100) : 0
                        return (
                          <div key={d.name} className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i] }} />
                            <span className="text-xs text-[var(--surface-600)] flex-1 truncate">{d.name}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-[var(--surface-100)] overflow-hidden hidden md:block">
                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: PIE_COLORS[i] }} />
                              </div>
                              <span className="text-mono text-xs font-semibold text-[var(--surface-700)] w-8 text-right">{d.value}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="w-full text-center text-sm text-[var(--surface-400)]">Sem dados</div>
                )}
              </div>
            </ChartCard>
          </div>

          {/* ========== ROW 7: Secondary insights ========== */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Faixa de Peso */}
            <ChartCard title="Faixa de Peso" subtitle="Distribuicao dos pets">
              <div className="h-44">
                {pesoData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pesoData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-200)" strokeOpacity={0.5} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--surface-400)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--surface-400)' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="Pets" fill={CHART_COLORS.secondary} radius={[4, 4, 0, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-[var(--surface-400)]">Sem dados</div>
                )}
              </div>
            </ChartCard>

            {/* Receita: Planos vs Catalogo */}
            <ChartCard title="Receita por Tipo" subtitle="Planos vs Catalogo">
              <div className="h-44">
                {receitaPorTipo.length > 0 ? (
                  <div className="h-full flex items-center justify-center gap-6">
                    <div className="w-32 h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={receitaPorTipo}
                            innerRadius={35}
                            outerRadius={55}
                            paddingAngle={3}
                            dataKey="value"
                            labelLine={false}
                          >
                            {receitaPorTipo.map((entry, i) => (
                              <Cell key={i} fill={entry.color} stroke="none" />
                            ))}
                          </Pie>
                          <Tooltip content={<ChartTooltip formatter={formatCurrencyFull} />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-3">
                      {receitaPorTipo.map(d => (
                        <div key={d.name}>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                            <span className="text-xs text-[var(--surface-500)]">{d.name}</span>
                          </div>
                          <p className="text-sm font-bold text-mono text-[var(--surface-800)] ml-[18px]">
                            {formatCurrencyFull(d.value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-[var(--surface-400)]">Sem dados</div>
                )}
              </div>
            </ChartCard>

            {/* Quick Links */}
            <div className="card p-4 md:p-5 flex flex-col justify-between">
              <h3 className="text-sm font-semibold text-[var(--surface-700)] mb-3">Acesso Rapido</h3>
              <div className="space-y-2 flex-1">
                {[
                  { href: '/contratos', icon: FileText, label: 'Contratos', count: contratos.length, color: 'text-[var(--brand-500)]' },
                  { href: '/tutores', icon: Users, label: 'Tutores', count: null, color: 'text-blue-400' },
                  { href: '/estoque', icon: Boxes, label: 'Estoque', count: null, color: 'text-amber-400' },
                  { href: '/fichas', icon: PawPrint, label: 'Fichas', count: null, color: 'text-green-400' },
                  { href: '/supindas', icon: Flame, label: 'Supindas', count: null, color: 'text-orange-400' },
                ].map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-[var(--surface-50)] transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className={`h-4 w-4 ${item.color}`} />
                      <span className="text-sm text-[var(--surface-600)] group-hover:text-[var(--surface-800)]">{item.label}</span>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-[var(--surface-300)] group-hover:text-[var(--surface-500)] transition-colors" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
