'use client'

import { useEffect, useState } from 'react'

type Material = { id: string; titulo: string; descricao: string | null; url: string; capa: string | null }

export default function MateriaisPage() {
  const [d, setD] = useState<{ ativo: boolean; materiais: Material[] } | null>(null)

  useEffect(() => {
    fetch('/api/materiais').then(r => r.json()).then(setD).catch(() => setD({ ativo: false, materiais: [] }))
  }, [])

  if (!d) return <main className="p-6 text-center text-sm text-[var(--surface-400)]">Carregando…</main>

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-xl font-semibold text-[var(--surface-900)]">Materiais</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--surface-500)]">
        Para imprimir ou enviar ao tutor no momento da perda.
      </p>

      {d.materiais.length === 0 ? (
        <p className="mt-8 rounded-[var(--radius-lg)] bg-white p-6 text-center text-sm text-[var(--surface-500)] shadow-[var(--shadow-sm)]">
          Ainda não há materiais publicados. Em breve.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {d.materiais.map(m => (
            <li key={m.id}>
              <a href={m.url} target="_blank" rel="noreferrer"
                className="flex items-center gap-4 rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-sm)]">
                {m.capa ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.capa} alt="" className="h-16 w-16 shrink-0 rounded-[var(--radius-md)] object-cover" />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-100)] text-2xl">
                    📄
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[var(--surface-900)]">{m.titulo}</p>
                  {m.descricao && (
                    <p className="mt-0.5 text-sm leading-relaxed text-[var(--surface-500)]">{m.descricao}</p>
                  )}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
