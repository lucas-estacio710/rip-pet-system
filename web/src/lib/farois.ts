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
  /** Concluída "por ter feito" (✓ animado) × "por não ter" (chip cinza) × "pelo sistema" (✓ cinza,
   *  contrato finalizado com o farol aberto — item 10) × pendente. */
  tipo: 'feito' | 'nao_tem' | 'sistema' | 'pendente'
  /** Texto à direita: "Feito" não aparece (vira o ✓); os demais aparecem escritos. */
  texto: string | null
}

/** Concluída = feito ou recusado (item 6: "Não quer"/"Sem pelinho" contam como concluída). */
export function farolConcluido(tag: Pick<ComputedTag, 'state'>): boolean {
  // Mesma regra de `estadoConcluido` (contrato-tags) — repetida aqui de propósito: este arquivo só
  // importa TIPOS de lá, senão o `npm test` (Node puro) não resolve o alias `@/`.
  return tag.state === 'completed' || tag.state === 'rejected' || tag.state === 'sistema'
}

function textoNaoTem(id: string): string {
  if (id === 'pelinho') return 'Sem pelinho'
  if (id === 'rescaldo') return 'Não tem'
  return 'Não quer'
}

function textoPendente(tag: ComputedTag): string {
  // 📬 Registrar entrega (2.9): o texto vem pronto — "A entregar" ou "Com Juliana" (D10).
  if (tag.id === 'entrega') return tag.tooltip || 'A entregar'
  // 🚐 Encaminhamento (2.13b): "Sem viagem" ou "Sem lacre" (P-13), vindo pronto no tooltip.
  if (tag.id === 'encaminhamento') return tag.tooltip || 'Sem viagem'
  if (tag.state === 'alert') return 'Em aberto'
  if (tag.state === 'ghost') return 'A definir'   // item 3: o ❓ é pendente, não some
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
  if (tag.state === 'hidden') return null
  if (tag.state === 'sistema') return { id: tag.id, emoji: tag.emoji, label: tag.label, tipo: 'sistema', texto: 'Finalizado pelo sistema' }
  // Concluída mostra só o ✓ — exceto o 🚐, que mostra a viagem ("ST172", item 17).
  if (tag.state === 'completed') return { id: tag.id, emoji: tag.emoji, label: tag.label, tipo: 'feito', texto: tag.id === 'encaminhamento' ? (tag.sublabel || null) : null }
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
