'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { X, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react'

type ToastVariant = 'success' | 'error' | 'warning' | 'info'

type Toast = {
  id: string
  message: string
  variant: ToastVariant
}

type ToastContextType = {
  toast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

const VARIANT_CONFIG: Record<ToastVariant, { icon: typeof CheckCircle2; bg: string; text: string; border: string }> = {
  success: { icon: CheckCircle2, bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-200' },
  error: { icon: AlertCircle, bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' },
  warning: { icon: AlertTriangle, bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  info: { icon: Info, bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counterRef = useRef(0)

  const addToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = `toast-${++counterRef.current}`
    setToasts(prev => [...prev, { id, message, variant }])

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}

      {/* Toast container — bottom-right desktop, bottom-center mobile */}
      <div className="fixed bottom-4 right-4 left-4 md:left-auto md:w-96 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => {
          const config = VARIANT_CONFIG[t.variant]
          const Icon = config.icon

          return (
            <div
              key={t.id}
              className={`
                pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-[var(--radius-lg)]
                border shadow-lg animate-slide-up
                ${config.bg} ${config.text} ${config.border}
              `}
            >
              <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <p className="flex-1 text-sm font-medium">{t.message}</p>
              <button
                onClick={() => removeToast(t.id)}
                className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
