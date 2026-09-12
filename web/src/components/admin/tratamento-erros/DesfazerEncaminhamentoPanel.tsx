'use client'

// Tratativa: DESFAZER ENCAMINHAMENTO — devolve a viagem inteira de Pinda para Ativo.
// docs/ENCAMINHAMENTO_NO_PIPELINE.md §4.3.
//
// Fluxo igual às outras tratativas: buscar → raio-x → executar. O raio-x mostra o que
// BLOQUEIA antes de o botão existir, em vez de deixar o super_admin clicar e levar erro.
import { useState } from 'react'
import { Search, Loader2, AlertTriangle, RotateCcw, CheckCircle2, Truck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type EncBusca = {
  id: string
  numero: string
  data: string | null
  responsavel: string | null
  status: string | null
  quantidade_pets: number | null
  codigo_unidade: string
}

type PetDaViagem = {
  id: string
  codigo: string | null
  pet_nome: string | null
  tutor_nome: string | null
  numero_lacre: string | null
  status: string | null
  contrato_gc: { etapa: string | null; contato_status: string | null } | null
}

type Analise = {
  supinda: { id: string; numero: string; data: string | null; responsavel: string | null; status: string | null; observacoes: string | null }
  unidade: { codigo: string; nome: string } | null
  pets: PetDaViagem[]
  usam_como_volta: number
  foraDePinda: PetDaViagem[]
  gcAndou: PetDaViagem[]
  podeDesfazer: boolean
}

const LABEL_STATUS: Record<string, string> = {
  planejada: 'Planejada',
  embarcada: 'Embarcada',
  embarcada_ida: 'Embarcada (ida)',
  ida_finalizada: 'Ida finalizada',
  finalizada: 'Finalizada',
}

export default function DesfazerEncaminhamentoPanel() {
  const supabase = createClient()
  const [q, setQ] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<EncBusca[]>([])
  const [analise, setAnalise] = useState<Analise | null>(null)
  const [carregandoAnalise, setCarregandoAnalise] = useState(false)
  const [executando, setExecutando] = useState(false)
  const [feito, setFeito] = useState<{ numero: string; pets: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function comToken(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' }
  }

  async function buscar() {
    if (!q.trim()) return
    setBuscando(true); setErro(null); setAnalise(null); setFeito(null)
    try {
      const r = await fetch(`/api/admin/tratamento-erros/desfazer-encaminhamento?q=${encodeURIComponent(q.trim())}`, { headers: await comToken() })
      const j = await r.json()
      if (!r.ok) { setErro(j.error || 'Erro na busca'); return }
      setResultados(j.encaminhamentos || [])
    } finally { setBuscando(false) }
  }

  async function abrirAnalise(id: string) {
    setCarregandoAnalise(true); setErro(null); setAnalise(null)
    try {
      const r = await fetch(`/api/admin/tratamento-erros/desfazer-encaminhamento?supinda_id=${id}&_analise=1`, { headers: await comToken() })
      const j = await r.json()
      if (!r.ok) { setErro(j.error || 'Erro ao analisar'); return }
      setAnalise(j)
    } finally { setCarregandoAnalise(false) }
  }

  async function executar() {
    if (!analise) return
    const n = analise.pets.length
    if (!confirm(`Desfazer o encaminhamento ${analise.supinda.numero}?\n\n${n} pet${n > 1 ? 's voltam' : ' volta'} de Pinda para Ativo, a data da ida é apagada e a viagem volta a ficar editável.\n\nA viagem pode ser montada e enviada de novo depois.`)) return
    setExecutando(true); setErro(null)
    try {
      const r = await fetch('/api/admin/tratamento-erros/desfazer-encaminhamento', {
        method: 'POST',
        headers: await comToken(),
        body: JSON.stringify({ supinda_id: analise.supinda.id }),
      })
      const j = await r.json()
      if (!r.ok) {
        setErro(j.error || 'Erro ao desfazer')
        // 409 = as travas mudaram no meio do caminho; recarrega o raio-x pra mostrar o quê.
        if (r.status === 409) await abrirAnalise(analise.supinda.id)
        return
      }
      setFeito({ numero: j.numero, pets: j.pets_devolvidos })
      setAnalise(null)
      setResultados([])
    } finally { setExecutando(false) }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-[var(--surface-50)] p-3">
        <p className="text-xs text-[var(--surface-500)] leading-relaxed">
          Devolve <strong>a viagem inteira</strong> de Pinda para Ativo: os pets voltam a{' '}
          <code className="text-[11px]">ativo</code>, a data da ida é apagada e o encaminhamento volta a{' '}
          <code className="text-[11px]">planejada</code>, reeditável. Serve para quando o
          &quot;Enviar para Matriz&quot; foi clicado por engano — ele é irreversível na tela de propósito.
        </p>
      </div>

      {/* Busca */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--surface-400)]" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') buscar() }}
            placeholder="Número da viagem (ST172), nome do pet, tutor ou lacre"
            className="w-full pl-9 pr-3 py-2 rounded-[var(--radius-md)] border text-sm"
            style={{ background: 'var(--surface-0)', borderColor: 'var(--surface-200)', color: 'var(--surface-700)' }}
          />
        </div>
        <button
          onClick={buscar}
          disabled={buscando || !q.trim()}
          className="px-4 py-2 rounded-[var(--radius-md)] text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
        >
          {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
        </button>
      </div>

      {erro && (
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-red-500/40 bg-red-950/30 px-3 py-2.5">
          <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-200 leading-relaxed">{erro}</p>
        </div>
      )}

      {feito && (
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-emerald-500/40 bg-emerald-950/30 px-3 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-emerald-200 leading-relaxed">
            <strong>{feito.numero} desfeito.</strong> {feito.pets} pet{feito.pets > 1 ? 's voltaram' : ' voltou'} para Ativo
            e a viagem está editável de novo no Pipeline.
          </p>
        </div>
      )}

      {/* Resultados */}
      {resultados.length > 0 && !analise && (
        <div className="rounded-[var(--radius-md)] border divide-y" style={{ borderColor: 'var(--surface-200)' }}>
          {resultados.map(e => (
            <button
              key={e.id}
              onClick={() => abrirAnalise(e.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-100)]"
            >
              <Truck className="h-4 w-4 text-[var(--surface-400)] flex-shrink-0" />
              <span className="text-sm font-bold text-[var(--surface-700)]">{e.numero}</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--surface-100)] text-[var(--surface-500)]">{e.codigo_unidade}</span>
              <span className="text-xs text-[var(--surface-400)]">{e.data ? e.data.slice(0, 10).split('-').reverse().join('/') : 'sem data'}</span>
              <span className="text-xs text-[var(--surface-400)] flex-1 truncate">{e.responsavel || ''}</span>
              <span className="text-[11px] font-semibold text-[var(--surface-500)]">{LABEL_STATUS[e.status || ''] || e.status}</span>
              <span className="text-xs text-[var(--surface-400)]">{e.quantidade_pets ?? 0} pets</span>
            </button>
          ))}
        </div>
      )}

      {carregandoAnalise && (
        <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline-block text-[var(--surface-400)]" /></div>
      )}

      {/* Raio-x */}
      {analise && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-[var(--surface-700)]">{analise.supinda.numero}</span>
            {analise.unidade && <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--surface-100)] text-[var(--surface-500)]">{analise.unidade.nome}</span>}
            <span className="text-xs text-[var(--surface-400)]">
              {analise.supinda.data ? analise.supinda.data.slice(0, 10).split('-').reverse().join('/') : 'sem data'}
              {analise.supinda.responsavel ? ` · ${analise.supinda.responsavel}` : ''}
            </span>
            <span className="text-[11px] font-semibold text-[var(--surface-500)]">{LABEL_STATUS[analise.supinda.status || ''] || analise.supinda.status}</span>
            <button onClick={() => setAnalise(null)} className="ml-auto text-xs text-[var(--surface-400)] hover:text-[var(--surface-700)] underline">voltar à busca</button>
          </div>

          {/* O que bloqueia — vem ANTES da lista, porque é o que decide */}
          {analise.gcAndou.length > 0 && (
            <div className="rounded-[var(--radius-md)] border border-red-500/40 bg-red-950/30 px-3 py-2.5">
              <p className="text-xs text-red-200 font-semibold mb-1 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                A Matriz já começou a trabalhar em {analise.gcAndou.length} pet{analise.gcAndou.length > 1 ? 's' : ''} — desfazer apagaria isso
              </p>
              <ul className="text-[11px] text-red-200/90 space-y-0.5 mt-1.5">
                {analise.gcAndou.map(p => (
                  <li key={p.id}>
                    • {p.pet_nome || 'sem nome'} — GC em <strong>{p.contrato_gc?.etapa || '?'}</strong>
                    {p.contrato_gc?.contato_status ? `, tutor ${p.contrato_gc.contato_status}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analise.foraDePinda.length > 0 && (
            <div className="rounded-[var(--radius-md)] border border-red-500/40 bg-red-950/30 px-3 py-2.5">
              <p className="text-xs text-red-200 font-semibold mb-1 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                {analise.foraDePinda.length} pet{analise.foraDePinda.length > 1 ? 's já saíram' : ' já saiu'} de Pinda
              </p>
              <ul className="text-[11px] text-red-200/90 space-y-0.5 mt-1.5">
                {analise.foraDePinda.map(p => (
                  <li key={p.id}>• {p.pet_nome || 'sem nome'} — agora em <strong>{p.status}</strong></li>
                ))}
              </ul>
            </div>
          )}

          {analise.usam_como_volta > 0 && (
            <div className="rounded-[var(--radius-md)] border border-amber-500/40 bg-amber-950/30 px-3 py-2.5">
              <p className="text-xs text-amber-200 leading-relaxed">
                Esta viagem também é a <strong>volta</strong> de {analise.usam_como_volta} pet
                {analise.usam_como_volta > 1 ? 's' : ''}. O desfazer mexe só na <strong>ida</strong> —
                esses vínculos de volta ficam como estão.
              </p>
            </div>
          )}

          {/* Lista de pets */}
          <div className="rounded-[var(--radius-md)] border overflow-hidden" style={{ borderColor: 'var(--surface-200)' }}>
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase text-[var(--surface-400)]" style={{ background: 'var(--surface-100)' }}>
              {analise.pets.length} pet{analise.pets.length !== 1 ? 's' : ''} na ida
            </div>
            <div className="max-h-[300px] overflow-y-auto divide-y" style={{ borderColor: 'var(--surface-200)' }}>
              {analise.pets.map(p => (
                <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  <span className="font-mono text-[10px] text-[var(--surface-400)] w-12 flex-shrink-0">{p.numero_lacre || '—'}</span>
                  <span className="font-semibold text-[var(--surface-700)] truncate max-w-[140px]">{p.pet_nome || 'sem nome'}</span>
                  <span className="text-[var(--surface-400)] truncate flex-1">{p.tutor_nome || ''}</span>
                  <span className="text-[10px] text-[var(--surface-400)] flex-shrink-0">{p.status}</span>
                  <span className="text-[10px] flex-shrink-0" style={{ color: p.contrato_gc?.etapa === 'provisionado' ? '#64748b' : '#eab308' }}>
                    GC: {p.contrato_gc?.etapa || 'sem GC'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={executar}
            disabled={executando || !analise.podeDesfazer}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--radius-md)] text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {executando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            {analise.podeDesfazer
              ? `Devolver ${analise.pets.length} pet${analise.pets.length > 1 ? 's' : ''} para Ativo`
              : 'Não é possível desfazer este encaminhamento'}
          </button>
        </div>
      )}
    </div>
  )
}
