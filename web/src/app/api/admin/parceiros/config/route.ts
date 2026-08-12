// Orquestrador: TODAS as variáveis do programa, por unidade (decisão #34).
//   GET  ?unidade_id=uuid  -> config + módulo ligado/desligado + produtos p/ cortesia
//   PUT  { unidade_id, ...campos }  -> salva (audita em historico_alteracoes)
//   POST { unidade_id, ativo }      -> liga/desliga cb_portal_parceiros na unidade
//
// O app do parceiro não tem NENHUM valor de negócio hardcoded: tudo é lido daqui.
// Auth: super_admin only.
import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MODULO = 'cb_portal_parceiros'

const CAMPOS_EDITAVEIS = [
  'comissao', 'faixas', 'desconto_percentual', 'beneficios_ativos', 'cortesia_produtos',
  'orcamento_validade_modo', 'orcamento_validade_horas', 'sorteio_ativo',
  'bilhete_por_indicacao', 'bilhete_por_mgm', 'mgm_ativo', 'remocao_ativa',
  'materiais_ativos', 'cidades_cobertura', 'max_parcelas',
] as const

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

    const { data: config } = await admin
      .from('parceiro_config').select('*').eq('unidade_id', unidadeId).maybeSingle()

    const { data: unidade } = await admin
      .from('unidades').select('modulos_ativos').eq('id', unidadeId).single()

    // Só urna/acessório fazem sentido como cortesia — "incluso" já vem no plano.
    const { data: produtos } = await admin
      .from('produtos')
      .select('id, nome, tipo, imagem_url')
      .in('tipo', ['urna', 'acessorio'])
      .order('nome')

    return NextResponse.json({
      config,
      moduloAtivo: unidade?.modulos_ativos?.includes(MODULO) ?? false,
      produtos: produtos ?? [],
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const caller = await verifySuperAdmin(request)
    if (!caller) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

    const body = await request.json()
    const { unidade_id } = body
    if (!unidade_id) return NextResponse.json({ error: 'unidade_id obrigatório' }, { status: 400 })

    const patch: Record<string, unknown> = {}
    for (const c of CAMPOS_EDITAVEIS) if (c in body) patch[c] = body[c]
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nada para salvar' }, { status: 400 })
    }

    const { data: antes } = await admin
      .from('parceiro_config').select('*').eq('unidade_id', unidade_id).maybeSingle()

    const { data, error } = await admin
      .from('parceiro_config')
      .upsert({ unidade_id, ...patch }, { onConflict: 'unidade_id' })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Auditoria: dinheiro e regra de programa mudando sem rastro é pedir problema.
    const logs = Object.keys(patch)
      .filter(k => JSON.stringify(antes?.[k]) !== JSON.stringify(patch[k]))
      .map(k => ({
        entidade: 'parceiro_config',
        entidade_id: unidade_id,
        campo: k,
        campo_label: `Orquestrador · ${k}`,
        valor_anterior: antes?.[k] == null ? null : JSON.stringify(antes[k]),
        valor_novo: JSON.stringify(patch[k]),
        alterado_por: caller.id,
        alterado_por_email: caller.email ?? null,
      }))
    if (logs.length > 0) await admin.from('historico_alteracoes').insert(logs).select('id')

    return NextResponse.json({ config: data })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// Liga/desliga o módulo — o kill switch do programa naquela unidade
export async function POST(request: NextRequest) {
  try {
    const caller = await verifySuperAdmin(request)
    if (!caller) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

    const { unidade_id, ativo } = await request.json()
    if (!unidade_id || typeof ativo !== 'boolean') {
      return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    const { data: u } = await admin
      .from('unidades').select('modulos_ativos').eq('id', unidade_id).single()

    const atuais: string[] = u?.modulos_ativos ?? []
    const novos = ativo
      ? (atuais.includes(MODULO) ? atuais : [...atuais, MODULO])
      : atuais.filter(m => m !== MODULO)

    const { error } = await admin
      .from('unidades').update({ modulos_ativos: novos }).eq('id', unidade_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await admin.from('historico_alteracoes').insert({
      entidade: 'unidades', entidade_id: unidade_id, campo: 'modulos_ativos.' + MODULO,
      campo_label: 'Portal de Parceiros (módulo)',
      valor_anterior: String(atuais.includes(MODULO)), valor_novo: String(ativo),
      alterado_por: caller.id, alterado_por_email: caller.email ?? null,
    }).select('id')

    return NextResponse.json({ ok: true, moduloAtivo: ativo })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
