import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conciliar, type RegistroSistema } from '../conciliacao.ts'

const pag = (chave: string, contrato: string, valor: number, data = '2026-08-22'): RegistroSistema => ({
  chave, data, valor, rotulo: `contrato ${contrato}`, contrato, refs: [{ origem: 'pagamento', origem_id: chave }], ajustavel: null,
})

test('um Pix pagando dois contratos no mesmo dia casa com a soma (MOZART + LYON)', () => {
  const pares = conciliar([{ n: 1, data: '2026-08-22', valor: 1387 }],
    [pag('a', 'MOZART', 97), pag('b', 'LYON', 1290), pag('c', 'REX', 500)])
  const p = pares.get(1)
  assert.equal(p?.tipo, 'contrato')
  assert.deepEqual(p?.candidatos.map(c => c.chave).sort(), ['a', 'b'])
})

test('duas combinações que somam igual não casam sozinhas', () => {
  const pares = conciliar([{ n: 1, data: '2026-08-22', valor: 300 }],
    [pag('a', 'A', 100), pag('b', 'B', 200), pag('c', 'C', 150), pag('d', 'D', 150)])
  assert.equal(pares.get(1)?.tipo, undefined)
})

test('contratos de outro dia não entram na soma', () => {
  const pares = conciliar([{ n: 1, data: '2026-08-22', valor: 1387 }],
    [pag('a', 'MOZART', 97), pag('b', 'LYON', 1290, '2026-08-21')])
  assert.notEqual(pares.get(1)?.tipo, 'contrato')
})

test('o par exato continua vencendo a soma', () => {
  const pares = conciliar([{ n: 1, data: '2026-08-22', valor: 97 }, { n: 2, data: '2026-08-22', valor: 1290 }],
    [pag('a', 'MOZART', 97), pag('b', 'LYON', 1290)])
  assert.equal(pares.get(1)?.tipo, 'exato')
  assert.equal(pares.get(2)?.tipo, 'exato')
})
