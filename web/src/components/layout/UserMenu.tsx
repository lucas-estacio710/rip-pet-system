'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUnit } from '@/contexts/UnitContext'
import { createClient } from '@/lib/supabase/client'
import {
  User, ChevronDown, LogOut, Eye, Users, Settings, Crown, Shield,
  Palette, Moon, Sun, UserCheck, Tag, ListTodo, Printer, Wrench
} from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { THEMES, THEME_META, type Theme } from '@/lib/theme'
import { ImpersonateModal } from './ImpersonateModal'

const THEME_ICONS: Record<Theme, typeof Moon> = {
  dark: Moon,
  white: Sun,
}

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  gerente: 'Gerente',
  operador: 'Concierge',
}

export function UserMenu() {
  const { userEmail, userName, currentRole, isSuperAdmin, impersonating, impersonatedEmail, startImpersonating, stopImpersonating } = useUnit()
  const [showImpersonate, setShowImpersonate] = useState(false)
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const supabase = createClient()
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const displayName = userName || userEmail?.split('@')[0] || 'Usuário'
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-[var(--surface-100)] transition-colors"
      >
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: '#7c3aed', color: '#fff' }}>
          {initials}
        </div>
        <div className="hidden lg:flex flex-col items-start">
          <span className="text-xs font-medium text-[var(--surface-700)] leading-tight">{displayName}</span>
          {currentRole && (
            <span className="text-[10px] leading-tight" style={{ color: '#a78bfa' }}>{ROLE_LABELS[currentRole]}</span>
          )}
        </div>
        <ChevronDown className={`h-3 w-3 text-[var(--surface-400)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className="absolute top-full right-0 mt-1 w-64 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in"
          style={{ background: '#1e293b', border: '1px solid #334155' }}
        >
          {/* User info */}
          <div style={{ borderBottom: '1px solid #334155', padding: '12px 16px' }}>
            <p className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{displayName}</p>
            <p className="text-xs" style={{ color: '#94a3b8' }}>{userEmail}</p>
            {currentRole && (
              <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}>
                <Crown className="h-3 w-3" />
                {ROLE_LABELS[currentRole]}
              </span>
            )}
          </div>

          {/* Gerente tools (gerente + super_admin) */}
          {(isSuperAdmin || currentRole === 'gerente') && (
            <div style={{ borderBottom: '1px solid #334155' }}>
              <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>Gestão</p>
              <Link
                href="/admin/funcionarios"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors"
                style={{ color: '#e2e8f0' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Users className="h-4 w-4" style={{ color: '#10b981' }} />
                <span className="text-sm">Funcionários</span>
              </Link>
            </div>
          )}

          {/* Admin tools (só super_admin) */}
          {isSuperAdmin && (
            <div style={{ borderBottom: '1px solid #334155' }}>
              <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>Administração</p>
              <Link
                href="/admin/usuarios"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors"
                style={{ color: '#e2e8f0' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Users className="h-4 w-4" style={{ color: '#a78bfa' }} />
                <span className="text-sm">Usuários</span>
              </Link>
              <Link
                href="/admin/visibilidade"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors"
                style={{ color: '#e2e8f0' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Eye className="h-4 w-4" style={{ color: '#3b82f6' }} />
                <span className="text-sm">Visibilidade</span>
              </Link>
              <Link
                href="/admin/catalogo"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors"
                style={{ color: '#e2e8f0' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Tag className="h-4 w-4" style={{ color: '#f59e0b' }} />
                <span className="text-sm">Catálogo</span>
              </Link>
              <Link
                href="/admin/demandas"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors"
                style={{ color: '#e2e8f0' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <ListTodo className="h-4 w-4" style={{ color: '#a78bfa' }} />
                <span className="text-sm">Demandas</span>
              </Link>
              <Link
                href="/admin/tratamento-erros"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors"
                style={{ color: '#e2e8f0' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Wrench className="h-4 w-4" style={{ color: '#f59e0b' }} />
                <span className="text-sm">Tratamento de Erros</span>
              </Link>
              <button
                onClick={() => { setIsOpen(false); setShowImpersonate(true) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors"
                style={{ color: '#e2e8f0' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <UserCheck className="h-4 w-4" style={{ color: '#f59e0b' }} />
                <span className="text-sm">Logar como</span>
              </button>
              <button
                onClick={async () => {
                  setIsOpen(false)
                  const supabase = createClient()
                  const { data } = await supabase.rpc('list_users_with_profiles') as { data: any[] | null }
                  const kr = (data || []).find((u: any) => u.user_id === 'e8f8c47a-8150-4798-91c6-f5bf0d4403c9')
                  if (kr) await startImpersonating(kr.user_id, kr.email, kr.perfis)
                }}
                className="w-full flex items-center gap-3 px-4 py-2 transition-colors"
                style={{ color: '#94a3b8' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <UserCheck className="h-3.5 w-3.5" style={{ color: '#ec4899' }} />
                <span className="text-xs">Logar como KR</span>
              </button>
              <button
                onClick={async () => {
                  setIsOpen(false)
                  const supabase = createClient()
                  const { data } = await supabase.rpc('list_users_with_profiles') as { data: any[] | null }
                  const fm = (data || []).find((u: any) => u.user_id === 'ab32da6b-3888-4a7f-92a7-4592c0f84bb9')
                  if (fm) await startImpersonating(fm.user_id, fm.email, fm.perfis)
                }}
                className="w-full flex items-center gap-3 px-4 py-2 transition-colors"
                style={{ color: '#94a3b8' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <UserCheck className="h-3.5 w-3.5" style={{ color: '#60a5fa' }} />
                <span className="text-xs">Logar como FM</span>
              </button>
              <button
                onClick={async () => {
                  setIsOpen(false)
                  const supabase = createClient()
                  const { data } = await supabase.rpc('list_users_with_profiles') as { data: any[] | null }
                  const ab = (data || []).find((u: any) => u.user_id === '35f32ed9-2b6d-4262-8eda-60b8cc25f438')
                  if (ab) await startImpersonating(ab.user_id, ab.email, ab.perfis)
                }}
                className="w-full flex items-center gap-3 px-4 py-2 transition-colors"
                style={{ color: '#94a3b8' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <UserCheck className="h-3.5 w-3.5" style={{ color: '#34d399' }} />
                <span className="text-xs">Logar como AB</span>
              </button>
            </div>
          )}

          {/* Impressão de Documentos */}
          <div style={{ borderBottom: '1px solid #334155' }}>
            <Link
              href="/impressao-documentos"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors"
              style={{ color: '#e2e8f0' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <Printer className="h-4 w-4" style={{ color: '#a78bfa' }} />
              <span className="text-sm">Impressão de Documentos</span>
            </Link>
          </div>

          {/* Minha Conta */}
          <div style={{ borderBottom: '1px solid #334155' }}>
            <Link
              href="/minha-conta"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors"
              style={{ color: '#e2e8f0' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <Settings className="h-4 w-4" style={{ color: '#94a3b8' }} />
              <span className="text-sm">Minha Conta</span>
            </Link>
          </div>

          {/* Tema */}
          <div style={{ borderBottom: '1px solid #334155', padding: '8px 16px' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#64748b' }}>Tema</p>
            <div className="flex gap-1">
              {THEMES.map(t => {
                const ThemeIcon = THEME_ICONS[t]
                return (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: theme === t ? '#7c3aed' : 'transparent',
                      color: theme === t ? '#fff' : '#94a3b8',
                    }}
                    title={THEME_META[t].label}
                  >
                    {t === 'dark' ? '🌙' : '☀️'} {THEME_META[t].label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Sair */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 transition-colors"
            style={{ color: '#ef4444' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <LogOut className="h-4 w-4" />
            <span className="text-sm font-medium">Sair</span>
          </button>
        </div>
      )}

      {/* Modal de impersonação */}
      <ImpersonateModal
        isOpen={showImpersonate}
        onClose={() => setShowImpersonate(false)}
        onSelect={async (userId, email, perfis) => {
          await startImpersonating(userId, email, perfis)
          setShowImpersonate(false)
        }}
      />
    </div>
  )
}
