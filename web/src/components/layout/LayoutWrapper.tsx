'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { MobileHeader } from './MobileHeader'
import { MobileDrawer } from './MobileDrawer'
import { useSidebarState } from '@/hooks/useSidebarState'
import { ToastProvider } from '@/components/ui/Toast'
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { THEMES, THEME_META, type Theme } from '@/lib/theme'

const THEME_ICONS: Record<Theme, string> = {
  dark: '🌙',
  white: '☀️',
  'half-white': '◐',
  'half-dark': '◑',
}

const AUTH_ROUTES = ['/login']

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthRoute = AUTH_ROUTES.some(route => pathname?.startsWith(route))
  const drawer = useSidebarState()
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const { theme, setTheme } = useTheme()

  if (isAuthRoute) {
    return <ToastProvider>{children}</ToastProvider>
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[var(--shell-bg)]">
        {/* Desktop sidebar (>=1024px) — mini por padrão, expansível */}
        <aside className={`theme-sidebar hidden lg:flex fixed top-0 left-0 bottom-0 ${sidebarExpanded ? 'w-64' : 'w-[72px]'} bg-slate-900 border-r border-slate-700/50 z-30 flex-col transition-all duration-200`}>
          <Sidebar mode={sidebarExpanded ? 'full' : 'mini'} />
          <button
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
            className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shadow-sm z-40"
            title={sidebarExpanded ? 'Recolher' : 'Expandir'}
          >
            {sidebarExpanded ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
          </button>
        </aside>

        {/* Tablet sidebar (768-1023px) — fixed, mini icons only */}
        <aside className="theme-sidebar hidden md:flex lg:hidden fixed top-0 left-0 bottom-0 w-[72px] bg-slate-900 border-r border-slate-700/50 z-30 flex-col">
          <Sidebar mode="mini" />
        </aside>

        {/* Mobile header (<768px) — fixed top bar */}
        <MobileHeader onMenuClick={drawer.open} />

        {/* Mobile drawer */}
        <MobileDrawer isOpen={drawer.isOpen} onClose={drawer.close}>
          <Sidebar mode="drawer" onNavigate={drawer.close} />
        </MobileDrawer>

        {/* Main content area — responsive margins */}
        <main className={`theme-content pt-14 md:pt-0 md:ml-[72px] ${sidebarExpanded ? 'lg:ml-64' : 'lg:ml-[72px]'} min-h-screen transition-all duration-200`}>
          {/* Top bar — theme selector (provisório) */}
          <div className="hidden md:flex items-center justify-end gap-1 px-4 py-0.5 border-b border-[var(--surface-200)]">
            <span className="text-xs text-[var(--shell-text-muted)] mr-1">Tema</span>
            {THEMES.map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                title={THEME_META[t].label}
                className={`px-2 py-0.5 text-xs rounded-md transition-all ${
                  theme === t
                    ? 'bg-purple-600 text-white font-semibold shadow-sm'
                    : 'text-[var(--shell-text-muted)] hover:bg-[var(--surface-100)] hover:text-[var(--shell-text)]'
                }`}
              >
                {THEME_ICONS[t]} {THEME_META[t].label}
              </button>
            ))}
          </div>
          <div className="p-4 md:px-6 md:pt-2 md:pb-6 animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </ToastProvider>
  )
}
