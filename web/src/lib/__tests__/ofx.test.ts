import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerOFX, ehOFX, nomeDoBanco, mesmoBanco } from '../ofx.ts'

// Trecho do OFX real do Inter (Conta PJ, 06/09 a 09/10/2026), encurtado.
const INTER = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST>
<DTSTART>20260906</DTSTART>
<DTEND>20261009</DTEND>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20261009</DTPOSTED>
<TRNAMT>1704.47</TRNAMT>
<FITID>202610090771</FITID>
<MEMO>Credito domicilio cartao: "CARTAO DE CREDITO - INTER PAG"</MEMO>
<NAME>Cartão De Crédito - Inter Pag</NAME>
</STMTTRN>
<STMTTRN>
<TRNTYPE>PAYMENT</TRNTYPE>
<DTPOSTED>20261008</DTPOSTED>
<TRNAMT>-1845.00</TRNAMT>
<FITID>202610080774</FITID>
<MEMO>Pix enviado: "Cp :60746948-Gg Importacao E Exportacao"</MEMO>
<NAME>Gg Importacao E Exportacao</NAME>
</STMTTRN>
<STMTTRN>
<TRNTYPE>PAYMENT</TRNTYPE>
<DTPOSTED>20260906</DTPOSTED>
<TRNAMT>-160.64</TRNAMT>
<FITID>202609060771</FITID>
<MEMO>Pix enviado: "Cp :60746948-RODOPOSTO GUARAREMA LTDA"</MEMO>
<NAME>Rodoposto Guararema Ltda</NAME>
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>20413.34</BALAMT>
<DTASOF>20261009</DTASOF>
</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`

test('reconhece OFX', () => {
  assert.equal(ehOFX(INTER), true)
  assert.equal(ehOFX('03/08/2026 Pix enviado -100,00 900,00'), false)
})

test('lê o OFX do Inter: data, sinal, FITID, descrição do MEMO, em ordem de data', () => {
  const r = lerOFX(INTER)
  assert.equal(r.linhas.length, 3)
  assert.deepEqual(r.linhas.map(l => l.data), ['2026-09-06', '2026-10-08', '2026-10-09'])
  assert.deepEqual(r.linhas.map(l => l.valor), [-160.64, -1845, 1704.47])
  assert.equal(r.linhas[1].fitid, '202610080774')
  assert.equal(r.linhas[1].descricao, 'Pix enviado: "Cp :60746948-Gg Importacao E Exportacao"')
  assert.equal(r.linhas.every(l => !l.sinalIncerto), true)
  assert.equal(r.cartao, false)
  assert.equal(r.inicio, '2026-09-06')
  assert.equal(r.fim, '2026-10-09')
})

test('o saldo do banco (LEDGERBAL) vai na última linha do dia dele', () => {
  const r = lerOFX(INTER)
  assert.deepEqual(r.saldo, { data: '2026-10-09', valor: 20413.34 })
  assert.equal(r.linhas[2].saldo, 20413.34)
  assert.equal(r.linhas[0].saldo, null)
})

// Trecho do OFX real do Itaú (14/10/2026): o banco intercala o SALDO como se fosse crédito.
const ITAU = `OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM>
<BANKID>0341
<ACCTID>0259000000
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261014100000[-03:EST]
<TRNAMT>-381.35
<FITID>20261014001
<MEMO>BOLETO PAGO EXPANSAO CONTABIL
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261014100000[-03:EST]
<TRNAMT>5034.53
<FITID>20261014002
<MEMO>RECEBIMENTO REDE VISA CD0096396083
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261013100000[-03:EST]
<TRNAMT>5671.92
<FITID>20261013001
<MEMO>SALDO TOTAL DISPONÍVEL DIA
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261013100000[-03:EST]
<TRNAMT>-50.00
<FITID>20261013002
<MEMO>TAR PIX PGTO
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260901100000[-03:EST]
<TRNAMT>1000.00
<FITID>20260901001
<MEMO>SALDO ANTERIOR
</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`

test('Itaú: linha de saldo não vira lançamento, vira o saldo do dia', () => {
  const x = lerOFX(ITAU)
  assert.deepEqual(x.linhas.map(l => [l.data, l.valor]), [['2026-10-13', -50], ['2026-10-14', -381.35], ['2026-10-14', 5034.53]])
  assert.equal(x.linhas.find(l => l.data === '2026-10-13')!.saldo, 5671.92)
  assert.deepEqual(x.banco, { id: '0341', nome: 'Itaú' })
})

test('o banco do arquivo casa com a instituição da conta', () => {
  assert.equal(nomeDoBanco('0341'), 'Itaú')
  assert.equal(nomeDoBanco('77'), 'Inter')
  assert.equal(mesmoBanco('Itaú', 'Itaú'), true)
  assert.equal(mesmoBanco('itau', 'Itaú'), true)
  assert.equal(mesmoBanco('Inter', 'Itaú'), false)
  assert.equal(mesmoBanco(null, 'Itaú'), false)
})
