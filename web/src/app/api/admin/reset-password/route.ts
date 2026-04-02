import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'
import crypto from 'crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DEFAULT_PASSWORD = process.env.DEFAULT_RESET_PASSWORD
if (!DEFAULT_PASSWORD) {
  console.error('DEFAULT_RESET_PASSWORD não configurada no .env.local')
}

function gerarSenhaAleatoria(): string {
  // 12 caracteres: letras maiúsculas, minúsculas, números e símbolos
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$&'
  const all = upper + lower + digits + symbols

  // Garantir pelo menos 1 de cada tipo
  const bytes = crypto.randomBytes(12)
  const senha = [
    upper[bytes[0] % upper.length],
    lower[bytes[1] % lower.length],
    digits[bytes[2] % digits.length],
    symbols[bytes[3] % symbols.length],
  ]

  // Preencher o resto
  for (let i = 4; i < 12; i++) {
    senha.push(all[bytes[i] % all.length])
  }

  // Embaralhar
  for (let i = senha.length - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1)
    ;[senha[i], senha[j]] = [senha[j], senha[i]]
  }

  return senha.join('')
}

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

// GET: Retornar senhas temporárias de usuários que ainda não trocaram
export async function GET(request: NextRequest) {
  try {
    const caller = await verifySuperAdmin(request)
    if (!caller) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Retornar map: user_id → senha_temporaria (só os que têm)
    const senhas: Record<string, string> = {}
    for (const user of users) {
      const st = user.user_metadata?.senha_temporaria
      if (st && user.user_metadata?.senha_alterada === false) {
        senhas[user.id] = st
      }
    }

    return NextResponse.json(senhas)
  } catch (err) {
    console.error('Erro ao buscar senhas temporárias:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// POST: Resetar senha de um usuário
export async function POST(request: NextRequest) {
  try {
    const caller = await verifySuperAdmin(request)
    if (!caller) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const { user_id, tipo = 'padrao' } = await request.json()

    if (!user_id) {
      return NextResponse.json({ error: 'user_id é obrigatório' }, { status: 400 })
    }

    if (user_id === caller.id) {
      return NextResponse.json({ error: 'Use Minha Conta para trocar sua própria senha' }, { status: 400 })
    }

    if (tipo !== 'aleatoria' && !DEFAULT_PASSWORD) {
      return NextResponse.json({ error: 'Senha padrão não configurada no servidor' }, { status: 500 })
    }

    const senha = tipo === 'aleatoria' ? gerarSenhaAleatoria() : DEFAULT_PASSWORD!

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password: senha,
      user_metadata: { senha_alterada: false, senha_temporaria: senha },
    })

    if (error) {
      console.error('Erro ao resetar senha:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, senha })
  } catch (err) {
    console.error('Erro ao resetar senha:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
