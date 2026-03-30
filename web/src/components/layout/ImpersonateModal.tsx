'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X, User, Building2, Crown, Shield, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type UserResult = {
  user_id: string
  email: string
  perfis: {
    perfil_id: string
    unidade_id: string
    unidade_nome: string
    unidade_codigo: string
    role: string
    is_default: boolean
    nome: string | null
    ativo: boolean
  }[]
}

type Props = {
  isOpen: boolean
  onClose: () => void
  onSelect: (userId: string, email: string, perfis: UserResult['perfis']) => void
}

const ROLE_ICONS = {
  super_admin: Crown,
  gerente: Shield,
  operador: User,
}

export function ImpersonateModal({ isOpen, onClose, onSelect }: Props) {
  const supabase = createClient()
  const [busca, setBusca] = useState('')
  const [results, setResults] = useState<UserResult[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (isOpen) {
      setBusca('')
      setResults([])
      setTimeout(() => inputRef.current?.focus(), 100)
      // Carregar todos ao abrir
      loadUsers('')
    }
  }, [isOpen])

  function handleBuscaChange(value: string) {
    setBusca(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => loadUsers(value), 300)
  }

  async function loadUsers(termo: string) {
    setLoading(true)
    setErro(null)

    try {
      const { data, error } = await supabase.rpc('list_users_with_profiles')

      if (error) {
        console.error('[ImpersonateModal] Erro na RPC:', error)
        setErro('Erro ao carregar usuários: ' + error.message)
        setLoading(false)
        return
      }

      if (!data || !Array.isArray(data)) {
        console.error('[ImpersonateModal] Dados inválidos:', data)
        setErro('Nenhum dado retornado')
        setLoading(false)
        return
      }

      let filtered = data as UserResult[]

      if (termo.trim()) {
        const t = termo.toLowerCase()
        filtered = filtered.filter(u =>
          u.email.toLowerCase().includes(t) ||
          u.perfis?.some(p => p.nome?.toLowerCase().includes(t))
        )
      }

      setResults(filtered)
    } catch (e) {
      console.error('[ImpersonateModal] Erro:', e)
      setErro('Erro inesperado ao carregar usuários')
    }
    setLoading(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-20" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl shadow-2xl overflow-hidden animate-fade-in"
        style={{ background: '#1e293b', border: '1px solid #334155' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid #334155' }}>
          <User className="h-5 w-5" style={{ color: '#a78bfa' }} />
          <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>Logar como</span>
          <button onClick={onClose} className="ml-auto p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X className="h-4 w-4" style={{ color: '#94a3b8' }} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3" style={{ borderBottom: '1px solid #334155' }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#64748b' }} />
            <input
              ref={inputRef}
              type="text"
              value={busca}
              onChange={e => handleBuscaChange(e.target.value)}
              placeholder="Buscar por email ou nome..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }}
            />
          </div>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#64748b' }} />
            </div>
          ) : erro ? (
            <div className="text-center py-8 px-4 text-sm" style={{ color: '#ef4444' }}>
              {erro}
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{ color: '#64748b' }}>
              {busca ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}
            </div>
          ) : (
            results.map(user => {
              const nome = user.perfis[0]?.nome || user.email.split('@')[0]
              return (
                <button
                  key={user.user_id}
                  onClick={() => onSelect(user.user_id, user.email, user.perfis)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors"
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: '#7c3aed', color: '#fff' }}>
                    {nome.slice(0, 2).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: '#e2e8f0' }}>{nome}</p>
                    <p className="text-xs truncate" style={{ color: '#64748b' }}>{user.email}</p>

                    {/* Unidades */}
                    {user.perfis.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {user.perfis.map(p => {
                          const RoleIcon = ROLE_ICONS[p.role as keyof typeof ROLE_ICONS] || User
                          return (
                            <span
                              key={p.perfil_id}
                              className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(255,255,255,0.08)', color: '#94a3b8' }}
                            >
                              <Building2 className="h-2.5 w-2.5" />
                              {p.unidade_codigo}
                              <RoleIcon className="h-2.5 w-2.5 ml-0.5" style={{ color: '#a78bfa' }} />
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {user.perfis.length === 0 && (
                      <span className="text-[10px]" style={{ color: '#ef4444' }}>Sem perfil configurado</span>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
