'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

type Props = {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  /** Max width on desktop: 'sm' (400px) | 'md' (500px) | 'lg' (640px) | 'xl' (800px) | 'full' */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

// Larguras só valem no desktop (md+). No mobile o painel é bottom-sheet w-full.
const SIZE_MAP = {
  sm: 'md:max-w-[400px]',
  md: 'md:max-w-[500px]',
  lg: 'md:max-w-[640px]',
  xl: 'md:max-w-[800px]',
  full: 'md:max-w-[95vw]',
}

export default function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Click on overlay (not content) closes
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  // Layout decidido por CSS (breakpoint md), NÃO por JS (demanda 2026/118):
  // mobile = bottom-sheet (items-end); desktop = dialog centrado (md:items-center).
  // Assim o modal reage na hora à mudança de viewport (teclado, rotação, troca de aparelho)
  // sem depender de re-render do React.
  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center md:p-4 bg-black/40 backdrop-blur-[2px] animate-overlay-in"
    >
      <div className={`w-full ${SIZE_MAP[size]} bg-[var(--surface-0)] rounded-t-[var(--radius-xl)] md:rounded-[var(--radius-xl)] shadow-xl animate-bottom-sheet-up md:animate-scale-in max-h-[90vh] md:max-h-[85vh] flex flex-col`}>
        {/* Drag handle — só no mobile */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full bg-[var(--surface-300)]" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-4 md:px-6 pb-3 md:py-4 border-b border-[var(--surface-200)]">
            <h2 className="text-subtitle text-[var(--surface-800)]">{title}</h2>
            <button onClick={onClose} className="btn-icon" aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-4 md:px-6 py-3 md:py-4 border-t border-[var(--surface-200)] bg-[var(--surface-50)] md:rounded-b-[var(--radius-xl)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
