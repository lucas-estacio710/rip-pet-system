'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Check, X, HandHeart } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

type Reiv = {
  id: string; descricao: string; created_at: string
  contatos: { nome: string; whatsapp: string | null } | null
}
type Candidato = {
  id: string; codigo: string; pet_nome: string; tutor_nome: string
  data_contrato: string; tipo_cremacao: string
}

const dataBR = (iso: string) => iso ? iso.slice(0, 10).split('-').reverse().join('/') : ''

export default function ReivindicacoesTab() {
  const supabase = createClient()
  const { currentUnit } = useUnit()

  const [pendentes, setPendentes] = useState<Reiv[] | null>(null)
  const [candidatos, setCandidatos] = useState<Candidato[]>([])
  const [escolha, setEscolha] = useState<Record<string, string>>({})
  const [processando, setProcessando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!currentUnit) return
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/admin/parceiros/reivindicacoes?unidade_id=${currentUnit.id}`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    const j = await res.json()
    if (!res.ok) { setErro(j.error); setPendentes([]); return }
    setPendentes(j.pendentes ?? []); setCandidatos(j.candidatos ?? [])
  }, [currentUnit, supabase])

  useEffect(() => { carregar() }, [carregar])

  async function resolver(id: string, acao: 'aprovar' | 'recusar') {
    setProcessando(id); setErro(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/parceiros/reivindicacoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ id, acao, contrato_id: acao === 'aprovar' ? escolha[id] : undefined }),
    })
    const j = await res.json()
    setProcessando(null)
    if (!res.ok) { setErro(j.error ?? 'Falha ao resolver.'); return }
    carregar()
  }

  if (pendentes === null) return <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>

  return (
    <>
      <p className="mb-4 text-xs text-[var(--surface-400)]">
        Quando o tutor liga direto, sem usar o link, o parceiro pode reivindicar a indicação.
        Aprovar vincula o contrato e calcula a comissão automaticamente.
      </p>

      {erro && <p role="alert" className="mb-4 text-sm text-red-400">{erro}</p>}

      {pendentes.length === 0 ? (
        <EmptyState icon={HandHeart} title="Nenhuma reivindicação pendente"
          description="Tudo em dia por aqui." />
      ) : (
        <ul className="space-y-3">
          {pendentes.map(r => (
            <li key={r.id} className="rounded-[var(--radius-lg)] bg-[var(--surface-0)] p-4 shadow-[var(--shadow-sm)]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-[var(--surface-800)]">{r.contatos?.nome}</p>
                <span className="text-xs text-[var(--surface-400)]">{dataBR(r.created_at)}</span>
              </div>
              <p className="mt-2 rounded-[var(--radius-sm)] bg-[var(--surface-50)] px-3 py-2 text-sm leading-relaxed text-[var(--surface-600)]">
                “{r.descricao}”
              </p>

              <select value={escolha[r.id] ?? ''}
                onChange={e => setEscolha(p => ({ ...p, [r.id]: e.target.value }))}
                className="mt-3 w-full rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-[var(--surface-50)] px-3 py-2.5 text-sm text-[var(--surface-800)] outline-none focus:border-[var(--brand-500)]">
                <option value="">Vincular a qual contrato?</option>
                {candidatos.map(c => (
                  <option key={c.id} value={c.id}>
                    {dataBR(c.data_contrato)} · {c.pet_nome} · {c.tutor_nome} ({c.codigo})
                  </option>
                ))}
              </select>
              {candidatos.length === 0 && (
                <p className="mt-1 text-xs text-amber-400">
                  Nenhum contrato sem indicador nos últimos 90 dias.
                </p>
              )}

              <div className="mt-3 flex gap-2">
                <button onClick={() => resolver(r.id, 'aprovar')}
                  disabled={!escolha[r.id] || processando === r.id}
                  className="flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40">
                  {processando === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Aprovar
                </button>
                <button onClick={() => resolver(r.id, 'recusar')} disabled={processando === r.id}
                  className="flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--surface-200)] px-4 py-2.5 text-sm text-[var(--surface-500)] disabled:opacity-40">
                  <X className="h-4 w-4" /> Recusar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
