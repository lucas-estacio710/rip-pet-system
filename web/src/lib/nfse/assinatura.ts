/**
 * Módulo para assinatura digital de XML no padrão ABRASF
 * Usa xml-crypto para assinatura XMLDSig
 */

import { SignedXml } from 'xml-crypto'
import type { CertificadoExtraido } from './certificado'

/**
 * Classe customizada para incluir X509Certificate no KeyInfo
 */
class KeyInfoX509 {
  private certificadoX509: string

  constructor(certificadoX509: string) {
    this.certificadoX509 = certificadoX509
  }

  getKeyInfo(): string {
    return `<X509Data><X509Certificate>${this.certificadoX509}</X509Certificate></X509Data>`
  }

  getKey(): null {
    return null
  }
}

interface OpcoesAssinatura {
  /** ID do elemento a ser referenciado na assinatura */
  referenceId?: string
  /** XPath do elemento a ser assinado (ex: "//*[local-name()='InfRps']") */
  xpath?: string
}

/**
 * Assina um XML no padrão ABRASF (NFSe)
 * @param xml XML a ser assinado
 * @param certificado Certificado extraído do PFX
 * @param opcoes Opções de assinatura
 */
export function assinarXml(
  xml: string,
  certificado: CertificadoExtraido,
  opcoes: OpcoesAssinatura = {}
): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sig: any = new SignedXml({
    privateKey: certificado.chavePrivadaPem,
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1'
  })

  // Configurar KeyInfo com o certificado X509
  sig.keyInfoProvider = new KeyInfoX509(certificado.certificadoX509)

  // Configurar referência
  // Se tiver ID, usar URI com #ID, senão usar XPath
  const uri = opcoes.referenceId ? `#${opcoes.referenceId}` : ''
  const xpath = opcoes.xpath || "//*[local-name()='InfRps']"

  sig.addReference({
    xpath,
    uri,
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
    ]
  })

  // Computar assinatura
  sig.computeSignature(xml, {
    location: {
      reference: xpath,
      action: 'after'
    }
  })

  return sig.getSignedXml()
}

/**
 * Assina o InfRps de um RPS individual
 * @param rpsXml XML do RPS (elemento <Rps>)
 * @param certificado Certificado extraído
 * @param infRpsId ID do InfRps (atributo Id)
 */
export function assinarRps(
  rpsXml: string,
  certificado: CertificadoExtraido,
  infRpsId: string
): string {
  return assinarXml(rpsXml, certificado, {
    referenceId: infRpsId,
    xpath: `//*[local-name()='InfRps'][@Id='${infRpsId}']`
  })
}

/**
 * Assina o lote de RPS (envelope EnviarLoteRpsEnvio)
 * No padrão GISS/ABRASF, cada RPS é assinado individualmente
 * @param loteXml XML do lote completo
 * @param certificado Certificado extraído
 */
export function assinarLote(
  loteXml: string,
  certificado: CertificadoExtraido
): string {
  // O lote em si não precisa de assinatura no GISS
  // Apenas os RPS individuais são assinados
  return loteXml
}

/**
 * Remove BOM e normaliza quebras de linha do XML
 */
export function normalizarXml(xml: string): string {
  return xml
    .replace(/^\uFEFF/, '') // Remove BOM
    .replace(/\r\n/g, '\n') // Normaliza quebras
    .replace(/\r/g, '\n')
    .trim()
}
