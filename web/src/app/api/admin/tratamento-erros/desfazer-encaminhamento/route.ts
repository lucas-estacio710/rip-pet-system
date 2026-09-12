// API de tratamento de erros: DESFAZER ENCAMINHAMENTO (devolve a viagem inteira para Ativo).
//
// Existe porque o "Enviar para Matriz" é irreversível de propósito
// (docs/ENCAMINHAMENTO_NO_PIPELINE.md §4.3) — e o erro vai acontecer. Hoje não existe
// caminho de UI que traga um pet de `pinda` de volta para `ativo` (demanda 2026/90).
//
// - GET ?q=termo                        -> busca viagens já despachadas (número, pet ou tutor)
// - GET ?supinda_id=uuid&_analise=1     -> raio-x: pets, GC de cada um, e o que bloqueia
// - POST { supinda_id }                 -> executa: pets voltam a `ativo`, some `data_leva_pinda`,
//                                          a viagem volta a `planejada` e fica reeditável
//
// Auth: super_admin only (mesmo padrão de desfazer-ficha / mover-ficha).
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

type PetDaViagem = {
  id: string
  codigo: string | null
  pet_nome: string | null
  tutor_nome: string | null
  numero_lacre: string | null
  status: string | null
  data_leva_pinda: string | null
  contrato_gc: { etapa: string | null; contato_status: string | null; data_recebimento: string | null; data_cremacao: string | null } | null
}

/** As duas travas do §4.3, num lugar só — usadas pelo GET (pra mostrar) e pelo POST
 *  (pra recusar). Se divergissem, a tela diria "pode" e a API faria outra coisa. */
function calcularBloqueios(pets: PetDaViagem[]) {
  // 1) Pet que não está mais em `pinda` já seguiu o fluxo (voltou, foi entregue). Trazer
  //    de volta para `ativo` apagaria etapas posteriores.
  const foraDePinda = pets.filter(p => p.status !== 'pinda')
  // 2) Pet cujo GC já andou — em QUALQUER das duas trilhas. O §4.3 fala de "saiu de
  //    provisionado", mas o contato com o tutor é trabalho da Matriz do mesmo jeito: se
  //    ela já ligou, desfazer joga esse trabalho fora.
  const gcAndou = pets.filter(p => {
    const gc = p.contrato_gc
    if (!gc) return false
    return (gc.etapa && gc.etapa !== 'provisionado') || !!gc.contato_status
  })
  return {
    foraDePinda,
    gcAndou,
    podeDesfazer: foraDePinda.length === 0 && gcAndou.length === 0 && pets.length > 0,
  }
}

// ---------- GET ----------
export async function GET(request: NextRequest) {
  try {
    const caller = await verifySuperAdmin(request)
    if (!caller) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

    const url = new URL(request.url)
    const supindaId = url.searchParams.get('supinda_id')
    const analise = url.searchParams.get('_analise')

    // ----- modo 1: raio-x de uma viagem -----
    if (supindaId && analise) {
      const { data: sup, error: sErr } = await supabaseAdmin
        .from('supindas')
        .select('id, numero, data, responsavel, status, observacoes, quantidade_pets, peso_total, unidade_id')
        .eq('id', supindaId)
        .single()
      if (sErr || !sup) return NextResponse.json({ error: 'Encaminhamento não encontrado' }, { status: 404 })

      const { data: unidade } = await supabaseAdmin
        .from('unidades').select('codigo, nome').eq('id', sup.unidade_id).maybeSingle()

      const { data: petsData } = await supabaseAdmin
        .from('contratos')
        .select('id, codigo, pet_nome, tutor_nome, numero_lacre, status, data_leva_pinda, contrato_gc(etapa, contato_status, data_recebimento, data_cremacao)')
        .eq('supinda_id', supindaId)
        .order('pet_nome')
      const pets = (petsData || []) as unknown as PetDaViagem[]

      // Pets que usam esta viagem como VOLTA — não são tocados pelo desfazer (ele só
      // desfaz a ida), mas o super_admin precisa saber que existem.
      const { count: usamComoVolta } = await supabaseAdmin
        .from('contratos')
        .select('id', { count: 'exact', head: true })
        .eq('supinda_volta_id', supindaId)

      return NextResponse.json({
        supinda: sup,
        unidade: unidade || null,
        pets,
        usam_como_volta: usamComoVolta ?? 0,
        ...calcularBloqueios(pets),
      })
    }

    // ----- modo 2: busca -----
    const q = (url.searchParams.get('q') || '').trim()
    if (!q) return NextResponse.json({ encaminhamentos: [] })

    // Por número da viagem…
    const { data: porNumero } = await supabaseAdmin
      .from('supindas')
      .select('id, numero, data, responsavel, status, quantidade_pets, unidade_id')
      .ilike('numero', `%${q}%`)
      .neq('status', 'planejada')
      .order('data', { ascending: false })
      .limit(30)

    // …ou por pet/tutor de dentro dela (é assim que a reclamação chega: "o pet X").
    const { data: porPet } = await supabaseAdmin
      .from('contratos')
      .select('supinda_id')
      .not('supinda_id', 'is', null)
      .or(`pet_nome.ilike.%${q}%,tutor_nome.ilike.%${q}%,numero_lacre.ilike.%${q}%`)
      .limit(200)

    const idsDePet = [...new Set(((porPet || []) as { supinda_id: string }[]).map(r => r.supinda_id))]
    let extras: unknown[] = []
    if (idsDePet.length > 0) {
      const jaTem = new Set(((porNumero || []) as { id: string }[]).map(s => s.id))
      const faltam = idsDePet.filter(id => !jaTem.has(id)).slice(0, 30)
      if (faltam.length > 0) {
        const { data } = await supabaseAdmin
          .from('supindas')
          .select('id, numero, data, responsavel, status, quantidade_pets, unidade_id')
          .in('id', faltam)
          .neq('status', 'planejada')
          .order('data', { ascending: false })
        extras = data || []
      }
    }

    const todas = [...(porNumero || []), ...extras] as { unidade_id: string }[]
    // Resolve o código da unidade de cada viagem (a lista mistura unidades).
    const unidadeIds = [...new Set(todas.map(s => s.unidade_id).filter(Boolean))]
    const mapaUnidade = new Map<string, string>()
    if (unidadeIds.length > 0) {
      const { data: us } = await supabaseAdmin.from('unidades').select('id, codigo').in('id', unidadeIds)
      for (const u of (us || []) as { id: string; codigo: string }[]) mapaUnidade.set(u.id, u.codigo)
    }

    return NextResponse.json({
      encaminhamentos: todas.map(s => ({ ...s, codigo_unidade: mapaUnidade.get(s.unidade_id) || '??' })),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}

// ---------- POST ----------
export async function POST(request: NextRequest) {
  try {
    const caller = await verifySuperAdmin(request)
    if (!caller) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

    const { supinda_id } = await request.json()
    if (!supinda_id) return NextResponse.json({ error: 'supinda_id obrigatório' }, { status: 400 })

    const { data: sup, error: sErr } = await supabaseAdmin
      .from('supindas').select('id, numero, status').eq('id', supinda_id).single()
    if (sErr || !sup) return NextResponse.json({ error: 'Encaminhamento não encontrado' }, { status: 404 })
    if (sup.status === 'planejada') {
      return NextResponse.json({ error: `O ${sup.numero} já está planejado — não há ida para desfazer.` }, { status: 400 })
    }

    // 🔴 Relê os pets AQUI e revalida as travas. A análise que a tela mostrou pode ter
    // minutos de idade, e nesse meio-tempo a Matriz pode ter recebido um pet — desfazer
    // então apagaria trabalho dela.
    const { data: petsData } = await supabaseAdmin
      .from('contratos')
      .select('id, codigo, pet_nome, tutor_nome, numero_lacre, status, data_leva_pinda, contrato_gc(etapa, contato_status, data_recebimento, data_cremacao)')
      .eq('supinda_id', supinda_id)
    const pets = (petsData || []) as unknown as PetDaViagem[]
    const bloqueios = calcularBloqueios(pets)

    if (pets.length === 0) {
      return NextResponse.json({ error: `O ${sup.numero} não tem nenhum pet vinculado.` }, { status: 400 })
    }
    if (!bloqueios.podeDesfazer) {
      return NextResponse.json({
        error: 'A situação mudou desde a análise — o desfazer foi recusado.',
        ...bloqueios,
      }, { status: 409 })
    }

    // Ordem: primeiro os FILHOS, depois o PAI (mesma regra do envio). Se o UPDATE dos
    // contratos falhar, a viagem continua `ida_finalizada` e dá pra repetir — em vez de
    // virar `planejada` com os pets presos em `pinda`.
    const ids = pets.map(p => p.id)
    const { error: errPets } = await supabaseAdmin
      .from('contratos')
      .update({ status: 'ativo', data_leva_pinda: null })
      .in('id', ids)
    if (errPets) {
      return NextResponse.json({ error: `Erro ao devolver os pets para Ativo: ${errPets.message}. Nada foi alterado na viagem.` }, { status: 500 })
    }

    const { error: errSup } = await supabaseAdmin
      .from('supindas').update({ status: 'planejada' }).eq('id', supinda_id)
    if (errSup) {
      return NextResponse.json({
        error: `Os ${ids.length} pets voltaram para Ativo, mas a viagem não pôde ser reaberta: ${errSup.message}. Reabra manualmente antes de reenviar.`,
      }, { status: 500 })
    }

    // ⚠️ O `contrato_gc` criado pelo trigger da mig 091 NÃO é apagado — mesma decisão do
    // rollback do envio: o trigger é idempotente (`NOT EXISTS`), então o reenvio não
    // duplica, e a Matriz continua sem poder receber porque o "Confirmar Recebimento"
    // exige a viagem em `ida_finalizada` (GCAcaoModal.tsx:188) — e ela voltou a
    // `planejada`. Apagar seria mais arriscado que deixar.
    await supabaseAdmin.from('historico_alteracoes').insert({
      entidade: 'supindas',
      entidade_id: supinda_id,
      entidade_nome: sup.numero,
      campo: 'status',
      valor_anterior: sup.status,
      valor_novo: 'planejada',
      nota: `Desfazer encaminhamento (tratamento de erros): ${ids.length} pet(s) devolvidos de Pinda para Ativo.`,
      alterado_por_email: caller.email ?? null,
    })

    return NextResponse.json({ ok: true, numero: sup.numero, pets_devolvidos: ids.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}
