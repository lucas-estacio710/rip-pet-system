'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useMediaQuery } from '@/hooks/useMediaQuery'

type Props = {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  /** Max width on desktop: 'sm' (400px) | 'md' (500px) | 'lg' (640px) | 'xl' (800px) | 'full' */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

const SIZE_MAP = {
  sm: 'max-w-[400px]',
  md: 'max-w-[500px]',
  lg: 'max-w-[640px]',
  xl: 'max-w-[800px]',
  full: 'max-w-[95vw]',
}

export default function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: Props) {
  const bp = useMediaQuery()
  const isMobile = bp === 'mobile'
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

  if (isMobile) {
    // Bottom sheet on mobile
    return (
      <div
        ref={overlayRef}
        onClick={handleOverlayClick}
        className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-[2px] animate-overlay-in"
      >
        <div className="w-full bg-[var(--surface-0)] rounded-t-[var(--radius-xl)] shadow-xl animate-bottom-sheet-up max-h-[90vh] flex flex-col">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-[var(--surface-300)]" />
          </div>

          {/* Header */}
          {title && (
            <div className="flex items-center justify-between px-4 pb-3 border-b border-[var(--surface-200)]">
              <h2 className="text-subtitle text-[var(--surface-800)]">{title}</h2>
              <button onClick={onClose} className="btn-icon">
                <X className="h-5 w-5" />
              </button>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="px-4 py-3 border-t border-[var(--surface-200)] bg-[var(--surface-50)]">
              {footer}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Centered dialog on desktop/tablet
  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-overlay-in"
    >
      <div className={`w-full ${SIZE_MAP[size]} bg-[var(--surface-0)] rounded-[var(--radius-xl)] shadow-xl animate-scale-in max-h-[85vh] flex flex-col`}>
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--surface-200)]">
            <h2 className="text-subtitle text-[var(--surface-800)]">{title}</h2>
            <button onClick={onClose} className="btn-icon">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-[var(--surface-200)] bg-[var(--surface-50)] rounded-b-[var(--radius-xl)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
