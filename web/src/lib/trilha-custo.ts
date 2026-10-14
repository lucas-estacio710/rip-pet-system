// TRILHA DO CUSTO (14/10/2026) — "quero que todos os meus lançamentos e os adjacentes se
// conversem" (Lucas). Um custo pode andar por várias unidades: Santos pagou o tráfego de
// Pinda e cobrou da Matriz no repasse; a Matriz reconheceu e repassou pra Pinda. Cada passo
// é uma `fin_cobrancas`, e cada cobrança aceita gera duas pernas na DRE (despesa em quem
// deve, dedução em quem cobrou — mig 166). Esta lib remonta a corrente a partir dos elos:
//
//   lancamento_origem_id    → de onde a cobrança saiu (a compra original, ou a despesa que
//                             outra cobrança já tinha criado — é isso que encadeia)
//   lancamento_aceite_id    → a despesa que nasceu em quem deve, ao reconhecer
//   lancamento_reembolso_id → a dedução que nasceu em quem cobrou (mig 166)
//
// ⚠️ Nos acertos do Repasse, `lancamento_origem_id` guarda o REEMBOLSO (mesmo id de
// `lancamento_reembolso_id`), não uma compra — por isso a raiz só é "compra original" quando
// o id difere do reembolso e o lançamento não é perna (`origem <> 'sistema'`).
//
// Função pura: quem busca no banco é o TrilhaCustoModal.

export type CobTrilha = {
  id: string
  unidade_credora: string
  unidade_devedora: string
  valor: number
  status: string            // emitida · aceita · liquidada (recusada/cancelada ficam fora)
  data: string
  descricao: string | null
  repasse_id: string | null
  lancamento_origem_id: string | null
  lancamento_aceite_id: string | null
  lancamento_reembolso_id: string | null
}
export type LancTrilha = { id: string; unidade_id: string; valor: number; origem: string; descricao: string | null; data_competencia: string }

export type PassoTrilha = { cob: CobTrilha; nivel: number }
export type SaldoUnidade = {
  unidade: string
  recebeu: number     // custo que chegou nela (pagou de verdade, ou reconheceu uma cobrança)
  repassou: number    // custo que ela já passou adiante (cobrança reconhecida)
  pendente: number    // cobrança que ela emitiu e a outra ainda não reconheceu
  fica: number        // recebeu − repassou: o que pesa na DRE dela hoje
}
export type Trilha = { raiz: LancTrilha | null; passos: PassoTrilha[]; saldos: SaldoUnidade[] }

const c2 = (n: number) => Math.round(n * 100) / 100
const VIVAS = new Set(['emitida', 'aceita', 'liquidada'])

/** A cobrança "mãe" de C: a que criou a despesa da qual C saiu. */
function maeDe(c: CobTrilha, cobs: CobTrilha[]): CobTrilha | undefined {
  if (!c.lancamento_origem_id || c.lancamento_origem_id === c.lancamento_reembolso_id) return undefined
  return cobs.find(p => p.id !== c.id && p.lancamento_aceite_id === c.lancamento_origem_id)
}

export function montarTrilha(todas: CobTrilha[], lancs: Map<string, LancTrilha>): Trilha {
  const cobs = todas.filter(c => VIVAS.has(c.status))
  const nivel = new Map<string, number>()
  const nivelDe = (c: CobTrilha, guarda = 0): number => {
    if (nivel.has(c.id)) return nivel.get(c.id)!
    const m = guarda < 10 ? maeDe(c, cobs) : undefined
    const n = m ? nivelDe(m, guarda + 1) + 1 : 0
    nivel.set(c.id, n)
    return n
  }
  const passos = cobs.map(c => ({ cob: c, nivel: nivelDe(c) }))
    .sort((a, b) => a.nivel - b.nivel || a.cob.data.localeCompare(b.cob.data))

  // a compra original: a origem de uma cobrança de nível 0, quando é lançamento "de verdade"
  const raizes = passos.filter(p => p.nivel === 0).map(p => p.cob)
  let raiz: LancTrilha | null = null
  for (const r of raizes) {
    const id = r.lancamento_origem_id
    if (!id || id === r.lancamento_reembolso_id) continue
    const l = lancs.get(id)
    if (l && l.origem !== 'sistema') { raiz = l; break }
  }

  const s = new Map<string, SaldoUnidade>()
  const de = (u: string) => {
    if (!s.has(u)) s.set(u, { unidade: u, recebeu: 0, repassou: 0, pendente: 0, fica: 0 })
    return s.get(u)!
  }
  // quem pagou primeiro: a compra original inteira, ou (sem ela ligada) o que cobrou
  if (raiz) de(raiz.unidade_id).recebeu += Math.abs(raiz.valor)
  else for (const r of raizes) de(r.unidade_credora).recebeu += Number(r.valor)
  for (const { cob } of passos) {
    const v = Number(cob.valor)
    if (cob.status === 'emitida') { de(cob.unidade_credora).pendente += v; de(cob.unidade_devedora); continue }
    de(cob.unidade_devedora).recebeu += v
    de(cob.unidade_credora).repassou += v
  }
  const saldos = [...s.values()].map(x => ({
    ...x, recebeu: c2(x.recebeu), repassou: c2(x.repassou), pendente: c2(x.pendente), fica: c2(x.recebeu - x.repassou),
  })).sort((a, b) => b.fica - a.fica)

  return { raiz, passos, saldos }
}

/** Todos os ids de lançamento citados pelas cobranças (pra buscar o próximo elo). */
export function idsDosElos(cobs: CobTrilha[]): string[] {
  const ids = new Set<string>()
  for (const c of cobs) for (const x of [c.lancamento_origem_id, c.lancamento_aceite_id, c.lancamento_reembolso_id]) if (x) ids.add(x)
  return [...ids]
}
