/** Espelha `parceiro_config` (migration 100) — a fonte única do Orquestrador. */
export type ParceiroConfig = {
  unidade_id: string
  comissao: {
    bronze: { col: number; ind: number }
    prata: { col: number; ind: number }
    ouro: { col: number; ind: number }
  }
  faixas: { bronze_max: number; prata_max: number }
  desconto_percentual: number
  beneficios_ativos: { comissao: boolean; desconto: boolean; cortesia: boolean }
  cortesia_produtos: { individual: string[]; coletiva: string[] }
  orcamento_validade_modo: 'fim_do_dia_seguinte' | 'horas'
  orcamento_validade_horas: number
  sorteio_ativo: boolean
  bilhete_por_indicacao: boolean
  bilhete_por_mgm: boolean
  mgm_ativo: boolean
  remocao_ativa: boolean
  materiais_ativos: boolean
  cidades_cobertura: string[]
  max_parcelas: number
}

/**
 * Formas de pagamento — os rótulos precisam ser EXATAMENTE os que a ficha pública
 * do CRM grava (`pagamentoMap` em FichaForm.tsx), senão a tratativa não reconhece.
 */
export const FORMAS_PAGAMENTO = [
  { valor: 'Pix', label: 'Pix' },
  { valor: 'Dinheiro', label: 'Dinheiro' },
  { valor: 'Cartão Débito', label: 'Cartão de débito' },
  { valor: 'Cartão Crédito', label: 'Cartão de crédito' },
] as const

export type Categoria = 'bronze' | 'prata' | 'ouro'

export const CARGOS = [
  { valor: 'veterinario', label: 'Veterinário(a)' },
  { valor: 'recepcionista', label: 'Recepcionista' },
  { valor: 'aux_veterinario', label: 'Auxiliar de veterinária' },
  { valor: 'tecnico_veterinario', label: 'Técnico(a) em veterinária' },
  { valor: 'banhista_tosador', label: 'Banhista / Tosador(a)' },
  { valor: 'gerente', label: 'Gerente' },
  { valor: 'proprietario', label: 'Proprietário(a)' },
  { valor: 'outro', label: 'Outro' },
] as const

export type CargoValor = (typeof CARGOS)[number]['valor']
