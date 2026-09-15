// Recebíveis de maquininha — a esteira de parcelas que ainda vai cair.
//
// 🔴 A REGRA DE OURO DESTE ARQUIVO: **PREVISÃO NUNCA VIRA CAIXA.**
//
// Decisão do Lucas, 13/09/2026: *"a previsão nunca vira caixa... o job é eu subir
// os lançamentos do extrato, de tal dia a tal dia, aí você 'come' eles da
// previsão; mas previsão é mero informativo."*
//
// Quem move o saldo é SEMPRE o realizado (o movimento registrado a partir do
// extrato). O que este módulo calcula serve para duas coisas, e só:
//
//   1. INFORMAR quanto ainda está por vir ("a receber")
//   2. Mostrar o GAP — quanto o extrato já deveria ter trazido e ainda não foi
//      lançado, para o operador saber que tem trabalho acumulado
//
// É isso que mantém o caixa batendo com o banco. Se a previsão entrasse no
// saldo, todo desvio (estorno, chargeback, antecipação) viraria um erro
// silencioso — exatamente a doença que o §9.1.8 do FLOW curou na abertura.

/** Uma parcela a receber, já com a data em que o adquirente deve pagar. */
export type Recebivel = {
  pagamentoId: string
  contaId: string
  /** 1..n */
  parcela: number
  totalParcelas: number
  /** data da venda */
  vendaEm: string
  /** data prevista de liquidação (dia útil) */
  previstoEm: string
  /** líquido da parcela — o bruto já descontado da taxa, dividido pelas parcelas */
  valor: number
}

/** O que este módulo precisa saber de um pagamento. */
export type PagamentoCartao = {
  id: string
  conta_id: string | null
  data_pagamento: string | null
  valor_liquido: number | string | null
  valor: number | string | null
  metodo: string | null
  parcelas: number | null
}

/**
 * Feriados NACIONAIS — o adquirente não liquida neles.
 *
 * Medido na agenda do InterPag em 13/09/2026: 12/10 (N. Sra. Aparecida, uma
 * segunda) e 20/11 (Consciência Negra, uma sexta) aparecem VAZIOS, cercados de
 * dias com valor. Sem isto a projeção erra o dia e, na virada de mês, o mês.
 *
 * ⚠️ Só nacionais. Feriado municipal de Santos não foi conferido contra a
 * agenda — chutar um feriado a mais empurra dinheiro para o dia seguinte sem
 * motivo, e o erro fica invisível.
 */
const FERIADOS = new Set<string>([
  // 2026
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21',
  '2026-05-01', '2026-06-04', '2026-09-07', '2026-10-12', '2026-11-02',
  '2026-11-15', '2026-11-20', '2026-12-25',
  // 2027 — a esteira de 12x alcança set/2027
  '2027-01-01', '2027-02-08', '2027-02-09', '2027-03-26', '2027-04-21',
  '2027-05-01', '2027-05-27', '2027-09-07', '2027-10-12', '2027-11-02',
  '2027-11-15', '2027-11-20', '2027-12-25',
])

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Sábado, domingo e feriado nacional não liquidam. */
export function ehDiaUtil(data: Date): boolean {
  const dow = data.getUTCDay()
  return dow !== 0 && dow !== 6 && !FERIADOS.has(iso(data))
}

/** Empurra para o próximo dia útil (o próprio dia, se já for útil). */
function proximoDiaUtil(data: Date): Date {
  const d = new Date(data)
  while (!ehDiaUtil(d)) d.setUTCDate(d.getUTCDate() + 1)
  return d
}

/**
 * QUANDO A PARCELA CAI.
 *
 * 🔴 CALIBRADA CONTRA 65 DIAS DE EXTRATO REAL da InterPag (13/09/2026), não
 * copiada da documentação de adquirente. O padrão de mercado que a Pagar.me
 * publica — *29 dias corridos + 2 dias úteis* — foi testado e **errava R$ 1.291
 * por dia**, acertando 1 dia em 65. Esta regra erra R$ 86/dia e acerta 30 em 65;
 * no dia usado como prova (01/06/2026) previu R$ 3.042,51 contra R$ 3.041,65 do
 * extrato — **86 centavos**.
 *
 *   parcela k  →  venda + 30×k dias corridos  →  empurra para o próximo dia útil
 *
 * ⚠️ VALE PARA A INTERPAG. Rede, Infinity e InfinityPay não foram calibradas —
 * não há extrato delas para conferir. Use `contaCalibrada()` antes de mostrar
 * número: previsão plausível e errada é pior que ausência de previsão, porque
 * ninguém desconfia dela.
 */
export function previsaoDaParcela(vendaEm: string, parcela: number): string {
  const base = new Date(`${vendaEm}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + 30 * parcela)
  return iso(proximoDiaUtil(base))
}

/** Débito cai no dia útil seguinte (conferido: 2 de 3 dias exatos no extrato). */
export function previsaoDebito(vendaEm: string): string {
  const base = new Date(`${vendaEm}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + 1)
  return iso(proximoDiaUtil(base))
}

/**
 * Contas cuja regra foi calibrada contra extrato. Fora desta lista a projeção
 * não é exibida — ver o aviso em `previsaoDaParcela`.
 *
 * Por NOME e não por UUID: id chumbado no código foi a origem do bug que pôs
 * recebimento de 4 unidades na conta de Santos (migs 122/126/127).
 */
export function contaCalibrada(nomeDaConta: string | null | undefined): boolean {
  return (nomeDaConta || '').trim().toLowerCase() === 'interpag'
}

/** Explode os pagamentos em cartão na esteira de parcelas. */
export function montarEsteira(pagamentos: PagamentoCartao[]): Recebivel[] {
  const out: Recebivel[] = []
  for (const p of pagamentos) {
    if (!p.data_pagamento || !p.conta_id) continue
    const venda = p.data_pagamento.slice(0, 10)
    // O líquido é o que o adquirente deposita. Sem ele, o bruto — que superestima,
    // mas é melhor que ignorar a venda e subestimar o a receber inteiro.
    const liquido = Number(p.valor_liquido ?? p.valor ?? 0)
    if (!liquido) continue

    if (p.metodo === 'debito') {
      out.push({
        pagamentoId: p.id, contaId: p.conta_id, parcela: 1, totalParcelas: 1,
        vendaEm: venda, previstoEm: previsaoDebito(venda), valor: liquido,
      })
      continue
    }
    if (p.metodo !== 'credito') continue

    const n = Math.max(1, Number(p.parcelas) || 1)
    // Divisão simples: o adquirente arredonda por parcela e a diferença de
    // centavos se dilui. O erro medido no mês inteiro ficou em 1%.
    const porParcela = liquido / n
    for (let k = 1; k <= n; k++) {
      out.push({
        pagamentoId: p.id, contaId: p.conta_id, parcela: k, totalParcelas: n,
        vendaEm: venda, previstoEm: previsaoDaParcela(venda, k), valor: porParcela,
      })
    }
  }
  return out
}

/**
 * O retrato de uma maquininha numa data.
 *
 * `aReceber` é o futuro; `aLancar` é o passado que ainda não foi conciliado —
 * e é este segundo número que diz ao operador que há trabalho acumulado. Foi o
 * pedido: *"se estivermos com um delta de 10 dias sem lançamentos de cartão de
 * crédito, você mostra que há um saldo aproximado de X para lançar o real."*
 */
export type RetratoMaquininha = {
  /** parcelas com data futura — informativo puro, NUNCA entra no saldo */
  aReceber: number
  /** parcelas cuja data já passou e que o extrato ainda não trouxe */
  aLancar: number
  /** dias desde a última liquidação registrada; null se nunca houve */
  diasSemLancar: number | null
  /** data da parcela mais antiga ainda não conciliada */
  desde: string | null
  /** total já previsto até hoje (conciliado ou não) */
  previstoAteHoje: number
}

export function retratoDaMaquininha(
  esteira: Recebivel[],
  /** soma dos movimentos já registrados a partir do extrato, para esta conta */
  jaLiquidado: number,
  /** data da última liquidação registrada (YYYY-MM-DD) */
  ultimaLiquidacao: string | null,
  hoje: string,
  /**
   * `contas.caixa_desde` — antes dela o extrato não vale (FLOW §9.1.8).
   *
   * 🔴 SEM ISTO O NÚMERO É LIXO: medido em 15/09/2026, o "a lançar" da InterPag
   * dava **R$ 736 mil** porque somava toda parcela prevista desde out/2023, e
   * nenhuma liquidação jamais foi registrada. O que interessa é o acumulado
   * DEPOIS da abertura — o histórico anterior foi congelado de propósito.
   *
   * Conta sem abertura devolve `aLancar = 0`: não há período válido para
   * comparar, e um número grande ali convidaria a "acertar" o que já está certo.
   */
  caixaDesde: string | null,
): RetratoMaquininha {
  let aReceber = 0
  let previstoAteHoje = 0
  let desde: string | null = null

  for (const r of esteira) {
    if (r.previstoEm > hoje) { aReceber += r.valor; continue }
    // fora da janela do caixa: informa o futuro, mas não cobra o passado
    if (!caixaDesde || r.previstoEm < caixaDesde) continue
    previstoAteHoje += r.valor
    // a mais antiga ainda não coberta pelo que foi lançado
    if (ultimaLiquidacao && r.previstoEm <= ultimaLiquidacao) continue
    if (!desde || r.previstoEm < desde) desde = r.previstoEm
  }

  // ⚠️ Nunca negativo: se o extrato trouxe MAIS do que a previsão esperava
  // (antecipação, por exemplo), não há nada a lançar — e o excedente não é
  // "saldo negativo a lançar", é a previsão tendo errado, que é permitido.
  const aLancar = Math.max(0, previstoAteHoje - jaLiquidado)

  let diasSemLancar: number | null = null
  if (ultimaLiquidacao) {
    const ms = new Date(`${hoje}T00:00:00Z`).getTime() - new Date(`${ultimaLiquidacao}T00:00:00Z`).getTime()
    diasSemLancar = Math.max(0, Math.round(ms / 86400000))
  }

  return { aReceber, aLancar, diasSemLancar, desde: aLancar > 0.005 ? desde : null, previstoAteHoje }
}

/** Agrupa a esteira por mês, para o cronograma. */
export function porMes(esteira: Recebivel[], apartirDe: string): { mes: string; valor: number }[] {
  const m = new Map<string, number>()
  for (const r of esteira) {
    if (r.previstoEm <= apartirDe) continue
    const k = r.previstoEm.slice(0, 7)
    m.set(k, (m.get(k) || 0) + r.valor)
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, valor]) => ({ mes, valor }))
}
