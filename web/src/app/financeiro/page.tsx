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
import { Wallet, Receipt, ArrowLeftRight, BarChart3, Landmark, Banknote, Shield, Plus, ClipboardPaste, type LucideIcon } from 'lucide-react'
import { useUnit } from '@/contexts/UnitContext'
import { useFieldPermission } from '@/hooks/useFieldPermission'
import EmptyState from '@/components/ui/EmptyState'
import LancamentosTab from '@/components/financeiro/LancamentosTab'
import RepasseTab from '@/components/financeiro/RepasseTab'
import DRETab from '@/components/financeiro/DRETab'
import ContasTab from '@/components/financeiro/ContasTab'
import CaixaTab from '@/components/financeiro/CaixaTab'
import { ITENS_LANCAR, type AcaoLancar } from '@/lib/lancar'

const TELA = 'tela_financeiro'

type TabDef = { key: string; obj: string; label: string; icon: LucideIcon }

const TABS: TabDef[] = [
  { key: 'lancamentos', obj: 'obj_fin_lancamentos', label: 'Lançamentos', icon: Wallet },
  { key: 'repasse',     obj: 'obj_fin_repasse',     label: 'Repasse',     icon: ArrowLeftRight },
  { key: 'caixa',       obj: 'obj_fin_caixa',       label: 'Caixa',       icon: Banknote },
  { key: 'dre',         obj: 'obj_fin_dre',         label: 'DRE',         icon: BarChart3 },
  { key: 'contas',      obj: 'obj_fin_contas',      label: 'Contas',      icon: Landmark },
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

  // + LANÇAR (lib/lancar.ts). Cada item só aparece pra quem pode lançar aquilo —
  // as mesmas chaves que travavam os botões dentro das abas.
  const [menuLancar, setMenuLancar] = useState(false)
  const [comando, setComando] = useState<AcaoLancar | null>(null)
  const temAba = (k: string) => visibleTabs.some(t => t.key === k)
  const lancaDespesa = temAba('lancamentos') && canEdit(TELA, 'btn_lancamento_editar') && canEdit(TELA, TELA)
  const pode: Record<AcaoLancar, boolean> = {
    importar: lancaDespesa,
    despesa: lancaDespesa,
    recebiveis: lancaDespesa && isVisible(TELA, 'obj_fin_receitas_prazo'),
    quitacao: lancaDespesa,
    movimentacao: temAba('caixa') && canEdit(TELA, 'btn_caixa_editar'),
  }
  const itensLancar = ITENS_LANCAR.filter(i => pode[i.acao])
  function lancar(acao: AcaoLancar) {
    setMenuLancar(false)
    setActive(acao === 'movimentacao' ? 'caixa' : 'lancamentos')
    setComando(acao)
  }
  const comandoPara = (aba: string) =>
    comando && (aba === 'caixa' ? comando === 'movimentacao' : comando !== 'movimentacao') ? comando : null

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

        {itensLancar.length > 0 && (
          <div className="relative ml-auto">
            <button onClick={() => setMenuLancar(v => !v)} className="btn-primary text-sm">
              <Plus className="h-4 w-4" /> Lançar
            </button>
            {menuLancar && (
              <>
                {/* fundo transparente: clicar fora fecha */}
                <div className="fixed inset-0 z-40" onClick={() => setMenuLancar(false)} />
                <div className="absolute right-0 mt-1 z-50 w-72 max-w-[calc(100vw-2rem)] card p-1 shadow-xl">
                  {itensLancar.map(i => (
                    <button key={i.acao} onClick={() => lancar(i.acao)}
                      className={`w-full text-left px-3 py-2 rounded-[var(--radius-md)] hover:bg-[var(--surface-50)] ${i.acao === 'importar' ? 'border-b border-[var(--surface-200)] mb-1' : ''}`}>
                      <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--surface-800)]">
                        {i.acao === 'importar' && <ClipboardPaste className="h-3.5 w-3.5 text-emerald-500" />}
                        {i.titulo}
                      </span>
                      <span className="block text-[11px] text-[var(--surface-500)]">{i.detalhe}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {activeTab?.key === 'lancamentos' ? (
        // ⚠️ Era a ÚNICA aba do financeiro que não recebia `somenteLeitura`
        // (achado em 13/09/2026): Repasse, Caixa e Contas respeitavam o FLS e
        // Lançamentos não, então a unidade em `read` — que é o caso de Santos —
        // consultava as três e LANÇAVA na quarta.
        //
        // Duas travas, e basta uma: a chave própria (granularidade futura) e a
        // permissão da TELA. A segunda é o que dá efeito hoje — "a tela está em
        // leitura" tem de significar que nada nela se edita, senão `read` vira
        // uma etiqueta sem consequência.
        <LancamentosTab somenteLeitura={!canEdit(TELA, 'btn_lancamento_editar') || !canEdit(TELA, TELA)}
          comando={comandoPara('lancamentos')} onComandoFeito={() => setComando(null)} />
      ) : activeTab?.key === 'repasse' ? (
        <RepasseTab somenteLeitura={repasseSomenteLeitura} />
      ) : activeTab?.key === 'caixa' ? (
        <CaixaTab somenteLeitura={!canEdit(TELA, 'btn_caixa_editar')}
          comando={comandoPara('caixa')} onComandoFeito={() => setComando(null)} />
      ) : activeTab?.key === 'dre' ? (
        <DRETab />
      ) : activeTab?.key === 'contas' ? (
        <ContasTab somenteLeitura={!canEdit(TELA, 'btn_contas_editar')} />
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
