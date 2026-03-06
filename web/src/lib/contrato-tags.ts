// Shared tag computation for contratos pipeline and tutor detail
// Pure TypeScript — no React, no Supabase

// --- Types ---

export type TagState = 'completed' | 'rejected' | 'pending' | 'in_progress' | 'alert' | 'ghost' | 'hidden'

export type ComputedTag = {
  id: string
  emoji: string
  state: TagState
  label: string
  tooltip: string
  count?: number
  sublabel?: string
}

/** Minimal shape of contrato data needed by tag computation */
export type ContratoTagData = {
  status: string
  tipo_cremacao: string
  // Pelinho
  pelinho_quer: boolean | null
  pelinho_feito: boolean
  pelinho_quantidade: number
  // Certificado
  certificado_confirmado: boolean | null
  certificado_nome_1?: string | null
  certificado_nome_2?: string | null
  certificado_nome_3?: string | null
  certificado_nome_4?: string | null
  certificado_nome_5?: string | null
  // Financeiro
  valor_plano: number | null
  desconto_plano: number | null
  valor_acessorios: number | null
  desconto_acessorios: number | null
  pagamentos?: { tipo: string; valor: number }[]
  // Protocolo
  protocolo_data: unknown | null
  // Produtos
  contrato_produtos?: {
    foto_recebida: boolean
    rescaldo_feito: boolean
    produto: {
      codigo: string
      tipo: string
      precisa_foto: boolean
      rescaldo_tipo: string | null
    } | null
  }[]
}

// --- Style map (hardcoded light-theme colors for all themes) ---

export type TagStyle = { bg: string; color: string; borderColor: string }

export const TAG_STATE_STYLES: Record<TagState, TagStyle> = {
  completed:   { bg: 'rgba(220,252,231,0.5)', color: '#15803d', borderColor: '#16a34a' },
  rejected:    { bg: 'rgba(254,226,226,0.5)', color: '#dc2626', borderColor: '#dc2626' },
  pending:     { bg: 'rgba(254,249,195,0.5)', color: '#ca8a04', borderColor: '#ca8a04' },
  in_progress: { bg: 'rgba(219,234,254,0.5)', color: '#2563eb', borderColor: '#2563eb' },
  alert:       { bg: 'rgba(254,226,226,0.5)', color: '#dc2626', borderColor: '#dc2626' },
  ghost:       { bg: 'rgba(241,245,249,0.5)', color: '#64748b', borderColor: '#94a3b8' },
  hidden:      { bg: '',                      color: '',        borderColor: '' },
}

// --- Helpers ---

export function getPagamentoPendente(contrato: Pick<ContratoTagData, 'valor_plano' | 'desconto_plano' | 'valor_acessorios' | 'desconto_acessorios' | 'pagamentos'>): { planoPendente: boolean; acessoriosPendente: boolean } {
  const valorPlanoEsperado = (contrato.valor_plano || 0) - (contrato.desconto_plano || 0)
  const valorAcessoriosEsperado = (contrato.valor_acessorios || 0) - (contrato.desconto_acessorios || 0)

  const pagamentos = contrato.pagamentos || []
  const totalPagoPlano = pagamentos
    .filter(p => p.tipo === 'plano')
    .reduce((acc, p) => acc + (p.valor || 0), 0)
  const totalPagoAcessorios = pagamentos
    .filter(p => p.tipo === 'catalogo')
    .reduce((acc, p) => acc + (p.valor || 0), 0)

  return {
    planoPendente: valorPlanoEsperado > 0 && totalPagoPlano < valorPlanoEsperado,
    acessoriosPendente: valorAcessoriosEsperado > 0 && totalPagoAcessorios < valorAcessoriosEsperado,
  }
}

// --- Individual tag computations ---

export function computePelinho(c: ContratoTagData): ComputedTag {
  const qtd = c.pelinho_quantidade || 1
  const sub = qtd > 1 ? `${qtd}` : undefined

  // Não quer → vermelho
  if (c.pelinho_quer === false) {
    return { id: 'pelinho', emoji: '🫙', state: 'rejected', label: 'Pelinho', tooltip: 'Não quer pelinho' }
  }
  // Quer e validado → verde
  if (c.pelinho_quer === true && c.pelinho_feito) {
    return { id: 'pelinho', emoji: '🫙', state: 'completed', label: 'Pelinho', tooltip: qtd > 1 ? `Pelinho: ${qtd} validado(s)` : 'Pelinho: Validado', sublabel: sub }
  }
  // Quer mas não validado → amarelo na esquerda (aguardando validação)
  if (c.pelinho_quer === true && !c.pelinho_feito) {
    return { id: 'pelinho', emoji: '🫙', state: 'in_progress', label: 'Pelinho', tooltip: `Pelinho: ${qtd} aguardando validação`, sublabel: sub }
  }
  // Ainda não perguntou (null) → amarelo com ❓
  return { id: 'pelinho', emoji: '🫙', state: 'pending', label: 'Pelinho', tooltip: 'Pelinho: Clique para definir', sublabel: '❓' }
}

export function computeUrna(c: ContratoTagData): ComputedTag {
  if (c.tipo_cremacao !== 'individual') {
    return { id: 'urna', emoji: '⚱️', state: 'hidden', label: 'Urna', tooltip: '' }
  }

  const urnasNoContrato = (c.contrato_produtos || []).filter(cp => cp.produto?.tipo === 'urna')

  if (urnasNoContrato.length === 0) {
    return { id: 'urna', emoji: '⚱️', state: 'pending', label: 'Urna', tooltip: 'Urna: Clique para definir', sublabel: '❓' }
  }

  const temNenhumaUrna = urnasNoContrato.some(cp => cp.produto?.codigo === '0001')
  const urnasReais = urnasNoContrato.filter(cp => cp.produto?.codigo !== '0001')

  if (temNenhumaUrna && urnasReais.length === 0) {
    return { id: 'urna', emoji: '⚱️', state: 'rejected', label: 'Urna', tooltip: 'Não quer urna' }
  }

  return { id: 'urna', emoji: '⚱️', state: 'completed', label: 'Urna', tooltip: `Urna: ${urnasReais.length} definida(s)`, count: urnasReais.length }
}

export function computeCertificado(c: ContratoTagData): ComputedTag {
  // Only relevant for ativo/pinda
  if (c.status !== 'ativo' && c.status !== 'pinda') {
    return { id: 'certificado', emoji: '📜', state: 'hidden', label: 'Certificado', tooltip: '' }
  }

  if (c.certificado_confirmado === true) {
    const nomesDefinidos = [
      c.certificado_nome_1, c.certificado_nome_2, c.certificado_nome_3,
      c.certificado_nome_4, c.certificado_nome_5
    ].filter(n => n && n.trim()).length
    return { id: 'certificado', emoji: '📜', state: 'completed', label: 'Certificado', tooltip: `Certificado: ${nomesDefinidos} nome(s) confirmado(s)`, count: nomesDefinidos }
  }

  return { id: 'certificado', emoji: '📜', state: 'ghost', label: 'Certificado', tooltip: 'Certificado: Clique para definir nomes', sublabel: '❓' }
}

export function computeFoto(c: ContratoTagData): ComputedTag {
  const produtosPrecisamFoto = (c.contrato_produtos || []).filter(cp => cp.produto?.precisa_foto === true)
  const fotoTotal = produtosPrecisamFoto.length

  if (fotoTotal === 0) {
    return { id: 'foto', emoji: '📷', state: 'hidden', label: 'Foto', tooltip: '' }
  }

  const fotoRecebidas = produtosPrecisamFoto.filter(cp => cp.foto_recebida === true).length
  const fotoPendentes = fotoTotal - fotoRecebidas

  if (fotoPendentes === 0) {
    return { id: 'foto', emoji: '📷', state: 'completed', label: 'Foto', tooltip: `Foto: ${fotoTotal} recebida(s)`, count: fotoTotal }
  }

  return { id: 'foto', emoji: '📷', state: 'pending', label: 'Foto', tooltip: `Foto pendente: ${fotoPendentes} de ${fotoTotal}`, count: fotoPendentes, sublabel: `${fotoPendentes}` }
}

export function computePagamento(c: ContratoTagData): ComputedTag {
  const { planoPendente, acessoriosPendente } = getPagamentoPendente(c)
  const temValor = (c.valor_plano || 0) > 0 || (c.valor_acessorios || 0) > 0

  if (!temValor) {
    return { id: 'pagamento', emoji: '💵', state: 'hidden', label: 'Pagamento', tooltip: '' }
  }

  if (!planoPendente && !acessoriosPendente) {
    return { id: 'pagamento', emoji: '💵', state: 'completed', label: 'Pagamento', tooltip: 'Pagamento: Tudo pago' }
  }

  const sublabel = planoPendente && acessoriosPendente ? 'P|A' : planoPendente ? 'P' : 'A'
  const tooltip = planoPendente && acessoriosPendente
    ? 'Pendente: Plano e Acessórios'
    : planoPendente ? 'Pendente: Plano' : 'Pendente: Acessórios'

  return { id: 'pagamento', emoji: '💵', state: 'alert', label: 'Pagamento', tooltip, sublabel }
}

export function computeProtocolo(c: ContratoTagData): ComputedTag {
  // Finalizado — always OK
  if (c.status === 'finalizado') {
    return { id: 'protocolo', emoji: '📋', state: 'completed', label: 'Protocolo', tooltip: 'Protocolo: OK (finalizado)' }
  }

  // Only relevant for retorno/pendente
  if (c.status !== 'retorno' && c.status !== 'pendente') {
    return { id: 'protocolo', emoji: '📋', state: 'hidden', label: 'Protocolo', tooltip: '' }
  }

  if (c.protocolo_data) {
    return { id: 'protocolo', emoji: '📋', state: 'completed', label: 'Protocolo', tooltip: 'Protocolo: Pronto' }
  }

  return { id: 'protocolo', emoji: '📋', state: 'pending', label: 'Protocolo', tooltip: 'Protocolo: Clique para preparar', sublabel: '❓' }
}

export function computeRescaldo(c: ContratoTagData): ComputedTag {
  const todosRescaldo = (c.contrato_produtos || []).filter(cp => cp.produto?.rescaldo_tipo || cp.produto?.codigo === '0002')
  const temNenhum = todosRescaldo.some(cp => cp.produto?.codigo === '0002')
  const produtosRescaldo = todosRescaldo.filter(cp => cp.produto?.codigo !== '0002')
  const total = produtosRescaldo.length

  if (c.status === 'finalizado' && total === 0 && !temNenhum) {
    return { id: 'rescaldo', emoji: '💎', state: 'hidden', label: 'Rescaldo', tooltip: '' }
  }

  if (temNenhum && total === 0) {
    return { id: 'rescaldo', emoji: '💎', state: 'rejected', label: 'Rescaldo', tooltip: 'Não quer rescaldo' }
  }

  if (total === 0) {
    return { id: 'rescaldo', emoji: '💎', state: 'ghost', label: 'Rescaldo', tooltip: 'Rescaldos: Clique para adicionar', sublabel: '❓' }
  }

  const pendentes = produtosRescaldo.filter(cp => !cp.rescaldo_feito).length

  if (pendentes === 0) {
    const sub = c.status === 'finalizado' ? `${total}` : `${total}✓`
    return { id: 'rescaldo', emoji: '💎', state: 'completed', label: 'Rescaldo', tooltip: `Rescaldos: ${total} feito(s)`, count: total, sublabel: sub }
  }

  return { id: 'rescaldo', emoji: '💎', state: 'in_progress', label: 'Rescaldo', tooltip: `Rescaldos: ${pendentes} pendente(s)`, count: pendentes, sublabel: `${pendentes}⏳` }
}

// --- Main computation ---

const ALL_COMPUTE_FNS = [
  computePelinho,
  computeUrna,
  computeCertificado,
  computeFoto,
  computePagamento,
  computeProtocolo,
  computeRescaldo,
]

export function computeAllTags(contrato: ContratoTagData): ComputedTag[] {
  return ALL_COMPUTE_FNS
    .map(fn => fn(contrato))
    .filter(tag => tag.state !== 'hidden')
}
