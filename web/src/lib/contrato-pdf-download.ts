/**
 * Helper compartilhado pra gerar e baixar o PDF do contrato a partir do ID.
 * Usado pelo DocMenu no pipeline (/contratos) e no detalhe (/contratos/[id]).
 *
 * Busca:
 *   - contrato completo (todos os campos)
 *   - ficha vinculada (forma de pagamento e parcelas — fonte: opção do tutor)
 *   - tutor (endereço/cpf/email completos)
 *   - unidade (nome/cidade/estado)
 *
 * Monta o payload pro gerarContratoPDF, baixa o blob como arquivo.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { gerarContratoPDF, contratoFilename } from './contrato-pdf'
import { comAvisoGerando } from './aviso-gerando'

export function baixarContratoPDF(supabase: SupabaseClient, contratoId: string): Promise<void> {
  // O aviso cobre também as consultas ao banco, não só a montagem do PDF
  return comAvisoGerando('Gerando o contrato…', () => montarEBaixar(supabase, contratoId))
}

async function montarEBaixar(supabase: SupabaseClient, contratoId: string): Promise<void> {
  // Contrato e ficha em paralelo (a ficha só depende do id) — eram 4 consultas em fila
  const [{ data: full }, { data: ficha }] = await Promise.all([
    supabase.from('contratos').select('*').eq('id', contratoId).single(),
    // Forma de pagamento e parcelas vêm da FICHA (opção do tutor), não da tabela pagamentos.
    // op_dados traz o toggle camposAssinatura (PV) definido no processamento.
    supabase
      .from('fichas')
      .select('pagamento, parcelas, op_dados')
      .eq('contrato_id', contratoId)
      .order('created_at', { ascending: true })
      .limit(1),
  ])
  if (!full) throw new Error('Contrato não encontrado')
  const fi = ((ficha as { pagamento: string | null; parcelas: string | null; op_dados: Record<string, unknown> | null }[] | null) || [])[0] || null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f: any = full

  // Unidade (nome) e tutor (endereço/cpf/email completos), em paralelo
  const [uRes, tRes] = await Promise.all([
    f.unidade_id ? supabase.from('unidades').select('cidade, estado').eq('id', f.unidade_id).single() : null,
    f.tutor_id ? supabase.from('tutores').select('*').eq('id', f.tutor_id).single() : null,
  ])
  let nomeUnidade = 'Santos - SP'
  const ud = (uRes?.data ?? null) as { cidade: string; estado: string } | null
  if (ud) nomeUnidade = `${ud.cidade} - ${ud.estado}`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tutorObj: any = tRes?.data ?? null

  const blob = await gerarContratoPDF({
    codigo: f.codigo,
    lacre: f.numero_lacre,
    tutorNome: tutorObj?.nome || f.tutor_nome,
    tutorTelefone: tutorObj?.telefone || f.tutor_telefone || '',
    tutorCpf: tutorObj?.cpf || f.tutor_cpf || '',
    tutorEmail: tutorObj?.email || f.tutor_email,
    tutorEndereco: tutorObj
      ? `${tutorObj.endereco || ''}${tutorObj.numero ? ', ' + tutorObj.numero : ''}${tutorObj.complemento ? ' - ' + tutorObj.complemento : ''}`
      : f.tutor_endereco,
    tutorEstado: tutorObj?.estado || f.tutor_estado,
    tutorCidade: tutorObj?.cidade || f.tutor_cidade,
    tutorBairro: tutorObj?.bairro || f.tutor_bairro,
    tutorCep: tutorObj?.cep || f.tutor_cep,
    petNome: f.pet_nome,
    petEspecie: f.pet_especie,
    petRaca: f.pet_raca,
    petIdade: f.pet_idade_anos,
    petCor: f.pet_cor,
    petGenero: f.pet_genero,
    petPeso: f.pet_peso,
    localColeta: f.local_coleta,
    tipoCremacao: f.tipo_cremacao as 'individual' | 'coletiva',
    valorPlano: f.valor_plano,
    metodoPagamento: fi?.pagamento || null,
    parcelas: fi?.parcelas ? (parseInt(fi.parcelas, 10) || null) : null,
    velorioDeseja: f.velorio_deseja ?? null,
    acompanhamentoOnline: f.acompanhamento_online ?? false,
    acompanhamentoPresencial: f.acompanhamento_presencial ?? false,
    descricaoContrato: f.descricao_contrato ?? null,
    // Campos pro cálculo do total no PDF (cada um no seu lugar — sem empilhar)
    valorAcessorios: f.valor_acessorios ?? null,
    descontoPlanoUnificado: f.desconto_plano_unificado ?? null,
    descontoAcessorios: f.desconto_acessorios ?? null,
    descontoAcessoriosAjuste: f.desconto_acessorios_ajuste ?? null,
    tipoPlano: f.tipo_plano ?? null,
    dataContrato: f.data_contrato ?? null,
    assinaturaCampos: !!(fi?.op_dados as Record<string, unknown> | null)?.camposAssinatura,
  }, nomeUnidade)

  // Download
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = contratoFilename(f.codigo, f.pet_nome)
  a.click()
  // Revogar no mesmo tick pode cancelar o download no celular (o navegador ainda não leu o blob)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
