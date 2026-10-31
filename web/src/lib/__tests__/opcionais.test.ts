import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumoProdutosOpcional, opcionaisDoContrato } from '../farois.ts'
import {
  assinaturaProtocolo, carimbarProtocolo, alteracoesDesdeOSalvamento, listarAlteracoes, type ProtocoloData,
} from '../../components/protocolo/protocolo-utils.ts'

const cp = (codigo: string, rescaldo_tipo: string | null = null) => ({ produto: { codigo, rescaldo_tipo } })

test('resumo dos produtos: Nenhum, Só Pelinho, contador — marcadores de recusa não contam', () => {
  assert.equal(resumoProdutosOpcional([]), 'Nenhum')
  assert.equal(resumoProdutosOpcional([cp('0002', 'outro'), cp('0001')]), 'Nenhum')
  assert.equal(resumoProdutosOpcional([cp('0004', 'pelinho')]), 'Só Pelinho')
  assert.equal(resumoProdutosOpcional([cp('0004', 'pelinho'), cp('0002', 'outro')]), 'Só Pelinho')
  assert.equal(resumoProdutosOpcional([cp('0004', 'pelinho'), cp('U12')]), '2 produtos')
  assert.equal(resumoProdutosOpcional([cp('U12')]), '1 produto')
})

test('opcionais: certificado só no Ativo/Pinda, protocolo em toda etapa, nunca "pendente"', () => {
  const base = { certificado_confirmado: null, protocolo_data: null, contrato_produtos: [] }
  assert.deepEqual(opcionaisDoContrato({ ...base, status: 'ativo' }).map(o => o.id), ['certificado', 'protocolo', 'produtos'])
  assert.deepEqual(opcionaisDoContrato({ ...base, status: 'retorno' }).map(o => o.id), ['protocolo', 'produtos'])
  const [cert, prot] = opcionaisDoContrato({ ...base, status: 'pinda' })
  assert.equal(cert.texto, 'Não conferido'); assert.equal(cert.ok, false)
  assert.equal(prot.texto, 'Não preparado')
  const ok = opcionaisDoContrato({ ...base, status: 'pinda', certificado_confirmado: true, protocolo_data: {} })
  assert.equal(ok[0].ok, true); assert.equal(ok[1].ok, true); assert.equal(ok[1].texto, null)
  const alt = opcionaisDoContrato({ ...base, status: 'retorno', protocolo_data: {} }, true)
  assert.equal(alt[0].ok, false); assert.equal(alt[0].texto, 'Salvo · com alterações')
  for (const o of opcionaisDoContrato({ ...base, status: 'ativo' })) assert.ok(!/pendente/i.test(o.texto || ''))
})

const proto = (o: Partial<ProtocoloData> = {}): ProtocoloData => ({
  codigo: 'ST1', tipoCremacao: 'individual', numeroLacre: '10', petNome: 'Rex', petRaca: null, petCor: null, petPeso: 10,
  dataAcolhimento: '2026-10-30', tutorNome: 'Ana', tutorTelefone: '1', tutorEndereco: 'Rua A', tutorBairro: null,
  tutorCidade: 'Santos', tutorEstado: 'SP', tutorCep: null,
  produtos: [
    { nome: 'Cremação Individual', nomeRetorno: 'Crem.', valor: 900, pago: 'pend', tipo: 'cremacao' },
    { nome: 'Urna A', nomeRetorno: 'Urna A', valor: 200, pago: 'pend', tipo: 'urna' },
    { nome: 'Pingente', nomeRetorno: 'Ping', valor: 200, pago: 'pend', tipo: 'acessorio' },
  ],
  totalAPagar: 1300, totalPago: 0, saldo: 1300, mostrarPagamento: false, opcoesPagamento: { pix: 0, parcelado6: 0, parcelado12: 0 },
  ...o,
})

test('protocolo: edição à mão não acusa alteração; mudança do contrato acusa, por assunto', () => {
  const montado = proto()
  // a pessoa editou nome no protocolo, marcou Ok, mudou o valor exibido — nada disso conta
  const editado = { ...montado, tutorNome: 'Ana Maria', produtos: montado.produtos.map(p => ({ ...p, pago: 'ok' as const, nomeRetorno: 'x' })) }
  const salvo = carimbarProtocolo(editado, montado, new Date('2026-10-31T12:00:00Z'))
  assert.equal(salvo._salvoEm, '2026-10-31T12:00:00.000Z')
  assert.equal(salvo.tutorNome, 'Ana Maria')
  assert.deepEqual(alteracoesDesdeOSalvamento(salvo, montado), [])
  // ordem diferente dos produtos (empate de valor) não é alteração
  assert.deepEqual(alteracoesDesdeOSalvamento(salvo, proto({ produtos: [montado.produtos[0], montado.produtos[2], montado.produtos[1]] })), [])
  // pagamento entrou + produto novo
  const depois = proto({ totalPago: 500, produtos: [...montado.produtos, { nome: 'Pelo extra', nomeRetorno: 'P', valor: 50, pago: 'pend', tipo: 'acessorio' }] })
  assert.deepEqual(alteracoesDesdeOSalvamento(salvo, depois), ['produtos', 'pagamento'])
  assert.equal(listarAlteracoes(['produtos', 'pagamento']), 'produtos e pagamento')
  assert.equal(listarAlteracoes(['tutor', 'produtos', 'valores']), 'dados do tutor, produtos e valores')
  // sem carimbo (salvo antes): não dá pra saber
  assert.equal(alteracoesDesdeOSalvamento(montado, depois), null)
  assert.notEqual(assinaturaProtocolo(montado).valores, assinaturaProtocolo(proto({ totalAPagar: 1200 })).valores)
})
