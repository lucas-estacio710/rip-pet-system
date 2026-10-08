'use client'

// LANÇAMENTOS ESPECIAIS — quitar obrigações (02/10/2026, mig 150).
//
// Desenho do Lucas: "a Matriz prepara o repasse; a unidade tem a tela de repasse
// pra ver; repasses fechados viram pré-lançamentos, e a quitação acontece em
// Lançamentos — um 'Lançamentos Especiais' com Pagamento de Repasse, onde ela
// confere o que a Matriz botou e dá ok... e também Pagamento de Fatura de
// Cartão, com a mesma lógica."
//
// 🔴 NENHUM DOS DOIS É DESPESA. O custo da cremação já está na DRE pelo
// acolhimento (mig 114/150) e as compras do cartão já estão lá uma a uma.
// Quitar só MOVE dinheiro: grava `fin_movimentos` (transferência pro repasse,
// fatura_cartao pra fatura). O "pré-lançamento" é uma LISTA do que está em
// aberto, montada do que já existe — não uma tabela nem um lançamento.
//
// M, M-1 ou M-2 não é configuração: a unidade vê o que está em aberto, do mais
// antigo pro mais novo, e paga quando paga. Cada pagamento aponta o mês/fatura
// que quita (`fin_repasses.pago_movimento_id`, `fin_movimentos.fatura_vencimento`).

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Loader2, ArrowLeftRight, CreditCard, ChevronLeft } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import { fmtBRL, fmtData, hojeISO, colarValorBR } from '@/lib/financeiro'

type Conta = { id: string; nome: string; produto: string | null; tipo: string | null; preferencial_recebimento: boolean | null }
type Repasse = {
  id: string; mes_referencia: string; status: string; qtd_pets: number
  total_bruto: number; total_deflator: number; total_liquido: number
  abate: number; acresce: number; aPagar: number
}
type Fatura = { venc: string; total: number; itens: { data: string; valor: number; nome: string }[] }
type Tela = 'menu' | 'repasse' | 'fatura'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const rotuloMes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`

// Máscara de centavos (a mesma do formulário): o state guarda dígitos.
const soDigitos = (t: string) => t.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12)
const emNumero = (d: string) => Number(d || '0') / 100
const emTexto = (d: string) => emNumero(d).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const paraDigitos = (n: number) => String(Math.round(Math.abs(n) * 100))

/** Vindo do Colar do extrato: a linha do banco já diz o valor, a data e a conta. */
export type QuitacaoInicial = { tipo: 'repasse' | 'fatura'; valor: number; data: string; contaId: string }

export default function LancamentosEspeciaisModal({ aberto, onClose, onRegistrou, inicial }: {
  aberto: boolean
  onClose: () => void
  onRegistrou: () => void
  inicial?: QuitacaoInicial | null
}) {
  const supabase = createClient() as unknown as SupabaseClient
  const { toast } = useToast()
  const { currentUnit, userName } = useUnit()

  const [tela, setTela] = useState<Tela>('menu')
  const [contas, setContas] = useState<Conta[]>([])
  const [contasMatriz, setContasMatriz] = useState<Conta[]>([])
  const [repasses, setRepasses] = useState<Repasse[]>([])
  const [faturasPorCartao, setFaturasPorCartao] = useState<Record<string, Fatura[]>>({})
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)

  // campos do pagamento (os dois fluxos usam)
  const [repasseId, setRepasseId] = useState('')       // '' = escolher · 'sem' = mês sem fechamento
  const [mesSem, setMesSem] = useState('')             // YYYY-MM, quando 'sem'
  const [cartaoId, setCartaoId] = useState('')
  const [faturaVenc, setFaturaVenc] = useState('')
  const [origemId, setOrigemId] = useState('')
  const [destinoMatrizId, setDestinoMatrizId] = useState('')
  const [data, setData] = useState(hojeISO())
  const [valor, setValor] = useState('')

  const correntes = contas.filter(c => c.produto !== 'maquininha' && c.tipo !== 'cartao' && c.produto !== 'cartao_credito')
  const cartoes = contas.filter(c => c.tipo === 'cartao' || c.produto === 'cartao_credito')
  const [inicialAplicado, setInicialAplicado] = useState(false)
  // "a carga desta abertura terminou" — `carregando` sozinho não serve: no
  // primeiro render depois de abrir ele ainda é false, com as listas vazias.
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    if (!aberto || !currentUnit?.id) return
    setTela('menu'); setInicialAplicado(false); setPronto(false)
    void carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, currentUnit?.id])

  // VINDO DO COLAR: terminada a carga, abre direto no pagamento certo, com o
  // valor, a data e a conta da linha do banco — e escolhe o repasse/fatura cujo
  // valor BATE com o Pix (senão fica o mais antigo, e a diferença aparece).
  useEffect(() => {
    if (!aberto || !pronto || !inicial || inicialAplicado) return
    setInicialAplicado(true)
    const centavos = (n: number) => Math.round(n * 100)
    if (inicial.tipo === 'repasse') {
      const bate = repasses.find(r => centavos(r.aPagar) === centavos(inicial.valor))
      setTela('repasse')
      setRepasseId(bate?.id || repasses[0]?.id || 'sem'); setMesSem('')
    } else {
      let achou: { cartao: string; venc: string } | null = null
      for (const [cartao, fs] of Object.entries(faturasPorCartao)) {
        const f = fs.find(x => centavos(x.total) === centavos(inicial.valor))
        if (f) { achou = { cartao, venc: f.venc }; break }
      }
      const c = achou?.cartao || cartoes.find(x => (faturasPorCartao[x.id] || []).length)?.id || cartoes[0]?.id || ''
      setTela('fatura')
      setCartaoId(c)
      setFaturaVenc(achou?.venc || (faturasPorCartao[c] || [])[0]?.venc || '')
    }
    setValor(paraDigitos(inicial.valor))
    setData(inicial.data)
    if (inicial.contaId) setOrigemId(inicial.contaId)
  }, [aberto, pronto, inicial, inicialAplicado, repasses, faturasPorCartao, cartoes])

  async function carregar() {
    if (!currentUnit?.id) return
    setCarregando(true)
    const uid = currentUnit.id
    const [{ data: cs }, { data: mz }, { data: rs }] = await Promise.all([
      supabase.from('contas').select('id, nome, produto, tipo, preferencial_recebimento')
        .or(`unidade_id.eq.${uid},unidades_extras.cs.{${uid}}`).eq('ativo', true).eq('legado', false).order('nome'),
      supabase.from('unidades').select('id').eq('is_matriz', true).limit(1),
      // Em aberto: nem pago, nem cancelado, nem já quitado por movimento. Inclui
      // 'aberto' (a Matriz ainda prepara): Santos pagou o de maio com ele aberto.
      supabase.from('fin_repasses')
        .select('id, mes_referencia, status, qtd_pets, total_bruto, total_deflator, total_liquido')
        .eq('unidade_id', uid).not('status', 'in', '(pago,cancelado)').is('pago_movimento_id', null)
        .order('mes_referencia'),
    ])
    const contasU = (cs as Conta[] | null) || []
    setContas(contasU)
    const corr = contasU.filter(c => c.produto !== 'maquininha' && c.tipo !== 'cartao' && c.produto !== 'cartao_credito')
    setOrigemId((corr.find(c => c.preferencial_recebimento) || corr[0])?.id || '')

    // contas da Matriz — destino do repasse
    const matrizId = (mz as { id: string }[] | null)?.[0]?.id
    if (matrizId) {
      const { data: cm } = await supabase.from('contas').select('id, nome, produto, tipo, preferencial_recebimento')
        .eq('unidade_id', matrizId).eq('ativo', true).eq('legado', false).order('nome')
      const lista = ((cm as Conta[] | null) || []).filter(c => c.produto !== 'maquininha' && c.tipo !== 'cartao')
      setContasMatriz(lista)
      setDestinoMatrizId(lista[0]?.id || '')
    }

    // a pagar de cada repasse = líquido − abatimentos + acréscimos (lib/repasse totalAPagar)
    type R = Omit<Repasse, 'abate' | 'acresce' | 'aPagar'>
    const lista = (rs as R[] | null) || []
    const ids = lista.map(r => r.id)
    const { data: ps } = ids.length
      ? await supabase.from('fin_repasse_permutas').select('repasse_id, valor, direcao').in('repasse_id', ids)
      : { data: [] }
    const perm = (ps as { repasse_id: string; valor: number; direcao: string }[] | null) || []
    setRepasses(lista.map(r => {
      const abate = perm.filter(p => p.repasse_id === r.id && p.direcao === 'abate').reduce((a, p) => a + Number(p.valor || 0), 0)
      const acresce = perm.filter(p => p.repasse_id === r.id && p.direcao === 'acresce').reduce((a, p) => a + Number(p.valor || 0), 0)
      return { ...r, abate, acresce, aPagar: Math.round((Number(r.total_liquido) - abate + acresce) * 100) / 100 }
    }))

    // faturas de cada cartão: lançamentos de crédito agrupados por vencimento,
    // menos as já quitadas por um movimento fatura_cartao com aquele vencimento.
    const cartIds = contasU.filter(c => c.tipo === 'cartao' || c.produto === 'cartao_credito').map(c => c.id)
    if (cartIds.length) {
      const [{ data: ls }, { data: pg }] = await Promise.all([
        supabase.from('fin_lancamentos')
          .select('conta_pagamento_id, data_caixa, data_competencia, valor, fornecedor_nome, fin_categorias(nome)')
          .in('conta_pagamento_id', cartIds).neq('status', 'rejeitado').not('data_caixa', 'is', null),
        supabase.from('fin_movimentos').select('conta_destino_id, fatura_vencimento')
          .eq('tipo', 'fatura_cartao').in('conta_destino_id', cartIds).not('fatura_vencimento', 'is', null),
      ])
      const pagas = new Set(((pg as { conta_destino_id: string; fatura_vencimento: string }[] | null) || [])
        .map(p => `${p.conta_destino_id}|${p.fatura_vencimento}`))
      type L = { conta_pagamento_id: string; data_caixa: string; data_competencia: string; valor: number; fornecedor_nome: string | null; fin_categorias: { nome: string } | null }
      const mapa: Record<string, Record<string, Fatura>> = {}
      for (const l of (ls as unknown as L[] | null) || []) {
        const venc = l.data_caixa.slice(0, 10)
        if (pagas.has(`${l.conta_pagamento_id}|${venc}`)) continue
        const porVenc = (mapa[l.conta_pagamento_id] ||= {})
        const f = (porVenc[venc] ||= { venc, total: 0, itens: [] })
        f.total += Number(l.valor || 0)
        f.itens.push({ data: l.data_competencia, valor: Number(l.valor || 0), nome: l.fornecedor_nome || l.fin_categorias?.nome || '—' })
      }
      setFaturasPorCartao(Object.fromEntries(Object.entries(mapa).map(([k, v]) =>
        [k, Object.values(v).sort((a, b) => a.venc.localeCompare(b.venc))])))
    } else setFaturasPorCartao({})
    setCarregando(false)
    setPronto(true)
  }

  function abrirRepasse() {
    setTela('repasse')
    const r = repasses[0]
    setRepasseId(r ? r.id : 'sem'); setMesSem('')
    // DATA EM BRANCO e obrigatória (08/10/2026): "hoje" e "vencimento" eram
    // palpites — a fatura de jul/2026 de ST foi paga em 08/07 e gravada em 10/07
    // (o vencimento que vinha preenchido). Pelo Importar extrato a data já chega
    // certa, a da linha do banco (`inicial`).
    setValor(r ? paraDigitos(r.aPagar) : ''); setData('')
  }
  function abrirFatura() {
    setTela('fatura')
    const c = cartoes.find(x => (faturasPorCartao[x.id] || []).length) || cartoes[0]
    setCartaoId(c?.id || '')
    const f = c ? (faturasPorCartao[c.id] || [])[0] : undefined
    setFaturaVenc(f?.venc || ''); setValor(f ? paraDigitos(f.total) : '')
    setData('')
  }

  const repasseSel = repasses.find(r => r.id === repasseId)
  const faturaSel = (faturasPorCartao[cartaoId] || []).find(f => f.venc === faturaVenc)
  const v = emNumero(valor)
  const esperado = tela === 'repasse' ? repasseSel?.aPagar : faturaSel?.total
  const diferenca = esperado !== undefined ? Math.round((v - esperado) * 100) / 100 : 0

  async function pagarRepasse() {
    if (!currentUnit?.id) return
    if (!origemId || !destinoMatrizId) return toast('Escolha as duas contas', 'error')
    if (!v) return toast('Informe o valor pago', 'error')
    if (repasseId === 'sem' && !mesSem) return toast('Diga de qual mês é esse repasse', 'error')
    if (!repasseId) return toast('Escolha o repasse', 'error')
    if (!data) return toast('Informe quando o pagamento saiu do banco', 'error')
    setSalvando(true)
    try {
      const mes = repasseSel ? rotuloMes(repasseSel.mes_referencia) : rotuloMes(`${mesSem}-01`)
      const { data: mov, error } = await supabase.from('fin_movimentos').insert({
        unidade_id: currentUnit.id,
        tipo: 'transferencia',
        conta_id: origemId,                 // sai da unidade
        conta_destino_id: destinoMatrizId,  // entra na Matriz
        data,
        valor: v,                           // o que saiu DE VERDADE, não o total do sistema
        descricao: `Repasse ${mes} · ${currentUnit.nome}${repasseSel ? '' : ' (mês sem fechamento no sistema)'}`,
        criado_por_nome: userName || null,
      }).select('id').single()
      if (error) throw new Error(error.message)
      if (repasseSel) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error: e2 } = await supabase.from('fin_repasses').update({
          status: 'pago',
          pago_em: `${data}T12:00:00-03:00`,  // a data DO PAGAMENTO, não a de hoje
          pago_por: user?.id || null,
          pago_movimento_id: (mov as { id: string }).id,
        }).eq('id', repasseSel.id)
        if (e2) throw new Error(`O dinheiro foi registrado, mas o repasse não foi marcado como pago: ${e2.message}`)
      }
      toast(`Repasse ${mes} pago — ${fmtBRL(v)}`, 'success')
      onRegistrou(); onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao registrar', 'error')
    } finally {
      setSalvando(false)
    }
  }

  async function pagarFatura() {
    if (!currentUnit?.id) return
    if (!origemId || !cartaoId || !faturaVenc) return toast('Escolha a conta, o cartão e a fatura', 'error')
    if (!v) return toast('Informe o valor pago', 'error')
    if (!data) return toast('Informe quando o pagamento saiu do banco', 'error')
    setSalvando(true)
    try {
      const cartao = cartoes.find(c => c.id === cartaoId)
      const { error } = await supabase.from('fin_movimentos').insert({
        unidade_id: currentUnit.id,
        tipo: 'fatura_cartao',
        conta_id: origemId,          // a conta corrente paga
        conta_destino_id: cartaoId,  // o acumulado do cartão
        data,
        valor: v,
        fatura_vencimento: faturaVenc,
        descricao: `Fatura ${cartao?.nome || ''} · vence ${fmtData(faturaVenc)}`,
        criado_por_nome: userName || null,
      })
      if (error) throw new Error(error.message)
      toast(`Fatura de ${fmtData(faturaVenc)} paga — ${fmtBRL(v)}`, 'success')
      onRegistrou(); onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao registrar', 'error')
    } finally {
      setSalvando(false)
    }
  }

  const campoValor = (
    <div>
      <label className="text-xs text-[var(--surface-500)] block mb-1">Valor pago</label>
      <input inputMode="numeric" value={valor ? emTexto(valor) : ''} placeholder="0,00"
             onChange={e => setValor(soDigitos(e.target.value))}
             onPaste={e => { const d = colarValorBR(e.clipboardData.getData('text')); if (d !== null) { e.preventDefault(); setValor(d) } }}
             className="input text-sm text-mono w-full" />
      {esperado !== undefined && Math.abs(diferenca) >= 0.005 && (
        <p className="text-[11px] text-amber-500 mt-1">
          {diferenca > 0 ? 'Pago a mais' : 'Pago a menos'}: {fmtBRL(Math.abs(diferenca))} em relação aos {fmtBRL(esperado)} esperados.
          {tela === 'fatura' && diferenca > 0 && ' Se foram juros/multa, lance a diferença em Despesas, Financeiro › Encargos.'}
          {tela === 'repasse' && ' Se for acerto que a Matriz ainda não lançou, avise — o caixa registra o que saiu de verdade.'}
        </p>
      )}
    </div>
  )

  const contaOrigem = (
    <div>
      <label className="text-xs text-[var(--surface-500)] block mb-1">Saiu da conta</label>
      <select value={origemId} onChange={e => setOrigemId(e.target.value)} className="input text-sm w-full">
        {correntes.map(c => <option key={c.id} value={c.id}>{c.preferencial_recebimento ? '⭐ ' : ''}{c.nome}</option>)}
      </select>
    </div>
  )

  return (
    <Modal
      isOpen={aberto}
      onClose={onClose}
      title={tela === 'menu' ? 'Quitação' : tela === 'repasse' ? 'Pagamento de repasse' : 'Pagamento de fatura de cartão'}
      footer={tela === 'menu' ? undefined : (
        <div className="flex justify-between gap-2 w-full">
          <button onClick={() => setTela('menu')} className="btn-secondary text-sm inline-flex items-center gap-1">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </button>
          <button onClick={() => void (tela === 'repasse' ? pagarRepasse() : pagarFatura())}
                  disabled={salvando} className="btn-primary text-sm">
            {salvando ? <><Loader2 className="h-4 w-4 animate-spin" /> Registrando…</> : 'Confirmar pagamento'}
          </button>
        </div>
      )}
    >
      {carregando ? (
        <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--surface-400)]" /></div>
      ) : tela === 'menu' ? (
        <div className="space-y-2">
          <p className="text-xs text-[var(--surface-500)]">
            Quitar o que já está lançado ou cobrado. Nada aqui é despesa nova — o custo já está na DRE;
            só registra o dinheiro saindo.
          </p>
          <button onClick={abrirRepasse} className="w-full text-left card p-3 hover:border-[var(--brand-500)] transition-colors flex items-center gap-3">
            <ArrowLeftRight className="h-5 w-5 text-[var(--brand-500)] shrink-0" />
            <span className="flex-1">
              <span className="block text-sm text-[var(--surface-800)]">Pagamento de repasse</span>
              <span className="block text-[11px] text-[var(--surface-500)]">
                {repasses.length ? `${repasses.length} em aberto · o mais antigo: ${rotuloMes(repasses[0].mes_referencia)} (${fmtBRL(repasses[0].aPagar)})` : 'nenhum em aberto · dá pra pagar um mês sem fechamento'}
              </span>
            </span>
          </button>
          <button onClick={abrirFatura} disabled={!cartoes.length}
                  className="w-full text-left card p-3 hover:border-[var(--brand-500)] transition-colors flex items-center gap-3 disabled:opacity-50">
            <CreditCard className="h-5 w-5 text-[var(--brand-500)] shrink-0" />
            <span className="flex-1">
              <span className="block text-sm text-[var(--surface-800)]">Pagamento de fatura de cartão</span>
              <span className="block text-[11px] text-[var(--surface-500)]">
                {!cartoes.length ? 'nenhum cartão cadastrado (aba Contas)'
                  : `${Object.values(faturasPorCartao).reduce((a, f) => a + f.length, 0)} fatura(s) em aberto`}
              </span>
            </span>
          </button>
        </div>
      ) : tela === 'repasse' ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[var(--surface-500)] block mb-1">Qual repasse</label>
            <select value={repasseId}
                    onChange={e => {
                      setRepasseId(e.target.value)
                      const r = repasses.find(x => x.id === e.target.value)
                      setValor(r ? paraDigitos(r.aPagar) : '')
                    }}
                    className="input text-sm w-full">
              {repasses.map(r => (
                <option key={r.id} value={r.id}>
                  {rotuloMes(r.mes_referencia)} · {r.qtd_pets} pets · a pagar {fmtBRL(r.aPagar)}
                </option>
              ))}
              <option value="sem">Mês sem fechamento no sistema…</option>
            </select>
          </div>

          {repasseSel ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--surface-200)] p-2 text-xs space-y-0.5">
              <p className="flex justify-between"><span className="text-[var(--surface-500)]">{repasseSel.qtd_pets} pets · bruto</span><span className="text-mono">{fmtBRL(repasseSel.total_bruto)}</span></p>
              {Number(repasseSel.total_deflator) > 0 && <p className="flex justify-between"><span className="text-[var(--surface-500)]">descontos por pet</span><span className="text-mono">− {fmtBRL(repasseSel.total_deflator)}</span></p>}
              {repasseSel.abate > 0 && <p className="flex justify-between"><span className="text-[var(--surface-500)]">acertos que abatem</span><span className="text-mono">− {fmtBRL(repasseSel.abate)}</span></p>}
              {repasseSel.acresce > 0 && <p className="flex justify-between"><span className="text-[var(--surface-500)]">acertos que acrescem</span><span className="text-mono">+ {fmtBRL(repasseSel.acresce)}</span></p>}
              <p className="flex justify-between font-semibold pt-1 border-t border-[var(--surface-200)]"><span>A pagar</span><span className="text-mono">{fmtBRL(repasseSel.aPagar)}</span></p>
            </div>
          ) : (
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">De qual mês (dos acolhimentos)</label>
              <input type="month" value={mesSem} onChange={e => setMesSem(e.target.value)} className="input text-sm w-full" />
              <p className="text-[11px] text-[var(--surface-400)] mt-1">
                Para meses de antes do repasse existir no sistema. Registra só o dinheiro saindo; o custo do mês
                continua sendo o dos acolhimentos.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {contaOrigem}
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Entrou na conta da Matriz</label>
              <select value={destinoMatrizId} onChange={e => setDestinoMatrizId(e.target.value)} className="input text-sm w-full">
                {contasMatriz.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Saiu do banco em</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)} className="input text-sm w-full"
                     style={!data ? { borderColor: '#f59e0b' } : undefined} />
            </div>
            {campoValor}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Cartão</label>
              <select value={cartaoId}
                      onChange={e => {
                        setCartaoId(e.target.value)
                        const f = (faturasPorCartao[e.target.value] || [])[0]
                        setFaturaVenc(f?.venc || ''); setValor(f ? paraDigitos(f.total) : '')
                      }}
                      className="input text-sm w-full">
                {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Fatura</label>
              <select value={faturaVenc}
                      onChange={e => {
                        setFaturaVenc(e.target.value)
                        const f = (faturasPorCartao[cartaoId] || []).find(x => x.venc === e.target.value)
                        setValor(f ? paraDigitos(f.total) : '')
                      }}
                      className="input text-sm w-full">
                {!(faturasPorCartao[cartaoId] || []).length && <option value="">nenhuma em aberto</option>}
                {(faturasPorCartao[cartaoId] || []).map(f => (
                  <option key={f.venc} value={f.venc}>vence {fmtData(f.venc)} · {fmtBRL(f.total)}</option>
                ))}
              </select>
            </div>
          </div>

          {faturaSel && (
            <div className="rounded-[var(--radius-md)] border border-[var(--surface-200)] max-h-48 overflow-y-auto divide-y divide-[var(--surface-200)]">
              {faturaSel.itens.map((it, k) => (
                <p key={k} className="flex justify-between gap-2 px-2 py-1 text-[11px]">
                  <span className="text-[var(--surface-500)] shrink-0">{fmtData(it.data)}</span>
                  <span className="flex-1 truncate text-[var(--surface-700)]">{it.nome}</span>
                  <span className="text-mono">{fmtBRL(it.valor)}</span>
                </p>
              ))}
              <p className="flex justify-between px-2 py-1 text-xs font-semibold"><span>{faturaSel.itens.length} lançamentos</span><span className="text-mono">{fmtBRL(faturaSel.total)}</span></p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {contaOrigem}
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Saiu do banco em</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)} className="input text-sm w-full"
                     style={!data ? { borderColor: '#f59e0b' } : undefined} />
            </div>
          </div>
          {campoValor}
        </div>
      )}
    </Modal>
  )
}
