// ============================================================================
// Etapa Entrega/Pendente do pipeline novo (`obj_enc_pipeline`): a lista se divide em
//   1. o POOL — pets sem tarefa de entrega (ninguém programou ainda), em cima;
//   2. "Programado" — pets com a tarefa atribuída, em sub-grupos pelo DIA DA PREVISÃO
//      (o `[Prev: …]` de `observacao_atribuicao`, lib/obs-entrega), mais "Sem data".
// Pedido do Lucas em 27/10/2026. Atribuir a entrega é o que tira o pet do pool: o farol
// "📬 Programar entrega" (ex-"Registrar entrega") fica feito nesse momento.
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
const ORDEM_PERIODO: Record<string, number> = { manha: 0, tarde: 1, dia_todo: 2 }

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
 * Dentro de cada dia: Manhã → Tarde → Dia todo → sem período, mantendo a ordem recebida no empate.
 */
export function agruparProgramacao<T>(
  itens: T[],
  prog: (item: T) => Programacao | null,
  hoje: string,
): { pool: T[]; dias: (GrupoDia & { itens: T[] })[] } {
  const pool: T[] = []
  const porDia = new Map<string, { item: T; ordem: number; i: number }[]>()
  itens.forEach((item, i) => {
    const p = prog(item)
    if (!p) { pool.push(item); return }
    const chave = p.prevData && /^\d{4}-\d{2}-\d{2}$/.test(p.prevData) ? p.prevData : 'sem_data'
    const ordem = p.prevPeriodo != null && p.prevPeriodo in ORDEM_PERIODO ? ORDEM_PERIODO[p.prevPeriodo] : 3
    if (!porDia.has(chave)) porDia.set(chave, [])
    porDia.get(chave)!.push({ item, ordem, i })
  })
  const chaves = [...porDia.keys()].sort((a, b) => (a === 'sem_data' ? 1 : b === 'sem_data' ? -1 : a.localeCompare(b)))
  const dias = chaves.map(chave => ({
    chave,
    rotulo: chave === 'sem_data' ? 'Sem data' : rotuloDoDia(chave, hoje),
    atrasado: chave !== 'sem_data' && chave < hoje,
    hoje: chave === hoje,
    itens: porDia.get(chave)!.sort((a, b) => a.ordem - b.ordem || a.i - b.i).map(x => x.item),
  }))
  return { pool, dias }
}
