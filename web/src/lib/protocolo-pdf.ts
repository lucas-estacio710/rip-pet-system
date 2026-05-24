// Gerador de PDF de Protocolos de Entrega — 4 protocolos por página A4 retrato.
// Reusa o HTML existente do printProtocolos (buildProtocolosHtml) — renderiza num iframe
// oculto, captura cada página com html2canvas e monta o PDF com jsPDF.
//
// Diferente do printProtocolos (que dispara window.print), este RETORNA o Blob —
// pra ser concatenado pelo orquestrador da impressão unificada.
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { buildProtocolosHtml } from '@/components/protocolo/ProtocoloPrint'
import { ProtocoloData } from '@/components/protocolo/protocolo-utils'

const A4_W_MM = 210
const A4_H_MM = 297

/**
 * Gera PDF A4 retrato com 4 protocolos por página (grid 2x2).
 * Recebe array de ProtocoloData (`null` em posições brancas é permitido — usado pra
 * completar a última página). Retorna o Blob do PDF.
 */
export async function gerarProtocolosPDF(protocolos: ProtocoloData[]): Promise<Blob> {
  if (protocolos.length === 0) throw new Error('Nenhum protocolo para gerar')

  // 1. Cria iframe oculto e injeta o HTML montado pelo ProtocoloPrint
  const html = buildProtocolosHtml(protocolos)
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.top = '-10000px'
  iframe.style.left = '-10000px'
  iframe.style.width = `${A4_W_MM}mm`
  iframe.style.height = `${A4_H_MM}mm`
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  try {
    const idoc = iframe.contentDocument || iframe.contentWindow?.document
    if (!idoc) throw new Error('Iframe sem contentDocument')

    idoc.open()
    idoc.write(html)
    idoc.close()

    // Aguarda render (CSS + fontes)
    await new Promise<void>(resolve => setTimeout(resolve, 350))

    // 2. Captura cada .protocolo-page como canvas → adiciona ao PDF
    const pages = Array.from(idoc.querySelectorAll<HTMLElement>('.protocolo-page'))
    if (pages.length === 0) throw new Error('Nenhuma página de protocolo renderizada')

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        windowWidth: pages[i].scrollWidth,
        windowHeight: pages[i].scrollHeight,
      })
      const imgData = canvas.toDataURL('image/png')
      if (i > 0) pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, 0, A4_W_MM, A4_H_MM)
    }

    return pdf.output('blob') as Blob
  } finally {
    // Limpa iframe sempre (mesmo em erro)
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
  }
}
