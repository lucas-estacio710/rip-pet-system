// Busca do pipeline (/contratos) — lógica pura, sem React e sem Supabase.
//
// Ligada na tela do pipeline novo (chave obj_enc_pipeline) desde 09/10/2026. Depende da
// coluna `contratos.busca` (mig 157). Plano e porquês: docs/BUSCA_PIPELINE.md.
//
// A coluna `busca` é montada no banco por `busca_normaliza()`. A regra de
// normalização daqui (`normalizarBusca`) TEM que bater com a do SQL — se uma
// mudar, a outra muda junto, senão "joão" normaliza diferente dos dois lados e
// a busca volta a errar acento em silêncio.

export type TipoBusca = 'lacre' | 'telefone' | 'codigo' | 'texto'

export interface BuscaClassificada {
  tipo: TipoBusca
  /** termo como o usuário digitou, aparado */
  original: string
  /** palavras normalizadas (texto) — cada uma precisa aparecer em `busca` */
  termos: string[]
  /** só dígitos (lacre/telefone) ou código em maiúsculas sem espaço */
  valor: string
}

export interface FiltroBusca {
  /** igualdade exata: [coluna, valor] */
  eq: [string, string][]
  /** ilike encadeado (AND entre eles): [coluna, padrão já com %] */
  ilike: [string, string][]
}

const MAX_TERMOS = 5

/** minúsculas, sem acento, espaços colapsados. Espelho de `busca_normaliza()` no SQL. */
export function normalizarBusca(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Token do lacre na coluna `busca` (`#412#`): só dígitos, sem zeros à esquerda — espelho de
 * `busca_token_lacre()` no SQL. "0412", " 412" e "412" viram o mesmo; não numérico = ''.
 * Medido em 09/10: 63 lacres com zero à esquerda e 3 com espaço.
 */
export function tokenLacre(l: string | null | undefined): string {
  const t = (l || '').trim()
  if (!/^\d+$/.test(t)) return ''
  return t.replace(/^0+/, '') || '0'
}

/** Escapa curingas do ILIKE (% _ \) — a busca vai por `.ilike()`, não por `.or()` em string. */
function escaparIlike(s: string): string {
  return s.replace(/[\\%_]/g, c => `\\${c}`)
}

/**
 * Decide o que a pessoa está procurando pelo formato do que digitou.
 * - só números com 1–5 dígitos  → lacre (exato)
 * - só números com 8+ dígitos   → telefone / CPF (dígitos dentro de `busca`)
 * - 2 letras + 6 dígitos no início (ex. ST260921…) → código
 * - o resto                      → texto (pet, tutor, raça… palavra a palavra)
 */
export function classificarBusca(raw: string): BuscaClassificada | null {
  const original = (raw || '').trim().slice(0, 80)
  if (!original) return null

  const soNumerico = /^[\d\s().+\-/]+$/.test(original)
  const digitos = original.replace(/\D/g, '')

  if (soNumerico && digitos.length >= 1 && digitos.length <= 5) {
    return { tipo: 'lacre', original, termos: [], valor: tokenLacre(digitos) }
  }
  if (soNumerico && digitos.length >= 8) {
    return { tipo: 'telefone', original, termos: [], valor: digitos }
  }

  const compacto = original.replace(/\s+/g, '').toUpperCase()
  if (/^[A-Z]{2}\d{6}/.test(compacto)) {
    return { tipo: 'codigo', original, termos: [], valor: compacto }
  }

  const termos = normalizarBusca(original).split(' ').filter(Boolean).slice(0, MAX_TERMOS)
  return { tipo: 'texto', original, termos, valor: termos.join(' ') }
}

/** Traduz a classificação em filtros pro PostgREST (aplicar com .eq / .ilike encadeados). */
export function filtroDaBusca(b: BuscaClassificada): FiltroBusca {
  switch (b.tipo) {
    case 'lacre':
      // Exato pelo token no começo da coluna (`#412#…`) — "412" acha "0412" e não acha "4120".
      return { eq: [], ilike: [['busca', `#${b.valor}#%`]] }
    case 'telefone':
      return { eq: [], ilike: [['busca', `%${b.valor}%`]] }
    case 'codigo':
      return { eq: [], ilike: [['codigo', `${escaparIlike(b.valor)}%`]] }
    case 'texto':
      return { eq: [], ilike: b.termos.map(t => ['busca', `%${escaparIlike(t)}%`] as [string, string]) }
  }
}

export interface CamposPontuaveis {
  pet_nome?: string | null
  tutor_nome?: string | null
  numero_lacre?: string | null
  codigo?: string | null
}

/** Relevância: lacre/código exato > nome que COMEÇA com o termo > só contém. */
export function pontuar(c: CamposPontuaveis, b: BuscaClassificada): number {
  if (b.tipo === 'lacre') return tokenLacre(c.numero_lacre) === b.valor ? 100 : 0
  if (b.tipo === 'codigo') return (c.codigo || '').toUpperCase() === b.valor ? 100 : 50
  if (b.tipo === 'telefone') return 0
  const pet = normalizarBusca(c.pet_nome)
  const tutor = normalizarBusca(c.tutor_nome)
  const primeiro = b.termos[0] || ''
  let p = 0
  if (pet === b.valor) p += 60
  else if (pet.startsWith(primeiro)) p += 40
  if (tutor.startsWith(primeiro)) p += 20
  // palavra inteira (não só pedaço): "luna" acha LUNA antes de LUNATICA
  const palavras = new Set([...pet.split(' '), ...tutor.split(' ')])
  p += b.termos.filter(t => palavras.has(t)).length * 5
  return p
}

/** Ordena por relevância; empate mantém a ordem que veio do banco (data). */
export function ordenarPorRelevancia<T extends CamposPontuaveis>(lista: T[], b: BuscaClassificada): T[] {
  return lista
    .map((c, i) => ({ c, i, p: pontuar(c, b) }))
    .sort((x, y) => y.p - x.p || x.i - y.i)
    .map(x => x.c)
}

/**
 * Se a etapa aberta não tem resultado e outra tem, devolve a etapa pra onde pular
 * (a primeira na ordem do pipeline). `null` = ficar onde está.
 */
export function etapaComResultado(
  contagens: Record<string, number>,
  etapaAtual: string | null,
  ordemEtapas: readonly string[],
): string | null {
  if (!etapaAtual) return null
  if ((contagens[etapaAtual] || 0) > 0) return null
  return ordemEtapas.find(e => (contagens[e] || 0) > 0) ?? null
}

/** Quebra o texto em pedaços marcando onde algum termo aparece, ignorando acento e caixa. */
export function trechosDestacados(texto: string, termos: string[]): { t: string; hit: boolean }[] {
  if (!texto) return []
  const ts = termos.filter(Boolean)
  if (ts.length === 0) return [{ t: texto, hit: false }]
  // normaliza caractere a caractere pra manter o índice alinhado com o original
  const norm = Array.from(texto).map(ch => normalizarBusca(ch) || (ch.trim() === '' ? ' ' : ch.toLowerCase()))
  const alvo = norm.map(ch => ch.charAt(0)).join('')
  const marca = new Array(norm.length).fill(false)
  for (const t of ts) {
    let i = alvo.indexOf(t)
    while (i !== -1) {
      for (let k = i; k < i + t.length; k++) marca[k] = true
      i = alvo.indexOf(t, i + t.length)
    }
  }
  const chars = Array.from(texto)
  const out: { t: string; hit: boolean }[] = []
  chars.forEach((ch, i) => {
    const last = out[out.length - 1]
    if (last && last.hit === marca[i]) last.t += ch
    else out.push({ t: ch, hit: marca[i] })
  })
  return out
}
