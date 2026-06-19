'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, AlertTriangle, Loader2, FileText, User, Receipt, Package, Building2, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

// Tipos espelham o retorno da API /api/admin/tratamento-erros/desfazer-ficha
type FichaBusca = {
  id: string
  nome_completo: string | null
  nome_pet: string | null
  telefone: string | null
  processada_em: string | null
  contrato_id: string | null
  op_dados: Record<string, unknown> | null
}

type Analise = {
  ficha: {
    id: string
    nome_completo: string | null
    nome_pet: string | null
    cpf: string | null
    telefone: string | null
    processada_em: string | null
    contrato_id: string | null
    op_dados: Record<string, unknown> | null
  }
  contrato: {
    id: string
    codigo: string | null
    status: string | null
    tipo_cremacao: string | null
    pet_nome: string | null
    tutor_id: string | null
    tutor_nome: string | null
    nfse_numero: string | null
    supinda_id: string | null
    created_at: string
  } | null
  pagamentos: { id: string; tipo: string; valor: number; metodo: string }[]
  produtos: { id: string; produto_id: string; valor: number }[]
  tutor: { id: string; nome: string; cpf: string; created_at: string } | null
  outrosContratosDoTutor: { id: string; codigo: string; status: string; pet_nome: string }[]
}

export default function DesfazerFichaPanel() {
  const supabase = createClient()
  const { toast } = useToast()
  const [busca, setBusca] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<FichaBusca[]>([])
  const [fichaSelecionada, setFichaSelecionada] = useState<string | null>(null)
  const [analise, setAnalise] = useState<Analise | null>(null)
  const [carregandoAnalise, setCarregandoAnalise] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [deletarTutor, setDeletarTutor] = useState(false)
  const [executando, setExecutando] = useState(false)

  async function getToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || null
  }

  async function buscar() {
    const termo = busca.trim()
    if (termo.length < 2) {
      setResultados([])
      return
    }
    setBuscando(true)
    try {
      const token = await getToken()
      const res = await fetch(`/api/admin/tratamento-erros/desfazer-ficha?q=${encodeURIComponent(termo)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) {
        toast(json.error || 'Falha na busca', 'error')
        return
      }
      setResultados(json.fichas || [])
    } finally {
      setBuscando(false)
    }
  }

  async function carregarAnalise(fichaId: string) {
    setCarregandoAnalise(true)
    setAnalise(null)
    setConfirmar(false)
    setDeletarTutor(false)
    setFichaSelecionada(fichaId)
    try {
      const token = await getToken()
      const res = await fetch(`/api/admin/tratamento-erros/desfazer-ficha?ficha_id=${fichaId}&_analise=1`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) {
        toast(json.error || 'Falha ao carregar análise', 'error')
        return
      }
      setAnalise(json)
    } finally {
      setCarregandoAnalise(false)
    }
  }

  async function executar() {
    if (!fichaSelecionada || !confirmar) return
    setExecutando(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/admin/tratamento-erros/desfazer-ficha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ficha_id: fichaSelecionada, deletar_tutor: deletarTutor }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast(json.error || 'Falha ao executar', 'error')
        return
      }
      let msg = 'Ficha voltou pra Recebidas'
      if (json.contratoDeletado) msg += ', contrato deletado'
      if (json.tutorDeletado) msg += ', tutor deletado'
      else if (json.tutorNaoDeletadoMotivo) msg += ` (tutor mantido: ${json.tutorNaoDeletadoMotivo})`
      toast(msg, 'success')
      // Reset
      setAnalise(null)
      setFichaSelecionada(null)
      setConfirmar(false)
      setDeletarTutor(false)
      setBusca('')
      setResultados([])
    } finally {
      setExecutando(false)
    }
  }

  // Debounce busca
  useEffect(() => {
    const t = setTimeout(() => { buscar() }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca])

  const podeDeletarTutor = analise?.tutor && analise.outrosContratosDoTutor.length === 0

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold mb-1 text-[var(--shell-text)]">Desfazer ficha processada</h2>
        <p className="text-sm text-[var(--shell-text-muted)]">
          Volta a ficha pra Recebidas (preserva os dados do processamento), deleta o contrato gerado e — opcionalmente — o tutor criado no fluxo.
        </p>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--shell-text-muted)]" />
        <input
          type="text"
          placeholder="Buscar por nome do pet, tutor ou código do contrato (mín 2 letras)"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-[var(--radius-md)] bg-[var(--surface-0)] border border-[var(--surface-200)] text-[var(--shell-text)] placeholder-[var(--shell-text-muted)] focus:outline-none focus:border-[var(--brand-600)]"
        />
        {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[var(--shell-text-muted)]" />}
      </div>

      {/* Resultados */}
      {resultados.length > 0 && !analise && (
        <div className="rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-[var(--surface-0)] overflow-hidden">
          {resultados.map((f) => {
            const temContrato = !!f.contrato_id
            return (
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
                  <div className="text-xs text-[var(--shell-text-muted)]">
                    {f.processada_em ? `Processada ${new Date(f.processada_em).toLocaleString('pt-BR')}` : 'Não processada'}
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${temContrato ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400'}`}>
                  {temContrato ? 'Pipeline criado' : 'Processada'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Análise */}
      {carregandoAnalise && (
        <div className="flex items-center gap-2 text-sm text-[var(--shell-text-muted)] py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando análise…
        </div>
      )}

      {analise && (
        <div className="space-y-3">
          {/* Ficha */}
          <SecaoAnalise icon={<FileText className="h-4 w-4 text-amber-400" />} titulo="Ficha">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <Linha k="Pet" v={analise.ficha.nome_pet} />
              <Linha k="Tutor" v={analise.ficha.nome_completo} />
              <Linha k="CPF" v={analise.ficha.cpf} />
              <Linha k="Telefone" v={analise.ficha.telefone} />
            </div>
          </SecaoAnalise>

          {/* Contrato */}
          {analise.contrato ? (
            <SecaoAnalise icon={<Receipt className="h-4 w-4 text-blue-400" />} titulo="Contrato vinculado (será DELETADO)">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <Linha k="Código" v={analise.contrato.codigo} mono />
                <Linha k="Status" v={analise.contrato.status} />
                <Linha k="Tipo" v={analise.contrato.tipo_cremacao} />
                <Linha k="Criado em" v={new Date(analise.contrato.created_at).toLocaleString('pt-BR')} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <Chip ok={analise.pagamentos.length === 0} label={`${analise.pagamentos.length} pagamento(s)`} icon={<Receipt className="h-3 w-3" />} />
                <Chip ok={analise.produtos.length === 0} label={`${analise.produtos.length} produto(s)`} icon={<Package className="h-3 w-3" />} />
                <Chip ok={!analise.contrato.nfse_numero} label={analise.contrato.nfse_numero ? `NFS-e ${analise.contrato.nfse_numero}` : 'sem NFS-e'} icon={<FileText className="h-3 w-3" />} />
                <Chip ok={!analise.contrato.supinda_id} label={analise.contrato.supinda_id ? 'Em supinda' : 'sem supinda'} icon={<Building2 className="h-3 w-3" />} />
              </div>
              {(analise.pagamentos.length > 0 || analise.produtos.length > 0 || analise.contrato.nfse_numero || analise.contrato.supinda_id) && (
                <div className="mt-2 flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-md p-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span>Atenção: contrato tem dados anexados. Deletar é destrutivo.</span>
                </div>
              )}
            </SecaoAnalise>
          ) : (
            <SecaoAnalise icon={<Receipt className="h-4 w-4 text-[var(--shell-text-muted)]" />} titulo="Contrato vinculado">
              <p className="text-sm text-[var(--shell-text-muted)]">Nenhum contrato vinculado.</p>
            </SecaoAnalise>
          )}

          {/* Tutor */}
          {analise.tutor && (
            <SecaoAnalise icon={<User className="h-4 w-4 text-emerald-400" />} titulo="Tutor">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <Linha k="Nome" v={analise.tutor.nome} />
                <Linha k="CPF" v={analise.tutor.cpf} />
                <Linha k="Criado em" v={new Date(analise.tutor.created_at).toLocaleString('pt-BR')} />
                <Linha k="Outros contratos" v={String(analise.outrosContratosDoTutor.length)} />
              </div>
              {analise.outrosContratosDoTutor.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-xs text-[var(--shell-text-muted)]">Outros contratos do tutor (impedem deleção):</div>
                  <ul className="text-xs text-[var(--shell-text)] space-y-0.5">
                    {analise.outrosContratosDoTutor.map(c => (
                      <li key={c.id} className="font-mono">{c.codigo} · {c.pet_nome} ({c.status})</li>
                    ))}
                  </ul>
                </div>
              )}
            </SecaoAnalise>
          )}

          {/* Confirmação + opções */}
          <div className="rounded-[var(--radius-md)] border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={confirmar} onChange={(e) => setConfirmar(e.target.checked)} className="mt-0.5 accent-amber-500" />
              <span className="text-sm text-[var(--shell-text)]">
                Entendi os impactos. Volta a ficha pra Recebidas e deleta o contrato vinculado{analise.contrato ? ` (${analise.contrato.codigo})` : ''}.
              </span>
            </label>

            {analise.tutor && (
              <label className={`flex items-start gap-2 ${podeDeletarTutor ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                <input
                  type="checkbox"
                  checked={deletarTutor}
                  disabled={!podeDeletarTutor}
                  onChange={(e) => setDeletarTutor(e.target.checked)}
                  className="mt-0.5 accent-amber-500"
                />
                <span className="text-sm text-[var(--shell-text)]">
                  Deletar também o tutor <span className="font-medium">{analise.tutor.nome}</span> (criado no processamento).
                  {!podeDeletarTutor && <span className="block text-xs text-amber-400 mt-0.5">Não disponível: tutor tem outros contratos vinculados.</span>}
                </span>
              </label>
            )}
          </div>

          {/* Ação */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setAnalise(null); setFichaSelecionada(null); setConfirmar(false); setDeletarTutor(false) }}
              className="px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--surface-200)] text-[var(--shell-text)] hover:bg-[var(--surface-100)]"
            >
              Voltar
            </button>
            <button
              onClick={executar}
              disabled={!confirmar || executando}
              className="px-4 py-2 text-sm rounded-[var(--radius-md)] bg-amber-600 hover:bg-amber-700 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {executando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Executar
            </button>
          </div>
        </div>
      )}

      {!buscando && busca.trim().length >= 2 && resultados.length === 0 && !analise && (
        <p className="text-sm text-[var(--shell-text-muted)] text-center py-4">Nenhuma ficha processada encontrada.</p>
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

function SecaoAnalise({ icon, titulo, children }: { icon: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-[var(--surface-0)] p-3">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-semibold text-[var(--shell-text)]">{titulo}</h3>
      </div>
      {children}
    </div>
  )
}

function Chip({ ok, label, icon }: { ok: boolean; label: string; icon: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
      {icon}
      {label}
    </span>
  )
}
