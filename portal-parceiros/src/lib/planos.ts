export type PlanoItem = {
  id: string
  produto_id: string | null
  modo: 'incluso' | 'desconto'
  preco_desconto: number | null
  nome: string
  imagem_url: string | null
  ordem: number
}

export type PlanoGrupo = {
  id: string
  nome: string
  escolha_min: number
  escolha_max: number
  ordem: number
  plano_itens: PlanoItem[]
}

export type Plano = {
  id: string
  nome: string
  descricao: string | null
  imagem_url: string | null
  tipo_cremacao: 'individual' | 'coletiva'
  preco: number
  adicional_peso_kg: number
  adicional_valor: number
  plano_grupos: PlanoGrupo[]
}

/**
 * Preço do plano para um pet: base + adicional de porte quando o peso passa do limite.
 *
 * ⚠️ Mesma fórmula de `precoDoPlano()` em `web/src/components/ficha/FichaForm.tsx`.
 * Os dois apps são separados (não há workspace compartilhado), então isto é uma cópia
 * consciente. Se a regra de preço mudar lá, muda aqui — senão o parceiro promete um
 * valor e a ficha do tutor mostra outro, que é a pior falha possível neste fluxo.
 */
export function precoDoPlano(p: Plano, pesoKg: number | null): number {
  const acima = pesoKg != null && !Number.isNaN(pesoKg) && pesoKg > p.adicional_peso_kg
  return p.preco + (acima ? p.adicional_valor : 0)
}

export function temAdicionalDePorte(p: Plano, pesoKg: number | null): boolean {
  return (
    pesoKg != null && !Number.isNaN(pesoKg) && pesoKg > p.adicional_peso_kg && p.adicional_valor > 0
  )
}

/** Ordena grupos e itens e descarta grupo vazio (espelha o FichaForm). */
export function gruposOrdenados(p: Plano): PlanoGrupo[] {
  return [...(p.plano_grupos ?? [])]
    .sort((a, b) => a.ordem - b.ordem)
    .map((g) => ({ ...g, plano_itens: [...g.plano_itens].sort((a, b) => a.ordem - b.ordem) }))
    .filter((g) => g.plano_itens.length > 0)
}

export function formatarBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Validade do orçamento: fim do dia SEGUINTE, em America/Sao_Paulo (decisão #39).
 *
 * Não são 24h corridas de propósito. O vet orça de madrugada, o tutor resolve de manhã —
 * com janela fixa o link morreria no meio do luto. O Brasil não tem horário de verão
 * desde 2019, então o offset é -3 fixo.
 */
export function fimDoDiaSeguinte(agora: Date = new Date()): Date {
  const OFFSET_MS = -3 * 60 * 60 * 1000
  const sp = new Date(agora.getTime() + OFFSET_MS)
  const fimHorarioSP = Date.UTC(
    sp.getUTCFullYear(),
    sp.getUTCMonth(),
    sp.getUTCDate() + 1,
    23, 59, 59
  )
  return new Date(fimHorarioSP - OFFSET_MS)
}

export function expiracaoPorConfig(
  modo: 'fim_do_dia_seguinte' | 'horas',
  horas: number,
  agora: Date = new Date()
): Date {
  if (modo === 'horas') return new Date(agora.getTime() + horas * 3600 * 1000)
  return fimDoDiaSeguinte(agora)
}
