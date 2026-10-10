/**
 * ‹ Registro Anterior · Próximo Registro › no detalhe do contrato (docs/PLAYBOOK_CONTRATO_ID.md §3).
 *
 * Regra do Lucas (10/10/2026): vai para o pet VIZINHO DO MESMO STATUS, na ORDEM EM QUE ESTÁ NA TELA
 * do pipeline. No primeiro, o Anterior fica desabilitado; no último, o Próximo. Sem lista de origem
 * (link direto, /tarefas, busca…), os botões não aparecem.
 *
 * O pipeline grava a lista no clique que abre o contrato (a ordem da TELA: viagens, CEP e ordenação
 * por nome são feitas no client, então só o DOM sabe a ordem certa). O detalhe só lê.
 * Funções puras aqui; o acesso ao sessionStorage fica nas duas pontas, sempre em try/catch.
 */

export const CHAVE_VIZINHOS = 'contrato:vizinhos'
const VALIDADE_MS = 12 * 60 * 60 * 1000

export type VizinhosGravados = {
  status: string
  ids: string[]
  /** id → nome do pet, pro title do botão. Opcional. */
  nomes?: Record<string, string>
  em: number
}

export type Vizinhos = {
  anterior: string | null
  proximo: string | null
  nomeAnterior: string | null
  nomeProximo: string | null
}

/**
 * Monta a lista a gravar a partir dos ids na ordem da tela: tira repetidos e fica só com os do
 * MESMO status do contrato aberto. Devolve null se o aberto não estiver na tela.
 */
export function montarVizinhos(
  idsNaTela: string[],
  statusDe: Record<string, string>,
  idAberto: string,
  nomes?: Record<string, string>,
  agora: number = Date.now(),
): VizinhosGravados | null {
  const status = statusDe[idAberto]
  if (!status) return null
  const vistos = new Set<string>()
  const ids: string[] = []
  for (const id of idsNaTela) {
    if (vistos.has(id) || statusDe[id] !== status) continue
    vistos.add(id)
    ids.push(id)
  }
  if (!ids.includes(idAberto)) return null
  const nomesDaLista = nomes ? Object.fromEntries(ids.filter(id => nomes[id]).map(id => [id, nomes[id]])) : undefined
  return { status, ids, nomes: nomesDaLista, em: agora }
}

/**
 * Vizinhos do contrato `id` na lista gravada. Null (= não mostrar os botões) se não houver lista,
 * se ela estiver velha (12h), se o contrato não estiver nela, ou se ele mudou de status desde que a
 * lista foi gravada (deixou de ser vizinho daquela etapa).
 */
export function vizinhosDe(lista: VizinhosGravados | null, id: string, status: string, agora: number = Date.now()): Vizinhos | null {
  if (!lista || !Array.isArray(lista.ids)) return null
  if (agora - lista.em > VALIDADE_MS) return null
  if (lista.status !== status) return null
  const i = lista.ids.indexOf(id)
  if (i < 0) return null
  const anterior = i > 0 ? lista.ids[i - 1] : null
  const proximo = i < lista.ids.length - 1 ? lista.ids[i + 1] : null
  return {
    anterior,
    proximo,
    nomeAnterior: anterior ? lista.nomes?.[anterior] ?? null : null,
    nomeProximo: proximo ? lista.nomes?.[proximo] ?? null : null,
  }
}

/** Lê do sessionStorage sem nunca quebrar (aba privada, JSON torto). */
export function lerVizinhosGravados(): VizinhosGravados | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE_VIZINHOS)
    if (!bruto) return null
    const v = JSON.parse(bruto) as VizinhosGravados
    return v && typeof v.status === 'string' && Array.isArray(v.ids) && typeof v.em === 'number' ? v : null
  } catch {
    return null
  }
}

export function gravarVizinhos(v: VizinhosGravados | null): void {
  try {
    if (v) sessionStorage.setItem(CHAVE_VIZINHOS, JSON.stringify(v))
    else sessionStorage.removeItem(CHAVE_VIZINHOS)
  } catch { /* aba privada / storage cheio: sem navegação, sem erro */ }
}
