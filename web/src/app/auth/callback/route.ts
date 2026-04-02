import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const type = searchParams.get('type') // recovery, signup, etc.

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Se é recovery (reset de senha), redirecionar para redefinir-senha
      if (type === 'recovery' || next === '/redefinir-senha') {
        return NextResponse.redirect(`${origin}/redefinir-senha`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }

    // Se deu erro no exchange, pode ser code expirado
    console.error('Auth callback error:', error.message)
  }

  // Se next indica redefinir-senha, redirecionar mesmo sem code
  // (o Supabase pode enviar tokens via hash fragment que o client-side processa)
  if (next === '/redefinir-senha') {
    return NextResponse.redirect(`${origin}/redefinir-senha`)
  }

  // Fallback: volta pro login com mensagem de erro
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
