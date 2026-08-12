import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Só cuida de "tem sessão?" e do refresh do token.
 *
 * ⚠️ Autorização de verdade (é parceiro? de que unidade? módulo ligado?) NÃO acontece
 * aqui — acontece em `getParceiroSessao()`, dentro de cada API route. O middleware
 * roda no edge e não deve carregar a service_role. Foi exatamente esse atalho
 * ("middleware só checa !user") que abriu o buraco no CRM, corrigido na migration 099.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // API nunca redireciona: quem chama espera JSON, e um 307 pro /entrar devolveria
  // HTML pro fetch(). Toda rota de API se autoriza sozinha com getParceiroSessao(),
  // que responde 401/403 com corpo JSON e o motivo certo.
  if (pathname.startsWith('/api/')) return response

  // Rotas de página que existem sem login: entrar, callback, onboarding por convite,
  // link público do orçamento (o tutor não tem conta) e os termos.
  const publica =
    pathname === '/entrar' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/convite/') ||
    pathname.startsWith('/o/') ||
    pathname === '/termos' ||
    pathname === '/sem-acesso'

  if (!user && !publica) {
    const url = request.nextUrl.clone()
    url.pathname = '/entrar'
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/entrar') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
