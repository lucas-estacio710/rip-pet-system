import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Supabase pode enviar tokens via hash fragment (type=recovery)
  // Nesse caso o code não vem como query param — o client-side JS precisa processar
  // Redirecionar para /redefinir-senha se next indicar isso
  if (next === '/redefinir-senha') {
    return NextResponse.redirect(`${origin}/redefinir-senha`)
  }

  // Se não tem code ou deu erro, volta pro login
  return NextResponse.redirect(`${origin}/login`)
}
