// ============================================================================
// Etapa Entrega/Pendente do pipeline novo (`obj_enc_pipeline`): a lista se divide em
//   1. o POOL — pets sem tarefa de entrega (ninguém programou ainda), em cima;
//   2. "Programado" — pets com a tarefa atribuída OU com previsão (mig 172: a previsão é do
//      contrato e independe de atribuição), em sub-grupos pelo DIA DA PREVISÃO e, dentro de cada
//      dia, pelo PERÍODO (Manhã · Tarde · Dia todo · Sem período). Atribuído sem data → "Sem data".
// Pedido do Lucas em 27/10/2026. O farol "📬 Programar entrega" (ex-"Registrar entrega") fica
// feito só com a ATRIBUIÇÃO — previsão sem responsável continua pendente.
//
// Ordem dos dias: cronológica — o que ficou para trás e não foi concluído no sistema (Há 3 dias,
// Ontem) vem antes de Hoje, porque é o mais urgente; "Sem data" fecha a lista.
// Puro (sem React/Supabase) pra rodar no `npm test`.
// ============================================================================

export type Programacao = {
  /** yyyy-mm-dd, ou ausente quando foi atribuída sem previsão */
  prevData?: string
  /** 'manha' | 'tarde' | 'dia_todo' */
  prevPeriodo?: string
}

export type GrupoPeriodo<T> = {
  /** 'manha' | 'tarde' | 'dia_todo' | 'sem_periodo' */
  chave: string
  rotulo: string
  itens: T[]
}

export type GrupoDia = {
  /** yyyy-mm-dd, ou 'sem_data' */
  chave: string
  /** "Hoje (27/out)", "Há 3 dias (24/out)", "Sem data" */
  rotulo: string
  /** dia anterior a hoje — a entrega era pra ter acontecido */
  atrasado: boolean
  hoje: boolean
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const PERIODOS: { chave: string; rotulo: string }[] = [
  { chave: 'manha', rotulo: 'Manhã' },
  { chave: 'tarde', rotulo: 'Tarde' },
  { chave: 'dia_todo', rotulo: 'Dia todo' },
  { chave: 'sem_periodo', rotulo: 'Sem período' },
]

function diasEntre(deIso: string, ateIso: string): number {
  const de = Date.UTC(+deIso.slice(0, 4), +deIso.slice(5, 7) - 1, +deIso.slice(8, 10))
  const ate = Date.UTC(+ateIso.slice(0, 4), +ateIso.slice(5, 7) - 1, +ateIso.slice(8, 10))
  return Math.round((ate - de) / 86400000)
}

/** Rótulo do dia relativo a `hoje` (ambos yyyy-mm-dd). */
export function rotuloDoDia(iso: string, hoje: string): string {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)))
  const curto = `${iso.slice(8, 10)}/${MESES[d.getUTCMonth()]}`
  const n = diasEntre(hoje, iso)
  if (n === 0) return `Hoje (${curto})`
  if (n === 1) return `Amanhã (${curto})`
  if (n === -1) return `Ontem (${curto})`
  if (n < 0) return `Há ${-n} dias (${curto})`
  return `${SEMANA[d.getUTCDay()]} (${curto})`
}

/**
 * Separa os itens em pool (sem programação) e programados por dia.
 * `prog(item)` devolve a programação do item, ou `null` quando não há tarefa de entrega.
 * Dentro de cada dia: Manhã → Tarde → Dia todo → Sem período (só os que têm pet), mantendo a
 * ordem recebida dentro de cada período.
 */
export function agruparProgramacao<T>(
  itens: T[],
  prog: (item: T) => Programacao | null,
  hoje: string,
): { pool: T[]; dias: (GrupoDia & { itens: T[]; periodos: GrupoPeriodo<T>[] })[] } {
  const pool: T[] = []
  const porDia = new Map<string, { item: T; periodo: string }[]>()
  for (const item of itens) {
    const p = prog(item)
    if (!p) { pool.push(item); continue }
    const chave = p.prevData && /^\d{4}-\d{2}-\d{2}$/.test(p.prevData) ? p.prevData : 'sem_data'
    const periodo = PERIODOS.some(x => x.chave === p.prevPeriodo) && p.prevPeriodo !== 'sem_periodo' ? p.prevPeriodo! : 'sem_periodo'
    if (!porDia.has(chave)) porDia.set(chave, [])
    porDia.get(chave)!.push({ item, periodo })
  }
  const chaves = [...porDia.keys()].sort((a, b) => (a === 'sem_data' ? 1 : b === 'sem_data' ? -1 : a.localeCompare(b)))
  const dias = chaves.map(chave => {
    const doDia = porDia.get(chave)!
    const periodos = PERIODOS
      .map(per => ({ ...per, itens: doDia.filter(x => x.periodo === per.chave).map(x => x.item) }))
      .filter(per => per.itens.length > 0)
    return {
      chave,
      rotulo: chave === 'sem_data' ? 'Sem data' : rotuloDoDia(chave, hoje),
      atrasado: chave !== 'sem_data' && chave < hoje,
      hoje: chave === hoje,
      itens: periodos.flatMap(per => per.itens),
      periodos,
    }
  })
  return { pool, dias }
}
