'use client'

// CONTAS — de onde o dinheiro sai e para onde entra (tabela `contas`).
//
// A mesma conta serve aos dois lados do caixa:
//   `pagamentos.conta_id`             → onde o dinheiro do tutor ENTROU
//   `fin_lancamentos.conta_pagamento_id` → de onde a despesa SAIU
// Por isso a tela mostra o uso dos dois: renomear ou desativar uma conta com
// movimento é diferente de mexer numa recém-criada, e quem decide precisa ver
// isso antes de clicar.
//
// ⚠️ EXCLUIR só é oferecido para conta SEM nenhum movimento. Com movimento, o
// caminho é DESATIVAR: as FKs apontam pra cá e apagar deixaria lançamento órfão
// (ou o delete falharia, dependendo da FK) — em qualquer dos casos, o histórico
// financeiro fica mentindo. Desativada some do seletor de lançamento e continua
// respondendo pelo passado.
//
// Escopo por unidade: `contas.unidade_id`. Cada unidade cadastra as suas.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Plus, Loader2, Check, X, Pencil, Trash2, Landmark, EyeOff, Eye } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'

type Conta = {
  id: string
  nome: string
  ativo: boolean
  entradas: number   // pagamentos que caíram nela
  saidas: number     // lançamentos pagos por ela
}

export default function ContasTab({ somenteLeitura = false }: { somenteLeitura?: boolean }) {
  const supabaseTipado = createClient()
  const supabase = supabaseTipado as unknown as SupabaseClient
  const { toast } = useToast()
  const { currentUnit } = useUnit()

  const [contas, setContas] = useState<Conta[]>([])
  const [carregando, setCarregando] = useState(false)
  const [nova, setNova] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    if (!currentUnit?.id) return
    setCarregando(true)
    const { data } = await supabase
      .from('contas').select('id, nome, ativo')
      .eq('unidade_id', currentUnit.id)
      .order('ativo', { ascending: false }).order('nome')
    const base = ((data as unknown as { id: string; nome: string; ativo: boolean }[]) || [])

    // Uso de cada conta — `head: true` traz só o count, sem puxar as linhas
    // (pagamentos tem quase 4 mil registros).
    const comUso = await Promise.all(base.map(async c => {
      const [e, s] = await Promise.all([
        supabase.from('pagamentos').select('id', { count: 'exact', head: true }).eq('conta_id', c.id),
        supabase.from('fin_lancamentos').select('id', { count: 'exact', head: true }).eq('conta_pagamento_id', c.id),
      ])
      return { ...c, entradas: e.count || 0, saidas: s.count || 0 }
    }))
    setContas(comUso)
    setCarregando(false)
  }, [supabase, currentUnit?.id])

  useEffect(() => { void carregar() }, [carregar])

  /** Nome repetido na MESMA unidade vira dois destinos pro mesmo dinheiro. */
  function duplicada(nome: string, exceto?: string) {
    const n = nome.trim().toLowerCase()
    return contas.some(c => c.id !== exceto && c.nome.trim().toLowerCase() === n)
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

  async function renomear(c: Conta) {
    const nome = rascunho.trim()
    if (!nome || nome === c.nome) { setEditando(null); return }
    if (duplicada(nome, c.id)) return toast(`Já existe uma conta "${nome}"`, 'error')
    const { error } = await supabase.from('contas').update({ nome }).eq('id', c.id)
    if (error) return toast(error.message, 'error')
    setEditando(null)
    toast('Conta renomeada', 'success')
    void carregar()
  }

  async function alternarAtivo(c: Conta) {
    const { error } = await supabase.from('contas').update({ ativo: !c.ativo }).eq('id', c.id)
    if (error) return toast(error.message, 'error')
    toast(c.ativo ? `"${c.nome}" desativada` : `"${c.nome}" reativada`, 'success')
    void carregar()
  }

  async function excluir(c: Conta) {
    if (c.entradas || c.saidas) {
      return toast('Conta com movimento não pode ser excluída — desative', 'error')
    }
    const { error } = await supabase.from('contas').delete().eq('id', c.id)
    if (error) return toast(error.message, 'error')
    toast(`"${c.nome}" excluída`, 'success')
    void carregar()
  }

  return (
    <div className="animate-fade-in space-y-3 max-w-2xl">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-[var(--surface-500)]">
          {currentUnit?.nome} · {contas.filter(c => c.ativo).length} ativa{contas.filter(c => c.ativo).length === 1 ? '' : 's'}
        </span>
        {carregando && <Loader2 className="h-4 w-4 animate-spin text-[var(--surface-400)]" />}
      </div>

      {!somenteLeitura && (
        <div className="card p-3 flex gap-2">
          <input
            value={nova}
            onChange={e => setNova(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void criar() }}
            placeholder="Nome da conta — ex.: Inter, Granito, Caixa da loja"
            className="input text-sm flex-1 min-w-0"
          />
          <button
            onClick={() => void criar()}
            disabled={!nova.trim() || salvando}
            className="btn-primary text-sm shrink-0"
          >
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
          const emUso = c.entradas + c.saidas
          return (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2" style={{ opacity: c.ativo ? 1 : 0.5 }}>
              <div className="w-8 h-8 rounded-full bg-[var(--surface-100)] flex items-center justify-center shrink-0">
                <Landmark className="h-4 w-4 text-[var(--surface-500)]" />
              </div>

              <div className="min-w-0 flex-1">
                {editando === c.id ? (
                  <div className="flex gap-1">
                    <input
                      autoFocus value={rascunho}
                      onChange={e => setRascunho(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') void renomear(c)
                        if (e.key === 'Escape') setEditando(null)
                      }}
                      className="input text-sm flex-1 min-w-0 py-1"
                    />
                    <button onClick={() => void renomear(c)} className="btn-secondary text-xs px-2 shrink-0">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setEditando(null)} className="btn-secondary text-xs px-2 shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-[var(--surface-800)] truncate">
                      {c.nome}
                      {!c.ativo && <span className="text-xs text-[var(--surface-400)]"> · desativada</span>}
                    </p>
                    <p className="text-xs text-[var(--surface-500)]">
                      {emUso === 0
                        ? 'sem movimento'
                        : `${c.entradas} recebimento${c.entradas === 1 ? '' : 's'} · ${c.saidas} pagamento${c.saidas === 1 ? '' : 's'}`}
                    </p>
                  </>
                )}
              </div>

              {!somenteLeitura && editando !== c.id && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => { setEditando(c.id); setRascunho(c.nome) }}
                    title="Renomear"
                    className="text-[var(--surface-400)] hover:text-[var(--brand-500)] p-1"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => void alternarAtivo(c)}
                    title={c.ativo ? 'Desativar (some do seletor, mantém o histórico)' : 'Reativar'}
                    className="text-[var(--surface-400)] hover:text-amber-400 p-1"
                  >
                    {c.ativo ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  {emUso === 0 && (
                    <button
                      onClick={() => void excluir(c)}
                      title="Excluir (só sem movimento)"
                      className="text-[var(--surface-400)] hover:text-red-400 p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-[var(--surface-500)]">
        A conta aparece no lançamento (de onde a despesa saiu) e no recebimento do contrato
        (onde o dinheiro do tutor entrou). Conta com movimento não pode ser excluída — desative,
        que ela some do seletor e continua respondendo pelo histórico.
      </p>
    </div>
  )
}
