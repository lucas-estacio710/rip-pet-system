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

export async function baixarContratoPDF(supabase: SupabaseClient, contratoId: string): Promise<void> {
  const { data: full } = await supabase.from('contratos').select('*').eq('id', contratoId).single()
  if (!full) throw new Error('Contrato não encontrado')

  // Forma de pagamento e parcelas vêm da FICHA (opção do tutor), não da tabela pagamentos.
  const { data: ficha } = await supabase
    .from('fichas')
    .select('pagamento, parcelas')
    .eq('contrato_id', contratoId)
    .order('created_at', { ascending: true })
    .limit(1)
  const fi = ((ficha as { pagamento: string | null; parcelas: string | null }[] | null) || [])[0] || null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f: any = full

  // Nome da unidade
  let nomeUnidade = 'Santos - SP'
  if (f.unidade_id) {
    const { data: u } = await supabase.from('unidades').select('cidade, estado').eq('id', f.unidade_id).single()
    const ud = u as { cidade: string; estado: string } | null
    if (ud) nomeUnidade = `${ud.cidade} - ${ud.estado}`
  }

  // Tutor (endereço/cpf/email completos)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tutorObj: any = null
  if (f.tutor_id) {
    const { data: t } = await supabase.from('tutores').select('*').eq('id', f.tutor_id).single()
    tutorObj = t
  }

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
  }, nomeUnidade)

  // Download
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = contratoFilename(f.codigo, f.pet_nome)
  a.click()
  URL.revokeObjectURL(url)
}
