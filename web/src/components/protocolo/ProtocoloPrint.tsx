import ReactDOMServer from 'react-dom/server'
import React from 'react'
import ProtocoloEntrega from './ProtocoloEntrega'
import { ProtocoloData } from './protocolo-utils'

/**
 * Monta o HTML completo de uma leva de protocolos em chunks de 4 (grid 2x2 por página A4).
 */
export function buildProtocolosHtml(protocolos: ProtocoloData[]): string {
  const chunks: ProtocoloData[][] = []
  for (let i = 0; i < protocolos.length; i += 4) {
    chunks.push(protocolos.slice(i, i + 4))
  }
  const lastChunk = chunks[chunks.length - 1]
  while (lastChunk && lastChunk.length < 4) {
    lastChunk.push(null as unknown as ProtocoloData)
  }

  const pagesHtml = chunks.map((chunk) => {
    const cards = chunk.map((data, idx) => {
      const isBlank = data === null
      const html = ReactDOMServer.renderToStaticMarkup(
        isBlank
          ? React.createElement(ProtocoloEntrega, { blank: true, print: true })
          : React.createElement(ProtocoloEntrega, { data, print: true })
      )
      return `<div class="protocolo-cell" key="${idx}">${html}</div>`
    }).join('')

    return `<div class="protocolo-page">${cards}</div>`
  }).join('')

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Protocolos de Entrega</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page {
          size: A4;
          margin: 2mm;
        }
        body {
          font-family: Arial, Helvetica, sans-serif;
        }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .protocolo-page {
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr;
          gap: 16px;
          width: 100%;
          height: 100vh;
          padding: 3mm;
          page-break-after: always;
        }
        .protocolo-cell {
          overflow: hidden;
          padding: 6px;
        }
        td[style*="text-align: center"], th[style*="text-align: center"] {
          text-align: center !important;
        }
        td[style*="text-align: right"], th[style*="text-align: right"] {
          text-align: right !important;
        }
      </style>
    </head>
    <body>
      ${pagesHtml}
    </body>
    </html>
  `
}

/**
 * Imprime protocolos.
 * - Desktop: iframe invisível + iframe.contentWindow.print() (sem flash visual)
 * - Mobile: window.open() + window.print() (Chrome Android ignora print() do iframe e
 *   acaba imprimindo a página pai, então precisa de janela própria)
 */
export function printProtocolos(protocolos: ProtocoloData[]) {
  if (protocolos.length === 0) return

  const fullHtml = buildProtocolosHtml(protocolos)
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)

  if (isMobile) {
    // Mobile: nova janela/aba — única forma confiável de imprimir só o protocolo
    const win = window.open('', '_blank')
    if (!win) {
      alert('Permita popups deste site para imprimir os protocolos.')
      return
    }
    win.document.open()
    win.document.write(fullHtml)
    win.document.close()
    // Aguarda renderização e dispara print; alguns navegadores precisam de focus
    setTimeout(() => {
      win.focus()
      win.print()
      // Não fecha automaticamente — usuário pode fechar manualmente depois de imprimir/salvar
    }, 400)
    return
  }

  // Desktop: iframe invisível (comportamento original — sem flash de janela)
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.top = '-10000px'
  iframe.style.left = '-10000px'
  iframe.style.width = '210mm'
  iframe.style.height = '297mm'
  document.body.appendChild(iframe)

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
  if (!iframeDoc) {
    document.body.removeChild(iframe)
    return
  }

  iframeDoc.open()
  iframeDoc.write(fullHtml)
  iframeDoc.close()

  setTimeout(() => {
    iframe.contentWindow?.print()
    setTimeout(() => {
      document.body.removeChild(iframe)
    }, 1000)
  }, 300)
}
