'use client'

// FATURA DO CARTÃO — a tela de conferir (16/10/2026, Lucas: "uma coisa simulando uma fatura de cartão
// mesmo... que eu conseguisse ver as anteriores, como no repasse, mostrando o que é pré-lançamento, o
// que é conferido na fatura, o que já tá conciliado, ou seja, o pagamento daquela fatura foi feito, e
// quando também"). Substitui o "Conferir fatura" do + Lançar, onde o "Paguei" parecia a única ação.
//
// Navega fatura a fatura (‹ vence dd/mm ›). Em cima, o estado (lib/fatura-estado.ts) e os pagamentos com a
// data — a do BANCO quando conciliado. Depois a conta (compras + resto da anterior × total do PDF) e as
// compras, cada uma com o selo: ✓ na fatura (bateu com o PDF) · • pré-lançamento (ainda não bateu).
// O pagamento nasce na Conciliação com Extrato; "pagou com conta sem extrato?" é um link discreto no fim.

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useUnit } from '@/contexts/UnitContext'
import { useToast } from '@/components/ui/Toast'
import { useFinanceiroVersao } from '@/lib/financeiro-eventos'
import { fmtBRL, colarValorBR } from '@/lib/financeiro'
import { useCoresContas, rotuloConta } from '@/lib/cor-conta'
import { estadoDaFatura, pendenciasDaFatura, encadearFaturas, faltaPagar, situacaoParcial, valorDaFatura, ROTULO_ESTADO, type EstadoFatura, type FaturaResumo } from '@/lib/fatura-estado'
import { hojeLocal } from '@/lib/date-local'

type Conta = { id: string; nome: string; tipo: string | null; produto: string | null; conciliavel: boolean | null }
type Compra = { id: string; valor: number; data_competencia: string; data_caixa: string; fornecedor_nome: string | null; observacoes: string | null; categoria_id: string | null; fin_categorias: { nome: string } | null }
type Pagamento = { id: string; valor: number; data: string; conciliado: boolean; venc: string }
type Ordem = 'data' | 'nome' | 'valor' | 'status'
const ORDENS: [Ordem, string][] = [['data', 'Data'], ['nome', 'Nome'], ['valor', 'Valor'], ['status', 'Situação']]
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const ddmmaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const c2 = (n: number) => Math.round(n * 100) / 100
const soDigitos = (t: string) => t.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12)
const emNumero = (d: string) => Number(d || '0') / 100
const emTexto = (d: string) => emNumero(d).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const COR: Record<EstadoFatura, string> = {
  em_aberto: 'text-amber-500 border-amber-500/40 bg-amber-500/5', paga_parte: 'text-amber-500 border-amber-500/40 bg-amber-500/5',
  pronta_pagar: 'text-sky-500 border-sky-500/40 bg-sky-500/5', pronta_conciliar: 'text-sky-500 border-sky-500/40 bg-sky-500/5',
  paga: 'text-emerald-500 border-emerald-500/40 bg-emerald-500/5',
}

export default function ConferirFatura({ podeLancar, onImportarConta, onEditar }: {
  podeLancar: boolean; onImportarConta?: (cartaoId: string) => void
  /** CLASSIFICAR (16/10/2026, Lucas): a compra que veio da fatura sem categoria abre o lançamento */
  onEditar?: (lancamentoId: string) => void
}) {
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, [])
  const { currentUnit, userName } = useUnit()
  const { toast } = useToast()
  const cores = useCoresContas()
  const versaoFin = useFinanceiroVersao()
  const [recarga, setRecarga] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [cartoes, setCartoes] = useState<Conta[]>([])
  const [semExtrato, setSemExtrato] = useState<Conta[]>([])
  const [cartaoId, setCartaoId] = useState('')
  const [compras, setCompras] = useState<Compra[]>([])
  const [totais, setTotais] = useState<Map<string, number>>(new Map())
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [naFatura, setNaFatura] = useState<Set<string>>(new Set())
  const [venc, setVenc] = useState('')
  const [ordem, setOrdem] = useState<{ por: Ordem; desc: boolean }>({ por: 'data', desc: false })
  // descrição truncada; o clique na linha abre o texto inteiro (16/10/2026) — o valor fica perto do nome
  const [abertas, setAbertas] = useState<Set<string>>(new Set())
  const alterna = (id: string) => setAbertas(xs => { const n = new Set(xs); if (n.has(id)) n.delete(id); else n.add(id); return n })

  // as contas: cartões (o que se confere) e as sem extrato (o "Paguei" à mão)
  useEffect(() => {
    const uid = currentUnit?.id
    if (!uid) return
    let vivo = true
    void (async () => {
      const { data } = await supabase.from('contas').select('id, nome, tipo, produto, conciliavel')
        .or(`unidade_id.eq.${uid},unidades_extras.cs.{${uid}}`).eq('ativo', true).eq('legado', false).order('nome')
      const cs = (data as Conta[] | null) || []
      if (!vivo) return
      const cards = cs.filter(c => c.tipo === 'cartao' || c.produto === 'cartao_credito')
      setCartoes(cards)
      setSemExtrato(cs.filter(c => c.conciliavel === false && c.produto !== 'maquininha' && !cards.includes(c)))
      setCartaoId(id => id || cards[0]?.id || '')
      if (!cards.length) setCarregando(false)
    })()
    return () => { vivo = false }
  }, [supabase, currentUnit?.id])

  // o cartão inteiro: compras, totais do PDF, pagamentos (com a data do banco quando conciliados)
  useEffect(() => {
    if (!cartaoId) return
    let vivo = true
    void (async () => {
      const ls: Compra[] = []
      for (let off = 0; ; off += 1000) {
        const { data } = await supabase.from('fin_lancamentos')
          .select('id, valor, data_competencia, data_caixa, fornecedor_nome, observacoes, categoria_id, fin_categorias(nome)')
          .eq('conta_pagamento_id', cartaoId).neq('status', 'rejeitado').not('data_caixa', 'is', null).order('id').range(off, off + 999)
        const arr = (data as unknown as Compra[] | null) || []
        ls.push(...arr)
        if (arr.length < 1000) break
      }
      const [{ data: tb }, { data: mv }] = await Promise.all([
        supabase.from('fin_saldos_banco').select('data, saldo').eq('origem', 'fatura').eq('conta_id', cartaoId),
        supabase.from('fin_movimentos').select('id, valor, data, conta_id, fatura_vencimento').eq('tipo', 'fatura_cartao').eq('conta_destino_id', cartaoId).not('fatura_vencimento', 'is', null),
      ])
      const movs = (mv as { id: string; valor: number; data: string; conta_id: string | null; fatura_vencimento: string }[] | null) || []
      const { data: cc } = movs.length
        ? await supabase.from('fin_conciliacoes').select('origem_id, data_banco').eq('origem', 'movimento').in('origem_id', movs.map(m => m.id))
        : { data: [] }
      const banco = new Map(((cc as { origem_id: string; data_banco: string | null }[] | null) || []).map(c => [c.origem_id, c.data_banco]))
      const { data: nc } = await supabase.from('contas').select('id').eq('conciliavel', false)
      const naoConc = new Set(((nc as { id: string }[] | null) || []).map(c => c.id))
      if (!vivo) return
      setCompras(ls)
      setTotais(new Map(((tb as { data: string; saldo: number }[] | null) || []).map(t => [t.data.slice(0, 10), c2(-Number(t.saldo))])))
      setPagamentos(movs.map(m => ({
        id: m.id, valor: Number(m.valor), venc: m.fatura_vencimento.slice(0, 10),
        data: (banco.get(m.id) || m.data).slice(0, 10),
        // conta sem extrato (Dinheiro) não tem o que conciliar: conta como conferido (lib/conferido.ts)
        conciliado: banco.has(m.id) || (!!m.conta_id && naoConc.has(m.conta_id)),
      })).sort((a, b) => a.data.localeCompare(b.data)))
      setCarregando(false)
    })()
    return () => { vivo = false }
  }, [supabase, cartaoId, versaoFin, recarga])

  // uma fatura = um vencimento; o resumo encadeado (resto da paga em parte vai pra seguinte)
  const resumos = useMemo(() => {
    const porVenc = new Map<string, { soma: number; semCat: number }>()
    for (const l of compras) {
      const v = l.data_caixa.slice(0, 10), f = porVenc.get(v) || { soma: 0, semCat: 0 }
      f.soma = c2(f.soma + Number(l.valor)); if (!l.categoria_id) f.semCat++
      porVenc.set(v, f)
    }
    const nome = cartoes.find(c => c.id === cartaoId)?.nome || 'Cartão'
    const xs: FaturaResumo[] = [...porVenc.entries()].map(([v, f]) => {
      const pgs = pagamentos.filter(p => p.venc === v)
      return { cartaoId, cartaoNome: nome, venc: v, soma: f.soma, totalPdf: totais.get(v) ?? null, semCat: f.semCat,
               pago: c2(pgs.reduce((a, p) => a + p.valor, 0)), pagaConciliada: pgs.length > 0 && pgs.every(p => p.conciliado) }
    })
    return encadearFaturas(xs).sort((a, b) => a.venc.localeCompare(b.venc))
  }, [compras, pagamentos, totais, cartoes, cartaoId])

  // abre na mais antiga ainda não paga; sem nenhuma em aberto, na mais recente
  const hoje = hojeLocal()
  useEffect(() => {
    if (!resumos.length) return
    if (venc && resumos.some(r => r.venc === venc)) return
    const aberta = resumos.find(r => estadoDaFatura(r, hoje) !== 'paga')
    setVenc((aberta || resumos[resumos.length - 1]).venc)
  }, [resumos, venc, hoje])

  // as compras desta fatura: o que bateu com o PDF (fin_conciliacoes origem 'lancamento')
  const doVenc = useMemo(() => compras.filter(l => l.data_caixa.slice(0, 10) === venc), [compras, venc])
  useEffect(() => {
    if (!doVenc.length) return
    let vivo = true
    void (async () => {
      const ok = new Set<string>()
      for (let i = 0; i < doVenc.length; i += 200) {
        const { data } = await supabase.from('fin_conciliacoes').select('origem_id').eq('origem', 'lancamento').in('origem_id', doVenc.slice(i, i + 200).map(l => l.id))
        for (const c of (data as { origem_id: string }[] | null) || []) ok.add(c.origem_id)
      }
      if (vivo) setNaFatura(ok)
    })()
    return () => { vivo = false }
  }, [supabase, doVenc])

  const ordenadas = useMemo(() => {
    const nomeDe = (l: Compra) => l.fornecedor_nome || l.observacoes || ''
    const cmp: Record<Ordem, (a: Compra, b: Compra) => number> = {
      data: (a, b) => a.data_competencia.localeCompare(b.data_competencia),
      nome: (a, b) => nomeDe(a).localeCompare(nomeDe(b), 'pt-BR'),
      valor: (a, b) => Number(a.valor) - Number(b.valor),
      status: (a, b) => Number(!!a.categoria_id) - Number(!!b.categoria_id) || Number(naFatura.has(a.id)) - Number(naFatura.has(b.id)) || a.data_competencia.localeCompare(b.data_competencia),
    }
    const f = cmp[ordem.por]
    return [...doVenc].sort((a, b) => (ordem.desc ? -f(a, b) : f(a, b)))
  }, [doVenc, ordem, naFatura])

  // o "pagou com conta sem extrato?" — discreto, fechado por padrão
  const [pagarAberto, setPagarAberto] = useState(false)
  const [pg, setPg] = useState({ conta: '', data: '', valor: '' })
  const [totalManual, setTotalManual] = useState('')
  const [gravando, setGravando] = useState(false)

  if (carregando) return <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--surface-400)]" /></div>
  if (!cartoes.length) return <p className="text-sm text-[var(--surface-500)] py-6">Nenhum cartão cadastrado (engrenagem › Contas).</p>
  if (!resumos.length) return <p className="text-sm text-[var(--surface-500)] py-6">Nenhuma compra lançada neste cartão.</p>

  const i = resumos.findIndex(r => r.venc === venc)
  const r = resumos[i] || resumos[resumos.length - 1]
  const estado = estadoDaFatura(r, hoje)
  const pend = estado === 'em_aberto' ? pendenciasDaFatura(r) : []
  const pgsDaFatura = pagamentos.filter(p => p.venc === r.venc)
  const nNa = doVenc.filter(l => naFatura.has(l.id)).length
  const difPdf = r.totalPdf !== null ? c2(r.totalPdf - r.soma - (r.carregado || 0)) : null

  async function registrarPagamento() {
    if (!currentUnit?.id) return
    if (!pg.conta || !pg.data || !emNumero(pg.valor)) return toast('Informe a conta, a data e o valor', 'error')
    // a mesma trava da quitação antiga (19f0504): fatura em aberto (compra sem categoria, PDF faltando) não se paga
    if (estadoDaFatura(r, hoje) === 'em_aberto') return toast('A fatura ainda está em aberto: resolva o que falta antes de registrar o pagamento.', 'error')
    setGravando(true)
    const { error } = await supabase.from('fin_movimentos').insert({
      unidade_id: currentUnit.id, tipo: 'fatura_cartao', conta_id: pg.conta, conta_destino_id: cartaoId,
      data: pg.data, valor: emNumero(pg.valor), fatura_vencimento: r.venc,
      descricao: `Fatura ${r.cartaoNome} · vence ${ddmmaa(r.venc)} · pago com conta sem extrato`, criado_por_nome: userName || null,
    })
    setGravando(false)
    if (error) return toast(`Não gravou: ${error.message}`, 'error')
    toast('Pagamento registrado', 'success'); setPagarAberto(false); setPg({ conta: '', data: '', valor: '' }); setRecarga(x => x + 1)
  }
  async function salvarTotal() {
    if (!emNumero(totalManual)) return toast('Informe o total da fatura', 'error')
    const { error } = await supabase.from('fin_saldos_banco').upsert(
      { conta_id: cartaoId, data: r.venc, saldo: -emNumero(totalManual), origem: 'fatura', criado_por_nome: userName || null },
      { onConflict: 'conta_id,data' })
    if (error) return toast(`Não gravou o total: ${error.message}`, 'error')
    toast('Total da fatura guardado', 'success'); setTotalManual(''); setRecarga(x => x + 1)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* o cartão (se houver mais de um) e a fatura: ‹ vence dd/mm › */}
      {cartoes.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {cartoes.map(c => (
            <button key={c.id} onClick={() => { setCartaoId(c.id); setVenc(''); setCarregando(true) }}
                    className={`text-[12.5px] px-3 py-1 rounded-full border ${c.id === cartaoId ? 'border-[var(--brand-500)] text-[var(--brand-500)] font-medium' : 'border-[var(--surface-200)] text-[var(--surface-600)]'}`}>
              {rotuloConta(cores, c.id, c.nome)}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button aria-label="Fatura anterior" disabled={i <= 0} onClick={() => setVenc(resumos[i - 1].venc)}
                className="h-8 w-8 rounded-full border border-[var(--surface-200)] flex items-center justify-center disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
        <select value={r.venc} onChange={e => setVenc(e.target.value)} aria-label="Qual fatura" className="input text-sm flex-1 min-w-0 sm:flex-none sm:w-64">
          {resumos.map(x => <option key={x.venc} value={x.venc}>vence {ddmmaa(x.venc)} · {ROTULO_ESTADO[estadoDaFatura(x, hoje)]}</option>)}
        </select>
        <button aria-label="Próxima fatura" disabled={i >= resumos.length - 1} onClick={() => setVenc(resumos[i + 1].venc)}
                className="h-8 w-8 rounded-full border border-[var(--surface-200)] flex items-center justify-center disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
      </div>

      {/* 1) o estado, o total e os pagamentos (com a data do banco quando conciliados) */}
      <div className={`rounded-[12px] border p-3.5 ${COR[estado]}`}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-semibold">
            {estado === 'paga' ? (r.pagaConciliada ? '© Paga' : 'Paga · falta conciliar') : estado === 'em_aberto' || estado === 'paga_parte' ? ROTULO_ESTADO[estado] : `✓ ${ROTULO_ESTADO[estado]}`}
          </span>
          <span className="ml-auto text-mono text-xl tabular-nums text-[var(--surface-900)]">{fmtBRL(valorDaFatura(r))}</span>
        </div>
        <p className="text-[12px] text-[var(--surface-600)] mt-1">
          {r.venc < hoje ? 'Venceu' : 'Vence'} em {ddmmaa(r.venc)}.
          {estado === 'pronta_pagar' && ' Tudo conferido: pague no banco até o vencimento.'}
          {estado === 'pronta_conciliar' && ' Tudo conferido e já venceu.'}
          {(estado === 'pronta_pagar' || estado === 'pronta_conciliar') && ' Quando o extrato (OFX) chegar na Conciliação com Extrato, a linha do pagamento já aparece ligada a esta fatura.'}
          {estado === 'paga_parte' && ` ${situacaoParcial(r)}.`}
        </p>
        {pend.map(t => <p key={t} className="text-[12px] text-[var(--surface-600)]">· {t}</p>)}
        {pgsDaFatura.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-0.5">
            {pgsDaFatura.map(p => (
              <span key={p.id} className="text-[12px] text-[var(--surface-700)]">
                {p.conciliado ? <b className="text-emerald-500">©</b> : <span className="text-sky-500">•</span>} Pago em <b>{ddmm(p.data)}</b> · <span className="text-mono">{fmtBRL(p.valor)}</span>
                <span className="text-[var(--surface-500)]">{p.conciliado ? ' · data do banco (conciliado)' : ' · falta conciliar'}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 2) a conta: compras (+ resto da anterior) × o que o PDF diz */}
      <div className="rounded-[12px] border border-[var(--surface-200)] divide-y divide-[var(--surface-100)] text-sm">
        <Linha rotulo={`${doVenc.length} ${doVenc.length === 1 ? 'compra lançada' : 'compras lançadas'}`} sub={`${nNa} de ${doVenc.length} bateram com o PDF${r.semCat ? ` · ${r.semCat} sem categoria` : ''}`} valor={fmtBRL(r.soma)} />
        {r.carregado ? <Linha rotulo="Resto da fatura anterior" sub="pagamento parcial — o banco trouxe pra esta" valor={`+ ${fmtBRL(r.carregado)}`} /> : null}
        <Linha rotulo="Total do PDF da fatura" sub={r.totalPdf === null ? 'PDF não importado' : undefined} valor={r.totalPdf === null ? '—' : fmtBRL(r.totalPdf)} forte />
        {difPdf !== null && Math.abs(difPdf) >= 0.005 && (
          <Linha rotulo={difPdf > 0 ? 'Faltam lançar' : 'Lançado a mais'} valor={fmtBRL(Math.abs(difPdf))} alerta />
        )}
      </div>
      {onImportarConta && (r.totalPdf === null || (difPdf !== null && difPdf >= 0.005) || nNa < doVenc.length) && (
        <button onClick={() => onImportarConta(cartaoId)} className="text-[12.5px] text-[var(--brand-500)] hover:underline self-start">Importar o PDF desta fatura ›</button>
      )}

      {/* 3) as compras */}
      <div className="rounded-[12px] border border-[var(--surface-200)] p-3">
        <div className="flex flex-wrap items-center gap-1.5 mb-2 text-[12px]">
          <span className="text-[var(--surface-500)] mr-0.5">Ordenar por</span>
          {ORDENS.map(([k, rot]) => {
            const ativa = ordem.por === k
            return (
              <button key={k} onClick={() => setOrdem(o => (o.por === k ? { por: k, desc: !o.desc } : { por: k, desc: k === 'valor' }))}
                      className={`px-2.5 py-0.5 rounded-full border ${ativa ? 'border-[var(--brand-500)] text-[var(--brand-500)] font-medium' : 'border-[var(--surface-200)] text-[var(--surface-600)] hover:border-[var(--surface-400)]'}`}>
                {rot}{ativa ? (ordem.desc ? ' ↓' : ' ↑') : ''}
              </button>
            )
          })}
          <span className="ml-auto text-[11px] text-[var(--surface-500)]"><span className="text-emerald-500">✓</span> na fatura · <span className="text-amber-500">•</span> pré-lançamento{r.semCat ? <> · <span className="text-amber-500">sem categoria</span></> : null}</span>
        </div>
        <div className="divide-y divide-[var(--surface-100)]">
          {ordenadas.map(l => {
            const ok = naFatura.has(l.id)
            return (
              <div key={l.id} onClick={() => alterna(l.id)}
                   className={`py-1.5 grid grid-cols-[14px_1fr_auto] gap-x-2.5 gap-y-0.5 items-baseline cursor-pointer hover:bg-[var(--surface-50)] rounded-[6px] ${!l.categoria_id ? 'bg-amber-500/5' : ''}`}>
                <span title={ok ? 'bateu com uma linha do PDF da fatura' : 'pré-lançamento — ainda não bateu com o PDF'} className="text-center">
                  {ok ? <span className="text-[12px] text-emerald-500">✓</span> : <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />}
                </span>
                <span className={`min-w-0 text-sm text-[var(--surface-800)] ${abertas.has(l.id) ? 'whitespace-normal break-words' : 'truncate'}`}>
                  {l.fornecedor_nome || l.observacoes || '—'}
                  {abertas.has(l.id) && l.fornecedor_nome && l.observacoes && l.observacoes !== l.fornecedor_nome && <span className="block text-[11.5px] text-[var(--surface-500)]">{l.observacoes}</span>}
                </span>
                <span className={`text-mono text-sm tabular-nums text-right ${Number(l.valor) < 0 ? 'text-emerald-500' : 'text-[var(--surface-800)]'}`}>{Number(l.valor) < 0 ? '−' : ''}{fmtBRL(Math.abs(Number(l.valor)))}</span>
                <span />
                <span className={`min-w-0 text-[11.5px] text-[var(--surface-500)] col-span-2 ${abertas.has(l.id) ? 'whitespace-normal' : 'truncate'}`}>
                  {ddmm(l.data_competencia)} · {l.fin_categorias?.nome || (onEditar
                    ? <button onClick={e => { e.stopPropagation(); onEditar(l.id) }} className="text-[10.5px] px-1.5 rounded-full bg-amber-500/15 text-amber-500 hover:bg-amber-500/25">sem categoria · classificar ›</button>
                    : <span className="text-amber-500">sem categoria</span>)}
                  {onEditar && l.categoria_id && <> · <button onClick={e => { e.stopPropagation(); onEditar(l.id) }} className="text-[var(--brand-500)] hover:underline">editar ›</button></>}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 4) os cantinhos: total à mão (sem PDF) e o pagamento com conta sem extrato — discretos */}
      {podeLancar && r.totalPdf === null && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--surface-500)]">
          <span>Sem o PDF? Total da fatura:</span>
          <input inputMode="numeric" value={totalManual ? emTexto(totalManual) : ''} placeholder="0,00" onChange={e => setTotalManual(soDigitos(e.target.value))}
                 onPaste={e => { const d = colarValorBR(e.clipboardData.getData('text')); if (d !== null) { e.preventDefault(); setTotalManual(d) } }}
                 className="input text-[12px] text-mono py-0.5 w-28" />
          <button onClick={() => void salvarTotal()} className="underline hover:text-[var(--surface-700)]">guardar</button>
        </div>
      )}
      {podeLancar && semExtrato.length > 0 && faltaPagar(r) >= 0.005 && estado !== 'em_aberto' && (
        pagarAberto ? (
          <div className="flex flex-wrap items-end gap-2 text-[12px] text-[var(--surface-500)] border-t border-[var(--surface-100)] pt-2">
            <select value={pg.conta} onChange={e => setPg(x => ({ ...x, conta: e.target.value }))} className="input text-[12px] py-0.5" aria-label="Conta sem extrato">
              <option value="">conta…</option>
              {semExtrato.map(c => <option key={c.id} value={c.id}>{rotuloConta(cores, c.id, c.nome)}</option>)}
            </select>
            <input type="date" value={pg.data} onChange={e => setPg(x => ({ ...x, data: e.target.value }))} className="input text-[12px] py-0.5" aria-label="Pago em" />
            <input inputMode="numeric" value={pg.valor ? emTexto(pg.valor) : ''} placeholder="valor" onChange={e => setPg(x => ({ ...x, valor: soDigitos(e.target.value) }))} className="input text-[12px] text-mono py-0.5 w-28" aria-label="Valor pago" />
            <button onClick={() => void registrarPagamento()} disabled={gravando} className="underline hover:text-[var(--surface-700)]">{gravando ? 'gravando…' : 'registrar'}</button>
            <button onClick={() => setPagarAberto(false)} className="hover:text-[var(--surface-700)]">cancelar</button>
          </div>
        ) : (
          <button onClick={() => { setPg({ conta: semExtrato[0]?.id || '', data: '', valor: String(Math.round(faltaPagar(r) * 100)) }); setPagarAberto(true) }}
                  className="text-[11px] text-[var(--surface-400)] hover:text-[var(--surface-600)] hover:underline self-start">pagou com uma conta sem extrato?</button>
        )
      )}
    </div>
  )
}

function Linha({ rotulo, sub, valor, forte, alerta }: { rotulo: string; sub?: string; valor: string; forte?: boolean; alerta?: boolean }) {
  return (
    <div className={`flex items-baseline gap-3 px-3.5 py-2 ${forte ? 'font-semibold' : ''} ${alerta ? 'text-amber-500' : ''}`}>
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${alerta ? '' : forte ? 'text-[var(--surface-900)]' : 'text-[var(--surface-700)]'}`}>{rotulo}</span>
        {sub && <span className="block text-[11px] text-[var(--surface-500)]">{sub}</span>}
      </span>
      <span className={`text-mono tabular-nums ${alerta ? '' : 'text-[var(--surface-900)]'}`}>{valor}</span>
    </div>
  )
}
