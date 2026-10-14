// OFX — o extrato no formato PADRÃO dos bancos (09/10/2026, pedido do Lucas:
// "que coisa linda que já existe isso").
//
// Colar texto obriga a adivinhar o formato de cada banco (data por extenso,
// "- R$", valor na linha de baixo, câmbio…). O OFX traz cada lançamento com
// data, valor COM SINAL, um ID dado pelo banco (FITID) e o saldo do fim
// (LEDGERBAL). Este leitor devolve as MESMAS `LinhaExtrato` do texto colado:
// o Importar extrato segue igual daí pra frente.
//
// Formato real, Inter (OFX 1.02, SGML — tag sem fechamento é normal):
//   <STMTTRN><TRNTYPE>PAYMENT<DTPOSTED>20261008<TRNAMT>-1845.00
//   <FITID>202610080774<MEMO>Pix enviado: "Cp :60746948-Fulano"<NAME>Fulano</STMTTRN>
//   <LEDGERBAL><BALAMT>20413.34<DTASOF>20261009</LEDGERBAL>
// O MEMO é o mesmo texto do extrato do app — por isso é ele a descrição (o
// histórico e a memória de categorias aprendem com esse texto).

import type { LinhaExtrato } from './extrato'

export type LinhaOFX = LinhaExtrato & { fitid: string }
// O BANCO DO ARQUIVO (14/10/2026): <BANKID> é o código de compensação. Com ele o Importar
// escolhe a conta sozinho quando a unidade tem UMA conta daquele banco (casando com
// `contas.instituicao`) — sem guardar número de conta (decisão do Lucas: por ora, só o banco).
export const BANCOS: Record<string, string> = {
  '001': 'Banco do Brasil', '033': 'Santander', '077': 'Inter', '104': 'Caixa', '197': 'Stone',
  '208': 'BTG', '212': 'Original', '237': 'Bradesco', '260': 'Nubank', '290': 'PagBank',
  '323': 'Mercado Pago', '336': 'C6', '341': 'Itaú', '380': 'PicPay', '403': 'Cora', '422': 'Safra',
  '536': 'Neon', '748': 'Sicredi', '756': 'Sicoob',
}
/** "0341" → "Itaú" (o código vem com ou sem zero à esquerda). */
export function nomeDoBanco(bankId: string | null | undefined): string | null {
  if (!bankId) return null
  const k = bankId.replace(/\D/g, '').replace(/^0+(?=\d{3})/, '').padStart(3, '0')
  return BANCOS[k] || null
}
/** "Itaú" ≈ "itau" ≈ "Banco Itaú S.A." — compara sem acento nem caixa. */
export function mesmoBanco(instituicao: string | null | undefined, banco: string | null): boolean {
  if (!instituicao || !banco) return false
  const n = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return n(instituicao).includes(n(banco)) || n(banco).includes(n(instituicao))
}

/** Linha que o banco põe na lista mas NÃO é lançamento: o Itaú intercala o saldo do dia
 *  ("SALDO TOTAL DISPONÍVEL DIA") e o saldo anterior como se fossem créditos. */
const LINHA_DE_SALDO = /^SALDO (TOTAL DISPON[IÍ]VEL DIA|ANTERIOR|DO DIA|FINAL)\b/i

export type ExtratoOFX = {
  linhas: LinhaOFX[]
  /** código do banco (<BANKID>) e o nome, se conhecido */
  banco: { id: string; nome: string | null } | null
  saldo: { data: string; valor: number } | null
  cartao: boolean              // CREDITCARDMSGSRSV1: fatura de cartão
  inicio: string | null
  fim: string | null
}

/** Um campo SGML: `<TAG>valor` até a próxima tag ou fim de linha. */
function campo(bloco: string, tag: string): string | null {
  const m = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'))
  return m ? m[1].trim() : null
}
/** 20261008 / 20261008120000[-3:BRT] → 2026-10-08 */
function dataOFX(v: string | null): string | null {
  const m = v?.match(/^(\d{4})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}
/** "-1845.00" (padrão) ou "-1845,00" (banco que escreve à brasileira). */
function valorOFX(v: string | null): number | null {
  if (!v) return null
  const t = v.replace(/\s/g, '')
  const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
const semEntidades = (s: string) => s
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

export function ehOFX(texto: string): boolean {
  return /<OFX>/i.test(texto) && /<STMTTRN>/i.test(texto)
}

export function lerOFX(texto: string): ExtratoOFX {
  const blocos = texto.split(/<STMTTRN>/i).slice(1).map(b => b.split(/<\/STMTTRN>/i)[0])
  const linhas: LinhaOFX[] = []
  const saldoDoDia = new Map<string, number>()   // Itaú: o saldo que ele mesmo lista por dia
  blocos.forEach((b, k) => {
    const data = dataOFX(campo(b, 'DTPOSTED'))
    const valor = valorOFX(campo(b, 'TRNAMT'))
    if (!data || valor === null) return
    const memo = semEntidades(campo(b, 'MEMO') || '')
    // linha de saldo NÃO é lançamento — vira o saldo daquele dia (o Importar confere com ele)
    if (LINHA_DE_SALDO.test(memo.trim())) { if (/DISPON|DO DIA|FINAL/i.test(memo)) saldoDoDia.set(data, valor); return }
    if (valor === 0) return
    const nome = semEntidades(campo(b, 'NAME') || '')
    const descricao = (memo || nome).replace(/\s+/g, ' ').trim()
    const fitid = campo(b, 'FITID') || `${data}-${k}`
    linhas.push({
      n: k + 1, data, descricao, valor, saldo: null, sinalIncerto: false, fitid,
      original: [campo(b, 'TRNTYPE'), data, valor.toFixed(2), descricao, nome && nome !== memo ? `(${nome})` : ''].filter(Boolean).join(' · '),
    })
  })
  // O banco lista do mais novo pro mais velho; o Importar lê em ordem de data.
  linhas.sort((a, b) => a.data.localeCompare(b.data) || a.fitid.localeCompare(b.fitid))
  linhas.forEach((l, i) => { l.n = i + 1 })

  const bal = texto.match(/<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|<\/CCSTMTRS>)/i)?.[1] || ''
  const saldoValor = valorOFX(campo(bal, 'BALAMT'))
  const saldoData = dataOFX(campo(bal, 'DTASOF'))
  const saldo = saldoValor !== null && saldoData ? { data: saldoData, valor: saldoValor } : null
  // O saldo vai na ÚLTIMA linha daquele dia — é como o Importar já lê o saldo
  // do texto colado (placar e "está batendo com o banco?").
  if (saldo) {
    const ultima = [...linhas].reverse().find(l => l.data === saldo.data)
    if (ultima) ultima.saldo = saldo.valor
  }
  // o saldo de cada dia que o banco listou (Itaú), na última linha daquele dia
  for (const [dia, v] of saldoDoDia) {
    const ultima = [...linhas].reverse().find(l => l.data === dia)
    if (ultima && ultima.saldo === null) ultima.saldo = v
  }
  const bankId = campo(texto, 'BANKID')
  return {
    linhas, saldo,
    banco: bankId ? { id: bankId, nome: nomeDoBanco(bankId) } : null,
    cartao: /<CREDITCARDMSGSRSV1>|<CCSTMTRS>/i.test(texto),
    inicio: dataOFX(campo(texto, 'DTSTART')),
    fim: dataOFX(campo(texto, 'DTEND')),
  }
}

/** O arquivo vem em UTF-8 (o Inter, apesar do cabeçalho dizer 1252) ou em
 *  Windows-1252 (o que o padrão manda): tenta o primeiro sem aceitar erro. */
export async function textoDoArquivo(arquivo: File): Promise<string> {
  const buf = await arquivo.arrayBuffer()
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf) }
  catch { return new TextDecoder('windows-1252').decode(buf) }
}
