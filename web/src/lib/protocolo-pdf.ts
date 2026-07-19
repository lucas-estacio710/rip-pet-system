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
const PROTOCOLOS_POR_PAGINA = 4

/** Converte uma URL (mesma origem) em data URI — o foreignObjectRendering do
 *  html2canvas não carrega <img src> normal dentro do SVG, precisa inline. */
async function urlToDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/** Inline todas as <img> do documento como data URI e espera carregarem.
 *  `cache` compartilhado entre páginas evita re-fetch da logo a cada chunk. */
async function inlineImagens(idoc: Document, cache: Map<string, string | null>): Promise<void> {
  const imgs = Array.from(idoc.images)
  await Promise.all(imgs.map(async img => {
    const src = img.getAttribute('src')
    if (!src || src.startsWith('data:')) return
    if (!cache.has(src)) cache.set(src, await urlToDataUri(src))
    const dataUri = cache.get(src)
    if (dataUri) img.src = dataUri
  }))
  // Espera o decode de todas (data URI é rápido, mas garante antes do capture)
  await Promise.all(imgs.map(img => img.decode().catch(() => {})))
}

/**
 * Gera PDF A4 retrato com 4 protocolos por página (grid 2x2).
 * Recebe array de ProtocoloData (`null` em posições brancas é permitido — usado pra
 * completar a última página). Retorna o Blob do PDF.
 *
 * ⚠️ Renderiza UMA página A4 por vez no iframe (chunk de 4 protocolos): com
 * foreignObjectRendering, capturar um elemento deslocado do topo do documento
 * (página 2 em diante) sai EM BRANCO — o clone é pintado sem a translação do
 * offset. Página única sempre no topo = captura sempre certa (e canvas do
 * tamanho exato de 1 A4, sem inflar o arquivo).
 */
export async function gerarProtocolosPDF(protocolos: ProtocoloData[]): Promise<Blob> {
  if (protocolos.length === 0) throw new Error('Nenhum protocolo para gerar')

  // Chunks de 4 → 1 página A4 por chunk (buildProtocolosHtml completa o último com brancos)
  const chunks: ProtocoloData[][] = []
  for (let i = 0; i < protocolos.length; i += PROTOCOLOS_POR_PAGINA) {
    chunks.push(protocolos.slice(i, i + PROTOCOLOS_POR_PAGINA))
  }

  // Iframe oculto único, reescrito a cada página
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.top = '-10000px'
  iframe.style.left = '-10000px'
  iframe.style.width = `${A4_W_MM}mm`
  iframe.style.height = `${A4_H_MM}mm`
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const imgCache = new Map<string, string | null>()

  try {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    for (let i = 0; i < chunks.length; i++) {
      const idoc = iframe.contentDocument || iframe.contentWindow?.document
      if (!idoc) throw new Error('Iframe sem contentDocument')

      idoc.open()
      idoc.write(buildProtocolosHtml(chunks[i]))
      idoc.close()

      // Aguarda render (CSS + fontes) e inline das imagens (logo) — o modo
      // foreignObjectRendering não busca <img src> de rede dentro do SVG
      await new Promise<void>(resolve => setTimeout(resolve, 200))
      await inlineImagens(idoc, imgCache)

      const page = idoc.querySelector<HTMLElement>('.protocolo-page')
      if (!page) throw new Error('Página de protocolo não renderizada')

      // foreignObjectRendering: quem pinta é o BROWSER (via SVG), não o rasterizador
      // próprio do html2canvas — que desenha os glifos ~4-5px abaixo do lugar (bug de
      // baseline do 1.4.1), causando texto "sentado" na base da célula e 2ª linha de
      // nomes longos cortada pelo overflow.
      const canvas = await html2canvas(page, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        foreignObjectRendering: true,
        windowWidth: page.scrollWidth,
        windowHeight: page.scrollHeight,
        onclone: (clonedDoc: Document) => {
          // O cloner do html2canvas grava ALTURA e LARGURA COMPUTADAS inline em cada
          // elemento. Dentro do SVG a métrica de texto muda sub-pixel → um texto pode
          // precisar de 1-2px a mais e quebrar linha onde o layout real não quebrava
          // ("Cidade: São | Paulo/SP"); com altura congelada, a linha extra ainda
          // ENCAVALA no bloco seguinte. Relaxa os blocos de texto (marcados .pr-fluid
          // no ProtocoloEntrega): height auto (cresce/empurra) + width auto nos divs
          // internos (flex re-acomoda e o texto pega os px que precisa, sem quebra
          // desnecessária).
          // ⚠️ Tem que ser INLINE por elemento — o foreignObject serializa só o
          // elemento da página; <style> injetado no <head> não entra no SVG.
          clonedDoc.querySelectorAll<HTMLElement>('.pr-fluid, .pr-fluid td').forEach(el => {
            el.style.height = 'auto'
          })
          clonedDoc.querySelectorAll<HTMLElement>('.pr-fluid div').forEach(el => {
            el.style.height = 'auto'
            el.style.width = 'auto'
          })
        },
      })

      // JPEG (fundo branco, texto a escala 2) — PNG inflava o PDF absurdamente
      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      if (i > 0) pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, 0, A4_W_MM, A4_H_MM)
    }

    return pdf.output('blob') as Blob
  } finally {
    // Limpa iframe sempre (mesmo em erro)
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
  }
}
