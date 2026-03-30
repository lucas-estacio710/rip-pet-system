'use client'

import { Tag, Shield } from 'lucide-react'
import { useUnit } from '@/contexts/UnitContext'
import NomeRetorno from '@/components/configuracoes/NomeRetorno'
import EmptyState from '@/components/ui/EmptyState'

export default function NomesComerciais() {
  const { isSuperAdmin } = useUnit()

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in">
        <EmptyState icon={Shield} title="Acesso restrito" description="Somente administradores podem acessar esta página." />
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-amber-900/30 items-center justify-center">
          <Tag className="h-5 w-5 text-amber-500" />
        </div>
        <div>
          <h1 className="text-title text-[var(--shell-text)]">Nomes Comerciais</h1>
          <p className="text-small text-[var(--shell-text-muted)]">Nomes de retorno para protocolo de entrega</p>
        </div>
      </div>
      <NomeRetorno />
    </div>
  )
}
