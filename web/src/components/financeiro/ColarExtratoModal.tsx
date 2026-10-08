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
import { Loader2, ClipboardPaste, History, CheckCircle2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import { fmtBRL, fmtData } from '@/lib/financeiro'
import {
  lerExtrato, movimentoDe, pareceMaquininha, metodoDe, fornecedorDe, naoEDespesa, quitacaoDe, foraDoCartao, cabecalhoFatura,
  ROTULO_MOV, ENTRA_MOV, movDoRegistro, type MovMaquininha, type LinhaExtrato,
} from '@/lib/extrato'
import { criarIndice, sugerir, type Sugestao } from '@/lib/similaridade'
import { buscarCategorias, sugerirPorSinonimo, type CategoriaBuscavel } from '@/lib/busca-categoria'
import { conciliar, semPar, type RegistroSistema, type Ref } from '@/lib/conciliacao'

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
  doHistorico: boolean
  porSinonimo: boolean           // categoria veio do sinônimo (sem histórico) — confira
  sugestoes: Sugestao<Decisao>[]
}

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
    const linhas = lerExtrato(texto, ano, undefined, { cartao: ehCartao }).map(l =>
      ehCartao && !foraDoCartao(l.descricao) ? { ...l, valor: -Math.abs(l.valor) } : l)
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

    setItens(linhas.map(l => {
      const base = {
        ...l, jaNoSistema: null as string | null, motivoFora: null as string | null, marcado: true,
        exatos: [] as RegistroSistema[], parecido: null as Item['parecido'],
        opId: '', mov: '' as MovMaquininha | '', catId: '', catTexto: '',
        metodo: ehCartao ? 'credito' : (metodoDe(l.descricao) || 'pix'), fornecedor: fornecedorDe(l.descricao),
        doHistorico: false, porSinonimo: false, sugestoes: [] as Sugestao<Decisao>[],
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
      if (ehCartao) {
        const motivo = foraDoCartao(l.descricao)
        if (motivo) return { ...base, destino: 'fora' as Destino, motivoFora: motivo, marcado: false }
      }
      // 2) saída que não é despesa (fatura, aplicação)
      const nao = l.valor < 0 && !ehCartao ? naoEDespesa(l.descricao) : null
      if (nao) return { ...base, destino: 'fora' as Destino, motivoFora: nao, marcado: false }

      // 3) o histórico, só com decisões compatíveis com a direção do dinheiro
      const r = sugerir(indice, l.descricao, undefined, { max: 3 })
      const validas = r.sugestoes.filter(s => s.decisao.tipo === 'despesa'
        ? l.valor < 0
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

      const item: Item = { ...base, destino, sugestoes: validas }
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
        const s = sugerirPorSinonimo(folhas, l.descricao)
        if (s) { item.catId = s.id; item.catTexto = caminhoDe(s.id); item.porSinonimo = true }
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
    if (cab && !vencimento) { setVencimento(cab.venc); setNovaFatura(!faturas.some(f => f.venc === cab.venc)) }
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
  const despProntas = despesas.filter(i => i.marcado && i.catId)
  const pendentes = receitas.filter(i => i.marcado && !(i.opId || maquininhaLote) || (i.marcado && !i.mov)).length
    + despesas.filter(i => i.marcado && !i.catId).length
    + parecidos.filter(i => i.parecido!.escolhido === -2).length
  const totais = {
    rec: recProntas.reduce((a, i) => a + i.valor, 0),
    desp: despProntas.reduce((a, i) => a + Math.abs(i.valor), 0),
  }

  async function registrar() {
    if (!currentUnit?.id || !contaId) return
    if (!recProntas.length && !despProntas.length && !confirmados.length && !exatosParaConciliar.length) {
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
              ? { valor: Math.abs(i.valor), data_competencia: i.data }
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
      if (despProntas.length) {
        const rows = despProntas.map(i => {
          const cat = categorias.find(c => c.id === i.catId)
          const cc = cat?.fin_contas
          return {
            unidade_id: currentUnit.id, categoria_id: i.catId,
            conta_id: cat?.fin_conta_id || null,
            conta_codigo: cc?.codigo || null, conta_nome: cc?.nome || null,   // SNAPSHOT da DRE
            natureza: cc?.natureza || 'opex',
            descricao: null, observacoes: i.descricao,   // texto do banco: ensina a próxima colagem
            valor: Math.abs(i.valor), data_competencia: i.data,
            data_caixa: ehCartao ? vencimento : i.data,   // cartão: sai do caixa no vencimento
            fornecedor_nome: i.fornecedor.trim() || null, conta_pagamento_id: contaId,
            metodo_pagamento: i.metodo, rateio_meses: 1, origem: 'manual',
            criado_por_nome: userName || null, status: 'aprovado',
            aprovado_por: user?.id || null, aprovado_por_nome: userName || null, aprovado_em: agora,
          }
        })
        const { data: novosLanc, error } = await supabase.from('fin_lancamentos').insert(rows).select('id')
        if (error) throw new Error(`Despesas: ${error.message}${entrouRec ? ` (as ${entrouRec} receitas a prazo JÁ entraram)` : ''}`)
        ;((novosLanc as { id: string }[] | null) || []).forEach((l, k) => conc(despProntas[k], [{ origem: 'lancamento', origem_id: l.id }], 'novo'))
      }
      // Por último, e sem derrubar o que já entrou: se a mig 153 ainda não rodou,
      // os lançamentos ficam e só o selo de conciliado falta.
      if (concs.length) {
        const { error } = await supabase.from('fin_conciliacoes')
          .upsert(concs, { onConflict: 'conta_id,origem,origem_id', ignoreDuplicates: true })
        if (error) toast(`Registrado, mas a conciliação não foi gravada: ${error.message}`, 'error')
      }
      toast(`${recProntas.length} receitas a prazo · ${despProntas.length} despesas · ${concs.length} conciliados`, 'success')
      onRegistrou()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao registrar', 'error')
      if (entrouRec) onRegistrou()
    } finally {
      setSalvando(false)
    }
  }

  // ── linha da prévia ──
  // ⚠️ FUNÇÃO QUE DESENHA, não componente: um componente declarado aqui dentro
  // ganha identidade nova a cada render, e o React desmontaria a linha a cada
  // tecla — o campo de categoria perderia o foco no meio da digitação.
  function linha(i: Item) {
    const apagada = !!i.jaNoSistema || i.destino === 'fora' || !i.marcado
    return (
      <div key={i.n} className="flex items-start gap-2 py-2" style={{ opacity: apagada ? 0.6 : 1 }}>
        {!i.jaNoSistema && i.destino !== 'fora'
          ? <input type="checkbox" className="mt-1" checked={i.marcado} onChange={e => muda(i.n, { marcado: e.target.checked })} />
          : <span className="w-[13px]" />}
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-xs text-[var(--surface-700)] truncate" title={i.original}>{fmtData(i.data)} · {i.descricao}</p>
          {i.jaNoSistema ? (
            <p className="text-[11px] text-emerald-500 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> já no sistema · {i.jaNoSistema}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <select value={i.destino}
                      onChange={e => muda(i.n, { destino: e.target.value as Destino, marcado: e.target.value !== 'fora',
                        mov: e.target.value === 'receita' && !i.mov ? (movimentoDe(i.descricao, i.valor) || '') : i.mov })}
                      className="input text-[11px] py-0.5 px-1">
                {permiteReceitas && i.valor > 0 && <option value="receita">receita a prazo</option>}
                {i.valor < 0 && <option value="despesa">despesa</option>}
                {permiteReceitas && i.valor < 0 && <option value="receita">maquininha (chargeback/taxa)</option>}
                <option value="fora">ignorar</option>
              </select>
              {i.destino === 'receita' && (
                <>
                  <select value={i.mov} onChange={e => muda(i.n, { mov: e.target.value as MovMaquininha })}
                          className="input text-[11px] py-0.5 px-1" style={!i.mov ? { borderColor: '#f59e0b' } : undefined}>
                    <option value="">o que é?</option>
                    {(Object.keys(ROTULO_MOV) as MovMaquininha[]).filter(m => ENTRA_MOV[m] === (i.valor > 0))
                      .map(m => <option key={m} value={m}>{ROTULO_MOV[m]}</option>)}
                  </select>
                  {i.opId && i.opId !== maquininhaLote && maquininhas.length > 1 && (
                    <select value={i.opId} onChange={e => muda(i.n, { opId: e.target.value })} className="input text-[11px] py-0.5 px-1">
                      {maquininhas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                    </select>
                  )}
                </>
              )}
              {i.destino === 'despesa' && (
                <>
                  {/* A MESMA busca do formulário (lib/busca-categoria): nome, caminho
                      e SINÔNIMOS, sem acento — "lavagem" acha Veículos › Limpeza. */}
                  <input value={i.catTexto} placeholder="Categoria… (ex.: lavagem, gasolina)"
                         onChange={e => muda(i.n, { catTexto: e.target.value, catId: '', doHistorico: false, porSinonimo: false })}
                         className="input text-[11px] py-0.5 px-1.5 flex-1 min-w-[170px]"
                         style={!i.catId ? { borderColor: '#f59e0b' } : undefined} />
                  {/* Fatura de cartão: o método É crédito — não se escolhe. (A lista não
                      tem "crédito", e o <select> mostrava "Pix" com o estado em crédito;
                      mexer nele gravaria a compra do cartão como Pix.) */}
                  {ehCartao ? (
                    <span className="text-[11px] text-[var(--surface-500)] px-1">crédito</span>
                  ) : (
                    <select value={i.metodo} onChange={e => muda(i.n, { metodo: e.target.value })} className="input text-[11px] py-0.5 px-1">
                      {METODOS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                    </select>
                  )}
                  <input value={i.fornecedor} placeholder="fornecedor" onChange={e => muda(i.n, { fornecedor: e.target.value })}
                         className="input text-[11px] py-0.5 px-1.5 w-32" />
                </>
              )}
              {i.doHistorico && (
                <span className="text-[11px] text-sky-500 inline-flex items-center gap-0.5" title="Muito parecido com registros anteriores">
                  <History className="h-3 w-3" /> como das outras vezes
                </span>
              )}
              {i.porSinonimo && i.destino === 'despesa' && (
                <span className="text-[11px] text-amber-500" title="Sugerida pelos sinônimos da categoria — não há histórico ainda. Se estiver errada, troque: da próxima vez vem pelo histórico">
                  pelo nome — confira
                </span>
              )}
              {i.destino === 'fora' && i.motivoFora && <span className="text-[11px] text-amber-500">{i.motivoFora}</span>}
              {/* QUITAÇÃO: atalho pro pagamento certo, preenchido com a linha do banco.
                  Depois de pagar, colar de novo mostra a linha como "já no sistema". */}
              {i.destino === 'fora' && onQuitar && i.valor < 0 && quitacaoDe(i.descricao) && (
                <button type="button"
                        onClick={() => onQuitar({ tipo: quitacaoDe(i.descricao)!, valor: Math.abs(i.valor), data: i.data, contaId })}
                        className="text-[11px] px-2 py-0.5 rounded-full border border-[var(--brand-500)] text-[var(--brand-500)] hover:bg-[var(--brand-50)]">
                  {quitacaoDe(i.descricao) === 'repasse' ? 'Pagar repasse →' : 'Pagar fatura →'}
                </button>
              )}
            </div>
          )}
          {/* Resultados da busca digitada — aparecem enquanto não há categoria escolhida. */}
          {i.destino === 'despesa' && !i.catId && i.catTexto.trim().length >= 2 && (() => {
            const achados = buscarCategorias(folhas, caminhoDe, i.catTexto, 6)
            return achados.length ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--surface-200)] divide-y divide-[var(--surface-200)]">
                {achados.map(({ c, termoBatido, forte }) => (
                  <button key={c.id} type="button"
                          onClick={() => muda(i.n, { catId: c.id, catTexto: caminhoDe(c.id), porSinonimo: false })}
                          className="w-full text-left px-2 py-1 text-[11px] hover:bg-[var(--surface-50)] flex items-center gap-2">
                    <span className="flex-1 truncate text-[var(--surface-700)]">{caminhoDe(c.id)}</span>
                    {!forte && termoBatido && <span className="text-[10px] text-[var(--surface-400)] shrink-0">“{termoBatido}”</span>}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-amber-500">nenhuma categoria com “{i.catTexto.trim()}”</p>
            )
          })()}
          {/* A LISTINHA — decisões parecidas do mesmo destino; clicar aplica. */}
          {!i.jaNoSistema && i.destino !== 'fora' && !(i.doHistorico && i.sugestoes.length === 1) && (
            <div className="flex flex-wrap gap-1">
              {i.sugestoes.filter(s => s.decisao.tipo === i.destino).map(s => {
                const d = s.decisao
                const rotulo = d.tipo === 'despesa'
                  ? caminhoDe(d.catId)
                  : `${maquininhas.find(m => m.id === d.opId)?.nome || '?'} · ${d.mov ? ROTULO_MOV[d.mov] : '?'}`
                return (
                  <button key={s.chave} type="button"
                          onClick={() => muda(i.n, d.tipo === 'despesa'
                            ? { catId: d.catId, catTexto: caminhoDe(d.catId), porSinonimo: false }
                            : { opId: d.opId, mov: d.mov || '' })}
                          className="text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--surface-300)] text-[var(--surface-500)] hover:border-sky-500 hover:text-sky-500"
                          title={`Parecido com ${s.vezes} registro(s); o mais recente em ${fmtData(s.ultima)}`}>
                    {rotulo} — {s.vezes}×
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <span className={`text-xs text-mono shrink-0 ${i.valor > 0 ? 'text-emerald-500' : 'text-red-400'}`}>
          {i.valor > 0 ? '' : '−'}{fmtBRL(Math.abs(i.valor))}
        </span>
      </div>
    )
  }

  /** "PARECE JÁ LANÇADO" — a linha do banco e os candidatos do sistema. */
  function linhaParecida(i: Item) {
    const p = i.parecido!
    const escolher = (k: number) => muda(i.n, { parecido: { ...p, escolhido: k } })
    return (
      <div key={i.n} className="py-2 space-y-1">
        <div className="flex items-start gap-2">
          <p className="flex-1 min-w-0 text-xs text-[var(--surface-700)] truncate" title={i.original}>{fmtData(i.data)} · {i.descricao}</p>
          <span className={`text-xs text-mono shrink-0 ${i.valor > 0 ? 'text-emerald-500' : 'text-red-400'}`}>
            {i.valor > 0 ? '' : '−'}{fmtBRL(Math.abs(i.valor))}
          </span>
        </div>
        <div className="pl-3 space-y-0.5">
          {p.candidatos.map((c, k) => {
            const outra = itens.some(x => x.n !== i.n && x.parecido && x.parecido.escolhido >= 0 && x.parecido.candidatos[x.parecido.escolhido].chave === c.chave)
            const difValor = Math.abs(c.valor - i.valor) >= 0.005
            return (
              <label key={c.chave} className={`flex items-center gap-1.5 text-[11px] ${outra ? 'opacity-40' : 'cursor-pointer'}`}>
                <input type="radio" name={`par-${i.n}`} checked={p.escolhido === k} disabled={outra} onChange={() => escolher(k)} className="accent-emerald-500" />
                <span className="text-[var(--surface-700)]">é <strong className="font-medium">{c.rotulo}</strong></span>
                <span className="text-[var(--surface-500)]">· lançado {fmtData(c.data)} · {fmtBRL(Math.abs(c.valor))}</span>
                {c.ajustavel && (difValor || c.data !== i.data) && (
                  <span className="text-sky-500" title="Ao confirmar, o lançamento recebe o valor e a data do banco">→ fica como o banco</span>
                )}
                {outra && <span className="text-[var(--surface-400)]">(já escolhido em outra linha)</span>}
              </label>
            )
          })}
          <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
            <input type="radio" name={`par-${i.n}`} checked={p.escolhido === -1} onChange={() => escolher(-1)} className="accent-emerald-500" />
            <span className="text-[var(--surface-500)]">é outro — lançar como novo</span>
          </label>
        </div>
      </div>
    )
  }

  const secao = (titulo: string, lista: Item[], extra?: ReactNode) =>
    lista.length ? (
      <div>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs font-semibold text-[var(--surface-600)]">{titulo} ({lista.length})</p>
          {extra}
        </div>
        <div className="divide-y divide-[var(--surface-200)]">{lista.map(i => linha(i))}</div>
      </div>
    ) : null

  return (
    <Modal
      isOpen={aberto}
      onClose={onClose}
      title="Colar do extrato"
      footer={itens.length ? (
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="text-xs text-[var(--surface-500)]">
            {recProntas.length} receitas <span className="text-mono">{fmtBRL(totais.rec)}</span>
            {' · '}{despProntas.length} despesas <span className="text-mono">{fmtBRL(totais.desp)}</span>
            {pendentes > 0 && <span className="text-amber-500"> · {pendentes} esperando escolha</span>}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setItens([])} className="btn-secondary text-sm">Voltar</button>
            <button onClick={() => void registrar()}
                    disabled={salvando || (!recProntas.length && !despProntas.length && !confirmados.length && !exatosParaConciliar.length)}
                    className="btn-primary text-sm">
              {salvando ? <><Loader2 className="h-4 w-4 animate-spin" /> Registrando…</>
                : recProntas.length + despProntas.length
                  ? `Registrar ${recProntas.length + despProntas.length}${confirmados.length + exatosParaConciliar.length ? ` e conciliar ${confirmados.length + exatosParaConciliar.length}` : ''}`
                  : `Conciliar ${confirmados.length + exatosParaConciliar.length}`}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={() => void ler()} disabled={!texto.trim() || lendo || !contaId} className="btn-primary text-sm">
            {lendo ? <><Loader2 className="h-4 w-4 animate-spin" /> Lendo…</> : <><ClipboardPaste className="h-4 w-4" /> Ler</>}
          </button>
        </div>
      )}
    >
      <div className="space-y-3">
        <div>
          <label className="text-xs text-[var(--surface-500)] block mb-1">Extrato da conta</label>
          <select value={contaId} onChange={e => { setContaId(e.target.value); setItens([]) }} className="input text-sm w-full">
            <option value="">Escolher…</option>
            {correntes.map(c => <option key={c.id} value={c.id}>{c.preferencial_recebimento ? '⭐ ' : ''}{c.nome}</option>)}
            {cartoes.length > 0 && (
              <optgroup label="Fatura de cartão">
                {cartoes.map(c => <option key={c.id} value={c.id}>💳 {c.nome}</option>)}
              </optgroup>
            )}
          </select>
        </div>

        {ehCartao && (
          <div>
            <label className="text-xs text-[var(--surface-500)] block mb-1">Fatura (vencimento) — é quando essas compras saem do caixa</label>
            <div className="flex flex-wrap items-center gap-2">
              {!novaFatura ? (
                <select value={vencimento} onChange={e => setVencimento(e.target.value)} className="input text-sm flex-1"
                        style={!vencimento ? { borderColor: '#f59e0b' } : undefined}>
                  <option value="">Escolher a fatura…</option>
                  {faturas.map(f => (
                    <option key={f.venc} value={f.venc}>vence {fmtData(f.venc)} · {f.qtd} compras · {fmtBRL(f.total)}</option>
                  ))}
                </select>
              ) : (
                <input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} className="input text-sm flex-1"
                       style={!vencimento ? { borderColor: '#f59e0b' } : undefined} />
              )}
              <button type="button" onClick={() => { setNovaFatura(v => !v); setVencimento('') }}
                      className="text-xs text-emerald-500 hover:underline shrink-0">
                {novaFatura ? (faturas.length ? 'escolher existente' : '') : '+ nova fatura'}
              </button>
            </div>
          </div>
        )}

        {!itens.length ? (
          <div className="space-y-2">
            <p className="text-xs text-[var(--surface-500)]">
              Cole o extrato do jeito que veio do banco — um dia, uma semana, tudo misturado. Cada linha é
              conferida contra o que já está no sistema; o que for novo vira receita a prazo ou despesa.
            </p>
            <textarea
              value={texto} onChange={e => setTexto(e.target.value)} rows={10} autoFocus
              placeholder={'05/06/2026;"Credito domicilio cartao: ""CARTAO DE CREDITO - INTER PAG""";102,76;22.096,94\n05/06/2026;"Pix enviado: ""Cp :10573521-Rafael Moreira Giffoni""";-3.450,00;21.994,18'}
              className="input text-xs text-mono w-full"
            />
          </div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {parecidos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-500 mb-1">
                  Parece já lançado — confira ({parecidos.length})
                </p>
                <p className="text-[11px] text-[var(--surface-500)] mb-1">
                  Valor igual com data até {JANELA_DIAS} dias diferente{ehCartao ? `, ou câmbio até ${TOLERANCIA_CAMBIO * 100}%` : ''}.
                  Confirmado, não lança de novo — e o lançamento fica com o valor e a data do banco.
                </p>
                <div className="divide-y divide-[var(--surface-200)]">{parecidos.map(i => linhaParecida(i))}</div>
              </div>
            )}
            {secao('Receitas a prazo', receitas,
              maquininhas.length > 1 ? (
                <select value={maquininhaLote} onChange={e => setMaquininhaLote(e.target.value)}
                        className="input text-[11px] py-0.5 px-1" style={!maquininhaLote ? { borderColor: '#f59e0b' } : undefined}>
                  <option value="">qual maquininha?</option>
                  {maquininhas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              ) : maquininhas.length === 1 ? (
                <span className="text-[11px] text-[var(--surface-400)]">{maquininhas[0].nome}</span>
              ) : (
                <span className="text-[11px] text-amber-500">nenhuma maquininha cadastrada (aba Contas)</span>
              ))}
            {secao('Despesas', despesas)}
            {ehCartao && cabecalho && (() => {
              // Conferência: compras lidas (as já no sistema contam) contra o total da fatura.
              const soma = itens.filter(i => !foraDoCartao(i.descricao)).reduce((a, i) => a + Math.abs(i.valor), 0)
              const bate = Math.abs(soma - cabecalho.total) < 0.005
              return (
                <p className={`text-[11px] ${bate ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {bate ? '✓ ' : '⚠ '}Compras lidas somam {fmtBRL(soma)} · fatura de {fmtData(cabecalho.venc)}: {fmtBRL(cabecalho.total)}
                  {!bate && ` — faltam ${fmtBRL(cabecalho.total - soma)}; confira se o texto colado está inteiro`}
                </p>
              )
            })()}
            {secao('Já no sistema ou fora', fora)}
            {naoVieram.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[var(--surface-600)] mb-1">
                  No sistema e não veio no texto ({naoVieram.length})
                </p>
                <p className="text-[11px] text-[var(--surface-500)] mb-1">
                  {ehCartao ? 'Estão nesta fatura no sistema' : 'Estão nesta conta no período colado'} e nenhuma linha bateu:
                  lançamento a mais, cancelado, com valor errado — ou o texto colado está incompleto.
                </p>
                <div className="divide-y divide-[var(--surface-200)]">
                  {naoVieram.map(r => (
                    <div key={r.chave} className="flex items-center gap-2 py-1 text-xs">
                      <span className="text-[var(--surface-500)] w-16 shrink-0">{fmtData(r.data)}</span>
                      <span className="flex-1 truncate text-[var(--surface-700)]">{r.rotulo}</span>
                      <span className={`text-mono shrink-0 ${r.valor > 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                        {r.valor > 0 ? '' : '−'}{fmtBRL(Math.abs(r.valor))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {itens.some(i => i.destino === 'receita' && i.mov === 'antecipacao' && i.marcado) && (
              <p className="text-[11px] text-amber-500">
                Antecipação: registre o valor LÍQUIDO que caiu. O desconto da antecipação é despesa —
                Financeiro › Encargos.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
