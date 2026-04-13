'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { useUnit } from '@/contexts/UnitContext'

// Rotas em ordem de prioridade pra redirect
const FALLBACK_ROUTES = [
  { module: 'tela_fichas', path: '/fichas' },
  { module: 'tela_pipeline', path: '/contratos?status=ativo' },
  { module: 'tela_dashboard', path: '/dashboard' },
  { module: 'tela_leads', path: '/leads' },
  { module: 'tela_entregas', path: '/encaminhamentos' },
  { module: 'tela_gc', path: '/gc' },
  { module: 'tela_ads_shield', path: '/ads-shield' },
]

type Props = {
  module: string
  children: React.ReactNode
}

export default function ModuleGuard({ module, children }: Props) {
  const { hasModule, isLoading, currentUnit } = useUnit()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (isLoading || !currentUnit) return
    if (hasModule(module)) return

    // Encontrar primeira tela disponível pra redirecionar
    const fallback = FALLBACK_ROUTES.find(r => r.module !== module && hasModule(r.module))
    router.replace(fallback?.path || '/fichas')
  }, [isLoading, module, hasModule, router, currentUnit])

  if (isLoading || !currentUnit || !hasModule(module)) {
    return <div className="min-h-[50vh]" />
  }

  return <>{children}</>
}
