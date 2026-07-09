'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, AlertTriangle, Loader2, FileText, ArrowRight, Building2, CheckCircle2, Ban } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

// Espelha o retorno de /api/admin/tratamento-erros/mover-ficha
type FichaBusca = {
  id: string
  nome_pet: string | null
  nome_completo: string | null
  cremacao: string | null
  contrato_id: string | null
  unidade_texto: string | null
  codigo: string | null
}

type Unidade = { id: string; codigo: string; nome: string; estado: string | null }

type Analise = {
  ficha: {
    id: string
    nome_pet: string | null
    nome_completo: string | null
    cremacao: string | null
    processada: boolean
    contrato_id: string | null
    unidade_id: string | null
    unidade_texto: string | null
    codigo: string | null
  }
  unidades: Unidade[]
}

export default function MoverFichaPanel() {
  const supabase = createClient()
  const { toast } = useToast()
  const [busca, setBusca] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<FichaBusca[]>([])
  const [fichaSelecionada, setFichaSelecionada] = useState<string | null>(null)
  const [analise, setAnalise] = useState<Analise | null>(null)
  const [carregandoAnalise, setCarregandoAnalise] = useState(false)
  const [destinoId, setDestinoId] = useState<string>('')
  const [executando, setExecutando] = useState(false)

  async function getToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || null
  }

  async function buscar() {
    const termo = busca.trim()
    if (termo.length < 2) { setResultados([]); return }
    setBuscando(true)
    try {
      const token = await getToken()
      const res = await fetch(`/api/admin/tratamento-erros/mover-ficha?q=${encodeURIComponent(termo)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) { toast(json.error || 'Falha na busca', 'error'); return }
      setResultados(json.fichas || [])
    } finally {
      setBuscando(false)
    }
  }

  async function carregarAnalise(fichaId: string) {
    setCarregandoAnalise(true)
    setAnalise(null)
    setDestinoId('')
    setFichaSelecionada(fichaId)
    try {
      const token = await getToken()
      const res = await fetch(`/api/admin/tratamento-erros/mover-ficha?ficha_id=${fichaId}&_analise=1`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) { toast(json.error || 'Falha ao carregar análise', 'error'); return }
      setAnalise(json)
    } finally {
      setCarregandoAnalise(false)
    }
  }

  async function executar() {
    if (!fichaSelecionada || !destinoId) return
    setExecutando(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/admin/tratamento-erros/mover-ficha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ficha_id: fichaSelecionada, unidade_destino_id: destinoId }),
      })
      const json = await res.json()
      if (!res.ok) { toast(json.error || 'Falha ao mover', 'error'); return }
      let msg = `Ficha movida para ${json.destino}`
      if (json.codigoDepois && json.codigoAntes !== json.codigoDepois) msg += ` · código ${json.codigoDepois}`
      toast(msg, 'success')
      if (json.funcAviso) toast(json.funcAviso, 'info')
      // Reset
      setAnalise(null); setFichaSelecionada(null); setDestinoId('')
      setBusca(''); setResultados([])
    } finally {
      setExecutando(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => { buscar() }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca])

  const jaVirouContrato = !!analise?.ficha.contrato_id
  // Código novo (preview): troca o prefixo pela unidade destino
  const destino = analise?.unidades.find(u => u.id === destinoId)
  const origemUn = analise?.unidades.find(u => u.id === analise?.ficha.unidade_id)
  const codigoPreview = (() => {
    const cod = analise?.ficha.codigo
    if (!cod || !destino || !origemUn) return cod ?? null
    return cod.startsWith(origemUn.codigo) ? destino.codigo + cod.slice(origemUn.codigo.length) : cod
  })()

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold mb-1 text-[var(--shell-text)]">Mover ficha de unidade</h2>
        <p className="text-sm text-[var(--shell-text-muted)]">
          Reatribui uma ficha preenchida pela unidade errada. Ajusta a unidade, o código (prefixo) e o responsável.
          Só funciona em fichas que <strong>ainda não viraram contrato</strong>.
        </p>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--shell-text-muted)]" />
        <input
          type="text"
          placeholder="Buscar por pet, tutor ou código da ficha (mín 2 letras)"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-[var(--radius-md)] bg-[var(--surface-0)] border border-[var(--surface-200)] text-[var(--shell-text)] placeholder-[var(--shell-text-muted)] focus:outline-none focus:border-[var(--brand-600)]"
        />
        {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[var(--shell-text-muted)]" />}
      </div>

      {/* Resultados */}
      {resultados.length > 0 && !analise && (
        <div className="rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-[var(--surface-0)] overflow-hidden">
          {resultados.map((f) => (
            <button
              key={f.id}
              onClick={() => carregarAnalise(f.id)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-100)] border-b border-[var(--surface-200)] last:border-b-0 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm text-[var(--shell-text)] truncate">
                  <span className="font-medium">{f.nome_pet || '—'}</span>
                  <span className="text-[var(--shell-text-muted)]"> · {f.nome_completo || '—'}</span>
                </div>
                <div className="text-xs text-[var(--shell-text-muted)] font-mono">
                  {f.codigo || 'sem código'} · {f.unidade_texto || 'sem unidade'}
                </div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${f.contrato_id ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                {f.contrato_id ? 'Já é contrato' : 'Movível'}
              </span>
            </button>
          ))}
        </div>
      )}

      {carregandoAnalise && (
        <div className="flex items-center gap-2 text-sm text-[var(--shell-text-muted)] py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      )}

      {/* Análise + destino */}
      {analise && (
        <div className="space-y-3">
          <div className="rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-[var(--surface-0)] p-3">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-[var(--shell-text)]">Ficha</h3>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <Linha k="Pet" v={analise.ficha.nome_pet} />
              <Linha k="Tutor" v={analise.ficha.nome_completo} />
              <Linha k="Código atual" v={analise.ficha.codigo} mono />
              <Linha k="Unidade atual" v={analise.ficha.unidade_texto} />
            </div>
          </div>

          {jaVirouContrato ? (
            <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 rounded-md p-3">
              <Ban className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>Esta ficha <strong>já virou contrato</strong>. Mover exigiria transferir contrato e estoque — não é suportado por aqui.</span>
            </div>
          ) : (
            <>
              {/* Destino */}
              <div className="rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-[var(--surface-0)] p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-4 w-4 text-blue-400" />
                  <h3 className="text-sm font-semibold text-[var(--shell-text)]">Mover para</h3>
                </div>
                <select
                  value={destinoId}
                  onChange={(e) => setDestinoId(e.target.value)}
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] bg-[var(--surface-0)] border border-[var(--surface-200)] text-[var(--shell-text)] focus:outline-none focus:border-[var(--brand-600)]"
                >
                  <option value="">— selecione a unidade destino —</option>
                  {analise.unidades
                    .filter(u => u.id !== analise.ficha.unidade_id)
                    .map(u => <option key={u.id} value={u.id}>{u.nome} ({u.codigo})</option>)}
                </select>

                {destino && (
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    <span className="font-mono text-[var(--shell-text-muted)]">{analise.ficha.codigo}</span>
                    <ArrowRight className="h-4 w-4 text-[var(--shell-text-muted)]" />
                    <span className="font-mono font-semibold text-emerald-400">{codigoPreview}</span>
                  </div>
                )}
              </div>

              {/* Ação */}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setAnalise(null); setFichaSelecionada(null); setDestinoId('') }}
                  className="px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--surface-200)] text-[var(--shell-text)] hover:bg-[var(--surface-100)]"
                >
                  Voltar
                </button>
                <button
                  onClick={executar}
                  disabled={!destinoId || executando}
                  className="px-4 py-2 text-sm rounded-[var(--radius-md)] bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {executando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Mover ficha
                </button>
              </div>

              <div className="flex items-start gap-2 text-xs text-[var(--shell-text-muted)]">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-400" />
                <span>Ajusta unidade, código (prefixo) e responsável (busca o mesmo nome na unidade destino). Pet, tutor, valor e data ficam intactos.</span>
              </div>
            </>
          )}
        </div>
      )}

      {!buscando && busca.trim().length >= 2 && resultados.length === 0 && !analise && (
        <p className="text-sm text-[var(--shell-text-muted)] text-center py-4">Nenhuma ficha encontrada.</p>
      )}
    </div>
  )
}

function Linha({ k, v, mono }: { k: string; v: string | null | undefined; mono?: boolean }) {
  return (
    <>
      <span className="text-[var(--shell-text-muted)]">{k}:</span>
      <span className={`text-[var(--shell-text)] ${mono ? 'font-mono' : ''}`}>{v || '—'}</span>
    </>
  )
}
