import { randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getParceiroSessao, respostaSessaoInvalida, SessaoInvalida } from '@/lib/sessao'
import { precoDoPlano, expiracaoPorConfig, type Plano } from '@/lib/planos'

type ItemEscolhido = { produto_id: string | null; nome: string; grupo: string; modo: string; preco: number }

// ---------- GET: meus orçamentos ----------
export async function GET() {
  let sessao
  try {
    sessao = await getParceiroSessao()
  } catch (e) {
    if (e instanceof SessaoInvalida) return respostaSessaoInvalida(e)
    throw e
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('parceiro_orcamentos')
    .select('id, pet_nome, tipo_cremacao, plano_nome, plano_preco_congelado, beneficio_tipo, status, expira_em, token_publico, created_at, ficha_id')
    .eq('contato_id', sessao.contatoId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return Response.json({ erro: 'falha_ao_listar' }, { status: 500 })

  const agora = Date.now()
  return Response.json({
    orcamentos: (data ?? []).map((o) => ({
      ...o,
      // `expirado` é derivado na leitura também: o cron roda de hora em hora, e no
      // intervalo o parceiro não pode ver um link vencido como se estivesse valendo.
      status:
        o.status === 'aberto' && new Date(o.expira_em).getTime() < agora ? 'expirado' : o.status,
    })),
  })
}

// ---------- POST: criar orçamento ----------
export async function POST(req: Request) {
  let sessao
  try {
    sessao = await getParceiroSessao()
  } catch (e) {
    if (e instanceof SessaoInvalida) return respostaSessaoInvalida(e)
    throw e
  }

  let body: {
    petNome?: string
    petEspecie?: string
    petPeso?: number | null
    tipoCremacao?: 'individual' | 'coletiva'
    planoId?: string
    itensIds?: string[]
    beneficioTipo?: 'comissao' | 'desconto' | 'cortesia'
    cortesiaProdutoId?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ erro: 'Requisição inválida.' }, { status: 400 })
  }

  const { petNome, petEspecie, petPeso, tipoCremacao, planoId, beneficioTipo } = body
  if (!petNome?.trim()) return Response.json({ erro: 'Informe o nome do pet.' }, { status: 400 })
  if (tipoCremacao !== 'individual' && tipoCremacao !== 'coletiva') {
    return Response.json({ erro: 'Escolha individual ou coletiva.' }, { status: 400 })
  }
  if (!planoId) return Response.json({ erro: 'Escolha um plano.' }, { status: 400 })
  if (!beneficioTipo || !['comissao', 'desconto', 'cortesia'].includes(beneficioTipo)) {
    return Response.json({ erro: 'Escolha o benefício.' }, { status: 400 })
  }
  if (!sessao.config.beneficios_ativos?.[beneficioTipo]) {
    return Response.json({ erro: 'Este benefício não está disponível.' }, { status: 400 })
  }
  if (beneficioTipo === 'cortesia') {
    const permitidos = sessao.config.cortesia_produtos?.[tipoCremacao] ?? []
    if (!body.cortesiaProdutoId || !permitidos.includes(body.cortesiaProdutoId)) {
      return Response.json({ erro: 'Escolha uma cortesia válida.' }, { status: 400 })
    }
  }

  const admin = createAdminClient()

  // O plano é relido do banco e o preço recalculado AQUI. Nunca aceitar preço do
  // client: seria trivial mandar 1 real e congelar isso pro tutor.
  const { data: plano } = await admin
    .from('planos')
    .select('id, nome, descricao, imagem_url, tipo_cremacao, preco, adicional_peso_kg, adicional_valor, ativo, unidade_id, plano_grupos(*, plano_itens(*))')
    .eq('id', planoId)
    .maybeSingle()

  if (!plano || !plano.ativo || plano.unidade_id !== sessao.unidadeId || plano.tipo_cremacao !== tipoCremacao) {
    return Response.json({ erro: 'Plano indisponível.' }, { status: 400 })
  }

  const preco = precoDoPlano(plano as unknown as Plano, petPeso ?? null)

  // Itens escolhidos: também resolvidos no servidor, a partir dos ids.
  const idsEscolhidos = new Set(body.itensIds ?? [])
  const itens: ItemEscolhido[] = []
  for (const g of (plano as unknown as Plano).plano_grupos ?? []) {
    for (const it of g.plano_itens ?? []) {
      if (idsEscolhidos.has(it.id)) {
        itens.push({
          produto_id: it.produto_id,
          nome: it.nome,
          grupo: g.nome,
          modo: it.modo,
          preco: it.modo === 'desconto' ? (it.preco_desconto ?? 0) : 0,
        })
      }
    }
  }

  const expira = expiracaoPorConfig(
    sessao.config.orcamento_validade_modo,
    sessao.config.orcamento_validade_horas
  )

  const { data: orc, error } = await admin
    .from('parceiro_orcamentos')
    .insert({
      contato_id: sessao.contatoId,
      unidade_id: sessao.unidadeId,
      pet_nome: petNome.trim(),
      pet_especie: petEspecie ?? null,
      pet_peso: petPeso ?? null,
      tipo_cremacao: tipoCremacao,
      plano_id: plano.id,
      plano_nome: plano.nome,
      plano_preco_congelado: preco,
      beneficio_tipo: beneficioTipo,
      cortesia_produto_id: beneficioTipo === 'cortesia' ? body.cortesiaProdutoId : null,
      desconto_percentual:
        beneficioTipo === 'desconto' ? sessao.config.desconto_percentual : null,
      plano_itens: itens.length ? itens : null,
      token_publico: randomBytes(24).toString('base64url'),
      status: 'aberto',
      expira_em: expira.toISOString(),
    })
    .select('id, token_publico, plano_nome, plano_preco_congelado, expira_em')
    .single()

  if (error) return Response.json({ erro: 'Falha ao criar o orçamento.' }, { status: 500 })

  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://parceiro.rippet.com.br'

  return Response.json({
    orcamento: orc,
    itens,
    url: `${base.replace(/\/$/, '')}/o/${orc.token_publico}`,
  })
}
