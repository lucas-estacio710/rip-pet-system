'use client'

// Tratamento de Erros — hub super_admin de tratativas pra desfazer / corrigir
// operacoes humanas erradas. Sidebar lateral com a lista de tipos; conteudo
// muda conforme tipo selecionado. Por enquanto: "Desfazer ficha processada".
import { useState } from 'react'
import { Wrench, Shield, RotateCcw, ArrowLeftRight } from 'lucide-react'
import { useUnit } from '@/contexts/UnitContext'
import EmptyState from '@/components/ui/EmptyState'
import DesfazerFichaPanel from '@/components/admin/tratamento-erros/DesfazerFichaPanel'
import MoverFichaPanel from '@/components/admin/tratamento-erros/MoverFichaPanel'

type Tratativa = {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
}

const TRATATIVAS: Tratativa[] = [
  { id: 'desfazer-ficha', label: 'Desfazer ficha processada', icon: RotateCcw, iconColor: 'text-amber-400' },
  { id: 'mover-ficha', label: 'Mover ficha de unidade', icon: ArrowLeftRight, iconColor: 'text-blue-400' },
]

export default function TratamentoErrosPage() {
  const { isSuperAdmin } = useUnit()
  const [selected, setSelected] = useState<string>(TRATATIVAS[0].id)

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in">
        <EmptyState icon={Shield} title="Acesso restrito" description="Somente administradores podem acessar esta página." />
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-amber-900/30 items-center justify-center">
          <Wrench className="h-5 w-5 text-amber-500" />
        </div>
        <h1 className="text-title text-[var(--shell-text)]">Tratamento de Erros</h1>
      </div>

      {/* Layout: sidebar + content */}
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
        {/* Sidebar */}
        <aside className="space-y-1">
          {TRATATIVAS.map(t => {
            const Icon = t.icon
            const active = selected === t.id
            return (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-sm text-left transition-colors ${
                  active
                    ? 'bg-[var(--surface-100)] text-[var(--shell-text)] border border-[var(--surface-200)]'
                    : 'text-[var(--shell-text-muted)] hover:bg-[var(--surface-100)]/50 hover:text-[var(--shell-text)] border border-transparent'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? t.iconColor : ''}`} />
                <span className="truncate">{t.label}</span>
              </button>
            )
          })}
        </aside>

        {/* Content */}
        <section className="min-w-0">
          {selected === 'desfazer-ficha' && <DesfazerFichaPanel />}
          {selected === 'mover-ficha' && <MoverFichaPanel />}
        </section>
      </div>
    </div>
  )
}
