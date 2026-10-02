// RECONHECER UMA COBRANÇA — a porta única que cria as duas pernas na DRE.
//
// Saiu do CobrancasCard em 02/10/2026 porque passou a ter DOIS chamadores:
//   1) a unidade reconhece uma cobrança que recebeu (CobrancasCard › Reconhecer);
//   2) o super admin, de chapéu de Matriz, lança um acerto do repasse JÁ
//      reconhecido (AcertosRepasse) — o Lucas veste os dois chapéus e não
//      precisa trocar de tela para reconhecer o que ele mesmo lançou.
// As pernas têm de nascer IGUAIS pelos dois caminhos; por isso uma função só.
//
// COMO UM ACERTO CONTA NA DRE SEM MEXER EM CONTA NENHUMA (FLOW_FINANCEIRO §9.5):
//   - a DESPESA nasce no livro de quem deve (unidade_devedora), na categoria da
//     cobrança — foi quem consumiu;
//   - o REEMBOLSO (receita, conta 9.1.01) nasce no livro de quem cobra
//     (unidade_credora) — neutraliza o gasto que ela tinha bancado;
//   - as duas SEM `data_caixa`: nenhum dinheiro andou. O dinheiro anda uma vez
//     só, líquido, quando o repasse é pago (uma transferência, que não é DRE).
// As duas nascem juntas: separadas no tempo, o grupo contaria o gasto duas vezes.

import type { SupabaseClient } from '@supabase/supabase-js'
import { CONTA_ACERTO_RECEITA, type TipoCobranca } from '@/lib/cobrancas'

export type CobrancaParaReconhecer = {
  id: string
  tipo: TipoCobranca
  valor: number
  data: string
  descricao: string | null
  categoria_id: string | null
  unidade_credora: string
  unidade_devedora: string
  credoraNome?: string | null
  devedoraCodigo?: string | null
  fin_categorias?: {
    fin_conta_id: string | null
    fin_contas?: { codigo: string; nome: string; natureza: string } | null
  } | null
}

/**
 * Marca a cobrança como `aceita` e, se for de despesa, cria as duas pernas.
 * `recebimento_terceiro` (cliente de uma unidade pagou na conta de outra) NÃO
 * gera lançamento — a receita já é lida de `contratos` na unidade dona (§9.6).
 */
export async function reconhecerCobranca(
  supabase: SupabaseClient,
  c: CobrancaParaReconhecer,
  quem: { userName: string | null },
  opts: { guardarReembolsoEmOrigem?: boolean } = {},
): Promise<{ despesaId: string | null; reembolsoId: string | null }> {
  let lancamentoAceiteId: string | null = null
  let reembolsoId: string | null = null

  if (c.tipo === 'despesa_rateada' || c.tipo === 'outro') {
    const conta = c.fin_categorias?.fin_contas
    const { data: { user } } = await supabase.auth.getUser()
    // As duas pernas nascem conferidas por quem reconheceu (não há fila de aprovação).
    const marca = {
      status: 'aprovado',
      aprovado_por: user?.id || null,
      aprovado_por_nome: quem.userName || null,
      aprovado_em: new Date().toISOString(),
    }

    // 1) a despesa, no livro de quem DEVE.
    const { data: desp, error: e1 } = await supabase.from('fin_lancamentos').insert({
      unidade_id: c.unidade_devedora,
      categoria_id: c.categoria_id,
      conta_id: c.fin_categorias?.fin_conta_id || null,
      conta_codigo: conta?.codigo || null,      // SNAPSHOT da DRE histórica
      conta_nome: conta?.nome || null,
      natureza: conta?.natureza || 'opex',
      valor: c.valor,
      data_competencia: c.data,
      data_caixa: null,                         // nenhum dinheiro andou
      descricao: c.descricao || 'Compra por outra unidade',
      fornecedor_nome: c.credoraNome || null,
      ...marca,
      origem: 'cobranca',
      criado_por_nome: quem.userName || null,
      rateio_meses: 1,
    }).select('id').single()
    if (e1) throw new Error(e1.message)
    lancamentoAceiteId = (desp as { id: string }).id

    // 2) o reembolso, no livro de quem COBRA — neutraliza a despesa lá.
    const { data: ctaReemb } = await supabase
      .from('fin_contas').select('id, codigo, nome').eq('codigo', CONTA_ACERTO_RECEITA).maybeSingle()
    const cr = ctaReemb as { id: string; codigo: string; nome: string } | null
    const { data: reemb, error: e2 } = await supabase.from('fin_lancamentos').insert({
      unidade_id: c.unidade_credora,
      conta_id: cr?.id || null,
      conta_codigo: cr?.codigo || null,
      conta_nome: cr?.nome || null,
      natureza: 'opex',
      valor: c.valor,
      data_competencia: c.data,
      data_caixa: null,
      descricao: `Reembolso — ${c.descricao || 'compra'}${c.devedoraCodigo ? ` (${c.devedoraCodigo})` : ''}`,
      ...marca,
      origem: 'cobranca',
      criado_por_nome: quem.userName || null,
      rateio_meses: 1,
    }).select('id').single()
    if (e2) throw new Error(`A despesa entrou, mas o reembolso não: ${e2.message}`)
    reembolsoId = (reemb as { id: string }).id
  }

  const { error } = await supabase.from('fin_cobrancas').update({
    status: 'aceita',
    aceita_em: new Date().toISOString(),
    lancamento_aceite_id: lancamentoAceiteId,
    // Acerto do REPASSE não tem "compra original": o campo guarda a perna do
    // reembolso, pra apagar o acerto levar as duas pernas juntas (AcertosRepasse).
    ...(opts.guardarReembolsoEmOrigem ? { lancamento_origem_id: reembolsoId } : {}),
  }).eq('id', c.id)
  if (error) throw new Error(error.message)
  return { despesaId: lancamentoAceiteId, reembolsoId }
}
