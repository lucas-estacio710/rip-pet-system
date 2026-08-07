// Helpers para extrair primeiro nome (ou nome composto comum em PT-BR) de um nome completo.
// Casos especiais: "Maria José", "João Pedro", "Ana Clara" etc. — sempre tratados como uma única
// unidade na chamada (afetuosa, completa). Caso o primeiro nome não esteja na lista, retorna só
// o primeiro mesmo.

const PREFIXOS_NOME_COMPOSTO = [
  'maria', 'ana', 'anna', 'rosa',
  'joao', 'joão', 'jose', 'josé',
  'pedro', 'luiz', 'luis', 'luís', 'carlos', 'marco',
]

// Conectivos que ficam em minúscula no meio de nomes próprios (não na primeira posição)
export const CONECTIVOS_NOME = new Set([
  'de', 'do', 'da', 'dos', 'das', 'e',
  'del', 'della', 'di', 'du', 'van', 'von', 'y', 'la', 'le', 'al',
])

// Title Case para nomes: capitaliza a primeira letra de CADA palavra,
// mas mantém conectivos (de/do/da/dos/das/e/…) em minúscula quando não estão no início.
// Também respeita hífen e apóstrofo (ex.: "Ana-Clara", "D'Arc").
// Vive aqui (lib leve) e é reexportada por certificado-pdf.ts, que puxa pdf-lib.
export function tituloNome(s: string | null | undefined): string {
  if (!s) return ''
  const trim = s.trim()
  if (!trim) return ''
  return trim.toLowerCase().split(/\s+/).map((palavra, i) => {
    if (i > 0 && CONECTIVOS_NOME.has(palavra)) return palavra
    return palavra.replace(/(^|[-'])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
  }).join(' ')
}

/** Retorna o primeiro nome (capitalizado) — composto quando o prefixo costuma andar acompanhado. */
export function primeiroNome(nomeCompleto: string | null | undefined): string {
  if (!nomeCompleto) return ''
  const partes = nomeCompleto.trim().split(/\s+/)
  if (partes.length === 0) return ''
  if (partes.length === 1) return tituloNome(partes[0])
  const primeiroLower = partes[0].toLowerCase()
  // "Maria Aparecida" vira composto; "Maria da Silva" não (segunda palavra é conectivo)
  const segundoEhConectivo = CONECTIVOS_NOME.has(partes[1].toLowerCase())
  const qtd = PREFIXOS_NOME_COMPOSTO.includes(primeiroLower) && !segundoEhConectivo ? 2 : 1
  return tituloNome(partes.slice(0, qtd).join(' '))
}
