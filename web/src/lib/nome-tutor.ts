// Helpers para extrair primeiro nome (ou nome composto comum em PT-BR) de um nome completo.
// Casos especiais: "Maria José", "João Pedro", "Ana Clara" etc. — sempre tratados como uma única
// unidade na chamada (afetuosa, completa). Caso o primeiro nome não esteja na lista, retorna só
// o primeiro mesmo.

const PREFIXOS_NOME_COMPOSTO = [
  'maria', 'ana', 'anna', 'rosa',
  'joao', 'joão', 'jose', 'josé',
  'pedro', 'luiz', 'luis', 'luís', 'carlos', 'marco',
]

function capitalizar(nome: string): string {
  if (!nome) return ''
  return nome.split(/\s+/).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ')
}

/** Retorna o primeiro nome (capitalizado) — composto quando o prefixo costuma andar acompanhado. */
export function primeiroNome(nomeCompleto: string | null | undefined): string {
  if (!nomeCompleto) return ''
  const partes = nomeCompleto.trim().split(/\s+/)
  if (partes.length === 0) return ''
  if (partes.length === 1) return capitalizar(partes[0])
  const primeiroLower = partes[0].toLowerCase()
  const qtd = PREFIXOS_NOME_COMPOSTO.includes(primeiroLower) ? 2 : 1
  return capitalizar(partes.slice(0, qtd).join(' '))
}
