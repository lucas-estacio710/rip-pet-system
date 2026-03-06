/**
 * Módulo de NFS-e para integração com GISS Online (Santos/SP)
 *
 * Uso básico:
 *
 * 1. Extrair certificado do arquivo PFX:
 *    const cert = extrairCertificado(pfxBuffer, senha)
 *
 * 2. Construir e assinar RPS:
 *    const { xml, infRpsId } = construirRps(dadosRps)
 *    const rpsAssinado = assinarRps(xml, cert, infRpsId)
 *
 * 3. Construir lote e enviar:
 *    const lote = construirLoteRps(prestador, [rpsAssinado])
 *    const resultado = await emitirNfse({ ambiente: 'homologacao', certificado: cert }, lote)
 */

// Certificado
export {
  extrairCertificado,
  validarCertificado,
  type CertificadoExtraido
} from './certificado'

// Assinatura
export {
  assinarXml,
  assinarRps,
  assinarLote,
  normalizarXml
} from './assinatura'

// XML Builder
export {
  construirRps,
  construirLoteRps,
  construirConsultaNfsePorRps,
  construirCancelamentoNfse,
  type DadosPrestador,
  type DadosTomador,
  type DadosServico,
  type DadosRps
} from './xml-builder'

// Cliente SOAP
export {
  criarCliente,
  enviarLoteRps,
  consultarNfsePorRps,
  cancelarNfse,
  emitirNfse,
  type ConfiguracaoCliente,
  type RespostaEnvioLote,
  type RespostaConsultaNfse
} from './client'

/**
 * Configurações padrão para Santos/SP
 */
export const CONFIG_SANTOS = {
  codigoMunicipio: '3548500',
  // Códigos de serviço comuns
  servicos: {
    cremacao: '14.01', // Serviços funerários
    urnas: '14.01'
  },
  // Alíquota padrão ISS Santos
  aliquotaPadrao: 0.05 // 5%
}
