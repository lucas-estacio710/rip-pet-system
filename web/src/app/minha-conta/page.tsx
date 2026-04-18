'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import {
  User, Mail, Shield, Lock, Eye, EyeOff, Loader2, CheckCircle2,
  Building2, KeyRound
} from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  gerente: 'Gerente',
  operador: 'Concierge',
}

export default function MinhaContaPage() {
  const supabase = createClient()
  const { userEmail, userName, currentRole, userPerfis, isSuperAdmin } = useUnit()

  // Troca de senha
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Validações visuais
  const hasMinLength = novaSenha.length >= 8
  const hasUpperCase = /[A-Z]/.test(novaSenha)
  const hasNumber = /[0-9]/.test(novaSenha)
  const passwordsMatch = novaSenha === confirmarSenha && confirmarSenha.length > 0
  const allValid = senhaAtual.length > 0 && hasMinLength && hasUpperCase && hasNumber && passwordsMatch

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSucesso(false)

    if (!allValid) return

    setLoading(true)

    // Verificar senha atual fazendo re-login
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: userEmail || '',
      password: senhaAtual,
    })

    if (signInError) {
      setError('Senha atual incorreta.')
      setLoading(false)
      return
    }

    // Atualizar para nova senha
    const { error: updateError } = await supabase.auth.updateUser({
      password: novaSenha,
    })

    if (updateError) {
      if (updateError.message.includes('same_password')) {
        setError('A nova senha deve ser diferente da senha atual.')
      } else {
        setError('Erro ao alterar senha: ' + updateError.message)
      }
      setLoading(false)
      return
    }

    // Marcar que já trocou a senha
    await supabase.auth.updateUser({
      data: { senha_alterada: true, senha_temporaria: null }
    })

    setSucesso(true)
    setSenhaAtual('')
    setNovaSenha('')
    setConfirmarSenha('')
    setLoading(false)

    setTimeout(() => setSucesso(false), 5000)
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 sm:px-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[var(--surface-900)]">Minha Conta</h1>
        <p className="text-sm text-[var(--surface-500)] mt-1">Seus dados e configurações de acesso</p>
      </div>

      {/* Card: Dados do Perfil */}
      <div className="rounded-xl border border-[var(--surface-200)] bg-[var(--surface-50)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--surface-200)]">
          <h2 className="text-sm font-semibold text-[var(--surface-700)] flex items-center gap-2">
            <User className="h-4 w-4" />
            Dados do Perfil
          </h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          {/* Nome */}
          <div className="flex items-start gap-3">
            <User className="h-4 w-4 text-[var(--surface-400)] mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-[var(--surface-500)]">Nome</p>
              <p className="text-sm font-medium text-[var(--surface-800)]">{userName || '—'}</p>
            </div>
          </div>

          {/* Email */}
          <div className="flex items-start gap-3">
            <Mail className="h-4 w-4 text-[var(--surface-400)] mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-[var(--surface-500)]">Email</p>
              <p className="text-sm font-medium text-[var(--surface-800)]">{userEmail || '—'}</p>
            </div>
          </div>

          {/* Papel(is) */}
          <div className="flex items-start gap-3">
            <Shield className="h-4 w-4 text-[var(--surface-400)] mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-[var(--surface-500)]">Perfil</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {userPerfis && userPerfis.length > 0 ? userPerfis.map((p: any, i: number) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full"
                    style={{
                      background: p.role === 'super_admin' ? 'rgba(139,92,246,0.15)' :
                                  p.role === 'gerente' ? 'rgba(16,185,129,0.15)' :
                                  'rgba(59,130,246,0.15)',
                      color: p.role === 'super_admin' ? '#a78bfa' :
                             p.role === 'gerente' ? '#10b981' :
                             '#3b82f6',
                    }}
                  >
                    {ROLE_LABELS[p.role] || p.role}
                    {p.unidade_nome && (
                      <span className="opacity-70">• {p.unidade_nome}</span>
                    )}
                  </span>
                )) : (
                  <span className="text-sm text-[var(--surface-500)]">{currentRole ? ROLE_LABELS[currentRole] : '—'}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Card: Alterar Senha */}
      <div className="rounded-xl border border-[var(--surface-200)] bg-[var(--surface-50)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--surface-200)]">
          <h2 className="text-sm font-semibold text-[var(--surface-700)] flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Alterar Senha
          </h2>
        </div>
        <form onSubmit={handleChangePassword} className="px-5 py-4 space-y-4">
          {/* Senha atual */}
          <div>
            <label htmlFor="current" className="block text-xs font-medium text-[var(--surface-500)] mb-1.5">
              Senha atual
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--surface-400)]" />
              <input
                id="current"
                type={showPassword ? 'text' : 'password'}
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                placeholder="Digite sua senha atual"
                required
                className="w-full pl-10 pr-10 py-2.5 border border-[var(--surface-300)] rounded-lg bg-[var(--surface-0)] text-[var(--surface-800)] placeholder-[var(--surface-400)] focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--surface-400)] hover:text-[var(--surface-600)]"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Nova senha */}
          <div>
            <label htmlFor="new" className="block text-xs font-medium text-[var(--surface-500)] mb-1.5">
              Nova senha
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--surface-400)]" />
              <input
                id="new"
                type={showPassword ? 'text' : 'password'}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Digite sua nova senha"
                required
                className="w-full pl-10 pr-4 py-2.5 border border-[var(--surface-300)] rounded-lg bg-[var(--surface-0)] text-[var(--surface-800)] placeholder-[var(--surface-400)] focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
              />
            </div>

            {/* Indicadores */}
            {novaSenha.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <div className={`w-1.5 h-1.5 rounded-full ${hasMinLength ? 'bg-emerald-500' : 'bg-[var(--surface-300)]'}`} />
                  <span className={hasMinLength ? 'text-emerald-600' : 'text-[var(--surface-400)]'}>Mínimo 8 caracteres</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className={`w-1.5 h-1.5 rounded-full ${hasUpperCase ? 'bg-emerald-500' : 'bg-[var(--surface-300)]'}`} />
                  <span className={hasUpperCase ? 'text-emerald-600' : 'text-[var(--surface-400)]'}>Uma letra maiúscula</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className={`w-1.5 h-1.5 rounded-full ${hasNumber ? 'bg-emerald-500' : 'bg-[var(--surface-300)]'}`} />
                  <span className={hasNumber ? 'text-emerald-600' : 'text-[var(--surface-400)]'}>Um número</span>
                </div>
              </div>
            )}
          </div>

          {/* Confirmar nova senha */}
          <div>
            <label htmlFor="confirm" className="block text-xs font-medium text-[var(--surface-500)] mb-1.5">
              Confirmar nova senha
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--surface-400)]" />
              <input
                id="confirm"
                type={showPassword ? 'text' : 'password'}
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                placeholder="Repita a nova senha"
                required
                className="w-full pl-10 pr-4 py-2.5 border border-[var(--surface-300)] rounded-lg bg-[var(--surface-0)] text-[var(--surface-800)] placeholder-[var(--surface-400)] focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
              />
            </div>
            {confirmarSenha.length > 0 && (
              <div className="mt-1 flex items-center gap-2 text-xs">
                <div className={`w-1.5 h-1.5 rounded-full ${passwordsMatch ? 'bg-emerald-500' : 'bg-red-400'}`} />
                <span className={passwordsMatch ? 'text-emerald-600' : 'text-red-500'}>
                  {passwordsMatch ? 'Senhas conferem' : 'Senhas não conferem'}
                </span>
              </div>
            )}
          </div>

          {/* Erro */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 text-center" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}

          {/* Sucesso */}
          {sucesso && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg p-3 flex items-center justify-center gap-2" style={{ background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.2)' }}>
              <CheckCircle2 className="h-4 w-4" />
              Senha alterada com sucesso!
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !allValid}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-[var(--surface-300)] disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Alterando...
              </>
            ) : (
              'Alterar senha'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
