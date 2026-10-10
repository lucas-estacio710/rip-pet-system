'use client'

/**
 * Barra do pipeline REDESENHADO (fase 2.1 do docs/PLAYBOOK_REDESENHO_PIPELINE.md — itens 19,
 * 21, 22 e D1 de docs/REDESENHO_CARDS_PIPELINE.md). Só monta com o card novo (chave
 * obj_enc_pipeline); quem não migrou segue com a barra antiga, intocada.
 *
 * - Celular: busca + 1 botão "Organizar" que abre um menu ANCORADO nele (não bottom-sheet),
 *   com Ordenar · Agrupar · Buscar em. Aplica na hora, fecha no OK / tocando fora / no botão.
 *   Pontinho roxo no botão quando algo difere do padrão; "Voltar ao padrão" só fora dele.
 * - Desktop: busca + "Buscar em" + botões soltos (sobra espaço) — o menu é só do celular.
 * - Etapas: sublinhado deslizante com "›" entre elas; sigla no celular, nome por extenso no
 *   desktop (faixa até ~760px). Sem brilho/degradê/aumento da ativa.
 * - Segue o tema (P-02): escura no escuro, clara no claro (`.pl-barra` em app/pipeline.css).
 * - Gruda no topo: liga `body.allow-sticky` enquanto montada (o sticky do app não funciona por
 *   padrão — ver a nota no CLAUDE.md). Por estar só no fluxo novo, a barra ANTIGA continua
 *   sem grudar pra quem não migrou, como sempre foi.
 *
 * "Clique fora" é listener no document, NÃO um overlay `fixed inset-0` — esse esconderia a
 * barra de atalhos do celular (o MobileBottomNav some quando há `.fixed.inset-0` no DOM).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Search, X, SlidersHorizontal, ArrowUp, ArrowDown } from 'lucide-react'

export type EtapaBarra = { key: string; label: string; short: string; icon: string }
export type CampoBusca = 'todos' | 'pet' | 'tutor' | 'codigo' | 'lacre'
export type Ordenacao = 'data' | 'nome' | 'cep'

// Cor de cada etapa (a mesma da bancada aprovada).
const COR_ETAPA: Record<string, string> = {
  preventivo: '#22c55e',
  ativo: '#ef4444',
  pinda: '#f97316',
  retorno: '#06b6d4',
  pendente: '#a855f7',
  finalizado: '#94a3b8',
}

// O "Buscar em" saiu (09/10/2026): a busca nova adivinha pelo formato o que se procura —
// lacre, telefone/CPF, código ou texto (lib/busca-contratos.ts, docs/BUSCA_PIPELINE.md).
const PLACEHOLDER_BUSCA = 'Pet, tutor, lacre, telefone…'

type Props = {
  etapas: EtapaBarra[]
  contagens: Record<string, number>
  etapaAtiva: string
  onEtapa: (key: string) => void

  busca: string
  onBusca: (v: string) => void

  ordenacao: Ordenacao
  ordemAsc: boolean
  /** Troca a ordenação (e volta pra página 0 — quem chama resolve). */
  onOrdenar: (o: Ordenacao, asc: boolean) => void
  /** CEP só onde `unidades.cep` existe e a chave FLS btn_ordenar_cep deixa. */
  mostrarCep: boolean

  agruparEnc: boolean
  onAgruparEnc: (v: boolean) => void
  /** "Encaminhamento" só no Ativo do fluxo novo, nunca em PI (item 19). */
  mostrarAgruparEnc: boolean
  agruparCidade: boolean
  onAgruparCidade: (v: boolean) => void
  agruparBairro: boolean
  onAgruparBairro: (v: boolean) => void
  /** Visão "Ícones" do placar de pendências (10/10/2026) — só no menu do celular, onde há placar;
   *  no desktop os faróis já ficam à vista. Só aparece com faróis na unidade (P-05). */
  mostrarVerIcones: boolean
  verIcones: boolean
  onVerIcones: (v: boolean) => void

  /** Ação na barra (ex.: "+ Enc" — sai daqui pra bola flutuante no 2.13). */
  acao?: ReactNode
  /** Embaixo das etapas (ex.: o caminho da viagem aberta). */
  abaixo?: ReactNode
}

export default function BarraPipeline(p: Props) {
  const [orgAberto, setOrgAberto] = useState(false)
  const orgRef = useRef<HTMLDivElement>(null)

  // Libera o sticky do app enquanto a barra nova existe (ver cabeçalho).
  useEffect(() => {
    document.body.classList.add('allow-sticky')
    return () => document.body.classList.remove('allow-sticky')
  }, [])

  // Clique/toque fora fecha o menu — no document, sem overlay (ver cabeçalho).
  useEffect(() => {
    if (!orgAberto) return
    const fora = (e: PointerEvent) => {
      if (orgRef.current && !orgRef.current.contains(e.target as Node)) setOrgAberto(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOrgAberto(false) }
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [orgAberto])

  const ordem: 'novos' | 'antigos' | 'nome' | 'cep' =
    p.ordenacao === 'nome' ? 'nome' : p.ordenacao === 'cep' ? 'cep' : p.ordemAsc ? 'antigos' : 'novos'

  const foraDoPadrao =
    ordem !== 'novos' ||
    (p.mostrarAgruparEnc && !p.agruparEnc) ||
    p.agruparCidade ||
    p.agruparBairro ||
    (p.mostrarVerIcones && p.verIcones)

  const voltarAoPadrao = () => {
    p.onOrdenar('data', false)
    if (p.mostrarAgruparEnc) p.onAgruparEnc(true)
    p.onAgruparCidade(false)
    p.onAgruparBairro(false)
    p.onVerIcones(false)
  }

  const escolherOrdem = (o: typeof ordem) => {
    if (o === 'novos') p.onOrdenar('data', false)
    else if (o === 'antigos') p.onOrdenar('data', true)
    else if (o === 'nome') p.onOrdenar('nome', true)
    else p.onOrdenar('cep', true)
  }

  const ativaIdx = Math.max(0, p.etapas.findIndex(e => e.key === p.etapaAtiva))
  const corAtiva = COR_ETAPA[p.etapaAtiva] ?? '#94a3b8'

  const op = (on: boolean, rot: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className={`pl-org-op${on ? ' on' : ''}`}>{rot}</button>
  )

  // Botão solto do desktop (D1) — mesmas ações do menu do celular.
  const botaoDesk = (on: boolean, conteudo: ReactNode, onClick: () => void, title: string) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors pl-campo"
      style={on ? { background: 'rgba(124,58,237,.18)', borderColor: '#7c3aed', color: '#a78bfa' } : undefined}
    >
      {conteudo}
    </button>
  )

  return (
    <div className="pl-barra sticky top-14 md:top-0 z-20 -mx-4 px-4 md:-mx-6 md:px-6 pt-1.5 pb-1 md:pt-2.5 space-y-1">
      {/* Busca + controles */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 md:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--pl-apagado)' }} />
          <input
            type="text"
            value={p.busca}
            onChange={e => p.onBusca(e.target.value)}
            placeholder={PLACEHOLDER_BUSCA}
            className="pl-campo w-full h-9 md:h-8 pl-8 pr-8 rounded-lg text-sm outline-none focus:border-purple-500"
          />
          {p.busca && (
            <button
              type="button"
              onClick={() => p.onBusca('')}
              aria-label="Limpar busca"
              className="absolute right-2.5 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--pl-apagado)' }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Desktop: botões soltos */}
        <div className="hidden md:flex items-center gap-1.5 ml-auto">
          {botaoDesk(
            p.ordenacao === 'data',
            <>🕐 {p.ordenacao === 'data' && (p.ordemAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</>,
            () => (p.ordenacao === 'data' ? p.onOrdenar('data', !p.ordemAsc) : p.onOrdenar('data', false)),
            p.ordenacao === 'data' ? (p.ordemAsc ? 'Antigo → Novo' : 'Novo → Antigo') : 'Ordenar por data',
          )}
          {botaoDesk(
            p.ordenacao === 'nome',
            <>{p.ordenacao === 'nome' && !p.ordemAsc ? 'Z→A' : 'A→Z'}</>,
            () => (p.ordenacao === 'nome' ? p.onOrdenar('nome', !p.ordemAsc) : p.onOrdenar('nome', true)),
            'Ordenar por nome',
          )}
          {p.mostrarCep && botaoDesk(
            p.ordenacao === 'cep',
            <>📏 CEP</>,
            () => (p.ordenacao === 'cep' ? p.onOrdenar('data', false) : p.onOrdenar('cep', true)),
            'Mais perto da unidade primeiro',
          )}
          {p.mostrarAgruparEnc && botaoDesk(p.agruparEnc, <>🚐 Encaminhamento</>, () => p.onAgruparEnc(!p.agruparEnc), 'Agrupar por encaminhamento')}
          {botaoDesk(p.agruparCidade, <>📍 Cidade</>, () => { p.onAgruparCidade(!p.agruparCidade); if (p.agruparCidade) p.onAgruparBairro(false) }, 'Agrupar por cidade')}
          {p.agruparCidade && botaoDesk(p.agruparBairro, <>🏘️ Bairro</>, () => p.onAgruparBairro(!p.agruparBairro), 'Agrupar por bairro')}
          {p.acao}
        </div>

        {/* Celular: ação + Organizar (menu ancorado) */}
        {p.acao && <div className="md:hidden flex-shrink-0">{p.acao}</div>}
        <div ref={orgRef} className="relative md:hidden flex-shrink-0">
          <button
            type="button"
            onClick={() => setOrgAberto(v => !v)}
            className="pl-campo relative h-9 w-9 rounded-lg flex items-center justify-center"
            title="Organizar a lista"
            aria-expanded={orgAberto}
            aria-haspopup="dialog"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {foraDoPadrao && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full" style={{ background: '#a78bfa', boxShadow: '0 0 0 2px var(--pl-campo-bg)' }} />
            )}
          </button>
          {orgAberto && (
            <div className="pl-org" role="dialog" aria-label="Organizar a lista">
              <span className="pl-org-seta" />
              <div className="px-3 pt-3 pb-2 space-y-3">
                <div>
                  <div className="pl-org-titulo">Ordenar por</div>
                  <div className="flex flex-wrap gap-1.5">
                    {op(ordem === 'novos', '🕐 Mais novos', () => escolherOrdem('novos'))}
                    {op(ordem === 'antigos', '🕐 Mais antigos', () => escolherOrdem('antigos'))}
                    {op(ordem === 'nome', 'A→Z Nome', () => escolherOrdem('nome'))}
                    {p.mostrarCep && op(ordem === 'cep', '📏 CEP', () => escolherOrdem('cep'))}
                  </div>
                </div>
                <div>
                  <div className="pl-org-titulo">Agrupar por</div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.mostrarAgruparEnc && op(p.agruparEnc, '🚐 Encaminhamento', () => p.onAgruparEnc(!p.agruparEnc))}
                    {op(p.agruparCidade, '📍 Cidade', () => { p.onAgruparCidade(!p.agruparCidade); if (p.agruparCidade) p.onAgruparBairro(false) })}
                    {p.agruparCidade && op(p.agruparBairro, '🏘️ Bairro', () => p.onAgruparBairro(!p.agruparBairro))}
                  </div>
                </div>
                {p.mostrarVerIcones && (
                  <div>
                    <div className="pl-org-titulo">Pendências</div>
                    <div className="flex flex-wrap gap-1.5">
                      {op(!p.verIcones, '✓⏱ Números', () => p.onVerIcones(false))}
                      {op(p.verIcones, '🔔 Ícones', () => p.onVerIcones(true))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 px-3 pb-3">
                {foraDoPadrao && (
                  <button
                    type="button"
                    onClick={voltarAoPadrao}
                    className="text-[12.5px] font-semibold underline underline-offset-2"
                    style={{ color: 'var(--surface-500)' }}
                  >
                    Voltar ao padrão
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOrgAberto(false)}
                  className="ml-auto h-9 px-5 rounded-lg text-[13px] font-bold text-white"
                  style={{ background: '#7c3aed' }}
                >
                  OK
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Etapas: sublinhado deslizante */}
      <div className="md:max-w-[760px]">
        <div
          className="pl-etapas"
          role="tablist"
          style={{ '--n': p.etapas.length, '--i': ativaIdx, '--pl-cor': corAtiva } as React.CSSProperties}
        >
          <span className="pl-etapas-ind" aria-hidden="true" />
          {p.etapas.map(e => {
            const on = e.key === p.etapaAtiva
            return (
              <button
                key={e.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => p.onEtapa(e.key)}
                className={`pl-etapa${on ? ' on' : ''}`}
                style={{ '--pl-cor': COR_ETAPA[e.key] ?? '#94a3b8' } as React.CSSProperties}
              >
                <span className="pl-etapa-emoji text-xs md:text-sm">{e.icon}</span>
                <span className="pl-etapa-txt text-[10px] md:text-[13px] font-semibold md:hidden">{e.short}</span>
                <span className="pl-etapa-txt hidden md:inline text-[13px] font-semibold">{e.label}</span>
                <span className="pl-etapa-txt font-black tabular-nums text-[11px] md:text-[13px]">{p.contagens[e.key] || 0}</span>
              </button>
            )
          })}
        </div>
      </div>

      {p.abaixo}
    </div>
  )
}
