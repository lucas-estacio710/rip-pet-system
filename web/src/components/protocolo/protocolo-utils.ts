// Protocolo de Entrega - Utilitários
// Nomes abreviados vêm da coluna `nome_retorno` na tabela `produtos` (Supabase)
// Migration: 022_nome_retorno_produtos.sql
// Fallback: trunca nomes longos em 25 caracteres

// Produtos a excluir do protocolo (não aparecem na listagem)
export const PROTOCOLO_EXCLUIR = [
  'nenhum rescaldo',
  'protocolo de retorno',
  'nenhuma urna',
  'retorno de itens pessoais',
  'certificado de cremação',
  'pelinho',
  // Visores/patinhas que são componentes do pingente (valor R$0), não itens separados
  'patinha p/ visor porta pelo - prata',
  'patinha p/ visor porta pelo - dourada',
  'cachorrinho p/ visor porta pelo - prata',
  'cachorrinho p/ visor porta pelo - dourado',
  'gatinho p/ visor porta pelo - prata',
  'gatinho p/ visor porta pelo - dourado',
]

// Tipo para dados do protocolo
export type ProtocoloData = {
  // Contrato
  codigo: string
  tipoCremacao: 'individual' | 'coletiva'
  numeroLacre: string | null
  // Pet
  petNome: string
  petRaca: string | null
  petCor: string | null
  petPeso: number | null
  dataAcolhimento: string | null
  // Tutor
  tutorNome: string
  tutorEndereco: string | null
  tutorBairro: string | null
  tutorCidade: string | null
  tutorEstado: string | null
  tutorCep: string | null
  // Produtos
  produtos: {
    nome: string
    nomeRetorno: string
    valor: number
    valorDisplay?: string  // texto livre (ex: "Incluso", "Cortesia Vet", "Seguradora")
    pago: 'ok' | 'pend' | ''  // "Ok", "Pendente" ou vazio
    tipo: 'cremacao' | 'urna' | 'acessorio' | 'incluso'
  }[]
  // Financeiro (editáveis no modal — a ficha é a fonte da verdade)
  totalAPagar: number
  totalPago: number
  saldo: number
  mostrarPagamento?: boolean  // se false, esconde as caixinhas de forma de pagamento
  // Opções de pagamento
  opcoesPagamento: {
    pix: number
    parcelado6: number
    parcelado12: number
  }
}

/**
 * Obtém o nome abreviado para o protocolo de retorno.
 * Fallback: se o nome tiver mais de 25 caracteres, trunca.
 * Prioridade: produtos.nome_retorno (banco) > fallback truncado
 */
export function getNomeRetorno(nomeComercial: string): string {
  const trimmed = nomeComercial.trim()
  if (trimmed.length > 56) {
    return trimmed.substring(0, 53) + '...'
  }
  return trimmed
}

/**
 * Verifica se um produto deve ser excluído do protocolo
 */
export function isProtocoloExcluido(nomeProduto: string): boolean {
  return PROTOCOLO_EXCLUIR.includes(nomeProduto.trim().toLowerCase())
}

/**
 * Calcula opções de pagamento com descontos (seed inicial — valores editáveis no modal)
 * Individual: Pix = -R$150, 1-6x = -R$75
 * Coletiva:   Pix = -R$100, 1-6x = -R$50
 */
export function calcPaymentOptions(saldo: number, tipoCremacao: 'individual' | 'coletiva') {
  if (saldo <= 0) {
    return { pix: 0, parcelado6: 0, parcelado12: 0 }
  }

  const descontos = tipoCremacao === 'individual'
    ? { pix: 150, parcelado6: 75 }
    : { pix: 100, parcelado6: 50 }

  return {
    pix: Math.max(0, saldo - descontos.pix),
    parcelado6: Math.max(0, saldo - descontos.parcelado6),
    parcelado12: saldo,
  }
}

/**
 * Normaliza ProtocoloData carregado do banco (backward compat: pago boolean → string)
 */
export function normalizarProtocoloData(data: any): ProtocoloData {
  return {
    ...data,
    produtos: (data.produtos || []).map((p: any) => ({
      ...p,
      pago: p.pago === true ? 'ok' : p.pago === false ? 'pend' : (p.pago || ''),
    })),
  }
}

/**
 * Formata valor em reais
 */
export function formatarValor(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Monta um ProtocoloData a partir de dados do Supabase + financeiro pré-calculado.
 * A ficha é a fonte da verdade; o protocolo é um "pedaço de papel" editável.
 * Valores financeiros (totalAPagar, totalPago, saldo) vêm prontos do caller.
 */
export function montarProtocoloData(
  contrato: {
    codigo: string
    tipo_cremacao: string | null
    numero_lacre: string | null
    pet_nome: string
    pet_raca: string | null
    pet_cor: string | null
    pet_peso: number | null
    data_acolhimento: string | null
    tutor_nome: string | null
    tutor_endereco?: string | null
    tutor_bairro: string | null
    tutor_cidade: string | null
    tutor_estado?: string | null
    tutor_cep?: string | null
    tutor?: {
      nome?: string | null
      endereco?: string | null
      bairro?: string | null
      cidade?: string | null
      estado?: string | null
      cep?: string | null
    } | null
  },
  contratoProdutos: {
    valor?: number | null
    produto?: {
      nome: string
      nome_retorno?: string | null
      tipo: string
      preco: number | null
    } | null
  }[],
  financeiro: {
    totalAPagar: number
    totalPago: number
    saldo: number
    aPagarPlano: number  // valor da cremação (plano) para a linha de cremação
  }
): ProtocoloData {
  const tutorNome = contrato.tutor?.nome || contrato.tutor_nome || ''
  const tutorEndereco = contrato.tutor?.endereco || contrato.tutor_endereco || null
  const tutorBairro = contrato.tutor?.bairro || contrato.tutor_bairro || null
  const tutorCidade = contrato.tutor?.cidade || contrato.tutor_cidade || null
  const tutorEstado = contrato.tutor?.estado || contrato.tutor_estado || null
  const tutorCep = contrato.tutor?.cep || contrato.tutor_cep || null

  const tipoCremacao = (contrato.tipo_cremacao || 'individual') as 'individual' | 'coletiva'

  // Filtrar e mapear produtos — todos iniciam como 'ok' (editável no modal)
  const produtosProtocolo = contratoProdutos
    .filter(cp => cp.produto && !isProtocoloExcluido(cp.produto.nome))
    .map(cp => ({
      nome: cp.produto!.nome,
      nomeRetorno: cp.produto!.nome_retorno || getNomeRetorno(cp.produto!.nome),
      valor: cp.valor || cp.produto!.preco || 0,
      pago: 'ok' as const,
      tipo: (cp.produto!.tipo || 'acessorio') as 'urna' | 'acessorio' | 'incluso',
    }))

  // Ordenar: urna primeiro, depois acessorio, depois incluso; dentro do tipo, mais caro primeiro
  const tipoOrdem: Record<string, number> = { urna: 0, acessorio: 1, incluso: 2 }
  produtosProtocolo.sort((a, b) => {
    const ordemA = tipoOrdem[a.tipo] ?? 3
    const ordemB = tipoOrdem[b.tipo] ?? 3
    if (ordemA !== ordemB) return ordemA - ordemB
    return b.valor - a.valor
  })

  // Cremação como primeiro item
  const { totalAPagar, totalPago, saldo, aPagarPlano } = financeiro
  const produtos = [
    {
      nome: `Cremação ${tipoCremacao === 'individual' ? 'Individual' : 'Coletiva'}`,
      nomeRetorno: `Crem. ${tipoCremacao === 'individual' ? 'Individual' : 'Coletiva'}`,
      valor: aPagarPlano,
      pago: 'ok' as const,
      tipo: 'cremacao' as const,
    },
    ...produtosProtocolo,
  ]
  const opcoesPagamento = calcPaymentOptions(saldo, tipoCremacao)

  return {
    codigo: contrato.codigo,
    tipoCremacao,
    numeroLacre: contrato.numero_lacre,
    petNome: contrato.pet_nome,
    petRaca: contrato.pet_raca,
    petCor: contrato.pet_cor,
    petPeso: contrato.pet_peso,
    dataAcolhimento: contrato.data_acolhimento,
    tutorNome,
    tutorEndereco,
    tutorBairro,
    tutorCidade,
    tutorEstado,
    tutorCep,
    produtos,
    totalAPagar,
    totalPago,
    saldo,
    mostrarPagamento: false,
    opcoesPagamento,
  }
}
