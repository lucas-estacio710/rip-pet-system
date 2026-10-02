// ============================================================================
// Observação da tarefa de ENTREGA: previsão e endereço alternativo dentro do texto.
//
// O "Registrar entrega" do pipeline redesenhado (D10) pede Previsão (data + período) e
// Alteração de Endereço, mas não há coluna pra isso: vão concatenados em
// `tarefas_operacionais.observacao_atribuicao`, no formato
//
//     [Prev: 05/10/2026 · Tarde] [End: Rua X, 123 - Centro] texto livre
//
// Os dois lados usam ESTE arquivo — o pipeline monta, o /tarefas lê (Waze/Maps do Operacional
// vão pro `End` quando existe). Legado sem colchete cai inteiro em `texto` (medido em
// 02/10/2026: nenhuma das observações no banco tem `[` ou `]`).
//
// Colchete digitado pelo usuário é REMOVIDO ao montar, nos dois lados — senão um texto com
// "[End: ...]" escrito à mão viraria endereço de navegação.
// ============================================================================

export type PeriodoEntrega = 'manha' | 'tarde' | 'dia_todo'

export type ObsEntrega = {
  /** yyyy-mm-dd */
  prevData?: string
  prevPeriodo?: PeriodoEntrega
  /** Endereço alternativo — só existe quando diferente do cadastro. */
  endereco?: string
  texto: string
}

const ROTULO_PERIODO: Record<PeriodoEntrega, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  dia_todo: 'Dia todo',
}

function periodoPorRotulo(rotulo: string): PeriodoEntrega | undefined {
  const r = rotulo.trim().toLowerCase()
  return (Object.keys(ROTULO_PERIODO) as PeriodoEntrega[]).find(k => ROTULO_PERIODO[k].toLowerCase() === r)
}

/** Tira colchetes e espaços das pontas — colchete é reservado pras tags. */
export function limparTextoObs(t: string | null | undefined): string {
  return String(t ?? '').replace(/[[\]]/g, '').trim()
}

function isoParaBr(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}

function brParaIso(br: string): string | undefined {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim())
  if (!m) return undefined
  const [, d, mes, a] = m
  const data = new Date(`${a}-${mes}-${d}T12:00:00`)
  if (Number.isNaN(data.getTime()) || data.getDate() !== Number(d)) return undefined
  return `${a}-${mes}-${d}`
}

/** Monta a string gravada em `observacao_atribuicao`. `null` quando não há nada. */
export function montarObsEntrega(o: ObsEntrega): string | null {
  const partes: string[] = []
  const data = o.prevData ? isoParaBr(o.prevData) : null
  const periodo = o.prevPeriodo ? ROTULO_PERIODO[o.prevPeriodo] : null
  if (data || periodo) partes.push(`[Prev: ${[data, periodo].filter(Boolean).join(' · ')}]`)
  const endereco = limparTextoObs(o.endereco)
  if (endereco) partes.push(`[End: ${endereco}]`)
  const texto = limparTextoObs(o.texto)
  if (texto) partes.push(texto)
  return partes.length > 0 ? partes.join(' ') : null
}

/** Lê o que `montarObsEntrega` gravou. Tolerante: sem tags, tudo vira `texto`. */
export function lerObsEntrega(raw: string | null | undefined): ObsEntrega {
  let resto = String(raw ?? '')
  const out: ObsEntrega = { texto: '' }

  const prev = /\[Prev:\s*([^\]]*)\]/.exec(resto)
  if (prev) {
    resto = resto.replace(prev[0], ' ')
    for (const pedaco of prev[1].split('·')) {
      const iso = brParaIso(pedaco)
      if (iso) { out.prevData = iso; continue }
      const per = periodoPorRotulo(pedaco)
      if (per) out.prevPeriodo = per
    }
  }

  const end = /\[End:\s*([^\]]*)\]/.exec(resto)
  if (end) {
    resto = resto.replace(end[0], ' ')
    const e = end[1].trim()
    if (e) out.endereco = e
  }

  out.texto = resto.replace(/\s+/g, ' ').trim()
  return out
}

/** "📅 05/10 · Tarde" — `null` quando não há previsão. */
export function formatarPrevisao(o: Pick<ObsEntrega, 'prevData' | 'prevPeriodo'>): string | null {
  const br = o.prevData ? isoParaBr(o.prevData) : null
  const data = br ? br.slice(0, 5) : null
  const periodo = o.prevPeriodo ? ROTULO_PERIODO[o.prevPeriodo] : null
  if (!data && !periodo) return null
  return `📅 ${[data, periodo].filter(Boolean).join(' · ')}`
}
