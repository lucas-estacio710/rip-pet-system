'use client'

import { useUnit } from '@/contexts/UnitContext'
import { UserCheck, X } from 'lucide-react'

export function ImpersonateBanner() {
  const { impersonating, impersonatedEmail, stopImpersonating } = useUnit()

  if (!impersonating) return null

  return (
    <div className="flex items-center justify-center gap-3 px-4 py-1.5 text-xs font-medium" style={{ background: '#f59e0b', color: '#1e293b' }}>
      <UserCheck className="h-3.5 w-3.5" />
      <span>Visualizando como <strong>{impersonatedEmail}</strong></span>
      <button
        onClick={stopImpersonating}
        className="flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold transition-colors"
        style={{ background: 'rgba(0,0,0,0.15)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.25)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.15)')}
      >
        <X className="h-3 w-3" />
        Voltar
      </button>
    </div>
  )
}
