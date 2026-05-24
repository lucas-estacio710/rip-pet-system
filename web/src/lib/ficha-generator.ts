import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

export type FichaGenerationResult = {
  codigo: string
  petNome: string
  filename: string
  blob: Blob
  url?: string // URL do Storage apos upload
}

export type FichaProgress = {
  fase: 'capturando' | 'enviando' | 'concluido' | 'erro'
  atual: number
  total: number
  mensagem: string
}

export async function captureElementAsBlob(element: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
  })

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Falha ao converter canvas para blob'))
      },
      'image/png'
    )
  })
}

function normalizarNomeArquivo(petNome: string): string {
  return petNome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
}

export function fichaFilename(codigo: string, petNome: string): string {
  return `${codigo}_${normalizarNomeArquivo(petNome)}.png`
}

export function fichaFilenamePDF(codigo: string, petNome: string): string {
  return `${codigo}_${normalizarNomeArquivo(petNome)}.pdf`
}

// Dimens\u00f5es A4 landscape (mm) + aspect do template da ficha (398\u00d7512 \u2248 105\u00d7135mm)
const A4L_PAGE_W = 297
const A4L_PAGE_H = 210
const FICHA_ASPECT = 398 / 512
const FICHA_W_MM = A4L_PAGE_W / 2          // 148.5 mm
const FICHA_H_MM = FICHA_W_MM / FICHA_ASPECT // \u2248 191 mm
const FICHA_Y_MM = (A4L_PAGE_H - FICHA_H_MM) / 2 // \u2248 9.5 mm (centraliza vertical)

/**
 * Gera PDF A4 LANDSCAPE com **N fichas DIFERENTES**, 2 por p\u00e1gina lado a lado.
 * Usado tanto para o caso de c\u00f3pia de assinatura (mesma ficha duplicada \u2014 ver `gerarFichaPDFA4Duplicada`)
 * quanto para impress\u00e3o em lote (v\u00e1rios pets diferentes \u2014 usado em /impressao-documentos).
 * Retorna o Blob \u2014 n\u00e3o dispara download.
 */
export async function gerarFichasA4Blob(elements: HTMLElement[]): Promise<Blob> {
  if (elements.length === 0) throw new Error('Nenhuma ficha para gerar')

  // Captura todas em paralelo (alta resolu\u00e7\u00e3o)
  const imgs = await Promise.all(
    elements.map(el =>
      html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
        .then(c => c.toDataURL('image/png'))
    )
  )

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  for (let i = 0; i < imgs.length; i += 2) {
    if (i > 0) pdf.addPage()
    // Ficha 1 (esquerda)
    pdf.addImage(imgs[i], 'PNG', 0, FICHA_Y_MM, FICHA_W_MM, FICHA_H_MM)
    // Ficha 2 (direita) \u2014 pode n\u00e3o existir se \u00edmpar
    if (imgs[i + 1]) {
      pdf.addImage(imgs[i + 1], 'PNG', FICHA_W_MM, FICHA_Y_MM, FICHA_W_MM, FICHA_H_MM)
    }
  }

  return pdf.output('blob') as Blob
}

/**
 * Gera PDF A4 LANDSCAPE com 2 c\u00f3pias da MESMA ficha lado a lado e dispara o download.
 * Caso cl\u00e1ssico: c\u00f3pia de assinatura \u2014 operador assina a c\u00f3pia e d\u00e1 pro tutor.
 * Template original = 398\u00d7512px @ 96 DPI \u2248 105\u00d7135mm.
 * A4 landscape = 297\u00d7210mm comporta 2 c\u00f3pias lado a lado com gap central.
 */
export async function gerarFichaPDFA4Duplicada(element: HTMLElement, filename: string): Promise<void> {
  const blob = await gerarFichasA4Blob([element, element])
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
