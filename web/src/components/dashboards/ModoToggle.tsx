'use client'

import { type DashboardModo } from '@/lib/dashboard-modo'

/**
 * Toggle Remoções ↔ Contratos.
 *
 * Vive em arquivo próprio porque tem DOIS donos com estados diferentes: a barra de filtros
 * (Operacional + Financeiro, que também dividem período) e a aba Evolução, que desde 02/09/2026
 * tem modo independente. Duplicar o componente nos dois lugares era o caminho curto — e é
 * exatamente o tipo de cópia que já custou caro neste projeto (ver incidente SP47 no FLOW §3.3).
 */
export default function ModoToggle({
  modo,
  selectModo,
}: {
  modo: DashboardModo
  selectModo: (m: DashboardModo) => void
}) {
  return (
    <div className="inline-flex rounded-full border border-[var(--surface-300)] p-0.5 bg-[var(--surface-0)]">
      {([['remocoes', 'Remoções'], ['contratos', 'Contratos']] as const).map(([key, label]) => {
        const isActive = modo === key
        return (
          <button
            key={key}
            onClick={() => selectModo(key)}
            className="text-[11px] font-medium px-2.5 py-0.5 rounded-full transition-colors"
            style={{
              background: isActive ? 'var(--brand-500)' : 'transparent',
              color: isActive ? '#fff' : 'var(--surface-600)',
            }}
            title={key === 'remocoes'
              ? 'Conta remoções (pet já coletado), por data de acolhimento'
              : 'Conta todos os contratos (inclui preventivos), por data do contrato'}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
