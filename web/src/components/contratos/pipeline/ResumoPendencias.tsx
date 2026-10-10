'use client'

/**
 * Placar de pendências ✓N ⏱M do pipeline redesenhado — UMA peça pros 4 lugares (card do celular,
 * linha do tutor na Entrega/Pendente, chefão do card da viagem, Em Acolhimento no desktop).
 * Item 1 dos ajustes finos (09/10/2026): desenho da bancada, estilo C · vidro —
 *  - com pendência: caixinha âmbar, mas o ✓ N continua VERDE (dá pra ler de relance o que já foi
 *    feito) e só o ⏱ N é âmbar;
 *  - sem pendência: tudo verde e o ⏱ some;
 *  - ícones de traço (Lucide CircleCheck / Clock), não os caracteres ✓/⏱.
 *
 * Visão "Ícones" (10/10/2026, pedido do Lucas — opção no menu de organizar): no lugar do ⏱ N
 * entram o ⏱ e, à direita dele, os ÍCONES das pendências, dentro do mesmo box (concluídos não
 * abrem em ícone — ficam no ✓ N). O ✓ N continua abrindo a lista; tocar
 * num ícone abre aquela pendência direto no nível de resolução (`onIcone`).
 */
import { CircleCheck, Clock } from 'lucide-react'

type Props = {
  feitos: number
  pendentes: number
  tamanho?: 'normal' | 'baixo' | 'chefe'
  onClick?: () => void
  title?: string
  ariaExpanded?: boolean
  /** Visão "Ícones": as pendências, na ordem dos faróis. Vazio/ausente = placar de números. */
  icones?: { id: string; emoji: string; titulo: string }[]
  onIcone?: (id: string) => void
}

export default function ResumoPendencias({ feitos, pendentes, tamanho = 'normal', onClick, title, ariaExpanded, icones, onIcone }: Props) {
  const classe = `pl-rs ${pendentes > 0 ? 'pend' : 'ok'} ${tamanho}`
  const icone = tamanho === 'chefe' ? 'h-[19px] w-[19px]' : tamanho === 'baixo' ? 'h-3.5 w-3.5' : 'h-4 w-4'
  if (icones && icones.length > 0 && onIcone) {
    return (
      <span className={`${classe} pl-rs-icones`}>
        <button type="button" className="pl-rs-a" title="Ver todas as pendências" aria-expanded={ariaExpanded}
          onClick={e => { e.stopPropagation(); onClick?.() }}>
          <CircleCheck className={icone} />{feitos}
        </button>
        {/* Concluídos ficam no número; só as pendências viram ícone, à direita do reloginho. */}
        <span className="pl-rs-b" aria-hidden><Clock className={icone} /></span>
        {icones.map(i => (
          <button key={i.id} type="button" className="pl-rs-ic" title={i.titulo}
            onClick={e => { e.stopPropagation(); onIcone(i.id) }}>
            {i.emoji}
          </button>
        ))}
      </span>
    )
  }
  const conteudo = (
    <>
      <span className="pl-rs-a"><CircleCheck className={icone} />{feitos}</span>
      {pendentes > 0 && <span className="pl-rs-b"><Clock className={icone} />{pendentes}</span>}
    </>
  )
  const dica = title ?? `${feitos} concluída(s) · ${pendentes} pendente(s)`
  if (!onClick) return <span className={classe} title={dica}>{conteudo}</span>
  return (
    <button type="button" className={classe} title={dica} aria-expanded={ariaExpanded}
      onClick={e => { e.stopPropagation(); onClick() }}>
      {conteudo}
    </button>
  )
}
