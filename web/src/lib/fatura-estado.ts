// ESTADO DA FATURA DO CARTÃO (16/10/2026, Lucas) — a mesma régua no card "Faturas do cartão",
// na Conciliação com Extrato e no "Conferir fatura" do + Lançar.
//
//   · Em aberto           — falta o total do PDF, falta compra (soma ≠ total) ou há compra sem categoria
//   · Pronta pra pagar    — tudo conferido e o vencimento ainda não passou
//   · Pronta pra conciliar — tudo conferido e já venceu: falta só o extrato do banco
//   · Paga                — o pagamento existe (© quando a linha do banco foi ligada a ele)
//
// Nunca se "pré-lança" uma fatura: o pagamento nasce na conciliação, da linha do banco. A exceção
// é conta sem extrato (Dinheiro), onde não chega OFX e o "Paguei" continua valendo.
// O © fica SÓ para o banco: na compra do cartão o que se mostra é "✓ na fatura".

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
  paga: boolean
  /** o pagamento está ligado a uma linha do banco */
  pagaConciliada: boolean
}

export type EstadoFatura = 'em_aberto' | 'pronta_pagar' | 'pronta_conciliar' | 'paga'

const c2 = (n: number) => Math.round(n * 100) / 100
const igual = (a: number, b: number) => Math.abs(a - b) < 0.005
const brl = (n: number) => `R$ ${Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const somaDias = (iso: string, d: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + d)).toISOString().slice(0, 10)

export function estadoDaFatura(f: FaturaResumo, hoje: string): EstadoFatura {
  if (f.paga) return 'paga'
  if (f.totalPdf === null || f.semCat > 0 || !igual(f.totalPdf, f.soma)) return 'em_aberto'
  return f.venc < hoje ? 'pronta_conciliar' : 'pronta_pagar'
}

export const ROTULO_ESTADO: Record<EstadoFatura, string> = {
  em_aberto: 'Em aberto', pronta_pagar: 'Pronta pra pagar', pronta_conciliar: 'Pronta pra conciliar', paga: 'Paga',
}

/** O que falta, com a ação exata — frases curtas, na ordem em que se resolvem. */
export function pendenciasDaFatura(f: FaturaResumo): string[] {
  const p: string[] = []
  if (f.totalPdf === null) p.push('falta o total da fatura: importe o PDF dela (Livro-Caixa › Faturas do cartão › Importar fatura)')
  else {
    const falta = c2(f.totalPdf - f.soma)
    if (falta >= 0.005) p.push(`faltam ${brl(falta)} em compras: importe o PDF da fatura de novo e lance as que faltam`)
    else if (falta <= -0.005) p.push(`há ${brl(falta)} em compras a mais que o total da fatura (${brl(f.totalPdf)}): veja se alguma entrou na fatura errada`)
  }
  if (f.semCat > 0) p.push(`${f.semCat} ${f.semCat === 1 ? 'compra sem categoria' : 'compras sem categoria'}: classifique (Livro-Caixa › Faturas do cartão, clique na compra)`)
  return p
}

/** O valor que a fatura cobra: o do PDF; sem ele, a soma das compras. */
export const valorDaFatura = (f: FaturaResumo) => f.totalPdf ?? f.soma

export type CasamentoFatura =
  | { tipo: 'bate'; fatura: FaturaResumo }
  | { tipo: 'difere'; fatura: FaturaResumo; aviso: string }

/**
 * A linha do banco que parece PAGAMENTO DE FATURA: de qual fatura é?
 *  · bate   — uma fatura não paga, perto da data, cobra exatamente esse valor e está conferida
 *             (sem PDF, vale a soma das compras: o próprio banco confirma o total).
 *  · difere — achou a fatura provável, mas o valor não fecha ou ela não está conferida: o aviso
 *             diz o que fazer, sem tirar ninguém da tela.
 *  · null   — nenhuma fatura em aberto perto dessa data.
 */
export function casarPagamentoFatura(valor: number, data: string, faturas: FaturaResumo[]): CasamentoFatura | null {
  const v = Math.abs(valor)
  // paga-se perto do vencimento: até 10 dias depois (atraso) ou 25 antes
  const perto = faturas.filter(f => !f.paga && f.venc >= somaDias(data, -10) && f.venc <= somaDias(data, 25))
  if (!perto.length) return null
  const dist = (f: FaturaResumo) => Math.abs(Date.parse(f.venc) - Date.parse(data))
  perto.sort((a, b) => dist(a) - dist(b))
  const conferida = (f: FaturaResumo) => f.semCat === 0 && (f.totalPdf === null || igual(f.totalPdf, f.soma))
  const bate = perto.find(f => igual(valorDaFatura(f), v) && conferida(f))
  if (bate) return { tipo: 'bate', fatura: bate }
  const provavel = perto.find(f => igual(valorDaFatura(f), v) || igual(f.soma, v)) || perto[0]
  const nome = `${provavel.cartaoNome} de ${ddmm(provavel.venc)}`
  const vf = valorDaFatura(provavel)
  const pend = pendenciasDaFatura(provavel).filter(x => !(provavel.totalPdf === null && x.startsWith('falta o total') && igual(provavel.soma, v)))
  const cabeca = igual(vf, v)
    ? `Parece o pagamento da fatura ${nome} (${brl(v)}), mas ela ainda não está conferida`
    : `Parece o pagamento da fatura ${nome}, mas o banco pagou ${brl(v)} e a fatura está com ${brl(vf)} (diferença de ${brl(c2(v - vf))})`
  const oque = pend.length ? `O que fazer: ${pend.join('; ')}.` : 'Confira os valores da fatura até o total bater com o que o banco pagou.'
  return { tipo: 'difere', fatura: provavel, aviso: `${cabeca}. ${oque}` }
}
