'use client'

// AINDA NESTE MÊS — a previsão de caixa da Visão do mês (10/10/2026; desenho
// fechado na bancada, padrões do Xero e do Float). Até 11/10/2026 era uma janela
// de 30 dias ("Próximos 30 dias"); o Lucas escolheu na bancada de textos que ela
// vá de AMANHÃ ATÉ O ÚLTIMO DIA DO MÊS — no último dia do mês não há o que prever.
//
//   disponível hoje + parcelas da maquininha (esteira, lib/recebiveis) −
//   contas fixas em aberto (lib/vencimentos) − faturas de cartão em aberto
//   = saldo no fim; e o MENOR SALDO à frente, com a data (o "vale" do Float).
//
// É PREVISÃO: linha tracejada, selo "não é saldo", nunca somada ao disponível
// (FLOW_FINANCEIRO §9.1.10). Só entra recebível de maquininha CALIBRADA
// (`contaCalibrada`) e só conta o que tem data de verdade — nada inventado
// pela média do histórico (a armadilha do QuickBooks/Rocket Money).

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { montarEsteira, contaCalibrada, type PagamentoCartao } from '@/lib/recebiveis'
import { curto, type ContaNoMes } from './ContasDoMes'

/** Abaixo disso o menor saldo fica âmbar (Lucas, 10/10: R$ 5.000; depois vira configuração da unidade). */
export const SALDO_MINIMO = 5000

const num = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const isoDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function ProximosDias({ sb, uid, disponivel, doMes, atrasadas, celular }: {
  sb: SupabaseClient; uid: string | undefined; disponivel: number
  doMes: (ano: number, mes0: number) => ContaNoMes[]
  atrasadas: ContaNoMes[]
  celular: boolean
}) {
  const [receb, setReceb] = useState<Map<string, number> | null>(null)
  const [faturas, setFaturas] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    if (!uid) return
    let vivo = true
    void (async () => {
      const hoje = new Date()
      const desde = new Date(hoje); desde.setDate(desde.getDate() - 400)   // o parcelado em 12× ainda cai
      const { data: cs } = await sb.from('contas').select('id, nome, produto, tipo')
        .or(`unidade_id.eq.${uid},unidades_extras.cs.{${uid}}`).eq('ativo', true).eq('legado', false)
      const contas = (cs as { id: string; nome: string; produto: string | null; tipo: string | null }[] | null) || []
      const maqs = contas.filter(c => c.produto === 'maquininha' && contaCalibrada(c.nome)).map(c => c.id)
      const cartoes = contas.filter(c => c.tipo === 'cartao' || c.produto === 'cartao_credito').map(c => c.id)
      const pags: PagamentoCartao[] = []
      if (maqs.length) {
        for (let off = 0; ; off += 1000) {
          const { data } = await sb.from('pagamentos').select('id, conta_id, data_pagamento, valor, valor_liquido, metodo, parcelas')
            .in('conta_id', maqs).in('metodo', ['credito', 'debito']).gte('data_pagamento', isoDe(desde)).order('id').range(off, off + 999)
          const pg = (data as PagamentoCartao[] | null) || []
          pags.push(...pg)
          if (pg.length < 1000) break
        }
      }
      const m = new Map<string, number>()
      for (const r of montarEsteira(pags)) m.set(r.previstoEm, (m.get(r.previstoEm) || 0) + r.valor)
      // Faturas em aberto: compras do cartão pelo vencimento, menos as já quitadas.
      const f = new Map<string, number>()
      if (cartoes.length) {
        const [{ data: ls }, { data: pg }] = await Promise.all([
          sb.from('fin_lancamentos').select('conta_pagamento_id, data_caixa, valor').in('conta_pagamento_id', cartoes)
            .neq('status', 'rejeitado').gte('data_caixa', isoDe(hoje)),
          sb.from('fin_movimentos').select('conta_destino_id, fatura_vencimento').eq('tipo', 'fatura_cartao')
            .in('conta_destino_id', cartoes).not('fatura_vencimento', 'is', null),
        ])
        const pagas = new Set(((pg as { conta_destino_id: string; fatura_vencimento: string }[] | null) || []).map(p => `${p.conta_destino_id}|${p.fatura_vencimento.slice(0, 10)}`))
        for (const l of (ls as { conta_pagamento_id: string; data_caixa: string; valor: number }[] | null) || []) {
          const v = l.data_caixa.slice(0, 10)
          if (!pagas.has(`${l.conta_pagamento_id}|${v}`)) f.set(v, (f.get(v) || 0) + Number(l.valor))
        }
      }
      if (vivo) { setReceb(m); setFaturas(f) }
    })()
    return () => { vivo = false }
  }, [sb, uid])

  const serie = useMemo(() => {
    if (!receb) return null
    const hoje = new Date()
    const dias: string[] = []
    const ultimo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()
    for (let i = hoje.getDate() + 1; i <= ultimo; i++) dias.push(isoDe(new Date(hoje.getFullYear(), hoje.getMonth(), i)))
    if (!dias.length) return { pts: [], minimo: { v: disponivel, d: '' }, entra: 0, sai: 0, fim: isoDe(hoje) }
    const fimJ = dias[dias.length - 1]
    const saidas = new Map<string, { v: number; nomes: string[] }>()
    const add = (d: string, v: number, nome: string) => { const x = saidas.get(d) || { v: 0, nomes: [] }; saidas.set(d, { v: x.v + v, nomes: [...x.nomes, nome] }) }
    // vencida que não foi paga ainda vai sair — amanhã. O repasse entra UMA vez:
    // o valor dele é o que está em aberto, e ele se repete todo mês na regra.
    let repasseContado = false
    for (const x of atrasadas) { add(dias[0], x.valor, `${x.conta.nome} (vencida)`); if (x.conta.repasse) repasseContado = true }
    // contas fixas em aberto dentro da janela
    const meses = [...new Set(dias.map(d => d.slice(0, 7)))]
    for (const mm of meses) {
      for (const x of doMes(Number(mm.slice(0, 4)), Number(mm.slice(5, 7)) - 1)) {
        if (x.situacao === 'pago' || x.venc.data < dias[0] || x.venc.data > fimJ) continue
        if (x.conta.repasse) { if (repasseContado) continue; repasseContado = true }
        add(x.venc.data, x.valor, x.conta.nome)
      }
    }
    for (const [d, v] of faturas) if (d >= dias[0] && d <= fimJ) add(d, v, 'fatura do cartão')
    let saldo = disponivel
    let minimo = { v: disponivel, d: '' }
    const pts = dias.map(d => {
      const ent = receb.get(d) || 0, sai = saidas.get(d)?.v || 0
      saldo += ent - sai
      if (saldo < minimo.v) minimo = { v: saldo, d }
      return { d, ent, sai, saldo, nomes: saidas.get(d)?.nomes || [] }
    })
    return { pts, minimo, entra: pts.reduce((a, p) => a + p.ent, 0), sai: pts.reduce((a, p) => a + p.sai, 0), fim: fimJ }
  }, [receb, faturas, doMes, atrasadas, disponivel])

  if (!serie) return <div className="card p-4"><span className="text-[11px] font-semibold tracking-[.14em] uppercase text-[var(--surface-500)]">Ainda neste mês</span><p className="text-sm text-[var(--surface-500)] py-6">calculando…</p></div>
  if (!serie.pts.length) return <div className="card p-4"><span className="text-[11px] font-semibold tracking-[.14em] uppercase text-[var(--surface-500)]">Ainda neste mês</span><p className="text-sm text-[var(--surface-500)] py-3">Hoje é o último dia do mês — não há mais o que prever.</p></div>

  const W = celular ? 340 : 700, H = 190, meio = 110
  const N = serie.pts.length
  const bw = W / N
  const maxBar = Math.max(1, ...serie.pts.map(p => Math.max(p.ent, p.sai)))
  const vals = serie.pts.map(p => p.saldo)
  const maxS = Math.max(disponivel, ...vals), minS = Math.min(0, ...vals)
  const y = (v: number) => 12 + ((maxS - v) / (maxS - minS || 1)) * (H - 40)
  const linha = serie.pts.map((p, i) => `${i ? 'L' : 'M'}${(i + 0.5) * bw},${y(p.saldo)}`).join(' ')
  const iMin = serie.pts.findIndex(p => p.d === serie.minimo.d)
  const baixo = serie.minimo.d && serie.minimo.v < SALDO_MINIMO
  const final = serie.pts[N - 1].saldo

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[11px] font-semibold tracking-[.14em] uppercase text-[var(--surface-500)]">Ainda neste mês</span>
        <span className="text-xs text-[var(--surface-500)]">estimativa</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-2.5 text-sm">
        <span><span className="text-xs text-[var(--surface-500)]">saldo hoje</span> <span className="text-mono">{num(disponivel)}</span></span>
        <span className="text-emerald-500">+ <span className="text-mono">{num(serie.entra)}</span> <span className="text-xs text-[var(--surface-500)]">a receber</span></span>
        <span className="text-red-400">− <span className="text-mono">{num(serie.sai)}</span> <span className="text-xs text-[var(--surface-500)]">a pagar</span></span>
        <span>= <span className="text-mono text-lg">{num(final)}</span> <span className="text-xs text-[var(--surface-500)]">até {curto(serie.fim)}</span></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block mt-1.5" role="img" aria-label="Entradas, saídas e saldo previsto nos próximos 30 dias">
        <line x1={0} x2={W} y1={meio} y2={meio} stroke="var(--surface-200)" />
        {serie.pts.map((p, i) => (
          <g key={p.d}>
            {p.ent > 0 && <rect x={i * bw + bw * 0.18} y={meio - (p.ent / maxBar) * 70} width={bw * 0.64} height={(p.ent / maxBar) * 70} rx={2} fill="#10b981" opacity={0.75}><title>{curto(p.d)} · entra R$ {num(p.ent)} (maquininha)</title></rect>}
            {p.sai > 0 && <rect x={i * bw + bw * 0.18} y={meio} width={bw * 0.64} height={Math.min((p.sai / maxBar) * 70, 78)} rx={2} fill="#ef4444" opacity={0.7}><title>{curto(p.d)} · sai R$ {num(p.sai)} — {p.nomes.join(', ')}</title></rect>}
            {i % 7 === 0 && <text x={(i + 0.5) * bw} y={H - 2} fontSize={10} textAnchor="middle" fill="var(--surface-400)">{p.d.slice(8, 10)}/{p.d.slice(5, 7)}</text>}
          </g>
        ))}
        <path d={linha} fill="none" stroke="#a78bfa" strokeWidth={2} strokeDasharray="5 4" />
        {iMin >= 0 && <circle cx={(iMin + 0.5) * bw} cy={y(serie.minimo.v)} r={4} fill={baixo ? '#f59e0b' : '#a78bfa'} />}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] mt-1">
        {serie.minimo.d
          ? <span className={baixo ? 'text-amber-500' : 'text-[var(--surface-700)]'}>Mínimo previsto: <span className="text-mono">R$ {num(serie.minimo.v)}</span> em {curto(serie.minimo.d)}</span>
          : <span className="text-[var(--surface-700)]">O saldo não cai abaixo do de hoje até o fim do mês.</span>}
        <span className="text-xs text-[var(--surface-500)]"><span className="text-emerald-500">▮</span> entra · <span className="text-red-400">▮</span> sai · ┄ saldo previsto</span>
      </div>
    </div>
  )
}
