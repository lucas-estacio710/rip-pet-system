'use client'

// OS TRÊS CARTÕES DE BAIXO DA VISÃO DO MÊS (14/10/2026, pedido do Lucas):
//   · BalancoMes      — o CAIXA do mês: entrou × saiu das contas, a ponte do saldo do começo
//                       ao fim do mês e o que sobrou nos últimos 6 meses (lib/balanco-caixa.ts).
//                       Era o resultado por competência até 14/10/2026 — repetia a DRE.
//   · LancamentosDoMes — as despesas do mês agrupadas pelo 2º nível da árvore de categorias,
//                       abrindo pro 3º nível e daí pra cada lançamento (descrição/observação).
//   · FaturasDoMes    — as compras no cartão cuja FATURA vence no mês, por cartão, com o que já
//                       foi conferido com a fatura (✓) e os atalhos de pré-lançamento e OFX.

import { useFinanceiroVersao } from '@/lib/financeiro-eventos'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ChevronRight, Trash2 } from 'lucide-react'
import { fmtBRL } from '@/lib/financeiro'
import { filtroContasDe } from '@/hooks/useCaixaConjunto'
import { EtiquetaUnidade } from './DonoLancamento'
import { classificarCaixa, SEM_CATEGORIA, type BalancoCaixa, type CompraFatura, type ItemCaixa, type LinhaCaixa, type MovInfo } from '@/lib/balanco-caixa'
import { useCoresContas, rotuloConta, estiloConta } from '@/lib/cor-conta'

const c2 = (n: number) => Math.round(n * 100) / 100
const num = (v: number) => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const k1 = (v: number) => (Math.abs(v) / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const brlK = (v: number) => (Math.abs(v) >= 10000 ? `R$ ${k1(v)}k` : fmtBRL(Math.abs(v)))
const MES_AB = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const somaMes = (m: string, d: number) => { const x = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + d, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}` }
const fimDoMes = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10)
const titulo = 'text-[11px] font-semibold tracking-[.14em] uppercase text-[var(--surface-500)]'

const CORES_GRUPO: Record<string, string> = {
  'Clientes (Pix e dinheiro)': '#10b981', 'Maquininha (liquidações)': '#34d399', 'Repasse das unidades': '#2dd4bf',
  'Aportes e empréstimos': '#38bdf8', 'Transferências recebidas': '#60a5fa',
  [SEM_CATEGORIA]: '#f59e0b', Cremação: '#a78bfa', 'Devoluções a clientes': '#fda4af', Pessoal: '#f472b6', Operacional: '#fb923c',
  Administrativo: '#60a5fa', Comercial: '#e879f9', Financeiro: '#38bdf8', Impostos: '#fbbf24', Investimentos: '#94a3b8', Sócios: '#f87171',
}
const corGrupo = (n: string) => CORES_GRUPO[n] || '#94a3b8'

/** Variação contra o mês anterior, com seta e cor (saída subindo é ruim). */
function Delta({ atual, antes, inverte = false }: { atual: number; antes: number | null; inverte?: boolean }) {
  if (antes === null || Math.abs(antes) < 0.005) return <span className="text-[11px] text-[var(--surface-400)]">sem mês anterior</span>
  const pct = ((atual - antes) / Math.abs(antes)) * 100
  if (Math.abs(pct) < 0.5) return <span className="text-[11px] text-[var(--surface-500)]">= igual ao mês anterior</span>
  const bom = inverte ? pct < 0 : pct > 0
  return <span className={`text-[11px] font-semibold ${bom ? 'text-emerald-500' : 'text-red-400'}`}>{pct > 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}% <span className="font-normal text-[var(--surface-500)]">vs mês anterior</span></span>
}

type DadosCaixa = { porMes: Map<string, BalancoCaixa>; inicio: number; fim: number; semContas: boolean; nomeConta: Map<string, string> }
export type Bruto = {
  linhas: LinhaCaixa[]; saldo: Map<string, number>; reservas: Set<string>; nomeConta: Map<string, string>
  base: { maquininhas: Set<string>; movs: Map<string, MovInfo>; categoriaDe: Map<string, string>; comprasDaFatura: Map<string, CompraFatura[]>; conferidos: Set<string> }
}

/** O balanço de caixa do mês a partir da busca, pelo conjunto de contas (todas · só as disponíveis). */
export function caixaDoMes(bruto: Bruto | null, mes: string, modo: 'todas' | 'disponiveis'): DadosCaixa | null {
  if (!bruto) return null
  const contas = new Set([...bruto.saldo.keys()].filter(id => modo === 'todas' || !bruto.reservas.has(id)))
  if (!contas.size) return { porMes: new Map(), inicio: 0, fim: 0, semContas: true, nomeConta: bruto.nomeConta }
  const ctx = { contasCaixa: contas, ...bruto.base, guardadas: modo === 'disponiveis' ? bruto.reservas : undefined }
  const linhas = bruto.linhas.filter(l => contas.has(l.conta_id))
  const porMes = new Map<string, BalancoCaixa>()
  for (let k = -5; k <= 0; k++) {
    const m = somaMes(mes, k)
    porMes.set(m, classificarCaixa(linhas.filter(l => l.data.slice(0, 7) === m), ctx))
  }
  const atual = [...contas].reduce((a, id) => a + (bruto.saldo.get(id) || 0), 0)
  const fm = fimDoMes(mes)
  const depois = linhas.filter(l => l.data > fm).reduce((a, l) => a + Number(l.valor), 0)
  const noMes = linhas.filter(l => l.data.slice(0, 7) === mes).reduce((a, l) => a + Number(l.valor), 0)
  const fim = c2(atual - depois)
  return { porMes, inicio: c2(fim - noMes), fim, semContas: false, nomeConta: bruto.nomeConta }
}

/** A busca do caixa do mês (6 meses pra trás até hoje), compartilhada pelo Balanço e pelo A conferir. */
export function useCaixaDoMes(sb: SupabaseClient, uid: string | undefined, mes: string, ids?: string[], recarga = 0): Bruto | null {
  const [bruto, setBruto] = useState<Bruto | null>(null)
  const versaoFin = useFinanceiroVersao()   // gravou algo no financeiro → recarrega
  // RECARGA SILENCIOSA (15/10/2026): mudou de MÊS/unidade → limpa (e a tela escurece carregando);
  // mudou só a versão (alguém gravou) → mantém o que está na tela e troca quando chegar.
  const chave = `${uid}|${mes}|${(ids || []).join(',')}`
  const ultimaChave = useRef<string | null>(null)
  useEffect(() => {
    if (!uid) return
    let vivo = true
    void (async () => {
      if (ultimaChave.current !== chave) setBruto(null)
      ultimaChave.current = chave
      const [{ data: sd }, { data: cts }, { data: cats }] = await Promise.all([
        sb.from('vw_caixa_saldo').select('conta_id, tipo, produto, saldo, legado, mostrar_no_caixa').or(filtroContasDe(ids?.length ? ids : [uid])),
        sb.from('contas').select('id, produto, nome, reserva'),
        sb.from('fin_categorias').select('id, nome, parent_id'),
      ])
      // as contas do caixa = as do "Saldo das Contas" (sem maquininha nem cartão)
      const caixa = new Set<string>()
      const saldo = new Map<string, number>()
      for (const x of (sd as { conta_id: string; tipo: string; produto: string | null; saldo: number; legado: boolean; mostrar_no_caixa: boolean | null }[] | null) || []) {
        if (x.legado || x.mostrar_no_caixa === false || x.produto === 'maquininha' || x.tipo === 'cartao' || x.produto === 'cartao_credito') continue
        caixa.add(x.conta_id); saldo.set(x.conta_id, Number(x.saldo) || 0)
      }
      const nomeConta = new Map(((cts as { id: string; nome: string }[] | null) || []).map(c => [c.id, c.nome]))
      const reservas = new Set(((cts as { id: string; reserva?: boolean | null }[] | null) || []).filter(c => c.reserva && caixa.has(c.id)).map(c => c.id))
      if (!caixa.size) { if (vivo) setBruto({ linhas: [], saldo, reservas, nomeConta, base: { maquininhas: new Set(), movs: new Map(), categoriaDe: new Map(), comprasDaFatura: new Map(), conferidos: new Set() } }); return }
      const maquininhas = new Set(((cts as { id: string; produto: string | null }[] | null) || []).filter(c => c.produto === 'maquininha').map(c => c.id))
      // de 6 meses atrás até HOJE: o que veio depois do mês leva o saldo de hoje de volta ao do fim do mês
      const linhas: LinhaCaixa[] = []
      for (let off = 0; ; off += 1000) {
        const { data } = await sb.from('vw_caixa').select('conta_id, data, tipo, valor, origem, origem_id, descricao, unidade_id')
          .in('conta_id', [...caixa]).gte('data', `${somaMes(mes, -5)}-01`).order('data').order('origem_id').range(off, off + 999)
        const pg = (data as LinhaCaixa[] | null) || []
        linhas.push(...pg)
        if (pg.length < 1000) break
      }
      const movIds = [...new Set(linhas.filter(l => l.origem === 'movimento').map(l => l.origem_id))]
      const lancIds = [...new Set(linhas.filter(l => l.origem === 'lancamento').map(l => l.origem_id))]
      const movs = new Map<string, MovInfo>()
      const quitou = new Set<string>()
      const faturas: { id: string; cartao: string; venc: string }[] = []
      const catDoLanc = new Map<string, string | null>()
      const detalheLanc = new Map<string, (string | null)[]>()   // fornecedor · descrição · observação
      for (let i = 0; i < movIds.length; i += 150) {
        const fatia = movIds.slice(i, i + 150)
        const [{ data: ms }, { data: rs }] = await Promise.all([
          sb.from('fin_movimentos').select('id, tipo, conta_id, conta_destino_id, repasse_id, fatura_vencimento, data').in('id', fatia),
          sb.from('fin_repasses').select('pago_movimento_id').in('pago_movimento_id', fatia),
        ])
        for (const r of (rs as { pago_movimento_id: string }[] | null) || []) quitou.add(r.pago_movimento_id)
        for (const m of (ms as { id: string; tipo: string; conta_id: string | null; conta_destino_id: string | null; repasse_id: string | null; fatura_vencimento: string | null; data: string }[] | null) || []) {
          movs.set(m.id, { tipo: m.tipo, conta_id: m.conta_id, conta_destino_id: m.conta_destino_id, repasse: !!m.repasse_id })
          // a fatura = as compras do cartão com data_caixa no vencimento (sem o vencimento gravado, o dia do pagamento)
          if (m.tipo === 'fatura_cartao' && m.conta_destino_id) faturas.push({ id: m.id, cartao: m.conta_destino_id, venc: (m.fatura_vencimento || m.data).slice(0, 10) })
        }
      }
      quitou.forEach(id => { const m = movs.get(id); if (m) m.repasse = true })
      for (let i = 0; i < lancIds.length; i += 150) {
        const { data } = await sb.from('fin_lancamentos').select('id, categoria_id, fornecedor_nome, descricao, observacoes').in('id', lancIds.slice(i, i + 150))
        for (const l of (data as { id: string; categoria_id: string | null; fornecedor_nome: string | null; descricao: string | null; observacoes: string | null }[] | null) || []) {
          catDoLanc.set(l.id, l.categoria_id)
          detalheLanc.set(l.id, [l.fornecedor_nome, l.descricao, l.observacoes])
        }
      }
      // o grupo do lançamento = o 1º nível da árvore (Pessoal, Operacional, Sócios…)
      const porCat = new Map(((cats as { id: string; nome: string; parent_id: string | null }[] | null) || []).map(c => [c.id, c]))
      const raiz = (id: string | null | undefined) => { let c = id ? porCat.get(id) : undefined; let g = 0; while (c?.parent_id && g++ < 8) c = porCat.get(c.parent_id); return c?.nome }
      const categoriaDe = new Map<string, string>()
      catDoLanc.forEach((cat, id) => { const r = raiz(cat); if (r) categoriaDe.set(id, r) })
      // as compras de cada fatura paga — cada uma no seu grupo
      const comprasDaFatura = new Map<string, CompraFatura[]>()
      for (const f of faturas) {
        const { data } = await sb.from('fin_lancamentos').select('id, unidade_id, valor, data_competencia, descricao, fornecedor_nome, conta_nome, categoria_id, observacoes')
          .eq('conta_pagamento_id', f.cartao).eq('data_caixa', f.venc).in('status', ['pendente', 'aprovado'])
        comprasDaFatura.set(f.id, ((data as { id: string; unidade_id: string | null; valor: number; data_competencia: string; descricao: string | null; fornecedor_nome: string | null; conta_nome: string | null; categoria_id: string | null; observacoes: string | null }[] | null) || [])
          .map(l => ({ id: l.id, valor: Number(l.valor), data: l.data_competencia.slice(0, 10), descricao: [...new Set([l.descricao || l.conta_nome, l.fornecedor_nome, l.observacoes].map(x => x?.trim()).filter(Boolean))].join(' · ') || 'Compra no cartão', grupo: raiz(l.categoria_id) || null, unidade_id: l.unidade_id })))
      }

      // CONFERIDO COM O BANCO (14/10/2026): a linha que já bateu com o extrato. Mesma regra do
      // calendário: o que é de ANTES da 1ª conciliação daquela conta conta como conferido (não há
      // como conciliar), e conta que nunca conciliou (ex.: Dinheiro, que não tem extrato) também.
      const conc = new Set<string>(), inicioConc = new Map<string, string>(), textoBanco = new Map<string, string>()
      for (let off = 0; ; off += 1000) {
        const { data } = await sb.from('fin_conciliacoes').select('conta_id, origem_id, data_banco, texto_banco').in('conta_id', [...caixa]).range(off, off + 999)
        const pg = (data as { conta_id: string; origem_id: string; data_banco: string | null; texto_banco: string | null }[] | null) || []
        for (const c of pg) {
          conc.add(c.origem_id)
          if (c.texto_banco && !c.texto_banco.startsWith('conferido à mão')) textoBanco.set(c.origem_id, c.texto_banco.trim())
          const d = (c.data_banco || '9999-12-31').slice(0, 10)
          if (!inicioConc.has(c.conta_id) || d < inicioConc.get(c.conta_id)!) inicioConc.set(c.conta_id, d)
        }
        if (pg.length < 1000) break
      }
      // DESCRIÇÃO COMPLETA (14/10/2026): o nome do sistema + o texto do extrato + fornecedor,
      // descrição e observação do lançamento — sem repetir o que já está dito
      for (const l of linhas) {
        const base = (l.descricao || l.tipo || '').trim()
        const extra = [textoBanco.get(l.origem_id), ...(detalheLanc.get(l.origem_id) || [])]
          .map(x => x?.trim()).filter((x): x is string => !!x && !base.toLowerCase().includes(x.toLowerCase()))
        if (extra.length) l.descricao = [base, ...new Set(extra)].filter(Boolean).join(' · ')
      }
      const conferidos = new Set<string>()
      for (const l of linhas) if (conc.has(l.origem_id) || l.data < (inicioConc.get(l.conta_id) || '9999-12-31')) conferidos.add(l.origem_id)
      if (vivo) setBruto({ linhas, saldo, reservas, nomeConta, base: { maquininhas, movs, categoriaDe, comprasDaFatura, conferidos } })
    })()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, uid, mes, ids, recarga, versaoFin])
  return bruto
}


// BALANÇO DE CAIXA (14/10/2026 — "aqui falamos de caixa, se não estaremos repetindo a info"):
// era o resultado por competência (vw_dre_resumo), que é a DRE de novo. Agora é o dinheiro
// que entrou e saiu das contas do "Saldo das Contas" no mês — regra em lib/balanco-caixa.ts.
export function BalancoMes({ bruto, mes, marco = null, onEditar, onLancar, onExtrato, letra, onExcluir }: {
  /** lixeira na linha do lançamento (pré-lançamento); devolve o motivo se não pôde */
  onExcluir?: (lancamentoId: string) => Promise<string | null>
  bruto: Bruto | null; mes: string; marco?: string | null
  /** caixa conjunto: a etiqueta M/P da unidade dona de cada linha */
  letra?: (unidadeId: string | null | undefined) => string
  /** os atalhos do "Sem categoria": abrir o lançamento · lançar a compra que falta · ver no extrato da conta */
  onEditar?: (lancamentoId: string) => void; onLancar?: () => void; onExtrato?: (contaId: string) => void
}) {
  // TODAS AS CONTAS × CONTAS DISPONÍVEIS (14/10/2026): as disponíveis deixam de fora as guardadas
  // (reserva / sem liquidez) — aí ir pro investimento é saída e o resgate é entrada.
  const [modo, setModo] = useState<'todas' | 'disponiveis'>('todas')
  // cada grupo da ponte abre e mostra as linhas dele (14/10/2026); o "Sem categoria" nasce aberto
  const [abertos, setAbertos] = useState<Set<string>>(new Set([`s:${SEM_CATEGORIA}`, `e:${SEM_CATEGORIA}`]))
  // descrição numa linha; clique/toque abre o texto inteiro (14/10/2026)
  const [textoAberto, setTextoAberto] = useState<Set<string>>(new Set())
  const [excluindo, setExcluindo] = useState<string | null>(null)   // 1º clique arma, 2º exclui

  // o cálculo, pelo conjunto de contas escolhido no toggle
  const dados = useMemo(() => caixaDoMes(bruto, mes, modo), [bruto, modo, mes])

  const atual = dados?.porMes.get(mes)
  const pendentes = useMemo(() => {
    // a fatura conta como UMA pendência (é um pagamento só no banco)
    const its = atual ? [...atual.entradas, ...atual.saidas].flatMap(g => g.itens).filter(i => !i.conciliado) : []
    const porLinha = new Map<string, number>()
    for (const i of its) porLinha.set(i.fatura ? `f:${i.fatura.id}` : `${i.origem_id}|${i.data}`, i.fatura ? i.fatura.valor : (porLinha.get(`${i.origem_id}|${i.data}`) || 0) + i.valor)
    return { qtd: porLinha.size, valor: c2([...porLinha.values()].reduce((a, v) => a + v, 0)) }
  }, [atual])
  const mAntes = somaMes(mes, -1)
  // o mês de antes do marco zero (mig 167) não é comparação — é passado não auditado
  const antes = marco && mAntes < marco ? null : dados?.porMes.get(mAntes) || null
  const sobrou = atual ? c2(atual.entrou - atual.saiu) : 0
  const meses6 = Array.from({ length: 6 }, (_, i) => somaMes(mes, i - 5)).filter(m => !marco || m >= marco)
  const varDe = (m: string) => { const b = dados?.porMes.get(m); return b ? c2(b.entrou - b.saiu) : 0 }
  const max6 = Math.max(1, ...meses6.map(m => Math.abs(varDe(m))))
  const ehHoje = mes === new Date().toISOString().slice(0, 7)

  // a ponte do saldo: começou com → + cada entrada → − cada saída → (ajustes) → terminou com
  const ponte: { nome: string; de: number; ate: number; cor: string; sinal: string; forte?: boolean; chave?: string; itens?: ItemCaixa[] }[] = []
  if (atual && dados) {
    let r = dados.inicio
    ponte.push({ nome: 'Começou com', de: 0, ate: r, cor: '#64748b', sinal: '', forte: true })
    for (const g of atual.entradas) { ponte.push({ nome: g.nome, de: r, ate: r + g.valor, cor: corGrupo(g.nome), sinal: '+', chave: `e:${g.nome}`, itens: g.itens }); r += g.valor }
    for (const g of atual.saidas) { ponte.push({ nome: g.nome, de: r, ate: r - g.valor, cor: corGrupo(g.nome), sinal: '−', chave: `s:${g.nome}`, itens: g.itens }); r -= g.valor }
    if (Math.abs(atual.ajustes) >= 0.005) { ponte.push({ nome: 'Ajustes de saldo', de: r, ate: r + atual.ajustes, cor: '#94a3b8', sinal: atual.ajustes > 0 ? '+' : '−' }); r += atual.ajustes }
    ponte.push({ nome: ehHoje ? 'Hoje' : 'Terminou com', de: 0, ate: dados.fim, cor: dados.fim >= dados.inicio ? '#10b981' : '#f87171', sinal: '=', forte: true })
  }
  const escala = Math.max(1, ...ponte.map(b => Math.max(b.de, b.ate)))

  return (
    <div className="card p-4 sm:p-5 min-w-0">
      <div className="flex items-baseline gap-2">
        <span className={titulo}>Balanço do Caixa no Mês</span>
        {bruto && bruto.reservas.size > 0 && (
          <span className="ml-auto inline-flex rounded-full border border-[var(--surface-300)] p-0.5 text-[11.5px]">
            {([['todas', 'Todas as contas'], ['disponiveis', 'Contas disponíveis']] as const).map(([k, t]) => (
              <button key={k} type="button" onClick={() => setModo(k)}
                      className={`px-2.5 py-0.5 rounded-full transition-colors ${modo === k ? 'bg-[var(--brand-500)] text-white' : 'text-[var(--surface-500)] hover:text-[var(--surface-800)]'}`}>{t}</button>
            ))}
          </span>
        )}
      </div>
      {pendentes.qtd > 0 && (
        <p className="mt-2 rounded-[8px] border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-[12px] text-[var(--surface-700)]">
          🔵 {pendentes.qtd} sem conciliar ({fmtBRL(pendentes.valor)})
        </p>
      )}
      {dados === null ? <p className="text-sm text-[var(--surface-500)] py-6">carregando…</p>
      : dados.semContas ? <p className="text-sm text-[var(--surface-500)] py-6">Nenhuma conta no caixa desta unidade.</p>
      : !atual || (!atual.entradas.length && !atual.saidas.length && Math.abs(atual.ajustes) < 0.005) ? <p className="text-sm text-[var(--surface-500)] py-6">Nenhum dinheiro entrou ou saiu das contas neste mês.</p> : (<>
        {/* 1) os três números do caixa, cada um com a variação */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
          <div><span className="block text-xs text-[var(--surface-500)]">Entrou nas contas</span>
            <span className="block text-mono text-2xl tabular-nums text-[var(--surface-900)]" title={fmtBRL(atual.entrou)}>{brlK(atual.entrou)}</span>
            <Delta atual={atual.entrou} antes={antes ? antes.entrou : null} /></div>
          <div><span className="block text-xs text-[var(--surface-500)]">Saiu das contas</span>
            <span className="block text-mono text-2xl tabular-nums text-[var(--surface-900)]" title={fmtBRL(atual.saiu)}>{brlK(atual.saiu)}</span>
            <Delta atual={atual.saiu} antes={antes ? antes.saiu : null} inverte /></div>
          <div><span className="block text-xs text-[var(--surface-500)]">Sobrou no caixa</span>
            <span className={`block text-mono text-2xl tabular-nums ${sobrou >= 0 ? 'text-emerald-500' : 'text-red-400'}`} title={fmtBRL(sobrou)}>{sobrou < 0 ? '−' : ''}{brlK(sobrou)}</span>
            <Delta atual={sobrou} antes={antes ? c2(antes.entrou - antes.saiu) : null} /></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5 mt-5">
          {/* 2) a ponte: do saldo do começo do mês ao do fim, entrada por entrada, saída por saída */}
          <div className="space-y-1.5 min-w-0">
            <span className="text-xs text-[var(--surface-500)]">Do saldo do começo ao do fim do mês</span>
            {ponte.map((b, i) => {
              const lo = Math.max(0, Math.min(b.de, b.ate)), hi = Math.max(0, Math.max(b.de, b.ate))
              const aberto = !!b.chave && abertos.has(b.chave)
              const sem = b.nome === SEM_CATEGORIA
              return (
                <div key={i} className="min-w-0">
                  <div onClick={b.chave ? () => setAbertos(a => { const n = new Set(a); if (n.has(b.chave!)) n.delete(b.chave!); else n.add(b.chave!); return n }) : undefined}
                       className={`grid grid-cols-[130px_1fr_auto] gap-2 items-center text-[12px] ${b.chave ? 'cursor-pointer hover:bg-[var(--surface-50)] rounded' : ''}`}>
                    <span className={`truncate flex items-center gap-1 ${b.forte ? 'font-semibold text-[var(--surface-800)]' : sem ? 'font-semibold text-amber-500' : 'text-[var(--surface-600)]'}`} title={b.nome}>
                      {b.chave && <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${aberto ? 'rotate-90' : ''}`} />}
                      <span className="truncate">{b.nome}{sem && b.itens ? ` (${b.itens.length})` : ''}</span>
                      {b.itens && b.itens.some(i => !i.conciliado) && <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-sky-500" title={`${b.itens.filter(i => !i.conciliado).length} a conferir com o extrato`} />}
                    </span>
                    <span className="relative h-3.5 rounded bg-[var(--surface-100)] overflow-hidden">
                      <span className="absolute top-0 bottom-0 rounded" style={{ left: `${(lo / escala) * 100}%`, width: `${Math.max(0.5, ((hi - lo) / escala) * 100)}%`, background: b.cor }} />
                    </span>
                    <span className="text-mono tabular-nums text-[var(--surface-700)] w-[92px] text-right">{b.sinal} {num(b.forte ? b.ate : b.ate - b.de)}</span>
                  </div>
                  {aberto && b.itens && (
                    <div className={`ml-4 my-1 min-w-0 overflow-hidden rounded-[8px] border ${sem ? 'border-amber-500/40 bg-amber-500/5' : 'border-[var(--surface-200)]'} divide-y divide-[var(--surface-200)]`}>
                      {sem && <p className="px-2.5 py-1.5 text-[11px] text-amber-600">Dinheiro que andou sem estar lançado com categoria. Resolva cada um pelo botão da linha.</p>}
                      {b.itens.map((it, k) => {
                        // atalho SÓ no "Sem categoria" (14/10/2026, Lucas): no que já está categorizado,
                        // abrir daqui só servia pra mudar conta/data/categoria sem querer
                        // abrir o lançamento (15/10/2026): conciliado só deixa trocar a categoria;
                        // pré-lançamento edita à vontade — a trava mora no próprio formulário
                        const acao = it.acao === 'editar' && onEditar ? { t: sem ? 'categorizar ›' : it.conciliado ? 'editar categoria' : 'editar', f: () => onEditar(it.origem_id) }
                          : !sem ? null
                          : it.acao === 'lancar' && onLancar ? { t: 'lançar a compra ›', f: onLancar }
                          : it.acao === 'extrato' && onExtrato ? { t: 'ver no extrato ›', f: () => onExtrato(it.conta_id) }
                          : null
                        return (
                          <div key={k} className="flex items-start gap-2 px-2.5 py-1 text-[11.5px]">
                            <span className={`shrink-0 mt-[5px] h-1.5 w-1.5 rounded-full ${it.conciliado ? 'bg-emerald-500' : 'bg-sky-500'}`} title={it.conciliado ? 'Conferido com o extrato' : 'Pré-lançamento: falta bater com o extrato'} />
                            <span className="text-[var(--surface-500)] tabular-nums shrink-0">{it.data.slice(8, 10)}/{it.data.slice(5, 7)}</span>
                            {letra && <EtiquetaUnidade letra={letra(it.unidade_id)} />}
                            <span onClick={() => setTextoAberto(a => { const n = new Set(a), id = `${b.chave}|${k}`; if (n.has(id)) n.delete(id); else n.add(id); return n })}
                                  className={`flex-1 min-w-0 cursor-pointer text-[var(--surface-700)] ${textoAberto.has(`${b.chave}|${k}`) ? 'whitespace-normal break-words' : 'truncate'}`}
                                  title="Clique para ver a descrição inteira">
                              {it.descricao}<span className="text-[var(--surface-400)]"> · {dados?.nomeConta.get(it.conta_id) || 'conta'}</span>
                            </span>
                            <span className="text-mono tabular-nums text-[var(--surface-700)] shrink-0">{num(it.valor)}</span>
                            {acao && <button onClick={acao.f} className="text-[11px] text-[var(--brand-500)] hover:underline shrink-0 whitespace-nowrap">{acao.t}</button>}
                            {/* lixeira: só no lançamento que ainda não bateu com o banco (as travas finais moram em lib/excluir-lancamento) */}
                            {onExcluir && it.acao === 'editar' && !it.conciliado && (
                              <button title={excluindo === it.origem_id ? 'Clique de novo pra excluir' : 'Excluir este pré-lançamento'}
                                      onClick={async () => { if (excluindo !== it.origem_id) return setExcluindo(it.origem_id); setExcluindo(null); await onExcluir(it.origem_id) }}
                                      className={`shrink-0 rounded px-1 ${excluindo === it.origem_id ? 'bg-red-500 text-white text-[11px]' : 'text-[var(--surface-400)] hover:text-red-400'}`}>
                                {excluindo === it.origem_id ? 'excluir?' : <Trash2 className="h-3.5 w-3.5" />}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            {Math.abs(atual.ajustes) >= 0.005 && <p className="text-[11px] text-[var(--surface-500)] pt-1">Ajuste de saldo é correção do que o sistema sabia (ex.: o ajuste inicial da conta) — não é dinheiro que entrou nem saiu.</p>}
          </div>
          {/* 3) a tendência: quanto sobrou no caixa em cada um dos últimos 6 meses */}
          <div>
            <span className="text-xs text-[var(--surface-500)]">Sobrou no caixa · últimos 6 meses</span>
            <div className="flex items-end gap-2 h-28 mt-2">
              {meses6.map(m => {
                const v = varDe(m)
                return (
                  <div key={m} className="flex-1 flex flex-col items-center justify-end gap-1 h-full" title={`${MES_AB[Number(m.slice(5, 7)) - 1]}: ${fmtBRL(v)}`}>
                    <span className={`text-[10px] text-mono ${v >= 0 ? 'text-[var(--surface-500)]' : 'text-red-400'}`}>{v ? `${v < 0 ? '−' : ''}${k1(v)}k` : ''}</span>
                    <span className="w-full rounded-t" style={{ height: `${Math.max(2, (Math.abs(v) / max6) * 70)}%`, background: v >= 0 ? (m === mes ? '#10b981' : '#10b98166') : '#f87171' }} />
                    <span className={`text-[10px] ${m === mes ? 'font-semibold text-[var(--surface-800)]' : 'text-[var(--surface-500)]'}`}>{MES_AB[Number(m.slice(5, 7)) - 1]}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </>)}
    </div>
  )
}

type Cat = { id: string; nome: string; parent_id: string | null }
type Lanc = { id: string; valor: number; categoria_id: string | null; fornecedor_nome: string | null; descricao: string | null; observacoes: string | null; data_competencia: string; conta_nome: string | null }

export function LancamentosDoMes({ sb, uid, mes, onEditar }: { sb: SupabaseClient; uid: string | undefined; mes: string; onEditar?: (id: string) => void }) {
  // duas leituras (14/10/2026): por CATEGORIA (a árvore, do maior pro menor) ou por DIA (crescente)
  const [modo, setModo] = useState<'categoria' | 'dia'>('categoria')
  const [lancs, setLancs] = useState<Lanc[] | null>(null)
  const [cats, setCats] = useState<Map<string, Cat>>(new Map())
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  // bolinha verde = lançamento conciliado com o extrato/fatura (14/10/2026)
  const [conc, setConc] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!uid) return
    let vivo = true
    void Promise.all([
      sb.from('fin_lancamentos').select('id, valor, categoria_id, fornecedor_nome, descricao, observacoes, data_competencia, conta_nome')
        .eq('unidade_id', uid).neq('status', 'rejeitado').gte('data_competencia', `${mes}-01`).lte('data_competencia', fimDoMes(mes)).limit(2000),
      sb.from('fin_categorias').select('id, nome, parent_id'),
    ]).then(([l, c]) => {
      if (!vivo) return
      setCats(new Map(((c.data as Cat[] | null) || []).map(x => [x.id, x])))
      const ls = (l.data as Lanc[] | null) || []
      setLancs(ls)
      void (async () => {
        const ok = new Set<string>()
        for (let i = 0; i < ls.length; i += 200) {
          const { data: cc } = await sb.from('fin_conciliacoes').select('origem_id').eq('origem', 'lancamento').in('origem_id', ls.slice(i, i + 200).map(x => x.id))
          for (const r of (cc as { origem_id: string }[] | null) || []) ok.add(r.origem_id)
        }
        if (vivo) setConc(ok)
      })()
    })
    return () => { vivo = false }
  }, [sb, uid, mes])

  // árvore: nível 1 › nível 2 (o grupo) › nível 3 (o item) › lançamentos
  const arvore = useMemo(() => {
    const cadeia = (id: string | null) => { const out: Cat[] = []; let x = id ? cats.get(id) : undefined; while (x) { out.unshift(x); x = x.parent_id ? cats.get(x.parent_id) : undefined } return out }
    const g2 = new Map<string, { nome: string; pai: string; total: number; filhos: Map<string, { nome: string; total: number; itens: Lanc[] }> }>()
    for (const l of lancs || []) {
      const c = cadeia(l.categoria_id)
      // SEM CATEGORIA = perna de acerto entre unidades, criada pelo sistema só com a conta
      // contábil (9.1.x). Agrupa por ela em vez de cair num "Sem categoria" mudo.
      const semCat = !c.length
      const n1 = semCat ? (l.conta_nome ? 'Acertos entre unidades' : 'Sem categoria') : c[0].nome
      const n2 = c[1] || c[0], n3 = c[2] || c[c.length - 1]
      const k2 = semCat ? `conta:${l.conta_nome || 'sem'}` : n2.id, k3 = semCat ? k2 : n3.id
      const grp = g2.get(k2) || { nome: semCat ? (l.conta_nome || 'Sem categoria') : n2.nome, pai: n1, total: 0, filhos: new Map() }
      const sub = grp.filhos.get(k3) || { nome: semCat ? (l.conta_nome || '—') : n3.nome, total: 0, itens: [] }
      sub.total = c2(sub.total + Number(l.valor)); sub.itens.push(l); grp.filhos.set(k3, sub)
      grp.total = c2(grp.total + Number(l.valor)); g2.set(k2, grp)
    }
    // 1º nível por cima (14/10/2026): cada um com a soma, do maior pro menor
    const g1 = new Map<string, { total: number; grupos: [string, typeof g2 extends Map<string, infer V> ? V : never][] }>()
    for (const e of g2.entries()) {
      const x = g1.get(e[1].pai) || { total: 0, grupos: [] }
      x.total = c2(x.total + e[1].total); x.grupos.push(e); g1.set(e[1].pai, x)
    }
    for (const x of g1.values()) x.grupos.sort((a, b) => b[1].total - a[1].total)
    return [...g1.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [lancs, cats])
  const total = c2((lancs || []).reduce((a, l) => a + Number(l.valor), 0))
  const nomeCat = (l: Lanc) => (l.categoria_id && cats.get(l.categoria_id)?.nome) || l.conta_nome || 'Sem categoria'
  const alterna = (k: string) => setAbertos(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  return (
    <div className="card p-4 flex flex-col">
      <div className="flex items-baseline gap-2">
        <span className={titulo}>Lançamentos</span>
        <span className="text-xs text-[var(--surface-500)]">{lancs ? `${lancs.length} · ${fmtBRL(total)}` : ''}</span>
        <span className="ml-auto inline-flex rounded-full border border-[var(--surface-300)] p-0.5 text-[11px]">
          {(['categoria', 'dia'] as const).map(m => (
            <button key={m} onClick={() => setModo(m)}
                    className={`px-2 py-0.5 rounded-full ${modo === m ? 'bg-[var(--brand-500)] text-white' : 'text-[var(--surface-500)] hover:text-[var(--surface-800)]'}`}>
              {m === 'categoria' ? 'Por categoria' : 'Por dia'}
            </button>
          ))}
        </span>
      </div>
      {lancs === null ? <p className="text-sm text-[var(--surface-500)] py-4">carregando…</p> : !arvore.length ? <p className="text-sm text-[var(--surface-500)] py-4">Nenhum lançamento neste mês.</p> : modo === 'dia' ? (
        <div className="mt-2 flex flex-col">
          {[...(lancs || [])].sort((a, b) => a.data_competencia.localeCompare(b.data_competencia)).map((l, i, arr) => {
            const novoDia = i === 0 || arr[i - 1].data_competencia.slice(0, 10) !== l.data_competencia.slice(0, 10)
            const doDia = arr.filter(x => x.data_competencia.slice(0, 10) === l.data_competencia.slice(0, 10))
            return (
              <div key={l.id}>
                {novoDia && (
                  <div className="flex justify-between px-1 pt-2 pb-1 border-b border-[var(--surface-200)] text-[11px] font-semibold text-[var(--surface-500)]">
                    <span>{l.data_competencia.slice(8, 10)}/{l.data_competencia.slice(5, 7)}</span>
                    <span className="text-mono">{num(doDia.reduce((a, x) => a + Number(x.valor), 0))}</span>
                  </div>
                )}
                <button onClick={() => onEditar?.(l.id)} disabled={!onEditar}
                        className="w-full grid grid-cols-[1fr_auto] gap-2 py-1.5 px-1 text-[12.5px] text-left hover:bg-[var(--surface-50)] disabled:hover:bg-transparent">
                  <span className="min-w-0 truncate text-[var(--surface-700)]" title={[l.fornecedor_nome, l.descricao, l.observacoes].filter(Boolean).join(' · ')}>
                    {conc.has(l.id) ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5 align-middle shrink-0" title="Conciliado com o banco/fatura" /> : <span className="inline-block w-1.5 mr-1.5" />}
                    {nomeCat(l)}<span className="text-[var(--surface-400)]"> · {l.fornecedor_nome || l.descricao || l.observacoes || '—'}</span>
                  </span>
                  <span className={`text-mono tabular-nums ${Number(l.valor) < 0 ? 'text-emerald-500' : 'text-[var(--surface-800)]'}`}>{Number(l.valor) < 0 ? '−' : ''}{num(Number(l.valor))}</span>
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-3">
          {arvore.map(([n1, bloco]) => (
          <div key={n1}>
            <div className="flex items-baseline justify-between px-1 pb-1 border-b border-[var(--surface-200)]">
              <span className="text-[11px] font-semibold tracking-[.1em] uppercase text-[var(--surface-500)]">{n1}</span>
              <span className="text-mono text-[13px] font-semibold tabular-nums text-[var(--surface-900)]">{num(bloco.total)}</span>
            </div>
          {bloco.grupos.map(([k2, g]) => (
            <div key={k2} className="border-b border-[var(--surface-100)] last:border-0">
              <button onClick={() => alterna(k2)} className="w-full grid grid-cols-[16px_1fr_auto] gap-2 items-center py-2 text-left hover:bg-[var(--surface-50)]">
                <ChevronRight className={`h-3.5 w-3.5 text-[var(--surface-400)] transition-transform ${abertos.has(k2) ? 'rotate-90' : ''}`} />
                <span className="text-sm text-[var(--surface-800)] truncate">{g.nome}</span>
                <span className="text-mono text-sm tabular-nums text-[var(--surface-800)]">{num(g.total)}</span>
              </button>
              {abertos.has(k2) && [...g.filhos.entries()].sort((a, b) => b[1].total - a[1].total).map(([k3, sub]) => (
                <div key={k3} className="pl-5">
                  <button onClick={() => alterna(`${k2}|${k3}`)} className="w-full grid grid-cols-[16px_1fr_auto] gap-2 items-center py-1.5 text-left hover:bg-[var(--surface-50)]">
                    <ChevronRight className={`h-3 w-3 text-[var(--surface-400)] transition-transform ${abertos.has(`${k2}|${k3}`) ? 'rotate-90' : ''}`} />
                    <span className="text-[13px] text-[var(--surface-700)] truncate">{sub.nome} <span className="text-[var(--surface-400)]">· {sub.itens.length}</span></span>
                    <span className="text-mono text-[13px] tabular-nums text-[var(--surface-700)]">{num(sub.total)}</span>
                  </button>
                  {abertos.has(`${k2}|${k3}`) && sub.itens.sort((a, b) => a.data_competencia.localeCompare(b.data_competencia)).map(l => (
                    <div key={l.id} onClick={() => onEditar?.(l.id)} className={`pl-5 grid grid-cols-[40px_1fr_auto] gap-2 py-1 text-[12px] rounded ${onEditar ? 'cursor-pointer hover:bg-[var(--surface-50)]' : ''}`}>
                      <span className="text-mono text-[var(--surface-400)]">{l.data_competencia.slice(8, 10)}/{l.data_competencia.slice(5, 7)}</span>
                      <span className="min-w-0 truncate text-[var(--surface-600)]" title={[l.fornecedor_nome, l.descricao, l.observacoes].filter(Boolean).join(' · ')}>
                        {conc.has(l.id) ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5 align-middle shrink-0" title="Conciliado com o banco/fatura" /> : <span className="inline-block w-1.5 mr-1.5" />}
                        {l.fornecedor_nome || '—'}{(l.descricao || l.observacoes) ? <span className="text-[var(--surface-400)]"> · {l.descricao || l.observacoes}</span> : null}
                      </span>
                      <span className={`text-mono tabular-nums ${Number(l.valor) < 0 ? 'text-emerald-500' : 'text-[var(--surface-700)]'}`}>{Number(l.valor) < 0 ? '−' : ''}{num(Number(l.valor))}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
          </div>
          ))}
        </div>
      )}
    </div>
  )
}

type Compra = { id: string; valor: number; data_competencia: string; data_caixa: string; fornecedor_nome: string | null; observacoes: string | null; conta_pagamento_id: string }

export function FaturasDoMes({ sb, uid, mes, onImportarConta, unidades }: {
  unidades?: string[]
  sb: SupabaseClient; uid: string | undefined; mes: string
  onImportarConta?: (contaId: string) => void
}) {
  const cores = useCoresContas()
  const [cartoes, setCartoes] = useState<{ id: string; nome: string }[]>([])
  const [compras, setCompras] = useState<Compra[] | null>(null)
  const [pagas, setPagas] = useState<Set<string>>(new Set())
  const versaoFin = useFinanceiroVersao()
  const [conc, setConc] = useState<Set<string>>(new Set())
  const [aberto, setAberto] = useState<string | null>(null)
  useEffect(() => {
    if (!uid) return
    let vivo = true
    void (async () => {
      const { data: cs } = await sb.from('contas').select('id, nome, tipo, produto').or(filtroContasDe(unidades?.length ? unidades : [uid])).eq('ativo', true).eq('legado', false)
      const cards = ((cs as { id: string; nome: string; tipo: string | null; produto: string | null }[] | null) || []).filter(c => c.tipo === 'cartao' || c.produto === 'cartao_credito')
      const ids = cards.map(c => c.id)
      let lista: Compra[] = [], pg = new Set<string>(), ok = new Set<string>()
      if (ids.length) {
        const [{ data: ls }, { data: mv }] = await Promise.all([
          sb.from('fin_lancamentos').select('id, valor, data_competencia, data_caixa, fornecedor_nome, observacoes, conta_pagamento_id')
            .in('conta_pagamento_id', ids).neq('status', 'rejeitado').gte('data_caixa', `${mes}-01`).lte('data_caixa', fimDoMes(mes)).limit(1000),
          sb.from('fin_movimentos').select('conta_destino_id, fatura_vencimento').eq('tipo', 'fatura_cartao').in('conta_destino_id', ids).not('fatura_vencimento', 'is', null),
        ])
        lista = (ls as Compra[] | null) || []
        pg = new Set(((mv as { conta_destino_id: string; fatura_vencimento: string }[] | null) || []).map(p => `${p.conta_destino_id}|${p.fatura_vencimento.slice(0, 10)}`))
        for (let i = 0; i < lista.length; i += 200) {
          const { data: cc } = await sb.from('fin_conciliacoes').select('origem_id').eq('origem', 'lancamento').in('origem_id', lista.slice(i, i + 200).map(l => l.id))
          for (const c of (cc as { origem_id: string }[] | null) || []) ok.add(c.origem_id)
        }
      }
      if (vivo) { setCartoes(cards.map(c => ({ id: c.id, nome: c.nome }))); setCompras(lista); setPagas(pg); setConc(ok) }
    })()
    return () => { vivo = false }
  }, [sb, uid, mes, unidades, versaoFin])

  // uma fatura = cartão + vencimento
  const faturas = useMemo(() => {
    const m = new Map<string, { cartao: string; venc: string; itens: Compra[]; total: number }>()
    for (const l of compras || []) {
      const k = `${l.conta_pagamento_id}|${l.data_caixa.slice(0, 10)}`
      const f = m.get(k) || { cartao: l.conta_pagamento_id, venc: l.data_caixa.slice(0, 10), itens: [], total: 0 }
      f.itens.push(l); f.total = c2(f.total + Number(l.valor)); m.set(k, f)
    }
    return [...m.entries()].sort((a, b) => a[1].venc.localeCompare(b[1].venc))
  }, [compras])
  const nomeCartao = (id: string) => cartoes.find(c => c.id === id)?.nome || 'Cartão'

  return (
    <div className="card p-4 flex flex-col">
      <div className="flex items-baseline gap-2">
        <span className={titulo}>Faturas do cartão</span>
        <span className="text-xs text-[var(--surface-500)]">vencem neste mês</span>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {onImportarConta && cartoes.map(c => (
          <button key={c.id} onClick={() => onImportarConta(c.id)} className="text-[12px] px-3 py-1.5 rounded-full border border-[var(--brand-500)]/50 text-[var(--brand-500)] hover:bg-[var(--brand-500)]/10">
            {/* ninguém tem OFX de fatura: entra pelo PDF (lib/fatura-pdf.ts — por ora o formato do Inter) */}
            Importar fatura · {rotuloConta(cores, c.id, c.nome)}
          </button>
        ))}
      </div>
      {compras === null ? <p className="text-sm text-[var(--surface-500)] py-4">carregando…</p>
        : !cartoes.length ? <p className="text-sm text-[var(--surface-500)] py-4">Nenhum cartão cadastrado.</p>
        : !faturas.length ? <p className="text-sm text-[var(--surface-500)] py-4">Nenhuma fatura vence neste mês.</p>
        : faturas.map(([k, f]) => {
          const paga = pagas.has(k)
          const nConc = f.itens.filter(i => conc.has(i.id)).length
          return (
            <div key={k} className="mt-3 rounded-[10px] border border-[var(--surface-200)] overflow-hidden" style={estiloConta(cores.get(f.cartao))}>
              <button onClick={() => setAberto(aberto === k ? null : k)} className="w-full grid grid-cols-[16px_1fr_auto] gap-2 items-center px-3 py-2.5 text-left">
                <ChevronRight className={`h-3.5 w-3.5 text-[var(--surface-400)] transition-transform ${aberto === k ? 'rotate-90' : ''}`} />
                <span className="min-w-0 flex flex-col">
                  <span className="text-sm text-[var(--surface-800)] truncate">{nomeCartao(f.cartao)} · vence {f.venc.slice(8, 10)}/{f.venc.slice(5, 7)}</span>
                  <span className="text-[11px] text-[var(--surface-500)]">
                    {f.itens.length} compras · {nConc === f.itens.length ? <span className="text-emerald-500">✓ todas conferidas com a fatura</span> : <span className="text-amber-500">{f.itens.length - nConc} em pré-lançamento</span>}
                    {paga ? <span className="text-emerald-500"> · paga</span> : null}
                  </span>
                </span>
                <span className="text-mono text-sm tabular-nums text-[var(--surface-900)]">{num(f.total)}</span>
              </button>
              {aberto === k && (
                <div className="px-3 pb-2">
                  {f.itens.sort((a, b) => a.data_competencia.localeCompare(b.data_competencia)).map(l => (
                    <div key={l.id} className="grid grid-cols-[14px_40px_1fr_auto] gap-2 py-1 text-[12px] border-t border-[var(--surface-100)]">
                      <span className="flex items-center" title={conc.has(l.id) ? 'conferida com a fatura' : 'pré-lançamento — falta conferir com a fatura'}>
                        <span className={`h-1.5 w-1.5 rounded-full ${conc.has(l.id) ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                      </span>
                      <span className="text-mono text-[var(--surface-400)]">{l.data_competencia.slice(8, 10)}/{l.data_competencia.slice(5, 7)}</span>
                      <span className="truncate text-[var(--surface-600)]" title={l.observacoes || ''}>{l.fornecedor_nome || l.observacoes || '—'}</span>
                      <span className={`text-mono tabular-nums ${Number(l.valor) < 0 ? 'text-emerald-500' : 'text-[var(--surface-700)]'}`}>{Number(l.valor) < 0 ? '−' : ''}{num(Number(l.valor))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
    </div>
  )
}

// A CONFERIR (14/10/2026) — substitui o card "Lançamentos": não repete o Balanço, é a FILA do que
// falta resolver no caixa do mês. (1) o que entrou no caixa e ainda não bateu com o extrato
// (pré-lançamento), por conta, com o atalho de importar o extrato dela; (2) o "Sem categoria".
export function AConferir({ bruto, mes, onEditar, onImportarConta, onLancar, onExtrato, letra }: {
  bruto: Bruto | null; mes: string
  letra?: (unidadeId: string | null | undefined) => string
  onEditar?: (lancamentoId: string) => void; onImportarConta?: (contaId: string) => void
  onLancar?: () => void; onExtrato?: (contaId: string) => void
}) {
  const atual = useMemo(() => caixaDoMes(bruto, mes, 'todas')?.porMes.get(mes) || null, [bruto, mes])
  const itens = atual ? [...atual.entradas.map(g => ({ g, e: true })), ...atual.saidas.map(g => ({ g, e: false }))]
    .flatMap(({ g, e }) => g.itens.map(i => ({ ...i, grupo: g.nome, entrada: e }))) : []
  // a fatura é UM pagamento no banco: as compras dela, pendentes, viram uma linha só (14/10/2026)
  const pend: typeof itens = []
  const faturaVista = new Set<string>()
  for (const i of itens.filter(x => !x.conciliado)) {
    if (!i.fatura) { pend.push(i); continue }
    if (faturaVista.has(i.fatura.id)) continue
    faturaVista.add(i.fatura.id)
    const n = itens.filter(x => x.fatura?.id === i.fatura!.id).length
    pend.push({ ...i, data: i.fatura.data, descricao: `${i.fatura.descricao} — pagamento da fatura (${n} compras)`, valor: i.fatura.valor, origem_id: i.fatura.id, acao: 'extrato', grupo: 'Fatura do cartão' })
  }
  const sem = itens.filter(i => i.grupo === SEM_CATEGORIA && i.conciliado)
  const porConta = new Map<string, typeof pend>()
  for (const i of pend) porConta.set(i.conta_id, [...(porConta.get(i.conta_id) || []), i])
  const nome = (id: string) => bruto?.nomeConta.get(id) || 'conta'
  const linha = (i: (typeof itens)[number], k: number) => {
    const acao = i.acao === 'editar' && onEditar ? { t: i.grupo === SEM_CATEGORIA ? 'categorizar ›' : 'editar ›', f: () => onEditar(i.origem_id) }
      : i.acao === 'lancar' && onLancar ? { t: 'lançar a compra ›', f: onLancar }
      : i.acao === 'extrato' && onExtrato ? { t: 'ver no extrato ›', f: () => onExtrato(i.conta_id) }
      : null
    return (
      <div key={k} className="flex items-center gap-2 px-2.5 py-1 text-[12px]">
        <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${i.conciliado ? 'bg-emerald-500' : 'bg-sky-500'}`} />
        <span className="text-[var(--surface-500)] tabular-nums shrink-0">{i.data.slice(8, 10)}/{i.data.slice(5, 7)}</span>
        {letra && !i.fatura && <EtiquetaUnidade letra={letra(i.unidade_id)} />}
        <span className="flex-1 min-w-0 truncate text-[var(--surface-700)]" title={`${i.descricao} · ${i.grupo}`}>{i.descricao}<span className="text-[var(--surface-400)]"> · {i.grupo}</span></span>
        <span className={`text-mono tabular-nums shrink-0 ${i.entrada ? 'text-emerald-500' : 'text-[var(--surface-700)]'}`}>{i.entrada ? '+' : '−'}{num(i.valor)}</span>
        {acao && <button onClick={acao.f} className="text-[11px] text-[var(--brand-500)] hover:underline shrink-0 whitespace-nowrap">{acao.t}</button>}
      </div>
    )
  }
  return (
    <div className="card p-4 sm:p-5 min-w-0">
      <span className={titulo}>A conferir</span>
      {!bruto ? <p className="text-sm text-[var(--surface-500)] py-4">carregando…</p>
      : !pend.length && !sem.length ? <p className="text-sm text-emerald-500 py-4">Tudo conferido neste mês ✓</p> : (
        <div className="space-y-3 mt-3">
          {[...porConta].map(([conta, its]) => (
            <div key={conta} className="rounded-[8px] border border-sky-500/40">
              <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-sky-500/30 bg-sky-500/5">
                <span className="text-[12.5px] font-semibold text-[var(--surface-800)] flex-1 min-w-0 truncate">{nome(conta)}</span>
                <span className="text-[11px] text-sky-600 shrink-0">{its.length} sem bater com o extrato</span>
                {onImportarConta && <button onClick={() => onImportarConta(conta)} className="text-[11px] text-[var(--brand-500)] hover:underline shrink-0 whitespace-nowrap">importar extrato ›</button>}
              </div>
              <div className="divide-y divide-[var(--surface-200)]">{its.map(linha)}</div>
            </div>
          ))}
          {sem.length > 0 && (
            <div className="rounded-[8px] border border-amber-500/40">
              <div className="px-2.5 py-1.5 border-b border-amber-500/30 bg-amber-500/5 text-[12.5px] font-semibold text-amber-600">{SEM_CATEGORIA} ({sem.length})</div>
              <div className="divide-y divide-[var(--surface-200)]">{sem.map(linha)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
