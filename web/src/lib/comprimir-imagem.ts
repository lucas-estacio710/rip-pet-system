// ============================================================================
// Compressão de foto no CELULAR, antes do upload (migration 147).
//
// Por que isto existe: a foto-prova é guardada PARA SEMPRE e o teto medido é ~2.200 tarefas/mês
// com as 8 unidades. Foto crua de celular (~3 MB) daria 79 GB/ano; a 150 KB, 4 GB/ano. Não é
// otimização — é a diferença entre caber no plano Pro por uma década e pagar excedente todo mês.
//
// O bucket `tarefas` recusa > 1 MB no SERVIDOR (file_size_limit). Este código existe pra que o
// arquivo chegue bem abaixo disso; se não conseguir, ele FALHA AQUI com mensagem legível, em vez
// de deixar o Storage recusar com erro genérico depois de gastar a franquia de upload do usuário.
// ============================================================================

export type FotoComprimida = {
  blob: Blob
  bytes: number
  largura: number
  altura: number
  mime: string
}

export class ImagemInvalidaError extends Error {}

/** Teto do bucket (mig 147). Espelhado aqui pra falhar antes de subir. */
export const LIMITE_BYTES = 1024 * 1024

/** Alvo de qualidade: 1280px no maior lado dá ~150 KB e mantém legível placa, lacre e endereço. */
const LADO_MAXIMO_PADRAO = 1280
const QUALIDADE_PADRAO = 0.75

/**
 * Passos de degradação, aplicados em ordem até caber com folga. Uma foto de cena escura ou muito
 * texturizada (grama, pelo) comprime mal e estoura o alvo na primeira tentativa — em vez de
 * recusar, reduz.
 */
const DEGRADACAO: { lado: number; qualidade: number }[] = [
  { lado: LADO_MAXIMO_PADRAO, qualidade: QUALIDADE_PADRAO },
  { lado: LADO_MAXIMO_PADRAO, qualidade: 0.6 },
  { lado: 1024, qualidade: 0.6 },
  { lado: 800, qualidade: 0.55 },
]

/** Acima disto, não vale a pena nem tentar decodificar — é vídeo, PDF renomeado ou coisa pior. */
const LIMITE_ENTRADA_BYTES = 40 * 1024 * 1024

function calcularDestino(largura: number, altura: number, ladoMaximo: number) {
  const maior = Math.max(largura, altura)
  if (maior <= ladoMaximo) return { largura, altura }
  const fator = ladoMaximo / maior
  return { largura: Math.round(largura * fator), altura: Math.round(altura * fator) }
}

function toBlob(canvas: HTMLCanvasElement, mime: string, qualidade: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, mime, qualidade))
}

/**
 * Lê o arquivo respeitando a orientação EXIF. Sem `imageOrientation: 'from-image'` a foto tirada
 * em pé no Android sai deitada no canvas — o navegador só corrige sozinho na tag <img>, não aqui.
 */
async function carregarBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Formato que o navegador não decodifica (HEIC do iPhone em alguns casos, arquivo corrompido,
    // ou algo que só FINGE ser imagem no nome/Content-Type).
    throw new ImagemInvalidaError('Não consegui ler esta imagem. Tire a foto de novo pela câmera.')
  }
}

/**
 * Comprime uma foto para WebP (ou JPEG, onde WebP não existir), com o maior lado em 1280px.
 * Lança `ImagemInvalidaError` com mensagem pronta pra tela quando não dá pra usar o arquivo.
 */
export async function comprimirImagem(file: File): Promise<FotoComprimida> {
  if (!file.type.startsWith('image/')) {
    throw new ImagemInvalidaError('Isso não é uma imagem. Envie uma foto.')
  }
  if (file.size > LIMITE_ENTRADA_BYTES) {
    throw new ImagemInvalidaError('Arquivo grande demais para ser uma foto. Use a câmera do celular.')
  }

  const bitmap = await carregarBitmap(file)
  if (!bitmap.width || !bitmap.height) {
    bitmap.close?.()
    throw new ImagemInvalidaError('Imagem vazia ou corrompida.')
  }

  try {
    let melhor: FotoComprimida | null = null

    for (const passo of DEGRADACAO) {
      const destino = calcularDestino(bitmap.width, bitmap.height, passo.lado)
      const canvas = document.createElement('canvas')
      canvas.width = destino.largura
      canvas.height = destino.altura
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new ImagemInvalidaError('Este navegador não consegue processar a foto.')
      // Fundo branco: PNG com transparência viraria preto no JPEG.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(bitmap, 0, 0, destino.largura, destino.altura)

      // WebP primeiro; navegador sem suporte devolve PNG disfarçado (blob.type != image/webp),
      // e aí JPEG é o certo — PNG de foto fica ENORME, que é o problema que viemos evitar.
      let mime = 'image/webp'
      let blob = await toBlob(canvas, mime, passo.qualidade)
      if (!blob || blob.type !== 'image/webp') {
        mime = 'image/jpeg'
        blob = await toBlob(canvas, mime, passo.qualidade)
      }
      if (!blob) continue

      const candidato: FotoComprimida = {
        blob,
        bytes: blob.size,
        largura: destino.largura,
        altura: destino.altura,
        mime,
      }
      // Guarda o menor visto até agora, pro caso de nenhum passo caber.
      if (!melhor || candidato.bytes < melhor.bytes) melhor = candidato
      // 90% do teto: margem pra não esbarrar no limite do bucket por causa de overhead.
      if (candidato.bytes <= LIMITE_BYTES * 0.9) return candidato
    }

    if (!melhor) throw new ImagemInvalidaError('Não consegui processar esta foto. Tente outra.')
    if (melhor.bytes > LIMITE_BYTES) {
      throw new ImagemInvalidaError('Esta foto é pesada demais mesmo depois de reduzida. Tire outra.')
    }
    return melhor
  } finally {
    bitmap.close?.()
  }
}

/** Path no bucket `tarefas`. Determinístico de propósito: trocar a foto sobrescreve o MESMO
 *  objeto, então nunca sobra arquivo órfão e o teto é 3 objetos por tarefa (mig 147, trava 3).
 *  A policy de INSERT confere que o 1º segmento é uma tarefa que a pessoa pode concluir.
 *
 *  ⚠️ SEM EXTENSÃO, de propósito. Com `.webp`/`.jpg` no fim, a mesma tarefa que subisse WebP hoje
 *  (Android) e JPEG amanhã (navegador sem WebP) criaria DOIS objetos em vez de sobrescrever um —
 *  o vazamento que a trava 3 existe pra impedir. O tipo real vai no `contentType` do upload, que
 *  é o que o Storage serve; extensão no nome não muda nada pra um <img src>. */
export function pathDaFoto(tarefaId: string, slot: number): string {
  return `${tarefaId}/${slot}`
}
