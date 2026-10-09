'use client'

/**
 * Texto com o trecho da busca marcado (parte 5 de docs/BUSCA_PIPELINE.md). Ignora acento e
 * caixa — "joao" marca "JOÃO" — via `trechosDestacados` (lib/busca-contratos.ts). Sem termos,
 * devolve o texto puro: os cards usam isto sempre, e só a busca por texto manda termos.
 */
import { trechosDestacados } from '@/lib/busca-contratos'

export default function Destacado({ texto, termos }: { texto: string; termos?: string[] }) {
  if (!termos || termos.length === 0 || !texto) return <>{texto}</>
  return (
    <>
      {trechosDestacados(texto, termos).map((p, i) => p.hit
        ? <mark key={i} className="rounded-sm px-px" style={{ background: 'rgba(250,204,21,.55)', color: 'inherit' }}>{p.t}</mark>
        : <span key={i}>{p.t}</span>)}
    </>
  )
}
