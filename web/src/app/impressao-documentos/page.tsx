'use client'

import { useEffect, useState, useMemo, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Printer, Search, X, FileText, ClipboardList, Receipt, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { gerarImpressaoUnificada, gerarImpressaoIndividual, ImpressaoBlocos, ImpressaoProgress } from '@/lib/impressao-unificada'
import { montarProtocoloData, normalizarProtocoloData } from '@/components/protocolo/protocolo-utils'
import type { DadosContrato } from '@/lib/contrato-pdf'
import type { FichaContratoData } from '@/components/fichas/FichaRemocao'

// ============================================
// Tipos
// ============================================
type Status = 'preventivo' | 'ativo' | 'pinda' | 'retorno' | 'pendente' | 'finalizado'

type ContratoLite = {
  id: string
  codigo: string
  pet_nome: string | null
  status: Status
  numero_lacre: string | null
  tutor_nome: string | null
  protocolo_data: unknown | null  // null = ainda não salvo (padrão usado em /contratos/[id])
}

type SelDocs = { contrato: boolean; ficha: boolean; protocolo: boolean }
const SEL_VAZIO: SelDocs = { contrato: false, ficha: false, protocolo: false }

type Pagina =
  | { tipo: 'contrato'; itens: ContratoLite[] }       // 1 por página
  | { tipo: 'ficha'; itens: ContratoLite[] }          // até 2 por página
  | { tipo: 'protocolo'; itens: ContratoLite[] }      // até 4 por página

const CAPACIDADE: Record<Pagina['tipo'], number> = { contrato: 1, ficha: 2, protocolo: 4 }

// Cores temáticas (mesmas do DocMenu) — usadas nos checkboxes e nos slots do preview
const COR_DOC = {
  contrato: { texto: 'text-blue-400', bg: 'bg-blue-500/15', border: 'border-blue-500/40', solid: 'bg-blue-500' },
  ficha: { texto: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/40', solid: 'bg-amber-500' },
  protocolo: { texto: 'text-green-400', bg: 'bg-green-500/15', border: 'border-green-500/40', solid: 'bg-green-500' },
}

const STATUS_LABEL: Record<Status, string> = {
  preventivo: 'Preventivo', ativo: 'Ativo', pinda: 'Pinda',
  retorno: 'Retorno', pendente: 'Pendente', finalizado: 'Finalizado',
}

const STATUS_COR: Record<Status, string> = {
  preventivo: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/40',
  ativo: 'bg-red-900/30 text-red-400 border-red-700/40',
  pinda: 'bg-orange-900/30 text-orange-400 border-orange-700/40',
  retorno: 'bg-blue-900/30 text-blue-400 border-blue-700/40',
  pendente: 'bg-purple-900/30 text-purple-400 border-purple-700/40',
  finalizado: 'bg-slate-700/40 text-slate-400 border-slate-600/40',
}

// 'finalizado' fora — contratos encerrados não precisam mais ser impressos por aqui
const STATUS_ORDEM: Status[] = ['ativo', 'pinda', 'retorno', 'pendente', 'preventivo']

function labelFase(f: ImpressaoProgress['fase']): string {
  return ({ contratos: 'Contratos', fichas: 'Fichas', protocolos: 'Protocolos', concatenando: 'Montando PDF' } as const)[f]
}

function primeiroNome(s: string | null | undefined): string {
  if (!s) return '—'
  const p = s.trim().split(/\s+/)[0]
  return p || '—'
}

type ItemIndividual = { tipo: 'contrato' | 'ficha' | 'protocolo'; c: ContratoLite }

const TIPO_LABEL: Record<ItemIndividual['tipo'], string> = {
  contrato: 'Contrato',
  ficha: 'Ficha de Remoção',
  protocolo: 'Protocolo de Entrega',
}

const TIPO_EXT: Record<ItemIndividual['tipo'], string> = {
  contrato: 'PDF',
  ficha: 'PNG',
  protocolo: 'PDF',
}

// ============================================
// Helper: agrupa seleções em páginas A4
// ============================================
function computarPaginas(selecoes: Map<string, SelDocs>, contratos: ContratoLite[]): Pagina[] {
  const byId = new Map(contratos.map(c => [c.id, c]))
  const por = { contrato: [] as ContratoLite[], ficha: [] as ContratoLite[], protocolo: [] as ContratoLite[] }
  selecoes.forEach((sel, id) => {
    const c = byId.get(id)
    if (!c) return
    if (sel.contrato) por.contrato.push(c)
    if (sel.ficha) por.ficha.push(c)
    if (sel.protocolo) por.protocolo.push(c)
  })

  const paginas: Pagina[] = []
  ;(['contrato', 'ficha', 'protocolo'] as const).forEach(tipo => {
    const itens = por[tipo]
    const cap = CAPACIDADE[tipo]
    for (let i = 0; i < itens.length; i += cap) {
      paginas.push({ tipo, itens: itens.slice(i, i + cap) } as Pagina)
    }
  })
  return paginas
}

// ============================================
// Page
// ============================================
export default function ImpressaoDocumentosPage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <Conteudo />
    </Suspense>
  )
}

function Conteudo() {
  const sp = useSearchParams()
  const contratoIdUrl = sp.get('contratoId')
  const supabase = createClient()
  const { currentUnit } = useUnit()

  const [contratos, setContratos] = useState<ContratoLite[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState<Set<Status>>(new Set())
  const [selecoes, setSelecoes] = useState<Map<string, SelDocs>>(new Map())
  // Pré-seleção da URL (rodamos só uma vez quando o contrato vem do DocMenu)
  const [preSelAplicada, setPreSelAplicada] = useState(false)
  // Geração do PDF
  const [gerando, setGerando] = useState(false)
  const [progresso, setProgresso] = useState<ImpressaoProgress | null>(null)
  const [erroGerar, setErroGerar] = useState('')
  // Modo de salvamento: único PDF concatenado vs. ZIP com 1 arquivo por documento
  const [modoSalvar, setModoSalvar] = useState<'unico' | 'individual'>('unico')

  // Carregar contratos da unidade ativa (com filtros + busca)
  const carregar = useCallback(async () => {
    if (!currentUnit?.id) return
    setLoading(true)
    let q = supabase
      .from('contratos')
      .select('id, codigo, pet_nome, status, numero_lacre, tutor_nome, protocolo_data')
      .eq('unidade_id', currentUnit.id)
      .neq('status', 'finalizado')   // finalizados ficam fora desta página
      .order('data_acolhimento', { ascending: false, nullsFirst: false })
      .limit(100)

    if (statusFiltro.size > 0) {
      q = q.in('status', Array.from(statusFiltro))
    }
    if (busca.trim()) {
      const t = busca.trim().replace(/[%,()]/g, '')
      q = q.or(`codigo.ilike.%${t}%,pet_nome.ilike.%${t}%,tutor_nome.ilike.%${t}%`)
    }
    const { data, error } = await q
    if (!error && data) setContratos(data as ContratoLite[])
    setLoading(false)
  }, [currentUnit?.id, statusFiltro, busca, supabase])

  useEffect(() => { carregar() }, [carregar])

  // Pré-seleciona o contratoId vindo do DocMenu (Contrato marcado por padrão)
  useEffect(() => {
    if (preSelAplicada || !contratoIdUrl || contratos.length === 0) return
    if (!contratos.some(c => c.id === contratoIdUrl)) return
    setSelecoes(prev => {
      if (prev.has(contratoIdUrl)) return prev
      const n = new Map(prev)
      n.set(contratoIdUrl, { contrato: true, ficha: false, protocolo: false })
      return n
    })
    setPreSelAplicada(true)
  }, [contratoIdUrl, contratos, preSelAplicada])

  function toggleStatus(s: Status) {
    setStatusFiltro(prev => {
      const n = new Set(prev)
      n.has(s) ? n.delete(s) : n.add(s)
      return n
    })
  }

  function toggleDoc(id: string, doc: keyof SelDocs) {
    setSelecoes(prev => {
      const n = new Map(prev)
      const cur = n.get(id) || { ...SEL_VAZIO }
      const novo = { ...cur, [doc]: !cur[doc] }
      // Se desmarcou tudo, remove do map (mantém limpo)
      if (!novo.contrato && !novo.ficha && !novo.protocolo) n.delete(id)
      else n.set(id, novo)
      return n
    })
  }

  /** Marca/desmarca um tipo em TODOS os contratos atualmente filtrados (toggle). */
  function toggleTodosDoc(doc: keyof SelDocs) {
    if (contratos.length === 0) return
    setSelecoes(prev => {
      const todosOn = contratos.every(c => prev.get(c.id)?.[doc])
      const n = new Map(prev)
      contratos.forEach(c => {
        const cur = n.get(c.id) || { ...SEL_VAZIO }
        const novo = { ...cur, [doc]: !todosOn }
        if (!novo.contrato && !novo.ficha && !novo.protocolo) n.delete(c.id)
        else n.set(c.id, novo)
      })
      return n
    })
  }

  function limparSelecao() { setSelecoes(new Map()) }

  async function gerarPDF() {
    if (selecoes.size === 0 || gerando) return
    setGerando(true); setErroGerar(''); setProgresso(null)
    try {
      // 1. Fetch full dos contratos selecionados (tutor, produtos, pagamentos, estabelecimento)
      const ids = Array.from(selecoes.keys())
      const { data: full, error } = await supabase
        .from('contratos')
        .select('*, tutor:tutores(*), funcionario:funcionarios(nome), estabelecimento_coleta:estabelecimentos!contratos_estabelecimento_id_fkey(nome), contrato_produtos(*, produto:produtos(*)), pagamentos(*)')
        .in('id', ids)
      if (error || !full) throw new Error(error?.message || 'Erro ao carregar contratos')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byId = new Map<string, any>(full.map((c: any) => [c.id, c]))

      const nomeUnidade = currentUnit ? `${currentUnit.cidade} - ${currentUnit.estado}` : 'Santos - SP'
      const blocos: ImpressaoBlocos = { contratos: [], fichas: [], protocolos: [] }

      selecoes.forEach((sel, id) => {
        const c = byId.get(id)
        if (!c) return

        if (sel.contrato) {
          blocos.contratos.push({ dados: mapToContratoDados(c), nomeUnidade })
        }
        if (sel.ficha) {
          blocos.fichas.push(mapToFichaData(c))
        }
        if (sel.protocolo) {
          blocos.protocolos.push(c.protocolo_data
            ? normalizarProtocoloData(c.protocolo_data)
            : montarProtocoloDoZero(c))
        }
      })

      // 2. Gerar — PDF único concatenado OU ZIP com arquivos individuais
      const blob = modoSalvar === 'unico'
        ? await gerarImpressaoUnificada(blocos, p => setProgresso(p))
        : await gerarImpressaoIndividual(blocos, p => setProgresso(p))

      // 3. Download (extensão muda conforme o modo)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
      a.download = modoSalvar === 'unico' ? `impressao-${ts}.pdf` : `impressao-${ts}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1500)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao gerar PDF'
      setErroGerar(msg)
    } finally {
      setGerando(false)
      setProgresso(null)
    }
  }

  // Páginas computadas em tempo real (modo Imprimir em Grupo)
  const paginas = useMemo(() => computarPaginas(selecoes, contratos), [selecoes, contratos])

  // Lista de arquivos no modo Salvar Individuais (1 item por documento marcado, agrupado por tipo)
  const listaIndividuais = useMemo<ItemIndividual[]>(() => {
    const byId = new Map(contratos.map(c => [c.id, c]))
    const itens: ItemIndividual[] = []
    ;(['contrato', 'ficha', 'protocolo'] as const).forEach(tipo => {
      selecoes.forEach((sel, id) => {
        if (!sel[tipo]) return
        const c = byId.get(id)
        if (c) itens.push({ tipo, c })
      })
    })
    return itens
  }, [selecoes, contratos])
  const totalSel = useMemo(() => {
    let cont = 0, ficha = 0, prot = 0
    selecoes.forEach(s => { if (s.contrato) cont++; if (s.ficha) ficha++; if (s.protocolo) prot++ })
    return { cont, ficha, prot, total: cont + ficha + prot }
  }, [selecoes])

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-purple-900/30 items-center justify-center">
            <Printer className="h-5 w-5 text-purple-500" />
          </div>
          <h1 className="text-title text-[var(--shell-text)]">Impressão de Documentos</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-[var(--shell-text-muted)]">
            <span className="font-bold text-[var(--shell-text)]">{paginas.length}</span> {paginas.length === 1 ? 'página' : 'páginas'}
            {totalSel.total > 0 && (
              <span className="ml-2 text-xs">
                · <span className={COR_DOC.contrato.texto}>{totalSel.cont} contrato{totalSel.cont !== 1 ? 's' : ''}</span>
                {' + '}<span className={COR_DOC.ficha.texto}>{totalSel.ficha} ficha{totalSel.ficha !== 1 ? 's' : ''}</span>
                {' + '}<span className={COR_DOC.protocolo.texto}>{totalSel.prot} protocolo{totalSel.prot !== 1 ? 's' : ''}</span>
              </span>
            )}
          </div>
          {/* Tabs de modo: Imprimir em Grupo (PDF concatenado) | Salvar Individuais (ZIP) */}
          <div
            className="inline-flex p-0.5 rounded-lg"
            style={{ background: 'var(--surface-100)', border: '1px solid var(--surface-200)' }}
            role="tablist"
          >
            {(['unico', 'individual'] as const).map(m => {
              const ativo = modoSalvar === m
              const label = m === 'unico' ? 'Imprimir em Grupo' : 'Salvar Individuais'
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={ativo}
                  onClick={() => setModoSalvar(m)}
                  disabled={gerando}
                  title={m === 'unico'
                    ? 'Concatena tudo num PDF único, agrupado por tipo (pronto pra imprimir em lote)'
                    : 'Salva 1 arquivo por documento (PDF de contratos, PNG de fichas, PDF de protocolos) num ZIP'}
                  className="px-3 py-1 text-xs font-semibold rounded-md transition-colors disabled:opacity-50 whitespace-nowrap"
                  style={{
                    background: ativo ? 'var(--brand-600)' : 'transparent',
                    color: ativo ? '#fff' : 'var(--shell-text-muted)',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <button
            onClick={gerarPDF}
            disabled={selecoes.size === 0 || gerando || (modoSalvar === 'unico' && paginas.length === 0)}
            title={selecoes.size === 0
              ? 'Selecione documentos pra imprimir'
              : modoSalvar === 'unico'
                ? 'Gera um PDF único concatenando contratos, fichas e protocolos'
                : 'Salva 1 arquivo por documento dentro de um ZIP'}
            className="btn-primary text-sm py-2 px-4 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            style={{ background: 'var(--brand-600)' }}
          >
            {gerando
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Printer className="h-4 w-4" />}
            {gerando
              ? (progresso ? `${labelFase(progresso.fase)} ${progresso.atual}/${progresso.total}…` : 'Preparando…')
              : (modoSalvar === 'unico'
                  ? 'Gerar PDF'
                  : `Salvar ZIP (${totalSel.total} arquivo${totalSel.total !== 1 ? 's' : ''})`)}
          </button>
        </div>
      </div>

      {erroGerar && (
        <div className="mb-4 rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium">
          ⚠️ {erroGerar}
        </div>
      )}

      {/* Grid 2 colunas (mobile: stack) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">

        {/* ============ COLUNA ESQUERDA: seleção ============ */}
        <div className="space-y-3 min-w-0">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--surface-400)]" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por código, pet ou tutor…"
              className="input w-full pl-9 pr-8 text-sm"
            />
            {busca && (
              <button onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-[var(--surface-400)]" />
              </button>
            )}
          </div>

          {/* Chips de status */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-[var(--surface-400)] uppercase tracking-wider mr-1">Status:</span>
            {STATUS_ORDEM.map(s => {
              const ativo = statusFiltro.has(s)
              return (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                    ativo ? STATUS_COR[s] : 'bg-transparent text-[var(--surface-500)] border-[var(--surface-200)] hover:border-[var(--surface-300)]'
                  }`}
                >
                  {STATUS_LABEL[s]}
                </button>
              )
            })}
            {statusFiltro.size > 0 && (
              <button onClick={() => setStatusFiltro(new Set())} className="text-[11px] text-[var(--surface-400)] hover:text-[var(--shell-text)] ml-1">
                Limpar
              </button>
            )}
          </div>

          {/* Header da lista */}
          <div className="flex items-center justify-between text-xs text-[var(--surface-400)] px-1">
            <span>{loading ? 'Carregando…' : `${contratos.length} contrato${contratos.length !== 1 ? 's' : ''} ${contratos.length === 100 ? '(limitado a 100 — refine os filtros)' : ''}`}</span>
            {selecoes.size > 0 && (
              <button onClick={limparSelecao} className="hover:text-[var(--shell-text)] underline">
                Limpar seleção ({selecoes.size})
              </button>
            )}
          </div>

          {/* Marcar todos os filtrados (aplica o tipo a TODOS os contratos do filtro atual) */}
          {!loading && contratos.length > 0 && (
            <div className="flex items-center gap-1.5 px-1 flex-wrap">
              <span className="text-[10px] text-[var(--surface-400)] uppercase tracking-wider mr-1">Marcar todos:</span>
              {(['contrato', 'ficha', 'protocolo'] as const).map(doc => {
                const todosOn = contratos.every(c => selecoes.get(c.id)?.[doc])
                const cor = COR_DOC[doc]
                const Icon = doc === 'contrato' ? FileText : doc === 'ficha' ? ClipboardList : Receipt
                const label = doc === 'contrato' ? 'Contratos' : doc === 'ficha' ? 'Fichas' : 'Protocolos'
                return (
                  <button
                    key={doc}
                    type="button"
                    onClick={() => toggleTodosDoc(doc)}
                    title={todosOn
                      ? `Desmarcar ${label.toLowerCase()} de todos os ${contratos.length} contratos filtrados`
                      : `Marcar ${label.toLowerCase()} em todos os ${contratos.length} contratos filtrados`}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors border ${
                      todosOn
                        ? `${cor.bg} ${cor.border} ${cor.texto}`
                        : 'bg-transparent text-[var(--surface-400)] border-[var(--surface-200)] hover:border-[var(--surface-300)]'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                    <span className="text-[9px] opacity-70">×{contratos.length}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Lista de cards */}
          <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
            {loading && (
              <div className="flex items-center gap-2 text-[var(--surface-400)] text-sm py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando contratos…
              </div>
            )}
            {!loading && contratos.length === 0 && (
              <div className="text-center text-sm text-[var(--surface-400)] py-12">
                Nenhum contrato encontrado. Ajuste os filtros ou a busca.
              </div>
            )}
            {!loading && contratos.map(c => {
              const sel = selecoes.get(c.id) || SEL_VAZIO
              const algumMarcado = sel.contrato || sel.ficha || sel.protocolo
              return (
                <div
                  key={c.id}
                  title={`${c.codigo} · ${STATUS_LABEL[c.status]}`}
                  className={`rounded-lg border px-2.5 py-1.5 transition-colors flex items-center gap-2 ${
                    algumMarcado
                      ? 'bg-[var(--surface-50)] border-[var(--brand-500)]/40'
                      : 'bg-[var(--surface-0)] border-[var(--surface-200)] hover:border-[var(--surface-300)]'
                  }`}
                >
                  {/* Lacre — destacado */}
                  {c.numero_lacre ? (
                    <span className="font-mono text-[10px] text-white bg-blue-900 px-1.5 py-0.5 rounded shrink-0" title="Lacre">
                      {c.numero_lacre}
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-[var(--surface-400)] px-1.5 py-0.5 shrink-0" title="Sem lacre">—</span>
                  )}
                  {/* Status badge */}
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border shrink-0 ${STATUS_COR[c.status]}`}>
                    {STATUS_LABEL[c.status]}
                  </span>
                  {/* Pet · Tutor */}
                  <span className="text-sm font-semibold text-[var(--shell-text)] truncate min-w-0">{c.pet_nome || '(sem nome)'}</span>
                  <span className="text-[var(--surface-400)] shrink-0">·</span>
                  <span className="text-[10px] text-[var(--surface-400)] truncate min-w-0">{c.tutor_nome || '—'}</span>
                  {/* Checkboxes — empurrados pra direita */}
                  <div className="ml-auto flex items-center gap-1 shrink-0">
                    <DocCheckbox doc="contrato" Icon={FileText} sel={sel.contrato} onClick={() => toggleDoc(c.id, 'contrato')} label="Contrato" />
                    <DocCheckbox doc="ficha" Icon={ClipboardList} sel={sel.ficha} onClick={() => toggleDoc(c.id, 'ficha')} label="Ficha" />
                    <DocCheckbox
                      doc="protocolo"
                      Icon={Receipt}
                      sel={sel.protocolo}
                      onClick={() => toggleDoc(c.id, 'protocolo')}
                      label="Protocolo"
                      salvo={!!c.protocolo_data}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ============ COLUNA DIREITA: preview ============ */}
        <div className="lg:w-[360px] shrink-0">
          <div className="sticky top-4">
            <div className="rounded-lg border border-[var(--surface-200)] bg-[var(--surface-50)] p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold text-[var(--surface-500)] uppercase tracking-wider">
                  {modoSalvar === 'unico' ? 'Layout da impressão' : 'Arquivos que serão salvos'}
                </h2>
                <span className="text-xs text-[var(--surface-400)]">
                  {modoSalvar === 'unico'
                    ? `${paginas.length} ${paginas.length === 1 ? 'pág' : 'págs'}`
                    : `${listaIndividuais.length} ${listaIndividuais.length === 1 ? 'arquivo' : 'arquivos'}`}
                </span>
              </div>

              {(modoSalvar === 'unico' ? paginas.length : listaIndividuais.length) === 0 ? (
                <div className="py-12 text-center text-sm text-[var(--surface-400)]">
                  Marque ao lado os documentos que deseja {modoSalvar === 'unico' ? 'imprimir' : 'salvar'}.
                </div>
              ) : modoSalvar === 'unico' ? (
                <div className="grid grid-cols-2 gap-3 max-h-[65vh] overflow-y-auto pr-1">
                  {paginas.map((p, i) => <PaginaPreview key={i} numero={i + 1} pagina={p} />)}
                </div>
              ) : (
                <div className="space-y-1 max-h-[65vh] overflow-y-auto pr-1">
                  {listaIndividuais.map((it, i) => {
                    const cor = COR_DOC[it.tipo]
                    const Icon = it.tipo === 'contrato' ? FileText : it.tipo === 'ficha' ? ClipboardList : Receipt
                    return (
                      <div
                        key={`${it.tipo}_${it.c.id}_${i}`}
                        title={`${TIPO_LABEL[it.tipo]} (.${TIPO_EXT[it.tipo].toLowerCase()})`}
                        className={`rounded-md border ${cor.bg} ${cor.border} px-2 py-1.5 flex items-center gap-2 text-xs`}
                      >
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${cor.texto}`} />
                        <span className="font-mono text-white bg-blue-900 px-1.5 py-0.5 rounded text-[10px] shrink-0" title="Lacre">
                          {it.c.numero_lacre || '—'}
                        </span>
                        <span className="text-[var(--shell-text)] truncate min-w-0">{primeiroNome(it.c.tutor_nome)}</span>
                        <span className="text-[var(--surface-400)] shrink-0">·</span>
                        <span className="text-[var(--shell-text)] font-semibold truncate min-w-0">
                          {it.c.pet_nome || '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {modoSalvar === 'unico' && paginas.length > 0 && (
                <p className="mt-3 text-[10px] text-[var(--surface-400)] italic">
                  Agrupamento por tipo · contratos primeiro, depois fichas (2/pág), depois protocolos (4/pág).
                </p>
              )}
              {modoSalvar === 'individual' && listaIndividuais.length > 0 && (
                <p className="mt-3 text-[10px] text-[var(--surface-400)] italic">
                  Empacotado em ZIP · 1 arquivo por documento · contratos/, fichas/, protocolos/
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Subcomponente: checkbox-botão por documento
// ============================================
function DocCheckbox({ doc, Icon, sel, onClick, label, salvo }: {
  doc: keyof typeof COR_DOC
  Icon: React.ComponentType<{ className?: string }>
  sel: boolean
  onClick: () => void
  label: string
  /** Indica que o documento já foi salvo no banco (ex: protocolo_data existe) — mostra um pontinho verde. */
  salvo?: boolean
}) {
  const cor = COR_DOC[doc]
  const titulo = `${label} — ${sel ? 'marcado' : 'marcar'}${salvo ? ' · já salvo' : ''}`
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      className={`relative flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-semibold transition-colors ${
        sel ? `${cor.bg} ${cor.border} ${cor.texto}` : 'bg-transparent text-[var(--surface-400)] border-[var(--surface-200)] hover:border-[var(--surface-300)]'
      }`}
    >
      <Icon className="h-3 w-3" />
      <span className="hidden sm:inline">{label}</span>
      {salvo && (
        <span
          className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[var(--surface-0)]"
          aria-label="Salvo"
        />
      )}
    </button>
  )
}

// ============================================
// Subcomponente: preview esquemático de 1 página A4
// ============================================
function PaginaPreview({ numero, pagina }: { numero: number; pagina: Pagina }) {
  const cap = CAPACIDADE[pagina.tipo]
  const cor = COR_DOC[pagina.tipo]
  const tipoLabel = pagina.tipo === 'contrato' ? 'Contrato' : pagina.tipo === 'ficha' ? 'Ficha' : 'Protocolo'

  // Cria array de tamanho cap, com itens preenchidos e nulls pros vazios
  const slots: (ContratoLite | null)[] = Array.from({ length: cap }, (_, i) => pagina.itens[i] || null)

  return (
    <div>
      {/* Etiqueta da página */}
      <div className="flex items-center justify-between mb-1 px-0.5">
        <span className="text-[9px] font-bold text-[var(--surface-500)]">P{numero}</span>
        <span className={`text-[9px] font-semibold ${cor.texto}`}>{tipoLabel}{cap > 1 ? ` (${cap}/p)` : ''}</span>
      </div>

      {/* Folha A4 (proporção 1:1.414) */}
      <div
        className="bg-white rounded-sm shadow-md border border-slate-300 relative overflow-hidden"
        style={{ aspectRatio: '1 / 1.414' }}
      >
        {pagina.tipo === 'contrato' && (
          <SlotMini c={slots[0]} cor={cor} className="absolute inset-1" />
        )}
        {pagina.tipo === 'ficha' && (
          <div className="absolute inset-1 flex flex-col gap-1">
            <SlotMini c={slots[0]} cor={cor} className="flex-1" />
            <SlotMini c={slots[1]} cor={cor} className="flex-1" />
          </div>
        )}
        {pagina.tipo === 'protocolo' && (
          <div className="absolute inset-1 grid grid-cols-2 grid-rows-2 gap-1">
            <SlotMini c={slots[0]} cor={cor} />
            <SlotMini c={slots[1]} cor={cor} />
            <SlotMini c={slots[2]} cor={cor} />
            <SlotMini c={slots[3]} cor={cor} />
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// Mapeamentos: contrato cru (Supabase) → blocos de impressão
// (Espelha o mesmo mapping usado em /contratos/[id] na geração individual.)
// ============================================
/* eslint-disable @typescript-eslint/no-explicit-any */

function mapToContratoDados(c: any): DadosContrato {
  const tutor = c.tutor
  return {
    codigo: c.codigo,
    lacre: c.numero_lacre,
    tutorNome: tutor?.nome || c.tutor_nome,
    tutorTelefone: tutor?.telefone || c.tutor_telefone || '',
    tutorCpf: tutor?.cpf || c.tutor_cpf || '',
    tutorEmail: tutor?.email || c.tutor_email,
    tutorEndereco: tutor
      ? `${tutor.endereco || ''}${tutor.numero ? ', ' + tutor.numero : ''}${tutor.complemento ? ' - ' + tutor.complemento : ''}`
      : c.tutor_endereco,
    tutorEstado: tutor?.estado,
    tutorCidade: tutor?.cidade || c.tutor_cidade,
    tutorBairro: tutor?.bairro || c.tutor_bairro,
    tutorCep: tutor?.cep || c.tutor_cep,
    petNome: c.pet_nome,
    petEspecie: c.pet_especie,
    petRaca: c.pet_raca,
    petIdade: c.pet_idade_anos,
    petCor: c.pet_cor,
    petGenero: c.pet_genero,
    petPeso: c.pet_peso,
    localColeta: c.local_coleta,
    tipoCremacao: c.tipo_cremacao,
    valorPlano: c.valor_plano,
    metodoPagamento: c.pagamentos?.[0]?.metodo || null,
    parcelas: c.pagamentos?.[0]?.parcelas || null,
    velorioDeseja: c.velorio_deseja ?? null,
    acompanhamentoOnline: c.acompanhamento_online ?? false,
    acompanhamentoPresencial: c.acompanhamento_presencial ?? false,
  } as DadosContrato
}

function mapToFichaData(c: any): FichaContratoData {
  return {
    id: c.id,
    codigo: c.codigo,
    numero_lacre: c.numero_lacre,
    tipo_cremacao: c.tipo_cremacao,
    data_acolhimento: c.data_acolhimento,
    pet_nome: c.pet_nome,
    pet_especie: c.pet_especie,
    pet_raca: c.pet_raca,
    pet_cor: c.pet_cor,
    pet_idade_anos: c.pet_idade_anos,
    pet_peso: c.pet_peso,
    pet_genero: c.pet_genero,
    certificado_nome_1: c.certificado_nome_1,
    certificado_nome_2: c.certificado_nome_2,
    certificado_nome_3: c.certificado_nome_3,
    certificado_nome_4: c.certificado_nome_4,
    certificado_nome_5: c.certificado_nome_5,
    certificado_nome_6: c.certificado_nome_6,
    certificado_nome_7: c.certificado_nome_7,
    local_coleta: c.local_coleta,
    clinica_veterinaria: c.estabelecimento_coleta?.nome || c.clinica_coleta || null,
    colaborador_responsavel: c.funcionario?.nome || null,
    observacoes: c.observacoes,
    remocao_cidade: c.remocao_cidade,
    tutor_telefone: c.tutor_telefone,
    tutor_telefone2: c.tutor_telefone2,
    tutor_telefone_nome: c.tutor_telefone_nome,
    tutor_telefone2_nome: c.tutor_telefone2_nome,
    tutor_telefone_principal: c.tutor_telefone_principal,
    tutor_nome: c.tutor_nome,
    tutor: c.tutor ? { nome: c.tutor.nome, bairro: c.tutor.bairro, cidade: c.tutor.cidade } : null,
  }
}

function montarProtocoloDoZero(c: any) {
  const produtos: any[] = c.contrato_produtos || []
  const pagamentos: any[] = c.pagamentos || []
  const totalProdutos = produtos.reduce((s, cp) => s + ((cp.valor || 0) - (cp.desconto || 0)) * (cp.quantidade || 1), 0)
  const valorPlanoLiquido = (c.valor_plano || 0) - (c.desconto_plano_unificado || c.desconto_plano || 0)
  const totalAPagar = valorPlanoLiquido + totalProdutos
  const totalPago = pagamentos.reduce((s, p) => s + (p.valor || 0), 0)
  const saldo = totalAPagar - totalPago
  return montarProtocoloData(c, produtos, { totalAPagar, totalPago, saldo, aPagarPlano: valorPlanoLiquido })
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Slot dentro da folha A4 (com info do contrato ou vazio cinza)
function SlotMini({ c, cor, className }: { c: ContratoLite | null; cor: typeof COR_DOC.contrato; className?: string }) {
  if (!c) {
    return <div className={`rounded-sm bg-slate-100 border border-dashed border-slate-300 ${className || ''}`} />
  }
  return (
    <div className={`rounded-sm ${cor.bg} ${cor.border} border flex flex-col justify-center items-center text-center p-1 overflow-hidden ${className || ''}`}>
      <p className={`font-mono text-[8px] font-bold ${cor.texto} truncate w-full leading-tight`}>{c.codigo}</p>
      <p className="text-[8px] text-slate-700 truncate w-full leading-tight">{c.pet_nome}</p>
    </div>
  )
}
