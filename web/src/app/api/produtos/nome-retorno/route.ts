import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// PATCH - update individual
export async function PATCH(request: NextRequest) {
  const { id, nome_retorno } = await request.json()

  if (!id) {
    return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('produtos')
    .update({ nome_retorno: nome_retorno || null })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// PUT - bulk update
export async function PUT(request: NextRequest) {
  const { updates } = await request.json() as {
    updates: { id: string; nome_retorno: string | null }[]
  }

  if (!updates?.length) {
    return NextResponse.json({ error: 'updates vazio' }, { status: 400 })
  }

  let ok = 0
  let erros = 0

  for (const u of updates) {
    const { error } = await supabaseAdmin
      .from('produtos')
      .update({ nome_retorno: u.nome_retorno || null })
      .eq('id', u.id)

    if (error) erros++
    else ok++
  }

  return NextResponse.json({ ok, erros, total: updates.length })
}
