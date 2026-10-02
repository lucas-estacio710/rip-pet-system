// BUSCA POR SEMELHANÇA — "já fiz algo parecido antes; o que decidi?"
//
// Pedido do Lucas (01/10/2026): "uma busca inteligente, por parte do texto, por
// similaridade, dar uma listinha de sugestões". Usada em dois lugares: no Colar
// do extrato (texto do banco → maquininha + movimento) e no formulário de
// despesa (fornecedor/descrição → categoria). Puro, sem I/O.
//
// POR QUE FEITO À MÃO (pesquisa de 01/10/2026, ver FLOW_FINANCEIRO §9.1.16):
// o que separa uma linha da outra costuma ser UMA palavra num texto quase igual
// — "CARTAO DE CREDITO - INTER PAG" × "CARTAO DE DEBITO - INTER PAG". Busca de
// texto inteiro (Fuse, Levenshtein, pg_trgm) dá nota altíssima a esse par,
// porque o começo comum domina. Aqui cada palavra pesa pela RARIDADE no
// histórico da própria unidade (IDF): "INTER", "PAG", "CARTAO" aparecem em tudo
// e pesam quase zero; "DEBITO" pesa muito. Uma lista fixa de palavras ignoradas
// faria o oposto — apagaria justamente as que decidem.
//
// 🔴 A LISTA É DE DECISÕES, NÃO DE REGISTROS: 14 lançamentos iguais viram UMA
// sugestão "14×, última em 12/09". É o que GnuCash, Actual e Xero fazem.
//
// 🔴 CONFIANÇA ALTA É RARA DE PROPÓSITO. O defeito mais documentado desse tipo de
// recurso é a pessoa aceitar a sugestão sem olhar (no GnuCash: "erra quase tanto
// quanto acerta"). Alta exige texto muito parecido E decisão repetida E vantagem
// clara sobre a segunda. Abaixo disso, a tela mostra a lista sem pré-escolher.

export type Exemplo<D> = {
  texto: string          // o que foi lido/digitado naquela vez
  decisao: D             // o que se decidiu (categoria, maquininha+movimento…)
  chave: string          // identidade da decisão, pra agrupar
  data: string           // YYYY-MM-DD — decisões antigas pesam menos
}

export type Sugestao<D> = {
  decisao: D
  chave: string
  score: number          // soma ponderada (semelhança × recência)
  simMax: number         // a semelhança do exemplo mais parecido, 0..1
  vezes: number          // quantos exemplos apontaram pra ela
  ultima: string         // data do mais recente
}

export type Resultado<D> = { sugestoes: Sugestao<D>[]; confianca: 'alta' | 'media' | 'baixa' }

const CONECTIVOS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'NA', 'NO', 'PARA', 'COM'])

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

/**
 * A "natureza" é o rótulo fixo do banco antes dos dois-pontos ("Pix enviado:",
 * "Pix recebido:", "Credito domicilio cartao:"). Vira FILTRO, não pista: um Pix
 * ENVIADO ao Marciel nunca deve sugerir o que se fez com o Pix RECEBIDO dele.
 * Texto digitado (fornecedor) não tem natureza — aí não filtra.
 */
export function naturezaDe(texto: string): string {
  const i = texto.indexOf(':')
  if (i < 3 || i > 40) return ''
  return norm(texto.slice(0, i)).replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Palavras que contam: sem a natureza, sem números de 4+ dígitos (NSU, CPF
 *  parcial, código do banco no "Cp :"), sem pontuação, sem letra solta. */
export function tokens(texto: string): string[] {
  const corpo = naturezaDe(texto) ? texto.slice(texto.indexOf(':') + 1) : texto
  return norm(corpo)
    .replace(/\d{4,}/g, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && t !== 'CP')
}

type Doc<D> = Exemplo<D> & { natureza: string; toks: Set<string> }

export type Indice<D> = { docs: Doc<D>[]; idf: (t: string) => number }

export function criarIndice<D>(exemplos: Exemplo<D>[]): Indice<D> {
  const docs = exemplos
    .filter(e => e.texto && e.texto.trim())
    .map(e => ({ ...e, natureza: naturezaDe(e.texto), toks: new Set(tokens(e.texto)) }))
  const df = new Map<string, number>()
  for (const d of docs) for (const t of d.toks) df.set(t, (df.get(t) || 0) + 1)
  const N = docs.length
  // suavizado (1 + df): histórico pequeno não faz uma palavra única decidir sozinha
  const idf = (t: string) => Math.log(1 + N / (1 + (df.get(t) || 0))) * (CONECTIVOS.has(t) ? 0.1 : 1)
  return { docs, idf }
}

/** Semelhança 0..1: Jaccard ponderado pelo IDF. O ÚLTIMO token da consulta vale
 *  como prefixo — o banco corta nomes numa largura fixa ("Anderson Silva Le"). */
function semelhanca<D>(q: string[], d: Doc<D>, idf: (t: string) => number): number {
  if (!q.length || !d.toks.size) return 0
  const qs = new Set(q)
  let inter = 0, uniao = 0
  const usados = new Set<string>()
  for (const t of qs) {
    if (d.toks.has(t)) { inter += idf(t); usados.add(t) }
  }
  const ultimo = q[q.length - 1]
  if (ultimo.length >= 2 && !d.toks.has(ultimo)) {
    const alvo = [...d.toks].find(t => t.length > ultimo.length && t.startsWith(ultimo) && !usados.has(t))
    if (alvo) { inter += idf(alvo); usados.add(alvo); qs.delete(ultimo) }
  }
  for (const t of new Set([...qs, ...d.toks])) uniao += idf(t)
  return uniao > 0 ? inter / uniao : 0
}

const diasEntre = (a: string, b: string) =>
  Math.max(0, (Date.parse(b) - Date.parse(a)) / 86_400_000)

export function sugerir<D>(
  indice: Indice<D>,
  texto: string,
  hoje = new Date().toISOString().slice(0, 10),
  opts: { minimo?: number; max?: number } = {},
): Resultado<D> {
  const minimo = opts.minimo ?? 0.35
  const max = opts.max ?? 5
  const q = tokens(texto)
  const nat = naturezaDe(texto)
  const porChave = new Map<string, Sugestao<D>>()
  for (const d of indice.docs) {
    if (nat && d.natureza && nat !== d.natureza) continue
    const s = semelhanca(q, d, indice.idf)
    if (s < minimo) continue
    // frequência que ENVELHECE: decisão de 6 meses atrás vale metade — se a
    // maquininha/categoria mudou, a sugestão acompanha sem esquecer o passado.
    const peso = s * Math.pow(0.5, diasEntre(d.data, hoje) / 180)
    const a = porChave.get(d.chave)
    if (!a) porChave.set(d.chave, { decisao: d.decisao, chave: d.chave, score: peso, simMax: s, vezes: 1, ultima: d.data })
    else {
      a.score += peso; a.vezes += 1
      if (s > a.simMax) a.simMax = s
      if (d.data > a.ultima) { a.ultima = d.data; a.decisao = d.decisao }
    }
  }
  const sugestoes = [...porChave.values()].sort((a, b) => b.score - a.score).slice(0, max)
  const [p, s] = sugestoes
  const confianca: Resultado<D>['confianca'] =
    p && p.simMax >= 0.8 && p.vezes >= 2 && (!s || p.score >= 2 * s.score) ? 'alta'
      : p && p.simMax >= 0.5 ? 'media'
        : 'baixa'
  return { sugestoes, confianca }
}
