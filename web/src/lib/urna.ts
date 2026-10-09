/**
 * URNA DO CONTRATO — preço e gravação da escolha (fase 2.12 do docs/PLAYBOOK_REDESENHO_PIPELINE.md,
 * bug B-09). Puro no topo (testado pelo `npm test`); a gravação recebe o client por parâmetro.
 *
 * Regras (o que o `salvarUrna` antigo do pipeline errava):
 *  - `valor` = preço (de tabela ou digitado) e `desconto` = desconto por unidade, como o detalhe
 *    grava (`confirmarAdicionarProduto`). O trigger da mig 074 soma os dois no contrato —
 *    desconto embutido no valor sumia do relatório.
 *  - Trocar uma urna mexe em UMA linha (a escolhida), nunca em todas as do mesmo produto, e o
 *    estoque devolve só aquela.
 *  - Trocar por um produto do MESMO tipo de personalizado (`rescaldo_tipo`, inclusive nenhum)
 *    é UPDATE na mesma linha: a tarefa, a foto-prova, o "feito" e a nota sobrevivem. Tipo
 *    diferente é apagar + inserir — e a tela avisa antes, porque o CASCADE leva a tarefa junto.
 *  - Todo passo confere o erro do banco.
 */

export type DescontoUrna = { tipo: 'percent' | 'valor'; percent: number | ''; valor: number | '' }

/** Desconto por unidade em R$, nunca maior que o preço nem negativo. */
export function descontoDaUrna(preco: number, d: DescontoUrna): number {
  const p = Math.max(0, preco || 0)
  const bruto = d.tipo === 'percent'
    ? (typeof d.percent === 'number' ? p * d.percent / 100 : 0)
    : (typeof d.valor === 'number' ? d.valor : 0)
  return Math.round(Math.min(p, Math.max(0, bruto)) * 100) / 100
}

/** Valor final (preço − desconto); 0 = grátis. */
export function valorFinalDaUrna(preco: number, d: DescontoUrna): number {
  return Math.round((Math.max(0, preco || 0) - descontoDaUrna(preco, d)) * 100) / 100
}

/**
 * Trocar a urna `de` por `para` preserva a linha (UPDATE) quando o tipo de personalizado é o
 * mesmo — inclusive os dois sem tipo, que é a urna comum.
 */
export function trocaPreservaLinha(deRescaldo: string | null | undefined, paraRescaldo: string | null | undefined): boolean {
  return (deRescaldo || null) === (paraRescaldo || null)
}

// ─────────────────────────────────────────────────────────────────────────────
// Gravação
// ─────────────────────────────────────────────────────────────────────────────

export type UrnaEscolhida = { id: string; codigo: string; rescaldo_tipo?: string | null }
export type LinhaUrna = { id: string; produto_id: string; rescaldo_tipo?: string | null }

type Resp = { data?: unknown; error: { message: string } | null }
type Cliente = {
  from: (t: string) => {
    insert: (v: unknown) => Promise<Resp>
    update: (v: unknown) => { eq: (c: string, v: unknown) => Promise<Resp> }
    delete: () => { eq: (c: string, v: unknown) => Promise<Resp> }
  }
  rpc: (fn: string, args: Record<string, unknown>) => Promise<Resp>
}

async function moverEstoque(sb: Cliente, produtoId: string, unidadeId: string | null, delta: number) {
  if (!unidadeId) return
  const { error } = await sb.rpc('ajustar_estoque_unidade', { p_produto_id: produtoId, p_unidade_id: unidadeId, p_delta: delta })
  // O produto já foi gravado; estoque errado não desfaz a venda. Fica no console, como no antigo.
  if (error) console.error('[urna] estoque não ajustado:', error.message)
}

/** Acrescenta uma urna ao contrato (linha nova) e baixa 1 no estoque da unidade DO CONTRATO. */
export async function adicionarUrna(cliente: unknown, p: {
  contratoId: string; unidadeId: string | null; urna: UrnaEscolhida; preco: number; desconto: number
}): Promise<void> {
  const sb = cliente as Cliente
  const { error } = await sb.from('contrato_produtos').insert({
    contrato_id: p.contratoId, produto_id: p.urna.id, quantidade: 1,
    valor: p.preco, desconto: p.desconto, rescaldo_feito: false,
  })
  if (error) throw new Error('Não consegui gravar a urna: ' + error.message)
  await moverEstoque(sb, p.urna.id, p.unidadeId, -1)
}

/**
 * Troca UMA linha de urna por outra. Mesmo tipo de personalizado → UPDATE na linha (preserva
 * tarefa/foto/feito/nota). Tipo diferente → apaga a linha e insere outra (o chamador já avisou).
 */
export async function trocarUrna(cliente: unknown, p: {
  contratoId: string; unidadeId: string | null; linha: LinhaUrna; urna: UrnaEscolhida; preco: number; desconto: number
}): Promise<'preservada' | 'recriada'> {
  const sb = cliente as Cliente
  if (trocaPreservaLinha(p.linha.rescaldo_tipo, p.urna.rescaldo_tipo)) {
    const { error } = await sb.from('contrato_produtos')
      .update({ produto_id: p.urna.id, valor: p.preco, desconto: p.desconto }).eq('id', p.linha.id)
    if (error) throw new Error('Não consegui trocar a urna: ' + error.message)
    if (p.linha.produto_id !== p.urna.id) {
      await moverEstoque(sb, p.linha.produto_id, p.unidadeId, +1)
      await moverEstoque(sb, p.urna.id, p.unidadeId, -1)
    }
    return 'preservada'
  }
  const { error } = await sb.from('contrato_produtos').delete().eq('id', p.linha.id)
  if (error) throw new Error('Não consegui tirar a urna antiga: ' + error.message)
  await moverEstoque(sb, p.linha.produto_id, p.unidadeId, +1)
  await adicionarUrna(cliente, { contratoId: p.contratoId, unidadeId: p.unidadeId, urna: p.urna, preco: p.preco, desconto: p.desconto })
  return 'recriada'
}
