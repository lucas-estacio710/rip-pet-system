import { validarConvite, MENSAGEM_FALHA } from '@/lib/convite'

/**
 * Dados públicos do convite, pra tela de onboarding se montar.
 * Devolve só o necessário — nada de dado de outros parceiros ou da unidade.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const r = await validarConvite(token)

  if (!r.ok) {
    return Response.json(
      { valido: false, motivo: r.motivo, mensagem: MENSAGEM_FALHA[r.motivo] },
      { status: 410 }
    )
  }

  return Response.json({
    valido: true,
    nomeIndicado: r.convite.nomeIndicado,
    cidadeAtuacao: r.convite.cidadeAtuacao,
    unidadeNome: r.convite.unidadeNome,
    estabelecimentoNome: r.convite.estabelecimentoNome,
  })
}
