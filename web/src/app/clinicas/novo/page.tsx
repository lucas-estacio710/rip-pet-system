'use client'

import { useUnit } from '@/contexts/UnitContext'
import EstabelecimentoForm from '@/components/clinicas/EstabelecimentoForm'

export default function NovaClinicaPage() {
  const { hasModule } = useUnit()
  if (!hasModule('tela_clinicas')) {
    return (
      <div className="p-8 text-center">
        <p className="text-[var(--surface-500)]">Esta tela não está habilitada para sua unidade.</p>
      </div>
    )
  }
  return <EstabelecimentoForm modo="novo" />
}
