import { PDFDocument, rgb, PDFFont, PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const ESPECIE_LABEL: Record<string, string> = { canina: 'Canina', felina: 'Felina', exotica: 'Exótica' }

export type DadosCertificado = {
  codigo: string
  petNome: string
  petEspecie: string | null
  petRaca: string | null
  petGenero: string | null
  nomes: (string | null)[] // até 7 slots
  dataCremacao: string // YYYY-MM-DD ou ISO
}

// Conectivos que ficam em minúscula no meio de nomes próprios (não na primeira posição)
const CONECTIVOS_NOME = new Set([
  'de', 'do', 'da', 'dos', 'das', 'e',
  'del', 'della', 'di', 'du', 'van', 'von', 'y', 'la', 'le', 'al',
])

// Title Case para nomes: capitaliza primeira letra de cada palavra,
// mas mantém conectivos (de/do/da/dos/das/e/…) em minúscula quando não estão no início.
// Também respeita hífen e apóstrofo (ex.: "Ana-Clara", "D'Arc").
export function tituloNome(s: string | null | undefined): string {
  if (!s) return ''
  const trim = s.trim()
  if (!trim) return ''
  return trim.toLowerCase().split(/\s+/).map((palavra, i) => {
    if (i > 0 && CONECTIVOS_NOME.has(palavra)) return palavra
    return palavra.replace(/(^|[-'])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
  }).join(' ')
}

function formatarTutorBlock(nomes: string[]): string {
  if (nomes.length === 0) return 'Tutor(a) Senhor(a)'
  const prefixo = nomes.length === 1 ? 'Tutor(a) Senhor(a)' : 'Tutores(as) Senhores(as)'
  const normalizados = nomes.map(tituloNome)
  let lista: string
  if (normalizados.length === 1) lista = normalizados[0]
  else if (normalizados.length === 2) lista = `${normalizados[0]} e ${normalizados[1]}`
  else lista = `${normalizados.slice(0, -1).join(', ')} e ${normalizados[normalizados.length - 1]}`
  return `${prefixo} ${lista}`
}

function formatarCremado(petGenero: string | null): string {
  if (petGenero === 'macho') return 'cremado'
  if (petGenero === 'femea') return 'cremada'
  return 'cremado(a)'
}

function parseDataLocal(iso: string): { dia: string; mes: string; ano: string; ddmmaaaa: string } {
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = MESES_PT[d.getMonth()]
  const ano = String(d.getFullYear())
  const ddmmaaaa = `${dia}/${String(d.getMonth() + 1).padStart(2, '0')}/${ano}`
  return { dia, mes, ano, ddmmaaaa }
}

// Quebra texto em linhas com palavras (preservadas) para justificação posterior
function wrapWords(text: string, font: PDFFont, size: number, maxWidthPt: number): string[][] {
  const palavras = text.split(/\s+/).filter(Boolean)
  const linhas: string[][] = []
  let linha: string[] = []
  const spaceW = font.widthOfTextAtSize(' ', size)
  let larguraAtual = 0
  for (const p of palavras) {
    const wP = font.widthOfTextAtSize(p, size)
    const wComEspaco = linha.length === 0 ? wP : larguraAtual + spaceW + wP
    if (wComEspaco > maxWidthPt && linha.length > 0) {
      linhas.push(linha)
      linha = [p]
      larguraAtual = wP
    } else {
      linha.push(p)
      larguraAtual = wComEspaco
    }
  }
  if (linha.length > 0) linhas.push(linha)
  return linhas
}

// Desenha uma linha justificada: distribui espaço extra entre palavras
function desenharLinhaJustificada(
  page: PDFPage,
  palavras: string[],
  font: PDFFont,
  size: number,
  x0: number,
  y: number,
  larguraTotal: number,
  justificar: boolean
) {
  const spaceW = font.widthOfTextAtSize(' ', size)
  const widths = palavras.map(p => font.widthOfTextAtSize(p, size))
  const somaPalavras = widths.reduce((a, b) => a + b, 0)
  const lacunas = palavras.length - 1
  let espacoEntre = spaceW
  if (justificar && lacunas > 0) {
    espacoEntre = (larguraTotal - somaPalavras) / lacunas
  }
  let x = x0
  for (let i = 0; i < palavras.length; i++) {
    page.drawText(palavras[i], { x, y, size, font, color: rgb(0, 0, 0) })
    x += widths[i] + espacoEntre
  }
}

export async function gerarCertificadoPDF(dados: DadosCertificado): Promise<Blob> {
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)

  // Century Gothic (copiada do Windows pra /public/fonts)
  const [regularBytes, boldBytes] = await Promise.all([
    fetch('/fonts/CenturyGothic-Regular.ttf').then(r => r.arrayBuffer()),
    fetch('/fonts/CenturyGothic-Bold.ttf').then(r => r.arrayBuffer()),
  ])
  const font = await pdfDoc.embedFont(regularBytes, { subset: true })
  // Bold disponível caso queira reutilizar em algum trecho futuro
  await pdfDoc.embedFont(boldBytes, { subset: true })

  // A4 retrato (1mm = 2.835pt)
  const mmToPt = 2.8346
  const A4_W_MM = 210
  const A4_H_MM = 297
  const page = pdfDoc.addPage([A4_W_MM * mmToPt, A4_H_MM * mmToPt])
  const { width, height } = page.getSize()

  // Margens (mm) — topo grande porque a folha física tem cabeçalho impresso
  const ML = 25
  const MR = 25
  const MT = 80
  const contentW = (A4_W_MM - ML - MR) * mmToPt
  const x0 = ML * mmToPt

  // Tipografia
  const size = 11
  const lineHeight = size * 1.6
  const espacoEntreParagrafos = 26

  let yPt = height - MT * mmToPt

  function desenharParagrafo(texto: string) {
    const linhas = wrapWords(texto, font, size, contentW)
    for (let i = 0; i < linhas.length; i++) {
      const palavras = linhas[i]
      const ehUltimaLinha = i === linhas.length - 1
      // Justifica todas exceto a última linha do parágrafo
      desenharLinhaJustificada(page, palavras, font, size, x0, yPt - size, contentW, !ehUltimaLinha)
      yPt -= lineHeight
    }
    yPt -= espacoEntreParagrafos
  }

  // Montagem do texto
  const nomes = dados.nomes.filter(n => n && n.trim()).map(n => n!.trim())
  const especie = ESPECIE_LABEL[dados.petEspecie || ''] || (dados.petEspecie || '—')
  const raca = dados.petRaca ? tituloNome(dados.petRaca) : '—'
  const tutorBlock = formatarTutorBlock(nomes)
  const cremado = formatarCremado(dados.petGenero)
  const { dia, mes, ano, ddmmaaaa } = parseDataLocal(dados.dataCremacao)

  const petNomeFmt = tituloNome(dados.petNome)
  const p1 = `Certifico que o pet ${petNomeFmt}, da Espécie ${especie}, da Raça ${raca}, ${tutorBlock}, foi devidamente ${cremado} em nosso estabelecimento no dia ${ddmmaaaa}.`
  const p2 = 'A R.I.P. Pet é o cuidado que seu amigo precisa quando seu ciclo termina. Nosso trabalho é trazer conforto para os corações que recentemente perderam um membro importante da família. Oferecemos nossos serviços porque amamos os animais e acreditamos que eles fariam o mesmo se tivessem a chance.'
  const p3 = `Pindamonhangaba, ${dia} de ${mes} de ${ano}.`

  // 2 linhas em branco antes do texto começar (respiro a partir do cabeçalho impresso)
  yPt -= 2 * lineHeight

  desenharParagrafo(p1)
  desenharParagrafo(p2)
  desenharParagrafo(p3)

  const bytes = await pdfDoc.save()
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
}

export function certificadoFilename(codigo: string, petNome: string): string {
  const limpo = petNome.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')
  return `Certificado_${codigo}_${limpo}.pdf`
}
