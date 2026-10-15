'use client'

// "DE QUEM É?" (15/10/2026) — no caixa conjunto (Matriz + Pinda), todo lançamento escolhe a
// unidade dona. Nasce SEM nada marcado: escolher é obrigatório, senão o custo cai na unidade de
// quem está logado sem ninguém perceber — exatamente o que gerava divisão/repasse depois.
// A etiqueta (EtiquetaUnidade) mostra M/P em toda lista do caixa conjunto.

import type { Irma } from '@/hooks/useCaixaConjunto'

export function DonoLancamento({ irmas, valor, onChange, rotulo = 'De quem é?', travado = false }: {
  irmas: Irma[]; valor: string | null; onChange: (id: string) => void; rotulo?: string; travado?: boolean
}) {
  if (irmas.length < 2) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-[var(--surface-700)]">{rotulo}</span>
      <span className={`inline-flex rounded-full border p-0.5 ${valor ? 'border-[var(--surface-300)]' : 'border-amber-500/70'}`}>
        {irmas.map(u => (
          <button key={u.id} type="button" disabled={travado} onClick={() => onChange(u.id)}
                  className={`px-3 py-1 rounded-full text-[13px] transition-colors ${valor === u.id ? 'bg-[var(--brand-500)] text-white font-semibold' : 'text-[var(--surface-600)] hover:text-[var(--surface-900)]'} disabled:opacity-60`}>
            {u.nome}
          </button>
        ))}
      </span>
      {!valor && <span className="text-[11px] text-amber-500">escolha a unidade</span>}
    </div>
  )
}

export function EtiquetaUnidade({ letra, nome }: { letra: string; nome?: string }) {
  if (!letra) return null
  const m = letra === 'M'
  return (
    <span title={nome} className="inline-flex shrink-0 items-center justify-center h-4 min-w-4 px-1 rounded text-[10px] font-bold leading-none"
          style={{ background: m ? 'rgba(99,102,241,0.16)' : 'rgba(16,185,129,0.16)', color: m ? '#818cf8' : '#10b981' }}>
      {letra}
    </span>
  )
}
