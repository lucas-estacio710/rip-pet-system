// LER EXTRATO COLADO — data, descrição e valor de cada linha, de qualquer banco.
//
// Pedido do Lucas (01/10/2026): "um campo texto com uma inteligência" que aceite
// o que vier do banco — Inter PJ em Santos, Itaú em SJC — sem tela de
// configuração por banco. Este módulo é só a LEITURA (puro, sem I/O, como
// `recebiveis.ts`); a CLASSIFICAÇÃO de cada linha (é liquidação de qual
// maquininha?) fica num dicionário à parte.
//
// COMO LÊ: cada linha é quebrada em campos (tabulação, ponto e vírgula ou dois+
// espaços — o que o Excel e o internet banking produzem ao copiar). O campo que
// é DATA vira a data; os campos que são NÚMERO viram valor e, se houver um
// segundo número no fim, saldo; o resto é descrição. Linha sem data é cabeçalho
// e fica de fora.
//
// 🔴 VALOR × SALDO: quando a linha traz os dois (o CSV do Inter traz), o valor é
// o PRIMEIRO número e o saldo o ÚLTIMO. Validado contra o extrato real de Santos:
// em cada linha, valor = saldo − saldo da linha anterior.
//
// 🔴 NÚMERO: o CSV do Inter corta o zero final ("966,1" = 966,10). Aqui o número
// é lido pela VÍRGULA decimal — nunca dígito a dígito como na máscara de digitar,
// que foi o que transformou 966,10 em 96,61 (ver `colarValorBR`).

export type LinhaExtrato = {
  /** número da linha no texto colado (1 = primeira), pra mostrar na prévia */
  n: number
  data: string                 // YYYY-MM-DD
  descricao: string
  valor: number                // com sinal: crédito > 0, débito < 0
  saldo: number | null
  /** nenhuma marca de sinal (-, D, parênteses) e nada pra conferir: mostrar pra pessoa olhar */
  sinalIncerto: boolean
  original: string
}

// ════════════════════════════════════════════════════════════════════════════
// CLASSIFICAR — esta linha é movimento de qual maquininha?
// ════════════════════════════════════════════════════════════════════════════
//
// O texto é escrito pelo BANCO onde o dinheiro cai, não pela adquirente: a mesma
// venda da Rede sai diferente no Itaú, na Caixa e no Inter. Por isso o
// dicionário reconhece PADRÕES. Fontes (pesquisa de 01/10/2026): o exemplo real
// do Inter de Santos e o glossário oficial de históricos da Caixa
// (caixa.gov.br/Downloads/contas-pessoa-fisica/glossario.pdf), que traz
// "<ADQUIRENTE> <BANDEIRA> C CREDITO | C DEBITO | ANTECIP".
//
// 🔴 SEM REGRA POR CNPJ, de propósito. No CSV do Inter o número em "Cp :NNNNNNNN-"
// é o código da instituição de QUEM RECEBEU o Pix: "Cp :10573521-Rafael ..." é um
// Pix pra uma pessoa com conta no Mercado Pago (10.573.521 é o CNPJ dele). Uma
// regra por CNPJ leria esse pagamento como liquidação de maquininha.
//
// 🔴 "REDE" SOZINHA NÃO BASTA: a Caixa tem "REDE COMPARTILHADA", "REDE SHOP".
// Exige-se "REDECARD" ou "REDE" seguida de bandeira/modalidade.

export type ChaveAdquirente =
  | 'interpag' | 'rede' | 'infinitepay' | 'cielo' | 'stone' | 'getnet'
  | 'pagseguro' | 'mercadopago' | 'sumup' | 'safrapay' | 'vero' | 'sicredi' | 'sipag'
  | 'stelo' | 'elavon' | 'bin'
  /** crédito de cartão SEM nome da credenciadora ("CR VD CART", "CR COMPRAS",
   *  "CRED ANTECIPACAO RECEBIVEIS"): vale a única maquininha da unidade, ou pergunta */
  | 'cartao'

/** Adquirente → padrões no texto (já normalizado: maiúsculo, sem acento).
 *  Fontes: extrato real do Inter de Santos; glossário de históricos da Caixa;
 *  códigos de conciliação do Bradesco (CNAB 2017); manual de antecipação do Inter;
 *  OFX real do Sicoob em código aberto. Itaú: nenhum rótulo público encontrado. */
export const ADQUIRENTES: { chave: ChaveAdquirente; padroes: RegExp[]; apelidos: string[] }[] = [
  { chave: 'interpag',    padroes: [/\bINTER\s*PAG\b/, /\bGRANITO\b/], apelidos: ['INTERPAG', 'INTER PAG', 'GRANITO'] },
  { chave: 'rede',        padroes: [/\bREDECARD\b/, /\bREDE\s*(-\s*CREDICARD|VISA|VS|MAST\w*|MC|ELO|EL|HIPER\w*|AMEX|CRED\w*|DEB\w*|POP|ANTEC\w*|COMPRA)\b/, /\bRECEBIMENTO\s+REDE\b/, /\bREDEPAY\b/], apelidos: ['REDE', 'REDECARD'] },
  { chave: 'infinitepay', padroes: [/\bCLOUD\s*WALK\b/, /\bINFINITE\s*PAY\b/, /\bINFINITY\s*PAY\b/], apelidos: ['INFINITEPAY', 'INFINITYPAY', 'INFINITE PAY', 'INFINITY PAY', 'CLOUDWALK'] },
  { chave: 'cielo',       padroes: [/\bCIELO\b/], apelidos: ['CIELO'] },
  { chave: 'stone',       padroes: [/\bSTONE\b/], apelidos: ['STONE', 'TON'] },
  { chave: 'getnet',      padroes: [/\bGETNET\b/], apelidos: ['GETNET'] },
  { chave: 'pagseguro',   padroes: [/\bPAG\s*SEGURO\b/, /\bPAGBANK\b/], apelidos: ['PAGSEGURO', 'PAGBANK'] },
  { chave: 'mercadopago', padroes: [/\bMERC\s*PAGO\b/, /\bMERCADO\s*PAGO\b/], apelidos: ['MERCADO PAGO', 'MERCADOPAGO', 'MERCPAGO'] },
  { chave: 'sumup',       padroes: [/\bSUMUP\b/], apelidos: ['SUMUP'] },
  { chave: 'safrapay',    padroes: [/\bSAFRA\s*(PAY|CREDEN)\b/, /\bSAFRA\s+(VISA|MASTERCARD|ELO)\b/], apelidos: ['SAFRAPAY', 'SAFRA PAY', 'SAFRA'] },
  { chave: 'vero',        padroes: [/\bVERO\b/], apelidos: ['VERO', 'BANRISUL'] },
  { chave: 'sicredi',     padroes: [/\bSICREDI\s+(VISA|MASTERCARD|ELO|AMERICAN)\b/], apelidos: ['SICREDI'] },
  { chave: 'sipag',       padroes: [/\bSIPAG\b/, /\bBANCOOB\s+ADQ\b/], apelidos: ['SIPAG', 'SICOOB', 'BANCOOB'] },
  { chave: 'stelo',       padroes: [/\bSTELO\b/], apelidos: ['STELO'] },
  { chave: 'elavon',      padroes: [/\bELAVON\b/], apelidos: ['ELAVON'] },
  // "BIN" sozinho é palavra curta demais: só com bandeira ou no molde do Inter.
  { chave: 'bin',         padroes: [/\bBIN\s+(SIPAG|VISA|MASTER\w*|ELO)\b/, /DOMICILIO CARTAO\W+BIN\b/], apelidos: ['BIN', 'FISERV'] },
  // Por último: só entra quando nenhuma credenciadora foi nomeada.
  { chave: 'cartao',      padroes: [/\bCR\s+(VD\s+CART|COMPRAS)\b/, /\bCREDITO\s+VENDA\s+CARTAO\b/, /\bCRED(ITO)?\s+ANTECIPACAO\s+RECEBIVEIS\b/, /\bVENDA\s+CARTAO\s+DE\s+CREDITO\b/, /\bANTECIP(ACAO)?\s+(DE\s+)?CARTAO\b/], apelidos: [] },
]

/**
 * Linhas que PARECEM de maquininha mas não são registro desta tela. A prévia
 * mostra o porquê em vez de classificar errado. Ordem importa: testadas antes
 * da classificação.
 */
const NAO_E_DAQUI: { re: RegExp; motivo: string }[] = [
  // Inter: o débito que quita a antecipação tem o valor do crédito do dia —
  // registrá-lo como chargeback tiraria dinheiro que nunca saiu.
  { re: /\bDEB(ITO)?\s+LIQUIDACAO\s+ANTECIPA/, motivo: 'quitação de antecipação (par do crédito do dia) — não é chargeback nem despesa' },
  { re: /\bCOMISSAO\s+LIQ\w*\s+ANTECIPAD|\bTAXA\s+DE\s+ANTECIPACAO\b|\bDESCONTO\s+DE\s+ANTECIPACAO\b/, motivo: 'custo da antecipação — é despesa: lance em Despesas, Financeiro › Encargos' },
]

export const normTexto = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

export function adquirenteDe(descricao: string): ChaveAdquirente | null {
  const t = normTexto(descricao)
  return ADQUIRENTES.find(a => a.padroes.some(p => p.test(t)))?.chave ?? null
}

/** Motivo pelo qual uma linha com cara de maquininha NÃO se registra aqui. */
export function naoEDaqui(descricao: string): string | null {
  const t = normTexto(descricao)
  return NAO_E_DAQUI.find(x => x.re.test(t))?.motivo ?? null
}

/** Movimento sugerido pelo texto + direção. null = não dá pra afirmar. */
export function movimentoDe(descricao: string, valor: number):
  'liquidacao' | 'antecipacao' | 'chargeback' | 'taxa' | null {
  const t = normTexto(descricao)
  // "CREDITO"/"DEBITO" no texto é o TIPO DO CARTÃO da venda, não a direção do
  // dinheiro (Bradesco tem "GETNET VISA DEBITO" como crédito e como débito).
  // Por isso a direção vem só do sinal.
  if (valor > 0) return /\bANTECIP\w*|\bANTEC\b|\bARV\b|\bORPAGS\b/.test(t) ? 'antecipacao' : 'liquidacao'
  if (/\bALUGUEL\b|\bTARIFA\b|\bTAR\b|\bMENSALIDADE\b|\bREMUNERACAO\s+POS\b|\bDEBITO\s+AUTOMATICO\b|\bCOMISSAO\s+VENDAS?\s+CARTAO\b/.test(t)) return 'taxa'
  if (/\bESTORNO\b|\bCHARGEBACK\b|\bCONTESTAC\w*|\bCANCEL\w*/.test(t)) return 'chargeback'
  return null                                        // saída de maquininha sem palavra-chave
}

/**
 * Qual maquininha DA UNIDADE é esta adquirente. Casa pelo nome cadastrado
 * ("InterPag", "Rede Prina 1"). Devolve TODAS as que casam: duas da mesma
 * adquirente ("Rede Prina 1" e "Rede Prina 2") não se distinguem pelo texto do
 * banco, e a tela tem de perguntar.
 */
export function operadorasDaAdquirente<T extends { nome: string }>(
  chave: ChaveAdquirente, operadoras: T[],
): T[] {
  // Crédito de cartão sem credenciadora nomeada: qualquer maquininha serve — se a
  // unidade tem uma só, é ela; se tem mais, a tela pergunta.
  if (chave === 'cartao') return [...operadoras]
  const ap = ADQUIRENTES.find(a => a.chave === chave)!.apelidos
  return operadoras.filter(o => {
    const n = normTexto(o.nome).replace(/[^A-Z0-9 ]/g, ' ')
    const junto = n.replace(/\s+/g, '')
    return ap.some(a => n.includes(a) || junto.includes(a.replace(/\s+/g, '')))
  })
}

/** Número em formato brasileiro (ou inglês sem milhar), com sinal. */
export function numeroBR(texto: string): number | null {
  let t = texto.trim().replace(/R\$|\s/g, '')
  if (!t) return null
  // sinal no fim ("1.000,00-") ou letra D/C, como alguns bancos escrevem
  let neg = false
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1) }           // (1.024,00)
  if (/[-]$/.test(t)) { neg = true; t = t.slice(0, -1) }
  else if (/D$/i.test(t)) { neg = true; t = t.slice(0, -1) }
  else if (/C$/i.test(t)) { t = t.slice(0, -1) }
  if (/^-/.test(t)) { neg = !neg; t = t.slice(1) } else if (/^\+/.test(t)) t = t.slice(1)
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null
  let n: number
  if (t.includes(',')) {
    // vírgula decimal: ponto só pode ser milhar
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(t)) return null
    n = Number(t.replace(/\./g, '').replace(',', '.'))
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    n = Number(t.replace(/\./g, ''))                 // "1.360" = mil trezentos e sessenta
  } else if (/^\d+(\.\d{1,2})?$/.test(t)) {
    n = Number(t)                                     // "966" · "966.1"
  } else return null
  return Number.isFinite(n) ? (neg ? -n : n) : null
}

const RE_DATA = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/

function dataISO(campo: string, anoPadrao: number, hoje: string): string | null {
  const m = campo.trim().match(RE_DATA)
  if (!m) return null
  const d = Number(m[1]), mes = Number(m[2])
  let ano = m[3] ? Number(m[3]) : anoPadrao
  if (ano < 100) ano += 2000
  if (d < 1 || d > 31 || mes < 1 || mes > 12) return null
  const iso = (a: number) => `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  // Data SEM ano que cairia no futuro é do ano anterior: extrato de dezembro
  // colado em janeiro (prática dos importadores pesquisados em 01/10/2026).
  if (!m[3] && iso(ano) > hoje) ano -= 1
  return iso(ano)
}

/** Linhas que têm data e valor mas NÃO são lançamento — entrariam em dobro. */
const RE_NAO_LANCAMENTO = /^(saldo|sdo|s\s*a\s*l\s*d\s*o)\b|saldo (do dia|anterior|final|inicial|em conta|dispon|aplic)/i

/** Quebra uma linha em campos e tira as aspas do CSV ("" vira "). */
function campos(linha: string): string[] {
  const out: string[] = []
  if (linha.includes(';') || linha.includes('\t')) {
    // CSV de verdade: respeita aspas, que podem conter ; no meio
    let atual = '', aspas = false
    for (let i = 0; i < linha.length; i++) {
      const ch = linha[i]
      if (ch === '"') {
        if (aspas && linha[i + 1] === '"') { atual += '"'; i++ } else aspas = !aspas
      } else if (!aspas && (ch === ';' || ch === '\t')) { out.push(atual); atual = '' }
      else atual += ch
    }
    out.push(atual)
  } else {
    out.push(...linha.split(/\s{2,}/))                // colado com espaços alinhados
  }
  return out.map(c => c.trim()).filter(c => c !== '')
}

/**
 * Lê o texto colado. `anoPadrao` vale pra data sem ano ("05/06"), como alguns
 * bancos exportam — use o ano do mês que está na tela.
 */
export function lerExtrato(
  texto: string,
  anoPadrao = new Date().getFullYear(),
  hoje = new Date().toISOString().slice(0, 10),
): LinhaExtrato[] {
  const linhas = texto.split(/\r?\n/)
  const out: LinhaExtrato[] = []
  // Linha com DATA e sem valor: o PDF jogou o valor pra linha de baixo
  // ("06/06 PIX ENVIADO FORNECEDOR XYZ" / "LTDA REF NOTA 123   300,00-").
  // Fica esperando a próxima, que traz o resto do histórico e o número.
  let pendente: { n: number; data: string; descricao: string; original: string } | null = null
  linhas.forEach((orig, idx) => {
    const linha = orig.trim()
    if (!linha) return
    let cs = campos(linha)
    if (!cs.length) return                              // ";;;" — só separadores
    if (pendente && !/^\d{1,2}\/\d{1,2}/.test(linha)) {
      const p = pendente
      pendente = null
      const nums: number[] = []
      const resto = [...cs]
      while (resto.length && numeroBR(resto[resto.length - 1]) !== null && nums.length < 2) {
        nums.unshift(numeroBR(resto.pop()!)!)
      }
      if (nums.length) {
        const textoValor = cs[cs.length - nums.length]
        out.push({
          n: p.n, data: p.data,
          descricao: `${p.descricao} ${resto.join(' ')}`.replace(/\s+/g, ' ').trim(),
          valor: nums[0], saldo: nums.length > 1 ? nums[1] : null,
          sinalIncerto: nums.length === 1 && !/[-()DdCc]/.test(textoValor),
          original: `${p.original}\n${orig}`,
        })
        return
      }
      // Ainda sem número: o histórico continua — é da linha que está ESPERANDO,
      // nunca da anterior a ela.
      pendente = { ...p, descricao: `${p.descricao} ${linha}`, original: `${p.original}\n${orig}` }
      return
    }
    pendente = null
    // CONTINUAÇÃO de histórico (o PDF quebra a descrição em duas linhas): sem
    // data no começo e sem número no fim → junta na linha anterior.
    const comecaComData = /^\d{1,2}\/\d{1,2}/.test(linha)
    if (!comecaComData && numeroBR(cs[cs.length - 1]) === null && out.length) {
      out[out.length - 1].descricao += ' ' + linha.replace(/\s+/g, ' ')
      return
    }
    // linha com espaço simples (copiada de PDF): tenta separar data e números do resto
    if (cs.length === 1) {
      const m = linha.match(/^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(.*?)\s+([-+]?[\d.,]+[-DC]?)(?:\s+([-+]?[\d.,]+[-DC]?))?$/i)
      if (!m) return
      cs = [m[1], m[2], m[3], ...(m[4] ? [m[4]] : [])]
    }
    // A data só vale no COMEÇO da linha: "PARC 03/10" no meio do histórico
    // parece data sem ano e não é.
    const data = dataISO(cs[0], anoPadrao, hoje)
    if (!data) return                                   // cabeçalho, rodapé
    const resto = cs.slice(1)
    // números do FIM pra trás: o último é saldo se houver dois
    const nums: number[] = []
    while (resto.length && numeroBR(resto[resto.length - 1]) !== null && nums.length < 2) {
      nums.unshift(numeroBR(resto.pop()!)!)
    }
    if (!nums.length) {
      pendente = { n: idx + 1, data, descricao: resto.join(' '), original: orig }
      return
    }
    const descricao = resto.join(' ').replace(/\s+/g, ' ').trim()
    if (RE_NAO_LANCAMENTO.test(descricao)) return       // "SALDO DO DIA" etc.
    const textoValor = cs[cs.length - nums.length]
    out.push({
      n: idx + 1,
      data,
      descricao,
      valor: nums[0],
      saldo: nums.length > 1 ? nums[1] : null,
      sinalIncerto: nums.length === 1 && !/[-()DdCc]/.test(textoValor),
      original: orig,
    })
  })
  return out
}
