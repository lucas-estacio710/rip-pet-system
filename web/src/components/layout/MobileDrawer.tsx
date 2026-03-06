'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

type Props = {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
}

export function MobileDrawer({ isOpen, onClose, children }: Props) {
  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-overlay-in"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <aside className="theme-sidebar absolute top-0 left-0 bottom-0 w-72 bg-slate-900 shadow-xl animate-slide-in-left flex flex-col">
        {/* Close button */}
        <div className="flex items-center justify-end p-3">
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sidebar content */}
        {children}
      </aside>
    </div>
  )
}
