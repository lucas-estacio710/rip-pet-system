'use client'

// VISÃO DO MÊS — a primeira aba do Financeiro (redesenho V2, 09/10/2026;
// desenho aprovado: artifact 9uEYKTjnPY3gdhNkRA6Hho, prancha "V2Mes").
//
// O ENREDO é "como foi o mês da unidade", em 4 atos, nesta ordem:
//   1. Como foi        — entrou · custou · sobrou (vw_dre_resumo, a mesma da DRE)
//   2. Para onde foi   — o custo por grupo da DRE, numa barra
//   3. Está batendo?   — por conta: o que o BANCO disse (fin_saldos_banco, mig
//                        156, gravado pelo Importar) × o que o sistema tem na
//                        mesma data × a diferença
//   4. O que falta     — cada pendência com o botão que a resolve
//
// REGRA DA FANTASIA: roxo só na ação principal; verde = conferido; âmbar =
// atenção; valores à direita em fonte de número. CADA NÚMERO LEVA AO LUGAR
// ONDE SE RESOLVE — por isso a tela recebe `onIr` (trocar de aba) e `onLancar`
// (abrir o + Lançar no item certo) da página.
//
// Cada ato respeita a aba de onde vem: sem a DRE visível, somem 1 e 2; sem o
// Caixa, some o 3; sem o Repasse, o "pagar repasse" sai da lista.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Loader2 } from 'lucide-react'
import { useUnit } from '@/contexts/UnitContext'
import { fmtBRL, fmtData, limitesDoMes, hojeISO } from '@/lib/financeiro'
import { mesParaData } from '@/lib/repasse'
import ExtratoContaModal from './ExtratoContaModal'
import type { AcaoLancar } from '@/lib/lancar'
import { useContasFixas, ContasDoMesWidget, CalendarioContasModal, curto, type ContaNoMes } from './ContasDoMes'
import ContaFixaModal, { type ContaFixa } from './ContaFixaModal'
import ProximosDias from './ProximosDias'

type Resumo = {
  receita_bruta: number; outras_receitas: number; deducoes: number
  custo_servico: number; desp_operacional: number; desp_pessoal: number
  desp_administrativa: number; desp_comercial: number; desp_financeira: number
  outras_despesas: number; resultado: number
  distribuicao?: number   // mig 162: retirada de sócios, fora do resultado
}
type ContaRow = { id: string; nome: string; tipo: string; produto: string | null; caixa_desde: string | null; mostrar_no_caixa: boolean | null }
type CardConta = {
  conta: ContaRow
  cartao: boolean
  banco: { data: string; saldo: number } | null   // o que o banco disse (mig 156)
  sistema: number | null                          // o sistema na mesma data
  conferidoAte: string | null                     // última linha conciliada (mig 153)
}
type Pendencia = { chave: string; titulo: string; detalhe: string; valor?: number; acao: string; onClick: () => void; atencao: boolean }

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const rotulo = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`
const somaMes = (m: string, d: number) => {
  const [a, mm] = m.split('-').map(Number)
  const x = new Date(a, mm - 1 + d, 1)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`
}
const c2 = (n: number) => Math.round(n * 100) / 100
const num = (v: number) => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Os grupos da DRE que são custo, com o nome que o gerente reconhece. */
const GRUPOS: { campo: keyof Resumo; nome: string; cor: string }[] = [
  { campo: 'custo_servico', nome: 'Cremações', cor: '#a78bfa' },
  { campo: 'desp_administrativa', nome: 'Administrativo', cor: '#60a5fa' },
  { campo: 'desp_comercial', nome: 'Comercial', cor: '#f472b6' },
  { campo: 'deducoes', nome: 'Impostos', cor: '#fbbf24' },
  { campo: 'desp_pessoal', nome: 'Pessoal', cor: '#34d399' },
  { campo: 'desp_operacional', nome: 'Operacional', cor: '#fb923c' },
  { campo: 'desp_financeira', nome: 'Financeiro', cor: '#38bdf8' },
  { campo: 'outras_despesas', nome: 'Outros', cor: '#94a3b8' },
]

export default function VisaoMesTab({ mes, verResultado, verCaixa, verRepasse, verLancamentos, onIr, onLancar, onPaguei, onContasFaturas }: {
  mes: string
  verResultado: boolean
  verCaixa: boolean
  verRepasse: boolean
  verLancamentos: boolean
  onIr: (aba: string) => void
  onLancar?: (acao: AcaoLancar) => void
  /** Paguei de uma conta fixa: abre a despesa preenchida (ou a Quitação, no repasse). */
  onPaguei?: (x: ContaNoMes) => void
  onContasFaturas?: () => void
}) {
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, [])
  const { currentUnit } = useUnit()
  const [carregando, setCarregando] = useState(false)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [qtdDespesas, setQtdDespesas] = useState(0)
  const [cards, setCards] = useState<CardConta[]>([])
  const [pend, setPend] = useState<Pendencia[]>([])
  const [extratoDe, setExtratoDe] = useState<ContaRow | null>(null)
  // CONTAS DO MÊS (mig 160) e o "disponível" de hoje.
  const fixas = useContasFixas(supabase, currentUnit?.id)
  const [saldos, setSaldos] = useState<{ disponivel: number; guardado: number } | null>(null)
  const [contaEditando, setContaEditando] = useState<ContaFixa | null | 'nova'>(null)
  const [calendarioAberto, setCalendarioAberto] = useState(false)
  const [celular, setCelular] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const f = () => setCelular(mq.matches)
    f(); mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])

  const carregar = useCallback(async () => {
    if (!currentUnit?.id) return
    setCarregando(true)
    const uid = currentUnit.id
    const { ini, fim } = limitesDoMes(mes)
    const corte = fim < hojeISO() ? fim : hojeISO()   // mês corrente: até hoje

    const [r, ql, cs, rp, cb] = await Promise.all([
      verResultado
        ? supabase.from('vw_dre_resumo').select('*').eq('unidade_id', uid).eq('mes', mesParaData(mes)).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('fin_lancamentos').select('id', { count: 'exact', head: true })
        .eq('unidade_id', uid).neq('status', 'rejeitado').gte('data_competencia', ini).lte('data_competencia', fim),
      verCaixa
        ? supabase.from('contas').select('id, nome, tipo, produto, caixa_desde, mostrar_no_caixa')
            .or(`unidade_id.eq.${uid},unidades_extras.cs.{${uid}}`).eq('ativo', true).eq('legado', false).order('nome')
        : Promise.resolve({ data: [] }),
      verRepasse
        ? supabase.from('fin_repasses').select('id, mes_referencia, status, qtd_pets, total_liquido')
            .eq('unidade_id', uid).not('status', 'in', '(pago,cancelado)').is('pago_movimento_id', null).order('mes_referencia')
        : Promise.resolve({ data: [] }),
      supabase.from('fin_cobrancas').select('id', { count: 'exact', head: true })
        .eq('unidade_devedora', uid).eq('status', 'emitida'),
    ])
    setResumo((r.data as Resumo | null) || null)
    {
      // Disponível = contas que pagam (corrente, pagamento, dinheiro), sem maquininha
      // nem cartão; as marcadas como reserva (mig 160) ficam como "guardado".
      const { data: sd } = await supabase.from('vw_caixa_saldo').select('conta_id, tipo, produto, saldo, legado, mostrar_no_caixa')
        .or(`unidade_id.eq.${uid},unidades_extras.cs.{${uid}}`)
      let reservas = new Set<string>()
      const { data: rv, error: erv } = await supabase.from('contas').select('id').eq('reserva', true)
      if (!erv) reservas = new Set(((rv as { id: string }[] | null) || []).map(x => x.id))
      let disp = 0, guard = 0
      for (const x of (sd as { conta_id: string; tipo: string; produto: string | null; saldo: number; legado: boolean; mostrar_no_caixa: boolean | null }[] | null) || []) {
        if (x.legado || x.mostrar_no_caixa === false || x.produto === 'maquininha' || x.tipo === 'cartao' || x.produto === 'cartao_credito') continue
        if (reservas.has(x.conta_id)) guard += Number(x.saldo) || 0
        else disp += Number(x.saldo) || 0
      }
      setSaldos({ disponivel: c2(disp), guardado: c2(guard) })
    }
    setQtdDespesas((ql as { count: number | null }).count || 0)

    // ── ato 3: cada conta que aparece no Caixa (sem maquininha) ──
    const contas = ((cs.data as ContaRow[] | null) || [])
      .filter(c => c.mostrar_no_caixa !== false && c.produto !== 'maquininha')
    const novos: CardConta[] = await Promise.all(contas.map(async conta => {
      const cartao = conta.tipo === 'cartao' || conta.produto === 'cartao_credito'
      const [sb, cc] = await Promise.all([
        // A tabela pode ainda não existir (mig 156): sem ela, o card mostra só o "conferido até".
        supabase.from('fin_saldos_banco').select('data, saldo').eq('conta_id', conta.id)
          .lte('data', cartao ? limitesDoMes(somaMes(mes, 1)).fim : fim).order('data', { ascending: false }).limit(1),
        supabase.from('fin_conciliacoes').select('data_banco').eq('conta_id', conta.id)
          .order('data_banco', { ascending: false }).limit(1),
      ])
      const banco = ((sb.data as { data: string; saldo: number }[] | null) || [])[0] || null
      const conferidoAte = ((cc.data as { data_banco: string }[] | null) || [])[0]?.data_banco || null
      let sistema: number | null = null
      if (banco && cartao) {
        // Fatura: as compras lançadas com aquele vencimento (o −total é a dívida).
        const { data: ls } = await supabase.from('fin_lancamentos').select('valor')
          .eq('conta_pagamento_id', conta.id).eq('data_caixa', banco.data).neq('status', 'rejeitado')
        sistema = -c2(((ls as { valor: number }[] | null) || []).reduce((a, l) => a + Number(l.valor), 0))
      } else if (banco) {
        // Conta: tudo o que o Caixa tem até o dia — paginado (limite de 1000).
        let soma = 0
        for (let off = 0; ; off += 1000) {
          const { data: pg } = await supabase.from('vw_caixa').select('valor')
            .eq('conta_id', conta.id).lte('data', banco.data).order('data').order('origem_id').range(off, off + 999)
          const arr = (pg as { valor: number }[] | null) || []
          soma += arr.reduce((a, x) => a + Number(x.valor), 0)
          if (arr.length < 1000) break
        }
        sistema = c2(soma)
      }
      return { conta, cartao, banco: banco ? { data: banco.data, saldo: Number(banco.saldo) } : null, sistema, conferidoAte }
    }))
    setCards(novos)

    // ── ato 4: o que falta ──
    const lista: Pendencia[] = []
    const reps = (rp.data as { id: string; mes_referencia: string; status: string; qtd_pets: number; total_liquido: number }[] | null) || []
    // Pago em parte (mig 159): a pendência é o que falta, não o total.
    const pagoDe = new Map<string, number>()
    if (reps.length) {
      const { data: pgs } = await supabase.from('fin_movimentos').select('repasse_id, valor').in('repasse_id', reps.map(r => r.id))
      for (const p of (pgs as { repasse_id: string; valor: number }[] | null) || []) pagoDe.set(p.repasse_id, (pagoDe.get(p.repasse_id) || 0) + Number(p.valor))
    }
    for (const rep of fixas.contas.some(c => c.repasse) ? [] : reps) {
      const jaPago = c2(pagoDe.get(rep.id) || 0)
      lista.push({
        chave: `rep-${rep.id}`, titulo: `Pagar o repasse de ${rotulo(rep.mes_referencia.slice(0, 7))} à Matriz`,
        detalhe: `${rep.status === 'aberto' ? 'a Matriz ainda pode mexer' : 'salvo pela Matriz'} · ${rep.qtd_pets} cremações${jaPago ? ` · já pago ${fmtBRL(jaPago)}` : ''}`,
        valor: c2(Number(rep.total_liquido) - jaPago), acao: jaPago ? 'Pagar o resto' : 'Pagar', atencao: true,
        onClick: () => onLancar?.('quitacao'),
      })
    }
    const nCob = (cb as { count: number | null }).count || 0
    if (nCob && verLancamentos) {
      lista.push({
        chave: 'cob', titulo: `${nCob} ${nCob === 1 ? 'cobrança' : 'cobranças'} de outra unidade esperando você`,
        detalhe: 'reconheça ou recuse em Lançamentos › Acertos entre unidades', acao: 'Ver', atencao: true,
        onClick: () => onIr('lancamentos'),
      })
    }
    for (const k of novos) {
      if (k.cartao) continue
      if (!k.conferidoAte || k.conferidoAte < corte) {
        lista.push({
          chave: `imp-${k.conta.id}`, titulo: `Importar o extrato de ${k.conta.nome}`,
          detalhe: k.conferidoAte ? `conferido até ${fmtData(k.conferidoAte)}` : 'nenhuma linha conferida ainda',
          acao: 'Importar', atencao: false, onClick: () => onLancar?.('importar'),
        })
      }
    }
    setPend(lista)
    setCarregando(false)
  }, [supabase, currentUnit?.id, mes, verResultado, verCaixa, verRepasse, verLancamentos, onIr, onLancar, fixas.contas])

  useEffect(() => { void carregar() }, [carregar])

  const entrou = resumo ? c2(Number(resumo.receita_bruta) + Number(resumo.outras_receitas || 0)) : 0
  const sobrou = resumo ? c2(Number(resumo.resultado)) : 0
  const custou = c2(entrou - sobrou)
  const grupos = resumo
    ? GRUPOS.map(g => ({ ...g, valor: Math.abs(Number(resumo[g.campo] || 0)) })).filter(g => g.valor >= 0.005).sort((a, b) => b.valor - a.valor)
    : []
  const somaGrupos = grupos.reduce((a, g) => a + g.valor, 0)
  // O TEMPO DO VERBO (09/10/2026, pedido do Lucas): o mês corrente ainda está
  // acontecendo — "Como foi"/"Sobrou" dão a ideia de mês fechado.
  const emCurso = mes >= hojeISO().slice(0, 7)

  const titulo = 'text-[11px] font-semibold tracking-[.14em] uppercase text-[var(--surface-500)]'
  const link = 'text-[13px] text-[var(--brand-500)] hover:underline text-left'

  // ── as contas do mês e o "hoje" ──
  const [anoN, mesN] = [Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1]
  const itensMes = fixas.doMes(anoN, mesN)
  const hojeS = hojeISO()
  const atrasadas = itensMes.filter(x => x.situacao === 'atrasada')
  const fimSemana = (() => { const d = new Date(`${hojeS}T12:00:00`); d.setDate(d.getDate() + (7 - d.getDay()) % 7); return d.toISOString().slice(0, 10) })()
  const semana = itensMes.filter(x => x.situacao !== 'pago' && x.venc.data >= hojeS && x.venc.data <= fimSemana)
  const podeLancar = !!onPaguei
  const pagar = (x: ContaNoMes) => onPaguei?.(x)

  const blocoMes = verResultado && (
    <div className="card p-4">
      <p className={titulo}>{emCurso ? 'Como está o mês' : 'Como foi o mês'}</p>
      <div className="grid grid-cols-3 gap-3 my-3">
        <button onClick={() => onIr('dre')} className="text-left">
          <span className="block text-xs text-[var(--surface-500)]">{emCurso ? 'Entrou até agora' : 'Entrou'}</span>
          <span className="text-mono text-xl tabular-nums text-[var(--surface-900)]">{fmtBRL(entrou)}</span>
        </button>
        <button onClick={() => (verLancamentos ? onIr('lancamentos') : onIr('dre'))} className="text-left">
          <span className="block text-xs text-[var(--surface-500)]">{emCurso ? 'Custou até agora' : 'Custou'}</span>
          <span className="text-mono text-xl tabular-nums text-[var(--surface-900)]">{fmtBRL(custou)}</span>
          <span className="block text-[11px] text-[var(--surface-500)]">{qtdDespesas} despesas</span>
        </button>
        <button onClick={() => onIr('dre')} className="text-left">
          <span className="block text-xs text-[var(--surface-500)]">{emCurso ? (sobrou >= 0 ? 'Está sobrando' : 'Está faltando') : (sobrou >= 0 ? 'Sobrou' : 'Faltou')}</span>
          <span className={`text-mono text-xl tabular-nums ${sobrou >= 0 ? 'text-emerald-500' : 'text-amber-500'}`}>{fmtBRL(Math.abs(sobrou))}</span>
        </button>
      </div>
      {grupos.length > 0 && (<>
        <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5">
          {grupos.map(g => <span key={g.campo} style={{ flex: g.valor, background: g.cor }} title={`${g.nome}: ${fmtBRL(g.valor)}`} />)}
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 mt-2">
          {grupos.map(g => (
            <span key={g.campo} className="text-xs text-[var(--surface-500)]">
              <span className="inline-block h-2 w-2 rounded-[2px] mr-1" style={{ background: g.cor }} />{g.nome} <span className="text-mono text-[var(--surface-700)]">{num(g.valor)}</span> · {somaGrupos ? Math.round((g.valor / somaGrupos) * 100) : 0}%
            </span>
          ))}
        </div>
      </>)}
      {Number(resumo?.distribuicao) > 0 && (
        <p className="text-xs text-[var(--surface-500)] mt-2.5">Retiradas dos sócios: {fmtBRL(Number(resumo?.distribuicao))} — fora do resultado (é distribuição do lucro).</p>
      )}
      <button onClick={() => onIr('dre')} className={`${link} mt-2.5`}>Ver o resultado linha a linha ›</button>
    </div>
  )

  const precisa = [
    ...atrasadas.map(x => ({ chave: `atr-${x.conta.id}`, titulo: `${x.conta.nome} venceu ${curto(x.venc.data)}`, detalhe: 'ainda sem pagamento', valor: x.valor, acao: x.conta.repasse ? 'Pagar' : 'Paguei', atencao: true, onClick: () => pagar(x) })),
    ...pend,
  ]
  const blocoPrecisa = (
    <div className="card px-4 py-3">
      <p className={titulo}>Precisa de você</p>
      {!precisa.length ? <p className="py-2.5 text-sm text-emerald-500">✓ Nada pendente por aqui.</p> : precisa.map((p, i) => (
        <div key={p.chave} className={`flex flex-wrap items-center gap-3 py-2.5 ${i < precisa.length - 1 ? 'border-b border-[var(--surface-200)]' : ''}`}>
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.atencao ? '#f59e0b' : 'var(--surface-400)' }} />
          <span className="flex-1 min-w-[160px] flex flex-col">
            <span className="text-sm text-[var(--surface-800)]">{p.titulo}</span>
            <span className="text-xs text-[var(--surface-500)]">{p.detalhe}</span>
          </span>
          {p.valor !== undefined && <span className="text-mono text-sm tabular-nums text-[var(--surface-800)]">{num(p.valor)}</span>}
          {(podeLancar || !p.chave.startsWith('atr-')) && (
            <button onClick={p.onClick} className="text-[13px] font-semibold px-3 py-1.5 rounded-[10px] border border-[var(--surface-300)] text-[var(--surface-800)] hover:bg-[var(--surface-100)]">{p.acao}</button>
          )}
        </div>
      ))}
    </div>
  )

  const blocoBanco = verCaixa && cards.length > 0 && (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`${titulo} mr-1`}>Está batendo com o banco?</span>
      {cards.filter(k => !k.cartao).map(k => {
        const dif = k.banco && k.sistema !== null ? c2(k.banco.saldo - k.sistema) : null
        const bate = dif !== null && Math.abs(dif) < 0.005
        return (
          <button key={k.conta.id} onClick={() => setExtratoDe(k.conta)} className="card px-3 py-1.5 text-[12.5px] inline-flex items-center gap-2 hover:bg-[var(--surface-100)]">
            <b className="font-semibold text-[var(--surface-800)]">{k.conta.nome}</b>
            {!k.banco ? <span className="text-[var(--surface-500)]">{k.conferidoAte ? `conferido até ${fmtData(k.conferidoAte)}` : '• nunca conferido'}</span>
              : bate ? <span className="text-emerald-500">✓ banco {fmtData(k.banco.data)}</span>
              : <span className="text-amber-500">• diferença de {fmtBRL(Math.abs(dif!))}</span>}
          </button>
        )
      })}
      {onContasFaturas && <button onClick={onContasFaturas} className={link}>Contas e Faturas ›</button>}
    </div>
  )

  return (
    <div className="space-y-4 max-w-[1200px]">
      {carregando && <Loader2 className="h-4 w-4 animate-spin text-[var(--surface-400)]" />}

      {/* HOJE — só no mês corrente: tenho dinheiro pra pagar o que vence? */}
      {emCurso && (
        <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr_1fr] gap-3">
          <div className="card p-4">
            <span className="block text-xs text-[var(--surface-500)]">Disponível agora pra pagar</span>
            <span className="text-mono text-2xl tabular-nums text-[var(--surface-900)]">{saldos ? fmtBRL(saldos.disponivel) : '…'}</span>
            {saldos && saldos.guardado > 0.005 && <span className="block text-xs text-[var(--surface-500)]">guardado: {fmtBRL(saldos.guardado)} (fora do disponível)</span>}
            {onContasFaturas && <button onClick={onContasFaturas} className={`${link} mt-1.5 block`}>Contas e Faturas ›</button>}
          </div>
          <div className="card p-4">
            <span className="block text-xs text-[var(--surface-500)]">Vence até domingo</span>
            <span className={`text-mono text-xl tabular-nums ${semana.length ? 'text-amber-500' : 'text-[var(--surface-900)]'}`}>{fmtBRL(semana.reduce((a, x) => a + x.valor, 0))}</span>
            <span className="block text-xs text-[var(--surface-500)]">{semana.length ? `${semana.length} conta${semana.length === 1 ? '' : 's'} · a primeira ${curto(semana[0].venc.data)}` : 'nada até domingo'}</span>
          </div>
          <div className="card p-4" style={atrasadas.length ? { boxShadow: 'inset 0 0 0 1px rgba(239,68,68,.5)' } : undefined}>
            <span className="block text-xs text-[var(--surface-500)]">Atrasado</span>
            <span className={`text-mono text-xl tabular-nums ${atrasadas.length ? 'text-red-400' : 'text-emerald-500'}`}>{atrasadas.length ? fmtBRL(atrasadas.reduce((a, x) => a + x.valor, 0)) : '✓ nada'}</span>
            <span className="block text-xs text-[var(--surface-500)]">{atrasadas.length ? atrasadas.map(x => x.conta.nome.split(' · ')[0]).join(', ') : 'nenhuma conta passou da data'}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.65fr_1fr] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          {emCurso && saldos && verCaixa && (
            <ProximosDias sb={supabase} uid={currentUnit?.id} disponivel={saldos.disponivel} doMes={fixas.doMes} atrasadas={atrasadas} celular={celular} />
          )}
          {blocoMes}
        </div>
        <div className="space-y-4 min-w-0">
          <ContasDoMesWidget itens={itensMes} pronto={fixas.pronto} temContas={fixas.contas.length > 0} podeLancar={podeLancar}
            onPaguei={pagar} onVerCalendario={() => setCalendarioAberto(true)} onNova={() => setContaEditando('nova')} />
          {blocoPrecisa}
        </div>
      </div>

      {blocoBanco}

      <CalendarioContasModal aberto={calendarioAberto} onClose={() => setCalendarioAberto(false)} mesInicial={mes}
        doMes={fixas.doMes} podeLancar={podeLancar}
        onPaguei={x => { setCalendarioAberto(false); pagar(x) }}
        onEditar={c => setContaEditando(c)} onNova={() => setContaEditando('nova')} />
      <ContaFixaModal aberto={contaEditando !== null} conta={contaEditando === 'nova' ? null : contaEditando}
        onClose={() => setContaEditando(null)} onSalvou={() => void fixas.carregar()} />

      <ExtratoContaModal
        conta={extratoDe ? { conta_id: extratoDe.id, nome: extratoDe.nome, tipo: extratoDe.tipo, caixa_desde: extratoDe.caixa_desde } : null}
        mesInicial={mes}
        onClose={() => setExtratoDe(null)}
      />
    </div>
  )
}
