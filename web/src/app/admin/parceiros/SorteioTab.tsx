'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Gift, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { Skeleton } from '@/components/ui/Skeleton'

type Bilhete = {
  id: string; codigo: string; origem: string
  contrato_codigo: string | null; contato_id: string
  contatos: { nome: string } | null
}
type Sorteio = {
  id: string; mes_ref: string; premio_nome: string | null; premio_descricao: string | null
  premio_imagem_url: string | null; status: 'aberto' | 'encerrado'; bilhete_vencedor_id: string | null
}

const inp = 'w-full rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-[var(--surface-50)] px-3 py-2.5 text-sm text-[var(--surface-800)] outline-none focus:border-[var(--brand-500)]'

export default function SorteioTab() {
  const supabase = createClient()
  const { currentUnit } = useUnit()

  const [mes, setMes] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [sorteio, setSorteio] = useState<Sorteio | null>(null)
  const [bilhetes, setBilhetes] = useState<Bilhete[] | null>(null)
  const [nome, setNome] = useState('')
  const [desc, setDesc] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [escolhido, setEscolhido] = useState('')

  const carregar = useCallback(async () => {
    if (!currentUnit) return
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/admin/parceiros/sorteio?unidade_id=${currentUnit.id}&mes=${mes}`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    const j = await res.json()
    if (!res.ok) { setErro(j.error); return }
    setSorteio(j.sorteio); setBilhetes(j.bilhetes ?? [])
    setNome(j.sorteio?.premio_nome ?? ''); setDesc(j.sorteio?.premio_descricao ?? '')
    setEscolhido(j.sorteio?.bilhete_vencedor_id ?? '')
  }, [currentUnit, supabase, mes])

  useEffect(() => { carregar() }, [carregar])

  async function salvarPremio() {
    if (!currentUnit) return
    setSalvando(true); setErro(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/parceiros/sorteio', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ unidade_id: currentUnit.id, mes_ref: mes, premio_nome: nome, premio_descricao: desc }),
    })
    const j = await res.json()
    setSalvando(false)
    if (!res.ok) { setErro(j.error ?? 'Falha ao salvar.'); return }
    setSorteio(j.sorteio)
  }

  async function definirVencedor() {
    if (!sorteio || !escolhido) return
    setSalvando(true); setErro(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/parceiros/sorteio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ sorteio_id: sorteio.id, bilhete_id: escolhido }),
    })
    setSalvando(false)
    if (!res.ok) { setErro('Falha ao encerrar.'); return }
    carregar()
  }

  if (bilhetes === null) return <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>

  const porParceiro = new Map<string, { nome: string; qtd: number }>()
  for (const b of bilhetes) {
    const k = b.contato_id
    const atual = porParceiro.get(k) ?? { nome: b.contatos?.nome ?? '—', qtd: 0 }
    porParceiro.set(k, { ...atual, qtd: atual.qtd + 1 })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-[var(--surface-400)]">Mês</label>
        <input type="month" value={mes.slice(0, 7)}
          onChange={e => setMes(`${e.target.value}-01`)}
          className={inp + ' max-w-[180px]'} />
      </div>

      {/* Prêmio */}
      <section className="rounded-[var(--radius-lg)] bg-[var(--surface-0)] p-4 shadow-[var(--shadow-sm)]">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--surface-700)]">
          <Gift className="h-4 w-4 text-[var(--brand-500)]" /> Prêmio do mês
        </h2>
        <p className="mb-3 text-xs text-[var(--surface-400)]">
          Aparece na aba Sorteio do parceiro. Sem prêmio cadastrado, ele vê &quot;estamos preparando&quot;.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={nome} onChange={e => setNome(e.target.value)}
            placeholder="Ex: Massagem relaxante" className={inp} />
          <input value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Detalhe (opcional)" className={inp} />
        </div>
        <button onClick={salvarPremio} disabled={salvando}
          className="mt-3 flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--brand-600)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar prêmio
        </button>
      </section>

      {/* Bilhetes */}
      <section className="rounded-[var(--radius-lg)] bg-[var(--surface-0)] p-4 shadow-[var(--shadow-sm)]">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--surface-700)]">
          <Trophy className="h-4 w-4 text-[var(--brand-500)]" /> Bilhetes do mês
        </h2>
        <p className="mb-3 text-xs text-[var(--surface-400)]">
          {bilhetes.length} bilhetes · {porParceiro.size} parceiros concorrendo
        </p>

        {sorteio?.status === 'encerrado' ? (
          <p className="rounded-[var(--radius-md)] bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
            Resultado publicado — o parceiro já vê o bilhete vencedor no portal.
          </p>
        ) : bilhetes.length === 0 ? (
          <p className="text-sm text-[var(--surface-400)]">Nenhum bilhete emitido neste mês ainda.</p>
        ) : (
          <>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {bilhetes.map(b => (
                <label key={b.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-sm transition ${escolhido === b.id ? 'bg-[var(--brand-500)]/15' : 'hover:bg-[var(--surface-50)]'}`}>
                  <input type="radio" name="vencedor" value={b.id}
                    checked={escolhido === b.id} onChange={() => setEscolhido(b.id)}
                    className="accent-[var(--brand-500)]" />
                  <span className="font-mono text-xs text-[var(--surface-700)]">{b.codigo}</span>
                  <span className="min-w-0 flex-1 truncate text-[var(--surface-500)]">
                    {b.contatos?.nome}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--surface-400)]">
                    {b.origem === 'mgm' ? 'indicou colega' : b.contrato_codigo}
                  </span>
                </label>
              ))}
            </div>
            <button onClick={definirVencedor} disabled={!escolhido || salvando || !sorteio}
              className="mt-4 flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--brand-600)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Publicar resultado
            </button>
            {!sorteio && (
              <p className="mt-2 text-xs text-amber-400">
                Cadastre o prêmio primeiro — é ele que cria o sorteio do mês.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
