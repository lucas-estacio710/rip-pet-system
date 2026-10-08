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

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as Icons from 'lucide-react'
import { Loader2, X, Check, Trash2, Copy, Divide } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import { useFieldPermission } from '@/hooks/useFieldPermission'
import Modal from '@/components/ui/Modal'
import CobrancasCard from './CobrancasCard'
import ReceitasPrazoTab from './ReceitasPrazoTab'
import ColarExtratoModal from './ColarExtratoModal'
import LancamentosEspeciaisModal, { type QuitacaoInicial } from './LancamentosEspeciaisModal'
import UnderlineTabs from '@/components/ui/UnderlineTabs'
import { criarIndice, sugerir, type Indice } from '@/lib/similaridade'
import { buscarCategorias } from '@/lib/busca-categoria'
import { reconhecerCobranca } from '@/lib/reconhecer-cobranca'
import type { AcaoLancar } from '@/lib/lancar'
import {
  fmtBRL, fmtData, hojeISO, limitesDoMes, colarValorBR
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
  divisao_id: string | null      // partes de um pagamento dividido (mig 149)
  origem: string                 // 'sistema' = perna de acerto, nasceu de uma cobrança
  fin_categorias?: { nome: string; icone: string | null } | null
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
type Destino = { unidadeId: string; valor: string; modo: 'agora' | 'repasse'; repasseId: string }
type UnidadeDestino = { id: string; codigo: string; nome: string; is_matriz: boolean }
type RepasseAberto = { id: string; unidade_id: string; mes_referencia: string; status: string }
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const rotuloRepasse = (r: RepasseAberto) =>
  `${MESES_CURTOS[Number(r.mes_referencia.slice(5, 7)) - 1]}/${r.mes_referencia.slice(0, 4)}`

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
export default function LancamentosTab({ somenteLeitura = false, comando = null, onComandoFeito }: {
  somenteLeitura?: boolean
  /** Do "+ Lançar" da página (lib/lancar.ts): abre o formulário certo. */
  comando?: AcaoLancar | null
  onComandoFeito?: () => void
}) {
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
  // + LANÇAR: os formulários de despesa moram na faixa Despesas, então ela abre
  // antes. Recebíveis troca a faixa e passa o comando adiante (ReceitasPrazoTab
  // é quem avisa que cumpriu, depois de carregar as operadoras).
  useEffect(() => {
    if (!comando || somenteLeitura) return
    if (comando === 'recebiveis') { setFaixa('receitas'); return }
    setFaixa('despesas')
    if (comando === 'importar') setColarAberto(true)
    else if (comando === 'despesa') setAberto(true)
    else if (comando === 'quitacao') { setEspeciaisInicial(null); setEspeciaisAberto(true) }
    onComandoFeito?.()
  }, [comando]) // eslint-disable-line react-hooks/exhaustive-deps
  // A faixa de receitas tem chave FLS própria (`obj_fin_receitas_prazo`): é uma
  // aba que a unidade pode não querer, e sem chave o item seria incontrolável —
  // regra obrigatória do CLAUDE.md, que esta aba descumpriu por algumas horas
  // em 23/09. Lido aqui, e não no page.tsx, porque a faixa vive DENTRO de
  // Lançamentos: quem esconde a aba-mãe já esconde as duas.
  const veReceitas = isVisible('tela_financeiro', 'obj_fin_receitas_prazo')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [nomeConta, setNomeConta] = useState<Map<string, string>>(new Map())
  // id do lançamento → é perna de acerto lançado por outra unidade (ver `carregar`)
  const [acertoDe, setAcertoDe] = useState<Map<string, { papel: 'despesa' | 'reembolso'; outra: string }>>(new Map())
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
  // COMPRA PARA OUTRAS UNIDADES (02/10/2026): várias unidades, cada uma com a sua
  // parte; o que sobra fica com quem comprou. Quando uma das pontas é a Matriz, cada
  // parte escolhe: cobrança direta agora (a unidade reconhece) ou dentro de um
  // repasse ainda não pago (já reconhecida — "o pagamento é o reconhecimento").
  const [destinos, setDestinos] = useState<Destino[]>([])
  const [unidades, setUnidades] = useState<UnidadeDestino[]>([])
  const [repassesAbertos, setRepassesAbertos] = useState<RepasseAberto[]>([])
  const [recarregarCobrancas, setRecarregarCobrancas] = useState(0)
  // "é de outra unidade" e "cobre mais de um mês" vivem atrás deste toggle: são
  // casos raros que ocupavam o meio do modal, no caminho do olho.
  const [maisOpcoes, setMaisOpcoes] = useState(false)
  // Fornecedores já usados nesta unidade — alimentam o autocomplete e a sugestão
  // de categoria. Digitar o nome à mão toda vez produz "Gifonni" e "Giffoni",
  // e aí nenhuma memória casa (caso real, 13/09/2026).
  const [fornecedoresUsados, setFornecedoresUsados] = useState<string[]>([])
  // Histórico da unidade pra sugerir categoria por SEMELHANÇA (lib/similaridade).
  const [indiceCat, setIndiceCat] = useState<Indice<string> | null>(null)
  const [colarAberto, setColarAberto] = useState(false)   // Colar do extrato (um botão só)
  // Muda a cada colagem registrada: remonta Receitas a Prazo, que carrega sozinha.
  const [versaoColar, setVersaoColar] = useState(0)
  const [especiaisAberto, setEspeciaisAberto] = useState(false)   // pagar repasse / fatura
  // Vindo do Colar: a linha do banco já diz valor, data e conta (null = aberto pelo botão).
  const [especiaisInicial, setEspeciaisInicial] = useState<QuitacaoInicial | null>(null)

  const catSelecionada = categorias.find(c => c.id === catId)

  /**
   * DIVIDIR UM PAGAMENTO EM CATEGORIAS (opção B, mig 149 — Lucas, 24/09/2026).
   * O valor do formulário é o TOTAL, o que aparece no banco. Cada parte extra
   * leva categoria + valor; a categoria principal fica com o RESTANTE, que a
   * tela calcula — ninguém faz conta de cabeça ("não gostei de eu mesmo ter
   * que fazer o cálculo"). Ao salvar viram N lançamentos com o mesmo
   * `divisao_id`, e a lista e o Caixa mostram que são partes de um só.
   */
  type Parte = { key: string; texto: string; catId: string; valor: string }
  const [partes, setPartes] = useState<Parte[]>([])
  // As partes escolhem entre as `folhas` (definidas mais abaixo, as mesmas do seletor principal).
  // Divisões visíveis no mês: total (o que o banco mostra) e a posição de cada parte.
  const divisoes = new Map<string, { total: number; ids: string[] }>()
  for (const l of lancamentos) {
    if (!l.divisao_id) continue
    const d = divisoes.get(l.divisao_id) || { total: 0, ids: [] }
    d.total += Number(l.valor || 0); d.ids.push(l.id)
    divisoes.set(l.divisao_id, d)
  }
  const somaPartes = partes.reduce((a, p) => a + digitosParaNumero(p.valor), 0)
  const restante = Math.round((digitosParaNumero(valor) - somaPartes) * 100) / 100

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

  // Busca no nome, no caminho E nos SINÔNIMOS: "gasolina" → Combustível,
  // "troca de óleo" → Manutenção, "chocolate" → Brinde. Mora em
  // lib/busca-categoria desde 02/10/2026: o Colar do extrato usa a MESMA busca.
  const resultados = buscarCategorias(folhas, caminhoDe, busca)

  const carregar = useCallback(async () => {
    if (!currentUnit?.id) return
    setCarregando(true)
    const { ini, fim } = limitesDoMes(mes)
    const { data } = await supabase
      .from('fin_lancamentos')
      .select('id, descricao, valor, data_competencia, data_caixa, metodo_pagamento, conta_pagamento_id, status, observacoes, fornecedor_nome, categoria_id, natureza, rateio_meses, divisao_id, origem, fin_categorias(nome, icone)')
      .eq('unidade_id', currentUnit.id)
      .gte('data_competencia', ini)
      .lte('data_competencia', fim)
      .order('data_competencia', { ascending: false })
      // As partes de uma divisão nascem no MESMO insert, com o mesmo
      // `created_at` — ordenar por ele as mantém lado a lado no dia.
      .order('created_at', { ascending: false })
    const lista = ((data as unknown as Lancamento[]) || [])
    setLancamentos(lista)

    // DE QUAL CONTA saiu — o nome, pra conferir com o extrato (02/10/2026).
    // Busca à parte, e não pelo `contas` do formulário: aquele é só o que ainda
    // se pode usar (sem legado, sem inativa), e um lançamento antigo pode ter
    // saído de uma conta que já não está lá.
    const idsConta = [...new Set(lista.map(l => l.conta_pagamento_id).filter((x): x is string => !!x))]
    const { data: cs } = idsConta.length
      ? await supabase.from('contas').select('id, nome').in('id', idsConta)
      : { data: [] }
    setNomeConta(new Map(((cs as { id: string; nome: string }[] | null) || []).map(c => [c.id, c.nome])))

    // QUEM LANÇOU — perna de acerto (origem 'sistema') nasce de uma cobrança que
    // OUTRA unidade lançou. Sem dizer isso, a despesa aparece aqui como se a
    // unidade a tivesse digitado.
    const idsSis = lista.filter(l => l.origem === 'sistema').map(l => l.id)
    const acerto = new Map<string, { papel: 'despesa' | 'reembolso'; outra: string }>()
    if (idsSis.length) {
      const lstIds = idsSis.join(',')
      const [{ data: cobs }, { data: us }] = await Promise.all([
        supabase.from('fin_cobrancas')
          .select('unidade_credora, unidade_devedora, lancamento_aceite_id, lancamento_origem_id')
          .or(`lancamento_aceite_id.in.(${lstIds}),lancamento_origem_id.in.(${lstIds})`),
        supabase.from('unidades').select('id, nome'),
      ])
      const nomeU = new Map(((us as { id: string; nome: string }[] | null) || []).map(u => [u.id, u.nome]))
      type C = { unidade_credora: string; unidade_devedora: string; lancamento_aceite_id: string | null; lancamento_origem_id: string | null }
      for (const c of (cobs as C[] | null) || []) {
        if (c.lancamento_aceite_id) acerto.set(c.lancamento_aceite_id, { papel: 'despesa', outra: nomeU.get(c.unidade_credora) || 'outra unidade' })
        if (c.lancamento_origem_id && idsSis.includes(c.lancamento_origem_id))
          acerto.set(c.lancamento_origem_id, { papel: 'reembolso', outra: nomeU.get(c.unidade_devedora) || 'outra unidade' })
      }
    }
    setAcertoDe(acerto)

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
      .select('fornecedor_nome, descricao, observacoes, categoria_id, data_competencia')
      .eq('unidade_id', currentUnit.id)
      .not('categoria_id', 'is', null)
      .neq('status', 'rejeitado')
      .order('created_at', { ascending: false })
      .limit(2000)
      .then(({ data }) => {
        type H = { fornecedor_nome: string | null; descricao: string | null; observacoes: string | null; categoria_id: string; data_competencia: string }
        const linhas = (data as unknown as H[]) || []
        const vistos = new Set<string>()
        const nomes: string[] = []
        for (const l of linhas) {
          const n = (l.fornecedor_nome || '').trim()
          const k = n.toLowerCase()
          if (n && !vistos.has(k)) { vistos.add(k); nomes.push(n) }
        }
        setFornecedoresUsados(nomes)
        // O índice de semelhança: o que foi escrito naquela vez → a categoria.
        setIndiceCat(criarIndice(linhas.map(l => ({
          // O texto do banco (lançamentos colados guardam em `observacoes`) vem
          // PRIMEIRO: é dele que a natureza ("Pix enviado:") é lida.
          texto: `${l.observacoes || ''} ${l.fornecedor_nome || ''} ${l.descricao || ''}`.trim(),
          decisao: l.categoria_id,
          chave: l.categoria_id,
          data: (l.data_competencia || '').slice(0, 10),
        }))))
      })
  }, [supabase, currentUnit?.id, aberto, colarAberto])

  /**
   * O HISTÓRICO LEMBRA A CATEGORIA — por SEMELHANÇA (01/10/2026).
   *
   * Antes era "a última vez com ESTE fornecedor, escrito igual". Agora o que foi
   * digitado (fornecedor + descrição) é comparado com as despesas anteriores da
   * unidade pelo `lib/similaridade`: palavras raras pesam mais, nome cortado
   * casa por prefixo, e a lista é de CATEGORIAS ("Urna — 3×, última 03/06"),
   * não de lançamentos. Continua valendo a regra de antes: SUGERE, NUNCA
   * PREENCHE — a última vez pode ter sido outra coisa.
   */
  const sugestoesCat = useMemo(() => {
    const q = `${fornecedor} ${descricao}`.trim()
    if (catId || !indiceCat || q.length < 2) return null
    return sugerir(indiceCat, q, undefined, { max: 3 })
  }, [catId, indiceCat, fornecedor, descricao])

  // As outras unidades do grupo — destino possível de uma compra externa.
  useEffect(() => {
    if (!currentUnit?.id) return
    supabase
      .from('unidades').select('id, codigo, nome, is_matriz')
      .eq('ativa', true).neq('id', currentUnit.id).order('nome')
      .then(({ data }) => setUnidades((data as unknown as UnidadeDestino[]) || []))
    // Repasses que ainda aceitam acerto: salvos e não pagos (pago trava).
    supabase
      .from('fin_repasses').select('id, unidade_id, mes_referencia, status')
      .in('status', ['aberto', 'enviado']).order('mes_referencia', { ascending: false })
      .then(({ data }) => setRepassesAbertos((data as unknown as RepasseAberto[]) || []))
  }, [supabase, currentUnit?.id])

  /** O repasse é sempre Matriz ↔ unidade: só há opção de repasse se uma ponta é a Matriz. */
  const unidadeDoRepasse = (destinoId: string): string | null => {
    const dest = unidades.find(u => u.id === destinoId)
    if (currentUnit?.is_matriz) return destinoId
    if (dest?.is_matriz) return currentUnit?.id || null
    return null
  }
  const somaDestinos = destinos.reduce((a, d) => a + digitosParaNumero(d.valor), 0)
  const restanteDestinos = Math.round((digitosParaNumero(valor) - somaDestinos) * 100) / 100


  // A data do pagamento acompanha a do gasto enquanto o operador não disser o
  // contrário — que é o caso da esmagadora maioria (pix, dinheiro, débito).
  useEffect(() => { if (!caixaOutra) setDataCaixa(data) }, [data, caixaOutra])

  // SÓ O CRÉDITO É A PRAZO (Lucas, 24/09/2026): *"método instantâneo — pix,
  // débito, transferência, boleto — só registra o dia do gasto e já usa ele
  // mesmo para o pagamento; quando for aprazado, acho que só crédito"*. Nos
  // instantâneos `caixaOutra` fica travado em false, e o efeito acima iguala
  // `data_caixa` à data do gasto. No crédito a pergunta vira "qual fatura".
  // Medido antes de mudar: 0 de 12 lançamentos não-crédito tinham as duas
  // datas diferentes — nada existente é reescrito ao editar.
  const aPrazo = metodo === 'credito'
  useEffect(() => { setCaixaOutra(metodo === 'credito') }, [metodo])

  /**
   * AS FATURAS DO CARTÃO. Não há tabela de fatura, e não precisa: no crédito o
   * `data_caixa` já é o VENCIMENTO (é quando a despesa sai de verdade), então
   * uma fatura é "os lançamentos de crédito deste cartão que vencem em tal dia".
   * O sistema não calcula vencimento nenhum a partir de `dia_vencimento` — o
   * Lucas recusou isso ("banco é tudo doido"): a pessoa ESCOLHE uma fatura que
   * já existe ou CRIA uma nova dizendo o dia em que ela vence.
   */
  const [faturas, setFaturas] = useState<{ venc: string; total: number; qtd: number }[]>([])
  const [novaFatura, setNovaFatura] = useState(false)
  useEffect(() => {
    if (!aPrazo || !contaId) { setFaturas([]); return }
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
      setFaturas([...m.entries()].map(([venc, v]) => ({ venc, ...v }))
        .sort((a, b) => a.venc.localeCompare(b.venc)))
    })()
    return () => { cancelado = true }
  }, [aPrazo, contaId, supabase])

  // Uma compra não entra numa fatura que venceu ANTES dela. Fica de fora da
  // lista — menos a fatura do próprio lançamento em edição, que tem de aparecer.
  const faturasPossiveis = faturas.filter(f => f.venc >= data || f.venc === dataCaixa)

  function limpar() {
    setCatId(''); setValor(''); setData(hojeISO()); setPartes([])
    setFornecedor(''); setDescricao(''); setDuravel(null)
    setRateado(false); setMeses('12')
    setDataCaixa(''); setContaId(''); setNovaFatura(false)
    setBusca(''); setNivel1(null); setNivel2(null)
    setDestinos([]); setMetodo(''); setMaisOpcoes(false)
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
    setDataCaixa((l.data_caixa || '').slice(0, 10)); setNovaFatura(false); setPartes([])
    setContaId(l.conta_pagamento_id || '')
    setMetodo(l.metodo_pagamento || '')
    // Reabre fiel ao gravado: se a data do gasto não é hoje, o toggle tem que
    // mostrar "Outra" com o campo aberto — senão editar um lançamento antigo
    // esconde a data dele.
    setDataOutra((l.data_competencia || '').slice(0, 10) !== hojeISO())
    setCaixaOutra(!!l.data_caixa && (l.data_caixa || '').slice(0, 10) !== (l.data_competencia || '').slice(0, 10))
    setBusca(''); setNivel1(null); setNivel2(null)
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
    // No crédito a fatura é obrigatória, e conferida contra a LISTA — não
    // contra "dataCaixa preenchido": quem troca de Pix para Crédito chega aqui
    // com a data do Pix ainda guardada, e ela passaria como vencimento.
    if (aPrazo && !novaFatura && !faturasPossiveis.some(f => f.venc === dataCaixa)) {
      return toast('Escolha a fatura do cartão (ou crie uma nova)', 'error')
    }
    if (aPrazo && novaFatura && (!dataCaixa || dataCaixa < data)) {
      return toast('A fatura nova precisa vencer no dia do gasto ou depois', 'error')
    }
    if (!Number.isFinite(v) || v <= 0) return toast('O valor precisa ser maior que zero', 'error')
    if (catSelecionada?.pergunta_capex && duravel === null) {
      return toast('Responda se vai durar mais de um ano', 'error')
    }
    if (partes.length) {
      if (partes.some(pt => !pt.catId)) return toast('Escolha a categoria de cada parte', 'error')
      if (partes.some(pt => digitosParaNumero(pt.valor) <= 0)) return toast('Cada parte precisa de um valor', 'error')
      // A principal fica com o que sobra, então ela precisa sobrar com algo.
      if (restante <= 0) return toast('As partes somam o total ou mais — sobra nada para a categoria principal', 'error')
      // Uma cobrança pra outra unidade sobre só uma das partes seria ambígua.
      if (destinos.length) return toast('Lançamento dividido não pode ser "comprado para outra unidade"', 'error')
    }
    if (destinos.length) {
      if (destinos.some(d => !d.unidadeId)) return toast('Escolha a unidade de cada cobrança', 'error')
      if (new Set(destinos.map(d => d.unidadeId)).size !== destinos.length) return toast('Cada unidade entra uma vez só', 'error')
      if (destinos.some(d => digitosParaNumero(d.valor) <= 0)) return toast('Cada unidade precisa de um valor', 'error')
      if (restanteDestinos < 0) return toast('As cobranças passam do total do lançamento', 'error')
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
        const criacao = {
          unidade_id: currentUnit.id,
          origem: 'manual',
          criado_por_nome: userName || null,
          status: 'aprovado',
          aprovado_por: user?.id || null,
          aprovado_por_nome: userName || null,
          aprovado_em: new Date().toISOString(),
        }

        if (partes.length) {
          // DIVIDIDO: um insert só com todas as partes — ou entram todas, ou
          // nenhuma (um pagamento pela metade descasaria do banco). Cada parte
          // deriva conta e natureza da PRÓPRIA categoria, como a principal.
          const divisao_id = crypto.randomUUID()
          const linhas = [
            { ...campos, ...criacao, valor: restante, divisao_id },
            ...partes.map(pt => {
              const cat = categorias.find(c => c.id === pt.catId)
              const cc = cat?.fin_contas
              return {
                ...campos, ...criacao, divisao_id,
                categoria_id: pt.catId,
                conta_id: cat?.fin_conta_id || null,
                conta_codigo: cc?.codigo || null,
                conta_nome: cc?.nome || null,
                natureza: cc?.natureza || 'opex',
                valor: digitosParaNumero(pt.valor),
              }
            }),
          ]
          const { error } = await supabase.from('fin_lancamentos').insert(linhas)
          if (error) throw new Error(error.message)
          toast(`Lançado ${fmtBRL(v)} dividido em ${linhas.length} categorias`, 'success')
          limpar()
          await carregar()
          return
        }

        const { data: novo, error } = await supabase.from('fin_lancamentos').insert({
          ...campos,
          ...criacao,
        }).select('id').single()
        if (error) throw new Error(error.message)

        // COMPRA PARA OUTRAS UNIDADES: o gasto sai do caixa daqui e o custo é de
        // lá. O lançamento acima fica com o valor CHEIO; cada cobrança, quando
        // conta, põe a despesa na unidade e o reembolso aqui — então aqui sobra só
        // a parte de quem comprou. Ver FLOW_FINANCEIRO §9.5.
        //   · agora   → cobrança `emitida`: a unidade reconhece (ou recusa).
        //   · repasse → já reconhecida (pernas na DRE agora) e, se um repasse foi
        //               escolhido, presa nele (`repasse_id`, `liquidada`) — é como o
        //               Salvar do repasse marca o que compensou. Sem repasse
        //               escolhido, fica `aceita` e entra no próximo que for salvo.
        const desc = descricao.trim() || fornecedor.trim() || caminhoDe(catId)
        for (const d of destinos) {
          const vd = digitosParaNumero(d.valor)
          const alvo = unidades.find(u => u.id === d.unidadeId)
          const { data: cob, error: e2 } = await supabase.from('fin_cobrancas').insert({
            unidade_credora: currentUnit.id,     // quem pagou, tem a receber
            unidade_devedora: d.unidadeId,       // quem consumiu, deve
            tipo: 'despesa_rateada',
            valor: vd,
            data: data_competencia,              // o custo é do mês do gasto
            descricao: desc,
            categoria_id: catId,                 // a classificação viaja junto
            status: 'emitida',
            lancamento_origem_id: (novo as { id: string }).id,
            criado_por_nome: userName || null,
          }).select('id').single()
          if (e2) throw new Error(`${alvo?.nome || 'Unidade'}: ${e2.message}`)
          if (d.modo === 'repasse' && unidadeDoRepasse(d.unidadeId)) {
            const cobId = (cob as { id: string }).id
            await reconhecerCobranca(supabase, {
              id: cobId, tipo: 'despesa_rateada', valor: vd, data: data_competencia,
              descricao: desc, categoria_id: catId,
              unidade_credora: currentUnit.id, unidade_devedora: d.unidadeId,
              credoraNome: currentUnit.nome, devedoraCodigo: alvo?.codigo || null,
              fin_categorias: catSelecionada ? { fin_conta_id: catSelecionada.fin_conta_id, fin_contas: catSelecionada.fin_contas || null } : null,
            }, { userName })
            if (d.repasseId) {
              const { error: e3 } = await supabase.from('fin_cobrancas')
                .update({ repasse_id: d.repasseId, status: 'liquidada' }).eq('id', cobId)
              if (e3) throw new Error(`${alvo?.nome || 'Unidade'}: ${e3.message}`)
            }
          }
        }
        if (destinos.length) setRecarregarCobrancas(n => n + 1)
      }

      toast(
        editandoId ? `Lançamento atualizado — ${fmtBRL(v)}`
          : destinos.length ? `Lançado ${fmtBRL(v)} — ${destinos.length} ${destinos.length > 1 ? 'unidades cobradas' : 'unidade cobrada'}`
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

  const total = lancamentos.reduce((s, l) => s + Number(l.valor || 0), 0)

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
      {/* COLAR DO EXTRATO — um botão só, acima das duas faixas (02/10/2026):
          cola-se o extrato inteiro e cada linha vai pro seu lugar. */}
      <div className="flex items-end gap-3">
        <div className="flex-1 min-w-0">
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
        </div>
        {/* "Colar do extrato" virou "Importar extrato" no + Lançar do topo (08/10/2026). */}
      </div>

      {veReceitas && faixa === 'receitas' ? (
        <div className="space-y-3">
          <input
            type="month" value={mes} onChange={e => setMes(e.target.value)}
            className="input text-sm w-36 py-1"
          />
          <ReceitasPrazoTab key={versaoColar} somenteLeitura={somenteLeitura} mes={mes}
            comando={comando === 'recebiveis'} onComandoFeito={onComandoFeito} />
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
        </span>
        {carregando && <Loader2 className="h-4 w-4 animate-spin text-[var(--surface-400)]" />}
        {/* "Novo lançamento" e "Lançamentos especiais" foram pro + Lançar (Despesa / Quitação). */}
      </div>

      {/* O bloco "Custos automáticos" (cremações do mês pelo acolhimento) SAIU
          daqui em 02/10/2026: é custo da DRE, não despesa digitada — "isso é DRE
          entrando aqui" (Lucas). Continua na DRE, por vw_custo_cremacao_competencia. */}
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
          {lancamentos.map(l => {
            // Perna de acerto: nasceu de uma cobrança. Editar ou excluir por aqui
            // desencontraria a cobrança, o repasse e a DRE da outra ponta — o
            // ajuste é na aba Acertos do Repasse (ou no "Não é meu" da cobrança).
            const ac = acertoDe.get(l.id)
            const travadaAqui = somenteLeitura || !!ac
            return (
            <div
              key={l.id}
              onClick={() => {
                if (ac) return toast(`Lançado por ${ac.papel === 'despesa' ? ac.outra : 'um acerto'} — ajuste na aba Acertos do Repasse`, 'error')
                if (!somenteLeitura) editar(l)
              }}
              className={`flex items-center gap-3 py-2 -mx-1 px-1 rounded-[var(--radius-sm)] transition-colors ${travadaAqui ? '' : 'cursor-pointer hover:bg-[var(--surface-50)]'}`}
              title={travadaAqui ? undefined : 'Editar lançamento'}
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
                  {/* O IDENTIFICADOR: "cadê o de 200 e o de 800 no extrato? Ah,
                      é dividido — tá aqui os 1.000" (Lucas). O total é o que
                      aparece no banco, e ele é o que se procura lá. */}
                  {l.divisao_id && divisoes.get(l.divisao_id) && (
                    <span className="inline-flex items-center gap-0.5 mr-1.5 px-1.5 rounded-full align-middle"
                          style={{ background: 'rgba(99,102,241,0.14)', color: '#818cf8' }}
                          title="Partes de um só pagamento — no extrato do banco aparece o total">
                      <Divide className="h-2.5 w-2.5" />
                      {divisoes.get(l.divisao_id)!.ids.indexOf(l.id) + 1}/{divisoes.get(l.divisao_id)!.ids.length} de {fmtBRL(divisoes.get(l.divisao_id)!.total)}
                    </span>
                  )}
                  {ac && (
                    <span className="inline-block mr-1.5 px-1.5 rounded-full align-middle"
                          style={{ background: 'rgba(245,158,11,0.14)', color: '#f59e0b' }}
                          title="Nasceu de um acerto entre unidades — não foi digitado aqui">
                      {ac.papel === 'despesa' ? `lançado por ${ac.outra}` : `reembolso de ${ac.outra}`}
                    </span>
                  )}
                  {fmtData(l.data_competencia)}
                  {l.conta_pagamento_id && nomeConta.get(l.conta_pagamento_id) && (
                    <span className="text-[var(--surface-600)]"> · {nomeConta.get(l.conta_pagamento_id)}</span>
                  )}
                  {l.descricao && ` · ${l.descricao}`}
                  {/* Em lançamento colado do extrato, a observação é o texto do
                      banco — é o que se procura no extrato na conferência. */}
                  {l.observacoes && ` · ${l.observacoes}`}
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
              {!travadaAqui && (
                <button
                  onClick={e => { e.stopPropagation(); reutilizar(l) }}
                  title="Reutilizar lançamento — abre um novo igual a este"
                  className="text-[var(--surface-400)] hover:text-[var(--brand-500)] shrink-0"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
              {!travadaAqui && (
                <button
                  onClick={e => { e.stopPropagation(); void excluir(l.id) }}
                  title="Excluir"
                  className="text-[var(--surface-400)] hover:text-red-400 shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            )
          })}
        </div>
      </div>

      <ColarExtratoModal
        aberto={colarAberto}
        onClose={() => setColarAberto(false)}
        categorias={categorias}
        folhas={folhas}
        caminhoDe={caminhoDe}
        mes={mes}
        permiteReceitas={veReceitas}
        onRegistrou={() => { void carregar(); setVersaoColar(v => v + 1) }}
        onQuitar={q => { setColarAberto(false); setEspeciaisInicial(q); setEspeciaisAberto(true) }}
      />

      <LancamentosEspeciaisModal
        aberto={especiaisAberto}
        inicial={especiaisInicial}
        onClose={() => { setEspeciaisAberto(false); setEspeciaisInicial(null) }}
        onRegistrou={() => { void carregar(); setVersaoColar(v => v + 1) }}
      />

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
                  // Colar lê como número brasileiro: "966,1" do CSV = 966,10 (ver colarValorBR).
                  onPaste={e => { const d = colarValorBR(e.clipboardData.getData('text')); if (d !== null) { e.preventDefault(); setValor(d) } }}
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

          {/* 4. QUAL FATURA — só no crédito, o único meio de pagamento a prazo.
              Nos instantâneos (pix, débito, dinheiro, boleto, transferência) não
              há pergunta: o dinheiro sai no dia do gasto (24/09/2026). */}
          {aPrazo && (
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Fatura</label>
              {!novaFatura ? (
                <select
                  value={faturasPossiveis.some(f => f.venc === dataCaixa) ? dataCaixa : ''}
                  onChange={e => {
                    if (e.target.value === '__nova') { setNovaFatura(true); setDataCaixa('') }
                    else setDataCaixa(e.target.value)
                  }}
                  className="input text-sm w-full"
                >
                  <option value="">Escolher…</option>
                  {faturasPossiveis.map(f => (
                    <option key={f.venc} value={f.venc}>
                      Vence {fmtData(f.venc)} · {fmtBRL(f.total)} em {f.qtd} {f.qtd === 1 ? 'lançamento' : 'lançamentos'}
                    </option>
                  ))}
                  <option value="__nova">+ Nova fatura…</option>
                </select>
              ) : (
                <div className="flex gap-1">
                  <input type="date" value={dataCaixa} min={data}
                         onChange={e => setDataCaixa(e.target.value)}
                         className="input text-sm flex-1 min-w-0" autoFocus />
                  <button type="button" onClick={() => { setNovaFatura(false); setDataCaixa('') }}
                          className="text-[11px] text-[var(--surface-400)] hover:underline shrink-0 px-1">
                    voltar à lista
                  </button>
                </div>
              )}
              <p className="text-[11px] text-[var(--surface-400)] mt-1">
                {novaFatura
                  ? 'Informe o dia em que esta fatura vence. Os próximos lançamentos deste cartão já vão encontrá-la na lista.'
                  : faturasPossiveis.length
                    ? 'A despesa conta no mês do gasto; sai do caixa quando a fatura vence.'
                    : 'Nenhuma fatura aberta neste cartão — crie a primeira em "+ Nova fatura".'}
              </p>
            </div>
          )}

          {/* 5. Pra quem — antes da categoria, porque é ele que a sugere */}
          <div>
            <label className="text-xs text-[var(--surface-500)] block mb-1">Fornecedor</label>
            <input
              type="text" list="fornecedores-usados" value={fornecedor}
              onChange={e => setFornecedor(e.target.value)}
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
              <>
              <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] border"
                   style={{ borderColor: '#10b981', background: 'rgba(16,185,129,0.10)' }}>
                <span className="flex-1 text-sm text-emerald-400 truncate">{caminhoDe(catId)}</span>
                {partes.length > 0 && (
                  <span className="text-xs text-mono text-emerald-400 shrink-0" title="O que sobra do total fica aqui">
                    {fmtBRL(Math.max(restante, 0))}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => { setCatId(''); setDuravel(null); setBusca('') }}
                  className="text-[var(--surface-400)] hover:text-[var(--surface-700)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Editando uma PARTE: o total da divisão é o que o banco mostra;
                  mudar o valor daqui sem mexer nas irmãs descasa do extrato. */}
              {editandoId && (() => {
                const esta = lancamentos.find(x => x.id === editandoId)
                const dv = esta?.divisao_id ? divisoes.get(esta.divisao_id) : null
                return dv ? (
                  <p className="text-[11px] mt-1.5" style={{ color: '#818cf8' }}>
                    ÷ Parte {dv.ids.indexOf(editandoId) + 1} de {dv.ids.length} de um pagamento de {fmtBRL(dv.total)}.
                    Se mudar o valor, ajuste as outras partes para a soma continuar batendo com o banco.
                  </p>
                ) : null
              })()}

              {/* DIVIDIR — só em lançamento NOVO: numa edição, mexer nas partes
                  de uma divisão que já existe descasaria as outras do banco. */}
              {!editandoId && (
                <div className="mt-2 space-y-1.5">
                  {partes.map((pt, i) => (
                    <div key={pt.key} className="flex items-center gap-1.5">
                      <input
                        list="lanc-cats-folhas"
                        value={pt.texto}
                        placeholder="Categoria desta parte…"
                        onChange={e => {
                          const texto = e.target.value
                          const achou = folhas.find(f => caminhoDe(f.id) === texto)
                          setPartes(ps => ps.map((x, j) => j === i ? { ...x, texto, catId: achou?.id || '' } : x))
                        }}
                        className="input text-sm flex-1 min-w-0"
                        style={pt.texto && !pt.catId ? { borderColor: '#f59e0b' } : undefined}
                      />
                      <input
                        inputMode="numeric"
                        value={pt.valor ? digitosParaTexto(pt.valor) : ''}
                        placeholder="0,00"
                        onChange={e => {
                          const d = soDigitos(e.target.value)
                          setPartes(ps => ps.map((x, j) => j === i ? { ...x, valor: d } : x))
                        }}
                        onPaste={e => {
                          const d = colarValorBR(e.clipboardData.getData('text'))
                          if (d === null) return
                          e.preventDefault()
                          setPartes(ps => ps.map((x, j) => j === i ? { ...x, valor: d } : x))
                        }}
                        className="input text-sm text-mono w-28 text-right"
                      />
                      <button type="button" title="Tirar esta parte"
                              onClick={() => setPartes(ps => ps.filter((_, j) => j !== i))}
                              className="text-[var(--surface-400)] hover:text-red-400 shrink-0">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <datalist id="lanc-cats-folhas">
                    {folhas.map(f => <option key={f.id} value={caminhoDe(f.id)} />)}
                  </datalist>
                  <button
                    type="button"
                    onClick={() => setPartes(ps => [...ps, { key: crypto.randomUUID(), texto: '', catId: '', valor: '' }])}
                    className="text-[11px] text-[var(--brand-500)] hover:underline inline-flex items-center gap-1"
                  >
                    <Divide className="h-3 w-3" />
                    {partes.length ? '+ outra parte' : 'Dividir em mais categorias'}
                  </button>
                  {partes.length > 0 && (
                    <p className="text-[11px]" style={{ color: restante > 0 ? 'var(--surface-500)' : '#ef4444' }}>
                      {restante > 0
                        ? <>Total {fmtBRL(digitosParaNumero(valor))} → vira {partes.length + 1} lançamentos com o mesmo identificador. O que sobra fica na categoria de cima.</>
                        : <>As partes já somam {fmtBRL(somaPartes)} — passam do total de {fmtBRL(digitosParaNumero(valor))}.</>}
                    </p>
                  )}
                </div>
              )}
              </>
            ) : (
              <div className="space-y-2">
                {/* O HISTÓRICO LEMBRA A CATEGORIA, por semelhança. Sugere, nunca
                    preenche. Com confiança alta a primeira vem destacada; abaixo
                    disso todas em cinza — sugestão pré-escolhida e errada custa
                    mais do que nenhuma. */}
                {sugestoesCat && sugestoesCat.sugestoes.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-[var(--surface-400)]">parecido com o que já foi lançado:</p>
                    {sugestoesCat.sugestoes.map((sg, k) => {
                      const destaque = k === 0 && sugestoesCat.confianca === 'alta'
                      return (
                        <button
                          key={sg.chave} type="button"
                          onClick={() => { setCatId(sg.decisao); setBusca('') }}
                          className="w-full text-left px-3 py-1.5 rounded-[var(--radius-md)] border transition-colors flex items-center gap-2"
                          style={{
                            borderColor: destaque ? '#10b981' : 'var(--surface-300)',
                            background: destaque ? 'rgba(16,185,129,0.08)' : 'var(--surface-50)',
                          }}
                        >
                          <span className="flex-1 min-w-0 text-sm truncate"
                                style={{ color: destaque ? '#10b981' : 'var(--surface-700)' }}>
                            {caminhoDe(sg.decisao)}
                          </span>
                          <span className="text-[11px] text-[var(--surface-400)] shrink-0">
                            {sg.vezes}× · última {fmtData(sg.ultima)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
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
                  type="checkbox" checked={destinos.length > 0}
                  onChange={e => setDestinos(e.target.checked
                    ? [{ unidadeId: '', valor: '', modo: 'repasse', repasseId: '' }] : [])}
                  className="h-4 w-4 accent-emerald-500"
                />
                <span className="text-xs text-[var(--surface-600)]">Comprei para outras unidades</span>
              </label>

              {destinos.length > 0 && (
                <div className="mt-2 pl-6 space-y-2">
                  {destinos.map((d, idx) => {
                    const doRepasse = d.unidadeId ? unidadeDoRepasse(d.unidadeId) : null
                    const opcoes = repassesAbertos.filter(r => r.unidade_id === doRepasse)
                    const mudar = (patch: Partial<Destino>) =>
                      setDestinos(prev => prev.map((x, k) => (k === idx ? { ...x, ...patch } : x)))
                    return (
                      <div key={idx} className="rounded-[var(--radius-md)] border border-[var(--surface-200)] p-2 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={d.unidadeId}
                            onChange={e => mudar({ unidadeId: e.target.value, repasseId: '',
                              modo: unidadeDoRepasse(e.target.value) ? d.modo : 'agora' })}
                            className="input text-sm flex-1 min-w-[9rem]"
                          >
                            <option value="">Unidade…</option>
                            {unidades.map(u => (
                              <option key={u.id} value={u.id}
                                disabled={destinos.some((x, k) => k !== idx && x.unidadeId === u.id)}>{u.nome}</option>
                            ))}
                          </select>
                          <div className="flex items-center rounded-[var(--radius-md)] border overflow-hidden w-32"
                               style={{ borderColor: 'var(--surface-300)', background: 'var(--surface-0)' }}>
                            <span className="text-xs text-[var(--surface-400)] pl-2">R$</span>
                            <input
                              type="text" inputMode="decimal"
                              value={d.valor ? digitosParaTexto(d.valor) : ''}
                              onChange={e => mudar({ valor: soDigitos(e.target.value) })}
                              onPaste={e => { const v2 = colarValorBR(e.clipboardData.getData('text')); if (v2 !== null) { e.preventDefault(); mudar({ valor: v2 }) } }}
                              placeholder="0,00"
                              className="w-full bg-transparent border-0 outline-none text-sm text-mono px-1.5 py-1.5 text-[var(--surface-800)]"
                            />
                          </div>
                          <button type="button" onClick={() => setDestinos(prev => prev.filter((_, k) => k !== idx))}
                            className="p-1 text-[var(--surface-400)] hover:text-red-400" title="Tirar esta unidade">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {d.unidadeId && (doRepasse ? (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input type="radio" checked={d.modo === 'repasse'} onChange={() => mudar({ modo: 'repasse' })} className="accent-emerald-500" />
                              no repasse
                            </label>
                            {d.modo === 'repasse' && (
                              <select value={d.repasseId} onChange={e => mudar({ repasseId: e.target.value })} className="input text-xs py-1">
                                <option value="">o próximo que for salvo</option>
                                {opcoes.map(r => <option key={r.id} value={r.id}>{rotuloRepasse(r)}</option>)}
                              </select>
                            )}
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input type="radio" checked={d.modo === 'agora'} onChange={() => mudar({ modo: 'agora' })} className="accent-emerald-500" />
                              cobrar agora
                            </label>
                          </div>
                        ) : (
                          <p className="text-[11px] text-[var(--surface-400)]">Cobrança direta — a unidade reconhece em Acertos entre unidades.</p>
                        ))}
                      </div>
                    )
                  })}
                  <div className="flex flex-wrap items-center gap-3">
                    {destinos.length < unidades.length && (
                      <button type="button"
                        onClick={() => setDestinos(prev => [...prev, { unidadeId: '', valor: '', modo: 'repasse', repasseId: '' }])}
                        className="text-xs text-emerald-500 hover:underline">+ outra unidade</button>
                    )}
                    {digitosParaNumero(valor) > 0 && (
                      <span className={`text-[11px] ${restanteDestinos < 0 ? 'text-red-400' : 'text-[var(--surface-400)]'}`}>
                        {restanteDestinos < 0
                          ? `As cobranças passam do total em ${fmtBRL(-restanteDestinos)}`
                          : `Fica com ${currentUnit?.nome}: ${fmtBRL(restanteDestinos)}`}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--surface-400)]">
                    No repasse: já conta na DRE da unidade, no mês do gasto, e o
                    dinheiro anda quando ela quitar o repasse. Cobrar agora: a
                    unidade reconhece antes de contar.
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
                // No crédito, só diz "quando sai" depois de escolhida a fatura.
                const quando = aPrazo
                  ? ((novaFatura || faturasPossiveis.some(f => f.venc === dataCaixa)) ? dataCaixa : '')
                  : data
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
