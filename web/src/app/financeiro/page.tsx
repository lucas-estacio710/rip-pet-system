'use client'

// FINANCEIRO — Livro-Caixa + Resultados-DRE (14/10/2026, reorganização pedida pelo Lucas).
//
//   Livro-Caixa      → a antiga Visão do mês: saldo das contas, contas de acompanhamento,
//                      balanço, lançamentos e faturas do cartão
//   Resultados-DRE   → o resultado do mês, linha a linha
//
// O que SAIU das abas e onde foi parar:
//   · Lançamentos → o cartão Lançamentos do Livro-Caixa (clicar abre o Editar). A aba segue
//                   MONTADA só com os popups (`soModais`): despesa, Importar, Quitação.
//   · Repasse     → tela própria, /repasse (onde a Matriz trabalha). Aqui, quitar abre um
//                   POPUP com o repasse do mês (somente leitura) e o Confirmar pagamento.
//   · Caixa       → montado só com o popup de Movimentação na Conta.
//   · Contas e Faturas → morreu: saldo/extrato nos cartões do Saldo das Contas, faturas no
//                   cartão Faturas do cartão.
//   · "+ Lançar"  → botão "+" flutuante, canto inferior direito.
//
// FLS: `tela_financeiro` liga/desliga a tela por unidade; cada parte segue com seu `obj_fin_*`
// e o repasse com `btn_repasse_editar` (a unidade CONSULTA, quem edita é a Matriz).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Receipt, BarChart3, BookOpen, Shield, Plus, Settings, type LucideIcon } from 'lucide-react'
import { useUnit } from '@/contexts/UnitContext'
import { useFieldPermission } from '@/hooks/useFieldPermission'
import EmptyState from '@/components/ui/EmptyState'
import Modal from '@/components/ui/Modal'
import LancamentosTab from '@/components/financeiro/LancamentosTab'
import ConferirRepasse from '@/components/financeiro/ConferirRepasse'
import ConferirFatura from '@/components/financeiro/ConferirFatura'
import DRETab from '@/components/financeiro/DRETab'
import ContasTab from '@/components/financeiro/ContasTab'
import CaixaTab from '@/components/financeiro/CaixaTab'
import VisaoMesTab from '@/components/financeiro/VisaoMesTab'
import SeletorMes, { mesDeHoje, rotuloMesLongo } from '@/components/financeiro/SeletorMes'
import type { ContaNoMes } from '@/components/financeiro/ContasDoMes'
import { ITENS_LANCAR, MENU_LANCAR, type AcaoLancar } from '@/lib/lancar'

const TELA = 'tela_financeiro'

type TabDef = { key: string; obj: string; label: string; icon: LucideIcon }
// As DUAS abas que aparecem (14/10/2026).
const ABAS: TabDef[] = [
  { key: 'visao', obj: 'obj_fin_visao', label: 'Livro-Caixa', icon: BookOpen },
  { key: 'dre',   obj: 'obj_fin_dre',   label: 'Resultados-DRE', icon: BarChart3 },
]

export default function FinanceiroPage() {
  const { hasModule, currentUnit } = useUnit()
  const { isVisible, canEdit } = useFieldPermission()

  const podeVer = hasModule(TELA)
  const visibleTabs = useMemo(() => ABAS.filter(t => isVisible(TELA, t.obj)), [isVisible])
  const [active, setActive] = useState<string | null>(null)
  const activeTab = visibleTabs.find(t => t.key === active) ?? visibleTabs[0] ?? null
  // As partes que viraram popup continuam respeitando o FLS de quando eram abas.
  const ve = (obj: string) => isVisible(TELA, obj)
  const temLanc = ve('obj_fin_lancamentos'), temCaixa = ve('obj_fin_caixa'), temRepasse = ve('obj_fin_repasse'), temContas = ve('obj_fin_contas')

  // O MÊS É UM SÓ (09/10/2026): escolhido no topo, vale pra todas.
  const [mes, setMesBruto] = useState(mesDeHoje)
  // TROCAR O MÊS NÃO MEXE NA ALTURA (14/10/2026): guarda onde a pessoa está e volta pra lá
  // enquanto os blocos recarregam (eles mudam de tamanho no meio do caminho).
  const marco = currentUnit?.financeiro_desde ? currentUnit.financeiro_desde.slice(0, 7) : null
  const setMes = useCallback((m: string) => {
    const el = document.scrollingElement || document.documentElement
    const y = el.scrollTop
    setMesBruto(m)
    for (const t of [0, 120, 400, 900]) setTimeout(() => { el.scrollTop = y }, t)
  }, [])
  // a linha "Financeiro + mês" fica grudada no topo: sticky precisa do allow-sticky
  // (globals.css — a rede anti-estouro do body mata o sticky por padrão)
  useEffect(() => {
    document.body.classList.add('allow-sticky')
    return () => document.body.classList.remove('allow-sticky')
  }, [])
  // CONFIGURAÇÕES DE CONTAS (engrenagem, na linha das abas). Fechar recarrega o Livro-Caixa.
  const [configAberto, setConfigAberto] = useState(false)
  const [versaoConfig, setVersaoConfig] = useState(0)
  const [contaImportar, setContaImportar] = useState<string | null>(null)
  // PAGUEI (conta de acompanhamento): a despesa abre já preenchida.
  const [despesaInicial, setDespesaInicial] = useState<{ contaFixaId: string; nome: string; categoriaId: string | null; valor: number; fornecedor: string | null; unidadeId?: string | null } | null>(null)
  // Editar um lançamento clicado no Livro-Caixa.
  const [editarLancId, setEditarLancId] = useState<string | null>(null)
  // QUITAR O REPASSE sem sair do Financeiro: o repasse do mês num popup.
  const [repasseAberto, setRepasseAberto] = useState(false)
  // FATURA DO CARTÃO (16/10/2026): a fatura em formato de fatura — anteriores, compras, pagamentos
  const [faturaAberta, setFaturaAberta] = useState(false)
  // o repasse que se PAGA num mês é o do mês anterior (regra: 1 mês depois)
  const [repasseMes, setRepasseMes] = useState(mesDeHoje)
  const abrirRepasse = useCallback((ref?: string) => {
    const [a, m] = mes.split('-').map(Number)
    const ant = new Date(a, m - 2, 1)
    setRepasseMes(ref || `${ant.getFullYear()}-${String(ant.getMonth() + 1).padStart(2, '0')}`)
    setRepasseAberto(true)
  }, [mes])

  // "+" (lib/lancar.ts). Cada item só aparece pra quem pode lançar aquilo.
  const [menuLancar, setMenuLancar] = useState(false)
  // o "+" SOME com popup aberto (14/10/2026). Todo popup trava a rolagem do fundo
  // (lib/scroll-lock → body overflow hidden): é esse o sinal que se observa.
  const [popupAberto, setPopupAberto] = useState(false)
  useEffect(() => {
    const olha = () => setPopupAberto(document.body.style.overflow === 'hidden')
    olha()
    const mo = new MutationObserver(olha)
    mo.observe(document.body, { attributes: true, attributeFilter: ['style'] })
    return () => mo.disconnect()
  }, [])
  const [comando, setComando] = useState<AcaoLancar | null>(null)
  const lancaDespesa = temLanc && canEdit(TELA, 'btn_lancamento_editar') && canEdit(TELA, TELA)
  const pode: Record<AcaoLancar, boolean> = {
    importar: lancaDespesa,
    despesa: lancaDespesa,
    recebiveis: lancaDespesa && isVisible(TELA, 'obj_fin_receitas_prazo'),
    quitacao: lancaDespesa,
    movimentacao: temCaixa && canEdit(TELA, 'btn_caixa_editar'),
  }
  const itensLancar = ITENS_LANCAR.filter(i => pode[i.acao])
  // useCallback: o Livro-Caixa recarrega quando estes mudam — sem memo, laço.
  const lancar = useCallback((acao: AcaoLancar) => {
    setMenuLancar(false)
    if (acao === 'quitacao') { setFaturaAberta(true); return }
    setContaImportar(null)
    setDespesaInicial(null)
    setComando(acao)
  }, [])
  const irPara = useCallback((aba: string) => {
    if (aba === 'repasse') abrirRepasse()
    else if (aba === 'dre' || aba === 'visao') setActive(aba)
  }, [abrirRepasse])
  // Repasse é Quitação (abre o popup do repasse); o resto é despesa preenchida.
  const paguei = useCallback((x: ContaNoMes) => {
    setMenuLancar(false); setContaImportar(null)
    // o item do calendário é 'repasse-aaaa-mm' (o mês de referência)
    if (x.conta.repasse) { setDespesaInicial(null); abrirRepasse(x.conta.id.startsWith('repasse-') ? x.conta.id.slice(8) : undefined); return }
    setDespesaInicial({ contaFixaId: x.conta.id, nome: `${x.conta.nome} de ${x.venc.data.slice(5, 7)}/${x.venc.data.slice(0, 4)}`,
                        categoriaId: x.conta.categoria_id, valor: x.valor, fornecedor: x.conta.fornecedor_nome, unidadeId: x.conta.unidade_id })
    setComando('despesa')
  }, [abrirRepasse])
  const comandoPara = (parte: 'lancamentos' | 'caixa') =>
    comando && (parte === 'caixa' ? comando === 'movimentacao' : comando !== 'movimentacao') ? comando : null

  if (!podeVer) {
    return (
      <EmptyState
        icon={Shield}
        title="Acesso restrito"
        description="O módulo financeiro não está liberado para a sua unidade."
      />
    )
  }

  const menuItens = MENU_LANCAR.map((m, idx) => {
    const sep = idx < MENU_LANCAR.length - 1 ? 'border-b border-[var(--surface-200)]' : ''
    const cab = (
      <>
        <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--surface-800)]">
          {/* os mesmos sinais das linhas do Livro-Caixa (15/10/2026): © conciliado · bolinha azul pré-lançamento */}
          {m.tipo === 'acao' && m.acao === 'importar' && <b className="font-bold leading-none text-emerald-500">©</b>}
          {m.tipo === 'acao' && m.acao === 'despesa' && <span className="h-2 w-2 rounded-full bg-sky-500 shrink-0" />}
          {m.titulo}
        </span>
        <span className="block text-[11px] text-[var(--surface-500)]">{m.detalhe}</span>
      </>
    )
    if (m.tipo === 'grupo') {
      const filhos = itensLancar.filter(i => m.itens.includes(i.acao))
      if (!filhos.length) return null
      return (
        <div key={m.titulo} className={`px-3 py-2 ${sep}`}>
          {cab}
          <div className="mt-1.5 flex flex-col">
            {filhos.map(i => (
              <button key={i.acao} onClick={() => lancar(i.acao)}
                className="text-left text-[13px] pl-3 py-1.5 rounded-[var(--radius-md)] border-l-2 border-[var(--surface-200)] hover:border-[var(--brand-500)] hover:bg-[var(--surface-50)] text-[var(--surface-700)]">
                {i.titulo}
              </button>
            ))}
          </div>
        </div>
      )
    }
    if (m.tipo === 'aba') {
      if (!temRepasse) return null
      return (
        <button key={m.titulo} onClick={() => { setMenuLancar(false); abrirRepasse() }}
          className={`w-full text-left px-3 py-2 rounded-[var(--radius-md)] hover:bg-[var(--surface-50)] ${sep}`}>{cab}</button>
      )
    }
    if (!pode[m.acao]) return null
    return (
      <button key={m.titulo} onClick={() => lancar(m.acao)}
        className={`w-full text-left px-3 py-2 rounded-[var(--radius-md)] hover:bg-[var(--surface-50)] ${sep}`}>{cab}</button>
    )
  })

  return (
    <div className="animate-fade-in space-y-3 pb-20">
      {/* título + mês juntos (no celular o mês vai pra direita da linha) — SEMPRE VISÍVEL:
          gruda no topo ao rolar (top-14 no celular, por causa do header fixo de 56px) */}
      <div className={`sticky top-14 md:top-0 ${popupAberto ? 'z-0' : 'z-30'} -mx-4 px-4 md:-mx-6 md:px-6 py-2 -mt-2 bg-[var(--shell-bg)] flex items-center gap-2 sm:gap-3 min-w-0`}>
        {/* com popup aberto a linha desce pra trás (o popup mora dentro de um bloco animado, que
            cria a sua própria camada — z-30 aqui ficaria por cima dele) */}
        <Receipt className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-500 shrink-0" />
        <h1 className="text-[15px] font-bold sm:text-title text-[var(--shell-text)] shrink-0">Financeiro</h1>
        <div className="ml-auto sm:ml-0"><SeletorMes mes={mes} onMes={setMes} /></div>
      </div>

      {/* as duas abas + a engrenagem de Configurações de Contas à direita */}
      <nav className="flex items-center gap-6 border-b border-[var(--surface-200)]" style={{ overflowY: 'hidden' }}>
        {visibleTabs.map(t => {
          const ativa = activeTab?.key === t.key
          return (
            <button key={t.key} onClick={() => setActive(t.key)}
                    className={`whitespace-nowrap text-[15px] py-2.5 border-b-2 -mb-px transition-colors ${ativa ? 'font-semibold text-[var(--surface-900)] border-[var(--brand-500)]' : 'text-[var(--surface-500)] border-transparent hover:text-[var(--surface-800)]'}`}>
              {t.label}
            </button>
          )
        })}
        {temContas && (
          <button onClick={() => setConfigAberto(true)} aria-label="Configurações de Contas" title="Configurações de Contas"
                  className={`ml-auto mb-1 h-8 w-8 rounded-[10px] border flex items-center justify-center ${configAberto ? 'border-[var(--brand-500)] text-[var(--brand-500)]' : 'border-[var(--surface-300)] text-[var(--surface-600)] hover:bg-[var(--surface-100)]'}`}>
            <Settings className="h-4 w-4" />
          </button>
        )}
      </nav>

      {/* MARCO ZERO (mig 167): antes dele o financeiro da unidade não vale — passado não
          auditado (compra nunca lançada, repasse feito por fora). Nem DRE nem Livro-Caixa. */}
      {marco && mes < marco && (activeTab?.key === 'visao' || activeTab?.key === 'dre') ? (
        <div className="card p-6 text-center space-y-2">
          <p className="text-sm text-[var(--surface-700)]">
            O financeiro de <b>{currentUnit?.nome}</b> começa em <b>{rotuloMesLongo(marco)}</b>.
          </p>
          <p className="text-xs text-[var(--surface-500)]">Os meses anteriores ficaram fora do sistema e não entram na conta.</p>
          <button onClick={() => setMes(marco)} className="btn-secondary text-sm">Ir para {rotuloMesLongo(marco)}</button>
        </div>
      ) : activeTab?.key === 'visao' ? (
        <VisaoMesTab key={versaoConfig} mes={mes}
          verResultado={ve('obj_fin_dre')} verCaixa={temCaixa} verRepasse={temRepasse} verLancamentos={temLanc}
          onIr={irPara} onLancar={itensLancar.length ? lancar : undefined}
          onPaguei={pode.despesa ? paguei : undefined}
          onEditarLancamento={temLanc ? setEditarLancId : undefined}
          onImportarConta={pode.importar ? (contaId => { setMenuLancar(false); setContaImportar(contaId); setComando('importar') }) : undefined} />
      ) : activeTab?.key === 'dre' ? (
        <DRETab mes={mes} />
      ) : (
        <EmptyState
          icon={Shield}
          title="Nada liberado"
          description="Nenhuma parte do financeiro está visível para o seu perfil."
        />
      )}

      {/* FATURA DO CARTÃO (16/10/2026) — ANTES dos popups das abas: o Modal não usa portal (z-50 igual pra
          todos, ganha quem vem depois), e o "classificar" da compra abre o Editar lançamento POR CIMA dela. */}
      <Modal isOpen={faturaAberta} onClose={() => setFaturaAberta(false)} title="Fatura do cartão" size="lg">
        <ConferirFatura podeLancar={pode.quitacao} onEditar={temLanc ? setEditarLancId : undefined}
          onImportarConta={pode.importar ? (contaId => { setFaturaAberta(false); setContaImportar(contaId); setComando('importar') }) : undefined} />
      </Modal>

      {/* As antigas abas, montadas SÓ com os popups (o "+" e o Livro-Caixa os abrem). */}
      {temLanc && (
        <LancamentosTab mes={mes} soModais somenteLeitura={!canEdit(TELA, 'btn_lancamento_editar') || !canEdit(TELA, TELA)}
          comando={comandoPara('lancamentos')} onComandoFeito={() => setComando(null)} contaImportar={contaImportar} despesaInicial={despesaInicial}
          editarId={editarLancId} onEditarFeito={() => setEditarLancId(null)} />
      )}
      {temCaixa && (
        <CaixaTab mes={mes} soModais somenteLeitura={!canEdit(TELA, 'btn_caixa_editar')}
          comando={comandoPara('caixa')} onComandoFeito={() => setComando(null)} />
      )}

      <Modal isOpen={configAberto} onClose={() => { setConfigAberto(false); setVersaoConfig(v => v + 1) }} title="Configurações de Contas" size="wide">
        <ContasTab somenteLeitura={!canEdit(TELA, 'btn_contas_editar')} />
      </Modal>

      {/* CONFERIR O REPASSE (16/10/2026): a tela simples da unidade — total, pets, descontos e acertos, e o
          "Conferi". Nada de planilha: quem edita é a Matriz, em /repasse. O pagamento entra pela Conciliação. */}
      <Modal isOpen={repasseAberto} onClose={() => setRepasseAberto(false)} title={`Repasse de ${rotuloMesLongo(repasseMes)}`} size="lg">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-[var(--surface-500)]">cremações de</span>
          <SeletorMes mes={repasseMes} onMes={setRepasseMes} />
        </div>
        <ConferirRepasse mes={repasseMes} podeConferir={pode.quitacao} />
      </Modal>

      {/* O "+" FLUTUANTE (14/10/2026): sempre à mão, no canto inferior direito; no
          celular sobe acima da barra de atalhos. Portal: fixo de verdade na tela. */}
      {itensLancar.length > 0 && !popupAberto && typeof document !== 'undefined' && createPortal(
        <div className="fixed right-4 sm:right-6 z-40" style={{ bottom: 'calc(var(--bottom-nav-h, 0px) + 20px)' }}>
          {menuLancar && (
            <>
              <div className="fixed inset-0 -z-10" onClick={() => setMenuLancar(false)} />
              <div className="absolute right-0 bottom-full mb-3 w-72 max-w-[calc(100vw-2rem)] card p-1 shadow-xl">{menuItens}</div>
            </>
          )}
          <button onClick={() => setMenuLancar(v => !v)} aria-label="Lançar" aria-expanded={menuLancar} title="Lançar"
                  className="h-14 w-14 rounded-full bg-[var(--brand-500)] text-white shadow-lg flex items-center justify-center hover:brightness-110 transition">
            <Plus className={`h-6 w-6 transition-transform ${menuLancar ? 'rotate-45' : ''}`} />
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}
