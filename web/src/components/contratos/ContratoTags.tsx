import { ComputedTag, TAG_STATE_STYLES } from '@/lib/contrato-tags'

type Props = {
  tags: ComputedTag[]
  /** 'compact' = 28x28 squares with emoji (desktop), 'expanded' = pills with emoji + label (mobile) */
  mode?: 'compact' | 'expanded'
}

export default function ContratoTags({ tags, mode = 'compact' }: Props) {
  if (tags.length === 0) return null

  if (mode === 'expanded') {
    return (
      <div className="flex flex-wrap gap-1.5">
        {tags.map(tag => {
          const s = TAG_STATE_STYLES[tag.state]
          return (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
              style={{ backgroundColor: s.bg, color: s.color, borderWidth: 1, borderStyle: 'solid', borderColor: s.borderColor }}
              title={tag.tooltip}
            >
              <span>{tag.emoji}</span>
              <span>{tag.label}</span>
              {tag.sublabel && (
                <span className="font-bold">{tag.sublabel}</span>
              )}
            </span>
          )
        })}
      </div>
    )
  }

  // Compact mode (default) — small squares
  return (
    <div className="flex gap-0.5 flex-shrink-0">
      {tags.map(tag => {
        const s = TAG_STATE_STYLES[tag.state]
        return (
          <div
            key={tag.id}
            className="w-6 h-6 rounded flex flex-col items-center justify-center text-xs leading-none"
            style={{ backgroundColor: s.bg, color: s.color, borderWidth: 1, borderStyle: 'solid', borderColor: s.borderColor }}
            title={tag.tooltip}
          >
            <span className={tag.sublabel ? 'text-[8px]' : 'text-xs'}>{tag.emoji}</span>
            {tag.sublabel && (
              <span className="text-[9px] font-bold leading-none">{tag.sublabel}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
