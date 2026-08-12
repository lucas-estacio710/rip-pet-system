import { createAdminClient } from '@/lib/supabase/admin'
import { getParceiroSessao, respostaSessaoInvalida, SessaoInvalida } from '@/lib/sessao'

/**
 * Catálogo de planos da unidade DO PARCEIRO (a unidade sai da sessão, decisão #33).
 * Devolve também os produtos elegíveis como cortesia, separados por tipo de cremação.
 */
export async function GET() {
  let sessao
  try {
    sessao = await getParceiroSessao()
  } catch (e) {
    if (e instanceof SessaoInvalida) return respostaSessaoInvalida(e)
    throw e
  }

  const admin = createAdminClient()

  const { data: planos, error } = await admin
    .from('planos')
    .select(
      'id, nome, descricao, imagem_url, tipo_cremacao, preco, adicional_peso_kg, adicional_valor, plano_grupos(*, plano_itens(*))'
    )
    .eq('unidade_id', sessao.unidadeId)
    .eq('ativo', true)
    .order('ordem')

  if (error) return Response.json({ erro: 'falha_ao_carregar_catalogo' }, { status: 500 })

  // Cortesias: ids configurados no Orquestrador → nome e foto vêm de `produtos`.
  const cortesiaIds = [
    ...(sessao.config.cortesia_produtos?.individual ?? []),
    ...(sessao.config.cortesia_produtos?.coletiva ?? []),
  ]
  let cortesias: { id: string; nome: string; imagem_url: string | null }[] = []
  if (cortesiaIds.length > 0) {
    const { data } = await admin
      .from('produtos')
      .select('id, nome, imagem_url')
      .in('id', cortesiaIds)
    cortesias = data ?? []
  }

  return Response.json({
    planos: planos ?? [],
    beneficios: sessao.config.beneficios_ativos,
    descontoPercentual: sessao.config.desconto_percentual,
    cortesias: {
      individual: (sessao.config.cortesia_produtos?.individual ?? [])
        .map((id) => cortesias.find((c) => c.id === id))
        .filter(Boolean),
      coletiva: (sessao.config.cortesia_produtos?.coletiva ?? [])
        .map((id) => cortesias.find((c) => c.id === id))
        .filter(Boolean),
    },
  })
}
