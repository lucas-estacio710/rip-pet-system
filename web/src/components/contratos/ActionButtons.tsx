'use client'

import { Star } from 'lucide-react'

type ActionHandlers = {
  onPetGrato?: () => void
  onChegamos?: () => void
  onChegaram?: () => void
  onFinalizadora?: () => void
  onAtivar?: () => void
  onEntrega?: () => void
}

type Props = {
  contrato: {
    status: string
    tutor_telefone?: string | null
    tutor?: { telefone: string | null } | null
  }
  handlers: ActionHandlers
  layout: 'pipeline' | 'detail'
  stopPropagation?: boolean
}

// Visibility table: which buttons appear in which status
const VISIBILITY: Record<string, string[]> = {
  preventivo: ['ativar'],
  ativo: ['petGrato', 'chegamos'],
  pinda: ['petGrato'],
  retorno: ['petGrato', 'chegaram', 'entrega'],
  pendente: ['entrega'],
  finalizado: ['finalizadora'],
}

const BUTTON_CONFIG: Record<string, { emoji: string; bg: string; hover: string; title: string; useStarIcon?: boolean }> = {
  petGrato: { emoji: '', bg: 'bg-black text-amber-400', hover: 'hover:bg-slate-700', title: 'Pet Grato - Mensagem de despedida', useStarIcon: true },
  chegamos: { emoji: '📥', bg: 'bg-green-600 text-white', hover: 'hover:bg-green-700', title: 'Chegamos - pet chegou na unidade' },
  chegaram: { emoji: '📦', bg: 'bg-cyan-600 text-white', hover: 'hover:bg-cyan-700', title: 'Chegaram - cinzas chegaram' },
  finalizadora: { emoji: '⭐', bg: 'bg-emerald-600 text-white', hover: 'hover:bg-emerald-700', title: 'Finalizadora - mensagem de agradecimento' },
  ativar: { emoji: '✝️', bg: 'bg-red-900 text-white', hover: 'hover:bg-red-800', title: 'Ativar contrato preventivo' },
  entrega: { emoji: '📬', bg: 'bg-emerald-600 text-white', hover: 'hover:bg-emerald-700', title: 'Marcar entregue e finalizar' },
}

const HANDLER_MAP: Record<string, keyof ActionHandlers> = {
  petGrato: 'onPetGrato',
  chegamos: 'onChegamos',
  chegaram: 'onChegaram',
  finalizadora: 'onFinalizadora',
  ativar: 'onAtivar',
  entrega: 'onEntrega',
}

export default function ActionButtons({ contrato, handlers, layout, stopPropagation = true }: Props) {
  const visibleButtons = VISIBILITY[contrato.status] || []
  const hasTel = !!(contrato.tutor?.telefone || contrato.tutor_telefone)

  const handleClick = (handler: (() => void) | undefined, e: React.MouseEvent) => {
    if (!handler) return
    if (stopPropagation) {
      e.preventDefault()
      e.stopPropagation()
    }
    handler()
  }

  // Filter: Pet Grato requires phone
  const buttons = visibleButtons.filter(btn => {
    if (btn === 'petGrato' && !hasTel) return false
    return true
  })

  if (buttons.length === 0) return null

  const size = layout === 'detail' ? 'w-7 h-7' : 'w-9 h-9'
  const iconSize = layout === 'detail' ? 'h-4 w-4' : 'h-5 w-5'
  const emojiSize = layout === 'detail' ? 'text-sm' : 'text-base'

  return (
    <>
      {buttons.map(btn => {
        const config = BUTTON_CONFIG[btn]
        const handlerKey = HANDLER_MAP[btn]
        const handler = handlerKey ? handlers[handlerKey] : undefined
        if (!handler) return null

        return (
          <button
            key={btn}
            onClick={(e) => handleClick(handler, e)}
            className={`flex items-center justify-center ${size} ${config.bg} rounded-full ${config.hover} transition-colors`}
            title={config.title}
          >
            {config.useStarIcon
              ? <Star className={`${iconSize} fill-amber-400`} />
              : <span className={emojiSize}>{config.emoji}</span>
            }
          </button>
        )
      })}
    </>
  )
}
