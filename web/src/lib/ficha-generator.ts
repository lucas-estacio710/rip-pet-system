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

/**
 * Gera PDF A4 LANDSCAPE com 2 c\u00f3pias da ficha lado a lado e dispara o download.
 * Template original = 398\u00d7512px @ 96 DPI \u2248 105\u00d7135mm.
 * A4 landscape = 297\u00d7210mm comporta 2 c\u00f3pias lado a lado com gap central.
 */
export async function gerarFichaPDFA4Duplicada(element: HTMLElement, filename: string): Promise<void> {
  // 1. Renderizar componente como canvas em alta resolu\u00e7\u00e3o
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
  })
  const imgData = canvas.toDataURL('image/png')

  // 2. PDF A4 landscape (297\u00d7210mm) \u2014 sem margens: 2 fichas ocupam toda a p\u00e1gina lado a lado
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const PAGE_W = 297
  const PAGE_H = 210

  // 3. Cada ficha ocupa metade da p\u00e1gina. Mant\u00e9m aspect ratio do template (398:512 \u2248 0.777).
  // Altura proporcional, centralizada verticalmente (margem vertical m\u00ednima inevit\u00e1vel pra n\u00e3o distorcer).
  const ASPECT = 398 / 512
  const fichaWMm = PAGE_W / 2                 // 148.5 mm
  const fichaHMm = fichaWMm / ASPECT          // \u2248 191 mm
  const y = (PAGE_H - fichaHMm) / 2           // \u2248 9.5 mm (sobra do aspect ratio)

  pdf.addImage(imgData, 'PNG', 0, y, fichaWMm, fichaHMm)              // esquerda, coladas
  pdf.addImage(imgData, 'PNG', fichaWMm, y, fichaWMm, fichaHMm)       // direita, sem gap

  pdf.save(filename)
}
