'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Zap, Search, X, Clock, CheckCircle2, MapPin, MessageSquare, Phone, Globe,
  AlertTriangle, Shield, Dog, Cat, Bug, Eye, MousePointerClick, Users,
  TrendingDown, ArrowRight, Monitor, Smartphone, Tablet, ChevronDown, ChevronUp
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useDebounce } from '@/hooks/useDebounce'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'

// ============================================
// Types
// ============================================
type Lead = {
  id: string
  nome: string | null
  cidade: string | null
  canal: 'whatsapp' | 'telefone'
  telefone_destino: string | null
  tipo_atendimento: 'emergencial' | 'preventivo' | null
  especie_pet: 'cachorro' | 'gato' | 'exotico' | null
  grande_porte: boolean | null
  gclid: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  pagina_origem: string | null
  dispositivo: string | null
  created_at: string
  convertido: boolean
  convertido_em: string | null
  contrato_id: string | null
  protocolo: string | null
  tempo_pagina_seg: number | null
  scroll_depth: number | null
  page_views: number | null
  secao_clique: string | null
  notas: string | null
  // Novos campos v3
  status: string | null
  session_id: string | null
  visitor_id: string | null
  geo_city: string | null
  geo_state: string | null
  steps_completed: number | null
  last_step: string | null
  abandoned_at_step: string | null
  popup_duration_sec: number | null
  funnel_duration_sec: number | null
  unidade_code: string | null
}

type Session = {
  id: string
  visitor_id: string
  session_id: string
  created_at: string
  landing_page: string | null
  referrer: string | null
  utm_source: string | null
  utm_medium: string | null
  gclid: string | null
  device_type: string | null
  browser: string | null
  geo_city: string | null
  geo_state: string | null
  max_scroll_depth: number | null
  time_on_page_sec: number | null
  page_views: number | null
  sections_viewed: string[] | null
  cta_clicked: boolean
  cta_channel: string | null
  popup_opened_count: number | null
}

type StatusFilter = 'todos' | 'completo' | 'abandonado' | 'contatado' | 'convertido'
type Periodo = 'hoje' | 'ontem' | '7d' | '4w'
type UnidadeFilter = 'todas' | 'ST' | 'SP'

const UNIDADES: { key: UnidadeFilter; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'ST', label: 'Santos' },
  { key: 'SP', label: 'São Paulo' },
]

type VisitorGroup = {
  visitor_id: string
  leads: Lead[]
  main: Lead              // lead principal (completo > abandonado)
  status: string          // status final do visitante
  tentativas: number      // total de leads (abandonos + completo)
  abandonos: number
  completou: boolean
}

type FunnelData = {
  visitantesUnicos: number
  sessoes: number
  bouncePrecoce: number    // <15s sem clicar CTA
  abandonoMaduro: number   // ≥15s sem clicar CTA
  clicaramCTA: number
  abandonaramPopup: number  // visitantes únicos que abandonaram (sem completar)
  completaram: number       // visitantes únicos que completaram
}

// ============================================
// Helpers
// ============================================
function tempoRelativo(dataStr: string): string {
  const agora = new Date()
  const data = new Date(dataStr)
  const diffMs = agora.getTime() - data.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `há ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `há ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'ontem'
  if (diffD < 30) return `há ${diffD} dias`
  return data.toLocaleDateString('pt-BR')
}

function tempoLegivel(seg: number): string {
  if (seg < 60) return `${seg}s`
  const min = Math.floor(seg / 60)
  const s = seg % 60
  return s > 0 ? `${min}m${s}s` : `${min}m`
}

function origemLabel(lead: Lead): string {
  if (lead.gclid) return 'Google Ads'
  if (lead.utm_source === 'facebook' || lead.utm_source === 'meta') return 'Meta Ads'
  if (lead.utm_source) return lead.utm_source
  return 'Orgânico'
}

function statusLabel(status: string | null): string {
  switch (status) {
    case 'popup_aberto': return 'Popup Aberto'
    case 'em_andamento': return 'Em Andamento'
    case 'abandonado': return 'Abandonado'
    case 'completo': return 'Completo'
    case 'contatado': return 'Contatado'
    case 'convertido': return 'Convertido'
    default: return 'Completo'
  }
}

function stepLabel(step: string | null): string {
  switch (step) {
    case 'tipo': return 'Tipo atendimento'
    case 'cidade': return 'Cidade'
    case 'especie': return 'Espécie'
    case 'grande_porte': return 'Grande porte'
    case 'nome': return 'Nome'
    default: return step || '-'
  }
}

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: 'hoje', label: 'Hoje' },
  { key: 'ontem', label: 'Ontem' },
  { key: '7d', label: '7 dias' },
  { key: '4w', label: '4 semanas' },
]

function periodoRange(periodo: Periodo): { from: string; to: string } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  switch (periodo) {
    case 'hoje':
      return { from: today.toISOString(), to: tomorrow.toISOString() }
    case 'ontem': {
      const ontem = new Date(today)
      ontem.setDate(ontem.getDate() - 1)
      return { from: ontem.toISOString(), to: today.toISOString() }
    }
    case '7d': {
      const d7 = new Date(today)
      d7.setDate(d7.getDate() - 7)
      return { from: d7.toISOString(), to: tomorrow.toISOString() }
    }
    case '4w': {
      const d28 = new Date(today)
      d28.setDate(d28.getDate() - 28)
      return { from: d28.toISOString(), to: tomorrow.toISOString() }
    }
  }
}

function pct(a: number, b: number): string {
  if (b === 0) return '0%'
  return Math.round((a / b) * 100) + '%'
}

// Prioridade de status (maior = mais avançado)
const STATUS_PRIORITY: Record<string, number> = {
  popup_aberto: 0,
  em_andamento: 1,
  abandonado: 2,
  completo: 3,
  contatado: 4,
  convertido: 5,
}

function groupByVisitor(leads: Lead[]): VisitorGroup[] {
  const map = new Map<string, Lead[]>()

  leads.forEach(l => {
    const vid = l.visitor_id || l.id // fallback pra leads sem visitor_id
    const arr = map.get(vid) || []
    arr.push(l)
    map.set(vid, arr)
  })

  const groups: VisitorGroup[] = []

  map.forEach((vLeads, visitor_id) => {
    // Ordenar por created_at
    vLeads.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    // Lead principal = o com status mais avançado
    const main = vLeads.reduce((best, l) => {
      const bestPriority = STATUS_PRIORITY[best.status || 'completo'] ?? 3
      const lPriority = STATUS_PRIORITY[l.status || 'completo'] ?? 3
      return lPriority > bestPriority ? l : best
    }, vLeads[0])

    const completou = vLeads.some(l => {
      const s = l.status || (l.convertido ? 'convertido' : 'completo')
      return s === 'completo' || s === 'contatado' || s === 'convertido'
    })

    const abandonos = vLeads.filter(l => l.status === 'abandonado').length

    // Status do visitante: se completou, usa o status do main. Se não, 'abandonado'
    let status = main.status || (main.convertido ? 'convertido' : 'completo')
    if (!completou && abandonos > 0) status = 'abandonado'

    groups.push({
      visitor_id,
      leads: vLeads,
      main,
      status,
      tentativas: vLeads.length,
      abandonos,
      completou,
    })
  })

  // Ordenar por data do lead mais recente
  groups.sort((a, b) => {
    const aDate = new Date(a.leads[a.leads.length - 1].created_at).getTime()
    const bDate = new Date(b.leads[b.leads.length - 1].created_at).getTime()
    return bDate - aDate
  })

  return groups
}

// ============================================
// Funnel Drilldown Chart
// ============================================
function FunnelBar({ data, leads }: { data: FunnelData; leads: Lead[] }) {
  const s = data.sessoes || 1
  const cta = data.clicaramCTA || 1

  // Percentuais para larguras das barras
  const pBounce = (data.bouncePrecoce / s) * 100
  const pMaduro = (data.abandonoMaduro / s) * 100
  const pCTA = (data.clicaramCTA / s) * 100
  const pAbandPopup = (data.abandonaramPopup / cta) * 100
  const pCompletaram = (data.completaram / cta) * 100

  // Offset left do CTA dentro da barra de sessões (para alinhar drilldown)
  const ctaOffset = pBounce + pMaduro

  return (
    <div className="card p-4 md:p-5 mb-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-[var(--surface-500)] uppercase tracking-wider">Funil de Conversão</h3>
        {data.sessoes > 0 && (
          <span className="text-sm text-[var(--surface-400)]">
            Conversão: <strong className="text-emerald-400">{pct(data.completaram, data.sessoes)}</strong>
          </span>
        )}
      </div>

      {/* ── Nível 0: Visitantes únicos → Sessões ── */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <Eye className="h-3.5 w-3.5 text-purple-400" />
          <span className="text-sm font-semibold text-purple-400">{data.visitantesUnicos}</span>
          <span className="text-xs text-[var(--surface-500)]">únicos</span>
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-[var(--surface-400)] shrink-0" />
        <div className="flex items-center gap-1.5 shrink-0">
          <Users className="h-3.5 w-3.5 text-blue-400" />
          <span className="text-sm font-semibold text-blue-400">{data.sessoes}</span>
          <span className="text-xs text-[var(--surface-500)]">sessões</span>
        </div>
      </div>

      {/* ── Nível 1: Barra sessões se decompondo ── */}
      <div className="w-full h-10 rounded-lg overflow-hidden flex mb-1" style={{ minWidth: 0 }}>
        {data.bouncePrecoce > 0 && (
          <div
            className="h-full bg-orange-500/30 flex items-center justify-center border-r border-[var(--surface-100)]"
            style={{ width: `${pBounce}%` }}
            title={`Bounce <15s: ${data.bouncePrecoce}`}
          >
            {pBounce > 8 && <span className="text-xs font-bold text-orange-400">{data.bouncePrecoce}</span>}
          </div>
        )}
        {data.abandonoMaduro > 0 && (
          <div
            className="h-full bg-amber-500/30 flex items-center justify-center border-r border-[var(--surface-100)]"
            style={{ width: `${pMaduro}%` }}
            title={`Saíram sem clicar ≥15s: ${data.abandonoMaduro}`}
          >
            {pMaduro > 8 && <span className="text-xs font-bold text-amber-400">{data.abandonoMaduro}</span>}
          </div>
        )}
        {data.clicaramCTA > 0 && (
          <div
            className="h-full bg-cyan-500/30 flex items-center justify-center"
            style={{ width: `${pCTA}%` }}
            title={`Clicaram CTA: ${data.clicaramCTA}`}
          >
            {pCTA > 8 && <span className="text-xs font-bold text-cyan-400">{data.clicaramCTA}</span>}
          </div>
        )}
      </div>

      {/* Legenda nível 1 */}
      <div className="flex mb-3 text-[10px]" style={{ minWidth: 0 }}>
        {data.bouncePrecoce > 0 && (
          <div style={{ width: `${pBounce}%` }} className="text-center text-orange-400 truncate px-0.5">
            Bounce {pct(data.bouncePrecoce, s)}
          </div>
        )}
        {data.abandonoMaduro > 0 && (
          <div style={{ width: `${pMaduro}%` }} className="text-center text-amber-400 truncate px-0.5">
            Saíram {pct(data.abandonoMaduro, s)}
          </div>
        )}
        {data.clicaramCTA > 0 && (
          <div style={{ width: `${pCTA}%` }} className="text-center text-cyan-400 truncate px-0.5">
            CTA {pct(data.clicaramCTA, s)}
          </div>
        )}
      </div>

      {/* ── Linhas tracejadas conectando CTA → drilldown ── */}
      {data.clicaramCTA > 0 && (
        <>
          <div className="relative h-5 mb-1" style={{ marginLeft: `${ctaOffset}%`, width: `${pCTA}%` }}>
            <div className="absolute top-0 left-0 h-full border-l-2 border-dashed border-cyan-500/40" />
            <div className="absolute top-0 right-0 h-full border-r-2 border-dashed border-cyan-500/40" />
            <div className="absolute bottom-0 left-0 w-full border-b-2 border-dashed border-cyan-500/40" />
          </div>

          {/* ── Nível 2: CTA se decompondo ── */}
          <div
            className="flex mb-1 overflow-hidden rounded-lg"
            style={{ marginLeft: `${ctaOffset}%`, width: `${pCTA}%` }}
          >
            {data.abandonaramPopup > 0 && (
              <div
                className="h-8 bg-red-500/30 flex items-center justify-center border-r border-[var(--surface-100)]"
                style={{ width: `${pAbandPopup}%` }}
                title={`Abandonaram popup: ${data.abandonaramPopup}`}
              >
                {pAbandPopup > 15 && <span className="text-xs font-bold text-red-400">{data.abandonaramPopup}</span>}
              </div>
            )}
            {data.completaram > 0 && (
              <div
                className="h-8 bg-emerald-500/30 flex items-center justify-center"
                style={{ width: `${pCompletaram}%` }}
                title={`Enviaram form: ${data.completaram}`}
              >
                {pCompletaram > 15 && <span className="text-xs font-bold text-emerald-400">{data.completaram}</span>}
              </div>
            )}
          </div>

          {/* Legenda nível 2 */}
          <div
            className="flex text-[10px] mb-3"
            style={{ marginLeft: `${ctaOffset}%`, width: `${pCTA}%` }}
          >
            {data.abandonaramPopup > 0 && (
              <div style={{ width: `${pAbandPopup}%` }} className="text-center text-red-400 truncate px-0.5">
                Abandon. {pct(data.abandonaramPopup, data.clicaramCTA)}
              </div>
            )}
            {data.completaram > 0 && (
              <div style={{ width: `${pCompletaram}%` }} className="text-center text-emerald-400 truncate px-0.5">
                Leads {pct(data.completaram, data.clicaramCTA)}
              </div>
            )}
          </div>
        </>
      )}

      {/* Abandonos por step (dentro do funil) */}
      {(() => {
        const abandoned = leads.filter(l => l.status === 'abandonado' || (l.abandoned_at_step && l.status !== 'completo'))
        if (abandoned.length === 0) return null

        const byStep: Record<string, number> = {}
        abandoned.forEach(l => {
          const step = l.abandoned_at_step || 'desconhecido'
          byStep[step] = (byStep[step] || 0) + 1
        })

        const total = abandoned.length
        const sorted = Object.entries(byStep)
          .filter(([step]) => step !== 'desconhecido')
          .sort((a, b) => b[1] - a[1])

        if (sorted.length === 0) return null

        return (
          <div className="mt-4 pt-3 border-t border-[var(--surface-200)]">
            <p className="text-[10px] text-[var(--surface-400)] mb-2 uppercase tracking-wider">Abandonos por step</p>
            <div className="space-y-1.5">
              {sorted.map(([step, count]) => {
                const width = Math.max((count / total) * 100, 8)
                return (
                  <div key={step} className="flex items-center gap-2">
                    <span className="text-xs text-[var(--surface-600)] w-24 shrink-0 truncate">{stepLabel(step)}</span>
                    <div className="flex-1 h-5 bg-[var(--surface-100)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500/25 rounded-full flex items-center px-2"
                        style={{ width: `${width}%` }}
                      >
                        <span className="text-[10px] font-semibold text-red-400">{count}</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-[var(--surface-400)] w-8 text-right">{pct(count, total)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ============================================
// Status Tabs
// ============================================
const STATUS_TABS: { key: StatusFilter; label: string; color: string; icon: typeof Zap }[] = [
  { key: 'todos', label: 'Todos', color: 'text-[var(--surface-500)]', icon: Users },
  { key: 'completo', label: 'Completos', color: 'text-emerald-400', icon: CheckCircle2 },
  { key: 'abandonado', label: 'Abandonados', color: 'text-red-400', icon: TrendingDown },
  { key: 'contatado', label: 'Contatados', color: 'text-cyan-400', icon: Phone },
  { key: 'convertido', label: 'Convertidos', color: 'text-green-400', icon: Zap },
]

// ============================================
// Page
// ============================================
export default function LeadsPage() {
  const supabase = createClient()

  const [visitors, setVisitors] = useState<VisitorGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')
  const [periodo, setPeriodo] = useState<Periodo>('hoje')
  const [busca, setBusca] = useState('')
  const buscaDebounced = useDebounce(busca, 300)
  const [unidade, setUnidade] = useState<UnidadeFilter>('todas')

  // Funnel
  const [funnel, setFunnel] = useState<FunnelData>({ visitantesUnicos: 0, sessoes: 0, bouncePrecoce: 0, abandonoMaduro: 0, clicaramCTA: 0, abandonaramPopup: 0, completaram: 0 })
  const [showFunnel, setShowFunnel] = useState(true)

  // Status counts
  const [counts, setCounts] = useState<Record<string, number>>({})

  // All leads (for abandonment breakdown)
  const [allLeads, setAllLeads] = useState<Lead[]>([])

  const carregarFunil = useCallback(async () => {
    const { from, to } = periodoRange(periodo)

    let sessionsQuery = supabase.from('sessions').select('visitor_id, time_on_page_sec, cta_clicked, landing_page').gte('created_at', from).lt('created_at', to)
    let leadsQuery = supabase.from('leads').select('status').gte('created_at', from).lt('created_at', to)

    if (unidade !== 'todas') {
      leadsQuery = leadsQuery.eq('unidade_code', unidade)
      // Sessions não têm unidade_code, filtrar por landing_page
      const path = unidade === 'ST' ? '/santos' : '/sao-paulo'
      sessionsQuery = sessionsQuery.like('landing_page', `${path}%`)
    }

    const [sessionsRes, leadsRes] = await Promise.all([sessionsQuery, leadsQuery])

    const sessionsData = sessionsRes.data || []
    const allLeadsData = leadsRes.data || []

    // Visitantes únicos (distinct visitor_id)
    const uniqueVisitors = new Set(sessionsData.map((s: any) => s.visitor_id)).size
    const totalSessoes = sessionsData.length

    // Sessões sem CTA
    const semCTA = sessionsData.filter((s: any) => !s.cta_clicked)
    const bouncePrecoce = semCTA.filter((s: any) => (s.time_on_page_sec || 0) < 15).length
    const abandonoMaduro = semCTA.filter((s: any) => (s.time_on_page_sec || 0) >= 15).length

    // Sessões com CTA
    const clicaramCTA = sessionsData.filter((s: any) => s.cta_clicked).length

    // Leads — contar por visitante único (não por registro)
    const byVisitor = new Map<string, string[]>()
    allLeadsData.forEach((l: any) => {
      const vid = l.visitor_id || l.id
      const statuses = byVisitor.get(vid) || []
      statuses.push(l.status || 'completo')
      byVisitor.set(vid, statuses)
    })

    let completedVisitors = 0
    let abandonedOnlyVisitors = 0
    byVisitor.forEach((statuses) => {
      const hasComplete = statuses.some(s => s === 'completo' || s === 'contatado' || s === 'convertido')
      const hasAbandoned = statuses.some(s => s === 'abandonado')
      if (hasComplete) completedVisitors++
      else if (hasAbandoned) abandonedOnlyVisitors++
    })

    setFunnel({
      visitantesUnicos: uniqueVisitors,
      sessoes: totalSessoes,
      bouncePrecoce,
      abandonoMaduro,
      clicaramCTA,
      abandonaramPopup: abandonedOnlyVisitors,
      completaram: completedVisitors,
    })
  }, [periodo, unidade])

  const carregarContagens = useCallback(async () => {
    const { from, to } = periodoRange(periodo)
    let query = supabase.from('leads').select('status').gte('created_at', from).lt('created_at', to)
    if (unidade !== 'todas') query = query.eq('unidade_code', unidade)
    const { data } = await query
    if (!data) return

    // Contar por visitante único
    const groups = groupByVisitor(data as Lead[])
    const c: Record<string, number> = { todos: groups.length }
    groups.forEach(g => {
      c[g.status] = (c[g.status] || 0) + 1
    })
    setCounts(c)
    setAllLeads(data as any)
  }, [periodo, unidade])

  const carregarLeads = useCallback(async () => {
    setLoading(true)
    const { from, to } = periodoRange(periodo)

    let query = supabase
      .from('leads')
      .select('*')
      .gte('created_at', from)
      .lt('created_at', to)
      .order('created_at', { ascending: false })
      .limit(200)

    if (unidade !== 'todas') {
      query = query.eq('unidade_code', unidade)
    }

    // Status é filtrado client-side após agrupar por visitante

    if (buscaDebounced.trim()) {
      const termo = buscaDebounced.trim().replace(/[,.()"'\\]/g, '')
      if (termo) {
        query = query.or(`nome.ilike.%${termo}%,cidade.ilike.%${termo}%,geo_city.ilike.%${termo}%`)
      }
    }

    const { data, error } = await query

    if (error) {
      console.error('Erro ao carregar leads:', error)
      setVisitors([])
    } else {
      const allData = (data || []) as Lead[]
      const groups = groupByVisitor(allData)

      // Filtrar por status do visitante (não do lead individual)
      const filtered = statusFilter === 'todos'
        ? groups
        : groups.filter(g => {
            if (statusFilter === 'convertido') {
              return g.status === 'convertido' || g.main.convertido
            }
            return g.status === statusFilter
          })

      setVisitors(filtered)
    }

    setLoading(false)
  }, [statusFilter, buscaDebounced, periodo, unidade])

  // Load data + realtime
  useEffect(() => {
    carregarFunil()
    carregarContagens()
    carregarLeads()

    const channel = supabase
      .channel('leads-realtime-v3')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        carregarLeads()
        carregarContagens()
        carregarFunil()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [periodo, unidade])

  useEffect(() => {
    carregarLeads()
  }, [statusFilter, buscaDebounced])

  async function atualizarStatus(leadId: string, novoStatus: string) {
    const updates: any = { status: novoStatus }
    if (novoStatus === 'convertido') {
      updates.convertido = true
      updates.convertido_em = new Date().toISOString()
    }

    await (supabase as any).from('leads').update(updates).eq('id', leadId)
    carregarLeads()
    carregarContagens()
    carregarFunil()
  }

  // Effective status
  function getStatus(lead: Lead): string {
    if (lead.status) return lead.status
    if (lead.convertido) return 'convertido'
    return 'completo'
  }

  // Status badge variant
  function statusBadgeVariant(status: string): 'success' | 'error' | 'info' | 'warning' | 'default' | 'purple' {
    switch (status) {
      case 'completo': return 'success'
      case 'abandonado': return 'error'
      case 'contatado': return 'info'
      case 'convertido': return 'success'
      case 'popup_aberto': return 'warning'
      case 'em_andamento': return 'purple'
      default: return 'default'
    }
  }

  // Next action for a lead
  function nextAction(status: string): { label: string; next: string } | null {
    switch (status) {
      case 'completo': return { label: 'Marcar Contatado', next: 'contatado' }
      case 'contatado': return { label: 'Convertido', next: 'convertido' }
      case 'abandonado': return { label: 'Contatado', next: 'contatado' }
      default: return null
    }
  }

  // ============================================
  // Render
  // ============================================
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-emerald-900/30 items-center justify-center">
            <Zap className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-title text-[var(--shell-text)]">Leads</h1>
            <p className="text-small text-[var(--shell-text-muted)]">Funil completo: visitas, cliques, leads e conversões</p>
          </div>
        </div>
        <button
          onClick={() => setShowFunnel(!showFunnel)}
          className="flex items-center gap-1 text-sm text-[var(--surface-500)] hover:text-[var(--surface-700)] transition-colors"
        >
          {showFunnel ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {showFunnel ? 'Esconder' : 'Funil'}
        </button>
      </div>

      {/* Filtros temporais + unidade */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex gap-1">
          {PERIODOS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriodo(p.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                periodo === p.key
                  ? 'bg-[var(--brand-600)] text-white shadow-sm'
                  : 'text-[var(--surface-500)] hover:text-[var(--surface-700)] hover:bg-[var(--surface-50)]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <span className="text-[var(--surface-300)]">|</span>

        <div className="flex gap-1">
          {UNIDADES.map(u => (
            <button
              key={u.key}
              onClick={() => setUnidade(u.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                unidade === u.key
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-[var(--surface-500)] hover:text-[var(--surface-700)] hover:bg-[var(--surface-50)]'
              }`}
            >
              {u.label}
            </button>
          ))}
        </div>
      </div>

      {/* Funil de Conversão */}
      {showFunnel && (
        <FunnelBar data={funnel} leads={allLeads as Lead[]} />
      )}

      {/* Status Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1 scrollbar-hide">
        {STATUS_TABS.map(tab => {
          const count = tab.key === 'todos' ? (counts.todos || 0) : (counts[tab.key] || 0)
          const isActive = statusFilter === tab.key

          return (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-[var(--surface-100)] text-[var(--surface-800)] shadow-sm'
                  : 'text-[var(--surface-500)] hover:text-[var(--surface-700)] hover:bg-[var(--surface-50)]'
              }`}
            >
              <tab.icon className={`h-4 w-4 ${isActive ? tab.color : ''}`} />
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-[var(--surface-200)] text-[var(--surface-700)]' : 'text-[var(--surface-400)]'
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Busca */}
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--surface-400)]" />
        <input
          type="text"
          placeholder="Buscar por nome, cidade..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="input pl-10 pr-10"
        />
        {busca && (
          <button
            onClick={() => setBusca('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--surface-400)] hover:text-[var(--surface-600)]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card p-4 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      ) : visitors.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="Nenhum lead encontrado"
          description={busca ? 'Tente ajustar o termo de busca' : 'Nenhum lead com este status'}
        />
      ) : (
        <div className="space-y-2 stagger-children">
          {visitors.map((group) => {
            const { main: lead, status } = group
            const action = nextAction(status)

            return (
              <div
                key={group.visitor_id}
                className={`card p-4 card-hover transition-all ${
                  status === 'abandonado' ? 'border-l-2 border-l-red-500/50' :
                  status === 'convertido' ? 'border-l-2 border-l-green-500/50' :
                  status === 'contatado' ? 'border-l-2 border-l-cyan-500/50' :
                  ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    {/* Nome + protocolo + tentativas */}
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-base font-semibold text-[var(--surface-800)]">
                        {lead.nome || '(sem nome)'}
                      </span>
                      {lead.protocolo && (
                        <span className="text-xs font-mono text-[var(--surface-400)]">{lead.protocolo}</span>
                      )}
                      {group.tentativas > 1 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--surface-100)] text-[var(--surface-500)]">
                          {group.tentativas}x
                        </span>
                      )}
                    </div>

                    {/* Badges: Origem → Tipo → Canal → ··· Status */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                      {/* 1. Origem (tracejado) */}
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-dashed ${
                        lead.gclid ? 'border-amber-500/60 text-amber-400' :
                        (lead.utm_source === 'facebook' || lead.utm_source === 'meta') ? 'border-blue-500/60 text-blue-400' :
                        lead.utm_source ? 'border-purple-500/60 text-purple-400' :
                        'border-[var(--surface-400)]/40 text-[var(--surface-500)]'
                      }`}>
                        <Globe className="h-3 w-3" />
                        {origemLabel(lead)}
                      </span>

                      {/* 2. Tipo atendimento (preenchido forte) */}
                      {lead.tipo_atendimento && (
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          lead.tipo_atendimento === 'emergencial'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}>
                          {lead.tipo_atendimento === 'emergencial' ? (
                            <><AlertTriangle className="h-3 w-3" />Emergencial</>
                          ) : (
                            <><Shield className="h-3 w-3" />Preventivo</>
                          )}
                        </span>
                      )}

                      {/* 3. Canal (outline sólido) */}
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                        lead.canal === 'whatsapp' ? 'border-emerald-500/60 text-emerald-400' :
                        lead.canal === 'telefone' ? 'border-sky-500/60 text-sky-400' :
                        'border-[var(--surface-300)] text-[var(--surface-500)]'
                      }`}>
                        {lead.canal === 'whatsapp' ? (
                          <><MessageSquare className="h-3 w-3" />WhatsApp</>
                        ) : lead.canal === 'telefone' ? (
                          <><Phone className="h-3 w-3" />Telefone</>
                        ) : (
                          <>Sem canal</>
                        )}
                      </span>

                      {/* Separador visual */}
                      <span className="text-[var(--surface-300)] mx-0.5">·</span>

                      {/* 4. Status (preenchido suave, deslocado) */}
                      <Badge variant={statusBadgeVariant(status)}>
                        {statusLabel(status)}
                      </Badge>
                    </div>

                    {/* Cidade + pet + dispositivo */}
                    <div className="flex items-center gap-3 flex-wrap text-sm text-[var(--surface-600)] mb-1">
                      {(lead.cidade || lead.geo_city) && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {lead.cidade || lead.geo_city}
                          {lead.geo_state && <span className="text-[var(--surface-400)]">({lead.geo_state})</span>}
                        </span>
                      )}
                      {lead.especie_pet && (
                        <span className="inline-flex items-center gap-1">
                          {lead.especie_pet === 'cachorro' ? <Dog className="h-3.5 w-3.5" /> : lead.especie_pet === 'gato' ? <Cat className="h-3.5 w-3.5" /> : <Bug className="h-3.5 w-3.5" />}
                          {lead.especie_pet === 'cachorro' ? 'Cachorro' : lead.especie_pet === 'gato' ? 'Gato' : 'Exótico'}
                          {lead.grande_porte === true && <span className="text-xs font-semibold text-amber-500">(+45kg)</span>}
                        </span>
                      )}
                      {lead.dispositivo && (
                        <span className="inline-flex items-center gap-1 text-xs text-[var(--surface-400)]">
                          {lead.dispositivo === 'mobile' ? <Smartphone className="h-3 w-3" /> : lead.dispositivo === 'tablet' ? <Tablet className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                          {lead.dispositivo}
                        </span>
                      )}
                    </div>

                    {/* Jornada do visitante (se teve mais de 1 tentativa) */}
                    {group.tentativas > 1 && (
                      <div className="flex items-center gap-1.5 flex-wrap text-xs mb-1.5 mt-1">
                        {group.leads.map((l, i) => {
                          const s = l.status || 'completo'
                          const isLast = i === group.leads.length - 1
                          const time = new Date(l.created_at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                          return (
                            <span key={l.id} className="contents">
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  s === 'abandonado' ? 'bg-red-500/15 text-red-400' :
                                  s === 'completo' || s === 'contatado' || s === 'convertido' ? 'bg-emerald-500/15 text-emerald-400' :
                                  'bg-[var(--surface-100)] text-[var(--surface-500)]'
                                }`}
                                title={`${statusLabel(s)}${l.abandoned_at_step ? ' em ' + stepLabel(l.abandoned_at_step) : ''} — ${time}`}
                              >
                                {s === 'abandonado' ? (
                                  <><TrendingDown className="h-2.5 w-2.5" />{l.abandoned_at_step ? stepLabel(l.abandoned_at_step) : 'Abandonou'}</>
                                ) : (
                                  <><CheckCircle2 className="h-2.5 w-2.5" />{statusLabel(s)}</>
                                )}
                                <span className="text-[9px] opacity-60">{time}</span>
                              </span>
                              {!isLast && <ArrowRight className="h-3 w-3 text-[var(--surface-300)]" />}
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {/* Abandono info (só se 1 tentativa) */}
                    {group.tentativas === 1 && status === 'abandonado' && lead.abandoned_at_step && (
                      <div className="flex items-center gap-2 text-xs text-red-400 mb-1">
                        <TrendingDown className="h-3 w-3" />
                        Abandonou em: <strong>{stepLabel(lead.abandoned_at_step)}</strong>
                        {lead.steps_completed != null && (
                          <span className="text-[var(--surface-400)]">({lead.steps_completed} steps completados)</span>
                        )}
                      </div>
                    )}

                    {/* UTM + time */}
                    <div className="flex items-center gap-3 flex-wrap text-xs text-[var(--surface-400)]">
                      {lead.utm_campaign && (
                        <span title="Campanha">📢 {lead.utm_campaign}</span>
                      )}
                      {lead.utm_term && (
                        <span title="Palavra-chave">🔑 {lead.utm_term}</span>
                      )}
                      <span className="inline-flex items-center gap-1" title={new Date(lead.created_at).toLocaleString('pt-BR')}>
                        <Clock className="h-3 w-3" />
                        {tempoRelativo(lead.created_at)} · {new Date(lead.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {lead.pagina_origem && (
                        <span className="text-mono">{lead.pagina_origem}</span>
                      )}
                    </div>

                    {/* Engajamento */}
                    {(lead.tempo_pagina_seg || lead.scroll_depth || lead.popup_duration_sec) && (
                      <div className="flex items-center gap-3 flex-wrap text-xs text-[var(--surface-400)] mt-1">
                        {lead.tempo_pagina_seg != null && (
                          <span title="Tempo na página">⏱️ {tempoLegivel(lead.tempo_pagina_seg)} na página</span>
                        )}
                        {lead.popup_duration_sec != null && (
                          <span title="Tempo no popup">💬 {tempoLegivel(lead.popup_duration_sec)} no popup</span>
                        )}
                        {lead.scroll_depth != null && (
                          <span title="Scroll depth">📜 {lead.scroll_depth}% lido</span>
                        )}
                        {lead.page_views != null && lead.page_views > 1 && (
                          <span title="Páginas visitadas na sessão">👁️ {lead.page_views} visitas</span>
                        )}
                        {lead.secao_clique && (
                          <span title="Seção do clique">📍 {lead.secao_clique}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex-shrink-0 flex flex-col gap-1">
                    {action && (
                      <button
                        onClick={() => atualizarStatus(lead.id, action.next)}
                        className="btn-primary text-xs py-1.5 px-3 whitespace-nowrap flex items-center gap-1"
                        style={{ background: action.next === 'convertido' ? '#10b981' : 'var(--brand-600)' }}
                      >
                        <ArrowRight className="h-3 w-3" />
                        {action.label}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
