'use client'

/**
 * ⚱️ Urna — 2º nível do popup de pendências (fase 2.12). Os 3 passos do modal do pipeline,
 * no desenho da bancada (docs/REDESENHO_CARDS_PIPELINE.md, "Urna — melhorar junto da extração"):
 *   1. já definida → "➕ Adicionar nova" / "✏️ Trocar"
 *   2. escolha → busca + categorias + grade de 4 colunas com a foto INTEIRA (`contain`);
 *      sem seleção o rodapé some; com seleção, miniatura + Avançar
 *   3. confirmação → preço editável, desconto %/R$ (atalhos, 🎁 = grátis), valor final
 *
 * A gravação é a de `lib/urna.ts` (B-09): preço em `valor` e desconto em `desconto`, uma linha
 * por vez, erro conferido, troca que preserva a tarefa quando dá. Urna que também é
 * personalizado (porta-retrato, `rescaldo_tipo`) tira o marcador "Nenhum personalizado" (0002).
 *
 * ⚠️ Modo teclado da bancada (popup sobe e esconde categorias/rodapé com a busca focada) NÃO
 * entrou: depende de `visualViewport` e só se valida no aparelho. Aqui a busca tem
 * `enterKeyHint="search"` e Enter fecha o teclado.
 */
import { useEffect, useMemo, useState } from 'react'
import { Check, Search, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ordenarCategoriasUrnas } from '@/lib/categorias'
import { descontoDaUrna, valorFinalDaUrna, trocaPreservaLinha, adicionarUrna, trocarUrna, type DescontoUrna } from '@/lib/urna'

export type UrnaDoContrato = {
  id: string
  produtoId: string
  nome: string
  codigo: string
  imagemUrl: string | null
  rescaldoTipo: string | null
  feito: boolean
}

type UrnaCatalogo = {
  id: string; codigo: string; nome: string; categoria: string | null; preco: number | null
  imagem_url: string | null; estoque_infinito: boolean | null; rescaldo_tipo: string | null; estoque: number
}

type Props = {
  contratoId: string
  unidadeId: string | null
  petNome: string
  urnasAtuais: UrnaDoContrato[]
  /** Há a linha "Nenhum personalizado" (0002)? Uma urna-personalizado a tira. */
  temNenhumPersonalizado: boolean
  onApagarNenhumPersonalizado: () => Promise<boolean>
  /** Depois de gravar: a página relê os produtos e os valores do contrato. */
  onMudou: () => Promise<void> | void
  onVoltar: () => void
}

const ROTULO_RESCALDO: Record<string, string> = {
  molde_patinha: 'molde de patinha', carimbo: 'carimbo', pelo_extra: 'pelo extra', pelinho: 'pelinho', outro: 'personalizado',
}
const PERCENTS = [100, 50, 30, 25, 20, 10]
const VALORES = [100, 80, 50, 30, 20]
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const imagem = (u: { imagem_url: string | null; codigo: string }) => u.imagem_url || `/estoque/${u.codigo}.png`

export default function UrnaTela(p: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [passo, setPasso] = useState<'inicio' | 'escolha' | 'confirma'>(p.urnasAtuais.length > 0 ? 'inicio' : 'escolha')
  // null = adicionar; uma linha = trocar aquela linha
  const [trocando, setTrocando] = useState<UrnaDoContrato | null>(null)
  const [urnas, setUrnas] = useState<UrnaCatalogo[] | null>(null)
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [sel, setSel] = useState<UrnaCatalogo | null>(null)
  const [preco, setPreco] = useState<number | ''>('')
  const [desc, setDesc] = useState<DescontoUrna>({ tipo: 'percent', percent: '', valor: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Catálogo de urnas ativas com o saldo da unidade DO CONTRATO.
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const { data: prods } = await supabase.from('produtos')
        .select('id, codigo, nome, categoria, preco, imagem_url, estoque_infinito, rescaldo_tipo')
        .eq('tipo', 'urna').eq('ativo', true).order('nome')
      const saldo = new Map<string, number>()
      if (p.unidadeId) {
        const { data: est } = await supabase.from('produtos_estoque').select('produto_id, estoque_atual').eq('unidade_id', p.unidadeId)
        for (const r of (est || []) as { produto_id: string; estoque_atual: number }[]) saldo.set(r.produto_id, r.estoque_atual)
      }
      if (!cancelado) setUrnas(((prods || []) as Omit<UrnaCatalogo, 'estoque'>[]).map(u => ({ ...u, estoque: saldo.get(u.id) ?? 0 })))
    })()
    return () => { cancelado = true }
  }, [supabase, p.unidadeId])

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return (urnas || []).filter(u => (!categoria || u.categoria === categoria) && (!t || u.nome.toLowerCase().includes(t) || u.codigo.toLowerCase().includes(t)))
  }, [urnas, busca, categoria])
  const categorias = useMemo(() => ordenarCategoriasUrnas([...new Set((urnas || []).map(u => u.categoria).filter((c): c is string => !!c))]), [urnas])
  const grupos = useMemo(() => {
    if (categoria) return [{ cat: categoria, itens: filtradas }]
    const m = new Map<string, UrnaCatalogo[]>()
    for (const u of filtradas) { const k = u.categoria || 'Outras'; m.set(k, [...(m.get(k) || []), u]) }
    return ordenarCategoriasUrnas([...m.keys()]).map(cat => ({ cat, itens: m.get(cat)! }))
  }, [filtradas, categoria])

  const precoBase = typeof preco === 'number' ? preco : (sel?.preco || 0)
  const final = valorFinalDaUrna(precoBase, desc)

  function iniciar(linha: UrnaDoContrato | null) {
    setTrocando(linha); setSel(null); setBusca(''); setCategoria(''); setErro(null); setPasso('escolha')
  }

  function avancar() {
    if (!sel) return
    setPreco(''); setDesc({ tipo: 'percent', percent: '', valor: '' }); setErro(null); setPasso('confirma')
  }

  async function confirmar() {
    if (!sel || salvando) return
    // Trocar por tipo diferente apaga a linha — e com ela a tarefa/foto (CASCADE). Avisar.
    if (trocando && !trocaPreservaLinha(trocando.rescaldoTipo, sel.rescaldo_tipo) && trocando.rescaldoTipo) {
      const oque = ROTULO_RESCALDO[trocando.rescaldoTipo] || 'personalizado'
      if (!confirm(`${trocando.nome} tem a tarefa de ${oque}${trocando.feito ? ' (já feita)' : ''}. Trocar por ${sel.nome} apaga essa tarefa e a foto-prova. Continuar?`)) return
    }
    setSalvando(true); setErro(null)
    try {
      const urna = { id: sel.id, codigo: sel.codigo, rescaldo_tipo: sel.rescaldo_tipo }
      const desconto = descontoDaUrna(precoBase, desc)
      if (trocando) {
        await trocarUrna(supabase, { contratoId: p.contratoId, unidadeId: p.unidadeId, linha: { id: trocando.id, produto_id: trocando.produtoId, rescaldo_tipo: trocando.rescaldoTipo }, urna, preco: precoBase, desconto })
      } else {
        await adicionarUrna(supabase, { contratoId: p.contratoId, unidadeId: p.unidadeId, urna, preco: precoBase, desconto })
      }
      // Urna que é personalizado: o "Nenhum personalizado" deixa de ser verdade.
      if (sel.rescaldo_tipo && p.temNenhumPersonalizado) await p.onApagarNenhumPersonalizado()
      await p.onMudou()
      p.onVoltar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      setSalvando(false)
    }
  }

  // ---------- 1. Já definida ----------
  if (passo === 'inicio') {
    return (
      <div className="py-2 space-y-4">
        <div className="space-y-2">
          {p.urnasAtuais.map(u => (
            <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl border" style={{ borderColor: 'var(--surface-200)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u.imagemUrl || `/estoque/${u.codigo}.png`} alt="" className="w-12 h-12 rounded-lg bg-white flex-none" style={{ objectFit: 'contain' }} />
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold leading-tight line-clamp-2" style={{ color: 'var(--surface-800)' }}>{u.nome}</p>
                <p className="text-xs font-mono" style={{ color: 'var(--surface-400)' }}>{u.codigo}</p>
              </div>
              <button type="button" onClick={() => iniciar(u)} className="flex-none px-3 py-1.5 rounded-lg border-2 text-[12.5px] font-semibold"
                style={{ background: 'rgba(168,85,247,.12)', borderColor: '#a855f7', color: '#9333ea' }}>✏️ Trocar</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => iniciar(null)} className="w-full py-3 rounded-lg border-2 text-sm font-medium"
          style={{ background: 'rgba(34,197,94,.12)', borderColor: '#22c55e', color: '#16a34a' }}>➕ Adicionar nova</button>
      </div>
    )
  }

  // ---------- 3. Confirmação ----------
  if (passo === 'confirma' && sel) {
    return (
      <div className="py-2">
        <div className="flex items-center gap-4 mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagem(sel)} alt="" className="w-20 h-20 rounded-lg bg-white flex-none" style={{ objectFit: 'contain' }} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold line-clamp-2" style={{ color: 'var(--surface-700)' }}>{sel.nome}</p>
            <p className="text-xs" style={{ color: 'var(--surface-400)' }}>{sel.codigo}{trocando ? ` · no lugar de ${trocando.nome}` : ''}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm" style={{ color: 'var(--surface-400)' }}>R$</span>
              <input type="number" min={0} step="0.01" inputMode="decimal" value={typeof preco === 'number' ? preco : (sel.preco ?? 0)}
                onChange={e => setPreco(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="w-28 px-2 py-1 rounded-lg border font-bold outline-none"
                style={{ fontSize: 18, color: '#16a34a', borderColor: 'var(--surface-300)', background: 'rgba(34,197,94,.08)' }} />
              {typeof preco === 'number' && preco !== (sel.preco ?? 0) && <span className="text-xs line-through" style={{ color: 'var(--surface-400)' }}>{brl(sel.preco ?? 0)}</span>}
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
          <button type="button" onClick={() => setPasso('escolha')} disabled={salvando} className="px-4 py-2 text-sm" style={{ color: 'var(--surface-400)' }}>Voltar</button>
          <button type="button" onClick={confirmar} disabled={salvando} className="px-6 py-2 rounded-lg text-sm text-white inline-flex items-center gap-1.5 disabled:opacity-50" style={{ background: '#9333ea' }}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}Confirmar
          </button>
        </div>
      </div>
    )
  }

  // ---------- 2. Escolha ----------
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--surface-400)' }} />
        <input type="search" enterKeyHint="search" autoComplete="off" value={busca} placeholder="Buscar urna…"
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

      {categorias.length > 0 && (
        <div className="flex items-center justify-center gap-1 flex-wrap px-2 py-1.5 rounded-lg border" style={{ borderColor: 'rgba(252,211,77,.6)', background: 'rgba(245,158,11,.06)' }}>
          <span className="text-[9px] font-bold uppercase tracking-widest mr-1" style={{ color: '#b45309' }}>Urnas</span>
          {categorias.map(c => (
            <button key={c} type="button" onClick={() => setCategoria(categoria === c ? '' : c)} className="text-[11px] px-2 py-0.5 rounded-full border"
              style={categoria === c ? { background: '#d97706', borderColor: '#d97706', color: '#fff' } : { borderColor: '#fde68a', background: 'var(--surface-0)', color: '#b45309' }}>{c}</button>
          ))}
        </div>
      )}

      {urnas === null ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--surface-400)' }} /></div>
      ) : filtradas.length === 0 ? (
        <p className="text-center py-8 text-sm" style={{ color: 'var(--surface-400)' }}>Nenhuma urna encontrada</p>
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
      {p.urnasAtuais.length > 0 && !sel && (
        <button type="button" onClick={() => setPasso('inicio')} className="text-xs" style={{ color: 'var(--surface-400)' }}>‹ Voltar às urnas do {p.petNome}</button>
      )}
    </div>
  )
}
