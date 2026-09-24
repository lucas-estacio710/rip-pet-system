'use client'

// /financeiro › Lançamentos › RECEITAS A PRAZO
//
// O que a operadora de cartão ainda deve, e o que ela já depositou.
//
// 🔴 A REGRA QUE GOVERNA ESTA TELA: **PREVISÃO NUNCA VIRA CAIXA** (decisão do
// Lucas, 13/09/2026). O saldo só anda com o que é registrado do extrato. A
// previsão — calculada em `lib/recebiveis.ts`, calibrada contra 65 dias de
// extrato real — responde outras duas perguntas: quanto ainda vem, e quanto já
// deveria ter caído e não foi lançado. Se ela entrasse no saldo, estorno,
// chargeback e antecipação virariam erro silencioso.
//
// ⚠️ POR QUE UMA ABA E NÃO UM CARD DENTRO DE DESPESAS: as duas coisas são o mesmo
// GESTO (pegar o extrato e registrar o que aconteceu) e direções OPOSTAS de
// dinheiro. Empilhadas na mesma lista, em algum momento alguém soma a coluna
// errada — e o cabeçalho de Lançamentos, que mostra "total · N lançamentos",
// passaria a mentir. Abas irmãs resolvem sem asterisco: cada uma tem o seu total.
//
// A ÁRVORE (desenho do Lucas, 23/09/2026): escolher a OPERADORA do pool
// cadastrado → escolher o MOVIMENTO → preencher. Mesmo padrão do formulário de
// despesa, onde cada resposta abre a próxima.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Plus, Loader2, Check, Smartphone, ArrowDownRight, ArrowUpRight, Copy } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import Modal from '@/components/ui/Modal'
import { fmtBRL, fmtData, hojeISO, limitesDoMes } from '@/lib/financeiro'
import {
  montarEsteira, retratoDaMaquininha, contaCalibrada,
  type PagamentoCartao, type RetratoMaquininha,
} from '@/lib/recebiveis'

/** Maquininha cadastrada na unidade — o "pool de operadoras". */
type Operadora = {
  conta_id: string
  nome: string
  saldo: number
  caixa_desde: string | null
  liquidacao_dias: number | null
}

/** Conta corrente que recebe o depósito. */
type ContaDestino = { id: string; nome: string; preferencial_recebimento: boolean | null }

type Registro = {
  id: string
  data: string
  valor: number
  descricao: string | null
  conta_id: string
  conta_destino_id: string | null
}

/**
 * OS MOVIMENTOS QUE UMA OPERADORA FAZ.
 *
 * Os quatro primeiros aparecem no extrato real de Santos com nome próprio — a
 * `ANTECIPACAO - INTER PAG` inclusive vem rotulada diferente de
 * `CARTAO DE CREDITO - INTER PAG`, o que permite reconhecê-la sem adivinhar.
 *
 * `entra` decide a direção do dinheiro, e é a única coisa que muda no que é
 * gravado: entrada = maquininha → conta corrente; saída = o contrário.
 */
const MOVIMENTOS = [
  {
    v: 'liquidacao',
    label: 'Liquidação',
    entra: true,
    ajuda: 'O normal: a operadora depositou a agenda do dia.',
  },
  {
    v: 'antecipacao',
    label: 'Liquidação antecipada',
    entra: true,
    ajuda: 'Você antecipou: vários meses viraram um crédito só, com desconto.',
    // ⚠️ O DESCONTO NÃO ENTRA AQUI. Ele reduz o lucro, então é despesa
    // (Financeiro › Encargos) e vive na aba Despesas — pela regra do FLOW
    // §9.1.3, "se reduz o lucro é lançamento; se só troca dinheiro de lugar é
    // movimento". Lançar o desconto como movimento sumiria com um custo
    // financeiro real da DRE. Registrado aqui só o líquido que caiu.
    aviso: 'Registre o valor LÍQUIDO que caiu. O desconto da antecipação é despesa — lance em Despesas, Financeiro › Encargos.',
  },
  {
    v: 'chargeback',
    label: 'Chargeback',
    entra: false,
    ajuda: 'Venda contestada depois de já ter caído — o dinheiro sai da conta.',
  },
  {
    v: 'taxa',
    label: 'Taxa / aluguel da maquininha',
    entra: false,
    ajuda: 'O que a operadora debita direto (aluguel do aparelho, tarifa).',
  },
] as const

type MovimentoV = typeof MOVIMENTOS[number]['v']

export default function ReceitasPrazoTab({ somenteLeitura = false, mes }: {
  somenteLeitura?: boolean
  mes: string
}) {
  const supabaseTipado = createClient()
  const supabase = supabaseTipado as unknown as SupabaseClient
  const { toast } = useToast()
  const { currentUnit, userName } = useUnit()

  const [operadoras, setOperadoras] = useState<Operadora[]>([])
  const [destinos, setDestinos] = useState<ContaDestino[]>([])
  const [registros, setRegistros] = useState<Registro[]>([])
  const [previsoes, setPrevisoes] = useState<Record<string, RetratoMaquininha>>({})
  const [carregando, setCarregando] = useState(false)
  const [filtro, setFiltro] = useState<string | null>(null)   // conta_id, ao clicar no card

  // formulário
  const [aberto, setAberto] = useState(false)
  const [operadoraId, setOperadoraId] = useState('')
  const [movimento, setMovimento] = useState<MovimentoV>('liquidacao')
  const [data, setData] = useState(hojeISO())
  const [dataOutra, setDataOutra] = useState(false)
  const [valor, setValor] = useState('')          // dígitos; a vírgula anda sozinha
  const [destinoId, setDestinoId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)

  const defMov = MOVIMENTOS.find(m => m.v === movimento)!
  const operadora = operadoras.find(o => o.conta_id === operadoraId)

  // Mesma máscara do formulário de despesa: o state guarda dígitos e a vírgula
  // anda da direita pra esquerda. Colar "1.260,44" do extrato funciona sozinho.
  const soDigitos = (t: string) => t.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12)
  const emNumero = (d: string) => Number(d || '0') / 100
  const emTexto = (d: string) =>
    emNumero(d).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const carregar = useCallback(async () => {
    if (!currentUnit?.id) return
    setCarregando(true)
    const { ini, fim } = limitesDoMes(mes)

    const [{ data: maq }, { data: cc }] = await Promise.all([
      // O POOL DE OPERADORAS: as maquininhas que a unidade tem cadastradas.
      supabase.from('vw_caixa_saldo')
        .select('conta_id, nome, saldo, caixa_desde, liquidacao_dias, produto, legado, unidade_id')
        .eq('produto', 'maquininha')
        .or(`unidade_id.eq.${currentUnit.id},unidades_extras.cs.{${currentUnit.id}}`),
      // Onde o dinheiro cai. `legado` fora: conta de histórico não recebe nada novo.
      supabase.from('contas')
        .select('id, nome, preferencial_recebimento, produto, tipo')
        .eq('unidade_id', currentUnit.id).eq('ativo', true).eq('legado', false)
        .order('nome'),
    ])

    const ops = ((maq as unknown as (Operadora & { legado: boolean })[]) || [])
      .filter(o => !o.legado)
      .sort((a, b) => a.nome.localeCompare(b.nome))
    setOperadoras(ops)

    const dest = ((cc as unknown as (ContaDestino & { produto: string; tipo: string })[]) || [])
      .filter(c => c.produto !== 'maquininha' && c.tipo !== 'cartao')
      .sort((a, b) => Number(!!b.preferencial_recebimento) - Number(!!a.preferencial_recebimento))
    setDestinos(dest)

    if (!ops.length) { setRegistros([]); setCarregando(false); return }

    // O que já foi registrado no mês. Movimento em que a maquininha é uma das
    // pernas — de qualquer direção, pra chargeback e taxa aparecerem também.
    //
    // ⚠️ `tipo='transferencia'` é obrigatório: a ABERTURA DE CAIXA da maquininha
    // é um `ajuste` (mig 136) e cairia aqui como se fosse uma liquidação do
    // extrato. Em Santos isso significaria uma linha de R$ 155.127,33 fingindo
    // que a operadora depositou — o oposto do que esta lista existe pra mostrar.
    const ids = ops.map(o => o.conta_id)
    const { data: movs } = await supabase.from('fin_movimentos')
      .select('id, data, valor, descricao, conta_id, conta_destino_id')
      .eq('tipo', 'transferencia')
      .or(`conta_id.in.(${ids.join(',')}),conta_destino_id.in.(${ids.join(',')})`)
      .gte('data', ini).lte('data', fim)
      .order('data', { ascending: false })
    setRegistros(((movs as unknown as Registro[]) || []))
    setCarregando(false)
  }, [supabase, currentUnit?.id, mes])

  useEffect(() => { void carregar() }, [carregar])

  /**
   * A previsão de cada operadora — informativa, nunca saldo.
   *
   * ⚠️ Só pra conta CALIBRADA. A regra foi aferida contra o extrato da InterPag;
   * Rede, Infinity e InfinityPay não têm extrato pra conferir, e previsão
   * plausível e errada é pior que previsão nenhuma — ninguém desconfia dela.
   */
  useEffect(() => {
    const calibradas = operadoras.filter(o => contaCalibrada(o.nome))
    if (!calibradas.length) { setPrevisoes({}); return }
    const ids = calibradas.map(o => o.conta_id)
    let cancelado = false
    void (async () => {
      const [{ data: pgs }, { data: movs }] = await Promise.all([
        supabase.from('pagamentos')
          .select('id, conta_id, data_pagamento, valor, valor_liquido, metodo, parcelas')
          .in('conta_id', ids).in('metodo', ['credito', 'debito']).limit(5000),
        // ⚠️ `tipo='transferencia'` importa: um `ajuste` negativo na maquininha
        // entraria no `jaLiquidado` e DIMINUIRIA o "falta registrar" — na direção
        // errada, e em silêncio.
        supabase.from('fin_movimentos')
          .select('conta_id, data, valor').in('conta_id', ids)
          .eq('tipo', 'transferencia').order('data', { ascending: false }),
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
      for (const o of calibradas) {
        const meus = ((movs as unknown as { conta_id: string; data: string; valor: number }[]) || [])
          .filter(x => x.conta_id === o.conta_id && (!o.caixa_desde || x.data >= o.caixa_desde))
        out[o.conta_id] = retratoDaMaquininha(
          montarEsteira(porConta.get(o.conta_id) || []),
          meus.reduce((a, x) => a + Math.abs(Number(x.valor || 0)), 0),
          meus[0]?.data || null, hoje, o.caixa_desde,
        )
      }
      setPrevisoes(out)
    })()
    return () => { cancelado = true }
  }, [supabase, operadoras])

  function abrir(contaId?: string) {
    const alvo = contaId || operadoras[0]?.conta_id || ''
    setOperadoraId(alvo)
    setMovimento('liquidacao')
    setData(hojeISO()); setDataOutra(false)
    setValor(''); setObservacao('')
    setDestinoId(destinos[0]?.id || '')
    setAberto(true)
  }

  /**
   * REUTILIZAR um registro (24/09/2026) — o caso que motivou: duas liquidações
   * da InterPag no mesmo dia, iguais em tudo menos o valor. Abre o modal NOVO
   * já com operadora, movimento, data, valor, conta e observação do registro
   * clicado; a pessoa troca o que mudou e registra.
   *
   * O movimento não tem coluna própria (ver `descricao` no salvar: "Rótulo ·
   * Operadora — observação"), então é reconhecido pelo PREFIXO do texto. Os
   * rótulos são testados do MAIS LONGO pro mais curto: "Liquidação antecipada"
   * começa com "Liquidação", e na ordem errada toda antecipação voltaria como
   * liquidação normal.
   */
  function reutilizar(r: Registro) {
    if (somenteLeitura) return
    const entrou = operadoras.some(o => o.conta_id === r.conta_id)
    const desc = r.descricao || ''
    const mov = [...MOVIMENTOS]
      .sort((a, b) => b.label.length - a.label.length)
      .find(m => desc.startsWith(`${m.label} · `))
    const obs = desc.includes(' — ') ? desc.slice(desc.indexOf(' — ') + 3) : ''
    setOperadoraId((entrou ? r.conta_id : r.conta_destino_id) || operadoras[0]?.conta_id || '')
    setDestinoId((entrou ? r.conta_destino_id : r.conta_id) || destinos[0]?.id || '')
    setMovimento(mov?.v || (entrou ? 'liquidacao' : 'chargeback'))
    setData(r.data.slice(0, 10)); setDataOutra(r.data.slice(0, 10) !== hojeISO())
    setValor(String(Math.round(Number(r.valor) * 100)))
    setObservacao(obs)
    setAberto(true)
  }

  async function salvar() {
    if (somenteLeitura) return toast('Sua unidade não pode registrar aqui', 'error')
    if (!currentUnit?.id) return
    const v = emNumero(valor)
    if (!operadoraId) return toast('Escolha a operadora', 'error')
    if (!destinoId) return toast('Escolha a conta', 'error')
    if (!v) return toast('O valor precisa ser maior que zero', 'error')

    setSalvando(true)
    try {
      // 🔴 GRAVA A MESMA LINHA DE SEMPRE. Uma transferência entre contas próprias
      // — que é o que uma liquidação é. `vw_caixa`, saldo, DRE e Repasse não
      // sabem que esta tela existe, e é assim que tem de ser: o dinheiro entra
      // no caixa por um caminho só.
      //
      // A direção vem do movimento: entrada = maquininha → corrente; saída
      // (chargeback, taxa) = o contrário. Valor sempre positivo — o CHECK de
      // `fin_movimentos` só aceita negativo em `ajuste` (mig 136).
      const origem = defMov.entra ? operadoraId : destinoId
      const destino = defMov.entra ? destinoId : operadoraId

      // ⚠️ O TIPO DO MOVIMENTO VIVE NA DESCRIÇÃO, por enquanto. `fin_movimentos`
      // não tem coluna pra isso e a v1 sai sem migration de propósito — o valor
      // está em registrar os 370 lançamentos que já existem no extrato, não em
      // estrutura pra 5 maquininhas que nunca receberam nada. Quando a coluna
      // vier, o texto aqui é o que permite backfill.
      const rotulo = MOVIMENTOS.find(m => m.v === movimento)!.label
      const { error } = await supabase.from('fin_movimentos').insert({
        unidade_id: currentUnit.id,
        tipo: 'transferencia',
        conta_id: origem,
        conta_destino_id: destino,
        data,
        valor: v,
        descricao: `${rotulo} · ${operadora?.nome || ''}${observacao.trim() ? ` — ${observacao.trim()}` : ''}`,
        criado_por_nome: userName || null,
      })
      if (error) throw new Error(error.message)

      toast(`${rotulo} registrada — ${fmtBRL(v)}`, 'success')
      setAberto(false)
      void carregar()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao registrar', 'error')
    } finally {
      setSalvando(false)
    }
  }

  const visiveis = filtro
    ? registros.filter(r => r.conta_id === filtro || r.conta_destino_id === filtro)
    : registros
  const totalMes = useMemo(() => visiveis.reduce((s, r) => {
    // entrou se a maquininha é a ORIGEM (o dinheiro saiu dela pra corrente)
    const entrou = operadoras.some(o => o.conta_id === r.conta_id)
    return s + (entrou ? Number(r.valor) : -Number(r.valor))
  }, 0), [visiveis, operadoras])

  const nomeConta = (id: string | null) =>
    operadoras.find(o => o.conta_id === id)?.nome || destinos.find(d => d.id === id)?.nome || '—'

  if (!operadoras.length && !carregando) {
    return (
      <div className="text-sm text-[var(--surface-500)] py-8 text-center">
        Esta unidade não tem maquininha cadastrada.
        <br />
        <span className="text-xs">Cadastre na aba Contas pra registrar o que a operadora deposita.</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Cabeçalho: total do mês + botão */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-[var(--surface-500)]">
          caiu <span className="text-mono text-[var(--surface-700)]">{fmtBRL(totalMes)}</span>
          {' · '}{visiveis.length} {visiveis.length === 1 ? 'registro' : 'registros'}
          {filtro && (
            <button onClick={() => setFiltro(null)} className="ml-2 text-xs underline text-[var(--surface-400)]">
              ver todas
            </button>
          )}
        </span>
        {carregando && <Loader2 className="h-4 w-4 animate-spin text-[var(--surface-400)]" />}
        {!somenteLeitura && (
          <button onClick={() => abrir()} className="btn-primary text-sm ml-auto">
            <Plus className="h-4 w-4" /> Registrar do extrato
          </button>
        )}
      </div>

      {/* O POOL DE OPERADORAS. Clicar filtra a lista. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        {operadoras.map(o => {
          const p = previsoes[o.conta_id]
          const ativo = filtro === o.conta_id
          return (
            <button
              key={o.conta_id}
              type="button"
              onClick={() => setFiltro(ativo ? null : o.conta_id)}
              className="text-left p-3 rounded-[var(--radius-md)] border transition-colors"
              style={{
                borderColor: ativo ? 'var(--brand-500)' : 'var(--surface-200)',
                background: ativo ? 'var(--brand-50)' : 'var(--surface-0)',
              }}
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--surface-700)]">
                <Smartphone className="h-3.5 w-3.5 text-[var(--surface-400)]" />
                {o.nome}
              </span>
              {p ? (
                <>
                  <span className="block text-sm text-mono text-sky-500 mt-1">
                    {fmtBRL(p.aReceber)}
                  </span>
                  <span className="block text-[10px] text-[var(--surface-400)]">
                    ainda a receber
                  </span>
                  {p.aLancar > 0.005 && (
                    <span className="block text-[10px] text-amber-500 mt-0.5">
                      ~{fmtBRL(p.aLancar)} a registrar
                      {p.diasSemLancar !== null ? ` · ${p.diasSemLancar}d` : ''}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="block text-sm text-mono text-[var(--surface-600)] mt-1">
                    {fmtBRL(Math.max(Number(o.saldo || 0), 0))}
                  </span>
                  <span className="block text-[10px] text-[var(--surface-400)]">
                    saldo · sem previsão
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>

      {/* A lista do mês — eco do extrato, uma linha por linha do banco */}
      <div className="card p-3">
        <p className="text-[11px] uppercase tracking-wide text-[var(--surface-400)] mb-2">
          o que caiu em {mes.split('-').reverse().join('/')}
        </p>
        {visiveis.length === 0 ? (
          <p className="text-sm text-[var(--surface-400)] py-4 text-center">
            Nada registrado neste mês.
          </p>
        ) : (
          <div className="divide-y divide-[var(--surface-200)]">
            {visiveis.map(r => {
              const entrou = operadoras.some(o => o.conta_id === r.conta_id)
              return (
                <div key={r.id} className="flex items-center gap-3 py-2">
                  {entrou
                    ? <ArrowDownRight className="h-4 w-4 shrink-0 text-emerald-500" />
                    : <ArrowUpRight className="h-4 w-4 shrink-0 text-red-400" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--surface-700)] truncate">
                      {r.descricao || nomeConta(entrou ? r.conta_id : r.conta_destino_id)}
                    </p>
                    <p className="text-[11px] text-[var(--surface-400)]">
                      {fmtData(r.data)} · → {nomeConta(entrou ? r.conta_destino_id : r.conta_id)}
                    </p>
                  </div>
                  <span className={`text-sm text-mono shrink-0 ${entrou ? 'text-emerald-500' : 'text-red-400'}`}>
                    {entrou ? '' : '−'}{fmtBRL(Number(r.valor))}
                  </span>
                  {!somenteLeitura && (
                    <button
                      onClick={() => reutilizar(r)}
                      title="Reutilizar — abre um registro novo igual a este"
                      className="text-[var(--surface-400)] hover:text-[var(--brand-500)] shrink-0"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <p className="text-[11px] text-[var(--surface-400)]">
        O saldo só anda com o que você registra do extrato. A previsão é informativa —
        ela some do &quot;a registrar&quot; conforme você lança.
      </p>

      {/* ── O MODAL: operadora → movimento → valores ───────────────────────── */}
      <Modal
        isOpen={aberto}
        onClose={() => setAberto(false)}
        title="Registrar do extrato"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setAberto(false)} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={() => void salvar()} disabled={salvando} className="btn-primary text-sm">
              {salvando
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</>
                : <><Check className="h-4 w-4" /> Registrar</>}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* 1. QUAL OPERADORA — com uma só, mostra o nome fixo em vez de sumir
              (24/09/2026). Sumir deixava o formulário sem dizer em lugar nenhum
              de qual maquininha era o crédito; é o mesmo padrão do "Entrou na
              conta" logo abaixo, que com uma conta só também mostra o nome. */}
          {operadoras.length === 1 ? (
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">De qual operadora</label>
              <span className="text-sm text-[var(--surface-700)]">{operadoras[0].nome}</span>
            </div>
          ) : operadoras.length > 1 && (
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1.5">De qual operadora</label>
              <div className="flex flex-wrap gap-1.5">
                {operadoras.map(o => {
                  const on = operadoraId === o.conta_id
                  return (
                    <button
                      key={o.conta_id} type="button" onClick={() => setOperadoraId(o.conta_id)}
                      className="text-xs px-3 py-1.5 rounded-[var(--radius-md)] border transition-colors"
                      style={{
                        background: on ? 'rgba(16,185,129,0.12)' : 'transparent',
                        borderColor: on ? '#10b981' : 'var(--surface-200)',
                        color: on ? '#10b981' : 'var(--surface-600)',
                      }}
                    >{o.nome}</button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 2. QUAL MOVIMENTO */}
          <div>
            <label className="text-xs text-[var(--surface-500)] block mb-1.5">O que aconteceu</label>
            <div className="flex flex-wrap gap-1.5">
              {MOVIMENTOS.map(m => {
                const on = movimento === m.v
                return (
                  <button
                    key={m.v} type="button" onClick={() => setMovimento(m.v)}
                    className="text-xs px-3 py-1.5 rounded-[var(--radius-md)] border transition-colors"
                    style={{
                      background: on ? 'rgba(16,185,129,0.12)' : 'transparent',
                      borderColor: on ? '#10b981' : 'var(--surface-200)',
                      color: on ? '#10b981' : 'var(--surface-600)',
                    }}
                  >{m.label}</button>
                )
              })}
            </div>
            <p className="text-[11px] text-[var(--surface-400)] mt-1.5">{defMov.ajuda}</p>
            {'aviso' in defMov && defMov.aviso && (
              <p className="text-[11px] text-amber-500 mt-1">{defMov.aviso}</p>
            )}
          </div>

          {/* 3. QUANDO + QUANTO */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Quando caiu</label>
              <div className="flex gap-1 mb-1">
                {[{ v: false, l: 'Hoje' }, { v: true, l: 'Outra' }].map(op => {
                  const on = dataOutra === op.v
                  return (
                    <button
                      key={op.l} type="button"
                      onClick={() => { setDataOutra(op.v); if (!op.v) setData(hojeISO()) }}
                      className="flex-1 text-xs py-1 rounded-[var(--radius-md)] border transition-colors"
                      style={{
                        background: on ? 'rgba(16,185,129,0.12)' : 'transparent',
                        borderColor: on ? '#10b981' : 'var(--surface-200)',
                        color: on ? '#10b981' : 'var(--surface-600)',
                      }}
                    >{op.l}</button>
                  )
                })}
              </div>
              {dataOutra && (
                <input type="date" value={data} onChange={e => setData(e.target.value)}
                       className="input text-sm w-full" />
              )}
            </div>
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Quanto</label>
              <div className="flex items-center rounded-[var(--radius-md)] border overflow-hidden"
                   style={{ borderColor: 'var(--surface-300)', background: 'var(--surface-0)' }}>
                <span className="text-sm text-[var(--surface-400)] pl-2">R$</span>
                <input
                  type="text" inputMode="decimal"
                  value={valor ? emTexto(valor) : ''}
                  onChange={e => setValor(soDigitos(e.target.value))}
                  placeholder="0,00"
                  className="w-full bg-transparent border-0 outline-none text-sm text-mono px-2 py-2 text-[var(--surface-800)]"
                />
              </div>
            </div>
          </div>

          {/* 4. ONDE — a conta corrente da ponta */}
          <div>
            <label className="text-xs text-[var(--surface-500)] block mb-1">
              {defMov.entra ? 'Entrou na conta' : 'Saiu da conta'}
            </label>
            {destinos.length === 1 ? (
              <span className="text-sm text-[var(--surface-700)]">{destinos[0].nome}</span>
            ) : (
              <select value={destinoId} onChange={e => setDestinoId(e.target.value)}
                      className="input text-sm w-full">
                <option value="">Escolher…</option>
                {destinos.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.preferencial_recebimento ? '⭐ ' : ''}{d.nome}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="text-xs text-[var(--surface-500)] block mb-1">Observação</label>
            <input type="text" value={observacao} onChange={e => setObservacao(e.target.value)}
                   placeholder="opcional" className="input text-sm w-full" />
          </div>

          {/* A CONFERÊNCIA — informativa, nunca preenche o valor.
              Pré-preencher com a previsão seria a previsão virando caixa com um
              Enter: exatamente o que o botão "liquidar" do Caixa faz hoje de
              errado (ele chuta o saldo INTEIRO da maquininha). */}
          {operadoraId && previsoes[operadoraId] && defMov.entra && (
            <p className="text-[11px] text-[var(--surface-500)] pt-2 border-t"
               style={{ borderColor: 'var(--surface-200)' }}>
              {operadora?.nome} tem <span className="text-sky-500">{fmtBRL(previsoes[operadoraId].aReceber)}</span> ainda a receber
              {previsoes[operadoraId].aLancar > 0.005 && (
                <> · faltam ~{fmtBRL(previsoes[operadoraId].aLancar)} a registrar do extrato</>
              )}
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
