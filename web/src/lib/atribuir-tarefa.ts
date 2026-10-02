// ============================================================================
// Escrita em `tarefas_operacionais` com erro conferido — porta única pro /tarefas e,
// depois, pro pipeline redesenhado (docs/PLAYBOOK_REDESENHO_PIPELINE.md, commit 0.3).
//
// 🔴 POR QUE EXISTE: o UPDATE que conclui a tarefa era feito sem olhar o erro, DEPOIS do
// efeito de negócio (contrato finalizado / produto marcado feito). Quando o trigger da mig 147
// recusava (tipo exige foto e quem conclui não é gerente), o efeito já estava gravado, o toast
// dizia "concluída" e a tarefa ficava pendente pra sempre — órfã. Foi assim que nasceram as 2
// tarefas de pelinho pendentes com o produto já feito (17/09/2026). Aqui a tarefa conclui
// PRIMEIRO, e quem chama só grava o efeito se ela passou.
//
// Funções sem toast nem state: lançam Error com mensagem pra mostrar ao usuário.
// ============================================================================

import type { createClient } from '@/lib/supabase/client'

type Supabase = ReturnType<typeof createClient>

/** Traduz a recusa do trigger `trg_tarefa_exige_foto` (mig 147) pra quem está na tela. */
function mensagemDoErro(msg: string): string {
  if (/foto/i.test(msg)) return 'Esta tarefa exige a Foto de Conclusão — sem foto, só o gerente pode concluir.'
  return msg
}

/**
 * Conclui as tarefas `ids` (só as que ainda estão pendentes). Confere o erro e confere que
 * TODAS mudaram: se alguma já estava concluída por outra pessoa, recusa sem mexer em nada —
 * quem chama não deve gravar o efeito de novo.
 */
export async function concluirTarefasOperacionais(
  sb: Supabase,
  ids: string[],
  campos: { anotacao?: string | null; lacre?: string | null; executadoPorFuncionarioId?: string | null },
): Promise<void> {
  if (ids.length === 0) throw new Error('Tarefa não encontrada')
  const update: Record<string, unknown> = {
    status: 'concluida',
    concluido_em: new Date().toISOString(),
    anotacao_conclusao: campos.anotacao || null,
    executado_por_funcionario_id: campos.executadoPorFuncionarioId || null,
  }
  if (campos.lacre !== undefined) update.lacre = campos.lacre
  const { data, error } = await sb.from('tarefas_operacionais')
    .update(update as never)
    .in('id', ids)
    .eq('status', 'pendente')
    .select('id')
  if (error) throw new Error(mensagemDoErro(error.message))
  const mudaram = (data || []) as { id: string }[]
  if (mudaram.length !== ids.length) {
    // Parte já tinha sido concluída (outra aba, outra pessoa). Devolve as que ESTA chamada
    // concluiu, pra o lote não ficar meio a meio.
    if (mudaram.length > 0) await reabrirTarefasOperacionais(sb, mudaram.map(r => r.id)).catch(() => {})
    throw new Error('Esta tarefa já foi concluída por outra pessoa. Atualize a tela.')
  }
}

/**
 * Fecha as tarefas PENDENTES de um item que foi resolvido fora do /tarefas (✓ de rescaldo no
 * pipeline/detalhe, entrega pelo EntregaModal, bypass, lote, Tratativa). Devolve os ids que
 * fechou (vazio = não havia tarefa). Erro conferido: se o trigger da mig 147 recusar, LANÇA —
 * e quem chama não grava o efeito (ou avisa, se o efeito já não tem volta).
 */
export async function concluirTarefasPendentesDe(
  sb: Supabase,
  filtro: { contratoProdutoId?: string; contratoIds?: string[]; fichaId?: string; tipo?: string },
  anotacao: string,
): Promise<string[]> {
  let q = sb.from('tarefas_operacionais').select('id').eq('status', 'pendente')
  if (filtro.contratoProdutoId) q = q.eq('contrato_produto_id', filtro.contratoProdutoId)
  if (filtro.contratoIds) q = q.in('contrato_id', filtro.contratoIds)
  if (filtro.fichaId) q = q.eq('ficha_id', filtro.fichaId)
  if (filtro.tipo) q = q.eq('tipo', filtro.tipo)
  if (!filtro.contratoProdutoId && !filtro.contratoIds && !filtro.fichaId) throw new Error('Filtro de tarefa vazio')
  const { data, error } = await q
  if (error) throw new Error(error.message)
  const ids = ((data || []) as { id: string }[]).map(r => r.id)
  if (ids.length === 0) return []
  await concluirTarefasOperacionais(sb, ids, { anotacao })
  return ids
}

/**
 * Pode marcar "feito" um item cujo tipo de tarefa exige foto, sem foto?
 * Espelha o trigger da mig 147: só super_admin ou gerente. Concierge não. Vale só onde a
 * unidade tem o Operacional (`cb_operacional`) — sem o módulo não nasce tarefa e nada recusa.
 * (P-29: esconder o botão em vez de recusar depois; o erro do banco segue como rede.)
 */
export function podeMarcarFeitoSemFoto(p: {
  exigeFoto: boolean
  unidadeTemOperacional: boolean
  isSuperAdmin: boolean
  role: string | null
}): boolean {
  if (!p.unidadeTemOperacional || !p.exigeFoto) return true
  return p.isSuperAdmin || p.role === 'gerente'
}

/** Volta as tarefas `ids` a pendente (desfazer conclusão, ou desfazer a própria conclusão quando o efeito falhou). */
export async function reabrirTarefasOperacionais(sb: Supabase, ids: string[]): Promise<void> {
  const { error } = await sb.from('tarefas_operacionais').update({
    status: 'pendente',
    concluido_em: null,
    anotacao_conclusao: null,
  } as never).in('id', ids)
  if (error) throw new Error(error.message)
}

// O tipo "Observação da Unidade" era buscado a cada log; não muda em runtime.
let tipoObservacaoId: Promise<string | null> | null = null

/**
 * Linha no card "Observações" do contrato (tabela `tarefas`). `unidadeId` é o que faz o
 * selo da observação mostrar a sigla da unidade — sem ele o `ObservacoesCard` mostra "??".
 * Automático NUNCA nasce importante (decisão do Lucas, 23/09/2026).
 * Best-effort: o log não derruba a operação que já foi gravada.
 */
export async function registrarObservacaoContrato(
  sb: Supabase,
  p: { contratoId: string; unidadeId: string | null; descricao: string; criadoPor: string },
): Promise<void> {
  if (!tipoObservacaoId) {
    tipoObservacaoId = Promise.resolve(
      sb.from('tarefa_tipos').select('id').eq('nome', 'Observação da Unidade').maybeSingle()
    ).then(({ data }) => (data as { id: string } | null)?.id ?? null, () => null)
  }
  const tipoId = await tipoObservacaoId
  const { error } = await sb.from('tarefas').insert({
    contrato_id: p.contratoId,
    unidade_id: p.unidadeId,
    descricao: p.descricao,
    tipo_id: tipoId,
    importante: false,
    criado_por: p.criadoPor,
  } as never)
  if (error) console.error('[atribuir-tarefa] Observação do contrato não gravada:', error)
}

/** Idade de uma tarefa parada: 'agora' · '5h' · '2d 4h' · '12d'. Antes era "1200h". */
export function formatarIdade(horas: number): string {
  if (!(horas >= 1)) return 'agora'
  const h = Math.floor(horas)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  const resto = h % 24
  return d < 7 && resto > 0 ? `${d}d ${resto}h` : `${d}d`
}
