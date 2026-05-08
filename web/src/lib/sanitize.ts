/**
 * Sanitiza termo de busca pra usar dentro de string `.or()` do PostgREST.
 *
 * Escapa:
 *  - Caracteres reservados PostgREST: , ( ) : * \
 *  - Wildcards SQL ilike: % _  (impede usuário injetar wildcard "ver tudo")
 *
 * Limita comprimento pra evitar DoS via termo gigante.
 */
export function sanitizeBuscaPostgrest(raw: string, maxLen = 80): string {
  if (!raw) return ''
  // 1. Trim + limita comprimento
  const trimmed = raw.trim().slice(0, maxLen)
  // 2. Escapa wildcards SQL (% e _) com backslash
  // 3. Escapa caracteres reservados PostgREST com backslash
  return trimmed.replace(/[\\,():*%_]/g, c => `\\${c}`)
}
