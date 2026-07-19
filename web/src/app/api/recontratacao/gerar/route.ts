import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'
import { gerarTokenRecontratacao } from '@/lib/recontratacao-token'

// Service role (server-side, bypassa RLS) — necessário pra ler tutor/unidade
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST: gera o link de recontratação de um tutor existente.
// Auth: qualquer usuário autenticado (Bearer token do Supabase).
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const accessToken = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabaseAdmin.auth.getUser(accessToken)
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { tutorId, tipo } = await request.json()
    if (!tutorId) return NextResponse.json({ error: 'tutorId é obrigatório' }, { status: 400 })
    // tipo escolhe a ficha pública de destino: emergencial (/ficha) ou preventivo (/preventivo).
    // Mesmo token/slug nos dois casos — o FichaForm trata ?rt= igualmente em ambos os modos.
    const tipoPlano = tipo === 'preventivo' ? 'preventivo' : 'emergencial'

    // Tutor → unidade → slug
    const { data: tutor } = await supabaseAdmin
      .from('tutores')
      .select('id, unidade_id')
      .eq('id', tutorId)
      .single<{ id: string; unidade_id: string | null }>()

    if (!tutor) return NextResponse.json({ error: 'Tutor não encontrado' }, { status: 404 })
    if (!tutor.unidade_id) return NextResponse.json({ error: 'Tutor sem unidade vinculada' }, { status: 400 })

    const { data: unidade } = await supabaseAdmin
      .from('unidades')
      .select('slug')
      .eq('id', tutor.unidade_id)
      .single<{ slug: string | null }>()

    if (!unidade?.slug) {
      return NextResponse.json({ error: 'Unidade do tutor não tem ficha pública (slug)' }, { status: 400 })
    }

    const token = gerarTokenRecontratacao(tutor.id, unidade.slug)
    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin
    const path = tipoPlano === 'preventivo' ? 'preventivo' : 'ficha'
    const url = `${origin}/${path}/${unidade.slug}?rt=${token}`

    return NextResponse.json({ url, slug: unidade.slug, tipo: tipoPlano })
  } catch (e) {
    console.error('Erro ao gerar link de recontratação:', e)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
