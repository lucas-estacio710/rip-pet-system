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
// texto do banco na observação do registro; na colagem seguinte, cada linha é
// comparada por semelhança com os registros anteriores — isso mora em
// `lib/similaridade.ts`, que também sugere categoria nas despesas.

export const normTexto = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()

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

// ════════════════════════════════════════════════════════════════════════════
// PISTAS DO TEXTO — usadas pelo Colar do extrato (um botão só, 02/10/2026)
// ════════════════════════════════════════════════════════════════════════════

export type MovMaquininha = 'liquidacao' | 'antecipacao' | 'chargeback' | 'taxa'

/** Rótulos do registro de Receitas a Prazo. A descrição gravada começa com eles
 *  ("Liquidação · InterPag — …") e o Reutilizar e o histórico os leem de volta. */
export const ROTULO_MOV: Record<MovMaquininha, string> = {
  liquidacao: 'Liquidação',
  antecipacao: 'Liquidação antecipada',
  chargeback: 'Chargeback',
  taxa: 'Taxa / aluguel da maquininha',
}
export const ENTRA_MOV: Record<MovMaquininha, boolean> = { liquidacao: true, antecipacao: true, chargeback: false, taxa: false }

/** Rótulo do começo da descrição gravada → movimento (o mais longo primeiro:
 *  "Liquidação antecipada" começa com "Liquidação"). */
export function movDoRegistro(descricao: string): MovMaquininha | null {
  const m = (Object.keys(ROTULO_MOV) as MovMaquininha[])
    .sort((a, b) => ROTULO_MOV[b].length - ROTULO_MOV[a].length)
    .find(k => descricao.startsWith(`${ROTULO_MOV[k]} · `))
  return m ?? null
}

/**
 * ENTRADA com cara de repasse de maquininha. Só decide o DESTINO da linha quando
 * ainda não há histórico (receita a prazo × outra entrada) — a maquininha em si
 * é escolhida pela pessoa. Palavras genéricas de cartão + as credenciadoras mais
 * comuns; um rótulo que escape cai em "entrada sem par" e a pessoa reclassifica.
 */
export function pareceMaquininha(descricao: string): boolean {
  const t = normTexto(descricao)
  return /DOMICILIO CARTAO|\bCARTAO DE (CREDITO|DEBITO)\b|\bANTECIP|\bCR (VD CART|COMPRAS)\b|VENDA CARTAO|\bREDECARD\b|\bREDE (VISA|MAST|ELO|CRED|DEB|ANTEC)|\bCIELO\b|\bSTONE\b|\bGETNET\b|\bPAG ?SEGURO\b|\bINTER ?PAG\b|\bSUMUP\b|\bSIPAG\b|\bCLOUD ?WALK\b/.test(t)
}

/** Forma de pagamento de uma SAÍDA pelo texto do banco. null = a pessoa escolhe. */
export function metodoDe(descricao: string): string | null {
  const t = normTexto(descricao)
  if (/\bPIX\b/.test(t)) return 'pix'
  if (/PAGAMENTO DE (TITULO|CONVENIO)|PAGAMENTO EFETUADO|\bBOLETO\b|\bDARF\b|SIMPLES NACIONAL/.test(t)) return 'boleto'
  if (/COMPRA NO DEBITO|DEBITO EM CONTA|CARTAO DE DEBITO/.test(t)) return 'debito'
  if (/\bTED\b|\bDOC\b|TRANSFERENCIA/.test(t)) return 'transferencia'
  return null
}

/** Nome de quem recebeu: no Pix, "Cp :10573521-Rafael Moreira Giffoni"; no
 *  boleto do Inter, o texto entre aspas ('Pagamento efetuado: "CONTABILIDADE ALVORADA LTDA"'). */
export function fornecedorDe(descricao: string): string {
  const pix = descricao.match(/Cp\s*:\s*\d*\s*-\s*([^"]+)/i)
  if (pix) return pix[1].trim()
  const aspas = descricao.match(/:\s*"([^"]+)"/)
  return aspas ? aspas[1].trim() : ''
}

/**
 * SAÍDA que não é despesa — lançá-la contaria o mesmo gasto duas vezes ou poria
 * na DRE dinheiro que só mudou de lugar. Achado na prévia contra o extrato real
 * de Santos: "Pagamento fatura cartao Inter" (as despesas já estão no cartão).
 * O IOF das contas de investimento é custo de verdade e PASSA.
 */
export function naoEDespesa(descricao: string): string | null {
  const t = normTexto(descricao)
  if (/FATURA\s+(DO\s+)?CART(AO|OES)|PAGAMENTO\s+(DE\s+)?FATURA/.test(t)) {
    return 'pagamento de fatura de cartão — as despesas já estão no cartão; registre em + Lançar › Quitação'
  }
  if (/\bAPLICACAO\b|\bRESGATE\b/.test(t) && !/\bIOF\b/.test(t)) {
    return 'aplicação/resgate — dinheiro mudando de lugar, não é despesa'
  }
  // Pagamento a uma empresa DO GRUPO ("Pix enviado: ...-RIP PET II CREMATORIOS
  // LTDA", R$ 11.499 em 22/06/2026) é quase sempre o REPASSE à Matriz ou um
  // acerto entre unidades. Lançar como despesa dobraria o custo de cremação, que
  // já entra sozinho pelo acolhimento (mig 114). `fin_empresas` não tem razão
  // social pra casar, então vai pela marca no texto; a pessoa pode reclassificar.
  if (/\bRIP\s*PET\b|\bPRINA\b/.test(t)) {
    return 'pagamento a empresa do grupo — se for repasse, registre em + Lançar › Quitação; se for acerto, na aba Acertos do Repasse'
  }
  return null
}

/**
 * Saída que é QUITAÇÃO de uma obrigação — tem lugar próprio em Lançamentos ›
 * Lançamentos especiais (mig 150): pagamento à empresa do grupo = repasse;
 * pagamento de fatura = fatura de cartão. O Colar oferece o atalho pra lá.
 */
export function quitacaoDe(descricao: string): 'repasse' | 'fatura' | null {
  const t = normTexto(descricao)
  if (/FATURA\s+(DO\s+)?CART(AO|OES)|PAGAMENTO\s+(DE\s+)?FATURA/.test(t)) return 'fatura'
  if (/\bRIP\s*PET\b|\bPRINA\b/.test(t)) return 'repasse'
  return null
}

/**
 * Numa FATURA DE CARTÃO, a linha que não é compra (02/10/2026): o pagamento da
 * própria fatura (já é o Pagamento de fatura, lançado do lado da conta corrente)
 * e o estorno/crédito de uma compra. Devolve o motivo, ou null = é compra.
 */
export function foraDoCartao(descricao: string): string | null {
  const t = normTexto(descricao)
  // ⚠️ Não excluir por "COMPRA": a fatura do Inter põe "Compra à vista" na coluna
  // Tipo até da linha do pagamento ("PAGAMENTO ON LINE · OUTROS · Compra à vista").
  if (/^(PAGAMENTO|PAGTO|PGTO)|PAGAMENTO\s+(ON\s*LINE|EFETUADO|RECEBIDO|(DE\s+|DA\s+)?FATURA)|DEBITO\s+AUTOMATICO/.test(t)) {
    return 'pagamento da fatura — já entra como Pagamento de fatura (Lançamentos especiais)'
  }
  if (/ESTORNO|CREDITO\s+(DE\s+)?COMPRA|REEMBOLSO|CASHBACK|AJUSTE\s+A\s+CREDITO/.test(t)) {
    return 'estorno/crédito no cartão — abate a fatura, não é compra; confira'
  }
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

// ── Fatura do Inter colada do PDF (02/10/2026) ─────────────────────────────
// "13 de mai. 2026 ELYON SOLUCOES GRAFICA (Parcela 03 de 03) - R$ 265,00"
const MESES_NOME: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
}
/** Data por extenso no começo da linha vira dd/mm/aaaa ("13 de mai. 2026", "13 mai 2026", "13/mai/2026"). */
function dataPorExtenso(linha: string): string {
  return linha.replace(/^(\d{1,2})(?:\s+de\s+|\s+|[/-])([a-zç]{3,9})\.?(?:\s+de\s+|\s+|[/-])(\d{4})(?=\s|$|;)/i, (todo, d, mes, a) => {
    const m = MESES_NOME[mes.slice(0, 3).toLowerCase()]
    return m ? `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}` : todo
  })
}
/** "- R$ 265,00" → "-265,00": o espaço entre sinal e moeda impedia o número de ser lido. */
const semMoeda = (linha: string) => linha.replace(/([-+])\s*R\$\s*/g, '$1').replace(/R\$\s*/g, '')

/**
 * Linhas da fatura que não são lançamento nem continuação dele — sem este filtro
 * elas grudavam na descrição da compra anterior e sujavam a semelhança: o câmbio
 * da compra internacional, o cabeçalho, o número mascarado do cartão.
 */
const RE_RUIDO_FATURA = /^(valor e s[ií]mbolo da moeda|valor em d[oó]lar|cota[cç][aã]o d[oa]|despesas da fatura|data\s+movimenta|cart[aã]o\s+\d{4})|\d{4}\*{4}\d{4}/i

/**
 * O cabeçalho da fatura do Inter: "5497****0153 10/06/2026 R$5.400,96" — cartão,
 * VENCIMENTO e TOTAL. Preenche a fatura sozinho e permite conferir a soma.
 */
export function cabecalhoFatura(texto: string): { venc: string; total: number } | null {
  const m = texto.match(/\d{4}\*{4}\d{4}\s+(\d{2})\/(\d{2})\/(\d{4})\s+R?\$?\s*([\d.]+,\d{2})/)
  if (!m) return null
  const total = numeroBR(m[4])
  return total === null ? null : { venc: `${m[3]}-${m[2]}-${m[1]}`, total }
}

/** "(Parcela 03 de 03)", "PARC 02/10", "Parcela 2/3" → [atual, total]. */
export function parcelaDe(descricao: string): [number, number] | null {
  // Também "ALLIANZ SEGU*1 de 10": a parcela sem a palavra, logo depois do "*".
  const m = descricao.match(/PARC(?:ELA)?\.?\s*(\d{1,2})\s*(?:DE|\/)\s*(\d{1,2})/i)
    || descricao.match(/\*\s*(\d{1,2})\s+DE\s+(\d{1,2})(?!\d)/i)
  if (!m) return null
  const a = Number(m[1]), t = Number(m[2])
  return a >= 1 && t >= a ? [a, t] : null
}
/** A parcela que o CARTÃO numera (com a palavra) — a única que desloca a data. */
function parcelaDoCartao(descricao: string): [number, number] | null {
  const m = descricao.match(/PARC(?:ELA)?\.?\s*(\d{1,2})\s*(?:DE|\/)\s*(\d{1,2})/i)
  if (!m) return null
  const a = Number(m[1]), t = Number(m[2])
  return a >= 1 && t >= a ? [a, t] : null
}
/** Soma meses a uma data ISO, segurando o dia no fim do mês (31/01 + 1 = 28/02). */
function somaMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1))
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  return `${alvo.getUTCFullYear()}-${String(alvo.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`
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
  /** Fatura de cartão: sem "continuação" (o nome do titular grudaria na compra
   *  anterior) e parcela datada no mês DELA — a 3/3 de uma compra de 13/03 é
   *  13/05; com a data da compra, ela teria a mesma data e valor da 1/3 e o
   *  "já no sistema" a esconderia como repetida. */
  opts: { cartao?: boolean } = {},
): LinhaExtrato[] {
  const linhas = texto.split(/\r?\n/)
  const out: LinhaExtrato[] = []
  // Quantos números o FIM da linha pode ter. Extrato de conta: valor + saldo.
  // Fatura de cartão NÃO tem saldo — só o último número é o valor. Com 2, a
  // linha "ALLIANZ SEGU*1 de 10 - R$ 363,14" (parcela sem a palavra "Parcela")
  // virava valor 10 e "saldo" 363,14: R$ 353,14 sumiram da fatura de jul/2026.
  const maxNums = opts.cartao ? 1 : 2
  // Linha com DATA e sem valor: o PDF jogou o valor pra linha de baixo
  // ("06/06 PIX ENVIADO FORNECEDOR XYZ" / "LTDA REF NOTA 123   300,00-").
  // Fica esperando a próxima, que traz o resto do histórico e o número.
  let pendente: { n: number; data: string; descricao: string; original: string } | null = null
  linhas.forEach((orig, idx) => {
    const linha = semMoeda(dataPorExtenso(orig.trim()))
    if (!linha) return
    if (RE_RUIDO_FATURA.test(linha)) return             // não mexe no `pendente`
    let cs = campos(linha)
    if (!cs.length) return                              // ";;;" — só separadores
    if (pendente && !/^\d{1,2}\/\d{1,2}/.test(linha)) {
      const p = pendente
      pendente = null
      const nums: number[] = []
      const resto = [...cs]
      while (resto.length && numeroBR(resto[resto.length - 1]) !== null && nums.length < maxNums) {
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
      if (!opts.cartao) out[out.length - 1].descricao += ' ' + linha.replace(/\s+/g, ' ')
      return
    }
    // linha com espaço simples (copiada de PDF): tenta separar data e números do resto
    if (cs.length === 1) {
      const m = linha.match(/^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(.*?)\s+([-+]?[\d.,]+[-DC]?)(?:\s+([-+]?[\d.,]+[-DC]?))?$/i)
      // Data + histórico SEM valor (compra internacional: o valor vem linhas
      // abaixo, depois do câmbio) → vira `pendente` lá embaixo.
      const s = m ? null : linha.match(/^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(.+)$/)
      if (!m && !s) return
      cs = m ? [m[1], m[2], m[3], ...(m[4] ? [m[4]] : [])] : [s![1], s![2]]
    }
    // A data só vale no COMEÇO da linha: "PARC 03/10" no meio do histórico
    // parece data sem ano e não é.
    const data = dataISO(cs[0], anoPadrao, hoje)
    if (!data) return                                   // cabeçalho, rodapé
    const resto = cs.slice(1)
    // números do FIM pra trás: o último é saldo se houver dois
    const nums: number[] = []
    while (resto.length && numeroBR(resto[resto.length - 1]) !== null && nums.length < maxNums) {
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
  if (!opts.cartao) return out
  // Parcela no mês DELA (ver `opts`): a N-ésima de uma compra vai N−1 meses à frente.
  // ⚠️ SÓ a parcela DO CARTÃO ("(Parcela 03 de 06)", "PARC 02/10"), que o banco
  // lista com a data da compra original. "ALLIANZ SEGU*02 de 10" é a numeração
  // da SEGURADORA e já vem com a data da cobrança: deslocar jogava a 2ª parcela
  // (23/07) para 23/08 — fatura de 10/08/2026.
  return out.map(l => {
    const p = parcelaDoCartao(l.descricao)
    return p && p[0] > 1 ? { ...l, data: somaMeses(l.data, p[0] - 1) } : l
  })
}
