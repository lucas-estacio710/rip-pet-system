type Variant =
  | 'default'
  | 'success'
  | 'error'
  | 'warning'
  | 'info'
  | 'purple'
  | 'preventivo'
  | 'ativo'
  | 'pinda'
  | 'retorno'
  | 'pendente'
  | 'finalizado'

const VARIANT_STYLES: Record<Variant, string> = {
  default: 'bg-[var(--surface-100)] text-[var(--surface-600)] border-[var(--surface-200)]',
  success: 'bg-green-900/30 text-green-400 border-green-700',
  error: 'bg-red-900/30 text-red-400 border-red-700',
  warning: 'bg-amber-900/30 text-amber-400 border-amber-700',
  info: 'bg-blue-900/30 text-blue-400 border-blue-700',
  purple: 'bg-purple-900/30 text-purple-400 border-purple-700',
  preventivo: 'bg-amber-900/30 text-amber-400 border-amber-700',
  ativo: 'bg-red-900/30 text-red-400 border-red-700',
  pinda: 'bg-orange-900/30 text-orange-400 border-orange-700',
  retorno: 'bg-cyan-900/30 text-cyan-400 border-cyan-700',
  pendente: 'bg-purple-900/30 text-purple-400 border-purple-700',
  finalizado: 'bg-[var(--surface-100)] text-[var(--surface-500)] border-[var(--surface-200)]',
}

type Props = {
  variant?: Variant
  children: React.ReactNode
  className?: string
  dot?: boolean
}

export default function Badge({ variant = 'default', children, className = '', dot = false }: Props) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold
        rounded-full border whitespace-nowrap
        ${VARIANT_STYLES[variant]}
        ${className}
      `}
    >
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      )}
      {children}
    </span>
  )
}
