'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type FilterOption = {
  value: string
  label: string
  count?: number
  // ex: 'red' | 'green' | 'amber' — se vazio, usa neutro
  tone?: 'red' | 'green' | 'amber' | 'orange' | 'blue' | 'purple' | 'neutral'
}

type Props = {
  label: string                       // "Tipo", "Status", "Categoria"
  icon?: LucideIcon
  value: string                        // '' = "Todos"
  options: FilterOption[]              // sem o "Todos" — adicionado automaticamente
  onChange: (value: string) => void
  allLabel?: string                    // "Todos" | "Todas categorias"
  toneActive?: 'brand' | 'red' | 'amber' | 'orange' | 'green' | 'blue' | 'purple'
}

const TONE_CHIP: Record<string, string> = {
  brand: 'bg-[var(--brand-500)] text-white shadow-md',
  red: 'bg-red-600 text-white shadow-md',
  amber: 'bg-amber-500 text-white shadow-md',
  orange: 'bg-orange-600 text-white shadow-md',
  green: 'bg-green-600 text-white shadow-md',
  blue: 'bg-blue-600 text-white shadow-md',
  purple: 'bg-purple-600 text-white shadow-md',
}

export default function FilterDropdown({
  label,
  icon: Icon,
  value,
  options,
  onChange,
  allLabel = 'Todos',
  toneActive = 'brand',
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const selected = options.find(o => o.value === value)
  const isActive = !!selected

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
          isActive
            ? TONE_CHIP[toneActive]
            : 'bg-[var(--surface-0)] border border-[var(--surface-200)] text-[var(--surface-600)] hover:border-[var(--surface-300)]'
        }`}
      >
        {Icon && <Icon className="h-3.5 w-3.5" />}
        <span>{isActive ? selected!.label : label}</span>
        {isActive && selected!.count !== undefined && (
          <span className="text-xs opacity-80">({selected!.count})</span>
        )}
        {isActive ? (
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); onChange(''); setOpen(false) }}
            onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onChange(''); setOpen(false) } }}
            className="ml-0.5 cursor-pointer hover:opacity-70"
            title="Limpar"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : (
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && (
        <div className="absolute z-30 mt-1 min-w-[180px] bg-[var(--surface-0)] border border-[var(--surface-200)] rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {/* Opção "Todos" */}
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false) }}
            className={`w-full px-3 py-2 text-sm text-left flex items-center justify-between hover:bg-[var(--surface-50)] transition-colors ${
              !value ? 'font-semibold text-[var(--surface-800)]' : 'text-[var(--surface-600)]'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {!value && <Check className="h-3.5 w-3.5 text-[var(--brand-500)]" />}
              {value && <span className="w-3.5" />}
              {allLabel}
            </span>
          </button>
          <div className="h-px bg-[var(--surface-100)]" />
          {options.map(opt => {
            const ativo = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={`w-full px-3 py-2 text-sm text-left flex items-center justify-between hover:bg-[var(--surface-50)] transition-colors ${
                  ativo ? 'font-semibold text-[var(--surface-800)]' : 'text-[var(--surface-600)]'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  {ativo ? <Check className="h-3.5 w-3.5 text-[var(--brand-500)]" /> : <span className="w-3.5" />}
                  {opt.label}
                </span>
                {opt.count !== undefined && (
                  <span className="text-xs text-[var(--surface-400)] tabular-nums">{opt.count}</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
