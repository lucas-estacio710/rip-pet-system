/**
 * Consulta `.in(coluna, ids)` em lotes, paginando cada lote.
 *
 * 🔴 Por que existe: o PostgREST corta toda resposta em 1000 linhas SEM avisar, e um
 * `.in()` com centenas de ids estoura também o tamanho da URL. No pipeline uma etapa
 * agrupada carrega até 900 contratos de uma vez; os produtos deles passam de 1000 linhas
 * fácil, e o que vem cortado vira farol errado ("não tem urna", "pelinho pendente") calado.
 *
 * Cada lote é entregue a `aoChegar` assim que chega, com os ids que ele cobre — quem
 * consome só deve mexer nesses ids. Lote com erro é pulado (os ids dele ficam como
 * estavam) e contado em `falhas`.
 */
type Pagina<T> = { data: T[] | null; error: unknown }

export async function consultaEmLotes<T>(
  ids: string[],
  consulta: (lote: string[], de: number, ate: number) => PromiseLike<Pagina<T>>,
  aoChegar: (loteIds: string[], linhas: T[]) => void,
  opts: { tamanhoLote?: number; tamanhoPagina?: number } = {},
): Promise<{ falhas: number }> {
  const tamanhoLote = opts.tamanhoLote ?? 100
  const tamanhoPagina = opts.tamanhoPagina ?? 1000
  const lotes: string[][] = []
  for (let i = 0; i < ids.length; i += tamanhoLote) lotes.push(ids.slice(i, i + tamanhoLote))

  let falhas = 0
  await Promise.all(lotes.map(async lote => {
    const linhas: T[] = []
    for (let de = 0; ; de += tamanhoPagina) {
      const { data, error } = await consulta(lote, de, de + tamanhoPagina - 1)
      if (error || !data) { falhas++; return }
      linhas.push(...data)
      if (data.length < tamanhoPagina) break
    }
    aoChegar(lote, linhas)
  }))
  return { falhas }
}
