/**
 * Copia texto pra clipboard com fallback robusto.
 *
 * - `navigator.clipboard` exige contexto seguro (HTTPS ou localhost).
 *   Acessando por IP da rede (ex: http://100.98.x.x:3000) ele é `undefined`.
 * - Fallback: textarea + document.execCommand('copy') — deprecated mas
 *   funciona em qualquer contexto.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // segue pro fallback
    }
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '0'
    textarea.setAttribute('readonly', '')
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
