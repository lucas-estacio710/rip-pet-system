// Sorteio mensal (decisões #20 e #21).
//   GET  ?unidade_id=uuid&mes=YYYY-MM-01 -> sorteio do mês + bilhetes + parceiros
//   PUT  { unidade_id, mes_ref, premio_nome, premio_descricao, premio_imagem_url }
//   POST { sorteio_id, bilhete_id } -> define o vencedor e encerra
//
// ⚠️ Na v1 o vencedor é escolhido MANUALMENTE pelo super_admin — decisão estratégica
// do dono do negócio. A UI do parceiro não expõe essa mecânica: lá aparece só o
// código do bilhete sorteado. Sorteio randômico auditável fica para a v2.
//
// Auth: super_admin only.
import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function verifySuperAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return null
  const { data: { user } } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user) return null
  const { data } = await admin.from('perfis').select('role')
    .eq('user_id', user.id).eq('role', 'super_admin').limit(1)
  return data && data.length > 0 ? user : null
}

function mesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export async function GET(request: NextRequest) {
  try {
    if (!await verifySuperAdmin(request)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }
    const unidadeId = request.nextUrl.searchParams.get('unidade_id')
    const mes = request.nextUrl.searchParams.get('mes') || mesAtual()
    if (!unidadeId) return NextResponse.json({ error: 'unidade_id obrigatório' }, { status: 400 })

    const { data: sorteio } = await admin
      .from('parceiro_sorteios')
      .select('*')
      .eq('unidade_id', unidadeId)
      .eq('mes_ref', mes)
      .maybeSingle()

    const { data: bilhetes } = await admin
      .from('parceiro_bilhetes')
      .select('id, codigo, origem, contrato_codigo, contato_id, contatos ( nome )')
      .eq('unidade_id', unidadeId)
      .eq('mes_ref', mes)
      .order('codigo')

    return NextResponse.json({ mes, sorteio, bilhetes: bilhetes ?? [] })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// Cadastra/atualiza o prêmio do mês
export async function PUT(request: NextRequest) {
  try {
    if (!await verifySuperAdmin(request)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }
    const { unidade_id, mes_ref, premio_nome, premio_descricao, premio_imagem_url } =
      await request.json()
    if (!unidade_id || !mes_ref) {
      return NextResponse.json({ error: 'unidade_id e mes_ref obrigatórios' }, { status: 400 })
    }

    const { data, error } = await admin
      .from('parceiro_sorteios')
      .upsert(
        { unidade_id, mes_ref, premio_nome, premio_descricao, premio_imagem_url, status: 'aberto' },
        { onConflict: 'unidade_id,mes_ref' }
      )
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ sorteio: data })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// Define o vencedor e encerra
export async function POST(request: NextRequest) {
  try {
    if (!await verifySuperAdmin(request)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }
    const { sorteio_id, bilhete_id } = await request.json()
    if (!sorteio_id || !bilhete_id) {
      return NextResponse.json({ error: 'sorteio_id e bilhete_id obrigatórios' }, { status: 400 })
    }

    const { error } = await admin
      .from('parceiro_sorteios')
      .update({
        bilhete_vencedor_id: bilhete_id,
        status: 'encerrado',
        realizado_em: new Date().toISOString(),
      })
      .eq('id', sorteio_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
