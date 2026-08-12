'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Loader2, QrCode, Copy, Check, X, RefreshCw, MapPin, Clock, UserCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

type Situacao = 'aguardando' | 'usado' | 'expirado'

type Convite = {
  id: string
  token: string
  tipo: 'admin' | 'mgm'
  nome_indicado: string
  cidade_atuacao: string
  usado_em: string | null
  created_at: string
  url: string
  situacao: Situacao
  contato_resultante: { id: string; nome: string } | null
  padrinho: { id: string; nome: string } | null
}

const ROTULO: Record<Situacao, { texto: string; cor: string; bg: string }> = {
  aguardando: { texto: 'Aguardando cadastro', cor: '#b45309', bg: '#fffbeb' },
  usado: { texto: 'Cadastrado', cor: '#059669', bg: '#ecfdf5' },
  expirado: { texto: 'Expirado', cor: '#6b7280', bg: '#f3f4f6' },
}

const dataBR = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

export default function ConvitesTab() {
  const supabase = createClient()
  const { currentUnit } = useUnit()

  const [carregando, setCarregando] = useState(true)
  const [cidades, setCidades] = useState<string[]>([])
  const [convites, setConvites] = useState<Convite[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [cidade, setCidade] = useState('')
  const [gerando, setGerando] = useState(false)
  const [qr, setQr] = useState<{ url: string; dataUrl: string; nome: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  const carregar = useCallback(async () => {
    if (!currentUnit) return
    setCarregando(true); setErro(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/admin/parceiros/convites?unidade_id=${currentUnit.id}`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    const json = await res.json()
    if (!res.ok) setErro(json.error ?? 'Falha ao carregar.')
    else { setCidades(json.cidades ?? []); setConvites(json.convites ?? []) }
    setCarregando(false)
  }, [currentUnit, supabase])

  useEffect(() => { carregar() }, [carregar])

  async function gerar(e: React.FormEvent) {
    e.preventDefault()
    if (!currentUnit) return
    setGerando(true); setErro(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/parceiros/convites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ unidade_id: currentUnit.id, nome_indicado: nome, cidade_atuacao: cidade }),
    })
    const json = await res.json()
    setGerando(false)
    if (!res.ok) { setErro(json.error ?? 'Falha ao gerar.'); return }
    setQr({ url: json.url, dataUrl: json.qrDataUrl, nome })
    setNome(''); carregar()
  }

  const semCobertura = !carregando && cidades.length === 0

  return (
    <>
      {semCobertura && (
        <div className="mb-6 rounded-[var(--radius-md)] border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <strong>Esta unidade ainda não tem cidades de cobertura.</strong> Cadastre a região
          de atuação na aba Orquestrador antes de convidar — é o que impede o convite de
          circular fora da área atendida.
        </div>
      )}

      <section className="mb-8 rounded-[var(--radius-lg)] bg-[var(--surface-0)] p-4 sm:p-5 shadow-[var(--shadow-sm)]">
        <h2 className="mb-1 text-sm font-semibold text-[var(--surface-700)]">Novo convite</h2>
        <p className="mb-4 text-xs text-[var(--surface-400)]">
          Gere o QR na frente da pessoa — ela aponta a câmera e se cadastra na hora.
        </p>
        <form onSubmit={gerar} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input required value={nome} onChange={e => setNome(e.target.value)}
            placeholder="Nome do novo membro" disabled={semCobertura}
            className="w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-[var(--surface-50)] px-3 py-2.5 text-sm text-[var(--surface-800)] outline-none focus:border-[var(--brand-500)] disabled:opacity-50" />
          <select required value={cidade} onChange={e => setCidade(e.target.value)} disabled={semCobertura}
            className="w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-[var(--surface-50)] px-3 py-2.5 text-sm text-[var(--surface-800)] outline-none focus:border-[var(--brand-500)] disabled:opacity-50">
            <option value="">Região de atuação…</option>
            {cidades.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="submit" disabled={gerando || semCobertura}
            className="flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--brand-600)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--brand-700)] disabled:opacity-50">
            {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Gerar QR
          </button>
        </form>
        {erro && <p role="alert" className="mt-3 text-sm text-red-400">{erro}</p>}
      </section>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--surface-700)]">
          Convites de {currentUnit?.nome}
        </h2>
        <button onClick={carregar} className="flex items-center gap-1.5 text-xs text-[var(--surface-400)] hover:text-[var(--surface-600)]">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {carregando ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : convites.length === 0 ? (
        <EmptyState icon={QrCode} title="Nenhum convite ainda"
          description="Gere o primeiro na próxima visita a uma clínica." />
      ) : (
        <ul className="space-y-2">
          {convites.map(c => {
            const s = ROTULO[c.situacao]
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[var(--radius-md)] bg-[var(--surface-0)] px-4 py-3 shadow-[var(--shadow-xs)]">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--surface-800)]">
                    {c.contato_resultante?.nome ?? c.nome_indicado}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--surface-400)]">
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{c.cidade_atuacao}</span>
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{dataBR(c.created_at)}</span>
                    {c.tipo === 'mgm' && c.padrinho && (
                      <span className="inline-flex items-center gap-1"><UserCheck className="h-3 w-3" />indicado por {c.padrinho.nome}</span>
                    )}
                  </p>
                </div>
                <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium" style={{ color: s.cor, background: s.bg }}>
                  {s.texto}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {qr && (
        <div role="dialog" aria-modal="true" aria-label={`Convite para ${qr.nome}`}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white p-6">
          <button onClick={() => setQr(null)} aria-label="Fechar"
            className="absolute right-4 top-4 rounded-full p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-6 w-6" />
          </button>
          <p className="mb-1 text-sm text-slate-500">Convite para</p>
          <p className="mb-6 text-xl font-semibold text-slate-900">{qr.nome}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.dataUrl} alt="QR code do convite" className="w-full max-w-[320px] rounded-[var(--radius-lg)]" />
          <p className="mt-6 max-w-xs text-center text-sm leading-relaxed text-slate-500">
            Peça para a pessoa apontar a câmera. O convite vale para
            <strong className="text-slate-700"> uma pessoa só</strong> e expira em 30 dias.
          </p>
          <button onClick={async () => { await navigator.clipboard.writeText(qr.url); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }}
            className="mt-6 flex items-center gap-2 rounded-[var(--radius-md)] border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copiado ? 'Link copiado' : 'Copiar link'}
          </button>
        </div>
      )}
    </>
  )
}
