'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function EntrarPage() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function entrarComGoogle() {
    setErro(null)
    setCarregando(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setErro('Não consegui abrir o login do Google. Tente de novo.')
      setCarregando(false)
    }
  }

  async function entrarComSenha(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) {
      setErro('E-mail ou senha incorretos.')
      setCarregando(false)
      return
    }
    window.location.href = '/'
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-[var(--surface-900)]">
            RIP Pet Parceiros
          </h1>
          <p className="mt-2 text-sm text-[var(--surface-500)]">
            Bem-vindo de volta. Entre para orçar e acompanhar suas indicações.
          </p>
        </header>

        <button
          onClick={entrarComGoogle}
          disabled={carregando}
          className="w-full flex items-center justify-center gap-3 rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-white px-4 py-3 text-sm font-medium text-[var(--surface-800)] shadow-[var(--shadow-sm)] transition hover:bg-[var(--surface-50)] disabled:opacity-60"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
            <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
            <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
            <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
          </svg>
          Entrar com Google
        </button>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--surface-200)]" />
          <span className="text-xs text-[var(--surface-400)]">ou</span>
          <span className="h-px flex-1 bg-[var(--surface-200)]" />
        </div>

        <form onSubmit={entrarComSenha} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Seu e-mail"
            autoComplete="email"
            className="w-full rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--brand-400)]"
          />
          <input
            type="password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Sua senha"
            autoComplete="current-password"
            className="w-full rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--brand-400)]"
          />
          <button
            type="submit"
            disabled={carregando}
            className="w-full rounded-[var(--radius-md)] bg-[var(--brand-600)] px-4 py-3 text-sm font-medium text-white transition hover:bg-[var(--brand-700)] disabled:opacity-60"
          >
            {carregando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        {erro && (
          <p role="alert" className="mt-4 text-center text-sm text-[var(--erro)]">
            {erro}
          </p>
        )}

        <p className="mt-8 text-center text-xs leading-relaxed text-[var(--surface-400)]">
          O acesso é por convite. Se você ainda não tem cadastro, fale com a equipe
          da RIP Pet que passa na sua clínica.
        </p>
      </div>
    </main>
  )
}
