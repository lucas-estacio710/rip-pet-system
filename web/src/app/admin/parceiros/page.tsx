'use client'

// /admin/parceiros — gestão do Portal de Parceiros (super_admin).
// O app do parceiro é externo (parceiro.rippet.com.br); aqui fica o que é da casa:
// convidar, pagar comissão, sortear, resolver reivindicações e configurar o programa.
// Requisitos e decisões numeradas: docs/PORTAL_PARCEIROS_REQUISITOS.md

import { useState } from 'react'
import { Handshake, QrCode, Wallet, Gift, HandHeart, SlidersHorizontal } from 'lucide-react'
import { useUnit } from '@/contexts/UnitContext'
import { useFieldPermission } from '@/hooks/useFieldPermission'
import EmptyState from '@/components/ui/EmptyState'
import ConvitesTab from './ConvitesTab'
import PagamentosTab from './PagamentosTab'
import SorteioTab from './SorteioTab'
import ReivindicacoesTab from './ReivindicacoesTab'
import OrquestradorTab from './OrquestradorTab'

const T = 'tela_parceiros'

const ABAS = [
  { key: 'obj_parc_convites', label: 'Convites', icone: QrCode },
  { key: 'obj_parc_pagamentos', label: 'Pagamentos', icone: Wallet },
  { key: 'obj_parc_sorteio', label: 'Sorteio', icone: Gift },
  { key: 'obj_parc_reivindicacoes', label: 'Reivindicações', icone: HandHeart },
  { key: 'obj_parc_orquestrador', label: 'Orquestrador', icone: SlidersHorizontal },
] as const

export default function ParceirosAdminPage() {
  const { isSuperAdmin } = useUnit()
  const { isVisible } = useFieldPermission()
  const visiveis = ABAS.filter(a => isVisible(T, a.key))
  const [ativa, setAtiva] = useState<string>(visiveis[0]?.key ?? '')

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <EmptyState icon={Handshake} title="Acesso restrito"
          description="A gestão do Portal de Parceiros é exclusiva de super admin." />
      </div>
    )
  }

  if (visiveis.length === 0) {
    return (
      <div className="p-6">
        <EmptyState icon={Handshake} title="Portal de Parceiros indisponível"
          description="Nenhuma aba está visível para esta unidade." />
      </div>
    )
  }

  const atual = visiveis.find(a => a.key === ativa) ?? visiveis[0]

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <header className="mb-5 flex items-center gap-3">
        <Handshake className="h-6 w-6 text-[var(--brand-500)]" />
        <h1 className="text-xl font-semibold text-[var(--surface-800)]">Portal de Parceiros</h1>
      </header>

      {/* Abas — rolam na horizontal no mobile em vez de estourar a tela */}
      <nav className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1 border-b border-[var(--surface-200)]">
          {visiveis.map(a => {
            const Icone = a.icone
            const on = atual.key === a.key
            return (
              <button key={a.key} onClick={() => setAtiva(a.key)}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition ${
                  on
                    ? 'border-[var(--brand-500)] text-[var(--surface-800)]'
                    : 'border-transparent text-[var(--surface-400)] hover:text-[var(--surface-600)]'
                }`}>
                <Icone className="h-4 w-4" />
                {a.label}
              </button>
            )
          })}
        </div>
      </nav>

      {atual.key === 'obj_parc_convites' && <ConvitesTab />}
      {atual.key === 'obj_parc_pagamentos' && <PagamentosTab />}
      {atual.key === 'obj_parc_sorteio' && <SorteioTab />}
      {atual.key === 'obj_parc_reivindicacoes' && <ReivindicacoesTab />}
      {atual.key === 'obj_parc_orquestrador' && <OrquestradorTab />}
    </div>
  )
}
