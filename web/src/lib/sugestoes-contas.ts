// SUGESTÕES DE CONTAS DE ACOMPANHAMENTO pelo histórico (14/10/2026; desenho na
// bancada docs/bancada_financeiro/sugestoes.html, com o histórico real de Santos).
//
// Uma categoria vira sugestão quando a despesa aparece em pelo menos 3 dos últimos
// 5 meses fechados, UMA vez por mês (no máximo um mês com mais de uma). Fica de
// fora o que:
//   · saiu no CARTÃO — já entra na previsão pela fatura; sugerir contaria 2 vezes;
//   · é distribuição (conta 6.x, retirada de sócios) — não é conta a pagar;
//   · já tem conta de acompanhamento (vínculo ou mesma categoria).
// Função pura: quem chama traz os lançamentos e decide o que já existe.

export type LancHist = {
  categoria_id: string | null
  fornecedor_nome: string | null
  valor: number
  data_caixa: string | null
  metodo_pagamento: string | null
  conta_pagamento_id: string | null
  conta_codigo: string | null
  conta_fixa_id: string | null
}

export type SugestaoConta = {
  categoria_id: string
  fornecedor: string | null
  valor: number
  varia: boolean
  regra: 'dia' | 'ultimo_util'
  dia: number | null
  diaVaria: boolean
  meses: { mes: string; valor: number; dia: number }[]
}

const mediana = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}
const c2 = (n: number) => Math.round(n * 100) / 100

/** Os `n` meses fechados antes de `hoje` (aaaa-mm), do mais antigo ao mais novo. */
export function mesesFechados(hoje: string, n = 5): string[] {
  const out: string[] = []
  let a = Number(hoje.slice(0, 4)), m = Number(hoje.slice(5, 7))
  for (let i = 0; i < n; i++) {
    m--; if (m === 0) { m = 12; a-- }
    out.unshift(`${a}-${String(m).padStart(2, '0')}`)
  }
  return out
}

export function sugerirContas(lancs: LancHist[], opts: {
  hoje: string
  contasCartao: Set<string>
  categoriasJaUsadas: Set<string>
}): SugestaoConta[] {
  const meses = mesesFechados(opts.hoje)
  const porCat = new Map<string, LancHist[]>()
  for (const l of lancs) {
    if (!l.categoria_id || !l.data_caixa || l.conta_fixa_id) continue
    if (opts.categoriasJaUsadas.has(l.categoria_id)) continue
    if (l.metodo_pagamento === 'credito' || (l.conta_pagamento_id && opts.contasCartao.has(l.conta_pagamento_id))) continue
    if ((l.conta_codigo || '').startsWith('6.')) continue
    if (!meses.includes(l.data_caixa.slice(0, 7))) continue
    porCat.set(l.categoria_id, [...(porCat.get(l.categoria_id) || []), l])
  }
  const out: SugestaoConta[] = []
  for (const [cat, ls] of porCat) {
    const pm = new Map<string, LancHist[]>()
    for (const l of ls) pm.set(l.data_caixa!.slice(0, 7), [...(pm.get(l.data_caixa!.slice(0, 7)) || []), l])
    if (pm.size < 3) continue
    if ([...pm.values()].filter(v => v.length > 1).length > 1) continue
    const hist = meses.filter(m => pm.has(m)).map(m => {
      const v = pm.get(m)!
      return { mes: m, valor: c2(v.reduce((a, x) => a + Number(x.valor), 0)), dia: Math.min(...v.map(x => Number(x.data_caixa!.slice(8, 10)))) }
    })
    const ult3 = hist.slice(-3).map(h => h.valor)
    const med = mediana(hist.map(h => h.valor))
    const varia = (Math.max(...ult3) - Math.min(...ult3)) / (mediana(ult3) || 1) > 0.05
    const dias = hist.map(h => h.dia)
    const fimDoMes = dias.every(d => d >= 28)
    const forn = ls.map(l => l.fornecedor_nome).filter((x): x is string => !!x)
    const fornecedor = forn.length ? forn.sort((a, b) => forn.filter(x => x === b).length - forn.filter(x => x === a).length)[0] : null
    out.push({
      categoria_id: cat, fornecedor,
      valor: c2(varia ? med : hist[hist.length - 1].valor), varia,
      regra: fimDoMes ? 'ultimo_util' : 'dia', dia: fimDoMes ? null : Math.round(mediana(dias)),
      diaVaria: !fimDoMes && Math.max(...dias) - Math.min(...dias) > 5,
      meses: hist,
    })
  }
  return out.sort((a, b) => b.meses.length - a.meses.length || b.valor - a.valor)
}
