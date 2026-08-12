// Fila de reivindicações "essa indicação foi minha" (decisão #15).
//   GET  ?unidade_id=uuid            -> pendentes + contratos candidatos (sem indicador)
//   POST { id, acao: 'aprovar'|'recusar', contrato_id? }
//
// Aprovar vincula `contratos.contato_id` ao parceiro e dispara o cálculo da comissão
// pela mesma rota da tratativa (/api/parceiros/indicacao), então a regra de comissão
// vive num lugar só.
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

export async function GET(request: NextRequest) {
  try {
    if (!await verifySuperAdmin(request)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }
    const unidadeId = request.nextUrl.searchParams.get('unidade_id')
    if (!unidadeId) return NextResponse.json({ error: 'unidade_id obrigatório' }, { status: 400 })

    const { data: pendentes } = await admin
      .from('parceiro_reivindicacoes')
      .select('id, descricao, status, created_at, contato_id, contatos ( nome, whatsapp )')
      .eq('unidade_id', unidadeId)
      .eq('status', 'pendente')
      .order('created_at', { ascending: true })

    // Candidatos: contratos recentes da unidade ainda SEM indicador registrado.
    const desde = new Date()
    desde.setDate(desde.getDate() - 90)
    const { data: candidatos } = await admin
      .from('contratos')
      .select('id, codigo, pet_nome, tutor_nome, data_contrato, tipo_cremacao')
      .eq('unidade_id', unidadeId)
      .is('contato_id', null)
      .gte('data_contrato', desde.toISOString().slice(0, 10))
      .order('data_contrato', { ascending: false })
      .limit(200)

    return NextResponse.json({ pendentes: pendentes ?? [], candidatos: candidatos ?? [] })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const caller = await verifySuperAdmin(request)
    if (!caller) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

    const { id, acao, contrato_id } = await request.json()
    if (!id || !['aprovar', 'recusar'].includes(acao)) {
      return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    const { data: reiv } = await admin
      .from('parceiro_reivindicacoes')
      .select('id, contato_id, status')
      .eq('id', id)
      .maybeSingle()

    if (!reiv) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 })
    if (reiv.status !== 'pendente') {
      return NextResponse.json({ error: 'Já resolvida' }, { status: 409 })
    }

    if (acao === 'recusar') {
      await admin.from('parceiro_reivindicacoes').update({
        status: 'recusada', resolvido_por: caller.id, resolvido_em: new Date().toISOString(),
      }).eq('id', id)
      return NextResponse.json({ ok: true })
    }

    if (!contrato_id) {
      return NextResponse.json({ error: 'Escolha o contrato para vincular.' }, { status: 400 })
    }

    // Não sobrescreve indicador já existente — se alguém vinculou no meio tempo,
    // o admin precisa saber em vez de a reivindicação roubar a indicação.
    const { data: contrato } = await admin
      .from('contratos').select('id, contato_id').eq('id', contrato_id).maybeSingle()
    if (!contrato) return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 })
    if (contrato.contato_id) {
      return NextResponse.json(
        { error: 'Este contrato já tem um indicador vinculado.' }, { status: 409 }
      )
    }

    await admin.from('contratos').update({ contato_id: reiv.contato_id }).eq('id', contrato_id)
    await admin.from('parceiro_reivindicacoes').update({
      status: 'aprovada', contrato_id, resolvido_por: caller.id,
      resolvido_em: new Date().toISOString(),
    }).eq('id', id)

    // Comissão e bilhete: mesma rota usada pela tratativa (regra num lugar só).
    const origem = request.nextUrl.origin
    await fetch(`${origem}/api/parceiros/indicacao`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: request.headers.get('authorization')!,
      },
      body: JSON.stringify({ contrato_id }),
    }).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
