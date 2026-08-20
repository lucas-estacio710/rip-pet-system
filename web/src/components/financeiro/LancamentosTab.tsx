'use client'

// /financeiro — lançamento de despesas da unidade.
//
// REGRA DE PRODUTO (doc §8.1, "capturar rico, mostrar pobre"): o operador
// responde só o que foi, quanto e como pagou. Conta contábil, custo × despesa,
// opex × capex e as DUAS DATAS são derivadas — nada disso aparece na tela.
// O sistema grava tudo mesmo escondido, pra quando esses recursos forem
// liberados já existir histórico.
//
// Tom profissional: "lançar" é o verbo que a equipe já usa. Nada de gamificação.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as Icons from 'lucide-react'
import { Plus, Loader2, Camera, X, Check, Trash2, Flame } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import {
  METODOS, derivarDatas, explicarCaixa, fmtBRL, fmtData, hojeISO, limitesDoMes,
  caminhoComprovante, type MetodoPagamento,
} from '@/lib/financeiro'

type Categoria = {
  id: string
  nome: string
  icone: string | null
  nivel: number
  parent_id: string | null
  fin_conta_id: string | null
  pergunta_capex: boolean
  termos: string[] | null       // sinônimos: "gasolina" acha Combustível
  fin_contas?: { codigo: string; nome: string; natureza: string } | null
}

type Lancamento = {
  id: string
  descricao: string | null
  valor: number
  data_competencia: string
  data_caixa: string | null
  metodo_pagamento: string | null
  anexo_url: string | null
  status: string
  fornecedor_nome: string | null
  categoria_id: string | null
  natureza: string | null        // opex/capex — reabre o form fiel ao gravado
  rateio_meses: number | null    // idem, pro checkbox "cobre mais de um mês"
  fin_categorias?: { nome: string; icone: string | null } | null
}

/** Custo de cremação provisionado na competência (mig 114). Não é digitado. */
type CustoAuto = {
  tipo_cremacao: 'individual' | 'coletiva'
  qtd_pets: number
  qtd_cobrados: number
  valor: number
}

const mesAtual = () => new Date().toISOString().slice(0, 7)

/** Ícone do lucide pelo nome salvo na categoria (fallback: etiqueta). */
function IconeCat({ nome, className }: { nome?: string | null; className?: string }) {
  const C = (nome && (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[nome]) || Icons.Tag
  return <C className={className} />
}

export default function LancamentosTab() {
  const supabaseTipado = createClient()
  // Tabelas fin_* ainda não estão em types/database.ts
  const supabase = supabaseTipado as unknown as SupabaseClient
  const { toast } = useToast()
  const { currentUnit, hasModule, userName } = useUnit()

  const [mes, setMes] = useState(mesAtual())
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [custosAuto, setCustosAuto] = useState<CustoAuto[]>([])
  const [carregando, setCarregando] = useState(false)

  // formulário — o mesmo modal serve pra criar e pra editar. `editandoId` decide:
  // null = insert, preenchido = update. Errar valor ou categoria e nao poder
  // corrigir obrigaria a excluir e relancar, perdendo o comprovante ja enviado.
  const [aberto, setAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [anexoAtual, setAnexoAtual] = useState<string | null>(null)
  const [catId, setCatId] = useState('')
  const [busca, setBusca] = useState('')
  // Drill-down em colunas: escolhe a categoria → abre as subcategorias → abre os tipos
  const [nivel1, setNivel1] = useState<string | null>(null)
  const [nivel2, setNivel2] = useState<string | null>(null)
  const [valor, setValor] = useState('')
  const [data, setData] = useState(hojeISO())
  const [metodo, setMetodo] = useState<MetodoPagamento | ''>('')
  const [fornecedor, setFornecedor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [duravel, setDuravel] = useState<boolean | null>(null)   // vira opex/capex
  // Rateio: gasto que cobre vários meses (seguro anual, anuidade). Distribui só
  // na COMPETÊNCIA — o caixa sai inteiro quando saiu.
  const [rateado, setRateado] = useState(false)
  const [meses, setMeses] = useState('12')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const catSelecionada = categorias.find(c => c.id === catId)

  useEffect(() => {
    supabase
      .from('fin_categorias')
      .select('id, nome, icone, nivel, parent_id, fin_conta_id, pergunta_capex, termos, fin_contas(codigo, nome, natureza)')
      .eq('ativo', true)
      .order('nivel')
      .order('ordem')
      .then(({ data }) => setCategorias(((data as unknown as Categoria[]) || [])))
  }, [supabase])

  // ── árvore: categoria > subcategoria > tipo ──────────────────────────────
  const filhosDe = (pai: string | null) =>
    categorias.filter(c => (pai === null ? c.parent_id === null : c.parent_id === pai))

  /** "Operacional › Veículos › Combustível" */
  const caminhoDe = useCallback((id: string): string => {
    const partes: string[] = []
    let atual = categorias.find(c => c.id === id)
    while (atual) {
      partes.unshift(atual.nome)
      atual = atual.parent_id ? categorias.find(c => c.id === atual!.parent_id) : undefined
    }
    return partes.join(' › ')
  }, [categorias])

  const folhas = categorias.filter(c => !categorias.some(f => f.parent_id === c.id))

  /** tira acento pra "pedagio" achar "pedágio" e vice-versa */
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

  // Busca no nome, no caminho E nos SINÔNIMOS: "gasolina" → Combustível,
  // "troca de óleo" → Manutenção, "chocolate" → Brinde.
  const resultados = busca.trim().length >= 2
    ? folhas
        .map(c => {
          const termos = (c.termos || []).map(norm)
          const alvo = norm(caminhoDe(c.id)) + ' ' + termos.join(' ')
          const palavras = norm(busca.trim()).split(/\s+/)
          if (!palavras.every(t => alvo.includes(t))) return null
          // quem bate no nome do item vem antes de quem bate só por sinônimo
          const forte = palavras.every(t => norm(c.nome).includes(t))
          const termoBatido = termos.find(t => palavras.some(p => t.includes(p)))
          return { c, forte, termoBatido }
        })
        .filter(Boolean)
        .sort((a, b) => Number(b!.forte) - Number(a!.forte))
        .slice(0, 40) as { c: Categoria; forte: boolean; termoBatido?: string }[]
    : []

  const carregar = useCallback(async () => {
    if (!currentUnit?.id) return
    setCarregando(true)
    const { ini, fim } = limitesDoMes(mes)
    const { data } = await supabase
      .from('fin_lancamentos')
      .select('id, descricao, valor, data_competencia, data_caixa, metodo_pagamento, anexo_url, status, fornecedor_nome, categoria_id, natureza, rateio_meses, fin_categorias(nome, icone)')
      .eq('unidade_id', currentUnit.id)
      .gte('data_competencia', ini)
      .lte('data_competencia', fim)
      .order('data_competencia', { ascending: false })
    setLancamentos(((data as unknown as Lancamento[]) || []))

    // Custo de cremação: nasce do acolhimento, não de digitação (mig 114).
    // A Matriz e a unidade que crema no próprio local (PI) não têm linha aqui.
    const { data: auto } = await supabase
      .from('vw_custo_cremacao_competencia')
      .select('tipo_cremacao, qtd_pets, qtd_cobrados, valor')
      .eq('unidade_id', currentUnit.id)
      .eq('mes', `${mes}-01`)
    setCustosAuto(((auto as unknown as CustoAuto[]) || []))

    setCarregando(false)
  }, [supabase, currentUnit?.id, mes])

  useEffect(() => { void carregar() }, [carregar])

  function escolherArquivo(f: File | null) {
    setArquivo(f)
    setPrevia(f ? URL.createObjectURL(f) : null)
  }

  function limpar() {
    setCatId(''); setValor(''); setData(hojeISO()); setMetodo('')
    setFornecedor(''); setDescricao(''); setDuravel(null)
    setRateado(false); setMeses('12')
    setBusca(''); setNivel1(null); setNivel2(null)
    escolherArquivo(null); setAberto(false)
    setEditandoId(null); setAnexoAtual(null)
  }

  /** Abre o modal com o lançamento carregado. */
  function editar(l: Lancamento) {
    setEditandoId(l.id)
    setCatId(l.categoria_id || '')
    setValor(String(l.valor ?? ''))
    setData((l.data_competencia || '').slice(0, 10))
    setMetodo((l.metodo_pagamento as MetodoPagamento) || '')
    setFornecedor(l.fornecedor_nome || '')
    setDescricao(l.descricao || '')
    // capex só é pergunta em alguns itens; fora deles `duravel` fica null e o
    // salvar cai na natureza da conta, como no lançamento novo.
    setDuravel(l.natureza === 'capex' ? true : (l.natureza === 'opex' ? false : null))
    const r = Number(l.rateio_meses || 1)
    setRateado(r > 1); setMeses(String(r > 1 ? r : 12))
    setAnexoAtual(l.anexo_url || null)
    escolherArquivo(null)
    setBusca(''); setNivel1(null); setNivel2(null)
    setAberto(true)
  }

  async function salvar() {
    if (!currentUnit?.id) return
    const v = Number(valor)
    if (!catId) return toast('Escolha a categoria', 'error')
    if (!v || v <= 0) return toast('Informe o valor', 'error')
    if (!metodo) return toast('Informe como foi pago', 'error')
    if (catSelecionada?.pergunta_capex && duravel === null) {
      return toast('Responda se vai durar mais de um ano', 'error')
    }

    setSalvando(true)
    try {
      // Comprovante primeiro — bucket PRIVADO, guardamos só o caminho.
      // Na edição sem arquivo novo, mantém o que já estava.
      let anexo: string | null = anexoAtual
      if (arquivo) {
        const path = caminhoComprovante(currentUnit.codigo, arquivo)
        const { error } = await supabase.storage.from('financeiro').upload(path, arquivo, {
          cacheControl: '3600', upsert: false,
        })
        if (error) throw new Error('Falha ao enviar o comprovante: ' + error.message)
        // Trocou o comprovante: o antigo vira lixo no bucket privado.
        if (anexoAtual) await supabase.storage.from('financeiro').remove([anexoAtual])
        anexo = path
      }

      const { data_competencia, data_caixa } = derivarDatas(data, metodo)
      const conta = catSelecionada?.fin_contas

      const campos = {
        categoria_id: catId,
        conta_id: catSelecionada?.fin_conta_id || null,
        conta_codigo: conta?.codigo || null,  // SNAPSHOT: congela a DRE histórica
        conta_nome: conta?.nome || null,
        natureza: duravel === true ? 'capex' : (conta?.natureza || 'opex'),
        descricao: descricao.trim() || null,
        valor: v,
        data_competencia,
        data_caixa,
        // `status` e `origem` NÃO entram aqui: são de criação. No update,
        // reescrevê-los rebaixaria um lançamento já aprovado de volta pra
        // pendente e apagaria a origem de um que veio por OCR/QR.
        fornecedor_nome: fornecedor.trim() || null,
        metodo_pagamento: metodo,
        rateio_meses: rateado ? Math.max(1, Math.min(120, Number(meses) || 1)) : 1,
        anexo_url: anexo,
      }

      const { error } = editandoId
        ? await supabase.from('fin_lancamentos').update(campos).eq('id', editandoId)
        : await supabase.from('fin_lancamentos').insert({
            ...campos,
            unidade_id: currentUnit.id,
            empresa_id: null,                 // definido depois, no fechamento
            status: 'pendente',
            origem: 'manual',
            criado_por_nome: userName || null,
          })
      if (error) throw new Error(error.message)

      toast(editandoId ? `Lançamento atualizado — ${fmtBRL(v)}` : `Lançado ${fmtBRL(v)}`, 'success')
      limpar()
      void carregar()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao lançar', 'error')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(id: string) {
    const { error } = await supabase.from('fin_lancamentos').delete().eq('id', id)
    if (error) return toast(error.message, 'error')
    setLancamentos(l => l.filter(x => x.id !== id))
    toast('Lançamento excluído', 'success')
  }

  /** Comprovante fica em bucket privado — abre por URL assinada. */
  async function verComprovante(path: string) {
    const { data, error } = await supabase.storage.from('financeiro').createSignedUrl(path, 60)
    if (error || !data) return toast('Não consegui abrir o comprovante', 'error')
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const totalDigitado = lancamentos.reduce((s, l) => s + Number(l.valor || 0), 0)
  const totalAuto = custosAuto.reduce((s, c) => s + Number(c.valor || 0), 0)
  const total = totalDigitado + totalAuto

  return (
    <div className="animate-fade-in space-y-3">
      {/* Cabeçalho compacto */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="month" value={mes} onChange={e => setMes(e.target.value)}
          className="input text-sm w-36 py-1"
        />
        <span className="text-xs text-[var(--surface-500)]">
          <span className="text-mono text-[var(--surface-700)]">{fmtBRL(total)}</span>
          {' · '}{lancamentos.length} {lancamentos.length === 1 ? 'lançamento' : 'lançamentos'}
          {totalAuto > 0 && ' + cremações'}
        </span>
        {carregando && <Loader2 className="h-4 w-4 animate-spin text-[var(--surface-400)]" />}
        <button onClick={() => setAberto(true)} className="btn-primary text-sm ml-auto">
          <Plus className="h-4 w-4" /> Novo lançamento
        </button>
      </div>

      {/* CUSTOS AUTOMÁTICOS — fixos no topo, não se digita.
          A cremação é custo do mês em que o pet foi ACOLHIDO, não do mês em que
          a Matriz cobra (dia 20 do mês seguinte) nem do mês em que a unidade
          paga. Enquanto o repasse não fecha, entra a preço de tabela; depois,
          pelo valor realmente cobrado, já com o deflator. Ver mig 114. */}
      {custosAuto.length > 0 && (
        <div className="card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-[var(--surface-600)] uppercase tracking-wide">
              Custos automáticos
            </h3>
            <span className="text-[10px] text-[var(--surface-400)]">não precisa lançar</span>
            <span className="ml-auto text-mono text-sm text-[var(--surface-700)]">{fmtBRL(totalAuto)}</span>
          </div>

          <div className="divide-y divide-[var(--surface-200)]">
            {['individual', 'coletiva'].map(t => {
              const c = custosAuto.find(x => x.tipo_cremacao === t)
              if (!c || !c.qtd_pets) return null
              const ind = t === 'individual'
              // Parcialmente cobrado ainda conta como estimado: o valor pode mudar
              // quando o resto entrar no repasse.
              const fechado = c.qtd_cobrados >= c.qtd_pets
              return (
                <div key={t} className="flex items-center gap-3 py-2">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: ind ? 'rgba(16,185,129,0.14)' : 'rgba(139,92,246,0.14)' }}
                  >
                    <Flame className="h-4 w-4" style={{ color: ind ? '#10b981' : '#8b5cf6' }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[var(--surface-800)]">
                      Cremações {ind ? 'individuais' : 'coletivas'}
                    </p>
                    <p className="text-xs text-[var(--surface-500)]">
                      {c.qtd_pets} {c.qtd_pets === 1 ? 'pet acolhido' : 'pets acolhidos'} ·{' '}
                      {fechado
                        ? 'valor cobrado pela Matriz'
                        : c.qtd_cobrados > 0
                          ? `${c.qtd_cobrados} já cobrados, o resto a preço de tabela`
                          : 'a preço de tabela até a Matriz fechar o mês'}
                    </p>
                  </div>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                    style={{
                      background: fechado ? 'rgba(16,185,129,0.14)' : 'var(--surface-100)',
                      color: fechado ? '#10b981' : 'var(--surface-500)',
                    }}
                  >
                    {fechado ? 'cobrado' : 'estimado'}
                  </span>
                  <span className="text-mono text-sm text-[var(--surface-800)] shrink-0">{fmtBRL(c.valor)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Lista do mês — o espelho que dá confiança no que foi digitado */}
      <div className="card p-3 space-y-2">
        <h3 className="text-xs font-semibold text-[var(--surface-600)] uppercase tracking-wide">
          Lançamentos do mês
        </h3>

        {!carregando && lancamentos.length === 0 && (
          <p className="text-sm text-[var(--surface-500)] py-6 text-center">
            Nenhum lançamento neste mês.
          </p>
        )}

        <div className="divide-y divide-[var(--surface-200)]">
          {lancamentos.map(l => (
            <div
              key={l.id}
              onClick={() => editar(l)}
              className="flex items-center gap-3 py-2 -mx-1 px-1 rounded-[var(--radius-sm)] cursor-pointer hover:bg-[var(--surface-50)] transition-colors"
              title="Editar lançamento"
            >
              <div className="w-8 h-8 rounded-full bg-[var(--surface-100)] flex items-center justify-center shrink-0">
                <IconeCat nome={l.fin_categorias?.icone} className="h-4 w-4 text-[var(--surface-500)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--surface-800)] truncate">
                  {l.fin_categorias?.nome || 'Sem categoria'}
                  {l.fornecedor_nome && <span className="text-[var(--surface-500)]"> · {l.fornecedor_nome}</span>}
                </p>
                <p className="text-xs text-[var(--surface-500)] truncate">
                  {fmtData(l.data_competencia)}
                  {l.descricao && ` · ${l.descricao}`}
                </p>
              </div>
              {l.anexo_url && (
                <button
                  onClick={e => { e.stopPropagation(); void verComprovante(l.anexo_url!) }}
                  title="Ver comprovante"
                  className="text-[var(--surface-400)] hover:text-[var(--brand-500)] shrink-0"
                >
                  <Camera className="h-4 w-4" />
                </button>
              )}
              <span className="text-mono text-sm text-[var(--surface-800)] shrink-0">{fmtBRL(l.valor)}</span>
              <button
                onClick={e => { e.stopPropagation(); void excluir(l.id) }}
                title="Excluir"
                className="text-[var(--surface-400)] hover:text-red-400 shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Novo lançamento */}
      <Modal
        isOpen={aberto}
        onClose={limpar}
        title={editandoId ? 'Editar lançamento' : 'Novo lançamento'}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={limpar} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={() => void salvar()} disabled={salvando} className="btn-primary text-sm">
              {salvando
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</>
                : <><Check className="h-4 w-4" /> {editandoId ? 'Salvar' : 'Lançar'}</>}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Categoria — árvore (categoria › subcategoria › tipo) + busca direta */}
          <div>
            <label className="text-xs text-[var(--surface-500)] block mb-1.5">Categoria</label>

            {catId ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] border"
                   style={{ borderColor: '#10b981', background: 'rgba(16,185,129,0.10)' }}>
                <span className="flex-1 text-sm text-emerald-400 truncate">{caminhoDe(catId)}</span>
                <button
                  type="button"
                  onClick={() => { setCatId(''); setDuravel(null); setBusca('') }}
                  className="text-[var(--surface-400)] hover:text-[var(--surface-700)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center rounded-[var(--radius-md)] border overflow-hidden"
                     style={{ borderColor: 'var(--surface-300)', background: 'var(--surface-0)' }}>
                  <Icons.Search className="h-4 w-4 text-[var(--surface-400)] ml-2 shrink-0" />
                  <input
                    type="text" value={busca} onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar (ex.: gasolina, troca de óleo, chocolate)"
                    className="w-full bg-transparent border-0 outline-none text-sm px-2 py-2 text-[var(--surface-800)]"
                  />
                  {busca && (
                    <button type="button" onClick={() => setBusca('')} className="px-2 text-[var(--surface-400)] hover:text-[var(--surface-700)]">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {busca.trim().length >= 2 ? (
                  /* Busca: folha + caminho inteiro */
                  <div className="max-h-64 overflow-y-auto border border-[var(--surface-200)] rounded-[var(--radius-md)] divide-y divide-[var(--surface-200)]">
                    {resultados.length === 0 && (
                      <p className="text-sm text-[var(--surface-500)] px-3 py-3">Nada encontrado.</p>
                    )}
                    {resultados.map(({ c, forte, termoBatido }) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setCatId(c.id); setDuravel(null); setBusca('') }}
                        className="w-full text-left px-3 py-2 hover:bg-[var(--surface-100)]/60"
                      >
                        <span className="text-sm text-[var(--surface-800)]">
                          {c.nome}
                          {/* achou por sinônimo: mostra qual, pra pessoa entender o pulo */}
                          {!forte && termoBatido && (
                            <span className="text-[11px] text-[var(--surface-400)]"> · {termoBatido}</span>
                          )}
                        </span>
                        <span className="block text-[11px] text-[var(--surface-500)] truncate">{caminhoDe(c.id)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  /* Drill-down em 3 colunas: Categoria › Subcategoria › Tipo */
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {([
                      { titulo: 'Categoria',    pai: null as string | null, sel: nivel1 },
                      { titulo: 'Subcategoria', pai: nivel1,                sel: nivel2 },
                      { titulo: 'Item',         pai: nivel2,                sel: null   },
                    ]).map((col, idx) => {
                      const itens = idx === 0 ? filhosDe(null) : (col.pai ? filhosDe(col.pai) : [])
                      return (
                        <div key={col.titulo} className="border border-[var(--surface-200)] rounded-[var(--radius-md)] overflow-hidden">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--surface-500)] px-2 py-1.5 bg-[var(--surface-100)]/60">
                            {col.titulo}
                          </p>
                          <div className="max-h-52 overflow-y-auto divide-y divide-[var(--surface-200)]">
                            {itens.length === 0 && (
                              <p className="text-[11px] text-[var(--surface-400)] px-2 py-3">
                                {idx === 1 ? 'Escolha a categoria' : 'Escolha a subcategoria'}
                              </p>
                            )}
                            {itens.map(c => {
                              const on = col.sel === c.id
                              const folha = !categorias.some(f => f.parent_id === c.id)
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    if (idx === 0) { setNivel1(c.id); setNivel2(null) }
                                    else if (idx === 1) setNivel2(c.id)
                                    if (folha) { setCatId(c.id); setDuravel(null) }
                                  }}
                                  className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-[var(--surface-100)]/60 transition-colors"
                                  style={{ background: on ? 'rgba(16,185,129,0.10)' : undefined }}
                                >
                                  {c.icone && (
                                    <IconeCat nome={c.icone} className={`h-3.5 w-3.5 shrink-0 ${on ? 'text-emerald-400' : 'text-[var(--surface-400)]'}`} />
                                  )}
                                  <span className={`text-xs flex-1 truncate ${on ? 'text-emerald-400' : 'text-[var(--surface-700)]'}`}>
                                    {c.nome}
                                  </span>
                                  {!folha && <Icons.ChevronRight className="h-3 w-3 text-[var(--surface-400)] shrink-0" />}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Valor + data */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Valor</label>
              <div className="flex items-center rounded-[var(--radius-md)] border overflow-hidden"
                   style={{ borderColor: 'var(--surface-300)', background: 'var(--surface-0)' }}>
                <span className="text-sm text-[var(--surface-400)] pl-2">R$</span>
                <input
                  type="number" min={0} step="0.01" value={valor}
                  onChange={e => setValor(e.target.value)}
                  placeholder="0,00"
                  className="w-full bg-transparent border-0 outline-none text-sm text-mono px-2 py-2 text-[var(--surface-800)]"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Data</label>
              <input
                type="date" value={data} onChange={e => setData(e.target.value)}
                className="input text-sm w-full"
              />
            </div>
          </div>

          {/* Como pagou — define a data de caixa por trás */}
          <div>
            <label className="text-xs text-[var(--surface-500)] block mb-1.5">Pagamento</label>
            <div className="flex flex-wrap gap-1.5">
              {METODOS.map(m => {
                const on = metodo === m.valor
                return (
                  <button
                    key={m.valor}
                    type="button"
                    onClick={() => setMetodo(m.valor)}
                    className="text-xs px-2.5 py-1.5 rounded-[var(--radius-md)] border transition-colors"
                    style={{
                      background: on ? 'rgba(16,185,129,0.12)' : 'transparent',
                      borderColor: on ? '#10b981' : 'var(--surface-200)',
                      color: on ? '#10b981' : 'var(--surface-600)',
                    }}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>
            {explicarCaixa(metodo) && (
              <p className="text-[11px] text-[var(--surface-400)] mt-1.5">{explicarCaixa(metodo)}</p>
            )}
          </div>

          {/* Rateio: o gasto cobre mais de um mês? (seguro anual, anuidade…) */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox" checked={rateado}
                onChange={e => setRateado(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
              <span className="text-xs text-[var(--surface-600)]">Cobre mais de um mês</span>
            </label>

            {rateado && (
              <div className="flex flex-wrap items-center gap-2 mt-2 pl-6">
                <input
                  type="number" min={2} max={120} value={meses}
                  onChange={e => setMeses(e.target.value)}
                  className="input text-sm text-mono w-20 py-1"
                />
                <span className="text-xs text-[var(--surface-500)]">meses</span>
                {Number(valor) > 0 && Number(meses) > 1 && (
                  <span className="text-[11px] text-[var(--surface-400)]">
                    {fmtBRL(Number(valor) / Number(meses))} por mês
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Só pergunta quando a regra é mesmo ambígua (capex × opex) */}
          {catSelecionada?.pergunta_capex && (
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1.5">Durabilidade</label>
              <div className="flex gap-2">
                {[{ v: true, l: '+ de 1 ano' }, { v: false, l: '- de 1 ano' }].map(op => {
                  const on = duravel === op.v
                  return (
                    <button
                      key={op.l}
                      type="button"
                      onClick={() => setDuravel(op.v)}
                      className="text-xs px-4 py-1.5 rounded-[var(--radius-md)] border transition-colors"
                      style={{
                        background: on ? 'rgba(16,185,129,0.12)' : 'transparent',
                        borderColor: on ? '#10b981' : 'var(--surface-200)',
                        color: on ? '#10b981' : 'var(--surface-600)',
                      }}
                    >
                      {op.l}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Onde e observação */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Fornecedor</label>
              <input
                type="text" value={fornecedor} onChange={e => setFornecedor(e.target.value)}
                placeholder="Ex.: Posto Ipiranga"
                className="input text-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Observação</label>
              <input
                type="text" value={descricao} onChange={e => setDescricao(e.target.value)}
                placeholder="Ex.: abastecimento da van"
                className="input text-sm w-full"
              />
            </div>
          </div>

          {/* Comprovante */}
          <div>
            <label className="text-xs text-[var(--surface-500)] block mb-1.5">Comprovante</label>
            {anexoAtual && !previa && (
              <button
                onClick={() => void verComprovante(anexoAtual)}
                className="text-xs text-[var(--brand-500)] underline mb-1.5 block"
              >
                ver o comprovante já anexado
              </button>
            )}
            {previa ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previa} alt="comprovante" className="h-20 w-20 object-cover rounded-[var(--radius-md)] border border-[var(--surface-200)]" />
                <button onClick={() => escolherArquivo(null)} className="btn-secondary text-xs">
                  <X className="h-3.5 w-3.5" /> Remover
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] border border-dashed cursor-pointer text-sm text-[var(--surface-500)] hover:text-[var(--surface-700)]"
                     style={{ borderColor: 'var(--surface-300)' }}>
                <Camera className="h-4 w-4" />
                {anexoAtual ? 'Trocar comprovante' : 'Anexar'}
                <input
                  type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f && f.size > 8 * 1024 * 1024) return toast('Imagem muito grande (máx. 8 MB)', 'error')
                    escolherArquivo(f || null)
                  }}
                />
              </label>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
