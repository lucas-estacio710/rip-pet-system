// ============================================================================
// Faróis do pipeline REDESENHADO — lista de pendências (fase 2.4 do
// docs/PLAYBOOK_REDESENHO_PIPELINE.md; itens 6, 26 e 33 de docs/REDESENHO_CARDS_PIPELINE.md).
//
// O CÁLCULO de cada farol continua em `lib/contrato-tags.ts` (computeAllTags), que já sai na
// ordem fixa do item 26 desde o 0.15. Aqui fica só o que é do popup novo: separar concluídas
// de pendentes e o texto do estado. Os faróis NOVOS (🚐 Encaminhamento, 📬 Registrar entrega)
// entram aqui quando chegarem (2.9/2.13), FORA do computeAllTags — senão apareceriam no
// detalhe do contrato, em /tutores e em PI.
// ============================================================================

import type { ComputedTag } from '@/lib/contrato-tags'

export type FarolLista = {
  id: string
  emoji: string
  label: string
  /** Concluída "por ter feito" (✓ animado) × "por não ter" (chip cinza) × pendente. */
  tipo: 'feito' | 'nao_tem' | 'pendente'
  /** Texto à direita: "Feito" não aparece (vira o ✓); os demais aparecem escritos. */
  texto: string | null
}

/** Concluída = feito ou recusado (item 6: "Não quer"/"Sem pelinho" contam como concluída). */
export function farolConcluido(tag: Pick<ComputedTag, 'state'>): boolean {
  return tag.state === 'completed' || tag.state === 'rejected'
}

function textoNaoTem(id: string): string {
  if (id === 'pelinho') return 'Sem pelinho'
  if (id === 'rescaldo') return 'Não tem'
  return 'Não quer'
}

function textoPendente(tag: ComputedTag): string {
  if (tag.state === 'alert') return 'Em aberto'
  if (tag.state === 'in_progress') {
    const n = tag.count ?? null
    return n ? `Em andamento · ${n}` : 'Em andamento'
  }
  if (tag.id === 'foto') {
    const n = tag.count ?? null
    return n ? `${n} pendente${n === 1 ? '' : 's'}` : 'Pendente'
  }
  return 'A definir'
}

/** Um farol calculado vira linha da lista. Estados ocultos/fantasma ficam de fora. */
export function farolParaLista(tag: ComputedTag): FarolLista | null {
  if (tag.state === 'hidden' || tag.state === 'ghost') return null
  if (tag.state === 'completed') return { id: tag.id, emoji: tag.emoji, label: tag.label, tipo: 'feito', texto: null }
  if (tag.state === 'rejected') return { id: tag.id, emoji: tag.emoji, label: tag.label, tipo: 'nao_tem', texto: textoNaoTem(tag.id) }
  return { id: tag.id, emoji: tag.emoji, label: tag.label, tipo: 'pendente', texto: textoPendente(tag) }
}

/** Item 33: CONCLUÍDAS em cima, depois PENDENTES — cada grupo mantém a ordem fixa recebida. */
export function separarFarois(tags: ComputedTag[]): { concluidas: FarolLista[]; pendentes: FarolLista[] } {
  const linhas = tags.map(farolParaLista).filter((l): l is FarolLista => l !== null)
  return {
    concluidas: linhas.filter(l => l.tipo !== 'pendente'),
    pendentes: linhas.filter(l => l.tipo === 'pendente'),
  }
}
