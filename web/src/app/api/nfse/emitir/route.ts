/**
 * API Route para emissão de NFS-e
 * POST /api/nfse/emitir
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  extrairCertificado,
  validarCertificado,
  construirRps,
  construirLoteRps,
  assinarRps,
  emitirNfse,
  CONFIG_SANTOS,
  type DadosRps
} from '@/lib/nfse'

// Supabase Admin (para acessar storage com service role)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface RequestBody {
  contrato_id: string
  ambiente?: 'producao' | 'homologacao'
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json()
    const { contrato_id, ambiente = 'homologacao' } = body

    // 1. Buscar contrato com dados do tutor
    const { data: contrato, error: errContrato } = await supabaseAdmin
      .from('contratos')
      .select(`
        *,
        tutor:tutores(*)
      `)
      .eq('id', contrato_id)
      .single()

    if (errContrato || !contrato) {
      return NextResponse.json(
        { erro: 'Contrato não encontrado' },
        { status: 404 }
      )
    }

    // 2. Buscar configurações da empresa (certificado, etc)
    const { data: config, error: errConfig } = await supabaseAdmin
      .from('configuracoes')
      .select('*')
      .eq('chave', 'nfse')
      .single()

    if (errConfig || !config?.valor) {
      return NextResponse.json(
        { erro: 'Configurações de NFS-e não encontradas. Configure o certificado digital primeiro.' },
        { status: 400 }
      )
    }

    const configNfse = config.valor as {
      cnpj: string
      inscricaoMunicipal: string
      certificadoBase64: string
      senhaCertificado: string
      proximoRps: number
    }

    // 3. Extrair certificado
    const pfxBuffer = Buffer.from(configNfse.certificadoBase64, 'base64')
    const certificado = extrairCertificado(pfxBuffer, configNfse.senhaCertificado)

    // Validar validade do certificado
    const validacao = validarCertificado(certificado)
    if (!validacao.valido) {
      return NextResponse.json(
        { erro: validacao.mensagem },
        { status: 400 }
      )
    }

    // 4. Montar dados do RPS
    const tutor = contrato.tutor || {
      nome: contrato.tutor_nome,
      cpf: contrato.tutor_cpf,
      telefone: contrato.tutor_telefone,
      email: contrato.tutor_email,
      endereco: contrato.tutor_endereco,
      numero: contrato.tutor_numero,
      bairro: contrato.tutor_bairro,
      cidade: contrato.tutor_cidade,
      estado: contrato.tutor_estado,
      cep: contrato.tutor_cep
    }

    // Calcular valor total
    const valorServicos = (contrato.valor_plano || 0) +
      (contrato.valor_acessorios || 0) -
      (contrato.desconto_plano || 0) -
      (contrato.desconto_acessorios || 0)

    if (valorServicos <= 0) {
      return NextResponse.json(
        { erro: 'Valor do serviço deve ser maior que zero' },
        { status: 400 }
      )
    }

    const dadosRps: DadosRps = {
      numero: configNfse.proximoRps,
      serie: 'RPS',
      tipo: 1,
      dataEmissao: new Date(),
      naturezaOperacao: 1, // Tributação no município
      optanteSimplesNacional: false, // Ajustar conforme empresa
      incentivadorCultural: false,
      prestador: {
        cnpj: configNfse.cnpj,
        inscricaoMunicipal: configNfse.inscricaoMunicipal
      },
      tomador: {
        cpfCnpj: tutor.cpf || '00000000000',
        razaoSocial: tutor.nome,
        endereco: tutor.endereco,
        numero: tutor.numero,
        bairro: tutor.bairro,
        codigoMunicipio: CONFIG_SANTOS.codigoMunicipio,
        uf: tutor.estado || 'SP',
        cep: tutor.cep,
        telefone: tutor.telefone,
        email: tutor.email
      },
      servico: {
        valorServicos,
        aliquota: CONFIG_SANTOS.aliquotaPadrao,
        itemListaServico: CONFIG_SANTOS.servicos.cremacao,
        discriminacao: `Serviços funerários - Cremação ${contrato.tipo_cremacao === 'individual' ? 'Individual' : 'Coletiva'} - Pet: ${contrato.pet_nome} - Contrato: ${contrato.codigo}`,
        codigoMunicipio: CONFIG_SANTOS.codigoMunicipio
      }
    }

    // 5. Construir e assinar RPS
    const { xml: rpsXml, infRpsId } = construirRps(dadosRps)
    const rpsAssinado = assinarRps(rpsXml, certificado, infRpsId)

    // 6. Construir lote
    const loteXml = construirLoteRps(dadosRps.prestador, [rpsAssinado])

    // 7. Enviar para GISS
    const resultado = await emitirNfse(
      { ambiente, certificado },
      loteXml
    )

    if (!resultado.sucesso) {
      return NextResponse.json(
        {
          erro: 'Erro ao emitir NFS-e',
          detalhes: resultado.erros,
          xmlEnviado: loteXml,
          xmlResposta: resultado.xmlResposta
        },
        { status: 400 }
      )
    }

    // 8. Atualizar contrato com dados da NFS-e
    await supabaseAdmin
      .from('contratos')
      .update({
        nfse_numero: resultado.protocolo,
        nfse_data: new Date().toISOString(),
        nfse_status: 'emitida'
      })
      .eq('id', contrato_id)

    // 9. Incrementar número do RPS
    await supabaseAdmin
      .from('configuracoes')
      .update({
        valor: {
          ...configNfse,
          proximoRps: configNfse.proximoRps + 1
        }
      })
      .eq('chave', 'nfse')

    return NextResponse.json({
      sucesso: true,
      protocolo: resultado.protocolo,
      numeroLote: resultado.numeroLote,
      dataRecebimento: resultado.dataRecebimento,
      mensagem: validacao.mensagem // Aviso de expiração se houver
    })

  } catch (error) {
    console.error('Erro ao emitir NFS-e:', error)
    return NextResponse.json(
      { erro: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    )
  }
}
