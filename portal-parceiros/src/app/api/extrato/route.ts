import { createAdminClient } from '@/lib/supabase/admin'
import { getParceiroSessao, respostaSessaoInvalida, SessaoInvalida } from '@/lib/sessao'
import { inicioJanela, progressoCategoria } from '@/lib/categoria'

/**
 * Extrato do parceiro (decisão #16).
 *
 * As indicações NÃO têm tabela própria: derivam de `contratos` com `contato_id` = ele,
 * usando `comissao_valor` / `comissao_paga` (mig 085). Assim o extrato mostra sempre o
 * mesmo número que o admin vê na fila de pagamento — não há duas verdades.
 */
export async function GET() {
  let sessao
  try {
    sessao = await getParceiroSessao()
  } catch (e) {
    if (e instanceof SessaoInvalida) return respostaSessaoInvalida(e)
    throw e
  }

  const admin = createAdminClient()

  const { data: contratos } = await admin
    .from('contratos')
    .select('id, codigo, pet_nome, tutor_nome, tipo_cremacao, data_contrato, comissao_valor, comissao_paga, status')
    .eq('contato_id', sessao.contatoId)
    .order('data_contrato', { ascending: false })
    .limit(500)

  const { data: pagamentos } = await admin
    .from('parceiro_pagamentos')
    .select('id, valor_total, pago_em, comprovante_url, observacao')
    .eq('contato_id', sessao.contatoId)
    .order('pago_em', { ascending: false })
    .limit(100)

  const lista = contratos ?? []
  const aReceber = lista
    .filter((c) => !c.comissao_paga && Number(c.comissao_valor ?? 0) > 0)
    .reduce((s, c) => s + Number(c.comissao_valor ?? 0), 0)
  const recebido = (pagamentos ?? []).reduce((s, p) => s + Number(p.valor_total), 0)

  // Série mensal dos últimos 12 meses (gráfico da decisão #16)
  const serie: Record<string, { indicacoes: number; valor: number }> = {}
  for (let i = 11; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    serie[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = {
      indicacoes: 0, valor: 0,
    }
  }
  for (const c of lista) {
    if (!c.data_contrato) continue
    const k = String(c.data_contrato).slice(0, 7)
    if (serie[k]) {
      serie[k].indicacoes += 1
      serie[k].valor += Number(c.comissao_valor ?? 0)
    }
  }

  const desde = inicioJanela()
  const naJanela = lista.filter(
    (c) => c.data_contrato && String(c.data_contrato) >= desde.toISOString().slice(0, 10)
  )
  const progresso = progressoCategoria(naJanela.length, sessao.config.faixas)

  return Response.json({
    resumo: {
      aReceber,
      recebido,
      totalIndicacoes: lista.length,
    },
    categoria: {
      ...progresso,
      indicacoesNaJanela: naJanela.length,
      janelaDesde: desde.toISOString().slice(0, 10),
      // Quando cada pet sai da conta — é o que cria urgência sem ninguém cobrar.
      saindoDaJanela: naJanela
        .slice(-5)
        .map((c) => {
          const sai = new Date(c.data_contrato!)
          sai.setFullYear(sai.getFullYear() + 1)
          return { pet: c.pet_nome, saiEm: sai.toISOString().slice(0, 10) }
        })
        .sort((a, b) => a.saiEm.localeCompare(b.saiEm)),
    },
    indicacoes: lista.map((c) => ({
      id: c.id,
      pet: c.pet_nome,
      tutor: c.tutor_nome,
      tipo: c.tipo_cremacao,
      data: c.data_contrato,
      valor: Number(c.comissao_valor ?? 0),
      situacao: c.comissao_paga
        ? 'paga'
        : Number(c.comissao_valor ?? 0) > 0
          ? 'a_receber'
          : 'sem_comissao',
    })),
    pagamentos: pagamentos ?? [],
    serie: Object.entries(serie).map(([mes, v]) => ({ mes, ...v })),
  })
}
