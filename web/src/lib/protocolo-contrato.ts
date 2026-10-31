/**
 * PROTOCOLO DE ENTREGA — montar do banco, salvar com carimbo e verificar alterações
 * (31/10/2026, pedido do Lucas: "se o protocolo já foi salvo e depois teve alteração —
 * pagamento, produto, qualquer uma — tem que avisar").
 *
 * A comparação é SEMPRE entre duas montagens automáticas desta mesma função: a do momento do
 * salvamento (guardada como assinatura em `protocolo_data._base`) e a de agora. Por isso todo
 * salvamento passa por `salvarProtocolo` — pipeline (DOC), detalhe (DOC) e o popup de
 * pendências — e nenhum monta a assinatura com a sua própria conta.
 */
import {
  montarProtocoloData, carimbarProtocolo, alteracoesDesdeOSalvamento,
  type ProtocoloData, type GrupoProtocolo,
} from '@/components/protocolo/protocolo-utils'

type Erro = { message: string } | null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = any

/** Mesma conta do pipeline e do detalhe (calcFinanceiroProtocolo). */
function financeiroDoProtocolo(
  c: { valor_plano: number | null; desconto_plano_unificado: number | null; valor_acessorios: number | null; desconto_acessorios: number | null; desconto_acessorios_ajuste: number | null },
  pagamentos: { valor: number | null }[],
) {
  const aPagarPlano = (c.valor_plano || 0) - (c.desconto_plano_unificado || 0)
  const aPagarAcessorios = (c.valor_acessorios || 0) - (c.desconto_acessorios || 0) - (c.desconto_acessorios_ajuste || 0)
  const totalAPagar = aPagarPlano + aPagarAcessorios
  const totalPago = pagamentos.reduce((s, p) => s + (p.valor || 0), 0)
  return { totalAPagar, totalPago, saldo: Math.max(0, totalAPagar - totalPago), aPagarPlano }
}

/** O protocolo como o sistema monta AGORA, lendo contrato, produtos e pagamentos do banco. */
export async function protocoloDoContratoAgora(supabase: Cliente, contratoId: string): Promise<ProtocoloData> {
  const [cps, pags, ct] = await Promise.all([
    supabase.from('contrato_produtos').select('valor, produto:produtos(nome, nome_retorno, tipo, preco)').eq('contrato_id', contratoId),
    supabase.from('pagamentos').select('valor').eq('contrato_id', contratoId),
    supabase.from('contratos').select('*, tutor:tutores(nome, telefone, telefone2, telefone_principal, endereco, numero, complemento, bairro, cidade, estado, cep)').eq('id', contratoId).single(),
  ]) as [{ data: unknown[] | null; error: Erro }, { data: { valor: number | null }[] | null; error: Erro }, { data: Record<string, unknown> | null; error: Erro }]
  const erro = cps.error || pags.error || ct.error
  if (erro || !ct.data) throw new Error('Não consegui montar o protocolo: ' + (erro?.message || 'contrato não encontrado'))
  const contrato = ct.data as Parameters<typeof montarProtocoloData>[0] & Parameters<typeof financeiroDoProtocolo>[0]
  return montarProtocoloData(contrato, (cps.data || []) as Parameters<typeof montarProtocoloData>[1], financeiroDoProtocolo(contrato, pags.data || []))
}

/** Grava o protocolo editado com data/hora e a assinatura do contrato de agora. Devolve o gravado. */
export async function salvarProtocolo(supabase: Cliente, contratoId: string, editado: ProtocoloData): Promise<ProtocoloData> {
  const atual = await protocoloDoContratoAgora(supabase, contratoId)
  const gravado = carimbarProtocolo(editado, atual)
  const { error } = await supabase.from('contratos').update({ protocolo_data: gravado }).eq('id', contratoId) as { error: Erro }
  if (error) throw new Error('Erro ao salvar o protocolo: ' + error.message)
  return gravado
}

/**
 * O que mudou no contrato desde que o protocolo foi salvo. `null` = sem carimbo (salvo antes de
 * 31/10/2026) ou não deu pra ler agora — nesses casos a tela não acusa nada.
 */
export async function alteracoesDoProtocolo(supabase: Cliente, contratoId: string, salvo: unknown): Promise<GrupoProtocolo[] | null> {
  const s = salvo as Pick<ProtocoloData, '_base'> | null
  if (!s?._base) return null
  try {
    return alteracoesDesdeOSalvamento(s, await protocoloDoContratoAgora(supabase, contratoId))
  } catch {
    return null
  }
}
