'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Shield, Download, ChevronDown, ChevronUp,
  Monitor, Smartphone, Tablet, MapPin, Clock, Eye,
  MousePointerClick, AlertTriangle, CheckCircle2
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { hojeLocal } from '@/lib/date-local'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import { useUnit } from '@/contexts/UnitContext'
import { useFieldPermission } from '@/hooks/useFieldPermission'

// ============================================
// Types
// ============================================
type Suspect = {
  ip_address: string
  fingerprint: string | null
  fraud_score: number
  visit_count: number
  total_time_sec: number
  avg_scroll_depth: number
  max_popup_opens: number
  ever_converted: boolean
  last_seen: string
  cities: string[] | null
  devices: string[] | null
  gclids: string[] | null
  unidade_codes: string[] | null
  fp_ip_count?: number | null
  fp_ips?: string[] | null
}

type SessionRow = {
  id: string
  session_id: string
  ip_address: string | null
  fingerprint: string | null
  created_at: string
  updated_at: string
  time_on_page_sec: number
  max_scroll_depth: number
  page_views: number
  sections_viewed: string[] | null
  cta_clicked: boolean
  cta_channel: string | null
  cta_section: string | null
  cta_clicked_at: string | null
  popup_opened_count: number
  device_type: string | null
  browser: string | null
  os: string | null
  landing_page: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  gclid: string | null
  is_ads: boolean
}

type Periodo = '7d' | '30d' | '90d' | 'all'

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: 'all', label: 'Todo período' },
]

// ============================================
// Helpers
// ============================================
function periodoToDate(p: Periodo): string {
  const d = new Date()
  if (p === '7d') d.setDate(d.getDate() - 7)
  else if (p === '30d') d.setDate(d.getDate() - 30)
  else if (p === '90d') d.setDate(d.getDate() - 90)
  else d.setFullYear(d.getFullYear() - 5) // 'all' — janela generosa pro sync
  return d.toISOString()
}

function formatTime(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function shortPath(url: string | null): string {
  if (!url) return ''
  try {
    const u = url.startsWith('http') ? new URL(url) : new URL(url, 'http://x')
    return u.pathname + (u.search ? '?…' : '')
  } catch {
    return url.slice(0, 40)
  }
}

function scoreColor(score: number): string {
  if (score >= 75) return 'text-red-400'
  if (score >= 50) return 'text-amber-400'
  return 'text-yellow-300'
}

function scoreBg(score: number): string {
  if (score >= 75) return 'bg-red-500/20 border-red-500/30'
  if (score >= 50) return 'bg-amber-500/20 border-amber-500/30'
  return 'bg-yellow-500/20 border-yellow-500/30'
}

function deviceIcon(device: string) {
  if (device === 'mobile') return <Smartphone className="w-3.5 h-3.5" />
  if (device === 'tablet') return <Tablet className="w-3.5 h-3.5" />
  return <Monitor className="w-3.5 h-3.5" />
}

// ============================================
// Component
// ============================================
export default function AdsShieldPage() {
  const supabase = createClient()
  const { currentUnit } = useUnit()
  const { canEdit, isVisible } = useFieldPermission()

  const [suspects, setSuspects] = useState<Suspect[]>([])
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState<Periodo>('30d')
  const [minScore, setMinScore] = useState(40)
  const [expandedIp, setExpandedIp] = useState<string | null>(null)
  const [whitelistLoading, setWhitelistLoading] = useState<string | null>(null)
  const [sessionsCache, setSessionsCache] = useState<Record<string, SessionRow[]>>({})
  const [sessionsLoading, setSessionsLoading] = useState<string | null>(null)

  const fetchSuspects = useCallback(async () => {
    setLoading(true)
    try {
      // Respeita o seletor de unidade da top-bar
      const uc = currentUnit?.codigo || null

      if (periodo === 'all') {
        // Le direto da blocklist persistente
        let query = supabase
          .from('ads_shield_blocklist')
          .select('*')
          .gte('max_score', minScore)
          .order('max_score', { ascending: false })
          .order('last_flagged_at', { ascending: false })

        if (uc) {
          query = query.contains('unidade_codes', [uc])
        }

        const { data, error } = await query
        if (error) {
          console.error('blocklist query error:', error)
          setSuspects([])
        } else {
          setSuspects(((data || []) as Array<{
            ip_address: string
            fingerprint: string | null
            max_score: number
            visit_count: number
            ever_converted: boolean
            last_flagged_at: string
            cities: string[] | null
            devices: string[] | null
            unidade_codes: string[] | null
          }>).map(row => ({
            ip_address: row.ip_address,
            fingerprint: row.fingerprint,
            fraud_score: row.max_score,
            visit_count: row.visit_count,
            total_time_sec: 0,
            avg_scroll_depth: 0,
            max_popup_opens: 0,
            ever_converted: row.ever_converted,
            last_seen: row.last_flagged_at,
            cities: row.cities,
            devices: row.devices,
            gclids: null,
            unidade_codes: row.unidade_codes,
          })))
        }
      } else {
        // Janela deslizante: scoring ao vivo + sync em background
        const { data, error } = await supabase.rpc('get_ads_suspects' as never, {
          p_unidade_code: uc,
          p_from: periodoToDate(periodo),
          p_to: new Date().toISOString(),
          p_min_score: minScore
        } as never)

        if (error) {
          console.error('get_ads_suspects error:', error)
          setSuspects([])
        } else {
          setSuspects(data || [])
          // Fire-and-forget: persiste na blocklist
          supabase.rpc('sync_ads_blocklist' as never, {
            p_unidade_code: uc,
            p_from: periodoToDate(periodo),
            p_to: new Date().toISOString(),
            p_min_score: minScore
          } as never).then(({ error: syncErr }) => {
            if (syncErr) console.error('sync_ads_blocklist error:', syncErr)
          })
        }
      }
    } catch (e) {
      console.error(e)
      setSuspects([])
    }
    setLoading(false)
  }, [periodo, minScore, currentUnit, supabase])

  useEffect(() => {
    if (currentUnit) fetchSuspects()
  }, [fetchSuspects, currentUnit])

  // Carrega storyline (sessoes) ao expandir um suspeito
  useEffect(() => {
    if (!expandedIp) return
    if (sessionsCache[expandedIp]) return

    const suspect = suspects.find(s => s.ip_address === expandedIp)
    if (!suspect) return

    const loadSessions = async () => {
      setSessionsLoading(expandedIp)
      // Busca sessoes do proprio IP + dos IPs irmaos (se fp rotativa)
      const ips = (suspect.fp_ips && suspect.fp_ips.length > 0)
        ? suspect.fp_ips
        : [suspect.ip_address]

      const { data, error } = await supabase
        .from('sessions')
        .select('id, session_id, ip_address, fingerprint, created_at, updated_at, time_on_page_sec, max_scroll_depth, page_views, sections_viewed, cta_clicked, cta_channel, cta_section, cta_clicked_at, popup_opened_count, device_type, browser, os, landing_page, utm_source, utm_medium, utm_campaign, gclid, is_ads')
        .in('ip_address', ips)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) {
        console.error('sessions fetch error:', error)
      } else if (data) {
        setSessionsCache(prev => ({ ...prev, [expandedIp]: data as SessionRow[] }))
      }
      setSessionsLoading(null)
    }
    loadSessions()
  }, [expandedIp, suspects, sessionsCache, supabase])

  // ============================================
  // Actions
  // ============================================
  function exportIPs() {
    const ips = suspects.map(s => s.ip_address).filter(Boolean)
    if (ips.length === 0) return

    const content = ips.join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rip-shield-ips-${hojeLocal()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function whitelistIP(ip: string) {
    setWhitelistLoading(ip)
    try {
      await supabase.from('ads_shield_whitelist').insert({
        ip_address: ip,
        reason: 'Marcado como seguro via CRM'
      } as never)
      // Remove da blocklist persistente tambem
      await supabase.from('ads_shield_blocklist').delete().eq('ip_address', ip)
      setSuspects(prev => prev.filter(s => s.ip_address !== ip))
    } catch (e) {
      console.error(e)
    }
    setWhitelistLoading(null)
  }

  // ============================================
  // Stats
  // ============================================
  const totalSuspects = suspects.length
  const totalWastedClicks = suspects.reduce((sum, s) => sum + s.visit_count, 0)
  const topOffender = suspects[0]

  // ============================================
  // Render
  // ============================================
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-500/20 rounded-lg">
            <Shield className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-title text-[var(--shell-text)]">RIP Shield</h1>
            <p className="text-sm text-[var(--shell-text-muted)]">Deteccao de fraude em cliques Google Ads</p>
          </div>
        </div>

        {isVisible('tela_ads_shield', 'btn_exportar_ips') && (
          <button
            onClick={exportIPs}
            disabled={suspects.length === 0 || !canEdit('tela_ads_shield', 'btn_exportar_ips')}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Exportar IPs ({totalSuspects})
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Periodo */}
        <div className="flex bg-slate-800 rounded-lg p-0.5">
          {PERIODOS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriodo(p.key)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                periodo === p.key
                  ? 'bg-slate-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Score minimo */}
        <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-1.5">
          <span className="text-sm text-slate-400">Score min:</span>
          <input
            type="range"
            min={20}
            max={80}
            step={10}
            value={minScore}
            onChange={e => setMinScore(Number(e.target.value))}
            className="w-20 accent-red-500"
          />
          <span className="text-sm text-white font-medium w-6">{minScore}</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="text-sm text-slate-400 mb-1">IPs Suspeitos</div>
          <div className="text-2xl font-bold text-red-400">
            {loading ? <Skeleton className="h-8 w-12" /> : totalSuspects}
          </div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="text-sm text-slate-400 mb-1">Cliques Desperdicados</div>
          <div className="text-2xl font-bold text-amber-400">
            {loading ? <Skeleton className="h-8 w-12" /> : totalWastedClicks}
          </div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="text-sm text-slate-400 mb-1">Top Ofensor</div>
          <div className="text-lg font-bold font-mono text-red-400 truncate">
            {loading ? <Skeleton className="h-8 w-32" /> : (topOffender?.ip_address || '—')}
          </div>
          {topOffender && !loading && (
            <span className={`text-xs ${scoreColor(topOffender.fraud_score)}`}>
              Score {topOffender.fraud_score} - {topOffender.visit_count} visitas
            </span>
          )}
        </div>
      </div>

      {/* Warning about Google Ads limit */}
      {totalSuspects > 500 && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-sm text-amber-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Google Ads aceita no maximo 500 IPs por campanha. Voce tem {totalSuspects} — considere aumentar o score minimo.
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : suspects.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="Nenhum IP suspeito encontrado"
          description="Nenhuma atividade fraudulenta detectada no periodo selecionado."
        />
      ) : (
        <div className="space-y-2">
          {suspects.map(s => {
            const isExpanded = expandedIp === s.ip_address
            return (
              <div
                key={s.ip_address}
                className={`border rounded-xl transition-colors ${scoreBg(s.fraud_score)}`}
              >
                {/* Row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  onClick={() => setExpandedIp(isExpanded ? null : s.ip_address)}
                >
                  {/* Score */}
                  <div className={`text-2xl font-bold w-12 text-center ${scoreColor(s.fraud_score)}`}>
                    {s.fraud_score}
                  </div>

                  {/* IP + info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-[var(--shell-text)]">{s.ip_address}</span>
                      {s.ever_converted && (
                        <Badge variant="success" >converteu</Badge>
                      )}
                      {(s.fp_ip_count ?? 0) >= 2 && (
                        <Badge variant="error">
                          fp em {s.fp_ip_count} IPs
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" /> {s.visit_count} visitas
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {formatTime(s.total_time_sec)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MousePointerClick className="w-3 h-3" /> scroll {s.avg_scroll_depth}%
                      </span>
                      {s.max_popup_opens > 0 && (
                        <span>popup {s.max_popup_opens}x</span>
                      )}
                    </div>
                  </div>

                  {/* Devices */}
                  <div className="hidden sm:flex items-center gap-1 text-slate-400">
                    {s.devices?.map((d, i) => (
                      <span key={i}>{deviceIcon(d)}</span>
                    ))}
                  </div>

                  {/* Last seen */}
                  <div className="text-xs text-slate-500 hidden md:block">
                    {formatDate(s.last_seen)}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {isVisible('tela_ads_shield', 'btn_whitelist') && (
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          whitelistIP(s.ip_address)
                        }}
                        disabled={whitelistLoading === s.ip_address || !canEdit('tela_ads_shield', 'btn_whitelist')}
                        className="p-1.5 text-slate-400 hover:text-emerald-400 transition-colors"
                        title="Marcar como seguro"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-2">
                    {s.fingerprint && (
                      <div className="text-xs text-slate-500">
                        Fingerprint: <span className="font-mono">{s.fingerprint}</span>
                        {(s.fp_ip_count ?? 0) >= 2 && (
                          <span className="ml-2 text-red-400">
                            — compartilhada com {(s.fp_ip_count ?? 1) - 1} outro(s) IP(s)
                          </span>
                        )}
                      </div>
                    )}

                    {s.fp_ips && s.fp_ips.length > 1 && (
                      <div className="text-xs text-slate-400">
                        <span className="text-slate-500">IPs irmãos:</span>{' '}
                        <span className="font-mono">
                          {s.fp_ips.filter(ip => ip !== s.ip_address).join(', ')}
                        </span>
                      </div>
                    )}

                    {s.cities && s.cities.length > 0 && (
                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        <MapPin className="w-3 h-3" />
                        {s.cities.join(', ')}
                      </div>
                    )}

                    {s.gclids && s.gclids.length > 0 && (
                      <div className="text-xs text-slate-500">
                        <span className="text-slate-400">GCLIDs ({s.gclids.length}):</span>{' '}
                        {s.gclids.map((g, i) => (
                          <span key={i} className="font-mono">
                            {g.slice(0, 20)}...{i < s.gclids!.length - 1 ? ', ' : ''}
                          </span>
                        ))}
                      </div>
                    )}

                    {s.unidade_codes && s.unidade_codes.length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        Unidades: {s.unidade_codes.map((uc, i) => (
                          <Badge key={i} variant="default" >{uc}</Badge>
                        ))}
                      </div>
                    )}

                    {/* Storyline das sessoes */}
                    <div className="pt-3 mt-2 border-t border-white/5">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                        Storyline
                        {sessionsCache[s.ip_address] && (
                          <span className="ml-1 text-slate-400">
                            ({sessionsCache[s.ip_address].length} sessões)
                          </span>
                        )}
                      </div>

                      {sessionsLoading === s.ip_address && (
                        <div className="text-xs text-slate-500">Carregando sessões...</div>
                      )}

                      {sessionsCache[s.ip_address] && (
                        <div className="space-y-2">
                          {sessionsCache[s.ip_address].map(sess => {
                            const isBotShort = sess.time_on_page_sec <= 5 && sess.max_scroll_depth <= 5
                            const isAfkLong = sess.time_on_page_sec >= 1800 && !sess.cta_clicked
                            const isDifferentIp = sess.ip_address !== s.ip_address
                            return (
                              <div
                                key={sess.id}
                                className={`rounded-lg p-2.5 text-xs space-y-1.5 border ${
                                  isBotShort
                                    ? 'bg-red-500/5 border-red-500/20'
                                    : isAfkLong
                                    ? 'bg-amber-500/5 border-amber-500/20'
                                    : 'bg-slate-800/40 border-slate-700/40'
                                }`}
                              >
                                {/* Header: when + duration + device + origem */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-slate-300">{formatDate(sess.created_at)}</span>
                                  <span className="text-slate-600">•</span>
                                  <span className="font-mono text-slate-400">
                                    {formatTime(sess.time_on_page_sec)}
                                  </span>
                                  {sess.device_type && (
                                    <>
                                      <span className="text-slate-600">•</span>
                                      <span className="flex items-center gap-1 text-slate-400">
                                        {deviceIcon(sess.device_type)}
                                        {sess.browser || sess.device_type}
                                      </span>
                                    </>
                                  )}
                                  {isDifferentIp && sess.ip_address && (
                                    <>
                                      <span className="text-slate-600">•</span>
                                      <span className="font-mono text-slate-500" title="IP desta sessão">
                                        {sess.ip_address}
                                      </span>
                                    </>
                                  )}
                                  {!sess.is_ads && (
                                    <Badge variant="default">orgânico</Badge>
                                  )}
                                </div>

                                {/* Metrics */}
                                <div className="flex items-center gap-2 text-slate-400">
                                  <span>
                                    scroll <span className="text-slate-200 font-medium">{sess.max_scroll_depth}%</span>
                                  </span>
                                  <span className="text-slate-600">•</span>
                                  <span>{sess.page_views} pgview{sess.page_views > 1 ? 's' : ''}</span>
                                  <span className="text-slate-600">•</span>
                                  <span>{sess.sections_viewed?.length || 0} seções</span>
                                </div>

                                {/* Sections chips */}
                                {sess.sections_viewed && sess.sections_viewed.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {sess.sections_viewed.map((sec, i) => (
                                      <span
                                        key={i}
                                        className="px-1.5 py-0.5 rounded bg-slate-700/40 text-slate-300 text-[10px] font-mono"
                                      >
                                        {sec}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Activity badges */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {sess.cta_clicked && (
                                    <Badge variant="success">
                                      CTA {sess.cta_channel}
                                      {sess.cta_section ? ` em ${sess.cta_section}` : ''}
                                      {sess.cta_clicked_at
                                        ? ` @ ${new Date(sess.cta_clicked_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                                        : ''}
                                    </Badge>
                                  )}
                                  {sess.popup_opened_count > 0 && (
                                    <Badge variant="warning">
                                      popup {sess.popup_opened_count}x
                                    </Badge>
                                  )}
                                  {isBotShort && (
                                    <Badge variant="error">bot refresh</Badge>
                                  )}
                                  {isAfkLong && (
                                    <Badge variant="warning">AFK {Math.floor(sess.time_on_page_sec / 60)}min</Badge>
                                  )}
                                </div>

                                {/* Landing + UTM + gclid */}
                                {(sess.landing_page || sess.utm_source || sess.gclid) && (
                                  <div className="text-slate-500 space-y-0.5 pt-1 border-t border-white/5">
                                    {sess.landing_page && (
                                      <div className="font-mono truncate">
                                        {shortPath(sess.landing_page)}
                                      </div>
                                    )}
                                    {sess.utm_source && (
                                      <div>
                                        utm: {sess.utm_source}
                                        {sess.utm_medium ? ` / ${sess.utm_medium}` : ''}
                                        {sess.utm_campaign ? ` / ${sess.utm_campaign}` : ''}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
