// API de tratamento de erros: mover ficha de unidade (ex: preenchida pela unidade errada).
// - GET ?q=termo                  -> busca fichas por nome do pet/tutor ou codigo do op_dados (max 30)
// - GET ?ficha_id=uuid&_analise=1 -> analise: ficha + unidade atual + lista de unidades destino
// - POST { ficha_id, unidade_destino_id } -> move: unidade_id, unidade(text), op_dados.codigo (prefixo),
//                                            op_dados.funcionarioId (match por nome na unidade destino)
//
// SÓ move fichas que AINDA NÃO viraram contrato (contrato_id null). Ficha que já gerou contrato
// exigiria transferir contrato/estoque — fora do escopo desta tratativa.
// Auth: super_admin only.
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

type Unidade = { id: string; codigo: string; nome: string; estado: string | null }

// Texto snapshot da unidade na ficha (padrão observado: "Resende - RJ")
function unidadeLabel(u: Unidade): string {
  return u.estado ? `${u.nome} - ${u.estado}` : u.nome
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
        .select('id, nome_completo, nome_pet, cremacao, created_at, processada, contrato_id, op_dados, unidade_id, unidade')
        .eq('id', fichaId)
        .single()
      if (fErr || !ficha) return NextResponse.json({ error: 'Ficha não encontrada' }, { status: 404 })

      const { data: unidades } = await supabaseAdmin
        .from('unidades')
        .select('id, codigo, nome, estado')
        .eq('ativa', true)
        .order('ordem')

      const op = (ficha.op_dados ?? {}) as Record<string, unknown>
      return NextResponse.json({
        ficha: {
          id: ficha.id,
          nome_pet: ficha.nome_pet,
          nome_completo: ficha.nome_completo,
          cremacao: ficha.cremacao,
          processada: ficha.processada,
          contrato_id: ficha.contrato_id,
          unidade_id: ficha.unidade_id,
          unidade_texto: ficha.unidade,
          codigo: op.codigo ?? null,
        },
        unidades: unidades ?? [],
      })
    }

    // ----- modo 2: busca -----
    const q = (url.searchParams.get('q') || '').trim()
    if (!q || q.length < 2) return NextResponse.json({ fichas: [] })
    const termo = q.replace(/[%,()]/g, '')
    if (!termo) return NextResponse.json({ fichas: [] })

    // Casa por nome do pet/tutor OU pelo codigo salvo no op_dados
    const { data: fichas, error: bErr } = await supabaseAdmin
      .from('fichas')
      .select('id, nome_pet, nome_completo, cremacao, contrato_id, unidade_id, unidade, op_dados, created_at')
      .or(`nome_completo.ilike.%${termo}%,nome_pet.ilike.%${termo}%,op_dados->>codigo.ilike.%${termo}%`)
      .order('created_at', { ascending: false })
      .limit(30)
    if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })

    const out = (fichas ?? []).map(f => {
      const op = (f.op_dados ?? {}) as Record<string, unknown>
      return {
        id: f.id,
        nome_pet: f.nome_pet,
        nome_completo: f.nome_completo,
        cremacao: f.cremacao,
        contrato_id: f.contrato_id,
        unidade_texto: f.unidade,
        codigo: op.codigo ?? null,
      }
    })
    return NextResponse.json({ fichas: out })
  } catch (err) {
    console.error('Erro mover-ficha GET:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// ---------- POST: executar a movimentação ----------
export async function POST(request: NextRequest) {
  try {
    const caller = await verifySuperAdmin(request)
    if (!caller) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

    const { ficha_id, unidade_destino_id } = await request.json() as { ficha_id?: string; unidade_destino_id?: string }
    if (!ficha_id || !unidade_destino_id) {
      return NextResponse.json({ error: 'ficha_id e unidade_destino_id são obrigatórios' }, { status: 400 })
    }

    const { data: ficha, error: fErr } = await supabaseAdmin
      .from('fichas')
      .select('id, nome_pet, unidade_id, op_dados, contrato_id')
      .eq('id', ficha_id)
      .single()
    if (fErr || !ficha) return NextResponse.json({ error: 'Ficha não encontrada' }, { status: 404 })

    // Trava de segurança: não mover ficha que já virou contrato
    if (ficha.contrato_id) {
      return NextResponse.json({
        error: 'Esta ficha já gerou um contrato. Mover exigiria transferir contrato/estoque — não é suportado por aqui.',
      }, { status: 409 })
    }
    if (ficha.unidade_id === unidade_destino_id) {
      return NextResponse.json({ error: 'A ficha já está nessa unidade.' }, { status: 400 })
    }

    // Unidades origem + destino
    const { data: unidades } = await supabaseAdmin
      .from('unidades')
      .select('id, codigo, nome, estado')
      .in('id', [ficha.unidade_id, unidade_destino_id])
    const origem = (unidades ?? []).find(u => u.id === ficha.unidade_id) as Unidade | undefined
    const destino = (unidades ?? []).find(u => u.id === unidade_destino_id) as Unidade | undefined
    if (!destino) return NextResponse.json({ error: 'Unidade destino inválida' }, { status: 400 })

    const op = { ...((ficha.op_dados ?? {}) as Record<string, unknown>) }

    // 1) Código: troca o prefixo da unidade origem pelo da unidade destino
    let codigoAntes: string | null = null
    let codigoDepois: string | null = null
    if (typeof op.codigo === 'string' && op.codigo) {
      codigoAntes = op.codigo
      if (origem && op.codigo.startsWith(origem.codigo)) {
        codigoDepois = destino.codigo + op.codigo.slice(origem.codigo.length)
      } else {
        codigoDepois = op.codigo // prefixo não reconhecido: preserva
      }
      op.codigo = codigoDepois
    }

    // 2) Funcionário responsável: procura o mesmo nome na unidade destino
    let funcAviso: string | null = null
    if (typeof op.funcionarioId === 'string' && op.funcionarioId) {
      const { data: funcAtual } = await supabaseAdmin
        .from('funcionarios').select('nome').eq('id', op.funcionarioId).single()
      if (funcAtual?.nome) {
        const { data: match } = await supabaseAdmin
          .from('funcionarios')
          .select('id')
          .eq('unidade_id', unidade_destino_id)
          .eq('ativo', true)
          .ilike('nome', funcAtual.nome)
          .limit(1)
        if (match && match.length > 0) {
          op.funcionarioId = match[0].id
        } else {
          op.funcionarioId = null
          funcAviso = `"${funcAtual.nome}" não tem cadastro em ${destino.codigo} — responsável foi limpo (defina ao iniciar o fluxo).`
        }
      }
    }

    // 3) Aplica
    const { error: updErr } = await supabaseAdmin
      .from('fichas')
      .update({
        unidade_id: unidade_destino_id,
        unidade: unidadeLabel(destino),
        op_dados: op,
      })
      .eq('id', ficha_id)
    if (updErr) return NextResponse.json({ error: 'Falha ao mover: ' + updErr.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      destino: `${destino.nome} (${destino.codigo})`,
      codigoAntes,
      codigoDepois,
      funcAviso,
    })
  } catch (err) {
    console.error('Erro mover-ficha POST:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
