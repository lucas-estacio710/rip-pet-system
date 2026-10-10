/**
 * Memória da sessão pra NOMES de pessoas e pra lista de QUEM PODE RECEBER tarefa — item 7 dos
 * ajustes finos (09/10/2026: "atribuir / ver quem está atribuído demora 3, 4 segundos").
 *
 * As duas RPCs (`resolver_nomes_perfis`, `listar_atribuiveis_operacional`) eram chamadas de novo
 * a cada tela aberta — no pipeline (Pelinho, Personalizados, Entrega) e no /tarefas. Nome de
 * pessoa quase não muda; a lista de atribuíveis muda pouco. Aqui ficam em memória do módulo
 * (some no reload da página) com validade curta pra lista, e a 2ª abertura é instantânea.
 *
 * ⚠️ `perfis` só deixa ler o PRÓPRIO perfil — nome de outra pessoa SEMPRE por RPC (memória
 * `feedback_perfis_select_so_proprio`). `p_para` é obrigatório na prática (mig 145).
 */

type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }> }

export type Atribuivel = { user_id: string; nome: string | null; role?: string }

const nomes = new Map<string, string>()
const listas = new Map<string, { em: number; promessa: Promise<Atribuivel[]> }>()
const VALIDADE_LISTA_MS = 5 * 60 * 1000

/** Nomes já conhecidos, sem ir ao banco (pra desenhar na hora). */
export function nomesConhecidos(ids: string[]): Record<string, string> {
  const r: Record<string, string> = {}
  for (const id of ids) { const n = nomes.get(id); if (n) r[id] = n }
  return r
}

/** Nomes por user_id: devolve da memória e busca só os que faltam (uma ida só). */
export async function nomesDePerfis(cliente: unknown, ids: string[]): Promise<Record<string, string>> {
  const faltam = [...new Set(ids.filter(id => id && !nomes.has(id)))]
  if (faltam.length > 0) {
    const { data } = await (cliente as Rpc).rpc('resolver_nomes_perfis', { p_user_ids: faltam })
    for (const r of (data || []) as { user_id: string; nome: string | null }[]) nomes.set(r.user_id, r.nome || 'Sem nome')
  }
  return nomesConhecidos(ids)
}

/** Quem pode receber tarefa na unidade. Reaproveita a mesma ida em voo e guarda por 5 min. */
export function atribuiveis(cliente: unknown, unidadeId: string, para: 'tarefas' | 'remocao'): Promise<Atribuivel[]> {
  const chave = `${unidadeId}|${para}`
  const atual = listas.get(chave)
  if (atual && Date.now() - atual.em < VALIDADE_LISTA_MS) return atual.promessa
  const promessa = Promise.resolve((cliente as Rpc).rpc('listar_atribuiveis_operacional', { p_unidade_id: unidadeId, p_para: para }))
    .then(({ data }) => {
      const lista = (data || []) as Atribuivel[]
      // Lista vazia não fica guardada: pode ser a sessão ainda carregando (RPC volta null sem
      // erro) — guardar prenderia "ninguém pode receber" por 5 min.
      if (lista.length === 0) listas.delete(chave)
      for (const p of lista) if (p.nome) nomes.set(p.user_id, p.nome)
      return lista
    })
    .catch(() => { listas.delete(chave); return [] as Atribuivel[] })
  listas.set(chave, { em: Date.now(), promessa })
  return promessa
}
