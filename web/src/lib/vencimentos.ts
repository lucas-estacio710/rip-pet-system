// VENCIMENTOS DAS CONTAS FIXAS — quando cada conta cai DE VERDADE (10/10/2026).
//
// Guarda-se a REGRA, nunca a data (fin_contas_fixas, mig 160): "todo dia 10",
// "5º dia útil", "último dia útil". A data de cada mês sai daqui, com fim de
// semana e feriado nacional — os mesmos de lib/recebiveis.ts (`ehDiaUtil`), que
// já foram conferidos contra o extrato da InterPag.
//
// Vencimento em sábado, domingo ou feriado: boleto paga no próximo dia útil sem
// multa (Lei 7.089/83) → ajuste 'depois'. Há conta que não pode atrasar nem um
// dia (salário, certos impostos) → ajuste 'antes'. A escolha é de quem cadastra.
//
// Puro, sem I/O — testado em lib/__tests__/vencimentos.test.ts.

import { ehDiaUtil } from './recebiveis.ts'

export type RegraVencimento = {
  regra: 'dia' | 'dia_util' | 'ultimo_util'
  dia: number | null
  ajuste: 'depois' | 'antes'
}
export type Vencimento = {
  /** a data da regra ("dia 10"), antes de fugir do fim de semana */
  original: string
  /** quando paga de verdade */
  data: string
  /** os dias pulados no caminho, pra tela riscar */
  riscados: string[]
}

/** Nome dos feriados — só pra mostrar ("feriado · N. Sra. Aparecida"). */
const NOMES: Record<string, string> = {
  '01-01': 'Confraternização', '04-21': 'Tiradentes', '05-01': 'Dia do Trabalho', '09-07': 'Independência',
  '10-12': 'N. Sra. Aparecida', '11-02': 'Finados', '11-15': 'Proclamação da República', '11-20': 'Consciência Negra',
  '12-25': 'Natal',
  '2026-02-16': 'Carnaval', '2026-02-17': 'Carnaval', '2026-04-03': 'Sexta-feira Santa', '2026-06-04': 'Corpus Christi',
  '2027-02-08': 'Carnaval', '2027-02-09': 'Carnaval', '2027-03-26': 'Sexta-feira Santa', '2027-05-27': 'Corpus Christi',
}
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m, d))
const iso = (d: Date) => d.toISOString().slice(0, 10)
export const dataUTC = (s: string) => new Date(`${s}T00:00:00Z`)
export const diaUtil = (s: string) => ehDiaUtil(dataUTC(s))

/** "sábado" · "domingo" · "feriado (N. Sra. Aparecida)" · '' se for dia útil. */
export function porQueNaoUtil(s: string): string {
  const d = dataUTC(s)
  if (ehDiaUtil(d)) return ''
  const dow = d.getUTCDay()
  if (dow === 0 || dow === 6) return DIAS[dow]
  const nome = NOMES[s] || NOMES[s.slice(5)]
  return nome ? `feriado (${nome})` : 'feriado'
}
export const nomeFeriado = (s: string): string | null => (diaUtil(s) || [0, 6].includes(dataUTC(s).getUTCDay())) ? null : (NOMES[s] || NOMES[s.slice(5)] || 'feriado')

/** O vencimento de uma regra num mês (mes0: 0 = janeiro). */
export function vencimentoNoMes(r: RegraVencimento, ano: number, mes0: number): Vencimento | null {
  const ultimo = utc(ano, mes0 + 1, 0).getUTCDate()
  if (r.regra === 'dia_util') {
    const n = Math.max(1, r.dia || 1)
    let k = 0
    for (let d = 1; d <= ultimo; d++) {
      const x = utc(ano, mes0, d)
      if (ehDiaUtil(x) && ++k === n) return { original: iso(x), data: iso(x), riscados: [] }
    }
    return null
  }
  if (r.regra === 'ultimo_util') {
    for (let d = ultimo; d >= 1; d--) {
      const x = utc(ano, mes0, d)
      if (ehDiaUtil(x)) return { original: iso(x), data: iso(x), riscados: [] }
    }
    return null
  }
  // 'dia': dia 31 em mês de 30 vira o último dia do mês.
  const d0 = utc(ano, mes0, Math.min(Math.max(1, r.dia || 1), ultimo))
  const x = new Date(d0)
  const riscados: string[] = []
  while (!ehDiaUtil(x)) {
    riscados.push(iso(x))
    x.setUTCDate(x.getUTCDate() + (r.ajuste === 'antes' ? -1 : 1))
  }
  return { original: iso(d0), data: iso(x), riscados }
}

/** Os próximos N vencimentos a partir de um mês (prévia do cadastro). */
export function proximosVencimentos(r: RegraVencimento, ano: number, mes0: number, n = 5): Vencimento[] {
  const out: Vencimento[] = []
  for (let i = 0; out.length < n && i < n + 3; i++) {
    const v = vencimentoNoMes(r, ano + Math.floor((mes0 + i) / 12), (mes0 + i) % 12)
    if (v) out.push(v)
  }
  return out
}

/** "todo dia 10" · "5º dia útil" · "último dia útil" */
export function descreverRegra(r: RegraVencimento): string {
  if (r.regra === 'dia_util') return `${r.dia}º dia útil`
  if (r.regra === 'ultimo_util') return 'último dia útil'
  return `todo dia ${r.dia}`
}
