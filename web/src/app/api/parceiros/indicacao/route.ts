// Fecha o ciclo do Portal de Parceiros quando um contrato nasce de uma indicação.
//
// POST { contrato_id } →
//   1. calcula a COMISSÃO pela categoria vigente do parceiro (ano móvel) × tipo de cremação
//   2. grava em contratos.comissao_valor
//   3. emite 1 BILHETE de sorteio do mês
//
// Fica aqui, e não dentro do TratativaModal, de propósito: o modal é o arquivo mais
// usado do CRM e não deve crescer com regra de comissão. Aqui a lógica é server-side,
// idempotente e falha sem derrubar a criação do contrato.
//
// Auth: qualquer usuário do CRM autenticado (quem processa ficha é o concierge).
import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Faixas = { bronze_max: number; prata_max: number }
type Comissao = Record<'bronze' | 'prata' | 'ouro', { ind: number; col: number }>

function categoriaPara(qtd: number, f: Faixas): 'bronze' | 'prata' | 'ouro' {
  if (qtd <= f.bronze_max) return 'bronze'
  if (qtd <= f.prata_max) return 'prata'
  return 'ouro'
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const { data: { user } } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { contrato_id } = await request.json()
    if (!contrato_id) return NextResponse.json({ error: 'contrato_id obrigatório' }, { status: 400 })

    const { data: contrato } = await admin
      .from('contratos')
      .select('id, codigo, contato_id, unidade_id, tipo_cremacao, comissao_valor, data_contrato')
      .eq('id', contrato_id)
      .maybeSingle()

    if (!contrato) return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 })
    if (!contrato.contato_id) return NextResponse.json({ pulado: 'sem_indicador' })

    // Só entra no automático quem participa do programa. Indicação de contato antigo
    // (sem portal) segue com a comissão preenchida à mão, como sempre foi.
    const { data: parceiro } = await admin
      .from('contatos')
      .select('id, portal_ativo, unidade_id')
      .eq('id', contrato.contato_id)
      .maybeSingle()

    if (!parceiro?.portal_ativo) return NextResponse.json({ pulado: 'indicador_fora_do_programa' })

    // Idempotência: se já tem comissão gravada, não recalcula (o operador pode ter
    // ajustado à mão, e reprocessar sobrescreveria a decisão dele).
    if (contrato.comissao_valor != null && Number(contrato.comissao_valor) > 0) {
      return NextResponse.json({ pulado: 'comissao_ja_definida' })
    }

    const unidadeId = parceiro.unidade_id ?? contrato.unidade_id
    const { data: config } = await admin
      .from('parceiro_config')
      .select('comissao, faixas, sorteio_ativo, bilhete_por_indicacao')
      .eq('unidade_id', unidadeId)
      .maybeSingle()

    if (!config) return NextResponse.json({ pulado: 'sem_config' })

    // Categoria pelo ano móvel: conta os contratos indicados nos últimos 365 dias,
    // sem contar o atual (a indicação de hoje não pode subir o preço dela mesma).
    const desde = new Date()
    desde.setFullYear(desde.getFullYear() - 1)
    const { count } = await admin
      .from('contratos')
      .select('id', { count: 'exact', head: true })
      .eq('contato_id', parceiro.id)
      .gte('data_contrato', desde.toISOString().slice(0, 10))
      .neq('id', contrato.id)

    const categoria = categoriaPara(count ?? 0, config.faixas as Faixas)
    const tabela = config.comissao as Comissao
    const valor = tabela[categoria][contrato.tipo_cremacao === 'individual' ? 'ind' : 'col']

    await admin
      .from('contratos')
      .update({ comissao_valor: valor, comissao_paga: false })
      .eq('id', contrato.id)

    // Bilhete do mês. O índice único parcial em contrato_id impede duplicata se esta
    // rota for chamada duas vezes pro mesmo contrato.
    let bilhete: string | null = null
    if (config.sorteio_ativo && config.bilhete_por_indicacao) {
      const ref = contrato.data_contrato ? new Date(contrato.data_contrato) : new Date()
      const mesRef = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-01`
      const { data: unidade } = await admin
        .from('unidades').select('codigo').eq('id', unidadeId).single()
      const codigo = `${unidade?.codigo ?? 'XX'}-${mesRef.slice(2, 4)}${mesRef.slice(5, 7)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`

      const { error } = await admin.from('parceiro_bilhetes').insert({
        contato_id: parceiro.id,
        unidade_id: unidadeId,
        mes_ref: mesRef,
        origem: 'indicacao',
        contrato_id: contrato.id,
        contrato_codigo: contrato.codigo,
        codigo,
      })
      if (!error) bilhete = codigo
    }

    return NextResponse.json({ ok: true, categoria, comissao: valor, bilhete })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
