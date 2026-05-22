import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh da sessão (importante para manter tokens atualizados)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  const isLoginPage = pathname === '/login'
  const isAuthCallback = pathname.startsWith('/auth/callback')
  const isFicha = pathname.startsWith('/ficha')
  const isPublicAuthPage = pathname === '/esqueci-senha' || pathname === '/redefinir-senha'
  const isInstalarPage = pathname === '/instalar'
  const isWebhook = pathname.startsWith('/api/push/webhook')
  // APIs de recontratação fazem a própria auth (gerar via Bearer, resolve via token assinado)
  const isRecontratacaoApi = pathname.startsWith('/api/recontratacao')

  // Se não autenticado e NÃO está em página pública → redireciona para login
  if (!user && !isLoginPage && !isAuthCallback && !isFicha && !isPublicAuthPage && !isInstalarPage && !isWebhook && !isRecontratacaoApi) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Se autenticado e está na página de login ou esqueci-senha → redireciona para dashboard
  // (mas permite /redefinir-senha pois o usuário pode estar trocando a senha via link)
  if (user && (isLoginPage || pathname === '/esqueci-senha')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Forçar troca de senha no primeiro acesso
  // Se logado, senha ainda não alterada, e não está na página de redefinir/minha-conta
  if (user) {
    // false explícito = criado com senha padrão e ainda não trocou
    // undefined/true = usuário antigo ou que já trocou → libera
    const senhaAlterada = user.user_metadata?.senha_alterada !== false
    const isPasswordPage = pathname === '/redefinir-senha' || pathname === '/minha-conta'
    const isApiRoute = pathname.startsWith('/api/')
    const isLogout = pathname === '/logout'

    if (!senhaAlterada && !isPasswordPage && !isApiRoute && !isLogout && !isAuthCallback) {
      const url = request.nextUrl.clone()
      url.pathname = '/redefinir-senha'
      url.searchParams.set('primeiro-acesso', '1')
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Protege todas as rotas EXCETO:
     * - _next/static (arquivos estáticos)
     * - _next/image (otimização de imagens)
     * - favicon.ico, logo.png, etc.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|logo\\.png|sw\\.js|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
