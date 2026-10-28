// ============================================================================
// Cor fixa por pessoa — como o nome de cada participante num grupo grande de WhatsApp
// (27/10/2026, pedido do Lucas). A cor sai de um hash do `user_id`, não do nome: trocar o
// nome no cadastro não muda a cor, e a mesma pessoa tem a mesma cor em qualquer aparelho.
//
// Paleta (28/10/2026): 40 cores = 20 matizes, de 16 em 16 graus a partir do laranja, × 2 tons.
// Cada cor foi calculada pra ter a MESMA luminância dentro do tom (0,15 forte / 0,25 claro), então
// amarelo não some no tema white nem azul no escuro — contraste igual ao dos tons 600 de antes.
// Sem vermelho de propósito: na tela vermelho já quer dizer "atrasado". Eram 11 cores e em SJ
// (11 pessoas) 5 pares caíam iguais, Marina e Kamila entre eles; com 40, nenhuma unidade tem par
// igual (medido em 28/10/2026). Matizes vizinhos ainda podem sair parecidos — o nome desfaz a dúvida.
// ============================================================================

export const PALETA_PESSOAS = [
  '#b54c0f', '#94620c', '#786d0a', '#627409', '#49790a',
  '#2c7c0a', '#0e7e0a', '#0a7e25', '#0a7c43', '#0a7b60',
  '#0a787c', '#0d74a0', '#1268d9', '#3f5cef', '#6252f1',
  '#8243f0', '#a322ed', '#b910cb', '#c510a7', '#ce117c',
  '#d96928', '#b57e20', '#978b1b', '#7e921a', '#62981b',
  '#429c1c', '#209e1c', '#1c9e3a', '#1c9d5c', '#1b9b7d',
  '#1c989c', '#2293c3', '#498adf', '#6e82e5', '#867be8',
  '#9d72e6', '#b666e4', '#d251e0', '#df4cc7', '#e154a4',
] as const

/** FNV-1a 32 bits — espalha bem ids parecidos (uuids que só diferem no fim). */
function hash(texto: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Cor da pessoa. Sem id → `undefined` (quem chama cai na cor normal do texto). */
export function corDaPessoa(id: string | null | undefined): string | undefined {
  if (!id) return undefined
  return PALETA_PESSOAS[hash(id) % PALETA_PESSOAS.length]
}
