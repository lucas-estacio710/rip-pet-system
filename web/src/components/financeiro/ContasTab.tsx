'use client'

// CONTAS — de onde o dinheiro sai e para onde entra (tabela `contas`).
//
// A mesma conta serve aos dois lados do caixa:
//   `pagamentos.conta_id`                → onde o dinheiro do tutor ENTROU
//   `fin_lancamentos.conta_pagamento_id` → de onde a despesa SAIU
// Por isso a tela mostra o uso dos dois: desativar uma conta com movimento é
// decisão diferente de mexer numa recém-criada.
//
// ── O QUE A CONTA DECLARA (mig 122) ────────────────────────────────────────
// Cada conta serve pra coisas diferentes: a de maquininha só RECEBE crédito e
// débito; a de banco recebe pix e também PAGA pix, boleto, transferência. A
// conta declara isso e as telas deduzem sozinhas — o acerto do cliente só
// oferece contas que recebem aquele método, e a despesa só as que pagam.
//
// ⚠️ NADA MARCADO = SEM RESTRIÇÃO, não "não serve pra nada". É o que mantém a
// operação de pé enquanto ninguém configurou: a conta aparece em todo lugar,
// como antes, e vai ficando precisa conforme alguém marca o que ela faz.
//
// ⚠️ EXCLUIR só para conta SEM movimento. Com movimento, DESATIVAR: as FKs
// apontam pra cá e apagar deixaria o histórico financeiro mentindo.
//
// Escopo por unidade: `contas.unidade_id`. Cada unidade cadastra as suas.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Plus, Loader2, Check, X, Pencil, Trash2, Landmark, CreditCard, Wallet, EyeOff, Eye, Star, ChevronRight } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import {
  PRODUTOS, INSTITUICOES, camposDoProduto, nomeDaConta, type ProdutoConta,
} from '@/lib/financeiro'

/** Métodos que uma conta pode RECEBER — espelha o ENUM `metodo_pagamento`. */
const ENTRADAS = [
  { v: 'pix', label: 'Pix' },
  { v: 'credito', label: 'Crédito' },
  { v: 'debito', label: 'Débito' },
  { v: 'dinheiro', label: 'Dinheiro' },
]
/** Métodos de SAÍDA — inclui boleto e transferência, que não existem no acerto. */
const SAIDAS = [
  { v: 'pix', label: 'Pix' },
  { v: 'boleto', label: 'Boleto' },
  { v: 'transferencia', label: 'Transferência' },
  { v: 'debito', label: 'Débito' },
  { v: 'credito', label: 'Crédito' },
  { v: 'dinheiro', label: 'Dinheiro' },
]

/** Como o dinheiro sai da conta (mig 124) — decide o comportamento no Caixa. */
const TIPOS = [
  { v: 'corrente', label: 'Conta corrente', ajuda: 'A despesa sai na data que debitou.' },
  { v: 'dinheiro', label: 'Dinheiro', ajuda: 'Caixa físico. A despesa sai na hora.' },
  { v: 'cartao', label: 'Cartão de crédito', ajuda: 'A despesa acumula e só sai do caixa quando a fatura é paga.' },
]

type Conta = {
  id: string
  nome: string
  tipo: string
  ativo: boolean
  legado: boolean             // histórico (mig 127) — não se lança nela
  instituicao: string | null
  produto: string | null      // null = cadastrada antes da mig 130
  unidades_extras: string[] | null
  entradas: string[]
  saidas: string[]
  preferencial_recebimento: boolean
  entradasUso: number   // pagamentos que caíram nela
  saidasUso: number     // lançamentos pagos por ela
}

export default function ContasTab({ somenteLeitura = false }: { somenteLeitura?: boolean }) {
  const supabaseTipado = createClient()
  const supabase = supabaseTipado as unknown as SupabaseClient
  const { toast } = useToast()
  const { currentUnit } = useUnit()

  const [contas, setContas] = useState<Conta[]>([])
  const [carregando, setCarregando] = useState(false)
  // Cadastro por INSTITUIÇÃO + PRODUTOS (mig 130): em vez de digitar um nome e
  // marcar 10 chips, você diz ONDE é e O QUE tem lá — o resto é derivado.
  const [inst, setInst] = useState('')
  const [qtd, setQtd] = useState<Record<string, number>>({})
  const [salvando, setSalvando] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)   // conta expandida
  // Renomear é sobre a IDENTIDADE da conta e vive na própria linha; o painel
  // expandido é sobre o que ela FAZ. Misturar os dois fazia o campo de nome
  // aparecer toda vez que alguém só queria marcar um método.
  const [renomeando, setRenomeando] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState('')
  // Qual lado está aberto no painel. Mostrar os dois de uma vez são 10 chips na
  // cara; quase toda conta é forte num lado só, então abre-se o que se vai mexer.
  const [lado, setLado] = useState<'entradas' | 'saidas' | null>(null)

  const carregar = useCallback(async () => {
    if (!currentUnit?.id) return
    setCarregando(true)
    const { data } = await supabase
      .from('contas').select('id, nome, tipo, ativo, legado, instituicao, produto, unidades_extras, entradas, saidas, preferencial_recebimento')
      .eq('unidade_id', currentUnit.id)
      .order('ativo', { ascending: false }).order('nome')
    const base = ((data as unknown as Omit<Conta, 'entradasUso' | 'saidasUso'>[]) || [])

    // `head: true` traz só o count — `pagamentos` tem quase 4 mil linhas.
    const comUso = await Promise.all(base.map(async c => {
      const [e, s] = await Promise.all([
        supabase.from('pagamentos').select('id', { count: 'exact', head: true }).eq('conta_id', c.id),
        supabase.from('fin_lancamentos').select('id', { count: 'exact', head: true }).eq('conta_pagamento_id', c.id),
      ])
      return { ...c, entradasUso: e.count || 0, saidasUso: s.count || 0 }
    }))
    setContas(comUso)
    setCarregando(false)
  }, [supabase, currentUnit?.id])

  useEffect(() => { void carregar() }, [carregar])

  function duplicada(nome: string, exceto?: string) {
    const n = nome.trim().toLowerCase()
    return contas.some(c => c.id !== exceto && c.nome.trim().toLowerCase() === n)
  }

  /** Patch otimista: marcar método é muito clique pra esperar ida e volta. */
  async function patch(c: Conta, campos: Partial<Conta>) {
    const antes = contas
    setContas(cs => cs.map(x => (x.id === c.id ? { ...x, ...campos } : x)))
    const { error } = await supabase.from('contas').update(campos).eq('id', c.id)
    if (error) { setContas(antes); toast(error.message, 'error') }
  }

  function alternar(c: Conta, lista: 'entradas' | 'saidas', metodo: string) {
    const atual = c[lista] || []
    const novo = atual.includes(metodo) ? atual.filter(m => m !== metodo) : [...atual, metodo]
    void patch(c, { [lista]: novo } as Partial<Conta>)
  }

  /** Uma preferencial por unidade — marcar uma desmarca a outra (mig 122). */
  async function tornarPreferencial(c: Conta) {
    if (c.preferencial_recebimento) return patch(c, { preferencial_recebimento: false })
    const atual = contas.find(x => x.preferencial_recebimento && x.id !== c.id)
    if (atual) await supabase.from('contas').update({ preferencial_recebimento: false }).eq('id', atual.id)
    const { error } = await supabase.from('contas').update({ preferencial_recebimento: true }).eq('id', c.id)
    if (error) return toast(error.message, 'error')
    toast(`"${c.nome}" agora vem escolhida no acerto`, 'success')
    void carregar()
  }

  async function criar() {
    const instituicao = inst.trim()
    if (!instituicao || !currentUnit?.id) return
    const escolhidos = Object.entries(qtd).filter(([, n]) => n > 0)
    if (!escolhidos.length) return toast('Escolha o que vocês têm nesta instituição', 'error')

    // Uma linha por unidade do produto: 3 cartões viram 3 contas, porque cada um
    // tem fatura e limite próprios — juntar impediria fechar um sem o outro.
    const novas: Record<string, unknown>[] = []
    for (const [prod, n] of escolhidos) {
      const pr = prod as ProdutoConta
      for (let i = 1; i <= n; i++) {
        const nome = nomeDaConta(instituicao, pr, n > 1 ? i : undefined)
        if (duplicada(nome)) continue          // já existe: não duplica em silêncio
        novas.push({
          nome, instituicao, unidade_id: currentUnit.id, ativo: true,
          ...camposDoProduto(pr),
        })
      }
    }
    if (!novas.length) return toast('Essas contas já existem', 'error')

    setSalvando(true)
    const { error } = await supabase.from('contas').insert(novas)
    setSalvando(false)
    if (error) return toast(error.message, 'error')
    setInst(''); setQtd({})
    toast(novas.length === 1 ? 'Conta criada' : `${novas.length} contas criadas`, 'success')
    void carregar()
  }

  /** Classifica uma conta antiga (produto nulo) — um clique resolve. */
  async function classificar(c: Conta, pr: ProdutoConta) {
    await patch(c, camposDoProduto(pr) as Partial<Conta>)
    toast('Conta classificada', 'success')
  }

  function abrirRename(c: Conta) {
    setRenomeando(c.id)
    setRascunho(c.nome)
  }

  async function renomear(c: Conta) {
    const nome = rascunho.trim()
    if (!nome) { setRenomeando(null); return }              // vazio = desistiu
    if (nome === c.nome) { setRenomeando(null); return }
    if (duplicada(nome, c.id)) return toast(`Já existe uma conta "${nome}"`, 'error')
    await patch(c, { nome })
    setRenomeando(null)
    toast(`Agora é "${nome}"`, 'success')
  }

  async function excluir(c: Conta) {
    if (c.entradasUso || c.saidasUso) {
      return toast('Conta com movimento não pode ser excluída — desative', 'error')
    }
    const { error } = await supabase.from('contas').delete().eq('id', c.id)
    if (error) return toast(error.message, 'error')
    toast(`"${c.nome}" excluída`, 'success')
    void carregar()
  }

  /** O que a conta faz, em uma linha — é o que se lê sem abrir. */
  function resumo(c: Conta): string {
    if (c.legado) return 'histórico — não recebe lançamento novo'
    // O PRODUTO é a informação principal: quem sabe que é maquininha já sabe
    // que recebe crédito e débito. Os métodos viram detalhe.
    const prod = PRODUTOS.find(x => x.v === c.produto)
    if (prod) return prod.desc
    const nome = (v: string) => (ENTRADAS.concat(SAIDAS).find(x => x.v === v)?.label || v).toLowerCase()
    const e = (c.entradas || []).length ? `recebe ${c.entradas.map(nome).join(', ')}` : ''
    const sd = (c.saidas || []).length ? `paga ${c.saidas.map(nome).join(', ')}` : ''
    const partes = [e, sd].filter(Boolean)
    return partes.length ? partes.join(' · ') : 'não classificada'
  }

  function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
    return (
      <button
        type="button" onClick={onClick}
        className="text-[11px] px-2 py-1 rounded-full border transition-colors"
        style={{
          background: on ? 'rgba(16,185,129,0.14)' : 'transparent',
          borderColor: on ? '#10b981' : 'var(--surface-300)',
          color: on ? '#10b981' : 'var(--surface-500)',
        }}
      >
        {label}
      </button>
    )
  }

  const ativas = contas.filter(c => c.ativo).length

  return (
    <div className="animate-fade-in space-y-3 max-w-2xl">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-[var(--surface-500)]">
          {currentUnit?.nome} · {ativas} ativa{ativas === 1 ? '' : 's'}
        </span>
        {carregando && <Loader2 className="h-4 w-4 animate-spin text-[var(--surface-400)]" />}
      </div>

      {!somenteLeitura && (
        <div className="card p-3 space-y-3">
          <div>
            <label className="text-xs text-[var(--surface-500)] block mb-1">Instituição</label>
            <input
              list="instituicoes"
              value={inst}
              onChange={e => setInst(e.target.value)}
              placeholder="Itaú, Stone, Nubank…"
              className="input text-sm w-full max-w-xs"
            />
            <datalist id="instituicoes">
              {INSTITUICOES.map(i => <option key={i} value={i} />)}
            </datalist>
          </div>

          {inst.trim() && (
            <>
              <div>
                <p className="text-xs text-[var(--surface-500)] mb-1.5">
                  O que vocês têm {inst.trim() ? `no ${inst.trim()}` : 'aqui'}?
                </p>
                <div className="space-y-1">
                  {PRODUTOS.map(pr => {
                    const n = qtd[pr.v] || 0
                    return (
                      <div key={pr.v} className="flex items-center gap-2 py-1">
                        <input
                          type="checkbox"
                          checked={n > 0}
                          onChange={e => setQtd(q => ({ ...q, [pr.v]: e.target.checked ? 1 : 0 }))}
                          className="h-4 w-4 accent-emerald-500 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-[var(--surface-800)]">{pr.label}</p>
                          <p className="text-[11px] text-[var(--surface-400)]">{pr.desc}</p>
                        </div>
                        {/* Quantidade só onde faz sentido ter vários: 3 cartões,
                            2 maquininhas. Ninguém tem duas contas correntes iguais
                            na mesma instituição. */}
                        {pr.varios && n > 0 && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => setQtd(q => ({ ...q, [pr.v]: Math.max(1, n - 1) }))}
                              className="btn-secondary text-xs px-2 py-0.5"
                            >−</button>
                            <span className="text-mono text-sm w-5 text-center">{n}</span>
                            <button
                              onClick={() => setQtd(q => ({ ...q, [pr.v]: Math.min(20, n + 1) }))}
                              className="btn-secondary text-xs px-2 py-0.5"
                            >+</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <button
                onClick={() => void criar()}
                disabled={salvando || !Object.values(qtd).some(n => n > 0)}
                className="btn-primary text-sm"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Adicionar
              </button>
            </>
          )}
        </div>
      )}

      <div className="card divide-y divide-[var(--surface-200)]">
        {!carregando && contas.length === 0 && (
          <p className="text-sm text-[var(--surface-500)] py-8 text-center">
            Nenhuma conta cadastrada nesta unidade.
          </p>
        )}

        {contas.map(c => {
          const emUso = c.entradasUso + c.saidasUso
          const aberto = aberta === c.id
          const editandoNome = renomeando === c.id
          return (
            <div key={c.id} style={{ opacity: c.ativo ? 1 : 0.55 }}>
              <div
                className={`group flex items-center gap-3 px-3 py-2 transition-colors ${
                  editandoNome ? '' : 'cursor-pointer hover:bg-[var(--surface-50)]'
                }`}
                onClick={() => { if (!editandoNome) { setAberta(aberto ? null : c.id); setLado(null) } }}
              >
                <div className="w-8 h-8 rounded-full bg-[var(--surface-100)] flex items-center justify-center shrink-0">
                  {c.tipo === 'cartao'
                    ? <CreditCard className="h-4 w-4 text-[var(--surface-500)]" />
                    : c.tipo === 'dinheiro'
                      ? <Wallet className="h-4 w-4 text-[var(--surface-500)]" />
                      : <Landmark className="h-4 w-4 text-[var(--surface-500)]" />}
                </div>

                <div className="min-w-0 flex-1">
                  {editandoNome ? (
                    // Edita no LUGAR do nome, com a mesma tipografia — a linha não
                    // "pula" e fica claro que é aquele texto que está mudando.
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={rascunho}
                        onChange={e => setRascunho(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') void renomear(c)
                          if (e.key === 'Escape') setRenomeando(null)
                        }}
                        className="text-sm bg-transparent border-0 border-b outline-none py-0.5 flex-1 min-w-0 text-[var(--surface-800)]"
                        style={{ borderColor: 'var(--brand-500)' }}
                      />
                      <button
                        onClick={() => void renomear(c)}
                        title="Salvar (Enter)"
                        className="text-[var(--brand-500)] p-0.5 shrink-0"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setRenomeando(null)}
                        title="Cancelar (Esc)"
                        className="text-[var(--surface-400)] p-0.5 shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--surface-800)] truncate flex items-center gap-1.5">
                      {c.nome}
                      {c.preferencial_recebimento && (
                        <Star className="h-3 w-3 shrink-0" style={{ color: '#f59e0b', fill: '#f59e0b' }} />
                      )}
                      {!c.ativo && <span className="text-xs text-[var(--surface-400)]">· desativada</span>}
                      {!c.produto && !c.legado && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: 'rgba(245,158,11,0.16)', color: '#f59e0b' }}
                          title="Cadastrada antes do modelo de produtos. Abra e diga o que ela é."
                        >
                          classificar
                        </span>
                      )}
                      {!somenteLeitura && (
                        <button
                          onClick={e => { e.stopPropagation(); abrirRename(c) }}
                          title="Renomear"
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-[var(--surface-400)] hover:text-[var(--brand-500)] shrink-0"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </p>
                  )}
                  <p className="text-xs text-[var(--surface-500)] truncate">{resumo(c)}</p>
                </div>

                <span className="text-[11px] text-[var(--surface-400)] shrink-0 text-right">
                  {emUso === 0 ? 'sem movimento' : `${c.entradasUso} entradas · ${c.saidasUso} saídas`}
                </span>
              </div>

              {aberto && (
                <div className="px-3 pb-3 pl-14 space-y-3 bg-[var(--surface-50)]">
                  {somenteLeitura ? (
                    <p className="text-xs text-[var(--surface-500)] pt-2">Somente leitura.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <button
                          onClick={() => void tornarPreferencial(c)}
                          className="text-[11px] px-2 py-1 rounded-full border transition-colors inline-flex items-center gap-1"
                          style={{
                            background: c.preferencial_recebimento ? 'rgba(245,158,11,0.16)' : 'transparent',
                            borderColor: c.preferencial_recebimento ? '#f59e0b' : 'var(--surface-300)',
                            color: c.preferencial_recebimento ? '#f59e0b' : 'var(--surface-500)',
                          }}
                        >
                          <Star className="h-3 w-3" style={c.preferencial_recebimento ? { fill: '#f59e0b' } : undefined} />
                          Preferencial para recebimentos
                        </button>
                      </div>

                      {/* O PRODUTO define tudo: tipo, o que recebe, o que paga.
                          Escolher aqui reescreve os três de uma vez (mig 130). */}
                      <div>
                        <p className="text-[11px] text-[var(--surface-500)] mb-1.5">
                          O que é esta conta{c.instituicao ? ` no ${c.instituicao}` : ''}?
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {PRODUTOS.map(pr => (
                            <Chip
                              key={pr.v} label={pr.label}
                              on={c.produto === pr.v}
                              onClick={() => void classificar(c, pr.v)}
                            />
                          ))}
                        </div>
                        <p className="text-[11px] text-[var(--surface-400)] mt-1">
                          {PRODUTOS.find(pr => pr.v === c.produto)?.desc
                            || 'Escolha o produto e o comportamento vem junto.'}
                        </p>
                      </div>

                      {/* Conta de: → Receber / Pagar → os métodos daquele lado */}
                      <div>
                        <p className="text-[11px] text-[var(--surface-500)] mb-1.5">Conta de:</p>
                        <div className="space-y-1">
                          {([
                            { k: 'entradas' as const, label: 'Receber', metodos: ENTRADAS },
                            { k: 'saidas' as const, label: 'Pagar', metodos: SAIDAS },
                          // Cartão de crédito não recebe do cliente: ele só paga.
                          ]).filter(l => !(c.tipo === 'cartao' && l.k === 'entradas')).map(l => {
                            const marcados = c[l.k] || []
                            const on = lado === l.k
                            return (
                              <div key={l.k}>
                                <button
                                  type="button"
                                  onClick={() => setLado(on ? null : l.k)}
                                  className="flex items-center gap-1.5 w-full text-left py-1"
                                >
                                  <ChevronRight
                                    className="h-3 w-3 shrink-0 transition-transform text-[var(--surface-400)]"
                                    style={{ transform: on ? 'rotate(90deg)' : undefined }}
                                  />
                                  <span
                                    className="text-xs"
                                    style={{ color: marcados.length ? '#10b981' : 'var(--surface-600)' }}
                                  >
                                    {l.label}
                                  </span>
                                  {!on && (
                                    <span className="text-[11px] text-[var(--surface-400)] truncate">
                                      {marcados.length
                                        ? marcados.map(m => l.metodos.find(x => x.v === m)?.label || m).join(', ')
                                        : 'qualquer forma'}
                                    </span>
                                  )}
                                </button>

                                {on && (
                                  <div className="flex flex-wrap gap-1.5 pl-[18px] pb-1.5">
                                    {l.metodos.map(m => (
                                      <Chip
                                        key={m.v} label={m.label}
                                        on={marcados.includes(m.v)}
                                        onClick={() => alternar(c, l.k, m.v)}
                                      />
                                    ))}
                                    {marcados.length === 0 && (
                                      <span className="text-[11px] text-[var(--surface-400)] self-center">
                                        nada marcado = serve pra qualquer forma
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button onClick={() => void patch(c, { ativo: !c.ativo })} className="btn-secondary text-xs">
                          {c.ativo
                            ? <><EyeOff className="h-3.5 w-3.5" /> Desativar</>
                            : <><Eye className="h-3.5 w-3.5" /> Reativar</>}
                        </button>
                        {emUso === 0 && (
                          <button onClick={() => void excluir(c)} className="btn-secondary text-xs text-red-400">
                            <Trash2 className="h-3.5 w-3.5" /> Excluir
                          </button>
                        )}
                        <button onClick={() => setAberta(null)} className="btn-secondary text-xs ml-auto">
                          <Check className="h-3.5 w-3.5" /> Pronto
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-[var(--surface-500)]">
        Marcar o que cada conta faz deixa as telas mais espertas: o acerto com o cliente só oferece
        contas que recebem aquele método, e a despesa só as que pagam.{' '}
        <strong className="font-medium">Nada marcado significa sem restrição</strong> — a conta serve
        pra tudo, como antes. A conta com estrela já vem escolhida no acerto. Conta com movimento não
        pode ser excluída: desative, que ela some dos seletores e continua respondendo pelo histórico.
      </p>
    </div>
  )
}
