import type { Categoria, ParceiroConfig } from '@/lib/tipos'

/**
 * Categoria por ANO MÓVEL de 12 meses (decisão #12).
 *
 * A transparência é requisito, não enfeite: o parceiro precisa ver a conta que
 * produziu a categoria dele ("N pets desde DD/MM/AAAA"). Categoria opaca destrói
 * a confiança no programa inteiro — por isso `inicioJanela` sai daqui junto.
 */

export function inicioJanela(hoje = new Date()): Date {
  const d = new Date(hoje)
  d.setFullYear(d.getFullYear() - 1)
  return d
}

export function categoriaPara(qtd: number, faixas: ParceiroConfig['faixas']): Categoria {
  if (qtd <= faixas.bronze_max) return 'bronze'
  if (qtd <= faixas.prata_max) return 'prata'
  return 'ouro'
}

/** Quanto falta pro próximo nível. `null` em Ouro (já é o topo). */
export function progressoCategoria(qtd: number, faixas: ParceiroConfig['faixas']) {
  const atual = categoriaPara(qtd, faixas)
  if (atual === 'ouro') return { atual, proxima: null, faltam: null }

  const proxima: Categoria = atual === 'bronze' ? 'prata' : 'ouro'
  const alvo = atual === 'bronze' ? faixas.bronze_max + 1 : faixas.prata_max + 1
  return { atual, proxima, faltam: Math.max(0, alvo - qtd) }
}

export function valorComissao(
  categoria: Categoria,
  tipoCremacao: 'individual' | 'coletiva',
  comissao: ParceiroConfig['comissao']
): number {
  return comissao[categoria][tipoCremacao === 'individual' ? 'ind' : 'col']
}

export const ROTULO_CATEGORIA: Record<Categoria, string> = {
  bronze: 'Bronze',
  prata: 'Prata',
  ouro: 'Ouro',
}
