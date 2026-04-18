'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  LayoutDashboard, Activity, Users, Clock, Building2, Circle,
  AlertTriangle, CheckCircle2, XCircle, MonitorSmartphone, ChevronDown, ChevronRight
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

// ============================================
// Types (espelha o retorno da RPC get_admin_activity_overview)
// ============================================
type KPIs = {
  total_users: number
  online_now: number
  active_24h: number
  active_7d: number
  active_30d: number
  never_logged: number
  never_seen: number
}

type UnitActivity = {
  unidade_id: string
  unidade_nome: string
  unidade_codigo: string
  ordem: number | null
  users_count: number
  online_now: number
  active_24h: number
  active_7d: number
}

type UserActivity = {
  user_id: string
  email: string
  nome: string | null
  role: string | null
  ativo: boolean | null
  unidade_id: string | null
  unidade_nome: string | null
  unidade_codigo: string | null
  user_created_at: string
  last_sign_in_at: string | null
  last_seen_at: string | null
  online: boolean
  sessions_today: number
  sessions_7d: number
  sessions_30d: number
  seconds_today: number
  seconds_7d: number
}

type Overview = {
  generated_at: string
  kpis: KPIs
  units_activity: UnitActivity[]
  users: UserActivity[]
}

// ============================================
// Helpers
// ============================================
function fmtDuration(seconds: number): string {
  if (!seconds || seconds < 1) return '0m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h${m.toString().padStart(2, '0')}`
  return `${m}m`
}

function fmtRelative(iso: string | null): string {
  if (!iso) return 'nunca'
  const d = new Date(iso).getTime()
  const diffMs = Date.now() - d
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return 'agora'
  const min = Math.floor(sec / 60)
  if (min < 60) return `há ${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `há ${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 30) return `há ${day}d`
  const mo = Math.floor(day / 30)
  return `há ${mo} ${mo === 1 ? 'mês' : 'meses'}`
}

function activityTier(lastSeen: string | null): 'online' | 'hot' | 'warm' | 'cold' | 'never' {
  if (!lastSeen) return 'never'
  const diffH = (Date.now() - new Date(lastSeen).getTime()) / 3_600_000
  if (diffH < 0.05) return 'online'   // < 3 min → considerado online
  if (diffH < 24) return 'hot'
  if (diffH < 24 * 7) return 'warm'
  return 'cold'
}

const TIER_CONFIG: Record<ReturnType<typeof activityTier>, { label: string; dot: string; text: string; bg: string }> = {
  online: { label: 'Online',        dot: '#10b981', text: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  hot:    { label: 'Ativo 24h',     dot: '#38bdf8', text: '#38bdf8', bg: 'rgba(56,189,248,0.10)' },
  warm:   { label: 'Ativo 7d',      dot: '#f59e0b', text: '#f59e0b', bg: 'rgba(245,158,11,0.10)' },
  cold:   { label: 'Inativo',       dot: '#ef4444', text: '#ef4444', bg: 'rgba(239,68,68,0.10)'  },
  never:  { label: 'Nunca acessou', dot: '#64748b', text: '#64748b', bg: 'rgba(100,116,139,0.10)' },
}

// ============================================
// Página
// ============================================
export default function DashboardAdminPage() {
  const supabase = createClient()
  const { isSuperAdmin } = useUnit()

  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tierFilter, setTierFilter] = useState<'all' | 'online' | 'hot' | 'warm' | 'cold' | 'never'>('all')
  const [unitFilter, setUnitFilter] = useState<string>('all')

  const load = useCallback(async () => {
    const { data: overview, error: err } = await supabase.rpc('get_admin_activity_overview')
    if (err) {
      console.error('[DashboardAdmin] RPC error:', err)
      setError(err.message)
    } else {
      setData(overview as Overview)
      setError(null)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    load()
    const id = window.setInterval(load, 30_000) // auto-refresh 30s
    return () => window.clearInterval(id)
  }, [load])

  const filteredUsers = useMemo(() => {
    if (!data) return []
    return data.users.filter(u => {
      if (unitFilter !== 'all' && u.unidade_id !== unitFilter) return false
      const tier = activityTier(u.last_seen_at)
      if (tierFilter !== 'all' && tier !== tierFilter) return false
      return true
    })
  }, [data, tierFilter, unitFilter])

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in">
        <EmptyState icon={LayoutDashboard} title="Acesso restrito" description="Somente super_admin pode acessar o Dashboard Admin." />
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-emerald-900/30 items-center justify-center">
            <LayoutDashboard className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-title text-[var(--shell-text)]">Dashboard Admin</h1>
            <p className="text-small text-[var(--shell-text-muted)]">Adoção, uso e saúde da ferramenta</p>
          </div>
        </div>
        {data && (
          <div className="text-[11px] text-[var(--surface-400)] hidden sm:block">
            Atualizado {fmtRelative(data.generated_at)} · auto-refresh 30s
          </div>
        )}
      </div>

      {error && (
        <div className="card p-4 mb-4 flex items-start gap-2 border" style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)' }}>
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-red-400">Erro ao carregar overview</p>
            <p className="text-xs text-[var(--surface-500)] mt-0.5">{error}</p>
            <p className="text-xs text-[var(--surface-500)] mt-1">
              Rode a migration <code className="font-mono">072_user_activity_pings.sql</code> no Supabase.
            </p>
          </div>
        </div>
      )}

      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-[88px]" />)}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
          <KPICard label="Online agora"   value={data.kpis.online_now}   icon={Activity} color="#10b981" pulse={data.kpis.online_now > 0} />
          <KPICard label="Ativos 24h"     value={data.kpis.active_24h}   icon={Clock}    color="#38bdf8" />
          <KPICard label="Ativos 7d"      value={data.kpis.active_7d}    icon={Clock}    color="#a855f7" />
          <KPICard label="Ativos 30d"     value={data.kpis.active_30d}   icon={Clock}    color="#eab308" />
          <KPICard label="Total usuários" value={data.kpis.total_users}  icon={Users}    color="#94a3b8" />
          <KPICard label="Nunca logaram"  value={data.kpis.never_logged} icon={XCircle}  color="#64748b" alert={data.kpis.never_logged > 0} />
          <KPICard label="Nunca entraram" value={data.kpis.never_seen}   icon={XCircle}  color="#ef4444" alert={data.kpis.never_seen > 0} />
        </div>
      ) : null}

      {/* Unidades */}
      {data && data.units_activity.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-semibold text-[var(--surface-800)] mb-2 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[var(--surface-500)]" /> Atividade por unidade
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {data.units_activity.map(u => {
              const usagePct = u.users_count > 0 ? Math.round((u.active_7d / u.users_count) * 100) : 0
              return (
                <button
                  key={u.unidade_id}
                  onClick={() => setUnitFilter(f => f === u.unidade_id ? 'all' : u.unidade_id)}
                  className="card p-4 text-left card-hover transition-all"
                  style={{
                    borderColor: unitFilter === u.unidade_id ? 'var(--brand-500)' : undefined,
                    borderWidth: unitFilter === u.unidade_id ? '2px' : '1px',
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--surface-800)] truncate">{u.unidade_nome}</p>
                      <p className="text-[11px] text-[var(--surface-400)] font-mono">{u.unidade_codigo}</p>
                    </div>
                    {u.online_now > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                        <Circle className="h-1.5 w-1.5 fill-current animate-pulse" /> {u.online_now}
                      </span>
                    )}
                  </div>
                  <div className="flex items-end justify-between gap-2 text-xs">
                    <div>
                      <p className="text-[10px] uppercase text-[var(--surface-400)] tracking-wide">Usuários</p>
                      <p className="text-lg font-bold text-[var(--surface-800)] font-mono">{u.users_count}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-[var(--surface-400)] tracking-wide">Ativos 7d</p>
                      <p className="text-lg font-bold font-mono" style={{ color: usagePct >= 70 ? '#10b981' : usagePct >= 40 ? '#f59e0b' : '#ef4444' }}>
                        {u.active_7d}<span className="text-xs text-[var(--surface-400)]">/{u.users_count}</span>
                      </p>
                    </div>
                  </div>
                  {/* Barra */}
                  <div className="mt-2 h-1.5 rounded-full bg-[var(--surface-200)] overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${usagePct}%`,
                        background: usagePct >= 70 ? '#10b981' : usagePct >= 40 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  </div>
                  <p className="text-[10px] mt-1 text-[var(--surface-500)]">{usagePct}% de adoção (7d)</p>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Ranking de usuários */}
      {data && (
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <h2 className="text-base font-semibold text-[var(--surface-800)] flex items-center gap-2">
              <Users className="h-4 w-4 text-[var(--surface-500)]" /> Usuários
              <span className="text-xs font-normal text-[var(--surface-400)]">({filteredUsers.length})</span>
            </h2>

            {/* Filtros */}
            <div className="flex flex-wrap gap-1">
              {(['all', 'online', 'hot', 'warm', 'cold', 'never'] as const).map(t => {
                const label = t === 'all' ? 'Todos' : TIER_CONFIG[t].label
                const active = tierFilter === t
                return (
                  <button
                    key={t}
                    onClick={() => setTierFilter(t)}
                    className="text-[11px] font-medium px-2 py-1 rounded-full transition-colors"
                    style={{
                      background: active ? (t === 'all' ? 'var(--brand-500)' : TIER_CONFIG[t].text) : 'transparent',
                      color: active ? '#fff' : 'var(--surface-500)',
                      border: `1px solid ${active ? 'transparent' : 'var(--surface-300)'}`,
                    }}
                  >
                    {label}
                  </button>
                )
              })}
              {unitFilter !== 'all' && (
                <button
                  onClick={() => setUnitFilter('all')}
                  className="text-[11px] font-medium px-2 py-1 rounded-full"
                  style={{ background: 'var(--brand-500)', color: '#fff' }}
                >
                  Unidade ✕
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : filteredUsers.length === 0 ? (
            <EmptyState icon={Users} title="Sem usuários" description="Nenhum usuário nesse filtro." />
          ) : (
            <div className="space-y-2">
              {filteredUsers.map(u => <UserRow key={u.user_id} user={u} />)}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

// ============================================
// Subcomponentes
// ============================================
function KPICard({ label, value, icon: Icon, color, pulse, alert }: {
  label: string; value: number; icon: typeof Activity; color: string; pulse?: boolean; alert?: boolean
}) {
  return (
    <div className="card p-3" style={alert ? { borderColor: 'rgba(239,68,68,0.3)' } : undefined}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${pulse ? 'animate-pulse' : ''}`} style={{ color }} />
        <span className="text-[10px] uppercase tracking-wider text-[var(--surface-500)] font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold font-mono tabular-nums" style={{ color }}>{value.toLocaleString('pt-BR')}</p>
    </div>
  )
}

function UserRow({ user }: { user: UserActivity }) {
  const tier = activityTier(user.last_seen_at)
  const cfg = TIER_CONFIG[tier]
  const [open, setOpen] = useState(false)
  const nome = user.nome || user.email.split('@')[0]
  const isInactive = user.ativo === false

  return (
    <div className={`card p-3 ${isInactive ? 'opacity-50' : ''}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left flex items-center gap-3">
        {/* Status dot */}
        <span className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full" style={{ background: cfg.bg }}>
          <Circle
            className={`h-2.5 w-2.5 fill-current ${tier === 'online' ? 'animate-pulse' : ''}`}
            style={{ color: cfg.dot }}
          />
        </span>

        {/* Identidade */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[var(--surface-800)] truncate">{nome}</span>
            <span className="text-[11px] text-[var(--surface-400)] truncate">{user.email}</span>
            {user.role === 'super_admin' && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                SA
              </span>
            )}
            {isInactive && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                DESATIVADO
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[var(--surface-500)] flex-wrap">
            <span className="font-medium" style={{ color: cfg.text }}>{cfg.label}</span>
            {user.last_seen_at && <span>· visto {fmtRelative(user.last_seen_at)}</span>}
            {user.unidade_nome && <span>· {user.unidade_nome}</span>}
          </div>
        </div>

        {/* Stats compactas */}
        <div className="hidden sm:flex items-center gap-4 shrink-0 text-center">
          <Stat label="Hoje" value={`${user.sessions_today}×`} sub={fmtDuration(user.seconds_today)} />
          <Stat label="7d"   value={`${user.sessions_7d}×`}   sub={fmtDuration(user.seconds_7d)} />
          <Stat label="30d"  value={`${user.sessions_30d}×`} />
        </div>

        <ChevronRight className={`h-4 w-4 text-[var(--surface-400)] shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="mt-3 pt-3 border-t border-[var(--surface-200)] grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <DetailBox icon={Clock}     label="Último login"  value={fmtRelative(user.last_sign_in_at)} />
          <DetailBox icon={Activity}  label="Última sessão" value={fmtRelative(user.last_seen_at)} />
          <DetailBox icon={MonitorSmartphone} label="Criado em" value={new Date(user.user_created_at).toLocaleDateString('pt-BR')} />
          <DetailBox icon={CheckCircle2} label="Papel" value={user.role || '—'} />
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-[48px]">
      <p className="text-[9px] uppercase tracking-wide text-[var(--surface-400)]">{label}</p>
      <p className="text-sm font-bold font-mono text-[var(--surface-800)]">{value}</p>
      {sub && <p className="text-[10px] text-[var(--surface-500)] font-mono">{sub}</p>}
    </div>
  )
}

function DetailBox({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-[var(--surface-400)] flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="text-xs font-medium text-[var(--surface-700)] mt-0.5">{value}</p>
    </div>
  )
}
