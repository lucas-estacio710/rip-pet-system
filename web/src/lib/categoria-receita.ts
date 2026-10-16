// O RAMO "RECEITAS" da árvore de categorias (mig 171, 16/10/2026): a outra receita (teste de
// Pix, contrato corporativo) é um lançamento gravado com valor NEGATIVO numa conta de receita.
// Os seletores de DESPESA (lançamento, divisão, acerto, conta de acompanhamento) não podem
// oferecer essas categorias; a Conciliação com Extrato oferece só elas no "outra receita".

export const RAIZ_RECEITAS = 'Receitas'

type CatMin = { id: string; nome: string; parent_id: string | null }

/** Os ids do ramo Receitas: a raiz e tudo abaixo dela. */
export function idsDoRamoReceitas<T extends CatMin>(cats: T[]): Set<string> {
  const ids = new Set(cats.filter(c => !c.parent_id && c.nome === RAIZ_RECEITAS).map(c => c.id))
  let cresceu = ids.size > 0
  while (cresceu) {
    cresceu = false
    for (const c of cats) if (c.parent_id && ids.has(c.parent_id) && !ids.has(c.id)) { ids.add(c.id); cresceu = true }
  }
  return ids
}

/** A árvore sem o ramo Receitas — o que os seletores de despesa mostram. */
export function semReceitas<T extends CatMin>(cats: T[]): T[] {
  const r = idsDoRamoReceitas(cats)
  return r.size ? cats.filter(c => !r.has(c.id)) : cats
}

/** As folhas do ramo Receitas — o que o "outra receita" oferece. */
export function folhasDeReceita<T extends CatMin>(cats: T[]): T[] {
  const r = idsDoRamoReceitas(cats)
  return cats.filter(c => r.has(c.id) && c.parent_id && !cats.some(f => f.parent_id === c.id))
}
