// ESTADO DA FATURA DO CARTÃO (16/10/2026, Lucas) — a mesma régua no card "Faturas do cartão",
// na Conciliação com Extrato e no "Conferir fatura" do + Lançar.
//
//   · Em aberto            — falta o total do PDF, falta compra (soma ≠ total) ou há compra sem categoria
//   · Pronta pra pagar     — tudo conferido e o vencimento ainda não passou
//   · Pronta pra conciliar — tudo conferido e já venceu: falta só o extrato do banco
//   · Paga em parte        — pagou menos que o total (o mínimo, uma parte); o resto vai pra próxima
//   · Paga                 — os pagamentos somam o total (© quando a linha do banco foi ligada)
//
// Nunca se "pré-lança" uma fatura: o pagamento nasce na conciliação, da linha do banco. A exceção
// é conta sem extrato (Dinheiro), onde não chega OFX e o "Paguei" continua valendo.
// O © fica SÓ para o banco: na compra do cartão o que se mostra é "✓ na fatura".
//
// PAGAMENTO PARCIAL (16/10/2026): o que foi pago é a SOMA dos `fatura_cartao` daquele vencimento
// (sem coluna nova — os 4 pagamentos que existiam batiam centavo a centavo com a soma das compras).
// O resto o banco cobra na fatura seguinte: o PDF dela traz o saldo anterior (fica fora, não é
// compra: `foraDoCartao`) e os juros (despesa, Financeiro › Encargos). Por isso a fatura seguinte
// fecha com `soma + carregado` = total do PDF.

export type FaturaResumo = {
  cartaoId: string
  cartaoNome: string
  /** YYYY-MM-DD */
  venc: string
  /** soma das compras lançadas com esse vencimento */
  soma: number
  /** o total que o PDF da fatura diz (fin_saldos_banco origem 'fatura'); null = PDF não importado */
  totalPdf: number | null
  /** compras sem categoria */
  semCat: number
  /** soma dos pagamentos (fin_movimentos fatura_cartao com esse vencimento) */
  pago: number
  /** todos os pagamentos estão ligados a uma linha do banco (ou saíram de conta sem extrato) */
  pagaConciliada: boolean
  /** o resto de uma fatura anterior paga em parte, que o banco trouxe pra esta (encadearFaturas) */
  carregado?: number
  /** paga em parte e o resto JÁ foi pra fatura seguinte: não espera mais pagamento (encadearFaturas) */
  restoNaSeguinte?: string
}

export type EstadoFatura = 'em_aberto' | 'pronta_pagar' | 'pronta_conciliar' | 'paga_parte' | 'paga'

const c2 = (n: number) => Math.round(n * 100) / 100
const igual = (a: number, b: number) => Math.abs(a - b) < 0.005
const brl = (n: number) => `R$ ${Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const somaDias = (iso: string, d: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + d)).toISOString().slice(0, 10)

/** As compras + o que veio da fatura anterior: é isso que tem que fechar com o PDF. */
const lancado = (f: FaturaResumo) => c2(f.soma + (f.carregado || 0))
/** O valor que a fatura cobra: o do PDF; sem ele, o lançado. */
export const valorDaFatura = (f: FaturaResumo) => f.totalPdf ?? lancado(f)
/** O que ainda falta pagar (0 quando quitada, ou quando o resto já foi pra seguinte). */
export const faltaPagar = (f: FaturaResumo) => (f.restoNaSeguinte ? 0 : Math.max(0, c2(valorDaFatura(f) - f.pago)))
const conferida = (f: FaturaResumo) => f.semCat === 0 && (f.totalPdf === null || igual(f.totalPdf, lancado(f)))

export function estadoDaFatura(f: FaturaResumo, hoje: string): EstadoFatura {
  if (f.pago > 0.005) return faltaPagar(f) < 0.005 && !f.restoNaSeguinte ? 'paga' : 'paga_parte'
  if (f.totalPdf === null || !conferida(f)) return 'em_aberto'
  return f.venc < hoje ? 'pronta_conciliar' : 'pronta_pagar'
}

export const ROTULO_ESTADO: Record<EstadoFatura, string> = {
  em_aberto: 'Em aberto', pronta_pagar: 'Pronta pra pagar', pronta_conciliar: 'Pronta pra conciliar',
  paga_parte: 'Paga em parte', paga: 'Paga',
}

/** O que falta, com a ação exata — frases curtas, na ordem em que se resolvem. */
export function pendenciasDaFatura(f: FaturaResumo): string[] {
  const p: string[] = []
  if (f.totalPdf === null) p.push('falta o total da fatura: importe o PDF dela (Livro-Caixa › Faturas do cartão › Importar fatura)')
  else {
    const falta = c2(f.totalPdf - lancado(f))
    if (falta >= 0.005) p.push(`faltam ${brl(falta)} em compras: importe o PDF da fatura de novo e lance as que faltam`)
    else if (falta <= -0.005) p.push(`há ${brl(falta)} em compras a mais que o total da fatura (${brl(f.totalPdf)}): veja se alguma entrou na fatura errada`)
  }
  if (f.semCat > 0) p.push(`${f.semCat} ${f.semCat === 1 ? 'compra sem categoria' : 'compras sem categoria'}: classifique (Livro-Caixa › Faturas do cartão, clique na compra)`)
  return p
}

/** Uma frase pro selo da paga em parte: quanto foi pago, quanto falta ou pra onde foi o resto. */
export function situacaoParcial(f: FaturaResumo): string {
  const resto = c2(valorDaFatura(f) - f.pago)
  return f.restoNaSeguinte
    ? `pagos ${brl(f.pago)} · o resto (${brl(resto)}) foi para a fatura de ${ddmm(f.restoNaSeguinte)}`
    : `pagos ${brl(f.pago)} · faltam ${brl(resto)}`
}

/**
 * Liga cada fatura paga em parte à SEGUINTE do mesmo cartão: a seguinte recebe o resto
 * (`carregado`) e a anterior deixa de esperar pagamento (`restoNaSeguinte`). Só a imediatamente
 * seguinte — é ela que o banco cobra. Devolve cópias; a lista precisa trazer a fatura anterior.
 */
export function encadearFaturas(faturas: FaturaResumo[]): FaturaResumo[] {
  const xs = faturas.map(f => ({ ...f }))
  const porCartao = new Map<string, FaturaResumo[]>()
  for (const f of xs) porCartao.set(f.cartaoId, [...(porCartao.get(f.cartaoId) || []), f])
  for (const fs of porCartao.values()) {
    fs.sort((a, b) => a.venc.localeCompare(b.venc))
    for (let i = 0; i + 1 < fs.length; i++) {
      const a = fs[i], b = fs[i + 1]
      const resto = c2(valorDaFatura(a) - a.pago)
      if (a.pago > 0.005 && resto >= 0.005) { b.carregado = c2((b.carregado || 0) + resto); a.restoNaSeguinte = b.venc }
    }
  }
  return xs
}

export type CasamentoFatura =
  | { tipo: 'bate'; fatura: FaturaResumo }
  | { tipo: 'difere'; fatura: FaturaResumo; aviso: string; podeParcial: boolean }

/**
 * A linha do banco que parece PAGAMENTO DE FATURA: de qual fatura é?
 *  · bate   — uma fatura em aberto, perto da data, falta pagar exatamente esse valor e está conferida
 *             (sem PDF, vale a soma das compras: o próprio banco confirma o total).
 *  · difere — achou a fatura provável, mas o valor não fecha ou ela não está conferida: o aviso
 *             diz o que fazer, sem tirar ninguém da tela. `podeParcial`: conferida e o banco pagou
 *             MENOS que o que falta — dá pra registrar como pagamento parcial.
 *  · null   — nenhuma fatura em aberto perto dessa data.
 */
export function casarPagamentoFatura(valor: number, data: string, faturas: FaturaResumo[]): CasamentoFatura | null {
  const v = Math.abs(valor)
  // paga-se perto do vencimento: até 10 dias depois (atraso) ou 25 antes
  const perto = faturas.filter(f => faltaPagar(f) >= 0.005 && f.venc >= somaDias(data, -10) && f.venc <= somaDias(data, 25))
  if (!perto.length) return null
  const dist = (f: FaturaResumo) => Math.abs(Date.parse(f.venc) - Date.parse(data))
  perto.sort((a, b) => dist(a) - dist(b))
  const bate = perto.find(f => igual(faltaPagar(f), v) && conferida(f))
  if (bate) return { tipo: 'bate', fatura: bate }
  const provavel = perto.find(f => igual(faltaPagar(f), v) || igual(f.soma, v)) || perto[0]
  const nome = `${provavel.cartaoNome} de ${ddmm(provavel.venc)}`
  const vf = faltaPagar(provavel)
  const oQue = provavel.pago > 0.005 ? `ainda faltam ${brl(vf)} dela` : `a fatura está com ${brl(vf)}`
  const pend = pendenciasDaFatura(provavel).filter(x => !(provavel.totalPdf === null && x.startsWith('falta o total') && igual(provavel.soma, v)))
  const podeParcial = conferida(provavel) && v < vf - 0.005
  const cabeca = igual(vf, v)
    ? `Parece o pagamento da fatura ${nome} (${brl(v)}), mas ela ainda não está conferida`
    : `Parece o pagamento da fatura ${nome}, mas o banco pagou ${brl(v)} e ${oQue} (diferença de ${brl(c2(v - vf))})`
  const oque = pend.length ? `O que fazer: ${pend.join('; ')}.`
    : podeParcial ? 'Se foi um pagamento parcial (o mínimo, uma parte), marque abaixo: o resto vai para a próxima fatura.'
    : 'Confira os valores da fatura até o total bater com o que o banco pagou.'
  return { tipo: 'difere', fatura: provavel, aviso: `${cabeca}. ${oque}`, podeParcial }
}
