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
import { Plus, Loader2, Check, X, Pencil, Trash2, Landmark, EyeOff, Eye, Star } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'

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

type Conta = {
  id: string
  nome: string
  ativo: boolean
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
  const [nova, setNova] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)   // conta expandida
  // Renomear é sobre a IDENTIDADE da conta e vive na própria linha; o painel
  // expandido é sobre o que ela FAZ. Misturar os dois fazia o campo de nome
  // aparecer toda vez que alguém só queria marcar um método.
  const [renomeando, setRenomeando] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState('')

  const carregar = useCallback(async () => {
    if (!currentUnit?.id) return
    setCarregando(true)
    const { data } = await supabase
      .from('contas').select('id, nome, ativo, entradas, saidas, preferencial_recebimento')
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
    const nome = nova.trim()
    if (!nome || !currentUnit?.id) return
    if (duplicada(nome)) return toast(`Já existe uma conta "${nome}" nesta unidade`, 'error')
    setSalvando(true)
    const { error } = await supabase.from('contas')
      .insert({ nome, unidade_id: currentUnit.id, ativo: true })
    setSalvando(false)
    if (error) return toast(error.message, 'error')
    setNova('')
    toast(`Conta "${nome}" criada`, 'success')
    void carregar()
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
    const nome = (v: string) => (ENTRADAS.concat(SAIDAS).find(x => x.v === v)?.label || v).toLowerCase()
    const e = (c.entradas || []).length ? `recebe ${c.entradas.map(nome).join(', ')}` : ''
    const s = (c.saidas || []).length ? `paga ${c.saidas.map(nome).join(', ')}` : ''
    if (!e && !s) return 'serve pra tudo'
    return [e, s].filter(Boolean).join(' · ')
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
        <div className="card p-3 flex gap-2">
          <input
            value={nova}
            onChange={e => setNova(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void criar() }}
            placeholder="Nome da conta, como vocês chamam no dia a dia"
            className="input text-sm flex-1 min-w-0"
          />
          <button onClick={() => void criar()} disabled={!nova.trim() || salvando} className="btn-primary text-sm shrink-0">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adicionar
          </button>
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
                onClick={() => { if (!editandoNome) setAberta(aberto ? null : c.id) }}
              >
                <div className="w-8 h-8 rounded-full bg-[var(--surface-100)] flex items-center justify-center shrink-0">
                  <Landmark className="h-4 w-4 text-[var(--surface-500)]" />
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

                      <div>
                        <p className="text-[11px] text-[var(--surface-500)] mb-1">Recebe do cliente</p>
                        <div className="flex flex-wrap gap-1.5">
                          {ENTRADAS.map(m => (
                            <Chip
                              key={m.v} label={m.label}
                              on={(c.entradas || []).includes(m.v)}
                              onClick={() => alternar(c, 'entradas', m.v)}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] text-[var(--surface-500)] mb-1">Paga despesas em</p>
                        <div className="flex flex-wrap gap-1.5">
                          {SAIDAS.map(m => (
                            <Chip
                              key={m.v} label={m.label}
                              on={(c.saidas || []).includes(m.v)}
                              onClick={() => alternar(c, 'saidas', m.v)}
                            />
                          ))}
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
