'use client'

import { useState, useMemo } from 'react'
import {
  Building2, Clock, UserCheck, PawPrint, Package, Heart,
  ArrowUpDown, ChevronDown, ChevronRight, Zap, Eye
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  PieChart, Pie
} from 'recharts'
import ChartCard from './ChartCard'

// ============================================
// Types (shared with dashboard)
// ============================================
export type ContratoFull = {
  id: string
  status: string
  tipo_cremacao: string | null
  tipo_plano: string | null
  data_contrato: string | null
  data_acolhimento: string | null
  created_at: string
  valor_plano: number | null
  custo_cremacao: number | null
  pet_especie: string | null
  pet_peso: number | null
  tutor_cidade: string | null
  tutor_bairro: string | null
  fonte_conhecimento_id: string | null
  estabelecimento_id: string | null
  funcionario_id: string | null
  seguradora: string | null
  velorio_deseja: boolean | null
  pelinho_quer: boolean | null
  pelinho_feito: boolean | null
  acompanhamento_online: boolean | null
  acompanhamento_presencial: boolean | null
}

export type PagamentoFull = {
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

export type ContratoProduto = {
  id: string
  contrato_id: string
  produto_id: string
  valor: number | null
  desconto: number | null
  rescaldo_feito: boolean | null
}

export type Produto = {
  id: string
  nome: string
  tipo: string
  preco: number | null
}

export type Funcionario = { id: string; nome: string }
export type FonteConhecimento = { id: string; nome: string }
export type Estabelecimento = { id: string; nome: string }

type Props = {
  contratos: ContratoFull[]
  pagamentos: PagamentoFull[]
  contratoProdutos: ContratoProduto[]
  produtos: Produto[]
  funcionarios: Funcionario[]
  fontes: FonteConhecimento[]
  estabelecimentos: Estabelecimento[]
}

type InsightTab = 'clinicas' | 'horarios' | 'equipe' | 'recordacoes' | 'urnas' | 'comportamento'

const TABS: { key: InsightTab; label: string; icon: typeof Building2; mobileLabel: string }[] = [
  { key: 'clinicas', label: 'Clinicas', icon: Building2, mobileLabel: 'Clinicas' },
  { key: 'horarios', label: 'Horarios', icon: Clock, mobileLabel: 'Horarios' },
  { key: 'equipe', label: 'Equipe', icon: UserCheck, mobileLabel: 'Equipe' },
  { key: 'recordacoes', label: 'Recordacoes', icon: Heart, mobileLabel: 'Record.' },
  { key: 'urnas', label: 'Urnas & Upsell', icon: Package, mobileLabel: 'Urnas' },
  { key: 'comportamento', label: 'Comportamento', icon: Eye, mobileLabel: 'Comport.' },
]

const PIE_COLORS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#ec4899', '#6366f1', '#14b8a6']
const BAR_COLORS = { ind: '#8b5cf6', col: '#06b6d4', total: '#8b5cf6' }

function formatCurrency(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatCurrencyShort(v: number): string {
  if (v >= 1000) return `R$${(v / 1000).toFixed(1)}k`
  return `R$${v.toFixed(0)}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SimpleTooltip({ active, payload, label, isCurrency }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--surface-0)] border border-[var(--surface-200)] rounded-lg shadow-lg p-2.5 text-xs">
      <p className="font-semibold text-[var(--surface-700)] mb-1">{label}</p>
      {payload.map((e: { name: string; value: number; color: string }, i: number) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-full" style={{ background: e.color }} />
          <span className="text-[var(--surface-500)]">{e.name}:</span>
          <span className="font-semibold text-mono text-[var(--surface-800)]">
            {isCurrency ? formatCurrency(e.value) : e.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ============================================
// Component
// ============================================
export default function DashboardInsights({ contratos, pagamentos, contratoProdutos, produtos, funcionarios, fontes, estabelecimentos }: Props) {
  const [activeTab, setActiveTab] = useState<InsightTab>('clinicas')
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="mt-6">
      {/* Section header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 mb-4 group cursor-pointer"
      >
        <div className="w-8 h-8 rounded-lg bg-amber-900/30 flex items-center justify-center">
          <Zap className="h-4 w-4 text-amber-400" />
        </div>
        <div>
          <h2 className="text-subtitle text-[var(--shell-text)] flex items-center gap-2">
            Insights de Inteligencia
            {expanded ? <ChevronDown className="h-4 w-4 text-[var(--surface-400)]" /> : <ChevronRight className="h-4 w-4 text-[var(--surface-400)]" />}
          </h2>
        </div>
      </button>

      {!expanded ? null : (
        <div className="animate-slide-up">
          {/* Tabs */}
          <div className="flex gap-1 mb-4 overflow-x-auto scrollbar-hide pb-1">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.key
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'bg-[var(--surface-0)] border border-[var(--surface-200)] text-[var(--surface-500)] hover:text-[var(--surface-700)] hover:border-[var(--surface-300)]'
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.mobileLabel}</span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="animate-fade-in">
            {activeTab === 'clinicas' && <ClinicasInsight contratos={contratos} pagamentos={pagamentos} estabelecimentos={estabelecimentos} />}
            {activeTab === 'horarios' && <HorariosInsight contratos={contratos} />}
            {activeTab === 'equipe' && <EquipeInsight contratos={contratos} pagamentos={pagamentos} funcionarios={funcionarios} />}
            {activeTab === 'recordacoes' && <RecordacoesInsight contratos={contratos} contratoProdutos={contratoProdutos} produtos={produtos} />}
            {activeTab === 'urnas' && <UrnasInsight contratos={contratos} contratoProdutos={contratoProdutos} produtos={produtos} />}
            {activeTab === 'comportamento' && <ComportamentoInsight contratos={contratos} pagamentos={pagamentos} fontes={fontes} estabelecimentos={estabelecimentos} />}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// 1. CLINICAS INSIGHT
// ============================================
type ClinicaSort = 'volume' | 'receita' | 'ticket' | 'individual' | 'coletiva'

function ClinicasInsight({ contratos, pagamentos, estabelecimentos }: {
  contratos: ContratoFull[]
  pagamentos: PagamentoFull[]
  estabelecimentos: Estabelecimento[]
}) {
  const [sortBy, setSortBy] = useState<ClinicaSort>('volume')
  const [showAll, setShowAll] = useState(false)

  const data = useMemo(() => {
    const byEstab: Record<string, { nome: string; total: number; ind: number; col: number; receita: number; em: number; pv: number }> = {}

    contratos.forEach(c => {
      if (!c.estabelecimento_id) return
      if (!byEstab[c.estabelecimento_id]) {
        const nome = estabelecimentos.find(e => e.id === c.estabelecimento_id)?.nome || '???'
        byEstab[c.estabelecimento_id] = { nome, total: 0, ind: 0, col: 0, receita: 0, em: 0, pv: 0 }
      }
      const e = byEstab[c.estabelecimento_id]
      e.total++
      if (c.tipo_cremacao === 'individual') e.ind++
      else e.col++
      if (c.tipo_plano === 'emergencial') e.em++
      else e.pv++
    })

    // Add receita from pagamentos
    const receitaPorContrato: Record<string, number> = {}
    pagamentos.forEach(p => {
      receitaPorContrato[p.contrato_id] = (receitaPorContrato[p.contrato_id] || 0) + (p.valor || 0)
    })
    contratos.forEach(c => {
      if (c.estabelecimento_id && byEstab[c.estabelecimento_id]) {
        byEstab[c.estabelecimento_id].receita += receitaPorContrato[c.id] || 0
      }
    })

    let list = Object.values(byEstab).map(e => ({
      ...e,
      ticket: e.total > 0 ? e.receita / e.total : 0,
      pctInd: e.total > 0 ? Math.round((e.ind / e.total) * 100) : 0,
      pctCol: e.total > 0 ? Math.round((e.col / e.total) * 100) : 0,
    }))

    switch (sortBy) {
      case 'volume': list.sort((a, b) => b.total - a.total); break
      case 'receita': list.sort((a, b) => b.receita - a.receita); break
      case 'ticket': list.sort((a, b) => b.ticket - a.ticket); break
      case 'individual': list.sort((a, b) => b.ind - a.ind); break
      case 'coletiva': list.sort((a, b) => b.col - a.col); break
    }

    return list
  }, [contratos, pagamentos, estabelecimentos, sortBy])

  const display = showAll ? data : data.slice(0, 10)
  const champion = data[0]

  return (
    <div className="space-y-4">
      {/* Sort buttons */}
      <div className="flex gap-1.5 flex-wrap">
        <span className="text-xs text-[var(--surface-400)] self-center mr-1">Ordenar:</span>
        {([
          { key: 'volume', label: 'Volume' },
          { key: 'receita', label: 'Receita' },
          { key: 'ticket', label: 'Ticket Medio' },
          { key: 'individual', label: 'Individual' },
          { key: 'coletiva', label: 'Coletiva' },
        ] as { key: ClinicaSort; label: string }[]).map(s => (
          <button
            key={s.key}
            onClick={() => setSortBy(s.key)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              sortBy === s.key
                ? 'bg-[var(--brand-500)] text-white'
                : 'bg-[var(--surface-50)] text-[var(--surface-500)] border border-[var(--surface-200)] hover:border-[var(--surface-300)]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Champion badge */}
      {champion && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-900/20 border border-amber-700/50">
          <span className="text-xl">🏆</span>
          <div>
            <p className="text-sm font-bold text-amber-400">{champion.nome}</p>
            <p className="text-xs text-[var(--surface-400)]">
              Lider em {sortBy === 'volume' ? 'volume' : sortBy === 'receita' ? 'receita' : sortBy === 'ticket' ? 'ticket medio' : sortBy === 'individual' ? 'individuais' : 'coletivas'}
              {' — '}{champion.total} contratos, {formatCurrency(champion.receita)} receita, ticket {formatCurrency(champion.ticket)}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--surface-200)]">
              <th className="text-left py-2 px-2 text-[var(--surface-400)] font-medium">#</th>
              <th className="text-left py-2 px-2 text-[var(--surface-400)] font-medium">Clinica</th>
              <th className="text-right py-2 px-2 text-[var(--surface-400)] font-medium cursor-pointer hover:text-[var(--surface-600)]" onClick={() => setSortBy('volume')}>
                Vol {sortBy === 'volume' && <ArrowUpDown className="inline h-3 w-3" />}
              </th>
              <th className="text-right py-2 px-2 text-[var(--surface-400)] font-medium cursor-pointer hover:text-[var(--surface-600)]" onClick={() => setSortBy('individual')}>
                IND {sortBy === 'individual' && <ArrowUpDown className="inline h-3 w-3" />}
              </th>
              <th className="text-right py-2 px-2 text-[var(--surface-400)] font-medium cursor-pointer hover:text-[var(--surface-600)]" onClick={() => setSortBy('coletiva')}>
                COL {sortBy === 'coletiva' && <ArrowUpDown className="inline h-3 w-3" />}
              </th>
              <th className="text-right py-2 px-2 text-[var(--surface-400)] font-medium cursor-pointer hover:text-[var(--surface-600)]" onClick={() => setSortBy('receita')}>
                Receita {sortBy === 'receita' && <ArrowUpDown className="inline h-3 w-3" />}
              </th>
              <th className="text-right py-2 px-2 text-[var(--surface-400)] font-medium cursor-pointer hover:text-[var(--surface-600)]" onClick={() => setSortBy('ticket')}>
                Ticket {sortBy === 'ticket' && <ArrowUpDown className="inline h-3 w-3" />}
              </th>
              <th className="py-2 px-2 text-[var(--surface-400)] font-medium hidden md:table-cell">IND/COL</th>
            </tr>
          </thead>
          <tbody>
            {display.map((row, i) => (
              <tr key={row.nome} className="border-b border-[var(--surface-100)] hover:bg-[var(--surface-50)] transition-colors">
                <td className="py-2 px-2 text-[var(--surface-400)] text-mono">{i + 1}</td>
                <td className="py-2 px-2 text-[var(--surface-700)] font-medium max-w-[160px] truncate">{row.nome}</td>
                <td className="py-2 px-2 text-right text-mono text-[var(--surface-800)] font-semibold">{row.total}</td>
                <td className="py-2 px-2 text-right text-mono text-purple-400">{row.ind}</td>
                <td className="py-2 px-2 text-right text-mono text-cyan-400">{row.col}</td>
                <td className="py-2 px-2 text-right text-mono text-green-400 font-semibold">{formatCurrencyShort(row.receita)}</td>
                <td className="py-2 px-2 text-right text-mono text-[var(--surface-600)]">{formatCurrencyShort(row.ticket)}</td>
                <td className="py-2 px-2 hidden md:table-cell">
                  <div className="flex h-2 rounded-full overflow-hidden w-20">
                    <div className="bg-purple-500 h-full" style={{ width: `${row.pctInd}%` }} title={`IND ${row.pctInd}%`} />
                    <div className="bg-cyan-500 h-full" style={{ width: `${row.pctCol}%` }} title={`COL ${row.pctCol}%`} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.length > 10 && (
        <button onClick={() => setShowAll(!showAll)} className="text-xs text-[var(--brand-400)] hover:text-[var(--brand-300)] font-medium">
          {showAll ? 'Ver menos' : `Ver todas (${data.length})`}
        </button>
      )}
    </div>
  )
}

// ============================================
// 2. HORARIOS INSIGHT
// ============================================
function HorariosInsight({ contratos }: { contratos: ContratoFull[] }) {
  const [view, setView] = useState<'periodo' | 'hora' | 'dia'>('periodo')

  const periodData = useMemo(() => {
    const periods = { 'Madrugada (00-06)': 0, 'Manha (06-12)': 0, 'Tarde (12-18)': 0, 'Noite (18-00)': 0 }
    const hourCounts = Array(24).fill(0)
    const dayCounts: Record<string, number> = { 'Dom': 0, 'Seg': 0, 'Ter': 0, 'Qua': 0, 'Qui': 0, 'Sex': 0, 'Sab': 0 }
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

    contratos.forEach(c => {
      const ts = c.data_acolhimento
      if (!ts) return
      const d = new Date(ts)
      const h = d.getHours()
      hourCounts[h]++
      if (h >= 0 && h < 6) periods['Madrugada (00-06)']++
      else if (h < 12) periods['Manha (06-12)']++
      else if (h < 18) periods['Tarde (12-18)']++
      else periods['Noite (18-00)']++
      dayCounts[dayNames[d.getDay()]]++
    })

    return {
      periods: Object.entries(periods).map(([name, Remocoes]) => ({ name, Remocoes })),
      hours: hourCounts.map((count, h) => ({ name: `${String(h).padStart(2, '0')}h`, Remocoes: count })).filter(h => h.Remocoes > 0),
      days: Object.entries(dayCounts).map(([name, Remocoes]) => ({ name, Remocoes })),
    }
  }, [contratos])

  const totalWithTimestamp = contratos.filter(c => c.data_acolhimento).length
  const peakPeriod = [...periodData.periods].sort((a, b) => b.Remocoes - a.Remocoes)[0]
  const peakHour = [...periodData.hours].sort((a, b) => b.Remocoes - a.Remocoes)[0]
  const peakDay = [...periodData.days].sort((a, b) => b.Remocoes - a.Remocoes)[0]

  const chartData = view === 'periodo' ? periodData.periods : view === 'hora' ? periodData.hours : periodData.days
  const periodColors: Record<string, string> = {
    'Madrugada (00-06)': '#6366f1',
    'Manha (06-12)': '#f59e0b',
    'Tarde (12-18)': '#ef4444',
    'Noite (18-00)': '#8b5cf6',
  }

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="flex gap-1.5">
        {([
          { key: 'periodo', label: 'Por Periodo' },
          { key: 'hora', label: 'Por Hora' },
          { key: 'dia', label: 'Por Dia da Semana' },
        ] as { key: typeof view; label: string }[]).map(v => (
          <button key={v.key} onClick={() => setView(v.key)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${view === v.key ? 'bg-amber-500 text-white' : 'bg-[var(--surface-50)] text-[var(--surface-500)] border border-[var(--surface-200)]'}`}>
            {v.label}
          </button>
        ))}
      </div>

      {/* Insights badges */}
      {totalWithTimestamp > 0 && (
        <div className="flex flex-wrap gap-2">
          {peakPeriod && peakPeriod.Remocoes > 0 && (
            <div className="px-3 py-1.5 rounded-lg bg-purple-900/20 border border-purple-700/50 text-xs">
              <span className="text-purple-400 font-semibold">Pico: </span>
              <span className="text-[var(--surface-600)]">{peakPeriod.name} ({peakPeriod.Remocoes} remocoes)</span>
            </div>
          )}
          {peakHour && peakHour.Remocoes > 0 && (
            <div className="px-3 py-1.5 rounded-lg bg-amber-900/20 border border-amber-700/50 text-xs">
              <span className="text-amber-400 font-semibold">Hora quente: </span>
              <span className="text-[var(--surface-600)]">{peakHour.name} ({peakHour.Remocoes})</span>
            </div>
          )}
          {peakDay && peakDay.Remocoes > 0 && (
            <div className="px-3 py-1.5 rounded-lg bg-cyan-900/20 border border-cyan-700/50 text-xs">
              <span className="text-cyan-400 font-semibold">Dia forte: </span>
              <span className="text-[var(--surface-600)]">{peakDay.name} ({peakDay.Remocoes})</span>
            </div>
          )}
          <div className="px-3 py-1.5 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)] text-xs text-[var(--surface-400)]">
            {totalWithTimestamp} remocoes com horario registrado
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="h-56">
        {chartData.some(d => d.Remocoes > 0) ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-200)" strokeOpacity={0.5} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--surface-400)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--surface-400)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<SimpleTooltip />} />
              <Bar dataKey="Remocoes" radius={[4, 4, 0, 0]} barSize={view === 'hora' ? 12 : 28}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={view === 'periodo' ? (periodColors[entry.name] || PIE_COLORS[i]) : PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-[var(--surface-400)]">
            Sem dados de horario de acolhimento (campo data_acolhimento)
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// 3. EQUIPE INSIGHT
// ============================================
function EquipeInsight({ contratos, pagamentos, funcionarios }: {
  contratos: ContratoFull[]
  pagamentos: PagamentoFull[]
  funcionarios: Funcionario[]
}) {
  const [metric, setMetric] = useState<'volume' | 'receita' | 'ticket'>('volume')

  const data = useMemo(() => {
    const byFunc: Record<string, { nome: string; total: number; ind: number; col: number; receita: number }> = {}

    const receitaPorContrato: Record<string, number> = {}
    pagamentos.forEach(p => {
      receitaPorContrato[p.contrato_id] = (receitaPorContrato[p.contrato_id] || 0) + (p.valor || 0)
    })

    contratos.forEach(c => {
      const fid = c.funcionario_id || '_sem'
      if (!byFunc[fid]) {
        const nome = fid === '_sem' ? 'Sem responsavel' : (funcionarios.find(f => f.id === fid)?.nome || '???')
        byFunc[fid] = { nome, total: 0, ind: 0, col: 0, receita: 0 }
      }
      byFunc[fid].total++
      if (c.tipo_cremacao === 'individual') byFunc[fid].ind++
      else byFunc[fid].col++
      byFunc[fid].receita += receitaPorContrato[c.id] || 0
    })

    return Object.values(byFunc)
      .map(f => ({ ...f, ticket: f.total > 0 ? f.receita / f.total : 0 }))
      .sort((a, b) => {
        if (metric === 'volume') return b.total - a.total
        if (metric === 'receita') return b.receita - a.receita
        return b.ticket - a.ticket
      })
  }, [contratos, pagamentos, funcionarios, metric])

  const chartData = data.map(d => ({
    name: d.nome.length > 15 ? d.nome.slice(0, 15) + '...' : d.nome,
    Individual: d.ind,
    Coletiva: d.col,
    Receita: d.receita,
    Ticket: d.ticket,
  }))

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {([
          { key: 'volume', label: 'Volume IND/COL' },
          { key: 'receita', label: 'Receita' },
          { key: 'ticket', label: 'Ticket Medio' },
        ] as { key: typeof metric; label: string }[]).map(m => (
          <button key={m.key} onClick={() => setMetric(m.key)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${metric === m.key ? 'bg-amber-500 text-white' : 'bg-[var(--surface-50)] text-[var(--surface-500)] border border-[var(--surface-200)]'}`}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {metric === 'volume' ? (
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-200)" strokeOpacity={0.5} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--surface-400)' }} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 10, fill: 'var(--surface-500)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<SimpleTooltip />} />
              <Bar dataKey="Individual" stackId="a" fill={BAR_COLORS.ind} barSize={18} />
              <Bar dataKey="Coletiva" stackId="a" fill={BAR_COLORS.col} radius={[0, 4, 4, 0]} barSize={18} />
            </BarChart>
          ) : (
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-200)" strokeOpacity={0.5} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--surface-400)' }} axisLine={false} tickLine={false} tickFormatter={formatCurrencyShort} />
              <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 10, fill: 'var(--surface-500)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<SimpleTooltip isCurrency />} />
              <Bar dataKey={metric === 'receita' ? 'Receita' : 'Ticket'} fill={metric === 'receita' ? '#10b981' : '#f59e0b'} radius={[0, 4, 4, 0]} barSize={18} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ============================================
// 4. RECORDACOES INSIGHT
// ============================================
function RecordacoesInsight({ contratos, contratoProdutos, produtos }: {
  contratos: ContratoFull[]
  contratoProdutos: ContratoProduto[]
  produtos: Produto[]
}) {
  // Pelinho analysis
  const pelinhoStats = useMemo(() => {
    const total = contratos.length
    const quer = contratos.filter(c => c.pelinho_quer === true).length
    const naoQuer = contratos.filter(c => c.pelinho_quer === false).length
    const indefinido = total - quer - naoQuer
    const feito = contratos.filter(c => c.pelinho_feito === true).length
    const pendente = quer - feito

    return { total, quer, naoQuer, indefinido, feito, pendente, pctQuer: total > 0 ? Math.round((quer / total) * 100) : 0 }
  }, [contratos])

  // Rescaldo products analysis
  const rescaldoStats = useMemo(() => {
    const rescaldoProdutos = produtos.filter(p => p.tipo === 'incluso')
    const rescaldoIds = new Set(rescaldoProdutos.map(p => p.id))
    const comRescaldo = new Set<string>()
    const rescaldoByTipo: Record<string, number> = {}

    contratoProdutos.forEach(cp => {
      if (rescaldoIds.has(cp.produto_id)) {
        comRescaldo.add(cp.contrato_id)
        const prod = rescaldoProdutos.find(p => p.id === cp.produto_id)
        if (prod) {
          rescaldoByTipo[prod.nome] = (rescaldoByTipo[prod.nome] || 0) + 1
        }
      }
    })

    const total = contratos.length
    const sem = total - comRescaldo.size

    return {
      com: comRescaldo.size,
      sem,
      pctCom: total > 0 ? Math.round((comRescaldo.size / total) * 100) : 0,
      byTipo: Object.entries(rescaldoByTipo)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
    }
  }, [contratos, contratoProdutos, produtos])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Pelinho */}
      <ChartCard title="Pelinho (Recordacao Padrao)" subtitle={`${pelinhoStats.pctQuer}% dos tutores querem`}>
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="w-28 h-28 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Quer', value: pelinhoStats.quer },
                      { name: 'Nao quer', value: pelinhoStats.naoQuer },
                      { name: 'Indefinido', value: pelinhoStats.indefinido },
                    ].filter(d => d.value > 0)}
                    innerRadius={25}
                    outerRadius={45}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    <Cell fill="#10b981" />
                    <Cell fill="#ef4444" />
                    <Cell fill="#64748b" />
                  </Pie>
                  <Tooltip content={<SimpleTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="text-[var(--surface-500)]">Quer:</span>
                <span className="text-mono font-bold text-[var(--surface-700)]">{pelinhoStats.quer}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="text-[var(--surface-500)]">Nao quer:</span>
                <span className="text-mono font-bold text-[var(--surface-700)]">{pelinhoStats.naoQuer}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                <span className="text-[var(--surface-500)]">Indefinido:</span>
                <span className="text-mono font-bold text-[var(--surface-700)]">{pelinhoStats.indefinido}</span>
              </div>
              {pelinhoStats.pendente > 0 && (
                <div className="pt-1 border-t border-[var(--surface-200)]">
                  <span className="text-amber-400 font-semibold">{pelinhoStats.pendente} pendente(s) de fazer</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </ChartCard>

      {/* Itens de Recordacao */}
      <ChartCard title="Recordacoes Adicionais" subtitle={`${rescaldoStats.pctCom}% tem alguma recordacao`}>
        <div className="space-y-3">
          {/* Com vs Sem */}
          <div className="flex gap-3">
            <div className="flex-1 p-2.5 rounded-lg bg-green-900/20 border border-green-700/50 text-center">
              <p className="text-lg font-bold text-mono text-green-400">{rescaldoStats.com}</p>
              <p className="text-[10px] text-[var(--surface-400)]">Com recordacao</p>
            </div>
            <div className="flex-1 p-2.5 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)] text-center">
              <p className="text-lg font-bold text-mono text-[var(--surface-500)]">{rescaldoStats.sem}</p>
              <p className="text-[10px] text-[var(--surface-400)]">Sem recordacao</p>
            </div>
          </div>

          {/* Breakdown by type */}
          {rescaldoStats.byTipo.length > 0 && (
            <div className="space-y-1.5">
              {rescaldoStats.byTipo.map((item, i) => {
                const maxVal = rescaldoStats.byTipo[0]?.value || 1
                return (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-[var(--surface-600)] flex-1 truncate">{item.name}</span>
                    <div className="w-16 h-1.5 rounded-full bg-[var(--surface-100)] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(item.value / maxVal) * 100}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    </div>
                    <span className="text-mono text-xs font-semibold text-[var(--surface-700)] w-6 text-right">{item.value}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </ChartCard>
    </div>
  )
}

// ============================================
// 5. URNAS & UPSELL INSIGHT
// ============================================
function UrnasInsight({ contratos, contratoProdutos, produtos }: {
  contratos: ContratoFull[]
  contratoProdutos: ContratoProduto[]
  produtos: Produto[]
}) {
  const stats = useMemo(() => {
    const urnaProdutos = produtos.filter(p => p.tipo === 'urna')
    const urnaIds = new Set(urnaProdutos.map(p => p.id))
    const acessorioProdutos = produtos.filter(p => p.tipo === 'acessorio')
    const acessorioIds = new Set(acessorioProdutos.map(p => p.id))

    let urnasGratis = 0
    let urnasPagas = 0
    let urnaReceitaTotal = 0
    let acessorioCount = 0
    let acessorioReceita = 0
    const urnaByNome: Record<string, { count: number; receita: number }> = {}
    const contratosComUrna = new Set<string>()
    const contratosComAcessorio = new Set<string>()

    contratoProdutos.forEach(cp => {
      if (urnaIds.has(cp.produto_id)) {
        contratosComUrna.add(cp.contrato_id)
        const val = cp.valor || 0
        if (val === 0) urnasGratis++
        else { urnasPagas++; urnaReceitaTotal += val }
        const nome = urnaProdutos.find(p => p.id === cp.produto_id)?.nome || '???'
        if (!urnaByNome[nome]) urnaByNome[nome] = { count: 0, receita: 0 }
        urnaByNome[nome].count++
        urnaByNome[nome].receita += val
      }
      if (acessorioIds.has(cp.produto_id)) {
        contratosComAcessorio.add(cp.contrato_id)
        acessorioCount++
        acessorioReceita += cp.valor || 0
      }
    })

    const totalContratos = contratos.length
    const semUrna = totalContratos - contratosComUrna.size
    const pctUpsell = (urnasGratis + urnasPagas) > 0 ? Math.round((urnasPagas / (urnasGratis + urnasPagas)) * 100) : 0
    const ticketUrna = urnasPagas > 0 ? urnaReceitaTotal / urnasPagas : 0
    const pctComAcessorio = totalContratos > 0 ? Math.round((contratosComAcessorio.size / totalContratos) * 100) : 0

    const topUrnas = Object.entries(urnaByNome)
      .map(([nome, d]) => ({ name: nome.length > 25 ? nome.slice(0, 25) + '...' : nome, Quantidade: d.count, Receita: d.receita }))
      .sort((a, b) => b.Quantidade - a.Quantidade)
      .slice(0, 8)

    return { urnasGratis, urnasPagas, urnaReceitaTotal, semUrna, pctUpsell, ticketUrna, topUrnas, acessorioCount, acessorioReceita, pctComAcessorio }
  }, [contratos, contratoProdutos, produtos])

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-green-900/20 border border-green-700/50 text-center">
          <p className="text-xs text-[var(--surface-400)] mb-1">Urnas Inclusas (R$0)</p>
          <p className="text-xl font-bold text-mono text-green-400">{stats.urnasGratis}</p>
        </div>
        <div className="p-3 rounded-lg bg-purple-900/20 border border-purple-700/50 text-center">
          <p className="text-xs text-[var(--surface-400)] mb-1">Urnas Pagas (upsell)</p>
          <p className="text-xl font-bold text-mono text-purple-400">{stats.urnasPagas}</p>
          <p className="text-[10px] text-amber-400 font-semibold mt-0.5">{stats.pctUpsell}% taxa upsell</p>
        </div>
        <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-700/50 text-center">
          <p className="text-xs text-[var(--surface-400)] mb-1">Ticket Medio Urna</p>
          <p className="text-xl font-bold text-mono text-amber-400">{formatCurrency(stats.ticketUrna)}</p>
        </div>
        <div className="p-3 rounded-lg bg-cyan-900/20 border border-cyan-700/50 text-center">
          <p className="text-xs text-[var(--surface-400)] mb-1">Acessorios</p>
          <p className="text-xl font-bold text-mono text-cyan-400">{stats.acessorioCount}</p>
          <p className="text-[10px] text-[var(--surface-400)]">{stats.pctComAcessorio}% dos contratos</p>
        </div>
      </div>

      {/* Revenue insight */}
      <div className="px-4 py-3 rounded-xl bg-amber-900/20 border border-amber-700/50 flex items-center gap-3">
        <span className="text-xl">💡</span>
        <p className="text-xs text-[var(--surface-600)]">
          <span className="text-amber-400 font-bold">Receita de upsell:</span>{' '}
          {formatCurrency(stats.urnaReceitaTotal)} em urnas pagas + {formatCurrency(stats.acessorioReceita)} em acessorios = {' '}
          <span className="text-mono font-bold text-green-400">{formatCurrency(stats.urnaReceitaTotal + stats.acessorioReceita)} total de upsell</span>
        </p>
      </div>

      {/* Top urnas chart */}
      {stats.topUrnas.length > 0 && (
        <ChartCard title="Urnas mais vendidas" subtitle="Quantidade e receita">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.topUrnas} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-200)" strokeOpacity={0.5} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--surface-400)' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 9, fill: 'var(--surface-500)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<SimpleTooltip />} />
                <Bar dataKey="Quantidade" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      )}
    </div>
  )
}

// ============================================
// 6. COMPORTAMENTO INSIGHT
// ============================================
function ComportamentoInsight({ contratos, pagamentos, fontes, estabelecimentos }: {
  contratos: ContratoFull[]
  pagamentos: PagamentoFull[]
  fontes: FonteConhecimento[]
  estabelecimentos: Estabelecimento[]
}) {
  // Velorio
  const velorioStats = useMemo(() => {
    const sim = contratos.filter(c => c.velorio_deseja === true).length
    const nao = contratos.filter(c => c.velorio_deseja === false).length
    const indef = contratos.length - sim - nao
    return [
      { name: 'Deseja', value: sim, color: '#10b981' },
      { name: 'Nao deseja', value: nao, color: '#ef4444' },
      { name: 'Indefinido', value: indef, color: '#64748b' },
    ].filter(d => d.value > 0)
  }, [contratos])

  // Acompanhamento
  const acompStats = useMemo(() => {
    const online = contratos.filter(c => c.acompanhamento_online).length
    const presencial = contratos.filter(c => c.acompanhamento_presencial).length
    const nenhum = contratos.filter(c => !c.acompanhamento_online && !c.acompanhamento_presencial).length
    return [
      { name: 'Online', value: online, color: '#8b5cf6' },
      { name: 'Presencial', value: presencial, color: '#f59e0b' },
      { name: 'Nenhum', value: nenhum, color: '#64748b' },
    ].filter(d => d.value > 0)
  }, [contratos])

  // Seguradora breakdown
  const seguradoraBreakdown = useMemo(() => {
    const bySeg: Record<string, number> = {}
    contratos.forEach(c => {
      if (c.seguradora) {
        const nome = c.seguradora.trim()
        bySeg[nome] = (bySeg[nome] || 0) + 1
      }
    })
    return Object.entries(bySeg)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [contratos])

  // Parcelamento analysis
  const parcelamentoStats = useMemo(() => {
    const byParc: Record<string, number> = {}
    pagamentos.forEach(p => {
      if (p.metodo === 'credito' || p.metodo === 'debito') {
        const label = p.parcelas ? (p.parcelas === 1 ? 'A vista' : `${p.parcelas}x`) : 'N/A'
        byParc[label] = (byParc[label] || 0) + 1
      }
    })
    return Object.entries(byParc)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => {
        if (a.name === 'A vista') return -1
        if (b.name === 'A vista') return 1
        return parseInt(a.name) - parseInt(b.name)
      })
  }, [pagamentos])

  // Ticket medio por fonte de conhecimento
  const ticketPorFonte = useMemo(() => {
    const receitaPorContrato: Record<string, number> = {}
    pagamentos.forEach(p => {
      receitaPorContrato[p.contrato_id] = (receitaPorContrato[p.contrato_id] || 0) + (p.valor || 0)
    })

    const byFonte: Record<string, { nome: string; total: number; receita: number }> = {}
    contratos.forEach(c => {
      if (!c.fonte_conhecimento_id) return
      if (!byFonte[c.fonte_conhecimento_id]) {
        const nome = fontes.find(f => f.id === c.fonte_conhecimento_id)?.nome || '???'
        byFonte[c.fonte_conhecimento_id] = { nome, total: 0, receita: 0 }
      }
      byFonte[c.fonte_conhecimento_id].total++
      byFonte[c.fonte_conhecimento_id].receita += receitaPorContrato[c.id] || 0
    })

    return Object.values(byFonte)
      .map(f => ({ name: f.nome, Ticket: f.total > 0 ? f.receita / f.total : 0, Volume: f.total }))
      .sort((a, b) => b.Ticket - a.Ticket)
  }, [contratos, pagamentos, fontes])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Velorio */}
      <ChartCard title="Velorio" subtitle="Percentual que deseja velorio presencial">
        <div className="h-40 flex items-center gap-4">
          <div className="w-32 h-32 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={velorioStats} innerRadius={30} outerRadius={52} paddingAngle={2} dataKey="value">
                  {velorioStats.map((entry, i) => <Cell key={i} fill={entry.color} stroke="none" />)}
                </Pie>
                <Tooltip content={<SimpleTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5">
            {velorioStats.map(d => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                <span className="text-[var(--surface-500)]">{d.name}:</span>
                <span className="text-mono font-bold text-[var(--surface-700)]">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </ChartCard>

      {/* Acompanhamento */}
      <ChartCard title="Acompanhamento Cremacao" subtitle="Como tutores acompanham">
        <div className="h-40 flex items-center gap-4">
          <div className="w-32 h-32 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={acompStats} innerRadius={30} outerRadius={52} paddingAngle={2} dataKey="value">
                  {acompStats.map((entry, i) => <Cell key={i} fill={entry.color} stroke="none" />)}
                </Pie>
                <Tooltip content={<SimpleTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5">
            {acompStats.map(d => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                <span className="text-[var(--surface-500)]">{d.name}:</span>
                <span className="text-mono font-bold text-[var(--surface-700)]">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </ChartCard>

      {/* Ticket por Fonte */}
      <ChartCard title="Ticket Medio por Canal" subtitle="Qual fonte traz clientes de maior valor">
        <div className="h-44">
          {ticketPorFonte.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ticketPorFonte} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-200)" strokeOpacity={0.5} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--surface-400)' }} axisLine={false} tickLine={false} angle={-15} textAnchor="end" height={45} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--surface-400)' }} axisLine={false} tickLine={false} tickFormatter={formatCurrencyShort} />
                <Tooltip content={<SimpleTooltip isCurrency />} />
                <Bar dataKey="Ticket" radius={[4, 4, 0, 0]} barSize={24}>
                  {ticketPorFonte.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-[var(--surface-400)]">Sem dados</div>
          )}
        </div>
      </ChartCard>

      {/* Parcelamento + Seguradora side by side */}
      <div className="space-y-4">
        {/* Parcelamento */}
        {parcelamentoStats.length > 0 && (
          <ChartCard title="Parcelamento Cartao" subtitle="Distribuicao de parcelas">
            <div className="space-y-1.5">
              {parcelamentoStats.map((item, i) => {
                const maxVal = parcelamentoStats[0]?.value || 1
                return (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="text-xs text-mono text-[var(--surface-500)] w-12">{item.name}</span>
                    <div className="flex-1 h-3 rounded-full bg-[var(--surface-100)] overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${(item.value / maxVal) * 100}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    </div>
                    <span className="text-mono text-xs font-bold text-[var(--surface-700)] w-6 text-right">{item.value}</span>
                  </div>
                )
              })}
            </div>
          </ChartCard>
        )}

        {/* Seguradoras breakdown */}
        {seguradoraBreakdown.length > 0 && (
          <ChartCard title="Seguradoras" subtitle="Volume por seguradora">
            <div className="space-y-1.5">
              {seguradoraBreakdown.map((item, i) => {
                const maxVal = seguradoraBreakdown[0]?.value || 1
                return (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-[var(--surface-600)] flex-1 truncate">{item.name}</span>
                    <div className="w-16 h-1.5 rounded-full bg-[var(--surface-100)] overflow-hidden hidden md:block">
                      <div className="h-full rounded-full" style={{ width: `${(item.value / maxVal) * 100}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    </div>
                    <span className="text-mono text-xs font-bold text-[var(--surface-700)] w-6 text-right">{item.value}</span>
                  </div>
                )
              })}
            </div>
          </ChartCard>
        )}
      </div>
    </div>
  )
}
