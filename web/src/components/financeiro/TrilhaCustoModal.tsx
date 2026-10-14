'use client'

// TRILHA DO CUSTO — o popup (14/10/2026). Mostra, a partir de QUALQUER lançamento da
// corrente (a compra original, a despesa que nasceu numa unidade, a dedução de quem
// cobrou), o caminho inteiro do custo e com quem ele ficou. A lógica está em
// lib/trilha-custo.ts; aqui só se busca e se desenha.
//
// Portal no body: abre de dentro de outros popups (Editar lançamento, Acertos do Repasse),
// e o Modal do projeto mora num bloco animado que prende `fixed` (ver page.tsx).

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import { fmtBRL, fmtData } from '@/lib/financeiro'
import { montarTrilha, idsDosElos, type CobTrilha, type LancTrilha, type Trilha } from '@/lib/trilha-custo'

const CAMPOS = 'id, unidade_credora, unidade_devedora, valor, status, data, descricao, repasse_id, lancamento_origem_id, lancamento_aceite_id, lancamento_reembolso_id'
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export default function TrilhaCustoModal({ lancamentoId, onClose }: { lancamentoId: string | null; onClose: () => void }) {
  const sb = useMemo(() => createClient() as unknown as SupabaseClient, [])
  const [trilha, setTrilha] = useState<Trilha | null>(null)
  const [nomes, setNomes] = useState<Map<string, string>>(new Map())
  const [repMes, setRepMes] = useState<Map<string, string>>(new Map())
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!lancamentoId) return
    let vivo = true
    void (async () => {
      setTrilha(null); setErro(null)
      // anda pelos elos até não aparecer cobrança nova (teto de 6 voltas)
      const cobs = new Map<string, CobTrilha>()
      const consultados = new Set<string>()
      let ids = [lancamentoId]
      for (let volta = 0; volta < 6 && ids.length; volta++) {
        ids.forEach(x => consultados.add(x))
        const lista = ids.join(',')
        const { data, error } = await sb.from('fin_cobrancas').select(CAMPOS)
          .or(`lancamento_origem_id.in.(${lista}),lancamento_aceite_id.in.(${lista}),lancamento_reembolso_id.in.(${lista})`)
        if (error) { if (vivo) setErro(error.message); return }
        const novas = ((data as CobTrilha[] | null) || []).filter(c => !cobs.has(c.id))
        novas.forEach(c => cobs.set(c.id, c))
        ids = idsDosElos(novas).filter(x => !consultados.has(x))
      }
      const todas = [...cobs.values()]
      const lancIds = [...new Set([lancamentoId, ...idsDosElos(todas)])]
      const repIds = [...new Set(todas.map(c => c.repasse_id).filter((x): x is string => !!x))]
      const [{ data: ls }, { data: us }, { data: rs }] = await Promise.all([
        sb.from('fin_lancamentos').select('id, unidade_id, valor, origem, descricao, data_competencia').in('id', lancIds),
        sb.from('unidades').select('id, nome'),
        repIds.length ? sb.from('fin_repasses').select('id, mes_referencia').in('id', repIds) : Promise.resolve({ data: [] }),
      ])
      if (!vivo) return
      setNomes(new Map(((us as { id: string; nome: string }[] | null) || []).map(u => [u.id, u.nome])))
      setRepMes(new Map(((rs as { id: string; mes_referencia: string }[] | null) || []).map(r => {
        const [a, m] = r.mes_referencia.slice(0, 7).split('-').map(Number)
        return [r.id, `${MESES[m - 1]}/${String(a).slice(2)}`]
      })))
      setTrilha(montarTrilha(todas, new Map(((ls as LancTrilha[] | null) || []).map(l => [l.id, l]))))
    })()
    return () => { vivo = false }
  }, [lancamentoId, sb])

  const n = (id: string) => nomes.get(id) || 'outra unidade'
  const comoFicou = (c: CobTrilha) =>
    c.status === 'emitida' ? <span className="text-amber-500">esperando {n(c.unidade_devedora)} reconhecer</span>
    : c.status === 'liquidada' ? <span className="text-emerald-500">{c.repasse_id ? `no repasse de ${repMes.get(c.repasse_id) || '…'}` : 'reconhecida e baixada'}</span>
    : <span className="text-emerald-500">reconhecida · <span className="text-amber-500">o dinheiro ainda não foi acertado</span></span>

  if (!lancamentoId || typeof document === 'undefined') return null
  return createPortal(
    <Modal isOpen onClose={onClose} title="Trilha do custo" size="md">
      {erro ? <p className="text-sm text-red-400">{erro}</p>
      : !trilha ? <p className="text-sm text-[var(--surface-500)]">montando a trilha…</p>
      : !trilha.passos.length ? (
        <p className="text-sm text-[var(--surface-600)]">Este lançamento não passou por nenhuma outra unidade — o custo é todo de quem lançou.</p>
      ) : (
        <div className="space-y-4 text-sm">
          {/* COM QUEM FICOU — a pergunta que importa, primeiro */}
          <div className="rounded-[10px] border border-[var(--surface-200)] p-3 space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--surface-500)]">Com quem ficou o custo</p>
            {trilha.saldos.map(s => (
              <div key={s.unidade} className="flex items-baseline justify-between gap-2">
                <span className={s.fica > 0.005 ? 'font-semibold text-[var(--surface-900)]' : 'text-[var(--surface-500)]'}>{n(s.unidade)}</span>
                <span className="text-right">
                  <span className={`text-mono ${s.fica > 0.005 ? 'text-[var(--surface-900)]' : 'text-[var(--surface-400)]'}`}>{fmtBRL(s.fica)}</span>
                  {s.pendente > 0.005 && <span className="block text-[11px] text-amber-500">+ {fmtBRL(s.pendente)} esperando reconhecer</span>}
                </span>
              </div>
            ))}
          </div>

          {/* O CAMINHO — passo a passo */}
          <ol className="space-y-2">
            {trilha.raiz && (
              <li className="rounded-[10px] bg-[var(--surface-50)] px-3 py-2">
                <p className="text-[12.5px] text-[var(--surface-800)]">
                  💳 <b>{n(trilha.raiz.unidade_id)}</b> pagou {fmtBRL(Math.abs(trilha.raiz.valor))}
                  <span className="text-[var(--surface-500)]"> · {fmtData(trilha.raiz.data_competencia)}{trilha.raiz.descricao ? ` · ${trilha.raiz.descricao}` : ''}</span>
                </p>
              </li>
            )}
            {trilha.passos.map(({ cob: c, nivel }) => (
              <li key={c.id} className="rounded-[10px] border border-[var(--surface-200)] px-3 py-2" style={{ marginLeft: Math.min(nivel, 3) * 14 }}>
                <p className="text-[12.5px] text-[var(--surface-800)]">
                  ↳ <b>{n(c.unidade_credora)}</b> cobrou {fmtBRL(Number(c.valor))} de <b>{n(c.unidade_devedora)}</b>
                </p>
                <p className="text-[11.5px] text-[var(--surface-500)]">
                  {fmtData(c.data)}{c.descricao ? ` · ${c.descricao}` : ''} · {comoFicou(c)}
                </p>
                {c.status !== 'emitida' && (
                  <p className="text-[11px] text-[var(--surface-400)] mt-0.5">
                    na DRE: {n(c.unidade_devedora)} <span className="text-mono">+{fmtBRL(Number(c.valor))}</span> de despesa · {n(c.unidade_credora)} <span className="text-mono">−{fmtBRL(Number(c.valor))}</span> (dedução)
                  </p>
                )}
              </li>
            ))}
          </ol>

          {/* a regra, em uma frase — é o que a equipe precisa entender */}
          <p className="text-[11.5px] text-[var(--surface-500)] border-t border-[var(--surface-200)] pt-2">
            O <b>caixa</b> mostra quem pagou de verdade; o <b>resultado</b> mostra quem consumiu. A cobrança é a ponte:
            quando é reconhecida, a despesa passa pra quem consumiu e sai de quem pagou. O dinheiro anda uma vez só, no repasse ou no acerto.
          </p>
        </div>
      )}
    </Modal>,
    document.body,
  )
}
