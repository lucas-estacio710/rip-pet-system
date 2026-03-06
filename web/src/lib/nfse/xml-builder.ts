/**
 * Builder de XML no padrão ABRASF 2.04 para NFS-e
 * Gera os XMLs de RPS e Lote para envio ao GISS Online
 */

import { v4 as uuidv4 } from 'uuid'

// Namespace ABRASF
const NS_NFSE = 'http://www.abrasf.org.br/nfse.xsd'

export interface DadosPrestador {
  cnpj: string
  inscricaoMunicipal: string
}

export interface DadosTomador {
  // Pessoa Física ou Jurídica
  cpfCnpj: string
  inscricaoMunicipal?: string
  razaoSocial: string
  // Endereço
  endereco?: string
  numero?: string
  complemento?: string
  bairro?: string
  codigoMunicipio?: string // Código IBGE
  uf?: string
  cep?: string
  // Contato
  telefone?: string
  email?: string
}

export interface DadosServico {
  /** Valor total dos serviços */
  valorServicos: number
  /** Valor das deduções (opcional) */
  valorDeducoes?: number
  /** Alíquota ISS (ex: 0.05 para 5%) */
  aliquota: number
  /** Código do serviço LC 116/2003 (ex: "14.01") */
  itemListaServico: string
  /** Código CNAE (opcional) */
  codigoCnae?: string
  /** Descrição do serviço */
  discriminacao: string
  /** Código IBGE do município de prestação */
  codigoMunicipio: string // Santos = 3548500
}

export interface DadosRps {
  /** Número sequencial do RPS */
  numero: number
  /** Série do RPS (padrão: "RPS") */
  serie?: string
  /** Tipo do RPS (1=RPS, 2=Nota Conjugada, 3=Cupom) */
  tipo?: number
  /** Data de emissão */
  dataEmissao: Date
  /** Natureza da operação (1=Tributação no município, ...) */
  naturezaOperacao?: number
  /** Regime especial de tributação */
  regimeEspecialTributacao?: number
  /** Optante pelo Simples Nacional */
  optanteSimplesNacional?: boolean
  /** Incentivador cultural */
  incentivadorCultural?: boolean
  // Dados
  prestador: DadosPrestador
  tomador: DadosTomador
  servico: DadosServico
}

/**
 * Formata data para padrão ISO (YYYY-MM-DD)
 */
function formatarData(data: Date): string {
  return data.toISOString().split('T')[0]
}

/**
 * Formata valor monetário (2 casas decimais, sem separador de milhar)
 */
function formatarValor(valor: number): string {
  return valor.toFixed(2)
}

/**
 * Remove caracteres especiais de CPF/CNPJ
 */
function limparDocumento(doc: string): string {
  return doc.replace(/\D/g, '')
}

/**
 * Gera ID único para o InfRps
 */
function gerarIdInfRps(numero: number): string {
  return `rps_${numero}_${Date.now()}`
}

/**
 * Constrói XML de um RPS individual
 */
export function construirRps(dados: DadosRps): { xml: string; infRpsId: string } {
  const infRpsId = gerarIdInfRps(dados.numero)
  const serie = dados.serie || 'RPS'
  const tipo = dados.tipo || 1
  const natureza = dados.naturezaOperacao || 1
  const optanteSN = dados.optanteSimplesNacional ? '1' : '2'
  const incentivador = dados.incentivadorCultural ? '1' : '2'

  const tomador = dados.tomador
  const servico = dados.servico
  const prestador = dados.prestador

  // Determinar se tomador é PF ou PJ
  const docTomador = limparDocumento(tomador.cpfCnpj)
  const isCnpj = docTomador.length === 14

  // Calcular valores
  const valorServicos = servico.valorServicos
  const valorDeducoes = servico.valorDeducoes || 0
  const baseCalculo = valorServicos - valorDeducoes
  const valorIss = baseCalculo * servico.aliquota

  let xml = `<Rps>`
  xml += `<InfRps Id="${infRpsId}">`

  // Identificação do RPS
  xml += `<IdentificacaoRps>`
  xml += `<Numero>${dados.numero}</Numero>`
  xml += `<Serie>${serie}</Serie>`
  xml += `<Tipo>${tipo}</Tipo>`
  xml += `</IdentificacaoRps>`

  xml += `<DataEmissao>${formatarData(dados.dataEmissao)}</DataEmissao>`
  xml += `<NaturezaOperacao>${natureza}</NaturezaOperacao>`

  if (dados.regimeEspecialTributacao) {
    xml += `<RegimeEspecialTributacao>${dados.regimeEspecialTributacao}</RegimeEspecialTributacao>`
  }

  xml += `<OptanteSimplesNacional>${optanteSN}</OptanteSimplesNacional>`
  xml += `<IncentivadorCultural>${incentivador}</IncentivadorCultural>`
  xml += `<Status>1</Status>` // 1=Normal, 2=Cancelado

  // Serviço
  xml += `<Servico>`
  xml += `<Valores>`
  xml += `<ValorServicos>${formatarValor(valorServicos)}</ValorServicos>`
  if (valorDeducoes > 0) {
    xml += `<ValorDeducoes>${formatarValor(valorDeducoes)}</ValorDeducoes>`
  }
  xml += `<ValorPis>0.00</ValorPis>`
  xml += `<ValorCofins>0.00</ValorCofins>`
  xml += `<ValorInss>0.00</ValorInss>`
  xml += `<ValorIr>0.00</ValorIr>`
  xml += `<ValorCsll>0.00</ValorCsll>`
  xml += `<IssRetido>2</IssRetido>` // 1=Sim, 2=Não
  xml += `<ValorIss>${formatarValor(valorIss)}</ValorIss>`
  xml += `<BaseCalculo>${formatarValor(baseCalculo)}</BaseCalculo>`
  xml += `<Aliquota>${servico.aliquota}</Aliquota>`
  xml += `<ValorLiquidoNfse>${formatarValor(valorServicos)}</ValorLiquidoNfse>`
  xml += `</Valores>`

  xml += `<ItemListaServico>${servico.itemListaServico}</ItemListaServico>`
  if (servico.codigoCnae) {
    xml += `<CodigoCnae>${servico.codigoCnae}</CodigoCnae>`
  }
  xml += `<Discriminacao>${escapeXml(servico.discriminacao)}</Discriminacao>`
  xml += `<CodigoMunicipio>${servico.codigoMunicipio}</CodigoMunicipio>`
  xml += `</Servico>`

  // Prestador
  xml += `<Prestador>`
  xml += `<Cnpj>${limparDocumento(prestador.cnpj)}</Cnpj>`
  xml += `<InscricaoMunicipal>${prestador.inscricaoMunicipal}</InscricaoMunicipal>`
  xml += `</Prestador>`

  // Tomador
  xml += `<Tomador>`
  xml += `<IdentificacaoTomador>`
  xml += `<CpfCnpj>`
  if (isCnpj) {
    xml += `<Cnpj>${docTomador}</Cnpj>`
  } else {
    xml += `<Cpf>${docTomador}</Cpf>`
  }
  xml += `</CpfCnpj>`
  if (tomador.inscricaoMunicipal) {
    xml += `<InscricaoMunicipal>${tomador.inscricaoMunicipal}</InscricaoMunicipal>`
  }
  xml += `</IdentificacaoTomador>`

  xml += `<RazaoSocial>${escapeXml(tomador.razaoSocial)}</RazaoSocial>`

  // Endereço do tomador (opcional)
  if (tomador.endereco) {
    xml += `<Endereco>`
    xml += `<Endereco>${escapeXml(tomador.endereco)}</Endereco>`
    if (tomador.numero) xml += `<Numero>${tomador.numero}</Numero>`
    if (tomador.complemento) xml += `<Complemento>${escapeXml(tomador.complemento)}</Complemento>`
    if (tomador.bairro) xml += `<Bairro>${escapeXml(tomador.bairro)}</Bairro>`
    if (tomador.codigoMunicipio) xml += `<CodigoMunicipio>${tomador.codigoMunicipio}</CodigoMunicipio>`
    if (tomador.uf) xml += `<Uf>${tomador.uf}</Uf>`
    if (tomador.cep) xml += `<Cep>${limparDocumento(tomador.cep)}</Cep>`
    xml += `</Endereco>`
  }

  // Contato (opcional)
  if (tomador.telefone || tomador.email) {
    xml += `<Contato>`
    if (tomador.telefone) xml += `<Telefone>${limparDocumento(tomador.telefone)}</Telefone>`
    if (tomador.email) xml += `<Email>${tomador.email}</Email>`
    xml += `</Contato>`
  }

  xml += `</Tomador>`

  xml += `</InfRps>`
  xml += `</Rps>`

  return { xml, infRpsId }
}

/**
 * Constrói XML do lote de RPS para envio
 */
export function construirLoteRps(
  prestador: DadosPrestador,
  rpsAssinados: string[],
  numeroLote?: number
): string {
  const lote = numeroLote || Math.floor(Date.now() / 1000)

  let xml = `<?xml version="1.0" encoding="UTF-8"?>`
  xml += `<EnviarLoteRpsEnvio xmlns="${NS_NFSE}">`
  xml += `<LoteRps Id="lote_${lote}">`
  xml += `<NumeroLote>${lote}</NumeroLote>`
  xml += `<Cnpj>${limparDocumento(prestador.cnpj)}</Cnpj>`
  xml += `<InscricaoMunicipal>${prestador.inscricaoMunicipal}</InscricaoMunicipal>`
  xml += `<QuantidadeRps>${rpsAssinados.length}</QuantidadeRps>`
  xml += `<ListaRps>`

  for (const rps of rpsAssinados) {
    xml += rps
  }

  xml += `</ListaRps>`
  xml += `</LoteRps>`
  xml += `</EnviarLoteRpsEnvio>`

  return xml
}

/**
 * Constrói XML para consulta de NFS-e por RPS
 */
export function construirConsultaNfsePorRps(
  prestador: DadosPrestador,
  numeroRps: number,
  serieRps: string = 'RPS',
  tipoRps: number = 1
): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>`
  xml += `<ConsultarNfseRpsEnvio xmlns="${NS_NFSE}">`
  xml += `<IdentificacaoRps>`
  xml += `<Numero>${numeroRps}</Numero>`
  xml += `<Serie>${serieRps}</Serie>`
  xml += `<Tipo>${tipoRps}</Tipo>`
  xml += `</IdentificacaoRps>`
  xml += `<Prestador>`
  xml += `<Cnpj>${limparDocumento(prestador.cnpj)}</Cnpj>`
  xml += `<InscricaoMunicipal>${prestador.inscricaoMunicipal}</InscricaoMunicipal>`
  xml += `</Prestador>`
  xml += `</ConsultarNfseRpsEnvio>`

  return xml
}

/**
 * Constrói XML para cancelamento de NFS-e
 */
export function construirCancelamentoNfse(
  prestador: DadosPrestador,
  numeroNfse: string,
  codigoCancelamento: string = '1' // 1=Erro na emissão
): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>`
  xml += `<CancelarNfseEnvio xmlns="${NS_NFSE}">`
  xml += `<Pedido>`
  xml += `<InfPedidoCancelamento>`
  xml += `<IdentificacaoNfse>`
  xml += `<Numero>${numeroNfse}</Numero>`
  xml += `<Cnpj>${limparDocumento(prestador.cnpj)}</Cnpj>`
  xml += `<InscricaoMunicipal>${prestador.inscricaoMunicipal}</InscricaoMunicipal>`
  xml += `<CodigoMunicipio>3548500</CodigoMunicipio>` // Santos
  xml += `</IdentificacaoNfse>`
  xml += `<CodigoCancelamento>${codigoCancelamento}</CodigoCancelamento>`
  xml += `</InfPedidoCancelamento>`
  xml += `</Pedido>`
  xml += `</CancelarNfseEnvio>`

  return xml
}

/**
 * Escapa caracteres especiais XML
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
