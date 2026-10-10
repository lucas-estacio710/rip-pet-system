'use client'

/**
 * Popup centralizado que NÃO deixa o botão de ação fora da tela (incidente 24/09/2026: card com
 * `max-h-[92vh]` dentro de `fixed inset-0` que não rola — colaborador não conseguia concluir a
 * remoção). Esqueleto em docs/playbook_redesenho/07_layout_infra.md §2.1:
 *
 * - overlay `fixed inset-0` (a classe é o sinal pro MobileBottomNav sumir) · `flex p-3`
 * - card `m-auto` (não `items-center`: quando não cabe, não sai pela borda)
 * - altura pela viewport VISÍVEL (`--vvh` via visualViewport — encolhe com o teclado), nunca `vh`
 * - o OVERLAY também ocupa só a área visível (`top: --vvt`, `height: --vvh`) — 10/10/2026, teclado
 *   no certificado: com o overlay na altura cheia o `m-auto` centrava o card numa área que incluía
 *   a faixa atrás do teclado (e no iOS o `offsetTop` deslocava mais), e o rodapé sumia atrás dele.
 *   As classes `fixed inset-0` ficam (são o sinal pro MobileBottomNav); o inline sobrescreve.
 * - corpo `flex-1 min-h-0 overflow-y-auto` (sem o min-h-0 o flex não deixa rolar e o rodapé
 *   é empurrado pra fora) · rodapé fora do scroller, com safe-area
 * - foco vai pro CONTAINER (Esc fecha), nunca pra um campo — teclado subindo cobre a tela
 * - cor só por token (o tema claro remapeia classes Tailwind de cor)
 *
 * O botão voltar é do `usePopupHistory` — quem abre o popup decide; este componente só desenha.
 * Trava a rolagem do fundo com contador (lib/scroll-lock) — popup sobre popup não destrava.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useTravarRolagem } from '@/lib/scroll-lock'

type Props = {
  aberto: boolean
  onFechar: () => void
  titulo?: ReactNode
  children: ReactNode
  /** Fica fixo embaixo, fora da rolagem (botões de ação). */
  rodape?: ReactNode
  /** 500 padrão; 640 pro Mega Pagamento e a Urna. */
  largura?: 500 | 640
  /** Clique fora fecha? (padrão sim; desligue em formulário com dado digitado). */
  fecharNoFundo?: boolean
  /** Fica colado à esquerda do ✕ (ex.: "‹ Pendências" no 2º nível dos faróis). */
  antesDoFechar?: ReactNode
}

export default function PopupCentral({ aberto, onFechar, titulo, children, rodape, largura = 500, fecharNoFundo = true, antesDoFechar }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useTravarRolagem(aberto)

  // Altura visível de verdade (teclado aberto encolhe o visualViewport, não o 100dvh).
  useEffect(() => {
    if (!aberto) return
    const vv = window.visualViewport
    const ov = overlayRef.current
    if (!vv || !ov) return
    const aplicar = () => {
      ov.style.setProperty('--vvh', `${vv.height}px`)
      ov.style.setProperty('--vvt', `${vv.offsetTop}px`)
    }
    aplicar()
    vv.addEventListener('resize', aplicar)
    vv.addEventListener('scroll', aplicar)
    return () => {
      vv.removeEventListener('resize', aplicar)
      vv.removeEventListener('scroll', aplicar)
    }
  }, [aberto])

  // Foco no container (leitor de tela e Esc), sem abrir teclado.
  useEffect(() => {
    if (aberto) cardRef.current?.focus({ preventScroll: true })
  }, [aberto])

  if (!aberto) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex p-3 overscroll-contain pl-overlay-in"
      style={{ background: 'rgba(0, 0, 0, 0.5)', top: 'var(--vvt, 0px)', bottom: 'auto', height: 'var(--vvh, 100dvh)' }}
      onClick={e => { if (fecharNoFundo && e.target === e.currentTarget) onFechar() }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onFechar() } }}
        className={`theme-content m-auto w-full flex flex-col outline-none pl-popup-in ${largura === 640 ? 'max-w-[640px]' : 'max-w-[500px]'}`}
        style={{
          maxHeight: 'calc(var(--vvh, 100dvh) - 24px)',
          background: 'var(--surface-0)',
          border: '1px solid var(--surface-200)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {titulo !== undefined && (
          <div className="flex items-center gap-2 px-4 pt-3 pb-2 shrink-0">
            <div className="flex-1 min-w-0 font-semibold" style={{ color: 'var(--surface-900)' }}>{titulo}</div>
            {antesDoFechar}
            <button
              type="button"
              onClick={onFechar}
              aria-label="Fechar"
              className="w-9 h-9 flex items-center justify-center rounded-full shrink-0"
              style={{ color: 'var(--surface-500)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-3">
          {children}
        </div>

        {rodape && (
          <div
            className="shrink-0 px-4 pt-2 border-t"
            style={{ borderColor: 'var(--surface-200)', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
          >
            {rodape}
          </div>
        )}
      </div>
    </div>
  )
}
