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

import CobrancasCard from './CobrancasCard'
import ReceitasPrazoTab from './ReceitasPrazoTab'
import { BalancoMes, AConferir, FaturasDoMes, useCaixaDoMes } from './VisaoBlocos'
import Modal from '@/components/ui/Modal'
import { useCoresContas, rotuloConta, estiloConta } from '@/lib/cor-conta'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Loader2 } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useUnit } from '@/contexts/UnitContext'
import { fmtBRL, fmtData, limitesDoMes, hojeISO } from '@/lib/financeiro'
import { mesParaData } from '@/lib/repasse'
import ExtratoContaModal from './ExtratoContaModal'
import type { AcaoLancar } from '@/lib/lancar'
import { useContasFixas, CalendarioContasModal, CalendarioHoje, curto, type ContaNoMes } from './ContasDoMes'
import ContaFixaModal, { type ContaFixa } from './ContaFixaModal'
import GerenciarContasModal, { type RascunhoConta } from './GerenciarContasModal'
import { carregarEsteira } from './ProximosDias'
import { diaUtil } from '@/lib/vencimentos'

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
// O BALANÇO DO MÊS abrevia a partir de 10 mil (Lucas, 11/10: "apertado com centavos" → R$ 40,5k).
// O valor cheio fica no `title` de cada número.
const k1 = (v: number) => (Math.abs(v) / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const numK = (v: number) => (Math.abs(v) >= 10000 ? `${k1(v)}k` : num(v))
const brlK = (v: number) => (Math.abs(v) >= 10000 ? `R$ ${k1(v)}k` : fmtBRL(Math.abs(v)))

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

export default function VisaoMesTab({ mes, verResultado, verCaixa, verRepasse, verLancamentos, onIr, onLancar, onPaguei, onContasFaturas, onImportarConta, onEditarLancamento }: {
  mes: string
  verResultado: boolean
  verCaixa: boolean
  verRepasse: boolean
  verLancamentos: boolean
  onIr: (aba: string) => void
  onLancar?: (acao: AcaoLancar) => void
  /** Paguei de uma conta fixa: abre a despesa preenchida (ou a Quitação, no repasse). */
  onPaguei?: (x: ContaNoMes) => void
  /** Lançar OFX já numa conta (a fatura de um cartão, no cartão Faturas do cartão). */
  onImportarConta?: (contaId: string) => void
  /** Clicar num lançamento do cartão Lançamentos abre o Editar (Livro-Caixa, 14/10/2026). */
  onEditarLancamento?: (id: string) => void
  onContasFaturas?: () => void
}) {
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, [])
  const { currentUnit, userName } = useUnit()
  const cores = useCoresContas()
  const [carregando, setCarregando] = useState(false)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [qtdDespesas, setQtdDespesas] = useState(0)
  const [cards, setCards] = useState<CardConta[]>([])
  const [, setPend] = useState<Pendencia[]>([])
  const [extratoDe, setExtratoDe] = useState<ContaRow | null>(null)
  // CONTAS DO MÊS (mig 160) e o "disponível" de hoje.
  const fixas = useContasFixas(supabase, currentUnit?.id, !!currentUnit?.is_matriz, currentUnit?.financeiro_desde?.slice(0, 7) || null)
  const [saldos, setSaldos] = useState<{ disponivel: number; guardado: number; contas: { conta: ContaRow; saldo: number; guardada: boolean; virgem: boolean }[] } | null>(null)
  // INICIAR CONTA (14/10/2026): conta sem nenhum lançamento ganha o atalho pro AJUSTE
  // INICIAL — a abertura de caixa da mig 136 (caixa_desde + movimento de ajuste).
  const [iniciando, setIniciando] = useState<ContaRow | null>(null)
  const [iniData, setIniData] = useState('')
  const [iniSaldo, setIniSaldo] = useState('')
  const [iniSalvando, setIniSalvando] = useState(false)

  const [contaEditando, setContaEditando] = useState<ContaFixa | null | 'nova'>(null)
  const [calendarioAberto, setCalendarioAberto] = useState(false)
  const [gerenciarAberto, setGerenciarAberto] = useState(false)
  // RECEITAS A PRAZO (14/10/2026): o que a maquininha ainda vai depositar — hoje,
  // nos próximos 7 dias, até o fim do mês e no mês que vem. Previsão (esteira).
  const [esteira, setEsteira] = useState<Map<string, number> | null>(null)
  const [mesesPrazoAberto, setMesesPrazoAberto] = useState(false)
  const [abaPrazo, setAbaPrazo] = useState<'meses' | 'lista'>('meses')
  // ACERTOS ENTRE UNIDADES (14/10/2026): saiu a aba Lançamentos — a cobrança que
  // espera reconhecimento vira um aviso aqui, que abre o bloco num popup.
  const [nCobrancas, setNCobrancas] = useState(0)
  const [acertosAberto, setAcertosAberto] = useState(false)
  useEffect(() => {
    if (!currentUnit?.id) return
    let vivo = true
    void carregarEsteira(supabase, currentUnit.id).then(m => { if (vivo) setEsteira(m) })
    return () => { vivo = false }
  }, [supabase, currentUnit?.id])
  const [rascunho, setRascunho] = useState<RascunhoConta | null>(null)

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
      const { data: sd } = await supabase.from('vw_caixa_saldo').select('conta_id, nome, tipo, produto, saldo, legado, mostrar_no_caixa, caixa_desde, entradas, saidas')
        .or(`unidade_id.eq.${uid},unidades_extras.cs.{${uid}}`)
      let reservas = new Set<string>()
      const { data: rv, error: erv } = await supabase.from('contas').select('id').eq('reserva', true)
      if (!erv) reservas = new Set(((rv as { id: string }[] | null) || []).map(x => x.id))
      let disp = 0, guard = 0
      const porConta: { conta: ContaRow; saldo: number; guardada: boolean; virgem: boolean }[] = []
      for (const x of (sd as { conta_id: string; nome: string; tipo: string; produto: string | null; saldo: number; legado: boolean; mostrar_no_caixa: boolean | null; caixa_desde: string | null; entradas: number | null; saidas: number | null }[] | null) || []) {
        if (x.legado || x.mostrar_no_caixa === false || x.produto === 'maquininha' || x.tipo === 'cartao' || x.produto === 'cartao_credito') continue
        const guardada = reservas.has(x.conta_id)
        if (guardada) guard += Number(x.saldo) || 0
        else disp += Number(x.saldo) || 0
        porConta.push({ conta: { id: x.conta_id, nome: x.nome, tipo: x.tipo, produto: x.produto, caixa_desde: x.caixa_desde, mostrar_no_caixa: x.mostrar_no_caixa }, saldo: c2(Number(x.saldo) || 0), guardada, virgem: !x.caixa_desde && !Number(x.entradas) && !Number(x.saidas) && Math.abs(Number(x.saldo) || 0) < 0.005 })
      }
      // as que pagam primeiro, a guardada no fim; dentro de cada grupo, a maior antes
      porConta.sort((a, b) => Number(a.guardada) - Number(b.guardada) || b.saldo - a.saldo)
      setSaldos({ disponivel: c2(disp), guardado: c2(guard), contas: porConta })
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
    for (const rep of reps) {
      const jaPago = c2(pagoDe.get(rep.id) || 0)
      lista.push({
        chave: `rep-${rep.id}`, titulo: `Quitar o repasse de ${rotulo(rep.mes_referencia.slice(0, 7))}`,
        detalhe: `${rep.status === 'aberto' ? 'a Matriz ainda pode mexer' : 'fechado pela Matriz'} · ${rep.qtd_pets} pets${jaPago ? ` · pago ${fmtBRL(jaPago)}` : ''}`,
        valor: c2(Number(rep.total_liquido) - jaPago), acao: 'Quitar', atencao: true,
        onClick: () => onIr('repasse'),
      })
    }
    const nCob = (cb as { count: number | null }).count || 0
    setNCobrancas(nCob)
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
          chave: `imp-${k.conta.id}`, titulo: `Atualizar ${k.conta.nome}`,
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
  // a busca do caixa do mês: uma só, pro Balanço e pro A conferir (14/10/2026)
  const caixaBruto = useCaixaDoMes(supabase, currentUnit?.id, mes)
  // MÊS QUE JÁ PASSOU (14/10/2026): cada conta mostra "de (início) → para (fim do mês)".
  // Fim = saldo de hoje − o que andou depois do mês; início = fim − o que andou no mês.
  const [deParaMes, setDeParaMes] = useState<{ mes: string; m: Map<string, { de: number; para: number }> } | null>(null)
  const deParaConta = deParaMes?.mes === mes ? deParaMes.m : null
  useEffect(() => {
    if (emCurso || !saldos?.contas.length) return
    let vivo = true
    void (async () => {
      const ids = saldos.contas.map(k => k.conta.id)
      const { ini, fim } = limitesDoMes(mes)
      const depois = new Map<string, number>(), noMes = new Map<string, number>()
      for (let off = 0; ; off += 1000) {
        const { data } = await supabase.from('vw_caixa').select('conta_id, data, valor').in('conta_id', ids).gte('data', ini)
          .order('data').order('origem_id').range(off, off + 999)
        const pg = (data as { conta_id: string; data: string; valor: number }[] | null) || []
        for (const l of pg) { const alvo = l.data > fim ? depois : noMes; alvo.set(l.conta_id, (alvo.get(l.conta_id) || 0) + Number(l.valor)) }
        if (pg.length < 1000) break
      }
      if (!vivo) return
      setDeParaMes({ mes, m: new Map(saldos.contas.map(k => {
        const para = c2(k.saldo - (depois.get(k.conta.id) || 0))
        return [k.conta.id, { de: c2(para - (noMes.get(k.conta.id) || 0)), para }]
      })) })
    })()
    return () => { vivo = false }
  }, [emCurso, saldos, mes, supabase])
  // os atalhos do "Sem categoria" do Balanço: categorizar o lançamento, lançar a compra que a
  // fatura cobrou e ninguém lançou, ou abrir a conta no extrato (14/10/2026)
  const atalhosBalanco = {
    onEditar: onEditarLancamento,
    onLancar: onLancar ? () => onLancar('despesa') : undefined,
    onExtrato: (contaId: string) => { const k = saldos?.contas.find(x => x.conta.id === contaId); if (k) setExtratoDe(k.conta) },
  }

  const titulo = 'text-[11px] font-semibold tracking-[.14em] uppercase text-[var(--surface-500)]'
  const link = 'text-[13px] text-[var(--brand-500)] hover:underline text-left'

  // ── as contas do mês e o "hoje" ──
  const [anoN, mesN] = [Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1]
  const itensMes = fixas.doMes(anoN, mesN)
  const hojeS = hojeISO()
  const podeLancar = !!onPaguei
  const pagar = (x: ContaNoMes) => onPaguei?.(x)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const blocoMes = verResultado && (
    <div className="card p-4">
      <p className={titulo}>Balanço do mês</p>
      <div className="grid grid-cols-3 gap-3 my-3">
        <button onClick={() => onIr('dre')} className="text-left">
          <span className="block text-xs text-[var(--surface-500)]">Receita</span>
          <span className="text-mono text-xl tabular-nums text-[var(--surface-900)]" title={fmtBRL(entrou)}>{brlK(entrou)}</span>
        </button>
        <button onClick={() => (verLancamentos ? onIr('lancamentos') : onIr('dre'))} className="text-left">
          <span className="block text-xs text-[var(--surface-500)]">Custos</span>
          <span className="text-mono text-xl tabular-nums text-[var(--surface-900)]" title={fmtBRL(custou)}>{brlK(custou)}</span>
          <span className="block text-[11px] text-[var(--surface-500)]">em {qtdDespesas} {qtdDespesas === 1 ? 'saída' : 'saídas'}</span>
        </button>
        <button onClick={() => onIr('dre')} className="text-left">
          <span className="block text-xs text-[var(--surface-500)]">Resultado</span>
          <span className={`text-mono text-xl tabular-nums ${sobrou >= 0 ? 'text-emerald-500' : 'text-amber-500'}`} title={fmtBRL(sobrou)}>{sobrou < 0 ? '−' : ''}{brlK(sobrou)}</span>
        </button>
      </div>
      {grupos.length > 0 && (<>
        <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5">
          {grupos.map(g => <span key={g.campo} style={{ flex: g.valor, background: g.cor }} title={`${g.nome}: ${fmtBRL(g.valor)}`} />)}
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 mt-2">
          {grupos.map(g => (
            <span key={g.campo} className="text-xs text-[var(--surface-500)]">
              <span className="inline-block h-2 w-2 rounded-[2px] mr-1" style={{ background: g.cor }} />{g.nome} <span className="text-mono text-[var(--surface-700)]" title={fmtBRL(g.valor)}>{numK(g.valor)}</span> · {somaGrupos ? Math.round((g.valor / somaGrupos) * 100) : 0}%
            </span>
          ))}
        </div>
      </>)}
      {Number(resumo?.distribuicao) > 0 && (
        <p className="text-xs text-[var(--surface-500)] mt-2.5">Retiradas: {brlK(Number(resumo?.distribuicao))}, à parte do resultado.</p>
      )}
      <button onClick={() => onIr('dre')} className={`${link} mt-2.5`}>Ver a DRE ›</button>
    </div>
  )

  // "Precisa de você" saiu em 14/10/2026 (Lucas): o calendário e o Repasse já cobram
  // o que falta. As pendências seguem calculadas em `pend` caso voltem pra tela.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const blocoBanco = verCaixa && cards.length > 0 && (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`${titulo} mr-1`}>Sistema × banco</span>
      {cards.filter(k => !k.cartao).map(k => {
        const dif = k.banco && k.sistema !== null ? c2(k.banco.saldo - k.sistema) : null
        const bate = dif !== null && Math.abs(dif) < 0.005
        return (
          <button key={k.conta.id} onClick={() => setExtratoDe(k.conta)} className="card px-3 py-1.5 text-[12.5px] inline-flex items-center gap-2 hover:bg-[var(--surface-100)]">
            <b className="font-semibold text-[var(--surface-800)]">{rotuloConta(cores, k.conta.id, k.conta.nome)}</b>
            {!k.banco ? <span className="text-[var(--surface-500)]">{k.conferidoAte ? `conferido até ${fmtData(k.conferidoAte)}` : '• sem extrato'}</span>
              : bate ? <span className="text-emerald-500">✓ conferido {fmtData(k.banco.data)}</span>
              : <span className="text-amber-500">• banco ≠ sistema ({fmtBRL(Math.abs(dif!))})</span>}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-4 max-w-[1200px]">
      {/* CARREGANDO EM TELA CHEIA (14/10/2026, Lucas): a tela escurece e o círculo fica no meio,
          em vez do giro pequeno embaixo do título — até o resumo e o caixa do mês chegarem.
          Portal no body: algum ancestral com transform prenderia o `fixed`. */}
      {(carregando || (!!currentUnit?.id && !caixaBruto)) && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 backdrop-blur-[1px]" aria-busy="true" aria-label="Carregando">
          <Loader2 className="h-9 w-9 animate-spin text-white/90" />
        </div>,
        document.body,
      )}

      {/* HOJE — a COMISSÃO DE FRENTE (Lucas, 11/10: "é o abre-alas"). O saldo das contas em destaque e, ao lado, o CALENDÁRIO do mês
          (14/10/2026 — substituiu "Esta semana" e "Atrasado"): hoje em azul, uma
          bolinha por conta, verde/amarelo/vermelho/roxo (corDaConta). */}
      {/* aparece em TODO mês (14/10/2026): o saldo é sempre o de hoje; o calendário
          segue o mês escolhido no topo */}
      {/* MÊS QUE JÁ PASSOU (14/10/2026, Lucas): o saldo de HOJE e o que ainda vai entrar não
          fazem sentido olhando um mês fechado — fica só a lista das contas, cada uma abrindo o
          extrato DAQUELE mês (o ExtratoContaModal recebe mesInicial={mes}). */}
      {/* mês que já passou: o Balanço vem PRIMEIRO (14/10/2026, Lucas) — não há saldo de hoje nem calendário */}
      {verResultado && !emCurso && <BalancoMes bruto={caixaBruto} mes={mes} marco={currentUnit?.financeiro_desde?.slice(0, 7) || null} {...atalhosBalanco} />}
      {!emCurso ? (
        <div className="card p-4 text-center">
          <span className="text-sm text-[var(--surface-500)]">Contas</span>
          {saldos && saldos.contas.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {saldos.contas.map(k => {
                const dp = deParaConta?.get(k.conta.id)
                return (
                  <button key={k.conta.id} onClick={() => setExtratoDe(k.conta)} title={`Extrato de ${k.conta.nome} em ${mes.slice(5, 7)}/${mes.slice(0, 4)}`}
                          style={estiloConta(cores.get(k.conta.id), false)}
                          className="text-center rounded-[10px] border border-[var(--surface-200)] px-3 py-2 text-[12.5px] hover:border-[var(--brand-500)] hover:bg-[var(--surface-100)] transition-colors min-w-[170px]">
                    <span className="block text-[var(--surface-700)]">{k.conta.nome}</span>
                    <span className="block text-mono tabular-nums text-[12px] mt-0.5">
                      {dp ? (<>
                        <span className="text-[var(--surface-400)]">de </span><span className="text-[var(--surface-600)]">{fmtBRL(dp.de)}</span>
                        <span className="text-[var(--surface-400)]"> para </span>
                        <span className={dp.para > dp.de + 0.005 ? 'text-emerald-500' : dp.para < dp.de - 0.005 ? 'text-red-400' : 'text-[var(--surface-700)]'}>{fmtBRL(dp.para)}</span>
                      </>) : <span className="text-[var(--surface-400)]">…</span>}
                    </span>
                    <span className="block text-[11px] text-[var(--brand-500)] mt-0.5">ver extrato deste mês ›</span>
                  </button>
                )
              })}
            </div>
          ) : <p className="text-xs text-[var(--surface-400)] mt-1">{saldos ? 'Nenhuma conta.' : '…'}</p>}
        </div>
      ) : (
      <div className="card p-5 sm:p-7">
        {/* o calendário das contas só no MÊS ATUAL (14/10/2026, combinado com o Lucas);
            nos outros meses o saldo ocupa a linha toda */}
        <div className={`grid grid-cols-1 gap-6 md:gap-0 ${emCurso ? 'md:grid-cols-[minmax(0,1fr)_420px] md:divide-x md:divide-[var(--surface-200)]' : ''}`}>
          <div className="md:pr-8 flex flex-col gap-1.5">
            <span className="text-sm text-[var(--surface-500)]">Saldo das Contas</span>
            <span className="text-mono text-4xl sm:text-5xl tabular-nums tracking-tight text-[var(--surface-900)]">{saldos ? fmtBRL(saldos.disponivel) : '…'}</span>
            {saldos && saldos.guardado > 0.005 && (
              <span className="text-[13px] text-[var(--surface-500)]">fora isso, {fmtBRL(saldos.guardado)} investidos</span>
            )}
            {/* uma por conta (14/10/2026, pedido do Lucas): clicar abre o extrato dela */}
            {saldos && saldos.contas.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                {saldos.contas.map(k => (
                  <button key={k.conta.id} onClick={() => { if (k.virgem && podeLancar) { setIniciando(k.conta); setIniData(hojeS); setIniSaldo('') } else setExtratoDe(k.conta) }}
                          title={k.virgem ? `Iniciar ${k.conta.nome}: o primeiro lançamento é o ajuste inicial` : `Ver o extrato de ${k.conta.nome}`} style={estiloConta(cores.get(k.conta.id), false)}
                          className="text-left rounded-[10px] border border-[var(--surface-200)] px-3 py-2 hover:border-[var(--brand-500)] hover:bg-[var(--surface-100)] transition-colors">
                    {/* nome INTEIRO, quebrando linha (14/10/2026: no celular cortava bem onde se
                        identifica a conta — "Conta Inter · P…") */}
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-tight text-[var(--surface-500)]">
                      <span className="break-words">{k.conta.nome}</span>
                      {k.guardada && <span className="shrink-0 text-[10px] px-1.5 rounded-full bg-[var(--surface-100)]">sem liquidez</span>}
                    </span>
                    {k.virgem && podeLancar
                      ? <span className="block text-[13px] font-semibold text-[var(--surface-400)]">Iniciar conta ›</span>
                      : <span className={`block text-mono text-[15px] tabular-nums ${k.saldo < 0 ? 'text-red-400' : 'text-[var(--surface-900)]'}`}>{fmtBRL(k.saldo)}</span>}
                  </button>
                ))}
              </div>
            )}
            {onContasFaturas && <button onClick={onContasFaturas} className={`${link} mt-2`}>Ver saldo das contas ›</button>}
            {esteira && esteira.size > 0 && !currentUnit?.is_matriz && (() => {
              const d = new Date(`${hojeS}T12:00:00`)
              const fimMes = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).toISOString().slice(0, 10)
              const prox = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12).toISOString().slice(0, 7)
              const soma = (f: (dia: string) => boolean) => c2([...esteira].reduce((a, [dia, v]) => (f(dia) ? a + v : a), 0))
              // A 2ª faixa acompanha o calendário de pagamentos (Lucas, 14/10/2026):
              // antes do 5º dia útil → até ele; entre ele e o dia 20 → até o dia 20;
              // depois do dia 20 → até o 5º dia útil do mês que vem.
              const quintoUtil = (a: number, m0: number) => {
                let k = 0
                for (let dd = 1; dd <= 31; dd++) {
                  const s2 = `${a}-${String(m0 + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
                  if (diaUtil(s2) && ++k === 5) return s2
                }
                return `${a}-${String(m0 + 1).padStart(2, '0')}-07`
              }
              const q = quintoUtil(d.getFullYear(), d.getMonth())
              const dia20 = `${hojeS.slice(0, 7)}-20`
              const [rot2, ate2] = hojeS < q ? ['Até o 5º dia útil', q]
                : hojeS < dia20 ? ['Até dia 20', dia20]
                : ['Até o 5º dia útil', quintoUtil(d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear(), (d.getMonth() + 1) % 12)]
              const faixas: [string, number][] = [
                ['Hoje', soma(x => x === hojeS)],
                [`${rot2} (${ate2.slice(8, 10)}/${ate2.slice(5, 7)})`, soma(x => x > hojeS && x <= ate2)],
                ['Ainda este mês', soma(x => x > hojeS && x <= fimMes)],
                ['Próximo mês', soma(x => x.slice(0, 7) === prox)],
                // tudo o que a maquininha ainda vai pagar, de hoje em diante (14/10/2026)
                ['Total a receber', soma(x => x >= hojeS)],
              ]
              return (
                <div className="mt-4 pt-3 border-t border-[var(--surface-200)]">
                  <span className="text-sm text-[var(--surface-500)]">Receitas a Prazo <button onClick={() => setMesesPrazoAberto(true)} className="text-[12px] text-[var(--brand-500)] hover:underline">(ver todos os meses)</button></span>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
                    {faixas.map(([rot, v]) => (
                      <div key={rot} className="rounded-[10px] bg-[var(--surface-50)] px-3 py-2">
                        <span className="block text-[11px] text-[var(--surface-500)]">{rot}</span>
                        <span className="block text-mono text-[13px] tabular-nums text-emerald-500">+ {fmtBRL(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
          {emCurso && <div className="md:pl-8">
            <CalendarioHoje itens={itensMes} ano={anoN} mes0={mesN} podeLancar={podeLancar} onPaguei={pagar}
              onGerenciar={podeLancar ? () => setGerenciarAberto(true) : undefined}
              sb={supabase} uid={currentUnit?.id} onMudou={() => void fixas.carregar()} />
          </div>}
        </div>
      </div>
      )}

      {/* ordem de importância (Lucas, 14/10): saldo das contas → balanço do mês → ainda neste mês */}
      {/* MATRIZ (14/10/2026): a conta corrente é a mesma de Pinda e a única receita da
          Matriz é o repasse das unidades — a orientação fica à vista de quem opera */}
      {currentUnit?.is_matriz && (
        <div className="rounded-[12px] border border-[var(--brand-500)]/30 bg-[var(--brand-500)]/5 px-4 py-3 text-[13px] text-[var(--surface-700)] space-y-1">
          <p className="font-semibold text-[var(--surface-900)]">Financeiro da Matriz · conta corrente compartilhada com Pinda</p>
          <p>• <b>Lance e importe o extrato sempre por aqui</b> (Matriz) — a conta é uma só, e importar pelas duas unidades duplicaria tudo.</p>
          <p>• Custo que é de Pinda: <b>+ › Pré-lançamento › Despesa › 🏢 Parte é de outra unidade</b> — pode ser 100% (botão “100%”).</p>
          <p>• A receita da Matriz é só o <b>repasse das unidades</b>; as maquininhas são de Pinda.</p>
        </div>
      )}

      {nCobrancas > 0 && (
        <button onClick={() => setAcertosAberto(true)}
                className="w-full flex items-center gap-3 rounded-[12px] border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-left hover:bg-amber-500/15">
          <span>🔔</span>
          <span className="flex-1 text-sm text-[var(--surface-800)]"><b>{nCobrancas} {nCobrancas === 1 ? 'cobrança' : 'cobranças'}</b> de outra unidade esperando você reconhecer</span>
          <span className="text-[13px] font-semibold text-[var(--brand-500)]">Ver ›</span>
        </button>
      )}

      {/* os três cartões de baixo (14/10/2026): balanço novo + lançamentos + faturas */}
      {verResultado && emCurso && <BalancoMes bruto={caixaBruto} mes={mes} marco={currentUnit?.financeiro_desde?.slice(0, 7) || null} {...atalhosBalanco} />}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* "Lançamentos" saiu (14/10/2026): repetia o Balanço. No lugar, a fila do que falta conferir */}
        {verLancamentos && <AConferir bruto={caixaBruto} mes={mes} onEditar={onEditarLancamento} onImportarConta={onImportarConta} onLancar={atalhosBalanco.onLancar} onExtrato={atalhosBalanco.onExtrato} />}
        <FaturasDoMes sb={supabase} uid={currentUnit?.id} mes={mes} onPreLancar={onLancar ? () => onLancar('despesa') : undefined} onImportarConta={onImportarConta} />
      </div>

      {/* "Contas do mês" e "Precisa de você" saíram em 14/10/2026: o calendário do topo já mostra tudo */}
      {/* "Ainda neste mês" (ProximosDias) saiu da tela em 14/10/2026 — o componente segue no código */}

      {/* "Sistema × banco" saiu da tela em 14/10/2026 (blocoBanco segue montado no código) */}

      <CalendarioContasModal aberto={calendarioAberto} onClose={() => setCalendarioAberto(false)} mesInicial={mes}
        doMes={fixas.doMes} podeLancar={podeLancar}
        onPaguei={x => { setCalendarioAberto(false); pagar(x) }}
        onEditar={c => setContaEditando(c)} onNova={() => setContaEditando('nova')} />
      <ContaFixaModal aberto={contaEditando !== null} conta={contaEditando === 'nova' ? null : contaEditando} rascunho={contaEditando === 'nova' ? rascunho : null}
        onClose={() => { setContaEditando(null); setRascunho(null) }} onSalvou={() => void fixas.carregar()} />
      <GerenciarContasModal aberto={gerenciarAberto} onClose={() => setGerenciarAberto(false)} contas={fixas.contas}
        onEditar={c => { setGerenciarAberto(false); setContaEditando(c) }}
        onNova={r => { setGerenciarAberto(false); setRascunho(r); setContaEditando('nova') }} />

      {/* RECEITAS A PRAZO mês a mês (14/10/2026): o que a maquininha ainda vai depositar */}
      <Modal isOpen={acertosAberto} onClose={() => { setAcertosAberto(false); void carregar() }} title="Acertos entre unidades" size="xl">
        <CobrancasCard onMudou={() => void carregar()} />
      </Modal>

      <Modal isOpen={mesesPrazoAberto} onClose={() => setMesesPrazoAberto(false)} title="Receitas a Prazo" size={abaPrazo === 'lista' ? 'xl' : 'sm'}>
        {/* duas abas (14/10/2026): o que AINDA vai cair, mês a mês · e o que JÁ caiu (a antiga aba) */}
        <div className="flex gap-5 border-b border-[var(--surface-200)] mb-3">
          {([['meses', 'Mês a mês (a receber)'], ['lista', 'O que já caiu']] as const).map(([k, rot]) => (
            <button key={k} onClick={() => setAbaPrazo(k)}
                    className={`text-sm py-2 border-b-2 -mb-px ${abaPrazo === k ? 'font-semibold text-[var(--surface-900)] border-[var(--brand-500)]' : 'text-[var(--surface-500)] border-transparent'}`}>{rot}</button>
          ))}
        </div>
        {abaPrazo === 'lista' ? <ReceitasPrazoTab mes={mes} somenteLeitura={!onLancar} /> : (() => {
          const porMes = new Map<string, number>()
          for (const [dia, v] of esteira || []) if (dia >= hojeS) porMes.set(dia.slice(0, 7), (porMes.get(dia.slice(0, 7)) || 0) + v)
          const lista = [...porMes].sort((a, b) => a[0].localeCompare(b[0]))
          const total = c2(lista.reduce((a, [, v]) => a + v, 0))
          if (!lista.length) return <p className="text-sm text-[var(--surface-500)]">Nada a receber das maquininhas.</p>
          return (
            <div className="flex flex-col">
              <p className="text-xs text-[var(--surface-500)] mb-2">Previsão pelas vendas no cartão já feitas (a partir de hoje). Não entra no saldo.</p>
              {lista.map(([m, v]) => (
                <div key={m} className="flex justify-between py-2 border-b border-[var(--surface-100)] text-sm">
                  <span className="capitalize text-[var(--surface-700)]">{rotulo(m)}{m === hojeS.slice(0, 7) ? ' (a partir de hoje)' : ''}</span>
                  <span className="text-mono tabular-nums text-emerald-500">+ {fmtBRL(c2(v))}</span>
                </div>
              ))}
              <div className="flex justify-between pt-3 text-sm font-semibold">
                <span className="text-[var(--surface-800)]">Total a receber</span>
                <span className="text-mono tabular-nums text-emerald-500">+ {fmtBRL(total)}</span>
              </div>
            </div>
          )
        })()}
      </Modal>

      <Modal isOpen={iniciando !== null} onClose={() => setIniciando(null)} title={iniciando ? `Iniciar conta · ${iniciando.nome}` : ''} size="sm"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button onClick={() => setIniciando(null)} className="btn-secondary text-sm">Cancelar</button>
            <button disabled={iniSalvando} className="btn-primary text-sm" onClick={() => void (async () => {
              if (!iniciando || !currentUnit?.id) return
              const v = Number(iniSaldo.replace(/\./g, '').replace(',', '.'))
              if (iniSaldo.trim() === '' || Number.isNaN(v)) return
              setIniSalvando(true)
              const { error: e1 } = await supabase.from('contas').update({ caixa_desde: iniData }).eq('id', iniciando.id)
              const { error: e2 } = !e1 && Math.abs(v) >= 0.005
                ? await supabase.from('fin_movimentos').insert({ unidade_id: currentUnit.id, tipo: 'ajuste', conta_id: iniciando.id, conta_destino_id: null,
                    data: iniData, valor: Number(v.toFixed(2)), descricao: `Ajuste inicial · ${iniciando.nome}`, criado_por_nome: userName || null })
                : { error: null }
              setIniSalvando(false)
              if (e1 || e2) return
              setIniciando(null); void carregar()
            })()}>{iniSalvando ? 'Gravando…' : 'Iniciar conta'}</button>
          </div>
        }>
        <div className="space-y-3 text-sm">
          <p className="text-[var(--surface-600)]">O primeiro lançamento da conta é o <b>ajuste inicial</b>: o saldo que ela tinha no dia em que você começa a acompanhar. Daí pra frente, o saldo anda com cada lançamento.</p>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--surface-500)]">A partir de quando?</span>
            <input type="date" value={iniData} onChange={e => setIniData(e.target.value)} className="input w-full" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--surface-500)]">Saldo nesse dia (o que o banco mostra)</span>
            <input inputMode="decimal" value={iniSaldo} onChange={e => setIniSaldo(e.target.value)} placeholder="0,00" className="input w-full text-mono" />
          </label>
        </div>
      </Modal>

      <ExtratoContaModal
        conta={extratoDe ? { conta_id: extratoDe.id, nome: extratoDe.nome, tipo: extratoDe.tipo, caixa_desde: extratoDe.caixa_desde } : null}
        mesInicial={mes}
        onClose={() => setExtratoDe(null)}
      />
    </div>
  )
}
