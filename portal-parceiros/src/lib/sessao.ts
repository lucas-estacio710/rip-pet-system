import 'server-only'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ParceiroConfig } from '@/lib/tipos'

/**
 * O guarda de entrada de TODA API route do portal.
 *
 * Resolve, a partir do cookie de sessão: quem é o parceiro, de que unidade ele é,
 * e qual a configuração vigente do programa naquela unidade.
 *
 * Por que isto existe (decisão #29 + #33): o `contato_id` e o `unidade_id` NUNCA
 * podem vir do client — senão um parceiro trocaria o id na request e leria o extrato
 * (ou o pix) de outro. Aqui eles saem exclusivamente do JWT → `contatos.user_id`.
 */

export type Sessao = {
  userId: string
  contatoId: string
  unidadeId: string
  nome: string
  cargo: string | null
  categoria: 'bronze' | 'prata' | 'ouro' | null
  pixChave: string | null
  config: ParceiroConfig
}

export class SessaoInvalida extends Error {
  constructor(
    public readonly motivo:
      | 'sem_login'
      | 'nao_e_parceiro'
      | 'portal_inativo'
      | 'modulo_desligado'
  ) {
    super(motivo)
  }
}

export async function getParceiroSessao(): Promise<Sessao> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new SessaoInvalida('sem_login')

  const admin = createAdminClient()

  const { data: contato } = await admin
    .from('contatos')
    .select('id, nome, cargo, unidade_id, portal_ativo, categoria_parceiro, pix_chave')
    .eq('user_id', user.id)
    .maybeSingle()

  // Autenticado no Supabase não significa ser parceiro: qualquer conta do projeto
  // (inclusive alguém da equipe do CRM) cai aqui sem ter cadastro no programa.
  if (!contato) throw new SessaoInvalida('nao_e_parceiro')
  if (!contato.portal_ativo) throw new SessaoInvalida('portal_inativo')
  if (!contato.unidade_id) throw new SessaoInvalida('nao_e_parceiro')

  // O módulo pode ser desligado por unidade (decisão #33) — vale como kill switch.
  const { data: unidade } = await admin
    .from('unidades')
    .select('modulos_ativos')
    .eq('id', contato.unidade_id)
    .single()

  if (!unidade?.modulos_ativos?.includes('cb_portal_parceiros')) {
    throw new SessaoInvalida('modulo_desligado')
  }

  const { data: config } = await admin
    .from('parceiro_config')
    .select('*')
    .eq('unidade_id', contato.unidade_id)
    .single()

  if (!config) throw new SessaoInvalida('modulo_desligado')

  return {
    userId: user.id,
    contatoId: contato.id,
    unidadeId: contato.unidade_id,
    nome: contato.nome,
    cargo: contato.cargo,
    categoria: contato.categoria_parceiro,
    pixChave: contato.pix_chave,
    config: config as ParceiroConfig,
  }
}

/** Traduz a falha de sessão numa resposta HTTP honesta (sem vazar detalhe). */
export function respostaSessaoInvalida(erro: SessaoInvalida): Response {
  const status = erro.motivo === 'sem_login' ? 401 : 403
  return Response.json({ erro: erro.motivo }, { status })
}
