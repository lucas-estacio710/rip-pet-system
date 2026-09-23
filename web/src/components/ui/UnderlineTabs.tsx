'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Abas com sublinhado deslizante.
 *
 * Escolhido pelo Lucas entre 5 opções visuais (cápsula, underline, chips, trilha,
 * popover+switch) apresentadas num artifact, pra diferenciar fases dentro de uma
 * tela sem o peso de uma aba de verdade. Nasceu em `/tarefas` e vive aqui desde
 * 23/09/2026, quando o financeiro passou a precisar do mesmo gesto — o original
 * foi extraído, não copiado.
 *
 * `count` é opcional: em `/tarefas` a contagem é o dado principal ("12 pra
 * atribuir"); no financeiro nem sempre há um número que ajude, e badge com zero
 * fixo só rouba atenção.
 */
export default function UnderlineTabs<T extends string>({ tabs, value, onChange }: {
  tabs: { key: T; label: string; count?: number }[]
  value: T
  onChange: (key: T) => void
}) {
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [thumb, setThumb] = useState({ left: 0, width: 0 })

  useEffect(() => {
    const btn = btnRefs.current[value]
    if (btn) setThumb({ left: btn.offsetLeft, width: btn.offsetWidth })
  }, [value, tabs])

  return (
    <div className="relative flex gap-5 border-b border-[var(--surface-200)] px-0.5">
      <div
        className="absolute bottom-[-1px] h-0.5 rounded-full bg-[var(--brand-600)] transition-all duration-300 ease-out"
        style={{ left: thumb.left, width: thumb.width }}
      />
      {tabs.map(tab => (
        <button
          key={tab.key}
          ref={el => { btnRefs.current[tab.key] = el }}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`flex items-center gap-1.5 pb-3 pt-1 text-sm font-semibold whitespace-nowrap transition-colors ${value === tab.key ? 'text-[var(--surface-800)]' : 'text-[var(--surface-400)]'}`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full transition-colors ${value === tab.key ? 'text-[var(--brand-700)] bg-[var(--brand-50)]' : 'text-[var(--surface-400)] bg-[var(--surface-100)]'}`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
