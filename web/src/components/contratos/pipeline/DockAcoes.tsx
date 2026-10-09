'use client'

/**
 * Ações do card largo = DOCK do Mac — fase 2.17c (D3 de docs/REDESENHO_CARDS_PIPELINE.md).
 *
 * As bolinhas ficam SEMPRE à mostra e pequenas (60% ≈ 22px); conforme o mouse se aproxima,
 * cada uma cresce pela DISTÂNCIA até o centro dela (curva suave, raio ≈ 1,7× a altura da
 * fileira ≈ 2 vizinhos de cada lado), até 115% — a vizinha fica ~88%, a seguinte ~72%.
 * A 1ª versão só com `:hover` + `:has()` só funcionou no Waze/Maps; a de distância é a dock.
 *
 * Técnica: o botão mantém os 36px reais (alvo e conteúdo intactos), só ESCALA; a margem
 * negativa devolve o espaço não usado, então a fileira encolhe em repouso e abre com o mouse.
 * O `--k` de cada botão é escrito direto no DOM no `mousemove` (sem render do React).
 * Vale pra todo `a`/`button` dentro — inclusive os que o `ActionButtons` desenha.
 */
import { useRef, type ReactNode } from 'react'

const REPOUSO = 0.6
const MAXIMO = 1.15
// Queda exponencial calibrada pro D3: a ~32px (a vizinha) dá ~88%, a ~64px (a seguinte) ~72%.
// O cosseno da 1ª conta deixava a vizinha em ~100% — a fileira inteira crescia junto.
const QUEDA = 46
const ALCANCE = QUEDA * 3   // além disso, repouso

export function escalaDaDock(distancia: number): number {
  if (distancia >= ALCANCE) return REPOUSO
  return REPOUSO + (MAXIMO - REPOUSO) * Math.exp(-distancia / QUEDA)
}

export default function DockAcoes({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  function itens(): HTMLElement[] {
    return ref.current ? Array.from(ref.current.querySelectorAll<HTMLElement>('a, button')) : []
  }

  function mover(e: React.MouseEvent) {
    for (const el of itens()) {
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      el.style.setProperty('--k', escalaDaDock(Math.abs(e.clientX - cx)).toFixed(3))
    }
  }

  function sair() {
    for (const el of itens()) el.style.removeProperty('--k')
  }

  return (
    <div ref={ref} className="pl-dock flex items-center" onMouseMove={mover} onMouseLeave={sair}>
      {children}
    </div>
  )
}
