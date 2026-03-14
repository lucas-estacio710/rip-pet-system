'use client'

import { useEffect, useState } from 'react'
import { Zap, Search, X, Clock, CheckCircle2, MapPin, MessageSquare, Phone, Globe, AlertTriangle, Shield, Dog, Cat, Bug } from 'lucide-react'
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
  nome: string
  cidade: string
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
}

type Filtro = 'pendentes' | 'convertidos' | 'todos'

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

// ============================================
// Page
// ============================================
export default function LeadsPage() {
  const supabase = createClient()

  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('pendentes')
  const [busca, setBusca] = useState('')
  const buscaDebounced = useDebounce(busca, 300)

  // Counts
  const [pendentesCount, setPendentesCount] = useState(0)
  const [convertidosCount, setConvertidosCount] = useState(0)

  // Load data + realtime
  useEffect(() => {
    carregarContagens()

    // Realtime: atualiza quando lead novo entra ou é atualizado
    const channel = supabase
      .channel('leads-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        carregarLeads()
        carregarContagens()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    carregarLeads()
    carregarContagens()
  }, [filtro, buscaDebounced])

  async function carregarContagens() {
    const [{ count: pend }, { count: conv }] = await Promise.all([
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('convertido', false),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('convertido', true),
    ])
    setPendentesCount(pend || 0)
    setConvertidosCount(conv || 0)
  }

  async function carregarLeads() {
    setLoading(true)

    let query = supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (filtro === 'pendentes') {
      query = query.eq('convertido', false)
    } else if (filtro === 'convertidos') {
      query = query.eq('convertido', true)
    }

    if (buscaDebounced.trim()) {
      const termo = buscaDebounced.trim().replace(/[,.()"'\\]/g, '')
      if (termo) {
        query = query.or(`nome.ilike.%${termo}%,cidade.ilike.%${termo}%`)
      }
    }

    const { data, error } = await query

    if (error) {
      console.error('Erro ao carregar leads:', error)
    } else {
      setLeads((data || []) as Lead[])
    }

    setLoading(false)
  }

  async function marcarConvertido(leadId: string) {
    await (supabase as any)
      .from('leads')
      .update({ convertido: true, convertido_em: new Date().toISOString() })
      .eq('id', leadId)

    carregarLeads()
    carregarContagens()
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
            <p className="text-small text-[var(--shell-text-muted)]">Leads capturados via popup da LP Santos</p>
          </div>
        </div>
      </div>

      {/* Cards de contagem */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={() => setFiltro(filtro === 'pendentes' ? 'todos' : 'pendentes')}
          className={`card p-4 border-2 transition-all card-hover ${
            filtro === 'pendentes'
              ? 'border-emerald-500 bg-emerald-900/20'
              : 'border-[var(--surface-200)] hover:border-[var(--surface-300)]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500 text-white">
              <Zap className="h-5 w-5" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-[var(--surface-500)]">Novos</p>
              <p className="text-2xl font-bold text-[var(--surface-800)]">{pendentesCount}</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setFiltro(filtro === 'convertidos' ? 'todos' : 'convertidos')}
          className={`card p-4 border-2 transition-all card-hover ${
            filtro === 'convertidos'
              ? 'border-green-500 bg-green-900/20'
              : 'border-[var(--surface-200)] hover:border-[var(--surface-300)]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500 text-white">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-[var(--surface-500)]">Convertidos</p>
              <p className="text-2xl font-bold text-[var(--surface-800)]">{convertidosCount}</p>
            </div>
          </div>
        </button>
      </div>

      {/* Filtro ativo indicator */}
      {filtro !== 'pendentes' && (
        <div className="mb-4 flex items-center justify-between bg-[var(--surface-50)] rounded-lg px-4 py-2 border border-[var(--surface-200)]">
          <span className="text-sm text-[var(--surface-500)]">
            Filtrando: <strong>{filtro === 'convertidos' ? 'Convertidos' : 'Todos'}</strong>
          </span>
          <button
            onClick={() => setFiltro('pendentes')}
            className="text-sm text-emerald-500 hover:text-emerald-400 font-medium"
          >
            Voltar para novos
          </button>
        </div>
      )}

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
          description={busca ? 'Tente ajustar o termo de busca' : filtro === 'pendentes' ? 'Nenhum lead novo aguardando' : 'Nenhum lead registrado ainda'}
        />
      ) : (
        <div className="space-y-2 stagger-children">
          {leads.map((lead) => (
            <div
              key={lead.id}
              className="card p-4 card-hover transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                {/* Content */}
                <div className="min-w-0 flex-1">
                  {/* Nome + badges */}
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-base font-semibold text-[var(--surface-800)]">
                      {lead.nome}
                    </span>
                    {lead.protocolo && (
                      <span className="text-xs font-mono text-[var(--surface-400)]">{lead.protocolo}</span>
                    )}
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
                    {/* Status */}
                    {lead.convertido && (
                      <Badge variant="success" dot>Convertido</Badge>
                    )}
                  </div>

                  {/* Cidade + pet + dispositivo */}
                  <div className="flex items-center gap-3 flex-wrap text-sm text-[var(--surface-600)] mb-1">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {lead.cidade}
                    </span>
                    {lead.especie_pet && (
                      <span className="inline-flex items-center gap-1">
                        {lead.especie_pet === 'cachorro' ? <Dog className="h-3.5 w-3.5" /> : lead.especie_pet === 'gato' ? <Cat className="h-3.5 w-3.5" /> : <Bug className="h-3.5 w-3.5" />}
                        {lead.especie_pet === 'cachorro' ? 'Cachorro' : lead.especie_pet === 'gato' ? 'Gato' : 'Exótico'}
                        {lead.grande_porte === true && <span className="text-xs font-semibold text-amber-500">(+45kg)</span>}
                      </span>
                    )}
                    {lead.dispositivo && (
                      <span className="text-xs text-[var(--surface-400)]">
                        {lead.dispositivo === 'mobile' ? '📱' : '💻'} {lead.dispositivo}
                      </span>
                    )}
                  </div>

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
                  {(lead.tempo_pagina_seg || lead.scroll_depth || lead.page_views) && (
                    <div className="flex items-center gap-3 flex-wrap text-xs text-[var(--surface-400)] mt-1">
                      {lead.tempo_pagina_seg != null && (
                        <span title="Tempo na página">⏱️ {tempoLegivel(lead.tempo_pagina_seg)} na página</span>
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

                {/* Action button */}
                <div className="flex-shrink-0">
                  {!lead.convertido ? (
                    <button
                      onClick={() => marcarConvertido(lead.id)}
                      className="btn-primary text-sm py-2 px-4 whitespace-nowrap"
                      style={{ background: 'var(--brand-600)' }}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Converter
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
