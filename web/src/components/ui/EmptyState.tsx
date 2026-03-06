import { type LucideIcon } from 'lucide-react'
import { SearchX } from 'lucide-react'

type Props = {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

export default function EmptyState({ icon: Icon = SearchX, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 animate-fade-in">
      <div className="w-16 h-16 rounded-full bg-[var(--surface-100)] flex items-center justify-center mb-4">
        <Icon className="h-7 w-7 text-[var(--surface-400)]" />
      </div>
      <h3 className="text-subtitle text-[var(--surface-700)] mb-1">{title}</h3>
      {description && (
        <p className="text-small text-[var(--surface-400)] text-center max-w-sm">{description}</p>
      )}
      {action && (
        <div className="mt-4">{action}</div>
      )}
    </div>
  )
}
