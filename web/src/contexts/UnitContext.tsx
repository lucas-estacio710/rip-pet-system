'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

// ============================================
// Types
// ============================================
export type Unidade = {
  id: string
  codigo: string
  nome: string
  slug: string
  whatsapp: string | null
  email: string | null
  telefone: string | null
  cidade: string | null
  estado: string | null
  is_matriz: boolean
  modulos_ativos: string[]
  ativa: boolean
}

export type UserRole = 'super_admin' | 'gerente' | 'operador'

export type UserPerfil = {
  perfil_id: string
  unidade: Unidade
  role: UserRole
  is_default: boolean
  nome: string | null
}

type UnitContextType = {
  // Estado
  currentUnit: Unidade | null
  currentRole: UserRole | null
  userPerfis: UserPerfil[]
  allUnidades: Unidade[]
  isLoading: boolean
  isSuperAdmin: boolean
  userName: string | null
  userEmail: string | null

  // Ações
  switchUnit: (unitId: string) => void
  hasModule: (module: string) => boolean
  refetch: () => Promise<void>
}

const UnitContext = createContext<UnitContextType | null>(null)

// ============================================
// Provider
// ============================================
export function UnitProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()

  const [currentUnit, setCurrentUnit] = useState<Unidade | null>(null)
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null)
  const [userPerfis, setUserPerfis] = useState<UserPerfil[]>([])
  const [allUnidades, setAllUnidades] = useState<Unidade[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userName, setUserName] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  const isSuperAdmin = userPerfis.some(p => p.role === 'super_admin')

  const fetchData = useCallback(async () => {
    setIsLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setIsLoading(false)
      return
    }

    setUserEmail(user.email ?? null)

    // Buscar perfis do usuário com unidades
    const { data: perfisData } = await supabase
      .from('perfis')
      .select('id, unidade_id, role, is_default, nome, ativo, unidades(*)')
      .eq('user_id', user.id)
      .eq('ativo', true)

    if (!perfisData || perfisData.length === 0) {
      setIsLoading(false)
      return
    }

    const perfis: UserPerfil[] = perfisData.map((p: any) => ({
      perfil_id: p.id,
      unidade: p.unidades as Unidade,
      role: p.role as UserRole,
      is_default: p.is_default,
      nome: p.nome,
    }))

    setUserPerfis(perfis)
    setUserName(perfis[0]?.nome ?? null)

    const isSA = perfis.some(p => p.role === 'super_admin')

    // Super admin vê todas as unidades
    if (isSA) {
      const { data: unidades } = await supabase
        .from('unidades')
        .select('*')
        .eq('ativa', true)
        .order('nome')

      setAllUnidades((unidades || []) as Unidade[])
    } else {
      setAllUnidades(perfis.map(p => p.unidade).filter(u => u.ativa))
    }

    // Selecionar unidade ativa
    const stored = typeof window !== 'undefined' ? localStorage.getItem('rp_current_unit') : null
    let selected: UserPerfil | undefined

    if (stored) {
      selected = perfis.find(p => p.unidade.id === stored)
    }
    // Se super admin e tinha unidade salva em allUnidades
    if (!selected && stored && isSA) {
      const { data: storedUnit } = await supabase
        .from('unidades')
        .select('*')
        .eq('id', stored)
        .single()
      if (storedUnit) {
        setCurrentUnit(storedUnit as Unidade)
        setCurrentRole('super_admin')
        setIsLoading(false)
        return
      }
    }

    if (!selected) {
      selected = perfis.find(p => p.is_default) || perfis[0]
    }

    if (selected) {
      setCurrentUnit(selected.unidade)
      setCurrentRole(selected.role)
      if (typeof window !== 'undefined') {
        localStorage.setItem('rp_current_unit', selected.unidade.id)
      }
    }

    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const switchUnit = useCallback((unitId: string) => {
    const perfil = userPerfis.find(p => p.unidade.id === unitId)
    if (perfil) {
      setCurrentUnit(perfil.unidade)
      setCurrentRole(perfil.role)
    } else if (isSuperAdmin) {
      // Super admin pode navegar pra qualquer unidade
      const unit = allUnidades.find(u => u.id === unitId)
      if (unit) {
        setCurrentUnit(unit)
        setCurrentRole('super_admin')
      }
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('rp_current_unit', unitId)
    }
  }, [userPerfis, allUnidades, isSuperAdmin])

  const hasModule = useCallback((module: string): boolean => {
    if (!currentUnit) return false
    if (isSuperAdmin) return true // super admin vê tudo
    return currentUnit.modulos_ativos?.includes(module) ?? false
  }, [currentUnit, isSuperAdmin])

  return (
    <UnitContext.Provider value={{
      currentUnit,
      currentRole,
      userPerfis,
      allUnidades,
      isLoading,
      isSuperAdmin,
      userName,
      userEmail,
      switchUnit,
      hasModule,
      refetch: fetchData,
    }}>
      {children}
    </UnitContext.Provider>
  )
}

// ============================================
// Hook
// ============================================
export function useUnit() {
  const context = useContext(UnitContext)
  if (!context) throw new Error('useUnit must be used within UnitProvider')
  return context
}
