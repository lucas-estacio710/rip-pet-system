import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'

// Client com service_role (server-side only, bypassa RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { email, password, nome } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 })
    }

    // Verificar se quem chamou é super_admin (via header de auth)
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token)
    if (!caller) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    // Verificar se é super_admin
    const { data: perfis } = await supabaseAdmin
      .from('perfis')
      .select('role')
      .eq('user_id', caller.id)
      .eq('role', 'super_admin')
      .limit(1)

    if (!perfis || perfis.length === 0) {
      return NextResponse.json({ error: 'Apenas super admin pode criar usuários' }, { status: 403 })
    }

    // Criar usuário via admin API
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Confirma email automaticamente
      user_metadata: { nome },
    })

    if (error) {
      console.error('Supabase admin.createUser error:', error.message, error.status, JSON.stringify(error))
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ user_id: data.user.id })
  } catch (err) {
    console.error('Erro ao criar usuário:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
