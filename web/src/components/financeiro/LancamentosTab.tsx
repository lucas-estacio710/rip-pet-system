'use client'

// /financeiro — lançamento de despesas da unidade.
//
// REGRA DE PRODUTO (doc §8.1, "capturar rico, mostrar pobre"): o operador
// responde só o que foi, quanto e como pagou. Conta contábil, custo × despesa,
// opex × capex e as DUAS DATAS são derivadas — nada disso aparece na tela.
// O sistema grava tudo mesmo escondido, pra quando esses recursos forem
// liberados já existir histórico.
//
// Tom profissional: "lançar" é o verbo que a equipe já usa. Nada de gamificação.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as Icons from 'lucide-react'
import { Plus, Loader2, X, Check, Trash2, Flame, Copy } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import { useFieldPermission } from '@/hooks/useFieldPermission'
import Modal from '@/components/ui/Modal'
import CobrancasCard from './CobrancasCard'
import ReceitasPrazoTab from './ReceitasPrazoTab'
import UnderlineTabs from '@/components/ui/UnderlineTabs'
import {
  fmtBRL, fmtData, hojeISO, limitesDoMes
} from '@/lib/financeiro'

type Categoria = {
  id: string
  nome: string
  icone: string | null
  nivel: number
  parent_id: string | null
  fin_conta_id: string | null
  pergunta_capex: boolean
  termos: string[] | null       // sinônimos: "gasolina" acha Combustível
  fin_contas?: { codigo: string; nome: string; natureza: string } | null
}

type Lancamento = {
  id: string
  descricao: string | null
  valor: number
  data_competencia: string
  data_caixa: string | null
  metodo_pagamento: string | null
  status: string
  fornecedor_nome: string | null
  categoria_id: string | null
  conta_pagamento_id: string | null   // de qual conta saiu — alimenta o caixa
  natureza: string | null        // opex/capex — reabre o form fiel ao gravado
  observacoes: string | null     // motivo, quando rejeitado na fila de revisão
  rateio_meses: number | null    // idem, pro checkbox "cobre mais de um mês"
  fin_categorias?: { nome: string; icone: string | null } | null
}

/** Custo de cremação do mês (mig 114). Nasce do acolhimento, não é digitado. */
type CustoAuto = {
  tipo_cremacao: 'individual' | 'coletiva'
  qtd_pets: number
  preco_unitario: number
  valor: number
}

/** Conta de onde o dinheiro sai. Tabela `contas`, escopada por unidade —
 *  cada unidade tem os SEUS bancos, não há conta comum ao grupo. */
type ContaBancaria = {
  id: string
  nome: string
  saidas: string[]
  /** ⚠️ A coluna do banco se chama `preferencial_RECEBIMENTO`, mas é usada aqui,
   *  no lado do PAGAMENTO, como "a conta principal da unidade" (13/09/2026,
   *  pedido do Lucas: "conta inter é preferencial para pagamentos, deveria
   *  aparecer em primeiro no combobox, com uma estrela"). Reaproveitada de
   *  propósito: uma unidade tem UMA conta principal, e criar
   *  `preferencial_pagamento` só para separar o que na prática é a mesma conta
   *  seria coluna nova para um caso que ainda não existe. No dia em que a
   *  preferida de pagar for diferente da de receber, aí sim vale separar. */
  preferencial_recebimento: boolean | null
}

const mesAtual = () => new Date().toISOString().slice(0, 7)

/**
 * VALOR EM CENTAVOS, do jeito que app de banco faz (13/09/2026, pedido do Lucas).
 *
 * O state guarda só os DÍGITOS, e a vírgula anda sozinha da direita para a
 * esquerda: 1 → 0,01 · 14 → 0,14 · 140050 → 1.400,50. Some a decisão de "onde
 * ponho a vírgula", que num campo de dinheiro é sempre a mesma.
 *
 * Efeito colateral bom: colar "-255,88" do extrato vira 255,88 sozinho, porque
 * tudo que não é dígito é descartado na entrada — o sinal e o separador junto.
 */
const soDigitos = (t: string) => t.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12)
const digitosParaNumero = (d: string) => Number(d || '0') / 100
const digitosParaTexto = (d: string) =>
  digitosParaNumero(d).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** Caminho inverso, para reabrir um lançamento salvo: 1400.5 → "140050" */
const numeroParaDigitos = (n: number) => String(Math.round(Math.abs(n) * 100))

/** Ícone do lucide pelo nome salvo na categoria (fallback: etiqueta). */
function IconeCat({ nome, className }: { nome?: string | null; className?: string }) {
  const C = (nome && (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[nome]) || Icons.Tag
  return <C className={className} />
}

// ⚠️ ANEXAR COMPROVANTE foi REMOVIDO da tela em 25/08/2026, a pedido do Lucas
// ("por enquanto"). Não foi esquecimento nem bug: a coluna `fin_lancamentos.
// anexo_url` e o bucket privado `financeiro` continuam de pé, e nenhum
// lançamento tinha anexo quando isso saiu (conferido: 0). Pra voltar, é
// reconstruir o input de arquivo + o upload em `salvar()` e reusar
// `caminhoComprovante()`, que segue em lib/financeiro.ts.
/**
 * @param somenteLeitura FLS: a unidade CONSULTA o que já foi lançado, mas não
 *   cria, edita nem exclui. Era a única aba do financeiro que ignorava isso —
 *   Repasse, Caixa e Contas já recebiam a prop, e Lançamentos não (13/09/2026).
 */
export default function LancamentosTab({ somenteLeitura = false }: { somenteLeitura?: boolean }) {
  const supabaseTipado = createClient()
  // Tabelas fin_* ainda não estão em types/database.ts
  const supabase = supabaseTipado as unknown as SupabaseClient
  const { toast } = useToast()
  const { currentUnit, userName } = useUnit()
  const { isVisible } = useFieldPermission()

  const [mes, setMes] = useState(mesAtual())
  /**
   * DESPESAS × RECEITAS A PRAZO — as duas metades do mesmo gesto.
   *
   * Desenho do Lucas (23/09/2026). São o mesmo trabalho — pegar o extrato e
   * registrar o que aconteceu — em direções OPOSTAS de dinheiro. Juntas na mesma
   * lista, alguém soma a coluna errada em algum momento; e o total do cabeçalho,
   * que hoje diz "R$ X · N lançamentos", passaria a misturar saída com entrada.
   * Abas irmãs resolvem sem asterisco: cada uma tem o seu próprio total.
   *
   * ⚠️ A palavra "lançamento" fica inteira do lado das DESPESAS. Receitas a
   * Prazo nunca a usa — é "registrar do extrato".
   */
  const [faixa, setFaixa] = useState<'despesas' | 'receitas'>('despesas')
  // A faixa de receitas tem chave FLS própria (`obj_fin_receitas_prazo`): é uma
  // aba que a unidade pode não querer, e sem chave o item seria incontrolável —
  // regra obrigatória do CLAUDE.md, que esta aba descumpriu por algumas horas
  // em 23/09. Lido aqui, e não no page.tsx, porque a faixa vive DENTRO de
  // Lançamentos: quem esconde a aba-mãe já esconde as duas.
  const veReceitas = isVisible('tela_financeiro', 'obj_fin_receitas_prazo')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [custosAuto, setCustosAuto] = useState<CustoAuto[]>([])
  const [carregando, setCarregando] = useState(false)

  // formulário — o mesmo modal serve pra criar e pra editar. `editandoId` decide:
  // null = insert, preenchido = update. Errar valor ou categoria e nao poder
  // corrigir obrigaria a excluir e relancar do zero.
  const [aberto, setAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [catId, setCatId] = useState('')
  const [busca, setBusca] = useState('')
  // Drill-down em colunas: escolhe a categoria → abre as subcategorias → abre os tipos
  const [nivel1, setNivel1] = useState<string | null>(null)
  const [nivel2, setNivel2] = useState<string | null>(null)
  const [valor, setValor] = useState('')
  const [data, setData] = useState(hojeISO())
  /**
   * COMO FOI PAGO — de volta à tela em 13/09/2026, mas com outro papel.
   *
   * ⚠️ A mig 121 REMOVEU o método do formulário, e com razão: como DADO ele não
   * muda nada — nem o resultado nem o caixa, que precisam só da conta e da data
   * (§9.1.1). Ele volta agora como **caminho até a conta**: "paguei no pix" é o
   * que o operador sabe; "de qual das sete contas saiu" é o que ele precisa
   * responder, e o cadastro já sabe filtrar (`contas.saidas`, mig 122).
   *
   * Continua sendo gravado em `fin_lancamentos.metodo_pagamento` — a coluna
   * existe desde a mig 103 e estava recebendo `'pix'` em 10 de 10 por default.
   */
  const [metodo, setMetodo] = useState('')
  // Os dois toggles Hoje/Outra precisam de estado PRÓPRIO: derivar de
  // "a data é igual a hoje?" faz o botão "Outra" não abrir campo nenhum quando
  // o gasto é mesmo de hoje — e aí não há como digitar outra data.
  const [dataOutra, setDataOutra] = useState(false)
  const [caixaOutra, setCaixaOutra] = useState(false)
  // O CAIXA, coletado sem anunciar: quando o dinheiro sai e de qual conta.
  // ⚠️ NUNCA calculada a partir do vencimento do cartão (decisão do Lucas,
  // 13/09/2026): "posso tar atrasado e o sistema colocar datas erradas, ou ter
  // algum evento que mude a data de fechamento — banco é tudo doido". Data
  // calculada é PREVISÃO, e previsão gravada como fato faz o extrato mentir.
  const [dataCaixa, setDataCaixa] = useState('')
  const [contaId, setContaId] = useState('')
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [fornecedor, setFornecedor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [duravel, setDuravel] = useState<boolean | null>(null)   // vira opex/capex
  // Rateio: gasto que cobre vários meses (seguro anual, anuidade). Distribui só
  // na COMPETÊNCIA — o caixa sai inteiro quando saiu.
  const [rateado, setRateado] = useState(false)
  const [meses, setMeses] = useState('12')
  const [salvando, setSalvando] = useState(false)

  // COMPRA EXTERNA — "paguei algo que é de outra unidade".
  // O gasto sai do caixa DAQUI, mas o custo é de lá. Em vez de lançar na DRE da
  // outra unidade por conta própria (o que o repasse fazia, e que o Lucas com
  // razão achou esquisito), emite-se uma cobrança que ela reconhece ou recusa.
  // Ver docs/COBRANCAS_ENTRE_UNIDADES.md.
  const [paraOutra, setParaOutra] = useState('')      // id da unidade que consumiu
  const [unidades, setUnidades] = useState<{ id: string; codigo: string; nome: string }[]>([])
  const [recarregarCobrancas, setRecarregarCobrancas] = useState(0)
  // "é de outra unidade" e "cobre mais de um mês" vivem atrás deste toggle: são
  // casos raros que ocupavam o meio do modal, no caminho do olho.
  const [maisOpcoes, setMaisOpcoes] = useState(false)
  // Fornecedores já usados nesta unidade — alimentam o autocomplete e a sugestão
  // de categoria. Digitar o nome à mão toda vez produz "Gifonni" e "Giffoni",
  // e aí nenhuma memória casa (caso real, 13/09/2026).
  const [fornecedoresUsados, setFornecedoresUsados] = useState<string[]>([])
  const [sugestaoCat, setSugestaoCat] = useState<{ id: string; caminho: string } | null>(null)

  const catSelecionada = categorias.find(c => c.id === catId)

  useEffect(() => {
    supabase
      .from('fin_categorias')
      .select('id, nome, icone, nivel, parent_id, fin_conta_id, pergunta_capex, termos, fin_contas(codigo, nome, natureza)')
      .eq('ativo', true)
      .order('nivel')
      .order('ordem')
      .then(({ data }) => setCategorias(((data as unknown as Categoria[]) || [])))
  }, [supabase])

  // ── árvore: categoria > subcategoria > tipo ──────────────────────────────
  const filhosDe = (pai: string | null) =>
    categorias.filter(c => (pai === null ? c.parent_id === null : c.parent_id === pai))

  /** "Operacional › Veículos › Combustível" */
  const caminhoDe = useCallback((id: string): string => {
    const partes: string[] = []
    let atual = categorias.find(c => c.id === id)
    while (atual) {
      partes.unshift(atual.nome)
      atual = atual.parent_id ? categorias.find(c => c.id === atual!.parent_id) : undefined
    }
    return partes.join(' › ')
  }, [categorias])

  const folhas = categorias.filter(c => !categorias.some(f => f.parent_id === c.id))

  /** tira acento pra "pedagio" achar "pedágio" e vice-versa */
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

  // Busca no nome, no caminho E nos SINÔNIMOS: "gasolina" → Combustível,
  // "troca de óleo" → Manutenção, "chocolate" → Brinde.
  const resultados = busca.trim().length >= 2
    ? folhas
        .map(c => {
          const termos = (c.termos || []).map(norm)
          const alvo = norm(caminhoDe(c.id)) + ' ' + termos.join(' ')
          const palavras = norm(busca.trim()).split(/\s+/)
          if (!palavras.every(t => alvo.includes(t))) return null
          // quem bate no nome do item vem antes de quem bate só por sinônimo
          const forte = palavras.every(t => norm(c.nome).includes(t))
          const termoBatido = termos.find(t => palavras.some(p => t.includes(p)))
          return { c, forte, termoBatido }
        })
        .filter(Boolean)
        .sort((a, b) => Number(b!.forte) - Number(a!.forte))
        .slice(0, 40) as { c: Categoria; forte: boolean; termoBatido?: string }[]
    : []

  const carregar = useCallback(async () => {
    if (!currentUnit?.id) return
    setCarregando(true)
    const { ini, fim } = limitesDoMes(mes)
    const { data } = await supabase
      .from('fin_lancamentos')
      .select('id, descricao, valor, data_competencia, data_caixa, metodo_pagamento, conta_pagamento_id, status, observacoes, fornecedor_nome, categoria_id, natureza, rateio_meses, fin_categorias(nome, icone)')
      .eq('unidade_id', currentUnit.id)
      .gte('data_competencia', ini)
      .lte('data_competencia', fim)
      .order('data_competencia', { ascending: false })
    setLancamentos(((data as unknown as Lancamento[]) || []))

    // Custo de cremação: nasce do acolhimento, não de digitação (mig 114).
    // A Matriz e a unidade que crema no próprio local (PI) não têm linha aqui.
    const { data: auto } = await supabase
      .from('vw_custo_cremacao_competencia')
      .select('tipo_cremacao, qtd_pets, preco_unitario, valor')
      .eq('unidade_id', currentUnit.id)
      .eq('mes', `${mes}-01`)
    setCustosAuto(((auto as unknown as CustoAuto[]) || []))

    setCarregando(false)
  }, [supabase, currentUnit?.id, mes])

  useEffect(() => { void carregar() }, [carregar])

  // Contas DESTA unidade. Fora de `carregar` porque não
  // dependem do mês.
  const carregarContas = useCallback(async () => {
    if (!currentUnit?.id) return
    const { data } = await supabase
      .from('contas').select('id, nome, saidas, preferencial_recebimento')
      .eq('unidade_id', currentUnit.id).eq('ativo', true)
      .eq('legado', false)          // conta de legado é histórico: não se lança nela
      .order('nome')
    setContas(((data as unknown as ContaBancaria[]) || []))
  }, [supabase, currentUnit?.id])

  useEffect(() => { void carregarContas() }, [carregarContas])

  /** Contas que PAGAM o método escolhido (mig 122). Lista vazia = sem restrição:
   *  conta que ninguém configurou continua servindo, senão a tela ficaria sem
   *  opção nenhuma até alguém abrir o cadastro. */
  const contasQuePagam = (metodo
    ? contas.filter(c => (c.saidas || []).includes(metodo))
    : contas
  ).slice().sort((a, b) => Number(!!b.preferencial_recebimento) - Number(!!a.preferencial_recebimento))

  /**
   * A CONTA PRINCIPAL JÁ VEM ESCOLHIDA. A estrela no combobox diz qual é.
   *
   * Roda ao trocar de método porque a lista muda junto: quem estava escolhido
   * pode não pagar o método novo. Só substitui quando a atual deixou de ser
   * elegível — uma escolha deliberada do operador sobrevive.
   */
  useEffect(() => {
    if (!metodo) return
    const elegiveis = contas
      .filter(c => (c.saidas || []).includes(metodo))
      .slice()
      .sort((a, b) => Number(!!b.preferencial_recebimento) - Number(!!a.preferencial_recebimento))
    setContaId(atual => (elegiveis.some(c => c.id === atual) ? atual : (elegiveis[0]?.id || '')))
  }, [metodo, contas])

  // Fornecedores já usados — para o autocomplete não deixar o mesmo nome virar
  // duas grafias. Só o nome; a sugestão de categoria é buscada na hora.
  useEffect(() => {
    if (!currentUnit?.id) return
    supabase
      .from('fin_lancamentos')
      .select('fornecedor_nome')
      .eq('unidade_id', currentUnit.id)
      .not('fornecedor_nome', 'is', null)
      .order('created_at', { ascending: false })
      .limit(300)
      .then(({ data }) => {
        const vistos = new Set<string>()
        const nomes: string[] = []
        for (const l of ((data as unknown as { fornecedor_nome: string }[]) || [])) {
          const n = (l.fornecedor_nome || '').trim()
          const k = n.toLowerCase()
          if (n && !vistos.has(k)) { vistos.add(k); nomes.push(n) }
        }
        setFornecedoresUsados(nomes)
      })
  }, [supabase, currentUnit?.id, aberto])

  /**
   * O FORNECEDOR LEMBRA A CATEGORIA.
   *
   * Gasto avulso é quase sempre recorrente: mesmo posto, mesma contabilidade,
   * mesmo freela. Em vez de a categoria sugerir o fornecedor, é o contrário —
   * com o método já escolhendo a conta, o fornecedor é a única pista que sobra.
   * Sugere, nunca preenche sozinho: a última vez pode ter sido outra coisa.
   */
  async function sugerirPorFornecedor(nome: string) {
    const n = nome.trim()
    if (!n || catId || !currentUnit?.id) return setSugestaoCat(null)
    const { data } = await supabase
      .from('fin_lancamentos')
      .select('categoria_id')
      .eq('unidade_id', currentUnit.id)
      .ilike('fornecedor_nome', n)
      .not('categoria_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
    const id = (data as unknown as { categoria_id: string }[] | null)?.[0]?.categoria_id
    setSugestaoCat(id ? { id, caminho: caminhoDe(id) } : null)
  }

  // As outras unidades do grupo — destino possível de uma compra externa.
  useEffect(() => {
    if (!currentUnit?.id) return
    supabase
      .from('unidades').select('id, codigo, nome')
      .eq('ativa', true).neq('id', currentUnit.id).order('nome')
      .then(({ data }) => setUnidades((data as unknown as { id: string; codigo: string; nome: string }[]) || []))
  }, [supabase, currentUnit?.id])


  // A data do pagamento acompanha a do gasto enquanto o operador não disser o
  // contrário — que é o caso da esmagadora maioria (pix, dinheiro, débito).
  useEffect(() => { if (!caixaOutra) setDataCaixa(data) }, [data, caixaOutra])

  // No CRÉDITO as duas datas nunca são iguais: a compra é de hoje, o dinheiro
  // sai na fatura. Abre já em "Outra" pra pergunta não passar despercebida —
  // mas quem responde é o operador, o sistema não calcula (decisão do Lucas).
  useEffect(() => { if (metodo === 'credito') setCaixaOutra(true) }, [metodo])

  function limpar() {
    setCatId(''); setValor(''); setData(hojeISO())
    setFornecedor(''); setDescricao(''); setDuravel(null)
    setRateado(false); setMeses('12')
    setDataCaixa(''); setContaId('')
    setBusca(''); setNivel1(null); setNivel2(null)
    setParaOutra(''); setMetodo(''); setMaisOpcoes(false); setSugestaoCat(null)
    setDataOutra(false); setCaixaOutra(false)
    setAberto(false)
    setEditandoId(null)
  }

  /** Abre o modal com o lançamento carregado. */
  function editar(l: Lancamento) {
    if (somenteLeitura) return
    setEditandoId(l.id)
    setCatId(l.categoria_id || '')
    setValor(l.valor ? numeroParaDigitos(Number(l.valor)) : '')
    setData((l.data_competencia || '').slice(0, 10))
    setFornecedor(l.fornecedor_nome || '')
    setDescricao(l.descricao || '')
    // capex só é pergunta em alguns itens; fora deles `duravel` fica null e o
    // salvar cai na natureza da conta, como no lançamento novo.
    setDuravel(l.natureza === 'capex' ? true : (l.natureza === 'opex' ? false : null))
    const r = Number(l.rateio_meses || 1)
    setRateado(r > 1); setMeses(String(r > 1 ? r : 12))
    setDataCaixa((l.data_caixa || '').slice(0, 10))
    setContaId(l.conta_pagamento_id || '')
    setMetodo(l.metodo_pagamento || '')
    // Reabre fiel ao gravado: se a data do gasto não é hoje, o toggle tem que
    // mostrar "Outra" com o campo aberto — senão editar um lançamento antigo
    // esconde a data dele.
    setDataOutra((l.data_competencia || '').slice(0, 10) !== hojeISO())
    setCaixaOutra(!!l.data_caixa && (l.data_caixa || '').slice(0, 10) !== (l.data_competencia || '').slice(0, 10))
    setBusca(''); setNivel1(null); setNivel2(null)
    setSugestaoCat(null)
    // Editando, abre já com as opções raras à vista se alguma estiver em uso —
    // esconder um rateio que existe faria o operador achar que sumiu.
    setMaisOpcoes(Number(l.rateio_meses || 1) > 1)
    setAberto(true)
  }

  /**
   * REUTILIZAR (Lucas, 24/09/2026: "facilita para lançamentos iguais"). Abre o
   * modal de lançamento NOVO já preenchido igual ao que foi clicado — mesma
   * categoria, valor, datas, conta, método, fornecedor, descrição e rateio.
   * É o `editar` sem o vínculo: `editandoId` volta a nulo, então salvar cria
   * outro lançamento em vez de sobrescrever o original.
   * Não vêm junto, de propósito: o comprovante (é de outro pagamento) e o
   * "Comprei para outra unidade" (emitiria uma segunda cobrança sem ninguém
   * ter pedido).
   */
  function reutilizar(l: Lancamento) {
    if (somenteLeitura) return
    editar(l)
    setEditandoId(null)
  }

  async function salvar() {
    if (!currentUnit?.id) return
    // Trava na FUNÇÃO, não só no botão: esconder o botão é aparência — a lição
    // que a /encaminhamentos aprendeu ao virar somente-leitura (FLOW §3.3).
    if (somenteLeitura) return toast('Sua unidade não pode lançar despesa', 'error')
    // Colar do extrato traz o sinal ("-255,88"). Numa tela de DESPESA, saída é
    // saída — recusar por causa do sinal (e ainda dizer "informe o valor", com o
    // valor preenchido) era mandar o operador procurar um erro que não existe.
    const v = digitosParaNumero(valor)
    if (!catId) return toast('Escolha a categoria', 'error')
    if (!Number.isFinite(v) || v <= 0) return toast('O valor precisa ser maior que zero', 'error')
    if (catSelecionada?.pergunta_capex && duravel === null) {
      return toast('Responda se vai durar mais de um ano', 'error')
    }

    setSalvando(true)
    try {
      // Competência = quando o gasto aconteceu. Caixa = quando debitou — o campo
      // nasce igual e o operador só muda no crédito (vencimento da fatura).
      const data_competencia = data
      const data_caixa = dataCaixa || null
      const conta = catSelecionada?.fin_contas

      const campos = {
        categoria_id: catId,
        conta_id: catSelecionada?.fin_conta_id || null,
        conta_codigo: conta?.codigo || null,  // SNAPSHOT: congela a DRE histórica
        conta_nome: conta?.nome || null,
        natureza: duravel === true ? 'capex' : (conta?.natureza || 'opex'),
        descricao: descricao.trim() || null,
        valor: v,
        data_competencia,
        data_caixa,
        // `status` e `origem` NÃO entram aqui: são de criação. No update,
        // reescrevê-los rebaixaria um lançamento já aprovado de volta pra
        // pendente e apagaria a origem de um que veio por OCR/QR.
        fornecedor_nome: fornecedor.trim() || null,
        conta_pagamento_id: contaId || null,
        // Volta a ser gravado (13/09/2026). Ele não decide nada na DRE nem no
        // caixa — quem decide é a conta —, mas é o caminho que o operador
        // percorreu, e sem gravar a coluna seguiria com 'pix' em tudo.
        metodo_pagamento: metodo || null,
        rateio_meses: rateado ? Math.max(1, Math.min(120, Number(meses) || 1)) : 1,
      }

      if (editandoId) {
        const { error } = await supabase.from('fin_lancamentos').update(campos).eq('id', editandoId)
        if (error) throw new Error(error.message)
      } else {
        // LANÇOU, LANÇOU (Lucas, 24/09/2026): *"se um concierge de SJC lançar,
        // não precisa cair pro gerente aprovar... a conferência era uma coisa
        // apenas entre unidades"*. Não há fila de aprovação de despesa: o
        // lançamento nasce `aprovado`, marcado com quem lançou. A única
        // conferência do módulo é a entre unidades (`CobrancasCard`: Reconhecer
        // / Não é meu). Errou? Quem lançou edita ou exclui.
        const { data: { user } } = await supabase.auth.getUser()
        const { data: novo, error } = await supabase.from('fin_lancamentos').insert({
          ...campos,
          unidade_id: currentUnit.id,
          origem: 'manual',
          criado_por_nome: userName || null,
          status: 'aprovado',
          aprovado_por: user?.id || null,
          aprovado_por_nome: userName || null,
          aprovado_em: new Date().toISOString(),
        }).select('id').single()
        if (error) throw new Error(error.message)

        // COMPRA EXTERNA: o gasto sai do caixa daqui e o custo é de lá. Emite a
        // cobrança, que a outra unidade reconhece ou recusa. Enquanto ela não
        // responde, a despesa fica AQUI — é assim que tem de ser: quem comprou
        // carrega o custo até que o outro assuma. Ver docs/COBRANCAS_ENTRE_UNIDADES.md.
        if (paraOutra) {
          const { error: e2 } = await supabase.from('fin_cobrancas').insert({
            unidade_credora: currentUnit.id,     // quem pagou, tem a receber
            unidade_devedora: paraOutra,         // quem consumiu, deve
            tipo: 'despesa_rateada',
            valor: v,
            data: data_competencia,
            descricao: descricao.trim() || fornecedor.trim() || caminhoDe(catId),
            categoria_id: catId,                 // a classificação viaja junto
            status: 'emitida',
            lancamento_origem_id: (novo as { id: string }).id,
            criado_por_nome: userName || null,
          })
          if (e2) throw new Error(e2.message)
          setRecarregarCobrancas(n => n + 1)
        }
      }

      const alvo = unidades.find(u => u.id === paraOutra)
      toast(
        editandoId ? `Lançamento atualizado — ${fmtBRL(v)}`
          : alvo ? `Lançado ${fmtBRL(v)} — ${alvo.nome} vai receber o acerto`
          : `Lançado ${fmtBRL(v)}`,
        'success'
      )
      limpar()
      void carregar()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao lançar', 'error')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(id: string) {
    if (somenteLeitura) return
    const { error } = await supabase.from('fin_lancamentos').delete().eq('id', id)
    if (error) return toast(error.message, 'error')
    setLancamentos(l => l.filter(x => x.id !== id))
    toast('Lançamento excluído', 'success')
  }

  const totalDigitado = lancamentos.reduce((s, l) => s + Number(l.valor || 0), 0)
  const totalAuto = custosAuto.reduce((s, c) => s + Number(c.valor || 0), 0)
  const total = totalDigitado + totalAuto

  return (
    <div className="animate-fade-in space-y-3">
      {/* ACERTOS ENTRE UNIDADES — fica no topo porque uma cobrança que ninguém
          vê não é cobrança. Recarrega quando um lançamento emite uma nova.
          Ocultar por FLS tira só a caixa de entrada: as cobranças continuam
          nascendo, e quem fechar o repasse ainda as encontra. */}
      {isVisible('tela_financeiro', 'obj_fin_acertos') && (
        <CobrancasCard key={recarregarCobrancas} onMudou={() => void carregar()} />
      )}

      {/* FILA DE REVISÃO — o que ainda ninguém conferiu. Some sozinha quando não
          há pendente. Não filtra por mês: um lançamento de junho não conferido
          precisa continuar aparecendo em setembro. */}

      {/* As duas faixas. O seletor de mês é COMPARTILHADO (fica logo abaixo,
          dentro de cada uma) — o operador pensa "setembro", não "setembro das
          despesas".

          FLS: `obj_fin_receitas_prazo` esconde a faixa de receitas. Escondida,
          a barra de abas inteira some (uma aba só não é uma escolha) e a tela
          volta a ser a de Despesas que sempre foi. */}
      {veReceitas && (
        <UnderlineTabs
          tabs={[
            { key: 'despesas' as const, label: 'Despesas' },
            { key: 'receitas' as const, label: 'Receitas a Prazo' },
          ]}
          value={faixa}
          onChange={setFaixa}
        />
      )}

      {veReceitas && faixa === 'receitas' ? (
        <div className="space-y-3">
          <input
            type="month" value={mes} onChange={e => setMes(e.target.value)}
            className="input text-sm w-36 py-1"
          />
          <ReceitasPrazoTab somenteLeitura={somenteLeitura} mes={mes} />
        </div>
      ) : (<>

      {/* Cabeçalho compacto */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="month" value={mes} onChange={e => setMes(e.target.value)}
          className="input text-sm w-36 py-1"
        />
        <span className="text-xs text-[var(--surface-500)]">
          <span className="text-mono text-[var(--surface-700)]">{fmtBRL(total)}</span>
          {' · '}{lancamentos.length} {lancamentos.length === 1 ? 'lançamento' : 'lançamentos'}
          {totalAuto > 0 && ' + cremações'}
        </span>
        {carregando && <Loader2 className="h-4 w-4 animate-spin text-[var(--surface-400)]" />}
        {!somenteLeitura && (
          <button onClick={() => setAberto(true)} className="btn-primary text-sm ml-auto">
            <Plus className="h-4 w-4" /> Novo lançamento
          </button>
        )}
      </div>

      {/* CUSTOS AUTOMÁTICOS — fixos no topo, não se digita.
          A cremação é custo do mês em que o pet foi ACOLHIDO, não do mês em que
          a Matriz cobra (dia 20 do mês seguinte) nem do mês em que a unidade
          paga: ter pago ou não NÃO altera este número. Ver FLOW §9.4.1. */}
      {custosAuto.length > 0 && (
        <div className="card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-[var(--surface-600)] uppercase tracking-wide">
              Custos automáticos
            </h3>
            <span className="text-[10px] text-[var(--surface-400)]">pelos pets acolhidos no mês</span>
            <span className="ml-auto text-mono text-sm text-[var(--surface-700)]">{fmtBRL(totalAuto)}</span>
          </div>

          <div className="divide-y divide-[var(--surface-200)]">
            {['individual', 'coletiva'].map(t => {
              const c = custosAuto.find(x => x.tipo_cremacao === t)
              if (!c || !c.qtd_pets) return null
              const ind = t === 'individual'
              return (
                <div key={t} className="flex items-center gap-3 py-2">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: ind ? 'rgba(16,185,129,0.14)' : 'rgba(139,92,246,0.14)' }}
                  >
                    <Flame className="h-4 w-4" style={{ color: ind ? '#10b981' : '#8b5cf6' }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[var(--surface-800)]">
                      Cremações {ind ? 'individuais' : 'coletivas'}
                    </p>
                    <p className="text-xs text-[var(--surface-500)]">
                      {c.qtd_pets} {c.qtd_pets === 1 ? 'pet acolhido' : 'pets acolhidos'}
                      {' × '}{fmtBRL(c.preco_unitario)}
                    </p>
                  </div>
                  <span className="text-mono text-sm text-[var(--surface-800)] shrink-0">{fmtBRL(c.valor)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Lista do mês — o espelho que dá confiança no que foi digitado */}
      <div className="card p-3 space-y-2">
        <h3 className="text-xs font-semibold text-[var(--surface-600)] uppercase tracking-wide">
          Lançamentos do mês
        </h3>

        {!carregando && lancamentos.length === 0 && (
          <p className="text-sm text-[var(--surface-500)] py-6 text-center">
            Nenhum lançamento neste mês.
          </p>
        )}

        <div className="divide-y divide-[var(--surface-200)]">
          {lancamentos.map(l => (
            <div
              key={l.id}
              onClick={() => { if (!somenteLeitura) editar(l) }}
              className={`flex items-center gap-3 py-2 -mx-1 px-1 rounded-[var(--radius-sm)] transition-colors ${somenteLeitura ? '' : 'cursor-pointer hover:bg-[var(--surface-50)]'}`}
              title={somenteLeitura ? undefined : 'Editar lançamento'}
            >
              <div className="w-8 h-8 rounded-full bg-[var(--surface-100)] flex items-center justify-center shrink-0">
                <IconeCat nome={l.fin_categorias?.icone} className="h-4 w-4 text-[var(--surface-500)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--surface-800)] truncate">
                  {l.fin_categorias?.nome || 'Sem categoria'}
                  {l.fornecedor_nome && <span className="text-[var(--surface-500)]"> · {l.fornecedor_nome}</span>}
                  {/* Só o estado que diz algo. Desde 24/09/2026 todo lançamento
                      nasce `aprovado` (não há fila), então um ✓ em toda linha
                      seria ruído; `rejeitado` só existe em registro antigo. */}
                  {l.status === 'rejeitado' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full ml-1.5 align-middle"
                          style={{ background: 'rgba(239,68,68,0.14)', color: '#ef4444' }}
                          title="Fora da DRE e do caixa">
                      rejeitado
                    </span>
                  )}
                </p>
                <p className="text-xs text-[var(--surface-500)] truncate">
                  {fmtData(l.data_competencia)}
                  {l.descricao && ` · ${l.descricao}`}
                  {l.status === 'rejeitado' && l.observacoes && ` · ${l.observacoes}`}
                </p>
              </div>
              <span
                className="text-mono text-sm shrink-0"
                style={{
                  color: l.status === 'rejeitado' ? 'var(--surface-400)' : 'var(--surface-800)',
                  textDecoration: l.status === 'rejeitado' ? 'line-through' : undefined,
                }}
              >
                {fmtBRL(l.valor)}
              </span>
              {!somenteLeitura && (
                <button
                  onClick={e => { e.stopPropagation(); reutilizar(l) }}
                  title="Reutilizar lançamento — abre um novo igual a este"
                  className="text-[var(--surface-400)] hover:text-[var(--brand-500)] shrink-0"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
              {!somenteLeitura && (
                <button
                  onClick={e => { e.stopPropagation(); void excluir(l.id) }}
                  title="Excluir"
                  className="text-[var(--surface-400)] hover:text-red-400 shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Novo lançamento */}
      <Modal
        isOpen={aberto}
        onClose={limpar}
        title={editandoId ? 'Editar lançamento' : 'Novo lançamento'}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={limpar} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={() => void salvar()} disabled={salvando} className="btn-primary text-sm">
              {salvando
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</>
                : <><Check className="h-4 w-4" /> {editandoId ? 'Salvar' : 'Lançar'}</>}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* ─────────────────────────────────────────────────────────────────
              A ORDEM DESTE MODAL É UMA ÁRVORE DE DECISÃO (13/09/2026).
              Antes, os seis campos apareciam de uma vez e quatro deles pediam
              o que o sistema já poderia deduzir. Agora cada resposta abre a
              próxima: quando → quanto → como paguei → de qual conta → pra quem
              → o que foi. O método não é dado contábil, é o caminho até a conta
              (ver o comentário em `metodo`).
              ───────────────────────────────────────────────────────────────── */}

          {/* 1. Quando + quanto — o que o operador tem na mão ao abrir */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Data do gasto</label>
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
              <label className="text-xs text-[var(--surface-500)] block mb-1">Valor</label>
              <div className="flex items-center rounded-[var(--radius-md)] border overflow-hidden"
                   style={{ borderColor: 'var(--surface-300)', background: 'var(--surface-0)' }}>
                <span className="text-sm text-[var(--surface-400)] pl-2">R$</span>
                <input
                  type="text" inputMode="decimal"
                  value={valor ? digitosParaTexto(valor) : ''}
                  onChange={e => setValor(soDigitos(e.target.value))}
                  placeholder="0,00"
                  className="w-full bg-transparent border-0 outline-none text-sm text-mono px-2 py-2 text-[var(--surface-800)]"
                />
              </div>
            </div>
          </div>

          {/* 2. Como paguei — o caminho até a conta, não um dado contábil */}
          <div>
            <label className="text-xs text-[var(--surface-500)] block mb-1.5">Pago com</label>
            <div className="flex flex-wrap gap-1.5">
              {/* Ordem pela frequência real, não pela lista do banco: transferência
                  quase ninguém mais faz desde o pix, então vai pro fim (13/09/2026). */}
              {[
                { v: 'pix', l: 'Pix' }, { v: 'credito', l: 'Crédito' },
                { v: 'debito', l: 'Débito' }, { v: 'dinheiro', l: 'Dinheiro' },
                { v: 'boleto', l: 'Boleto' }, { v: 'transferencia', l: 'Transf.' },
              ].map(op => {
                const on = metodo === op.v
                return (
                  <button
                    key={op.v} type="button"
                    // A conta se ajusta sozinha no effect acima — inclusive trocando
                    // por outra quando a atual não paga o método novo.
                    onClick={() => setMetodo(op.v)}
                    className="text-xs px-3 py-1.5 rounded-[var(--radius-md)] border transition-colors"
                    style={{
                      background: on ? 'rgba(16,185,129,0.12)' : 'transparent',
                      borderColor: on ? '#10b981' : 'var(--surface-200)',
                      color: on ? '#10b981' : 'var(--surface-600)',
                    }}
                  >{op.l}</button>
                )
              })}
            </div>
            {metodo === 'boleto' && (
              <p className="text-[11px] text-[var(--surface-400)] mt-1.5">
                Só lance o boleto depois de pago — o sistema registra o que aconteceu,
                não o que está programado.
              </p>
            )}
          </div>

          {/* 3. De qual conta — filtrada pelo método; some quando não há escolha */}
          {metodo && (
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Saiu da conta</label>
              {/* 🔴 AQUI NÃO SE CRIA CONTA — o cadastro é só na aba Contas.
                  Existiu um "+ nova conta" neste seletor, e o problema não era
                  a conveniência, era o RESULTADO: ele gravava `nome`, `ativo` e
                  `saidas: [metodo]`, e mais nada. A conta nascia sem `produto`,
                  sem `instituicao`, sem `tipo`, sem `entradas` (= não recebe de
                  forma nenhuma) e sem `liquidacao_dias`, escapando do
                  `camposDoProduto()` — a porta única onde escolher o produto
                  traz o comportamento junto. Ela aparecia na aba Contas como
                  "não classificada" e só se corrigia na mão, se alguém notasse.
                  Duas portas para o mesmo cadastro produzem dois cadastros
                  diferentes; a que produz o incompleto foi fechada. */}
              {contasQuePagam.length === 1 ? (
                // Uma opção só: confirmar o óbvio é ruído. Mostra e segue.
                <span className="text-sm text-[var(--surface-700)]">{contasQuePagam[0].nome}</span>
              ) : (
                <select
                  value={contaId}
                  onChange={e => setContaId(e.target.value)}
                  className="input text-sm w-full"
                >
                  <option value="">Escolher…</option>
                  {contasQuePagam.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.preferencial_recebimento ? '⭐ ' : ''}{c.nome}
                    </option>
                  ))}
                </select>
              )}
              {contasQuePagam.length === 0 && (
                <p className="text-[11px] text-amber-500 mt-1">
                  Nenhuma conta desta unidade paga {metodo}. Cadastre na aba
                  <strong> Contas</strong> — lá a conta nasce completa, com o produto
                  e o que ela recebe e paga. Ou marque {metodo} numa conta que já existe.
                </p>
              )}
            </div>
          )}

          {/* 4. Quando o dinheiro saiu — sempre perguntado, nunca calculado */}
          {metodo && (
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Pago em</label>
              <div className="flex gap-1 mb-1">
                {[{ v: false, l: 'Mesma data' }, { v: true, l: 'Outra' }].map(op => {
                  const on = caixaOutra === op.v
                  return (
                    <button
                      key={op.l} type="button"
                      onClick={() => { setCaixaOutra(op.v); setDataCaixa(op.v ? (dataCaixa || data) : data) }}
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
              {caixaOutra && (
                <input type="date" value={dataCaixa} onChange={e => setDataCaixa(e.target.value)}
                       className="input text-sm w-full" />
              )}
              {metodo === 'credito' && (
                <p className="text-[11px] text-[var(--surface-400)] mt-1">
                  No crédito, informe o dia em que a fatura foi (ou será) paga de verdade.
                </p>
              )}
            </div>
          )}

          {/* 5. Pra quem — antes da categoria, porque é ele que a sugere */}
          <div>
            <label className="text-xs text-[var(--surface-500)] block mb-1">Fornecedor</label>
            <input
              type="text" list="fornecedores-usados" value={fornecedor}
              onChange={e => setFornecedor(e.target.value)}
              onBlur={e => void sugerirPorFornecedor(e.target.value)}
              placeholder="Ex.: Posto Ipiranga"
              className="input text-sm w-full"
            />
            <datalist id="fornecedores-usados">
              {fornecedoresUsados.map(n => <option key={n} value={n} />)}
            </datalist>
          </div>

          {/* Categoria — árvore (categoria › subcategoria › tipo) + busca direta */}
          <div>
            <label className="text-xs text-[var(--surface-500)] block mb-1.5">Categoria</label>

            {catId ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] border"
                   style={{ borderColor: '#10b981', background: 'rgba(16,185,129,0.10)' }}>
                <span className="flex-1 text-sm text-emerald-400 truncate">{caminhoDe(catId)}</span>
                <button
                  type="button"
                  onClick={() => { setCatId(''); setDuravel(null); setBusca('') }}
                  className="text-[var(--surface-400)] hover:text-[var(--surface-700)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {/* O FORNECEDOR LEMBRA A CATEGORIA. Sugere, nunca preenche: a
                    última vez com esse fornecedor pode ter sido outra coisa. */}
                {sugestaoCat && (
                  <button
                    type="button"
                    onClick={() => { setCatId(sugestaoCat.id); setSugestaoCat(null); setBusca('') }}
                    className="w-full text-left px-3 py-2 rounded-[var(--radius-md)] border transition-colors"
                    style={{ borderColor: 'var(--surface-300)', background: 'var(--surface-50)' }}
                  >
                    <span className="text-[11px] text-[var(--surface-400)]">
                      da última vez com {fornecedor.trim()} foi
                    </span>
                    <span className="block text-sm text-[var(--surface-700)]">{sugestaoCat.caminho}</span>
                  </button>
                )}
                <div className="flex items-center rounded-[var(--radius-md)] border overflow-hidden"
                     style={{ borderColor: 'var(--surface-300)', background: 'var(--surface-0)' }}>
                  <Icons.Search className="h-4 w-4 text-[var(--surface-400)] ml-2 shrink-0" />
                  <input
                    type="text" value={busca} onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar (ex.: gasolina, troca de óleo, chocolate)"
                    className="w-full bg-transparent border-0 outline-none text-sm px-2 py-2 text-[var(--surface-800)]"
                  />
                  {busca && (
                    <button type="button" onClick={() => setBusca('')} className="px-2 text-[var(--surface-400)] hover:text-[var(--surface-700)]">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {busca.trim().length >= 2 ? (
                  /* Busca: folha + caminho inteiro */
                  <div className="max-h-64 overflow-y-auto border border-[var(--surface-200)] rounded-[var(--radius-md)] divide-y divide-[var(--surface-200)]">
                    {resultados.length === 0 && (
                      <p className="text-sm text-[var(--surface-500)] px-3 py-3">Nada encontrado.</p>
                    )}
                    {resultados.map(({ c, forte, termoBatido }) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setCatId(c.id); setDuravel(null); setBusca('') }}
                        className="w-full text-left px-3 py-2 hover:bg-[var(--surface-100)]/60"
                      >
                        <span className="text-sm text-[var(--surface-800)]">
                          {c.nome}
                          {/* achou por sinônimo: mostra qual, pra pessoa entender o pulo */}
                          {!forte && termoBatido && (
                            <span className="text-[11px] text-[var(--surface-400)]"> · {termoBatido}</span>
                          )}
                        </span>
                        <span className="block text-[11px] text-[var(--surface-500)] truncate">{caminhoDe(c.id)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  /* Drill-down em 3 colunas: Categoria › Subcategoria › Tipo */
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {([
                      { titulo: 'Categoria',    pai: null as string | null, sel: nivel1 },
                      { titulo: 'Subcategoria', pai: nivel1,                sel: nivel2 },
                      { titulo: 'Item',         pai: nivel2,                sel: null   },
                    ]).map((col, idx) => {
                      const itens = idx === 0 ? filhosDe(null) : (col.pai ? filhosDe(col.pai) : [])
                      return (
                        <div key={col.titulo} className="border border-[var(--surface-200)] rounded-[var(--radius-md)] overflow-hidden">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--surface-500)] px-2 py-1.5 bg-[var(--surface-100)]/60">
                            {col.titulo}
                          </p>
                          <div className="max-h-52 overflow-y-auto divide-y divide-[var(--surface-200)]">
                            {itens.length === 0 && (
                              <p className="text-[11px] text-[var(--surface-400)] px-2 py-3">
                                {idx === 1 ? 'Escolha a categoria' : 'Escolha a subcategoria'}
                              </p>
                            )}
                            {itens.map(c => {
                              const on = col.sel === c.id
                              const folha = !categorias.some(f => f.parent_id === c.id)
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    if (idx === 0) { setNivel1(c.id); setNivel2(null) }
                                    else if (idx === 1) setNivel2(c.id)
                                    if (folha) { setCatId(c.id); setDuravel(null) }
                                  }}
                                  className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-[var(--surface-100)]/60 transition-colors"
                                  style={{ background: on ? 'rgba(16,185,129,0.10)' : undefined }}
                                >
                                  {c.icone && (
                                    <IconeCat nome={c.icone} className={`h-3.5 w-3.5 shrink-0 ${on ? 'text-emerald-400' : 'text-[var(--surface-400)]'}`} />
                                  )}
                                  <span className={`text-xs flex-1 truncate ${on ? 'text-emerald-400' : 'text-[var(--surface-700)]'}`}>
                                    {c.nome}
                                  </span>
                                  {!folha && <Icons.ChevronRight className="h-3 w-3 text-[var(--surface-400)] shrink-0" />}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Observação — junto da categoria, que é o que ela detalha */}
          <div>
            <label className="text-xs text-[var(--surface-500)] block mb-1">Observação</label>
            <input
              type="text" value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder="Ex.: abastecimento da van"
              className="input text-sm w-full"
            />
          </div>

          {/* ⌄ MAIS OPÇÕES — os dois casos raros saem do caminho do olho */}
          <button
            type="button"
            onClick={() => setMaisOpcoes(v => !v)}
            className="text-[11px] text-[var(--surface-400)] hover:text-[var(--surface-600)]"
          >
            {maisOpcoes ? '⌃ menos opções' : '⌄ é de outra unidade · cobre mais de um mês'}
          </button>

          {maisOpcoes && (<>
          {/* COMPRA EXTERNA — "esse gasto é de outra unidade".
              Só aparece no lançamento novo: mudar o destino de uma cobrança já
              emitida deixaria a outra ponta com um documento órfão. Para
              corrigir, exclui-se e lança de novo. */}
          {!editandoId && unidades.length > 0 && (
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox" checked={!!paraOutra}
                  onChange={e => setParaOutra(e.target.checked ? (unidades[0]?.id || '') : '')}
                  className="h-4 w-4 accent-emerald-500"
                />
                <span className="text-xs text-[var(--surface-600)]">Comprei para outra unidade</span>
              </label>

              {paraOutra && (
                <div className="mt-2 pl-6 space-y-1.5">
                  <select
                    value={paraOutra} onChange={e => setParaOutra(e.target.value)}
                    className="input text-sm w-full sm:w-64"
                  >
                    {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                  <p className="text-[11px] text-[var(--surface-400)]">
                    O pagamento sai daqui e o custo vai para lá — depois que a
                    unidade reconhecer o acerto. Até isso acontecer, a despesa
                    permanece nesta unidade.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Rateio: o gasto cobre mais de um mês? (seguro anual, anuidade…) */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox" checked={rateado}
                onChange={e => setRateado(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
              <span className="text-xs text-[var(--surface-600)]">Cobre mais de um mês</span>
            </label>

            {rateado && (
              <div className="flex flex-wrap items-center gap-2 mt-2 pl-6">
                <input
                  type="number" min={2} max={120} value={meses}
                  onChange={e => setMeses(e.target.value)}
                  className="input text-sm text-mono w-20 py-1"
                />
                <span className="text-xs text-[var(--surface-500)]">meses</span>
                {digitosParaNumero(valor) > 0 && Number(meses) > 1 && (
                  <span className="text-[11px] text-[var(--surface-400)]">
                    {fmtBRL(digitosParaNumero(valor) / Number(meses))} por mês
                  </span>
                )}
              </div>
            )}
          </div>
          </>)}

          {/* Só pergunta quando a regra é mesmo ambígua (capex × opex) */}
          {catSelecionada?.pergunta_capex && (
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1.5">Durabilidade</label>
              <div className="flex gap-2">
                {[{ v: true, l: '+ de 1 ano' }, { v: false, l: '- de 1 ano' }].map(op => {
                  const on = duravel === op.v
                  return (
                    <button
                      key={op.l}
                      type="button"
                      onClick={() => setDuravel(op.v)}
                      className="text-xs px-4 py-1.5 rounded-[var(--radius-md)] border transition-colors"
                      style={{
                        background: on ? 'rgba(16,185,129,0.12)' : 'transparent',
                        borderColor: on ? '#10b981' : 'var(--surface-200)',
                        color: on ? '#10b981' : 'var(--surface-600)',
                      }}
                    >
                      {op.l}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* O ÚNICO LUGAR ONDE A CONTABILIDADE APARECE — depois de decidida, em
              uma frase. Confere-se numa linha em vez de em quatro campos, e é
              coerente com a "contabilidade invisível" (§9): o operador lê o que
              o sistema concluiu, sem ter escolhido nada disso. */}
          {(catId || contaId || metodo) && (
            <div className="text-[11px] text-[var(--surface-500)] pt-2 border-t"
                 style={{ borderColor: 'var(--surface-200)' }}>
              {(() => {
                const conta = contas.find(c => c.id === contaId)
                  || (contasQuePagam.length === 1 ? contasQuePagam[0] : null)
                const quando = dataCaixa || data
                const nat = duravel === true ? 'investimento'
                  : catSelecionada?.fin_contas?.natureza === 'capex' ? 'investimento' : null
                const grupo = catSelecionada?.fin_contas?.nome
                return (
                  <>
                    {conta ? <>Sai da <strong>{conta.nome}</strong></> : 'Conta ainda não escolhida'}
                    {quando && <> em {fmtData(quando)}</>}
                    {grupo && <> · {grupo}</>}
                    {nat && <> · {nat}</>}
                    {rateado && Number(meses) > 1 && <> · dividido em {meses} meses</>}
                  </>
                )
              })()}
            </div>
          )}

        </div>
      </Modal>
      </>)}
    </div>
  )
}
