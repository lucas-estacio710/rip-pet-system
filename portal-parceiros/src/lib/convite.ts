import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Validação do convite — única fonte da verdade sobre "este token vale?".
 *
 * As três rotas do onboarding (ver dados, criar conta, aceitar) chamam isto, então
 * a regra de uso único e de expiração não pode divergir entre elas.
 */

export type ConviteValido = {
  id: string
  unidadeId: string
  unidadeNome: string
  tipo: 'admin' | 'mgm'
  nomeIndicado: string
  cidadeAtuacao: string
  estabelecimentoId: string | null
  estabelecimentoNome: string | null
  contatoPrevinculadoId: string | null
  padrinhoContatoId: string | null
}

export type FalhaConvite = 'nao_encontrado' | 'ja_usado' | 'expirado' | 'modulo_desligado'

export async function validarConvite(
  token: string
): Promise<{ ok: true; convite: ConviteValido } | { ok: false; motivo: FalhaConvite }> {
  const admin = createAdminClient()

  const { data } = await admin
    .from('parceiro_convites')
    .select(`
      id, unidade_id, tipo, nome_indicado, cidade_atuacao, usado_em, expira_em,
      estabelecimento_id, contato_id_previnculado, criado_por_contato_id,
      unidades ( nome, modulos_ativos ),
      estabelecimentos ( nome )
    `)
    .eq('token', token)
    .maybeSingle()

  if (!data) return { ok: false, motivo: 'nao_encontrado' }
  if (data.usado_em) return { ok: false, motivo: 'ja_usado' }
  if (new Date(data.expira_em).getTime() < Date.now()) return { ok: false, motivo: 'expirado' }

  const unidade = data.unidades as unknown as {
    nome: string
    modulos_ativos: string[] | null
  } | null

  if (!unidade?.modulos_ativos?.includes('cb_portal_parceiros')) {
    return { ok: false, motivo: 'modulo_desligado' }
  }

  const estab = data.estabelecimentos as unknown as { nome: string } | null

  return {
    ok: true,
    convite: {
      id: data.id,
      unidadeId: data.unidade_id,
      unidadeNome: unidade.nome,
      tipo: data.tipo,
      nomeIndicado: data.nome_indicado,
      cidadeAtuacao: data.cidade_atuacao,
      estabelecimentoId: data.estabelecimento_id,
      estabelecimentoNome: estab?.nome ?? null,
      contatoPrevinculadoId: data.contato_id_previnculado,
      padrinhoContatoId: data.criado_por_contato_id,
    },
  }
}

export const MENSAGEM_FALHA: Record<FalhaConvite, string> = {
  nao_encontrado: 'Este convite não existe. Confira o link com quem te convidou.',
  ja_usado: 'Este convite já foi usado. Cada convite vale para uma pessoa só.',
  expirado: 'Este convite expirou. Peça um novo à equipe da RIP Pet.',
  modulo_desligado: 'O programa de parceiros ainda não está ativo nesta região.',
}
