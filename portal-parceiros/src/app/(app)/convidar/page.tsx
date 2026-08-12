'use client'

import { useEffect, useState } from 'react'

type Convite = { id: string; nome: string; cidade: string; url: string; situacao: string }
type Dados = { ativo: boolean; cidades: string[]; ganhaBilhete: boolean; convites: Convite[] }

const SITUACAO: Record<string, { texto: string; cor: string }> = {
  aguardando: { texto: 'Aguardando cadastro', cor: '#b45309' },
  cadastrado: { texto: 'Cadastrado', cor: '#059669' },
  expirado: { texto: 'Expirado', cor: '#78716a' },
}

const inputCls =
  'w-full rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-white px-4 py-3 text-base outline-none transition focus:border-[var(--brand-400)]'

export default function ConvidarPage() {
  const [d, setD] = useState<Dados | null>(null)
  const [nome, setNome] = useState('')
  const [cidade, setCidade] = useState('')
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [novo, setNovo] = useState<{ url: string; nome: string } | null>(null)

  async function carregar() {
    const r = await fetch('/api/convites/mgm')
    setD(await r.json())
  }
  useEffect(() => { carregar() }, [])

  async function gerar(e: React.FormEvent) {
    e.preventDefault()
    setGerando(true); setErro(null)
    const res = await fetch('/api/convites/mgm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, cidade }),
    })
    const j = await res.json()
    setGerando(false)
    if (!res.ok) { setErro(j.erro ?? 'Falha ao gerar.'); return }
    setNovo({ url: j.url, nome })
    setNome(''); carregar()
  }

  if (!d) return <main className="p-6 text-center text-sm text-[var(--surface-400)]">Carregando…</main>

  if (!d.ativo) {
    return (
      <main className="mx-auto max-w-md px-5 py-10 text-center">
        <p className="text-sm text-[var(--surface-500)]">
          O convite de colegas não está disponível na sua região no momento.
        </p>
      </main>
    )
  }

  if (novo) {
    const msg = `Oi! Estou no programa de parceiros da RIP Pet e queria te indicar. É rápido de entrar: ${novo.url}`
    return (
      <main className="mx-auto w-full max-w-md px-5 py-10 text-center">
        <h1 className="text-xl font-semibold text-[var(--surface-900)]">
          Convite pronto para {novo.nome.split(' ')[0]}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--surface-500)]">
          O convite vale para uma pessoa só e expira em 30 dias.
        </p>
        <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"
          className="mt-8 block w-full rounded-[var(--radius-md)] bg-[#25D366] px-5 py-4 text-sm font-semibold text-white">
          Enviar pelo WhatsApp
        </a>
        <button onClick={() => navigator.clipboard.writeText(novo.url)}
          className="mt-3 w-full rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-white px-5 py-4 text-sm font-medium text-[var(--surface-800)]">
          Copiar link
        </button>
        <button onClick={() => setNovo(null)}
          className="mt-6 text-sm text-[var(--surface-400)] underline">
          Convidar outra pessoa
        </button>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-xl font-semibold text-[var(--surface-900)]">Indicar um colega</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--surface-500)]">
        Conhece alguém que também cuida de pets e se daria bem no programa?
        {d.ganhaBilhete && ' Quando ele se cadastrar, você ganha um bilhete no sorteio.'}
      </p>

      <form onSubmit={gerar} className="mt-6 space-y-3">
        <input required value={nome} onChange={e => setNome(e.target.value)}
          placeholder="Nome do colega" className={inputCls} />
        <select required value={cidade} onChange={e => setCidade(e.target.value)} className={inputCls}>
          <option value="">Onde ele atende?</option>
          {d.cidades.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button type="submit" disabled={gerando}
          className="w-full rounded-[var(--radius-md)] bg-[var(--brand-600)] px-5 py-3.5 text-sm font-medium text-white disabled:opacity-60">
          {gerando ? 'Gerando…' : 'Gerar convite'}
        </button>
        {erro && <p role="alert" className="text-sm text-[var(--erro)]">{erro}</p>}
      </form>

      {d.convites.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-[var(--surface-700)]">Quem você já convidou</h2>
          <ul className="space-y-2">
            {d.convites.map(c => {
              const s = SITUACAO[c.situacao] ?? SITUACAO.aguardando
              return (
                <li key={c.id} className="flex items-center gap-3 rounded-[var(--radius-md)] bg-white px-4 py-3 shadow-[var(--shadow-xs)]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--surface-800)]">{c.nome}</p>
                    <p className="text-xs text-[var(--surface-400)]">{c.cidade}</p>
                  </div>
                  <span className="shrink-0 text-xs font-medium" style={{ color: s.cor }}>{s.texto}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </main>
  )
}
