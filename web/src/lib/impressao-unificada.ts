// Orquestrador da impressão unificada (/impressao-documentos).
// Recebe blocos PRONTOS de cada tipo (caller monta os dados) e gera um PDF único:
//  - Contratos: 1 por página A4 retrato     (via gerarContratoPDF — já existente)
//  - Fichas:    2 pets/página A4 landscape  (via gerarFichasA4Blob — refatorado)
//  - Protocolos: 4/página A4 retrato        (via gerarProtocolosPDF — novo)
// Tudo concatenado com pdf-lib.
import React, { createRef, RefObject } from 'react'
import { createRoot } from 'react-dom/client'
import { PDFDocument } from 'pdf-lib'

import { gerarContratoPDF, DadosContrato } from './contrato-pdf'
import { gerarFichasA4Blob } from './ficha-generator'
import { gerarProtocolosPDF } from './protocolo-pdf'
import FichaRemocao, { FichaContratoData } from '@/components/fichas/FichaRemocao'
import { ProtocoloData } from '@/components/protocolo/protocolo-utils'

export type ImpressaoBlocos = {
  contratos: { dados: DadosContrato; nomeUnidade: string }[]
  fichas: FichaContratoData[]
  protocolos: ProtocoloData[]
}

export type ImpressaoProgress = {
  fase: 'contratos' | 'fichas' | 'protocolos' | 'concatenando'
  atual: number
  total: number
}

export async function gerarImpressaoUnificada(
  blocos: ImpressaoBlocos,
  onProgress?: (p: ImpressaoProgress) => void,
): Promise<Blob> {
  const blobs: Blob[] = []

  // 1. CONTRATOS — usa gerador existente, retorna Blob por contrato
  for (let i = 0; i < blocos.contratos.length; i++) {
    onProgress?.({ fase: 'contratos', atual: i + 1, total: blocos.contratos.length })
    const c = blocos.contratos[i]
    blobs.push(await gerarContratoPDF(c.dados, c.nomeUnidade))
  }

  // 2. FICHAS — renderiza componentes em DOM oculto, captura, gera PDF (2/pág landscape)
  if (blocos.fichas.length > 0) {
    onProgress?.({ fase: 'fichas', atual: 0, total: blocos.fichas.length })
    const { elements, cleanup } = await renderFichasOcultas(blocos.fichas)
    try {
      blobs.push(await gerarFichasA4Blob(elements))
      onProgress?.({ fase: 'fichas', atual: blocos.fichas.length, total: blocos.fichas.length })
    } finally {
      cleanup()
    }
  }

  // 3. PROTOCOLOS — 4/pág retrato, internamente já usa iframe oculto
  if (blocos.protocolos.length > 0) {
    onProgress?.({ fase: 'protocolos', atual: 0, total: blocos.protocolos.length })
    blobs.push(await gerarProtocolosPDF(blocos.protocolos))
    onProgress?.({ fase: 'protocolos', atual: blocos.protocolos.length, total: blocos.protocolos.length })
  }

  if (blobs.length === 0) throw new Error('Nada para imprimir')

  // 4. CONCATENA com pdf-lib
  onProgress?.({ fase: 'concatenando', atual: 0, total: blobs.length })
  const finalDoc = await PDFDocument.create()
  for (let i = 0; i < blobs.length; i++) {
    const src = await PDFDocument.load(await blobs[i].arrayBuffer())
    const pages = await finalDoc.copyPages(src, src.getPageIndices())
    pages.forEach(p => finalDoc.addPage(p))
    onProgress?.({ fase: 'concatenando', atual: i + 1, total: blobs.length })
  }
  const bytes = await finalDoc.save()
  // pdf-lib retorna Uint8Array<ArrayBufferLike>; cast pra BlobPart pra satisfazer TS estrito
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}

// ============================================
// Helper: renderiza N FichaRemocao em DOM oculto e devolve os elements
// ============================================
async function renderFichasOcultas(fichas: FichaContratoData[]): Promise<{ elements: HTMLElement[]; cleanup: () => void }> {
  // Container oculto (fora da viewport mas RENDERIZADO — html2canvas precisa do layout real)
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '-10000px'
  container.style.left = '0'
  container.style.width = 'auto'
  container.style.zIndex = '-1'
  container.style.pointerEvents = 'none'
  document.body.appendChild(container)

  const refs: RefObject<HTMLDivElement | null>[] = fichas.map(() => createRef<HTMLDivElement>())

  const root = createRoot(container)
  root.render(
    React.createElement(
      'div',
      null,
      fichas.map((f, i) => React.createElement(FichaRemocao, {
        key: (f.id || '') + '_' + i,
        ref: refs[i],
        contrato: f,
      }))
    )
  )

  // Aguarda render + carregamento da imagem do template (essencial pra html2canvas)
  // 500ms é seguro pra template estático local; aumentar se necessário.
  await new Promise<void>(resolve => setTimeout(resolve, 500))

  const elements = refs.map(r => r.current).filter((el): el is HTMLDivElement => el != null)

  if (elements.length !== fichas.length) {
    // Algum ref ficou null — não deve acontecer com createRoot síncrono + setTimeout,
    // mas se acontecer, falha clara em vez de gerar PDF parcial silenciosamente.
    root.unmount()
    container.parentNode?.removeChild(container)
    throw new Error(`Renderização parcial: ${elements.length}/${fichas.length} fichas`)
  }

  return {
    elements,
    cleanup: () => {
      try { root.unmount() } catch { /* ignore */ }
      if (container.parentNode) container.parentNode.removeChild(container)
    },
  }
}
