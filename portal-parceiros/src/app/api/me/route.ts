import { createAdminClient } from '@/lib/supabase/admin'
import {
  getParceiroSessao,
  respostaSessaoInvalida,
  SessaoInvalida,
} from '@/lib/sessao'
import { inicioJanela, progressoCategoria } from '@/lib/categoria'

/**
 * Perfil do parceiro + a CONTA da categoria dele.
 *
 * A conta vai junto de propósito (decisão #12): o parceiro precisa ver "N pets
 * desde DD/MM/AAAA → Prata, faltam M pra Ouro". Categoria sem explicação parece
 * arbitrária e mina a confiança no programa.
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
  const desde = inicioJanela()

  // Indicações que contam: contratos com este parceiro como indicador, na janela.
  // `contato_id` sai da SESSÃO — nunca do client (decisão #29).
  const { count, error } = await admin
    .from('contratos')
    .select('id', { count: 'exact', head: true })
    .eq('contato_id', sessao.contatoId)
    .gte('data_contrato', desde.toISOString().slice(0, 10))

  if (error) {
    return Response.json({ erro: 'falha_ao_contar_indicacoes' }, { status: 500 })
  }

  const qtd = count ?? 0
  const progresso = progressoCategoria(qtd, sessao.config.faixas)

  return Response.json({
    nome: sessao.nome,
    cargo: sessao.cargo,
    pixCadastrado: Boolean(sessao.pixChave),
    categoria: {
      atual: progresso.atual,
      proxima: progresso.proxima,
      faltam: progresso.faltam,
      indicacoesNaJanela: qtd,
      janelaDesde: desde.toISOString().slice(0, 10),
    },
    // O app não decide nada sozinho: o que aparece vem da config da unidade (#34).
    features: {
      orcamento: true,
      remocao: sessao.config.remocao_ativa,
      sorteio: sessao.config.sorteio_ativo,
      mgm: sessao.config.mgm_ativo,
      materiais: sessao.config.materiais_ativos,
    },
  })
}
