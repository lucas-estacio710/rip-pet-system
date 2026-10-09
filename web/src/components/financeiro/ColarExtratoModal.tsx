'use client'

// COLAR DO EXTRATO — UM BOTÃO SÓ (02/10/2026).
//
// Pedido do Lucas: "um botão mais inteligente, do lado do Receitas a Prazo, que
// eu colasse qualquer coisa, e ele mesmo já faria a identificação". Substitui os
// dois colares (Despesas e Receitas a Prazo) que existiram por dois dias.
//
// A PERGUNTA QUE SEPARA AS LINHAS É "ISTO JÁ ESTÁ NO SISTEMA?". Cada linha do
// extrato tem de ter um par no Caixa daquela conta (`vw_caixa`): o pagamento do
// contrato, a despesa, a liquidação. Data + valor com sinal, contando
// ocorrências, e com as partes de uma despesa DIVIDIDA somadas (mig 149). O que
// sobra é novo, e vai para um de três destinos:
//   - RECEITA A PRAZO — entrada de maquininha (maquininha escolhida pro lote,
//     movimento pelo histórico);
//   - DESPESA — saída (categoria pelo histórico, forma e fornecedor pelo texto);
//   - FORA — fatura de cartão, aplicação, ou entrada sem par (um Pix de tutor que
//     ninguém registrou no contrato: o lugar é o contrato, não aqui).
// O HISTÓRICO decide primeiro (`lib/similaridade`, sobre os registros e despesas
// que guardaram o texto do banco); sem histórico, a pista do texto e o sinal.
// Em toda linha a pessoa pode trocar o destino.
//
// ⚠️ São DOIS inserts (fin_movimentos e fin_lancamentos): não há transação entre
// tabelas pelo PostgREST. Se o segundo falhar, a tela diz o que entrou.

import { useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Loader2, ClipboardPaste } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import { fmtBRL, fmtData, colarValorBR } from '@/lib/financeiro'
import {
  lerExtrato, movimentoDe, pareceMaquininha, metodoDe, fornecedorDe, naoEDespesa, quitacaoDe, foraDoCartao, cabecalhoFatura,
  ROTULO_MOV, ENTRA_MOV, movDoRegistro, type MovMaquininha, type LinhaExtrato,
} from '@/lib/extrato'
import { criarIndice, sugerir, type Sugestao } from '@/lib/similaridade'
import { buscarCategorias, sugerirPorSinonimo, type CategoriaBuscavel } from '@/lib/busca-categoria'
import { conciliar, semPar, type RegistroSistema, type Ref } from '@/lib/conciliacao'
import { reconhecerCobranca } from '@/lib/reconhecer-cobranca'

type ContaRow = { id: string; nome: string; produto: string | null; tipo: string | null; preferencial_recebimento: boolean | null }
type Cat = {
  id: string
  fin_conta_id: string | null
  pergunta_capex: boolean
  fin_contas?: { codigo: string; nome: string; natureza: string } | null
}
type Destino = 'receita' | 'despesa' | 'fora'
/** O que o histórico pode sugerir: uma decisão de receita OU de despesa. */
type Decisao = { tipo: 'receita'; opId: string; mov: MovMaquininha | null } | { tipo: 'despesa'; catId: string }

const METODOS = [
  { v: 'pix', l: 'Pix' }, { v: 'debito', l: 'Débito' }, { v: 'boleto', l: 'Boleto' },
  { v: 'transferencia', l: 'Transf.' }, { v: 'dinheiro', l: 'Dinheiro' },
]

/** Folga da conciliação (lib/conciliacao): ±dias e, só no cartão, ±câmbio. */
const JANELA_DIAS = 5
const TOLERANCIA_CAMBIO = 0.05

/** "Foi para outras unidades" (V2, etapa 3): cada unidade com a sua parte. Com a
 *  Matriz numa ponta, a parte vai no repasse (já reconhecida); sem ela, vira
 *  cobrança direta que a outra unidade confirma — a regra do lançamento avulso. */
type ParaUnidade = { key: string; unidadeId: string; valor: string; modo: 'agora' | 'repasse'; repasseId: string }
type UnidadeRow = { id: string; codigo: string; nome: string; is_matriz: boolean }
type RepasseRow = { id: string; unidade_id: string; mes_referencia: string; status: string }

/** Uma parte de despesa DIVIDIDA (mig 149): categoria + valor em dígitos (centavos). */
type Parte = { key: string; catId: string; catTexto: string; valor: string }
const soDigitos = (t: string) => t.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12)
const digNum = (d: string) => Number(d || '0') / 100
const digTxt = (d: string) => digNum(d).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const mesMais = (iso: string, k: number) => {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1 + k, 1)
  return `${MESES_ABREV[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`
}

type Item = LinhaExtrato & {
  jaNoSistema: string | null     // com o que bateu ("contrato MEL"), ou null
  exatos: RegistroSistema[]      // o(s) registro(s) do par exato — viram conciliação
  /** Par com folga (data/câmbio) ou com mais de um candidato. `escolhido`:
   *  índice do candidato; -1 = "é outro, lançar novo"; -2 = ainda não escolheu. */
  parecido: { tipo: 'provavel' | 'ambiguo'; candidatos: RegistroSistema[]; escolhido: number } | null
  destino: Destino
  motivoFora: string | null
  marcado: boolean
  // receita
  opId: string                   // '' = a maquininha do lote
  mov: MovMaquininha | ''
  // despesa
  catId: string
  catTexto: string
  metodo: string
  fornecedor: string
  // A LINHA QUE CRESCE (V2, etapa 2): o que o lançamento avulso faz, dentro da linha.
  partes: Parte[]                // dividir: a principal (catId) fica com o que sobra
  outras: ParaUnidade[]          // foi para outras unidades: o resto fica com esta
  meses: number                  // vale por vários meses (rateio_meses); 1 = não
  doHistorico: boolean
  porSinonimo: boolean           // categoria veio do sinônimo (sem histórico) — confira
  /** PALPITE pelo nome (sinônimo da árvore): só SUGERE, nunca escolhe — aparece
   *  como "talvez: X?" e vale depois de um clique (08/10/2026: verde e já escolhido
   *  parecia certeza, e era "Taxa de Pix" pra bonificação). */
  palpite: string
  sugestoes: Sugestao<Decisao>[]
  /** ENTRE CONTAS (08/10/2026): a outra conta da unidade — aplicação, resgate,
   *  Pix pra outra conta da casa. Vira transferência em `fin_movimentos`, nunca
   *  despesa. `entreHist`: veio do histórico ("como das outras vezes"). */
  entreConta: string
  entreHist: boolean
  /** ESTORNO no cartão (09/10/2026): crédito na fatura ("+ R$", "ESTORNO…") vira
   *  lançamento NEGATIVO na mesma fatura, com a categoria da compra original —
   *  abate a fatura e a despesa da DRE. O banco aceita (`valor <> 0`, mig 103). */
  estorno: boolean
}

/** Crédito na fatura: "+ R$ 1,20" (Inter) ou texto de estorno/reembolso. */
const creditoNoCartao = (l: { original: string; descricao: string }) =>
  /\+\s*R\$/.test(l.original) || (foraDoCartao(l.descricao) || '').startsWith('estorno')

/** A chave do "entre contas": o nome entre aspas / do favorecido, sem número. */
const chaveEntre = (d: string) => (fornecedorDe(d) || d).normalize('NFD').toLowerCase()
  .replace(/[^a-z ]/g, ' ').replace(/ +/g, ' ').trim()

export default function ColarExtratoModal({
  aberto, onClose, categorias, folhas, caminhoDe, mes, onRegistrou, permiteReceitas = true, onQuitar,
}: {
  aberto: boolean
  onClose: () => void
  categorias: Cat[]
  folhas: CategoriaBuscavel[]
  caminhoDe: (id: string) => string
  mes: string
  onRegistrou: () => void
  /** FLS `obj_fin_receitas_prazo`: escondida a faixa, o colar não cria receita a prazo. */
  permiteReceitas?: boolean
  /** Linha que é quitação (repasse à Matriz, fatura de cartão): abre o pagamento
   *  em Lançamentos especiais já preenchido com valor, data e conta da linha. */
  onQuitar?: (q: { tipo: 'repasse' | 'fatura'; valor: number; data: string; contaId: string }) => void
}) {
  const supabase = createClient() as unknown as SupabaseClient
  const { toast } = useToast()
  const { currentUnit, userName } = useUnit()

  const [texto, setTexto] = useState('')
  const [itens, setItens] = useState<Item[]>([])
  const [contas, setContas] = useState<ContaRow[]>([])
  const [contaId, setContaId] = useState('')         // de QUAL conta é o extrato
  const [maquininhaLote, setMaquininhaLote] = useState('')
  const [lendo, setLendo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  // CONFERÊNCIA INVERSA: o que está no sistema (no período colado, ou na fatura)
  // e não casou com linha nenhuma — lançamento a mais, cancelado, valor errado.
  const [paraVerso, setParaVerso] = useState<RegistroSistema[]>([])
  // O PLACAR (V2): saldo do banco no último dia lido × saldo do sistema até ele.
  const [placar, setPlacar] = useState<{ data: string; banco: number | null; sistema: number } | null>(null)
  // Linhas com o detalhe aberto (fornecedor, forma, maquininha) e a seção "Encontramos".
  const [abertos, setAbertos] = useState<Set<number>>(new Set())
  // Destinos possíveis de "foi para outras unidades" e os repasses que aceitam acerto.
  const [unidades, setUnidades] = useState<UnidadeRow[]>([])
  const [repassesAbertos, setRepassesAbertos] = useState<RepasseRow[]>([])
  useEffect(() => {
    if (!aberto || !currentUnit?.id) return
    void supabase.from('unidades').select('id, codigo, nome, is_matriz')
      .eq('ativa', true).neq('id', currentUnit.id).order('nome')
      .then(({ data }) => setUnidades((data as UnidadeRow[] | null) || []))
    void supabase.from('fin_repasses').select('id, unidade_id, mes_referencia, status')
      .in('status', ['aberto', 'enviado']).order('mes_referencia', { ascending: false })
      .then(({ data }) => setRepassesAbertos((data as RepasseRow[] | null) || []))
  }, [aberto, currentUnit?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  /** O repasse é sempre Matriz ↔ unidade: só há "no repasse" se uma ponta é a Matriz. */
  const unidadeDoRepasse = (destinoId: string): string | null => {
    if (currentUnit?.is_matriz) return destinoId
    return unidades.find(u => u.id === destinoId)?.is_matriz ? currentUnit?.id || null : null
  }
  const [encontradasAberto, setEncontradasAberto] = useState(false)

  const maquininhas = contas.filter(c => c.produto === 'maquininha')
  const correntes = contas.filter(c => c.produto !== 'maquininha' && c.tipo !== 'cartao')
  // FATURA DE CARTÃO também se cola (02/10/2026). Muda três coisas: (1) cada compra
  // sai do caixa no VENCIMENTO da fatura, não no dia — então pergunta-se qual
  // fatura; (2) o "já no sistema" compara pela data da COMPRA (data_competencia),
  // porque no Caixa o lançamento de crédito está na data do vencimento; (3) o
  // pagamento da fatura e o estorno ficam de fora — o pagamento é o Pagamento de
  // fatura em Lançamentos especiais, lançado do lado da conta corrente.
  const cartoes = contas.filter(c => c.tipo === 'cartao')
  const ehCartao = cartoes.some(c => c.id === contaId)
  const [faturas, setFaturas] = useState<{ venc: string; total: number; qtd: number }[]>([])
  const [vencimento, setVencimento] = useState('')
  const [novaFatura, setNovaFatura] = useState(false)
  // Cabeçalho da fatura colada (vencimento + total), pra preencher e conferir.
  const [cabecalho, setCabecalho] = useState<{ venc: string; total: number } | null>(null)
  useEffect(() => {
    setVencimento(''); setNovaFatura(false); setFaturas([])
    if (!ehCartao || !contaId) return
    let cancelado = false
    void (async () => {
      const { data: ls } = await supabase.from('fin_lancamentos')
        .select('data_caixa, valor')
        .eq('conta_pagamento_id', contaId).eq('metodo_pagamento', 'credito')
        .neq('status', 'rejeitado').not('data_caixa', 'is', null)
      if (cancelado) return
      const m = new Map<string, { total: number; qtd: number }>()
      for (const l of (ls as { data_caixa: string; valor: number }[] | null) || []) {
        const k = l.data_caixa.slice(0, 10)
        const a = m.get(k) || { total: 0, qtd: 0 }
        m.set(k, { total: a.total + Number(l.valor || 0), qtd: a.qtd + 1 })
      }
      const lista = [...m.entries()].map(([venc, v]) => ({ venc, ...v })).sort((a, b) => b.venc.localeCompare(a.venc))
      setFaturas(lista)
      if (!lista.length) setNovaFatura(true)
    })()
    return () => { cancelado = true }
  }, [ehCartao, contaId]) // eslint-disable-line react-hooks/exhaustive-deps

  // As contas da unidade (as dela + as compartilhadas com ela), sem legado.
  useEffect(() => {
    if (!aberto || !currentUnit?.id) return
    setTexto(''); setItens([])
    void supabase.from('contas')
      .select('id, nome, produto, tipo, preferencial_recebimento')
      .or(`unidade_id.eq.${currentUnit.id},unidades_extras.cs.{${currentUnit.id}}`)
      .eq('ativo', true).eq('legado', false).order('nome')
      .then(({ data }) => {
        const cs = (data as ContaRow[] | null) || []
        setContas(cs)
        const corr = cs.filter(c => c.produto !== 'maquininha' && c.tipo !== 'cartao')
        setContaId((corr.find(c => c.preferencial_recebimento) || corr[0])?.id || '')
        const maq = cs.filter(c => c.produto === 'maquininha')
        setMaquininhaLote(maq.length === 1 ? maq[0].id : '')
      })
  }, [aberto, currentUnit?.id, supabase])

  async function ler() {
    if (!contaId) return toast('Escolha de qual conta é o extrato', 'error')
    const ano = Number(mes.slice(0, 4)) || new Date().getFullYear()
    // No cartão o sinal do banco não serve: há fatura que lista a compra positiva.
    // Toda linha que não é pagamento nem estorno é COMPRA, e compra é saída.
    const linhas = lerExtrato(texto, ano, undefined, { cartao: ehCartao }).map(l => {
      if (!ehCartao) return l
      if (creditoNoCartao(l)) return { ...l, valor: Math.abs(l.valor) }   // estorno: entra
      return foraDoCartao(l.descricao) ? l : { ...l, valor: -Math.abs(l.valor) }
    })
    if (!linhas.length) { setItens([]); return toast('Nenhuma linha com data e valor no texto colado', 'error') }
    setLendo(true)
    const datas = linhas.map(l => l.data).sort()
    const ini = datas[0], fim = datas[datas.length - 1]
    const maqIds = maquininhas.map(m => m.id)

    // A busca vai JANELA_DIAS além das pontas: o caxias que lançou no dia 9 a
    // compra do dia 11 tem de ser achado colando o extrato de 11 a 15.
    const somaDias = (iso: string, d: number) => new Date(Date.parse(iso) + d * 86400000).toISOString().slice(0, 10)
    const iniJ = somaDias(ini, -JANELA_DIAS), fimJ = somaDias(fim, JANELA_DIAS)
    // Vencimento da fatura: o escolhido, ou o do cabeçalho colado.
    const vencLido = vencimento || (ehCartao ? cabecalhoFatura(texto)?.venc || '' : '')

    const [caixa, divs, histMov, histDesp] = await Promise.all([
      // 1) O QUE JÁ ESTÁ no Caixa desta conta nessas datas — de qualquer origem.
      //    No CARTÃO, pela data da compra: no Caixa ele está no vencimento. E as
      //    compras desta fatura, mesmo fora da janela, pra conferência inversa.
      ehCartao
        ? supabase.from('fin_lancamentos')
            .select('id, data_competencia, data_caixa, valor, divisao_id, observacoes, fornecedor_nome, descricao')
            .eq('conta_pagamento_id', contaId).neq('status', 'rejeitado')
            .or(`and(data_competencia.gte.${iniJ},data_competencia.lte.${fimJ})${vencLido ? `,data_caixa.eq.${vencLido}` : ''}`)
        : supabase.from('vw_caixa').select('data, valor, origem, origem_id, descricao')
            .eq('conta_id', contaId).gte('data', iniJ).lte('data', fimJ),
      // 2) As divisões dessas despesas, pra somar as partes (uma linha no banco).
      ehCartao
        ? Promise.resolve({ data: [] })
        : supabase.from('fin_lancamentos').select('id, divisao_id')
            .eq('conta_pagamento_id', contaId).not('divisao_id', 'is', null)
            .gte('data_caixa', iniJ).lte('data_caixa', fimJ),
      // 3) A MEMÓRIA de receitas: registros que guardaram o texto do banco.
      maqIds.length
        ? supabase.from('fin_movimentos').select('descricao, conta_id, conta_destino_id, data')
            .eq('tipo', 'transferencia')
            .or(`conta_id.in.(${maqIds.join(',')}),conta_destino_id.in.(${maqIds.join(',')})`)
            .like('descricao', '% — %').order('created_at', { ascending: false }).limit(1000)
        : Promise.resolve({ data: [] }),
      // 4) A MEMÓRIA de despesas da unidade.
      supabase.from('fin_lancamentos')
        .select('fornecedor_nome, descricao, observacoes, categoria_id, data_competencia')
        .eq('unidade_id', currentUnit!.id).not('categoria_id', 'is', null).neq('status', 'rejeitado')
        .order('created_at', { ascending: false }).limit(2000),
    ])

    // ── os registros do sistema, agrupados (divisão = um só) e com as refs ──
    type CX = { data: string; valor: number; origem: Ref['origem']; origem_id: string; descricao: string | null }
    type LC = { id: string; data_competencia: string; data_caixa: string | null; valor: number; divisao_id: string | null; observacoes: string | null; fornecedor_nome: string | null; descricao: string | null }
    const divisaoDe = new Map<string, string>()
    if (ehCartao) for (const l of (caixa.data as LC[] | null) || []) { if (l.divisao_id) divisaoDe.set(l.id, l.divisao_id) }
    else for (const d of (divs.data as { id: string; divisao_id: string }[] | null) || []) divisaoDe.set(d.id, d.divisao_id)
    const vencDe = new Map<string, string | null>()   // cartão: id → vencimento
    const linhasCaixa: CX[] = ehCartao
      ? ((caixa.data as LC[] | null) || []).map(l => {
          vencDe.set(l.id, l.data_caixa ? l.data_caixa.slice(0, 10) : null)
          return {
            data: l.data_competencia.slice(0, 10), valor: -Number(l.valor), origem: 'lancamento' as const, origem_id: l.id,
            descricao: l.observacoes || l.fornecedor_nome || l.descricao || 'compra no cartão',
          }
        })
      : ((caixa.data as CX[] | null) || [])
    const agrup = new Map<string, RegistroSistema>()
    linhasCaixa.forEach((r, idx) => {
      const grupo = r.origem === 'lancamento' ? divisaoDe.get(r.origem_id) : undefined
      const chave = grupo ? `div-${grupo}` : `${r.origem}-${r.origem_id}-${idx}`
      const contrato = r.origem === 'pagamento' ? (r.descricao || '').trim() : null
      const reg = agrup.get(chave) || {
        chave, data: r.data, valor: 0, contrato, refs: [],
        rotulo: contrato ? `contrato ${contrato.split(' ').slice(1).join(' ')}`.trim() : (r.descricao || 'registro do caixa'),
        ajustavel: r.origem === 'lancamento' && !grupo ? r.origem_id : null,
      }
      reg.valor = Math.round((reg.valor + Number(r.valor)) * 100) / 100
      reg.refs.push({ origem: r.origem, origem_id: r.origem_id })
      agrup.set(chave, reg)
    })
    const registros = [...agrup.values()]

    // Os quatro níveis (exato · contrato · provável · ambíguo) — lib/conciliacao.
    const pares = conciliar(linhas, registros, {
      janelaDias: JANELA_DIAS, toleranciaCambio: ehCartao ? TOLERANCIA_CAMBIO : 0, porContrato: !ehCartao,
    })
    const exatoDe = (n: number) => { const p = pares.get(n); return p && (p.tipo === 'exato' || p.tipo === 'contrato') ? p : null }

    // Conferência inversa: na fatura (cartão) ou no período colado (conta).
    setParaVerso(registros.filter(r => ehCartao
      ? !!vencLido && r.refs.some(x => vencDe.get(x.origem_id) === vencLido)
      : r.data >= ini && r.data <= fim))

    // ── a memória dos dois lados num índice só ──
    type HM = { descricao: string; conta_id: string; conta_destino_id: string; data: string }
    type HD = { fornecedor_nome: string | null; descricao: string | null; observacoes: string | null; categoria_id: string; data_competencia: string }
    const indice = criarIndice<Decisao>([
      ...((histMov.data as HM[] | null) || []).map(h => {
        const opId = maqIds.includes(h.conta_id) ? h.conta_id : h.conta_destino_id
        const mov = movDoRegistro(h.descricao)
        return { texto: h.descricao.slice(h.descricao.indexOf(' — ') + 3), decisao: { tipo: 'receita' as const, opId, mov }, chave: `R|${opId}|${mov}`, data: h.data }
      }),
      ...((histDesp.data as HD[] | null) || []).map(l => ({
        texto: `${l.observacoes || ''} ${l.fornecedor_nome || ''} ${l.descricao || ''}`.trim(),
        decisao: { tipo: 'despesa' as const, catId: l.categoria_id },
        chave: `D|${l.categoria_id}`,
        data: (l.data_competencia || '').slice(0, 10),
      })),
    ])

    // ESTORNO NO MESMO DIA: a saída e o estorno dela se anulam ("Pagamento de
    // Convenio VIVO SP −209,12" + "Estorno Pagamento ... +209,12", 17/06/2026).
    // Nenhum dos dois vira registro — o dinheiro não saiu.
    const estornadas = new Set<number>()
    for (const e of linhas) {
      if (e.valor <= 0 || exatoDe(e.n) || !/estorno/i.test(e.descricao)) continue
      const saida = linhas.find(s => s.valor < 0 && !exatoDe(s.n) && !estornadas.has(s.n)
        && s.data === e.data && Math.abs(s.valor + e.valor) < 0.005)
      if (saida) { estornadas.add(e.n); estornadas.add(saida.n) }
    }

    // A MEMÓRIA do "entre contas": transferências desta conta com outra conta da
    // casa (fora as maquininhas, que são receita a prazo). Mesmo favorecido →
    // mesma outra conta, nas duas direções (aplicação e resgate do mesmo fundo).
    const entreDe = new Map<string, string>()
    if (!ehCartao) {
      const { data: hm } = await supabase.from('fin_movimentos').select('descricao, conta_id, conta_destino_id')
        .eq('tipo', 'transferencia').or(`conta_id.eq.${contaId},conta_destino_id.eq.${contaId}`)
        .order('created_at', { ascending: false }).limit(500)
      for (const h of (hm as { descricao: string | null; conta_id: string; conta_destino_id: string | null }[] | null) || []) {
        const outra = h.conta_id === contaId ? h.conta_destino_id : h.conta_id
        if (!outra || !h.descricao || maqIds.includes(outra)) continue
        const k = chaveEntre(h.descricao)
        if (k.length >= 4 && !entreDe.has(k)) entreDe.set(k, outra)
      }
    }

    setItens(linhas.map(l => {
      const base = {
        ...l, jaNoSistema: null as string | null, motivoFora: null as string | null, marcado: true,
        exatos: [] as RegistroSistema[], parecido: null as Item['parecido'],
        opId: '', mov: '' as MovMaquininha | '', catId: '', catTexto: '',
        metodo: ehCartao ? 'credito' : (metodoDe(l.descricao) || 'pix'), fornecedor: fornecedorDe(l.descricao),
        doHistorico: false, porSinonimo: false, palpite: '', sugestoes: [] as Sugestao<Decisao>[],
        partes: [] as Parte[], meses: 1, outras: [] as ParaUnidade[],
        entreConta: '', entreHist: false, estorno: false,
      }
      // 1) já está no sistema?
      const par = exatoDe(l.n)
      if (par) {
        const rot = par.tipo === 'contrato' ? `${par.candidatos[0].rotulo} (${par.candidatos.length} pagamentos)` : par.candidatos[0].rotulo
        return { ...base, destino: 'fora' as Destino, jaNoSistema: rot, exatos: par.candidatos, marcado: false }
      }
      if (estornadas.has(l.n)) {
        return { ...base, destino: 'fora' as Destino, marcado: false,
                 motivoFora: 'estornado no mesmo dia — a saída e o estorno se anulam' }
      }
      // 2a) cartão: pagamento da fatura e estorno não são compra
      // Crédito na fatura NÃO é fora: é estorno, segue como despesa negativa.
      const estorno = ehCartao && creditoNoCartao(l)
      if (ehCartao && !estorno) {
        const motivo = foraDoCartao(l.descricao)
        if (motivo) return { ...base, destino: 'fora' as Destino, motivoFora: motivo, marcado: false }
      }
      // 2) entre contas da casa, pelo histórico
      const entre = !ehCartao ? entreDe.get(chaveEntre(l.descricao)) : undefined
      if (entre) return { ...base, destino: 'fora' as Destino, marcado: false, entreConta: entre, entreHist: true,
                          motivoFora: 'entre contas da casa' }
      // 2b) saída que não é despesa (fatura, aplicação)
      const nao = l.valor < 0 && !ehCartao ? naoEDespesa(l.descricao) : null
      if (nao) return { ...base, destino: 'fora' as Destino, motivoFora: nao, marcado: false }

      // 3) o histórico, só com decisões compatíveis com a direção do dinheiro
      const r = sugerir(indice, l.descricao, undefined, { max: 3 })
      const validas = r.sugestoes.filter(s => s.decisao.tipo === 'despesa'
        ? l.valor < 0 || estorno
        : !!s.decisao.mov && ENTRA_MOV[s.decisao.mov] === (l.valor > 0))
      const top = validas[0]
      const alta = r.confianca === 'alta' && top === r.sugestoes[0]

      // 4) destino: histórico manda; sem ele, a pista do texto e o sinal
      let destino: Destino
      if (top && (alta || r.confianca === 'media')) destino = top.decisao.tipo
      else if (l.valor > 0) destino = pareceMaquininha(l.descricao) ? 'receita' : 'fora'
      else destino = 'despesa'
      if (destino === 'receita' && !permiteReceitas) destino = l.valor < 0 ? 'despesa' : 'fora'
      if (ehCartao) destino = 'despesa'

      const item: Item = { ...base, destino, sugestoes: validas, estorno }
      if (destino === 'fora') {
        item.marcado = false
        item.motivoFora = /pix recebido|transfer/i.test(l.descricao)
          ? 'entrada sem par no sistema — se for de tutor, registre o pagamento no contrato'
          : 'entrada que não é de maquininha nem está no sistema — confira'
      }
      if (destino === 'receita') {
        if (alta && top?.decisao.tipo === 'receita') { item.opId = top.decisao.opId; item.mov = top.decisao.mov || ''; item.doHistorico = true }
        if (!item.mov) item.mov = movimentoDe(l.descricao, l.valor) || ''
      }
      if (destino === 'despesa' && alta && top?.decisao.tipo === 'despesa') {
        item.catId = top.decisao.catId; item.catTexto = caminhoDe(top.decisao.catId); item.doHistorico = true
      }
      // Sem decisão do histórico: tenta o sinônimo da árvore (palavra inteira).
      if (destino === 'despesa' && !item.catId) {
        // Pelo nome de QUEM RECEBEU, não pelo texto do banco inteiro.
        const s = sugerirPorSinonimo(folhas, fornecedorDe(l.descricao) || l.descricao)
        if (s) item.palpite = s.id
      }
      const folga = pares.get(l.n)
      if (folga && (folga.tipo === 'provavel' || folga.tipo === 'ambiguo')) {
        item.parecido = { tipo: folga.tipo, candidatos: folga.candidatos, escolhido: folga.tipo === 'provavel' ? 0 : -2 }
      }
      return item
    }))
    // Fatura: o cabeçalho traz vencimento e total — preenche a fatura (se ainda
    // não escolhida) e guarda o total pra conferir a soma das compras.
    const cab = ehCartao ? cabecalhoFatura(texto) : null
    setCabecalho(cab)
    if (cab) {
      void supabase.from('fin_saldos_banco').upsert(
        { conta_id: contaId, data: cab.venc, saldo: -cab.total, origem: 'fatura', criado_por_nome: userName || null },
        { onConflict: 'conta_id,data' })
    }
    if (cab && !vencimento) { setVencimento(cab.venc); setNovaFatura(!faturas.some(f => f.venc === cab.venc)) }

    // O PLACAR (conta corrente). Banco: o saldo da ÚLTIMA linha do último dia
    // (no extrato do Inter, a ordem do texto é a do dia). Sistema: tudo o que o
    // Caixa tem nesta conta até esse dia — paginado, a conta passa de 1000 linhas.
    setAbertos(new Set()); setEncontradasAberto(false)
    if (ehCartao) setPlacar(null)
    else {
      const ultimo = [...linhas].reverse().find(l => l.data === fim && l.saldo !== null)
      let soma = 0
      for (let off = 0; ; off += 1000) {
        const { data: pg } = await supabase.from('vw_caixa').select('valor')
          .eq('conta_id', contaId).lte('data', fim)
          .order('data').order('origem_id').range(off, off + 999)
        const arr = (pg as { valor: number }[] | null) || []
        soma += arr.reduce((a, x) => a + Number(x.valor), 0)
        if (arr.length < 1000) break
      }
      setPlacar({ data: fim, banco: ultimo ? ultimo.saldo : null, sistema: Math.round(soma * 100) / 100 })
      // O saldo do banco é um FATO: fica guardado pra Visão do mês comparar
      // (mig 156). Sem a tabela, segue sem ele — o placar já funcionou.
      if (ultimo && ultimo.saldo !== null) {
        void supabase.from('fin_saldos_banco').upsert(
          { conta_id: contaId, data: fim, saldo: ultimo.saldo, origem: 'extrato', criado_por_nome: userName || null },
          { onConflict: 'conta_id,data' })
      }
    }
    setLendo(false)
  }

  const muda = (n: number, patch: Partial<Item>) => setItens(xs => xs.map(x => (x.n === n ? { ...x, ...patch } : x)))

  const emParecido = (i: Item) => !!i.parecido && i.parecido.escolhido !== -1
  const parecidos = itens.filter(emParecido)
  const receitas = itens.filter(i => !emParecido(i) && !i.jaNoSistema && i.destino === 'receita')
  const despesas = itens.filter(i => !emParecido(i) && !i.jaNoSistema && i.destino === 'despesa')
  const fora = itens.filter(i => !emParecido(i) && (i.jaNoSistema || i.destino === 'fora'))
  const confirmados = parecidos.filter(i => i.parecido!.escolhido >= 0)
  const exatosParaConciliar = itens.filter(i => i.exatos.length)
  // Escolha de um candidato não pode servir a duas linhas.
  const escolhidosChaves = confirmados.map(i => i.parecido!.candidatos[i.parecido!.escolhido].chave)
  const naoVieram = semPar(paraVerso, new Map(), [
    ...escolhidosChaves, ...itens.flatMap(i => i.exatos.map(r => r.chave)),
  ])
  const recProntas = receitas.filter(i => i.marcado && (i.opId || maquininhaLote) && i.mov)
  // Divisão: as partes têm categoria e valor, e SOBRA algo pra principal — o
  // total é o do banco, então ele não muda (mesma regra do lançamento avulso).
  const restanteDe = (i: Item) => Math.round((Math.abs(i.valor) - i.partes.reduce((a, pt) => a + digNum(pt.valor), 0)) * 100) / 100
  const partesOk = (i: Item) => i.partes.every(pt => pt.catId && digNum(pt.valor) > 0) && restanteDe(i) > 0
  const somaOutras = (i: Item) => i.outras.reduce((a, o) => a + digNum(o.valor), 0)
  const outrasOk = (i: Item) => i.outras.every(o => o.unidadeId && digNum(o.valor) > 0)
    && new Set(i.outras.map(o => o.unidadeId)).size === i.outras.length
    && somaOutras(i) <= Math.abs(i.valor) + 0.005
  const despProntas = despesas.filter(i => i.marcado && i.catId && partesOk(i) && outrasOk(i))
  const entreProntas = fora.filter(i => !i.jaNoSistema && i.entreConta)
  /** Pra onde o dinheiro pode ter ido: as outras contas da casa (sem maquininha e cartão). */
  const contasEntre = contas.filter(c => c.id !== contaId && c.produto !== 'maquininha' && c.tipo !== 'cartao')
  const pendentes = receitas.filter(i => i.marcado && !(i.opId || maquininhaLote) || (i.marcado && !i.mov)).length
    + despesas.filter(i => i.marcado && (!i.catId || !partesOk(i) || !outrasOk(i))).length
    + parecidos.filter(i => i.parecido!.escolhido === -2).length

  async function registrar() {
    if (!currentUnit?.id || !contaId) return
    if (!recProntas.length && !despProntas.length && !entreProntas.length && !confirmados.length && !exatosParaConciliar.length) {
      return toast('Nada pronto pra registrar', 'error')
    }
    if (ehCartao && despProntas.length && !vencimento) return toast('Escolha a fatura (o vencimento) dessas compras', 'error')
    setSalvando(true)
    let entrouRec = 0
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const agora = new Date().toISOString()
      // A CONCILIAÇÃO de cada linha (mig 153): linha do banco ↔ registro.
      type Conc = { conta_id: string; origem: Ref['origem']; origem_id: string; data_banco: string; valor_banco: number; texto_banco: string; como: string; criado_por_nome: string | null }
      const concs: Conc[] = []
      const conc = (i: Item, refs: Ref[], como: string) => refs.forEach(r => concs.push({
        conta_id: contaId, origem: r.origem, origem_id: r.origem_id, data_banco: i.data,
        valor_banco: i.valor, texto_banco: i.descricao, como, criado_por_nome: userName || null,
      }))
      for (const i of exatosParaConciliar) conc(i, i.exatos.flatMap(r => r.refs), 'exato')

      // CONFIRMADOS ("parece já lançado"): o BANCO manda. Lançamento único recebe
      // o valor e a data do banco — no cartão a data da compra, na conta a data do
      // caixa. Pagamento de contrato e movimento só conciliam (o valor já é igual).
      for (const i of confirmados) {
        const reg = i.parecido!.candidatos[i.parecido!.escolhido]
        if (reg.ajustavel && (Math.abs(reg.valor - i.valor) >= 0.005 || reg.data !== i.data)) {
          const { error } = await supabase.from('fin_lancamentos')
            .update(ehCartao
              ? { valor: i.estorno ? -Math.abs(i.valor) : Math.abs(i.valor), data_competencia: i.data }
              : { valor: Math.abs(i.valor), data_caixa: i.data })
            .eq('id', reg.ajustavel)
          if (error) throw new Error(`Ajustar "${reg.rotulo}": ${error.message}`)
        }
        conc(i, reg.refs, i.parecido!.tipo === 'provavel' ? 'provavel' : 'escolhido')
      }
      if (recProntas.length) {
        const rows = recProntas.map(i => {
          const mov = i.mov as MovMaquininha
          const opId = i.opId || maquininhaLote
          const op = maquininhas.find(m => m.id === opId)!
          return {
            unidade_id: currentUnit.id, tipo: 'transferencia',
            conta_id: ENTRA_MOV[mov] ? opId : contaId,
            conta_destino_id: ENTRA_MOV[mov] ? contaId : opId,
            data: i.data, valor: Math.abs(i.valor),
            descricao: `${ROTULO_MOV[mov]} · ${op.nome} — ${i.descricao}`,
            criado_por_nome: userName || null,
          }
        })
        const { data: novosMov, error } = await supabase.from('fin_movimentos').insert(rows).select('id')
        if (error) throw new Error(`Receitas a prazo: ${error.message}`)
        entrouRec = rows.length
        ;((novosMov as { id: string }[] | null) || []).forEach((m, k) => conc(recProntas[k], [{ origem: 'movimento', origem_id: m.id }], 'novo'))
      }
      if (entreProntas.length) {
        // ENTRE CONTAS: transferência — o sinal da linha diz a direção.
        const rows = entreProntas.map(i => ({
          unidade_id: currentUnit.id, tipo: 'transferencia',
          conta_id: i.valor < 0 ? contaId : i.entreConta,
          conta_destino_id: i.valor < 0 ? i.entreConta : contaId,
          data: i.data, valor: Math.abs(i.valor),
          descricao: i.descricao,   // texto do banco: ensina a próxima colagem
          criado_por_nome: userName || null,
        }))
        const { data: novos, error } = await supabase.from('fin_movimentos').insert(rows).select('id')
        if (error) throw new Error(`Entre contas: ${error.message}${entrouRec ? ` (as ${entrouRec} receitas a prazo JÁ entraram)` : ''}`)
        entrouRec += rows.length
        ;((novos as { id: string }[] | null) || []).forEach((m, k) => conc(entreProntas[k], [{ origem: 'movimento', origem_id: m.id }], 'novo'))
      }
      if (despProntas.length) {
        // Uma linha do banco = 1 lançamento, ou N com o MESMO divisao_id quando
        // foi dividida (a principal com o que sobra) — a regra do avulso. Um
        // insert só: ou entram todas as partes, ou nenhuma. `donos` guarda de
        // qual linha do banco veio cada lançamento, pra conciliar cada um.
        const donos: Item[] = []
        const principal = new Map<number, number>()   // linha do banco → índice do lançamento principal
        const rows = despProntas.flatMap(i => {
          principal.set(i.n, donos.length)
          const divisao_id = i.partes.length ? crypto.randomUUID() : null
          const pedacos = [
            { catId: i.catId, valor: i.estorno ? -Math.abs(i.valor) : i.partes.length ? restanteDe(i) : Math.abs(i.valor) },
            ...i.partes.map(pt => ({ catId: pt.catId, valor: digNum(pt.valor) })),
          ]
          return pedacos.map(pd => {
            const cat = categorias.find(c => c.id === pd.catId)
            const cc = cat?.fin_contas
            donos.push(i)
            return {
              unidade_id: currentUnit.id, categoria_id: pd.catId,
              conta_id: cat?.fin_conta_id || null,
              conta_codigo: cc?.codigo || null, conta_nome: cc?.nome || null,   // SNAPSHOT da DRE
              natureza: cc?.natureza || 'opex',
              descricao: null, observacoes: i.descricao,   // texto do banco: ensina a próxima colagem
              valor: pd.valor, data_competencia: i.data,
              data_caixa: ehCartao ? vencimento : i.data,   // cartão: sai do caixa no vencimento
              fornecedor_nome: i.fornecedor.trim() || null, conta_pagamento_id: contaId,
              metodo_pagamento: i.metodo, rateio_meses: Math.max(1, Math.min(120, i.meses || 1)), origem: 'manual',
              divisao_id,
              criado_por_nome: userName || null, status: 'aprovado',
              aprovado_por: user?.id || null, aprovado_por_nome: userName || null, aprovado_em: agora,
            }
          })
        })
        const { data: novosLanc, error } = await supabase.from('fin_lancamentos').insert(rows).select('id')
        if (error) throw new Error(`Despesas: ${error.message}${entrouRec ? ` (as ${entrouRec} receitas a prazo JÁ entraram)` : ''}`)
        const ids = ((novosLanc as { id: string }[] | null) || []).map(l => l.id)
        ids.forEach((id, k) => conc(donos[k], [{ origem: 'lancamento', origem_id: id }], 'novo'))

        // FOI PARA OUTRAS UNIDADES — o lançamento fica com o valor cheio (o
        // dinheiro saiu daqui); cada unidade vira uma cobrança, com a data do
        // gasto. Com a Matriz numa ponta e "no repasse", já reconhecida e presa
        // ao repasse escolhido; senão, `emitida` — a outra unidade confirma.
        for (const i of despProntas) {
          if (!i.outras.length) continue
          const origemId = ids[principal.get(i.n)!]
          const cat = categorias.find(c => c.id === i.catId)
          const desc = i.fornecedor.trim() || i.descricao
          for (const o of i.outras) {
            const vd = digNum(o.valor)
            const alvo = unidades.find(u => u.id === o.unidadeId)
            const { data: cob, error: e2 } = await supabase.from('fin_cobrancas').insert({
              unidade_credora: currentUnit.id, unidade_devedora: o.unidadeId,
              tipo: 'despesa_rateada', valor: vd, data: i.data, descricao: desc,
              categoria_id: i.catId, status: 'emitida',
              lancamento_origem_id: origemId, criado_por_nome: userName || null,
            }).select('id').single()
            if (e2) throw new Error(`Cobrança para ${alvo?.nome || 'a unidade'}: ${e2.message} (as despesas JÁ entraram)`)
            if (o.modo === 'repasse' && unidadeDoRepasse(o.unidadeId)) {
              const cobId = (cob as { id: string }).id
              await reconhecerCobranca(supabase, {
                id: cobId, tipo: 'despesa_rateada', valor: vd, data: i.data, descricao: desc,
                categoria_id: i.catId, unidade_credora: currentUnit.id, unidade_devedora: o.unidadeId,
                credoraNome: currentUnit.nome, devedoraCodigo: alvo?.codigo || null,
                fin_categorias: cat ? { fin_conta_id: cat.fin_conta_id, fin_contas: cat.fin_contas || null } : null,
              }, { userName: userName || null })
              if (o.repasseId) {
                const { error: e3 } = await supabase.from('fin_cobrancas')
                  .update({ repasse_id: o.repasseId, status: 'liquidada' }).eq('id', cobId)
                if (e3) throw new Error(`Repasse de ${alvo?.nome || 'a unidade'}: ${e3.message}`)
              }
            }
          }
        }
      }
      // Por último, e sem derrubar o que já entrou: se a mig 153 ainda não rodou,
      // os lançamentos ficam e só o selo de conciliado falta.
      if (concs.length) {
        const { error } = await supabase.from('fin_conciliacoes')
          .upsert(concs, { onConflict: 'conta_id,origem,origem_id', ignoreDuplicates: true })
        if (error) toast(`Registrado, mas a conciliação não foi gravada: ${error.message}`, 'error')
      }
      toast(`${recProntas.length} receitas a prazo · ${entreProntas.length} entre contas · ${despProntas.length} despesas · ${concs.length} conciliados`, 'success')
      onRegistrou()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao registrar', 'error')
      if (entrouRec) onRegistrou()
    } finally {
      setSalvando(false)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // O DESENHO (V2, 08/10/2026 — artifact 9uEYKTjnPY3gdhNkRA6Hho, aprovado pelo
  // Lucas): placar no topo (banco × sistema × depois de registrar), e as linhas
  // em seções que contam o que vai acontecer — Encontramos · Quase lá ·
  // Recebimentos · Despesas · Fora · Não veio. Roxo só no botão principal;
  // verde = conferido; âmbar = atenção. Valores à direita, em fonte de número.
  // ══════════════════════════════════════════════════════════════════════════

  // ⚠️ FUNÇÕES QUE DESENHAM, não componentes: um componente declarado aqui dentro
  // ganha identidade nova a cada render, e o React desmontaria a linha a cada
  // tecla — o campo de categoria perderia o foco no meio da digitação.

  const valorCor = (v: number) => (v > 0 ? 'text-emerald-500' : 'text-[var(--surface-700)]')
  const valorTxt = (v: number) => `${v > 0 ? '+' : '−'}${fmtBRL(Math.abs(v)).replace('R$', '').trim()}`
  const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  const grade = 'grid grid-cols-[22px_48px_minmax(0,1fr)_96px] sm:grid-cols-[22px_52px_minmax(0,1.1fr)_minmax(0,1fr)_110px] gap-x-3 gap-y-1 items-center'

  /** Linha "já no sistema": diz o que ela é, sem pedir nada. */
  function linhaEncontrada(i: Item) {
    return (
      <div key={i.n} className={`${grade} py-2.5 border-b border-[var(--surface-100)] last:border-0`}>
        <span className="text-emerald-500 text-xs" aria-hidden="true">✓</span>
        <span className="text-xs text-[var(--surface-400)]">{dataCurta(i.data)}</span>
        <span className="text-sm text-[var(--surface-600)] truncate" title={i.original}>{i.descricao}</span>
        <span className="hidden sm:block text-xs text-[var(--surface-400)] truncate">é {i.jaNoSistema}</span>
        <span className={`text-right text-mono text-sm tabular-nums ${valorCor(i.valor)}`}>{valorTxt(i.valor)}</span>
      </div>
    )
  }

  /** Linha nova (recebimento ou despesa): o essencial numa linha; o resto,
   *  tímido, embaixo — e abre dentro da própria linha. */
  function linhaNova(i: Item) {
    const aberta = abertos.has(i.n)
    const alternar = () => setAbertos(s => { const n = new Set(s); if (n.has(i.n)) n.delete(i.n); else n.add(i.n); return n })
    return (
      <div key={i.n} className="py-2.5 border-b border-[var(--surface-100)] last:border-0" style={{ opacity: i.marcado ? 1 : 0.5 }}>
        <div className={grade}>
          <input type="checkbox" checked={i.marcado} onChange={e => muda(i.n, { marcado: e.target.checked })}
                 aria-label="Registrar esta linha" className="h-4 w-4 accent-[var(--brand-500)]" />
          <span className="text-xs text-[var(--surface-400)]">{dataCurta(i.data)}</span>
          <span className="text-sm text-[var(--surface-600)] truncate" title={i.original}>
            {i.descricao}
            {i.estorno && <span className="ml-1.5 px-1.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-500" title="Crédito na fatura: entra negativo, abate a fatura e a despesa da categoria">estorno</span>}
            {i.fornecedor && i.destino === 'despesa' && <span className="text-[var(--surface-400)]"> · {i.fornecedor}</span>}
          </span>
          {/* A DECISÃO — categoria (despesa) ou o que a maquininha fez (recebimento) */}
          <span className="col-span-4 col-start-3 sm:col-span-1 sm:col-start-auto row-start-2 sm:row-start-auto min-w-0">
            {i.destino === 'despesa' && (i.catId ? (
              <span className="flex items-baseline gap-1.5 min-w-0">
                <span className="text-sm font-semibold text-emerald-500 truncate">
                  {caminhoDe(i.catId).split(' › ').pop()}
                  {i.partes.length > 0 && <span className="font-normal text-[var(--brand-500)]"> + {i.partes.length} {i.partes.length === 1 ? 'parte' : 'partes'}</span>}
                  {i.meses > 1 && <span className="font-normal text-[var(--brand-500)]"> · {i.meses} meses</span>}
                  {i.outras.length > 0 && <span className="font-normal text-[var(--brand-500)]"> · parte de outra unidade</span>}
                </span>
                <span className="text-[11px] text-[var(--surface-400)] truncate">
                  {i.doHistorico ? 'como das outras vezes' : caminhoDe(i.catId).split(' › ').slice(0, -1).join(' › ')}
                </span>
                <button type="button" onClick={() => muda(i.n, { catId: '', catTexto: '', doHistorico: false, porSinonimo: false })}
                        className="text-[11px] text-[var(--brand-500)] hover:underline shrink-0">trocar</button>
              </span>
            ) : (
              <input value={i.catTexto} autoComplete="off"
                     onChange={e => muda(i.n, { catTexto: e.target.value, catId: '', doHistorico: false, porSinonimo: false })}
                     aria-label="Categoria da despesa" placeholder="do que foi? (gasolina, aluguel…)"
                     className="input text-sm py-1 w-full" style={{ borderColor: '#f59e0b' }} />
            ))}
            {i.destino === 'receita' && (
              <span className="text-sm text-[var(--surface-600)]">
                {(maquininhas.find(m => m.id === (i.opId || maquininhaLote))?.nome) || <span className="text-amber-500">qual maquininha?</span>}
                {' · '}
                {i.mov ? <span className={i.mov === 'antecipacao' ? 'text-amber-500' : ''}>{ROTULO_MOV[i.mov].toLowerCase()}</span>
                       : <span className="text-amber-500">o que é?</span>}
                {!aberta && <button type="button" onClick={alternar} className="ml-1.5 text-[11px] text-[var(--brand-500)] hover:underline">trocar</button>}
              </span>
            )}
          </span>
          <span className={`text-right text-mono text-sm tabular-nums ${valorCor(i.valor)}`}>{valorTxt(i.valor)}</span>
        </div>

        {/* busca de categoria enquanto não há uma escolhida */}
        {i.destino === 'despesa' && !i.catId && (() => {
          const achados = i.catTexto.trim().length >= 2 ? buscarCategorias(folhas, caminhoDe, i.catTexto, 6) : []
          const sugeridas = i.sugestoes.filter(s => s.decisao.tipo === 'despesa')
          if (!achados.length && !sugeridas.length && !i.palpite && i.catTexto.trim().length < 2) return null
          return (
            <div className="mt-2 ml-[34px] sm:ml-[86px] flex flex-col gap-1.5">
              {(sugeridas.length > 0 || i.palpite) && !i.catTexto && (
                <div className="flex flex-wrap gap-1.5">
                  {i.palpite && !sugeridas.some(s => s.decisao.tipo === 'despesa' && (s.decisao as { catId: string }).catId === i.palpite) && (
                    <button type="button" onClick={() => muda(i.n, { catId: i.palpite, catTexto: '', porSinonimo: true })}
                            className="text-xs px-2.5 py-1 rounded-full border border-dashed border-amber-500/60 text-amber-500 hover:bg-amber-500/10"
                            title="Palpite pelo nome — não há histórico parecido. Confira antes de escolher">
                      talvez {caminhoDe(i.palpite).split(' › ').pop()}?
                    </button>
                  )}
                  {sugeridas.map(s => s.decisao.tipo === 'despesa' && (
                    <button key={s.chave} type="button"
                            onClick={() => muda(i.n, { catId: (s.decisao as { catId: string }).catId, catTexto: '', porSinonimo: false })}
                            className="text-xs px-2.5 py-1 rounded-full border border-[var(--surface-200)] text-[var(--surface-600)] hover:border-emerald-500 hover:text-emerald-500"
                            title={`Usada ${s.vezes}× em linhas parecidas`}>
                      {caminhoDe((s.decisao as { catId: string }).catId).split(' › ').pop()}
                    </button>
                  ))}
                </div>
              )}
              {achados.length > 0 && (
                <div className="rounded-[var(--radius-md)] border border-[var(--surface-200)] divide-y divide-[var(--surface-100)] max-w-[520px]">
                  {achados.map(({ c, termoBatido, forte }) => (
                    <button key={c.id} type="button"
                            onClick={() => muda(i.n, { catId: c.id, catTexto: '', porSinonimo: false })}
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--surface-50)] flex items-center gap-2">
                      <span className="flex-1 truncate text-[var(--surface-700)]">{caminhoDe(c.id)}</span>
                      {!forte && termoBatido && <span className="text-[11px] text-[var(--surface-400)] shrink-0">“{termoBatido}”</span>}
                    </button>
                  ))}
                </div>
              )}
              {i.catTexto.trim().length >= 2 && !achados.length && (
                <span className="text-xs text-amber-500">nenhuma categoria com “{i.catTexto.trim()}”</span>
              )}
            </div>
          )
        })()}

        {/* OS LINKS TÍMIDOS — e o que eles abrem, dentro da própria linha */}
        <div className="mt-1.5 ml-[34px] sm:ml-[86px] flex flex-wrap gap-x-4 gap-y-1">
          <button type="button" onClick={alternar} className="text-[11px] text-[var(--surface-400)] hover:text-[var(--surface-700)]">
            {aberta ? 'fechar' : i.destino === 'despesa' ? 'fornecedor · forma de pagamento' : 'maquininha · movimento'}
          </button>
          {i.destino === 'despesa' && !i.estorno && i.outras.length === 0 && i.partes.length === 0 && unidades.length > 0 && (
            <button type="button" className="text-[11px] text-[var(--surface-400)] hover:text-[var(--surface-700)]"
                    onClick={() => muda(i.n, { outras: [{ key: crypto.randomUUID(), unidadeId: '', valor: '', modo: 'repasse', repasseId: '' }] })}>
              foi para outras unidades
            </button>
          )}
          {i.destino === 'despesa' && !i.estorno && i.partes.length === 0 && i.outras.length === 0 && (
            <button type="button" className="text-[11px] text-[var(--surface-400)] hover:text-[var(--surface-700)]"
                    onClick={() => muda(i.n, { partes: [{ key: crypto.randomUUID(), catId: '', catTexto: '', valor: '' }] })}>
              dividir em categorias
            </button>
          )}
          {i.destino === 'despesa' && !i.estorno && i.meses === 1 && (
            <button type="button" className="text-[11px] text-[var(--surface-400)] hover:text-[var(--surface-700)]"
                    onClick={() => muda(i.n, { meses: 12 })}>
              vale por vários meses
            </button>
          )}
          <select value={i.destino} aria-label="O que é esta linha"
                  onChange={e => muda(i.n, { destino: e.target.value as Destino, marcado: e.target.value !== 'fora',
                    mov: e.target.value === 'receita' && !i.mov ? (movimentoDe(i.descricao, i.valor) || '') : i.mov })}
                  className="text-[11px] bg-transparent border-0 p-0 text-[var(--surface-400)] hover:text-[var(--surface-700)] cursor-pointer">
            {i.valor < 0 && <option value="despesa">é uma despesa</option>}
            {permiteReceitas && <option value="receita">é da maquininha</option>}
            <option value="fora">ignorar esta linha</option>
          </select>
        </div>
        {aberta && (
          <div className="mt-2 ml-[34px] sm:ml-[86px] pl-4 border-l-2 border-[var(--brand-500)] flex flex-wrap items-end gap-3">
            {i.destino === 'despesa' ? (<>
              <label className="flex flex-col gap-1 text-xs text-[var(--surface-500)]">
                Para quem
                <input value={i.fornecedor} onChange={e => muda(i.n, { fornecedor: e.target.value })}
                       className="input text-sm py-1 w-56" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--surface-500)]">
                Forma de pagamento
                {ehCartao ? <span className="text-sm text-[var(--surface-600)] py-1">cartão de crédito</span> : (
                  <select value={i.metodo} onChange={e => muda(i.n, { metodo: e.target.value })} className="input text-sm py-1">
                    {METODOS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                  </select>
                )}
              </label>
            </>) : (<>
              {maquininhas.length > 1 && (
                <label className="flex flex-col gap-1 text-xs text-[var(--surface-500)]">
                  Maquininha
                  <select value={i.opId || maquininhaLote} onChange={e => muda(i.n, { opId: e.target.value })} className="input text-sm py-1">
                    <option value="">escolher…</option>
                    {maquininhas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </label>
              )}
              <label className="flex flex-col gap-1 text-xs text-[var(--surface-500)]">
                O que a maquininha fez
                <select value={i.mov} onChange={e => muda(i.n, { mov: e.target.value as MovMaquininha })} className="input text-sm py-1">
                  <option value="">escolher…</option>
                  {(Object.keys(ROTULO_MOV) as MovMaquininha[]).filter(m => ENTRA_MOV[m] === (i.valor > 0))
                    .map(m => <option key={m} value={m}>{ROTULO_MOV[m]}</option>)}
                </select>
              </label>
              {i.mov === 'antecipacao' && (
                <span className="text-xs text-amber-500 pb-1.5">Registre o valor que caiu. O custo da antecipação é despesa (Financeiro › Encargos).</span>
              )}
            </>)}
          </div>
        )}
        {i.destino === 'despesa' && i.partes.length > 0 && painelDividir(i)}
        {i.destino === 'despesa' && i.outras.length > 0 && painelOutras(i)}
        {i.destino === 'despesa' && i.meses > 1 && (
          <div className="mt-2 ml-[34px] sm:ml-[86px] pl-4 border-l-2 border-[var(--brand-500)] flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--surface-700)]">
              Vale por
              <input type="number" min={2} max={120} value={i.meses}
                     onChange={e => muda(i.n, { meses: Math.max(1, Math.min(120, Number(e.target.value) || 1)) })}
                     className="input text-sm py-1 w-20 text-mono" />
              meses
            </label>
            <span className="text-sm text-[var(--surface-500)]">
              {fmtBRL(Math.abs(i.valor) / i.meses)} por mês, de {mesMais(i.data, 0)} a {mesMais(i.data, i.meses - 1)}
            </span>
            <button type="button" onClick={() => muda(i.n, { meses: 1 })} className="ml-auto text-[11px] text-[var(--surface-400)] hover:text-[var(--surface-700)]">
              é só deste mês
            </button>
          </div>
        )}
      </div>
    )
  }

  /** DIVIDIR — dentro da linha. A principal (a categoria da linha) fica com o
   *  que sobra; as partes têm categoria e valor; o painel diz quando fecha. */
  function painelDividir(i: Item) {
    const resto = restanteDe(i)
    const mudaParte = (k: number, patch: Partial<Parte>) =>
      muda(i.n, { partes: i.partes.map((pt, j) => (j === k ? { ...pt, ...patch } : pt)) })
    const total = Math.abs(i.valor)
    return (
      <div className="mt-2 ml-[34px] sm:ml-[86px] pl-4 border-l-2 border-[var(--brand-500)] flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[var(--surface-800)]">Dividir os {fmtBRL(total)}</span>
          <button type="button" onClick={() => muda(i.n, { partes: [] })}
                  className="ml-auto text-[11px] text-[var(--surface-400)] hover:text-[var(--surface-700)]">desfazer divisão</button>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_120px_22px] gap-2 items-center">
          <span className="text-sm text-[var(--surface-600)] truncate px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--surface-50)]">
            {i.catId ? caminhoDe(i.catId) : <span className="text-amber-500">escolha a categoria da linha (acima)</span>}
          </span>
          <span className={`text-right text-mono text-sm px-3 py-1.5 ${resto > 0 ? 'text-[var(--surface-700)]' : 'text-red-500'}`}
                title="A principal fica com o que sobra">{fmtBRL(Math.max(resto, 0)).replace('R$', '').trim()}</span>
          <span />
          {i.partes.map((pt, k) => (
            <span key={pt.key} className="contents">
              <span className="relative">
                <input value={pt.catId ? caminhoDe(pt.catId) : pt.catTexto} autoComplete="off"
                       aria-label={`Categoria da parte ${k + 1}`} placeholder="do que foi esta parte?"
                       onChange={e => mudaParte(k, { catTexto: e.target.value, catId: '' })}
                       className="input text-sm py-1.5 w-full" style={!pt.catId ? { borderColor: '#f59e0b' } : undefined} />
                {!pt.catId && pt.catTexto.trim().length >= 2 && (() => {
                  const achados = buscarCategorias(folhas, caminhoDe, pt.catTexto, 5)
                  return achados.length ? (
                    <span className="absolute z-10 left-0 right-0 mt-1 rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-[var(--surface-0)] shadow-lg divide-y divide-[var(--surface-100)] flex flex-col">
                      {achados.map(({ c }) => (
                        <button key={c.id} type="button" onClick={() => mudaParte(k, { catId: c.id, catTexto: '' })}
                                className="text-left px-3 py-1.5 text-sm hover:bg-[var(--surface-50)] truncate">{caminhoDe(c.id)}</button>
                      ))}
                    </span>
                  ) : null
                })()}
              </span>
              <input inputMode="decimal" value={pt.valor ? digTxt(pt.valor) : ''} placeholder="0,00"
                     aria-label={`Valor da parte ${k + 1}`}
                     onChange={e => mudaParte(k, { valor: soDigitos(e.target.value) })}
                     onPaste={e => { const d = colarValorBR(e.clipboardData.getData('text')); if (d !== null) { e.preventDefault(); mudaParte(k, { valor: d }) } }}
                     className="input text-sm py-1.5 text-right text-mono" />
              <button type="button" aria-label="Tirar esta parte" onClick={() => muda(i.n, { partes: i.partes.filter((_, j) => j !== k) })}
                      className="text-[var(--surface-400)] hover:text-red-400 text-base leading-none">×</button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => muda(i.n, { partes: [...i.partes, { key: crypto.randomUUID(), catId: '', catTexto: '', valor: '' }] })}
                  className="text-sm text-[var(--brand-500)] hover:underline">+ outra parte</button>
          <span className={`ml-auto text-sm ${resto <= 0 ? 'text-red-500' : partesOk(i) && i.catId ? 'text-emerald-500' : 'text-[var(--surface-500)]'}`}>
            {resto <= 0 ? `as partes passam dos ${fmtBRL(total)} do banco`
              : partesOk(i) && i.catId ? `✓ soma ${fmtBRL(total)} — fecha com o banco`
              : 'falta a categoria ou o valor de alguma parte'}
          </span>
        </div>
      </div>
    )
  }

  /** FOI PARA OUTRAS UNIDADES — "quem mais vai pagar por isso?", dentro da linha. */
  function painelOutras(i: Item) {
    const total = Math.abs(i.valor)
    const fica = Math.round((total - somaOutras(i)) * 100) / 100
    const mudaO = (k: number, patch: Partial<ParaUnidade>) =>
      muda(i.n, { outras: i.outras.map((o, j) => (j === k ? { ...o, ...patch } : o)) })
    return (
      <div className="mt-2 ml-[34px] sm:ml-[86px] pl-4 border-l-2 border-[var(--brand-500)] flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[var(--surface-800)]">Quem mais vai pagar por isso?</span>
          <button type="button" onClick={() => muda(i.n, { outras: [] })}
                  className="ml-auto text-[11px] text-[var(--surface-400)] hover:text-[var(--surface-700)]">era só desta unidade</button>
        </div>
        {i.outras.map((o, k) => {
          const doRepasse = o.unidadeId ? unidadeDoRepasse(o.unidadeId) : null
          const opcoes = repassesAbertos.filter(r => r.unidade_id === doRepasse)
          return (
            <div key={o.key} className="flex flex-wrap items-center gap-2">
              <select value={o.unidadeId} aria-label="Unidade"
                      onChange={e => mudaO(k, { unidadeId: e.target.value, repasseId: '', modo: unidadeDoRepasse(e.target.value) ? o.modo : 'agora' })}
                      className="input text-sm py-1.5 flex-1 min-w-[160px]" style={!o.unidadeId ? { borderColor: '#f59e0b' } : undefined}>
                <option value="">Unidade…</option>
                {unidades.map(u => (
                  <option key={u.id} value={u.id} disabled={i.outras.some((x, j) => j !== k && x.unidadeId === u.id)}>{u.nome}</option>
                ))}
              </select>
              <input inputMode="decimal" value={o.valor ? digTxt(o.valor) : ''} placeholder="0,00" aria-label="Valor desta unidade"
                     onChange={e => mudaO(k, { valor: soDigitos(e.target.value) })}
                     onPaste={e => { const d = colarValorBR(e.clipboardData.getData('text')); if (d !== null) { e.preventDefault(); mudaO(k, { valor: d }) } }}
                     className="input text-sm py-1.5 w-28 text-right text-mono" />
              {o.unidadeId && (doRepasse ? (
                <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--surface-500)]">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" checked={o.modo === 'repasse'} onChange={() => mudaO(k, { modo: 'repasse' })} className="accent-[var(--brand-500)]" />
                    no repasse
                  </label>
                  {o.modo === 'repasse' && (
                    <select value={o.repasseId} onChange={e => mudaO(k, { repasseId: e.target.value })} aria-label="Qual repasse" className="input text-xs py-1">
                      <option value="">o próximo que for salvo</option>
                      {opcoes.map(r => <option key={r.id} value={r.id}>{mesMais(r.mes_referencia, 0)}</option>)}
                    </select>
                  )}
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" checked={o.modo === 'agora'} onChange={() => mudaO(k, { modo: 'agora' })} className="accent-[var(--brand-500)]" />
                    cobrar agora
                  </label>
                </span>
              ) : (
                <span className="text-xs text-[var(--surface-500)]">cobrança direta — a unidade confirma em Acertos</span>
              ))}
              <button type="button" aria-label="Tirar esta unidade" onClick={() => muda(i.n, { outras: i.outras.filter((_, j) => j !== k) })}
                      className="text-[var(--surface-400)] hover:text-red-400 text-base leading-none">×</button>
            </div>
          )
        })}
        <div className="flex flex-wrap items-center gap-3">
          {i.outras.length < unidades.length && (
            <button type="button" onClick={() => muda(i.n, { outras: [...i.outras, { key: crypto.randomUUID(), unidadeId: '', valor: '', modo: 'repasse', repasseId: '' }] })}
                    className="text-sm text-[var(--brand-500)] hover:underline">+ outra unidade</button>
          )}
          <span className={`ml-auto text-sm ${fica < 0 ? 'text-red-500' : 'text-[var(--surface-600)]'}`}>
            {fica < 0 ? `passa dos ${fmtBRL(total)} do banco` : <>fica com {currentUnit?.nome}: <span className="text-mono">{fmtBRL(fica)}</span></>}
          </span>
        </div>
      </div>
    )
  }

  /** Linha ignorada ou que é pagamento (fatura, repasse) — com o atalho certo. */
  function linhaFora(i: Item) {
    const quit = i.valor < 0 ? quitacaoDe(i.descricao) : null
    // Aplicação/resgate já chegam perguntando a conta; o resto, por um link tímido.
    const entreAberto = /aplica|resgate/i.test(i.descricao)
    return (
      <div key={i.n} className={`${grade} py-2.5 border-b border-[var(--surface-100)] last:border-0`}>
        <span className={`text-xs ${i.entreConta ? 'text-[var(--brand-500)]' : 'text-[var(--surface-400)]'}`} aria-hidden="true">{i.entreConta ? '⇄' : '—'}</span>
        <span className="text-xs text-[var(--surface-400)]">{dataCurta(i.data)}</span>
        <span className="text-sm text-[var(--surface-500)] truncate" title={i.original}>{i.descricao}</span>
        <span className="col-span-4 col-start-3 sm:col-span-1 sm:col-start-auto row-start-2 sm:row-start-auto flex flex-wrap items-center gap-2 min-w-0">
          {!i.entreConta && <span className="text-xs text-[var(--surface-400)]">{i.motivoFora || 'ignorada'}</span>}
          {quit && onQuitar && (
            <button type="button" onClick={() => onQuitar({ tipo: quit, valor: Math.abs(i.valor), data: i.data, contaId })}
                    className="text-xs font-medium px-2.5 py-1 rounded-[var(--radius-md)] border border-[var(--brand-500)] text-[var(--brand-500)] hover:bg-[var(--brand-500)] hover:text-white">
              {quit === 'repasse' ? 'Pagar repasse' : 'Pagar fatura'}
            </button>
          )}
          {!quit && !i.entreConta && (
            <button type="button" onClick={() => muda(i.n, { destino: i.valor < 0 ? 'despesa' : (permiteReceitas ? 'receita' : 'fora'), marcado: true, motivoFora: null })}
                    className="text-[11px] text-[var(--brand-500)] hover:underline">não ignorar</button>
          )}
          {!quit && !ehCartao && contasEntre.length > 0 && (i.entreConta || entreAberto || abertos.has(i.n) ? (
            <span className="flex items-center gap-1.5 text-xs">
              <span className="text-[var(--surface-500)]">{i.valor < 0 ? 'foi para' : 'veio de'}</span>
              <select value={i.entreConta} onChange={e => muda(i.n, { entreConta: e.target.value, entreHist: false })}
                      className={`input-field text-xs py-1 ${i.entreConta ? 'text-[var(--brand-500)] font-medium' : ''}`}>
                <option value="">— escolha a conta —</option>
                {contasEntre.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              {i.entreConta && i.entreHist && <span className="text-[11px] text-[var(--surface-400)]">como das outras vezes</span>}
            </span>
          ) : (
            <button type="button" onClick={() => setAbertos(a => new Set(a).add(i.n))}
                    className="text-[11px] text-[var(--brand-500)] hover:underline">é de outra conta da casa?</button>
          ))}
        </span>
        <span className={`text-right text-mono text-sm tabular-nums ${i.entreConta ? valorCor(i.valor) : 'text-[var(--surface-400)]'}`}>{valorTxt(i.valor)}</span>
      </div>
    )
  }

  /** "QUASE LÁ" — a linha do banco e os candidatos do sistema. */
  function linhaParecida(i: Item) {
    const p = i.parecido!
    const escolher = (k: number) => muda(i.n, { parecido: { ...p, escolhido: k } })
    return (
      <div key={i.n} className="py-2.5 border-b border-[var(--surface-100)] last:border-0">
        <div className={grade}>
          <span className="text-amber-500 text-xs" aria-hidden="true">≈</span>
          <span className="text-xs text-[var(--surface-400)]">{dataCurta(i.data)}</span>
          <span className="text-sm text-[var(--surface-600)] truncate" title={i.original}>{i.descricao}</span>
          <span className="hidden sm:block" />
          <span className={`text-right text-mono text-sm tabular-nums ${valorCor(i.valor)}`}>{valorTxt(i.valor)}</span>
        </div>
        <div className="mt-1.5 ml-[34px] sm:ml-[86px] flex flex-col gap-1">
          {p.candidatos.map((c, k) => {
            const outra = itens.some(x => x.n !== i.n && x.parecido && x.parecido.escolhido >= 0 && x.parecido.candidatos[x.parecido.escolhido].chave === c.chave)
            const muda_ = c.ajustavel && (Math.abs(c.valor - i.valor) >= 0.005 || c.data !== i.data)
            return (
              <label key={c.chave} className={`flex flex-wrap items-center gap-x-2 text-sm ${outra ? 'opacity-40' : 'cursor-pointer'}`}>
                <input type="radio" name={`par-${i.n}`} checked={p.escolhido === k} disabled={outra} onChange={() => escolher(k)} className="accent-[var(--brand-500)]" />
                <span className="text-[var(--surface-700)]">é <strong className="font-semibold">{c.rotulo}</strong></span>
                <span className="text-xs text-[var(--surface-400)]">lançado {fmtData(c.data)} · {fmtBRL(Math.abs(c.valor))}</span>
                {muda_ && <span className="text-xs text-emerald-500">→ fica igual ao banco</span>}
                {outra && <span className="text-xs text-[var(--surface-400)]">(já escolhido em outra linha)</span>}
              </label>
            )
          })}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name={`par-${i.n}`} checked={p.escolhido === -1} onChange={() => escolher(-1)} className="accent-[var(--brand-500)]" />
            <span className="text-[var(--surface-500)]">é outra coisa — lançar como novo</span>
          </label>
        </div>
      </div>
    )
  }

  /** Cabeça de seção: título, frase e (opcional) o total. */
  const cabecaSecao = (titulo: ReactNode, frase: string, total?: number, extra?: ReactNode) => (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-base font-semibold text-[var(--surface-800)]">{titulo}</span>
      <span className="text-sm text-[var(--surface-500)]">{frase}</span>
      {extra}
      {total !== undefined && (
        <span className={`ml-auto text-mono text-sm tabular-nums ${valorCor(total)}`}>{valorTxt(total)}</span>
      )}
    </div>
  )
  const caixaLinhas = (filhos: ReactNode) => (
    <div className="rounded-[14px] bg-[var(--surface-50)] px-4 sm:px-5">{filhos}</div>
  )

  // ── o placar: banco × sistema × depois de registrar (conta corrente) ──
  const depois = placar
    ? Math.round((placar.sistema
        + [...recProntas, ...despProntas, ...entreProntas].reduce((a, i) => a + i.valor, 0)
        + confirmados.reduce((a, i) => {
            const r = i.parecido!.candidatos[i.parecido!.escolhido]
            return a + (r.ajustavel ? i.valor - r.valor : 0)
          }, 0)) * 100) / 100
    : null
  const fecha = placar && placar.banco !== null && depois !== null && Math.abs(depois - placar.banco) < 0.005
  const somaRec = recProntas.reduce((a, i) => a + i.valor, 0)
  const somaDesp = despProntas.reduce((a, i) => a + i.valor, 0)
  const contaNome = contas.find(c => c.id === contaId)?.nome || ''
  const periodo = itens.length
    ? (() => {
        const ds = itens.map(i => i.data).sort()
        return ds[0] === ds[ds.length - 1] ? fmtData(ds[0]) : `${fmtData(ds[0])} a ${fmtData(ds[ds.length - 1])}`
      })()
    : ''
  const encontradas = itens.filter(i => !!i.jaNoSistema && !emParecido(i))
  const ignoradas = fora.filter(i => !i.jaNoSistema)
  const frasePronto = [
    recProntas.length ? `${recProntas.length} ${recProntas.length === 1 ? 'recebimento' : 'recebimentos'}` : '',
    entreProntas.length ? `${entreProntas.length} entre contas` : '',
    despProntas.length ? `${despProntas.length} ${despProntas.length === 1 ? 'despesa' : 'despesas'}` : '',
  ].filter(Boolean).join(' e ')
  const conferir = exatosParaConciliar.length + confirmados.length + recProntas.length + entreProntas.length + despProntas.length

  return (
    <Modal
      isOpen={aberto}
      onClose={onClose}
      size="wide"
      title={itens.length ? `${contaNome} — ${periodo}` : 'Importar extrato'}
      footer={itens.length ? (
        <div className="flex flex-wrap items-center gap-3 w-full">
          <span className="text-sm text-[var(--surface-500)] flex-1 min-w-[220px]">
            {conferir === 0 ? 'Nada para registrar.' : <>
              {frasePronto ? <>Vai registrar <strong className="text-[var(--surface-800)]">{frasePronto}</strong> e </> : 'Vai '}
              marcar {conferir} {conferir === 1 ? 'linha' : 'linhas'} como conferida{conferir === 1 ? '' : 's'}.
            </>}
            {pendentes > 0 && <span className="text-amber-500"> Falta decidir {pendentes}.</span>}
          </span>
          <button onClick={() => { setItens([]); setPlacar(null) }} className="btn-secondary text-sm">Colar outro texto</button>
          <button onClick={() => void registrar()} disabled={salvando || conferir === 0} className="btn-primary text-sm">
            {salvando ? <><Loader2 className="h-4 w-4 animate-spin" /> Registrando…</> : 'Registrar e conferir'}
          </button>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={() => void ler()} disabled={!texto.trim() || lendo || !contaId} className="btn-primary text-sm">
            {lendo ? <><Loader2 className="h-4 w-4 animate-spin" /> Lendo…</> : <><ClipboardPaste className="h-4 w-4" /> Ler o extrato</>}
          </button>
        </div>
      )}
    >
      {!itens.length ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="imp-conta" className="text-base font-semibold text-[var(--surface-800)]">De qual conta é o extrato?</label>
            <select id="imp-conta" value={contaId} onChange={e => { setContaId(e.target.value); setItens([]) }} className="input text-sm w-full sm:w-96">
              <option value="">Escolher…</option>
              {correntes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              {cartoes.length > 0 && (
                <optgroup label="Fatura de cartão">
                  {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </optgroup>
              )}
            </select>
          </div>

          {ehCartao && (
            <div className="flex flex-col gap-2">
              <span className="text-base font-semibold text-[var(--surface-800)]">Qual fatura?</span>
              <div className="flex flex-wrap items-center gap-2">
                {!novaFatura ? (
                  <select value={vencimento} onChange={e => setVencimento(e.target.value)} aria-label="Fatura"
                          className="input text-sm w-full sm:w-96" style={!vencimento ? { borderColor: '#f59e0b' } : undefined}>
                    <option value="">Escolher a fatura…</option>
                    {faturas.map(f => (
                      <option key={f.venc} value={f.venc}>vence {fmtData(f.venc)} · {f.qtd} compras · {fmtBRL(f.total)}</option>
                    ))}
                  </select>
                ) : (
                  <input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} aria-label="Vencimento da fatura nova"
                         className="input text-sm w-56" style={!vencimento ? { borderColor: '#f59e0b' } : undefined} />
                )}
                <button type="button" onClick={() => { setNovaFatura(v => !v); setVencimento('') }}
                        className="text-sm text-[var(--brand-500)] hover:underline">
                  {novaFatura ? (faturas.length ? 'escolher uma existente' : '') : '+ nova fatura'}
                </button>
              </div>
              <span className="text-sm text-[var(--surface-500)]">É quando essas compras saem do caixa. Se colar a fatura com o cabeçalho, ela é escolhida sozinha.</span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="imp-texto" className="text-base font-semibold text-[var(--surface-800)]">Cole o extrato</label>
            <textarea id="imp-texto" value={texto} onChange={e => setTexto(e.target.value)} rows={10} autoFocus
                      className="input text-xs text-mono w-full" />
            <span className="text-sm text-[var(--surface-500)]">
              Do jeito que veio do banco — um dia, uma semana, tudo misturado. Cada linha é conferida com o que já
              está no sistema; só o que for novo vira lançamento.
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-7">
          {/* O PLACAR */}
          {placar && !ehCartao && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-6 border-b border-[var(--surface-100)]">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-[var(--surface-500)]">No banco em {fmtData(placar.data)}</span>
                <span className="text-mono text-xl tabular-nums text-[var(--surface-800)]">
                  {placar.banco !== null ? fmtBRL(placar.banco) : '—'}
                </span>
                {placar.banco === null && <span className="text-xs text-[var(--surface-400)]">o texto colado não trouxe o saldo</span>}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-[var(--surface-500)]">No sistema hoje</span>
                <span className="text-mono text-xl tabular-nums text-[var(--surface-800)]">{fmtBRL(placar.sistema)}</span>
                {placar.banco !== null && Math.abs(placar.banco - placar.sistema) >= 0.005 && (
                  <span className="text-xs text-amber-500">faltam {fmtBRL(Math.abs(placar.banco - placar.sistema))}</span>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-[var(--surface-500)]">Depois de registrar</span>
                <span className={`text-mono text-xl tabular-nums ${fecha ? 'text-emerald-500' : 'text-[var(--surface-800)]'}`}>{fmtBRL(depois ?? 0)}</span>
                {placar.banco !== null && (fecha
                  ? <span className="text-xs text-emerald-500">✓ bate com o banco</span>
                  : <span className="text-xs text-amber-500">ainda faltam {fmtBRL(Math.abs((placar.banco ?? 0) - (depois ?? 0)))} — veja as linhas ignoradas ou em aberto</span>)}
              </div>
            </div>
          )}
          {ehCartao && cabecalho && (() => {
            const soma = itens.filter(i => !foraDoCartao(i.descricao)).reduce((a, i) => a + Math.abs(i.valor), 0)
            const bate = Math.abs(soma - cabecalho.total) < 0.005
            return (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-6 border-b border-[var(--surface-100)]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-[var(--surface-500)]">Fatura de {fmtData(cabecalho.venc)}</span>
                  <span className="text-mono text-xl tabular-nums text-[var(--surface-800)]">{fmtBRL(cabecalho.total)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-[var(--surface-500)]">Compras lidas</span>
                  <span className={`text-mono text-xl tabular-nums ${bate ? 'text-emerald-500' : 'text-[var(--surface-800)]'}`}>{fmtBRL(soma)}</span>
                  <span className={`text-xs ${bate ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {bate ? '✓ bate com a fatura' : `faltam ${fmtBRL(cabecalho.total - soma)} — o texto colado está inteiro?`}
                  </span>
                </div>
              </div>
            )
          })()}

          {parecidos.length > 0 && (
            <section className="flex flex-col gap-2.5">
              {cabecaSecao(<span className="text-amber-500">Quase lá</span>,
                `parece um lançamento seu com data${ehCartao ? ' ou câmbio' : ''} um pouco diferente — confirme`)}
              {caixaLinhas(parecidos.map(i => linhaParecida(i)))}
            </section>
          )}

          {encontradas.length > 0 && (
            <section className="flex flex-col gap-2.5">
              {cabecaSecao(<span className="text-emerald-500">✓ Encontramos</span>,
                `${encontradas.length} ${encontradas.length === 1 ? 'linha já está' : 'linhas já estão'} no sistema — nada a fazer`, undefined,
                <button type="button" onClick={() => setEncontradasAberto(v => !v)} className="ml-auto text-sm text-[var(--brand-500)] hover:underline">
                  {encontradasAberto ? 'esconder' : 'ver quais'}
                </button>)}
              {encontradasAberto && caixaLinhas(encontradas.map(i => linhaEncontrada(i)))}
            </section>
          )}

          {receitas.length > 0 && (
            <section className="flex flex-col gap-2.5">
              {cabecaSecao('Recebimentos de cartão', `${receitas.length} ${receitas.length === 1 ? 'linha nova' : 'linhas novas'} · a maquininha depositou`, somaRec,
                maquininhas.length > 1 ? (
                  <span className="flex items-center gap-2 text-sm text-[var(--surface-500)]">
                    todas da
                    <select value={maquininhaLote} onChange={e => setMaquininhaLote(e.target.value)} aria-label="Maquininha de todas"
                            className="input text-sm py-1" style={!maquininhaLote ? { borderColor: '#f59e0b' } : undefined}>
                      <option value="">qual maquininha?</option>
                      {maquininhas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                    </select>
                  </span>
                ) : maquininhas.length === 0 ? (
                  <span className="text-sm text-amber-500">nenhuma maquininha cadastrada — aba Contas</span>
                ) : undefined)}
              {caixaLinhas(receitas.map(i => linhaNova(i)))}
            </section>
          )}

          {despesas.length > 0 && (
            <section className="flex flex-col gap-2.5">
              {cabecaSecao('Despesas', `${despesas.length} ${despesas.length === 1 ? 'linha nova' : 'linhas novas'}`, somaDesp)}
              {caixaLinhas(despesas.map(i => linhaNova(i)))}
            </section>
          )}

          {ignoradas.length > 0 && (
            <section className="flex flex-col gap-2.5">
              {cabecaSecao('Fora', 'não vira despesa — pagamentos têm o lugar deles; entre contas vira transferência')}
              {caixaLinhas(ignoradas.map(i => linhaFora(i)))}
            </section>
          )}

          {naoVieram.length > 0 && (
            <section className="flex flex-col gap-2.5 rounded-[14px] border border-dashed border-[var(--surface-300)] p-4">
              {cabecaSecao('No sistema e não veio no texto',
                ehCartao ? 'estão nesta fatura e nenhuma linha bateu' : 'estão nesta conta nesses dias e nenhuma linha bateu')}
              <span className="text-sm text-[var(--surface-500)]">Lançamento a mais, cancelado, com valor errado — ou o texto colado está incompleto.</span>
              <div className="flex flex-col">
                {naoVieram.map(r => (
                  <div key={r.chave} className={`${grade} py-1.5`}>
                    <span />
                    <span className="text-xs text-[var(--surface-400)]">{dataCurta(r.data)}</span>
                    <span className="text-sm text-[var(--surface-600)] truncate">{r.rotulo}</span>
                    <span className="hidden sm:block" />
                    <span className={`text-right text-mono text-sm tabular-nums ${valorCor(r.valor)}`}>{valorTxt(r.valor)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Modal>
  )
}
