'use client'

/**
 * Placar de pendências ✓N ⏱M do pipeline redesenhado — UMA peça pros 4 lugares (card do celular,
 * linha do tutor na Entrega/Pendente, chefão do card da viagem, Em Acolhimento no desktop).
 * Item 1 dos ajustes finos (09/10/2026): desenho da bancada, estilo C · vidro —
 *  - com pendência: caixinha âmbar, mas o ✓ N continua VERDE (dá pra ler de relance o que já foi
 *    feito) e só o ⏱ N é âmbar;
 *  - sem pendência: tudo verde e o ⏱ some;
 *  - ícones de traço (Lucide CircleCheck / Clock), não os caracteres ✓/⏱.
 */
import { CircleCheck, Clock } from 'lucide-react'

type Props = {
  feitos: number
  pendentes: number
  tamanho?: 'normal' | 'baixo' | 'chefe'
  onClick?: () => void
  title?: string
  ariaExpanded?: boolean
}

export default function ResumoPendencias({ feitos, pendentes, tamanho = 'normal', onClick, title, ariaExpanded }: Props) {
  const classe = `pl-rs ${pendentes > 0 ? 'pend' : 'ok'} ${tamanho}`
  const icone = tamanho === 'chefe' ? 'h-[19px] w-[19px]' : tamanho === 'baixo' ? 'h-3.5 w-3.5' : 'h-4 w-4'
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
