// Baixar a ficha de remoção como PNG ou PDF, a partir do que já está na tela.
//
// POR QUE EXISTE (Lucas, 15/09/2026): *"se a pessoa quiser, ela clicando e aumentando, ela pode
// baixar o pdf ou png"*. A gerente da Matriz é analógica e vai imprimir — que imprima, mas a
// partir do documento do sistema, não de uma foto de papel tirada no celular.
//
// 🔴 **O import do `jspdf` é DINÂMICO de propósito** (~350 KB de JS): como import normal entraria
// no bundle de quem só quer VER a ficha na conversa — e ver é o que 99% das aberturas faz.
// Desde 10/10/2026 o PNG não usa biblioteca nenhuma (ver `paraCanvas`).
//
// ⚠️ O elemento passado aqui tem que estar RENDERIZADO e em escala natural (sem
// `transform: scale`) — a largura e a altura saem do layout real. Quem chama mantém um nó 1:1
// (pode estar dentro de um ancestral `visibility: hidden`).

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
 * Baixa o código do jsPDF ANTES do clique — chamar quando a ficha ampliada abre. Sem isso, o
 * primeiro toque em "PDF" no celular espera o JS pela rede sem nenhum retorno visual. O
 * `import()` é cacheado pelo bundler: chamar de novo não baixa nada.
 */
export function preCarregarDownload(): void {
  void import('jspdf').catch(() => {})
}

/**
 * Pinta o elemento num canvas SEM html2canvas: o próprio navegador desenha o HTML dentro de um
 * SVG (`<foreignObject>`) e o SVG vira imagem. `escala: 3` → ~1330px de largura, nítido em A4.
 *
 * 🔴 **POR QUE NÃO É MAIS HTML2CANVAS (10/10/2026).** Mesmo com as correções abaixo (que ficam
 * como histórico), o arquivo baixado no **Chrome do Android do Lucas** saía cortado por uma
 * linha vertical no meio do "o" de "autenticação" e com o dobro de margem em cima — e a tela,
 * perfeita. O emulador do Chromium NÃO reproduzia. O html2canvas faz três coisas que o aparelho
 * real interpreta diferente do emulador: clona a página num iframe da largura da TELA, copia o
 * estilo COMPUTADO de cada nó (no Android, com o "aumento automático de texto" do Chrome já
 * aplicado em bloco mais largo que a tela — o nó de captura tem 444px) e desloca o
 * `<foreignObject>` em `x = y = escala`. Aqui não há nada disso: o SVG leva **só os estilos
 * escritos no componente** (o `FichaRemocaoDoc` é 100% inline, e a marca é `<svg>` inline), em
 * `x = y = 0`, e a escala é uma só, pelo `viewBox`. É o mesmo princípio do html-to-image.
 *
 * Funciona porque o `FichaRemocaoDoc` cumpre as condições: sem `<img>` (imagem externa não
 * carrega dentro de SVG-imagem), sem classe CSS (a folha de estilo da página não entra) e sem
 * fonte web (só Arial/monoespaçada do sistema). Ao mexer no componente, manter as três.
 *
 * ⚠️ O nó pode estar `visibility: hidden` num ANCESTRAL (é assim no `LightboxFicha`): só o
 * elemento é serializado, então o ancestral oculto não vai junto. `hidden` dentro dele (o
 * rótulo "Tutor(es):" dos tutores 2+) é preservado.
 */
async function paraCanvas(el: HTMLElement, escala = 3): Promise<HTMLCanvasElement> {
  const w = Math.ceil(el.offsetWidth)
  const h = Math.ceil(el.offsetHeight)
  const xhtml = new XMLSerializer().serializeToString(el)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w * escala}" height="${h * escala}" viewBox="0 0 ${w} ${h}">` +
    `<foreignObject x="0" y="0" width="${w}" height="${h}">${xhtml}</foreignObject></svg>`

  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Falha ao montar a imagem da ficha'))
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
  await img.decode?.().catch(() => {})

  const canvas = document.createElement('canvas')
  canvas.width = w * escala
  canvas.height = h * escala
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

/**
 * HISTÓRICO — a versão com html2canvas (até 10/10/2026). Mantida em comentário porque cada
 * armadilha abaixo custou um ciclo com o Lucas e vale pra qualquer outra tela que use html2canvas.
 *
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
 * ele não tem imagem nenhuma (nada pra virar data URI — a marca é `<svg>` inline, que o
 * foreignObject pinta nativo) e é 100% estilo inline (nada de
 * `<style>` que o SVG descartaria). A terceira **se aplica** e está tratada:
 *  - o cloner grava altura/largura COMPUTADAS inline, e a métrica de texto no SVG muda
 *    sub-pixel → o texto quebra uma linha a mais e encavala no bloco seguinte. Antídoto: o
 *    `onclone` devolve `height`/`width` pra `auto` em todo elemento do clone.
 *  - e o elemento tem que estar no TOPO do documento (elemento deslocado sai em branco) —
 *    responsabilidade de quem chama; ver o nó de captura no `LightboxFicha`.
 *
 * 🔴 **`scrollX: 0, scrollY: 0` são obrigatórios** (10/10/2026 — PDF e PNG saíam EM BRANCO no
 * celular). O html2canvas soma o scroll da janela à posição do elemento
 * (`Bounds.fromClientRect` + `windowBounds`), e no modo foreignObject desenha a imagem em
 * `-y × escala`. O nó de captura é `position: fixed` no topo, mas com a conversa rolada
 * `pageYOffset` vale centenas de px: a ficha era desenhada FORA do canvas e sobrava só o fundo
 * branco. No desktop passava porque a página quase nunca estava rolada na hora do clique.
 *
 * ⚠️ O nó de captura fica com `visibility: hidden` na página (senão aparece por cima do
 * lightbox) e o `onclone` o torna visível **só no clone** — `copyStyles` grava o `hidden`
 * computado em cada descendente, por isso a volta é no elemento E em todos os filhos.
 *
 * 🔴 **`ignoreElements` é o que separa ~0,1 s de ~20 s no celular** (10/10/2026). Sem ele o
 * html2canvas CLONA A PÁGINA INTEIRA num iframe e, com `copyStyles`, chama
 * `getComputedStyle` em cada elemento — a conversa aberta tem dezenas de fichas em miniatura,
 * milhares de nós. Medido com 40 fichas na página (1.892 elementos): **2.020 ms → 127 ms** no
 * desktop, mesmo arquivo pixel a pixel. Celular é 5–10× mais lento: eram os "20 segundos pra um
 * PNG de 200 KB". O filtro mantém só os ancestrais do alvo (o caminho até ele) e o próprio alvo.
 *
 * Mais duas, do `onclone` daquela versão: o nó de captura `visibility: hidden` precisava voltar
 * a `visible` em CADA descendente do clone (o `copyStyles` grava o hidden computado em todos),
 * preservando só o que era hidden inline no original; e a ALTURA computada injetada pelo cloner
 * tinha de voltar a `auto` (só a altura, nunca a largura — a folha e os slots têm largura fixa).
 */

/**
 * O canvas saiu legível e com a ficha dentro? Duas falhas possíveis do caminho SVG:
 *  - **canvas "contaminado"** (tainted): navegador que trata SVG com `<foreignObject>` como
 *    origem insegura faz `getImageData`/`toBlob` lançar SecurityError. É o risco clássico do
 *    WebKit (todo navegador do iPhone) — não testado aqui por falta do WebKit na máquina;
 *  - **imagem vazia**: o SVG carregou mas o navegador não pintou o HTML de dentro.
 * Confere a borda esquerda da folha (preta, logo depois da margem branca de 12px).
 */
function canvasValido(canvas: HTMLCanvasElement, escala: number): boolean {
  try {
    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    const x = Math.round(13 * escala)
    const col = ctx.getImageData(x - escala, Math.round(canvas.height * 0.3), escala * 2, Math.round(canvas.height * 0.4)).data
    for (let i = 0; i < col.length; i += 4) if (col[i] < 100 && col[i + 3] > 200) return true
    return false
  } catch {
    return false
  }
}

/**
 * PLANO B: o desenhista INTERNO do html2canvas (`foreignObjectRendering: false`), que não usa
 * SVG e por isso não contamina o canvas. ⚠️ Cair no html2canvas em modo foreignObject não
 * adiantaria — é o mesmo mecanismo do caminho principal. Custo conhecido do plano B: o texto
 * sai ~4–5px abaixo da linha (bug do html2canvas 1.4.1, ver histórico acima). Ficha legível
 * com o texto um pouco baixo é melhor que download quebrado.
 */
async function paraCanvasReserva(el: HTMLElement, escala: number): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import('html2canvas')
  return html2canvas(el, {
    scale: escala,
    backgroundColor: '#ffffff',
    scrollX: 0,
    scrollY: 0,
    ignoreElements: n => !(n.contains(el) || el.contains(n)),
    onclone: (_doc, clonado) => {
      // O nó vive sob um ancestral `visibility: hidden`; o desenhista interno pula invisíveis.
      // Volta a visível, menos o que já era hidden de propósito (rótulo "Tutor(es):" 2+).
      const origs = [el, ...el.querySelectorAll<HTMLElement>('*')]
      const clones = [clonado, ...clonado.querySelectorAll<HTMLElement>('*')]
      clones.forEach((n, i) => {
        n.style.visibility = origs[i]?.style.visibility === 'hidden' ? 'hidden' : 'visible'
      })
    },
  })
}

async function canvasDaFicha(el: HTMLElement, escala = 3): Promise<HTMLCanvasElement> {
  try {
    const canvas = await paraCanvas(el, escala)
    if (canvasValido(canvas, escala)) return canvas
    console.warn('[ficha-download] caminho SVG saiu inválido; usando o plano B (html2canvas)')
  } catch (e) {
    console.warn('[ficha-download] caminho SVG falhou; usando o plano B (html2canvas)', e)
  }
  return paraCanvasReserva(el, escala)
}

export async function baixarFichaPng(el: HTMLElement, nomeBase: string): Promise<void> {
  const canvas = await canvasDaFicha(el)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Falha ao gerar o PNG da ficha'))), 'image/png')
  })
  dispararDownload(blob, `${nomeBase}.png`)
}

export async function baixarFichaPdf(el: HTMLElement, nomeBase: string): Promise<void> {
  const canvas = await canvasDaFicha(el)
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
