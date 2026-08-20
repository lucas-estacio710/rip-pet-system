'use client'

// FINANCEIRO — uma tela só, três abas (migrations 103–111).
//
//   Lançamentos → o que a unidade gastou (o operador usa todo dia)
//   Repasse     → a cobrança mensal da Matriz pelos pets cremados
//   DRE         → o resultado do mês, montado a partir dos dois de cima
//
// POR QUE JUNTO: são o mesmo assunto e a mesma pergunta ("como está o mês?").
// Separados em dois itens de menu, ninguém ligava um ao outro — e a DRE, que é
// o ponto de chegada, não teria onde morar.
//
// FLS: `tela_financeiro` liga/desliga a tela por unidade (só as unidades que
// contrataram o módulo têm). Cada aba tem seu `obj_fin_*`, e o repasse tem ainda
// `btn_repasse_editar` — a unidade CONSULTA a própria cobrança, mas quem edita
// (deflator, acertos, fechar, marcar pago) é a Matriz.

import { useMemo, useState } from 'react'
import { Wallet, Receipt, ArrowLeftRight, BarChart3, Shield, type LucideIcon } from 'lucide-react'
import { useUnit } from '@/contexts/UnitContext'
import { useFieldPermission } from '@/hooks/useFieldPermission'
import EmptyState from '@/components/ui/EmptyState'
import LancamentosTab from '@/components/financeiro/LancamentosTab'
import RepasseTab from '@/components/financeiro/RepasseTab'
import DRETab from '@/components/financeiro/DRETab'

const TELA = 'tela_financeiro'

type TabDef = { key: string; obj: string; label: string; icon: LucideIcon }

const TABS: TabDef[] = [
  { key: 'lancamentos', obj: 'obj_fin_lancamentos', label: 'Lançamentos', icon: Wallet },
  { key: 'repasse',     obj: 'obj_fin_repasse',     label: 'Repasse',     icon: ArrowLeftRight },
  { key: 'dre',         obj: 'obj_fin_dre',         label: 'DRE',         icon: BarChart3 },
]

export default function FinanceiroPage() {
  const { hasModule } = useUnit()
  const { isVisible, canEdit } = useFieldPermission()

  const podeVer = hasModule(TELA)
  // Sem permissão de edição = a unidade só consulta a própria cobrança.
  const repasseSomenteLeitura = !canEdit(TELA, 'btn_repasse_editar')

  const visibleTabs = useMemo(() => TABS.filter(t => isVisible(TELA, t.obj)), [isVisible])
  const [active, setActive] = useState<string | null>(null)
  const activeTab = visibleTabs.find(t => t.key === active) ?? visibleTabs[0] ?? null

  if (!podeVer) {
    return (
      <EmptyState
        icon={Shield}
        title="Acesso restrito"
        description="O módulo financeiro não está liberado para a sua unidade."
      />
    )
  }

  return (
    <div className="animate-fade-in space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Receipt className="h-5 w-5 text-emerald-500 shrink-0" />
        <h1 className="text-title text-[var(--shell-text)]">Financeiro</h1>

        {visibleTabs.length > 1 && (
          <div className="flex flex-wrap gap-1.5 ml-1">
            {visibleTabs.map(t => {
              const Icon = t.icon
              const isActive = activeTab?.key === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setActive(t.key)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full transition-colors"
                  style={{
                    background: isActive ? 'var(--brand-500)' : 'transparent',
                    color: isActive ? '#fff' : 'var(--surface-600)',
                    border: `1px solid ${isActive ? 'transparent' : 'var(--surface-300)'}`,
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {activeTab?.key === 'lancamentos' ? (
        <LancamentosTab />
      ) : activeTab?.key === 'repasse' ? (
        <RepasseTab somenteLeitura={repasseSomenteLeitura} />
      ) : activeTab?.key === 'dre' ? (
        <DRETab />
      ) : (
        <EmptyState
          icon={Shield}
          title="Nada liberado"
          description="Nenhuma aba do financeiro está visível para o seu perfil."
        />
      )}
    </div>
  )
}
