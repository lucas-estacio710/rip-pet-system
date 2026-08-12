import { randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getParceiroSessao, respostaSessaoInvalida, SessaoInvalida } from '@/lib/sessao'

/**
 * Member-get-member: o parceiro convida um colega (decisão #2).
 *
 * Mesma trava de cobertura do convite do admin — a cidade tem que estar em
 * `cidades_cobertura`. O bilhete do padrinho só é creditado quando o colega
 * CONCLUI o cadastro (em /api/convite/[token]/aceitar), nunca ao gerar o link:
 * senão bastaria gerar convites para acumular bilhete.
 */

const VALIDADE_DIAS = 30

export async function GET() {
  let sessao
  try {
    sessao = await getParceiroSessao()
  } catch (e) {
    if (e instanceof SessaoInvalida) return respostaSessaoInvalida(e)
    throw e
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('parceiro_convites')
    .select('id, nome_indicado, cidade_atuacao, usado_em, expira_em, created_at, token, contato_id_resultante')
    .eq('criado_por_contato_id', sessao.contatoId)
    .eq('tipo', 'mgm')
    .order('created_at', { ascending: false })
    .limit(50)

  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://parceiro.rippet.com.br'
  const agora = Date.now()

  return Response.json({
    ativo: sessao.config.mgm_ativo,
    cidades: sessao.config.cidades_cobertura ?? [],
    ganhaBilhete: sessao.config.mgm_ativo && sessao.config.bilhete_por_mgm && sessao.config.sorteio_ativo,
    convites: (data ?? []).map((c) => ({
      id: c.id,
      nome: c.nome_indicado,
      cidade: c.cidade_atuacao,
      url: `${base.replace(/\/$/, '')}/convite/${c.token}`,
      situacao: c.contato_id_resultante
        ? 'cadastrado'
        : new Date(c.expira_em).getTime() < agora
          ? 'expirado'
          : 'aguardando',
    })),
  })
}

export async function POST(req: Request) {
  let sessao
  try {
    sessao = await getParceiroSessao()
  } catch (e) {
    if (e instanceof SessaoInvalida) return respostaSessaoInvalida(e)
    throw e
  }

  if (!sessao.config.mgm_ativo) {
    return Response.json({ erro: 'Indicação de colegas está indisponível.' }, { status: 403 })
  }

  let body: { nome?: string; cidade?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ erro: 'Requisição inválida.' }, { status: 400 })
  }

  if (!body.nome?.trim()) return Response.json({ erro: 'Informe o nome do colega.' }, { status: 400 })
  const cidades = sessao.config.cidades_cobertura ?? []
  if (!body.cidade || !cidades.includes(body.cidade)) {
    return Response.json({ erro: 'Escolha uma região atendida.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const token = randomBytes(32).toString('base64url')
  const expira = new Date()
  expira.setDate(expira.getDate() + VALIDADE_DIAS)

  const { data, error } = await admin
    .from('parceiro_convites')
    .insert({
      unidade_id: sessao.unidadeId,
      token,
      tipo: 'mgm',
      nome_indicado: body.nome.trim(),
      cidade_atuacao: body.cidade,
      criado_por_contato_id: sessao.contatoId,
      expira_em: expira.toISOString(),
    })
    .select('id, token')
    .single()

  if (error) return Response.json({ erro: 'Falha ao gerar o convite.' }, { status: 500 })

  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://parceiro.rippet.com.br'
  return Response.json({ id: data.id, url: `${base.replace(/\/$/, '')}/convite/${data.token}` })
}
