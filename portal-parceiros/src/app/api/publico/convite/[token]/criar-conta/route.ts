import { createAdminClient } from '@/lib/supabase/admin'
import { validarConvite, MENSAGEM_FALHA } from '@/lib/convite'

/**
 * Cria a conta de acesso a partir de um convite válido.
 *
 * Por que criar server-side em vez de `signUp` no browser: o Supabase mandaria um
 * e-mail de confirmação e a sessão só valeria depois do clique. O cadastro acontece
 * numa VISITA, com o Lucas e o parceiro lado a lado — mandar a pessoa abrir o e-mail
 * mata o momento. O convite (token de uso único, 256 bits, com validade) já é a prova
 * de autorização, então marcamos `email_confirm` aqui.
 *
 * Isto NÃO conclui o cadastro: só cria o login. O vínculo com o parceiro é feito em
 * /api/convite/[token]/aceitar, que exige a sessão recém-criada.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const r = await validarConvite(token)
  if (!r.ok) {
    return Response.json({ erro: MENSAGEM_FALHA[r.motivo] }, { status: 410 })
  }

  let body: { email?: string; senha?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ erro: 'Requisição inválida.' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  const senha = body.senha

  if (!email || !senha) {
    return Response.json({ erro: 'Informe e-mail e senha.' }, { status: 400 })
  }
  if (senha.length < 8) {
    return Response.json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { origem: 'portal_parceiros' },
  })

  if (error) {
    // E-mail já cadastrado é o caso comum e tem saída boa: é só entrar.
    const jaExiste = /already|registered|exists/i.test(error.message)
    return Response.json(
      {
        erro: jaExiste
          ? 'Já existe uma conta com este e-mail. Entre com ela para continuar o cadastro.'
          : 'Não consegui criar a conta. Tente novamente.',
        jaExiste,
      },
      { status: jaExiste ? 409 : 500 }
    )
  }

  return Response.json({ ok: true })
}
