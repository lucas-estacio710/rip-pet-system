'use client'

/**
 * ➕ Adicionar outro produto — 2º nível do popup de pendências, faixa OPCIONAIS (31/10/2026,
 * pedido do Lucas): o "➕ Adicionar Produto" do /contratos/[id], mais rápido, pelo pipeline.
 *
 *   1. lista → os produtos do contrato com valor e desconto; ✏️ valor · ⇄ trocar · 🗑 tirar
 *   2. escolha → o catálogo inteiro (busca + tipo + categoria, grade com a foto)
 *   3. confirmação → preço editável e desconto %/R$, os mesmos atalhos da ⚱️ Urna
 *
 * VIA DE MÃO DUPLA: grava em `contrato_produtos` como qualquer outra tela, então um personalizado
 * aparece no 💎, uma urna no ⚱️ e um pelinho no 🫙 sem nada a mais. SEM atribuição aqui — a
 * tarefa continua sendo do popup de cada um. A gravação é a de `lib/urna.ts` (preço em `valor`,
 * desconto em `desconto`, estoque da unidade DO CONTRATO, troca que preserva a tarefa quando dá).
 *
 * A tela lê as próprias linhas (o pipeline não carrega valor/desconto) e avisa a página em
 * `onMudou` pra ela reler o contrato (placar, 💵 saldo e os outros faróis).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Search, X, Loader2, Pencil, Trash2, Repeat } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  descontoDaUrna, valorFinalDaUrna, trocaPreservaLinha, adicionarUrna, trocarUrna,
  ajustarValorDaLinha, removerLinhaProduto, type DescontoUrna,
} from '@/lib/urna'

type Linha = {
  id: string
  produtoId: string
  codigo: string
  nome: string
  tipo: string
  imagemUrl: string | null
  rescaldoTipo: string | null
  feito: boolean
  valor: number
  desconto: number
}

type ItemCatalogo = {
  id: string; codigo: string; nome: string; tipo: string; categoria: string | null; preco: number | null
  imagem_url: string | null; estoque_infinito: boolean | null; rescaldo_tipo: string | null; estoque: number
}

type Props = {
  contratoId: string
  unidadeId: string | null
  /** Depois de gravar: a página relê os produtos e os valores do contrato. */
  onMudou: () => Promise<void> | void
}

/** Marcadores de recusa ("Nenhuma urna", "Nenhum personalizado") — não são produto. */
const MARCADORES = new Set(['0001', '0002'])
const ROTULO_RESCALDO: Record<string, string> = {
  molde_patinha: 'molde de patinha', molde_focinho: 'molde de focinho', carimbo: 'carimbo', pelo_extra: 'pelo extra', pelinho: 'pelinho', outro: 'personalizado',
}
const FILTROS = [
  { id: '', rotulo: 'Todos' },
  { id: 'urna', rotulo: 'Urnas' },
  { id: 'personalizado', rotulo: 'Personalizados' },
  { id: 'acessorio', rotulo: 'Acessórios' },
] as const
const PERCENTS = [100, 50, 30, 25, 20, 10]
const VALORES = [100, 80, 50, 30, 20]
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const imagem = (u: { imagem_url: string | null; codigo: string }) => u.imagem_url || `/estoque/${u.codigo}.png`

function doFiltro(i: ItemCatalogo, f: string): boolean {
  if (!f) return true
  if (f === 'personalizado') return !!i.rescaldo_tipo
  if (f === 'acessorio') return i.tipo !== 'urna' && !i.rescaldo_tipo
  return i.tipo === f
}

export default function ProdutosTela(p: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [nenhumId, setNenhumId] = useState<{ id: string; produtoId: string } | null>(null)
  const [passo, setPasso] = useState<'inicio' | 'escolha' | 'confirma'>('inicio')
  // null = adicionar; uma linha = trocar aquela linha
  const [trocando, setTrocando] = useState<Linha | null>(null)
  // ✏️ só valor/desconto da linha (sem trocar o produto)
  const [editando, setEditando] = useState<Linha | null>(null)
  const [catalogo, setCatalogo] = useState<ItemCatalogo[] | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('')
  const [sel, setSel] = useState<ItemCatalogo | null>(null)
  const [preco, setPreco] = useState<number | ''>('')
  const [desc, setDesc] = useState<DescontoUrna>({ tipo: 'percent', percent: '', valor: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Busca separada de aplicar: o efeito de abertura só toca no estado depois da resposta.
  const buscarLinhas = useCallback(async (): Promise<{ linhas: Linha[]; nenhum: { id: string; produtoId: string } | null; erro: string | null }> => {
    const { data, error } = await supabase.from('contrato_produtos')
      .select('id, produto_id, valor, desconto, rescaldo_feito, produto:produtos(codigo, nome, tipo, imagem_url, rescaldo_tipo)')
      .eq('contrato_id', p.contratoId)
    if (error) return { linhas: [], nenhum: null, erro: 'Não consegui ler os produtos: ' + error.message }
    type Row = { id: string; produto_id: string; valor: number | null; desconto: number | null; rescaldo_feito: boolean | null; produto: { codigo: string; nome: string; tipo: string; imagem_url: string | null; rescaldo_tipo: string | null } | null }
    const rows = (data || []) as unknown as Row[]
    const nenhum = rows.find(r => r.produto?.codigo === '0002')
    return {
      erro: null,
      nenhum: nenhum ? { id: nenhum.id, produtoId: nenhum.produto_id } : null,
      linhas: rows.filter(r => r.produto && !MARCADORES.has(r.produto.codigo)).map(r => ({
        id: r.id, produtoId: r.produto_id, codigo: r.produto!.codigo, nome: r.produto!.nome, tipo: r.produto!.tipo,
        imagemUrl: r.produto!.imagem_url, rescaldoTipo: r.produto!.rescaldo_tipo, feito: !!r.rescaldo_feito,
        valor: r.valor || 0, desconto: r.desconto || 0,
      })).sort((x, y) => (x.tipo === 'urna' ? 0 : 1) - (y.tipo === 'urna' ? 0 : 1) || x.nome.localeCompare(y.nome)),
    }
  }, [supabase, p.contratoId])
  const aplicarLinhas = (r: Awaited<ReturnType<typeof buscarLinhas>>) => {
    setLinhas(r.linhas); setNenhumId(r.nenhum); if (r.erro) setErro(r.erro)
  }
  const lerLinhas = async () => aplicarLinhas(await buscarLinhas())

  useEffect(() => {
    let vivo = true
    void buscarLinhas().then(r => { if (vivo) aplicarLinhas(r) })
    return () => { vivo = false }
  }, [buscarLinhas]) // eslint-disable-line react-hooks/exhaustive-deps -- aplicarLinhas só chama setters

  // Catálogo (ativos, sem os marcadores) com o saldo da unidade DO CONTRATO — só ao escolher.
  useEffect(() => {
    if (passo !== 'escolha' || catalogo) return
    let cancelado = false
    ;(async () => {
      const { data: prods } = await supabase.from('produtos')
        .select('id, codigo, nome, tipo, categoria, preco, imagem_url, estoque_infinito, rescaldo_tipo')
        .eq('ativo', true).order('nome')
      const saldo = new Map<string, number>()
      if (p.unidadeId) {
        const { data: est } = await supabase.from('produtos_estoque').select('produto_id, estoque_atual').eq('unidade_id', p.unidadeId)
        for (const r of (est || []) as { produto_id: string; estoque_atual: number }[]) saldo.set(r.produto_id, r.estoque_atual)
      }
      if (!cancelado) setCatalogo(((prods || []) as Omit<ItemCatalogo, 'estoque'>[])
        .filter(i => !MARCADORES.has(i.codigo))
        .map(i => ({ ...i, estoque: saldo.get(i.id) ?? 0 })))
    })()
    return () => { cancelado = true }
  }, [supabase, p.unidadeId, passo, catalogo])

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return (catalogo || []).filter(i => doFiltro(i, filtro) && (!t || i.nome.toLowerCase().includes(t) || i.codigo.toLowerCase().includes(t)))
  }, [catalogo, busca, filtro])
  const grupos = useMemo(() => {
    const m = new Map<string, ItemCatalogo[]>()
    for (const i of filtrados) { const k = i.categoria || (i.tipo === 'urna' ? 'Urnas' : 'Outros'); m.set(k, [...(m.get(k) || []), i]) }
    return [...m.keys()].sort((a, b) => a.localeCompare(b)).map(cat => ({ cat, itens: m.get(cat)! }))
  }, [filtrados])

  const precoTabela = editando ? editando.valor : (sel?.preco || 0)
  const precoBase = typeof preco === 'number' ? preco : precoTabela
  const final = valorFinalDaUrna(precoBase, desc)

  function iniciarEscolha(linha: Linha | null) {
    setTrocando(linha); setEditando(null); setSel(null); setBusca(''); setFiltro(''); setErro(null); setPasso('escolha')
  }

  function iniciarEdicao(linha: Linha) {
    setEditando(linha); setTrocando(null); setSel(null); setErro(null)
    setPreco('')
    setDesc(linha.desconto > 0 ? { tipo: 'valor', percent: '', valor: linha.desconto } : { tipo: 'percent', percent: '', valor: '' })
    setPasso('confirma')
  }

  function avancar() {
    if (!sel) return
    setPreco(''); setDesc({ tipo: 'percent', percent: '', valor: '' }); setErro(null); setPasso('confirma')
  }

  async function depoisDeGravar() {
    await lerLinhas()
    await p.onMudou()
    setSalvando(false); setSel(null); setTrocando(null); setEditando(null); setPasso('inicio')
  }

  async function confirmar() {
    if (salvando) return
    const desconto = descontoDaUrna(precoBase, desc)
    if (editando) {
      setSalvando(true); setErro(null)
      try {
        await ajustarValorDaLinha(supabase, { linhaId: editando.id, preco: precoBase, desconto })
        await depoisDeGravar()
      } catch (e) { setErro(e instanceof Error ? e.message : String(e)); setSalvando(false) }
      return
    }
    if (!sel) return
    // Trocar por tipo diferente de personalizado apaga a linha — e com ela a tarefa/foto. Avisar.
    if (trocando && !trocaPreservaLinha(trocando.rescaldoTipo, sel.rescaldo_tipo) && trocando.rescaldoTipo) {
      const oque = ROTULO_RESCALDO[trocando.rescaldoTipo] || 'personalizado'
      if (!confirm(`${trocando.nome} tem a tarefa de ${oque}${trocando.feito ? ' (já feita)' : ''}. Trocar por ${sel.nome} cancela essa tarefa. Continuar?`)) return
    }
    setSalvando(true); setErro(null)
    try {
      const item = { id: sel.id, codigo: sel.codigo, rescaldo_tipo: sel.rescaldo_tipo }
      if (trocando) {
        await trocarUrna(supabase, { contratoId: p.contratoId, unidadeId: p.unidadeId, linha: { id: trocando.id, produto_id: trocando.produtoId, rescaldo_tipo: trocando.rescaldoTipo }, urna: item, preco: precoBase, desconto })
      } else {
        await adicionarUrna(supabase, { contratoId: p.contratoId, unidadeId: p.unidadeId, urna: item, preco: precoBase, desconto })
      }
      // Personalizado entrou: o "Nenhum personalizado" (0002) deixa de ser verdade — mesma regra da ⚱️.
      if (sel.rescaldo_tipo && sel.rescaldo_tipo !== 'pelinho' && nenhumId) {
        await removerLinhaProduto(supabase, { unidadeId: p.unidadeId, linha: { id: nenhumId.id, produto_id: nenhumId.produtoId } })
      }
      await depoisDeGravar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      setSalvando(false)
    }
  }

  async function tirar(l: Linha) {
    if (salvando) return
    const tarefa = l.rescaldoTipo ? ` A tarefa de ${ROTULO_RESCALDO[l.rescaldoTipo] || 'personalizado'} é cancelada junto.` : ''
    if (!confirm(`Tirar ${l.nome} do contrato?${tarefa}`)) return
    setSalvando(true); setErro(null)
    try {
      await removerLinhaProduto(supabase, { unidadeId: p.unidadeId, linha: { id: l.id, produto_id: l.produtoId } })
      await depoisDeGravar()
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); setSalvando(false) }
  }

  // ---------- 1. Os produtos do contrato ----------
  if (passo === 'inicio') {
    return (
      <div className="py-2 space-y-4">
        {linhas === null ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--surface-400)' }} /></div>
        ) : linhas.length === 0 ? (
          <p className="text-center py-4 text-sm" style={{ color: 'var(--surface-400)' }}>Nenhum produto neste contrato.</p>
        ) : (
          <div className="space-y-2">
            {linhas.map(l => {
              const fim = Math.max(0, l.valor - l.desconto)
              return (
                <div key={l.id} className="flex items-center gap-3 p-2 rounded-xl border" style={{ borderColor: 'var(--surface-200)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={l.imagemUrl || `/estoque/${l.codigo}.png`} alt="" className="w-12 h-12 rounded-lg bg-white flex-none" style={{ objectFit: 'contain' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold leading-tight line-clamp-2" style={{ color: 'var(--surface-800)' }}>{l.nome}</p>
                    <p className="text-[12px] tabular-nums" style={{ color: 'var(--surface-500)' }}>
                      {l.desconto > 0 && <span className="line-through mr-1.5" style={{ color: 'var(--surface-400)' }}>{brl(l.valor)}</span>}
                      <span className="font-semibold" style={{ color: fim <= 0 ? '#16a34a' : 'var(--surface-700)' }}>{fim <= 0 ? 'Grátis' : brl(fim)}</span>
                    </p>
                  </div>
                  <div className="flex-none flex items-center gap-1">
                    <button type="button" onClick={() => iniciarEdicao(l)} disabled={salvando} title="Mudar valor ou desconto"
                      className="w-8 h-8 grid place-items-center rounded-lg border" style={{ borderColor: 'var(--surface-200)', color: 'var(--surface-500)' }}><Pencil className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => iniciarEscolha(l)} disabled={salvando} title="Trocar por outro produto"
                      className="w-8 h-8 grid place-items-center rounded-lg border" style={{ borderColor: '#a855f7', color: '#9333ea', background: 'rgba(168,85,247,.10)' }}><Repeat className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => tirar(l)} disabled={salvando} title="Tirar do contrato"
                      className="w-8 h-8 grid place-items-center rounded-lg border" style={{ borderColor: 'var(--surface-200)', color: '#ef4444' }}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {erro && <p className="text-xs text-red-500">⚠ {erro}</p>}
        <button type="button" onClick={() => iniciarEscolha(null)} disabled={salvando}
          className="w-full py-3 rounded-lg border-2 text-sm font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          style={{ background: 'rgba(34,197,94,.12)', borderColor: '#22c55e', color: '#16a34a' }}>
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}➕ Adicionar produto
        </button>
      </div>
    )
  }

  // ---------- 3. Confirmação (adicionar, trocar ou ✏️ valor) ----------
  const alvo = editando ? { nome: editando.nome, codigo: editando.codigo, imagem_url: editando.imagemUrl } : sel
  if (passo === 'confirma' && alvo) {
    return (
      <div className="py-2">
        <div className="flex items-center gap-4 mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagem(alvo)} alt="" className="w-20 h-20 rounded-lg bg-white flex-none" style={{ objectFit: 'contain' }} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold line-clamp-2" style={{ color: 'var(--surface-700)' }}>{alvo.nome}</p>
            <p className="text-xs" style={{ color: 'var(--surface-400)' }}>{alvo.codigo}{trocando ? ` · no lugar de ${trocando.nome}` : ''}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm" style={{ color: 'var(--surface-400)' }}>R$</span>
              <input type="number" min={0} step="0.01" inputMode="decimal" value={typeof preco === 'number' ? preco : precoTabela}
                onChange={e => setPreco(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="w-28 px-2 py-1 rounded-lg border font-bold outline-none"
                style={{ fontSize: 18, color: '#16a34a', borderColor: 'var(--surface-300)', background: 'rgba(34,197,94,.08)' }} />
              {typeof preco === 'number' && preco !== precoTabela && <span className="text-xs line-through" style={{ color: 'var(--surface-400)' }}>{brl(precoTabela)}</span>}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 p-3 rounded-lg border" style={{ borderColor: 'var(--surface-200)', background: 'var(--surface-100)' }}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: 'var(--surface-600)' }}>Desconto</span>
            <div className="flex p-0.5 rounded-lg border" style={{ borderColor: 'var(--surface-200)', background: 'var(--surface-0)' }}>
              {(['percent', 'valor'] as const).map(t => (
                <button key={t} type="button" onClick={() => setDesc({ tipo: t, percent: '', valor: '' })} className="px-3 py-1 text-xs font-medium rounded-md"
                  style={desc.tipo === t ? { background: 'rgba(168,85,247,.22)', color: '#9333ea' } : { color: 'var(--surface-400)' }}>{t === 'percent' ? '%' : 'R$'}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {desc.tipo === 'percent'
              ? PERCENTS.map(v => {
                  const on = desc.percent === v
                  return (
                    <button key={v} type="button" onClick={() => setDesc({ ...desc, percent: on ? '' : v })} className="px-2 py-1 text-xs font-medium rounded-md border"
                      style={on ? { background: v === 100 ? '#16a34a' : '#f59e0b', borderColor: v === 100 ? '#16a34a' : '#f59e0b', color: '#fff' } : { borderColor: 'var(--surface-200)', background: 'var(--surface-0)', color: 'var(--surface-600)' }}>
                      {v === 100 ? '🎁' : `-${v}%`}
                    </button>
                  )
                })
              : VALORES.map(v => {
                  const on = desc.valor === v
                  return (
                    <button key={v} type="button" onClick={() => setDesc({ ...desc, valor: on ? '' : v })} className="px-2 py-1 text-xs font-medium rounded-md border"
                      style={on ? { background: '#f59e0b', borderColor: '#f59e0b', color: '#fff' } : { borderColor: 'var(--surface-200)', background: 'var(--surface-0)', color: 'var(--surface-600)' }}>-R${v}</button>
                  )
                })}
            <span className="flex items-center gap-1 ml-1">
              {desc.tipo === 'valor' && <span className="text-xs" style={{ color: 'var(--surface-400)' }}>R$</span>}
              <input type="number" min={0} inputMode="decimal" placeholder="__"
                value={desc.tipo === 'percent'
                  ? (typeof desc.percent === 'number' && !PERCENTS.includes(desc.percent) ? desc.percent : '')
                  : (typeof desc.valor === 'number' && !VALORES.includes(desc.valor) ? desc.valor : '')}
                onChange={e => {
                  const v = e.target.value === '' ? '' as const : parseFloat(e.target.value)
                  setDesc(desc.tipo === 'percent' ? { ...desc, percent: v } : { ...desc, valor: v })
                }}
                className="w-14 px-1 py-1 rounded-md border text-center outline-none"
                style={{ borderColor: 'var(--surface-200)', background: 'var(--surface-0)', color: 'var(--surface-700)', fontSize: 16 }} />
              {desc.tipo === 'percent' && <span className="text-xs" style={{ color: 'var(--surface-400)' }}>%</span>}
            </span>
          </div>
        </div>

        <div className="mt-4 p-3 rounded-lg flex justify-between items-center" style={{ background: 'var(--surface-100)' }}>
          <span className="text-sm" style={{ color: 'var(--surface-400)' }}>Valor final:</span>
          <span className="text-xl font-bold" style={{ color: 'var(--surface-700)' }}>{final <= 0 ? 'GRÁTIS' : brl(final)}</span>
        </div>
        {erro && <p className="mt-2 text-xs text-red-500">⚠ {erro}</p>}

        <div className="sticky bottom-0 mt-3 pt-2 pb-1 flex items-center justify-between" style={{ background: 'var(--surface-0)' }}>
          <button type="button" onClick={() => setPasso(editando ? 'inicio' : 'escolha')} disabled={salvando} className="px-4 py-2 text-sm" style={{ color: 'var(--surface-400)' }}>Voltar</button>
          <button type="button" onClick={confirmar} disabled={salvando} className="px-6 py-2 rounded-lg text-sm text-white inline-flex items-center gap-1.5 disabled:opacity-50" style={{ background: '#9333ea' }}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}{editando ? 'Salvar' : 'Confirmar'}
          </button>
        </div>
      </div>
    )
  }

  // ---------- 2. Escolha no catálogo ----------
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--surface-400)' }} />
        <input type="search" enterKeyHint="search" autoComplete="off" value={busca} placeholder="Buscar produto…"
          onChange={e => setBusca(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() } }}
          className="w-full pl-9 pr-9 py-1.5 rounded-lg border outline-none"
          style={{ borderColor: 'var(--surface-200)', background: 'var(--surface-0)', color: 'var(--surface-700)', fontSize: 16 }} />
        {busca && (
          <button type="button" onClick={() => setBusca('')} title="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--surface-400)' }}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-center gap-1 flex-wrap">
        {FILTROS.map(f => (
          <button key={f.id} type="button" onClick={() => setFiltro(f.id)} className="text-[11.5px] px-2.5 py-0.5 rounded-full border"
            style={filtro === f.id ? { background: '#9333ea', borderColor: '#9333ea', color: '#fff' } : { borderColor: 'var(--surface-200)', background: 'var(--surface-0)', color: 'var(--surface-600)' }}>{f.rotulo}</button>
        ))}
      </div>

      {catalogo === null ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--surface-400)' }} /></div>
      ) : filtrados.length === 0 ? (
        <p className="text-center py-8 text-sm" style={{ color: 'var(--surface-400)' }}>Nenhum produto encontrado</p>
      ) : (
        <div className="space-y-3.5">
          {grupos.map(g => (
            <div key={g.cat}>
              <div className="flex items-center gap-2 mb-1.5">
                <h4 className="text-xs font-semibold" style={{ color: '#a78bfa' }}>{g.cat}</h4>
                <span className="text-xs" style={{ color: 'var(--surface-400)' }}>({g.itens.length})</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(124,58,237,.25)' }} />
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {g.itens.map(u => {
                  const on = sel?.id === u.id
                  const cor = u.estoque_infinito ? '#3b82f6' : u.estoque <= 0 ? '#ef4444' : u.estoque <= 2 ? '#f59e0b' : 'var(--surface-400)'
                  return (
                    <button key={u.id} type="button" onClick={() => setSel(on ? null : u)} className="rounded-lg overflow-hidden text-left"
                      style={{ border: `1.5px solid ${on ? '#a855f7' : 'var(--surface-300)'}`, boxShadow: on ? '0 0 0 2px rgba(168,85,247,.45)' : undefined, background: 'var(--surface-0)' }}>
                      <span className="relative block aspect-square bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img loading="lazy" src={imagem(u)} alt="" className="w-full h-full p-[3px]" style={{ objectFit: 'contain' }} />
                        {on && <span className="absolute top-1 right-1 w-5 h-5 rounded-full grid place-items-center text-white" style={{ background: '#a855f7' }}><Check className="h-3 w-3" /></span>}
                        {!u.estoque_infinito && u.estoque <= 0 && <span className="absolute top-1 left-1 px-1 rounded text-[9px] font-bold text-white" style={{ background: '#ef4444' }}>{u.estoque}</span>}
                      </span>
                      <span className="block px-1 py-1">
                        <span className="block text-[10px] font-medium leading-tight line-clamp-2 min-h-[2.1em]" style={{ color: 'var(--surface-700)' }}>{u.nome}</span>
                        <span className="flex justify-between items-center mt-0.5 text-[9.5px] font-semibold">
                          <span style={{ color: cor }}>{u.estoque_infinito ? '∞' : `${u.estoque} un`}</span>
                          {(u.preco || 0) > 0 && <span style={{ color: '#16a34a' }}>R$ {(u.preco || 0).toFixed(0)}</span>}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <button type="button" onClick={() => { setSel(null); setPasso('inicio') }} className="text-xs" style={{ color: 'var(--surface-400)' }}>‹ Voltar aos produtos do contrato</button>

      {/* Rodapé só com seleção (sem ela, a grade ganha a altura). */}
      {sel && (
        <div className="sticky bottom-0 pt-2 pb-1 flex items-center justify-between gap-3" style={{ background: 'var(--surface-0)' }}>
          <div className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagem(sel)} alt="" className="w-12 h-12 rounded-lg bg-white flex-none" style={{ objectFit: 'contain' }} />
            <div className="min-w-0">
              <p className="font-medium line-clamp-1 text-sm" style={{ color: 'var(--surface-700)' }}>{sel.nome}</p>
              <p className="text-xs" style={{ color: 'var(--surface-400)' }}>{sel.codigo}</p>
            </div>
          </div>
          <button type="button" onClick={avancar} className="flex-none px-6 py-2 rounded-lg text-sm text-white" style={{ background: '#9333ea' }}>Avançar</button>
        </div>
      )}
    </div>
  )
}
