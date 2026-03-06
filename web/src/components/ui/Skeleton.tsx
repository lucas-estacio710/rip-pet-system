type Props = {
  className?: string
}

/** Rectangle skeleton with shimmer animation */
export function Skeleton({ className = '' }: Props) {
  return (
    <div className={`animate-shimmer rounded-[var(--radius-md)] ${className}`} />
  )
}

/** Circle skeleton */
export function SkeletonCircle({ className = 'w-10 h-10' }: Props) {
  return (
    <div className={`animate-shimmer rounded-full ${className}`} />
  )
}

/** Text line skeleton */
export function SkeletonText({ className = 'h-4 w-3/4' }: Props) {
  return (
    <div className={`animate-shimmer rounded ${className}`} />
  )
}

/** Card-shaped skeleton */
export function SkeletonCard({ className = '' }: Props) {
  return (
    <div className={`card p-4 space-y-3 ${className}`}>
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  )
}

/** Table row skeleton */
export function SkeletonTableRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="border-b border-[var(--surface-100)]">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className={`h-4 ${i === 0 ? 'w-32' : 'w-20'}`} />
        </td>
      ))}
    </tr>
  )
}
