// Helpers para extrair primeiro nome (ou nome composto comum em PT-BR) de um nome completo.
// Casos especiais: "Maria José", "João Pedro", "Ana Clara" etc. — sempre tratados como uma única
// unidade na chamada (afetuosa, completa). Caso o primeiro nome não esteja na lista, retorna só
// o primeiro mesmo.

// Comparações são feitas sem acento e em minúscula (o banco tem "JOSÉ", "Jose", "josé"...)
function chave(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

const PREFIXOS_NOME_COMPOSTO = [
  'maria', 'ana', 'anna', 'rosa',
  'joao', 'jose',
  'pedro', 'luiz', 'luis', 'carlos', 'marco',
]

// Nomes que vêm DEPOIS de conectivo e ainda fazem parte do nome de tratamento
// ("Maria da Conceição", "Maria de Fátima"). Serve para distinguir de sobrenome
// ("Maria da Silva" → a pessoa é chamada de "Maria").
const NOMES_APOS_CONECTIVO = new Set([
  'conceicao', 'fatima', 'lourdes', 'gloria', 'graca', 'penha', 'luz', 'guia',
  'piedade', 'socorro', 'carmo', 'rosario', 'natividade', 'assuncao', 'anunciacao',
  'paz', 'ajuda', 'aparecida', 'neves', 'remedios', 'candelaria', 'salete',
  'abadia', 'nazare', 'betania', 'sion', 'loreto', 'apresentacao', 'esperanca',
  'deus', // "João de Deus"
])

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

/**
 * Separa o nome de tratamento do resto. Retorna as partes CRUAS (sem capitalizar),
 * para quem precisa exibir as duas metades com estilos diferentes (ex: pipeline).
 *
 *   MARIA APARECIDA DA SILVA   → { primeiro: 'MARIA APARECIDA',   resto: 'DA SILVA' }
 *   MARIA DA CONCEICAO RIBEIRO → { primeiro: 'MARIA DA CONCEICAO', resto: 'RIBEIRO' }
 *   MARIA DA SILVA             → { primeiro: 'MARIA',              resto: 'DA SILVA' }
 */
export function separarPrimeiroNome(nomeCompleto: string | null | undefined): { primeiro: string; resto: string } {
  if (!nomeCompleto) return { primeiro: '', resto: '' }
  const partes = nomeCompleto.trim().split(/\s+/).filter(Boolean)
  if (partes.length <= 1) return { primeiro: partes[0] || '', resto: '' }

  let qtd = 1
  if (PREFIXOS_NOME_COMPOSTO.includes(chave(partes[0]))) {
    if (CONECTIVOS_NOME.has(chave(partes[1]))) {
      // "Maria da Conceição" sim; "Maria da Silva" não (Silva é sobrenome)
      if (partes[2] && NOMES_APOS_CONECTIVO.has(chave(partes[2]))) qtd = 3
    } else {
      qtd = 2 // "Maria Aparecida", "Ana Clara", "José Carlos"
    }
  }

  return {
    primeiro: partes.slice(0, qtd).join(' '),
    resto: partes.slice(qtd).join(' '),
  }
}

/** Retorna o primeiro nome (capitalizado) — composto quando o prefixo costuma andar acompanhado. */
export function primeiroNome(nomeCompleto: string | null | undefined): string {
  if (!nomeCompleto) return ''
  return tituloNome(separarPrimeiroNome(nomeCompleto).primeiro)
}
