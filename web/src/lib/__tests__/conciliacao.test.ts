import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conciliar, nomeBate, dataDoTexto, semPar, type RegistroSistema } from '../conciliacao.ts'

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

// Caso real, Itaú SJ: Pix de 650 do Ricardo no sábado 05/09 (plano 400 + acessório 250 no
// contrato BRAD), lançado pelo banco em 08/09 depois do feriado.
const BRAD = 'SJ260827INDRICBRAAE BRAD'
const pixRicardo = { n: 1, data: '2026-09-08', valor: 650, descricao: 'PIX RECEBIDO RICARDO05/09 RICARDO LUIZ GARCIA LUZ 448.179.788-64' }

test('Itaú: a data escrita no texto vale como o dia do Pix (soma do contrato casa)', () => {
  assert.equal(dataDoTexto(pixRicardo.descricao, pixRicardo.data), '2026-09-05')
  const pares = conciliar([pixRicardo], [pag('p', BRAD, 400, '2026-09-05'), pag('c', BRAD, 250, '2026-09-05')])
  assert.equal(pares.get(1)?.tipo, 'contrato')
  assert.equal(pares.get(1)?.candidatos.length, 2)
})

test('dataDoTexto: só data de verdade, até 7 dias antes do banco', () => {
  assert.equal(dataDoTexto('PARCELA GIRO 13/48 ITAU', '2026-09-04'), null)        // não é data
  assert.equal(dataDoTexto('PIX RECEBIDO ANA10/09 ANA', '2026-09-08'), null)       // depois do banco
  assert.equal(dataDoTexto('PIX RECEBIDO ANA20/08 ANA', '2026-09-08'), null)       // longe demais
  assert.equal(dataDoTexto('PIX RECEBIDO ANA30/12 ANA', '2027-01-02'), '2026-12-30') // virada de ano
  assert.equal(dataDoTexto('Pix recebido: Cp :18236120-Leonardo', '2026-08-22'), null)
})

test('soma de um contrato em dias diferentes, com o nome batendo, vira UM provável (Quase lá)', () => {
  const linha = { n: 1, data: '2026-09-08', valor: 650, descricao: 'PIX RECEBIDO RICARDO LUIZ GARCIA LUZ' }
  const regs = [pag('p', BRAD, 400, '2026-09-05'), pag('c', BRAD, 250, '2026-09-06')]
  const pares = conciliar([linha], regs)
  const par = pares.get(1)
  assert.equal(par?.tipo, 'provavel')
  assert.equal(par?.candidatos.length, 1)
  assert.equal(par?.candidatos[0].valor, 650)
  assert.deepEqual(par?.candidatos[0].refs.map(r => r.origem_id), ['p', 'c'])
  // nenhuma das partes aparece em "não veio", nem quando a pessoa escolhe o candidato
  assert.equal(semPar(regs, pares).length, 0)
  assert.equal(semPar(regs, new Map(), [par!.candidatos[0].chave]).length, 0)
})

test('soma em dias diferentes SEM o nome batendo não casa', () => {
  const linha = { n: 1, data: '2026-09-08', valor: 650, descricao: 'PIX RECEBIDO FULANO DE TAL' }
  const pares = conciliar([linha], [pag('p', BRAD, 400, '2026-09-05'), pag('c', BRAD, 250, '2026-09-06')])
  assert.equal(pares.get(1), undefined)
})
