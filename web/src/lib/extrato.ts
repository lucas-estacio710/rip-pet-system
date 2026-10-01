// LER EXTRATO COLADO — data, descrição e valor de cada linha, de qualquer banco.
//
// Pedido do Lucas (01/10/2026): "um campo texto com uma inteligência" que aceite
// o que vier do banco — Inter PJ em Santos, Itaú em SJC — sem tela de
// configuração por banco. Este módulo é puro, sem I/O, como `recebiveis.ts`.
// Ele só LÊ e separa as linhas; quem diz de qual maquininha é cada uma é a
// pessoa, ajudada pelo histórico (ver "SIMILARIDADE" abaixo).
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
// SIMILARIDADE — o histórico é a memória
// ════════════════════════════════════════════════════════════════════════════
//
// Decisão do Lucas (01/10/2026): "a maquininha eu decido no lançamento; o colar
// linhas é só para parsear e montar separadinho... o que vier no extrato como
// descrição vai para observações, e a identificação por similaridade busca
// desse campo... com o passar do tempo, tudo vai ficando mais fácil."
//
// Então NÃO há dicionário de adquirentes aqui (chegou a existir, montado de
// pesquisa — o que se aprendeu está no FLOW_FINANCEIRO §9.1.15). A tela grava o
// texto do banco na observação do registro; na colagem seguinte, uma linha cujo
// texto "se parece" com o de um registro anterior herda a maquininha e o
// movimento daquele registro. A memória são os registros que a pessoa já fez.

export const normTexto = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()

/**
 * Chave de semelhança entre dois históricos de extrato: maiúsculo, sem acento,
 * SEM NÚMEROS e sem pontuação. Números saem porque mudam a cada linha (NSU,
 * parcela, data, agência) enquanto o "tipo" do lançamento é o resto:
 *   'Credito domicilio cartao: "CARTAO DE CREDITO - INTER PAG"'
 *   → 'CREDITO DOMICILIO CARTAO CARTAO DE CREDITO INTER PAG'
 */
export function chaveSimilaridade(texto: string): string {
  return normTexto(texto).replace(/\d+/g, ' ').replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Movimento SUGERIDO quando o histórico não diz nada: pela direção do dinheiro
 * e por palavras inequívocas. A pessoa pode trocar na prévia.
 * "CREDITO"/"DEBITO" no texto é o TIPO DO CARTÃO da venda, não a direção —
 * por isso a direção vem só do sinal.
 */
export function movimentoDe(descricao: string, valor: number):
  'liquidacao' | 'antecipacao' | 'chargeback' | 'taxa' | null {
  const t = normTexto(descricao)
  if (valor > 0) return /\bANTECIP\w*|\bANTEC\b/.test(t) ? 'antecipacao' : 'liquidacao'
  if (/\bALUGUEL\b|\bTARIFA\b|\bMENSALIDADE\b|\bREMUNERACAO\s+POS\b/.test(t)) return 'taxa'
  if (/\bESTORNO\b|\bCHARGEBACK\b|\bCONTESTAC\w*|\bCANCEL\w*/.test(t)) return 'chargeback'
  return null
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
