'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Lock, Loader2, CheckCircle2, Eye, EyeOff, ArrowLeft, AlertTriangle, ShieldAlert } from 'lucide-react'

function RedefinirSenhaForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const isPrimeiroAcesso = searchParams.get('primeiro-acesso') === '1'

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [sessionError, setSessionError] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let mounted = true

    async function checkSession() {
      // Se é primeiro acesso, o usuário já está logado — pular verificação de recovery
      if (isPrimeiroAcesso) {
        const { data: { session } } = await supabase.auth.getSession()
        if (!mounted) return
        if (session) {
          setSessionReady(true)
        } else {
          setSessionError(true)
        }
        setChecking(false)
        return
      }

      // Escutar eventos de auth (recovery token via hash fragment)
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if (!mounted) return
          if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
            setSessionReady(true)
            setChecking(false)
          }
        }
      )

      // Verificar sessão existente (callback já processou)
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return

      if (session) {
        setSessionReady(true)
        setChecking(false)
      } else {
        // Dar tempo extra para hash fragment ser processado
        setTimeout(() => {
          if (!mounted) return
          if (!sessionReady) {
            supabase.auth.getSession().then(({ data: { session: s } }) => {
              if (!mounted) return
              if (s) {
                setSessionReady(true)
              } else {
                setSessionError(true)
              }
              setChecking(false)
            })
          }
        }, 3000)
      }

      return () => {
        subscription.unsubscribe()
      }
    }

    checkSession()

    return () => {
      mounted = false
    }
  }, [isPrimeiroAcesso])

  // Validação visual da senha
  const hasMinLength = password.length >= 8
  const hasUpperCase = /[A-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0
  const allValid = hasMinLength && hasUpperCase && hasNumber && passwordsMatch

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!hasMinLength) {
      setError('A senha deve ter pelo menos 8 caracteres.')
      return
    }
    if (!hasUpperCase) {
      setError('A senha deve conter pelo menos uma letra maiúscula.')
      return
    }
    if (!hasNumber) {
      setError('A senha deve conter pelo menos um número.')
      return
    }
    if (!passwordsMatch) {
      setError('As senhas não conferem.')
      return
    }

    setLoading(true)

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      if (updateError.message.includes('same_password')) {
        setError('A nova senha deve ser diferente da senha atual.')
      } else {
        setError('Erro ao redefinir senha: ' + updateError.message)
      }
      setLoading(false)
      return
    }

    // Marcar que já trocou a senha (remover flag de primeiro acesso)
    await supabase.auth.updateUser({
      data: { senha_alterada: true, senha_temporaria: null }
    })

    setSucesso(true)
    setLoading(false)

    setTimeout(() => {
      router.push('/dashboard')
    }, 2000)
  }

  // Loading
  if (checking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-purple-900 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
        <p className="text-sm text-slate-400">Verificando link...</p>
      </div>
    )
  }

  // Link expirado
  if (sessionError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-purple-900">
        <div className="w-full max-w-md px-4">
          <div className="bg-slate-800 rounded-2xl shadow-2xl p-8 text-center space-y-4">
            <div className="flex justify-center mb-4">
              <Image src="/logo.png" alt="R.I.P. Pet" width={200} height={56} priority className="dark:invert" />
            </div>
            <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto" />
            <h1 className="text-lg font-semibold text-slate-200">Link expirado</h1>
            <p className="text-sm text-slate-400">
              Este link de redefinição já foi usado ou expirou.
              <br />Solicite um novo link abaixo.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <Link
                href="/esqueci-senha"
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 rounded-lg transition-colors text-center text-sm"
              >
                Solicitar novo link
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-slate-300 py-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar ao login
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-purple-900">
      <div className="w-full max-w-md px-4">
        <div className="bg-slate-800 rounded-2xl shadow-2xl p-8">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <Image src="/logo.png" alt="R.I.P. Pet" width={200} height={56} priority className="dark:invert" />
          </div>

          {sucesso ? (
            <div className="text-center space-y-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
              <h1 className="text-lg font-semibold text-slate-200">Senha redefinida!</h1>
              <p className="text-sm text-slate-400">
                Sua senha foi alterada com sucesso. Redirecionando...
              </p>
            </div>
          ) : (
            <>
              {isPrimeiroAcesso && (
                <div className="mb-5 p-3 rounded-lg flex items-start gap-3" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)' }}>
                  <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-300">Primeiro acesso</p>
                    <p className="text-xs text-amber-400/80 mt-0.5">Por segurança, troque sua senha padrão antes de continuar.</p>
                  </div>
                </div>
              )}

              <h1 className="text-center text-lg font-semibold text-slate-200 mb-2">
                {isPrimeiroAcesso ? 'Crie sua senha' : 'Redefinir senha'}
              </h1>
              <p className="text-center text-sm text-slate-400 mb-6">
                {isPrimeiroAcesso
                  ? 'Escolha uma senha segura para sua conta.'
                  : 'Escolha uma nova senha para sua conta.'}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Nova senha */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-400 mb-1">
                    Nova senha
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Digite sua nova senha"
                      required
                      autoFocus
                      className="w-full pl-10 pr-10 py-2.5 border border-slate-600 rounded-lg bg-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Indicadores de força */}
                  {password.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <div className={`w-1.5 h-1.5 rounded-full ${hasMinLength ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                        <span className={hasMinLength ? 'text-emerald-400' : 'text-slate-500'}>Mínimo 8 caracteres</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className={`w-1.5 h-1.5 rounded-full ${hasUpperCase ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                        <span className={hasUpperCase ? 'text-emerald-400' : 'text-slate-500'}>Uma letra maiúscula</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className={`w-1.5 h-1.5 rounded-full ${hasNumber ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                        <span className={hasNumber ? 'text-emerald-400' : 'text-slate-500'}>Um número</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirmar senha */}
                <div>
                  <label htmlFor="confirm" className="block text-sm font-medium text-slate-400 mb-1">
                    Confirmar nova senha
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                      id="confirm"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita a senha"
                      required
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-600 rounded-lg bg-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  {confirmPassword.length > 0 && (
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <div className={`w-1.5 h-1.5 rounded-full ${passwordsMatch ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      <span className={passwordsMatch ? 'text-emerald-400' : 'text-red-400'}>
                        {passwordsMatch ? 'Senhas conferem' : 'Senhas não conferem'}
                      </span>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="bg-red-900/30 text-red-400 text-sm rounded-lg p-3 text-center">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !allValid}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    isPrimeiroAcesso ? 'Criar senha' : 'Redefinir senha'
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function RedefinirSenhaPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-purple-900 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
        <p className="text-sm text-slate-400">Carregando...</p>
      </div>
    }>
      <RedefinirSenhaForm />
    </Suspense>
  )
}
