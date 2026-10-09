import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conciliar, nomeBate, type RegistroSistema } from '../conciliacao.ts'

const pag = (chave: string, contrato: string, valor: number, data = '2026-08-22'): RegistroSistema => ({
  chave, data, valor, rotulo: `contrato ${contrato.split(' ')[1]}`, contrato, refs: [{ origem: 'pagamento', origem_id: chave }], ajustavel: null,
})
const LYON = 'ST260822INDLEOLYOHC LYON'
const MOZART = 'ST260822INDSANMOZAZ MOZART'

// Caso real, Inter PJ 22/08/2026: dois contratos de 1.290 no mesmo dia.
const registros = () => [pag('mozCat', MOZART, 97), pag('lyon', LYON, 1290), pag('mozPlano', MOZART, 1290)]
const linhas = [
  { n: 1, data: '2026-08-22', valor: 1290, descricao: 'Pix recebido: Cp :18236120-Leonardo Viana de Carvalho' },
  { n: 2, data: '2026-08-22', valor: 1387, descricao: 'Pix recebido: Cp :18236120-Daniela da Rocha Soares' },
]

test('empate de valor: o nome do pagador leva o contrato certo (Leonardo → LYON)', () => {
  const pares = conciliar(linhas, registros())
  assert.equal(pares.get(1)?.tipo, 'exato')
  assert.equal(pares.get(1)?.candidatos[0].chave, 'lyon')
  // e o Pix de 1.387 vira a soma dos 2 pagamentos do MOZART
  assert.equal(pares.get(2)?.tipo, 'contrato')
  assert.deepEqual(pares.get(2)?.candidatos.map(c => c.chave).sort(), ['mozCat', 'mozPlano'])
})

test('empate sem nome que decida: espera o contrato e leva o que sobrou', () => {
  const ls = [{ ...linhas[0], descricao: 'Pix recebido: Cp :1-Fulano de Tal' }, linhas[1]]
  const pares = conciliar(ls, registros())
  assert.equal(pares.get(2)?.tipo, 'contrato')
  assert.equal(pares.get(1)?.candidatos[0].chave, 'lyon')
})

test('nomeBate usa as 3 letras do tutor no código', () => {
  assert.equal(nomeBate('Pix recebido: Cp :1-Leonardo Viana', LYON), true)
  assert.equal(nomeBate('Pix recebido: Cp :1-Daniela Soares', LYON), false)
  assert.equal(nomeBate('qualquer', 'sem codigo'), false)
})
