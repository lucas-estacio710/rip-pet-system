// CONCILIAÇÃO — qual registro do sistema é o par de cada linha do banco (08/10/2026).
//
// Puro, sem I/O, pra testar com extrato real. Nasceu da "ala dos caxias" (Lucas):
// quem lança compra por compra durante o mês e cola a fatura no fim. O casamento
// antigo exigia MESMA data e MESMO valor; o caxias lança no dia em que lembra, e a
// compra internacional chega com o valor do câmbio — duplicava.
//
// O que se copiou de quem já resolveu (pesquisa, FLOW_FINANCEIRO §9.1.20):
//   · o VALOR manda e a data tem folga (QuickBooks: 90 dias antes a 20 depois;
//     aqui ±5, porque o caxias lança perto da compra);
//   · câmbio tem tolerância (Expensify: ±5%) — só no cartão;
//   · casa SOZINHO só quando há UM candidato; com mais de um, a pessoa escolhe
//     (Xero confirma sozinho só com confiança alta);
//   · na dúvida, o BANCO manda — o registro confirmado recebe valor e data dele.
//
// Quatro níveis, nesta ordem:
//   1. exato     — mesma data e mesmo valor (como sempre foi);
//   2. contrato  — a soma dos pagamentos de UM contrato no mesmo dia (Pix único
//                  que no contrato virou plano + acessório; só conta corrente);
//      2b. e a soma de VÁRIOS contratos no mesmo dia (09/10/2026: a tutora pagou
//          MOZART 97 + LYON 1.290 num Pix só de 1.387). Só com UMA combinação
//          possível — duas que somam igual é coincidência, e aí a pessoa decide;
//   3. provavel  — um único candidato dentro da folga;
//   4. ambiguo   — mais de um candidato: a tela lista e a pessoa escolhe.

export type Ref = { origem: 'pagamento' | 'lancamento' | 'movimento'; origem_id: string }

/** Um registro do sistema, já agrupado (despesa dividida = um registro só). */
export type RegistroSistema = {
  chave: string
  data: string                   // ISO — a data que se compara com a do banco
  valor: number                  // com sinal, igual ao banco (saída < 0)
  rotulo: string                 // pra tela: "contrato MEL", "Combustível", …
  contrato: string | null        // pagamentos: o código do contrato (passada 2)
  refs: Ref[]                    // o que vira conciliação
  /** Lançamento único, que pode receber o valor/data do banco ao confirmar. */
  ajustavel: string | null
}

export type ParConciliacao = {
  tipo: 'exato' | 'contrato' | 'provavel' | 'ambiguo'
  candidatos: RegistroSistema[]  // exato/contrato/provavel: 1 (ou as partes do contrato); ambiguo: 2+
}

export type LinhaBancoMin = { n: number; data: string; valor: number }

const DIA = 86400000
export const diasEntre = (a: string, b: string) =>
  Math.round(Math.abs(Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / DIA)
const igual = (a: number, b: number) => Math.abs(a - b) < 0.005

export function conciliar(
  linhas: LinhaBancoMin[],
  registros: RegistroSistema[],
  opts: { janelaDias?: number; toleranciaCambio?: number; porContrato?: boolean } = {},
): Map<number, ParConciliacao> {
  const janela = opts.janelaDias ?? 5
  const tol = opts.toleranciaCambio ?? 0
  const usado = new Set<string>()
  const pares = new Map<number, ParConciliacao>()

  // 1) exato — em TODAS as linhas antes de qualquer folga: uma folga não pode
  //    levar o registro que era o par exato de outra linha.
  for (const l of linhas) {
    const r = registros.find(x => !usado.has(x.chave) && x.data === l.data && igual(x.valor, l.valor))
    if (r) { usado.add(r.chave); pares.set(l.n, { tipo: 'exato', candidatos: [r] }) }
  }

  // 2) soma dos pagamentos de um contrato no mesmo dia
  if (opts.porContrato !== false) {
    for (const l of linhas) {
      if (pares.has(l.n)) continue
      const porContrato = new Map<string, RegistroSistema[]>()
      for (const r of registros) {
        if (usado.has(r.chave) || !r.contrato || r.data !== l.data) continue
        porContrato.set(r.contrato, [...(porContrato.get(r.contrato) || []), r])
      }
      for (const partes of porContrato.values()) {
        if (partes.length > 1 && igual(partes.reduce((a, r) => a + r.valor, 0), l.valor)) {
          partes.forEach(r => usado.add(r.chave))
          pares.set(l.n, { tipo: 'contrato', candidatos: partes })
          break
        }
      }
    }
  }

  // 2b) a soma de 2 a 4 CONTRATOS diferentes no mesmo dia — cada contrato entra
  //     inteiro (todos os pagamentos dele naquele dia). Só entradas, e só quando
  //     a combinação é única.
  if (opts.porContrato !== false) {
    for (const l of linhas) {
      if (pares.has(l.n) || l.valor <= 0) continue
      const porContrato = new Map<string, RegistroSistema[]>()
      for (const r of registros) {
        if (usado.has(r.chave) || !r.contrato || r.data !== l.data || r.valor <= 0) continue
        porContrato.set(r.contrato, [...(porContrato.get(r.contrato) || []), r])
      }
      const grupos = [...porContrato.values()].map(rs => ({ rs, soma: rs.reduce((a, r) => a + r.valor, 0) }))
      if (grupos.length < 2 || grupos.length > 25) continue
      const achadas: number[][] = []
      const busca = (ini: number, esc: number[], soma: number) => {
        if (achadas.length > 1) return
        if (esc.length >= 2 && igual(soma, l.valor)) { achadas.push([...esc]); return }
        if (esc.length === 4 || soma > l.valor + 0.005) return
        for (let k = ini; k < grupos.length; k++) busca(k + 1, [...esc, k], soma + grupos[k].soma)
      }
      busca(0, [], 0)
      if (achadas.length !== 1) continue
      const partes = achadas[0].flatMap(k => grupos[k].rs)
      partes.forEach(r => usado.add(r.chave))
      pares.set(l.n, { tipo: 'contrato', candidatos: partes })
    }
  }

  // 3/4) folga — candidatos de mesmo sinal, dentro da janela de dias, com valor
  //      igual (ou dentro do câmbio, se houver tolerância). Valor igual vem antes.
  type Cand = { r: RegistroSistema; nota: number }
  const candidatosDe = (l: LinhaBancoMin): Cand[] => registros
    .filter(r => !usado.has(r.chave) && Math.sign(r.valor) === Math.sign(l.valor))
    .map(r => {
      const d = diasEntre(r.data, l.data)
      if (d > janela) return null
      const exatoValor = igual(r.valor, l.valor)
      const dentroCambio = tol > 0 && Math.abs(r.valor - l.valor) <= Math.abs(l.valor) * tol
      if (!exatoValor && !dentroCambio) return null
      // menor nota = melhor: valor igual vale mais que câmbio; depois, o mais perto
      return { r, nota: (exatoValor ? 0 : 100) + d }
    })
    .filter((c): c is Cand => c !== null)
    .sort((a, b) => a.nota - b.nota)

  // Quem tem UM candidato só resolve primeiro e o consome; os outros recalculam.
  const restantes = linhas.filter(l => !pares.has(l.n))
  let mudou = true
  while (mudou) {
    mudou = false
    for (const l of restantes) {
      if (pares.has(l.n)) continue
      const cs = candidatosDe(l)
      if (cs.length === 1) {
        usado.add(cs[0].r.chave)
        pares.set(l.n, { tipo: 'provavel', candidatos: [cs[0].r] })
        mudou = true
      }
    }
  }
  for (const l of restantes) {
    if (pares.has(l.n)) continue
    const cs = candidatosDe(l)
    if (cs.length > 1) pares.set(l.n, { tipo: 'ambiguo', candidatos: cs.slice(0, 4).map(c => c.r) })
  }
  return pares
}

/** Registros que estavam no período/fatura e não casaram com linha nenhuma. */
export function semPar(registros: RegistroSistema[], pares: Map<number, ParConciliacao>, escolhidos: string[] = []): RegistroSistema[] {
  const tomados = new Set<string>(escolhidos)
  for (const p of pares.values()) if (p.tipo !== 'ambiguo') p.candidatos.forEach(c => tomados.add(c.chave))
  return registros.filter(r => !tomados.has(r.chave))
}
