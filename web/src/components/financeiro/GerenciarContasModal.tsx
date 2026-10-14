'use client'

// GERENCIAR AS CONTAS DE ACOMPANHAMENTO (14/10/2026, pedido do Lucas): o link
// "Gerenciar" do calendário do Hoje. Três coisas num lugar só: as cadastradas
// (editar), criar uma nova e as SUGESTÕES do histórico (lib/sugestoes-contas.ts) —
// Adicionar abre o cadastro já preenchido; × dispensa (fica lembrado neste aparelho).

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import { useUnit } from '@/contexts/UnitContext'
import { descreverRegra } from '@/lib/vencimentos'
import { sugerirContas, mesesFechados, type LancHist, type SugestaoConta } from '@/lib/sugestoes-contas'
import type { ContaFixa } from './ContaFixaModal'

const num = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** O que a sugestão entrega ao cadastro (ContaFixaModal → `rascunho`). */
export type RascunhoConta = Partial<ContaFixa> & { historico?: { mes: string; valor: number; dia: number }[]; diaVaria?: boolean }

export default function GerenciarContasModal({ aberto, onClose, contas, onEditar, onNova }: {
  aberto: boolean; onClose: () => void; contas: ContaFixa[]
  onEditar: (c: ContaFixa) => void
  onNova: (rascunho: RascunhoConta | null) => void
}) {
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, [])
  const { currentUnit } = useUnit()
  const uid = currentUnit?.id
  const [sugs, setSugs] = useState<SugestaoConta[] | null>(null)
  const [nomes, setNomes] = useState<Map<string, string>>(new Map())
  const chaveDisp = `contasAcomp.dispensadas.${uid}`
  const [dispensadas, setDispensadas] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!aberto || !uid) return
    let vivo = true
    try { setDispensadas(new Set(JSON.parse(localStorage.getItem(chaveDisp) || '[]'))) } catch { /* sem storage: nada dispensado */ }
    void (async () => {
      const hoje = hojeLocal()
      const desde = `${mesesFechados(hoje)[0]}-01`
      const [{ data: ls }, { data: ct }, { data: cs }] = await Promise.all([
        supabase.from('fin_lancamentos').select('categoria_id, fornecedor_nome, valor, data_caixa, metodo_pagamento, conta_pagamento_id, conta_codigo, conta_fixa_id')
          .eq('unidade_id', uid).neq('status', 'rejeitado').gte('data_caixa', desde).limit(3000),
        supabase.from('contas').select('id, tipo, produto').or(`unidade_id.eq.${uid},unidades_extras.cs.{${uid}}`),
        supabase.from('fin_categorias').select('id, nome'),
      ])
      if (!vivo) return
      const cartao = new Set(((ct as { id: string; tipo: string | null; produto: string | null }[] | null) || [])
        .filter(c => c.tipo === 'cartao' || c.produto === 'cartao_credito').map(c => c.id))
      const usadas = new Set(contas.map(c => c.categoria_id).filter((x): x is string => !!x))
      setNomes(new Map(((cs as { id: string; nome: string }[] | null) || []).map(c => [c.id, c.nome])))
      setSugs(sugerirContas((ls as LancHist[] | null) || [], { hoje, contasCartao: cartao, categoriasJaUsadas: usadas }))
    })()
    return () => { vivo = false }
  }, [aberto, uid, supabase, contas, chaveDisp])

  const dispensar = (cat: string) => {
    const n = new Set(dispensadas); n.add(cat); setDispensadas(n)
    try { localStorage.setItem(chaveDisp, JSON.stringify([...n])) } catch { /* sem storage: vale só agora */ }
  }
  const vivas = (sugs || []).filter(s => !dispensadas.has(s.categoria_id))
  const nomeDe = (s: SugestaoConta) => nomes.get(s.categoria_id) || 'Conta'
  const adicionar = (s: SugestaoConta) => onNova({
    nome: nomeDe(s), categoria_id: s.categoria_id, fornecedor_nome: s.fornecedor, valor: s.valor, valor_varia: s.varia,
    regra: s.regra, dia: s.dia, ajuste: 'depois', historico: s.meses, diaVaria: s.diaVaria,
  })

  const titulo = 'text-[11px] font-semibold tracking-[.14em] uppercase text-[var(--surface-500)]'
  return (
    <Modal isOpen={aberto} onClose={onClose} title="Contas de Acompanhamento" size="lg">
      <div className="flex flex-col gap-5">
        <section>
          <div className="flex items-baseline gap-2">
            <span className={titulo}>Cadastradas ({contas.length})</span>
            <button onClick={() => onNova(null)} className="ml-auto text-[13px] text-[var(--brand-500)] hover:underline">+ Adicionar conta recorrente</button>
          </div>
          {!contas.length ? <p className="text-sm text-[var(--surface-500)] py-2">Nenhuma ainda.</p> : contas.map(c => (
            <button key={c.id} onClick={() => onEditar(c)} className="w-full grid grid-cols-[1fr_auto] gap-3 items-center py-2.5 border-b border-[var(--surface-100)] last:border-0 text-left hover:bg-[var(--surface-50)]">
              <span className="flex flex-col min-w-0">
                <span className="text-sm text-[var(--surface-800)] truncate">{c.nome}</span>
                <span className="text-xs text-[var(--surface-500)] truncate">{descreverRegra(c)}{c.fornecedor_nome ? ` · ${c.fornecedor_nome}` : ''}</span>
              </span>
              <span className="text-mono text-sm tabular-nums text-[var(--surface-800)]">{c.repasse ? 'repasse' : `${c.valor_varia ? '~' : ''}${num(Number(c.valor) || 0)}`}</span>
            </button>
          ))}
        </section>

        <section>
          <span className={titulo}>Sugestões do histórico</span>
          <p className="text-xs text-[var(--surface-500)] mt-1">Despesas que se repetiram nos últimos meses, uma vez por mês, e ainda não estão no calendário.</p>
          {sugs === null ? <p className="text-sm text-[var(--surface-500)] py-2">procurando no histórico…</p>
            : !vivas.length ? <p className="text-sm text-emerald-500 py-2">✓ Nada novo pra sugerir.</p>
            : vivas.map(s => (
              <div key={s.categoria_id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center py-2.5 border-b border-[var(--surface-100)] last:border-0">
                <span className="flex flex-col min-w-0">
                  <span className="text-sm text-[var(--surface-800)] truncate">{nomeDe(s)}{s.fornecedor ? <span className="text-[var(--surface-500)]"> · {s.fornecedor}</span> : null}</span>
                  <span className="text-xs text-[var(--surface-500)]">
                    {s.meses.length} de 5 meses · {s.regra === 'ultimo_util' ? 'último dia útil' : `dia ${s.dia}${s.diaVaria ? ' (variou)' : ''}`} · {s.varia ? '~' : ''}{num(s.valor)}
                  </span>
                  <span className="text-[11px] text-[var(--surface-400)] truncate">{s.meses.map(m => `${MES[Number(m.mes.slice(5, 7)) - 1]} ${num(m.valor)}`).join(' · ')}</span>
                </span>
                <button onClick={() => adicionar(s)} className="text-[13px] font-semibold px-2.5 py-1 rounded-[10px] border border-[var(--brand-500)] bg-[var(--brand-500)]/10 text-[var(--surface-900)]">Adicionar</button>
                <button onClick={() => dispensar(s.categoria_id)} title="Não é conta recorrente — não sugerir mais" className="text-[var(--surface-400)] hover:bg-[var(--surface-100)] rounded-md px-2 text-lg leading-none">×</button>
              </div>
            ))}
          <details className="mt-2">
            <summary className="text-xs text-[var(--surface-500)] cursor-pointer">Por que algumas não aparecem</summary>
            <ul className="mt-1.5 pl-4 list-disc text-xs text-[var(--surface-500)] space-y-1">
              <li>O que sai no <b>cartão</b> já entra na previsão pela fatura — sugerir contaria duas vezes.</li>
              <li>Gasto com <b>várias saídas no mês</b> (combustível, bonificação) é do dia a dia, não conta a vencer.</li>
              <li>O que você <b>dispensou no ×</b> não volta neste aparelho.</li>
            </ul>
          </details>
        </section>
      </div>
    </Modal>
  )
}
