'use client'

// CONTAS E FATURAS — o popup ao lado do "+ Lançar" (10/10/2026; desenho fechado
// na bancada, artifact 9uEYKTjnPY3gdhNkRA6Hho, pranchas CFGeral · CFConta · CFAgenda).
//
// POR QUE POPUP E NÃO ABA: o antigo Caixa responde "onde está o dinheiro AGORA?",
// não "como foi o mês". As abas seguem o mês lá de cima; isto não segue mês.
//
// Três telas, dentro do mesmo popup:
//   · GERAL  — cards do mesmo tamanho, em Contas · Faturas · Maquininhas. Cada
//              card: nome + link, saldo, se bate com o banco (fin_saldos_banco,
//              mig 156) e um detalhe. Sem movimento: o mesmo card, apagado.
//   · CONTA  — "Ver extrato": o livro, mais novo em cima, por dia, com o saldo no
//              fim do dia e "= banco ✓" no dia do último extrato. Repetidas do dia
//              viram uma linha ("2 × Liquidação · InterPag").
//   · AGENDA — "Ver agenda" da maquininha: a esteira de parcelas (lib/recebiveis),
//              próximos dias do mês e por mês. PREVISÃO: nunca vira saldo.
//
// Regras de desenho que o Lucas pediu: nada de "importar" solto nos cards (só no
// extrato da conta, onde fica claro de qual banco é), nada de transferir/conferir
// aqui, frases inteiras — sem abreviar.

import { useCoresContas, rotuloConta, estiloConta } from '@/lib/cor-conta'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ChevronLeft, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useUnit } from '@/contexts/UnitContext'
import { fmtBRL, fmtData, hojeISO } from '@/lib/financeiro'
import { montarEsteira, contaCalibrada, type PagamentoCartao } from '@/lib/recebiveis'
import ExtratoContaModal from './ExtratoContaModal'

type Saldo = {
  conta_id: string; nome: string; tipo: string; produto: string | null; legado: boolean
  entradas: number; saidas: number; saldo: number; caixa_desde: string | null; mostrar_no_caixa: boolean | null
}
type Situacao = { texto: string; cor: 'ok' | 'atencao' | 'neutro'; detalhe: string }
type Card = Saldo & { grupo: 'contas' | 'faturas' | 'maquininhas'; parado: boolean; sit: Situacao }
type Linha = { data: string; valor: number; origem: string; origem_id: string; descricao: string | null }
type Tela = { tipo: 'geral' } | { tipo: 'conta'; card: Card } | { tipo: 'agenda'; card: Card }

const c2 = (n: number) => Math.round(n * 100) / 100
const num = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const rotuloDia = (iso: string) => `${DIAS_SEMANA[new Date(`${iso}T12:00:00`).getDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const somaDias = (iso: string, d: number) => { const x = new Date(`${iso}T12:00:00`); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10) }
const somaMesISO = (iso: string, m: number) => { const x = new Date(`${iso}T12:00:00`); x.setMonth(x.getMonth() + m); return x.toISOString().slice(0, 10) }
const COR = { ok: 'text-emerald-500', atencao: 'text-amber-500', neutro: 'text-[var(--surface-500)]' }

/** Soma da vw_caixa de uma conta até uma data (paginado — passa de 1000 linhas). */
async function saldoAte(sb: SupabaseClient, contaId: string, data: string): Promise<number> {
  let soma = 0
  for (let off = 0; ; off += 1000) {
    const { data: pg } = await sb.from('vw_caixa').select('valor').eq('conta_id', contaId).lte('data', data)
      .order('data').order('origem_id').range(off, off + 999)
    const arr = (pg as { valor: number }[] | null) || []
    soma += arr.reduce((a, x) => a + Number(x.valor), 0)
    if (arr.length < 1000) break
  }
  return c2(soma)
}

/** "ST260923INDFERHAN6S HANNAH" → "contrato HANNAH"; o resto fica como veio. */
function rotuloLinha(l: Linha): string {
  if (l.origem === 'pagamento') {
    const pet = (l.descricao || '').split(' ').slice(1).join(' ').trim()
    return `${l.valor < 0 ? '↩ Devolução' : 'Pagamento'} · contrato ${pet || '—'}`
  }
  return (l.descricao || '').split(' — ')[0] || l.origem
}

export default function ContasFaturasModal({ aberto, onClose, onImportar, podeEditar = false }: {
  aberto: boolean
  onClose: () => void
  /** Abre o Importar extrato já nesta conta (o popup fecha). Ausente = só consulta. */
  onImportar?: (contaId: string) => void
  /** FLS `btn_caixa_editar`: corrigir/excluir movimento pelo extrato. Sem ele, só consulta. */
  podeEditar?: boolean
}) {
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, [])
  const { currentUnit } = useUnit()
  const [tela, setTela] = useState<Tela>({ tipo: 'geral' })
  const [cards, setCards] = useState<Card[]>([])
  // Nasce carregando e volta a carregar ao fechar: nada de setState síncrono no effect.
  const [carregando, setCarregando] = useState(true)

  const uid = currentUnit?.id
  const [semLiquidez, setSemLiquidez] = useState<Set<string>>(new Set())
  const carregar = useCallback(async () => {
    if (!uid) return
    const hoje = hojeISO()
    const { data: sd } = await supabase.from('vw_caixa_saldo').select('*')
      .or(`unidade_id.eq.${uid},unidades_extras.cs.{${uid}}`)
    const saldos = ((sd as Saldo[] | null) || []).filter(s => !s.legado && s.mostrar_no_caixa !== false)
      .sort((a, b) => a.nome.localeCompare(b.nome))
    // SEM LIQUIDEZ (mig 160): o saldo aparece, mas não entra no "disponível agora".
    const { data: rv, error: erv } = await supabase.from('contas').select('id').eq('reserva', true)
    setSemLiquidez(erv ? new Set() : new Set(((rv as { id: string }[] | null) || []).map(x => x.id)))

    const novos = await Promise.all(saldos.map(async (s): Promise<Card> => {
      const cartao = s.tipo === 'cartao' || s.produto === 'cartao_credito'
      const maq = s.produto === 'maquininha'
      const grupo = cartao ? 'faturas' : maq ? 'maquininhas' : 'contas'
      const parado = Math.abs(Number(s.saldo)) < 0.005 && !Number(s.entradas) && !Number(s.saidas)
      const saldo = Number(s.saldo) || 0
      let sit: Situacao = { texto: 'sem movimento', cor: 'neutro', detalhe: '' }
      if (parado) return { ...s, saldo, grupo, parado, sit }

      if (cartao) {
        // Faturas: compras agrupadas pelo vencimento × quitações (fatura_vencimento).
        const desde = somaDias(hoje, -150)
        const [{ data: ls }, { data: pg }] = await Promise.all([
          supabase.from('fin_lancamentos').select('data_caixa, valor').eq('conta_pagamento_id', s.conta_id)
            .neq('status', 'rejeitado').gte('data_caixa', desde),
          supabase.from('fin_movimentos').select('fatura_vencimento').eq('tipo', 'fatura_cartao')
            .eq('conta_destino_id', s.conta_id).not('fatura_vencimento', 'is', null),
        ])
        const porVenc = new Map<string, number>()
        for (const l of (ls as { data_caixa: string | null; valor: number }[] | null) || []) {
          if (!l.data_caixa) continue
          const v = l.data_caixa.slice(0, 10)
          porVenc.set(v, c2((porVenc.get(v) || 0) + Number(l.valor)))
        }
        const pagas = new Set(((pg as { fatura_vencimento: string }[] | null) || []).map(p => p.fatura_vencimento.slice(0, 10)))
        const vencs = [...porVenc.keys()].sort()
        const abertas = vencs.filter(v => !pagas.has(v))
        const ultimaPaga = [...vencs].reverse().find(v => pagas.has(v))
        const proxima = vencs.length ? somaMesISO(vencs[vencs.length - 1], 1) : null
        if (abertas.length) {
          const v = abertas[0]
          sit = { texto: `• fatura de ${fmtData(v)}: ${fmtBRL(porVenc.get(v) || 0)} a pagar`, cor: 'atencao',
                  detalhe: ultimaPaga ? `a de ${fmtData(ultimaPaga)} (${fmtBRL(porVenc.get(ultimaPaga) || 0)}) está paga ✓` : '' }
        } else if (proxima && proxima <= somaDias(hoje, 5)) {
          // Venceu (ou vence já) uma fatura que não tem compra nenhuma lançada.
          sit = { texto: `• fatura de ${fmtData(proxima)} sem compras lançadas`, cor: 'atencao',
                  detalhe: ultimaPaga ? `a de ${fmtData(ultimaPaga)} (${fmtBRL(porVenc.get(ultimaPaga) || 0)}) está paga ✓` : '' }
        } else {
          sit = { texto: '✓ sem fatura em aberto', cor: 'ok',
                  detalhe: ultimaPaga ? `a de ${fmtData(ultimaPaga)} (${fmtBRL(porVenc.get(ultimaPaga) || 0)}) está paga ✓` : '' }
        }
        return { ...s, saldo, grupo, parado, sit }
      }

      if (maq) {
        sit = { texto: 'a receber · vendas no cartão ainda não depositadas', cor: 'neutro',
                detalhe: 'baixa a cada depósito que aparece no extrato' }
        return { ...s, saldo, grupo, parado, sit }
      }

      if (s.tipo === 'dinheiro') {
        sit = { texto: s.caixa_desde ? `caixa aberto em ${fmtData(s.caixa_desde)}` : '• caixa ainda não aberto', cor: s.caixa_desde ? 'neutro' : 'atencao',
                detalhe: 'sem extrato: confere-se contando a gaveta' }
        return { ...s, saldo, grupo, parado, sit }
      }

      // Conta corrente: o último saldo que o banco mostrou × o sistema no mesmo dia.
      const { data: sb } = await supabase.from('fin_saldos_banco').select('data, saldo')
        .eq('conta_id', s.conta_id).order('data', { ascending: false }).limit(1)
      const banco = ((sb as { data: string; saldo: number }[] | null) || [])[0]
      if (banco) {
        const naData = await saldoAte(supabase, s.conta_id, banco.data)
        const dif = c2(Number(banco.saldo) - naData)
        const depois = c2(saldo - naData)
        sit = Math.abs(dif) < 0.005
          ? { texto: `✓ batia com o banco em ${fmtData(banco.data)}`, cor: 'ok',
              detalhe: Math.abs(depois) >= 0.005 ? `depois disso, ${depois > 0 ? '+' : '−'} ${fmtBRL(Math.abs(depois))} ainda a conferir` : 'nada lançado depois disso' }
          : { texto: `• diferença de ${fmtBRL(Math.abs(dif))} com o banco em ${fmtData(banco.data)}`, cor: 'atencao',
              detalhe: dif > 0 ? 'faltam lançamentos no sistema' : 'o sistema tem lançamento a mais' }
      } else {
        const { data: cc } = await supabase.from('fin_conciliacoes').select('data_banco')
          .eq('conta_id', s.conta_id).order('data_banco', { ascending: false }).limit(1)
        const ate = ((cc as { data_banco: string }[] | null) || [])[0]?.data_banco
        sit = ate
          ? { texto: `conferido até ${fmtData(ate)}`, cor: 'neutro', detalhe: 'importe o extrato para guardar o saldo do banco' }
          : { texto: '• nunca conferido com o banco', cor: 'atencao', detalhe: 'importe o extrato para conferir' }
      }
      return { ...s, saldo, grupo, parado, sit }
    }))
    setCards(novos)
    setCarregando(false)
  }, [supabase, uid])

  useEffect(() => {
    if (!aberto) return
    const t = setTimeout(() => { void carregar() }, 0)   // fora do ciclo do effect
    return () => clearTimeout(t)
  }, [aberto, carregar])
  // Fechar sempre volta pra tela geral — a próxima abertura começa pelos cards.
  const fechar = () => { setTela({ tipo: 'geral' }); setCarregando(true); onClose() }

  const disponivel = c2(cards.filter(c => c.grupo === 'contas' && !semLiquidez.has(c.conta_id)).reduce((a, c) => a + c.saldo, 0))
  const titulo = tela.tipo === 'geral' ? 'Contas e Faturas'
    : tela.tipo === 'conta' ? tela.card.nome : `${tela.card.nome} · agenda de recebimentos`

  return (
    <Modal isOpen={aberto} onClose={fechar} title={titulo} size="xl">
      {tela.tipo !== 'geral' && (
        <button onClick={() => setTela({ tipo: 'geral' })} className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--brand-500)] hover:underline">
          <ChevronLeft className="h-4 w-4" /> Contas e Faturas
        </button>
      )}
      {tela.tipo === 'geral' && (
        <Geral cards={cards} carregando={carregando} disponivel={disponivel} onAbrir={setTela} />
      )}
      {tela.tipo === 'conta' && (
        <VerExtrato card={tela.card} onImportar={onImportar} podeEditar={podeEditar} onMudou={() => void carregar()} />
      )}
      {tela.tipo === 'agenda' && <VerAgenda card={tela.card} />}
    </Modal>
  )
}

// ── GERAL: cards ────────────────────────────────────────────────────────────
function Geral({ cards, carregando, disponivel, onAbrir }: {
  cards: Card[]; carregando: boolean; disponivel: number; onAbrir: (t: Tela) => void
}) {
  const cores = useCoresContas()
  const grupos: { chave: Card['grupo']; nome: string }[] = [
    { chave: 'contas', nome: 'Contas' }, { chave: 'faturas', nome: 'Faturas' }, { chave: 'maquininhas', nome: 'Maquininhas' },
  ]
  return (
    <div className="space-y-5">
      <div className="flex items-baseline gap-2">
        <span className="text-sm text-[var(--surface-500)]">disponível agora</span>
        <span className="text-mono text-2xl tabular-nums text-[var(--surface-900)]">{fmtBRL(disponivel)}</span>
        {carregando && <Loader2 className="h-4 w-4 animate-spin text-[var(--surface-400)] self-center" />}
      </div>
      {grupos.map(g => {
        const lista = cards.filter(c => c.grupo === g.chave)
        if (!lista.length) return null
        return (
          <section key={g.chave} className="space-y-2.5">
            <p className="text-[11px] font-semibold tracking-[.14em] uppercase text-[var(--surface-500)]">{g.nome}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {lista.map(c => {
                const maq = c.grupo === 'maquininhas'
                const fatura = c.grupo === 'faturas'
                const valor = fatura ? Math.abs(Math.min(c.saldo, 0)) : c.saldo
                return (
                  <div key={c.conta_id} className="card p-4 flex flex-col gap-1 min-h-[128px]" style={{ ...estiloConta(cores.get(c.conta_id)), ...(c.parado ? { opacity: 0.55 } : {}) }}>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm text-[var(--surface-700)] truncate">{c.nome}</span>
                      <button onClick={() => onAbrir(maq ? { tipo: 'agenda', card: c } : { tipo: 'conta', card: c })}
                              className="ml-auto shrink-0 text-[13px] text-[var(--brand-500)] hover:underline">
                        {maq ? 'Ver agenda ›' : fatura ? 'Ver faturas ›' : 'Ver extrato ›'}
                      </button>
                    </div>
                    <span className={`text-mono text-xl tabular-nums ${c.parado ? 'text-[var(--surface-400)]' : maq ? 'text-sky-500' : valor < 0 ? 'text-red-400' : 'text-[var(--surface-900)]'}`}>
                      {num(valor)}
                    </span>
                    <span className={`text-[13px] ${COR[c.sit.cor]}`}>{c.sit.texto}</span>
                    <span className="text-xs text-[var(--surface-500)]">{c.sit.detalhe || ' '}</span>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

// ── VER EXTRATO: o livro, mais novo em cima ─────────────────────────────────
function VerExtrato({ card, onImportar, podeEditar, onMudou }: { card: Card; onImportar?: (contaId: string) => void; podeEditar: boolean; onMudou: () => void }) {
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, [])
  const [dias, setDias] = useState(30)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [conc, setConc] = useState<Set<string>>(new Set())
  const [banco, setBanco] = useState<{ data: string; saldo: number; sistema: number } | null>(null)
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const [carregando, setCarregando] = useState(false)
  const [editarMes, setEditarMes] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const desde = somaDias(hojeISO(), -dias)
    const todas: Linha[] = []
    for (let off = 0; ; off += 1000) {
      const { data } = await supabase.from('vw_caixa').select('data, valor, origem, origem_id, descricao')
        .eq('conta_id', card.conta_id).gte('data', desde).order('data').order('origem_id').range(off, off + 999)
      const pg = (data as Linha[] | null) || []
      todas.push(...pg)
      if (pg.length < 1000) break
    }
    const ids = todas.map(l => l.origem_id)
    const ok = new Set<string>()
    for (let k = 0; k < ids.length; k += 150) {
      const { data } = await supabase.from('fin_conciliacoes').select('origem_id').eq('conta_id', card.conta_id).in('origem_id', ids.slice(k, k + 150))
      for (const r of (data as { origem_id: string }[] | null) || []) ok.add(r.origem_id)
    }
    const { data: sb } = await supabase.from('fin_saldos_banco').select('data, saldo').eq('conta_id', card.conta_id)
      .order('data', { ascending: false }).limit(1)
    const b = ((sb as { data: string; saldo: number }[] | null) || [])[0]
    setBanco(b ? { data: b.data, saldo: Number(b.saldo), sistema: await saldoAte(supabase, card.conta_id, b.data) } : null)
    setLinhas(todas); setConc(ok); setCarregando(false)
  }, [supabase, card.conta_id, dias])

  useEffect(() => { void carregar() }, [carregar])

  // Dias, mais novo em cima; saldo no fim do dia = saldo de agora − o que veio depois.
  const porDia = useMemo(() => {
    const mapa = new Map<string, Linha[]>()
    for (const l of linhas) mapa.set(l.data, [...(mapa.get(l.data) || []), l])
    const datas = [...mapa.keys()].sort().reverse()
    let depois = 0
    return datas.map(d => {
      const ls = mapa.get(d)!
      const fim = c2(card.saldo - depois)
      depois = c2(depois + ls.reduce((a, l) => a + Number(l.valor), 0))
      // Repetidas no dia viram uma linha (2 × Liquidação · InterPag).
      const grupos = new Map<string, Linha[]>()
      for (const l of ls) { const k = rotuloLinha(l); grupos.set(k, [...(grupos.get(k) || []), l]) }
      return { data: d, fim, grupos: [...grupos.entries()] }
    })
  }, [linhas, card.saldo])

  const cartao = card.grupo === 'faturas'
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-3 border-b border-[var(--surface-200)]">
        {banco ? (<>
          <div className="flex flex-col"><span className="text-xs text-[var(--surface-500)]">{cartao ? 'Fatura de' : 'No banco em'} {fmtData(banco.data)}</span><span className="text-mono text-lg tabular-nums">{num(cartao ? Math.abs(banco.saldo) : banco.saldo)}</span></div>
          <div className="flex flex-col"><span className="text-xs text-[var(--surface-500)]">No sistema em {fmtData(banco.data)}</span>
            <span className={`text-mono text-lg tabular-nums ${Math.abs(banco.saldo - banco.sistema) < 0.005 ? 'text-emerald-500' : 'text-amber-500'}`}>
              {num(cartao ? Math.abs(banco.sistema) : banco.sistema)}{Math.abs(banco.saldo - banco.sistema) < 0.005 ? ' ✓' : ''}
            </span></div>
        </>) : (
          <div className="sm:col-span-2 text-sm text-[var(--surface-500)] self-center">Ainda sem saldo do banco guardado — importe o extrato desta conta.</div>
        )}
        <div className="flex flex-col"><span className="text-xs text-[var(--surface-500)]">Agora, no sistema</span><span className="text-mono text-lg tabular-nums">{num(cartao ? Math.abs(card.saldo) : card.saldo)}</span></div>
      </div>

      {carregando && !linhas.length ? (
        <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--surface-400)]" /></div>
      ) : !porDia.length ? (
        <p className="text-sm text-[var(--surface-500)] py-6 text-center">Nada nesta conta nos últimos {dias} dias.</p>
      ) : (
        <div className="divide-y divide-[var(--surface-200)]">
          {porDia.map(d => {
            const ehBanco = banco && d.data === banco.data && Math.abs(d.fim - banco.saldo) < 0.005
            const naoVeio = banco && d.data > banco.data
            return (
              <div key={d.data} className="py-2.5">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className={`text-[13px] font-semibold ${naoVeio ? 'text-amber-500' : 'text-[var(--surface-700)]'}`}>{rotuloDia(d.data)}</span>
                  {naoVeio && <span className="text-xs text-[var(--surface-500)]">ainda não veio no extrato</span>}
                  <span className="ml-auto text-xs text-[var(--surface-500)]">
                    fim do dia <span className="text-mono text-[var(--surface-800)]">{num(d.fim)}</span>
                    {ehBanco && <span className="text-emerald-500"> = banco ✓</span>}
                  </span>
                </div>
                {d.grupos.map(([rot, ls]) => {
                  const soma = c2(ls.reduce((a, l) => a + Number(l.valor), 0))
                  const todosOk = ls.every(l => conc.has(l.origem_id))
                  const chave = `${d.data}|${rot}`
                  const aberto = abertos.has(chave)
                  const mov = podeEditar && ls.length === 1 && ls[0].origem === 'movimento'
                  return (
                    <div key={chave}>
                      <div className={`grid grid-cols-[18px_1fr_auto] gap-2 py-1 text-sm ${mov ? 'cursor-pointer hover:bg-[var(--surface-100)] rounded' : ''}`}
                           onClick={mov ? () => setEditarMes(d.data.slice(0, 7)) : undefined}
                           title={mov ? 'Corrigir ou excluir este movimento' : undefined}>
                        <span className={todosOk ? 'text-emerald-500' : 'text-amber-500'}>{todosOk ? '✓' : '•'}</span>
                        <span className="text-[var(--surface-700)] truncate">
                          {ls.length > 1 ? `${ls.length} × ${rot}` : rot}
                          {ls.length > 1 && (
                            <button onClick={() => setAbertos(s => { const n = new Set(s); if (n.has(chave)) n.delete(chave); else n.add(chave); return n })}
                                    className="ml-2 text-xs text-[var(--brand-500)] hover:underline">{aberto ? 'fechar' : 'abrir'}</button>
                          )}
                        </span>
                        <span className={`text-mono tabular-nums text-right ${soma > 0 ? 'text-emerald-500' : 'text-[var(--surface-800)]'}`}>{soma > 0 ? '+' : '−'}{num(Math.abs(soma))}</span>
                      </div>
                      {aberto && ls.map(l => (
                        <div key={l.origem_id} className="grid grid-cols-[18px_1fr_auto] gap-2 py-0.5 pl-5 text-xs text-[var(--surface-500)]">
                          <span className={conc.has(l.origem_id) ? 'text-emerald-500' : 'text-amber-500'}>{conc.has(l.origem_id) ? '✓' : '•'}</span>
                          <span className="truncate">{l.descricao}</span>
                          <span className="text-mono text-right">{Number(l.valor) > 0 ? '+' : '−'}{num(Math.abs(Number(l.valor)))}</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[var(--surface-200)]">
        {onImportar && (
          <button onClick={() => onImportar(card.conta_id)} className="btn-primary text-sm">
            {cartao ? 'Importar fatura deste cartão' : 'Importar extrato desta conta'}
          </button>
        )}
        <button onClick={() => setDias(x => x + 30)} className="ml-auto text-[13px] text-[var(--brand-500)] hover:underline">mostrar dias anteriores</button>
      </div>

      <ExtratoContaModal
        conta={editarMes ? { conta_id: card.conta_id, nome: card.nome, tipo: card.tipo, caixa_desde: card.caixa_desde } : null}
        mesInicial={editarMes || hojeISO().slice(0, 7)}
        onClose={() => setEditarMes(null)}
        podeEditar={podeEditar}
        onMudou={() => { void carregar(); onMudou() }}
      />
    </div>
  )
}

// ── VER AGENDA: a esteira da maquininha ─────────────────────────────────────
function VerAgenda({ card }: { card: Card }) {
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, [])
  const [pags, setPags] = useState<PagamentoCartao[] | null>(null)
  const calibrada = contaCalibrada(card.nome)

  useEffect(() => {
    if (!calibrada) return
    void (async () => {
      // 13 meses pra trás cobre o parcelado em até 12× que ainda cai.
      const desde = somaDias(hojeISO(), -400)
      const todos: PagamentoCartao[] = []
      for (let off = 0; ; off += 1000) {
        const { data } = await supabase.from('pagamentos').select('id, conta_id, data_pagamento, valor, valor_liquido, metodo, parcelas')
          .eq('conta_id', card.conta_id).in('metodo', ['credito', 'debito']).gte('data_pagamento', desde)
          .order('id').range(off, off + 999)
        const pg = (data as PagamentoCartao[] | null) || []
        todos.push(...pg)
        if (pg.length < 1000) break
      }
      setPags(todos)
    })()
  }, [supabase, card.conta_id, calibrada])

  const hoje = hojeISO()
  const futuro = useMemo(() => (pags ? montarEsteira(pags).filter(r => r.previstoEm > hoje) : []), [pags, hoje])
  const previsto = c2(futuro.reduce((a, r) => a + r.valor, 0))
  const fimMes = `${hoje.slice(0, 7)}-31`
  const dias = useMemo(() => {
    const m = new Map<string, { v: number; n: number }>()
    for (const r of futuro) if (r.previstoEm <= fimMes) { const x = m.get(r.previstoEm) || { v: 0, n: 0 }; m.set(r.previstoEm, { v: x.v + r.valor, n: x.n + 1 }) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [futuro, fimMes])
  const meses = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of futuro) m.set(r.previstoEm.slice(0, 7), (m.get(r.previstoEm.slice(0, 7)) || 0) + r.valor)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [futuro])
  const maxMes = Math.max(1, ...meses.map(([, v]) => v))
  const ultimo = meses.length ? meses[meses.length - 1][0] : null
  const dif = c2(card.saldo - previsto)

  if (!calibrada) {
    return <p className="text-sm text-[var(--surface-500)] py-6">A previsão ainda não foi conferida contra o extrato desta maquininha — por isso não aparece. O saldo a receber é <span className="text-mono text-[var(--surface-800)]">{fmtBRL(card.saldo)}</span>.</p>
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-3 border-b border-[var(--surface-200)]">
        <div className="flex flex-col"><span className="text-xs text-[var(--surface-500)]">A receber (vendido e não depositado)</span><span className="text-mono text-lg tabular-nums text-sky-500">{num(card.saldo)}</span></div>
        <div className="flex flex-col"><span className="text-xs text-[var(--surface-500)]">Previsto daqui pra frente</span><span className="text-mono text-lg tabular-nums">{pags ? num(previsto) : '…'}</span>
          {pags && ultimo && <span className="text-xs text-[var(--surface-500)]">{futuro.length.toLocaleString('pt-BR')} parcelas, até {MESES[Number(ultimo.slice(5, 7)) - 1]}/{ultimo.slice(0, 4)}</span>}</div>
        <div className="flex flex-col"><span className="text-xs text-[var(--surface-500)]">Diferença</span>
          <span className={`text-mono text-lg tabular-nums ${Math.abs(dif) < 0.005 ? 'text-emerald-500' : 'text-amber-500'}`}>{pags ? num(Math.abs(dif)) : '…'}</span>
          {pags && Math.abs(dif) >= 0.005 && <span className="text-xs text-[var(--surface-500)]">{dif > 0 ? 'já devia ter caído — confira no próximo extrato' : 'caiu mais do que o previsto'}</span>}</div>
      </div>
      {!pags ? (
        <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--surface-400)]" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[1.15fr_1fr] gap-6">
          <section>
            <p className="text-[11px] font-semibold tracking-[.14em] uppercase text-[var(--surface-500)] mb-1">Próximos dias · {MESES[Number(hoje.slice(5, 7)) - 1]}</p>
            {!dias.length && <p className="text-sm text-[var(--surface-500)] py-2">Nada previsto até o fim do mês.</p>}
            {dias.map(([d, x]) => (
              <div key={d} className="grid grid-cols-[84px_1fr_auto] gap-2 py-1.5 text-sm border-b border-[var(--surface-100)]">
                <span className="text-[var(--surface-700)]">{rotuloDia(d)}</span>
                <span className="text-xs text-[var(--surface-500)] self-center">{x.n} {x.n === 1 ? 'parcela' : 'parcelas'}</span>
                <span className="text-mono tabular-nums text-right text-sky-500">{num(c2(x.v))}</span>
              </div>
            ))}
            <p className="text-xs text-[var(--surface-500)] pt-2">Dia sem banco (fim de semana, feriado) cai no próximo dia útil.</p>
          </section>
          <section className="space-y-2">
            <p className="text-[11px] font-semibold tracking-[.14em] uppercase text-[var(--surface-500)] mb-1">Por mês</p>
            {meses.map(([m, v]) => (
              <div key={m} className="grid grid-cols-[56px_1fr_96px] gap-2 items-center text-[13px]">
                <span className="text-[var(--surface-700)]">{MESES[Number(m.slice(5, 7)) - 1]}/{m.slice(2, 4)}</span>
                <span className="h-2.5 rounded-full bg-sky-500/15 relative overflow-hidden"><span className="absolute inset-y-0 left-0 rounded-full bg-sky-500" style={{ width: `${(v / maxMes) * 100}%` }} /></span>
                <span className="text-mono tabular-nums text-right">{num(c2(v))}</span>
              </div>
            ))}
            <p className="text-xs text-[var(--surface-500)] pt-1">Mês corrente: só o que ainda falta.</p>
          </section>
        </div>
      )}
      <p className="text-xs text-[var(--surface-500)] pt-2 border-t border-[var(--surface-200)]">
        Previsão: crédito cai a cada 30 dias da venda, por parcela; débito no dia útil seguinte — regra conferida contra
        o extrato. É informação: o saldo só baixa quando o depósito aparece no extrato.
      </p>
    </div>
  )
}
