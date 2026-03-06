import ReactDOMServer from 'react-dom/server'
import React from 'react'
import ProtocoloEntrega from './ProtocoloEntrega'
import { ProtocoloData } from './protocolo-utils'

/**
 * Imprime protocolos via iframe invisível.
 * Agrupa em chunks de 4 e renderiza em grid 2x2 por página com altura fixa.
 */
export function printProtocolos(protocolos: ProtocoloData[]) {
  if (protocolos.length === 0) return

  // Agrupar em chunks de 4
  const chunks: ProtocoloData[][] = []
  for (let i = 0; i < protocolos.length; i += 4) {
    chunks.push(protocolos.slice(i, i + 4))
  }

  // Renderizar cada chunk como uma página 2x2
  const pagesHtml = chunks.map((chunk) => {
    const cards = chunk.map((data, idx) => {
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ProtocoloEntrega, { data })
      )
      return `<div class="protocolo-cell" key="${idx}">${html}</div>`
    }).join('')

    return `
      <div class="protocolo-page">
        ${cards}
      </div>
    `
  }).join('')

  const fullHtml = `
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

  // Criar iframe invisível
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

  // Aguardar renderização e imprimir
  setTimeout(() => {
    iframe.contentWindow?.print()
    // Remover iframe após impressão
    setTimeout(() => {
      document.body.removeChild(iframe)
    }, 1000)
  }, 300)
}
