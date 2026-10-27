// ============================================================================
// Cor fixa por pessoa — como o nome de cada participante num grupo grande de WhatsApp
// (27/10/2026, pedido do Lucas). A cor sai de um hash do `user_id`, não do nome: trocar o
// nome no cadastro não muda a cor, e a mesma pessoa tem a mesma cor em qualquer aparelho.
//
// Paleta de tons "600": legível nos 2 temas (escuro e white). Sem vermelho de propósito —
// na tela vermelho já quer dizer "atrasado". Com ~10 pessoas por unidade duas podem cair na
// mesma cor (o WhatsApp tem o mesmo limite); o nome ao lado continua desfazendo a dúvida.
// ============================================================================

export const PALETA_PESSOAS = [
  '#ea580c', // laranja
  '#d97706', // âmbar
  '#65a30d', // lima
  '#059669', // esmeralda
  '#0d9488', // verde-azulado
  '#0891b2', // ciano
  '#2563eb', // azul
  '#4f46e5', // índigo
  '#7c3aed', // violeta
  '#c026d3', // fúcsia
  '#db2777', // rosa
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
