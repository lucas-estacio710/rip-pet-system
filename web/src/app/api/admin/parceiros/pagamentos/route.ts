// Fila de pagamento das comissões (a rotina de segunda-feira, decisões #17 e #37).
//   GET  ?unidade_id=uuid  -> parceiros com comissão em aberto, agrupados, com pix
//   POST { contato_id, contrato_ids[], comprovante_base64?, observacao? }
//        -> registra o pagamento, sobe o comprovante e marca os contratos como pagos
//
// Esta tela SUBSTITUI o processo manual de bonificação. Por isso ela agrupa por pessoa
// (é um pix por parceiro, não um por contrato) e guarda a chave usada como snapshot —
// se o parceiro trocar o pix depois, o histórico continua contando a verdade.
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

// ---------- GET ----------
export async function GET(request: NextRequest) {
  try {
    if (!await verifySuperAdmin(request)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }
    const unidadeId = request.nextUrl.searchParams.get('unidade_id')
    if (!unidadeId) return NextResponse.json({ error: 'unidade_id obrigatório' }, { status: 400 })

    const { data: contratos, error } = await admin
      .from('contratos')
      .select('id, codigo, pet_nome, tutor_nome, tipo_cremacao, data_contrato, comissao_valor, contato_id')
      .eq('unidade_id', unidadeId)
      .eq('comissao_paga', false)
      .gt('comissao_valor', 0)
      .not('contato_id', 'is', null)
      .order('data_contrato', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const ids = [...new Set((contratos ?? []).map(c => c.contato_id))]
    if (ids.length === 0) return NextResponse.json({ fila: [] })

    const { data: parceiros } = await admin
      .from('contatos')
      .select('id, nome, pix_chave, categoria_parceiro, portal_ativo, whatsapp')
      .in('id', ids)

    const fila = (parceiros ?? []).map(p => {
      const itens = (contratos ?? []).filter(c => c.contato_id === p.id)
      return {
        parceiro: p,
        total: itens.reduce((s, c) => s + Number(c.comissao_valor ?? 0), 0),
        contratos: itens,
      }
    }).sort((a, b) => b.total - a.total)

    return NextResponse.json({ fila })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// ---------- POST ----------
export async function POST(request: NextRequest) {
  try {
    const caller = await verifySuperAdmin(request)
    if (!caller) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

    const { contato_id, contrato_ids, comprovante_base64, observacao } = await request.json()
    if (!contato_id || !Array.isArray(contrato_ids) || contrato_ids.length === 0) {
      return NextResponse.json({ error: 'Informe o parceiro e os contratos.' }, { status: 400 })
    }

    // Revalida os valores no banco — nunca confiar no total que veio da tela.
    const { data: contratos } = await admin
      .from('contratos')
      .select('id, codigo, comissao_valor, comissao_paga, contato_id, unidade_id')
      .in('id', contrato_ids)

    const validos = (contratos ?? []).filter(
      c => c.contato_id === contato_id && !c.comissao_paga && Number(c.comissao_valor ?? 0) > 0
    )
    if (validos.length === 0) {
      return NextResponse.json({ error: 'Nada a pagar (já foi pago?).' }, { status: 409 })
    }

    const total = validos.reduce((s, c) => s + Number(c.comissao_valor), 0)
    const unidadeId = validos[0].unidade_id

    const { data: parceiro } = await admin
      .from('contatos').select('pix_chave').eq('id', contato_id).single()

    // Comprovante colado (Ctrl+V) chega como data URL — vai pro bucket PRIVADO.
    let comprovanteUrl: string | null = null
    if (comprovante_base64) {
      const m = /^data:(image\/\w+);base64,(.+)$/.exec(comprovante_base64)
      if (m) {
        const ext = m[1].split('/')[1]
        const caminho = `comprovantes/${contato_id}/${Date.now()}.${ext}`
        const { error: upErr } = await admin.storage
          .from('parceiros')
          .upload(caminho, Buffer.from(m[2], 'base64'), { contentType: m[1], upsert: false })
        if (!upErr) comprovanteUrl = caminho
      }
    }

    const { data: pagamento, error: pagErr } = await admin
      .from('parceiro_pagamentos')
      .insert({
        contato_id,
        unidade_id: unidadeId,
        valor_total: total,
        pix_chave_usada: parceiro?.pix_chave ?? null,
        comprovante_url: comprovanteUrl,
        observacao: observacao || null,
        criado_por: caller.id,
      })
      .select('id')
      .single()

    if (pagErr) return NextResponse.json({ error: pagErr.message }, { status: 500 })

    await admin.from('parceiro_pagamento_itens').insert(
      validos.map(c => ({
        pagamento_id: pagamento.id,
        contrato_id: c.id,
        contrato_codigo: c.codigo,
        valor: Number(c.comissao_valor),
      }))
    )

    await admin
      .from('contratos')
      .update({ comissao_paga: true })
      .in('id', validos.map(c => c.id))

    return NextResponse.json({ ok: true, total, quantidade: validos.length })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
