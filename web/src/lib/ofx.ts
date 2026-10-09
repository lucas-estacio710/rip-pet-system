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
export type ExtratoOFX = {
  linhas: LinhaOFX[]
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
  blocos.forEach((b, k) => {
    const data = dataOFX(campo(b, 'DTPOSTED'))
    const valor = valorOFX(campo(b, 'TRNAMT'))
    if (!data || valor === null || valor === 0) return
    const memo = semEntidades(campo(b, 'MEMO') || '')
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
  return {
    linhas, saldo,
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
