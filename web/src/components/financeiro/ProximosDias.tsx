'use client'

// PRÓXIMOS 30 DIAS — a previsão de caixa da Visão do mês (10/10/2026; desenho
// fechado na bancada, padrões do Xero e do Float).
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
    for (let i = 1; i <= 30; i++) { const d = new Date(hoje); d.setDate(d.getDate() + i); dias.push(isoDe(d)) }
    const saidas = new Map<string, { v: number; nomes: string[] }>()
    const add = (d: string, v: number, nome: string) => { const x = saidas.get(d) || { v: 0, nomes: [] }; saidas.set(d, { v: x.v + v, nomes: [...x.nomes, nome] }) }
    // vencida que não foi paga ainda vai sair — amanhã. O repasse entra UMA vez:
    // o valor dele é o que está em aberto, e ele se repete todo mês na regra.
    let repasseContado = false
    for (const x of atrasadas) { add(dias[0], x.valor, `${x.conta.nome} (vencida)`); if (x.conta.repasse) repasseContado = true }
    // contas fixas em aberto deste mês e do próximo, dentro da janela
    const meses = [...new Set(dias.map(d => d.slice(0, 7)))]
    for (const mm of meses) {
      for (const x of doMes(Number(mm.slice(0, 4)), Number(mm.slice(5, 7)) - 1)) {
        if (x.situacao === 'pago' || x.venc.data < dias[0] || x.venc.data > dias[29]) continue
        if (x.conta.repasse) { if (repasseContado) continue; repasseContado = true }
        add(x.venc.data, x.valor, x.conta.nome)
      }
    }
    for (const [d, v] of faturas) if (d >= dias[0] && d <= dias[29]) add(d, v, 'fatura do cartão')
    let saldo = disponivel
    let minimo = { v: disponivel, d: '' }
    const pts = dias.map(d => {
      const ent = receb.get(d) || 0, sai = saidas.get(d)?.v || 0
      saldo += ent - sai
      if (saldo < minimo.v) minimo = { v: saldo, d }
      return { d, ent, sai, saldo, nomes: saidas.get(d)?.nomes || [] }
    })
    return { pts, minimo, entra: pts.reduce((a, p) => a + p.ent, 0), sai: pts.reduce((a, p) => a + p.sai, 0), fim: pts[29].d }
  }, [receb, faturas, doMes, atrasadas, disponivel])

  if (!serie) return <div className="card p-4"><span className="text-[11px] font-semibold tracking-[.14em] uppercase text-[var(--surface-500)]">Próximos 30 dias</span><p className="text-sm text-[var(--surface-500)] py-6">calculando…</p></div>

  const W = celular ? 340 : 700, H = 190, meio = 110
  const bw = W / 30
  const maxBar = Math.max(1, ...serie.pts.map(p => Math.max(p.ent, p.sai)))
  const vals = serie.pts.map(p => p.saldo)
  const maxS = Math.max(disponivel, ...vals), minS = Math.min(0, ...vals)
  const y = (v: number) => 12 + ((maxS - v) / (maxS - minS || 1)) * (H - 40)
  const linha = serie.pts.map((p, i) => `${i ? 'L' : 'M'}${(i + 0.5) * bw},${y(p.saldo)}`).join(' ')
  const iMin = serie.pts.findIndex(p => p.d === serie.minimo.d)
  const baixo = serie.minimo.d && serie.minimo.v < SALDO_MINIMO
  const final = serie.pts[29].saldo

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[11px] font-semibold tracking-[.14em] uppercase text-[var(--surface-500)]">Próximos 30 dias</span>
        <span className="text-xs text-[var(--surface-500)]">previsão — não é saldo</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-2.5 text-sm">
        <span><span className="text-xs text-[var(--surface-500)]">hoje</span> <span className="text-mono">{num(disponivel)}</span></span>
        <span className="text-emerald-500">+ <span className="text-mono">{num(serie.entra)}</span> <span className="text-xs text-[var(--surface-500)]">maquininha</span></span>
        <span className="text-red-400">− <span className="text-mono">{num(serie.sai)}</span> <span className="text-xs text-[var(--surface-500)]">contas e faturas</span></span>
        <span>= <span className="text-mono text-lg">{num(final)}</span> <span className="text-xs text-[var(--surface-500)]">em {curto(serie.fim)}</span></span>
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
          ? <span className={baixo ? 'text-amber-500' : 'text-[var(--surface-700)]'}>Menor saldo: <span className="text-mono">R$ {num(serie.minimo.v)}</span> em {curto(serie.minimo.d)}{baixo ? ` — abaixo do mínimo de R$ ${num(SALDO_MINIMO)}` : ''}</span>
          : <span className="text-[var(--surface-700)]">O saldo não cai abaixo do de hoje nos próximos 30 dias.</span>}
        <span className="text-xs text-[var(--surface-500)]">verde = parcelas da maquininha · vermelho = contas fixas e faturas · tracejado = saldo previsto</span>
      </div>
    </div>
  )
}
