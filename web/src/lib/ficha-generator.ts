import html2canvas from 'html2canvas'

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

export function fichaFilename(codigo: string, petNome: string): string {
  const nomeLimpo = petNome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
  return `${codigo}_${nomeLimpo}.png`
}
