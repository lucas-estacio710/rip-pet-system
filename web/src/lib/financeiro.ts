// Módulo financeiro — regras de lançamento (puro, sem I/O).
//
// PRINCÍPIO (doc §2, "contabilidade invisível"): o operador responde só O QUE FOI,
// QUANTO e COMO PAGOU. Conta contábil, custo × despesa, opex × capex e as duas
// datas saem DERIVADOS daqui — ele nunca escolhe nada disso.

export type MetodoPagamento = 'pix' | 'dinheiro' | 'debito' | 'credito' | 'boleto' | 'transferencia' | 'outro'

export const METODOS: { valor: MetodoPagamento; label: string }[] = [
  { valor: 'pix', label: 'Pix' },
  { valor: 'debito', label: 'Débito' },
  { valor: 'credito', label: 'Crédito' },
  { valor: 'dinheiro', label: 'Dinheiro' },
  { valor: 'boleto', label: 'Boleto' },
  { valor: 'transferencia', label: 'Transferência' },
]

/**
 * AS DUAS DATAS, derivadas sem perguntar nada.
 *
 * competência = quando o gasto aconteceu (a data que o operador informa).
 * caixa       = quando o dinheiro sai. À vista é o mesmo dia; no CRÉDITO ainda
 *               não se sabe (depende do vencimento da fatura), então fica NULA —
 *               que é exatamente o estado que o modelo prevê.
 *
 * É isso que permite a DRE alternar entre competência e caixa depois, sem que
 * ninguém tenha ouvido as palavras "competência" ou "caixa".
 */
export function derivarDatas(dataGasto: string, metodo: MetodoPagamento | ''): {
  data_competencia: string
  data_caixa: string | null
} {
  const aVista = metodo === 'pix' || metodo === 'dinheiro' || metodo === 'debito' || metodo === 'transferencia'
  return { data_competencia: dataGasto, data_caixa: aVista ? dataGasto : null }
}

/**
 * O CAIXA, perguntado sem dizer "caixa".
 *
 * O operador vê um campo de data e uma conta — não vê que está alimentando o
 * fluxo de caixa. O rótulo muda conforme o método, e é o rótulo que ENSINA:
 * no crédito ele lê "Vence a fatura em" e entende sozinho por que a data é
 * outra. Ninguém precisa explicar regime de caixa.
 */
export function rotuloCaixa(metodo: MetodoPagamento | ''): { label: string; dica: string | null } {
  if (metodo === 'credito') return {
    label: 'Vence a fatura em',
    dica: 'A compra é de hoje, mas o dinheiro só sai quando a fatura vencer.',
  }
  if (metodo === 'boleto') return {
    label: 'Vence em',
    dica: 'O dinheiro sai na data de vencimento do boleto.',
  }
  return { label: 'Saiu da conta em', dica: null }
}

/** Rótulo curto do porquê da data de caixa — usado só em tela de conferência. */
export function explicarCaixa(metodo: MetodoPagamento | ''): string | null {
  if (metodo === 'credito') return 'sai na fatura'
  if (metodo === 'boleto') return 'sai no vencimento'
  return null
}

/**
 * ESCOLHA DA CONTA POR MÉTODO (mig 122).
 *
 * A conta declara o que recebe (`entradas`) e o que paga (`saidas`). Antes disso,
 * o acerto pré-selecionava `contas[0]` — a primeira em ordem alfabética — e o
 * mega pagamento do pipeline tinha **UUID de conta de Santos chumbado no
 * código**, o que fazia toda outra unidade gravar o recebimento na conta errada.
 *
 * ⚠️ LISTA VAZIA = SEM RESTRIÇÃO, mas em ÚLTIMO LUGAR. Conta que ninguém
 * configurou continua aparecendo (senão a migration deixaria as telas sem opção),
 * só que agora perde para qualquer uma que DECLARE aceitar o método — e um
 * cartão de crédito nunca entra no lado das entradas. Ver `contaPadraoPara`.
 */
export type ContaEscolhivel = {
  id: string
  entradas?: string[] | null
  saidas?: string[] | null
  preferencial_recebimento?: boolean | null
  /** `cartao_credito` nunca recebe pagamento de cliente (mig 130). */
  produto?: string | null
}

/** Contas que aceitam este método no lado indicado. */
export function contasQueAceitam<T extends ContaEscolhivel>(
  contas: T[], metodo: string, lado: 'entradas' | 'saidas' = 'entradas'
): T[] {
  return contas.filter(c => {
    // 🔴 Um CARTÃO DE CRÉDITO não recebe pagamento de cliente. Ninguém paga um
    // velório no cartão de crédito da empresa — o cartão é meio de PAGAR, não de
    // receber. Isso não depende de configuração: é o que o produto é.
    if (lado === 'entradas' && c.produto === 'cartao_credito') return false
    const lista = c[lado] || []
    return lista.length === 0 || lista.includes(metodo)
  })
}

/**
 * Qual conta vem pré-selecionada no recebimento.
 *
 * 🔴 A ORDEM IMPORTA, e o defeito que ela conserta custou dinheiro de verdade:
 * até 12/09/2026 isto devolvia simplesmente `aceitam[0]`, e como "array vazio"
 * significa "sem restrição" (mig 122), a única conta NÃO configurada de Santos
 * era elegível para tudo — e ganhava por vir primeiro no alfabeto. Resultado:
 * **19 recebimentos, R$ 15.840, caíram no "Cartão Pessoal NuBank"**, incluindo
 * pix e dinheiro.
 *
 * A regra do array vazio nasceu quando NENHUMA conta estava configurada, para
 * que as telas não ficassem sem opção. Depois que as migs 130/131 classificaram
 * as demais, a não configurada virou coringa. Agora ela é o ÚLTIMO recurso:
 *
 *   1. preferencial que declara aceitar o método
 *   2. qualquer uma que declara aceitar o método
 *   3. as não configuradas — só se nenhuma declarou
 */
export function contaPadraoPara<T extends ContaEscolhivel>(contas: T[], metodo: string): string {
  const aceitam = contasQueAceitam(contas, metodo, 'entradas')
  const declaram = aceitam.filter(c => (c.entradas || []).includes(metodo))
  const candidatas = declaram.length ? declaram : aceitam
  return (candidatas.find(c => c.preferencial_recebimento) || candidatas[0])?.id || ''
}

/**
 * PARA ONDE VAI O RECEBIMENTO — a porta única das três telas (13/09/2026).
 *
 * 🔴 O PROBLEMA QUE ISTO RESOLVE: a conta era escolhida em silêncio. Os dois mega
 * pagamentos (`contratos/page.tsx` e `[id]/page.tsx`) chamavam `contaPadraoPara`
 * e GRAVAVAM, sem nada na tela — herança do conserto da mig 122, que tirou os
 * UUIDs chumbados mas manteve a premissa de que não se pergunta o que dá pra
 * deduzir. Quando a dedução errava, ninguém via: em 13/09 mediu-se que o default
 * em produção era "Cartão Pessoal NuBank" para os QUATRO métodos em Santos,
 * "Crédito Daniel" em SJ e "Crédito C6" em CP — 73 recebimentos, R$ 66.359,50,
 * registrados em conta de cartão de crédito porque foi o que a tela ofereceu.
 *
 * A REGRA (decisão do Lucas, 13/09/2026):
 *
 *   unidade COM o financeiro   → escolhe a conta, e o campo aparece na tela
 *   unidade SEM o financeiro   → conta LEGADA, sempre. Sem escolha, sem exceção
 *
 * Por que legada e não a conta "certa" da unidade: quem não contratou o módulo
 * não abre a aba Contas, logo não tem como cadastrar nem curar conta nenhuma.
 * Legada diz a verdade — "é dinheiro desta unidade, em lugar não identificado" —
 * enquanto apontar para uma conta específica inventaria um histórico que não
 * aconteceu. Foi essa invenção que produziu os 73.
 *
 * ⚠️ `temFinanceiro` vem de `hasModule('tela_financeiro')`, que retorna SEMPRE
 * `true` para super_admin (decisão consciente, 13/09: consistência com o resto do
 * código). Consequência real: o super_admin logado numa unidade sem o módulo vê
 * o seletor e grava na conta escolhida, enquanto o operador da MESMA unidade
 * grava na legada. O mesmo pagamento vai para lugares diferentes conforme quem
 * registra. Se algum dia isso incomodar, o conserto é aqui e em um lugar só:
 * trocar por uma leitura do FLS real da unidade.
 *
 * `contas` deve trazer TODAS as contas ativas da unidade, legada inclusa — as
 * telas filtravam `legado=false` na query, e sem a legada não há para onde ir.
 */
export function destinoDoRecebimento<T extends ContaEscolhivel & { legado?: boolean | null }>(
  contas: T[], metodo: string, temFinanceiro: boolean,
): { contaId: string; opcoes: T[]; editavel: boolean; legada: boolean } {
  const legada = contas.find(c => c.legado)
  if (!temFinanceiro) {
    return { contaId: legada?.id || '', opcoes: legada ? [legada] : [], editavel: false, legada: true }
  }
  const proprias = contas.filter(c => !c.legado)
  const opcoes = contasQueAceitam(proprias, metodo, 'entradas')
  const padrao = contaPadraoPara(proprias, metodo)
  // Nenhuma conta aceita este método — cai na legada, que é o que a unidade sem
  // o módulo já faz. Medido em 13/09: SP, PA, RS e a Matriz não têm conta que
  // receba pix nem crédito, e sem este desvio o pagamento gravaria `conta_id`
  // NULO, que some do caixa sem deixar rastro. Legada é impreciso; nulo é perdido.
  if (!padrao && legada) return { contaId: legada.id, opcoes: [legada], editavel: false, legada: true }
  // Editável só quando há de fato o que escolher. Com uma opção só, o campo
  // continua VISÍVEL (é a correção do silêncio), mas como texto.
  return { contaId: padrao, opcoes, editavel: opcoes.length >= 2, legada: false }
}

/**
 * PRODUTO DA CONTA (mig 130) — o que ela é define o que ela faz.
 *
 * Antes, cadastrar conta era marcar 10 chips na mão: o que recebe, o que paga,
 * se é cartão. Tudo isso o produto já determina. Aqui fica a tabela de verdade,
 * e a tela só pergunta "o que vocês têm nesta instituição?".
 */
export type ProdutoConta = 'conta_corrente' | 'conta_pagamento' | 'maquininha' | 'cartao_credito' | 'dinheiro'

export const PRODUTOS: {
  v: ProdutoConta
  label: string
  desc: string
  tipo: 'corrente' | 'dinheiro' | 'cartao'
  entradas: string[]
  saidas: string[]
  liquidacao?: number      // dias até o dinheiro cair (informativo por ora)
  varios?: boolean         // faz sentido ter mais de um
}[] = [
  {
    v: 'conta_corrente', label: 'Conta corrente',
    desc: 'Recebe e paga de tudo.',
    tipo: 'corrente',
    entradas: ['pix', 'dinheiro'], saidas: ['pix', 'boleto', 'transferencia', 'debito'],
  },
  {
    v: 'conta_pagamento', label: 'Conta de pagamento',
    desc: 'Tipo Nubank PJ ou PicPay: pix entra e sai, boleto sai.',
    tipo: 'corrente',
    entradas: ['pix'], saidas: ['pix', 'boleto'],
  },
  {
    v: 'maquininha', label: 'Maquininha',
    desc: 'Recebe crédito e débito. O dinheiro cai depois, já sem a taxa.',
    tipo: 'corrente',
    entradas: ['credito', 'debito'], saidas: [],
    liquidacao: 30, varios: true,
  },
  {
    v: 'cartao_credito', label: 'Cartão corporativo',
    desc: 'Só paga. A despesa acumula e sai quando a fatura é paga.',
    tipo: 'cartao',
    entradas: [], saidas: ['credito'],
    varios: true,
  },
  {
    v: 'dinheiro', label: 'Dinheiro',
    desc: 'Caixa físico da unidade.',
    tipo: 'dinheiro',
    entradas: ['dinheiro'], saidas: ['dinheiro'],
  },
]

/** Instituições que aparecem como sugestão — a lista é aberta, dá pra digitar. */
export const INSTITUICOES = [
  'Itaú', 'Bradesco', 'Banco do Brasil', 'Santander', 'Caixa', 'Sicoob', 'Sicredi',
  'Inter', 'Nubank', 'C6', 'PagBank', 'Mercado Pago',
  'Stone', 'Cielo', 'Rede', 'GetNet', 'InfinitePay', 'SumUp',
]

/** O que gravar quando o produto é escolhido — o comportamento sai daqui. */
export function camposDoProduto(p: ProdutoConta) {
  const d = PRODUTOS.find(x => x.v === p)!
  return {
    produto: p,
    tipo: d.tipo,
    entradas: d.entradas,
    saidas: d.saidas,
    liquidacao_dias: d.liquidacao ?? null,
  }
}

/** Nome que a conta ganha: "Itaú · Cartão corporativo 2". */
export function nomeDaConta(instituicao: string, p: ProdutoConta, indice?: number): string {
  const d = PRODUTOS.find(x => x.v === p)!
  const base = `${instituicao.trim()} · ${d.label}`
  return indice && indice > 1 ? `${base} ${indice}` : base
}

/**
 * TAXA DO ADQUIRENTE (mig 134) — uma fonte só, para as duas telas.
 *
 * O defeito que isto encerra: o mega pagamento do pipeline descontava a taxa e o
 * modal do detalhe do contrato gravava `valor_liquido = valor`, sem taxa. A mesma
 * venda de R$ 3.000 entrava como R$ 3.000 ou R$ 2.856 conforme a tela aberta.
 */
export type TaxaConta = {
  modalidade: 'debito' | 'credito' | 'pix'
  parcela_de: number
  parcela_ate: number
  bandeira: string | null
  percentual: number
  prazo_dias: number
}

/** Faixas como as operadoras publicam — não parcela a parcela. */
export const FAIXAS_TAXA: { modalidade: 'debito' | 'credito'; de: number; ate: number; label: string; prazo: number }[] = [
  { modalidade: 'debito',  de: 1, ate: 1,  label: 'Débito',          prazo: 1 },
  { modalidade: 'credito', de: 1, ate: 1,  label: 'Crédito à vista', prazo: 30 },
  { modalidade: 'credito', de: 2, ate: 6,  label: 'Crédito 2 a 6x',  prazo: 30 },
  { modalidade: 'credito', de: 7, ate: 12, label: 'Crédito 7 a 12x', prazo: 30 },
]

export const BANDEIRAS = ['master', 'visa', 'elo', 'amex', 'hiper']

/**
 * Acha a taxa da venda. Bandeira específica ganha da genérica (bandeira nula).
 * Sem linha cadastrada devolve zero — NUNCA inventa taxa, porque taxa chutada
 * vira valor líquido errado e o caixa deixa de bater com o extrato.
 */
export function acharTaxa(
  taxas: TaxaConta[], modalidade: 'debito' | 'credito' | 'pix',
  parcelas = 1, bandeira?: string | null,
): { percentual: number; prazoDias: number } {
  const p = Math.max(parcelas || 1, 1)
  const candidatas = taxas.filter(t =>
    t.modalidade === modalidade && p >= t.parcela_de && p <= t.parcela_ate)
  const especifica = bandeira
    ? candidatas.find(t => (t.bandeira || '').toLowerCase() === bandeira.toLowerCase())
    : undefined
  const achada = especifica || candidatas.find(t => !t.bandeira)
  return { percentual: achada?.percentual ?? 0, prazoDias: achada?.prazo_dias ?? 0 }
}

/**
 * Busca no banco a taxa daquela maquininha e devolve o líquido — **a única
 * porta** que as telas de recebimento devem usar.
 *
 * Existe porque a mig 134 resolveu o dado e não o consumo: a taxa passou a ser
 * por conta, mas o pipeline e o detalhe do contrato continuaram lendo a tabela
 * global `taxas_cartao`. O líquido de uma venda na Rede de Campinas saía
 * calculado com a taxa da InterPag de Santos.
 *
 * `cadastrada = false` significa **taxa desconhecida, não taxa zero**. O valor
 * entra cheio e a tela avisa — um número visivelmente incompleto é melhor que um
 * plausível e errado. Três das seis maquininhas do grupo estão nesse estado de
 * propósito: ninguém conferiu as tabelas da Rede nem da Infinity.
 */
export async function taxaDaVenda(
  // `unknown` de propósito: os chamadores usam o client TIPADO, e as tabelas
  // fin_* ainda não estão em types/database.ts — tipar aqui obrigaria cada
  // chamador a um cast, que é ruído sem ganho.
  cliente: unknown,
  contaId: string | null,
  metodo: string,
  parcelas = 1,
  bandeira?: string | null,
  /**
   * A unidade tem o módulo financeiro? (`hasModule('tela_financeiro')`)
   *
   * ⚠️ NÃO é preciosismo: o módulo é vendido por unidade, e hoje **sete das oito
   * estão sem ele**. Sem esta trava, publicar a taxa por maquininha mudaria o
   * `valor_liquido` gravado por Campinas, São José e Pinda — que não contrataram
   * nada e não têm como cadastrar a tabela da máquina delas, porque a aba Contas
   * não abre. Elas continuam exatamente como hoje.
   */
  comModuloFinanceiro = true,
): Promise<{ percentual: number; prazoDias: number; cadastrada: boolean }> {
  const vazio = { percentual: 0, prazoDias: 0, cadastrada: false }
  // Pix e dinheiro não passam por adquirente: não há taxa a buscar.
  if (metodo !== 'credito' && metodo !== 'debito') {
    return { ...vazio, cadastrada: true }
  }

  const supabase = cliente as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }>
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: unknown) => {
          eq: (c: string, v: unknown) => { maybeSingle: () => Promise<{ data: unknown }> }
        }
      }
    }
  }

  // ── Unidade SEM o módulo: a tabela global, como sempre foi ────────────────
  // Uma porta só, com dois caminhos dentro dela — e não duas funções que
  // divergem com o tempo, que era justamente o defeito que a mig 134 encerrou.
  if (!comModuloFinanceiro) {
    // `taxas_cartao.tipo` é `{bandeira}_{parcela}`: master_debito, visa_2x…
    const sufixo = metodo === 'debito' ? 'debito' : `${Math.max(parcelas || 1, 1)}x`
    const tipo = `${(bandeira || 'master').toLowerCase()}_${sufixo}`
    const { data } = await supabase.from('taxas_cartao')
      .select('percentual').eq('tipo', tipo).eq('ativo', true).maybeSingle()
    const p = (data as { percentual: number } | null)?.percentual
    return {
      percentual: Number(p ?? 0),
      prazoDias: metodo === 'debito' ? 1 : 30,
      // `cadastrada: true` de propósito — não há o que a unidade cadastrar, e o
      // aviso de "falta cadastrar" mandaria gente a uma tela que não abre.
      cadastrada: true,
    }
  }

  // ── Unidade COM o módulo: a tabela da maquininha em que o dinheiro cai ────
  if (!contaId) return { ...vazio, cadastrada: true }
  const { data } = await supabase.rpc('taxa_da_conta', {
    p_conta_id: contaId,
    p_modalidade: metodo,
    p_parcelas: Math.max(parcelas || 1, 1),
    p_bandeira: bandeira || null,
  })
  const linha = (data as { percentual: number; prazo_dias: number }[] | null)?.[0]
  if (!linha) return vazio
  return { percentual: Number(linha.percentual), prazoDias: Number(linha.prazo_dias), cadastrada: true }
}

/** Quanto entra na conta e quando. `taxa` é o que o adquirente retém. */
export function liquidoDaVenda(
  valor: number, taxas: TaxaConta[],
  modalidade: 'debito' | 'credito' | 'pix', parcelas = 1, bandeira?: string | null,
): { taxa: number; liquido: number; prazoDias: number; percentual: number } {
  const { percentual, prazoDias } = acharTaxa(taxas, modalidade, parcelas, bandeira)
  const taxa = Math.round(valor * (percentual / 100) * 100) / 100
  return { taxa, liquido: Math.round((valor - taxa) * 100) / 100, prazoDias, percentual }
}

export const fmtBRL = (v?: number | null) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const fmtData = (d?: string | null) =>
  d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '—'

export const hojeISO = () => new Date().toISOString().slice(0, 10)

/** Primeiro e último dia do mês de uma data ISO — pro filtro da lista. */
export function limitesDoMes(mesISO: string): { ini: string; fim: string } {
  const [a, m] = mesISO.split('-').map(Number)
  const fim = new Date(a, m, 0).getDate()
  return { ini: `${mesISO}-01`, fim: `${mesISO}-${String(fim).padStart(2, '0')}` }
}

/** Caminho do comprovante no bucket privado `financeiro`. */
export function caminhoComprovante(unidadeCodigo: string, arquivo: File): string {
  const ext = arquivo.name.split('.').pop()?.toLowerCase() || 'jpg'
  return `${unidadeCodigo || 'un'}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
}
