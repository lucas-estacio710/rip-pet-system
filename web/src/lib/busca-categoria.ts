// BUSCA DE CATEGORIA DE DESPESA — uma só, pro formulário e pro Colar do extrato.
//
// Nasceu dentro do LancamentosTab (mig 109, "gasolina" acha Combustível) e saiu
// de lá em 02/10/2026 porque o Colar do extrato usava uma <datalist> do navegador,
// que só procura no caminho escrito: "lavagem" — sinônimo de Operacional ›
// Veículos › Limpeza — achava no formulário e não achava no lote (relato do
// Lucas). Duas buscas para a mesma árvore dão respostas diferentes; agora é uma.
//
// ⚠️ Não confundir com `lib/categorias.ts`, que é a ORDEM de exibição das
// categorias de PRODUTO (urnas, acessórios) no estoque e nos contratos.

export type CategoriaBuscavel = { id: string; nome: string; termos: string[] | null }

/** Tira acento pra "pedagio" achar "pedágio" e vice-versa. */
export const normCat = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * SUGESTÃO POR SINÔNIMO a partir do texto do banco/fatura (02/10/2026) — a
 * segunda fonte do Colar, pra quando não há histórico (a 1ª fatura colada não
 * tem nenhum). Compara PALAVRA INTEIRA do texto com palavra inteira do nome e
 * dos sinônimos: pedaço de palavra faria "posto" casar com "imposto" (9 falsos).
 * Só devolve quando há UM vencedor. Não é certeza ("Google One" cai em Tráfego
 * pago pela palavra "google") — a tela marca "confira", e o histórico, quando
 * existir, manda.
 */
const ALIAS_CARTAO: Record<string, string> = { ifd: 'ifood' }   // "IFD*RAPOSO BAR" = iFood
const PALAVRA_VAZIA = new Set(['parcela', 'parc', 'inc', 'ltda', 'eireli', 'subscr', 'subscription', 'pagamento', 'compra', 'vista', 'internacional'])
export function sugerirPorSinonimo<T extends CategoriaBuscavel>(folhas: T[], descricao: string): T | null {
  const palavras = (s: string) => normCat(s).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !/^\d+$/.test(w))
  const doTexto = palavras(
    descricao.replace(/([a-z])([A-Z])/g, '$1 $2')       // "AutoPostoViaPraia" → "Auto Posto Via Praia"
             .replace(/\d{4,}/g, ' '),                  // "ADS39457549" → "ADS"
  ).map(w => ALIAS_CARTAO[w] || w).filter(w => !PALAVRA_VAZIA.has(w))
  if (!doTexto.length) return null
  let melhor: T | null = null, nota = 0, empate = false
  for (const c of folhas) {
    const daCat = new Set(palavras(`${c.nome} ${(c.termos || []).join(' ')}`))
    const k = doTexto.filter(w => daCat.has(w)).length
    if (k > nota) { melhor = c; nota = k; empate = false } else if (k && k === nota) empate = true
  }
  return nota && !empate ? melhor : null
}

/**
 * Busca no NOME, no CAMINHO e nos SINÔNIMOS. Todas as palavras digitadas têm de
 * aparecer; quem bate no nome do item vem antes de quem bate só por sinônimo.
 */
export function buscarCategorias<T extends CategoriaBuscavel>(
  folhas: T[],
  caminhoDe: (id: string) => string,
  busca: string,
  max = 40,
): { c: T; forte: boolean; termoBatido?: string }[] {
  const q = busca.trim()
  if (q.length < 2) return []
  const palavras = normCat(q).split(/\s+/)
  return folhas
    .map(c => {
      const termos = (c.termos || []).map(normCat)
      const alvo = normCat(caminhoDe(c.id)) + ' ' + termos.join(' ')
      if (!palavras.every(t => alvo.includes(t))) return null
      const forte = palavras.every(t => normCat(c.nome).includes(t))
      const termoBatido = termos.find(t => palavras.some(p => t.includes(p)))
      return { c, forte, termoBatido }
    })
    .filter((x): x is { c: T; forte: boolean; termoBatido: string | undefined } => x !== null)
    .sort((a, b) => Number(b.forte) - Number(a.forte))
    .slice(0, max)
}
