'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  LayoutDashboard,
  TextSelect,
  Zap,
  FileCheck,
  Route,
  ShelvingUnit,
  Users,
  Settings,
  LogOut
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, countKey: null },
  { href: '/leads', label: 'Leads', icon: Zap, countKey: 'leads' as const },
  { href: '/fichas', label: 'Fichas', icon: TextSelect, countKey: 'fichas' as const },
  { href: '/contratos?status=ativo', label: 'Contratos', icon: FileCheck, countKey: 'contratos' as const },
  { href: '/supindas', label: 'Supindas', icon: Route, countKey: null },
  { href: '/estoque', label: 'Estoque', icon: ShelvingUnit, countKey: null },
  { href: '/tutores', label: 'Tutores', icon: Users, countKey: null },
  { href: '/configuracoes', label: 'Configurações', icon: Settings, countKey: null },
]

type Props = {
  /** 'full' = desktop with text, 'mini' = tablet icons only, 'drawer' = inside mobile drawer */
  mode: 'full' | 'mini' | 'drawer'
  onNavigate?: () => void
}

export function Sidebar({ mode, onNavigate }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [contratosCount, setContratosCount] = useState<number | null>(null)
  const [fichasCount, setFichasCount] = useState<number | null>(null)
  const [leadsCount, setLeadsCount] = useState<number | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const supabase = createClient()
  const showText = mode !== 'mini'

  useEffect(() => {
    async function fetchData() {
      const [{ count: cCount }, { count: fCount }, { count: lCount }, { data: { user } }] = await Promise.all([
        supabase.from('contratos').select('*', { count: 'exact', head: true }),
        supabase.from('fichas').select('*', { count: 'exact', head: true }).eq('processada', false),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('convertido', false),
        supabase.auth.getUser(),
      ])
      setContratosCount(cCount)
      setFichasCount(fCount)
      setLeadsCount(lCount)
      setUserEmail(user?.email ?? null)
    }
    fetchData()
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      {mode !== 'drawer' && (
        <div className={`border-b border-slate-700/50 ${showText ? 'p-4' : 'p-3 flex justify-center'}`}>
          <Link href="/" className="block" onClick={onNavigate}>
            {showText ? (
              <Image
                src="/logo.png"
                alt="R.I.P. Pet"
                width={160}
                height={44}
                priority
                className="h-11 w-auto"
              />
            ) : (
              <Image
                src="/logo_rounded.png"
                alt="R.I.P. Pet"
                width={44}
                height={44}
                priority
                className="h-11 w-11 object-contain"
              />
            )}
          </Link>
        </div>
      )}

      {/* Navigation */}
      <nav className={`flex-1 ${showText ? 'p-3' : 'p-2'}`}>
        <ul className="space-y-1">
          {navItems.map((item) => {
            const hrefPath = item.href.split('?')[0]
            const isActive = pathname === hrefPath || pathname?.startsWith(hrefPath + '/')
            const Icon = item.icon

            const countValue = item.countKey === 'contratos' ? contratosCount
              : item.countKey === 'fichas' ? fichasCount
              : item.countKey === 'leads' ? leadsCount
              : null
            const isFichas = item.countKey === 'fichas'
            const isLeads = item.countKey === 'leads'

            if (!showText) {
              // Mini mode — icon only with tooltip
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={`
                      relative group flex items-center justify-center w-12 h-12 mx-auto rounded-lg transition-all duration-200
                      ${isActive
                        ? 'bg-white/10 text-white'
                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                      }
                    `}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-sky-400 rounded-r-full" />
                    )}
                    <Icon className="h-5 w-5" />
                    {/* Fichas amber badge */}
                    {isFichas && fichasCount !== null && fichasCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold bg-amber-500 text-white rounded-full animate-pulse">
                        {fichasCount}
                      </span>
                    )}
                    {/* Leads green badge */}
                    {isLeads && leadsCount !== null && leadsCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold bg-emerald-500 text-white rounded-full animate-pulse">
                        {leadsCount}
                      </span>
                    )}
                    {/* Tooltip */}
                    <span className="absolute left-full ml-3 px-2.5 py-1.5 rounded-md bg-slate-700 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                      {item.label}
                      {countValue !== null && (
                        <span className={`ml-1.5 ${isFichas ? 'text-amber-300' : isLeads ? 'text-emerald-300' : 'text-sky-300'}`}>{countValue}</span>
                      )}
                    </span>
                  </Link>
                </li>
              )
            }

            // Full / Drawer mode — icon + text
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={`
                    relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
                    ${isActive
                      ? 'bg-white/10 text-white font-semibold'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                    }
                  `}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-sky-400 rounded-r-full" />
                  )}
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="flex-1 text-sm">{item.label}</span>
                  {isFichas && fichasCount !== null && fichasCount > 0 && (
                    <span className="min-w-[20px] h-5 flex items-center justify-center px-1.5 text-[11px] font-bold bg-amber-500 text-white rounded-full animate-pulse">
                      {fichasCount}
                    </span>
                  )}
                  {isLeads && leadsCount !== null && leadsCount > 0 && (
                    <span className="min-w-[20px] h-5 flex items-center justify-center px-1.5 text-[11px] font-bold bg-emerald-500 text-white rounded-full animate-pulse">
                      {leadsCount}
                    </span>
                  )}
                  {item.countKey === 'contratos' && contratosCount !== null && (
                    <span className="text-xs font-medium text-sky-400 text-mono tabular-nums">
                      {contratosCount.toLocaleString('pt-BR')}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className={`border-t border-slate-700/50 ${showText ? 'p-4' : 'p-3'}`}>
        {showText && userEmail && (
          <p className="text-xs text-slate-500 truncate mb-2" title={userEmail}>
            {userEmail}
          </p>
        )}
        <button
          onClick={handleSignOut}
          className={`
            flex items-center transition-colors
            ${showText
              ? 'gap-2 text-xs text-slate-500 hover:text-red-400 w-full'
              : 'justify-center w-12 h-12 mx-auto rounded-lg text-slate-500 hover:bg-red-500/10 hover:text-red-400'
            }
          `}
          title="Sair"
        >
          <LogOut className="h-4 w-4" />
          {showText && <span>Sair</span>}
        </button>
      </div>
    </div>
  )
}
