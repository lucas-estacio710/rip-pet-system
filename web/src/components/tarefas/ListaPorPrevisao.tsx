'use client'

/**
 * Lista de ENTREGAS dividida por dia da previsão e, dentro do dia, por período (Manhã · Tarde ·
 * Dia todo · Sem período) — o mesmo corte da etapa Entrega do pipeline (27/10/2026, pedido do
 * Lucas). Quem não tem previsão cai em "Sem data", no fim. Usada no /tarefas: Para Atribuir,
 * Em Andamento e Minhas Tarefas. Regra de agrupamento em `lib/programacao-entrega`.
 */
import { Fragment, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { agruparProgramacao, type Programacao } from '@/lib/programacao-entrega'
import { hojeLocal } from '@/lib/date-local'

export default function ListaPorPrevisao<T>({ itens, previsao, render }: {
  itens: T[]
  previsao: (item: T) => Programacao
  render: (item: T) => ReactNode
}) {
  const { dias } = agruparProgramacao(itens, previsao, hojeLocal())
  // Nenhum item com data nem período: não há o que dividir, a lista fica como era.
  if (dias.length === 1 && dias[0].chave === 'sem_data' && dias[0].periodos.length === 1) {
    return <>{itens.map(render)}</>
  }
  return (
    <>
      {dias.map(d => (
        <Fragment key={d.chave}>
          <div className={`flex items-center gap-2 pt-2 px-1 text-xs font-bold ${d.atrasado ? 'text-red-500' : d.hoje ? 'text-emerald-500' : 'text-[var(--surface-500)]'}`}>
            {d.atrasado && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
            <span>{d.rotulo}</span>
            <span className="font-semibold text-[var(--surface-400)]">· {d.itens.length}</span>
            <div className="flex-1 h-px bg-[var(--surface-200)]" />
          </div>
          {d.periodos.map(per => (
            <Fragment key={per.chave}>
              <p className="pl-4 text-[11px] font-semibold uppercase tracking-wider text-[var(--surface-400)]">
                {per.rotulo} · {per.itens.length}
              </p>
              {per.itens.map(render)}
            </Fragment>
          ))}
        </Fragment>
      ))}
    </>
  )
}
