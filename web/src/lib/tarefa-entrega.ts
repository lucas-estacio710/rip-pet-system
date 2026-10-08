// ============================================================================
// Tarefa de ENTREGA orquestrada pelo pipeline redesenhado (fase 2.9 do
// docs/PLAYBOOK_REDESENHO_PIPELINE.md; D10 de docs/REDESENHO_CARDS_PIPELINE.md).
//
// Uma linha em `tarefas_operacionais` por contrato (tipo 'entrega', `contrato_id`). Previsão e
// endereço alterado NÃO viram coluna: vão em `observacao_atribuicao` no formato da
// `lib/obs-entrega.ts` — o /tarefas lê com a mesma função.
//
// Concluir = BYPASS da tarefa (D10): finaliza o contrato. Ordem segura do 0.3: a TAREFA conclui
// primeiro (erro conferido), só depois o contrato vira `finalizado` — se ele falhar, a tarefa
// reabre. Foto só SUGERIDA (P-06 = b: `tarefas_exige_foto.entrega` segue false).
// ============================================================================

import type { createClient } from '@/lib/supabase/client'
import type { FotoComprimida } from '@/lib/comprimir-imagem'
import { enviarFotoTarefa } from '@/lib/foto-tarefa'
import { concluirTarefasOperacionais, reabrirTarefasOperacionais, registrarObservacaoContrato } from '@/lib/atribuir-tarefa'
import { lerObsEntrega, formatarPrevisao } from '@/lib/obs-entrega'

type Supabase = ReturnType<typeof createClient>
type Ator = { userId: string | null; nome: string }
type Contexto = { unidadeId: string; contratoId: string; petNome: string; ator: Ator }

export type TarefaEntrega = {
  id: string
  atribuido_a: string
  atribuido_em: string
  status: 'pendente' | 'concluida'
  observacao_atribuicao: string | null
}

/** A tarefa de entrega PENDENTE do contrato (há no máximo uma — índice da mig 152), ou null. */
export async function carregarTarefaEntrega(sb: Supabase, contratoId: string): Promise<TarefaEntrega | null> {
  const { data, error } = await sb.from('tarefas_operacionais')
    .select('id, atribuido_a, atribuido_em, status, observacao_atribuicao')
    .eq('contrato_id', contratoId).eq('tipo', 'entrega').eq('status', 'pendente')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as TarefaEntrega | null) ?? null
}

/** Texto legível do pedido, pras Observações do contrato (o cru com colchetes fica só na tarefa). */
function pedidoLegivel(obs: string | null): string {
  if (!obs) return ''
  const o = lerObsEntrega(obs)
  const partes: string[] = []
  const prev = formatarPrevisao(o)
  if (prev) partes.push(`previsão ${prev.replace('📅 ', '')}`)
  if (o.endereco) partes.push(`endereço alterado: ${o.endereco}`)
  if (o.texto) partes.push(`pedido: "${o.texto}"`)
  return partes.length ? ` — ${partes.join(' · ')}` : ''
}

export async function atribuirEntrega(
  sb: Supabase,
  ctx: Contexto & { atribuidoA: string; nomeAtribuido: string; obs: string | null },
): Promise<void> {
  const { error } = await sb.from('tarefas_operacionais').insert({
    unidade_id: ctx.unidadeId,
    tipo: 'entrega',
    contrato_id: ctx.contratoId,
    contrato_produto_id: null,
    atribuido_a: ctx.atribuidoA,
    atribuido_por: ctx.ator.userId,
    observacao_atribuicao: ctx.obs,
  } as never)
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Esta entrega já está com alguém — atualize e confira.')
    throw new Error(error.message)
  }
  await registrarObservacaoContrato(sb, {
    contratoId: ctx.contratoId,
    unidadeId: ctx.unidadeId,
    descricao: `${ctx.ator.nome} atribuiu a Entrega para ${ctx.nomeAtribuido} (pelo pipeline)${pedidoLegivel(ctx.obs)}.`,
    criadoPor: ctx.ator.nome,
  })
  try {
    await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: ctx.atribuidoA, title: '📋 Nova tarefa pra você', body: `Entrega — ${ctx.petNome}`, url: '/tarefas' }),
    })
  } catch { /* push é best-effort */ }
}

/** Atualiza previsão/endereço/obs de uma entrega já atribuída (só se ainda pendente). */
export async function salvarObsEntrega(sb: Supabase, ctx: Contexto & { tarefaId: string; obs: string | null }): Promise<void> {
  const { data, error } = await sb.from('tarefas_operacionais')
    .update({ observacao_atribuicao: ctx.obs } as never)
    .eq('id', ctx.tarefaId).eq('status', 'pendente').select('id')
  if (error) throw new Error(error.message)
  if ((data || []).length === 0) throw new Error('Esta entrega já foi concluída — nada foi alterado.')
  await registrarObservacaoContrato(sb, {
    contratoId: ctx.contratoId,
    unidadeId: ctx.unidadeId,
    descricao: `${ctx.ator.nome} alterou o pedido da Entrega (pelo pipeline)${pedidoLegivel(ctx.obs) || ' — pedido apagado'}.`,
    criadoPor: ctx.ator.nome,
  })
}

export async function desatribuirEntrega(sb: Supabase, ctx: Contexto & { tarefaId: string; nomeAtual: string }): Promise<void> {
  const { data, error } = await sb.from('tarefas_operacionais').delete()
    .eq('id', ctx.tarefaId).eq('status', 'pendente').select('id')
  if (error) throw new Error(error.message)
  if ((data || []).length === 0) throw new Error('Esta entrega já foi concluída — nada foi desatribuído.')
  await registrarObservacaoContrato(sb, {
    contratoId: ctx.contratoId,
    unidadeId: ctx.unidadeId,
    descricao: `${ctx.ator.nome} tirou a Entrega de ${ctx.nomeAtual} (pelo pipeline) — voltou pra atribuir.`,
    criadoPor: ctx.ator.nome,
  })
}

/**
 * Registra a entrega e FINALIZA o contrato.
 * Com o Operacional na unidade, passa por uma tarefa (a pendente, ou uma criada no nome de quem
 * concluiu) — é ela que carrega a foto e aparece em Finalizadas no /tarefas. Sem o módulo, só o
 * contrato.
 */
export async function concluirEntrega(
  sb: Supabase,
  ctx: Contexto & {
    usarTarefa: boolean
    tarefaPendenteId: string | null
    dataEntrega: string
    foto: FotoComprimida | null
    anotacao: string | null
    nomeNoLugarDe: string | null
  },
): Promise<void> {
  let tarefaId: string | null = null
  let criada = false
  if (ctx.usarTarefa) {
    if (!ctx.ator.userId) throw new Error('Sessão sem usuário — entre de novo.')
    tarefaId = ctx.tarefaPendenteId
    if (!tarefaId) {
      const { data, error } = await sb.from('tarefas_operacionais').insert({
        unidade_id: ctx.unidadeId, tipo: 'entrega', contrato_id: ctx.contratoId, contrato_produto_id: null,
        atribuido_a: ctx.ator.userId, atribuido_por: ctx.ator.userId,
      } as never).select('id').single() as { data: { id: string } | null; error: { message: string; code?: string } | null }
      if (error || !data) {
        if (error?.code === '23505') throw new Error('Alguém acabou de pegar esta entrega — atualize e confira.')
        throw new Error(error?.message || 'Não consegui criar a tarefa de entrega')
      }
      tarefaId = data.id
      criada = true
    }
    try {
      if (ctx.foto) await enviarFotoTarefa(sb, [tarefaId], ctx.foto, ctx.ator.userId)
      await concluirTarefasOperacionais(sb, [tarefaId], { anotacao: ctx.anotacao })
    } catch (e) {
      if (criada) await sb.from('tarefas_operacionais').delete().eq('id', tarefaId).eq('status', 'pendente')
      throw e
    }
  }

  // Guarda de status: só sai de retorno/pendente. Se outra pessoa finalizou nesse meio-tempo,
  // não reescreve a data dela.
  const { data: fin, error: errCtr } = await sb.from('contratos')
    .update({ status: 'finalizado', data_entrega: ctx.dataEntrega } as never)
    .eq('id', ctx.contratoId).in('status', ['retorno', 'pendente']).select('id')
  if (errCtr || (fin || []).length === 0) {
    if (tarefaId) await reabrirTarefasOperacionais(sb, [tarefaId]).catch(() => {})
    throw new Error(errCtr ? errCtr.message : 'O contrato não está mais em Entrega/Pendente — atualize a tela.')
  }

  await registrarObservacaoContrato(sb, {
    contratoId: ctx.contratoId,
    unidadeId: ctx.unidadeId,
    descricao: `Entrega registrada por ${ctx.ator.nome} pelo pipeline em ${ctx.dataEntrega.split('-').reverse().join('/')}`
      + `${ctx.nomeNoLugarDe ? ` (no lugar de ${ctx.nomeNoLugarDe})` : ''}${ctx.foto ? ' — com foto' : ''} — contrato finalizado.`
      + `${ctx.anotacao ? ` Nota: ${ctx.anotacao}` : ''}`,
    criadoPor: ctx.ator.nome,
  })
}
