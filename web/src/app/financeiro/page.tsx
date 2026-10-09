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

import { useCallback, useMemo, useState } from 'react'
import { Wallet, Receipt, ArrowLeftRight, BarChart3, Landmark, Banknote, Shield, Plus, ClipboardPaste, LayoutDashboard, Settings, type LucideIcon } from 'lucide-react'
import { useUnit } from '@/contexts/UnitContext'
import { useFieldPermission } from '@/hooks/useFieldPermission'
import EmptyState from '@/components/ui/EmptyState'
import LancamentosTab from '@/components/financeiro/LancamentosTab'
import RepasseTab from '@/components/financeiro/RepasseTab'
import DRETab from '@/components/financeiro/DRETab'
import ContasTab from '@/components/financeiro/ContasTab'
import CaixaTab from '@/components/financeiro/CaixaTab'
import VisaoMesTab from '@/components/financeiro/VisaoMesTab'
import SeletorMes, { mesDeHoje } from '@/components/financeiro/SeletorMes'
import { ITENS_LANCAR, type AcaoLancar } from '@/lib/lancar'

const TELA = 'tela_financeiro'

type TabDef = { key: string; obj: string; label: string; icon: LucideIcon }

// Redesenho V2 (09/10/2026): a Visão do mês abre a tela; Contas é configuração
// e sai das abas pra engrenagem (continua sendo a mesma aba por dentro).
const TABS: TabDef[] = [
  { key: 'visao',       obj: 'obj_fin_visao',       label: 'Visão do mês', icon: LayoutDashboard },
  { key: 'lancamentos', obj: 'obj_fin_lancamentos', label: 'Lançamentos', icon: Wallet },
  { key: 'caixa',       obj: 'obj_fin_caixa',       label: 'Caixa',       icon: Banknote },
  { key: 'repasse',     obj: 'obj_fin_repasse',     label: 'Repasse',     icon: ArrowLeftRight },
  { key: 'dre',         obj: 'obj_fin_dre',         label: 'Resultado (DRE)', icon: BarChart3 },
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
  // O MÊS É UM SÓ (09/10/2026): escolhido acima das abas, vale pra todas.
  const [mes, setMes] = useState(mesDeHoje)
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
  // useCallback: a Visão do mês recarrega quando estes mudam — sem memo, laço.
  const lancar = useCallback((acao: AcaoLancar) => {
    setMenuLancar(false)
    setActive(acao === 'movimentacao' ? 'caixa' : 'lancamentos')
    setComando(acao)
  }, [])
  const irPara = useCallback((aba: string) => setActive(aba), [])
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

        <div className="flex items-center gap-2 ml-auto">
        {temAba('contas') && (
          <button onClick={() => setActive('contas')} aria-label="Contas e configurações" title="Contas"
                  className={`h-9 w-9 rounded-[10px] border flex items-center justify-center ${activeTab?.key === 'contas' ? 'border-[var(--brand-500)] text-[var(--brand-500)]' : 'border-[var(--surface-300)] text-[var(--surface-600)] hover:bg-[var(--surface-100)]'}`}>
            <Settings className="h-4 w-4" />
          </button>
        )}
        {itensLancar.length > 0 && (
          <div className="relative">
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
      </div>

      {activeTab?.key !== 'contas' && <SeletorMes mes={mes} onMes={setMes} />}

      {/* Abas sublinhadas (V2): roxo só na ativa. Contas mora na engrenagem. */}
      {visibleTabs.filter(t => t.key !== 'contas').length > 1 && (
        <nav className="flex gap-6 overflow-x-auto border-b border-[var(--surface-200)] -mt-1">
          {visibleTabs.filter(t => t.key !== 'contas').map(t => {
            const ativa = activeTab?.key === t.key
            return (
              <button key={t.key} onClick={() => setActive(t.key)}
                      className={`whitespace-nowrap text-[15px] py-2.5 border-b-2 -mb-px transition-colors ${ativa ? 'font-semibold text-[var(--surface-900)] border-[var(--brand-500)]' : 'text-[var(--surface-500)] border-transparent hover:text-[var(--surface-800)]'}`}>
                {t.label}
              </button>
            )
          })}
        </nav>
      )}

      {activeTab?.key === 'visao' ? (
        <VisaoMesTab mes={mes}
          verResultado={temAba('dre')} verCaixa={temAba('caixa')} verRepasse={temAba('repasse')} verLancamentos={temAba('lancamentos')}
          onIr={irPara} onLancar={itensLancar.length ? lancar : undefined} />
      ) : activeTab?.key === 'lancamentos' ? (
        // ⚠️ Era a ÚNICA aba do financeiro que não recebia `somenteLeitura`
        // (achado em 13/09/2026): Repasse, Caixa e Contas respeitavam o FLS e
        // Lançamentos não, então a unidade em `read` — que é o caso de Santos —
        // consultava as três e LANÇAVA na quarta.
        //
        // Duas travas, e basta uma: a chave própria (granularidade futura) e a
        // permissão da TELA. A segunda é o que dá efeito hoje — "a tela está em
        // leitura" tem de significar que nada nela se edita, senão `read` vira
        // uma etiqueta sem consequência.
        <LancamentosTab mes={mes} somenteLeitura={!canEdit(TELA, 'btn_lancamento_editar') || !canEdit(TELA, TELA)}
          comando={comandoPara('lancamentos')} onComandoFeito={() => setComando(null)} />
      ) : activeTab?.key === 'repasse' ? (
        <RepasseTab mes={mes} somenteLeitura={repasseSomenteLeitura} />
      ) : activeTab?.key === 'caixa' ? (
        <CaixaTab mes={mes} somenteLeitura={!canEdit(TELA, 'btn_caixa_editar')}
          comando={comandoPara('caixa')} onComandoFeito={() => setComando(null)} />
      ) : activeTab?.key === 'dre' ? (
        <DRETab mes={mes} />
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
