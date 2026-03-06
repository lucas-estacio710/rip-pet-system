/**
 * Cliente SOAP para o WebService GISS Online (Santos/SP)
 * Padrão ABRASF 2.04
 */

import * as soap from 'soap'
import https from 'https'
import type { CertificadoExtraido } from './certificado'

// URLs do WebService GISS Santos
const WSDL_PRODUCAO = 'https://ws-santos.giss.com.br/service-ws/nf/nfse-ws?wsdl'
const WSDL_HOMOLOGACAO = 'https://v2-ws-homologacao.giss.com.br/service-ws/nf/nfse-ws?wsdl'

export interface ConfiguracaoCliente {
  ambiente: 'producao' | 'homologacao'
  certificado: CertificadoExtraido
}

export interface RespostaEnvioLote {
  sucesso: boolean
  protocolo?: string
  numeroLote?: string
  dataRecebimento?: string
  erros?: Array<{
    codigo: string
    mensagem: string
    correcao?: string
  }>
  xmlResposta?: string
}

export interface RespostaConsultaNfse {
  sucesso: boolean
  nfse?: {
    numero: string
    codigoVerificacao: string
    dataEmissao: string
    valorServicos: number
    valorIss: number
    linkPdf?: string
  }
  erros?: Array<{
    codigo: string
    mensagem: string
  }>
  xmlResposta?: string
}

/**
 * Cria um cliente SOAP autenticado com certificado digital
 */
export async function criarCliente(config: ConfiguracaoCliente): Promise<soap.Client> {
  const wsdlUrl = config.ambiente === 'producao' ? WSDL_PRODUCAO : WSDL_HOMOLOGACAO

  // Configurar agente HTTPS com certificado
  const httpsAgent = new https.Agent({
    cert: config.certificado.certificadoPem,
    key: config.certificado.chavePrivadaPem,
    rejectUnauthorized: true
  })

  const options = {
    wsdl_options: {
      httpsAgent
    },
    // Timeout de 60 segundos
    request: {
      timeout: 60000,
      httpsAgent
    }
  } as unknown as soap.IOptions

  return new Promise((resolve, reject) => {
    soap.createClient(wsdlUrl, options, (err, client) => {
      if (err) {
        reject(new Error(`Erro ao criar cliente SOAP: ${err.message}`))
        return
      }

      // Configurar o client para usar o mesmo agente HTTPS
      client.setSecurity(new soap.ClientSSLSecurity(
        config.certificado.chavePrivadaPem,
        config.certificado.certificadoPem,
        {} // CA certs (deixar vazio para usar defaults)
      ))

      resolve(client)
    })
  })
}

/**
 * Envia lote de RPS para processamento
 */
export async function enviarLoteRps(
  client: soap.Client,
  xmlLote: string
): Promise<RespostaEnvioLote> {
  return new Promise((resolve) => {
    // O método pode ser RecepcionarLoteRps ou EnviarLoteRps dependendo da versão
    const methodName = 'RecepcionarLoteRps'

    const args = {
      xml: xmlLote
    }

    client[methodName](args, (err: Error | null, result: unknown, rawResponse: string) => {
      if (err) {
        resolve({
          sucesso: false,
          erros: [{
            codigo: 'SOAP_ERROR',
            mensagem: err.message
          }],
          xmlResposta: rawResponse
        })
        return
      }

      // Parsear resposta
      const resposta = parseRespostaEnvio(rawResponse)
      resolve(resposta)
    })
  })
}

/**
 * Consulta NFS-e por número do RPS
 */
export async function consultarNfsePorRps(
  client: soap.Client,
  xmlConsulta: string
): Promise<RespostaConsultaNfse> {
  return new Promise((resolve) => {
    const args = {
      xml: xmlConsulta
    }

    client.ConsultarNfsePorRps(args, (err: Error | null, result: unknown, rawResponse: string) => {
      if (err) {
        resolve({
          sucesso: false,
          erros: [{
            codigo: 'SOAP_ERROR',
            mensagem: err.message
          }]
        })
        return
      }

      const resposta = parseRespostaConsulta(rawResponse)
      resolve(resposta)
    })
  })
}

/**
 * Cancela uma NFS-e emitida
 */
export async function cancelarNfse(
  client: soap.Client,
  xmlCancelamento: string
): Promise<{ sucesso: boolean; erros?: Array<{ codigo: string; mensagem: string }> }> {
  return new Promise((resolve) => {
    const args = {
      xml: xmlCancelamento
    }

    client.CancelarNfse(args, (err: Error | null, result: unknown, rawResponse: string) => {
      if (err) {
        resolve({
          sucesso: false,
          erros: [{
            codigo: 'SOAP_ERROR',
            mensagem: err.message
          }]
        })
        return
      }

      // Verificar se tem erros na resposta
      const temErro = rawResponse.includes('<ListaMensagemRetorno>') ||
                      rawResponse.includes('<MensagemRetorno>')

      if (temErro) {
        const erros = parseErros(rawResponse)
        resolve({ sucesso: false, erros })
      } else {
        resolve({ sucesso: true })
      }
    })
  })
}

/**
 * Parseia a resposta de envio de lote
 */
function parseRespostaEnvio(xml: string): RespostaEnvioLote {
  // Verificar se tem erros
  if (xml.includes('<ListaMensagemRetorno>') || xml.includes('<MensagemRetorno>')) {
    const erros = parseErros(xml)
    return {
      sucesso: false,
      erros,
      xmlResposta: xml
    }
  }

  // Extrair dados de sucesso
  const protocolo = extrairTagXml(xml, 'Protocolo')
  const numeroLote = extrairTagXml(xml, 'NumeroLote')
  const dataRecebimento = extrairTagXml(xml, 'DataRecebimento')

  return {
    sucesso: true,
    protocolo: protocolo || undefined,
    numeroLote: numeroLote || undefined,
    dataRecebimento: dataRecebimento || undefined,
    xmlResposta: xml
  }
}

/**
 * Parseia a resposta de consulta de NFS-e
 */
function parseRespostaConsulta(xml: string): RespostaConsultaNfse {
  // Verificar se tem erros
  if (xml.includes('<ListaMensagemRetorno>') || xml.includes('<MensagemRetorno>')) {
    const erros = parseErros(xml)
    return {
      sucesso: false,
      erros,
      xmlResposta: xml
    }
  }

  // Extrair dados da NFS-e
  const numero = extrairTagXml(xml, 'Numero')
  const codigoVerificacao = extrairTagXml(xml, 'CodigoVerificacao')
  const dataEmissao = extrairTagXml(xml, 'DataEmissao')
  const valorServicos = extrairTagXml(xml, 'ValorServicos')
  const valorIss = extrairTagXml(xml, 'ValorIss')

  if (!numero) {
    return {
      sucesso: false,
      erros: [{ codigo: 'NOT_FOUND', mensagem: 'NFS-e não encontrada' }],
      xmlResposta: xml
    }
  }

  return {
    sucesso: true,
    nfse: {
      numero,
      codigoVerificacao: codigoVerificacao || '',
      dataEmissao: dataEmissao || '',
      valorServicos: parseFloat(valorServicos || '0'),
      valorIss: parseFloat(valorIss || '0')
    },
    xmlResposta: xml
  }
}

/**
 * Parseia erros da resposta XML
 */
function parseErros(xml: string): Array<{ codigo: string; mensagem: string; correcao?: string }> {
  const erros: Array<{ codigo: string; mensagem: string; correcao?: string }> = []

  // Regex para encontrar mensagens de erro
  const regex = /<MensagemRetorno>[\s\S]*?<Codigo>(.*?)<\/Codigo>[\s\S]*?<Mensagem>(.*?)<\/Mensagem>[\s\S]*?(?:<Correcao>(.*?)<\/Correcao>)?[\s\S]*?<\/MensagemRetorno>/g

  let match
  while ((match = regex.exec(xml)) !== null) {
    erros.push({
      codigo: match[1] || 'UNKNOWN',
      mensagem: match[2] || 'Erro desconhecido',
      correcao: match[3] || undefined
    })
  }

  // Se não encontrou erros no formato padrão, tentar extrair de outra forma
  if (erros.length === 0) {
    const codigo = extrairTagXml(xml, 'Codigo')
    const mensagem = extrairTagXml(xml, 'Mensagem')
    if (codigo || mensagem) {
      erros.push({
        codigo: codigo || 'UNKNOWN',
        mensagem: mensagem || 'Erro desconhecido'
      })
    }
  }

  return erros
}

/**
 * Extrai valor de uma tag XML (simples, sem namespace)
 */
function extrairTagXml(xml: string, tag: string): string | null {
  // Tentar com namespace
  let regex = new RegExp(`<(?:[a-z]+:)?${tag}[^>]*>([^<]*)<\/(?:[a-z]+:)?${tag}>`, 'i')
  let match = xml.match(regex)
  if (match) return match[1].trim()

  // Tentar sem namespace
  regex = new RegExp(`<${tag}>([^<]*)<\/${tag}>`, 'i')
  match = xml.match(regex)
  return match ? match[1].trim() : null
}

/**
 * Função de alto nível para emitir uma NFS-e completa
 * (cria cliente, envia lote, aguarda processamento, retorna resultado)
 */
export async function emitirNfse(
  config: ConfiguracaoCliente,
  xmlLoteAssinado: string
): Promise<RespostaEnvioLote> {
  try {
    // Criar cliente
    const client = await criarCliente(config)

    // Enviar lote
    const resposta = await enviarLoteRps(client, xmlLoteAssinado)

    return resposta
  } catch (error) {
    return {
      sucesso: false,
      erros: [{
        codigo: 'CLIENT_ERROR',
        mensagem: error instanceof Error ? error.message : 'Erro desconhecido'
      }]
    }
  }
}
