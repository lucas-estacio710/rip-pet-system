'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { TextSelect, FileCheck, Route, ShelvingUnit, BarChart3 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'

type BottomItem = {
  href: string
  label: string
  icon: typeof TextSelect
  module: string
  iconColor: string
  badge: 'fichas' | null
}

// 5 atalhos fixos de deslocamento rápido (mobile). Ordem = fluxo operacional.
const bottomItems: BottomItem[] = [
  { href: '/fichas', label: 'Fichas', icon: TextSelect, module: 'tela_fichas', iconColor: '#38bdf8', badge: 'fichas' },
  { href: '/contratos?status=ativo', label: 'Pipeline', icon: FileCheck, module: 'tela_pipeline', iconColor: '#f59e0b', badge: null },
  { href: '/encaminhamentos', label: 'Encam.', icon: Route, module: 'tela_entregas', iconColor: '#bef264', badge: null },
  { href: '/estoque', label: 'Estoque', icon: ShelvingUnit, module: 'tela_estoque', iconColor: '#a0522d', badge: null },
  { href: '/dashboard-pipeline', label: 'Painéis', icon: BarChart3, module: 'tela_dashboards', iconColor: '#10b981', badge: null },
]

export function MobileBottomNav() {
  const pathname = usePathname()
  const { hasModule, currentUnit } = useUnit()
  const supabase = createClient()
  const [fichasCount, setFichasCount] = useState<number | null>(null)

  // FLS: 1 toggle controla a barra inteira (default permissivo = visível)
  const barraVisivel = hasModule('nav_bottom')

  // Cada atalho ainda respeita a visibilidade da própria tela
  const visibleItems = bottomItems.filter(item => hasModule(item.module))

  useEffect(() => {
    if (!barraVisivel) return
    async function fetchFichas() {
      let q = supabase
        .from('fichas')
        .select('*', { count: 'exact', head: true })
        .or('processada.is.null,processada.eq.false')
        .or('op_dados.is.null,op_dados.not.cs.{"cancelada":true}')
      if (currentUnit) q = q.eq('unidade_id', currentUnit.id)
      const { count } = await q
      setFichasCount(count)
    }
    fetchFichas()
  }, [currentUnit?.id, barraVisivel])

  if (!barraVisivel || visibleItems.length === 0) return null

  return (
    // theme-content (não theme-sidebar) → a barra segue o tema claro/escuro do app
    <nav
      className="theme-content fixed bottom-0 left-0 right-0 z-40 md:hidden border-t"
      style={{ background: 'var(--surface-0)', borderColor: 'var(--surface-200)' }}
    >
      <ul className="flex items-stretch" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {visibleItems.map((item) => {
          const hrefPath = item.href.split('?')[0]
          const isActive = pathname === hrefPath || pathname?.startsWith(hrefPath + '/')
          const Icon = item.icon
          const color = item.iconColor
          const showFichasBadge = item.badge === 'fichas' && fichasCount !== null && fichasCount > 0

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                // A-quadrado: fundo translúcido da cor preenche a célula inteira (rounded-none).
                // Por alpha-blending fica "mais claro que o fundo" no tema escuro e "mais escuro" no claro.
                className="relative flex flex-col items-center justify-center gap-0.5 min-h-[56px] py-1.5 transition-all duration-200 active:scale-95"
                style={isActive ? { backgroundColor: color + '2b' } : undefined}
              >
                {/* D — barrinha no topo, ocupando a largura da célula */}
                {isActive && (
                  <span className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: color }} />
                )}

                {/* ícone — altura fixa pra o scale não pular o layout */}
                <span className="relative flex items-center justify-center h-7">
                  <Icon
                    className={isActive ? '' : 'text-[var(--surface-400)]'}
                    style={{
                      color: isActive ? color : undefined,
                      width: isActive ? 25 : 20,
                      height: isActive ? 25 : 20,
                      // C — glow/halo na cor do ícone
                      filter: isActive ? `drop-shadow(0 0 6px ${color})` : undefined,
                      transition: 'all 200ms',
                    }}
                  />
                  {showFichasBadge && (
                    <span className="absolute -top-1 -right-2.5 min-w-[16px] h-4 flex items-center justify-center px-1 text-[9px] font-bold bg-amber-500 text-white rounded-full">
                      {fichasCount}
                    </span>
                  )}
                </span>

                <span
                  className={`leading-none transition-all duration-200 ${
                    isActive
                      ? 'text-[var(--surface-800)] text-[10px] font-bold'
                      : 'text-[var(--surface-400)] text-[9px] font-medium'
                  }`}
                >
                  {item.label}
                </span>

                {/* E — dot indicador embaixo do label */}
                <span
                  className="w-1 h-1 rounded-full transition-all duration-200"
                  style={{ background: isActive ? color : 'transparent' }}
                />
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
