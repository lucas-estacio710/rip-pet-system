import { createAdminClient } from '@/lib/supabase/admin'
import { getParceiroSessao, respostaSessaoInvalida, SessaoInvalida } from '@/lib/sessao'

/**
 * "Essa indicação foi minha" (decisão #15).
 *
 * Para o caso em que o tutor liga direto, sem usar o link do parceiro. O parceiro
 * descreve o atendimento e o admin aprova — a aprovação é que vincula o contrato.
 * O parceiro nunca escolhe o contrato: ele não pode enxergar a base de contratos.
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
  const { data } = await admin
    .from('parceiro_reivindicacoes')
    .select('id, descricao, status, created_at, resolvido_em')
    .eq('contato_id', sessao.contatoId)
    .order('created_at', { ascending: false })
    .limit(50)

  return Response.json({ reivindicacoes: data ?? [] })
}

export async function POST(req: Request) {
  let sessao
  try {
    sessao = await getParceiroSessao()
  } catch (e) {
    if (e instanceof SessaoInvalida) return respostaSessaoInvalida(e)
    throw e
  }

  let body: { descricao?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ erro: 'Requisição inválida.' }, { status: 400 })
  }

  const descricao = body.descricao?.trim()
  if (!descricao || descricao.length < 10) {
    return Response.json(
      { erro: 'Conte quem era o tutor, o nome do pet e quando foi.' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()
  const { error } = await admin.from('parceiro_reivindicacoes').insert({
    contato_id: sessao.contatoId,
    unidade_id: sessao.unidadeId,
    descricao,
    status: 'pendente',
  })

  if (error) return Response.json({ erro: 'Falha ao enviar.' }, { status: 500 })
  return Response.json({ ok: true })
}
