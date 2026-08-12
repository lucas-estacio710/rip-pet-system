// Convites do Portal de Parceiros (admin).
//   GET  ?unidade_id=uuid          -> cidades de cobertura + convites recentes da unidade
//   POST { unidade_id, nome_indicado, cidade_atuacao, estabelecimento_id?, contato_id_previnculado? }
//        -> gera convite de USO ÚNICO e devolve { url, qrDataUrl }
//
// Regra de cobertura (decisão #2): a cidade tem que estar em parceiro_config.cidades_cobertura
// da unidade. Sem cidade cadastrada no Orquestrador, não sai convite — é assim que o programa
// não vaza pra região que a unidade não atende.
//
// Auth: super_admin only (mesmo padrão de /api/admin/tratamento-erros).
import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import QRCode from 'qrcode'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Dias de validade do convite presencial. Curto de propósito: o convite nasce numa visita. */
const VALIDADE_DIAS = 30

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

function urlDoPortal(token: string) {
  const base = process.env.NEXT_PUBLIC_PORTAL_PARCEIROS_URL || 'https://parceiro.rippet.com.br'
  return `${base.replace(/\/$/, '')}/convite/${token}`
}

// ---------- GET ----------
export async function GET(request: NextRequest) {
  try {
    const caller = await verifySuperAdmin(request)
    if (!caller) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

    const unidadeId = request.nextUrl.searchParams.get('unidade_id')
    if (!unidadeId) return NextResponse.json({ error: 'unidade_id obrigatório' }, { status: 400 })

    const { data: config } = await supabaseAdmin
      .from('parceiro_config')
      .select('cidades_cobertura')
      .eq('unidade_id', unidadeId)
      .maybeSingle()

    const { data: convites, error } = await supabaseAdmin
      .from('parceiro_convites')
      .select(`
        id, token, tipo, nome_indicado, cidade_atuacao, usado_em, expira_em, created_at,
        contato_resultante:contatos!parceiro_convites_contato_id_resultante_fkey ( id, nome ),
        padrinho:contatos!parceiro_convites_criado_por_contato_id_fkey ( id, nome )
      `)
      .eq('unidade_id', unidadeId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const agora = Date.now()
    return NextResponse.json({
      cidades: config?.cidades_cobertura ?? [],
      convites: (convites ?? []).map((c) => ({
        ...c,
        url: urlDoPortal(c.token),
        situacao: c.usado_em
          ? 'usado'
          : new Date(c.expira_em).getTime() < agora
            ? 'expirado'
            : 'aguardando',
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// ---------- POST ----------
export async function POST(request: NextRequest) {
  try {
    const caller = await verifySuperAdmin(request)
    if (!caller) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

    const body = await request.json()
    const {
      unidade_id,
      nome_indicado,
      cidade_atuacao,
      estabelecimento_id = null,
      contato_id_previnculado = null,
    } = body ?? {}

    if (!unidade_id || !nome_indicado?.trim() || !cidade_atuacao?.trim()) {
      return NextResponse.json(
        { error: 'Informe a unidade, o nome do novo membro e a região de atuação.' },
        { status: 400 }
      )
    }

    // A cidade precisa estar na cobertura da unidade — a trava mora aqui, no servidor,
    // não no <select> do front (que é só conveniência).
    const { data: config } = await supabaseAdmin
      .from('parceiro_config')
      .select('cidades_cobertura')
      .eq('unidade_id', unidade_id)
      .maybeSingle()

    const cidades: string[] = config?.cidades_cobertura ?? []
    if (cidades.length === 0) {
      return NextResponse.json(
        { error: 'Esta unidade ainda não tem cidades de cobertura cadastradas no Orquestrador.' },
        { status: 400 }
      )
    }
    if (!cidades.includes(cidade_atuacao)) {
      return NextResponse.json(
        { error: `"${cidade_atuacao}" não está na área de cobertura desta unidade.` },
        { status: 400 }
      )
    }

    const token = randomBytes(32).toString('base64url') // 256 bits
    const expira = new Date()
    expira.setDate(expira.getDate() + VALIDADE_DIAS)

    const { data: convite, error } = await supabaseAdmin
      .from('parceiro_convites')
      .insert({
        unidade_id,
        token,
        tipo: 'admin',
        nome_indicado: nome_indicado.trim(),
        cidade_atuacao,
        estabelecimento_id,
        contato_id_previnculado,
        criado_por_user_id: caller.id,
        expira_em: expira.toISOString(),
      })
      .select('id, token, nome_indicado, cidade_atuacao, expira_em')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const url = urlDoPortal(convite.token)
    // QR gerado aqui dentro de propósito: mandar o token pra uma API de QR de terceiro
    // seria entregar o convite a quem não deveria vê-lo.
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 720,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#1a1614', light: '#ffffff' },
    })

    return NextResponse.json({ convite, url, qrDataUrl })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
