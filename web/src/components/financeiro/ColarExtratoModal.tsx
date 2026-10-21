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

import { useCoresContas, rotuloConta, estiloConta } from '@/lib/cor-conta'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Loader2, ClipboardPaste, ChevronRight, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import { fmtBRL, fmtData, colarValorBR } from '@/lib/financeiro'
import {
  lerExtrato, movimentoDe, pareceMaquininha, metodoDe, fornecedorDe, naoEDespesa, quitacaoDe, foraDoCartao, ehRendimento, cabecalhoFatura,
  ROTULO_MOV, ENTRA_MOV, movDoRegistro, type MovMaquininha, type LinhaExtrato,
} from '@/lib/extrato'
import { criarIndice, sugerir, type Sugestao } from '@/lib/similaridade'
import { buscarCategorias, sugerirPorSinonimo, type CategoriaBuscavel } from '@/lib/busca-categoria'
import { conciliar, semPar, type RegistroSistema, type Ref } from '@/lib/conciliacao'
import { ehOFX, lerOFX, textoDoArquivo, mesmoBanco, type ExtratoOFX } from '@/lib/ofx'
import { textoDoPdf } from '@/lib/fatura-pdf'
import { casarPagamentoFatura, encadearFaturas, type CasamentoFatura, type FaturaResumo } from '@/lib/fatura-estado'
import { casarPagamentoRepasse, faltaRepasse, rotuloRef, type CasamentoRepasse, type RepasseResumo } from '@/lib/repasse-estado'
import { carregarRepassesDaUnidade } from '@/lib/repasse-carregar'
import { useCaixaConjunto } from '@/hooks/useCaixaConjunto'
import { reconhecerCobranca } from '@/lib/reconhecer-cobranca'
import { CONFERIDO_A_MAO, ehConferidoAMao } from '@/lib/conferido'

type ContaRow = { id: string; nome: string; produto: string | null; tipo: string | null; preferencial_recebimento: boolean | null; instituicao?: string | null; conciliavel?: boolean | null }
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
  dono?: string | null           // caixa conjunto (Matriz + Pinda): de quem é a despesa nova
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
  /** Devolução na CONTA (10/10/2026): "Pix enviado devolvido" — a saída que ela
   *  desfaz ("devolve a saída de 11/09"). Vira estorno na categoria da saída. */
  estornoDe: string
  /** REIMPORTAR PRA CLASSIFICAR (15/10/2026): a linha já está no sistema, mas lançada SEM
   *  categoria — o id desse lançamento. Escolhida a categoria, o registro só a grava nele. */
  reclassificar?: string
  /** PAGAMENTO DE FATURA (16/10/2026, Lucas): a linha do banco que paga uma fatura do cartão.
   *  'bate' → um clique concilia (grava o pagamento com a data do banco); 'difere' → só o aviso
   *  do que falta, sem tirar ninguém da tela. `conciliarFatura`: a caixinha do 'bate'. */
  faturaPgto?: CasamentoFatura | null
  conciliarFatura?: boolean
  /** PAGAMENTO PARCIAL (16/10/2026): o banco pagou menos que a fatura conferida e a pessoa
   *  confirmou que foi parcial — grava assim mesmo; o resto vai pra fatura seguinte. */
  parcialFatura?: boolean
  /** PAGAMENTO DE REPASSE (16/10/2026): o Pix pra Matriz ligado ao repasse em aberto — mesma régua
   *  da fatura (lib/repasse-estado.ts). `parcialRepasse`: pagou uma parte, o resto fica em aberto. */
  repassePgto?: CasamentoRepasse | null
  conciliarRepasse?: boolean
  parcialRepasse?: boolean
  /** RENDIMENTO AUTOMÁTICO (16/10/2026, reunião com SJ): "REND PAGO APLIC AUT" vira movimento
   *  `rendimento` (mig 168) sem perguntar. Desmarcar ("não é rendimento") devolve a linha. */
  rendimento?: boolean
  /** A mesma linha (ID do banco) já foi conciliada noutra importação — vai pra "Já conciliadas antes". */
  jaConciliada?: boolean
  /** A linha do banco está conciliada com registros que somam MAIS que ela (16/10/2026, SJ: o
   *  Pix de −316 ligado a uma despesa sem categoria E à devolução do contrato). Guarda a soma. */
  duplicada?: number
  /** "É OUTRA COISA" no Quase lá (16/10/2026, Lucas: "me preocupa inferências"): a pessoa diz
   *  ali mesmo o que a linha é — o sistema não escolhe outra seção por ela. Sem escolha = pendente. */
  outraCoisa?: OutraCoisa
  /** A SEÇÃO onde a linha nasce e de onde não sai (16/10/2026, redesenho): a decisão muda a
   *  etiqueta, nunca o lugar. 'auto' = rendimento que entra sozinho; 'pgto' = fatura/repasse. */
  casa?: Casa
}

type Casa = 'quase' | 'despesa' | 'receita' | 'fora' | 'auto' | 'pgto'

type OutraCoisa = 'contrato' | 'receita' | 'entre' | 'rendimento' | 'despesa' | 'fora'
  | 'outra_receita' | 'emprestimo_devolvido' | 'emprestimo_concedido'   // mig 171

/** Crédito na fatura: "+ R$ 1,20" (Inter) ou texto de estorno/reembolso. No
 *  OFX o sinal é confiável: positivo que não é o pagamento da fatura.
 *  ⚠️ No PDF do Inter o PAGAMENTO da fatura anterior também vem "+ R$" ("PAGAMENTO ON
 *  LINE + R$ 6.728,19"): sem excluir, virava estorno e abatia as despesas (15/10/2026). */
const ehPagamentoDaFatura = (d: string) => (foraDoCartao(d) || '').startsWith('pagamento')
const creditoNoCartao = (l: { original: string; descricao: string; valor: number; fitid?: string }) =>
  l.fitid
    ? l.valor > 0 && !ehPagamentoDaFatura(l.descricao)
    : (/\+\s*R\$/.test(l.original) && !ehPagamentoDaFatura(l.descricao)) || (foraDoCartao(l.descricao) || '').startsWith('estorno')

/** A chave do "entre contas": o nome entre aspas / do favorecido, sem número. */
const chaveEntre = (d: string) => (fornecedorDe(d) || d).normalize('NFD').toLowerCase()
  .replace(/[^a-z ]/g, ' ').replace(/ +/g, ' ').trim()

export default function ColarExtratoModal({
  aberto, onClose, categorias, folhas, receitas: catsReceita = [], caminhoDe, mes, onRegistrou, permiteReceitas = true, contaInicial,
}: {
  aberto: boolean
  onClose: () => void
  categorias: Cat[]
  folhas: CategoriaBuscavel[]
  /** As folhas do ramo Receitas (mig 171) — o "outra receita" escolhe entre elas. */
  receitas?: CategoriaBuscavel[]
  caminhoDe: (id: string) => string
  mes: string
  onRegistrou: () => void
  /** FLS `obj_fin_receitas_prazo`: escondida a faixa, o colar não cria receita a prazo. */
  permiteReceitas?: boolean
  /** Abrir já nesta conta ("Importar extrato desta conta", em Contas e Faturas). */
  contaInicial?: string | null
}) {
  const supabase = createClient() as unknown as SupabaseClient
  const { toast } = useToast()
  const cores = useCoresContas()
  const { currentUnit, userName } = useUnit()

  const [texto, setTexto] = useState('')
  // O ARQUIVO OFX (09/10/2026): quando vem, ele é a fonte — não o texto.
  const [ofx, setOfx] = useState<{ nome: string; dados: ExtratoOFX } | null>(null)
  // a conta escolhida pelo banco do arquivo: lê assim que o estado assentar (14/10/2026)
  const lerQuandoPronto = useRef(false)
  const [bancoAviso, setBancoAviso] = useState<string | null>(null)
  const [pdfNome, setPdfNome] = useState<string | null>(null)
  // CAIXA CONJUNTO (15/10/2026): a despesa que nasce da importação pergunta de quem é
  const conj = useCaixaConjunto()
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
  // UMA linha aberta por vez (redesenho 16/10/2026)
  const [linhaAberta, setLinhaAberta] = useState<number | null>(null)
  const [soPendentes, setSoPendentes] = useState(false)
  const [trocarPerg, setTrocarPerg] = useState(false)
  // Destinos possíveis de "foi para outras unidades" e os repasses que aceitam acerto.
  const [unidades, setUnidades] = useState<UnidadeRow[]>([])
  const [repassesAbertos, setRepassesAbertos] = useState<RepasseRow[]>([])
  // CONTAS DE ACOMPANHAMENTO (14/10/2026): a despesa que paga uma delas ganha
  // destaque e já nasce ligada (conta_fixa_id) — o calendário fica verde sozinho.
  /** a conta da Matriz que recebe o repasse (a preferencial; senão a primeira corrente) */
  const [contaMatriz, setContaMatriz] = useState('')
  const [contasFixas, setContasFixas] = useState<{ id: string; nome: string; categoria_id: string | null; valor: number; repasse: boolean }[]>([])
  useEffect(() => {
    if (!aberto || !currentUnit?.id) return
    void supabase.from('fin_contas_fixas').select('id, nome, categoria_id, valor, repasse').eq('unidade_id', currentUnit.id).eq('ativo', true)
      .then(({ data, error }) => setContasFixas(error ? [] : ((data as typeof contasFixas | null) || [])))
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
  const [jaAntesAberto, setJaAntesAberto] = useState(false)
  /** A conta de acompanhamento que esta despesa paga: a única da categoria, ou a de
   *  valor mais perto (até 15%) quando a categoria tem mais de uma — a mesma regra do calendário. */
  const contaFixaDe = (catId: string, valor: number) => {
    const cs = contasFixas.filter(c => !c.repasse && c.categoria_id === catId)
    if (cs.length === 1) return cs[0]
    let melhor: { c: (typeof cs)[number]; dif: number } | null = null
    for (const c of cs) {
      const ref = Number(c.valor) || 0
      if (!ref) continue
      const dif = Math.abs(Math.abs(valor) - ref) / ref
      if (dif <= 0.15 && (!melhor || dif < melhor.dif)) melhor = { c, dif }
    }
    return melhor?.c || null
  }

  const maquininhas = contas.filter(c => c.produto === 'maquininha')
  // Só conta CONCILIÁVEL entra na escolha do extrato (mig 169, 15/10/2026: o Dinheiro de SJ,
  // marcado "Não concilia", aparecia aqui). A lista `contas` inteira segue valendo pra outra
  // ponta da transferência (sacar pro Dinheiro continua possível).
  const conciliaveis = contas.filter(c => c.conciliavel !== false)
  const correntes = conciliaveis.filter(c => c.produto !== 'maquininha' && c.tipo !== 'cartao')
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
    setTexto(''); setItens([]); setOfx(null); setPdfNome(null); setBancoAviso(null)
    void supabase.from('contas')
      .select('id, nome, produto, tipo, preferencial_recebimento, instituicao, conciliavel')
      .or(`unidade_id.eq.${currentUnit.id},unidades_extras.cs.{${currentUnit.id}}`)
      .eq('ativo', true).eq('legado', false).order('nome')
      .then(({ data }) => {
        const cs = (data as ContaRow[] | null) || []
        setContas(cs)
        const corr = cs.filter(c => c.produto !== 'maquininha' && c.tipo !== 'cartao' && c.conciliavel !== false)
        setContaId(contaInicial && cs.some(c => c.id === contaInicial) ? contaInicial : (corr.find(c => c.preferencial_recebimento) || corr[0])?.id || '')
        const maq = cs.filter(c => c.produto === 'maquininha')
        setMaquininhaLote(maq.length === 1 ? maq[0].id : '')
      })
  }, [aberto, currentUnit?.id, supabase, contaInicial])

  // a conta acabou de ser trocada pelo banco do arquivo: lê com ela
  useEffect(() => {
    if (!lerQuandoPronto.current || !contaId || (!ofx && !texto)) return
    lerQuandoPronto.current = false
    void ler()
  }, [contaId, ofx, texto]) // eslint-disable-line react-hooks/exhaustive-deps

  /** A casa de cada linha (ver Item.casa) — calculada uma vez, depois de toda a classificação. */
  function comCasa(xs: Item[]): Item[] {
    return xs.map(i => ({
      ...i,
      casa: i.jaNoSistema ? undefined
        : i.parecido ? 'quase'
        : (i.faturaPgto || i.repassePgto || (i.valor < 0 && !ehCartao && quitacaoDe(i.descricao)) || (ehCartao && ehPagamentoDaFatura(i.descricao))) ? 'pgto'
        : (i.destino === 'fora' && i.rendimento) ? 'auto'
        : i.destino as Casa,
    }))
  }

  /** A linha que paga fatura e não está no sistema ganha a fatura dela (uma fatura serve a uma linha só). */
  function comPagamentoDeFatura(faturas: FaturaResumo[], xs: Item[], repasses: RepasseResumo[] = []): Item[] {
    if (!faturas.length && !repasses.length) return xs
    const usadas = new Set<string>()
    return xs.map(i => {
      if (i.jaNoSistema || i.parecido || i.valor >= 0) return i
      const q = quitacaoDe(i.descricao)
      if (q === 'repasse' && repasses.length) {
        const c = casarPagamentoRepasse(i.valor, repasses.filter(r => !usadas.has(r.id)))
        if (!c) return i
        if (c.tipo === 'bate') usadas.add(c.repasse.id)
        return { ...i, destino: 'fora' as Destino, marcado: false, entreConta: '', repassePgto: c, conciliarRepasse: c.tipo === 'bate' }
      }
      if (q !== 'fatura' || !faturas.length) return i
      const c = casarPagamentoFatura(i.valor, i.data, faturas.filter(f => !usadas.has(`${f.cartaoId}|${f.venc}`)))
      if (!c) return i
      if (c.tipo === 'bate') usadas.add(`${c.fatura.cartaoId}|${c.fatura.venc}`)
      return { ...i, destino: 'fora' as Destino, marcado: false, entreConta: '', faturaPgto: c, conciliarFatura: c.tipo === 'bate' }
    })
  }

  async function ler(deArquivo?: ExtratoOFX) {
    if (!contaId) return toast('Escolha de qual conta é o extrato', 'error')
    const ano = Number(mes.slice(0, 4)) || new Date().getFullYear()
    // OFX: do arquivo enviado (ou colado no campo, que só existe na fatura de cartão).
    const fonteOfx = deArquivo ?? ofx?.dados ?? (ehCartao && ehOFX(texto) ? lerOFX(texto) : null)
    // CONTA CORRENTE SÓ POR OFX (14/10/2026, Lucas): colar texto é arriscado — data sem ano,
    // sinal adivinhado, linha cortada. O OFX traz data, sinal, ID e saldo do próprio banco.
    if (!ehCartao && !fonteOfx) return toast('Envie o arquivo OFX do extrato', 'error')
    if (fonteOfx && fonteOfx.cartao !== ehCartao) {
      toast(fonteOfx.cartao ? 'Este OFX é de cartão — confira a conta escolhida' : 'Este OFX é de conta corrente — confira a conta escolhida', 'error')
    }
    // No cartão o sinal do banco não serve: há fatura que lista a compra positiva.
    // Toda linha que não é pagamento nem estorno é COMPRA, e compra é saída.
    const linhas = (fonteOfx ? fonteOfx.linhas : lerExtrato(texto, ano, undefined, { cartao: ehCartao })).map(l => {
      if (!ehCartao) return l
      if (creditoNoCartao(l)) return { ...l, valor: Math.abs(l.valor) }   // estorno: entra
      return foraDoCartao(l.descricao) ? l : { ...l, valor: -Math.abs(l.valor) }
    })
    if (!linhas.length) { setItens([]); return toast('Nenhuma linha com data e valor no texto colado', 'error') }
    setLendo(true)
    setPlacar(null)   // o da leitura anterior (outra conta/unidade) ficava na tela até a conta nova chegar
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
        : supabase.from('vw_caixa').select('data, valor, origem, origem_id, descricao, tipo')
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
      : ((caixa.data as (CX & { tipo?: string })[] | null) || []).filter(r => r.tipo !== 'ajuste')   // ajuste de saldo é nosso, nunca vem no banco
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
    const idsLanc = registros.map(r => r.ajustavel).filter((x): x is string => !!x)
    const semCatJa = new Set<string>()
    for (let k = 0; k < idsLanc.length; k += 150) {
      const { data: sc } = await supabase.from('fin_lancamentos').select('id').in('id', idsLanc.slice(k, k + 150)).is('categoria_id', null)
      for (const x of (sc as { id: string }[] | null) || []) semCatJa.add(x.id)
    }

    // LINHA JÁ CONCILIADA (16/10/2026, SJ: um Pix de −316 ficou ligado a uma despesa sem
    // categoria E à devolução lançada depois no contrato — o casamento não olhava o que já
    // estava conciliado). A conciliação gravada manda: a linha do banco fica com OS registros
    // dela, e registro já ligado a uma linha nunca casa com outra. Mesma linha = mesmo ID do
    // banco com mesma data e valor (o Itaú reaproveita o ID, ver fitidVisto) ou, no texto
    // colado, mesma data + valor + texto.
    type CC = { origem: Ref['origem']; origem_id: string; fitid?: string | null; data_banco: string; valor_banco: number; texto_banco: string | null }
    const concGrav: CC[] = []
    {
      // PAGINADO: o PostgREST corta em 1000 linhas mesmo com limit maior, e a conciliação que
      // ficasse de fora voltaria a casar — reabrindo o dobro sem aviso (achado da Ouro).
      const sel = (comFitid: boolean, off: number) => supabase.from('fin_conciliacoes')
        .select(`id, origem, origem_id, data_banco, valor_banco, texto_banco${comFitid ? ', fitid' : ''}`)
        .eq('conta_id', contaId).gte('data_banco', iniJ).lte('data_banco', fimJ)
        .order('id').range(off, off + 999)
      let comFitid = true
      for (let off = 0; ; off += 1000) {
        let r = await sel(comFitid, off)
        if (r.error && comFitid && /fitid/i.test(r.error.message)) { comFitid = false; r = await sel(false, off) }   // sem a mig 158
        const arr = (r.data as unknown as CC[] | null) || []
        // O "CONFERIDO À MÃO NO CALENDÁRIO" (ContasDoMes) não é linha do banco: não segura o
        // registro. Se segurasse, a linha de verdade do extrato ficava sem par e virava despesa
        // nova — o salário do Ezequiel entrou duas vezes em ST (20/10/2026). Fica livre para
        // casar, e o registrar troca a marca pelo texto e o ID do banco.
        concGrav.push(...arr.filter(c => !(!c.fitid && ehConferidoAMao(c.texto_banco))))
        if (arr.length < 1000) break
      }
    }
    const refKey = (x: { origem: string; origem_id: string }) => `${x.origem}-${x.origem_id}`
    const regDaRef = new Map<string, RegistroSistema>()
    for (const r of registros) for (const x of r.refs) regDaRef.set(refKey(x), r)
    const tomados = new Set<string>()
    for (const c of concGrav) { const r = regDaRef.get(refKey(c)); if (r) tomados.add(r.chave) }
    const donosDe = new Map<number, RegistroSistema[]>()
    const usadas = new Set<CC>()
    for (const l of linhas) {
      const mesma = (c: CC) => !usadas.has(c) && Math.abs(Number(c.valor_banco) - l.valor) < 0.005
        && (c.data_banco || '').slice(0, 10) === l.data
        && (l.fitid && c.fitid ? c.fitid === l.fitid : (c.texto_banco || '').trim() === l.descricao.trim())
      const regs: RegistroSistema[] = []
      let soma = 0
      for (const c of concGrav.filter(mesma)) {
        const r = regDaRef.get(refKey(c))
        if (!r) continue
        // sem ID do banco, duas linhas iguais no mesmo dia dividem as conciliações: cada uma
        // pega até somar o próprio valor. Com ID, pega todas — e a soma maior denuncia duplicata.
        if (!l.fitid && regs.length && Math.abs(soma - l.valor) < 0.005) break
        usadas.add(c)
        if (!regs.includes(r)) { regs.push(r); soma = Math.round((soma + r.valor) * 100) / 100 }
      }
      if (regs.length) donosDe.set(l.n, regs)
    }

    // Os quatro níveis (exato · contrato · provável · ambíguo) — lib/conciliacao.
    // Só com o que ainda não foi conciliado, dos dois lados.
    const pares = conciliar(linhas.filter(l => !donosDe.has(l.n)), registros.filter(r => !tomados.has(r.chave)), {
      janelaDias: JANELA_DIAS, toleranciaCambio: ehCartao ? TOLERANCIA_CAMBIO : 0, porContrato: !ehCartao, dataNoTexto: !ehCartao,
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

    // FITID já visto nesta conta (mig 158): a linha foi importada antes.
    // 🔴 SÓ VALE COM O MESMO VALOR E A MESMA DATA DO BANCO (14/10/2026): o Itaú gera o ID
    // como data + número de ordem no dia (20261014001, …002). Exportar de novo um dia que
    // ainda não acabou desloca a numeração — o mesmo ID passa a ser OUTRA linha, e confiar
    // só no ID pularia o lançamento novo em silêncio.
    const fitidVisto = new Map<string, { valor: number; data: string }[]>()
    const fitids = linhas.map(l => l.fitid).filter((f): f is string => !!f)
    for (let k = 0; k < fitids.length; k += 150) {
      const { data: fv, error: efv } = await supabase.from('fin_conciliacoes').select('fitid, valor_banco, data_banco')
        .eq('conta_id', contaId).in('fitid', fitids.slice(k, k + 150))
      if (efv) break                                   // sem a mig 158: segue sem
      for (const r of (fv as { fitid: string; valor_banco: number; data_banco: string }[] | null) || [])
        fitidVisto.set(r.fitid, [...(fitidVisto.get(r.fitid) || []), { valor: Number(r.valor_banco), data: (r.data_banco || '').slice(0, 10) }])
    }
    const mesmaLinhaJaImportada = (l: { fitid?: string; valor: number; data: string }) =>
      !!l.fitid && (fitidVisto.get(l.fitid) || []).some(v => Math.abs(v.valor - l.valor) < 0.005 && v.data === l.data)

    // DEVOLUÇÃO NA CONTA (10/10/2026: "Pix enviado devolvido" +418,60, devolução
    // do Pix de −418,60 de 11/09 lançado como despesa). Procura a saída: mesmo
    // valor, até 60 dias antes, nesta conta; com mais de uma, desempata pelo
    // favorecido. Achou UMA → estorno na categoria dela (negativo, como no cartão).
    const devolucao = new Map<number, { catId: string; data: string }>()
    const candDev = ehCartao ? [] : linhas.filter(l => l.valor > 0 && /devolvid|devolu[cç][aã]o|estorno|reembolso/i.test(l.descricao))
    if (candDev.length) {
      const primeira = candDev.map(l => l.data).sort()[0]
      const ini60 = new Date(Date.parse(primeira) - 60 * 86400000).toISOString().slice(0, 10)
      const { data: sai } = await supabase.from('fin_lancamentos')
        .select('categoria_id, valor, data_caixa, observacoes, fornecedor_nome')
        .eq('conta_pagamento_id', contaId).neq('status', 'rejeitado').gt('valor', 0)
        .gte('data_caixa', ini60).lte('data_caixa', fim).not('categoria_id', 'is', null)
      type Sai = { categoria_id: string; valor: number; data_caixa: string; observacoes: string | null; fornecedor_nome: string | null }
      for (const l of candDev) {
        const mesmos = ((sai as Sai[] | null) || []).filter(x => Math.abs(Number(x.valor) - l.valor) < 0.005 && x.data_caixa.slice(0, 10) <= l.data)
        const quem = chaveEntre(l.descricao)
        const peloNome = mesmos.filter(x => quem.length >= 4 && chaveEntre(`${x.observacoes || ''} ${x.fornecedor_nome || ''}`).includes(quem))
        const achou = mesmos.length === 1 ? mesmos[0] : peloNome.length === 1 ? peloNome[0] : null
        if (achou) devolucao.set(l.n, { catId: achou.categoria_id, data: achou.data_caixa.slice(0, 10) })
      }
    }

    // PAGAMENTO DE FATURA (16/10/2026): as faturas dos cartões da unidade com vencimento perto
    // das linhas que parecem pagamento de fatura — soma, total do PDF, sem categoria e se já foi paga.
    const pgtosFatura = ehCartao ? [] : linhas.filter(l => l.valor < 0 && quitacaoDe(l.descricao) === 'fatura')
    let faturasAbertas: FaturaResumo[] = []
    const cartoesU = contas.filter(c => c.tipo === 'cartao' || c.produto === 'cartao_credito')
    if (pgtosFatura.length && cartoesU.length) {
      const dts = pgtosFatura.map(l => l.data).sort()
      // 45 dias pra trás: traz também a fatura anterior, cujo resto (se paga em parte) vem pra esta
      const desde = new Date(Date.parse(dts[0]) - 45 * 86400000).toISOString().slice(0, 10)
      const ate = new Date(Date.parse(dts[dts.length - 1]) + 25 * 86400000).toISOString().slice(0, 10)
      const ids = cartoesU.map(c => c.id)
      const ls: { conta_pagamento_id: string; data_caixa: string; valor: number; categoria_id: string | null }[] = []
      for (let off = 0; ; off += 1000) {
        const { data: pg } = await supabase.from('fin_lancamentos').select('conta_pagamento_id, data_caixa, valor, categoria_id')
          .in('conta_pagamento_id', ids).neq('status', 'rejeitado').gte('data_caixa', desde).lte('data_caixa', ate).order('id').range(off, off + 999)
        const arr = (pg as typeof ls | null) || []
        ls.push(...arr)
        if (arr.length < 1000) break
      }
      const [{ data: tb }, { data: mv }] = await Promise.all([
        supabase.from('fin_saldos_banco').select('conta_id, data, saldo').eq('origem', 'fatura').in('conta_id', ids).gte('data', desde).lte('data', ate),
        supabase.from('fin_movimentos').select('conta_destino_id, fatura_vencimento, valor').eq('tipo', 'fatura_cartao').in('conta_destino_id', ids).gte('fatura_vencimento', desde).lte('fatura_vencimento', ate),
      ])
      // o que já foi pago de cada fatura: a SOMA dos pagamentos (paga em parte = menos que o total)
      const pagas = new Map<string, number>()
      for (const m of (mv as { conta_destino_id: string; fatura_vencimento: string; valor: number }[] | null) || []) {
        const k = `${m.conta_destino_id}|${m.fatura_vencimento.slice(0, 10)}`
        pagas.set(k, Math.round(((pagas.get(k) || 0) + Number(m.valor)) * 100) / 100)
      }
      const totais = new Map(((tb as { conta_id: string; data: string; saldo: number }[] | null) || []).map(t => [`${t.conta_id}|${t.data.slice(0, 10)}`, Math.round(-Number(t.saldo) * 100) / 100]))
      const mapa = new Map<string, FaturaResumo>()
      for (const l of ls) {
        const venc = l.data_caixa.slice(0, 10), k = `${l.conta_pagamento_id}|${venc}`
        const f = mapa.get(k) || { cartaoId: l.conta_pagamento_id, cartaoNome: cartoesU.find(c => c.id === l.conta_pagamento_id)?.nome || 'Cartão', venc, soma: 0, totalPdf: totais.get(k) ?? null, semCat: 0, pago: pagas.get(k) || 0, pagaConciliada: false }
        f.soma = Math.round((f.soma + Number(l.valor)) * 100) / 100
        if (!l.categoria_id) f.semCat++
        mapa.set(k, f)
      }
      faturasAbertas = encadearFaturas([...mapa.values()])
    }
    // PAGAMENTO DE REPASSE: os repasses da unidade e a conta da Matriz que recebe
    let repassesPgto: RepasseResumo[] = []
    if (!ehCartao && currentUnit?.id && linhas.some(l => l.valor < 0 && quitacaoDe(l.descricao) === 'repasse')) {
      repassesPgto = await carregarRepassesDaUnidade(supabase, currentUnit.id)
      const { data: mz } = await supabase.from('unidades').select('id').eq('is_matriz', true).limit(1)
      const mzId = (mz as { id: string }[] | null)?.[0]?.id
      if (mzId) {
        const { data: cm } = await supabase.from('contas').select('id, produto, tipo, preferencial_recebimento')
          .eq('unidade_id', mzId).eq('ativo', true).eq('legado', false).order('nome')
        const ok = ((cm as { id: string; produto: string | null; tipo: string | null; preferencial_recebimento: boolean | null }[] | null) || [])
          .filter(c => c.produto !== 'maquininha' && c.tipo !== 'cartao' && c.produto !== 'cartao_credito')
        setContaMatriz((ok.find(c => c.preferencial_recebimento) || ok[0])?.id || '')
      }
    }

    setItens(comCasa(comPagamentoDeFatura(faturasAbertas, linhas.map(l => {
      const base = {
        ...l, jaNoSistema: null as string | null, motivoFora: null as string | null, marcado: true,
        exatos: [] as RegistroSistema[], parecido: null as Item['parecido'],
        opId: '', mov: '' as MovMaquininha | '', catId: '', catTexto: '',
        metodo: ehCartao ? 'credito' : (metodoDe(l.descricao) || 'pix'), fornecedor: fornecedorDe(l.descricao),
        doHistorico: false, porSinonimo: false, palpite: '', sugestoes: [] as Sugestao<Decisao>[],
        partes: [] as Parte[], meses: 1, outras: [] as ParaUnidade[],
        entreConta: '', entreHist: false, estorno: false, estornoDe: '',
        jaConciliada: mesmaLinhaJaImportada(l),
      }
      // 0) já conciliada: fica com os registros dela (e avisa se eles somam mais que a linha)
      const donos = donosDe.get(l.n)
      if (donos) {
        const soma = Math.round(donos.reduce((a, d) => a + d.valor, 0) * 100) / 100
        const sobra = Math.abs(soma - l.valor) >= 0.005
        const semCatDono = !sobra && donos.length === 1 && donos[0].ajustavel && semCatJa.has(donos[0].ajustavel) ? donos[0].ajustavel : null
        if (semCatDono) {
          return { ...base, destino: 'despesa' as Destino, exatos: donos, reclassificar: semCatDono, jaConciliada: true,
                   estornoDe: 'já lançada, sem categoria' }
        }
        return { ...base, destino: 'fora' as Destino, marcado: false, jaConciliada: true, exatos: donos,
                 jaNoSistema: donos.map(d => d.rotulo).join(' + '), ...(sobra ? { duplicada: soma } : {}) }
      }
      // 1) já está no sistema?
      const par = exatoDe(l.n)
      const semCat = par && par.tipo === 'exato' && par.candidatos.length === 1 && par.candidatos[0].ajustavel && semCatJa.has(par.candidatos[0].ajustavel)
        ? par.candidatos[0].ajustavel : null
      if (par && semCat) {
        return { ...base, destino: 'despesa' as Destino, exatos: par.candidatos, reclassificar: semCat,
                 estornoDe: 'já lançada, sem categoria' }
      }
      if (par) {
        const rot = par.tipo === 'contrato' ? `${par.candidatos[0].rotulo} (${par.candidatos.length} pagamentos)` : par.candidatos[0].rotulo
        return { ...base, destino: 'fora' as Destino, jaNoSistema: rot, exatos: par.candidatos, marcado: false }
      }
      if (mesmaLinhaJaImportada(l)) {
        return { ...base, destino: 'fora' as Destino, marcado: false,
                 jaNoSistema: 'a mesma linha já importada antes (ID do banco)' }
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
      // 2a) devolução de uma saída desta conta → estorno
      const dev = devolucao.get(l.n)
      if (dev) {
        return { ...base, destino: 'despesa' as Destino, estorno: true, catId: dev.catId, catTexto: caminhoDe(dev.catId),
                 estornoDe: `devolve a saída de ${dev.data.slice(8, 10)}/${dev.data.slice(5, 7)}` }
      }
      // 2) rendimento automático da conta: entra sozinho como rendimento (antes do histórico,
      //    que poderia ter ensinado "entre contas" pra mesma frase)
      if (!ehCartao && ehRendimento(l.descricao, l.valor)) {
        return { ...base, destino: 'fora' as Destino, marcado: false, rendimento: true,
                 motivoFora: 'rendimento da aplicação automática' }
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
        item.motivoFora = /resgate|aplica/i.test(l.descricao)
          ? 'resgate de aplicação — escolha de qual conta da casa veio'
          : /pix recebido|transfer/i.test(l.descricao)
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
    }), repassesPgto)))
    // Fatura: o cabeçalho traz vencimento e total — preenche a fatura (se ainda
    // não escolhida) e guarda o total pra conferir a soma das compras.
    const cab = ehCartao ? cabecalhoFatura(texto) : null
    setCabecalho(cab)
    if (cab) {
      void supabase.from('fin_saldos_banco').upsert(
        { conta_id: contaId, data: cab.venc, saldo: -cab.total, origem: 'fatura', criado_por_nome: userName || null },
        { onConflict: 'conta_id,data' })
        .then(({ error }) => { if (error) console.warn('[saldo do banco]', error.message) })
    }
    if (cab && !vencimento) { setVencimento(cab.venc); setNovaFatura(!faturas.some(f => f.venc === cab.venc)) }

    // O PLACAR (conta corrente). Banco: o saldo da ÚLTIMA linha do último dia
    // (no extrato do Inter, a ordem do texto é a do dia). Sistema: tudo o que o
    // Caixa tem nesta conta até esse dia — paginado, a conta passa de 1000 linhas.
    setLinhaAberta(null); setEncontradasAberto(false); setJaAntesAberto(false); setTrocarPerg(false)
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
          // ⚠️ O builder do supabase-js só dispara no .then/await: `void` sozinho
          // NÃO enviava nada — a tabela ficou vazia até 10/10/2026.
          .then(({ error }) => { if (error) console.warn('[saldo do banco]', error.message) })
      }
    }
    setLendo(false)
  }

  const muda = (n: number, patch: Partial<Item>) => setItens(xs => xs.map(x => (x.n === n ? { ...x, ...patch } : x)))

  const emParecido = (i: Item) => !!i.parecido && i.parecido.escolhido !== -1
  /** "é outra coisa": a linha continua DESENHADA no Quase lá, com a escolha dela ali */
  const parecidos = itens.filter(emParecido)
  const receitas = itens.filter(i => !emParecido(i) && !i.jaNoSistema && i.destino === 'receita')
  const despesas = itens.filter(i => !emParecido(i) && !i.jaNoSistema && i.destino === 'despesa')
  const fora = itens.filter(i => !emParecido(i) && (i.jaNoSistema || i.destino === 'fora'))
  const confirmados = parecidos.filter(i => i.parecido!.escolhido >= 0)
  const exatosParaConciliar = itens.filter(i => i.exatos.length && !i.jaConciliada)   // a já conciliada antes não conta de novo
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
  // SEM CATEGORIA (15/10/2026, Lucas): a linha MARCADA sem categoria entra assim mesmo, como
  // "Sem categoria" — classifica-se depois (Livro-Caixa › Sem categoria) e a fatura só se quita
  // com tudo classificado. Antes ela era PULADA em silêncio: duas compras da floricultura (R$ 70)
  // sumiram da fatura do Inter de 10/10. Dividir ou repartir com outra unidade exige a categoria.
  const catOk = (i: Item) => !!i.catId || (!i.partes.length && !i.outras.length)
  const despProntas = despesas.filter(i => !i.reclassificar && i.marcado && catOk(i) && partesOk(i) && outrasOk(i) && (!conj.conjunto || !!i.dono))
  /** já lançadas sem categoria, agora com categoria escolhida: só grava a categoria nelas */
  const reclassProntas = despesas.filter(i => i.reclassificar && i.marcado && i.catId)
  const semCategoria = despProntas.filter(i => !i.catId)
  /** marcadas que NÃO podem entrar (parte sem categoria, unidade sem valor, sem dono) — barram o registro */
  const travadas = despesas.filter(i => !i.reclassificar && i.marcado && !despProntas.includes(i))
  const entreProntas = fora.filter(i => !i.jaNoSistema && i.entreConta)
  const rendProntas = fora.filter(i => !i.jaNoSistema && i.rendimento && !i.entreConta)
  /** mig 171: outra receita (com a categoria escolhida) e empréstimo dado/devolvido */
  const receitaProntas = fora.filter(i => !i.jaNoSistema && i.outraCoisa === 'outra_receita' && catsReceita.some(r => r.id === i.catId))
  const emprestimoProntas = fora.filter(i => !i.jaNoSistema && (i.outraCoisa === 'emprestimo_devolvido' || i.outraCoisa === 'emprestimo_concedido'))
  /** pagamentos de fatura que batem e ficaram marcados: viram o pagamento, já conciliado */
  const faturaProntas = fora.filter(i => !i.jaNoSistema && (i.faturaPgto?.tipo === 'bate' ? !!i.conciliarFatura : i.faturaPgto?.tipo === 'difere' && i.faturaPgto.podeParcial && !!i.parcialFatura))
  const repasseProntas = fora.filter(i => !i.jaNoSistema && (i.repassePgto?.tipo === 'bate' ? !!i.conciliarRepasse : i.repassePgto?.tipo === 'difere' && i.repassePgto.podeParcial && !!i.parcialRepasse))
  /** fatura ou repasse que não fecha e não foi marcado parcial: só o aviso, a linha fica sem conciliar */
  const faturaDifere = fora.filter(i => !i.jaNoSistema && ((i.faturaPgto?.tipo === 'difere' && !i.parcialFatura) || (i.repassePgto?.tipo === 'difere' && !i.parcialRepasse)))
  /** Pra onde o dinheiro pode ter ido: as outras contas da casa (sem maquininha e cartão). */
  const contasEntre = contas.filter(c => c.id !== contaId && c.produto !== 'maquininha' && c.tipo !== 'cartao')
  /** linhas ainda sem decisão (ou com a decisão incompleta) — o rodapé conta e o "ver qual" leva até elas */
  const pendentesL = itens.filter(i => i.casa && i.casa !== 'pgto' && estadoDe(i).tipo === 'pendente')
  const pendentes = pendentesL.length

  async function registrar() {
    if (!currentUnit?.id || !contaId) return
    if (!recProntas.length && !despProntas.length && !reclassProntas.length && !entreProntas.length && !rendProntas.length && !receitaProntas.length && !emprestimoProntas.length && !faturaProntas.length && !repasseProntas.length && !confirmados.length && !exatosParaConciliar.length) {
      return toast('Nada pronto pra registrar', 'error')
    }
    if (ehCartao && despProntas.length && !vencimento) return toast('Escolha a fatura (o vencimento) dessas compras', 'error')
    // nunca pular linha marcada em silêncio: ou entra, ou o registro para e diz qual
    if (travadas.length) return toast(`${travadas.length} ${travadas.length === 1 ? 'linha marcada não está completa' : 'linhas marcadas não estão completas'} (divisão, outra unidade ou "de quem é"). Complete ou desmarque.`, 'error')
    setSalvando(true)
    let entrouRec = 0
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const agora = new Date().toISOString()
      // A CONCILIAÇÃO de cada linha (mig 153): linha do banco ↔ registro.
      type Conc = { conta_id: string; origem: Ref['origem']; origem_id: string; data_banco: string; valor_banco: number; texto_banco: string; como: string; criado_por_nome: string | null; fitid?: string | null }
      const concs: Conc[] = []
      const conc = (i: Item, refs: Ref[], como: string) => refs.forEach(r => concs.push({
        conta_id: contaId, origem: r.origem, origem_id: r.origem_id, data_banco: i.data,
        valor_banco: i.valor, texto_banco: i.descricao, como, criado_por_nome: userName || null,
        ...(i.fitid ? { fitid: i.fitid } : {}),
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
      if (rendProntas.length) {
        // RENDIMENTO: entra na conta (vw_caixa soma; o Balanço mostra em "Rendimentos")
        const rows = rendProntas.map(i => ({
          unidade_id: currentUnit.id, tipo: 'rendimento', conta_id: contaId, conta_destino_id: null,
          data: i.data, valor: Math.abs(i.valor), descricao: i.descricao,
          criado_por_nome: userName || null,
        }))
        const { data: novos, error } = await supabase.from('fin_movimentos').insert(rows).select('id')
        if (error) throw new Error(`Rendimentos: ${error.message}${entrouRec ? ` (${entrouRec} registros JÁ entraram)` : ''}`)
        entrouRec += rows.length
        ;((novos as { id: string }[] | null) || []).forEach((m, k) => conc(rendProntas[k], [{ origem: 'movimento', origem_id: m.id }], 'novo'))
      }
      // OUTRA RECEITA (mig 171): lançamento com valor NEGATIVO (em fin_lancamentos o valor é o
      // que sai do caixa) numa conta de receita — a vw_caixa faz entrar, a DRE mostra positivo.
      if (receitaProntas.length) {
        const rows = receitaProntas.map(i => {
          const cat = categorias.find(c => c.id === i.catId)
          const cc = cat?.fin_contas
          return {
            unidade_id: (conj.conjunto && i.dono) || currentUnit.id, categoria_id: i.catId,
            conta_id: cat?.fin_conta_id || null, conta_codigo: cc?.codigo || null, conta_nome: cc?.nome || null,
            natureza: cc?.natureza || 'opex',
            descricao: null, observacoes: i.descricao,
            valor: -Math.abs(i.valor), data_competencia: i.data, data_caixa: i.data,
            fornecedor_nome: fornecedorDe(i.descricao) || null, conta_pagamento_id: contaId,
            metodo_pagamento: metodoDe(i.descricao) || 'pix', rateio_meses: 1, origem: 'manual',
            criado_por_nome: userName || null, status: 'aprovado',
            aprovado_por: user?.id || null, aprovado_por_nome: userName || null, aprovado_em: agora,
          }
        })
        const { data: novos, error } = await supabase.from('fin_lancamentos').insert(rows).select('id')
        if (error) throw new Error(`Outras receitas: ${error.message}${entrouRec ? ` (${entrouRec} registros JÁ entraram)` : ''}`)
        entrouRec += rows.length
        ;((novos as { id: string }[] | null) || []).forEach((m, k) => conc(receitaProntas[k], [{ origem: 'lancamento', origem_id: m.id }], 'novo'))
      }
      // EMPRÉSTIMO dado / devolvido (mig 171): movimento, fora da DRE
      if (emprestimoProntas.length) {
        const rows = emprestimoProntas.map(i => ({
          unidade_id: currentUnit.id, tipo: i.outraCoisa as string, conta_id: contaId, conta_destino_id: null,
          data: i.data, valor: Math.abs(i.valor), descricao: i.descricao, criado_por_nome: userName || null,
        }))
        const { data: novos, error } = await supabase.from('fin_movimentos').insert(rows).select('id')
        if (error) throw new Error(`Empréstimos: ${error.message}${entrouRec ? ` (${entrouRec} registros JÁ entraram)` : ''}`)
        entrouRec += rows.length
        ;((novos as { id: string }[] | null) || []).forEach((m, k) => conc(emprestimoProntas[k], [{ origem: 'movimento', origem_id: m.id }], 'novo'))
      }
      // PAGAMENTO DE FATURA: o banco diz a data e o valor; a fatura (cartão + vencimento) já bateu.
      for (const i of faturaProntas) {
        const f = i.faturaPgto!.fatura
        const { data: mv, error } = await supabase.from('fin_movimentos').insert({
          unidade_id: currentUnit.id, tipo: 'fatura_cartao',
          conta_id: contaId, conta_destino_id: f.cartaoId,
          data: i.data, valor: Math.abs(i.valor), fatura_vencimento: f.venc,
          descricao: `Fatura ${f.cartaoNome}${i.faturaPgto!.tipo === 'difere' ? ' (pagamento parcial)' : ''} · vence ${f.venc.slice(8, 10)}/${f.venc.slice(5, 7)}/${f.venc.slice(0, 4)}`,
          criado_por_nome: userName || null,
        }).select('id').single()
        if (error) throw new Error(`Pagamento da fatura ${f.cartaoNome}: ${error.message}${entrouRec ? ` (${entrouRec} registros JÁ entraram)` : ''}`)
        entrouRec++
        conc(i, [{ origem: 'movimento', origem_id: (mv as { id: string }).id }], 'novo')
      }
      // PAGAMENTO DE REPASSE: transferência pra Matriz com o repasse_id (mig 159); se quita, marca pago
      for (const i of repasseProntas) {
        const r = i.repassePgto!.repasse
        if (!contaMatriz) throw new Error('Nenhuma conta da Matriz para receber o repasse (aba Contas da Matriz).')
        const parte = i.repassePgto!.tipo === 'difere'
        const { data: mv, error } = await supabase.from('fin_movimentos').insert({
          unidade_id: currentUnit.id, tipo: 'transferencia',
          conta_id: contaId, conta_destino_id: contaMatriz,
          data: i.data, valor: Math.abs(i.valor), repasse_id: r.id,
          descricao: `Repasse ${rotuloRef(r.ref)}${parte ? ' (parte)' : ''} · ${currentUnit.nome}`,
          criado_por_nome: userName || null,
        }).select('id').single()
        if (error) throw new Error(`Pagamento do repasse de ${rotuloRef(r.ref)}: ${error.message}${entrouRec ? ` (${entrouRec} registros JÁ entraram)` : ''}`)
        entrouRec++
        const movId = (mv as { id: string }).id
        conc(i, [{ origem: 'movimento', origem_id: movId }], 'novo')
        if (faltaRepasse(r) - Math.abs(i.valor) < 0.005) {
          const { error: e2 } = await supabase.from('fin_repasses').update({
            status: 'pago', pago_em: `${i.data}T12:00:00-03:00`, pago_por: user?.id || null, pago_movimento_id: movId,
          }).eq('id', r.id)
          if (e2) throw new Error(`O pagamento entrou, mas o repasse não foi marcado como pago: ${e2.message}`)
        }
      }
      for (const i of reclassProntas) {
        const cat = categorias.find(c => c.id === i.catId)
        const cc = cat?.fin_contas
        const { error } = await supabase.from('fin_lancamentos').update({
          categoria_id: i.catId, conta_id: cat?.fin_conta_id || null,
          conta_codigo: cc?.codigo || null, conta_nome: cc?.nome || null, natureza: cc?.natureza || 'opex',
        }).eq('id', i.reclassificar!).is('categoria_id', null)
        if (error) throw new Error(`Classificar "${i.descricao}": ${error.message}`)
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
          const fixa = !i.estorno && i.catId ? contaFixaDe(i.catId, i.partes.length ? restanteDe(i) : Math.abs(i.valor)) : null
          return pedacos.map((pd, k) => {
            const cat = categorias.find(c => c.id === pd.catId)
            const cc = cat?.fin_contas
            donos.push(i)
            return {
              ...(fixa && k === 0 ? { conta_fixa_id: fixa.id } : {}),
              unidade_id: (conj.conjunto && i.dono) || currentUnit.id, categoria_id: pd.catId || null,
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
        let { error } = await supabase.from('fin_conciliacoes')
          .upsert(concs, { onConflict: 'conta_id,origem,origem_id', ignoreDuplicates: true })
        // Sem a mig 158 a coluna `fitid` não existe: grava sem ela.
        if (error && /fitid/i.test(error.message)) {
          ({ error } = await supabase.from('fin_conciliacoes')
            .upsert(concs.map(c => { const sem = { ...c }; delete sem.fitid; return sem }), { onConflict: 'conta_id,origem,origem_id', ignoreDuplicates: true }))
        }
        if (error) toast(`Registrado, mas a conciliação não foi gravada: ${error.message}`, 'error')
        // O que estava "conferido à mão no calendário" ganha agora a linha do banco de verdade
        // (o upsert acima ignora a linha que já existe).
        else {
          const ids = [...new Set(concs.map(c => c.origem_id))]
          for (let k = 0; k < ids.length; k += 150) {
            const { data: mao } = await supabase.from('fin_conciliacoes').select('origem, origem_id')
              .eq('conta_id', contaId).is('fitid', null).like('texto_banco', `${CONFERIDO_A_MAO}%`).in('origem_id', ids.slice(k, k + 150))
            for (const m of (mao as { origem: string; origem_id: string }[] | null) || []) {
              const c = concs.find(x => x.origem === m.origem && x.origem_id === m.origem_id)
              if (!c) continue
              await supabase.from('fin_conciliacoes').update({
                data_banco: c.data_banco, valor_banco: c.valor_banco, texto_banco: c.texto_banco, como: c.como,
                ...(c.fitid ? { fitid: c.fitid } : {}),
              }).eq('conta_id', contaId).eq('origem', m.origem).eq('origem_id', m.origem_id)
            }
          }
        }
      }
      // A LINHA DO BANCO SEM PAR (mig 171, regra do Lucas: "tudo tem que bater com o saldo do
      // banco"): o que não virou registro nem conciliação fica guardado no A conferir — menos
      // fatura e repasse (módulo próprio) e o par saída+estorno do mesmo dia (se anulam).
      {
        const sobra = linhasSemPar
        if (sobra.length) {
          const ds = sobra.map(i => i.data).sort()
          // paginado: o PostgREST corta em 1000 — uma que escapasse quebraria o insert no índice único (Ouro)
          type PE = { fitid: string | null; data_banco: string; valor_banco: number; texto_banco: string | null }
          const existentes: PE[] = []
          for (let off = 0; ; off += 1000) {
            const { data: ja } = await supabase.from('fin_extrato_pendentes')
              .select('fitid, data_banco, valor_banco, texto_banco').eq('conta_id', contaId)
              .gte('data_banco', ds[0]).lte('data_banco', ds[ds.length - 1]).order('id').range(off, off + 999)
            const pg = (ja as PE[] | null) || []
            existentes.push(...pg)
            if (pg.length < 1000) break
          }
          const mesma = (i: Item) => existentes.some(e => e.data_banco === i.data && Math.abs(Number(e.valor_banco) - i.valor) < 0.005
            && (i.fitid && e.fitid ? e.fitid === i.fitid : (e.texto_banco || '') === i.descricao))
          const motivo = (i: Item) => i.outraCoisa === 'fora' ? 'deixada_de_fora' : i.outraCoisa === 'contrato' ? 'pagamento_de_contrato'
            : (i.destino === 'despesa' || i.destino === 'receita') ? 'desmarcada' : null
          const novas = sobra.filter(i => !mesma(i)).map(i => ({
            conta_id: contaId, data_banco: i.data, valor_banco: i.valor, texto_banco: i.descricao,
            fitid: i.fitid || null, motivo: motivo(i), criado_por_nome: userName || null,
          }))
          if (novas.length) {
            const { error } = await supabase.from('fin_extrato_pendentes').insert(novas)
            if (error) toast(`Registrado, mas as ${novas.length} linhas sem par não foram guardadas: ${error.message}`, 'error')
          }
        }
      }
      toast(`${recProntas.length} receitas a prazo · ${entreProntas.length} entre contas · ${despProntas.length} despesas${rendProntas.length ? ` · ${rendProntas.length} ${rendProntas.length === 1 ? 'rendimento' : 'rendimentos'}` : ''}${reclassProntas.length ? ` · ${reclassProntas.length} classificadas` : ''}${faturaProntas.length ? ` · ${faturaProntas.length} ${faturaProntas.length === 1 ? 'fatura paga' : 'faturas pagas'}` : ''}${repasseProntas.length ? ` · ${repasseProntas.length} ${repasseProntas.length === 1 ? 'repasse pago' : 'repasses pagos'}` : ''}${receitaProntas.length ? ` · ${receitaProntas.length} ${receitaProntas.length === 1 ? 'outra receita' : 'outras receitas'}` : ''}${emprestimoProntas.length ? ` · ${emprestimoProntas.length} ${emprestimoProntas.length === 1 ? 'empréstimo' : 'empréstimos'}` : ''} · ${concs.length} conciliados`, 'success')
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

  // ══ O PADRÃO ÚNICO DE LINHA (16/10/2026 — revisão de um leigo e de uma especialista em finanças,
  // aprovada pelo Lucas). Fechada: bolinha de estado · data · texto do banco · ETIQUETA da decisão
  // (✕ desfaz) · valor. Aberta: linha + painel num bloco só; o painel nunca repete data/texto/valor
  // e fecha no "Pronto" ou clicando de novo na linha. A linha nunca muda de seção (Item.casa).

  /** O que a linha É agora — null = ninguém decidiu. */
  function escolhaDe(i: Item): OutraCoisa | null {
    if (i.outraCoisa) return i.outraCoisa
    if (i.destino === 'despesa' && i.marcado) return 'despesa'
    if (i.destino === 'receita' && i.marcado) return 'receita'
    if (i.destino === 'fora' && i.rendimento) return 'rendimento'
    if (i.destino === 'fora' && i.entreConta) return 'entre'
    return null
  }

  /** `fixo`: a linha já está no sistema (só falta a categoria) — sem ✕ e sem "O que é?" (mudar o tipo duplicaria) */
  type Estado = { tipo: 'pendente' | 'feito' | 'fora'; texto: string; falta?: string; fixo?: boolean }
  function estadoDe(i: Item): Estado {
    const p = i.parecido
    if (i.casa === 'quase' && p) {
      if (p.escolhido >= 0) return { tipo: 'feito', texto: `É ${p.candidatos[p.escolhido].rotulo}` }
      if (p.escolhido === -2) return { tipo: 'pendente', texto: 'Confirme', falta: 'é o lançamento do sistema?' }
    }
    const folha = (id: string) => caminhoDe(id).split(' › ').pop() || ''
    if (i.reclassificar) return { tipo: 'feito', texto: `Já no sistema · ${i.catId ? folha(i.catId) : 'sem categoria'}`, fixo: true }
    // saída e estorno do mesmo dia se anulam: já resolvida, nada a decidir (achado da Ouro)
    if (!i.outraCoisa && (i.motivoFora || '').startsWith('estornado')) return { tipo: 'fora', texto: 'Estornada no mesmo dia', fixo: true }
    switch (escolhaDe(i)) {
      case 'despesa': {
        const base = `${i.estorno ? 'Estorno' : 'Despesa'} · ${i.catId ? folha(i.catId) : 'sem categoria'}`
        const extra = [i.partes.length ? `dividida em ${i.partes.length + 1}` : '', i.meses > 1 ? `${i.meses} meses` : '', i.outras.length ? 'com outra unidade' : ''].filter(Boolean)
        const falta = travadas.includes(i) ? (conj.conjunto && !i.dono ? 'de quem é?' : 'complete os detalhes') : undefined
        return { tipo: falta ? 'pendente' : 'feito', texto: [base, ...extra].join(' · '), falta }
      }
      case 'receita': {
        const maq = maquininhas.find(m => m.id === (i.opId || maquininhaLote))?.nome
        if (!maq || !i.mov) return { tipo: 'pendente', texto: 'Maquininha', falta: !maq ? 'qual maquininha?' : 'o que ela fez?' }
        return { tipo: 'feito', texto: `Maquininha · ${maq} · ${ROTULO_MOV[i.mov].toLowerCase()}` }
      }
      case 'entre': {
        const c = contasEntre.find(x => x.id === i.entreConta)
        return c ? { tipo: 'feito', texto: `Transferência ${i.valor < 0 ? 'para' : 'de'} ${c.nome}` }
                 : { tipo: 'pendente', texto: 'Transferência', falta: 'qual conta?' }
      }
      case 'rendimento': return { tipo: 'feito', texto: 'Rendimento da conta' }
      case 'outra_receita': return catsReceita.some(r => r.id === i.catId)
        ? { tipo: 'feito', texto: `Outra receita · ${folha(i.catId)}` } : { tipo: 'pendente', texto: 'Outra receita', falta: 'qual?' }
      case 'emprestimo_concedido': return { tipo: 'feito', texto: 'Empréstimo concedido' }
      case 'emprestimo_devolvido': return { tipo: 'feito', texto: 'Devolução de empréstimo' }
      case 'contrato': return { tipo: 'fora', texto: 'Pagamento de contrato — lançar no contrato' }
      case 'fora': return { tipo: 'fora', texto: 'Deixada de fora' }
      default: return { tipo: 'pendente', texto: 'O que é?' }
    }
  }

  /** As opções do "O que é?" — as mesmas em toda a tela, sempre na mesma ordem. */
  function opcoesDe(i: Item): { v: OutraCoisa; t: string }[] {
    const entrada = i.valor > 0
    if (ehCartao) return [{ v: 'despesa', t: entrada ? 'Estorno de compra' : 'Compra / despesa' }, { v: 'fora', t: 'Deixar de fora' }]
    return entrada
      ? [{ v: 'contrato', t: 'Pagamento de contrato' },
         ...(permiteReceitas ? [{ v: 'receita' as const, t: 'Recebimento da maquininha' }] : []),
         ...(catsReceita.length ? [{ v: 'outra_receita' as const, t: 'Outra receita' }] : []),
         { v: 'emprestimo_devolvido', t: 'Devolução de empréstimo' },
         { v: 'entre', t: 'Transferência entre contas' },
         { v: 'rendimento', t: 'Rendimento da conta' },
         { v: 'fora', t: 'Deixar de fora' }]
      : [{ v: 'despesa', t: 'Despesa' },
         ...(permiteReceitas && maquininhas.length ? [{ v: 'receita' as const, t: 'Taxa ou estorno da maquininha' }] : []),
         { v: 'emprestimo_concedido', t: 'Empréstimo concedido' },
         { v: 'entre', t: 'Transferência entre contas' },
         { v: 'fora', t: 'Deixar de fora' }]
  }

  /** Escolher uma opção do "O que é?". Nada muda de seção: só a decisão da linha. */
  function definir(i: Item, o: OutraCoisa) {
    const entrada = i.valor > 0
    const catDeReceita = catsReceita.some(r => r.id === i.catId)
    const base: Partial<Item> = {
      outraCoisa: o, rendimento: false, entreConta: o === 'entre' ? i.entreConta : '', motivoFora: null,
      ...(i.casa === 'quase' && i.parecido ? { parecido: { ...i.parecido, escolhido: -1 } } : {}),
    }
    if (o === 'despesa') muda(i.n, { ...base, destino: 'despesa', marcado: true, catId: catDeReceita ? '' : i.catId, ...(ehCartao ? { estorno: entrada } : {}) })
    else if (o === 'receita') muda(i.n, { ...base, destino: 'receita', marcado: true, mov: i.mov || (movimentoDe(i.descricao, i.valor) || '') })
    else if (o === 'rendimento') muda(i.n, { ...base, destino: 'fora', marcado: false, rendimento: true })
    else if (o === 'outra_receita') muda(i.n, { ...base, destino: 'fora', marcado: false, catId: catsReceita.length === 1 ? catsReceita[0].id : (catDeReceita ? i.catId : '') })
    else if (o === 'contrato') muda(i.n, { ...base, destino: 'fora', marcado: false, motivoFora: 'pagamento de contrato' })
    else if (o === 'fora') muda(i.n, { ...base, destino: 'fora', marcado: false, motivoFora: 'deixada de fora por você' })
    else muda(i.n, { ...base, destino: 'fora', marcado: false })   // transferência, empréstimos
  }

  /** O ✕ da etiqueta: volta a linha a "O que é?" (no Quase lá, a "Confirme"). */
  function desfazer(i: Item) {
    const p = i.parecido
    if (i.casa === 'quase' && p && p.escolhido >= 0) muda(i.n, { parecido: { ...p, escolhido: -2 } })
    else muda(i.n, { outraCoisa: undefined, destino: 'fora', marcado: false, rendimento: false, entreConta: '', entreHist: false, motivoFora: null })
    setLinhaAberta(i.n)
  }

  /** A linha — fechada mostra a decisão; clicar abre o painel embaixo, no mesmo bloco. */
  function linha(i: Item) {
    const est = estadoDe(i)
    const aberta = linhaAberta === i.n
    const alternar = () => setLinhaAberta(a => (a === i.n ? null : i.n))
    const corBolinha = est.tipo === 'pendente' ? 'bg-amber-500' : est.tipo === 'feito' ? 'bg-emerald-500' : 'bg-[var(--surface-300)]'
    const corBorda = est.tipo === 'pendente' ? 'border-amber-500' : est.tipo === 'feito' ? 'border-emerald-500' : 'border-[var(--surface-300)]'
    const etiqueta = est.tipo === 'pendente' ? (
      <span className="inline-flex items-center gap-1 max-w-full px-2.5 py-0.5 rounded-full border border-amber-500/60 bg-amber-500/10 text-[12px] font-medium text-amber-500">
        <span className="truncate">{est.texto === 'O que é?' ? 'O que é?' : `${est.texto}${est.falta ? ` · ${est.falta}` : ''}`}</span>
        <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${aberta ? 'rotate-90' : ''}`} />
      </span>
    ) : (
      <span className={`inline-flex items-center gap-1 max-w-full pl-2.5 pr-1 py-0.5 rounded-full text-[12px] font-medium ${est.tipo === 'feito' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-[var(--surface-200)] text-[var(--surface-600)]'}`}>
        <span className="truncate">{est.texto}</span>
        {!est.fixo && <button type="button" title="Desfazer esta escolha" aria-label="Desfazer esta escolha"
                onClick={e => { e.stopPropagation(); desfazer(i) }}
                className="shrink-0 rounded-full p-0.5 hover:bg-black/10"><X className="h-3 w-3" /></button>}
      </span>
    )
    return (
      <div key={i.n} data-linha={i.n}
           className={`border-l-[3px] px-3 py-2 ${aberta ? `${corBorda} bg-[var(--surface-0)] shadow-sm rounded-r-[10px] my-1` : 'border-transparent'}`}>
        <div role="button" tabIndex={0} onClick={alternar}
             onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar() } }}
             className="grid grid-cols-[8px_42px_minmax(0,1fr)_auto] sm:grid-cols-[8px_46px_minmax(0,1fr)_minmax(0,300px)_104px_14px] gap-x-3 gap-y-1 items-center cursor-pointer">
          <span className={`h-2 w-2 rounded-full ${corBolinha}`} aria-hidden="true" />
          <span className="text-xs text-[var(--surface-400)] tabular-nums">{dataCurta(i.data)}</span>
          <span className="text-sm text-[var(--surface-700)] truncate" title={i.original}>{i.descricao}</span>
          <span className="row-start-2 col-start-3 col-span-2 sm:row-start-auto sm:col-start-auto sm:col-span-1 min-w-0 flex sm:justify-end">{etiqueta}</span>
          <span className={`row-start-1 col-start-4 sm:row-start-auto sm:col-start-auto text-right text-mono text-sm tabular-nums ${valorCor(i.valor)}`}>{valorTxt(i.valor)}</span>
          <ChevronRight className={`hidden sm:block h-3.5 w-3.5 text-[var(--surface-400)] transition-transform ${aberta ? 'rotate-90' : ''}`} />
        </div>
        {aberta && <div className="mt-2.5 pl-[22px] sm:pl-[66px]">{painelDecisao(i)}</div>}
      </div>
    )
  }

  /** O painel da linha aberta: (Quase lá: o par sugerido) · "O que é?" · o que falta · Pronto. */
  function painelDecisao(i: Item) {
    const p = i.parecido
    const quase = i.casa === 'quase' && !!p
    const escolha = escolhaDe(i)
    const mostraMenu = !i.reclassificar && !estadoDe(i).fixo && (!quase || p!.escolhido === -1)
    const escolherPar = (k: number) => muda(i.n, k === -1
      ? { parecido: { ...p!, escolhido: -1 }, outraCoisa: undefined, destino: 'fora', marcado: false, rendimento: false, entreConta: '', motivoFora: null }
      : { parecido: { ...p!, escolhido: k }, outraCoisa: undefined })
    return (
      <div className="flex flex-col gap-3">
        {quase && p && (
          <div className="flex flex-col gap-1.5">
            {p.candidatos.map((c, k) => {
              const outra = itens.some(x => x.n !== i.n && x.parecido && x.parecido.escolhido >= 0 && x.parecido.candidatos[x.parecido.escolhido].chave === c.chave)
              const ajusta = c.ajustavel && (Math.abs(c.valor - i.valor) >= 0.005 || c.data !== i.data)
              return (
                <label key={c.chave} className={`flex flex-wrap items-center gap-x-2 text-sm ${outra ? 'opacity-40' : 'cursor-pointer'}`}>
                  <input type="radio" name={`par-${i.n}`} checked={p.escolhido === k} disabled={outra} onChange={() => escolherPar(k)} className="accent-[var(--brand-500)]" />
                  <span className="text-[var(--surface-700)]">Sim, é <strong className="font-semibold">{c.rotulo}</strong></span>
                  <span className="text-xs text-[var(--surface-500)]">lançado em {fmtData(c.data)} · {fmtBRL(Math.abs(c.valor))}</span>
                  {ajusta && <span className="text-xs text-[var(--surface-500)]">(o lançamento passa a ter a data e o valor do banco)</span>}
                  {outra && <span className="text-xs text-[var(--surface-400)]">(já escolhido em outra linha)</span>}
                </label>
              )
            })}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name={`par-${i.n}`} checked={p.escolhido === -1} onChange={() => escolherPar(-1)} className="accent-[var(--brand-500)]" />
              <span className="text-[var(--surface-700)]">Não, é outra coisa</span>
            </label>
          </div>
        )}
        {mostraMenu && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--surface-500)]">{quase ? 'Então o que é?' : 'O que é?'}</span>
            <div className="flex flex-wrap gap-1.5">
              {opcoesDe(i).map(o => (
                <button key={o.v} type="button" onClick={() => definir(i, o.v)}
                        className={`px-3 py-1 rounded-full border text-xs ${escolha === o.v ? 'border-[var(--brand-500)] bg-[var(--brand-500)] text-white font-medium' : 'border-[var(--surface-300)] text-[var(--surface-700)] hover:border-[var(--brand-500)]'}`}>
                  {o.t}
                </button>
              ))}
            </div>
          </div>
        )}
        {i.reclassificar ? painelDespesa(i) : mostraMenu && completar(i, escolha)}
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => setLinhaAberta(null)} className="btn-secondary text-xs py-1 px-4">Pronto</button>
        </div>
      </div>
    )
  }

  /** O que cada escolha ainda pede — sem repetir a linha do banco. */
  function completar(i: Item, escolha: OutraCoisa | null) {
    const frase = (t: ReactNode, cor = 'text-[var(--surface-500)]') => <span className={`text-xs leading-snug ${cor}`}>{t}</span>
    switch (escolha) {
      case 'despesa': return painelDespesa(i)
      case 'receita': return (
        <div className="flex flex-wrap items-end gap-3">
          {maquininhas.length > 1 && (
            <label className="flex flex-col gap-1 text-xs text-[var(--surface-500)]">
              Maquininha
              <select value={i.opId || maquininhaLote} onChange={e => muda(i.n, { opId: e.target.value })} className="input text-sm py-1 w-auto max-w-[320px]">
                <option value="">escolher…</option>
                {maquininhas.map(m => <option key={m.id} value={m.id}>{rotuloConta(cores, m.id, m.nome)}</option>)}
              </select>
            </label>
          )}
          {maquininhas.length === 0 && frase('Nenhuma maquininha cadastrada — cadastre em Configurações de Contas.', 'text-amber-500')}
          <label className="flex flex-col gap-1 text-xs text-[var(--surface-500)]">
            O que a maquininha fez
            <select value={i.mov} onChange={e => muda(i.n, { mov: e.target.value as MovMaquininha })} className="input text-sm py-1 w-auto max-w-[320px]">
              <option value="">escolher…</option>
              {(Object.keys(ROTULO_MOV) as MovMaquininha[]).filter(m => ENTRA_MOV[m] === (i.valor > 0))
                .map(m => <option key={m} value={m}>{ROTULO_MOV[m]}</option>)}
            </select>
          </label>
          {i.mov === 'antecipacao' && frase('Registre o valor que caiu. O custo da antecipação é despesa (Financeiro › Encargos).', 'text-amber-500')}
        </div>
      )
      case 'entre': return (
        <label className="flex flex-wrap items-center gap-2 text-xs text-[var(--surface-500)]">
          {i.valor < 0 ? 'Foi para a conta' : 'Veio da conta'}
          <select value={i.entreConta} onChange={e => muda(i.n, { entreConta: e.target.value, entreHist: false, outraCoisa: 'entre' })}
                  className="input text-sm py-1 w-auto max-w-[320px]">
            <option value="">escolher…</option>
            {contasEntre.map(c => <option key={c.id} value={c.id}>{rotuloConta(cores, c.id, c.nome)}</option>)}
          </select>
          {i.entreConta && i.entreHist && <span className="text-[var(--surface-400)]">como das outras vezes</span>}
        </label>
      )
      case 'outra_receita': return (
        <label className="flex flex-wrap items-center gap-2 text-xs text-[var(--surface-500)]">
          Qual receita
          <select value={catsReceita.some(r => r.id === i.catId) ? i.catId : ''} onChange={e => muda(i.n, { catId: e.target.value })} className="input text-sm py-1 w-auto max-w-[320px]">
            <option value="">escolher…</option>
            {catsReceita.map(r => <option key={r.id} value={r.id}>{caminhoDe(r.id).split(' › ').slice(1).join(' › ') || caminhoDe(r.id)}</option>)}
          </select>
          <span>Entra no caixa e aparece na DRE em Outras receitas.</span>
        </label>
      )
      case 'rendimento': return frase('Entra no caixa e aparece na DRE como Receitas financeiras.')
      case 'emprestimo_devolvido': return frase('Entra no caixa como devolução de um empréstimo que a unidade deu. Não é receita: não vai para a DRE.')
      case 'emprestimo_concedido': return frase('Sai do caixa como empréstimo da unidade a alguém. Não é despesa: não vai para a DRE.')
      case 'contrato': return frase('Nada é registrado agora. Lance o pagamento no contrato do pet e envie este arquivo de novo: a linha encontra o pagamento sozinha. Até lá, ela fica no A conferir.')
      case 'fora': return frase(ehCartao ? 'Esta linha não entra na fatura.' : 'Nada é registrado. A linha fica no A conferir até alguém resolver ou descartar.')
      default: return null
    }
  }

  /** Despesa: categoria, de quem é (caixa conjunto), para quem / forma, e os três detalhes. */
  function painelDespesa(i: Item) {
    const achados = !i.catId && i.catTexto.trim().length >= 2 ? buscarCategorias(folhas, caminhoDe, i.catTexto, 6) : []
    const sugeridas = i.sugestoes.filter(sg => sg.decisao.tipo === 'despesa')
    const fx = i.catId && !i.estorno ? contaFixaDe(i.catId, i.partes.length ? restanteDe(i) : Math.abs(i.valor)) : null
    const caixinha = (rotulo: string, marcado: boolean, onChange: (v: boolean) => void, desab = false) => (
      <label className={`flex items-center gap-1.5 text-xs ${desab ? 'opacity-40' : 'cursor-pointer text-[var(--surface-700)]'}`}>
        <input type="checkbox" checked={marcado} disabled={desab} onChange={e => onChange(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--brand-500)]" />
        {rotulo}
      </label>
    )
    return (
      <div className="flex flex-col gap-3">
        {i.reclassificar && <span className="text-xs text-[var(--surface-500)]">Esta saída já está no sistema, sem categoria. Escolha do que foi — o valor não muda.</span>}
        {conj.conjunto && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--surface-500)]">
            De quem é
            {conj.irmas.map(u => (
              <button key={u.id} type="button" onClick={() => muda(i.n, { dono: u.id })}
                      className={`px-2.5 py-0.5 rounded-full border text-xs ${i.dono === u.id ? 'border-[var(--brand-500)] bg-[var(--brand-500)] text-white' : 'border-[var(--surface-300)] text-[var(--surface-700)]'}`}>{u.nome}</button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--surface-500)]">Do que foi</span>
          {i.catId ? (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-[var(--surface-800)]">{caminhoDe(i.catId)}</span>
              {fx && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400" title="Conta de acompanhamento — o calendário marca como paga">📌 {fx.nome}</span>}
              {(i.estornoDe || i.doHistorico) && <span className="text-xs text-[var(--surface-400)]">{i.estornoDe || 'como das outras vezes'}</span>}
              <button type="button" onClick={() => muda(i.n, { catId: '', catTexto: '', doHistorico: false, porSinonimo: false })}
                      className="text-xs text-[var(--brand-500)] hover:underline">trocar</button>
            </span>
          ) : (<>
            <input value={i.catTexto} autoComplete="off"
                   onChange={e => muda(i.n, { catTexto: e.target.value, catId: '', doHistorico: false, porSinonimo: false })}
                   aria-label="Do que foi esta despesa" placeholder="Digite: aluguel, gasolina, gesso…"
                   className="input text-sm py-1 w-full max-w-[420px]" />
            {(sugeridas.length > 0 || i.palpite) && !i.catTexto && (
              <div className="flex flex-wrap gap-1.5">
                {i.palpite && !sugeridas.some(sg => sg.decisao.tipo === 'despesa' && (sg.decisao as { catId: string }).catId === i.palpite) && (
                  <button type="button" onClick={() => muda(i.n, { catId: i.palpite, catTexto: '', porSinonimo: true })}
                          className="text-xs px-2.5 py-1 rounded-full border border-dashed border-amber-500/60 text-amber-500 hover:bg-amber-500/10"
                          title="Palpite pelo nome — não há histórico parecido. Confira antes de escolher">
                    talvez {caminhoDe(i.palpite).split(' › ').pop()}?
                  </button>
                )}
                {sugeridas.map(sg => (
                  <button key={sg.chave} type="button"
                          onClick={() => muda(i.n, { catId: (sg.decisao as { catId: string }).catId, catTexto: '', porSinonimo: false })}
                          className="text-xs px-2.5 py-1 rounded-full border border-[var(--surface-300)] text-[var(--surface-700)] hover:border-emerald-500 hover:text-emerald-500"
                          title={`Usada ${sg.vezes}× em linhas parecidas`}>
                    {caminhoDe((sg.decisao as { catId: string }).catId).split(' › ').pop()}
                  </button>
                ))}
              </div>
            )}
            {achados.length > 0 && (
              <div className="rounded-[var(--radius-md)] border border-[var(--surface-200)] divide-y divide-[var(--surface-100)] max-w-[520px]">
                {achados.map(({ c, termoBatido, forte }) => (
                  <button key={c.id} type="button" onClick={() => muda(i.n, { catId: c.id, catTexto: '', porSinonimo: false })}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--surface-50)] flex items-center gap-2">
                    <span className="flex-1 truncate text-[var(--surface-700)]">{caminhoDe(c.id)}</span>
                    {!forte && termoBatido && <span className="text-[11px] text-[var(--surface-400)] shrink-0">“{termoBatido}”</span>}
                  </button>
                ))}
              </div>
            )}
            {i.catTexto.trim().length >= 2 && !achados.length && <span className="text-xs text-amber-500">nenhuma categoria com “{i.catTexto.trim()}”</span>}
            {!i.catTexto && <span className="text-xs text-[var(--surface-400)]">Sem categoria também pode registrar — dá pra classificar depois.</span>}
          </>)}
        </div>
        {!i.reclassificar && <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-[var(--surface-500)]">
            Para quem
            <input value={i.fornecedor} onChange={e => muda(i.n, { fornecedor: e.target.value })} className="input text-sm py-1 w-56" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--surface-500)]">
            Forma de pagamento
            {ehCartao ? <span className="text-sm text-[var(--surface-600)] py-1">cartão de crédito</span> : (
              <select value={i.metodo} onChange={e => muda(i.n, { metodo: e.target.value })} className="input text-sm py-1">
                {METODOS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
            )}
          </label>
        </div>}
        {!i.estorno && !i.reclassificar && (
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {caixinha('Dividir em mais de uma categoria', i.partes.length > 0,
              v => muda(i.n, { partes: v ? [{ key: crypto.randomUUID(), catId: '', catTexto: '', valor: '' }] : [] }), i.outras.length > 0)}
            {unidades.length > 0 && caixinha('Parte é de outra unidade', i.outras.length > 0,
              v => muda(i.n, { outras: v ? [{ key: crypto.randomUUID(), unidadeId: '', valor: '', modo: 'repasse', repasseId: '' }] : [] }), i.partes.length > 0)}
            {caixinha('Vale por vários meses', i.meses > 1, v => muda(i.n, { meses: v ? 12 : 1 }))}
          </div>
        )}
        {i.partes.length > 0 && painelDividir(i)}
        {i.outras.length > 0 && painelOutras(i)}
        {i.meses > 1 && (
          <div className="pl-3 border-l-2 border-[var(--brand-500)]/50 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--surface-700)]">
              Vale por
              <input type="number" min={2} max={120} value={i.meses}
                     onChange={e => muda(i.n, { meses: Math.max(1, Math.min(120, Number(e.target.value) || 1)) })}
                     className="input text-sm py-1 w-20 text-mono" />
              meses
            </label>
            <span className="text-sm text-[var(--surface-500)]">{fmtBRL(Math.abs(i.valor) / i.meses)} por mês, de {mesMais(i.data, 0)} a {mesMais(i.data, i.meses - 1)}</span>
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
      <div className="pl-3 border-l-2 border-[var(--brand-500)]/50 flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[var(--surface-800)]">Dividir os {fmtBRL(total)}</span>
          <button type="button" onClick={() => muda(i.n, { partes: [] })}
                  className="ml-auto text-[11px] text-[var(--surface-400)] hover:text-[var(--surface-700)]">desfazer divisão</button>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_120px_22px] gap-2 items-center">
          <span className="text-sm text-[var(--surface-600)] truncate px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--surface-50)]">
            {i.catId ? caminhoDe(i.catId) : <span className="text-amber-500">escolha &ldquo;Do que foi&rdquo; (acima)</span>}
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
      <div className="pl-3 border-l-2 border-[var(--brand-500)]/50 flex flex-col gap-2.5">
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
    // desde o redesenho (16/10/2026) só desenha PAGAMENTO DE FATURA E REPASSE — o resto usa `linha()`
    void quit
    const rend = false
    return (
      <div key={i.n} className="py-2.5 border-b border-[var(--surface-100)] last:border-0">
      <div className={grade}>
        <span className={`text-xs ${i.entreConta ? 'text-[var(--brand-500)]' : rend ? 'text-emerald-500' : 'text-[var(--surface-400)]'}`} aria-hidden="true">{i.entreConta ? '⇄' : rend ? '+' : '—'}</span>
        <span className="text-xs text-[var(--surface-400)]">{dataCurta(i.data)}</span>
        <span className="text-sm text-[var(--surface-500)] truncate" title={i.original}>{i.descricao}</span>
        <span className="col-span-4 col-start-3 sm:col-span-1 sm:col-start-auto row-start-2 sm:row-start-auto flex flex-wrap items-center gap-2 min-w-0">
          {rend ? (
            <>
              <span className="text-xs text-emerald-500">rendimento da conta → entra como <b>Rendimento</b></span>
              <button type="button" onClick={() => muda(i.n, { rendimento: false, motivoFora: 'entrada que não é de maquininha nem está no sistema — confira' })}
                      className="text-[11px] text-[var(--brand-500)] hover:underline">não é rendimento</button>
            </>
          ) : !i.entreConta && !i.outraCoisa && !i.faturaPgto && !i.repassePgto && <span className="text-xs text-[var(--surface-400)]">{i.motivoFora || 'ignorada'}</span>}
          {i.faturaPgto?.tipo === 'bate' && (
            <label className="flex items-center gap-1.5 text-xs text-[var(--surface-700)] cursor-pointer">
              <input type="checkbox" checked={!!i.conciliarFatura} onChange={e => muda(i.n, { conciliarFatura: e.target.checked })} />
              <span>É a fatura <b>{i.faturaPgto.fatura.cartaoNome}</b> de {dataCurta(i.faturaPgto.fatura.venc)} · <span className="text-mono">{fmtBRL(Math.abs(i.valor))}</span> → <span className="text-emerald-500 font-medium">© conciliar</span></span>
            </label>
          )}
          {i.faturaPgto?.tipo === 'difere' && (
            <span className="block w-full text-[11.5px] leading-snug text-amber-500">⚠ {i.faturaPgto.aviso}</span>
          )}
          {i.faturaPgto?.tipo === 'difere' && i.faturaPgto.podeParcial && (
            <label className="flex items-center gap-1.5 text-xs text-[var(--surface-700)] cursor-pointer">
              <input type="checkbox" checked={!!i.parcialFatura} onChange={e => muda(i.n, { parcialFatura: e.target.checked })} />
              <span>Foi pagamento parcial da fatura <b>{i.faturaPgto.fatura.cartaoNome}</b> de {dataCurta(i.faturaPgto.fatura.venc)}: o resto vai para a próxima → <span className="text-emerald-500 font-medium">© conciliar</span></span>
            </label>
          )}
          {i.repassePgto?.tipo === 'bate' && (
            <label className="flex items-center gap-1.5 text-xs text-[var(--surface-700)] cursor-pointer">
              <input type="checkbox" checked={!!i.conciliarRepasse} onChange={e => muda(i.n, { conciliarRepasse: e.target.checked })} />
              <span>É o <b>repasse de {rotuloRef(i.repassePgto.repasse.ref)}</b> · <span className="text-mono">{fmtBRL(Math.abs(i.valor))}</span> → <span className="text-emerald-500 font-medium">© conciliar</span></span>
            </label>
          )}
          {i.repassePgto?.tipo === 'difere' && (
            <span className="block w-full text-[11.5px] leading-snug text-amber-500">⚠ {i.repassePgto.aviso}</span>
          )}
          {i.repassePgto?.tipo === 'difere' && i.repassePgto.podeParcial && (
            <label className="flex items-center gap-1.5 text-xs text-[var(--surface-700)] cursor-pointer">
              <input type="checkbox" checked={!!i.parcialRepasse} onChange={e => muda(i.n, { parcialRepasse: e.target.checked })} />
              <span>Foi uma parte do <b>repasse de {rotuloRef(i.repassePgto.repasse.ref)}</b>: o resto continua em aberto → <span className="text-emerald-500 font-medium">© conciliar</span></span>
            </label>
          )}
        </span>
        <span className={`text-right text-mono text-sm tabular-nums ${i.entreConta || rend || i.outraCoisa ? valorCor(i.valor) : 'text-[var(--surface-400)]'}`}>{valorTxt(i.valor)}</span>
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
  /** caixa das linhas de decisão (o padrão único): a linha aberta tem fundo e borda próprios */
  const caixaDecisao = (filhos: ReactNode) => (
    <div className="rounded-[14px] bg-[var(--surface-50)] p-1.5 divide-y divide-[var(--surface-100)]">{filhos}</div>
  )
  /** "3 de 15 decididas" no cabeçalho */
  const andamento = (xs: Item[]) => {
    const d = decididas(xs)
    return <span className={`text-xs ${d === xs.length ? 'text-emerald-500' : 'text-[var(--surface-500)]'}`}>{d === xs.length ? '✓ tudo decidido' : `${d} de ${xs.length} decididas`}</span>
  }
  /** botão de abrir/fechar seção resolvida (seta, não "ver quais/esconder") */
  const abreFecha = (aberto: boolean, alternar: () => void) => (
    <button type="button" onClick={alternar} className="ml-auto inline-flex items-center gap-1 text-sm text-[var(--brand-500)] hover:underline">
      {aberto ? 'fechar' : 'ver'} <ChevronRight className={`h-3.5 w-3.5 transition-transform ${aberto ? 'rotate-90' : ''}`} />
    </button>
  )

  // ── o placar: banco × sistema × depois de registrar (conta corrente) ──
  const depois = placar
    ? Math.round((placar.sistema
        + [...recProntas, ...despProntas, ...entreProntas, ...rendProntas, ...receitaProntas, ...emprestimoProntas, ...faturaProntas, ...repasseProntas].reduce((a, i) => a + i.valor, 0)
        + confirmados.reduce((a, i) => {
            const r = i.parecido!.candidatos[i.parecido!.escolhido]
            return a + (r.ajustavel ? i.valor - r.valor : 0)
          }, 0)) * 100) / 100
    : null
  const fecha = placar && placar.banco !== null && depois !== null && Math.abs(depois - placar.banco) < 0.005
  /** banco − sistema: positivo = falta no sistema; negativo = o sistema tem a mais. */
  const difTxt = (d: number) => d > 0 ? `faltam ${fmtBRL(d)} no sistema` : `o sistema tem ${fmtBRL(-d)} a mais`
  const contaNome = contas.find(c => c.id === contaId)?.nome || ''
  const periodo = itens.length
    ? (() => {
        const ds = itens.map(i => i.data).sort()
        return ds[0] === ds[ds.length - 1] ? fmtData(ds[0]) : `${fmtData(ds[0])} a ${fmtData(ds[ds.length - 1])}`
      })()
    : ''
  /** CONCILIADOS AUTOMATICAMENTE (16/10/2026, Lucas): o par exato no sistema — concilia ao registrar.
   *  JÁ CONCILIADAS ANTES: a mesma linha (ID do banco) já veio noutra importação. Duas seções no topo, fechadas. */
  const encontradas = itens.filter(i => !!i.jaNoSistema && !emParecido(i) && !i.jaConciliada)
  const jaAntes = itens.filter(i => !!i.jaNoSistema && !emParecido(i) && !!i.jaConciliada && i.duplicada === undefined)
  const duplicadas = itens.filter(i => i.duplicada !== undefined)
  // AS SEÇÕES, pela casa de cada linha (redesenho 16/10/2026): a decisão não muda o lugar
  const daCasa = (c: Casa) => itens.filter(i => i.casa === c)
  const quaseVis = daCasa('quase'), foraVis = daCasa('fora'), despVis = daCasa('despesa'), recVis = daCasa('receita')
  const rendAuto = daCasa('auto')
  const autoN = encontradas.length + rendAuto.length
  /** rendimento desfeito pelo ✕ fica pendente: a seção não pode esconder (achado da Ouro) */
  const autoPend = rendAuto.filter(i => estadoDe(i).tipo === 'pendente').length
  /** "mostrar só o que falta decidir" — a linha aberta continua à vista */
  const visiveis = (xs: Item[]) => (soPendentes ? xs.filter(i => linhaAberta === i.n || estadoDe(i).tipo === 'pendente') : xs)
  const decididas = (xs: Item[]) => xs.filter(i => estadoDe(i).tipo !== 'pendente').length
  /** leva até a primeira linha sem decisão */
  function verPendente() {
    const alvo = pendentesL[0]
    if (!alvo) return
    if (alvo.casa === 'auto') setEncontradasAberto(true)
    setLinhaAberta(alvo.n)
    setTimeout(() => document.querySelector(`[data-linha="${alvo.n}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60)
  }
  const pgtosDeFatura = daCasa('pgto')
  const frasePronto = [
    recProntas.length ? `${recProntas.length} ${recProntas.length === 1 ? 'recebimento' : 'recebimentos'}` : '',
    entreProntas.length ? `${entreProntas.length} entre contas` : '',
    rendProntas.length ? `${rendProntas.length} ${rendProntas.length === 1 ? 'rendimento' : 'rendimentos'}` : '',
    receitaProntas.length ? `${receitaProntas.length} ${receitaProntas.length === 1 ? 'outra receita' : 'outras receitas'}` : '',
    emprestimoProntas.length ? `${emprestimoProntas.length} ${emprestimoProntas.length === 1 ? 'empréstimo' : 'empréstimos'}` : '',
    despProntas.length ? `${despProntas.length} ${despProntas.length === 1 ? 'despesa' : 'despesas'}` : '',
    faturaProntas.length ? `${faturaProntas.length} ${faturaProntas.length === 1 ? 'pagamento de fatura' : 'pagamentos de fatura'}` : '',
    repasseProntas.length ? `${repasseProntas.length} ${repasseProntas.length === 1 ? 'pagamento de repasse' : 'pagamentos de repasse'}` : '',
  ].filter(Boolean).join(' e ')
  /** A LINHA DO BANCO SEM PAR (mig 171): o que não vira registro nem conciliação — fica guardado
   *  no A conferir. Fora: cartão, fatura e repasse (módulo próprio), e saída+estorno do mesmo dia. */
  const linhasSemPar = ehCartao ? [] : (() => {
    const entrou = new Set([...recProntas, ...despProntas, ...reclassProntas, ...entreProntas, ...rendProntas,
      ...receitaProntas, ...emprestimoProntas, ...faturaProntas, ...repasseProntas, ...confirmados, ...exatosParaConciliar].map(i => i.n))
    return itens.filter(i => !entrou.has(i.n) && !i.jaNoSistema && !i.jaConciliada
      && !(i.parecido && i.parecido.escolhido >= 0) && !i.faturaPgto && !i.repassePgto
      && !(i.valor < 0 && quitacaoDe(i.descricao)) && !(i.motivoFora || '').startsWith('estornado'))
  })()
  const conferir = exatosParaConciliar.length + confirmados.length + recProntas.length + entreProntas.length + rendProntas.length + receitaProntas.length + emprestimoProntas.length + despProntas.length + faturaProntas.length + repasseProntas.length

  return (
    <Modal
      isOpen={aberto}
      onClose={onClose}
      size="wide"
      title={itens.length ? `${contaNome} — ${periodo}` : 'Importar extrato'}
      footer={itens.length ? (
        <div className="flex flex-wrap items-center gap-3 w-full">
          <span className="text-sm text-[var(--surface-500)] flex-1 min-w-[220px] flex flex-col gap-0.5">
            <span>
              {conferir === 0 ? 'Nada para registrar ainda.'
                : frasePronto ? <>Vai registrar <strong className="text-[var(--surface-800)]">{frasePronto}</strong> ({conferir} {conferir === 1 ? 'linha conferida' : 'linhas conferidas'}).</>
                : <>Vai marcar {conferir} {conferir === 1 ? 'linha' : 'linhas'} como conferida{conferir === 1 ? '' : 's'}.</>}
            </span>
            {pendentes > 0 && (
              <span className="text-amber-500">
                {pendentes} {pendentes === 1 ? 'linha ainda sem decisão' : 'linhas ainda sem decisão'}{' — '}
                <button type="button" onClick={verPendente} className="underline">ver {pendentes === 1 ? 'qual' : 'a primeira'}</button>
              </span>
            )}
            {linhasSemPar.length > 0 && <span>{linhasSemPar.length} {linhasSemPar.length === 1 ? 'linha do banco fica guardada' : 'linhas do banco ficam guardadas'} no A conferir para decidir depois.</span>}
            {semCategoria.length > 0 && <span>{semCategoria.length} {semCategoria.length === 1 ? 'despesa vai' : 'despesas vão'} sem categoria — dá pra classificar depois{ehCartao ? ' (a fatura só fica pronta pra pagar com tudo classificado)' : ''}.</span>}
            {faturaDifere.length > 0 && <span>{faturaDifere.length === 1 ? '1 pagamento de fatura ou repasse com valor diferente fica' : `${faturaDifere.length} pagamentos de fatura ou repasse com valor diferente ficam`} para depois — o resto pode registrar.</span>}
          </span>
          <button onClick={() => { if (!trocarPerg) { setTrocarPerg(true); return } setTrocarPerg(false); setItens([]); setPlacar(null); setOfx(null) }}
                  onBlur={() => setTrocarPerg(false)}
                  className={`btn-secondary text-sm ${trocarPerg ? 'text-amber-500' : ''}`}>
            {trocarPerg ? 'Perder as escolhas e trocar?' : ehCartao ? 'Trocar o PDF' : 'Trocar o arquivo'}
          </button>
          <button onClick={() => void registrar()} disabled={salvando || conferir === 0} className="btn-primary text-sm">
            {salvando ? <><Loader2 className="h-4 w-4 animate-spin" /> Registrando…</> : 'Registrar e conferir'}
          </button>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={() => void ler()} disabled={(ehCartao ? !texto.trim() : !ofx) || lendo || !contaId} className="btn-primary text-sm">
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
              {correntes.map(c => <option key={c.id} value={c.id}>{rotuloConta(cores, c.id, c.nome)}</option>)}
              {cartoes.length > 0 && (
                <optgroup label="Fatura de cartão">
                  {cartoes.filter(c => c.conciliavel !== false).map(c => <option key={c.id} value={c.id}>{rotuloConta(cores, c.id, c.nome)}</option>)}
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
              <span className="text-sm text-[var(--surface-500)]">É quando essas compras saem do caixa. Com o PDF, ela é escolhida sozinha.</span>
            </div>
          )}

          {/* CONTA CORRENTE: só o arquivo OFX (14/10/2026) — colar texto saiu, era arriscado */}
          {!ehCartao && (
            <div className="flex flex-col gap-2">
              <span className="text-base font-semibold text-[var(--surface-800)]">Envie o arquivo OFX do extrato</span>
              <label className="flex flex-col items-center justify-center gap-1 rounded-[12px] border-2 border-dashed border-[var(--surface-300)] px-4 py-8 text-center cursor-pointer hover:border-[var(--brand-500)] hover:bg-[var(--surface-50)]">
                <span className="text-sm font-medium text-[var(--surface-800)]">{ofx ? `${ofx.nome} · ${ofx.dados.linhas.length} lançamentos` : 'Escolher o arquivo .ofx'}</span>
                <span className="text-xs text-[var(--surface-500)]">no app ou site do banco: Extrato › Exportar › formato OFX</span>
                <input type="file" accept=".ofx,.OFX,application/x-ofx" className="sr-only"
                       onChange={async e => {
                         const arq = e.target.files?.[0]
                         e.target.value = ''
                         if (!arq) return
                         const t = await textoDoArquivo(arq)
                         if (!ehOFX(t)) return toast('Esse arquivo não parece um OFX', 'error')
                         const dados = lerOFX(t)
                         if (!dados.linhas.length) return toast('O OFX não trouxe nenhum lançamento', 'error')
                         setOfx({ nome: arq.name, dados })
                         // QUAL CONTA: pelo banco do arquivo (<BANKID>) × instituição da conta
                         const banco = dados.banco?.nome || null
                         const doBanco = banco ? correntes.filter(c => mesmoBanco(c.instituicao, banco)) : []
                         if (doBanco.length === 1) {
                           setBancoAviso(`Arquivo do ${banco} — conta escolhida: ${doBanco[0].nome}`)
                           if (doBanco[0].id !== contaId) { lerQuandoPronto.current = true; setContaId(doBanco[0].id); return }
                         } else if (doBanco.length > 1) {
                           setBancoAviso(`Arquivo do ${banco} — esta unidade tem ${doBanco.length} contas desse banco (${doBanco.map(c => c.nome).join(', ')}). Confira a conta escolhida.`)
                           if (!doBanco.some(c => c.id === contaId)) { setContaId(doBanco[0].id); return }
                         } else if (banco) {
                           setBancoAviso(`Arquivo do ${banco}, mas nenhuma conta da unidade está cadastrada com esse banco — confira a conta escolhida.`)
                         }
                         void ler(dados)
                       }} />
              </label>
              {bancoAviso && <span className="text-sm text-[var(--brand-500)]">{bancoAviso}</span>}
              <span className="text-sm text-[var(--surface-500)]">Você vê cada linha antes de registrar. Nada é gravado até clicar em Registrar e conferir.</span>
            </div>
          )}

          {/* FATURA DE CARTÃO: só o PDF da fatura (14/10/2026). Colar texto saiu; o banco não exporta
              OFX de fatura. Formato conferido: Inter (lib/fatura-pdf.ts) — os outros bancos entram
              quando a fatura deles chegar e for conferida. */}
          {ehCartao && (
            <div className="flex flex-col gap-2">
              <span className="text-base font-semibold text-[var(--surface-800)]">Envie o PDF da fatura</span>
              <label className="flex flex-col items-center justify-center gap-1 rounded-[12px] border-2 border-dashed border-[var(--surface-300)] px-4 py-8 text-center cursor-pointer hover:border-[var(--brand-500)] hover:bg-[var(--surface-50)]">
                <span className="text-sm font-medium text-[var(--surface-800)]">{pdfNome || 'Escolher o PDF da fatura'}</span>
                <span className="text-xs text-[var(--surface-500)]">por enquanto, fatura do Inter (o PDF que o app manda todo mês)</span>
                <input type="file" accept="application/pdf,.pdf" className="sr-only"
                       onChange={async e => {
                         const arq = e.target.files?.[0]
                         e.target.value = ''
                         if (!arq) return
                         setLendo(true)
                         let lido: { inter: boolean; texto: string }
                         try { lido = await textoDoPdf(arq) } catch { setLendo(false); return toast('Não consegui ler esse PDF', 'error') }
                         setLendo(false)
                         // o formato é decidido no PDF inteiro, antes do recorte (lib/fatura-pdf.ts)
                         if (!lido.inter) return toast('Por enquanto só a fatura do Inter — este PDF não parece ser uma', 'error')
                         setPdfNome(arq.name); setOfx(null); setTexto(lido.texto)
                         // o cartão do Inter: se a unidade tem UM, escolhe sozinho
                         const doInter = cartoes.filter(c => c.conciliavel !== false && mesmoBanco(c.instituicao, 'Inter'))
                         if (doInter.length === 1 && doInter[0].id !== contaId) { setBancoAviso(`Fatura do Inter — cartão escolhido: ${doInter[0].nome}`); lerQuandoPronto.current = true; setContaId(doInter[0].id); return }
                         if (doInter.length > 1 && !doInter.some(c => c.id === contaId)) setBancoAviso(`Fatura do Inter — esta unidade tem ${doInter.length} cartões do Inter. Confira o escolhido.`)
                         lerQuandoPronto.current = true
                       }} />
              </label>
              {bancoAviso && <span className="text-sm text-[var(--brand-500)]">{bancoAviso}</span>}
              <span className="text-sm text-[var(--surface-500)]">O vencimento e as compras saem do próprio PDF; cada compra é conferida com o que já está lançado.</span>
            </div>
          )}
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
                {placar.banco === null && <span className="text-xs text-[var(--surface-400)]">o arquivo não trouxe o saldo</span>}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-[var(--surface-500)]">No sistema em {fmtData(placar.data)}</span>
                <span className="text-mono text-xl tabular-nums text-[var(--surface-800)]">{fmtBRL(placar.sistema)}</span>
                {placar.banco !== null && Math.abs(placar.banco - placar.sistema) >= 0.005 && (
                  <span className="text-xs text-amber-500">{difTxt(placar.banco - placar.sistema)}</span>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-[var(--surface-500)]">Depois de registrar</span>
                <span className={`text-mono text-xl tabular-nums ${fecha ? 'text-emerald-500' : 'text-[var(--surface-800)]'}`}>{fmtBRL(depois ?? 0)}</span>
                {placar.banco !== null && (fecha
                  ? <span className="text-xs text-emerald-500">✓ bate com o banco</span>
                  : <span className="text-xs text-amber-500">{difTxt((placar.banco ?? 0) - (depois ?? 0))} — veja abaixo as linhas sem decisão e o que está no sistema e não no banco</span>)}
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
                    {bate ? '✓ bate com a fatura' : `faltam ${fmtBRL(cabecalho.total - soma)} — o PDF foi lido inteiro?`}
                  </span>
                </div>
              </div>
            )
          })()}

          {duplicadas.length > 0 && (
            <section className="flex flex-col gap-2.5">
              {cabecaSecao(<span className="text-amber-500">⚠ Conciliada em dobro</span>,
                'a linha do banco está ligada a registros que somam mais que ela — um deles está sobrando: exclua o que não vale e coloque o arquivo de novo')}
              {caixaLinhas(duplicadas.map(i => (
                <div key={i.n} className={`${grade} py-2.5 border-b border-[var(--surface-100)] last:border-0`}>
                  <span className="text-amber-500 text-xs" aria-hidden="true">⚠</span>
                  <span className="text-xs text-[var(--surface-400)]">{dataCurta(i.data)}</span>
                  <span className="text-sm text-[var(--surface-600)] truncate" title={i.original}>{i.descricao}</span>
                  <span className="col-span-4 col-start-3 sm:col-span-1 sm:col-start-auto row-start-2 sm:row-start-auto text-xs text-amber-500">
                    ligada a {i.exatos.map(r => `${r.rotulo} (${fmtBRL(Math.abs(r.valor))})`).join(' e ')} — somam {fmtBRL(Math.abs(i.duplicada!))}
                  </span>
                  <span className={`text-right text-mono text-sm tabular-nums ${valorCor(i.valor)}`}>{valorTxt(i.valor)}</span>
                </div>
              )))}
            </section>
          )}

          {/* o que pede você vem primeiro; o resolvido fica no fim, fechado */}
          {(quaseVis.length + foraVis.length + despVis.length + recVis.length) > 0 && (
            <label className="-mb-3 flex items-center gap-2 self-end text-xs text-[var(--surface-500)] cursor-pointer">
              <input type="checkbox" checked={soPendentes} onChange={e => setSoPendentes(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--brand-500)]" />
              mostrar só o que falta decidir
            </label>
          )}

          {quaseVis.length > 0 && (
            <section className="flex flex-col gap-2.5">
              {cabecaSecao('Quase lá', `achamos no sistema um lançamento parecido, com data${ehCartao ? ', câmbio' : ''} ou valor um pouco diferente — confira cada um`, undefined, andamento(quaseVis))}
              {caixaDecisao(visiveis(quaseVis).map(i => linha(i)))}
            </section>
          )}

          {foraVis.length > 0 && (
            <section className="flex flex-col gap-2.5">
              {cabecaSecao(ehCartao ? 'Não é compra' : 'Sem par no sistema',
                ehCartao ? 'linhas da fatura que não são compra' : 'movimentos do banco que não achamos no sistema — diga o que é cada um',
                undefined, andamento(foraVis))}
              {!ehCartao && <span className="-mt-1 text-xs text-[var(--surface-500)]">Se for pagamento de tutor, lance no contrato do pet e envie o arquivo de novo. O que ficar sem resposta vai para o A conferir.</span>}
              {caixaDecisao(visiveis(foraVis).map(i => linha(i)))}
            </section>
          )}

          {despVis.length > 0 && (
            <section className="flex flex-col gap-2.5">
              {cabecaSecao(ehCartao ? 'Compras' : 'Despesas',
                ehCartao ? 'compras desta fatura — escolha do que foi cada uma' : 'saídas do banco que viram despesa — escolha do que foi cada uma',
                despVis.reduce((a, i) => a + i.valor, 0), andamento(despVis))}
              {/* caixa conjunto: marcar todas de uma vez, depois ajustar as exceções na linha */}
              {conj.conjunto && (
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--surface-600)]">
                  <span>De quem são? Marcar todas:</span>
                  {conj.irmas.map(u => (
                    <button key={u.id} type="button" onClick={() => setItens(xs => xs.map(x => (x.destino === 'despesa' ? { ...x, dono: u.id } : x)))}
                            className="px-2.5 py-0.5 rounded-full border border-[var(--surface-300)] hover:border-[var(--brand-500)]">{u.nome}</button>
                  ))}
                  {despesas.some(i => i.marcado && !i.dono) && <span className="text-amber-500">{despesas.filter(i => i.marcado && !i.dono).length} sem dona</span>}
                </div>
              )}
              {caixaDecisao(visiveis(despVis).map(i => linha(i)))}
            </section>
          )}

          {recVis.length > 0 && (
            <section className="flex flex-col gap-2.5">
              {cabecaSecao('Recebimentos da maquininha', 'depósitos das vendas no cartão', recVis.reduce((a, i) => a + i.valor, 0),
                <span className="flex items-center gap-3">
                  {andamento(recVis)}
                  {maquininhas.length > 1 && (
                    <span className="flex items-center gap-2 text-sm text-[var(--surface-500)]">
                      todas da
                      <select value={maquininhaLote} onChange={e => setMaquininhaLote(e.target.value)} aria-label="Maquininha de todas"
                              className="input text-sm py-1" style={!maquininhaLote ? { borderColor: '#f59e0b' } : undefined}>
                        <option value="">qual maquininha?</option>
                        {maquininhas.map(m => <option key={m.id} value={m.id}>{rotuloConta(cores, m.id, m.nome)}</option>)}
                      </select>
                    </span>
                  )}
                </span>)}
              {caixaDecisao(visiveis(recVis).map(i => linha(i)))}
            </section>
          )}

          {pgtosDeFatura.length > 0 && (
            <section className="flex flex-col gap-2.5">
              {cabecaSecao('Pagamento de fatura e repasse', 'cada um tem tela própria: confira lá primeiro (+ Lançar › Fatura do cartão / Repasse); conferido, ele concilia aqui')}
              {caixaLinhas(pgtosDeFatura.map(i => linhaFora(i)))}
            </section>
          )}

          {naoVieram.length > 0 && (
            <section className="flex flex-col gap-2.5 rounded-[14px] border border-dashed border-[var(--surface-300)] p-4">
              {cabecaSecao(ehCartao ? 'Na fatura do sistema e não no PDF' : 'No sistema e não está no extrato',
                ehCartao ? 'lançado nesta fatura e não aparece no PDF' : 'lançado nesta conta nesses dias e não aparece no banco')}
              <span className="text-sm text-[var(--surface-500)]">Pode ser lançamento duplicado, cancelado ou com valor errado — confira na tela de lançamentos. Aqui não precisa fazer nada.</span>
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

          {autoN > 0 && (
            <section className="flex flex-col gap-2.5">
              {cabecaSecao(<span className="text-emerald-500">✓ Conciliam sozinhos</span>,
                [
                  encontradas.length ? `${encontradas.length} ${encontradas.length === 1 ? 'linha bateu' : 'linhas bateram'} com o sistema` : '',
                  rendAuto.length ? `${rendAuto.length} ${rendAuto.length === 1 ? 'rendimento da conta' : 'rendimentos da conta'}` : '',
                ].filter(Boolean).join(' · ') + ' — ficam conferidos ao registrar',
                undefined, autoPend > 0 ? <span className="ml-auto text-xs text-amber-500">{autoPend} sem decisão</span> : abreFecha(encontradasAberto, () => setEncontradasAberto(v => !v)))}
              {(encontradasAberto || autoPend > 0) && encontradas.length > 0 && caixaLinhas(encontradas.map(i => linhaEncontrada(i)))}
              {(encontradasAberto || autoPend > 0) && rendAuto.length > 0 && caixaDecisao(rendAuto.map(i => linha(i)))}
            </section>
          )}

          {jaAntes.length > 0 && (
            <section className="flex flex-col gap-2.5">
              {cabecaSecao(<span className="text-emerald-500">✓ Já conciliadas antes</span>,
                `${jaAntes.length} ${jaAntes.length === 1 ? 'linha já está classificada e conferida' : 'linhas já estão classificadas e conferidas'} — nada a fazer`,
                undefined, abreFecha(jaAntesAberto, () => setJaAntesAberto(v => !v)))}
              {jaAntesAberto && caixaLinhas(jaAntes.map(i => linhaEncontrada(i)))}
            </section>
          )}
        </div>
      )}
    </Modal>
  )
}
