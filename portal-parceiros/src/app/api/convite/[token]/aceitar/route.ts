import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validarConvite, MENSAGEM_FALHA } from '@/lib/convite'
import { CARGOS } from '@/lib/tipos'

/**
 * Conclui o cadastro: liga a conta autenticada a um registro de `contatos` e queima
 * o convite.
 *
 * Exige sessão (o `user_id` sai do JWT, nunca do corpo). Isso é o que impede alguém
 * de pegar um token que circulou por WhatsApp e vincular a conta de outra pessoa.
 */

const VERSAO_TERMOS = '1.0'

type Corpo = {
  cargo?: string
  cargoOutro?: string
  crmv?: string
  telefone?: string
  whatsapp?: string
  pixChave?: string
  instagram?: string
  clinica?: string
  aceiteTermos?: boolean
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ erro: 'Entre na sua conta para concluir o cadastro.' }, { status: 401 })
  }

  const r = await validarConvite(token)
  if (!r.ok) return Response.json({ erro: MENSAGEM_FALHA[r.motivo] }, { status: 410 })
  const convite = r.convite

  let body: Corpo
  try {
    body = await req.json()
  } catch {
    return Response.json({ erro: 'Requisição inválida.' }, { status: 400 })
  }

  const cargo = body.cargo
  if (!cargo || !CARGOS.some((c) => c.valor === cargo)) {
    return Response.json({ erro: 'Escolha seu cargo.' }, { status: 400 })
  }
  if (cargo === 'outro' && !body.cargoOutro?.trim()) {
    return Response.json({ erro: 'Descreva seu cargo.' }, { status: 400 })
  }
  if (!body.whatsapp?.trim()) {
    return Response.json({ erro: 'Informe seu WhatsApp.' }, { status: 400 })
  }
  if (!body.pixChave?.trim()) {
    return Response.json({ erro: 'Informe sua chave pix — é por onde a comissão é paga.' }, { status: 400 })
  }
  if (!body.aceiteTermos) {
    return Response.json({ erro: 'É preciso aceitar os termos para participar.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Uma conta = um parceiro. Se este login já está vinculado, não duplica.
  const { data: jaVinculado } = await admin
    .from('contatos')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (jaVinculado) {
    return Response.json(
      { erro: 'Esta conta já está vinculada a um cadastro de parceiro.' },
      { status: 409 }
    )
  }

  const dados = {
    nome: convite.nomeIndicado,
    cargo,
    cargo_outro: cargo === 'outro' ? body.cargoOutro!.trim() : null,
    crmv: cargo === 'veterinario' ? (body.crmv?.trim() || null) : null,
    telefone: body.telefone?.trim() || null,
    whatsapp: body.whatsapp.trim(),
    email: user.email ?? null,
    pix_chave: body.pixChave.trim(),
    instagram: body.instagram?.trim().replace(/^@/, '') || null,
    unidade_id: convite.unidadeId,
    estabelecimento_id: convite.estabelecimentoId,
    user_id: user.id,
    portal_ativo: true,
    portal_cadastrado_em: new Date().toISOString(),
    termos_aceitos_em: new Date().toISOString(),
    termos_versao: VERSAO_TERMOS,
    convidado_por_contato_id: convite.padrinhoContatoId,
    ativo: true,
  }

  // Se o admin apontou um contato que já existe no CRM, COMPLEMENTA o registro
  // (decisão #3) — não cria um duplicado e não perde o histórico comercial dele.
  let contatoId: string
  if (convite.contatoPrevinculadoId) {
    const { data, error } = await admin
      .from('contatos')
      .update(dados)
      .eq('id', convite.contatoPrevinculadoId)
      .select('id')
      .single()
    if (error) return Response.json({ erro: 'Falha ao concluir o cadastro.' }, { status: 500 })
    contatoId = data.id
  } else {
    const { data, error } = await admin
      .from('contatos')
      .insert(dados)
      .select('id')
      .single()
    if (error) return Response.json({ erro: 'Falha ao concluir o cadastro.' }, { status: 500 })
    contatoId = data.id
  }

  // Queima o convite. O CHECK da migration 100 exige os dois campos juntos.
  await admin
    .from('parceiro_convites')
    .update({ usado_em: new Date().toISOString(), contato_id_resultante: contatoId })
    .eq('id', convite.id)

  // Member-get-member: o padrinho ganha 1 bilhete quando o colega SE CADASTRA
  // (decisão #19) — não quando o convite é gerado, senão bastaria gerar convites.
  if (convite.tipo === 'mgm' && convite.padrinhoContatoId) {
    const { data: config } = await admin
      .from('parceiro_config')
      .select('bilhete_por_mgm, sorteio_ativo')
      .eq('unidade_id', convite.unidadeId)
      .maybeSingle()

    if (config?.sorteio_ativo && config?.bilhete_por_mgm) {
      const agora = new Date()
      const mesRef = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`
      const { data: unidade } = await admin
        .from('unidades').select('codigo').eq('id', convite.unidadeId).single()

      const sufixo = Math.random().toString(36).slice(2, 5).toUpperCase()
      const codigo = `${unidade?.codigo ?? 'XX'}-${mesRef.slice(2, 4)}${mesRef.slice(5, 7)}-${sufixo}`

      // Índice único parcial em convite_id impede bilhete repetido — se colidir, ignora.
      await admin.from('parceiro_bilhetes').insert({
        contato_id: convite.padrinhoContatoId,
        unidade_id: convite.unidadeId,
        mes_ref: mesRef,
        origem: 'mgm',
        convite_id: convite.id,
        codigo,
      })
    }
  }

  return Response.json({ ok: true })
}
