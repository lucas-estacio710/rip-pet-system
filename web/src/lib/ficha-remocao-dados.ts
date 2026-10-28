// ============================================================================
// Dados da FICHA DE REMOÇÃO (`FichaRemocaoDoc`) a partir do contrato, pra baixar no popup de
// acolhimento do /tarefas (28/10/2026, pedido do Lucas): a mesma ficha que a
// /gruposencaminhamentos manda pro grupo, só que ANTES do acolhimento — quem vai buscar o pet
// leva a folha. Vale pras duas tarefas (remoção EM e ativação PV): as duas já nascem com contrato
// (medido em 28/10/2026: 200 de 200 tarefas com `contrato_id`). O que só nasce no acolhimento
// (data/hora, às vezes o lacre) sai em branco, pra preencher à mão.
//
// Mesma precedência da /gruposencaminhamentos (`montarFicha`): cadastro do tutor na frente,
// snapshot do contrato como fallback. Puro.
// ============================================================================

import type { FichaContratoData } from '../components/fichas/FichaRemocao'

/** Colunas do contrato que `fichaDeContrato` lê. */
export const CAMPOS_FICHA_CONTRATO = `
  id, codigo, numero_lacre, tipo_cremacao, data_acolhimento,
  pet_nome, pet_especie, pet_raca, pet_cor, pet_idade_anos, pet_peso, pet_genero,
  certificado_nome_1, certificado_nome_2, certificado_nome_3, certificado_nome_4,
  certificado_nome_5, certificado_nome_6, certificado_nome_7,
  local_coleta, clinica_coleta, observacoes, remocao_cidade,
  tutor_nome, tutor_telefone, tutor_telefone2, tutor_telefone_nome, tutor_telefone2_nome,
  tutor_telefone_principal, tutor_endereco, tutor_bairro, tutor_cidade, tutor_cep,
  tutor:tutor_id ( nome, telefone, telefone2, telefone_principal, telefone_nome,
                   endereco, numero, complemento, bairro, cidade, estado, cep ),
  estabelecimento:estabelecimento_id ( nome )
`

export type LinhaFichaContrato = {
  id: string
  codigo: string
  numero_lacre: string | null
  tipo_cremacao: string | null
  data_acolhimento: string | null
  pet_nome: string
  pet_especie: string | null
  pet_raca: string | null
  pet_cor: string | null
  pet_idade_anos: number | null
  pet_peso: number | null
  pet_genero: string | null
  certificado_nome_1: string | null
  certificado_nome_2: string | null
  certificado_nome_3: string | null
  certificado_nome_4: string | null
  certificado_nome_5: string | null
  certificado_nome_6: string | null
  certificado_nome_7: string | null
  local_coleta: string | null
  clinica_coleta: string | null
  observacoes: string | null
  remocao_cidade: string | null
  tutor_nome: string | null
  tutor_telefone: string | null
  tutor_telefone2: string | null
  tutor_telefone_nome: string | null
  tutor_telefone2_nome: string | null
  tutor_telefone_principal: number | null
  tutor_endereco: string | null
  tutor_bairro: string | null
  tutor_cidade: string | null
  tutor_cep: string | null
  tutor: {
    nome: string | null; telefone: string | null; telefone2: string | null
    telefone_principal: number | null; telefone_nome: string | null
    endereco: string | null; numero: string | null; complemento: string | null
    bairro: string | null; cidade: string | null; estado: string | null; cep: string | null
  } | null
  estabelecimento: { nome: string | null } | null
}

/** Contrato (PV antes da ativação, ou qualquer outro) → dados da folha. */
export function fichaDeContrato(c: LinhaFichaContrato, extra: { colaborador?: string | null }): FichaContratoData {
  return {
    id: c.id,
    codigo: c.codigo,
    numero_lacre: c.numero_lacre,
    tipo_cremacao: c.tipo_cremacao === 'coletiva' ? 'coletiva' : 'individual',
    data_acolhimento: c.data_acolhimento,
    pet_nome: c.pet_nome,
    pet_especie: c.pet_especie,
    pet_raca: c.pet_raca,
    pet_cor: c.pet_cor,
    pet_idade_anos: c.pet_idade_anos,
    pet_peso: c.pet_peso,
    pet_genero: c.pet_genero,
    certificado_nome_1: c.certificado_nome_1,
    certificado_nome_2: c.certificado_nome_2,
    certificado_nome_3: c.certificado_nome_3,
    certificado_nome_4: c.certificado_nome_4,
    certificado_nome_5: c.certificado_nome_5,
    certificado_nome_6: c.certificado_nome_6,
    certificado_nome_7: c.certificado_nome_7,
    local_coleta: c.local_coleta,
    clinica_veterinaria: c.clinica_coleta || c.estabelecimento?.nome || null,
    colaborador_responsavel: extra.colaborador ?? null,
    observacoes: c.observacoes,
    tutor_telefone: c.tutor?.telefone || c.tutor_telefone || null,
    tutor_telefone2: c.tutor?.telefone2 || c.tutor_telefone2 || null,
    tutor_telefone_nome: c.tutor?.telefone_nome || c.tutor_telefone_nome,
    tutor_telefone2_nome: c.tutor_telefone2_nome,
    tutor_telefone_principal: c.tutor?.telefone_principal ?? c.tutor_telefone_principal ?? 1,
    remocao_cidade: c.remocao_cidade,
    tutor_nome: c.tutor?.nome || c.tutor_nome,
    tutor_endereco: c.tutor_endereco,
    tutor_bairro: c.tutor_bairro,
    tutor_cidade: c.tutor_cidade,
    tutor_cep: c.tutor_cep,
    tutor: c.tutor,
  }
}
