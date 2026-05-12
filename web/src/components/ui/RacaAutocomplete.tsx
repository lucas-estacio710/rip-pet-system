'use client'

import { useState, useRef, useEffect } from 'react'
import { Dog, Cat, Sparkles, X } from 'lucide-react'
import { buscarRacas, type EspeciePet, type RacaSugestao } from '@/lib/racas'

type Props = {
  value: string
  onChange: (val: string) => void
  /** Quando informada, prioriza raças da espécie certa. */
  especie?: EspeciePet | null
  placeholder?: string
  className?: string
  inputClassName?: string
}

export default function RacaAutocomplete({ value, onChange, especie, placeholder = 'Raça do pet', className = '', inputClassName = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [foco, setFoco] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const sugestoes: RacaSugestao[] = buscarRacas(value, especie ?? null, 8)

  // Fecha ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function selecionar(s: RacaSugestao) {
    onChange(s.nome)
    setOpen(false)
    inputRef.current?.blur()
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { setOpen(true); e.preventDefault() }
      return
    }
    if (e.key === 'ArrowDown') { setFoco(f => Math.min(sugestoes.length - 1, f + 1)); e.preventDefault() }
    else if (e.key === 'ArrowUp') { setFoco(f => Math.max(0, f - 1)); e.preventDefault() }
    else if (e.key === 'Enter') {
      if (sugestoes[foco]) { selecionar(sugestoes[foco]); e.preventDefault() }
    }
    else if (e.key === 'Escape') { setOpen(false); e.preventDefault() }
  }

  function highlight(nome: string): React.ReactNode {
    const q = value.trim()
    if (!q) return nome
    // Match case-insensitive + acento-insensitive: usa normalizar
    const nomeNorm = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    const qNorm = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    const idx = nomeNorm.indexOf(qNorm)
    if (idx === -1) return nome
    return (
      <>
        {nome.slice(0, idx)}
        <span className="bg-purple-500/30 text-purple-200 rounded px-0.5">{nome.slice(idx, idx + q.length)}</span>
        {nome.slice(idx + q.length)}
      </>
    )
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setFoco(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        className={inputClassName || 'w-full px-2 py-1.5 border border-slate-600 rounded text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500'}
      />
      {value && (
        <button
          type="button"
          onClick={() => { onChange(''); inputRef.current?.focus() }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
          title="Limpar"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      {open && sugestoes.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-64 overflow-y-auto">
          {sugestoes.map((s, i) => {
            const Ico = s.especie === 'felina' ? Cat : Dog
            const ativo = i === foco
            return (
              <button
                key={s.nome + s.especie}
                onMouseDown={e => { e.preventDefault(); selecionar(s) }}
                onMouseEnter={() => setFoco(i)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${ativo ? 'bg-purple-900/30 text-purple-200' : 'text-slate-300 hover:bg-slate-700/50'}`}
              >
                <Ico className={`h-3.5 w-3.5 ${s.especie === 'felina' ? 'text-pink-400' : 'text-blue-400'}`} />
                <span className="flex-1">{highlight(s.nome)}</span>
                {s.viaAlias && (
                  <span className="flex items-center gap-1 text-[9px] text-amber-400 italic">
                    <Sparkles className="h-2.5 w-2.5" />
                    via &quot;{s.viaAlias}&quot;
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
