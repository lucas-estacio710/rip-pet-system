import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

/** Troca o `code` do OAuth pela sessão e devolve o parceiro pra home. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const proximo = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createServerSupabase()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${proximo}`)
  }

  return NextResponse.redirect(`${origin}/entrar?erro=auth`)
}
