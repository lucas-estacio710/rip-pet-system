'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
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
  cep: string | null       // CEP da unidade (mig 102) — base da ordenação por proximidade no pipeline
  is_matriz: boolean
  // Marco zero do financeiro (mig 167): antes deste mês a DRE e o Livro-Caixa não valem.
  // Opcional: vem do select('*') e fica undefined se a migration ainda não rodou.
  financeiro_desde?: string | null
  modulos_ativos: string[]
  ativa: boolean
}

export type UserRole = 'super_admin' | 'gerente' | 'operador' | 'operacional'

export type UserPerfil = {
  perfil_id: string
  unidade: Unidade
  role: UserRole
  is_default: boolean
  nome: string | null
  // true = este login é um dispositivo compartilhado (ex: celular do carro), não uma pessoa —
  // ver migration 137.
  eh_posicao: boolean
}

type UnitContextType = {
  // Estado
  currentUnit: Unidade | null
  currentRole: UserRole | null
  userPerfis: UserPerfil[]
  allUnidades: Unidade[]
  isLoading: boolean
  isSuperAdmin: boolean
  // true = o login atual é uma posição (dispositivo compartilhado, ex: celular do carro), não
  // uma pessoa. Ver migration 137.
  isPosicao: boolean
  userName: string | null
  userEmail: string | null

  // Impersonação
  impersonating: boolean
  impersonatedEmail: string | null
  // auth.uid() real continua sendo o do super_admin (impersonar não troca sessão de verdade) —
  // telas que filtram por "sou eu" (ex: /tarefas "Minhas Tarefas", atribuido_a) precisam desse
  // id pra mostrar os dados de quem está sendo impersonado, não do super_admin logado.
  impersonatedUserId: string | null
  startImpersonating: (userId: string, email: string, rpcPerfis?: { perfil_id: string; unidade_id?: string; unidade_nome: string; unidade_codigo: string; role: string; is_default: boolean; nome: string | null; ativo?: boolean; eh_posicao?: boolean }[]) => Promise<void>
  stopImpersonating: () => void

  // Ações
  switchUnit: (unitId: string) => void
  hasModule: (module: string) => boolean
  refetch: () => Promise<void>

  // Super admin: ver todas as unidades de uma vez
  viewAllUnits: boolean
  setViewAllUnits: (v: boolean) => void

  // FLS
  flsPermissions: Map<string, string>  // campo → permissao ('read'|'hidden'), default 'edit' se ausente
  // Situação da carga do FLS para a unidade+role+identidade ATUAIS.
  // 🔴 FECHA NA DÚVIDA (30/10/2026): enquanto não for 'pronto', `hasModule` e o
  // `useFieldPermission` respondem 'hidden' pra quem não é super_admin. Até aqui o Map vazio
  // respondia 'edit' pra tudo — e um erro na consulta deixava a sessão inteira assim, sem
  // tentar de novo. Foi como uma gerente de PA viu a árvore de planos e mandou o zap com o
  // disclaimer, que são exclusivos de outras unidades (as 57 restrições dela caíram juntas).
  flsStatus: FlsStatus
  // Situação da carga do PERFIL (usuário → perfis → unidade). O portão do `LayoutWrapper`
  // só monta a tela com perfil E FLS 'pronto' — antes disso a tela concluía "não habilitada".
  perfilStatus: PerfilStatus
  /** Tenta de novo agora o que falhou (perfil ou FLS) — botão do portão de carga. */
  recarregarAcesso: () => void
}

export type FlsStatus = 'carregando' | 'pronto' | 'erro'
export type PerfilStatus = 'carregando' | 'pronto' | 'erro' | 'sem_perfil' | 'sem_sessao'

/** Espera entre tentativas da carga do FLS que falhou (ms); depois da última, repete ela. */
const FLS_ESPERAS = [1000, 3000, 8000, 15000]

function mapasIguais(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) if (b.get(k) !== v) return false
  return true
}

// Referência estável: o Map vazio entra em deps de useCallback (hasModule, useFieldPermission).
const FLS_VAZIO: Map<string, string> = new Map()

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
  const [perfilStatus, setPerfilStatus] = useState<PerfilStatus>('carregando')
  const [viewAllUnits, setViewAllUnits] = useState(false)
  const [userName, setUserName] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [impersonating, setImpersonating] = useState(false)
  const [impersonatedEmail, setImpersonatedEmail] = useState<string | null>(null)
  const [impersonatedUserId, setImpersonatedUserId] = useState<string | null>(null)
  const [realUserData, setRealUserData] = useState<{ perfis: UserPerfil[]; allUnidades: Unidade[]; userName: string | null; userEmail: string | null } | null>(null)
  // FLS: cache de permissões (field_permissions) — Map<campo, permissao> para unidade+role atual.
  // Guarda a CHAVE da consulta junto da resposta: uma resposta só vale enquanto a chave atual
  // for a mesma (ver flsChave abaixo).
  const [flsCarga, setFlsCarga] = useState<{ chave: string; status: 'pronto' | 'erro'; map: Map<string, string> } | null>(null)
  // Pedido de recarga do FLS: muda pra refazer a consulta (nova tentativa após erro, app
  // voltou pra frente, token renovado). As falhas seguidas só dosam a espera.
  const [flsPedido, setFlsPedido] = useState(0)
  const flsFalhas = useRef(0)

  const isSuperAdmin = userPerfis.some(p => p.role === 'super_admin')

  // Identidade COMPLETA da consulta de FLS. Só (unidade) não basta: "Logar como" um gerente da
  // MESMA unidade em que o super_admin estava passaria por carregado com o Map vazio do SA.
  const flsChave = currentUnit?.id && currentRole
    ? [currentUnit.id, currentRole, isSuperAdmin ? 'sa' : '-', impersonatedUserId ?? ''].join('|')
    : null

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setPerfilStatus('carregando')

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log('[UnitContext] Auth user:', user?.id, user?.email, 'error:', authError)
    if (!user) {
      console.warn('[UnitContext] Sem usuário autenticado')
      setPerfilStatus(authError ? 'erro' : 'sem_sessao')
      setIsLoading(false)
      return
    }

    setUserEmail(user.email ?? null)

    // Buscar perfis do usuário
    const { data: perfisData, error: perfisError } = await supabase
      .from('perfis')
      .select('id, unidade_id, role, is_default, nome, ativo, eh_posicao')
      .eq('user_id', user.id)
      .eq('ativo', true)

    console.log('[UnitContext] Perfis query result:', { data: perfisData, error: perfisError, count: perfisData?.length })

    if (perfisError) {
      console.error('[UnitContext] Erro ao carregar perfis:', perfisError)
      setPerfilStatus('erro')
      setIsLoading(false)
      return
    }

    if (!perfisData || perfisData.length === 0) {
      console.warn('[UnitContext] Nenhum perfil encontrado para user_id:', user.id)
      setPerfilStatus('sem_perfil')
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
      setPerfilStatus('erro')
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
          eh_posicao: !!p.eh_posicao,
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
        setPerfilStatus('pronto')
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

    setPerfilStatus(selected ? 'pronto' : 'sem_perfil')
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // FLS: carregar permissões quando unidade/role/identidade muda. Super_admin não consulta
  // (é 'edit' por hardcode). Resposta de uma chave antiga é descartada (`vivo`).
  //
  // 🔴 Três regras, todas do incidente de 30/10/2026 (ver `flsStatus` no tipo):
  //  1. Erro TENTA DE NOVO sozinho (FLS_ESPERAS) — antes ficava em erro até recarregar a página.
  //  2. Sem sessão é ERRO, não "sem restrições": consultada sem token, a RLS devolve 0 linhas
  //     sem erro nenhum, e 0 linhas é indistinguível de "unidade sem restrição".
  //  3. Recarga que falha NÃO derruba um FLS que já estava pronto pra mesma chave: fica o
  //     último bom (trava não some no meio do uso) e tenta de novo.
  useEffect(() => {
    if (!flsChave || !currentUnit?.id || !currentRole || isSuperAdmin) return
    const chave = flsChave
    const unidadeId = currentUnit.id
    const role = currentRole
    let vivo = true
    let espera: ReturnType<typeof setTimeout> | undefined
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      let erro: unknown = session ? null : 'sem sessão'
      let linhas: { campo: string; permissao: string }[] = []
      if (session) {
        const r = await supabase.from('field_permissions').select('campo, permissao').eq('unidade_id', unidadeId).eq('role', role)
        erro = r.error
        linhas = (r.data || []) as { campo: string; permissao: string }[]
      }
      if (!vivo) return
      if (erro) {
        console.error('[UnitContext] Erro ao carregar FLS — tentando de novo:', erro)
        setFlsCarga(prev => (prev && prev.chave === chave && prev.status === 'pronto') ? prev : { chave, status: 'erro', map: new Map() })
        const ms = FLS_ESPERAS[Math.min(flsFalhas.current, FLS_ESPERAS.length - 1)]
        flsFalhas.current += 1
        espera = setTimeout(() => setFlsPedido(n => n + 1), ms)
        return
      }
      flsFalhas.current = 0
      const map = new Map<string, string>()
      for (const row of linhas) map.set(row.campo, row.permissao)
      // Mesma resposta de antes = mesmo objeto: senão toda recarga (app voltando pra frente)
      // trocaria o Map e re-dispararia cada efeito que depende de hasModule/isVisible.
      setFlsCarga(prev => (prev && prev.chave === chave && prev.status === 'pronto' && mapasIguais(prev.map, map)) ? prev : { chave, status: 'pronto', map })
    })()
    return () => { vivo = false; if (espera) clearTimeout(espera) }
  }, [flsChave, currentUnit?.id, currentRole, isSuperAdmin, flsPedido])

  // Recarrega o FLS quando o app volta pra frente e quando o token é renovado — é aí que um
  // celular que ficou no bolso com a sessão vencida se recupera.
  useEffect(() => {
    const aoVoltar = () => { if (document.visibilityState === 'visible') setFlsPedido(n => n + 1) }
    document.addEventListener('visibilitychange', aoVoltar)
    const { data: sub } = supabase.auth.onAuthStateChange(evento => {
      if (evento === 'TOKEN_REFRESHED') setFlsPedido(n => n + 1)
    })
    return () => { document.removeEventListener('visibilitychange', aoVoltar); sub.subscription.unsubscribe() }
  }, [supabase])

  // Derivados da carga: só valem se forem da chave ATUAL — na troca de unidade/identidade o
  // Map da anterior nunca vaza para a nova (volta a 'carregando' com o Map vazio).
  const flsDaChaveAtual = !isSuperAdmin && flsCarga !== null && flsCarga.chave === flsChave
  const flsPermissions = flsDaChaveAtual ? flsCarga.map : FLS_VAZIO
  const flsStatus: FlsStatus = !flsChave
    ? 'carregando'
    : isSuperAdmin
      ? 'pronto'
      : flsDaChaveAtual ? flsCarga.status : 'carregando'

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
    // Fecha na dúvida: sem o FLS desta unidade+role carregado, não há como saber (ver `flsStatus`).
    if (flsStatus !== 'pronto') return false
    // FLS: se o campo está como 'hidden', o módulo está desligado
    const perm = flsPermissions.get(module)
    // Default permissivo: sem row = 'edit' = true — mas SÓ com a carga confirmada, acima.
    return perm !== 'hidden'
  }, [currentUnit, isSuperAdmin, flsPermissions, flsStatus])

  const recarregarAcesso = useCallback(() => {
    if (perfilStatus === 'erro') { void fetchData(); return }
    flsFalhas.current = 0
    setFlsPedido(n => n + 1)
  }, [perfilStatus, fetchData])

  // Impersonação: ver a ferramenta como outro usuário veria
  // rpcPerfis vem da RPC list_users_with_profiles (SECURITY DEFINER, sem RLS)
  const startImpersonating = useCallback(async (userId: string, email: string, rpcPerfis?: { perfil_id: string; unidade_id?: string; unidade_nome: string; unidade_codigo: string; role: string; is_default: boolean; nome: string | null; ativo?: boolean; eh_posicao?: boolean }[]): Promise<void> => {
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
          eh_posicao: !!p.eh_posicao,
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
    setImpersonatedUserId(userId)
  }, [supabase, userPerfis, allUnidades, userName, userEmail])

  const stopImpersonating = useCallback(() => {
    if (!realUserData) return

    setUserPerfis(realUserData.perfis)
    setAllUnidades(realUserData.allUnidades)
    setUserName(realUserData.userName)
    setUserEmail(realUserData.userEmail)
    setImpersonating(false)
    setImpersonatedEmail(null)
    setImpersonatedUserId(null)
    setRealUserData(null)

    // Restaurar unidade default
    const defaultPerfil = realUserData.perfis.find(p => p.is_default) || realUserData.perfis[0]
    if (defaultPerfil) {
      setCurrentUnit(defaultPerfil.unidade)
      setCurrentRole(defaultPerfil.role)
    }
  }, [realUserData])

  // Login atual é uma posição (dispositivo compartilhado, ex: celular do carro) — perfis.
  // eh_posicao. Resolve pelo perfil ativo (currentUnit + currentRole); já correto durante
  // impersonação, porque userPerfis/currentRole trocam junto. Ver migration 137.
  const isPosicao = userPerfis.find(p => p.unidade.id === currentUnit?.id && p.role === currentRole)?.eh_posicao ?? false

  return (
    <UnitContext.Provider value={{
      currentUnit,
      currentRole,
      userPerfis,
      allUnidades,
      isLoading,
      isSuperAdmin: impersonating ? userPerfis.some(p => p.role === 'super_admin') : isSuperAdmin,
      isPosicao,
      userName,
      userEmail,
      impersonating,
      impersonatedEmail,
      impersonatedUserId,
      startImpersonating,
      stopImpersonating,
      switchUnit,
      hasModule,
      refetch: fetchData,
      viewAllUnits: isSuperAdmin ? viewAllUnits : false,
      setViewAllUnits,
      flsPermissions,
      flsStatus,
      perfilStatus,
      recarregarAcesso,
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
