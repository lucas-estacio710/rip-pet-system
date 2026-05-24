'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  ListTodo, Search, X, Plus, Pencil, Trash2, Shield, Loader2, Save,
  ChevronUp, ChevronDown, Eye, EyeOff,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import EmptyState from '@/components/ui/EmptyState'

// ============================================
// Types
// ============================================
type Status = 'aberto' | 'em_andamento' | 'parcial' | 'feito' | 'descartado'
type Prioridade = 'alta' | 'media' | 'baixa'
type Tamanho = 'XS' | 'S' | 'M' | 'L' | 'XL'

type Demanda = {
  id: string
  numero: string
  titulo: string
  descricao: string | null
  diagnostico: string | null
  areas: string[]
  status: Status
  prioridade: Prioridade | null
  tamanho: Tamanho | null
  comentarios: string | null
  ordem: number
}

// ============================================
// Constantes
// ============================================
const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string; peso: number }> = {
  aberto:       { label: 'Aberto',       color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', peso: 0 },
  em_andamento: { label: 'Em andamento', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)',  peso: 1 },
  parcial:      { label: 'Parcial',      color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  peso: 2 },
  feito:        { label: 'Feito',        color: '#22c55e', bg: 'rgba(34,197,94,0.15)',   peso: 3 },
  descartado:   { label: 'Descartado',   color: '#71717a', bg: 'rgba(113,113,122,0.15)', peso: 4 },
}
const STATUS_ORDER: Status[] = ['aberto', 'em_andamento', 'parcial', 'feito', 'descartado']

const PRIO_CONFIG: Record<Prioridade, { label: string; emoji: string; color: string; peso: number }> = {
  alta:  { label: 'Alta',  emoji: '🚨', color: '#ef4444', peso: 0 },
  media: { label: 'Média', emoji: '⚠️', color: '#f59e0b', peso: 1 },
  baixa: { label: 'Baixa', emoji: '📌', color: '#94a3b8', peso: 2 },
}
const TAMANHOS: Tamanho[] = ['XS', 'S', 'M', 'L', 'XL']

// Etapas/abas do fluxo (tags de área). Múltiplas por demanda.
const AREAS = [
  'Dashboards', 'Leads', 'Fichas', 'Preventivos', 'Pipeline', 'Contrato',
  'Encaminhamentos', 'Retorno', 'GC', 'Agenda', 'Estoque', 'Clínicas',
  'Tutores', 'Pagamentos', 'RIP Shield', 'Banco/SQL', 'Global/UX', 'Externo',
]

// Cor por área (hue distinta pra escanear visualmente)
const AREA_COR: Record<string, string> = {
  'Dashboards': '#06b6d4',     // cyan
  'Leads': '#f59e0b',          // amber
  'Fichas': '#3b82f6',         // blue
  'Preventivos': '#f97316',    // orange
  'Pipeline': '#8b5cf6',       // violet
  'Contrato': '#7c3aed',       // purple
  'Encaminhamentos': '#0ea5e9',// sky
  'Retorno': '#14b8a6',        // teal
  'GC': '#ec4899',             // pink
  'Agenda': '#d946ef',         // fuchsia
  'Estoque': '#84cc16',        // lime
  'Clínicas': '#6366f1',       // indigo
  'Tutores': '#22c55e',        // green
  'Pagamentos': '#eab308',     // yellow
  'RIP Shield': '#ef4444',     // red
  'Banco/SQL': '#64748b',      // slate
  'Global/UX': '#f43f5e',      // rose
  'Externo': '#78716c',        // stone
}
function corArea(a: string) { return AREA_COR[a] || '#a78bfa' }
function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const VAZIA: Omit<Demanda, 'id'> = {
  numero: '', titulo: '', descricao: '', diagnostico: '', areas: [],
  status: 'aberto', prioridade: 'media', tamanho: null, comentarios: '', ordem: 100,
}

type SortField = 'numero' | 'titulo' | 'area' | 'tamanho' | 'prioridade' | 'status' | null

// ============================================
// Page
// ============================================
export default function DemandasPage() {
  const supabase = createClient()
  const { isSuperAdmin } = useUnit()

  const [demandas, setDemandas] = useState<Demanda[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState<Status | 'todos'>('todos')
  const [areaFiltro, setAreaFiltro] = useState<string>('todas')
  const [ocultarFinalizadas, setOcultarFinalizadas] = useState(true)
  const [sortField, setSortField] = useState<SortField>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Modal de edição/criação
  const [editando, setEditando] = useState<Demanda | null>(null)
  const [criando, setCriando] = useState(false)
  const [form, setForm] = useState<Omit<Demanda, 'id'>>(VAZIA)
  const [salvandoForm, setSalvandoForm] = useState(false)

  useEffect(() => {
    if (isSuperAdmin) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin])

  async function carregar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('demandas')
      .select('*')
      .order('ordem', { ascending: true })
    if (error) {
      console.error('Erro ao carregar demandas:', error)
    } else {
      setDemandas((data as Demanda[]) || [])
    }
    setLoading(false)
  }

  // Atualização inline de um único campo (status/prioridade/tamanho)
  async function atualizarCampo(id: string, campo: keyof Demanda, valor: unknown) {
    setSavingId(id)
    setDemandas(prev => prev.map(d => (d.id === id ? { ...d, [campo]: valor } as Demanda : d)))
    const { error } = await supabase.from('demandas').update({ [campo]: valor } as never).eq('id', id)
    if (error) {
      console.error('Erro ao atualizar:', error)
      alert('Erro ao salvar. Recarregue a página.')
      carregar()
    }
    setSavingId(null)
  }

  function proximoNumero(): string {
    const ano = new Date().getFullYear()
    const reg = new RegExp(`^${ano}\\/(\\d+)$`)
    // Considera só os números do ano corrente — reseta a contagem a cada virada de ano
    const max = demandas
      .map(d => {
        const m = reg.exec(d.numero || '')
        return m ? parseInt(m[1], 10) : 0
      })
      .reduce((a, b) => Math.max(a, b), 0)
    return `${ano}/${String(max + 1).padStart(2, '0')}`
  }

  function abrirNova() {
    setForm({ ...VAZIA, numero: proximoNumero() })
    setEditando(null)
    setCriando(true)
  }

  function abrirEdicao(d: Demanda) {
    setForm({
      numero: d.numero, titulo: d.titulo, descricao: d.descricao || '',
      diagnostico: d.diagnostico || '', areas: d.areas || [], status: d.status,
      prioridade: d.prioridade, tamanho: d.tamanho, comentarios: d.comentarios || '', ordem: d.ordem,
    })
    setEditando(d)
    setCriando(false)
  }

  function fecharModal() {
    setEditando(null)
    setCriando(false)
  }

  async function salvarForm() {
    if (!form.titulo.trim() || !form.numero.trim()) {
      alert('Número e título são obrigatórios.')
      return
    }
    setSalvandoForm(true)
    const payload = {
      ...form,
      descricao: form.descricao || null,
      diagnostico: form.diagnostico || null,
      comentarios: form.comentarios || null,
    }
    if (criando) {
      const { error } = await supabase.from('demandas').insert(payload as never)
      if (error) { console.error(error); alert('Erro ao criar demanda.'); setSalvandoForm(false); return }
    } else if (editando) {
      const { error } = await supabase.from('demandas').update(payload as never).eq('id', editando.id)
      if (error) { console.error(error); alert('Erro ao salvar demanda.'); setSalvandoForm(false); return }
    }
    setSalvandoForm(false)
    fecharModal()
    carregar()
  }

  async function excluir(d: Demanda) {
    if (!confirm(`Excluir a demanda #${d.numero} — ${d.titulo}?`)) return
    const { error } = await supabase.from('demandas').delete().eq('id', d.id)
    if (error) { console.error(error); alert('Erro ao excluir.'); return }
    setDemandas(prev => prev.filter(x => x.id !== d.id))
  }

  function toggleSort(f: Exclude<SortField, null>) {
    if (sortField === f) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(f); setSortDir('asc') }
  }

  function sortIcon(f: Exclude<SortField, null>) {
    if (sortField !== f) return null
    return sortDir === 'asc'
      ? <ChevronUp className="inline h-3 w-3 ml-0.5" />
      : <ChevronDown className="inline h-3 w-3 ml-0.5" />
  }

  function toggleArea(a: string) {
    setForm(f => ({ ...f, areas: f.areas.includes(a) ? f.areas.filter(x => x !== a) : [...f.areas, a] }))
  }

  // Contagem por status
  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: demandas.length }
    for (const s of STATUS_ORDER) c[s] = demandas.filter(d => d.status === s).length
    return c
  }, [demandas])

  // Lista filtrada + ordenada (status → prioridade → ordem)
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return demandas
      .filter(d => statusFiltro === 'todos' || d.status === statusFiltro)
      .filter(d => areaFiltro === 'todas' || d.areas.includes(areaFiltro))
      .filter(d => !(ocultarFinalizadas && statusFiltro !== 'feito' && d.status === 'feito'))
      .filter(d => !q || `${d.numero} ${d.titulo} ${d.areas.join(' ')} ${d.descricao || ''}`.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortField) {
          let cmp = 0
          switch (sortField) {
            case 'numero': cmp = a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true }); break
            case 'titulo': cmp = a.titulo.localeCompare(b.titulo, 'pt-BR'); break
            case 'area': cmp = (a.areas[0] || '').localeCompare(b.areas[0] || '', 'pt-BR'); break
            case 'tamanho': cmp = (a.tamanho ? TAMANHOS.indexOf(a.tamanho) : 99) - (b.tamanho ? TAMANHOS.indexOf(b.tamanho) : 99); break
            case 'prioridade': cmp = (a.prioridade ? PRIO_CONFIG[a.prioridade].peso : 9) - (b.prioridade ? PRIO_CONFIG[b.prioridade].peso : 9); break
            case 'status': cmp = STATUS_CONFIG[a.status].peso - STATUS_CONFIG[b.status].peso; break
          }
          return sortDir === 'asc' ? cmp : -cmp
        }
        // Default: status → prioridade → ordem
        const sa = STATUS_CONFIG[a.status].peso - STATUS_CONFIG[b.status].peso
        if (sa !== 0) return sa
        const pa = (a.prioridade ? PRIO_CONFIG[a.prioridade].peso : 9) - (b.prioridade ? PRIO_CONFIG[b.prioridade].peso : 9)
        if (pa !== 0) return pa
        return a.ordem - b.ordem
      })
  }, [demandas, busca, statusFiltro, areaFiltro, ocultarFinalizadas, sortField, sortDir])

  // ============================================
  // Render
  // ============================================
  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in">
        <EmptyState icon={Shield} title="Acesso restrito" description="Somente administradores podem acessar esta página." />
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-purple-900/30 items-center justify-center">
            <ListTodo className="h-5 w-5 text-purple-500" />
          </div>
          <h1 className="text-title text-[var(--shell-text)]">Demandas</h1>
        </div>
        <button onClick={abrirNova} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova demanda</span>
        </button>
      </div>

      {/* Filtros de status (chips com contagem) */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setStatusFiltro('todos')}
          className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
          style={{
            background: statusFiltro === 'todos' ? 'rgba(168,139,250,0.2)' : 'var(--surface-100)',
            color: statusFiltro === 'todos' ? '#a78bfa' : 'var(--shell-text-muted)',
          }}
        >
          Todos ({contagem.todos})
        </button>
        {STATUS_ORDER.map(s => (
          <button
            key={s}
            onClick={() => setStatusFiltro(s)}
            className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
            style={{
              background: statusFiltro === s ? STATUS_CONFIG[s].bg : 'var(--surface-100)',
              color: statusFiltro === s ? STATUS_CONFIG[s].color : 'var(--shell-text-muted)',
            }}
          >
            {STATUS_CONFIG[s].label} ({contagem[s] || 0})
          </button>
        ))}
      </div>

      {/* Busca + toggle finalizadas */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--shell-text-muted)]" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nº, título, área..."
            className="input pl-9 w-full"
          />
        </div>
        <select
          value={areaFiltro}
          onChange={e => setAreaFiltro(e.target.value)}
          className="input w-auto text-xs"
          title="Filtrar por área do fluxo"
        >
          <option value="todas">Todas as áreas</option>
          {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button
          onClick={() => setOcultarFinalizadas(v => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-xs font-medium transition-colors whitespace-nowrap"
          style={{
            background: ocultarFinalizadas ? 'rgba(34,197,94,0.12)' : 'var(--surface-100)',
            color: ocultarFinalizadas ? '#22c55e' : 'var(--shell-text-muted)',
          }}
          title="Esconder/mostrar demandas com status Feito"
        >
          {ocultarFinalizadas ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {ocultarFinalizadas ? 'Finalizadas ocultas' : 'Finalizadas visíveis'}
        </button>
      </div>

      {/* Tabela densa */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-[var(--shell-text-muted)]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : lista.length === 0 ? (
        <EmptyState icon={ListTodo} title="Nenhuma demanda" description="Nenhuma demanda encontrada com esse filtro." />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--surface-200)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--shell-text-muted)] border-b border-[var(--surface-200)]">
                <th onClick={() => toggleSort('numero')} className="px-3 py-2 font-semibold w-20 cursor-pointer select-none hover:text-[var(--shell-text)]">Nº {sortIcon('numero')}</th>
                <th onClick={() => toggleSort('titulo')} className="px-3 py-2 font-semibold cursor-pointer select-none hover:text-[var(--shell-text)]">Título {sortIcon('titulo')}</th>
                <th onClick={() => toggleSort('area')} className="px-3 py-2 font-semibold hidden md:table-cell cursor-pointer select-none hover:text-[var(--shell-text)]">Área {sortIcon('area')}</th>
                <th onClick={() => toggleSort('tamanho')} className="px-3 py-2 font-semibold w-16 cursor-pointer select-none hover:text-[var(--shell-text)]">Tam {sortIcon('tamanho')}</th>
                <th onClick={() => toggleSort('prioridade')} className="px-3 py-2 font-semibold w-28 cursor-pointer select-none hover:text-[var(--shell-text)]">Prioridade {sortIcon('prioridade')}</th>
                <th onClick={() => toggleSort('status')} className="px-3 py-2 font-semibold w-36 cursor-pointer select-none hover:text-[var(--shell-text)]">Status {sortIcon('status')}</th>
                <th className="px-3 py-2 font-semibold w-20 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(d => (
                <tr
                  key={d.id}
                  className="border-b border-[var(--surface-200)] last:border-0 hover:bg-[var(--surface-100)] transition-colors"
                >
                  <td className="px-3 py-2 font-mono text-xs text-[var(--shell-text-muted)] align-top">{d.numero}</td>
                  <td className="px-3 py-2 align-top">
                    <button onClick={() => abrirEdicao(d)} className="text-left text-[var(--shell-text)] hover:text-purple-400 font-medium">
                      {d.titulo}
                    </button>
                  </td>
                  <td className="px-3 py-2 align-top hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {d.areas.length ? d.areas.map(a => (
                        <span key={a} className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap" style={{ background: hexToRgba(corArea(a), 0.16), color: corArea(a) }}>{a}</span>
                      )) : <span className="text-xs text-[var(--shell-text-muted)]">—</span>}
                    </div>
                  </td>
                  {/* Tamanho inline */}
                  <td className="px-3 py-2 align-top">
                    <select
                      value={d.tamanho || ''}
                      onChange={e => atualizarCampo(d.id, 'tamanho', e.target.value || null)}
                      className="bg-transparent text-xs font-mono text-[var(--shell-text)] cursor-pointer outline-none"
                    >
                      <option value="">—</option>
                      {TAMANHOS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  {/* Prioridade inline */}
                  <td className="px-3 py-2 align-top">
                    <select
                      value={d.prioridade || ''}
                      onChange={e => atualizarCampo(d.id, 'prioridade', e.target.value || null)}
                      className="bg-transparent text-xs cursor-pointer outline-none"
                      style={{ color: d.prioridade ? PRIO_CONFIG[d.prioridade].color : 'var(--shell-text-muted)' }}
                    >
                      <option value="">—</option>
                      {(Object.keys(PRIO_CONFIG) as Prioridade[]).map(p => (
                        <option key={p} value={p}>{PRIO_CONFIG[p].emoji} {PRIO_CONFIG[p].label}</option>
                      ))}
                    </select>
                  </td>
                  {/* Status inline */}
                  <td className="px-3 py-2 align-top">
                    <select
                      value={d.status}
                      onChange={e => atualizarCampo(d.id, 'status', e.target.value)}
                      className="text-xs font-medium rounded px-2 py-1 cursor-pointer outline-none border-0"
                      style={{ background: STATUS_CONFIG[d.status].bg, color: STATUS_CONFIG[d.status].color }}
                    >
                      {STATUS_ORDER.map(s => (
                        <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                    {savingId === d.id && <Loader2 className="inline h-3 w-3 animate-spin mr-1 text-[var(--shell-text-muted)]" />}
                    <button onClick={() => abrirEdicao(d)} className="text-[var(--shell-text-muted)] hover:text-purple-400 p-1" title="Editar">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => excluir(d)} className="text-[var(--shell-text-muted)] hover:text-red-400 p-1" title="Excluir">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal edição/criação */}
      {(editando || criando) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-3" onClick={fecharModal}>
          <div
            className="bg-[var(--surface-0)] rounded-2xl w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--surface-200)] sticky top-0 bg-[var(--surface-0)] z-10">
              <h3 className="text-subtitle text-[var(--shell-text)]">
                {criando ? 'Nova demanda' : `Editar demanda #${editando?.numero}`}
              </h3>
              <button onClick={fecharModal} className="text-[var(--shell-text-muted)] hover:text-[var(--shell-text)]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Nº *</label>
                  <input value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} className="input w-full font-mono" placeholder="ex: 5, 11-A" />
                </div>
                <div className="sm:col-span-3">
                  <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Título *</label>
                  <input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} className="input w-full" />
                </div>
              </div>

              <div>
                <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Descrição</label>
                <textarea value={form.descricao || ''} onChange={e => setForm({ ...form, descricao: e.target.value })} rows={2} className="input w-full resize-y" placeholder="O que é a demanda" />
              </div>

              <div>
                <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Diagnóstico atual</label>
                <textarea value={form.diagnostico || ''} onChange={e => setForm({ ...form, diagnostico: e.target.value })} rows={3} className="input w-full resize-y" placeholder="Estado atual / causa raiz / o que falta" />
              </div>

              <div>
                <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Áreas do fluxo</label>
                <div className="flex flex-wrap gap-1.5">
                  {AREAS.map(a => {
                    const on = form.areas.includes(a)
                    return (
                      <button
                        type="button"
                        key={a}
                        onClick={() => toggleArea(a)}
                        className="px-2 py-1 rounded-full text-xs font-medium transition-colors"
                        style={{
                          background: on ? hexToRgba(corArea(a), 0.2) : 'var(--surface-100)',
                          color: on ? corArea(a) : 'var(--shell-text-muted)',
                        }}
                      >
                        {a}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Status })} className="input w-full">
                    {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Prioridade</label>
                  <select value={form.prioridade || ''} onChange={e => setForm({ ...form, prioridade: (e.target.value || null) as Prioridade | null })} className="input w-full">
                    <option value="">—</option>
                    {(Object.keys(PRIO_CONFIG) as Prioridade[]).map(p => <option key={p} value={p}>{PRIO_CONFIG[p].emoji} {PRIO_CONFIG[p].label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Tamanho</label>
                  <select value={form.tamanho || ''} onChange={e => setForm({ ...form, tamanho: (e.target.value || null) as Tamanho | null })} className="input w-full">
                    <option value="">—</option>
                    {TAMANHOS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Comentários / histórico</label>
                <textarea value={form.comentarios || ''} onChange={e => setForm({ ...form, comentarios: e.target.value })} rows={3} className="input w-full resize-y" placeholder="Evidência (commit), decisões, andamento" />
              </div>
            </div>

            <div className="flex gap-2 p-4 border-t border-[var(--surface-200)] sticky bottom-0 bg-[var(--surface-0)]">
              <button onClick={fecharModal} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={salvarForm} disabled={salvandoForm} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {salvandoForm ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {criando ? 'Criar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
