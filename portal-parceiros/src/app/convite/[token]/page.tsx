'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CARGOS } from '@/lib/tipos'

type DadosConvite = {
  nomeIndicado: string
  cidadeAtuacao: string
  unidadeNome: string
  estabelecimentoNome: string | null
}

type Etapa = 'carregando' | 'invalido' | 'conta' | 'perfil' | 'pronto'

const input =
  'w-full rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--brand-400)]'

export default function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const supabase = createClient()

  const [etapa, setEtapa] = useState<Etapa>('carregando')
  const [convite, setConvite] = useState<DadosConvite | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // conta
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')

  // perfil
  const [cargo, setCargo] = useState('')
  const [cargoOutro, setCargoOutro] = useState('')
  const [crmv, setCrmv] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [pixChave, setPixChave] = useState('')
  const [instagram, setInstagram] = useState('')
  const [aceite, setAceite] = useState(false)

  const carregar = useCallback(async () => {
    const res = await fetch(`/api/publico/convite/${token}`)
    const json = await res.json()
    if (!res.ok || !json.valido) {
      setErro(json.mensagem ?? 'Convite inválido.')
      setEtapa('invalido')
      return
    }
    setConvite(json)
    const { data: { user } } = await supabase.auth.getUser()
    setEtapa(user ? 'perfil' : 'conta')
  }, [token, supabase])

  useEffect(() => { carregar() }, [carregar])

  async function criarConta(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)

    const res = await fetch(`/api/publico/convite/${token}/criar-conta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha }),
    })
    const json = await res.json()

    if (!res.ok && !json.jaExiste) {
      setErro(json.erro ?? 'Não consegui criar sua conta.')
      setEnviando(false)
      return
    }

    // Conta criada (ou já existia): entra e segue pro perfil.
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    setEnviando(false)
    if (error) {
      setErro(
        json.jaExiste
          ? 'Já existe uma conta com este e-mail, mas a senha não confere.'
          : 'Conta criada, mas não consegui entrar. Tente pela tela de login.'
      )
      return
    }
    setEtapa('perfil')
  }

  async function entrarComGoogle() {
    setErro(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // volta pra ESTA página: o convite continua de pé e cai direto no perfil
      options: { redirectTo: `${window.location.origin}/convite/${token}` },
    })
    if (error) setErro('Não consegui abrir o login do Google.')
  }

  async function concluir(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)

    const res = await fetch(`/api/convite/${token}/aceitar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cargo,
        cargoOutro,
        crmv,
        whatsapp,
        pixChave,
        instagram,
        aceiteTermos: aceite,
      }),
    })
    const json = await res.json()
    setEnviando(false)

    if (!res.ok) { setErro(json.erro ?? 'Falha ao concluir.'); return }
    setEtapa('pronto')
  }

  if (etapa === 'carregando') {
    return (
      <main className="min-h-dvh flex items-center justify-center px-6">
        <p className="text-sm text-[var(--surface-400)]">Abrindo seu convite…</p>
      </main>
    )
  }

  if (etapa === 'invalido') {
    return (
      <main className="min-h-dvh flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-xl font-semibold text-[var(--surface-900)]">Convite indisponível</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--surface-500)]">{erro}</p>
        </div>
      </main>
    )
  }

  if (etapa === 'pronto') {
    return (
      <main className="min-h-dvh flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-semibold text-[var(--surface-900)]">
            Bem-vindo, {convite?.nomeIndicado.split(' ')[0]}!
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--surface-500)]">
            Seu cadastro está pronto. A partir de agora você pode orçar na hora e
            acompanhar suas indicações por aqui.
          </p>
          <a href="/"
            className="mt-8 inline-block w-full rounded-[var(--radius-md)] bg-[var(--brand-600)] px-5 py-3 text-sm font-medium text-white">
            Começar
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-sm px-6 py-10">
      <header className="mb-8">
        <p className="text-sm text-[var(--surface-500)]">Convite para</p>
        <h1 className="text-2xl font-semibold text-[var(--surface-900)]">
          {convite?.nomeIndicado}
        </h1>
        <p className="mt-2 text-sm text-[var(--surface-500)]">
          {convite?.estabelecimentoNome ? `${convite.estabelecimentoNome} · ` : ''}
          {convite?.cidadeAtuacao}
        </p>
      </header>

      {etapa === 'conta' && (
        <>
          <p className="mb-5 text-sm leading-relaxed text-[var(--surface-600)]">
            Primeiro, crie seu acesso. Leva 30 segundos.
          </p>

          <button
            onClick={entrarComGoogle}
            className="mb-5 w-full flex items-center justify-center gap-3 rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-white px-4 py-3 text-sm font-medium text-[var(--surface-800)] shadow-[var(--shadow-sm)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
              <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
              <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
              <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
            </svg>
            Continuar com Google
          </button>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--surface-200)]" />
            <span className="text-xs text-[var(--surface-400)]">ou crie uma senha</span>
            <span className="h-px flex-1 bg-[var(--surface-200)]" />
          </div>

          <form onSubmit={criarConta} className="space-y-3">
            <input type="email" required value={email} autoComplete="email"
              onChange={(e) => setEmail(e.target.value)} placeholder="Seu e-mail" className={input} />
            <input type="password" required minLength={8} value={senha} autoComplete="new-password"
              onChange={(e) => setSenha(e.target.value)} placeholder="Crie uma senha (8+ caracteres)" className={input} />
            <button type="submit" disabled={enviando}
              className="w-full rounded-[var(--radius-md)] bg-[var(--brand-600)] px-4 py-3 text-sm font-medium text-white disabled:opacity-60">
              {enviando ? 'Criando…' : 'Criar meu acesso'}
            </button>
          </form>
        </>
      )}

      {etapa === 'perfil' && (
        <form onSubmit={concluir} className="space-y-3">
          <p className="mb-2 text-sm leading-relaxed text-[var(--surface-600)]">
            Agora só faltam seus dados.
          </p>

          <select required value={cargo} onChange={(e) => setCargo(e.target.value)} className={input}>
            <option value="">Qual seu cargo na clínica?</option>
            {CARGOS.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
          </select>

          {cargo === 'outro' && (
            <input required value={cargoOutro} onChange={(e) => setCargoOutro(e.target.value)}
              placeholder="Qual cargo?" className={input} />
          )}

          {cargo === 'veterinario' && (
            <input value={crmv} onChange={(e) => setCrmv(e.target.value)}
              placeholder="CRMV (opcional)" className={input} />
          )}

          <input required type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="WhatsApp" autoComplete="tel" className={input} />

          <div>
            <input required value={pixChave} onChange={(e) => setPixChave(e.target.value)}
              placeholder="Sua chave pix" className={input} />
            <p className="mt-1.5 px-1 text-xs leading-relaxed text-[var(--surface-400)]">
              É a chave <strong>sua</strong>, pessoal — é por ela que pagamos suas comissões.
            </p>
          </div>

          <input value={instagram} onChange={(e) => setInstagram(e.target.value)}
            placeholder="@ do seu Instagram (opcional)" className={input} />

          <label className="flex items-start gap-3 py-2 text-sm leading-relaxed text-[var(--surface-600)]">
            <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand-600)]" />
            <span>
              Li e aceito os{' '}
              <a href="/termos" target="_blank" className="underline">termos de uso e privacidade</a>.
            </span>
          </label>

          <button type="submit" disabled={enviando || !aceite}
            className="w-full rounded-[var(--radius-md)] bg-[var(--brand-600)] px-4 py-3 text-sm font-medium text-white disabled:opacity-60">
            {enviando ? 'Concluindo…' : 'Concluir cadastro'}
          </button>
        </form>
      )}

      {erro && <p role="alert" className="mt-4 text-center text-sm text-[var(--erro)]">{erro}</p>}
    </main>
  )
}
