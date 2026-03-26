'use client'

import { useState, useRef, useEffect } from 'react'
import { useUnit } from '@/contexts/UnitContext'
import { Building2, ChevronDown, Check, Shield, Crown, User } from 'lucide-react'

const ROLE_ICONS = {
  super_admin: Crown,
  gerente: Shield,
  operador: User,
}

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  gerente: 'Gerente',
  operador: 'Operador',
}

export function UnitSelector() {
  const { currentUnit, currentRole, allUnidades, userPerfis, isSuperAdmin, switchUnit } = useUnit()
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!currentUnit) return null

  // Unidades que o usuário pode ver
  const units = isSuperAdmin ? allUnidades : allUnidades

  // Uma só unidade = mostra nome fixo, sem dropdown
  if (units.length <= 1 && !isSuperAdmin) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Building2 className="h-4 w-4 text-purple-400" />
        <span className="text-sm font-semibold text-[var(--shell-text)]">{currentUnit.nome}</span>
        {currentRole && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300">
            {ROLE_LABELS[currentRole]}
          </span>
        )}
      </div>
    )
  }

  const RoleIcon = currentRole ? ROLE_ICONS[currentRole] : User

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--surface-100)] transition-colors"
      >
        <Building2 className="h-4 w-4 text-purple-400" />
        <span className="text-sm font-semibold text-[var(--shell-text)]">{currentUnit.nome}</span>
        {currentUnit.is_matriz && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">MATRIZ</span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-[var(--shell-text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-[var(--surface-bg)] border border-[var(--surface-200)] rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="px-3 py-2 border-b border-[var(--surface-200)]">
            <div className="flex items-center gap-1.5">
              <RoleIcon className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-xs font-semibold text-purple-400">
                {currentRole ? ROLE_LABELS[currentRole] : ''}
              </span>
            </div>
          </div>

          {/* Lista de unidades */}
          <div className="max-h-80 overflow-y-auto py-1">
            {units.map(unit => {
              const isActive = unit.id === currentUnit.id
              const perfil = userPerfis.find(p => p.unidade.id === unit.id)
              const role = perfil?.role || (isSuperAdmin ? 'super_admin' : null)

              return (
                <button
                  key={unit.id}
                  onClick={() => {
                    switchUnit(unit.id)
                    setIsOpen(false)
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    isActive
                      ? 'bg-purple-500/10'
                      : 'hover:bg-[var(--surface-50)]'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isActive ? 'text-purple-400' : 'text-[var(--surface-700)]'}`}>
                        {unit.nome}
                      </span>
                      {unit.is_matriz && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">MATRIZ</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-[var(--surface-400)] font-mono">{unit.codigo}</span>
                      {unit.cidade && (
                        <span className="text-[10px] text-[var(--surface-400)]">{unit.cidade}/{unit.estado}</span>
                      )}
                    </div>
                  </div>

                  {isActive && <Check className="h-4 w-4 text-purple-400 shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
