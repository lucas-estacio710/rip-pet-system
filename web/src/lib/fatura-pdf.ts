// FATURA DE CARTÃO EM PDF (14/10/2026) — o banco não exporta OFX de fatura, e colar texto
// era arriscado. Daqui sai o TEXTO do PDF, linha por linha, do jeito que o leitor de fatura
// (`lerExtrato` em modo cartão + `cabecalhoFatura`) já entende. Por ora o formato conferido é
// o do Inter (fatura-inter-2026-10.pdf: as compras somam o total da fatura, centavo a centavo).
//
// ⚠️ pdfjs-dist só entra por import() dinâmico — o mesmo cuidado de pdf-lib/jspdf: estático,
// pesaria em toda tela que importa o Importar. O worker é servido de /public
// (pdf.worker.min.mjs, copiado de node_modules/pdfjs-dist/build): AO ATUALIZAR o pdfjs-dist,
// copiar o worker de novo — versão do worker diferente da lib quebra a leitura.

type Item = { str: string; x: number; y: number; w?: number }

/** Junta os pedaços de texto de cada página em LINHAS (mesma altura), da esquerda pra direita. */
export function itensEmLinhas(itens: Item[]): string[] {
  const linhas: { y: number; itens: Item[] }[] = []
  for (const it of itens) {
    if (!it.str.trim()) continue
    const l = linhas.find(x => Math.abs(x.y - it.y) < 3)
    if (l) l.itens.push(it); else linhas.push({ y: it.y, itens: [it] })
  }
  return linhas.sort((a, b) => b.y - a.y)       // o PDF conta y de baixo pra cima
    .map(l => {
      // espaço só onde HÁ espaço: o PDF guarda "P" + "AGAMENTO" colados (kerning) em pedaços
      const its = l.itens.sort((a, b) => a.x - b.x)
      let t = ''
      its.forEach((i, k) => {
        const ant = its[k - 1]
        const junto = !!ant && ant.w !== undefined && i.x - (ant.x + ant.w) < 1
        t += (k && !junto ? ' ' : '') + i.str
      })
      return t.replace(/\s+/g, ' ').trim()
    })
    .filter(Boolean)
}

/** O PDF é de fatura do Inter? (o único formato conferido por enquanto) */
export const ehFaturaInter = (texto: string) => /\binter\b/i.test(texto) && /Despesas da fatura/i.test(texto)

/** Só o que é fatura: o cabeçalho (cartão · vencimento · total) e de "Despesas da fatura" até o
 *  último "Total CARTÃO". O resto do PDF — resumo, limites, encargos e o BOLETO (cujo nº de
 *  documento parecia um valor) — fica de fora. */
export function recorteFaturaInter(texto: string): string {
  const ls = texto.split('\n')
  const cab = ls.find(l => /\d{4}\*{4}\d{4}\s+\d{2}\/\d{2}\/\d{4}\s+R?\$/.test(l)) || ''
  const ini = ls.findIndex(l => /Despesas da fatura/i.test(l))
  let fim = -1
  ls.forEach((l, k) => { if (/^Total CART/i.test(l)) fim = k })
  if (ini < 0 || fim < ini) return texto
  return [cab, ...ls.slice(ini, fim + 1)].join('\n')
}

export async function textoDoPdf(arquivo: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise
  const paginas: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const conteudo = await (await doc.getPage(p)).getTextContent()
    const itens = conteudo.items
      .filter((i): i is typeof i & { str: string; transform: number[]; width: number } => 'str' in i)
      .map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width }))
    paginas.push(itensEmLinhas(itens).join('\n'))
  }
  const texto = paginas.join('\n')
  return ehFaturaInter(texto) ? recorteFaturaInter(texto) : texto
}
