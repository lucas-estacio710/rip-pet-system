// EXCLUIR UM LANÇAMENTO (15/10/2026) — porta única, usada pelo formulário (LancamentosTab) e
// pela lixeira das linhas do Balanço do Caixa. As travas moram aqui pra valer nos dois lugares:
//   · conciliado (bateu com o extrato/fatura) → não se exclui; só a categoria pode mudar
//   · perna de cobrança entre unidades (origem 'sistema') → não se exclui daqui
//   · custo já repassado a outra unidade (cobrança viva apontando pra ele) → não se exclui
// Pré-lançamento (lançado à mão, ainda sem o banco) exclui à vontade.

import type { SupabaseClient } from '@supabase/supabase-js'

/** null = excluído; string = o motivo de não poder. */
export async function excluirLancamento(sb: SupabaseClient, id: string): Promise<string | null> {
  const [{ data: cc }, { data: l }, { data: rp }] = await Promise.all([
    sb.from('fin_conciliacoes').select('id').eq('origem', 'lancamento').eq('origem_id', id).limit(1),
    sb.from('fin_lancamentos').select('origem').eq('id', id).maybeSingle(),
    sb.from('fin_cobrancas').select('id').eq('lancamento_origem_id', id).not('status', 'in', '(recusada,cancelada)').limit(1),
  ])
  if (cc && cc.length) return 'Conciliado com o banco: não dá pra excluir. Só a categoria pode mudar'
  if ((l as { origem?: string } | null)?.origem === 'sistema') return 'Este lançamento espelha uma cobrança entre unidades: não se exclui daqui'
  if (rp && rp.length) return 'Custo já repassado a outra unidade: não dá pra excluir'
  const { error } = await sb.from('fin_lancamentos').delete().eq('id', id)
  return error ? error.message : null
}
