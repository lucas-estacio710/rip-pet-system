/**
 * Aviso "Gerando o PDF…" na tela enquanto um arquivo é montado (10/10/2026).
 *
 * Antes, o único sinal era o ícone de 14px do menu Documentos virando um circulinho — no
 * celular parecia tela parada. Mora na LIB (DOM puro, sem React) de propósito: quem gera o
 * arquivo liga o aviso, e as telas que chamam não precisam mudar.
 *
 * Contado por referência: chamadas aninhadas (baixarContratoPDF → gerarContratoPDF) ou em
 * sequência (impressão em lote) mantêm UM aviso só, e a saída espera 150 ms pra não piscar
 * entre um arquivo e o próximo.
 */

let ativos = 0
let el: HTMLDivElement | null = null
let textoEl: HTMLSpanElement | null = null
let saida: ReturnType<typeof setTimeout> | null = null

function mostrar(texto: string) {
  if (typeof document === 'undefined') return
  if (saida) { clearTimeout(saida); saida = null }
  if (!el) {
    el = document.createElement('div')
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
    Object.assign(el.style, {
      position: 'fixed', left: '50%', transform: 'translateX(-50%)',
      bottom: 'calc(1rem + var(--bottom-nav-h, 0px))', zIndex: '200',
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 16px', borderRadius: '9999px',
      background: '#1f2937', color: '#fff', font: '600 14px system-ui, sans-serif',
      boxShadow: '0 6px 20px rgba(0,0,0,.3)', pointerEvents: 'none', whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>)
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('width', '18'); svg.setAttribute('height', '18'); svg.setAttribute('viewBox', '0 0 24 24')
    svg.innerHTML = '<circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="3"/>' +
      '<path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>'
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      svg.animate?.([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 800, iterations: Infinity })
    }
    textoEl = document.createElement('span')
    el.append(svg, textoEl)
    document.body.appendChild(el)
  }
  if (textoEl) textoEl.textContent = texto
}

function esconder() {
  saida = setTimeout(() => {
    saida = null
    if (ativos === 0 && el) { el.remove(); el = null; textoEl = null }
  }, 150)
}

/** Roda `fn` com o aviso na tela; some quando a última geração em curso termina (ou falha). */
export async function comAvisoGerando<T>(texto: string, fn: () => Promise<T>): Promise<T> {
  ativos++
  mostrar(texto)
  // Deixa o navegador pintar o aviso antes do trabalho pesado travar a thread. O timeout
  // garante que segue mesmo com a aba em segundo plano (lá o rAF não dispara).
  await new Promise<void>(r => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(() => r()))
    setTimeout(r, 100)
  })
  try {
    return await fn()
  } finally {
    ativos--
    if (ativos === 0) esconder()
  }
}
