import { createAdminClient } from '@/lib/supabase/admin'

/**
 * O tutor aceita o orçamento → nasce a ficha de remoção (decisão #8).
 *
 * É aqui que o rastreio da indicação deixa de ser texto e vira FK (decisão #36):
 * a ficha grava `contato_id` (o parceiro) e `parceiro_orcamento_id`. A tratativa
 * lê isso e a comissão vai pra pessoa certa, sem depender de alguém digitar o nome.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: orc } = await admin
    .from('parceiro_orcamentos')
    .select('id, contato_id, unidade_id, pet_nome, pet_especie, pet_peso, tipo_cremacao, plano_nome, plano_preco_congelado, plano_itens, status, expira_em, ficha_id')
    .eq('token_publico', token)
    .maybeSingle()

  if (!orc) return Response.json({ erro: 'Orçamento não encontrado.' }, { status: 404 })
  if (orc.ficha_id || orc.status === 'convertido') {
    return Response.json({ erro: 'Este orçamento já foi usado.' }, { status: 410 })
  }
  if (orc.status === 'expirado' || new Date(orc.expira_em).getTime() < Date.now()) {
    return Response.json({ erro: 'Este orçamento expirou.' }, { status: 410 })
  }

  let body: {
    nomeCompleto?: string
    telefone?: string
    cpf?: string
    cep?: string
    endereco?: string
    numero?: string
    complemento?: string
    bairro?: string
    cidade?: string
    estado?: string
    localizacao?: string
    localizacaoOutra?: string
    observacoes?: string
    pagamento?: string
    parcelas?: string
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ erro: 'Requisição inválida.' }, { status: 400 })
  }

  if (!body.nomeCompleto?.trim() || !body.telefone?.trim()) {
    return Response.json({ erro: 'Informe seu nome e telefone.' }, { status: 400 })
  }
  if (!body.localizacao) {
    return Response.json({ erro: 'Informe onde o pet está.' }, { status: 400 })
  }

  // Mesmos rótulos que a ficha pública do CRM grava — a tratativa lê este texto.
  const FORMAS = ['Pix', 'Dinheiro', 'Cartão Débito', 'Cartão Crédito']
  if (!body.pagamento || !FORMAS.includes(body.pagamento)) {
    return Response.json({ erro: 'Escolha a forma de pagamento.' }, { status: 400 })
  }
  if (body.pagamento === 'Cartão Crédito' && !body.parcelas) {
    return Response.json({ erro: 'Escolha em quantas vezes.' }, { status: 400 })
  }

  const { data: unidade } = await admin
    .from('unidades')
    .select('nome, estado')
    .eq('id', orc.unidade_id)
    .single()

  // localizacao/velorio/acompanhamento são NOT NULL na tabela → '' e não null.
  const { data: ficha, error } = await admin
    .from('fichas')
    .insert({
      unidade_id: orc.unidade_id,
      unidade: unidade?.estado ? `${unidade.nome} - ${unidade.estado}` : (unidade?.nome ?? ''),
      tipo_plano: 'emergencial',
      nome_completo: body.nomeCompleto.trim(),
      telefone: body.telefone.trim(),
      cpf: body.cpf?.trim() || null,
      cep: body.cep?.trim() || null,
      endereco: body.endereco?.trim() || null,
      numero: body.numero?.trim() || null,
      complemento: body.complemento?.trim() || null,
      bairro: body.bairro?.trim() || null,
      cidade: body.cidade?.trim() || null,
      estado: body.estado?.trim() || null,
      nome_pet: orc.pet_nome,
      especie: orc.pet_especie,
      peso: orc.pet_peso,
      cremacao: orc.tipo_cremacao,
      localizacao: body.localizacao,
      localizacao_outra: body.localizacaoOutra?.trim() || null,
      pagamento: body.pagamento,
      parcelas: body.pagamento === 'Cartão Crédito' ? (body.parcelas ?? null) : null,
      velorio: '',
      acompanhamento: '',
      observacoes: body.observacoes?.trim() || null,
      // "Como conheceu" já vem resolvido: veio de um parceiro (decisão #7).
      como_conheceu: ['Clínica/Veterinário'],
      // O vínculo forte — é isto que faz a comissão chegar em quem indicou.
      contato_id: orc.contato_id,
      parceiro_orcamento_id: orc.id,
      plano_nome: orc.plano_nome,
      plano_itens: orc.plano_itens,
      valor: orc.plano_preco_congelado,
    })
    .select('id')
    .single()

  if (error) {
    return Response.json({ erro: 'Não consegui registrar sua solicitação.' }, { status: 500 })
  }

  await admin
    .from('parceiro_orcamentos')
    .update({ status: 'convertido', ficha_id: ficha.id })
    .eq('id', orc.id)

  return Response.json({ ok: true })
}
