import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'

// Client com service_role (server-side only, bypassa RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Verificar se o caller é super_admin
async function verifySuperAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return null

  const token = authHeader.replace('Bearer ', '')
  const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token)
  if (!caller) return null

  const { data: perfis } = await supabaseAdmin
    .from('perfis')
    .select('role')
    .eq('user_id', caller.id)
    .eq('role', 'super_admin')
    .limit(1)

  if (!perfis || perfis.length === 0) return null
  return caller
}

// PUT: Atualizar perfis de um usuário existente
export async function PUT(request: NextRequest) {
  try {
    const caller = await verifySuperAdmin(request)
    if (!caller) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const { user_id, nome, perfis } = await request.json()

    if (!user_id || !perfis || perfis.length === 0) {
      return NextResponse.json({ error: 'user_id e perfis são obrigatórios' }, { status: 400 })
    }

    // Deletar perfis antigos (com service_role, bypassa RLS)
    const { error: deleteError } = await supabaseAdmin
      .from('perfis')
      .delete()
      .eq('user_id', user_id)

    if (deleteError) {
      console.error('Erro ao deletar perfis:', deleteError)
      return NextResponse.json({ error: 'Erro ao remover perfis antigos: ' + deleteError.message }, { status: 500 })
    }

    // Inserir novos perfis
    const perfisToInsert = perfis.map((p: { unidade_id: string; role: string; is_default: boolean }) => ({
      user_id,
      unidade_id: p.unidade_id,
      role: p.role,
      is_default: p.is_default,
      nome: nome || null,
    }))

    const { error: insertError } = await supabaseAdmin
      .from('perfis')
      .insert(perfisToInsert)

    if (insertError) {
      console.error('Erro ao inserir perfis:', insertError)
      return NextResponse.json({ error: 'Erro ao salvar perfis: ' + insertError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Erro ao atualizar perfis:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// DELETE: Desativar usuário (soft delete)
export async function DELETE(request: NextRequest) {
  try {
    const caller = await verifySuperAdmin(request)
    if (!caller) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const { user_id } = await request.json()

    if (!user_id) {
      return NextResponse.json({ error: 'user_id é obrigatório' }, { status: 400 })
    }

    // Não permitir desativar a si mesmo
    if (user_id === caller.id) {
      return NextResponse.json({ error: 'Você não pode desativar seu próprio usuário' }, { status: 400 })
    }

    // Desativar todos os perfis do usuário
    const { error: perfisError } = await supabaseAdmin
      .from('perfis')
      .update({ ativo: false })
      .eq('user_id', user_id)

    if (perfisError) {
      console.error('Erro ao desativar perfis:', perfisError)
      return NextResponse.json({ error: 'Erro ao desativar perfis: ' + perfisError.message }, { status: 500 })
    }

    // Banir o usuário no Supabase Auth (impede login)
    const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      ban_duration: '876600h', // ~100 anos
      user_metadata: { desativado: true, desativado_em: new Date().toISOString() },
    })

    if (banError) {
      console.error('Erro ao banir usuário:', banError)
      // Perfis já foram desativados, então não é crítico
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Erro ao desativar usuário:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// PATCH: Reativar usuário
export async function PATCH(request: NextRequest) {
  try {
    const caller = await verifySuperAdmin(request)
    if (!caller) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const { user_id } = await request.json()

    if (!user_id) {
      return NextResponse.json({ error: 'user_id é obrigatório' }, { status: 400 })
    }

    // Reativar todos os perfis do usuário
    const { error: perfisError } = await supabaseAdmin
      .from('perfis')
      .update({ ativo: true })
      .eq('user_id', user_id)

    if (perfisError) {
      console.error('Erro ao reativar perfis:', perfisError)
      return NextResponse.json({ error: 'Erro ao reativar perfis: ' + perfisError.message }, { status: 500 })
    }

    // Remover ban do Supabase Auth
    const { error: unbanError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      ban_duration: 'none',
      user_metadata: { desativado: false },
    })

    if (unbanError) {
      console.error('Erro ao desbanir usuário:', unbanError)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Erro ao reativar usuário:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// POST: Criar novo usuário
export async function POST(request: NextRequest) {
  try {
    const { email, password, nome } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 })
    }

    const caller = await verifySuperAdmin(request)
    if (!caller) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    // Criar usuário via admin API (senha_alterada: false para forçar troca no primeiro login)
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome, senha_alterada: false },
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
