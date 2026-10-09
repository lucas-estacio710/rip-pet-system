'use client'

// O MÊS DO FINANCEIRO — um só, acima das abas (09/10/2026, pedido do Lucas:
// "seleciono em cima e posso navegar sobre as abas naquele mês"). As setas
// andam um mês; clicar no nome abre a grade do ano pra pular longe.

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export const rotuloMesLongo = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`
export function somaMes(m: string, d: number): string {
  const [a, mm] = m.split('-').map(Number)
  const x = new Date(a, mm - 1 + d, 1)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`
}
export const mesDeHoje = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function SeletorMes({ mes, onMes }: { mes: string; onMes: (m: string) => void }) {
  const [aberto, setAberto] = useState(false)
  const [ano, setAno] = useState(Number(mes.slice(0, 4)))
  const caixa = useRef<HTMLDivElement>(null)
  const hoje = mesDeHoje()

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])

  const seta = 'h-9 w-9 shrink-0 rounded-full border border-[var(--surface-300)] flex items-center justify-center text-[var(--surface-600)] hover:bg-[var(--surface-100)]'
  return (
    <div className="flex items-center gap-2 sm:gap-3" ref={caixa}>
      <button onClick={() => onMes(somaMes(mes, -1))} aria-label="Mês anterior" className={seta}><ChevronLeft className="h-4 w-4" /></button>
      <div className="relative">
        <button onClick={() => { if (!aberto) setAno(Number(mes.slice(0, 4))); setAberto(v => !v) }} aria-haspopup="dialog" aria-expanded={aberto}
                className="flex items-center gap-1.5 rounded-[10px] px-1.5 -mx-1.5 hover:bg-[var(--surface-100)]">
          <span className="text-[26px] sm:text-[32px] font-bold tracking-tight text-[var(--surface-900)] capitalize">{rotuloMesLongo(mes)}</span>
          <ChevronDown className={`h-5 w-5 text-[var(--surface-500)] transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </button>
        {aberto && (
          <div role="dialog" aria-label="Escolher o mês" className="absolute left-0 top-full mt-2 z-50 w-72 card p-3 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setAno(a => a - 1)} aria-label="Ano anterior" className={seta}><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-base font-semibold text-[var(--surface-800)] tabular-nums">{ano}</span>
              <button onClick={() => setAno(a => a + 1)} aria-label="Próximo ano" className={seta}><ChevronRight className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {ABREV.map((nome, i) => {
                const m = `${ano}-${String(i + 1).padStart(2, '0')}`
                const ativo = m === mes
                return (
                  <button key={m} onClick={() => { onMes(m); setAberto(false) }}
                          className={`h-10 rounded-[10px] text-sm capitalize ${ativo
                            ? 'bg-[var(--brand-500)] text-white font-semibold'
                            : m === hoje
                              ? 'border border-[var(--brand-500)]/50 text-[var(--surface-800)] hover:bg-[var(--surface-100)]'
                              : 'text-[var(--surface-700)] hover:bg-[var(--surface-100)]'}`}>
                    {nome}
                  </button>
                )
              })}
            </div>
            {mes !== hoje && (
              <button onClick={() => { onMes(hoje); setAberto(false) }} className="mt-2 w-full text-[13px] text-[var(--brand-500)] hover:underline">
                voltar para o mês atual
              </button>
            )}
          </div>
        )}
      </div>
      <button onClick={() => onMes(somaMes(mes, 1))} aria-label="Próximo mês" className={seta}><ChevronRight className="h-4 w-4" /></button>
    </div>
  )
}
