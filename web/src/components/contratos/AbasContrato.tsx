'use client'

/**
 * Faixa de abas dos cards de baixo do /contratos/[id] (docs/PLAYBOOK_CONTRATO_ID.md, item 16).
 * Linguagem da barra de ETAPAS do pipeline (.pl-etapa): sem caixa, texto + ícone sobre uma linha
 * fina; a ativa acende na cor dela com o sublinhado que brilha. CSS em app/pipeline.css (.pl-aba).
 *
 * - 6 abas, SEMPRE as 6 (grade fixa): a que não se aplica fica apagada, nunca some.
 * - Desktop: 6 numa linha. Celular: 3 + 3.
 */
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export type AbaDef = {
  id: string
  rotulo: string
  icone: LucideIcon
  cor: string
  /** Sinal ao lado do nome (contagem, ✓, bolinha). */
  sinal?: ReactNode
  /** Não se aplica a este contrato (ou sem permissão): apagada e sem clique. */
  apagada?: boolean
  dicaApagada?: string
}

export default function AbasContrato({ abas, ativa, onTrocar }: { abas: AbaDef[]; ativa: string; onTrocar: (id: string) => void }) {
  return (
    <div className="pl-abas" role="tablist">
      {abas.map(a => {
        const Icone = a.icone
        const on = a.id === ativa && !a.apagada
        return (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={on}
            disabled={a.apagada}
            title={a.apagada ? (a.dicaApagada || 'Não se aplica a este contrato') : undefined}
            onClick={() => onTrocar(a.id)}
            className={`pl-aba${on ? ' on' : ''}`}
            style={{ '--c': a.cor } as React.CSSProperties}
          >
            <Icone className="pl-aba-ic" strokeWidth={1.75} />
            <span className="truncate">{a.rotulo}</span>
            {!a.apagada && a.sinal}
          </button>
        )
      })}
    </div>
  )
}
