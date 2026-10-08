/**
 * RECEBIMENTO DE UM CONTRATO — a conta do Mega Pagamento, num lugar só (fase 2.11 do
 * docs/PLAYBOOK_REDESENHO_PIPELINE.md, P-10, demanda 2026/109, bug B-08).
 *
 * A REGRA (o modelo do desconto unificado, mig 078/079):
 *
 *   pagamento  = o dinheiro que ENTROU   → `pagamentos.valor` = valor − desconto
 *   desconto   = o que o contrato perdoou → `contratos.desconto_plano_unificado` (plano)
 *                                           `contratos.desconto_acessorios_ajuste` (acessórios)
 *   `pagamentos.desconto` = 0 sempre (coluna deprecated)
 *
 * Os dois caminhos antigos erravam cada um de um jeito:
 *  - o Mega do PIPELINE gravava o desconto em `pagamentos.desconto` (deprecated) e o valor
 *    cheio no pagamento → o contrato nunca soube do desconto e o "pago" ficava R$ X acima
 *    do que entrou (B-08);
 *  - o Mega do DETALHE grava o desconto no contrato E o valor cheio no pagamento → o
 *    desconto conta duas vezes e o saldo nasce negativo (demanda 2026/109).
 *
 * Este arquivo é puro (sem import de runtime) para o `npm test` rodar no Node; a gravação
 * (`registrarRecebimento`) recebe o client por parâmetro.
 */

export type ContratoParaReceber = {
  id: string
  codigo?: string | null
  unidade_id: string | null
  valor_plano: number | null
  desconto_plano_unificado: number | null
  valor_acessorios: number | null
  desconto_acessorios: number | null
  desconto_acessorios_ajuste: number | null
  pagamentos?: { tipo: string; valor: number | null }[] | null
}

export type FormRecebimento = {
  valorPlano: string
  descontoPlano: string        // '' = sem desconto
  valorAcessorio: string
  descontoAcessorio: string
  planoFechado: boolean
  pfTotal: string
  pfPlanoPuro: string
}

export type LinhaRecebimento = {
  tipo: 'plano' | 'catalogo'
  valor: number          // o que entrou (já sem o desconto)
  taxa: number           // da maquininha, em R$
  valorLiquido: number   // valor − taxa
}

export type CalculoRecebimento = {
  linhas: LinhaRecebimento[]
  /** A SOMAR em `desconto_plano_unificado`. */
  descontoPlano: number
  /** A SOMAR em `desconto_acessorios_ajuste` (desconto digitado + ajuste do Plano fechado). */
  descontoAcessorios: number
  /** Plano fechado: o `valor_plano` passa a ser o plano puro. null = não mexe. */
  valorPlanoNovo: number | null
  /** O que entra no caixa (soma das linhas). */
  total: number
  /** Total depois da taxa. */
  totalLiquido: number
  /** Motivo de não poder registrar; null = pode. */
  erro: string | null
  /** Aviso que não impede (Plano fechado com sobra maior que o pendente). */
  aviso: string | null
}

const num = (v: string | number | null | undefined) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const r2 = (v: number) => Math.round(v * 100) / 100

/** O que falta pagar de plano e de acessórios (pode dar negativo = pago a mais). */
export function saldosDoContrato(c: ContratoParaReceber): { plano: number; acessorios: number } {
  const pagos = c.pagamentos || []
  const pago = (tipo: string) => pagos.filter(p => p.tipo === tipo).reduce((s, p) => s + (p.valor || 0), 0)
  return {
    plano: r2((c.valor_plano || 0) - (c.desconto_plano_unificado || 0) - pago('plano')),
    acessorios: r2((c.valor_acessorios || 0) - (c.desconto_acessorios || 0) - (c.desconto_acessorios_ajuste || 0) - pago('catalogo')),
  }
}

/** Divide um desconto total entre plano e acessórios na proporção dos valores. */
export function proporcionalizar(total: number, valorPlano: number, valorAcessorio: number): { plano: number; acessorio: number } | null {
  const soma = valorPlano + valorAcessorio
  if (!(soma > 0) || !(total > 0)) return null
  const plano = r2(total * valorPlano / soma)
  return { plano, acessorio: r2(total - plano) }
}

export function calcularRecebimento(f: FormRecebimento, c: ContratoParaReceber, taxaPercentual: number): CalculoRecebimento {
  const linha = (tipo: 'plano' | 'catalogo', valor: number): LinhaRecebimento => {
    const taxa = r2(valor * (taxaPercentual || 0) / 100)
    return { tipo, valor: r2(valor), taxa, valorLiquido: r2(valor - taxa) }
  }
  const montar = (p: Omit<CalculoRecebimento, 'total' | 'totalLiquido'>): CalculoRecebimento => ({
    ...p,
    total: r2(p.linhas.reduce((s, l) => s + l.valor, 0)),
    totalLiquido: r2(p.linhas.reduce((s, l) => s + l.valorLiquido, 0)),
  })

  if (f.planoFechado) {
    // Plano fechado: o tutor pagou um total com os produtos embutidos. O operador diz quanto
    // é plano puro; a sobra vai pra acessórios e o que faltar pra fechar o pendente de
    // acessórios vira desconto automático (mesma regra do detalhe, `contratos/[id]`).
    const total = num(f.pfTotal)
    const puro = num(f.pfPlanoPuro)
    const sobra = r2(total - puro)
    const pendAcess = saldosDoContrato(c).acessorios
    const ajuste = r2(pendAcess - sobra)
    const erro = !(total > 0) ? 'Informe o total recebido'
      : puro < 0 ? 'Plano puro não pode ser negativo'
      : puro > total ? 'O plano puro não pode ser maior que o total recebido'
      : null
    return montar({
      linhas: erro ? [] : [
        ...(puro > 0 ? [linha('plano', puro)] : []),
        ...(sobra > 0 ? [linha('catalogo', sobra)] : []),
      ],
      descontoPlano: 0,
      descontoAcessorios: erro ? 0 : Math.max(0, ajuste),
      valorPlanoNovo: erro ? null : r2(puro),
      erro,
      aviso: !erro && sobra > pendAcess + 0.01 ? `Sobra maior que o pendente de acessórios (R$ ${pendAcess.toFixed(2)})` : null,
    })
  }

  const vp = num(f.valorPlano), dp = num(f.descontoPlano)
  const va = num(f.valorAcessorio), da = num(f.descontoAcessorio)
  const erro = vp < 0 || va < 0 || dp < 0 || da < 0 ? 'Valores não podem ser negativos'
    : dp > vp ? 'O desconto do plano é maior que o valor do plano'
    : da > va ? 'O desconto dos acessórios é maior que o valor dos acessórios'
    : vp - dp <= 0 && va - da <= 0 && dp <= 0 && da <= 0 ? 'Informe ao menos um valor'
    : null
  if (erro) return montar({ linhas: [], descontoPlano: 0, descontoAcessorios: 0, valorPlanoNovo: null, erro, aviso: null })
  return montar({
    linhas: [
      ...(vp - dp > 0 ? [linha('plano', vp - dp)] : []),
      ...(va - da > 0 ? [linha('catalogo', va - da)] : []),
    ],
    descontoPlano: r2(dp),
    descontoAcessorios: r2(da),
    valorPlanoNovo: null,
    erro: null,
    aviso: null,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Gravação
// ─────────────────────────────────────────────────────────────────────────────

export type DadosDoRecebimento = {
  metodo: string               // pix | dinheiro | credito | debito (como o banco conhece)
  contaId: string | null
  parcelas: number
  bandeira: string | null
  idTransacao: string | null
  dataPagamento: string        // aaaa-mm-dd
  criadoPor: string | null
}

type Resp = { data?: unknown; error: { message: string } | null }
type Cliente = {
  from: (t: string) => {
    select: (c: string) => { eq: (c: string, v: unknown) => { single: () => Promise<Resp> } }
    update: (v: unknown) => { eq: (c: string, v: unknown) => Promise<Resp> }
    insert: (v: unknown) => Promise<Resp> & { select: (c: string) => Promise<Resp> }
  }
}

export type ResultadoRecebimento = {
  pagamentos: { id: string; tipo: string; valor: number }[]
  /** Campos do contrato que mudaram (para atualizar a lista sem recarregar). */
  contrato: Partial<Pick<ContratoParaReceber, 'valor_plano' | 'desconto_plano_unificado' | 'desconto_acessorios_ajuste'>>
}

/**
 * Grava o recebimento: primeiro o desconto no contrato (somado sobre o valor LIDO DO BANCO
 * agora, não sobre o da tela, que pode estar velho), depois os pagamentos. Se os pagamentos
 * falharem, o contrato volta ao que era — não fica desconto sem o dinheiro correspondente.
 *
 * O acerto entre unidades (contrato de outra unidade recebido aqui) é responsabilidade do
 * chamador, que sabe qual é a unidade logada — ver `cobrancaDeTerceiro`.
 */
export async function registrarRecebimento(
  clienteSupabase: unknown, contratoId: string, calc: CalculoRecebimento, d: DadosDoRecebimento,
): Promise<ResultadoRecebimento> {
  if (calc.erro) throw new Error(calc.erro)
  const supabase = clienteSupabase as Cliente

  const mudaContrato = calc.descontoPlano > 0 || calc.descontoAcessorios > 0 || calc.valorPlanoNovo != null
  type Antes = { valor_plano: number | null; desconto_plano_unificado: number | null; desconto_acessorios_ajuste: number | null }
  let antes: Antes | null = null
  const patch: ResultadoRecebimento['contrato'] = {}

  if (mudaContrato) {
    const { data, error } = await supabase.from('contratos')
      .select('valor_plano, desconto_plano_unificado, desconto_acessorios_ajuste').eq('id', contratoId).single()
    if (error || !data) throw new Error('Não consegui ler o contrato: ' + (error?.message || 'sem dados'))
    const lido = data as Antes
    antes = lido
    if (calc.descontoPlano > 0) patch.desconto_plano_unificado = r2((lido.desconto_plano_unificado || 0) + calc.descontoPlano)
    if (calc.descontoAcessorios > 0) patch.desconto_acessorios_ajuste = r2((lido.desconto_acessorios_ajuste || 0) + calc.descontoAcessorios)
    if (calc.valorPlanoNovo != null) patch.valor_plano = calc.valorPlanoNovo
    const { error: eUp } = await supabase.from('contratos').update(patch).eq('id', contratoId)
    if (eUp) throw new Error('Não consegui gravar o desconto no contrato: ' + eUp.message)
  }

  if (calc.linhas.length === 0) return { pagamentos: [], contrato: patch }

  const mes = `${d.dataPagamento.slice(0, 4)}/${d.dataPagamento.slice(5, 7)}`
  const linhas = calc.linhas.map(l => ({
    contrato_id: contratoId,
    tipo: l.tipo,
    metodo: d.metodo,
    conta_id: d.contaId,
    valor: l.valor,
    desconto: 0,
    taxa: l.taxa > 0 ? l.taxa : null,
    valor_liquido_sem_taxa: l.valor,
    valor_liquido: l.valorLiquido,
    parcelas: d.parcelas,
    bandeira: d.bandeira,
    id_transacao: d.idTransacao,
    is_seguradora: false,
    data_pagamento: d.dataPagamento,
    mes_competencia: mes,
    criado_por: d.criadoPor,
  }))
  const { data: novos, error } = await supabase.from('pagamentos').insert(linhas).select('id, tipo, valor')
  if (error) {
    if (antes) {
      const { error: eVolta } = await supabase.from('contratos').update(antes).eq('id', contratoId)
      if (eVolta) throw new Error(`O pagamento não foi gravado (${error.message}) e o desconto que já tinha ido para o contrato NÃO voltou (${eVolta.message}). Confira o contrato no detalhe.`)
    }
    throw new Error('Não consegui gravar o pagamento: ' + error.message)
  }
  return { pagamentos: (novos || []) as ResultadoRecebimento['pagamentos'], contrato: patch }
}

/**
 * O acerto que nasce quando o contrato é de OUTRA unidade e o dinheiro caiu aqui
 * (`fin_cobrancas`, mig 135 — mesma regra do Mega antigo). Devolve null quando não há.
 * O valor é o que ENTROU (soma dos pagamentos), não o valor cheio.
 */
export function cobrancaDeTerceiro(p: {
  contrato: Pick<ContratoParaReceber, 'unidade_id' | 'codigo'>
  unidadeLogadaId: string | null
  temFinanceiro: boolean
  total: number
  dataPagamento: string
  pagamentoId: string | null
  contaId: string | null
  criadoPorNome: string | null
}): Record<string, unknown> | null {
  if (!p.temFinanceiro || !p.contrato.unidade_id || !p.unidadeLogadaId || p.contrato.unidade_id === p.unidadeLogadaId) return null
  if (!(p.total > 0)) return null
  return {
    unidade_credora: p.contrato.unidade_id,   // dona do contrato: tem a receber
    unidade_devedora: p.unidadeLogadaId,      // recebeu o dinheiro: deve
    tipo: 'recebimento_terceiro',
    valor: r2(p.total),
    data: p.dataPagamento,
    descricao: `Recebimento do contrato ${p.contrato.codigo || ''}`.trim(),
    status: 'emitida',
    pagamento_id: p.pagamentoId,
    conta_id: p.contaId,
    criado_por_nome: p.criadoPorNome,
  }
}
