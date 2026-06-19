// API de tratamento de erros: desfazer ficha processada.
// - GET ?q=termo                     -> busca fichas processadas (max 30) que casam por nome/pet/codigo do contrato
// - GET ?ficha_id=uuid&_analise=1    -> retorna analise completa (ficha + contrato + pagtos/produtos/nfse/supinda + tutor + outros contratos do tutor)
// - POST { ficha_id, deletar_tutor }-> executa: ficha volta pra Recebidas (preserva op_dados), deleta contrato, opcionalmente deleta tutor (se sem outros contratos)
//
// Auth: super_admin only (mesmo padrao de /api/admin/reset-password).
import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

// ---------- GET ----------
export async function GET(request: NextRequest) {
  try {
    const caller = await verifySuperAdmin(request)
    if (!caller) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

    const url = new URL(request.url)
    const fichaId = url.searchParams.get('ficha_id')
    const analise = url.searchParams.get('_analise')

    // ----- modo 1: analise -----
    if (fichaId && analise) {
      const { data: ficha, error: fErr } = await supabaseAdmin
        .from('fichas')
        .select('id, nome_completo, nome_pet, cpf, telefone, created_at, processada, processada_em, processada_por, contrato_id, op_dados, unidade_id')
        .eq('id', fichaId)
        .single()
      if (fErr || !ficha) return NextResponse.json({ error: 'Ficha não encontrada' }, { status: 404 })

      let contrato: Record<string, unknown> | null = null
      let pagamentos: unknown[] = []
      let produtos: unknown[] = []
      let tutor: Record<string, unknown> | null = null
      let outrosContratosDoTutor: unknown[] = []

      if (ficha.contrato_id) {
        const { data: c } = await supabaseAdmin
          .from('contratos')
          .select('id, codigo, status, tipo_cremacao, tipo_plano, pet_nome, tutor_id, tutor_nome, tutor_cpf, nfse_numero, nfse_status, supinda_id, created_at')
          .eq('id', ficha.contrato_id)
          .single()
        contrato = c
        if (c) {
          const [{ data: pgs }, { data: prods }] = await Promise.all([
            supabaseAdmin.from('pagamentos').select('id, tipo, valor, metodo').eq('contrato_id', c.id),
            supabaseAdmin.from('contrato_produtos').select('id, produto_id, valor').eq('contrato_id', c.id),
          ])
          pagamentos = pgs || []
          produtos = prods || []

          if (c.tutor_id) {
            const { data: t } = await supabaseAdmin
              .from('tutores')
              .select('id, nome, cpf, telefone, created_at, unidade_id')
              .eq('id', c.tutor_id)
              .single()
            tutor = t
            if (t) {
              const { data: outros } = await supabaseAdmin
                .from('contratos')
                .select('id, codigo, status, pet_nome, created_at')
                .eq('tutor_id', t.id)
                .neq('id', c.id)
              outrosContratosDoTutor = outros || []
            }
          }
        }
      }

      return NextResponse.json({ ficha, contrato, pagamentos, produtos, tutor, outrosContratosDoTutor })
    }

    // ----- modo 2: busca -----
    const q = (url.searchParams.get('q') || '').trim()
    if (!q || q.length < 2) return NextResponse.json({ fichas: [] })
    // Sanitiza pra evitar injection no filtro PostgREST (% e , são significativos)
    const termo = q.replace(/[%,()]/g, '')
    if (!termo) return NextResponse.json({ fichas: [] })

    const { data: fichas, error: bErr } = await supabaseAdmin
      .from('fichas')
      .select('id, nome_completo, nome_pet, telefone, processada_em, contrato_id, op_dados')
      .eq('processada', true)
      .or(`nome_completo.ilike.%${termo}%,nome_pet.ilike.%${termo}%`)
      .order('processada_em', { ascending: false })
      .limit(30)
    if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })

    // Casa também por código do contrato (busca em separado e merge)
    const { data: contratosPorCodigo } = await supabaseAdmin
      .from('contratos')
      .select('id, codigo')
      .ilike('codigo', `%${termo}%`)
      .limit(30)
    let fichasPorContrato: typeof fichas = []
    if (contratosPorCodigo && contratosPorCodigo.length > 0) {
      const ids = contratosPorCodigo.map(c => c.id)
      const { data: fc } = await supabaseAdmin
        .from('fichas')
        .select('id, nome_completo, nome_pet, telefone, processada_em, contrato_id, op_dados')
        .eq('processada', true)
        .in('contrato_id', ids)
      fichasPorContrato = fc || []
    }

    // Dedup por id
    const map = new Map<string, (typeof fichas)[number]>()
    for (const f of (fichas || [])) map.set(f.id, f)
    for (const f of fichasPorContrato) map.set(f.id, f)
    return NextResponse.json({ fichas: Array.from(map.values()).slice(0, 30) })
  } catch (err) {
    console.error('Erro tratamento-erros GET:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// ---------- POST: executar desfazer ----------
export async function POST(request: NextRequest) {
  try {
    const caller = await verifySuperAdmin(request)
    if (!caller) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

    const { ficha_id, deletar_tutor } = await request.json() as { ficha_id?: string; deletar_tutor?: boolean }
    if (!ficha_id) return NextResponse.json({ error: 'ficha_id é obrigatório' }, { status: 400 })

    const { data: ficha, error: fErr } = await supabaseAdmin
      .from('fichas')
      .select('id, processada, contrato_id, op_dados')
      .eq('id', ficha_id)
      .single()
    if (fErr || !ficha) return NextResponse.json({ error: 'Ficha não encontrada' }, { status: 404 })

    const contratoId = ficha.contrato_id as string | null
    let tutorId: string | null = null

    if (contratoId) {
      const { data: c } = await supabaseAdmin
        .from('contratos')
        .select('id, tutor_id')
        .eq('id', contratoId)
        .single()
      tutorId = (c?.tutor_id as string) || null
    }

    // 1) Volta ficha pra Recebidas — PRESERVA op_dados intacto (proposito explicito)
    const { error: updErr } = await supabaseAdmin
      .from('fichas')
      .update({
        processada: false,
        processada_em: null,
        processada_por: null,
        contrato_id: null,
      })
      .eq('id', ficha_id)
    if (updErr) return NextResponse.json({ error: 'Falha ao atualizar ficha: ' + updErr.message }, { status: 500 })

    // 2) Deleta contrato (se existir)
    let contratoDeletado = false
    if (contratoId) {
      const { error: delErr } = await supabaseAdmin.from('contratos').delete().eq('id', contratoId)
      if (delErr) {
        return NextResponse.json({
          error: 'Ficha voltou pra Recebidas, mas falhou ao deletar contrato: ' + delErr.message,
          partial: true,
        }, { status: 500 })
      }
      contratoDeletado = true
    }

    // 3) Deleta tutor (se solicitado e sem outros contratos)
    let tutorDeletado = false
    let tutorNaoDeletadoMotivo: string | null = null
    if (deletar_tutor && tutorId) {
      const { count: nOutros } = await supabaseAdmin
        .from('contratos')
        .select('id', { count: 'exact', head: true })
        .eq('tutor_id', tutorId)
      if ((nOutros ?? 0) > 0) {
        tutorNaoDeletadoMotivo = 'Tutor ainda tem outros contratos vinculados'
      } else {
        const { error: dtErr } = await supabaseAdmin.from('tutores').delete().eq('id', tutorId)
        if (dtErr) tutorNaoDeletadoMotivo = 'Falha ao deletar tutor: ' + dtErr.message
        else tutorDeletado = true
      }
    }

    return NextResponse.json({ ok: true, contratoDeletado, tutorDeletado, tutorNaoDeletadoMotivo })
  } catch (err) {
    console.error('Erro tratamento-erros POST:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
