'use client'

import { Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useTheme } from '@/hooks/useTheme'
import { THEMES, type Theme } from '@/lib/theme'

const THEME_ICONS: Record<Theme, string> = {
  dark: '🌙',
  white: '☀️',
  'half-white': '◐',
  'half-dark': '◑',
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/contratos': 'Contratos',
  '/supindas': 'Supindas',
  '/estoque': 'Estoque',
  '/tutores': 'Tutores',
  '/configuracoes': 'Configurações',
}

type Props = {
  onMenuClick: () => void
}

export function MobileHeader({ onMenuClick }: Props) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()

  function cycleTheme() {
    const idx = THEMES.indexOf(theme)
    setTheme(THEMES[(idx + 1) % THEMES.length])
  }

  // Get title from exact match or parent route
  const title = PAGE_TITLES[pathname ?? '']
    || Object.entries(PAGE_TITLES).find(([route]) => pathname?.startsWith(route + '/'))?.[1]
    || 'R.I.P. Pet'

  return (
    <header className="theme-sidebar fixed top-0 left-0 right-0 z-40 md:hidden">
      <div className="flex items-center justify-between h-14 px-4 bg-slate-900 border-b border-slate-700/50">
        <button
          onClick={onMenuClick}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <h1 className="text-subtitle text-white truncate mx-3">
          {title}
        </h1>

        {/* Theme cycle button (provisório) */}
        <button
          onClick={cycleTheme}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors text-sm"
          title={`Tema: ${theme}`}
        >
          {THEME_ICONS[theme]}
        </button>
      </div>
    </header>
  )
}
