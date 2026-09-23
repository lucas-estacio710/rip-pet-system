// Baixar a ficha de remoção como PNG ou PDF, a partir do que já está na tela.
//
// POR QUE EXISTE (Lucas, 15/09/2026): *"se a pessoa quiser, ela clicando e aumentando, ela pode
// baixar o pdf ou png"*. A gerente da Matriz é analógica e vai imprimir — que imprima, mas a
// partir do documento do sistema, não de uma foto de papel tirada no celular.
//
// 🔴 **Os dois imports são DINÂMICOS de propósito.** `html2canvas` e `jspdf` juntos são ~500 KB
// de JS. Como import normal eles entrariam no bundle de quem só quer VER a ficha na conversa —
// e ver é o que 99% das aberturas faz. Assim, o download só paga o download.
// (`lib/ficha-generator.ts` importa html2canvas no topo; por isso não dá pra reusar ela aqui
// sem arrastar o peso de volta.)
//
// ⚠️ O elemento passado aqui tem que estar RENDERIZADO e em escala natural (sem
// `transform: scale`) — o html2canvas lê o layout real e ignora transform. Quem chama deve
// manter um nó oculto em tamanho 1:1, como `lib/impressao-unificada.ts` já faz.

/** Vira nome de arquivo: sem acento, sem espaço, sem caractere proibido. */
export function nomeDeArquivo(...pedacos: (string | null | undefined)[]): string {
  const bruto = pedacos.filter(Boolean).join('_')
  const limpo = bruto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return limpo || 'ficha'
}

function dispararDownload(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoga depois do clique: revogar na mesma volta do event loop cancela o download no Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * `escala: 3` deixa ~1260px de largura numa ficha de 420 — imprime nítido em A4.
 *
 * 🔴 **`foreignObjectRendering: true` é OBRIGATÓRIO aqui, não é otimização.** O rasterizador
 * próprio do html2canvas 1.4.1 desenha texto **~4–5px ABAIXO** da posição de layout (bug
 * conhecido do projeto — ver `docs/METODO_DAS_SETINHAS.md`). No modo default, o primeiro PDF
 * gerado desta ficha saiu com **o valor de cada campo riscado pela própria linha**: "canina",
 * "Shihtzu", "Preto", "13 anos", "6 kg", "Macho" e o nome da tutora todos cortados no meio pelo
 * `borderBottom` que deviam estar apoiando em cima (conferido nos pixels do arquivo, em
 * 15/09/2026). Os rótulos em preto saíam certos, o que disfarça o problema numa olhada rápida.
 * Com `foreignObjectRendering`, quem pinta é o browser (via SVG) e o resultado é fiel ao layout
 * — a mesma correção que o `protocolo-pdf.ts` já tinha adotado por este mesmo motivo.
 *
 * ⚠️ **NÃO estender isto ao `lib/ficha-generator.ts` nem ao `FichaRemocao.tsx`.** As posições
 * daquele layout foram calibradas **COM** o pintor bugado (método das setinhas); trocar o modo
 * lá desloca tudo 4–5px. Aqui é seguro porque o `FichaRemocaoDoc` é layout normal, sem
 * coordenada calibrada.
 *
 * Das 3 pegadinhas documentadas do foreignObject, duas **não se aplicam** ao `FichaRemocaoDoc`:
 * ele não tem imagem nenhuma (nada pra virar data URI) e é 100% estilo inline (nada de
 * `<style>` que o SVG descartaria). A terceira **se aplica** e está tratada:
 *  - o cloner grava altura/largura COMPUTADAS inline, e a métrica de texto no SVG muda
 *    sub-pixel → o texto quebra uma linha a mais e encavala no bloco seguinte. Antídoto: o
 *    `onclone` devolve `height`/`width` pra `auto` em todo elemento do clone.
 *  - e o elemento tem que estar no TOPO do documento (elemento deslocado sai em branco) —
 *    responsabilidade de quem chama; ver o nó de captura no `LightboxFicha`.
 */
async function paraCanvas(el: HTMLElement, escala = 3): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import('html2canvas')
  return html2canvas(el, {
    scale: escala,
    backgroundColor: '#ffffff',
    useCORS: true,
    foreignObjectRendering: true,
    onclone: (doc) => {
      // Desfaz a ALTURA computada que o cloner injeta: no SVG a métrica de texto muda
      // sub-pixel, o texto quebra uma linha a mais e, preso numa altura fixa, encavala no
      // bloco de baixo.
      //
      // 🔴 **Só `height`. NUNCA `width`.** O `FichaRemocaoDoc` não declara `height` em
      // elemento nenhum (usa `minHeight`), então toda altura explícita no clone é injetada e
      // zerar é um desfazer puro. Já a LARGURA é de propósito — a folha tem `width: DOC_W` e
      // cada slot de dia/mês/ano tem largura própria; `width: auto` colapsaria o desenho
      // inteiro. (Errei nisso na primeira versão desta função.)
      doc.querySelectorAll<HTMLElement>('*').forEach(n => { n.style.height = 'auto' })
    },
  })
}

export async function baixarFichaPng(el: HTMLElement, nomeBase: string): Promise<void> {
  const canvas = await paraCanvas(el)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Falha ao gerar o PNG da ficha'))), 'image/png')
  })
  dispararDownload(blob, `${nomeBase}.png`)
}

export async function baixarFichaPdf(el: HTMLElement, nomeBase: string): Promise<void> {
  const canvas = await paraCanvas(el)
  const { default: jsPDF } = await import('jspdf')

  // 🔴 `compress: true` + compressão da imagem NÃO SÃO OPCIONAIS. Sem elas o jsPDF embute os
  // **pixels crus**: a primeira ficha gerada em 15/09/2026 saiu com `/Width 1260 /Height 1680
  // /DeviceRGB`, `/Length 6350400` e **nenhum `/Filter`** — 1260×1680×3 na lata, 6,06 MB numa
  // folha quase toda branca. Sete fichas de uma viagem = 42 MB.
  //
  // Medido nos MESMOS pixels, extraídos daquele PDF:
  //   cru ................... 6,06 MB
  //   JPEG q95 ................ 280 KB
  //   PNG otimizado ........... 145 KB
  //   PNG + flate ............. 100 KB  ← escolhido
  // ⚠️ Cheguei aqui trocando pra JPEG por achar que "PNG não comprime por causa do
  // antialiasing do texto". A medição desmentiu: em folha branca o flate é o melhor dos dois,
  // **e é lossless** — texto fino e as linhas de preenchimento saem sem artefato. Não trocar
  // por JPEG "pra economizar" sem medir de novo.
  //
  // ⚠️ **Isto parece contradizer o aprendizado do protocolo** ("usar JPEG no jsPDF, PNG inflou
  // o PDF pra 46 MB" — `docs/METODO_DAS_SETINHAS.md`). Não contradiz: lá o PNG estava indo
  // **sem compressão** (era exatamente o caso de 6 MB que esta ficha também teve), e o JPEG
  // resolveu por tabela. Ligada a compressão, o PNG passa o JPEG **e** é lossless. A lição
  // geral é a mesma nos dois: **nunca embutir imagem no jsPDF sem compressão.** A diferença é
  // só qual formato ganha depois de ligar — e aqui foi medido, não deduzido.
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  const PAG_W = 210, PAG_H = 297, MARGEM = 12
  const maxW = PAG_W - MARGEM * 2
  const maxH = PAG_H - MARGEM * 2

  // Cabe pela largura; se estourar a altura, manda a altura. Sem distorcer a proporção.
  const razao = canvas.width / canvas.height
  let w = maxW
  let h = w / razao
  if (h > maxH) { h = maxH; w = h * razao }

  // `escala: 3` sobre 420px de projeto dá 1260px de largura pra ~186mm impressos ≈ 172 DPI:
  // nítido na impressora dela sem inflar o arquivo. O `'SLOW'` é a compressão da IMAGEM (o
  // `compress` do construtor cuida dos outros streams) — numa página só, custa milissegundos.
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (PAG_W - w) / 2, MARGEM, w, h, undefined, 'SLOW')
  pdf.save(`${nomeBase}.pdf`)
}
