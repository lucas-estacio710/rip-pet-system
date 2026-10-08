// ============================================================================
// Funções puras do card de pet do pipeline REDESENHADO (fase 2.2 do
// docs/PLAYBOOK_REDESENHO_PIPELINE.md, itens 3, 4, 5 e 12 de docs/REDESENHO_CARDS_PIPELINE.md).
// ============================================================================

// Dias e meses escritos à mão — NÃO usar toLocaleDateString: o ICU de iOS/Android devolve
// "sáb."/"Sáb"/"sab" conforme o aparelho, e o card tem largura contada.
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Data do card (item 4): `dd/mmm` em cima, `Www hh:mm` embaixo. `null` sem data. */
export function dataDoCard(iso: string | null | undefined): { diaMes: string; semanaHora: string } | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return {
    diaMes: `${String(d.getDate()).padStart(2, '0')}/${MESES[d.getMonth()]}`,
    semanaHora: `${DIAS[d.getDay()]} ${hh}:${mm}`,
  }
}

/** Peso do card (item 5): "28kg", "4,5kg". `null` sem peso. */
export function pesoDoCard(peso: number | null | undefined): string | null {
  if (peso == null || !(peso > 0)) return null
  return `${peso % 1 === 0 ? String(peso) : peso.toFixed(1).replace('.', ',')}kg`
}

/** Emoji e cor do número do peso (item 5 — mesma régua do `getPetIcon` do pipeline antigo). */
export function especieDoCard(especie: string | null | undefined, peso: number | null | undefined): { emoji: string; cor: string } {
  const e = (especie || '').toLowerCase()
  if (e.includes('canin') || e.includes('cão') || e.includes('cachorro')) {
    const cor = !peso || peso <= 5 ? '#b45309' : peso <= 15 ? '#c2410c' : '#b91c1c'
    return { emoji: '🐕', cor }
  }
  if (e.includes('felin') || e.includes('gato')) return { emoji: '🐱', cor: '#7c3aed' }
  if (e.includes('exotic') || e.includes('exótic')) return { emoji: '🐾', cor: '#0d9488' }
  return { emoji: '🐾', cor: '#64748b' }
}

/** Nome vindo do banco (item 12): chega em MAIÚSCULAS e às vezes com espaço no fim. */
export function nomeDoCard(nome: string | null | undefined): string {
  return (nome || '').replace(/\s+/g, ' ').trim()
}
