'use client'

import { useState } from 'react'
import { computeAllTags, TAG_STATE_STYLES, type ContratoTagData, type ComputedTag, type TagStyle } from '@/lib/contrato-tags'
import { useFieldPermission } from '@/hooks/useFieldPermission'
import ResumoPendencias from '@/components/contratos/pipeline/ResumoPendencias'

type TagHandlers = Partial<Record<string, () => void>>

type Props = {
  contrato: ContratoTagData & { status: string }
  handlers: TagHandlers
  layout: 'pipeline-desktop-green' | 'pipeline-desktop-pending' | 'pipeline-mobile' | 'pipeline-mobile-split' | 'pipeline-mobile-green' | 'pipeline-mobile-pending' | 'detail' | 'detail-novo'
  stopPropagation?: boolean
}

// Personalizado em andamento era âmbar (override próprio daqui); desde 02/10/2026 (D9) segue a
// tabela como todo farol: Em andamento = AZUL ("já está com alguém").
function getStyle(tag: ComputedTag): TagStyle {
  return TAG_STATE_STYLES[tag.state]
}

function toInline(s: TagStyle): React.CSSProperties {
  return { backgroundColor: s.bg, color: s.color, borderColor: s.borderColor }
}

function isNoClick(tag: ComputedTag, status: string) {
  const isGreen = tag.state === 'completed' || tag.state === 'rejected' || tag.state === 'sistema'
  if (!isGreen) return false
  return (tag.id === 'protocolo' && status === 'finalizado') || tag.id === 'foto' || tag.id === 'pagamento'
}

export default function InteractiveTags({ contrato, handlers, layout, stopPropagation = true }: Props) {
  const { isVisible } = useFieldPermission()
  const showFarois = isVisible('tela_pipeline', 'btn_farois')
  // Protocolo saiu daqui — agora é botão dedicado no espaço do checkbox de seleção
  const allTags = showFarois ? computeAllTags(contrato).filter(t => t.id !== 'protocolo') : []
  // detail-novo: os concluídos ficam escondidos até tocar no placar (estado local, não persiste)
  const [concluidosAbertos, setConcluidosAbertos] = useState(false)

  const handleClick = (handler: (() => void) | undefined, e: React.MouseEvent) => {
    if (!handler) return
    if (stopPropagation) {
      e.preventDefault()
      e.stopPropagation()
    }
    handler()
  }

  // Desktop left-side tags (completed/rejected/in_progress) - fixed-size box, tags centered
  if (layout === 'pipeline-desktop-green') {
    // in_progress agora vai pra direita junto com pending (precisa de ação)
    const LEFT_STATES = new Set(['completed', 'rejected', 'sistema'])
    const greenTags = allTags.filter(t => LEFT_STATES.has(t.state))

    return (
      <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 90, height: 58 }}>
        <div className="flex flex-wrap items-center justify-center content-center gap-0.5" style={{ maxWidth: greenTags.length === 4 ? 58 : 90 }}>
        {greenTags.map(tag => {
          const s = getStyle(tag)
          const noClick = isNoClick(tag, contrato.status)
          const handler = noClick ? undefined : handlers[tag.id]
          return (
            <div
              key={`${tag.id}-green`}
              onClick={handler ? (e) => handleClick(handler, e) : undefined}
              className={`w-7 h-7 rounded-md flex flex-col items-center justify-center ${handler ? 'cursor-pointer hover:opacity-80' : ''} transition-opacity leading-none`}
              style={{ ...toInline(s), borderWidth: 1, borderStyle: 'solid' }}
              title={tag.tooltip}
            >
              <span className={tag.sublabel ? 'text-xs' : 'text-base'}>{tag.emoji}</span>
              {tag.sublabel && <span className="text-[7px] font-bold">{tag.sublabel}</span>}
            </div>
          )
        })}
        </div>
      </div>
    )
  }

  // Desktop pending tags (non-green) - inline
  if (layout === 'pipeline-desktop-pending') {
    // in_progress agora vai pra direita junto com pending (precisa de ação)
    const LEFT_STATES = new Set(['completed', 'rejected', 'sistema'])
    const pendingTags = allTags.filter(t => !LEFT_STATES.has(t.state))
    if (pendingTags.length === 0) return null

    return (
      <>
        {pendingTags.map(tag => {
          const s = getStyle(tag)
          const handler = handlers[tag.id]
          return (
            <div
              key={`${tag.id}-pending`}
              onClick={handler ? (e) => handleClick(handler, e) : undefined}
              className="flex-shrink-0 w-9 h-9 lg:w-10 lg:h-10 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
              style={{ ...toInline(s), borderWidth: 2, borderStyle: 'solid' }}
              title={tag.tooltip}
            >
              <span className="text-xl">{tag.emoji}</span>
              {tag.sublabel && <span className="text-[9px] font-bold leading-none">{tag.sublabel}</span>}
            </div>
          )
        })}
      </>
    )
  }

  // Mobile: all tags combined
  if (layout === 'pipeline-mobile') {
    return (
      <div className="flex flex-wrap gap-1.5">
        {allTags.map(tag => {
          const isGreen = tag.state === 'completed' || tag.state === 'rejected' || tag.state === 'sistema'
          const s = getStyle(tag)
          const noClick = isNoClick(tag, contrato.status)
          const handler = noClick ? undefined : handlers[tag.id]
          return (
            <div
              key={`${tag.id}-mobile`}
              onClick={handler ? (e) => handleClick(handler, e) : undefined}
              className={`${isGreen ? 'w-7 h-7 rounded-md' : 'w-8 h-8 rounded-lg'} flex flex-col items-center justify-center ${handler ? 'cursor-pointer hover:opacity-80' : ''} transition-opacity leading-none`}
              style={{ ...toInline(s), borderWidth: isGreen ? 1 : 2, borderStyle: 'solid' }}
              title={tag.tooltip}
            >
              <span className={isGreen ? (tag.sublabel ? 'text-xs' : 'text-base') : 'text-lg'}>{tag.emoji}</span>
              {tag.sublabel && <span className={`font-bold leading-none ${isGreen ? 'text-[7px]' : 'text-[9px]'}`}>{tag.sublabel}</span>}
            </div>
          )
        })}
      </div>
    )
  }

  // Mobile split: green/in_progress | separator | pending
  if (layout === 'pipeline-mobile-split') {
    // in_progress agora vai pra direita junto com pending (precisa de ação)
    const LEFT_STATES = new Set(['completed', 'rejected', 'sistema'])
    const leftTags = allTags.filter(t => LEFT_STATES.has(t.state))
    const rightTags = allTags.filter(t => !LEFT_STATES.has(t.state))

    const renderTag = (tag: ComputedTag, side: 'left' | 'right') => {
      const isLeft = side === 'left'
      const s = getStyle(tag)
      const noClick = isNoClick(tag, contrato.status)
      const handler = noClick ? undefined : handlers[tag.id]
      return (
        <div
          key={`${tag.id}-msplit`}
          onClick={handler ? (e) => handleClick(handler, e) : undefined}
          className={`${isLeft ? 'w-7 h-7 rounded-md' : 'w-8 h-8 rounded-lg'} flex flex-col items-center justify-center ${handler ? 'cursor-pointer hover:opacity-80' : ''} transition-opacity leading-none`}
          style={{ ...toInline(s), borderWidth: isLeft ? 1 : 2, borderStyle: 'solid' }}
          title={tag.tooltip}
        >
          <span className={isLeft ? (tag.sublabel ? 'text-xs' : 'text-base') : 'text-lg'}>{tag.emoji}</span>
          {tag.sublabel && <span className={`font-bold leading-none ${isLeft ? 'text-[7px]' : 'text-[9px]'}`}>{tag.sublabel}</span>}
        </div>
      )
    }

    return (
      <div className="flex items-center gap-1.5">
        {leftTags.length > 0 && (
          <div className="flex items-center gap-1">
            {leftTags.map(t => renderTag(t, 'left'))}
          </div>
        )}
        {leftTags.length > 0 && rightTags.length > 0 && (
          <div className="w-px h-6 bg-slate-500/50 mx-0.5" />
        )}
        {rightTags.length > 0 && (
          <div className="flex items-center gap-1">
            {rightTags.map(t => renderTag(t, 'right'))}
          </div>
        )}
      </div>
    )
  }

  // Mobile: only green/completed tags (centered row, large)
  if (layout === 'pipeline-mobile-green') {
    // in_progress agora vai pra direita junto com pending (precisa de ação)
    const LEFT_STATES = new Set(['completed', 'rejected', 'sistema'])
    const greenTags = allTags.filter(t => LEFT_STATES.has(t.state))
    if (greenTags.length === 0) return null

    return (
      <div className="flex items-center justify-center gap-1.5">
        {greenTags.map(tag => {
          const s = getStyle(tag)
          const noClick = isNoClick(tag, contrato.status)
          const handler = noClick ? undefined : handlers[tag.id]
          return (
            <div
              key={`${tag.id}-mgreen`}
              onClick={handler ? (e) => handleClick(handler, e) : undefined}
              className={`rounded-lg flex flex-col items-center justify-center ${handler ? 'cursor-pointer hover:opacity-80' : ''} transition-opacity leading-none`}
              style={{ ...toInline(s), borderWidth: 2, borderStyle: 'solid', width: 42, height: 42 }}
              title={tag.tooltip}
            >
              <span className={tag.sublabel ? 'text-base' : 'text-xl'}>{tag.emoji}</span>
              {tag.sublabel && <span className="text-[10px] font-bold">{tag.sublabel}</span>}
            </div>
          )
        })}
      </div>
    )
  }

  // Mobile: only pending tags (inline, +30% size)
  if (layout === 'pipeline-mobile-pending') {
    // in_progress agora vai pra direita junto com pending (precisa de ação)
    const LEFT_STATES = new Set(['completed', 'rejected', 'sistema'])
    const pendingTags = allTags.filter(t => !LEFT_STATES.has(t.state))
    if (pendingTags.length === 0) return null

    return (
      <div className="flex items-center gap-1.5">
        {pendingTags.map(tag => {
          const s = getStyle(tag)
          const handler = handlers[tag.id]
          return (
            <div
              key={`${tag.id}-mpending`}
              onClick={handler ? (e) => handleClick(handler, e) : undefined}
              className="flex-shrink-0 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
              style={{ ...toInline(s), borderWidth: 2, borderStyle: 'solid', width: 42, height: 42 }}
              title={tag.tooltip}
            >
              <span className="text-xl">{tag.emoji}</span>
              {tag.sublabel && <span className="text-[11px] font-bold leading-none">{tag.sublabel}</span>}
            </div>
          )
        })}
      </div>
    )
  }

  // Detalhe no padrão novo (docs/PLAYBOOK_CONTRATO_ID.md, item 3): placar ✓N ⏱M do pipeline + só as
  // pendentes. Tocar no placar abre os concluídos ANTES das pendentes, separados por uma barrinha.
  if (layout === 'detail-novo') {
    if (allTags.length === 0) return null
    const LEFT_STATES = new Set(['completed', 'rejected', 'sistema'])
    const feitos = allTags.filter(t => LEFT_STATES.has(t.state))
    const pendentes = allTags.filter(t => !LEFT_STATES.has(t.state))
    const pill = (tag: ComputedTag) => {
      const s = getStyle(tag)
      const handler = isNoClick(tag, contrato.status) ? undefined : handlers[tag.id]
      return (
        <button
          key={`${tag.id}-dn`}
          type="button"
          onClick={handler ? (e) => handleClick(handler, e) : undefined}
          className={`px-2 py-1 rounded-lg text-sm ${handler ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} transition-opacity`}
          style={{ backgroundColor: s.bg, color: s.color }}
          title={tag.tooltip}
        >
          {tag.emoji} {tag.sublabel || (tag.state === 'completed' ? '✅' : tag.state === 'rejected' ? '❌' : '❓')}
        </button>
      )
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        <ResumoPendencias
          feitos={feitos.length}
          pendentes={pendentes.length}
          ariaExpanded={concluidosAbertos}
          title={concluidosAbertos ? 'Esconder os concluídos' : 'Ver os concluídos'}
          onClick={() => setConcluidosAbertos(v => !v)}
        />
        {concluidosAbertos && feitos.length > 0 && (
          <>
            {feitos.map(tag => {
              const s = getStyle(tag)
              const handler = isNoClick(tag, contrato.status) ? undefined : handlers[tag.id]
              return (
                <button
                  key={`${tag.id}-feito`}
                  type="button"
                  onClick={handler ? (e) => handleClick(handler, e) : undefined}
                  className={`w-8 h-8 rounded-lg text-base flex items-center justify-center ${handler ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                  style={{ backgroundColor: s.bg }}
                  title={tag.tooltip}
                >
                  {tag.emoji}
                </button>
              )
            })}
            {pendentes.length > 0 && <span className="w-px h-5 bg-slate-600 mx-1" aria-hidden />}
          </>
        )}
        {pendentes.map(pill)}
      </div>
    )
  }

  // Detail page: pills with labels
  if (layout === 'detail') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {allTags.map(tag => {
          const s = getStyle(tag)
          const noClick = isNoClick(tag, contrato.status)
          const handler = noClick ? undefined : handlers[tag.id]
          return (
            <button
              key={`${tag.id}-detail`}
              onClick={handler ? (e) => handleClick(handler, e) : undefined}
              className={`px-2 py-1 rounded-lg text-sm ${handler ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} transition-opacity`}
              style={{ backgroundColor: s.bg, color: s.color }}
              title={tag.tooltip}
            >
              {tag.emoji} {tag.sublabel || (tag.state === 'completed' ? '✅' : tag.state === 'rejected' ? '❌' : '❓')}
            </button>
          )
        })}
      </div>
    )
  }

  return null
}
