'use client'

/**
 * Trilho (linha de baixo) do card de pet no CELULAR, pipeline redesenhado — fase 2.3 do
 * docs/PLAYBOOK_REDESENHO_PIPELINE.md (itens 6, 8, 11, 32 e 37).
 *
 *   [✓N ⏱M]  ···  [extras]  [Ações «]
 *
 * - Resumo ✓⏱ (só com `btn_farois` — faróis são funcionalidade paga, P-05): âmbar se há
 *   pendência, verde se não. Hoje (até o 2.4) tocar nele abre/fecha os FARÓIS ANTIGOS embaixo,
 *   no próprio card — ponte pra ninguém perder acesso a farol antes do popup de pendências.
 * - "Ações «": abre a gaveta, que desliza da direita sobre a linha (só do tamanho dos botões,
 *   sem passar da borda; rola de lado se faltar espaço). Sem nenhuma ação, o botão nem existe.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import ResumoPendencias from './ResumoPendencias'

type Props = {
  /** null = sem faróis na unidade (P-05): o resumo some. */
  resumo: { feitos: number; pendentes: number } | null
  resumoAberto: boolean
  onResumo: () => void
  /** Fica na linha, à direita (status do GC, caixinha da entrega em lote…). */
  extras?: ReactNode
  /** Botões da gaveta, já na ordem (Waze/Maps primeiro). Vazio = sem botão "Ações". */
  acoes: ReactNode[]
  /** Ocupa o espaço à esquerda até as Ações (ex.: o endereço do tutor na Entrega — item 36). */
  inicio?: ReactNode
  /** Visão "Ícones" do placar (ver ResumoPendencias). */
  icones?: { id: string; emoji: string; titulo: string }[]
  onIcone?: (id: string) => void
}

export default function TrilhoCardPet({ resumo, resumoAberto, onResumo, extras, acoes, inicio, icones, onIcone }: Props) {
  const [gaveta, setGaveta] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Toque fora fecha a gaveta (listener no document — sem overlay fixed, ver BarraPipeline).
  useEffect(() => {
    if (!gaveta) return
    const fora = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setGaveta(false) }
    document.addEventListener('pointerdown', fora)
    return () => document.removeEventListener('pointerdown', fora)
  }, [gaveta])


  return (
    <div ref={ref} className="pl-trilho flex items-center gap-1.5 min-h-[36px]" onClick={e => e.stopPropagation()}>
      {resumo && (
        <ResumoPendencias feitos={resumo.feitos} pendentes={resumo.pendentes} onClick={onResumo} ariaExpanded={resumoAberto} icones={icones} onIcone={onIcone} />
      )}
      {inicio ? <div className="flex-1 min-w-0">{inicio}</div> : <div className="flex-1" />}
      {extras}
      {acoes.length > 0 && (
        <>
          {gaveta && <div className="pl-gaveta">{acoes}</div>}
          <button
            type="button"
            onClick={() => setGaveta(v => !v)}
            className="pl-vidro relative"
            style={{ '--pl-c': '#8b5cf6', zIndex: 3 } as React.CSSProperties}
            aria-expanded={gaveta}
            title={gaveta ? 'Fechar ações' : 'Ações'}
          >
            {!gaveta && <span>Ações</span>}
            <span className="text-[15px] leading-none">{gaveta ? '»' : '«'}</span>
          </button>
        </>
      )}
    </div>
  )
}
