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
  endereco: string | null
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

  // Impersonação
  impersonating: boolean
  impersonatedEmail: string | null
  startImpersonating: (userId: string, email: string, rpcPerfis?: { perfil_id: string; unidade_id?: string; unidade_nome: string; unidade_codigo: string; role: string; is_default: boolean; nome: string | null; ativo?: boolean }[]) => Promise<void>
  stopImpersonating: () => void

  // Ações
  switchUnit: (unitId: string) => void
  hasModule: (module: string) => boolean
  refetch: () => Promise<void>

  // FLS
  flsPermissions: Map<string, string>  // campo → permissao ('read'|'hidden'), default 'edit' se ausente
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
  const [impersonating, setImpersonating] = useState(false)
  const [impersonatedEmail, setImpersonatedEmail] = useState<string | null>(null)
  const [realUserData, setRealUserData] = useState<{ perfis: UserPerfil[]; allUnidades: Unidade[]; userName: string | null; userEmail: string | null } | null>(null)
  // FLS: cache de permissões (field_permissions) — Map<campo, permissao> para unidade+role atual
  const [flsPermissions, setFlsPermissions] = useState<Map<string, string>>(new Map())

  const isSuperAdmin = userPerfis.some(p => p.role === 'super_admin')

  const fetchData = useCallback(async () => {
    setIsLoading(true)

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log('[UnitContext] Auth user:', user?.id, user?.email, 'error:', authError)
    if (!user) {
      console.warn('[UnitContext] Sem usuário autenticado')
      setIsLoading(false)
      return
    }

    setUserEmail(user.email ?? null)

    // Buscar perfis do usuário
    const { data: perfisData, error: perfisError } = await supabase
      .from('perfis')
      .select('id, unidade_id, role, is_default, nome, ativo')
      .eq('user_id', user.id)
      .eq('ativo', true)

    console.log('[UnitContext] Perfis query result:', { data: perfisData, error: perfisError, count: perfisData?.length })

    if (perfisError) {
      console.error('[UnitContext] Erro ao carregar perfis:', perfisError)
      setIsLoading(false)
      return
    }

    if (!perfisData || perfisData.length === 0) {
      console.warn('[UnitContext] Nenhum perfil encontrado para user_id:', user.id)
      setIsLoading(false)
      return
    }

    // Buscar todas as unidades (separado pra evitar problemas de join)
    const { data: unidadesData, error: unidadesError } = await supabase
      .from('unidades')
      .select('*')
      .order('ordem')
      .order('nome')

    if (unidadesError) {
      console.error('Erro ao carregar unidades:', unidadesError)
      setIsLoading(false)
      return
    }

    console.log('[UnitContext] Unidades query result:', { data: unidadesData, error: unidadesError, count: unidadesData?.length })

    const unidadesMap = new Map((unidadesData || []).map((u: any) => [u.id, u]))
    console.log('[UnitContext] UnidadesMap keys:', Array.from(unidadesMap.keys()))
    console.log('[UnitContext] Perfis unidade_ids:', perfisData.map((p: any) => p.unidade_id))

    const perfis: UserPerfil[] = perfisData
      .map((p: any) => {
        const unidade = unidadesMap.get(p.unidade_id)
        if (!unidade) {
          console.warn('[UnitContext] Unidade não encontrada no map para:', p.unidade_id)
          return null
        }
        return {
          perfil_id: p.id,
          unidade: {
            ...unidade,
            ativa: unidade.ativa ?? unidade.ativo ?? true,
            modulos_ativos: unidade.modulos_ativos || [],
          } as Unidade,
          role: p.role as UserRole,
          is_default: p.is_default,
          nome: p.nome,
        }
      })
      .filter(Boolean) as UserPerfil[]

    setUserPerfis(perfis)
    setUserName(perfis[0]?.nome ?? null)

    const isSA = perfis.some(p => p.role === 'super_admin')

    // Montar lista de unidades
    const allUnits = (unidadesData || []).map((u: any) => ({
      ...u,
      ativa: u.ativa ?? u.ativo ?? true,
      modulos_ativos: u.modulos_ativos || [],
    })) as Unidade[]

    if (isSA) {
      setAllUnidades(allUnits)
    } else {
      setAllUnidades(perfis.map(p => p.unidade).filter(u => u.ativa))
    }

    // Selecionar unidade ativa
    const stored = typeof window !== 'undefined' ? localStorage.getItem('rp_current_unit') : null
    let selected: UserPerfil | undefined

    if (stored) {
      selected = perfis.find(p => p.unidade.id === stored)
    }
    if (!selected && stored && isSA) {
      const storedUnit = allUnits.find(u => u.id === stored)
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
      console.log('[UnitContext] Unidade selecionada:', selected.unidade.nome, 'Role:', selected.role, 'Módulos:', selected.unidade.modulos_ativos)
      setCurrentUnit(selected.unidade)
      setCurrentRole(selected.role)
      if (typeof window !== 'undefined') {
        localStorage.setItem('rp_current_unit', selected.unidade.id)
      }
    } else {
      console.warn('[UnitContext] Nenhuma unidade selecionada. Perfis:', perfis.length, 'isSA:', isSA)
    }

    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // FLS: carregar permissões quando unidade/role muda
  useEffect(() => {
    if (!currentUnit?.id || !currentRole || isSuperAdmin) {
      setFlsPermissions(new Map())
      return
    }
    supabase
      .from('field_permissions')
      .select('campo, permissao')
      .eq('unidade_id', currentUnit.id)
      .eq('role', currentRole)
      .then(({ data }) => {
        const map = new Map<string, string>()
        for (const row of (data || []) as { campo: string; permissao: string }[]) {
          map.set(row.campo, row.permissao)
        }
        setFlsPermissions(map)
      })
  }, [currentUnit?.id, currentRole, isSuperAdmin])

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
    if (isSuperAdmin) return true
    // FLS: se o campo está como 'hidden', o módulo está desligado
    const perm = flsPermissions.get(module)
    // Default permissivo: sem row = 'edit' = true
    return perm !== 'hidden'
  }, [currentUnit, isSuperAdmin, flsPermissions])

  // Impersonação: ver a ferramenta como outro usuário veria
  // rpcPerfis vem da RPC list_users_with_profiles (SECURITY DEFINER, sem RLS)
  const startImpersonating = useCallback(async (userId: string, email: string, rpcPerfis?: { perfil_id: string; unidade_id?: string; unidade_nome: string; unidade_codigo: string; role: string; is_default: boolean; nome: string | null; ativo?: boolean }[]): Promise<void> => {
    if (!rpcPerfis || rpcPerfis.length === 0) {
      alert('Este usuário não tem nenhum perfil configurado.')
      return
    }

    const perfisAtivos = rpcPerfis.filter(p => p.ativo !== false)
    if (perfisAtivos.length === 0) {
      alert('Este usuário está desativado (todos os perfis inativos).')
      return
    }

    // Buscar unidades completas (RLS permite leitura para authenticated)
    const { data: unidadesData, error: unidadesError } = await supabase
      .from('unidades')
      .select('*')
      .order('ordem')
      .order('nome')

    if (unidadesError || !unidadesData) {
      console.error('[Impersonate] Erro ao buscar unidades:', unidadesError)
      alert('Erro ao carregar unidades: ' + (unidadesError?.message || 'sem dados'))
      return
    }

    const unidadesMap = new Map(unidadesData.map((u: any) => [u.id, u]))
    // Também mapear por codigo+nome para match quando unidade_id não está disponível
    const unidadesByCode = new Map(unidadesData.map((u: any) => [u.codigo, u]))

    const targetPerfis: UserPerfil[] = perfisAtivos
      .map((p) => {
        const unidade = (p.unidade_id ? unidadesMap.get(p.unidade_id) : null)
          || unidadesByCode.get(p.unidade_codigo)
        if (!unidade) return null
        return {
          perfil_id: p.perfil_id,
          unidade: { ...unidade, ativa: unidade.ativa ?? true, modulos_ativos: unidade.modulos_ativos || [] } as Unidade,
          role: p.role as UserRole,
          is_default: p.is_default,
          nome: p.nome,
        }
      })
      .filter(Boolean) as UserPerfil[]

    if (targetPerfis.length === 0) {
      alert('Não foi possível montar os perfis do usuário (unidades não encontradas).')
      return
    }

    // Salvar estado real (só depois de confirmar que deu certo)
    setRealUserData({
      perfis: userPerfis,
      allUnidades: allUnidades,
      userName: userName,
      userEmail: userEmail,
    })

    const targetIsSA = targetPerfis.some(p => p.role === 'super_admin')
    const targetUnidades = targetIsSA
      ? unidadesData.map((u: any) => ({ ...u, ativa: u.ativa ?? true, modulos_ativos: u.modulos_ativos || [] })) as Unidade[]
      : targetPerfis.map(p => p.unidade)

    const defaultPerfil = targetPerfis.find(p => p.is_default) || targetPerfis[0]

    setUserPerfis(targetPerfis)
    setAllUnidades(targetUnidades)
    setCurrentUnit(defaultPerfil.unidade)
    setCurrentRole(defaultPerfil.role)
    setUserName(defaultPerfil.nome || email.split('@')[0])
    setUserEmail(email)
    setImpersonating(true)
    setImpersonatedEmail(email)
  }, [supabase, userPerfis, allUnidades, userName, userEmail])

  const stopImpersonating = useCallback(() => {
    if (!realUserData) return

    setUserPerfis(realUserData.perfis)
    setAllUnidades(realUserData.allUnidades)
    setUserName(realUserData.userName)
    setUserEmail(realUserData.userEmail)
    setImpersonating(false)
    setImpersonatedEmail(null)
    setRealUserData(null)

    // Restaurar unidade default
    const defaultPerfil = realUserData.perfis.find(p => p.is_default) || realUserData.perfis[0]
    if (defaultPerfil) {
      setCurrentUnit(defaultPerfil.unidade)
      setCurrentRole(defaultPerfil.role)
    }
  }, [realUserData])

  return (
    <UnitContext.Provider value={{
      currentUnit,
      currentRole,
      userPerfis,
      allUnidades,
      isLoading,
      isSuperAdmin: impersonating ? userPerfis.some(p => p.role === 'super_admin') : isSuperAdmin,
      userName,
      userEmail,
      impersonating,
      impersonatedEmail,
      startImpersonating,
      stopImpersonating,
      switchUnit,
      hasModule,
      refetch: fetchData,
      flsPermissions,
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
