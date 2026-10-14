'use client'

// REPASSAR UM CUSTO PARA OUTRA(S) UNIDADE(S), depois de lançado (14/10/2026, pedido do Lucas).
//
// Caso real: Santos pagou tráfego pago de Pinda e cobrou da MATRIZ; a Matriz reconheceu e o
// valor foi descontado no repasse que Santos JÁ PAGOU. Trocar a unidade da cobrança antiga
// desmancharia aquele repasse (o caixa já andou). O certo é REPASSAR ADIANTE: quem ficou com o
// custo emite cobranças NOVAS pra quem consumiu — uma ou VÁRIAS unidades, cada uma com o seu
// valor. Quando cada uma reconhece, nasce a despesa lá e o reembolso aqui. Nada do que já foi
// pago muda.
//
// Vale pra qualquer lançamento — inclusive a "perna" de um acerto. O que já foi repassado
// aparece em cima e só se divide o que ainda sobra.

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import { fmtBRL } from '@/lib/financeiro'

export type LancParaRepassar = { id: string; valor: number; categoria_id: string | null; descricao: string | null; fornecedor_nome: string | null; data_competencia: string }
type Linha = { unidade: string; valor: string }

const paraNum = (t: string) => Number(t.replace(/\./g, '').replace(',', '.')) || 0
const paraTxt = (n: number) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',')

export default function RepassarCustoModal({ lanc, onClose, onFeito }: { lanc: LancParaRepassar | null; onClose: () => void; onFeito?: () => void }) {
  const sb = useMemo(() => createClient() as unknown as SupabaseClient, [])
  const { toast } = useToast()
  const { currentUnit, userName } = useUnit()
  const [unidades, setUnidades] = useState<{ id: string; nome: string }[]>([])
  const [jaFeito, setJaFeito] = useState<{ unidade: string; nome: string; valor: number; status: string }[] | null>(null)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [desc, setDesc] = useState('')
  const [salvando, setSalvando] = useState(false)

  const total = lanc ? Math.abs(lanc.valor) : 0
  const jaRepassado = (jaFeito || []).reduce((a, c) => a + c.valor, 0)
  const livre = Math.round((total - jaRepassado) * 100) / 100

  useEffect(() => {
    if (!lanc || !currentUnit?.id) return
    setDesc(lanc.descricao || lanc.fornecedor_nome || ''); setJaFeito(null); setLinhas([])
    void (async () => {
      const [{ data: us }, { data: cb }] = await Promise.all([
        sb.from('unidades').select('id, nome').eq('ativa', true).neq('id', currentUnit.id).order('nome'),
        sb.from('fin_cobrancas').select('valor, status, unidade_devedora').eq('lancamento_origem_id', lanc.id).not('status', 'in', '(cancelada,recusada)'),
      ])
      const lista = (us as { id: string; nome: string }[] | null) || []
      setUnidades(lista)
      const feitos = ((cb as { valor: number; status: string; unidade_devedora: string }[] | null) || [])
        .map(c => ({ unidade: c.unidade_devedora, nome: lista.find(u => u.id === c.unidade_devedora)?.nome || 'outra unidade', valor: Number(c.valor), status: c.status }))
      setJaFeito(feitos)
      const sobra = Math.round((Math.abs(lanc.valor) - feitos.reduce((a, c) => a + c.valor, 0)) * 100) / 100
      setLinhas(sobra > 0.005 ? [{ unidade: '', valor: paraTxt(sobra) }] : [])
    })()
  }, [lanc, currentUnit?.id, sb])

  const soma = linhas.reduce((a, l) => a + paraNum(l.valor), 0)
  const fica = Math.round((livre - soma) * 100) / 100
  const muda = (i: number, p: Partial<Linha>) => setLinhas(ls => ls.map((l, k) => (k === i ? { ...l, ...p } : l)))
  const usadas = new Set([...linhas.map(l => l.unidade), ...(jaFeito || []).map(c => c.unidade)])

  async function emitir() {
    if (!lanc || !currentUnit?.id) return
    if (!linhas.length) return
    if (linhas.some(l => !l.unidade)) return toast('Escolha a unidade de cada linha', 'error')
    if (new Set(linhas.map(l => l.unidade)).size !== linhas.length) return toast('Cada unidade entra uma vez só', 'error')
    if (linhas.some(l => paraNum(l.valor) <= 0)) return toast('Cada unidade precisa de um valor', 'error')
    if (fica < -0.005) return toast(`As cobranças passam do que sobra (${fmtBRL(livre)})`, 'error')
    setSalvando(true)
    const { error } = await sb.from('fin_cobrancas').insert(linhas.map(l => ({
      unidade_credora: currentUnit.id, unidade_devedora: l.unidade, tipo: 'despesa_rateada',
      valor: Math.round(paraNum(l.valor) * 100) / 100, data: lanc.data_competencia.slice(0, 10), descricao: desc.trim() || null,
      categoria_id: lanc.categoria_id, status: 'emitida', lancamento_origem_id: lanc.id, criado_por_nome: userName || null,
    })))
    setSalvando(false)
    if (error) return toast(error.message, 'error')
    toast(linhas.length === 1
      ? `Cobrança emitida para ${unidades.find(u => u.id === linhas[0].unidade)?.nome} — ela reconhece em Acertos entre unidades`
      : `${linhas.length} cobranças emitidas — cada unidade reconhece em Acertos entre unidades`, 'success')
    onFeito?.(); onClose()
  }

  return (
    <Modal isOpen={!!lanc} onClose={onClose} title="Repassar para outras unidades" size="md"
      footer={livre > 0.005 && jaFeito !== null ? (
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={() => void emitir()} disabled={salvando || !linhas.length} className="btn-primary text-sm">
            {salvando ? 'Emitindo…' : linhas.length > 1 ? `Emitir ${linhas.length} cobranças` : 'Emitir cobrança'}
          </button>
        </div>
      ) : undefined}>
      {!lanc ? null : jaFeito === null ? <p className="text-sm text-[var(--surface-500)]">carregando…</p> : (
        <div className="space-y-3 text-sm">
          <p className="text-[var(--surface-600)]">
            O custo de <b>{fmtBRL(total)}</b> ficou com <b>{currentUnit?.nome}</b>. Se outra(s) unidade(s) consumiram, emita uma cobrança
            pra cada uma: quando ela reconhecer, a despesa vai pra lá e aqui entra o reembolso. <b>Nada do que já foi pago muda.</b>
          </p>

          {jaFeito.length > 0 && (
            <div className="rounded-[10px] border border-[var(--surface-200)] px-3 py-2 space-y-1">
              <p className="text-xs font-semibold text-[var(--surface-700)]">Já repassado</p>
              {jaFeito.map((c, i) => (
                <p key={i} className="flex justify-between text-[13px] text-[var(--surface-600)]"><span>{c.nome} <span className="text-[var(--surface-400)]">· {c.status}</span></span><span className="text-mono">{fmtBRL(c.valor)}</span></p>
              ))}
              <p className="text-[11px] text-[var(--surface-500)]">Pra mudar um destes, a unidade recusa a cobrança e repassa-se de novo.</p>
            </div>
          )}

          {livre <= 0.005 ? (
            <p className="text-emerald-500">✓ O custo inteiro já foi repassado.</p>
          ) : (<>
            <div className="space-y-2">
              {linhas.map((l, i) => {
                const outras = linhas.reduce((a, x, k) => (k === i ? a : a + paraNum(x.valor)), 0)
                return (
                  <div key={i} className="flex items-center gap-2">
                    <select value={l.unidade} onChange={e => muda(i, { unidade: e.target.value })} className="input flex-1 min-w-0">
                      <option value="">Unidade…</option>
                      {unidades.map(u => <option key={u.id} value={u.id} disabled={u.id !== l.unidade && usadas.has(u.id)}>{u.nome}</option>)}
                    </select>
                    <input inputMode="decimal" value={l.valor} onChange={e => muda(i, { valor: e.target.value })} className="input w-28 text-mono" />
                    <button type="button" title="Tudo o que sobra" onClick={() => muda(i, { valor: paraTxt(Math.max(0, livre - outras)) })}
                            className="text-[11px] font-semibold px-2 py-1.5 rounded-md border border-[var(--surface-300)] text-[var(--surface-600)] hover:bg-[var(--surface-100)]">o resto</button>
                    {linhas.length > 1 && <button type="button" onClick={() => setLinhas(ls => ls.filter((_, k) => k !== i))} className="text-[var(--surface-400)] hover:text-red-400 px-1" title="Tirar">✕</button>}
                  </div>
                )
              })}
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setLinhas(ls => [...ls, { unidade: '', valor: paraTxt(Math.max(0, fica)) }])} className="text-[12px] text-[var(--brand-500)] hover:underline">+ outra unidade</button>
                <span className={`text-[12px] ${fica < -0.005 ? 'text-red-400' : 'text-[var(--surface-500)]'}`}>
                  {fica < -0.005 ? `Passa do que sobra em ${fmtBRL(-fica)}` : `Fica com ${currentUnit?.nome}: ${fmtBRL(fica)}`}
                </span>
              </div>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--surface-500)]">Descrição (as outras unidades veem)</span>
              <input value={desc} onChange={e => setDesc(e.target.value)} className="input w-full" />
            </label>
          </>)}
        </div>
      )}
    </Modal>
  )
}
