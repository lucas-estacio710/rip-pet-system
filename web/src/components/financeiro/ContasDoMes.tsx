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
// PAGA = existe despesa com conta_fixa_id e competência no mês do vencimento — ou,
// sem o vínculo, uma despesa da MESMA categoria no mês, quando só essa conta fixa
// usa a categoria (11/10/2026: a água de setembro lançada antes da conta existir
// aparecia "atrasada"). Antes do mês em que a conta foi cadastrada, ela só aparece
// se estiver paga: não se cobra atraso de um mês em que o calendário não existia.
// Repasse (repasse=true): paga se houve pagamento de repasse (fin_movimentos com
// repasse_id) no mês; o valor é o que falta do(s) repasse(s) em aberto.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useUnit } from '@/contexts/UnitContext'
import { vencimentoNoMes, porQueNaoUtil, nomeFeriado, descreverRegra, diaUtil, type Vencimento } from '@/lib/vencimentos'
import type { ContaFixa } from './ContaFixaModal'

export type Situacao = 'pago' | 'atrasada' | 'urgente' | 'aberta'
/** Um pagamento (lançamento ou movimento) que quita a conta — pra conferir com o banco. */
export type PagItem = { id: string; origem: 'lancamento' | 'movimento'; conta: string | null; data: string; valor: number; conciliado: boolean }
export type ContaNoMes = { conta: ContaFixa; venc: Vencimento; situacao: Situacao; valor: number; pago: { valor: number; data: string; conciliado: boolean; antes: boolean; itens?: PagItem[] } | null }

const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const curto = (s: string) => `${SEM[new Date(`${s}T00:00:00Z`).getUTCDay()]} ${s.slice(8, 10)}/${s.slice(5, 7)}`
const num = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const c2 = (n: number) => Math.round(n * 100) / 100
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const mesMais = (ano: number, mes0: number, k: number) => ({ ano: ano + Math.floor((mes0 + k) / 12), mes0: ((mes0 + k) % 12 + 12) % 12 })

/** O REPASSE no calendário (Lucas, 14/10/2026): não se cadastra. A REGRA é pagar
 *  1 mês depois — o calendário de cada mês traz o repasse do MÊS ANTERIOR, vencendo no
 *  dia 20 (dia útil seguinte). O que ficou pra trás sem pagar continua aparecendo no
 *  mês corrente, atrasado. Mês sem repasse salvo pela Matriz aparece como prévia.
 *  Só entra pra unidade que tem repasse (a Matriz e a PI não têm). */
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const abrevMes = (ref: string) => `${MESES_ABREV[Number(ref.slice(5, 7)) - 1]}/${ref.slice(2, 4)}`
const contaRepasse = (uid: string, ref: string, previa: boolean): ContaFixa => ({
  id: `repasse-${ref}`, unidade_id: uid, nome: `Repasse de ${abrevMes(ref)}${previa ? ' · prévia' : ''}`, fornecedor_nome: 'Matriz', categoria_id: null,
  valor: 0, valor_varia: true, regra: 'dia', dia: 20, ajuste: 'depois', conta_pagamento_id: null, repasse: true, ativo: true,
})
type RepMes = { id: string; status: string; total: number; pags: { id: string; data: string; valor: number; conciliado: boolean; antes: boolean; conta: string | null }[] }

/** Contas fixas + o que foi pago (12 meses pra trás — o calendário volta no tempo) + o repasse. */
export function useContasFixas(sb: SupabaseClient, uid: string | undefined, matriz = false, marco: string | null = null) {
  const [contas, setContas] = useState<ContaFixa[]>([])
  const [pagos, setPagos] = useState<Map<string, { valor: number; data: string; porCategoria?: boolean; ids?: string[]; conciliado?: boolean; antes?: boolean; itens?: PagItem[] }>>(new Map())
  const [repasseAberto, setRepasseAberto] = useState(0)
  // chave 'unidade|aaaa-mm' — na unidade o 1º pedaço é vazio (o repasse dela, a PAGAR);
  // na MATRIZ é o id de cada unidade (os repasses a RECEBER, 14/10/2026)
  const [repasses, setRepasses] = useState<Map<string, RepMes>>(new Map())
  const [nomeUnid, setNomeUnid] = useState<Map<string, string>>(new Map())
  const [pronto, setPronto] = useState(false)

  const carregar = useCallback(async () => {
    if (!uid) return
    const hoje = hojeLocal()
    const ini = (() => { const x = mesMais(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 1, -12); return `${x.ano}-${String(x.mes0 + 1).padStart(2, '0')}-01` })()
    const { data: cf, error } = await sb.from('fin_contas_fixas').select('*').eq('unidade_id', uid).eq('ativo', true).order('nome')
    if (error) { setContas([]); setPronto(true); return }   // sem a mig 160: o bloco mostra o convite
    const lista = (cf as ContaFixa[] | null) || []
    const ids = lista.map(c => c.id)
    const mapa = new Map<string, { valor: number; data: string; porCategoria?: boolean; ids?: string[]; conciliado?: boolean; antes?: boolean; itens?: PagItem[] }>()
    const deOnde = new Map<string, { conta: string | null; data: string; origem: 'lancamento' | 'movimento'; valor: number }>()   // id do pagamento → conta de saída, data, origem e valor
    if (ids.length) {
      const { data: ls } = await sb.from('fin_lancamentos').select('id, conta_fixa_id, valor, data_competencia, data_caixa, conta_pagamento_id')
        .in('conta_fixa_id', ids).neq('status', 'rejeitado').gte('data_competencia', ini)
      for (const l of (ls as { id: string; conta_fixa_id: string; valor: number; data_competencia: string; data_caixa: string | null; conta_pagamento_id: string | null }[] | null) || []) {
        deOnde.set(l.id, { conta: l.conta_pagamento_id, data: (l.data_caixa || l.data_competencia).slice(0, 10), origem: 'lancamento', valor: Number(l.valor) })
        const k = `${l.conta_fixa_id}|${l.data_competencia.slice(0, 7)}`
        const atual = mapa.get(k)
        mapa.set(k, { valor: c2((atual?.valor || 0) + Number(l.valor)), data: (l.data_caixa || l.data_competencia).slice(0, 10), ids: [...(atual?.ids || []), l.id] })
      }
      // Sem vínculo (lançada antes da conta fixa, ou pelo + Lançar): vale a
      // CATEGORIA. Com duas contas na mesma categoria (Salário e Adiantamento,
      // 14/10/2026), desempata pelo VALOR — a de valor mais perto, até 15% de folga;
      // fora disso, não chuta.
      const porCat = new Map<string, ContaFixa[]>()
      for (const c of lista) if (c.categoria_id && !c.repasse) porCat.set(c.categoria_id, [...(porCat.get(c.categoria_id) || []), c])
      const donoDe = (cat: string, valor: number): string | null => {
        const cs = porCat.get(cat) || []
        if (cs.length === 1) return cs[0].id
        let melhor: { id: string; dif: number } | null = null
        for (const c of cs) {
          const ref = Number(c.valor) || 0
          if (!ref) continue
          const dif = Math.abs(valor - ref) / ref
          if (dif <= 0.15 && (!melhor || dif < melhor.dif)) melhor = { id: c.id, dif }
        }
        return melhor?.id || null
      }
      if (porCat.size) {
        const { data: lc } = await sb.from('fin_lancamentos').select('id, categoria_id, valor, data_competencia, data_caixa, conta_pagamento_id')
          .in('categoria_id', [...porCat.keys()]).eq('unidade_id', uid).is('conta_fixa_id', null).neq('status', 'rejeitado').gte('data_competencia', ini)
        for (const l of (lc as { id: string; categoria_id: string; valor: number; data_competencia: string; data_caixa: string | null; conta_pagamento_id: string | null }[] | null) || []) {
          const dono = donoDe(l.categoria_id, Number(l.valor))
          if (!dono) continue
          deOnde.set(l.id, { conta: l.conta_pagamento_id, data: (l.data_caixa || l.data_competencia).slice(0, 10), origem: 'lancamento', valor: Number(l.valor) })
          const k = `${dono}|${l.data_competencia.slice(0, 7)}`
          if (mapa.has(k) && !mapa.get(k)!.porCategoria) continue   // o vínculo explícito manda
          const atual = mapa.get(k)
          mapa.set(k, { valor: c2((atual?.valor || 0) + Number(l.valor)), data: (l.data_caixa || l.data_competencia).slice(0, 10), porCategoria: true, ids: [...(atual?.ids || []), l.id] })
        }
      }
    }
    // Repasse: os salvos pela Matriz, o total de cada um e os pagamentos (mig 159: em partes).
    const repBase = new Map<string, { id: string; status: string; total: number }>()
    const pagsRep = new Map<string, { id: string; data: string; valor: number }[]>()
    {
      const q = sb.from('vw_repasse_totais').select('repasse_id, unidade_id, mes_referencia, status, total_a_pagar').neq('status', 'cancelado')
      const { data: rt } = await (matriz ? q.neq('unidade_id', uid) : q.eq('unidade_id', uid))
      for (const r of (rt as { repasse_id: string; unidade_id: string; mes_referencia: string; status: string; total_a_pagar: number }[] | null) || [])
        repBase.set(`${matriz ? r.unidade_id : ''}|${r.mes_referencia.slice(0, 7)}`, { id: r.repasse_id, status: r.status, total: Number(r.total_a_pagar) || 0 })
      if (matriz) {
        const { data: us } = await sb.from('unidades').select('id, codigo')
        setNomeUnid(new Map(((us as { id: string; codigo: string }[] | null) || []).map(u => [u.id, u.codigo])))
      }
      const ids = [...repBase.values()].map(r => r.id)
      if (ids.length) {
        const { data: mv } = await sb.from('fin_movimentos').select('id, valor, data, repasse_id, conta_id').in('repasse_id', ids)
        for (const m of (mv as { id: string; valor: number; data: string; repasse_id: string; conta_id: string | null }[] | null) || []) {
          deOnde.set(m.id, { conta: m.conta_id, data: m.data.slice(0, 10), origem: 'movimento', valor: Number(m.valor) })
          pagsRep.set(m.repasse_id, [...(pagsRep.get(m.repasse_id) || []), { id: m.id, data: m.data.slice(0, 10), valor: Number(m.valor) }])
        }
      }
    }
    let aberto = 0
    for (const r of repBase.values()) if (r.status !== 'pago') aberto += r.total - (pagsRep.get(r.id) || []).reduce((a, p) => a + p.valor, 0)
    // CONCILIADO (14/10/2026): o pagamento bateu com uma linha do banco/fatura no
    // Importar extrato (fin_conciliacoes). Sem isso, é PRÉ-LANÇAMENTO — o que se
    // lançou à mão pra não perder o controle, ainda sem a prova do extrato.
    const todos = [...[...mapa.values()].flatMap(v => v.ids || []), ...[...pagsRep.values()].flat().map(p => p.id)]
    const ok = new Set<string>()
    const inicio = new Map<string, string>()
    if (todos.length) {
      for (let i = 0; i < todos.length; i += 200) {
        const { data: cc } = await sb.from('fin_conciliacoes').select('origem_id').in('origem', ['lancamento', 'movimento']).in('origem_id', todos.slice(i, i + 200))
        for (const c of (cc as { origem_id: string }[] | null) || []) ok.add(c.origem_id)
      }
      for (const v of mapa.values()) v.conciliado = !!v.ids?.length && v.ids.some(id => ok.has(id))
      // ANTES DA CONCILIAÇÃO (14/10/2026): pagamento de antes da 1ª linha conciliada
      // daquela conta não tem como ser conciliado (o Importar não guardava a batida
      // até a mig 153). Não é pré-lançamento esquecido — conta como pago, verde.
      const contasPag = [...new Set([...deOnde.values()].map(x => x.conta).filter((x): x is string => !!x))]
      await Promise.all(contasPag.map(async c => {
        const { data: pr } = await sb.from('fin_conciliacoes').select('data_banco').eq('conta_id', c).order('data_banco').limit(1)
        const d = (pr as { data_banco: string }[] | null)?.[0]?.data_banco
        inicio.set(c, d ? d.slice(0, 10) : '9999-12-31')   // conta que nunca conciliou: tudo é "antes"
      }))
      for (const v of mapa.values()) {
        if (v.conciliado || !v.ids?.length) continue
        v.antes = v.ids.every(id => { const o = deOnde.get(id); return !!o?.conta && o.data < (inicio.get(o.conta) || '') })
        if (v.antes) v.conciliado = true
      }
    }
    const antesDe = (id: string) => { const o = deOnde.get(id); return !!o?.conta && o.data < (inicio.get(o.conta) || '') }
    const rep = new Map<string, RepMes>()
    for (const [chave, r] of repBase) rep.set(chave, { ...r, pags: (pagsRep.get(r.id) || []).map(p => ({ ...p, conta: deOnde.get(p.id)?.conta || null, conciliado: ok.has(p.id) || antesDe(p.id), antes: !ok.has(p.id) && antesDe(p.id) })) })
    for (const v of mapa.values()) v.itens = (v.ids || []).map(id => { const o = deOnde.get(id)!; return { id, origem: o.origem, conta: o.conta, data: o.data, valor: o.valor, conciliado: ok.has(id) || antesDe(id) } })
    setContas(lista); setPagos(mapa); setRepasses(rep); setRepasseAberto(Math.max(0, c2(aberto))); setPronto(true)
  }, [sb, uid, matriz])

  useEffect(() => { const t = setTimeout(() => { void carregar() }, 0); return () => clearTimeout(t) }, [carregar])

  /** As contas de um mês, com o vencimento de verdade e a situação. */
  const doMes = useCallback((ano: number, mes0: number): ContaNoMes[] => {
    const hoje = hojeLocal()
    const chaveMes = `${ano}-${String(mes0 + 1).padStart(2, '0')}`
    const sit = (venc: Vencimento, pago: ContaNoMes['pago']): Situacao => {
      const dias = Math.round((Date.parse(venc.data) - Date.parse(hoje)) / 864e5)
      return pago ? 'pago' : venc.data < hoje ? 'atrasada' : dias <= 3 ? 'urgente' : 'aberta'
    }
    const itens: ContaNoMes[] = []
    for (const conta of contas) {
      if (conta.repasse) continue   // o repasse vem da regra abaixo, não de cadastro
      const venc = vencimentoNoMes(conta, ano, mes0)
      if (!venc) continue
      const pg = pagos.get(`${conta.id}|${chaveMes}`)
      const pago = pg ? { valor: pg.valor, data: pg.data, conciliado: !!pg.conciliado, antes: !!pg.antes, itens: pg.itens } : null
      // antes do mês do cadastro, só aparece se estiver paga
      if (!pago && conta.created_at && chaveMes < conta.created_at.slice(0, 7)) continue
      itens.push({ conta, venc, situacao: sit(venc, pago), valor: Number(conta.valor) || 0, pago })
    }
    // REPASSE: o do mês anterior vence neste; no mês corrente, os de antes que
    // ficaram sem pagar vêm junto (atrasados, com o vencimento original).
    if (repasses.size && uid) {
      const ref = (k: number) => { const x = mesMais(ano, mes0, k); return `${x.ano}-${String(x.mes0 + 1).padStart(2, '0')}` }
      const proximo = (r: string) => { const x = mesMais(Number(r.slice(0, 4)), Number(r.slice(5, 7)) - 1, 1); return `${x.ano}-${String(x.mes0 + 1).padStart(2, '0')}` }
      const doRef = (u: string, r: string): ContaNoMes | null => {
        const rp = repasses.get(`${u}|${r}`)
        if (matriz && !rp) return null   // na Matriz só o que já foi salvo (sem prévia)
        const [a, m] = [Number(r.slice(0, 4)), Number(r.slice(5, 7)) - 1]
        const vx = mesMais(a, m, 1)
        const base = contaRepasse(uid, r, !rp)
        // na Matriz é A RECEBER de uma unidade: id 'receber-…' (sem botão de pagar)
        const conta = matriz ? { ...base, id: `receber-${u}-${r}`, nome: `Repasse ${nomeUnid.get(u) || ''} · ${abrevMes(r)}`, fornecedor_nome: nomeUnid.get(u) || null } : base
        const venc = vencimentoNoMes(conta, vx.ano, vx.mes0)
        if (!venc) return null
        const pagoV = c2((rp?.pags || []).reduce((s2, p) => s2 + p.valor, 0))
        const quitado = !!rp && (rp.status === 'pago' || (rp.pags.length > 0 && pagoV >= rp.total - 0.005))
        const ult = rp?.pags.length ? rp.pags.reduce((x, p) => (p.data > x ? p.data : x), rp.pags[0].data) : venc.data
        const pago = quitado ? { valor: pagoV || rp!.total, data: ult, conciliado: rp!.pags.every(p => p.conciliado), antes: rp!.pags.length > 0 && rp!.pags.every(p => p.antes),
          itens: rp!.pags.map(p => ({ id: p.id, origem: 'movimento' as const, conta: p.conta, data: p.data, valor: p.valor, conciliado: p.conciliado })) } : null
        return { conta, venc, situacao: sit(venc, pago), valor: pago ? pago.valor : c2((rp?.total || 0) - pagoV), pago }
      }
      const doMesAtual = ref(-1)
      // uma "esteira" de repasse por unidade (na unidade, só a dela: chave '')
      const porUnid = new Map<string, string[]>()
      for (const k of repasses.keys()) { const [u, r] = k.split('|'); porUnid.set(u, [...(porUnid.get(u) || []), r]) }
      for (const [u, refs] of porUnid) {
        const primeiro = refs.sort()[0]
        if (primeiro && doMesAtual >= primeiro) { const it = doRef(u, doMesAtual); if (it) itens.push(it) }
        if (chaveMes === hoje.slice(0, 7) && primeiro) {
          for (let r = primeiro; r < doMesAtual; r = proximo(r)) {
            if (marco && proximo(r) < marco) continue   // venceu antes do marco zero (mig 167)
            const it = doRef(u, r)
            if (it && !it.pago) itens.push(it)
          }
        }
      }
    }
    return itens.sort((a, b) => a.venc.data.localeCompare(b.venc.data))
  }, [contas, pagos, repasses, uid, matriz, nomeUnid, marco])

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
                {x.conta.repasse ? 'Quitar' : 'Lançar'}
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

/** As 4 cores do calendário do Hoje (Lucas, 14/10/2026):
 *  verde = paga e conciliada com o banco/fatura · amarelo = pré-lançamento (paga à mão,
 *  sem conciliar) · vermelho = venceu sem lançamento nenhum · roxo = ainda vai vencer. */
export type CorConta = 'verde' | 'amarelo' | 'vermelho' | 'roxo'
export const corDaConta = (x: ContaNoMes, hoje: string): CorConta =>
  x.pago ? (x.pago.conciliado ? 'verde' : 'amarelo') : x.venc.data < hoje ? 'vermelho' : 'roxo'
const BOLA: Record<CorConta, string> = { verde: 'bg-emerald-500', amarelo: 'bg-amber-400', vermelho: 'bg-red-500', roxo: 'bg-violet-500' }
const ROTULO: Record<CorConta, string> = { verde: 'conciliada com o banco', amarelo: 'pré-lançamento — falta conciliar', vermelho: 'atrasada — sem lançamento', roxo: 'a vencer' }
const TXT: Record<CorConta, string> = { verde: 'text-emerald-500', amarelo: 'text-amber-500', vermelho: 'text-red-400', roxo: 'text-violet-400' }

/** O calendário do mês no bloco Hoje: o dia de hoje em azul, uma bolinha por conta. */
export function CalendarioHoje({ itens, ano, mes0, podeLancar, onPaguei, onGerenciar, sb, uid, onMudou }: {
  itens: ContaNoMes[]; ano: number; mes0: number; podeLancar: boolean; onPaguei: (x: ContaNoMes) => void
  onGerenciar?: () => void
  /** Pra ASSOCIAR depois (post-mortem): ligar à conta um lançamento que já existe. */
  sb?: SupabaseClient; uid?: string; onMudou?: () => void
}) {
  const [diaAberto, setDiaAberto] = useState<string | null>(null)
  // ASSOCIAR (14/10/2026): a conta ficou vermelha mas o pagamento já foi lançado,
  // sem o vínculo — lista os lançamentos do mês sem conta e liga com um clique.
  const [assocDe, setAssocDe] = useState<string | null>(null)
  const [cands, setCands] = useState<{ id: string; data: string; valor: number; texto: string; mesmaCat: boolean }[] | null>(null)
  const abrirAssoc = async (x: ContaNoMes) => {
    if (!sb || !uid) return
    setAssocDe(x.conta.id); setCands(null)
    const ini = `${x.venc.data.slice(0, 7)}-01`
    const fimD = new Date(Date.UTC(Number(ini.slice(0, 4)), Number(ini.slice(5, 7)), 0)).toISOString().slice(0, 10)
    const { data } = await sb.from('fin_lancamentos').select('id, valor, data_caixa, data_competencia, fornecedor_nome, observacoes, categoria_id')
      .eq('unidade_id', uid).is('conta_fixa_id', null).neq('status', 'rejeitado').gte('data_competencia', ini).lte('data_competencia', fimD).limit(300)
    const ref = Number(x.conta.valor) || 0
    const lista = ((data as { id: string; valor: number; data_caixa: string | null; data_competencia: string; fornecedor_nome: string | null; observacoes: string | null; categoria_id: string | null }[] | null) || [])
      .filter(l => Number(l.valor) > 0)
      .map(l => ({ id: l.id, data: (l.data_caixa || l.data_competencia).slice(0, 10), valor: Number(l.valor), texto: l.fornecedor_nome || l.observacoes || '—', mesmaCat: !!x.conta.categoria_id && l.categoria_id === x.conta.categoria_id }))
      .sort((a, b) => Number(b.mesmaCat) - Number(a.mesmaCat) || (ref ? Math.abs(a.valor - ref) - Math.abs(b.valor - ref) : a.data.localeCompare(b.data)))
    setCands(lista.slice(0, 8))
  }
  // CONFERI NO EXTRATO (amarelo, 14/10/2026): o pré-lançamento está no banco — grava a
  // conciliação à mão (como='escolhido'), igual à que o Lançar OFX grava.
  const { userName } = useUnit()
  const [conferindo, setConferindo] = useState<string | null>(null)
  const conferir = async (x: ContaNoMes) => {
    if (!sb || !x.pago?.itens) return
    const falta = x.pago.itens.filter(i => !i.conciliado && i.conta)
    if (!falta.length) return
    setConferindo(x.conta.id)
    const { error } = await sb.from('fin_conciliacoes').upsert(falta.map(i => ({
      conta_id: i.conta, origem: i.origem, origem_id: i.id, data_banco: i.data, valor_banco: -Math.abs(i.valor),
      texto_banco: 'conferido à mão no calendário', como: 'escolhido', criado_por_nome: userName || null,
    })), { onConflict: 'conta_id,origem,origem_id' })
    setConferindo(null)
    if (error) return
    setDiaAberto(null); onMudou?.()
  }
  const associar = async (contaId: string, lancId: string) => {
    if (!sb) return
    const { error } = await sb.from('fin_lancamentos').update({ conta_fixa_id: contaId }).eq('id', lancId)
    if (error) return
    setAssocDe(null); setCands(null); setDiaAberto(null); onMudou?.()
  }
  const hoje = hojeLocal()
  const ref = `${ano}-${String(mes0 + 1).padStart(2, '0')}`
  const porDia = new Map<string, ContaNoMes[]>()
  // atrasado que venceu num mês anterior (o repasse que ficou pra trás) cai no HOJE
  const ondeMostra = (x: ContaNoMes) => (x.venc.data < `${ref}-01` ? (hoje.slice(0, 7) === ref ? hoje : `${ref}-01`) : x.venc.data)
  for (const x of itens) porDia.set(ondeMostra(x), [...(porDia.get(ondeMostra(x)) || []), x])
  const primeiro = new Date(Date.UTC(ano, mes0, 1)).getUTCDay()
  const total = new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate()
  const cel: React.ReactNode[] = []
  for (let i = 0; i < primeiro; i++) cel.push(<span key={`v${i}`} />)
  for (let d = 1; d <= total; d++) {
    const s = `${ref}-${String(d).padStart(2, '0')}`
    const doDia = porDia.get(s) || []
    const ehHoje = s === hoje
    cel.push(
      <button key={s} onClick={() => setDiaAberto(s)}
              className={`aspect-square sm:aspect-auto sm:h-11 rounded-[9px] flex flex-col items-center justify-center gap-1 text-[13px] tabular-nums transition-colors ${ehHoje ? 'bg-blue-500/20 ring-2 ring-blue-500 text-blue-400 font-bold' : 'text-[var(--surface-700)] hover:bg-[var(--surface-100)]'} ${diaUtil(s) ? '' : 'opacity-60'}`}>
        <span>{d}</span>
        <span className="flex gap-0.5 h-1.5">
          {doDia.slice(0, 4).map(x => <span key={x.conta.id} className={`h-1.5 w-1.5 rounded-full ${BOLA[corDaConta(x, hoje)]}`} />)}
        </span>
      </button>,
    )
  }
  const doAberto = diaAberto ? porDia.get(diaAberto) || [] : []
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="text-sm text-[var(--surface-500)]">Contas de Acompanhamento</span>
        {onGerenciar && <button onClick={onGerenciar} className="ml-auto text-[13px] text-[var(--brand-500)] hover:underline">Gerenciar ›</button>}
      </div>
      <div className="grid grid-cols-7 gap-1 text-[10.5px] uppercase tracking-wider text-[var(--surface-400)] text-center">{SEM.map(s => <span key={s}>{s}</span>)}</div>
      <div className="grid grid-cols-7 gap-1">{cel}</div>
      <span className="flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--surface-500)]">
        {(['verde', 'amarelo', 'vermelho', 'roxo'] as CorConta[]).map(c => (
          <span key={c} className="inline-flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${BOLA[c]}`} />{{ verde: 'conciliada', amarelo: 'pré-lançada', vermelho: 'atrasada', roxo: 'a vencer' }[c]}</span>
        ))}
      </span>
      <Modal isOpen={diaAberto !== null} onClose={() => setDiaAberto(null)} title={diaAberto ? `${curto(diaAberto)}${diaAberto === hoje ? ' · hoje' : ''}` : ''} size="sm">
        {diaAberto && !diaUtil(diaAberto) && <p className="text-xs text-[var(--surface-500)] mb-2">{porQueNaoUtil(diaAberto)}</p>}
        {!doAberto.length ? <p className="text-sm text-[var(--surface-500)]">Nenhuma conta neste dia.</p> : (
          <div className="flex flex-col">
            {doAberto.map(x => {
              const c = corDaConta(x, hoje)
              return (
                <div key={x.conta.id} className="border-b border-[var(--surface-100)] last:border-0">
                <div className="flex items-center gap-3 py-2.5">
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${BOLA[c]}`} />
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="text-sm text-[var(--surface-800)] truncate">{x.conta.nome}</span>
                    <span className={`text-xs ${TXT[c]}`}>{x.conta.id.startsWith('receber-') ? (x.pago ? (x.pago.conciliado ? 'recebido · conciliado' : 'recebido · falta conciliar') : c === 'vermelho' ? 'a unidade ainda não pagou' : 'a receber') : x.pago?.antes ? 'paga · antes da conciliação começar' : ROTULO[c]}{x.pago ? ` · pago ${x.pago.data.slice(8, 10)}/${x.pago.data.slice(5, 7)}` : ''}</span>
                  </span>
                  <span className="text-mono text-sm tabular-nums text-[var(--surface-800)]">{x.conta.valor_varia && !x.pago ? '~' : ''}{num(x.pago?.valor ?? x.valor)}</span>
                  {podeLancar && !x.pago && !x.conta.id.startsWith('receber-') && (
                    <button onClick={() => { setDiaAberto(null); onPaguei(x) }} className="text-[13px] font-semibold px-2.5 py-1 rounded-[10px] border border-[var(--brand-500)]/60 text-[var(--brand-500)] hover:bg-[var(--brand-500)] hover:text-white">
                      {x.conta.repasse ? 'Quitar' : 'Lançar'}
                    </button>
                  )}
                </div>
                {podeLancar && c === 'amarelo' && sb && !x.conta.id.startsWith('receber-') && x.pago?.itens?.some(i => !i.conciliado && i.conta) && (
                  <div className="mb-2 ml-5 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-[var(--surface-500)]">{x.pago.itens.filter(i => !i.conciliado).map(i => `${i.data.slice(8, 10)}/${i.data.slice(5, 7)} · −${num(i.valor)}`).join(' + ')}</span>
                    <button onClick={() => void conferir(x)} disabled={conferindo === x.conta.id}
                            className="text-[12px] font-semibold px-2 py-0.5 rounded-[8px] border border-emerald-500/60 text-emerald-500 hover:bg-emerald-500 hover:text-white disabled:opacity-50">
                      {conferindo === x.conta.id ? 'gravando…' : '✓ Conferi no extrato'}
                    </button>
                  </div>
                )}
                {podeLancar && c === 'vermelho' && !x.conta.repasse && sb && (
                  assocDe === x.conta.id ? (
                    <div className="mb-2 ml-5 rounded-[10px] border border-[var(--surface-200)] p-2 space-y-1">
                      <p className="text-[11px] text-[var(--surface-500)]">Já lançou? Escolha o lançamento que pagou esta conta:</p>
                      {cands === null ? <p className="text-xs text-[var(--surface-500)]">procurando…</p>
                        : !cands.length ? <p className="text-xs text-[var(--surface-500)]">Nenhum lançamento sem conta neste mês.</p>
                        : cands.map(c => (
                          <button key={c.id} onClick={() => void associar(x.conta.id, c.id)}
                                  className="w-full grid grid-cols-[auto_1fr_auto] gap-2 items-center text-left text-xs px-2 py-1.5 rounded-md hover:bg-[var(--surface-100)]">
                            <span className="text-mono text-[var(--surface-500)]">{c.data.slice(8, 10)}/{c.data.slice(5, 7)}</span>
                            <span className="truncate text-[var(--surface-700)]">{c.texto}{c.mesmaCat ? <span className="text-violet-400"> · mesma categoria</span> : null}</span>
                            <span className="text-mono tabular-nums text-[var(--surface-800)]">{num(c.valor)}</span>
                          </button>
                        ))}
                      <button onClick={() => { setAssocDe(null); setCands(null) }} className="text-[11px] text-[var(--surface-500)] hover:underline">cancelar</button>
                    </div>
                  ) : (
                    <button onClick={() => void abrirAssoc(x)} className="mb-2 ml-5 text-[12px] text-[var(--brand-500)] hover:underline">já lancei · associar a um lançamento ›</button>
                  )
                )}
                </div>
              )
            })}
          </div>
        )}
      </Modal>
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
