'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Lock, Loader2, CheckCircle2, Eye, EyeOff, ArrowLeft } from 'lucide-react'

export default function RedefinirSenhaPage() {
  const router = useRouter()
  const supabase = createClient()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [sessionError, setSessionError] = useState(false)

  // Verificar se tem sessão válida (o callback já trocou o code por sessão)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true)
      } else {
        setSessionError(true)
      }
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.')
      return
    }

    if (!/[A-Z]/.test(password)) {
      setError('A senha deve conter pelo menos uma letra maiúscula.')
      return
    }

    if (!/[0-9]/.test(password)) {
      setError('A senha deve conter pelo menos um número.')
      return
    }

    if (password !== confirmPassword) {
      setError('As senhas não conferem.')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError('Erro ao redefinir senha: ' + error.message)
      setLoading(false)
      return
    }

    // Invalidar outras sessões (sign out global e re-login com a nova senha)
    await supabase.auth.signOut({ scope: 'others' })

    setSucesso(true)
    setLoading(false)

    // Redireciona pro dashboard após 3 segundos
    setTimeout(() => {
      router.push('/dashboard')
    }, 3000)
  }

  if (sessionError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-purple-900">
        <div className="w-full max-w-md px-4">
          <div className="bg-slate-800 rounded-2xl shadow-2xl p-8 text-center space-y-4">
            <div className="flex justify-center mb-6">
              <Image src="/logo.png" alt="R.I.P. Pet" width={200} height={56} priority className="dark:invert" />
            </div>
            <h1 className="text-lg font-semibold text-slate-200">Link expirado</h1>
            <p className="text-sm text-slate-400">
              Este link de redefinição já foi usado ou expirou. Solicite um novo.
            </p>
            <Link
              href="/esqueci-senha"
              className="inline-flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Solicitar novo link
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-purple-900">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
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
              <h1 className="text-center text-lg font-semibold text-slate-200 mb-2">
                Redefinir senha
              </h1>
              <p className="text-center text-sm text-slate-400 mb-6">
                Escolha uma nova senha para sua conta.
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
                      placeholder="Mín. 8 caracteres, 1 maiúscula, 1 número"
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
                </div>

                {error && (
                  <div className="bg-red-900/30 text-red-400 text-sm rounded-lg p-3 text-center">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Redefinir senha'
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
