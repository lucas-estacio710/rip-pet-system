import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'
import { verificarTokenRecontratacao } from '@/lib/recontratacao-token'

// Service role (server-side, bypassa RLS) — anon não pode ler `tutores`
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: resolve o token e devolve SÓ os campos do tutor (nunca a tabela inteira).
// Público — a segurança vem da assinatura do token.
export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get('token') || ''
  const r = verificarTokenRecontratacao(token)

  if (!r.ok) {
    const status = r.erro === 'expirado' ? 410 : 400
    return NextResponse.json({ erro: r.erro }, { status })
  }

  const { data: tutor } = await supabaseAdmin
    .from('tutores')
    .select('nome, cpf, telefone, telefone2, email, cep, estado, cidade, bairro, endereco, numero, complemento')
    .eq('id', r.tutorId)
    .single()

  if (!tutor) return NextResponse.json({ erro: 'invalido' }, { status: 400 })

  return NextResponse.json({ slug: r.slug, tutor })
}
