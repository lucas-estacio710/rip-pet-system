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

type FunnelData = {
  sessions: number
  ctaClicks: number
  popupOpened: number
  completed: number
  abandoned: number
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

function pct(a: number, b: number): string {
  if (b === 0) return '0%'
  return Math.round((a / b) * 100) + '%'
}

// ============================================
// Funnel Bar Component
// ============================================
function FunnelBar({ data }: { data: FunnelData }) {
  const steps = [
    { label: 'Visitantes', value: data.sessions, icon: Eye, color: 'text-purple-400', bg: 'bg-purple-900/30' },
    { label: 'Clicaram CTA', value: data.ctaClicks, icon: MousePointerClick, color: 'text-cyan-400', bg: 'bg-cyan-900/30' },
    { label: 'Abriram Popup', value: data.popupOpened, icon: Users, color: 'text-blue-400', bg: 'bg-blue-900/30' },
    { label: 'Completaram', value: data.completed, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-900/30' },
    { label: 'Abandonaram', value: data.abandoned, icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-900/30' },
  ]

  const maxVal = Math.max(...steps.map(s => s.value), 1)

  return (
    <div className="card p-4 mb-6">
      <h3 className="text-sm font-semibold text-[var(--surface-500)] mb-4 uppercase tracking-wider">Funil de Conversão</h3>
      <div className="flex items-end gap-2 md:gap-4">
        {steps.map((step, i) => {
          const prev = i > 0 && i < 4 ? steps[i - 1].value : null
          const dropRate = prev && prev > 0 ? Math.round(((prev - step.value) / prev) * 100) : null
          const barHeight = Math.max((step.value / maxVal) * 100, 8)

          return (
            <div key={step.label} className="flex-1 flex flex-col items-center gap-1">
              {/* Percentual de queda */}
              {dropRate !== null && i < 4 && (
                <span className="text-[10px] text-red-400 font-medium">
                  -{dropRate}%
                </span>
              )}
              {i === 4 && (
                <span className="text-[10px] text-red-400 font-medium">
                  {data.popupOpened > 0 ? pct(data.abandoned, data.popupOpened) : '0%'}
                </span>
              )}

              {/* Barra */}
              <div className="w-full relative" style={{ height: '100px' }}>
                <div
                  className={`absolute bottom-0 w-full rounded-t-md ${step.bg} transition-all duration-500`}
                  style={{ height: `${barHeight}%` }}
                />
              </div>

              {/* Valor */}
              <span className={`text-lg md:text-xl font-bold ${step.color}`}>
                {step.value}
              </span>

              {/* Label */}
              <div className="flex flex-col items-center gap-0.5">
                <step.icon className={`h-4 w-4 ${step.color}`} />
                <span className="text-[10px] md:text-xs text-[var(--surface-500)] text-center leading-tight">
                  {step.label}
                </span>
              </div>

              {/* Taxa de conversão entre steps */}
              {prev !== null && i < 4 && prev > 0 && (
                <span className="text-[10px] text-[var(--surface-400)]">
                  {pct(step.value, prev)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================
// Abandonment Breakdown
// ============================================
function AbandonmentBreakdown({ leads }: { leads: Lead[] }) {
  const abandoned = leads.filter(l => l.status === 'abandonado' || (l.abandoned_at_step && l.status !== 'completo'))
  if (abandoned.length === 0) return null

  const byStep: Record<string, number> = {}
  abandoned.forEach(l => {
    const step = l.abandoned_at_step || 'desconhecido'
    byStep[step] = (byStep[step] || 0) + 1
  })

  const total = abandoned.length
  const sorted = Object.entries(byStep).sort((a, b) => b[1] - a[1])

  return (
    <div className="card p-4 mb-6">
      <h3 className="text-sm font-semibold text-[var(--surface-500)] mb-3 uppercase tracking-wider">
        Abandonos por Step
      </h3>
      <div className="space-y-2">
        {sorted.map(([step, count]) => {
          const width = Math.max((count / total) * 100, 5)
          return (
            <div key={step} className="flex items-center gap-3">
              <span className="text-sm text-[var(--surface-600)] w-28 shrink-0">{stepLabel(step)}</span>
              <div className="flex-1 h-6 bg-[var(--surface-100)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500/30 rounded-full flex items-center px-2"
                  style={{ width: `${width}%` }}
                >
                  <span className="text-xs font-semibold text-red-400">{count}</span>
                </div>
              </div>
              <span className="text-xs text-[var(--surface-400)] w-10 text-right">{pct(count, total)}</span>
            </div>
          )
        })}
      </div>
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

  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')
  const [busca, setBusca] = useState('')
  const buscaDebounced = useDebounce(busca, 300)

  // Funnel
  const [funnel, setFunnel] = useState<FunnelData>({ sessions: 0, ctaClicks: 0, popupOpened: 0, completed: 0, abandoned: 0 })
  const [showFunnel, setShowFunnel] = useState(true)

  // Status counts
  const [counts, setCounts] = useState<Record<string, number>>({})

  // All leads (for abandonment breakdown)
  const [allLeads, setAllLeads] = useState<Lead[]>([])

  const carregarFunil = useCallback(async () => {
    const [sessionsRes, ctaRes, leadsRes] = await Promise.all([
      supabase.from('sessions').select('*', { count: 'exact', head: true }),
      supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('cta_clicked', true),
      supabase.from('leads').select('status', { count: 'exact' }),
    ])

    const allLeadsData = leadsRes.data || []
    const completed = allLeadsData.filter((l: any) => l.status === 'completo' || l.status === 'contatado' || l.status === 'convertido').length
    const abandoned = allLeadsData.filter((l: any) => l.status === 'abandonado').length
    const popupTotal = allLeadsData.length

    setFunnel({
      sessions: sessionsRes.count || 0,
      ctaClicks: ctaRes.count || 0,
      popupOpened: popupTotal,
      completed,
      abandoned,
    })
  }, [])

  const carregarContagens = useCallback(async () => {
    const { data } = await supabase.from('leads').select('status')
    if (!data) return

    const c: Record<string, number> = { todos: data.length }
    data.forEach((l: any) => {
      const s = l.status || 'completo'
      c[s] = (c[s] || 0) + 1
    })
    setCounts(c)
    setAllLeads(data as any)
  }, [])

  const carregarLeads = useCallback(async () => {
    setLoading(true)

    let query = supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (statusFilter !== 'todos') {
      // 'convertido' também inclui o campo boolean legado
      if (statusFilter === 'convertido') {
        query = query.or('status.eq.convertido,convertido.eq.true')
      } else {
        query = query.eq('status', statusFilter)
      }
    }

    if (buscaDebounced.trim()) {
      const termo = buscaDebounced.trim().replace(/[,.()"'\\]/g, '')
      if (termo) {
        query = query.or(`nome.ilike.%${termo}%,cidade.ilike.%${termo}%,geo_city.ilike.%${termo}%`)
      }
    }

    const { data, error } = await query

    if (error) {
      console.error('Erro ao carregar leads:', error)
    } else {
      setLeads((data || []) as Lead[])
    }

    setLoading(false)
  }, [statusFilter, buscaDebounced])

  // Load data + realtime
  useEffect(() => {
    carregarFunil()
    carregarContagens()

    const channel = supabase
      .channel('leads-realtime-v3')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        carregarLeads()
        carregarContagens()
        carregarFunil()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    carregarLeads()
  }, [statusFilter, buscaDebounced])

  async function atualizarStatus(leadId: string, novoStatus: string) {
    const updates: any = { status: novoStatus }
    if (novoStatus === 'convertido') {
      updates.convertido = true
      updates.convertido_em = new Date().toISOString()
    }

    await supabase.from('leads').update(updates).eq('id', leadId)
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

      {/* Funil de Conversão */}
      {showFunnel && (
        <>
          <FunnelBar data={funnel} />
          <AbandonmentBreakdown leads={allLeads as Lead[]} />
        </>
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
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="Nenhum lead encontrado"
          description={busca ? 'Tente ajustar o termo de busca' : 'Nenhum lead com este status'}
        />
      ) : (
        <div className="space-y-2 stagger-children">
          {leads.map((lead) => {
            const status = getStatus(lead)
            const action = nextAction(status)

            return (
              <div
                key={lead.id}
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
                    {/* Nome + badges */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-base font-semibold text-[var(--surface-800)]">
                        {lead.nome || '(sem nome)'}
                      </span>
                      {lead.protocolo && (
                        <span className="text-xs font-mono text-[var(--surface-400)]">{lead.protocolo}</span>
                      )}
                      {/* Status badge */}
                      <Badge variant={statusBadgeVariant(status)}>
                        {statusLabel(status)}
                      </Badge>
                      {/* Canal badge */}
                      <Badge variant={lead.canal === 'whatsapp' ? 'success' : 'info'}>
                        {lead.canal === 'whatsapp' ? (
                          <><MessageSquare className="h-3 w-3 mr-1" />WhatsApp</>
                        ) : (
                          <><Phone className="h-3 w-3 mr-1" />Telefone</>
                        )}
                      </Badge>
                      {/* Origem badge */}
                      <Badge variant={lead.gclid ? 'warning' : 'default'}>
                        <Globe className="h-3 w-3 mr-1" />
                        {origemLabel(lead)}
                      </Badge>
                      {/* Tipo atendimento */}
                      {lead.tipo_atendimento && (
                        <Badge variant={lead.tipo_atendimento === 'emergencial' ? 'error' : 'info'}>
                          {lead.tipo_atendimento === 'emergencial' ? (
                            <><AlertTriangle className="h-3 w-3 mr-1" />Emergencial</>
                          ) : (
                            <><Shield className="h-3 w-3 mr-1" />Preventivo</>
                          )}
                        </Badge>
                      )}
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

                    {/* Abandono info */}
                    {status === 'abandonado' && lead.abandoned_at_step && (
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
