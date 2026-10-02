// Planilha do repasse em Excel — a versão "aberta" do Resumo (02/10/2026).
// Quatro abas: Resumo (a conta inteira), Cremações (pet a pet, com espécie,
// raça, peso e local), Acertos (data, sentido, categoria) e Por tipo (IND × COL).
// Puro: recebe os dados já carregados e devolve as abas pro lib/xlsx-simples.

import type { Aba, Celula } from './xlsx-simples'
import { dataExcel } from './xlsx-simples'
import { calcularAbatimento, calcularValorFinal, rotuloMes, totalAPagar, type ItemRepasse, type Permuta } from './repasse'

export type ExtraPet = {
  especie?: string | null
  raca?: string | null
  peso?: number | null
  plano?: string | null        // emergencial / preventivo
  local?: string | null        // onde foi removido
}

export type AcertoExcel = {
  data: string | null
  descricao: string
  categoria: string | null
  direcao: 'abate' | 'acresce'
  valor: number
  status: string
  lancadoPor: string | null
}

const m = (v: number | null | undefined): Celula => ({ v: Number(v || 0), estilo: 'moeda' })
const mb = (v: number | null | undefined): Celula => ({ v: Number(v || 0), estilo: 'moedaNegrito' })
const b = (s: string): Celula => ({ v: s, estilo: 'negrito' })
const d = (iso: string | null | undefined): Celula => ({ v: dataExcel(iso), estilo: 'data' })

const ESPECIE: Record<string, string> = { canina: 'Canina', felina: 'Felina', exotica: 'Exótica' }
const tipoNome = (t: ItemRepasse['tipo_cremacao']) => (t === 'individual' ? 'Individual' : t === 'coletiva' ? 'Coletiva' : '—')

function rotuloDesconto(i: ItemRepasse): string {
  if (!calcularAbatimento(i)) return ''
  return i.deflator_tipo === 'percentual' ? `${Number(i.deflator_valor)}%` : 'R$'
}

export function abasRepasseExcel(p: {
  unidade: string
  mesRef: string                       // 'AAAA-MM-01'
  itens: ItemRepasse[]
  permutas: Permuta[]                  // o que entra no total (mesma conta da tela)
  acertos: AcertoExcel[]               // a lista aberta, com categoria e data
  extras: Map<string, ExtraPet>        // contrato_id → detalhes do pet
  situacao: string
  pagamento?: { valor: number; data: string } | null
}): Aba[] {
  const t = totalAPagar(p.itens, p.permutas)
  const titulo = `${p.unidade} — ${rotuloMes(p.mesRef)}`

  // ── Resumo ──────────────────────────────────────────────────────────────
  const resumo: Celula[][] = [
    [b('RIP Pet — Repasse de cremações')],
    [titulo],
    [],
    [b('Item'), b('Qtd'), b('Valor')],
    ['Cremações a preço de tabela', t.qtd, m(t.bruto)],
    ['(−) Descontos por pet', p.itens.filter(i => calcularAbatimento(i) > 0).length, m(-t.deflator)],
    [b('= Cremações'), t.qtd, mb(t.liquido)],
    ['(+) Acertos que acrescem', p.permutas.filter(x => x.direcao === 'acresce').length, m(t.acresce)],
    ['(−) Acertos que abatem', p.permutas.filter(x => x.direcao === 'abate').length, m(-t.abate)],
    [b('= A PAGAR'), '', mb(t.aPagar)],
    [],
    [b('Situação'), p.situacao],
  ]
  if (p.pagamento) {
    resumo.push(['Pago em', '', d(p.pagamento.data)])
    resumo.push(['Valor pago', '', m(p.pagamento.valor)])
    const dif = Math.round((p.pagamento.valor - t.aPagar) * 100) / 100
    if (dif) resumo.push(['Diferença (pago − a pagar)', '', m(dif)])
  } else {
    resumo.push(['Pagamento', 'ainda não pago'])
  }
  resumo.push([], ['Na DRE: cada cremação conta pelo valor cobrado (com o desconto); cada acerto já está na DRE das duas pontas. O pagamento só move o dinheiro.'])

  // ── Cremações ───────────────────────────────────────────────────────────
  const cab = ['Acolhimento', 'Contrato', 'Lacre', 'Pet', 'Espécie', 'Raça', 'Peso (kg)', 'Tutor',
               'Tipo', 'Plano', 'Local de remoção', 'Valor tabela', 'Desconto', 'Tipo desc.', 'Motivo', 'Valor final']
  const pets: Celula[][] = [cab.map(b)]
  p.itens.forEach(i => {
    const x = p.extras.get(i.contrato_id) || {}
    pets.push([
      d(i.data_acolhimento), i.contrato_codigo, i.numero_lacre, i.pet_nome,
      x.especie ? ESPECIE[x.especie] || x.especie : '', x.raca, x.peso ?? null, i.tutor_nome,
      tipoNome(i.tipo_cremacao), x.plano === 'preventivo' ? 'Preventivo' : x.plano === 'emergencial' ? 'Emergencial' : '',
      x.local, m(i.valor_base), m(calcularAbatimento(i)), rotuloDesconto(i), calcularAbatimento(i) ? i.deflator_motivo : '', m(calcularValorFinal(i)),
    ])
  })
  pets.push([], [b(`Total (${t.qtd} pets)`), '', '', '', '', '', '', '', '', '', '', mb(t.bruto), mb(t.deflator), '', '', mb(t.liquido)])

  // ── Acertos ─────────────────────────────────────────────────────────────
  const acs: Celula[][] = [['Data', 'Sentido', 'Descrição', 'Categoria', 'Valor', 'Efeito no a pagar', 'Situação', 'Lançado por'].map(b)]
  p.acertos.forEach(a => acs.push([
    d(a.data), a.direcao === 'acresce' ? `Matriz cobra de ${p.unidade}` : `${p.unidade} cobra da Matriz`,
    a.descricao, a.categoria || '(sem categoria)', m(a.valor),
    m(a.direcao === 'acresce' ? a.valor : -a.valor), a.status, a.lancadoPor,
  ]))
  if (!p.acertos.length) acs.push(['Nenhum acerto neste repasse.'])
  else acs.push([], [b('Saldo dos acertos'), '', '', '', '', mb(t.acresce - t.abate)])

  // ── Por tipo ────────────────────────────────────────────────────────────
  const tipos: Celula[][] = [['Tipo', 'Pets', 'Valor tabela', 'Descontos', 'Valor final', 'Médio por pet'].map(b)]
  for (const tp of ['individual', 'coletiva'] as const) {
    const g = p.itens.filter(i => i.tipo_cremacao === tp)
    if (!g.length) continue
    const fin = g.reduce((s, i) => s + calcularValorFinal(i), 0)
    tipos.push([tipoNome(tp), g.length, m(g.reduce((s, i) => s + Number(i.valor_base || 0), 0)),
                m(g.reduce((s, i) => s + calcularAbatimento(i), 0)), m(fin), m(fin / g.length)])
  }
  tipos.push([b('Total'), t.qtd, mb(t.bruto), mb(t.deflator), mb(t.liquido), mb(t.qtd ? t.liquido / t.qtd : 0)])

  return [
    { nome: 'Resumo', linhas: resumo, larguras: [34, 18, 16] },
    { nome: 'Cremações', linhas: pets, congelarLinhas: 1,
      larguras: [12, 22, 10, 16, 9, 16, 9, 26, 11, 12, 24, 13, 12, 9, 24, 13] },
    { nome: 'Acertos', linhas: acs, congelarLinhas: 1, larguras: [12, 26, 36, 28, 13, 15, 11, 18] },
    { nome: 'Por tipo', linhas: tipos, larguras: [12, 8, 14, 13, 14, 14] },
  ]
}

/** repasse-santos-2026-04.xlsx */
export function nomeArquivoRepasseExcel(unidade: string, mes: string): string {
  const slug = (unidade || 'unidade').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `repasse-${slug}-${mes.slice(0, 7)}.xlsx`
}
