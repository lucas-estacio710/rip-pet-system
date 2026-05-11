// Ordem custom de exibição das categorias de URNA nos filtros do estoque/contratos.
// Categorias não listadas vão pro final, em ordem alfabética.
export const ORDEM_URNAS = [
  'Standard',
  'Sleeping',
  'Biournas',
  'Porta/Box',
  'Resinas',
  'Potes',
  'Pedras',
] as const

// Acessórios já tinha ordem custom; trazendo pra cá pra centralizar.
export const ORDEM_ACESSORIOS = [
  'Personalizados',
  'Porta-Retratos',
  'Porta-Pelos',
  'Porta-Cinzas',
  'Miniaturas',
  'Chaveiros Cinzas',
] as const

export function ordenarCategoriasUrnas(categorias: string[]): string[] {
  const ordemMap = new Map<string, number>()
  ORDEM_URNAS.forEach((cat, i) => ordemMap.set(cat, i))
  return [...categorias].sort((a, b) => {
    const ia = ordemMap.get(a)
    const ib = ordemMap.get(b)
    if (ia !== undefined && ib !== undefined) return ia - ib
    if (ia !== undefined) return -1   // a está na lista, b não → a primeiro
    if (ib !== undefined) return 1
    return a.localeCompare(b)         // ambos fora da lista → alfabético
  })
}

export function ordenarCategoriasAcessorios(categorias: string[]): string[] {
  const set = new Set(categorias)
  const naLista = ORDEM_ACESSORIOS.filter(cat => set.has(cat))
  const fora = categorias.filter(c => !ORDEM_ACESSORIOS.includes(c as typeof ORDEM_ACESSORIOS[number])).sort()
  return [...naLista, ...fora]
}
