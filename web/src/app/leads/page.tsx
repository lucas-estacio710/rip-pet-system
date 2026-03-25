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

type Origem = 'pago' | 'organico' | 'ia' | 'social' | 'direto'
type OrigemBreakdown = { total: number; pagos: number; organicos: number; ia: number; social: number; diretos: number }

// Domínios de IA
const IA_DOMAINS = [
  'chatgpt.com', 'chat.openai.com', 'openai.com',
  'perplexity.ai',
  'gemini.google.com', 'bard.google.com',
  'copilot.microsoft.com',
  'claude.ai', 'anthropic.com',
  'you.com', 'phind.com', 'poe.com',
]

// Domínios de Redes Sociais
const SOCIAL_DOMAINS = [
  'facebook.com', 'fb.com', 'm.facebook.com', 'l.facebook.com', 'lm.facebook.com',
  'instagram.com', 'l.instagram.com',
  'tiktok.com',
  'twitter.com', 'x.com', 't.co',
  'linkedin.com', 'lnkd.in',
  'pinterest.com', 'pin.it',
  'threads.net',
  'youtube.com', 'youtu.be',
  'reddit.com',
  'tumblr.com',
  'snapchat.com',
  'orkut.com', // nunca se sabe kkk
]

// Domínios de busca orgânica
const SEARCH_DOMAINS = [
  'google.com', 'google.com.br', 'www.google.com', 'www.google.com.br',
  'bing.com', 'www.bing.com',
  'yahoo.com', 'search.yahoo.com',
  'duckduckgo.com',
  'baidu.com',
  'ecosia.org',
]

function classifyOrigem(session: { gclid?: string | null; utm_medium?: string | null; utm_source?: string | null; referrer?: string | null }): Origem {
  // 1. Pago
  if (session.gclid || session.utm_medium === 'cpc' || session.utm_medium === 'ppc' || session.utm_medium === 'paid') return 'pago'

  // Extrair domínio do referrer
  let refDomain = ''
  if (session.referrer) {
    try {
      refDomain = new URL(session.referrer).hostname.replace(/^www\./, '').toLowerCase()
    } catch { refDomain = session.referrer.toLowerCase() }
  }

  // utm_source também pode indicar origem
  const src = (session.utm_source || '').toLowerCase()

  // 2. IA
  if (IA_DOMAINS.some(d => refDomain === d || refDomain.endsWith('.' + d))) return 'ia'
  if (['chatgpt', 'perplexity', 'gemini', 'copilot', 'claude', 'openai'].some(k => src.includes(k))) return 'ia'

  // 3. Redes Sociais
  if (SOCIAL_DOMAINS.some(d => refDomain === d || refDomain.endsWith('.' + d))) return 'social'
  if (['facebook', 'instagram', 'tiktok', 'twitter', 'linkedin', 'pinterest', 'youtube', 'reddit'].some(k => src.includes(k))) return 'social'

  // 4. Orgânico (buscadores)
  if (SEARCH_DOMAINS.some(d => refDomain === d || refDomain.endsWith('.' + d))) return 'organico'
  if (src === 'google' || src === 'bing' || src === 'yahoo' || src === 'duckduckgo') return 'organico'

  // 5. Tem referrer mas não é nenhum dos acima = orgânico genérico
  if (refDomain && refDomain.length > 0) return 'organico'
  if (session.utm_source) return 'organico'

  // 6. Direto
  return 'direto'
}

type FunnelData = {
  visitantes: OrigemBreakdown       // nível 1: todos
  engajados: OrigemBreakdown        // nível 2: ficaram ≥15s e/ou clicaram CTA
  clicaramCTA: OrigemBreakdown      // nível 3: abriram popup
  converteram: OrigemBreakdown      // nível 4: completaram ou converteram
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
  const origem = classifyOrigem(lead)
  switch (origem) {
    case 'pago':
      if (lead.gclid) return 'Google Ads'
      if (lead.utm_source === 'facebook' || lead.utm_source === 'meta') return 'Meta Ads'
      return 'Pago'
    case 'ia': return 'IA'
    case 'social': return 'Social'
    case 'organico': return 'Orgânico'
    case 'direto': return 'Direto'
  }
}

function origemBadgeStyle(lead: Lead): string {
  const origem = classifyOrigem(lead)
  switch (origem) {
    case 'pago': return 'border-amber-500/60 text-amber-400'
    case 'ia': return 'border-violet-500/60 text-violet-400'
    case 'social': return 'border-pink-500/60 text-pink-400'
    case 'organico': return 'border-green-500/60 text-green-400'
    case 'direto': return 'border-sky-500/60 text-sky-400'
  }
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
    case 'telefone': return 'Telefone'
    case 'telefone_skip': return 'Pulou telefone'
    case 'finalizar': return 'Finalização'
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

  // Primeiro, mapear gclid → chave de grupo (para unificar visitor_ids diferentes)
  const gclidToKey = new Map<string, string>()

  leads.forEach(l => {
    const vid = l.visitor_id || l.id

    // Se tem gclid, verificar se já existe um grupo com esse gclid
    if (l.gclid) {
      const existingKey = gclidToKey.get(l.gclid)
      if (existingKey) {
        // Agrupar com o visitor_id que já tem esse gclid
        const arr = map.get(existingKey) || []
        arr.push(l)
        map.set(existingKey, arr)
        return
      }
      // Registrar este gclid como pertencente a este visitor
      gclidToKey.set(l.gclid, vid)
    }

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
// Funnel Visual
// ============================================
function OrigemBadges({ d }: { d: OrigemBreakdown }) {
  if (d.total === 0) return null
  const items: { count: number; label: string; color: string }[] = [
    { count: d.pagos, label: 'pag', color: 'text-amber-200' },
    { count: d.organicos, label: 'org', color: 'text-emerald-200' },
    { count: d.ia, label: 'ia', color: 'text-violet-200' },
    { count: d.social, label: 'soc', color: 'text-pink-200' },
    { count: d.diretos, label: 'dir', color: 'text-sky-200' },
  ]
  return (
    <div className="flex items-center gap-1">
      {items.filter(x => x.count > 0).map(x => (
        <span key={x.label} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-black/30 ${x.color} backdrop-blur-sm`}>
          {x.count} {x.label}
        </span>
      ))}
    </div>
  )
}

// Gradientes do frio (topo) ao quente (base)
const FUNNEL_LEVELS = [
  {
    label: 'Visitantes',
    icon: Eye,
    gradient: 'linear-gradient(180deg, #3b82f6 0%, #6366f1 100%)',  // azul → índigo
    textColor: 'text-white',
  },
  {
    label: 'Engajados',
    icon: Users,
    gradient: 'linear-gradient(180deg, #6366f1 0%, #f59e0b 100%)',  // índigo → âmbar
    textColor: 'text-white',
    subtitle: '≥15s ou CTA',
  },
  {
    label: 'Clicaram CTA',
    icon: MousePointerClick,
    gradient: 'linear-gradient(180deg, #f59e0b 0%, #f97316 100%)',  // âmbar → laranja
    textColor: 'text-white',
  },
  {
    label: 'Converteram',
    icon: CheckCircle2,
    gradient: 'linear-gradient(180deg, #f97316 0%, #ef4444 100%)',  // laranja → vermelho
    textColor: 'text-white',
  },
]

function FunnelBar({ data, leads }: { data: FunnelData; leads: Lead[] }) {
  const top = data.visitantes.total || 1
  const dataLevels = [data.visitantes, data.engajados, data.clicaramCTA, data.converteram]

  return (
    <div className="card p-4 md:p-5 mb-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-[var(--surface-500)] uppercase tracking-wider">Funil de Conversão</h3>
        {data.visitantes.total > 0 && (
          <span className="text-sm text-[var(--surface-400)]">
            Conversão: <strong className="text-emerald-400">{pct(data.converteram.total, data.visitantes.total)}</strong>
          </span>
        )}
      </div>

      <div className="flex flex-col items-center gap-0">
        {FUNNEL_LEVELS.map((level, i) => {
          const d = dataLevels[i]
          const widthPct = Math.max((d.total / top) * 100, 20)
          const prevTotal = i > 0 ? dataLevels[i - 1].total : 0
          const dropoff = i > 0 && prevTotal > 0 ? prevTotal - d.total : 0

          return (
            <div key={level.label} className="w-full flex flex-col items-center">
              {/* Barra centralizada */}
              <div className="relative" style={{ width: `${widthPct}%`, minWidth: '140px' }}>
                <div
                  className="rounded-lg py-2.5 px-3 flex items-center justify-between gap-2 shadow-md"
                  style={{ background: level.gradient }}
                >
                  <div className="flex items-center gap-1.5" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
                    <level.icon className="h-3.5 w-3.5 text-white drop-shadow-sm" />
                    <span className="text-sm font-extrabold text-white drop-shadow-sm">{d.total}</span>
                    <span className="text-[11px] font-medium text-white/90 hidden sm:inline drop-shadow-sm">{level.label}</span>
                  </div>
                  <OrigemBadges d={d} />
                </div>

                {/* Dropoff à direita */}
                {dropoff > 0 && (
                  <span className="absolute -right-2 top-1/2 -translate-y-1/2 translate-x-full text-[10px] font-semibold text-red-400 whitespace-nowrap bg-red-500/10 px-1.5 py-0.5 rounded-full">
                    −{dropoff} ({pct(dropoff, prevTotal)})
                  </span>
                )}
              </div>

              {/* Label mobile abaixo */}
              <div className="sm:hidden flex items-center gap-1 mt-0.5">
                <span className="text-[10px] font-medium text-[var(--surface-500)]">{level.label}</span>
                {level.subtitle && <span className="text-[9px] text-[var(--surface-400)]">({level.subtitle})</span>}
              </div>

              {/* Conector entre níveis */}
              {i < FUNNEL_LEVELS.length - 1 && (
                <div className="w-px h-1 bg-[var(--surface-300)]" />
              )}
            </div>
          )
        })}
      </div>

      {/* Abandonos por step */}
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
  const emptyBreakdown: OrigemBreakdown = { total: 0, pagos: 0, organicos: 0, ia: 0, social: 0, diretos: 0 }
  const [funnel, setFunnel] = useState<FunnelData>({ visitantes: emptyBreakdown, engajados: emptyBreakdown, clicaramCTA: emptyBreakdown, converteram: emptyBreakdown })
  const [showFunnel, setShowFunnel] = useState(true)

  // Status counts
  const [counts, setCounts] = useState<Record<string, number>>({})

  // All leads (for abandonment breakdown)
  const [allLeads, setAllLeads] = useState<Lead[]>([])

  const carregarFunil = useCallback(async () => {
    const { from, to } = periodoRange(periodo)

    let sessionsQuery = supabase.from('sessions').select('visitor_id, time_on_page_sec, cta_clicked, landing_page, gclid, utm_source, utm_medium, referrer').gte('created_at', from).lt('created_at', to)
    let leadsQuery = supabase.from('leads').select('status, visitor_id, gclid, utm_source, utm_medium, id').gte('created_at', from).lt('created_at', to)

    if (unidade !== 'todas') {
      leadsQuery = leadsQuery.eq('unidade_code', unidade)
      // Sessions não têm unidade_code, filtrar por landing_page
      const path = unidade === 'ST' ? '/santos' : '/sao-paulo'
      sessionsQuery = sessionsQuery.like('landing_page', `${path}%`)
    }

    const [sessionsRes, leadsRes] = await Promise.all([sessionsQuery, leadsQuery])

    const sessionsData = sessionsRes.data || []
    const allLeadsData = leadsRes.data || []

    // Unificar visitor_id por gclid (mesmo clique = mesma pessoa)
    const sessionGclidMap = new Map<string, string>()
    function resolveVisitor(s: any): string {
      let vid = s.visitor_id || s.id
      if (s.gclid) {
        const existing = sessionGclidMap.get(s.gclid)
        if (existing) {
          vid = existing
        } else {
          sessionGclidMap.set(s.gclid, vid)
        }
      }
      return vid
    }

    // Agrupar sessions por visitante único (unificado por gclid)
    type VisitorInfo = { origem: Origem; engajado: boolean; clicouCTA: boolean }
    const visitorMap = new Map<string, VisitorInfo>()

    // Prioridade: pago > ia > social > organico > direto
    const ORIGEM_PRIORITY: Record<Origem, number> = { pago: 5, ia: 4, social: 3, organico: 2, direto: 1 }

    sessionsData.forEach((s: any) => {
      const vid = resolveVisitor(s)
      const existing = visitorMap.get(vid) || { origem: 'direto' as Origem, engajado: false, clicouCTA: false }

      // Classificar origem desta session
      const sessionOrigem = classifyOrigem(s)
      if (ORIGEM_PRIORITY[sessionOrigem] > ORIGEM_PRIORITY[existing.origem]) {
        existing.origem = sessionOrigem
      }

      if ((s.time_on_page_sec || 0) >= 15 || s.cta_clicked) existing.engajado = true
      if (s.cta_clicked) existing.clicouCTA = true

      visitorMap.set(vid, existing)
    })

    function addToBreakdown(bd: OrigemBreakdown, origem: Origem) {
      bd.total++
      if (origem === 'pago') bd.pagos++
      else if (origem === 'organico') bd.organicos++
      else if (origem === 'ia') bd.ia++
      else if (origem === 'social') bd.social++
      else bd.diretos++
    }

    function makeBreakdown(filter: (v: VisitorInfo) => boolean): OrigemBreakdown {
      const bd: OrigemBreakdown = { total: 0, pagos: 0, organicos: 0, ia: 0, social: 0, diretos: 0 }
      visitorMap.forEach(v => {
        if (filter(v)) addToBreakdown(bd, v.origem)
      })
      return bd
    }

    const visitantes = makeBreakdown(() => true)
    const engajados = makeBreakdown(v => v.engajado)
    const ctaBreakdown = makeBreakdown(v => v.clicouCTA)

    // Leads — contar convertidos por visitante único
    const gclidToVid = new Map<string, string>()
    const leadsByVisitor = new Map<string, { statuses: string[]; origem: Origem }>()
    allLeadsData.forEach((l: any) => {
      let vid = l.visitor_id || l.id
      if (l.gclid) {
        const existing = gclidToVid.get(l.gclid)
        if (existing) vid = existing
        else gclidToVid.set(l.gclid, vid)
      }
      const entry = leadsByVisitor.get(vid) || { statuses: [], origem: 'direto' as Origem }
      entry.statuses.push(l.status || 'completo')

      const leadOrigem = classifyOrigem(l)
      if (ORIGEM_PRIORITY[leadOrigem] > ORIGEM_PRIORITY[entry.origem]) {
        entry.origem = leadOrigem
      }

      leadsByVisitor.set(vid, entry)
    })

    const converteram: OrigemBreakdown = { total: 0, pagos: 0, organicos: 0, ia: 0, social: 0, diretos: 0 }
    leadsByVisitor.forEach((entry) => {
      const hasComplete = entry.statuses.some(s => s === 'completo' || s === 'contatado' || s === 'convertido')
      if (hasComplete) addToBreakdown(converteram, entry.origem)
    })

    setFunnel({ visitantes, engajados, clicaramCTA: ctaBreakdown, converteram })
  }, [periodo, unidade])

  const carregarContagens = useCallback(async () => {
    const { from, to } = periodoRange(periodo)
    let query = supabase.from('leads').select('status, visitor_id, gclid, convertido, id, abandoned_at_step').gte('created_at', from).lt('created_at', to)
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
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-dashed ${origemBadgeStyle(lead)}`}>
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
