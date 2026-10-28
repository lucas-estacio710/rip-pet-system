// ============================================================================
// Tarefa do Operacional NO NÍVEL DO PRODUTO (rescaldos: pelinho, molde, carimbo, pelo extra) —
// o "gestor por item" do popup de pendências do pipeline redesenhado (fase 2.8 Pelinho; 2.10
// Personalizados reaproveita). docs/REDESENHO_CARDS_PIPELINE.md itens 24 e 27.
//
// Casa 1:1 com o banco: `tarefas_operacionais` tem 1 linha por `contrato_produto_id` (índice
// único de pendente por produto, mig 116). Cada operação confere o erro — o trigger da mig 147
// recusa conclusão sem foto de quem não é gerente, e a ordem segura é a do 0.3: a TAREFA
// conclui antes do produto virar "feito".
//
// Separado de `atribuir-tarefa.ts` de propósito: importa `foto-tarefa.ts`, que usa o alias
// `@/`, e os testes de `atribuir-tarefa.ts` rodam no Node puro (`npm test`).
// ============================================================================

import type { createClient } from '@/lib/supabase/client'
import type { FotoComprimida } from '@/lib/comprimir-imagem'
import { enviarFotoTarefa } from '@/lib/foto-tarefa'
import { concluirTarefasOperacionais, reabrirTarefasOperacionais, registrarObservacaoContrato } from '@/lib/atribuir-tarefa'
import { trocaPreservaLinha } from '@/lib/urna'

type Supabase = ReturnType<typeof createClient>

export type TipoRescaldo = 'pelinho' | 'molde_patinha' | 'molde_focinho' | 'carimbo' | 'pelo_extra'

/** Rótulo da tarefa — o mesmo do /tarefas (TIPO_INFO). */
export const ROTULO_TAREFA: Record<TipoRescaldo, string> = {
  pelinho: 'Tirar Pelinho',
  molde_patinha: 'Tirar Molde',
  molde_focinho: 'Tirar Molde Focinho',
  carimbo: 'Tirar Carimbo',
  pelo_extra: 'Tirar Pelo Extra',
}

export type TarefaDoProduto = {
  id: string
  contrato_produto_id: string
  atribuido_a: string
  atribuido_em: string
  status: 'pendente' | 'concluida'
  concluido_em: string | null
  executado_por_funcionario_id: string | null
}

type Ator = { userId: string | null; nome: string }
type Contexto = { tipo: TipoRescaldo; unidadeId: string; contratoId: string; petNome: string; ator: Ator }

/** Tarefas (pendentes e concluídas) dos produtos — a concluída mais recente vence a antiga. */
export async function carregarTarefasDosProdutos(sb: Supabase, cpIds: string[]): Promise<Record<string, TarefaDoProduto>> {
  if (cpIds.length === 0) return {}
  const { data, error } = await sb.from('tarefas_operacionais')
    .select('id, contrato_produto_id, atribuido_a, atribuido_em, status, concluido_em, executado_por_funcionario_id')
    .in('contrato_produto_id', cpIds)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  const porProduto: Record<string, TarefaDoProduto> = {}
  for (const t of (data || []) as TarefaDoProduto[]) {
    const atual = porProduto[t.contrato_produto_id]
    // Pendente sempre vence (é a que está viva); entre concluídas, a mais nova.
    if (!atual || t.status === 'pendente' || (atual.status !== 'pendente' && (t.concluido_em || '') > (atual.concluido_em || ''))) {
      porProduto[t.contrato_produto_id] = t
    }
  }
  return porProduto
}

/** Atribui os produtos a uma pessoa (1 linha por produto). Avisa a pessoa por push. */
export async function atribuirProdutos(
  sb: Supabase,
  ctx: Contexto & { cpIds: string[]; atribuidoA: string; nomeAtribuido: string },
): Promise<void> {
  if (ctx.cpIds.length === 0) return
  const rows = ctx.cpIds.map(cpId => ({
    unidade_id: ctx.unidadeId,
    tipo: ctx.tipo,
    contrato_id: null,
    contrato_produto_id: cpId,
    atribuido_a: ctx.atribuidoA,
    atribuido_por: ctx.ator.userId,
  }))
  const { error } = await sb.from('tarefas_operacionais').insert(rows as never)
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Este item já tem alguém com a tarefa — atualize e confira.')
    throw new Error(error.message)
  }
  const rotulo = ctx.cpIds.length > 1 ? `${ROTULO_TAREFA[ctx.tipo]} (×${ctx.cpIds.length})` : ROTULO_TAREFA[ctx.tipo]
  await registrarObservacaoContrato(sb, {
    contratoId: ctx.contratoId,
    unidadeId: ctx.unidadeId,
    descricao: `${ctx.ator.nome} atribuiu para ${ctx.nomeAtribuido} fazer ${rotulo} (pelo pipeline).`,
    criadoPor: ctx.ator.nome,
  })
  try {
    await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: ctx.atribuidoA, title: '📋 Nova tarefa pra você', body: `${rotulo} — ${ctx.petNome}`, url: '/tarefas' }),
    })
  } catch { /* push é best-effort */ }
}

/**
 * Pelinho Inicial (`cb_pelinho_inicial`) + acolhimento — decisão do Lucas (22/10/2026): o
 * pelinho nasce na mão de QUEM VAI ACOLHER, sem passar pelo "Pra atribuir". Vale pra remoção
 * nova (Tratativa) e pra ativação de PV (o PV não ganha mais pelinho na contratação, só aqui).
 *
 * - `criarSeFaltar`: o contrato não tem pelinho nenhum (nem feito) → cria 1 (produto `0004`,
 *   preço do catálogo, hoje R$ 0). Tendo qualquer um, não cria: o tutor pode ter comprado 2.
 * - `atribuidoA`: os pelinhos NÃO feitos e sem tarefa pendente vão pra essa pessoa ou posição.
 *   Ignora "Faz outras tarefas" de propósito — o pelinho é parte do acolhimento.
 * Sem push próprio: quem chama já avisa do acolhimento, e o pelinho chega junto.
 */
export async function pelinhoDoAcolhimento(
  sb: Supabase,
  ctx: { contratoId: string; unidadeId: string; atribuidoA: string | null; atribuidoPor: string | null; criarSeFaltar: boolean },
): Promise<void> {
  const { data, error } = await sb.from('contrato_produtos')
    .select('id, rescaldo_feito, produto:produtos!inner(rescaldo_tipo)')
    .eq('contrato_id', ctx.contratoId)
    .eq('produto.rescaldo_tipo', 'pelinho')
  if (error) throw new Error(error.message)
  const pelinhos = (data || []) as unknown as { id: string; rescaldo_feito: boolean | null }[]

  if (pelinhos.length === 0 && ctx.criarSeFaltar) {
    const { data: produto, error: errProd } = await sb.from('produtos').select('id, preco').eq('codigo', '0004')
      .single() as { data: { id: string; preco: number | null } | null; error: { message: string } | null }
    if (errProd || !produto) throw new Error(errProd?.message || 'Produto Pelinho (0004) não encontrado')
    const { data: novo, error: errIns } = await sb.from('contrato_produtos').insert({
      contrato_id: ctx.contratoId,
      produto_id: produto.id,
      quantidade: 1,
      valor: produto.preco || 0,
      separado: false,
      is_reserva_pv: false,
      rescaldo_feito: false,
    } as never).select('id').single() as { data: { id: string } | null; error: { message: string } | null }
    if (errIns || !novo) throw new Error(errIns?.message || 'Não consegui incluir o pelinho')
    pelinhos.push({ id: novo.id, rescaldo_feito: false })
  }

  if (!ctx.atribuidoA) return
  const abertos = pelinhos.filter(p => !p.rescaldo_feito).map(p => p.id)
  if (abertos.length === 0) return
  const { data: ocupados, error: errOc } = await sb.from('tarefas_operacionais')
    .select('contrato_produto_id').in('contrato_produto_id', abertos).eq('status', 'pendente')
  if (errOc) throw new Error(errOc.message)
  const comTarefa = new Set(((ocupados || []) as { contrato_produto_id: string }[]).map(r => r.contrato_produto_id))
  const livres = abertos.filter(id => !comTarefa.has(id))
  if (livres.length === 0) return
  const { error: errTar } = await sb.from('tarefas_operacionais').insert(livres.map(cpId => ({
    unidade_id: ctx.unidadeId,
    tipo: 'pelinho',
    contrato_id: null,
    contrato_produto_id: cpId,
    atribuido_a: ctx.atribuidoA,
    atribuido_por: ctx.atribuidoPor,
  })) as never)
  // 23505: alguém atribuiu no mesmo instante — o pelinho já está com alguém, nada a fazer.
  if (errTar && (errTar as { code?: string }).code !== '23505') throw new Error(errTar.message)
}

/**
 * Reatribuir o ACOLHIMENTO leva junto o pelinho que ainda está pendente com a mesma pessoa
 * (decisão de 22/10/2026). Só mexe no que está com `de` — pelinho já passado a outra pessoa
 * pela Gestão fica onde está.
 */
export async function moverPelinhoComAcolhimento(
  sb: Supabase,
  ctx: { contratoId: string; de: string; para: string; atribuidoPor: string | null },
): Promise<void> {
  const { data, error } = await sb.from('contrato_produtos')
    .select('id, produto:produtos!inner(rescaldo_tipo)')
    .eq('contrato_id', ctx.contratoId)
    .eq('produto.rescaldo_tipo', 'pelinho')
  if (error) throw new Error(error.message)
  const ids = ((data || []) as { id: string }[]).map(r => r.id)
  if (ids.length === 0) return
  const { error: errUp } = await sb.from('tarefas_operacionais').update({
    atribuido_a: ctx.para,
    atribuido_por: ctx.atribuidoPor,
    atribuido_em: new Date().toISOString(),
  } as never).in('contrato_produto_id', ids).eq('tipo', 'pelinho').eq('status', 'pendente').eq('atribuido_a', ctx.de)
  if (errUp) throw new Error(errUp.message)
}

export type ModeloDoItem = { id: string; nome: string; rescaldo_tipo: string | null }

/**
 * ⇄ Troca o MODELO de um item por outro do MESMO tipo de personalizado — "Porta-Retrato (à
 * definir)" → "Castanho", ou produto lançado errado. UPDATE na MESMA linha de contrato_produtos:
 * a tarefa, a foto-prova, o "feito" e a OBS ficam (apagar + inserir levaria tudo pelo CASCADE da
 * mig 116 e nasceria tarefa nova — o que obrigava o gerente a "concluir" de mentira).
 * Valor: passa a ser o PREÇO DO NOVO MODELO quando informado (`valor`) — "Molde de Patinha" (R$ 50)
 * → Porta-Retrato (R$ 150) é upgrade; "à definir" → cor escolhida custa o mesmo. O desconto da
 * linha fica. Negociado diferente? Ajusta no lápis depois.
 * Estoque: devolve 1 do antigo e baixa 1 do novo, na unidade DO CONTRATO.
 */
export async function trocarModeloDoItem(
  sb: Supabase,
  p: { cpId: string; de: ModeloDoItem; para: ModeloDoItem; valor?: number | null; contratoId: string; unidadeId: string | null; petNome: string; ator: Ator; onde: string },
): Promise<void> {
  if (!trocaPreservaLinha(p.de.rescaldo_tipo, p.para.rescaldo_tipo)) {
    throw new Error('Só dá pra trocar por um modelo do mesmo tipo de personalizado.')
  }
  if (p.de.id === p.para.id) return
  const novoValor = typeof p.valor === 'number' ? p.valor : null
  const { error } = await sb.from('contrato_produtos')
    .update((novoValor !== null ? { produto_id: p.para.id, valor: novoValor } : { produto_id: p.para.id }) as never).eq('id', p.cpId)
  if (error) throw new Error('Não consegui trocar o modelo: ' + error.message)
  if (p.unidadeId) {
    // .bind: solto, o rpc perde o `this` e o supabase-js quebra em `this.rest` (bug do ⇄, 11/10).
    const rpc = sb.rpc.bind(sb) as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
    for (const [produtoId, delta] of [[p.de.id, 1], [p.para.id, -1]] as const) {
      const { error: e } = await rpc('ajustar_estoque_unidade', { p_produto_id: produtoId, p_unidade_id: p.unidadeId, p_delta: delta })
      // O modelo já foi trocado; estoque errado não desfaz a troca (mesma regra do lib/urna.ts).
      if (e) console.error('[trocarModeloDoItem] estoque não ajustado:', e.message)
    }
  }
  await sb.from('historico_alteracoes').insert({
    entidade: 'contrato_produto',
    entidade_id: p.cpId,
    entidade_nome: `${p.para.nome} — ${p.petNome}`,
    campo: 'produto_id',
    campo_label: 'Modelo do item',
    valor_anterior: p.de.nome,
    valor_novo: p.para.nome,
    tipo: 'alteracao',
    alterado_por: p.ator.userId,
  } as never)
  await registrarObservacaoContrato(sb, {
    contratoId: p.contratoId,
    unidadeId: p.unidadeId,
    descricao: `${p.ator.nome} trocou ${p.de.nome} por ${p.para.nome}${novoValor !== null ? ` — valor R$ ${novoValor.toFixed(2).replace('.', ',')}` : ''} (${p.onde}).`,
    criadoPor: p.ator.nome,
  })
}

/** Tira a pessoa da tarefa (só se ainda pendente) — o item volta a "Atribuir a…". */
export async function desatribuirProduto(
  sb: Supabase,
  ctx: Contexto & { tarefaId: string; nomeAtual: string },
): Promise<void> {
  const { data, error } = await sb.from('tarefas_operacionais').delete()
    .eq('id', ctx.tarefaId).eq('status', 'pendente').select('id')
  if (error) throw new Error(error.message)
  if ((data || []).length === 0) throw new Error('Esta tarefa já foi concluída — nada foi desatribuído.')
  await registrarObservacaoContrato(sb, {
    contratoId: ctx.contratoId,
    unidadeId: ctx.unidadeId,
    descricao: `${ctx.ator.nome} tirou ${ROTULO_TAREFA[ctx.tipo]} de ${ctx.nomeAtual} (pelo pipeline) — voltou pra atribuir.`,
    criadoPor: ctx.ator.nome,
  })
}

/**
 * Conclui o produto pelo pipeline. Ordem segura (0.3/0.4):
 *  1. garante uma linha pendente (sem dono → autoatribui a quem conclui, como o "Feito" do pool)
 *  2. sobe a foto (o trigger da mig 147 exige foto de quem não é gerente)
 *  3. conclui a TAREFA, com erro conferido
 *  4. só então marca o produto como feito — se falhar, a tarefa reabre
 * Linha criada aqui e não concluída é apagada, pra não sobrar tarefa órfã com o nome de quem tentou.
 */
export async function concluirProduto(
  sb: Supabase,
  ctx: Contexto & { cpId: string; tarefaPendenteId: string | null; foto: FotoComprimida | null; anotacao: string | null },
): Promise<void> {
  if (!ctx.ator.userId) throw new Error('Sessão sem usuário — entre de novo.')
  let tarefaId = ctx.tarefaPendenteId
  let criada = false
  if (!tarefaId) {
    const { data, error } = await sb.from('tarefas_operacionais').insert({
      unidade_id: ctx.unidadeId,
      tipo: ctx.tipo,
      contrato_id: null,
      contrato_produto_id: ctx.cpId,
      atribuido_a: ctx.ator.userId,
      atribuido_por: ctx.ator.userId,
    } as never).select('id').single() as { data: { id: string } | null; error: { message: string; code?: string } | null }
    if (error || !data) {
      if (error?.code === '23505') throw new Error('Alguém acabou de pegar esta tarefa — atualize e confira.')
      throw new Error(error?.message || 'Não consegui criar a tarefa')
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
  const { error: errProd } = await sb.from('contrato_produtos').update({ rescaldo_feito: true } as never).eq('id', ctx.cpId)
  if (errProd) {
    await reabrirTarefasOperacionais(sb, [tarefaId]).catch(() => {})
    throw new Error('Tarefa concluída, mas não consegui marcar o item como feito: ' + errProd.message)
  }
  await registrarObservacaoContrato(sb, {
    contratoId: ctx.contratoId,
    unidadeId: ctx.unidadeId,
    descricao: `${ROTULO_TAREFA[ctx.tipo]} concluído por ${ctx.ator.nome} pelo pipeline${ctx.foto ? ' (com foto)' : ' (sem foto)'}.${ctx.anotacao ? ` Nota: ${ctx.anotacao}` : ''}`,
    criadoPor: ctx.ator.nome,
  })
}

/**
 * OBS do produto (mig 154, P-12): o pedido sobre AQUELE item ("molde da patinha de trás").
 * Grava em `contrato_produtos.observacao` — vale desde o acolhimento e sobrevive a desatribuir.
 * Chamar só no OK (todo UPDATE aqui dispara o recálculo de valores do contrato, mig 074).
 * Registra no histórico quem pediu o quê — antes nada registrava.
 */
export async function salvarObsProduto(
  sb: Supabase,
  p: { cpId: string; obs: string | null; nomeProduto: string; petNome: string; ator: Ator },
): Promise<void> {
  const obs = p.obs && p.obs.trim() ? p.obs.trim() : null
  const { error } = await sb.from('contrato_produtos').update({ observacao: obs } as never).eq('id', p.cpId)
  if (error) throw new Error('Não consegui salvar a observação: ' + error.message)
  await sb.from('historico_alteracoes').insert({
    entidade: 'contrato_produto',
    entidade_id: p.cpId,
    entidade_nome: `${p.nomeProduto} — ${p.petNome}`,
    campo: 'observacao',
    campo_label: 'Observação do item',
    valor_novo: obs,
    tipo: 'alteracao',
    alterado_por: p.ator.userId,
  } as never)
}
