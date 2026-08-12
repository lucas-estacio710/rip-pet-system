'use client'

import { useEffect, useState } from 'react'
import { formatarBRL } from '@/lib/planos'

type Orcamento = {
  id: string
  pet_nome: string
  tipo_cremacao: 'individual' | 'coletiva'
  plano_nome: string | null
  plano_preco_congelado: number | null
  beneficio_tipo: string
  status: 'aberto' | 'expirado' | 'convertido'
  expira_em: string
  token_publico: string
  created_at: string
}

const SITUACAO: Record<string, { texto: string; cor: string; bg: string }> = {
  aberto: { texto: 'Aguardando o tutor', cor: '#b45309', bg: '#fffbeb' },
  convertido: { texto: 'Tutor aceitou', cor: '#059669', bg: '#ecfdf5' },
  expirado: { texto: 'Expirado', cor: '#78716a', bg: '#f4f2ef' },
}

function restante(iso: string) {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return null
  const h = Math.floor(ms / 3600000)
  if (h >= 24) return 'vale até amanhã'
  if (h >= 1) return `vale por ${h}h`
  return `vale por ${Math.max(1, Math.floor(ms / 60000))}min`
}

export default function OrcamentosPage() {
  const [lista, setLista] = useState<Orcamento[] | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/orcamentos')
      .then((r) => r.json())
      .then((j) => setLista(j.orcamentos ?? []))
      .catch(() => setLista([]))
  }, [])

  async function copiar(o: Orcamento) {
    await navigator.clipboard.writeText(`${window.location.origin}/o/${o.token_publico}`)
    setCopiado(o.id)
    setTimeout(() => setCopiado(null), 2000)
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="mb-6 text-xl font-semibold text-[var(--surface-900)]">Meus orçamentos</h1>

      {lista === null && <p className="text-sm text-[var(--surface-400)]">Carregando…</p>}

      {lista?.length === 0 && (
        <div className="rounded-[var(--radius-lg)] bg-white p-6 text-center shadow-[var(--shadow-sm)]">
          <p className="text-sm text-[var(--surface-500)]">
            Você ainda não fez nenhum orçamento.
          </p>
          <a href="/orcar"
            className="mt-4 inline-block rounded-[var(--radius-md)] bg-[var(--brand-600)] px-5 py-3 text-sm font-medium text-white">
            Fazer o primeiro
          </a>
        </div>
      )}

      <ul className="space-y-3">
        {lista?.map((o) => {
          const s = SITUACAO[o.status] ?? SITUACAO.aberto
          const falta = o.status === 'aberto' ? restante(o.expira_em) : null
          return (
            <li key={o.id} className="rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-sm)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-[var(--surface-900)]">{o.pet_nome}</p>
                  <p className="mt-0.5 text-sm text-[var(--surface-500)]">
                    {o.plano_nome} ·{' '}
                    {o.plano_preco_congelado != null && formatarBRL(Number(o.plano_preco_congelado))}
                  </p>
                </div>
                <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{ color: s.cor, background: s.bg }}>
                  {s.texto}
                </span>
              </div>

              {o.status === 'aberto' && (
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--surface-100)] pt-3">
                  <span className="text-xs text-[var(--surface-400)]">{falta}</span>
                  <button onClick={() => copiar(o)}
                    className="text-xs font-medium text-[var(--brand-600)]">
                    {copiado === o.id ? 'Link copiado' : 'Copiar link'}
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </main>
  )
}
