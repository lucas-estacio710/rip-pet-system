'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Users, Search, X, Plus, Building2, Shield, Crown, User,
  Key, ToggleLeft, ToggleRight, Pencil, Trash2, Loader2, Check,
  ArrowDownAZ, CalendarPlus, Clock
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit, type Unidade, type UserRole } from '@/contexts/UnitContext'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

// ============================================
// Types
// ============================================
type UserPerfil = {
  perfil_id: string
  unidade_id: string
  unidade_nome: string
  unidade_codigo: string
  role: UserRole
  is_default: boolean
  nome: string | null
  ativo: boolean
}

type UserRow = {
  user_id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  perfis: UserPerfil[]
}

const ROLE_CONFIG: Record<UserRole, { label: string; icon: typeof Crown; color: string }> = {
  super_admin: { label: 'Super Admin', icon: Crown, color: 'text-amber-400' },
  gerente: { label: 'Gerente', icon: Shield, color: 'text-purple-400' },
  operador: { label: 'Concierge', icon: User, color: 'text-orange-400' },
}

// ============================================
// Page
// ============================================
export default function AdminUsuariosPage() {
  const supabase = createClient()
  const { isSuperAdmin, allUnidades } = useUnit()

  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [sortBy, setSortBy] = useState<'nome' | 'criacao' | 'login'>('nome')
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Modal de redefinição de senha
  const [resetModal, setResetModal] = useState<{ userId: string; nome: string } | null>(null)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetResult, setResetResult] = useState<{ senha: string; nome: string } | null>(null)

  // Senhas temporárias (user_id → senha)
  const [senhasTemp, setSenhasTemp] = useState<Record<string, string>>({})

  // Form state
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formNome, setFormNome] = useState('')
  const [formPerfis, setFormPerfis] = useState<{ unidade_id: string; role: UserRole; is_default: boolean }[]>([])

  const carregarUsuarios = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('list_users_with_profiles')

    if (error) {
      console.error('Erro ao carregar usuários:', error.message, error.code, error.details)
      setUsers([])
    } else {
      setUsers((data || []) as UserRow[])
    }

    // Buscar senhas temporárias
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const res = await fetch('/api/admin/reset-password', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (res.ok) {
          const senhas = await res.json()
          setSenhasTemp(senhas)
        }
      }
    } catch { /* silencioso */ }

    setLoading(false)
  }, [])

  useEffect(() => {
    carregarUsuarios()
  }, [carregarUsuarios])

  // Filtrar por busca
  const filtered = users.filter(u => {
    if (!busca.trim()) return true
    const term = busca.toLowerCase()
    return (
      u.email.toLowerCase().includes(term) ||
      u.perfis.some(p => p.nome?.toLowerCase().includes(term)) ||
      u.perfis.some(p => p.unidade_nome.toLowerCase().includes(term))
    )
  })

  const displayName = (u: UserRow) => (u.perfis[0]?.nome || u.email.split('@')[0]).toLowerCase()

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'nome') {
      return displayName(a).localeCompare(displayName(b), 'pt-BR')
    }
    if (sortBy === 'criacao') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    }
    // login — últimos primeiro, nulls por último
    const la = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0
    const lb = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0
    return lb - la
  })

  // ============================================
  // Modal: Criar/Editar usuário
  // ============================================
  function openCreateModal() {
    setEditingUser(null)
    setFormEmail('')
    setFormPassword('')
    setFormNome('')
    setFormPerfis([])
    setShowModal(true)
  }

  function openEditModal(user: UserRow) {
    setEditingUser(user)
    setFormEmail(user.email)
    setFormPassword('')
    setFormNome(user.perfis[0]?.nome || '')
    setFormPerfis(user.perfis.map(p => ({
      unidade_id: p.unidade_id,
      role: p.role,
      is_default: p.is_default,
    })))
    setShowModal(true)
  }

  function addPerfil() {
    // Encontrar primeira unidade não selecionada
    const usedIds = new Set(formPerfis.map(p => p.unidade_id))
    const available = allUnidades.find(u => !usedIds.has(u.id))
    if (available) {
      setFormPerfis([...formPerfis, { unidade_id: available.id, role: 'operador', is_default: formPerfis.length === 0 }])
    }
  }

  function removePerfil(idx: number) {
    const updated = formPerfis.filter((_, i) => i !== idx)
    // Se removeu o default, marca o primeiro como default
    if (updated.length > 0 && !updated.some(p => p.is_default)) {
      updated[0].is_default = true
    }
    setFormPerfis(updated)
  }

  function updatePerfil(idx: number, field: string, value: any) {
    const updated = [...formPerfis]
    if (field === 'is_default') {
      // Só 1 default por vez
      updated.forEach((p, i) => { p.is_default = i === idx })
    } else {
      (updated[idx] as any)[field] = value
    }
    setFormPerfis(updated)
  }

  async function handleSave() {
    if (!formEmail || formPerfis.length === 0) return

    setSaving(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (editingUser) {
        // Editar: atualizar perfis via API server-side (service_role)
        const res = await fetch('/api/admin/users', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            user_id: editingUser.user_id,
            nome: formNome,
            perfis: formPerfis,
          }),
        })

        const result = await res.json()
        if (!res.ok) {
          alert('Erro ao atualizar perfis: ' + result.error)
          setSaving(false)
          return
        }

      } else {
        // Criar via API route (usa service_role no server)
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            email: formEmail,
            password: formPassword,
            nome: formNome,
          }),
        })

        const createResult = await res.json()
        if (!res.ok) {
          alert('Erro ao criar usuário: ' + createResult.error)
          setSaving(false)
          return
        }

        // Inserir perfis via API server-side (service_role)
        const perfisRes = await fetch('/api/admin/users', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            user_id: createResult.user_id,
            nome: formNome,
            perfis: formPerfis,
          }),
        })

        if (!perfisRes.ok) {
          const perfisResult = await perfisRes.json()
          alert('Usuário criado mas erro ao configurar perfil: ' + perfisResult.error)
        }
      }

      setShowModal(false)
      // Pequeno delay pro Supabase propagar
      await new Promise(r => setTimeout(r, 500))
      await carregarUsuarios()
    } catch (e) {
      console.error(e)
    }

    setSaving(false)
  }

  // Redefinir senha via API admin
  async function handleResetPassword(tipo: 'padrao' | 'aleatoria') {
    if (!resetModal) return
    setResetLoading(true)

    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ user_id: resetModal.userId, tipo }),
    })

    if (!res.ok) {
      const err = await res.json()
      alert('Erro: ' + (err.error || 'Falha ao resetar senha'))
    } else {
      const data = await res.json()
      setResetResult({ senha: data.senha, nome: resetModal.nome })
      // Atualizar senha temp no card imediatamente
      setSenhasTemp(prev => ({ ...prev, [resetModal.userId]: data.senha }))
      setResetPasswordUserId(resetModal.userId)
      setResetSent(true)
      setTimeout(() => { setResetSent(false); setResetPasswordUserId(null) }, 5000)
    }

    setResetModal(null)
    setResetLoading(false)
  }

  // Toggle ativo
  async function toggleAtivo(perfilId: string, currentAtivo: boolean) {
    await supabase.from('perfis').update({ ativo: !currentAtivo } as never).eq('id', perfilId)
    await carregarUsuarios()
  }

  // Desativar usuário (soft delete)
  async function handleDelete(user: UserRow) {
    const nome = user.perfis[0]?.nome || user.email
    if (!confirm(`Desativar o usuário "${nome}" (${user.email})?\n\nO usuário perderá acesso ao sistema. Você pode reativá-lo depois.`)) return

    setDeletingId(user.user_id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ user_id: user.user_id }),
      })

      const result = await res.json()
      if (!res.ok) {
        alert('Erro ao excluir: ' + result.error)
      } else {
        await carregarUsuarios()
      }
    } catch (e) {
      console.error(e)
      alert('Erro ao desativar usuário')
    }
    setDeletingId(null)
  }

  // Reativar usuário
  async function handleReactivate(user: UserRow) {
    setDeletingId(user.user_id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ user_id: user.user_id }),
      })

      const result = await res.json()
      if (!res.ok) {
        alert('Erro ao reativar: ' + result.error)
      } else {
        await carregarUsuarios()
      }
    } catch (e) {
      console.error(e)
      alert('Erro ao reativar usuário')
    }
    setDeletingId(null)
  }

  // ============================================
  // Render
  // ============================================
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-purple-900/30 items-center justify-center">
            <Users className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <h1 className="text-title text-[var(--shell-text)]">Usuários</h1>
            <p className="text-small text-[var(--shell-text-muted)]">Gerenciar acessos, papéis e unidades</p>
          </div>
        </div>
        <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Novo Usuário</span>
        </button>
      </div>

      {/* Busca + Ordenação */}
      <div className="mb-4 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--surface-400)]" />
          <input
            type="text"
            placeholder="Buscar por nome, email, unidade..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="input pl-10 pr-10"
          />
          {busca && (
            <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--surface-400)] hover:text-[var(--surface-600)]">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Ordenação */}
        <div className="inline-flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--surface-300)' }}>
          {([
            { key: 'nome', label: 'A-Z', icon: ArrowDownAZ, title: 'Ordem alfabética' },
            { key: 'criacao', label: 'Criação', icon: CalendarPlus, title: 'Mais recentes primeiro' },
            { key: 'login', label: 'Último login', icon: Clock, title: 'Logins recentes primeiro' },
          ] as const).map(opt => {
            const OptIcon = opt.icon
            const active = sortBy === opt.key
            return (
              <button
                key={opt.key}
                onClick={() => setSortBy(opt.key)}
                title={opt.title}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors"
                style={{
                  background: active ? 'var(--brand-500)' : 'transparent',
                  color: active ? '#fff' : 'var(--surface-500)',
                }}
              >
                <OptIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{opt.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-36" />
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum usuário encontrado" description={busca ? 'Tente ajustar a busca' : 'Crie o primeiro usuário'} />
      ) : (
        <div className="space-y-2 stagger-children">
          {sorted.map(user => {
            const mainPerfil = user.perfis[0]
            const nome = mainPerfil?.nome || user.email.split('@')[0]
            const isDesativado = user.perfis.length > 0 && user.perfis.every(p => !p.ativo)

            return (
              <div key={user.user_id} className={`card p-4 card-hover ${isDesativado ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Nome + email */}
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-base font-semibold text-[var(--surface-800)]">{nome}</span>
                      <span className="text-xs text-[var(--surface-400)]">{user.email}</span>
                      {isDesativado && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-900/30 text-red-400">
                          Desativado
                        </span>
                      )}
                    </div>

                    {/* Unidades e papéis */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                      {user.perfis.map(p => {
                        const cfg = ROLE_CONFIG[p.role]
                        const RoleIcon = cfg.icon
                        return (
                          <span
                            key={p.perfil_id}
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                              p.ativo ? 'border-[var(--surface-300)]' : 'border-red-500/30 opacity-50'
                            }`}
                          >
                            <Building2 className="h-3 w-3 text-[var(--surface-400)]" />
                            {p.unidade_nome}
                            <span className={`${cfg.color} ml-0.5`}>
                              <RoleIcon className="h-3 w-3 inline" /> {cfg.label}
                            </span>
                            {p.is_default && <span className="text-[9px] text-emerald-400">(padrão)</span>}
                          </span>
                        )
                      })}

                      {user.perfis.length === 0 && (
                        <span className="text-xs text-red-400">Sem acesso configurado</span>
                      )}
                    </div>

                    {/* Senha temporária */}
                    {senhasTemp[user.user_id] && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}>
                          <Key className="h-3 w-3" style={{ color: '#f59e0b' }} />
                          <span style={{ color: '#fbbf24' }}>Senha temp:</span>
                          <code className="font-mono font-bold select-all" style={{ color: '#fde68a' }}>{senhasTemp[user.user_id]}</code>
                          <button
                            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(senhasTemp[user.user_id]) }}
                            className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors"
                            style={{ background: 'rgba(251,191,36,0.2)', color: '#fbbf24' }}
                            title="Copiar"
                          >
                            Copiar
                          </button>
                        </span>
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="flex items-center gap-3 text-xs text-[var(--surface-400)]">
                      {user.last_sign_in_at && (
                        <span>Último login: {new Date(user.last_sign_in_at).toLocaleDateString('pt-BR')}</span>
                      )}
                      <span>Criado: {new Date(user.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEditModal(user)}
                      className="p-2 rounded-lg hover:bg-[var(--surface-100)] transition-colors"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4 text-[var(--surface-500)]" />
                    </button>
                    <button
                      onClick={() => setResetModal({ userId: user.user_id, nome: user.perfis[0]?.nome || user.email })}
                      className="p-2 rounded-lg hover:bg-[var(--surface-100)] transition-colors"
                      title="Redefinir senha"
                    >
                      {resetPasswordUserId === user.user_id && resetSent ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Key className="h-4 w-4 text-[var(--surface-500)]" />
                      )}
                    </button>
                    {isDesativado ? (
                      <button
                        onClick={() => handleReactivate(user)}
                        disabled={deletingId === user.user_id}
                        className="p-2 rounded-lg hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                        title="Reativar usuário"
                      >
                        {deletingId === user.user_id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                        ) : (
                          <ToggleLeft className="h-4 w-4 text-emerald-400" />
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDelete(user)}
                        disabled={deletingId === user.user_id}
                        className="p-2 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        title="Desativar usuário"
                      >
                        {deletingId === user.user_id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-red-400" />
                        ) : (
                          <ToggleRight className="h-4 w-4 text-red-400" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Criar/Editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" style={{ background: '#1e293b', border: '1px solid #334155' }} onClick={e => e.stopPropagation()}>
            <div className="p-6" style={{ borderBottom: '1px solid #334155' }}>
              <h2 className="text-lg font-semibold" style={{ color: '#e2e8f0' }}>
                {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
              </h2>
            </div>

            <div className="p-6 space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#94a3b8' }}>Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  disabled={!!editingUser}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }}
                  placeholder="usuario@rippet.com.br"
                />
              </div>

              {/* Senha (só na criação) */}
              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: '#94a3b8' }}>Senha inicial</label>
                  <input
                    type="text"
                    value={formPassword}
                    onChange={e => setFormPassword(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }}
                    placeholder="Senha inicial do usuário"
                    required
                  />
                  <p className="text-xs mt-1" style={{ color: '#64748b' }}>Informe a senha ao usuário por WhatsApp</p>
                </div>
              )}

              {/* Nome */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#94a3b8' }}>Nome</label>
                <input
                  type="text"
                  value={formNome}
                  onChange={e => setFormNome(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }}
                  placeholder="Nome do usuário"
                />
              </div>

              {/* Perfis (unidade + papel) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium" style={{ color: '#94a3b8' }}>Unidades e Papéis</label>
                  <button
                    onClick={addPerfil}
                    className="text-xs flex items-center gap-1"
                    style={{ color: '#a78bfa' }}
                    disabled={formPerfis.length >= allUnidades.length}
                  >
                    <Plus className="h-3 w-3" /> Adicionar unidade
                  </button>
                </div>

                {formPerfis.length === 0 && (
                  <p className="text-xs py-3 text-center rounded-lg" style={{ color: '#64748b', border: '1px dashed #334155' }}>
                    Clique em &quot;Adicionar unidade&quot; para configurar acesso
                  </p>
                )}

                <div className="space-y-2">
                  {formPerfis.map((perfil, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: '#0f172a' }}>
                      {/* Unidade */}
                      <select
                        value={perfil.unidade_id}
                        onChange={e => updatePerfil(idx, 'unidade_id', e.target.value)}
                        className="flex-1 text-sm py-1.5 px-2 rounded-lg outline-none"
                        style={{ background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155' }}
                      >
                        {allUnidades.map(u => (
                          <option key={u.id} value={u.id}>{u.nome}</option>
                        ))}
                      </select>

                      {/* Role */}
                      <select
                        value={perfil.role}
                        onChange={e => updatePerfil(idx, 'role', e.target.value)}
                        className="w-32 text-sm py-1.5 px-2 rounded-lg outline-none"
                        style={{ background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155' }}
                      >
                        <option value="operador">Concierge</option>
                        <option value="gerente">Gerente</option>
                        <option value="super_admin">Super Admin</option>
                      </select>

                      {/* Default */}
                      <button
                        onClick={() => updatePerfil(idx, 'is_default', true)}
                        className={`p-1 rounded ${perfil.is_default ? 'text-emerald-400' : 'text-[var(--surface-400)]'}`}
                        title={perfil.is_default ? 'Unidade padrão' : 'Definir como padrão'}
                      >
                        {perfil.is_default ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                      </button>

                      {/* Remover */}
                      <button onClick={() => removePerfil(idx)} className="p-1 text-red-400 hover:text-red-300">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 flex items-center justify-end gap-3" style={{ borderTop: '1px solid #334155' }}>
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ color: '#94a3b8', border: '1px solid #334155' }}>
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formEmail || formPerfis.length === 0}
                className="btn-primary flex items-center gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {editingUser ? 'Salvar' : 'Criar Usuário'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Escolher tipo de redefinição */}
      {resetModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => !resetLoading && setResetModal(null)}>
          <div className="rounded-2xl shadow-2xl w-full max-w-sm" style={{ background: '#1e293b', border: '1px solid #334155' }} onClick={e => e.stopPropagation()}>
            <div className="p-5" style={{ borderBottom: '1px solid #334155' }}>
              <h2 className="text-base font-semibold" style={{ color: '#e2e8f0' }}>Redefinir senha</h2>
              <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>
                Escolha como redefinir a senha de <strong style={{ color: '#e2e8f0' }}>{resetModal.nome}</strong>
              </p>
            </div>

            <div className="p-5 space-y-3">
              <button
                onClick={() => handleResetPassword('padrao')}
                disabled={resetLoading}
                className="w-full text-left p-4 rounded-xl transition-colors"
                style={{ background: '#0f172a', border: '1px solid #334155' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#7c3aed')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#334155')}
              >
                <div className="flex items-center gap-3">
                  <Key className="h-5 w-5 shrink-0" style={{ color: '#a78bfa' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#e2e8f0' }}>Senha padrão</p>
                    <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
                      Reseta para a senha padrão configurada
                    </p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleResetPassword('aleatoria')}
                disabled={resetLoading}
                className="w-full text-left p-4 rounded-xl transition-colors"
                style={{ background: '#0f172a', border: '1px solid #334155' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#7c3aed')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#334155')}
              >
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 shrink-0" style={{ color: '#10b981' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#e2e8f0' }}>Senha aleatória</p>
                    <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Gera uma senha segura. Será exibida uma única vez.</p>
                  </div>
                </div>
              </button>
            </div>

            {resetLoading && (
              <div className="px-5 pb-4 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#a78bfa' }} />
                <span className="text-xs" style={{ color: '#94a3b8' }}>Redefinindo...</span>
              </div>
            )}

            <div className="p-4 flex justify-end" style={{ borderTop: '1px solid #334155' }}>
              <button
                onClick={() => setResetModal(null)}
                disabled={resetLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ color: '#94a3b8', border: '1px solid #334155' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Resultado — exibir a nova senha */}
      {resetResult && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setResetResult(null)}>
          <div className="rounded-2xl shadow-2xl w-full max-w-sm" style={{ background: '#1e293b', border: '1px solid #334155' }} onClick={e => e.stopPropagation()}>
            <div className="p-5" style={{ borderBottom: '1px solid #334155' }}>
              <div className="flex items-center gap-2">
                <Check className="h-5 w-5 text-emerald-400" />
                <h2 className="text-base font-semibold" style={{ color: '#e2e8f0' }}>Senha redefinida</h2>
              </div>
              <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>
                Nova senha de <strong style={{ color: '#e2e8f0' }}>{resetResult.nome}</strong>
              </p>
            </div>

            <div className="p-5">
              <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: '#0f172a', border: '1px solid #334155' }}>
                <code className="flex-1 text-base font-mono font-bold tracking-wide select-all" style={{ color: '#e2e8f0' }}>
                  {resetResult.senha}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(resetResult.senha)
                  }}
                  className="px-2 py-1 rounded-lg text-xs font-medium transition-colors"
                  style={{ background: '#7c3aed', color: '#fff' }}
                  title="Copiar"
                >
                  Copiar
                </button>
              </div>
              <p className="text-xs mt-3 text-center" style={{ color: '#f59e0b' }}>
                O usuário será obrigado a trocar no próximo login.
              </p>
            </div>

            <div className="p-4 flex justify-end" style={{ borderTop: '1px solid #334155' }}>
              <button
                onClick={() => setResetResult(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#7c3aed', color: '#fff' }}
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
