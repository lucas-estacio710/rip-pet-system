/**
 * Módulo para manipulação de certificados digitais A1 (.pfx)
 * Extrai chave privada e certificado para uso na assinatura de XML
 */

import forge from 'node-forge'

export interface CertificadoExtraido {
  chavePrivadaPem: string
  certificadoPem: string
  certificadoX509: string // Base64 do certificado (para KeyInfo)
  cnpj: string | null
  razaoSocial: string | null
  validade: {
    inicio: Date
    fim: Date
  }
}

/**
 * Extrai chave privada e certificado de um arquivo PFX
 * @param pfxBuffer Buffer do arquivo .pfx
 * @param senha Senha do certificado
 */
export function extrairCertificado(pfxBuffer: Buffer, senha: string): CertificadoExtraido {
  try {
    // Converter buffer para base64 e depois para DER
    const pfxBase64 = pfxBuffer.toString('base64')
    const pfxDer = forge.util.decode64(pfxBase64)
    const pfxAsn1 = forge.asn1.fromDer(pfxDer)

    // Parse do PKCS12 com a senha
    const p12 = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, false, senha)

    // Extrair bags de chave privada
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]

    if (!keyBag || keyBag.length === 0 || !keyBag[0].key) {
      throw new Error('Chave privada não encontrada no certificado')
    }

    const chavePrivada = keyBag[0].key

    // Extrair bags de certificado
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })
    const certBag = certBags[forge.pki.oids.certBag]

    if (!certBag || certBag.length === 0 || !certBag[0].cert) {
      throw new Error('Certificado não encontrado no arquivo PFX')
    }

    const certificado = certBag[0].cert

    // Converter para PEM
    const chavePrivadaPem = forge.pki.privateKeyToPem(chavePrivada)
    const certificadoPem = forge.pki.certificateToPem(certificado)

    // Extrair certificado em Base64 (sem headers PEM)
    const certificadoX509 = certificadoPem
      .replace('-----BEGIN CERTIFICATE-----', '')
      .replace('-----END CERTIFICATE-----', '')
      .replace(/\r?\n/g, '')
      .trim()

    // Extrair informações do certificado
    const subject = certificado.subject.attributes
    let cnpj: string | null = null
    let razaoSocial: string | null = null

    // Buscar CNPJ no subject (pode estar em diferentes campos)
    for (const attr of subject) {
      if (attr.name === 'commonName' || attr.shortName === 'CN') {
        // CN geralmente tem formato "RAZAO SOCIAL:CNPJ"
        const cn = attr.value as string
        const match = cn.match(/(\d{14})/)
        if (match) cnpj = match[1]

        // Razão social é o que vem antes do ":"
        const parts = cn.split(':')
        if (parts.length > 1) {
          razaoSocial = parts[0].trim()
        }
      }

      // Alguns certificados têm CNPJ em OID específico
      if (attr.type === '2.16.76.1.3.3') {
        cnpj = attr.value as string
      }
    }

    return {
      chavePrivadaPem,
      certificadoPem,
      certificadoX509,
      cnpj,
      razaoSocial,
      validade: {
        inicio: certificado.validity.notBefore,
        fim: certificado.validity.notAfter
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Invalid password')) {
        throw new Error('Senha do certificado incorreta')
      }
      throw new Error(`Erro ao extrair certificado: ${error.message}`)
    }
    throw error
  }
}

/**
 * Valida se o certificado está dentro da validade
 */
export function validarCertificado(cert: CertificadoExtraido): { valido: boolean; mensagem: string } {
  const agora = new Date()

  if (agora < cert.validade.inicio) {
    return {
      valido: false,
      mensagem: `Certificado ainda não é válido. Válido a partir de ${cert.validade.inicio.toLocaleDateString('pt-BR')}`
    }
  }

  if (agora > cert.validade.fim) {
    return {
      valido: false,
      mensagem: `Certificado expirado em ${cert.validade.fim.toLocaleDateString('pt-BR')}`
    }
  }

  // Avisar se vai expirar em menos de 30 dias
  const diasRestantes = Math.floor((cert.validade.fim.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24))
  if (diasRestantes < 30) {
    return {
      valido: true,
      mensagem: `Atenção: Certificado expira em ${diasRestantes} dias (${cert.validade.fim.toLocaleDateString('pt-BR')})`
    }
  }

  return {
    valido: true,
    mensagem: `Certificado válido até ${cert.validade.fim.toLocaleDateString('pt-BR')}`
  }
}
