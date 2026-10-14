'use client'

// REPASSE — tela própria (14/10/2026; antes era aba do Financeiro). É onde a Matriz
// trabalha: Cremações · Acertos · Resumo, com deflator, ajuste em lote e Excel. A
// unidade vê a mesma tela, só com a própria conta e sem editar.
//
// No Financeiro, quitar o repasse abre um POPUP com este mesmo conteúdo (somente
// leitura) e o Confirmar pagamento — sem precisar sair de lá.
//
// FLS: `tela_repasse` (mig 164 — escondida nas unidades: só Matriz e super_admin entram)
// + `btn_repasse_editar` (quem edita é a Matriz).

import { useState } from 'react'
import { ArrowLeftRight, Shield } from 'lucide-react'
import { useUnit } from '@/contexts/UnitContext'
import { useFieldPermission } from '@/hooks/useFieldPermission'
import EmptyState from '@/components/ui/EmptyState'
import RepasseTab from '@/components/financeiro/RepasseTab'
import SeletorMes, { mesDeHoje } from '@/components/financeiro/SeletorMes'

const TELA = 'tela_financeiro'

export default function RepassePage() {
  const { hasModule } = useUnit()
  const { isVisible, canEdit } = useFieldPermission()
  const [mes, setMes] = useState(mesDeHoje)

  // só Matriz e super_admin (mig 164: `tela_repasse` hidden nas unidades)
  if (!hasModule('tela_repasse')) {
    return <EmptyState icon={Shield} title="Acesso restrito" description="O repasse não está liberado para o seu perfil." />
  }
  const lanca = isVisible(TELA, 'obj_fin_lancamentos') && canEdit(TELA, 'btn_lancamento_editar') && canEdit(TELA, TELA)

  return (
    <div className="animate-fade-in space-y-3">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <ArrowLeftRight className="h-4 w-4 sm:h-5 sm:w-5 text-violet-400 shrink-0" />
        <h1 className="text-[15px] font-bold sm:text-title text-[var(--shell-text)] shrink-0">Repasse</h1>
        <div className="ml-auto sm:ml-0"><SeletorMes mes={mes} onMes={setMes} /></div>
      </div>
      <RepasseTab mes={mes} somenteLeitura={!canEdit(TELA, 'btn_repasse_editar')} podeConfirmarPagamento={lanca} />
    </div>
  )
}
