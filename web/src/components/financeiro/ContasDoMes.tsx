'use client'

// CONTAS DO MÊS — o calendário de contas da Visão do mês (mig 160, 10/10/2026;
// desenho fechado na bancada: docs/bancada_financeiro).
//
//   · useContasFixas  — carrega as contas fixas, quais já foram pagas e o valor
//                       do repasse em aberto. Usado pelo widget, pelo calendário
//                       e pelo "Ainda neste mês" (ProximosDias).
//   · ContasDoMesWidget — o bloco compacto: barra pago/total, as próximas (vencidas
//                       → hoje → adiante) com o Paguei, "Ver calendário".
//   · CalendarioContasModal — o mês em grade: data riscada quando cai em fim de
//                       semana/feriado e a conta no dia em que paga de verdade.
//
// PAGA = existe despesa com conta_fixa_id e competência no mês do vencimento.
// Repasse (repasse=true): paga se houve pagamento de repasse (fin_movimentos com
// repasse_id) no mês; o valor é o que falta do(s) repasse(s) em aberto.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { vencimentoNoMes, porQueNaoUtil, nomeFeriado, descreverRegra, diaUtil, type Vencimento } from '@/lib/vencimentos'
import type { ContaFixa } from './ContaFixaModal'

export type Situacao = 'pago' | 'atrasada' | 'urgente' | 'aberta'
export type ContaNoMes = { conta: ContaFixa; venc: Vencimento; situacao: Situacao; valor: number; pago: { valor: number; data: string } | null }

const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const curto = (s: string) => `${SEM[new Date(`${s}T00:00:00Z`).getUTCDay()]} ${s.slice(8, 10)}/${s.slice(5, 7)}`
const num = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const c2 = (n: number) => Math.round(n * 100) / 100
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const mesMais = (ano: number, mes0: number, k: number) => ({ ano: ano + Math.floor((mes0 + k) / 12), mes0: ((mes0 + k) % 12 + 12) % 12 })

/** Contas fixas + o que foi pago (−2 a +2 meses) + o repasse em aberto. */
export function useContasFixas(sb: SupabaseClient, uid: string | undefined) {
  const [contas, setContas] = useState<ContaFixa[]>([])
  const [pagos, setPagos] = useState<Map<string, { valor: number; data: string }>>(new Map())
  const [repasseAberto, setRepasseAberto] = useState(0)
  const [pronto, setPronto] = useState(false)

  const carregar = useCallback(async () => {
    if (!uid) return
    const hoje = hojeLocal()
    const ini = (() => { const x = mesMais(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 1, -3); return `${x.ano}-${String(x.mes0 + 1).padStart(2, '0')}-01` })()
    const { data: cf, error } = await sb.from('fin_contas_fixas').select('*').eq('unidade_id', uid).eq('ativo', true).order('nome')
    if (error) { setContas([]); setPronto(true); return }   // sem a mig 160: o bloco mostra o convite
    const lista = (cf as ContaFixa[] | null) || []
    const ids = lista.map(c => c.id)
    const mapa = new Map<string, { valor: number; data: string }>()
    if (ids.length) {
      const { data: ls } = await sb.from('fin_lancamentos').select('conta_fixa_id, valor, data_competencia, data_caixa')
        .in('conta_fixa_id', ids).neq('status', 'rejeitado').gte('data_competencia', ini)
      for (const l of (ls as { conta_fixa_id: string; valor: number; data_competencia: string; data_caixa: string | null }[] | null) || []) {
        const k = `${l.conta_fixa_id}|${l.data_competencia.slice(0, 7)}`
        const atual = mapa.get(k)
        mapa.set(k, { valor: c2((atual?.valor || 0) + Number(l.valor)), data: (l.data_caixa || l.data_competencia).slice(0, 10) })
      }
    }
    // Repasse: pagamento (inteiro ou parte) num mês = a conta do repasse daquele mês está paga.
    const rep = lista.find(c => c.repasse)
    let aberto = 0
    if (rep) {
      const [{ data: mv }, { data: rt }] = await Promise.all([
        sb.from('fin_movimentos').select('valor, data, repasse_id').not('repasse_id', 'is', null).gte('data', ini).eq('unidade_id', uid),
        sb.from('vw_repasse_totais').select('repasse_id, total_a_pagar, status').eq('unidade_id', uid).neq('status', 'pago').neq('status', 'cancelado'),
      ])
      for (const m of (mv as { valor: number; data: string }[] | null) || []) {
        const k = `${rep.id}|${m.data.slice(0, 7)}`
        const atual = mapa.get(k)
        mapa.set(k, { valor: c2((atual?.valor || 0) + Number(m.valor)), data: m.data.slice(0, 10) })
      }
      const abertos = (rt as { repasse_id: string; total_a_pagar: number }[] | null) || []
      if (abertos.length) {
        const { data: pp } = await sb.from('fin_movimentos').select('repasse_id, valor').in('repasse_id', abertos.map(r => r.repasse_id))
        const jaPago = ((pp as { valor: number }[] | null) || []).reduce((a, p) => a + Number(p.valor), 0)
        aberto = c2(abertos.reduce((a, r) => a + Number(r.total_a_pagar), 0) - jaPago)
      }
    }
    setContas(lista); setPagos(mapa); setRepasseAberto(Math.max(0, aberto)); setPronto(true)
  }, [sb, uid])

  useEffect(() => { const t = setTimeout(() => { void carregar() }, 0); return () => clearTimeout(t) }, [carregar])

  /** As contas de um mês, com o vencimento de verdade e a situação. */
  const doMes = useCallback((ano: number, mes0: number): ContaNoMes[] => {
    const hoje = hojeLocal()
    const chaveMes = `${ano}-${String(mes0 + 1).padStart(2, '0')}`
    return contas.map(conta => {
      const venc = vencimentoNoMes(conta, ano, mes0)
      if (!venc) return null
      const pago = pagos.get(`${conta.id}|${chaveMes}`) || null
      const valor = conta.repasse ? (pago ? pago.valor : repasseAberto) : Number(conta.valor) || 0
      // Repasse sem nada em aberto e sem pagamento no mês: não há o que pagar.
      if (conta.repasse && !pago && repasseAberto <= 0) return null
      const dias = Math.round((Date.parse(venc.data) - Date.parse(hoje)) / 864e5)
      const situacao: Situacao = pago ? 'pago' : venc.data < hoje ? 'atrasada' : dias <= 3 ? 'urgente' : 'aberta'
      return { conta, venc, situacao, valor, pago }
    }).filter((x): x is ContaNoMes => !!x).sort((a, b) => a.venc.data.localeCompare(b.venc.data))
  }, [contas, pagos, repasseAberto])

  return { contas, pronto, doMes, repasseAberto, carregar }
}

const COR: Record<Situacao, string> = { pago: 'text-emerald-500', atrasada: 'text-red-400', urgente: 'text-amber-500', aberta: 'text-[var(--surface-700)]' }

/** O bloco compacto da Visão do mês. */
export function ContasDoMesWidget({ itens, pronto, temContas, podeLancar, onPaguei, onVerCalendario, onNova }: {
  itens: ContaNoMes[]; pronto: boolean; temContas: boolean; podeLancar: boolean
  onPaguei: (x: ContaNoMes) => void; onVerCalendario: () => void; onNova: () => void
}) {
  const total = itens.reduce((a, x) => a + x.valor, 0)
  const pagas = itens.filter(x => x.situacao === 'pago')
  const pagoV = pagas.reduce((a, x) => a + (x.pago?.valor || 0), 0)
  const abertas = itens.filter(x => x.situacao !== 'pago')
  const hoje = hojeLocal()
  return (
    <div className="card p-4 flex flex-col">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-semibold tracking-[.14em] uppercase text-[var(--surface-500)]">Contas do mês</span>
        {temContas && <button onClick={onVerCalendario} className="ml-auto text-[13px] text-[var(--brand-500)] hover:underline">Calendário de contas ›</button>}
      </div>
      {!pronto ? <p className="text-sm text-[var(--surface-500)] py-3">carregando…</p> : !temContas ? (
        <div className="py-3 space-y-2">
          <p className="text-sm text-[var(--surface-600)]">Cadastre as contas que se repetem — aluguel, água, DAS, salário — e elas aparecem aqui no dia em que vencem de verdade, já contando fim de semana e feriado.</p>
          {podeLancar && <button onClick={onNova} className="btn-primary text-sm">+ Adicionar conta recorrente</button>}
        </div>
      ) : (<>
        <div className="mt-2.5 h-2 rounded-full bg-[var(--surface-100)] overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${total ? Math.min(100, (pagoV / total) * 100) : 0}%` }} /></div>
        <p className="text-xs text-[var(--surface-500)] mt-1">{pagas.length} de {itens.length} contas pagas · R$ {num(pagoV)} de R$ {num(total)}</p>
        {abertas.slice(0, 5).map(x => (
          <div key={x.conta.id} className="grid grid-cols-[80px_1fr_auto_auto] gap-2 items-center py-2 border-b border-[var(--surface-100)]">
            <span className={`text-xs font-semibold ${COR[x.situacao]}`}>
              {x.venc.data === hoje ? 'Hoje ·' : x.situacao === 'atrasada' ? `${x.venc.data.slice(8, 10)}/${x.venc.data.slice(5, 7)} ⚠` : curto(x.venc.data)}
            </span>
            <span className="flex flex-col min-w-0">
              <span className="text-[13.5px] text-[var(--surface-800)] truncate">{x.conta.nome}</span>
              {x.venc.riscados.length > 0 && <span className="text-[11px] text-[var(--surface-500)]"><s>{curto(x.venc.original)}</s> → {curto(x.venc.data)}</span>}
            </span>
            <span className="text-mono text-[13px] tabular-nums text-[var(--surface-800)]">{x.conta.valor_varia && !x.conta.repasse ? '~' : ''}{num(x.valor)}</span>
            {podeLancar ? (
              <button onClick={() => onPaguei(x)} className="text-[13px] font-semibold px-2.5 py-1 rounded-[10px] border border-[var(--brand-500)]/60 text-[var(--brand-500)] hover:bg-[var(--brand-500)] hover:text-white">
                {x.conta.repasse ? 'Pagar' : 'Lançar'}
              </button>
            ) : <span />}
          </div>
        ))}
        {!abertas.length && <p className="text-sm text-emerald-500 py-2.5">✓ Tudo pago neste mês</p>}
        {abertas.length > 5 && <button onClick={onVerCalendario} className="text-[13px] text-[var(--brand-500)] hover:underline mt-2 text-left">+ {abertas.length - 5} no calendário</button>}
        {podeLancar && <button onClick={onNova} className="text-[13px] text-[var(--brand-500)] hover:underline mt-2 text-left">+ Adicionar conta recorrente</button>}
      </>)}
    </div>
  )
}

/** O mês em grade (domingo → sábado). */
export function CalendarioContasModal({ aberto, onClose, mesInicial, doMes, podeLancar, onPaguei, onEditar, onNova }: {
  aberto: boolean; onClose: () => void; mesInicial: string
  doMes: (ano: number, mes0: number) => ContaNoMes[]; podeLancar: boolean
  onPaguei: (x: ContaNoMes) => void; onEditar: (c: ContaFixa) => void; onNova: () => void
}) {
  const [ref, setRef] = useState(mesInicial)
  const [aberturaDe, setAberturaDe] = useState<string | null>(null)
  if (aberto && aberturaDe !== mesInicial) { setAberturaDe(mesInicial); setRef(mesInicial) }
  if (!aberto && aberturaDe !== null) setAberturaDe(null)
  const ano = Number(ref.slice(0, 4)), mes0 = Number(ref.slice(5, 7)) - 1
  const itens = useMemo(() => doMes(ano, mes0), [doMes, ano, mes0])
  const hoje = hojeLocal()
  const porDia = new Map<string, ContaNoMes[]>()
  const riscadoEm = new Map<string, ContaNoMes[]>()
  for (const x of itens) {
    porDia.set(x.venc.data, [...(porDia.get(x.venc.data) || []), x])
    for (const r of x.venc.riscados) riscadoEm.set(r, [...(riscadoEm.get(r) || []), x])
  }
  const primeiro = new Date(Date.UTC(ano, mes0, 1)).getUTCDay()
  const total = new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate()
  const andar = (k: number) => { const x = mesMais(ano, mes0, k); setRef(`${x.ano}-${String(x.mes0 + 1).padStart(2, '0')}`) }
  const celulas: React.ReactNode[] = []
  for (let i = 0; i < primeiro; i++) celulas.push(<div key={`v${i}`} />)
  for (let d = 1; d <= total; d++) {
    const s = `${ref}-${String(d).padStart(2, '0')}`
    const util = diaUtil(s)
    const fer = nomeFeriado(s)
    const riscos = riscadoEm.get(s) || []
    celulas.push(
      <div key={s} className={`min-h-[96px] rounded-[10px] p-1.5 flex flex-col gap-1 min-w-0 border border-[var(--surface-200)] ${util ? 'bg-[var(--surface-0)]' : 'bg-[var(--surface-100)]/50'}`}
           style={s === hoje ? { boxShadow: 'inset 0 0 0 2px var(--brand-500)' } : undefined}>
        <span className={`text-xs font-semibold ${s === hoje ? 'text-[var(--brand-500)]' : util ? 'text-[var(--surface-600)]' : 'text-[var(--surface-400)]'}`}>{d}{s === hoje ? ' · hoje' : ''}</span>
        {fer && <span className="text-[10.5px] text-pink-400 truncate">feriado · {fer}</span>}
        {riscos.length > 0 && (<>
          <span className="text-[10.5px] line-through text-[var(--surface-400)] truncate">{riscos.map(r => r.conta.nome.split(' · ')[0]).join(' · ')}</span>
          <span className="text-[10.5px] text-[var(--surface-500)] truncate">{porQueNaoUtil(s)} — {riscos[0].venc.data > s ? 'vão pra' : 'vêm de'} {curto(riscos[0].venc.data)}</span>
        </>)}
        {(porDia.get(s) || []).map(x => (
          <button key={x.conta.id} onClick={() => (x.situacao !== 'pago' && podeLancar ? onPaguei(x) : onEditar(x.conta))}
                  title={`${x.conta.nome} · ${descreverRegra(x.conta)}${x.situacao !== 'pago' ? ' — clique pra pagar' : ''}`}
                  className={`flex justify-between gap-1 text-[10.5px] px-1.5 py-0.5 rounded-md text-left min-w-0 ${x.situacao === 'pago' ? 'bg-emerald-500/15 text-emerald-500' : x.situacao === 'atrasada' ? 'bg-red-500/15 text-red-400' : 'bg-[var(--brand-500)]/15 text-[var(--surface-800)]'}`}>
            <span className="truncate">{x.situacao === 'pago' ? '✓ ' : ''}{x.conta.nome}</span>
            <span className="text-mono shrink-0">{num(x.pago?.valor ?? x.valor).replace(/,00$/, '')}</span>
          </button>
        ))}
      </div>,
    )
  }
  return (
    <Modal isOpen={aberto} onClose={onClose} title="Calendário de contas" size="wide">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={() => andar(-1)} className="h-8 w-8 rounded-full border border-[var(--surface-300)] flex items-center justify-center" aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-lg font-bold capitalize text-[var(--surface-900)]">{MESES[mes0]} de {ano}</span>
          <button onClick={() => andar(1)} className="h-8 w-8 rounded-full border border-[var(--surface-300)] flex items-center justify-center" aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></button>
          {podeLancar && <button onClick={onNova} className="btn-secondary text-sm ml-auto">+ Adicionar conta recorrente</button>}
        </div>
        <div className="grid grid-cols-7 gap-1.5 text-[11px] uppercase tracking-wider text-[var(--surface-400)] px-1">{SEM.map(s => <span key={s}>{s}</span>)}</div>
        <div className="grid grid-cols-7 gap-1.5">{celulas}</div>
        <p className="text-xs text-[var(--surface-500)]">Clique numa conta em aberto para pagar; numa paga, para editar a conta fixa. Fim de semana e feriado nacional riscam o dia e levam a conta pro dia útil.</p>
      </div>
    </Modal>
  )
}
