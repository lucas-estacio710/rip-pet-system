import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Rotinas automáticas do programa (decisão #30). Uma rota só, com 3 tarefas —
 * o Vercel Cron chama com ?tarefa=...
 *
 *   expirar-orcamentos     (de hora em hora) — link vencido não pode parecer válido
 *   recalcular-categorias  (diário)          — ano móvel se move sozinho, todo dia
 *   fechar-mes             (dia 1)           — abre o sorteio do mês novo
 *
 * Protegida por CRON_SECRET: sem isso, qualquer um na internet dispararia a rotina.
 * O Vercel manda o header `Authorization: Bearer $CRON_SECRET` automaticamente.
 */

function autorizado(req: Request) {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  return req.headers.get('authorization') === `Bearer ${segredo}`
}

function mesRef(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export async function GET(req: Request) {
  if (!autorizado(req)) return Response.json({ erro: 'nao_autorizado' }, { status: 401 })

  const tarefa = new URL(req.url).searchParams.get('tarefa')
  const admin = createAdminClient()

  // ---------- expirar orçamentos ----------
  if (tarefa === 'expirar-orcamentos') {
    const { data, error } = await admin
      .from('parceiro_orcamentos')
      .update({ status: 'expirado' })
      .eq('status', 'aberto')
      .lt('expira_em', new Date().toISOString())
      .select('id')
    if (error) return Response.json({ erro: error.message }, { status: 500 })
    return Response.json({ tarefa, expirados: data?.length ?? 0 })
  }

  // ---------- recalcular categorias (ano móvel) ----------
  if (tarefa === 'recalcular-categorias') {
    const { data: parceiros } = await admin
      .from('contatos')
      .select('id, unidade_id, categoria_parceiro')
      .eq('portal_ativo', true)

    const { data: configs } = await admin
      .from('parceiro_config')
      .select('unidade_id, faixas')

    const faixaPorUnidade = new Map(
      (configs ?? []).map((c) => [c.unidade_id, c.faixas as { bronze_max: number; prata_max: number }])
    )

    const desde = new Date()
    desde.setFullYear(desde.getFullYear() - 1)
    const desdeStr = desde.toISOString().slice(0, 10)

    let mudaram = 0
    for (const p of parceiros ?? []) {
      const f = faixaPorUnidade.get(p.unidade_id) ?? { bronze_max: 5, prata_max: 12 }
      const { count } = await admin
        .from('contratos')
        .select('id', { count: 'exact', head: true })
        .eq('contato_id', p.id)
        .gte('data_contrato', desdeStr)

      const q = count ?? 0
      const nova = q <= f.bronze_max ? 'bronze' : q <= f.prata_max ? 'prata' : 'ouro'
      if (nova !== p.categoria_parceiro) {
        await admin.from('contatos').update({ categoria_parceiro: nova }).eq('id', p.id)
        mudaram++
      }
    }
    return Response.json({ tarefa, avaliados: parceiros?.length ?? 0, mudaram })
  }

  // ---------- fechar mês / abrir sorteio novo ----------
  if (tarefa === 'fechar-mes') {
    const agora = new Date()
    const mes = mesRef(agora)

    const { data: unidades } = await admin
      .from('unidades')
      .select('id, modulos_ativos')

    const ativas = (unidades ?? []).filter((u) =>
      (u.modulos_ativos ?? []).includes('cb_portal_parceiros')
    )

    let criados = 0
    for (const u of ativas) {
      const { data: cfg } = await admin
        .from('parceiro_config').select('sorteio_ativo').eq('unidade_id', u.id).maybeSingle()
      if (!cfg?.sorteio_ativo) continue

      // Sorteio do mês novo nasce SEM prêmio: quem cadastra é o admin.
      // `onConflict` evita duplicar se o cron rodar duas vezes no dia 1.
      const { error } = await admin
        .from('parceiro_sorteios')
        .upsert({ unidade_id: u.id, mes_ref: mes, status: 'aberto' }, { onConflict: 'unidade_id,mes_ref', ignoreDuplicates: true })
      if (!error) criados++
    }
    return Response.json({ tarefa, unidadesAtivas: ativas.length, criados })
  }

  return Response.json({ erro: 'tarefa_desconhecida' }, { status: 400 })
}
