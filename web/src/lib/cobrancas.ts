// Cobrança entre unidades do grupo — o modelo de docs/COBRANCAS_ENTRE_UNIDADES.md.
//
// O PRINCÍPIO: ninguém escreve no livro do outro.
//
// Quando a Matriz compra os sacos de remoção de Campinas, ela registra a despesa
// DELA e emite uma cobrança. Campinas recebe o aviso, reconhece — e só então
// nasce o lançamento no livro de Campinas. Antes disto o código da Matriz
// inseria direto na DRE de Campinas, sem consentimento nem aviso.
//
// Duas situações geram cobrança, e são espelhos uma da outra:
//
//   Compra Externa    "paguei algo que é seu"      → quem compra vira credor
//   Acerto Externo    "seu cliente pagou aqui"     → quem recebe vira devedor
//
// Este arquivo é lógica pura: tipos, rótulos e as regras de quem-deve-a-quem.
// O acesso ao banco fica nos componentes.

export type TipoCobranca = 'despesa_rateada' | 'recebimento_terceiro' | 'cremacao' | 'outro'
export type StatusCobranca = 'emitida' | 'aceita' | 'recusada' | 'liquidada' | 'cancelada'

export type Cobranca = {
  id: string
  unidade_credora: string
  unidade_devedora: string
  tipo: TipoCobranca
  valor: number
  data: string
  descricao: string | null
  categoria_id: string | null
  status: StatusCobranca
  lancamento_origem_id: string | null
  lancamento_aceite_id: string | null
  pagamento_id: string | null
  conta_id: string | null
  repasse_id: string | null
  criado_por_nome: string | null
  recusa_motivo: string | null
  created_at: string
}

/** Como cada tipo se explica pra quem está lendo — sem jargão contábil. */
export const TIPOS: Record<TipoCobranca, {
  rotulo: string
  /** O que quem RECEBE a cobrança lê. */
  frase: (quem: string) => string
  icone: string
}> = {
  despesa_rateada: {
    rotulo: 'Compra por conta de outra unidade',
    frase: q => `${q} pagou uma despesa sua`,
    icone: 'ShoppingCart',
  },
  recebimento_terceiro: {
    rotulo: 'Recebimento de cliente de outra unidade',
    frase: q => `Um cliente seu pagou em ${q}`,
    icone: 'ArrowLeftRight',
  },
  cremacao: {
    rotulo: 'Cremação',
    frase: q => `Cremações do mês cobradas por ${q}`,
    icone: 'Flame',
  },
  outro: {
    rotulo: 'Outro acerto',
    frase: q => `Acerto lançado por ${q}`,
    icone: 'FileText',
  },
}

export const STATUS: Record<StatusCobranca, { rotulo: string; cor: string }> = {
  emitida:   { rotulo: 'Aguardando resposta', cor: '#f59e0b' },
  aceita:    { rotulo: 'Reconhecida',         cor: '#10b981' },
  recusada:  { rotulo: 'Não reconhecida',     cor: '#ef4444' },
  liquidada: { rotulo: 'Compensada',          cor: '#64748b' },
  cancelada: { rotulo: 'Cancelada',           cor: '#64748b' },
}

/**
 * De que lado a unidade está nesta cobrança.
 *
 * 'credora' — ela pagou e tem a receber
 * 'devedora' — alguém pagou por ela e ela deve
 */
export function ladoDe(c: Cobranca, unidadeId: string): 'credora' | 'devedora' | null {
  if (c.unidade_credora === unidadeId) return 'credora'
  if (c.unidade_devedora === unidadeId) return 'devedora'
  return null
}

/**
 * Efeito no saldo, do ponto de vista de uma unidade. Positivo = tem a receber.
 * Só cobrança RECONHECIDA conta: emitida e não respondida ainda não é dívida.
 */
export function efeitoNoSaldo(c: Cobranca, unidadeId: string): number {
  if (c.status !== 'aceita') return 0
  const lado = ladoDe(c, unidadeId)
  if (!lado) return 0
  return lado === 'credora' ? Number(c.valor) : -Number(c.valor)
}

export type SaldoComUnidade = {
  contraparte_id: string
  contraparte_codigo: string
  contraparte_nome: string
  a_receber: number
  a_pagar: number
  saldo: number
}

/** "Você tem R$ 1.240 a receber da Matriz" — a leitura que o gerente precisa. */
export function fraseDoSaldo(s: SaldoComUnidade): string {
  const v = Math.abs(s.saldo).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return s.saldo > 0
    ? `${s.contraparte_nome} deve ${v} a você`
    : `Você deve ${v} a ${s.contraparte_nome}`
}

/**
 * Contas contábeis do acerto entre empresas (mig 133).
 *
 * As duas pernas de um acerto vão para contas DIFERENTES de propósito: quem paga
 * registra despesa, quem recebe registra outra receita. Antes disto as duas iam
 * para a mesma conta com sinal negativo, e um acerto de R$ 5.000 tirava R$ 10.000
 * do resultado do grupo.
 */
export const CONTA_ACERTO_DESPESA = '9.1.02'
export const CONTA_ACERTO_RECEITA = '9.1.01'
