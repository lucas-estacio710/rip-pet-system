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
//
// EMPATE NO EXATO (09/10/2026): dois contratos com o MESMO valor no mesmo dia
// (LYON 1.290 do Leonardo e o plano do MOZART 1.290 do Sandro). O primeiro Pix
// levava o primeiro da lista — o do Leonardo levou o do MOZART, e o Pix de
// 1.387 (MOZART 1.290 + 97) ficou sem par. Agora o NOME de quem pagou decide
// (as 3 letras do tutor no código do contrato); sem nome que decida, a linha
// espera a passada do contrato e só depois leva o que sobrou.
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

export type LinhaBancoMin = { n: number; data: string; valor: number; descricao?: string }

const DIA = 86400000
export const diasEntre = (a: string, b: string) =>
  Math.round(Math.abs(Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / DIA)
const igual = (a: number, b: number) => Math.abs(a - b) < 0.005

/** O pagador do banco bate com o tutor do contrato? O código é
 *  {UNID}{AAMMDD}{IND|COL}{TTT}{PPP}{XX} — TTT são as 3 letras do tutor. */
export function nomeBate(descricaoBanco: string | undefined, contrato: string | null): boolean {
  if (!descricaoBanco || !contrato) return false
  const codigo = contrato.split(' ')[0] || ''
  if (!/^[A-Z]{2}\d{6}(IND|COL)[A-Z]{3}/.test(codigo)) return false
  const ttt = codigo.slice(11, 14)
  const palavras = descricaoBanco.normalize('NFD').replace(/[^A-Za-z ]/g, ' ').toUpperCase().split(/ +/)
  return palavras.some(w => w.length >= 3 && w.startsWith(ttt))
}

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
  //    levar o registro que era o par exato de outra linha. Com mais de um
  //    candidato, o nome desempata; sem desempate, a linha ESPERA (1b).
  const exatosDe = (l: LinhaBancoMin) =>
    registros.filter(x => !usado.has(x.chave) && x.data === l.data && igual(x.valor, l.valor))
  const adiadas: LinhaBancoMin[] = []
  for (const l of linhas) {
    const cs = exatosDe(l)
    if (!cs.length) continue
    const peloNome = cs.length > 1 ? cs.filter(x => nomeBate(l.descricao, x.contrato)) : cs
    if (peloNome.length !== 1) { adiadas.push(l); continue }
    usado.add(peloNome[0].chave)
    pares.set(l.n, { tipo: 'exato', candidatos: [peloNome[0]] })
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

  // 1b) as adiadas levam o que sobrou depois do contrato (como sempre foi)
  for (const l of adiadas) {
    if (pares.has(l.n)) continue
    const r = exatosDe(l)[0]
    if (r) { usado.add(r.chave); pares.set(l.n, { tipo: 'exato', candidatos: [r] }) }
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
