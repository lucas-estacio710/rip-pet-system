'use client'

import { useMediaQuery } from '@/hooks/useMediaQuery'

type StatusConfig = {
  key: string
  label: string
  icon: string
}

type StatusColors = {
  bg: string
  border: string
  text: string
  activeBg: string
  activeGlow: string
}

type Props = {
  statusFlow: StatusConfig[]
  statusColors: Record<string, StatusColors>
  statusCounts: Record<string, number>
  activeStatus: string | null
  onToggle: (status: string) => void
  /** Extra content below the bar (e.g. filter indicator, montagem toggle) */
  children?: React.ReactNode
}

export default function PipelineBar({
  statusFlow,
  statusColors,
  statusCounts,
  activeStatus,
  onToggle,
  children,
}: Props) {
  const bp = useMediaQuery()
  const isMobile = bp === 'mobile'

  if (isMobile) {
    // Mobile: horizontal scrollable pills
    return (
      <div className="mb-4">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4">
          {statusFlow.map(status => {
            const isActive = activeStatus === status.key
            const count = statusCounts[status.key] || 0
            const colors = statusColors[status.key]

            return (
              <button
                key={status.key}
                onClick={() => onToggle(status.key)}
                className={`
                  flex items-center gap-2 px-4 py-2.5 rounded-full whitespace-nowrap text-sm font-semibold
                  transition-all duration-200 flex-shrink-0
                  ${isActive
                    ? `${colors.activeBg} text-white shadow-lg`
                    : 'bg-[var(--surface-0)] border border-[var(--surface-200)] text-[var(--surface-600)]'
                  }
                `}
              >
                <span className="text-base">{status.icon}</span>
                <span>{status.label}</span>
                <span className={`text-mono font-bold ${isActive ? 'text-white/90' : 'text-[var(--surface-400)]'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
        {children}
      </div>
    )
  }

  // Desktop/Tablet: horizontal strip with connected segments
  return (
    <div className="card bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-slate-700/50 p-4 mb-6 overflow-visible">
      <div className="flex items-stretch overflow-visible gap-1">
        {statusFlow.map((status, index) => {
          const isActive = activeStatus === status.key
          const count = statusCounts[status.key] || 0
          const colors = statusColors[status.key]
          const isFirst = index === 0
          const isLast = index === statusFlow.length - 1

          return (
            <button
              key={status.key}
              onClick={() => onToggle(status.key)}
              className={`
                flex flex-col items-center px-4 py-3 transition-all duration-300 min-w-[100px] flex-1 border
                ${isFirst ? 'rounded-l-xl' : ''}
                ${isLast ? 'rounded-r-xl' : ''}
                ${isActive
                  ? `${colors.activeBg} ${colors.activeGlow} z-10 relative scale-110 -my-1 rounded-xl border-white/30 backdrop-blur-sm`
                  : `${colors.bg} hover:brightness-125 hover:scale-[1.02] ${colors.border} backdrop-blur-sm`
                }
              `}
            >
              <span className="text-2xl mb-1 drop-shadow-lg">{status.icon}</span>
              <span className="font-semibold text-sm tracking-wide text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
                {status.label}
              </span>
              <span className="text-xl font-black tabular-nums text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] text-mono">
                {count}
              </span>
            </button>
          )
        })}
      </div>
      {children}
    </div>
  )
}
