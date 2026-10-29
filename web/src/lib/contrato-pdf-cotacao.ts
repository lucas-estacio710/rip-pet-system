/**
 * Contrato em PDF pela COTAÇÃO (a ficha e o `op_dados` do processamento), não pelo contrato vivo.
 *
 * Regra do Lucas (29/10/2026): "Baixar da aba fichas, ou em /tarefas, sempre a renderização de
 * cotação, op_dados." O contrato vivo soma `valor_acessorios` — e os produtos lançados no Iniciar
 * Fluxo podem ser itens que já eram inclusos no plano, com o desconto ficando pro pagamento. No
 * ALF (ST, 29/10) a cotação era R$ 1.750, o popup de acolhimento do /tarefas imprimiu o contrato
 * vivo (R$ 2.070) e o tutor pagou R$ 2.070.
 *
 * Porta única dos 3 lugares: /fichas (`gerarPdfFicha`), o popup de remoção do /tarefas antes do
 * contrato existir (`gerarPdfDaFicha`) e o `AtivacaoPVModal` aberto pelo /tarefas
 * (`baixarContratoCotacaoPDF`). Pipeline e /contratos/[id] seguem com o contrato vivo
 * (`baixarContratoPDF`).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { gerarContratoPDF, contratoFilename, type DadosContrato } from './contrato-pdf'
import { baixarContratoPDF } from './contrato-pdf-download'
import { comAvisoGerando } from './aviso-gerando'

/** Colunas da ficha que `dadosContratoDaCotacao` lê. */
export type FichaCotacao = {
  nome_completo: string | null
  telefone: string | null
  cpf: string | null
  email: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  estado: string | null
  cidade: string | null
  bairro: string | null
  cep: string | null
  nome_pet: string | null
  especie: string | null
  raca: string | null
  idade: string | null
  cor: string | null
  genero: string | null
  peso: string | null
  cremacao: string | null
  localizacao: string | null
  localizacao_outra: string | null
  velorio: string | null
  acompanhamento: string | null
  pagamento: string | null
  parcelas: string | null
  tipo_plano?: string | null
  /** Valor do plano escolhido pelo tutor na ficha pública (mig 098) — fallback do `op.valorPlano`. */
  valor?: number | null
  op_dados: Record<string, unknown> | null
}

/**
 * Ficha + op_dados → dados do PDF. Puro.
 * `lacre`: o digitado na hora (popup de acolhimento); sem ele, o do processamento (`op.lacre`).
 */
export function dadosContratoDaCotacao(
  ficha: FichaCotacao,
  opts: { temPadronizacaoClinicas: boolean; lacre?: string | null },
): DadosContrato {
  const op = (ficha.op_dados || {}) as Record<string, unknown>
  const opLocalColeta = op.localColeta as string | null
  const localPdf = op.semLocal ? '' : opLocalColeta === 'clinica' ? ((opts.temPadronizacaoClinicas ? (op.estabNome as string) : (op.clinicaTextoLivre as string)) || ficha.localizacao)
    : opLocalColeta === 'outro' ? ((op.enderecoOutro as string) || ficha.localizacao_outra || '')
    : opLocalColeta === 'residencia' ? 'Residência (Endereço de Cadastro)'
    : opLocalColeta === 'unidade' ? 'Unidade RIP PET'
    : ficha.localizacao
  const lacre = opts.lacre !== undefined ? opts.lacre : (op.semLacre ? null : (op.lacre ? String(op.lacre) : null))
  const descontoPreVenda = op.descontoPreVenda ? parseFloat(String(op.descontoPreVenda)) : 0

  return {
    codigo: String(op.codigo || ''),
    lacre,
    tutorNome: ficha.nome_completo || '',
    tutorTelefone: ficha.telefone || '',
    tutorCpf: ficha.cpf || '',
    tutorEmail: ficha.email,
    tutorEndereco: ficha.endereco ? `${ficha.endereco}, ${ficha.numero}${ficha.complemento ? ` - ${ficha.complemento}` : ''}` : null,
    tutorEstado: ficha.estado,
    tutorCidade: ficha.cidade,
    tutorBairro: ficha.bairro,
    tutorCep: ficha.cep,
    petNome: ficha.nome_pet || '',
    petEspecie: ficha.especie,
    petRaca: ficha.raca,
    petIdade: ficha.idade ? parseInt(ficha.idade) || null : null,
    petCor: ficha.cor,
    petGenero: ficha.genero,
    petPeso: ficha.peso ? parseFloat(ficha.peso) || null : null,
    localColeta: localPdf,
    tipoCremacao: ficha.cremacao?.toLowerCase() as 'individual' | 'coletiva',
    valorPlano: (() => {
      const vp = op.valorPlano ? parseFloat(String(op.valorPlano)) : (ficha.valor ?? null)
      if (!vp) return null
      const dt = (op.descontoTipo as string) || 'valor'
      const dr = dt === 'percentual' ? (vp * descontoPreVenda) / 100 : descontoPreVenda
      return Math.max(vp - dr, 0)
    })(),
    metodoPagamento: ficha.pagamento || null,
    parcelas: ficha.parcelas ? parseInt(String(ficha.parcelas).replace(/\D/g, '')) || null : null,
    velorioDeseja: ficha.velorio === 'Sim' ? true : ficha.velorio === 'Não' ? false : null,
    acompanhamentoOnline: /v[ií]deo|on-?line/i.test(ficha.acompanhamento || ''),
    acompanhamentoPresencial: /presencial/i.test(ficha.acompanhamento || ''),
    temDesconto: descontoPreVenda > 0,
    dataAcolhimento: op.semDataHora ? null : (op.dataHoraAcolhimento as string) || null,
    tipoPlano: ficha.tipo_plano === 'preventivo' ? 'preventivo' : 'emergencial',
    dataContrato: (op.dataContrato as string) || null,
    descricaoContrato: (op.detalhamentoPlano as string) || null,
    assinaturaCampos: !!op.camposAssinatura,
  }
}

/** Baixa o blob como arquivo (revogar no mesmo tick pode cancelar o download no celular). */
export function baixarBlobContrato(blob: Blob, codigo: string, petNome: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = contratoFilename(codigo, petNome)
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Contrato pela cotação a partir do id do CONTRATO (o popup já tem o contrato, não a ficha).
 * Contrato sem ficha vinculada (legado/importado) cai no contrato vivo, com aviso no console.
 */
export function baixarContratoCotacaoPDF(
  supabase: SupabaseClient,
  contratoId: string,
  opts: { lacre?: string | null } = {},
): Promise<void> {
  return comAvisoGerando('Gerando o contrato…', async () => {
    const { data, error } = await supabase
      .from('fichas')
      .select('*')
      .eq('contrato_id', contratoId)
      .order('created_at', { ascending: true })
      .limit(1)
    if (error) throw error
    const ficha = ((data || [])[0] || null) as (FichaCotacao & { unidade_id: string | null }) | null
    if (!ficha || !ficha.op_dados) {
      console.warn(`[contrato-pdf-cotacao] contrato ${contratoId} sem ficha com op_dados — imprimindo o contrato vivo`)
      return baixarContratoPDF(supabase, contratoId)
    }

    const { data: u } = ficha.unidade_id
      ? await supabase.from('unidades').select('cidade, estado, modulos_ativos').eq('id', ficha.unidade_id).maybeSingle()
      : { data: null }
    const unidade = u as { cidade: string; estado: string; modulos_ativos: string[] | null } | null
    const nomeUnidade = unidade ? `${unidade.cidade} - ${unidade.estado}` : 'Santos - SP'

    const dados = dadosContratoDaCotacao(ficha, {
      temPadronizacaoClinicas: !!unidade?.modulos_ativos?.includes('cb_padronizacao_clinicas'),
      lacre: opts.lacre,
    })
    const blob = await gerarContratoPDF(dados, nomeUnidade)
    baixarBlobContrato(blob, dados.codigo || 'CONTRATO', dados.petNome || 'PET')
  })
}
