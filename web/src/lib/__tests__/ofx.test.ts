import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerOFX, ehOFX } from '../ofx.ts'

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
