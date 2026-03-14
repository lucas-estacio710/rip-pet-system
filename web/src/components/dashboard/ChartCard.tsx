'use client'

import { useState, ReactNode } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'

type Props = {
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
  expandable?: boolean
  action?: ReactNode
}

export default function ChartCard({ title, subtitle, children, className = '', expandable = false, action }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (expanded) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-fade-in" onClick={() => setExpanded(false)}>
        <div
          className="card p-6 w-full max-w-4xl max-h-[90vh] overflow-auto animate-scale-in"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-subtitle text-[var(--surface-800)]">{title}</h3>
              {subtitle && <p className="text-small text-[var(--surface-400)]">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-2">
              {action}
              <button onClick={() => setExpanded(false)} className="btn-icon">
                <Minimize2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="h-[60vh]">{children}</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`card p-4 md:p-5 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--surface-700)] truncate">{title}</h3>
          {subtitle && <p className="text-xs text-[var(--surface-400)] mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {action}
          {expandable && (
            <button onClick={() => setExpanded(true)} className="btn-icon !w-7 !h-7" title="Expandir">
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}
