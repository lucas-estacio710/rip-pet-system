'use client'

import { ReactNode } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

type Props = {
  label: string
  value: string
  trend?: number | null
  trendLabel?: string
  icon?: ReactNode
  color?: string
  onClick?: () => void
}

export default function MiniKPI({ label, value, trend, trendLabel, icon, color = 'var(--brand-500)', onClick }: Props) {
  const trendColor = trend && trend > 0 ? 'text-green-400' : trend && trend < 0 ? 'text-red-400' : 'text-[var(--surface-400)]'
  const TrendIcon = trend && trend > 0 ? TrendingUp : trend && trend < 0 ? TrendingDown : Minus

  return (
    <div
      className={`card p-4 ${onClick ? 'card-hover cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-caption text-[var(--surface-400)] mb-1">{label}</p>
          <p className="text-xl md:text-2xl font-bold text-mono text-[var(--surface-800)] truncate">{value}</p>
          {trend !== undefined && trend !== null && (
            <div className={`flex items-center gap-1 mt-1 ${trendColor}`}>
              <TrendIcon className="h-3 w-3" />
              <span className="text-xs font-medium">{Math.abs(trend)}%</span>
              {trendLabel && <span className="text-xs text-[var(--surface-400)]">{trendLabel}</span>}
            </div>
          )}
        </div>
        {icon && (
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `color-mix(in srgb, ${color} 20%, transparent)` }}>
            <div style={{ color }}>{icon}</div>
          </div>
        )}
      </div>
    </div>
  )
}
