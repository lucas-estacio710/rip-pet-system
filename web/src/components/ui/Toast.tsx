'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { X, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react'

type ToastVariant = 'success' | 'error' | 'warning' | 'info'

/** Botão dentro do aviso (ex.: "Desfazer"). Clicar executa e fecha o aviso. */
export type ToastAction = { label: string; onClick: () => void }

type Toast = {
  id: string
  message: string
  variant: ToastVariant
  action?: ToastAction
}

type ToastContextType = {
  toast: (message: string, variant?: ToastVariant, opts?: { action?: ToastAction }) => void
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

  const addToast = useCallback((message: string, variant: ToastVariant = 'info', opts?: { action?: ToastAction }) => {
    const id = `toast-${++counterRef.current}`
    setToasts(prev => [...prev, { id, message, variant, action: opts?.action }])

    // Erros NÃO somem sozinhos (2026/69) — o usuário fecha no X quando terminar de ler.
    // Demais variantes auto-dismiss (warning fica um pouco mais; com botão de ação, mais
    // ainda — 4s não dá tempo de achar o "Desfazer").
    if (variant !== 'error') {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, opts?.action ? 8000 : variant === 'warning' ? 6000 : 4000)
    }
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}

      {/* Toast container — bottom-right desktop, bottom-center mobile. Sobe acima da barra de
          atalhos do celular pela `--bottom-nav-h` que o MobileBottomNav publica (0 sem barra). */}
      <div role="status" aria-live="polite" className="fixed right-4 left-4 md:left-auto md:w-96 z-[100] flex flex-col gap-2 pointer-events-none" style={{ bottom: 'calc(1rem + var(--bottom-nav-h, 0px))' }}>
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
              {t.action && (
                <button
                  onClick={() => { t.action!.onClick(); removeToast(t.id) }}
                  className="flex-shrink-0 text-sm font-bold underline underline-offset-2"
                >
                  {t.action.label}
                </button>
              )}
              <button
                onClick={() => removeToast(t.id)}
                aria-label="Fechar aviso"
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
