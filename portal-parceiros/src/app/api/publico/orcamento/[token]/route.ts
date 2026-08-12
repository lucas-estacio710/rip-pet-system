import { createAdminClient } from '@/lib/supabase/admin'

/**
 * O orçamento visto pelo TUTOR (sem login).
 *
 * Cuidado deliberado com o que sai daqui: o tutor vê o pet, o plano e o valor —
 * nunca o nome ou o pix do parceiro, nem o benefício escolhido quando este é a
 * comissão. Desconto e cortesia aparecem, porque são vantagem dele.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const admin = createAdminClient()

  const { data } = await admin
    .from('parceiro_orcamentos')
    .select(`
      id, pet_nome, pet_especie, pet_peso, tipo_cremacao, plano_nome,
      plano_preco_congelado, plano_itens, beneficio_tipo, desconto_percentual,
      status, expira_em, ficha_id, unidade_id,
      produtos ( nome, imagem_url ),
      unidades ( nome, whatsapp )
    `)
    .eq('token_publico', token)
    .maybeSingle()

  if (!data) {
    return Response.json({ valido: false, motivo: 'nao_encontrado' }, { status: 404 })
  }
  if (data.ficha_id || data.status === 'convertido') {
    return Response.json({ valido: false, motivo: 'ja_usado' }, { status: 410 })
  }
  if (data.status === 'expirado' || new Date(data.expira_em).getTime() < Date.now()) {
    const u = data.unidades as unknown as { whatsapp: string | null } | null
    return Response.json(
      { valido: false, motivo: 'expirado', whatsapp: u?.whatsapp ?? null },
      { status: 410 }
    )
  }

  const cortesia = data.produtos as unknown as { nome: string; imagem_url: string | null } | null
  const unidade = data.unidades as unknown as { nome: string; whatsapp: string | null } | null

  const desconto =
    data.beneficio_tipo === 'desconto' && data.desconto_percentual
      ? Number(data.plano_preco_congelado) * (Number(data.desconto_percentual) / 100)
      : 0

  // Parcelamento máximo da unidade — o tutor precisa disso pra decidir, e o
  // concierge precisa da forma de pagamento pra registrar o recebimento.
  const { data: cfg } = await admin
    .from('parceiro_config')
    .select('max_parcelas')
    .eq('unidade_id', data.unidade_id)
    .maybeSingle()

  return Response.json({
    maxParcelas: cfg?.max_parcelas ?? 12,
    valido: true,
    pet: { nome: data.pet_nome, especie: data.pet_especie, peso: data.pet_peso },
    tipoCremacao: data.tipo_cremacao,
    plano: { nome: data.plano_nome, preco: Number(data.plano_preco_congelado) },
    itens: data.plano_itens ?? [],
    desconto: desconto > 0 ? { percentual: Number(data.desconto_percentual), valor: desconto } : null,
    cortesia: data.beneficio_tipo === 'cortesia' ? cortesia : null,
    total: Number(data.plano_preco_congelado) - desconto,
    expiraEm: data.expira_em,
    unidade: unidade?.nome ?? null,
    whatsapp: unidade?.whatsapp ?? null,
  })
}
