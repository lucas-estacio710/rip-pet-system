'use client'

// CAIXA — "tenho dinheiro?" (migration 124).
//
// A DRE responde se a operação dá lucro; esta aba responde se há dinheiro. São
// perguntas diferentes e por isso duas telas: um mês pode fechar com lucro e
// caixa negativo (vendeu parcelado, pagou à vista).
//
// TRÊS ORIGENS, nenhuma digitada duas vezes (view `vw_caixa`):
//   1. `pagamentos`      → o que o tutor pagou, pelo valor LÍQUIDO (já sem a taxa)
//   2. `fin_lancamentos` → a despesa, na `data_caixa` — exceto a de conta CARTÃO
//   3. `fin_movimentos`  → transferência, fatura, aporte: move dinheiro e não é DRE
//
// ⚠️ TRÊS ESTADOS DO DINHEIRO, e só um deles é dinheiro de verdade:
//
//   DISPONÍVEL   conta corrente e dinheiro — dá pra gastar hoje
//   A RECEBER    MAQUININHA: vendeu no cartão, o adquirente ainda não liquidou
//   FATURA       CARTÃO DE CRÉDITO: gastou, ainda não pagou (dívida)
//
// As duas pontas são espelhadas, e pelo mesmo motivo — o dinheiro ainda não se
// moveu de verdade:
//   cartão      → a despesa NÃO sai do caixa; sai quando a fatura é paga
//   maquininha  → a receita NÃO entra no caixa; entra quando o adquirente liquida
//
// Somar maquininha no disponível superestima o caixa de quem vende no crédito,
// que é o caso aqui. A liquidação é uma transferência `Maquininha → corrente`.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  Loader2, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, CreditCard,
  Landmark, Wallet, Smartphone, Plus, Check,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import { fmtBRL, fmtData, hojeISO, limitesDoMes } from '@/lib/financeiro'
import {
  montarEsteira, retratoDaMaquininha, contaCalibrada,
  type PagamentoCartao, type RetratoMaquininha,
} from '@/lib/recebiveis'

type Saldo = {
  conta_id: string; nome: string; tipo: string; legado: boolean
  entradas: number; saidas: number; saldo: number
  unidade_id: string
  unidades_extras: string[] | null   // outras unidades que usam a conta (mig 128)
  produto: string | null             // maquininha / cartao_credito / … (mig 130)
  liquidacao_dias: number | null
  caixa_desde: string | null         // desde quando o extrato vale (mig 136)
  mostrar_no_caixa?: boolean         // aparece nesta tela? (mig 146)
}
type Linha = {
  conta_id: string; data: string; tipo: string
  descricao: string | null; valor: number; origem: string; origem_id: string
  unidade_origem: string | null   // de qual unidade é o CONTRATO (mig 126)
}

const mesAtual = () => new Date().toISOString().slice(0, 7)

/** Os movimentos que o usuário pode lançar, e como cada um se comporta. */
const TIPOS = [
  { v: 'transferencia', label: 'Transferência', destino: true,  ajuda: 'Entre contas de vocês — inclui sacar do banco pro caixa.' },
  { v: 'fatura_cartao', label: 'Pagar fatura',  destino: true,  ajuda: 'A conta corrente quita o acumulado de um cartão.' },
  { v: 'aporte',        label: 'Aporte',        destino: false, ajuda: 'Sócio pôs dinheiro. Não é receita, não vai pra DRE.' },
  { v: 'emprestimo',    label: 'Empréstimo',    destino: false, ajuda: 'Entrada do principal. Os juros são despesa e vão lançados à parte.' },
  { v: 'ajuste',        label: 'Ajuste',        destino: false, ajuda: 'Acerto de saldo contra o extrato.' },
]

function IconeConta({ tipo, produto }: { tipo: string; produto?: string | null }) {
  const C = produto === 'maquininha' ? Smartphone
    : tipo === 'cartao' ? CreditCard
    : tipo === 'dinheiro' ? Wallet
    : Landmark
  return <C className="h-4 w-4 text-[var(--surface-500)]" />
}

/** Maquininha guarda dinheiro que ainda não é seu; cartão guarda dívida. */
const ehMaquininha = (x: { produto?: string | null }) => x.produto === 'maquininha'
const ehCartao = (x: { tipo: string }) => x.tipo === 'cartao'

export default function CaixaTab({ somenteLeitura = false }: { somenteLeitura?: boolean }) {
  const supabaseTipado = createClient()
  const supabase = supabaseTipado as unknown as SupabaseClient
  const { toast } = useToast()
  const { currentUnit, userName } = useUnit()

  const [mes, setMes] = useState(mesAtual())
  const [saldos, setSaldos] = useState<Saldo[]>([])
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [carregando, setCarregando] = useState(false)
  const [conta, setConta] = useState('')          // filtro do extrato
  // O extrato pode ter linha de outra unidade por DOIS motivos, os dois legítimos
  // de mostrar e os dois ruins de ler misturados:
  //   1. cicatriz do bug dos UUIDs chumbados (mig 126/127)
  //   2. CONTA COMPARTILHADA (mig 128): a Pinda divide as contas Itaú com a
  //      Matriz, então vê os repasses que a Matriz recebeu ali — e isso é útil,
  //      porque ela ajuda a cobrar as unidades.
  // O saldo conta tudo; o filtro é só de leitura.
  const [soDaqui, setSoDaqui] = useState(true)
  const [unidades, setUnidades] = useState<Record<string, string>>({})

  // formulário de movimento
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState('transferencia')
  const [origem, setOrigem] = useState('')
  const [destino, setDestino] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(hojeISO())
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Conferência do saldo contra o extrato do banco — a "boca do saldo".
  const [confConta, setConfConta] = useState<Saldo | null>(null)
  const [confSaldo, setConfSaldo] = useState('')     // o que o extrato mostra
  const [confData, setConfData] = useState(hojeISO())
  const [confMotivo, setConfMotivo] = useState('')
  const [confSalvando, setConfSalvando] = useState(false)

  /**
   * PREVISÃO DE RECEBÍVEL DA MAQUININHA — informativo, NUNCA saldo.
   *
   * 🔴 Decisão do Lucas (13/09/2026): *"a previsão nunca vira caixa"*. Quem move
   * o saldo continua sendo só o realizado, vindo do extrato. Isto aqui responde
   * duas outras perguntas: quanto ainda vem, e quanto já deveria ter chegado e
   * não foi lançado — o "delta" que avisa que há trabalho acumulado.
   */
  const [previsoes, setPrevisoes] = useState<Record<string, RetratoMaquininha>>({})

  const carregar = useCallback(async () => {
    if (!currentUnit?.id) return
    setCarregando(true)
    const { ini, fim } = limitesDoMes(mes)
    // As contas que ESTA unidade enxerga: as dela + as compartilhadas com ela
    // (mig 128 — Matriz e Pinda dividem as contas Itaú). Saldo é ACUMULADO, por
    // isso não filtra por mês: senão não é saldo.
    const { data: sd } = await supabase.from('vw_caixa_saldo').select('*')
      .or(`unidade_id.eq.${currentUnit.id},unidades_extras.cs.{${currentUnit.id}}`)
    const visiveisContas = ((sd as Saldo[]) || []).sort((a, b) => a.nome.localeCompare(b.nome))
    setSaldos(visiveisContas)

    // O extrato segue as CONTAS visíveis, não a unidade da conta — senão a Pinda
    // não veria nada da conta Itaú, que pertence à Matriz.
    const ids = visiveisContas.map(c => c.conta_id)
    if (!ids.length) { setLinhas([]); setCarregando(false); return }
    const { data: kd } = await supabase.from('vw_caixa').select('*')
      .in('conta_id', ids)
      .gte('data', ini).lte('data', fim)
      .order('data', { ascending: false })
    setLinhas(((kd as Linha[]) || []))
    setCarregando(false)
  }, [supabase, currentUnit?.id, mes])

  useEffect(() => { void carregar() }, [carregar])

  /**
   * Monta a esteira de recebíveis das maquininhas visíveis.
   *
   * ⚠️ Só para conta CALIBRADA (`contaCalibrada`): a regra foi aferida contra 65
   * dias de extrato da InterPag e acerta o dia dela. Para Rede, Infinity e
   * InfinityPay não há extrato para conferir — e previsão plausível e errada é
   * pior que previsão nenhuma, porque ninguém desconfia dela.
   *
   * ⚠️ E só para maquininha que está NA GRADE (mig 146). A previsão é desenhada
   * dentro do card; com a maquininha escondida — que é o padrão desde a 146 —
   * estas duas consultas (uma delas `limit(5000)` em `pagamentos`) rodariam a
   * cada carregamento para alimentar um card que não existe. Quem quer esse
   * número hoje encontra em Lançamentos › Receitas a Prazo, que calcula o seu.
   */
  useEffect(() => {
    const maqs = saldos.filter(s =>
      s.produto === 'maquininha' && s.mostrar_no_caixa !== false && contaCalibrada(s.nome))
    if (!maqs.length) { setPrevisoes({}); return }
    const ids = maqs.map(m => m.conta_id)
    let cancelado = false
    void (async () => {
      const [{ data: pgs }, { data: movs }] = await Promise.all([
        // A esteira nasce dos recebimentos em cartão: cada um vira N parcelas.
        supabase.from('pagamentos')
          .select('id, conta_id, data_pagamento, valor, valor_liquido, metodo, parcelas')
          .in('conta_id', ids).in('metodo', ['credito', 'debito']).limit(5000),
        // O que JÁ foi lançado do extrato — é o que a previsão desconta.
        supabase.from('fin_movimentos')
          .select('conta_id, data, valor').in('conta_id', ids).order('data', { ascending: false }),
      ])
      if (cancelado) return
      const porConta = new Map<string, PagamentoCartao[]>()
      for (const p of ((pgs as unknown as PagamentoCartao[]) || [])) {
        const k = p.conta_id || ''
        if (!porConta.has(k)) porConta.set(k, [])
        porConta.get(k)!.push(p)
      }
      const hoje = hojeISO()
      const out: Record<string, RetratoMaquininha> = {}
      for (const m of maqs) {
        const desde = m.caixa_desde || null
        const meus = ((movs as unknown as { conta_id: string; data: string; valor: number }[]) || [])
          .filter(x => x.conta_id === m.conta_id && (!desde || x.data >= desde))
        const jaLiquidado = meus.reduce((a, x) => a + Math.abs(Number(x.valor || 0)), 0)
        out[m.conta_id] = retratoDaMaquininha(
          montarEsteira(porConta.get(m.conta_id) || []),
          jaLiquidado, meus[0]?.data || null, hoje, desde,
        )
      }
      setPrevisoes(out)
    })()
    return () => { cancelado = true }
  }, [supabase, saldos])

  // Código das unidades, pro selo de origem no extrato.
  useEffect(() => {
    supabase.from('unidades').select('id, codigo').then(({ data }) => {
      const m: Record<string, string> = {}
      for (const u of ((data as { id: string; codigo: string }[]) || [])) m[u.id] = u.codigo
      setUnidades(m)
    })
  }, [supabase])

  const defTipo = TIPOS.find(t => t.v === tipo)!
  // Conta de legado (mig 127) é histórico: não entra em movimento novo.
  const operaveis = saldos.filter(s => !s.legado)
  // Destino de fatura e de liquidação: só o que é dinheiro de verdade.
  const contasCorrente = operaveis.filter(s => !ehCartao(s) && !ehMaquininha(s))
  const cartoes = operaveis.filter(ehCartao)

  function abrirPagarFatura(cartao: Saldo) {
    setTipo('fatura_cartao')
    setDestino(cartao.conta_id)
    setOrigem(contasCorrente[0]?.conta_id || '')
    setValor(String(Math.abs(cartao.saldo).toFixed(2)))
    setData(hojeISO())
    setDescricao(`Fatura ${cartao.nome}`)
    setAberto(true)
  }

  /** Espelho do "pagar fatura": o adquirente manda o dinheiro pra conta. */
  /**
   * ATALHO DE LIQUIDAÇÃO — abre o movimento já com origem e destino resolvidos.
   *
   * 🔴 O VALOR NASCE VAZIO, DE PROPÓSITO. Até 23/09/2026 ele vinha preenchido com
   * o SALDO INTEIRO da maquininha, o que está errado por definição: o saldo é
   * tudo que a operadora ainda deve (em Santos, R$ 303 mil somando venda de
   * meses), e uma liquidação é o depósito de UM dia. Dois cliques distraídos
   * zeravam a maquininha e inflavam a conta corrente em trezentos mil reais.
   * Quem liquida está olhando o extrato — o número vem de lá, não daqui.
   *
   * O lugar completo pra isto é Lançamentos › Receitas a Prazo, que conhece os
   * outros movimentos da operadora (antecipação, chargeback, taxa) e compara com
   * a previsão. Este atalho continua existindo pro caso simples.
   */
  function abrirLiquidar(maq: Saldo) {
    setTipo('transferencia')
    setOrigem(maq.conta_id)
    setDestino(contasCorrente[0]?.conta_id || '')
    setValor('')
    setData(hojeISO())
    setDescricao(`Liquidação ${maq.nome}`)
    setAberto(true)
  }

  /**
   * CONFERIR O SALDO CONTRA O EXTRATO — a "boca do saldo".
   *
   * A pessoa não calcula diferença nenhuma: ela olha o extrato do banco, digita
   * o saldo que está lá, e o sistema grava o ajuste que falta. Pedir a diferença
   * seria pedir uma conta que a pessoa não tem por que fazer — e que ela erraria
   * de sinal metade das vezes.
   *
   * Na PRIMEIRA vez é uma abertura de caixa: além do ajuste, grava
   * `contas.caixa_desde`, e a partir dali o histórico anterior sai do extrato.
   * É como o caixa "começa do zero" sem que nenhum pagamento seja apagado.
   */
  function abrirConferencia(s: Saldo) {
    setConfConta(s)
    setConfSaldo('')
    setConfData(s.caixa_desde ? hojeISO() : hojeISO())
    setConfMotivo('')
  }

  async function salvarConferencia() {
    if (!confConta || !currentUnit?.id) return
    const real = Number(confSaldo)
    if (confSaldo.trim() === '' || Number.isNaN(real)) return toast('Informe o saldo do extrato', 'error')

    const abertura = !confConta.caixa_desde
    // Numa abertura, o histórico anterior sai de cena: o saldo passa a ser SÓ o
    // que for informado, então o ajuste é o valor cheio. Numa conferência de
    // rotina, o ajuste é apenas a diferença que falta.
    const diferenca = abertura ? real : real - Number(confConta.saldo || 0)

    if (!abertura && Math.abs(diferenca) < 0.005) {
      // Bate com o extrato: não há o que gravar. Movimento de zero seria ruído
      // no extrato e a constraint do banco o rejeitaria de todo modo.
      toast('O saldo já bate com o extrato', 'success')
      return setConfConta(null)
    }

    setConfSalvando(true)
    try {
      if (abertura) {
        const { error } = await supabase.from('contas')
          .update({ caixa_desde: confData }).eq('id', confConta.conta_id)
        if (error) throw new Error(error.message)
      }
      if (Math.abs(diferenca) >= 0.005) {
        const { error } = await supabase.from('fin_movimentos').insert({
          unidade_id: currentUnit.id,
          tipo: 'ajuste',
          conta_id: confConta.conta_id,
          conta_destino_id: null,
          data: confData,
          // ⚠️ O ajuste guarda o SINAL (mig 136). Nos outros tipos o valor é
          // sempre positivo e o tipo diz a direção; aqui o extrato pode estar
          // acima ou abaixo, e é o sinal que carrega essa informação.
          valor: Number(diferenca.toFixed(2)),
          descricao: abertura
            ? `Abertura de caixa · ${confConta.nome}`
            : `Ajuste de saldo · ${confMotivo.trim() || 'conferência com o extrato'}`,
          criado_por_nome: userName || null,
        })
        if (error) throw new Error(error.message)
      }
      toast(abertura ? 'Caixa aberto' : `Saldo ajustado em ${fmtBRL(diferenca)}`, 'success')
      setConfConta(null)
      void carregar()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao ajustar', 'error')
    } finally {
      setConfSalvando(false)
    }
  }

  function limpar() {
    setAberto(false); setTipo('transferencia'); setOrigem(''); setDestino('')
    setValor(''); setData(hojeISO()); setDescricao('')
  }

  async function salvar() {
    if (!currentUnit?.id) return
    const v = Number(valor)
    if (!origem) return toast('Escolha a conta', 'error')
    if (defTipo.destino && !destino) return toast('Escolha a conta de destino', 'error')
    if (defTipo.destino && destino === origem) return toast('Origem e destino têm que ser diferentes', 'error')
    if (!v || v <= 0) return toast('Informe o valor', 'error')

    setSalvando(true)
    const { error } = await supabase.from('fin_movimentos').insert({
      unidade_id: currentUnit.id,
      tipo,
      conta_id: origem,
      conta_destino_id: defTipo.destino ? destino : null,
      data,
      valor: v,
      descricao: descricao.trim() || null,
      criado_por_nome: userName || null,
    })
    setSalvando(false)
    if (error) return toast(error.message, 'error')
    toast('Movimento registrado', 'success')
    limpar()
    void carregar()
  }

  const daqui = (l: Linha) => !l.unidade_origem || l.unidade_origem === currentUnit?.id
  const deFora = linhas.filter(l => !daqui(l))
  const visiveis = linhas
    .filter(l => (conta ? l.conta_id === conta : true))
    .filter(l => (soDaqui ? daqui(l) : true))
  /**
   * AS CONTAS QUE ESTA TELA MOSTRA (mig 146).
   *
   * `mostrar_no_caixa = false` tira a conta da GRADE e dos TOTAIS — e só disso.
   * Ela continua no extrato e nos seletores do modal de movimento, porque
   * esconder não é desativar (pra desativar existe `contas.ativo`). A maquininha
   * nasce escondida: o saldo dela é "o que a operadora ainda deve", que agora
   * tem tela própria em Lançamentos › Receitas a Prazo.
   *
   * ⚠️ `!== false` e não `=== true`: enquanto a mig 146 não rodar, a coluna vem
   * `undefined` e a tela segue mostrando tudo, como antes. Sem isso, um deploy
   * que chegasse antes da migration esvaziaria o Caixa inteiro — foi assim que
   * a mig 137 derrubou o login em 05/09.
   */
  const naGrade = saldos.filter(s => s.mostrar_no_caixa !== false)

  // DISPONÍVEL exclui maquininha (ainda não liquidou), cartão (é dívida) e
  // LEGADO — a conta histórica carrega recebimento antigo cujo dinheiro não está
  // mais lá; contá-la mostrava centenas de milhares como gastáveis.
  const totalDisponivel = naGrade
    .filter(s => !ehCartao(s) && !ehMaquininha(s) && !s.legado)
    .reduce((a, s) => a + Number(s.saldo || 0), 0)
  // Os dois abaixo seguem a grade: um total sem card correspondente é um número
  // órfão, e o "a receber" some junto com as maquininhas.
  const totalAReceber = naGrade.filter(ehMaquininha)
    .reduce((a, s) => a + Math.max(Number(s.saldo || 0), 0), 0)
  const totalFaturas = naGrade.filter(ehCartao)
    .reduce((a, s) => a + Math.min(Number(s.saldo || 0), 0), 0)

  return (
    <div className="animate-fade-in space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="month" value={mes} onChange={e => setMes(e.target.value)}
          className="input text-sm w-36 py-1"
        />
        <span className="text-xs text-[var(--surface-500)]">
          disponível <span className="text-mono text-[var(--surface-800)]">{fmtBRL(totalDisponivel)}</span>
          {totalAReceber > 0 && (
            <> · a receber <span className="text-mono text-sky-500">{fmtBRL(totalAReceber)}</span></>
          )}
          {totalFaturas < 0 && (
            <> · fatura <span className="text-mono text-amber-500">{fmtBRL(-totalFaturas)}</span></>
          )}
        </span>
        {carregando && <Loader2 className="h-4 w-4 animate-spin text-[var(--surface-400)]" />}
        {deFora.length > 0 && (
          <label
            className="flex items-center gap-1.5 text-xs text-[var(--surface-500)] cursor-pointer"
            title="Movimento de outra unidade nesta conta — conta compartilhada ou histórico antigo. O saldo conta sempre; isto filtra só a lista."
          >
            <input
              type="checkbox" checked={soDaqui}
              onChange={e => setSoDaqui(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--brand-500)]"
            />
            só desta unidade
            <span className="text-[var(--surface-400)]">({deFora.length} de outras)</span>
          </label>
        )}
        {!somenteLeitura && (
          <button onClick={() => setAberto(true)} className="btn-primary text-sm ml-auto">
            <Plus className="h-4 w-4" /> Movimento
          </button>
        )}
      </div>

      {/* Saldo por conta — clicar filtra o extrato */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {naGrade.map(s => {
          const cartao = ehCartao(s)
          const maq = ehMaquininha(s)
          const ativo = conta === s.conta_id
          return (
            <button
              key={s.conta_id}
              onClick={() => setConta(ativo ? '' : s.conta_id)}
              className="card p-3 text-left transition-colors"
              style={{ borderColor: ativo ? 'var(--brand-500)' : undefined }}
            >
              <div className="flex items-center gap-1.5">
                <IconeConta tipo={s.tipo} produto={s.produto} />
                <span className="text-xs text-[var(--surface-600)] truncate">{s.nome}</span>
                {(s.unidades_extras || []).length > 0 && (
                  <span
                    className="text-[9px] px-1 py-0.5 rounded-full shrink-0"
                    style={{ background: 'rgba(99,102,241,0.16)', color: '#6366f1' }}
                    title="Conta compartilhada entre unidades — o saldo é um só. Num consolidado, contar uma vez."
                  >
                    compartilhada
                  </span>
                )}
                {s.legado && (
                  <span
                    className="text-[9px] px-1 py-0.5 rounded-full shrink-0"
                    style={{ background: 'var(--surface-100)', color: 'var(--surface-500)' }}
                    title="Histórico: entrou antes de haver controle de conta por unidade. Não recebe lançamento novo."
                  >
                    histórico
                  </span>
                )}
              </div>
              <p
                className="text-mono text-lg tabular-nums truncate"
                style={{
                  color: cartao ? '#f59e0b'
                    : maq ? '#0ea5e9'
                    : Number(s.saldo) < 0 ? '#ef4444' : 'var(--surface-800)',
                }}
              >
                {fmtBRL(cartao ? Math.abs(Number(s.saldo)) : Number(s.saldo))}
              </p>
              {cartao ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-[var(--surface-400)]">
                    {Number(s.saldo) < 0 ? 'fatura em aberto' : 'sem fatura'}
                  </span>
                  {!somenteLeitura && Number(s.saldo) < 0 && (
                    <span
                      onClick={e => { e.stopPropagation(); abrirPagarFatura(s) }}
                      className="text-[10px] text-[var(--brand-500)] underline cursor-pointer"
                    >
                      pagar
                    </span>
                  )}
                </div>
              ) : maq ? (
                <div className="mt-0.5 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--surface-400)]">
                      {Number(s.saldo) > 0
                        ? `a receber${s.liquidacao_dias ? ` · D+${s.liquidacao_dias}` : ''}`
                        : 'nada a receber'}
                    </span>
                    {!somenteLeitura && Number(s.saldo) > 0 && (
                      <span
                        onClick={e => { e.stopPropagation(); abrirLiquidar(s) }}
                        className="text-[10px] text-[var(--brand-500)] underline cursor-pointer"
                      >
                        liquidar
                      </span>
                    )}
                  </div>

                  {/* PREVISÃO — informativo, nunca saldo (ver `recebiveis.ts`).
                      O saldo acima é o realizado; estes dois números dizem o que
                      ainda vem e o que o extrato já deveria ter trazido. */}
                  {previsoes[s.conta_id] && (
                    <>
                      <p className="text-[10px] text-[var(--surface-400)]">
                        previsto a receber{' '}
                        <span className="text-mono text-sky-500">
                          {fmtBRL(previsoes[s.conta_id].aReceber)}
                        </span>
                      </p>
                      {previsoes[s.conta_id].aLancar > 0.005 && (
                        <p className="text-[10px] text-amber-500">
                          ~{fmtBRL(previsoes[s.conta_id].aLancar)} a lançar do extrato
                          {previsoes[s.conta_id].diasSemLancar !== null
                            ? ` · ${previsoes[s.conta_id].diasSemLancar} dia(s) sem lançar`
                            : previsoes[s.conta_id].desde
                              ? ` · desde ${fmtData(previsoes[s.conta_id].desde!)}`
                              : ''}
                        </p>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-[var(--surface-400)] mt-0.5">
                  entrou {fmtBRL(s.entradas)} · saiu {fmtBRL(s.saidas)}
                </p>
              )}

              {/* CONFERIR CONTRA O EXTRATO — a "boca do saldo".
                  Conta sem `caixa_desde` nunca foi conferida: o número é a soma
                  de tudo que já entrou, sem nenhuma saída, e quase certamente
                  não é o que está no banco. Dizer isso é mais honesto que
                  exibir o número liso e deixar a pessoa acreditar nele. */}
              {!somenteLeitura && !s.legado && (
                <div className="flex items-center gap-2 mt-1">
                  {!s.caixa_desde && (
                    <span
                      className="text-[9px] px-1 py-0.5 rounded-full shrink-0"
                      style={{ background: 'rgba(245,158,11,0.14)', color: '#f59e0b' }}
                      title="O saldo é a soma de todo o histórico e nunca foi conferido contra o extrato do banco."
                    >
                      não conferido
                    </span>
                  )}
                  <span
                    onClick={e => { e.stopPropagation(); abrirConferencia(s) }}
                    className="text-[10px] text-[var(--brand-500)] underline cursor-pointer"
                  >
                    {s.caixa_desde ? 'conferir' : 'abrir caixa'}
                  </span>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Extrato do mês */}
      <div className="card divide-y divide-[var(--surface-200)]">
        {!carregando && visiveis.length === 0 && (
          <p className="text-sm text-[var(--surface-500)] py-8 text-center">
            Sem movimento neste mês{conta ? ' nesta conta' : ''}.
          </p>
        )}
        {visiveis.map((l, i) => {
          const entra = l.valor > 0
          const Icon = l.origem === 'movimento' ? ArrowLeftRight : entra ? ArrowDownLeft : ArrowUpRight
          const cor = l.origem === 'movimento' ? 'var(--surface-500)' : entra ? '#10b981' : '#ef4444'
          return (
            <div key={`${l.origem_id}-${i}`} className="flex items-center gap-3 px-3 py-2">
              <Icon className="h-4 w-4 shrink-0" style={{ color: cor }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--surface-800)] truncate flex items-center gap-1.5">
                  <span className="truncate">{l.descricao || l.tipo}</span>
                  {!daqui(l) && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                      style={{ background: 'rgba(245,158,11,0.16)', color: '#f59e0b' }}
                      title="Contrato de outra unidade que caiu nesta conta"
                    >
                      {unidades[l.unidade_origem || ''] || 'outra'}
                    </span>
                  )}
                </p>
                <p className="text-xs text-[var(--surface-500)]">
                  {fmtData(l.data)} · {saldos.find(s => s.conta_id === l.conta_id)?.nome || '—'}
                </p>
              </div>
              <span className="text-mono text-sm tabular-nums shrink-0" style={{ color: cor }}>
                {entra ? '+' : '−'}{fmtBRL(Math.abs(l.valor))}
              </span>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-[var(--surface-500)]">
        {deFora.length > 0 && (
          <>
            <strong className="font-medium">O saldo conta tudo que passou na conta</strong>, inclusive
            movimento de outra unidade — em conta compartilhada isso é o esperado, e o dinheiro está lá
            de verdade. O filtro acima limpa só a lista.{' '}
          </>
        )}
        Recebimentos entram pelo valor líquido, já sem a taxa. Venda na{' '}
        <strong className="font-medium">maquininha não entra no disponível</strong>: fica em
        &quot;a receber&quot; até o adquirente liquidar. Do mesmo jeito, despesa no{' '}
        <strong className="font-medium">cartão não sai</strong> até a fatura ser paga — nos dois
        casos o dinheiro ainda não se moveu de verdade. Transferência, aporte e empréstimo movem dinheiro e não
        aparecem na DRE, porque não mudam o resultado.
      </p>

      <Modal
        isOpen={aberto}
        onClose={limpar}
        title="Novo movimento"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={limpar} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={() => void salvar()} disabled={salvando} className="btn-primary text-sm">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Registrar
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {TIPOS.map(t => {
              const on = tipo === t.v
              return (
                <button
                  key={t.v} type="button"
                  onClick={() => { setTipo(t.v); if (!t.destino) setDestino('') }}
                  className="text-xs px-2.5 py-1.5 rounded-[var(--radius-md)] border transition-colors"
                  style={{
                    background: on ? 'rgba(16,185,129,0.12)' : 'transparent',
                    borderColor: on ? '#10b981' : 'var(--surface-200)',
                    color: on ? '#10b981' : 'var(--surface-600)',
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-[var(--surface-400)]">{defTipo.ajuda}</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">
                {defTipo.destino ? 'Sai de' : 'Conta'}
              </label>
              <select value={origem} onChange={e => setOrigem(e.target.value)} className="input text-sm w-full">
                <option value="">Escolher…</option>
                {(tipo === 'fatura_cartao' ? contasCorrente : operaveis).map(s => (
                  <option key={s.conta_id} value={s.conta_id}>{s.nome}</option>
                ))}
              </select>
            </div>
            {defTipo.destino && (
              <div>
                <label className="text-xs text-[var(--surface-500)] block mb-1">
                  {tipo === 'fatura_cartao' ? 'Cartão' : 'Entra em'}
                </label>
                <select value={destino} onChange={e => setDestino(e.target.value)} className="input text-sm w-full">
                  <option value="">Escolher…</option>
                  {(tipo === 'fatura_cartao' ? cartoes : operaveis).map(s => (
                    <option key={s.conta_id} value={s.conta_id}>{s.nome}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Valor</label>
              <div className="flex items-center rounded-[var(--radius-md)] border overflow-hidden"
                   style={{ borderColor: 'var(--surface-300)', background: 'var(--surface-0)' }}>
                <span className="text-xs text-[var(--surface-400)] pl-2">R$</span>
                <input
                  type="number" min={0} step="0.01" value={valor}
                  onChange={e => setValor(e.target.value)}
                  placeholder="0,00"
                  className="w-full bg-transparent border-0 outline-none text-sm text-mono px-2 py-2 text-[var(--surface-800)]"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)} className="input text-sm w-full" />
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--surface-500)] block mb-1">Descrição</label>
            <input
              value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder="opcional"
              className="input text-sm w-full"
            />
          </div>
        </div>
      </Modal>

      {/* CONFERIR COM O EXTRATO — pergunta o saldo real, calcula o resto.
          Pedir a diferença seria pedir uma conta que a pessoa não tem por que
          fazer, e que ela erraria de sinal metade das vezes. */}
      <Modal
        isOpen={!!confConta}
        onClose={() => setConfConta(null)}
        title={confConta?.caixa_desde ? 'Conferir com o extrato' : 'Abrir o caixa desta conta'}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfConta(null)} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={() => void salvarConferencia()} disabled={confSalvando} className="btn-primary text-sm">
              {confSalvando
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</>
                : <><Check className="h-4 w-4" /> {confConta?.caixa_desde ? 'Ajustar' : 'Abrir'}</>}
            </button>
          </div>
        }
      >
        {confConta && (() => {
          const abertura = !confConta.caixa_desde
          const real = Number(confSaldo)
          const temValor = confSaldo.trim() !== '' && !Number.isNaN(real)
          const dif = abertura ? real : real - Number(confConta.saldo || 0)
          return (
            <div className="space-y-4">
              {abertura ? (
                <p className="text-sm text-[var(--surface-600)]">
                  O saldo de <strong>{confConta.nome}</strong> hoje é a soma de tudo
                  que já entrou, sem nenhuma saída — {fmtBRL(confConta.saldo)} — e
                  quase certamente não é o que está no banco. Informe o saldo real
                  e a partir de que dia o extrato passa a valer.
                  {' '}O histórico anterior sai do caixa; <strong>nenhum pagamento
                  é apagado</strong>, e o Dashboard e a DRE não mudam.
                </p>
              ) : (
                <p className="text-sm text-[var(--surface-600)]">
                  O sistema mostra{' '}
                  <span className="text-mono text-[var(--surface-800)]">{fmtBRL(confConta.saldo)}</span>{' '}
                  em <strong>{confConta.nome}</strong>. Informe o que o extrato mostra.
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[var(--surface-500)] block mb-1">
                    Saldo no extrato
                  </label>
                  <div className="flex items-center rounded-[var(--radius-md)] border overflow-hidden"
                       style={{ borderColor: 'var(--surface-300)', background: 'var(--surface-0)' }}>
                    <span className="text-sm text-[var(--surface-400)] pl-2">R$</span>
                    <input
                      autoFocus type="number" step="0.01" value={confSaldo}
                      onChange={e => setConfSaldo(e.target.value)}
                      placeholder="0,00"
                      className="w-full bg-transparent border-0 outline-none text-sm text-mono px-2 py-2 text-[var(--surface-800)]"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-[var(--surface-500)] block mb-1">
                    {abertura ? 'O extrato vale a partir de' : 'Data do ajuste'}
                  </label>
                  <input type="date" value={confData} onChange={e => setConfData(e.target.value)}
                         className="input text-sm w-full" />
                </div>
              </div>

              {/* O número que vai ser gravado, à vista antes de confirmar. */}
              {temValor && !abertura && (
                <p className="text-sm">
                  {Math.abs(dif) < 0.005 ? (
                    <span className="text-emerald-400">Bate com o extrato — nada a ajustar.</span>
                  ) : (
                    <>
                      <span className="text-[var(--surface-500)]">Ajuste de </span>
                      <span className="text-mono" style={{ color: dif > 0 ? '#10b981' : '#ef4444' }}>
                        {dif > 0 ? '+' : '−'}{fmtBRL(Math.abs(dif))}
                      </span>
                    </>
                  )}
                </p>
              )}

              {!abertura && (
                <div>
                  <label className="text-xs text-[var(--surface-500)] block mb-1">
                    O que explica a diferença
                  </label>
                  <input
                    value={confMotivo} onChange={e => setConfMotivo(e.target.value)}
                    placeholder="Ex.: tarifa do banco que não foi lançada"
                    className="input text-sm w-full"
                  />
                  <p className="text-[11px] text-[var(--surface-400)] mt-1">
                    O ajuste aparece no extrato como uma linha, com este texto.
                    Ele corrige o caixa e <strong>não</strong> mexe no resultado:
                    reconhecer dinheiro que já existia não é receita.
                  </p>
                </div>
              )}
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
