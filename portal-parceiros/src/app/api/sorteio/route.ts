import { createAdminClient } from '@/lib/supabase/admin'
import { getParceiroSessao, respostaSessaoInvalida, SessaoInvalida } from '@/lib/sessao'

/** Mês de referência (dia 1) de uma data. */
function mesRef(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * Aba Sorteio (decisão #20): prêmio do mês, MEUS bilhetes e o resultado do último.
 *
 * O parceiro vê os bilhetes dele e o bilhete vencedor — nunca a lista de bilhetes dos
 * colegas nem quem ganhou. E a mecânica de escolha do vencedor (manual na v1, decisão
 * #21) não vaza pela API: daqui sai apenas o código sorteado.
 */
export async function GET() {
  let sessao
  try {
    sessao = await getParceiroSessao()
  } catch (e) {
    if (e instanceof SessaoInvalida) return respostaSessaoInvalida(e)
    throw e
  }

  if (!sessao.config.sorteio_ativo) {
    return Response.json({ ativo: false })
  }

  const admin = createAdminClient()
  const agora = new Date()
  const mesAtual = mesRef(agora)
  const anterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1)

  const { data: atual } = await admin
    .from('parceiro_sorteios')
    .select('mes_ref, premio_nome, premio_descricao, premio_imagem_url, status')
    .eq('unidade_id', sessao.unidadeId)
    .eq('mes_ref', mesAtual)
    .maybeSingle()

  const { data: meusBilhetes } = await admin
    .from('parceiro_bilhetes')
    .select('codigo, origem, mes_ref')
    .eq('contato_id', sessao.contatoId)
    .eq('mes_ref', mesAtual)
    .order('codigo')

  const { data: ultimo } = await admin
    .from('parceiro_sorteios')
    .select('mes_ref, premio_nome, status, realizado_em, bilhete_vencedor_id, parceiro_bilhetes ( codigo, contato_id )')
    .eq('unidade_id', sessao.unidadeId)
    .eq('mes_ref', mesRef(anterior))
    .eq('status', 'encerrado')
    .maybeSingle()

  const vencedor = ultimo?.parceiro_bilhetes as unknown as
    | { codigo: string; contato_id: string }
    | null

  const { count: meusNoAnterior } = await admin
    .from('parceiro_bilhetes')
    .select('id', { count: 'exact', head: true })
    .eq('contato_id', sessao.contatoId)
    .eq('mes_ref', mesRef(anterior))

  // Próximo sorteio: dia 1 do mês seguinte
  const proximo = new Date(agora.getFullYear(), agora.getMonth() + 1, 1)

  return Response.json({
    ativo: true,
    premio: atual
      ? { nome: atual.premio_nome, descricao: atual.premio_descricao, imagem: atual.premio_imagem_url }
      : null,
    meusBilhetes: meusBilhetes ?? [],
    proximoSorteioEm: proximo.toISOString().slice(0, 10),
    ultimo: ultimo
      ? {
          mes: ultimo.mes_ref,
          premio: ultimo.premio_nome,
          bilheteVencedor: vencedor?.codigo ?? null,
          euGanhei: vencedor?.contato_id === sessao.contatoId,
          euConcorri: (meusNoAnterior ?? 0) > 0,
        }
      : null,
    regras: {
      porIndicacao: sessao.config.bilhete_por_indicacao,
      porMgm: sessao.config.bilhete_por_mgm && sessao.config.mgm_ativo,
    },
  })
}
