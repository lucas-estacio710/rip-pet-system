'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  Package, Search, X, Plus, Pencil, Eye, EyeOff, Save, Loader2,
  Check, ChevronDown, ChevronUp, Shield, Image, Tag, DollarSign, Trash2, Upload
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import EmptyState from '@/components/ui/EmptyState'

// ============================================
// Types
// ============================================
type Produto = {
  id: string
  codigo: string
  nome: string
  tipo: 'urna' | 'acessorio'
  categoria: string | null
  custo: number | null
  preco: number | null
  estoque_infinito: boolean
  imagem_url: string | null
  precisa_foto: boolean
  nome_retorno: string | null
  rescaldo_tipo: string | null
  ativo: boolean
}

type SortField = 'codigo' | 'nome' | 'tipo' | 'preco' | 'categoria'
type SortDir = 'asc' | 'desc'

const TIPO_LABELS: Record<string, string> = { urna: 'Urna', acessorio: 'Acessório', incluso: 'Incluso' }
const TIPO_COLORS: Record<string, string> = { urna: '#7c3aed', acessorio: '#3b82f6', incluso: '#22c55e' }

function formatMoeda(v: number | null) {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ============================================
// Page
// ============================================
export default function CatalogoPage() {
  const supabase = createClient()
  const { isSuperAdmin } = useUnit()

  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null) // id do produto sendo salvo

  // Filtros
  const [busca, setBusca] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('todos')
  const [statusFiltro, setStatusFiltro] = useState('ativos')
  const [sortField, setSortField] = useState<SortField>('tipo')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Modal
  const [editProduto, setEditProduto] = useState<Produto | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [isNew, setIsNew] = useState(false)
  const [uploadingImg, setUploadingImg] = useState(false)
  const [erroImg, setErroImg] = useState<string | null>(null)

  // Form state
  const [form, setForm] = useState({
    codigo: '', nome: '', tipo: 'urna' as string, categoria: '',
    custo: '', preco: '', nome_retorno: '', precisa_foto: false,
    estoque_infinito: false, imagem_url: '',
  })

  useEffect(() => { carregarProdutos() }, [])

  async function carregarProdutos() {
    setLoading(true)
    const { data } = await supabase
      .from('produtos')
      .select('*')
      .order('tipo')
      .order('nome')
    if (data) setProdutos(data as Produto[])
    setLoading(false)
  }

  // Filtrar e ordenar
  const filtered = useMemo(() => {
    let list = [...produtos]

    if (tipoFiltro !== 'todos') list = list.filter(p => p.tipo === tipoFiltro)
    if (statusFiltro === 'ativos') list = list.filter(p => p.ativo)
    else if (statusFiltro === 'inativos') list = list.filter(p => !p.ativo)

    if (busca.trim()) {
      const t = busca.toLowerCase()
      list = list.filter(p =>
        p.nome.toLowerCase().includes(t) ||
        p.codigo.toLowerCase().includes(t) ||
        (p.categoria && p.categoria.toLowerCase().includes(t)) ||
        (p.nome_retorno && p.nome_retorno.toLowerCase().includes(t))
      )
    }

    list.sort((a, b) => {
      let va: any = a[sortField] || ''
      let vb: any = b[sortField] || ''
      if (typeof va === 'string') va = va.toLowerCase()
      if (typeof vb === 'string') vb = vb.toLowerCase()
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return list
  }, [produtos, tipoFiltro, statusFiltro, busca, sortField, sortDir])

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  // Toggle ativo (inline, sem modal)
  async function toggleAtivo(produto: Produto) {
    setSaving(produto.id)
    await supabase.from('produtos').update({ ativo: !produto.ativo } as never).eq('id', produto.id)
    setProdutos(prev => prev.map(p => p.id === produto.id ? { ...p, ativo: !p.ativo } : p))
    setSaving(null)
  }

  // Editar preço inline
  async function updateField(id: string, field: string, value: any) {
    setSaving(id)
    await supabase.from('produtos').update({ [field]: value } as never).eq('id', id)
    setProdutos(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
    setSaving(null)
  }

  // Modal: novo ou editar
  function openNew() {
    setIsNew(true)
    setEditProduto(null)
    setForm({ codigo: '', nome: '', tipo: 'urna', categoria: '', custo: '', preco: '', nome_retorno: '', precisa_foto: false, estoque_infinito: false, imagem_url: '' })
    setShowModal(true)
  }

  function openEdit(p: Produto) {
    setIsNew(false)
    setEditProduto(p)
    setForm({
      codigo: p.codigo,
      nome: p.nome,
      tipo: p.tipo,
      categoria: p.categoria || '',
      custo: p.custo?.toString() || '',
      preco: p.preco?.toString() || '',
      nome_retorno: p.nome_retorno || '',
      precisa_foto: p.precisa_foto,
      estoque_infinito: p.estoque_infinito,
      imagem_url: p.imagem_url || '',
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.codigo || !form.nome) return
    setSaving('modal')

    const data = {
      codigo: form.codigo.trim(),
      nome: form.nome.trim(),
      tipo: form.tipo,
      categoria: form.categoria.trim() || null,
      custo: form.custo ? parseFloat(form.custo) : 0,
      preco: form.preco ? parseFloat(form.preco) : 0,
      nome_retorno: form.nome_retorno.trim() || null,
      precisa_foto: form.precisa_foto,
      estoque_infinito: form.estoque_infinito,
      imagem_url: form.imagem_url.trim() || null,
    }

    if (isNew) {
      await supabase.from('produtos').insert(data as never)
    } else if (editProduto) {
      await supabase.from('produtos').update(data as never).eq('id', editProduto.id)
    }

    setShowModal(false)
    setSaving(null)
    await carregarProdutos()
  }

  async function uploadImagem(file: File) {
    setErroImg(null)
    // Validação básica: imagem até 5 MB
    if (!file.type.startsWith('image/')) { setErroImg('Selecione um arquivo de imagem'); return }
    if (file.size > 5 * 1024 * 1024) { setErroImg('Imagem muito grande (máx. 5 MB)'); return }
    setUploadingImg(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const slug = (form.codigo.trim() || 'produto').replace(/[^a-zA-Z0-9-]/g, '')
      const path = `produtos/${slug}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('fotos')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (upErr) {
        console.error('Erro upload imagem produto:', upErr)
        setErroImg('Falha no upload. Tente novamente.')
        return
      }
      const { data: pub } = supabase.storage.from('fotos').getPublicUrl(path)
      setForm(f => ({ ...f, imagem_url: pub.publicUrl }))
    } finally {
      setUploadingImg(false)
    }
  }

  // Contadores
  const counts = useMemo(() => {
    const c = { total: produtos.length, ativos: 0, inativos: 0, urna: 0, acessorio: 0, incluso: 0 }
    produtos.forEach(p => {
      if (p.ativo) c.ativos++; else c.inativos++
      c[p.tipo as keyof typeof c] = (c[p.tipo as keyof typeof c] as number || 0) + 1
    })
    return c
  }, [produtos])

  // Categorias existentes (pra sugestão no cadastro) — derivadas dos produtos carregados
  const categorias = useMemo(() => {
    const set = new Set<string>()
    produtos.forEach(p => { if (p.categoria?.trim()) set.add(p.categoria.trim()) })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [produtos])

  // Sort icon
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown className="h-3 w-3 opacity-30" />
    return sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
  }

  if (!isSuperAdmin) {
    return <div className="animate-fade-in"><EmptyState icon={Shield} title="Acesso restrito" description="Somente administradores podem acessar esta página." /></div>
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-purple-900/30 items-center justify-center">
            <Package className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <h1 className="text-title text-[var(--shell-text)]">Catálogo</h1>
            <p className="text-small text-[var(--shell-text-muted)]">
              {counts.total} produtos ({counts.ativos} ativos) — {counts.urna} urnas, {counts.acessorio} acessórios, {counts.incluso} inclusos
            </p>
          </div>
        </div>
        <button onClick={openNew} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Novo Produto</span>
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Tipo */}
        <div className="flex gap-1">
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'urna', label: 'Urnas' },
            { key: 'acessorio', label: 'Acessórios' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTipoFiltro(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                tipoFiltro === t.key ? 'bg-purple-600 text-white' : 'text-[var(--surface-500)] hover:bg-[var(--surface-50)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <span style={{ color: '#475569' }}>|</span>

        {/* Status */}
        <div className="flex gap-1">
          {[
            { key: 'ativos', label: 'Ativos' },
            { key: 'inativos', label: 'Ocultos' },
            { key: 'todos', label: 'Todos' },
          ].map(s => (
            <button
              key={s.key}
              onClick={() => setStatusFiltro(s.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFiltro === s.key ? 'bg-emerald-600 text-white' : 'text-[var(--surface-500)] hover:bg-[var(--surface-50)]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Busca */}
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--surface-400)]" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, código, categoria..."
            className="input w-full pl-9 pr-8 text-sm py-1.5"
          />
          {busca && (
            <button onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="h-3.5 w-3.5 text-[var(--surface-400)]" />
            </button>
          )}
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="card p-8 text-center" style={{ color: '#94a3b8' }}>Carregando catálogo...</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Package} title="Nenhum produto" description={busca ? 'Ajuste a busca' : 'Nenhum produto neste filtro'} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--surface-200)' }}>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-[var(--surface-500)] uppercase">
                  <button onClick={() => toggleSort('codigo')} className="flex items-center gap-1">Cód <SortIcon field="codigo" /></button>
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-[var(--surface-500)] uppercase">
                  <button onClick={() => toggleSort('nome')} className="flex items-center gap-1">Produto <SortIcon field="nome" /></button>
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-[var(--surface-500)] uppercase">
                  <button onClick={() => toggleSort('tipo')} className="flex items-center gap-1">Tipo <SortIcon field="tipo" /></button>
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-[var(--surface-500)] uppercase">
                  <button onClick={() => toggleSort('categoria')} className="flex items-center gap-1">Categoria <SortIcon field="categoria" /></button>
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-[var(--surface-500)] uppercase">Custo</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-[var(--surface-500)] uppercase">
                  <button onClick={() => toggleSort('preco')} className="flex items-center gap-1 ml-auto">Preço <SortIcon field="preco" /></button>
                </th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-[var(--surface-500)] uppercase">Protocolo</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-[var(--surface-500)] uppercase">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr
                  key={p.id}
                  className={`transition-colors hover:bg-[var(--surface-50)] ${!p.ativo ? 'opacity-50' : ''}`}
                  style={{ borderBottom: '1px solid var(--surface-100)' }}
                >
                  {/* Código */}
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-xs text-[var(--surface-500)]">{p.codigo}</span>
                  </td>

                  {/* Nome + imagem */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {p.imagem_url ? (
                        <img src={p.imagem_url} alt="" className="w-8 h-8 rounded object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-[var(--surface-100)] flex items-center justify-center">
                          <Package className="h-4 w-4 text-[var(--surface-300)]" />
                        </div>
                      )}
                      <div>
                        <span className="font-medium text-[var(--surface-800)]">{p.nome}</span>
                        {p.precisa_foto && <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400">📷</span>}
                      </div>
                    </div>
                  </td>

                  {/* Tipo */}
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: (TIPO_COLORS[p.tipo] || '#666') + '20', color: TIPO_COLORS[p.tipo] || '#666' }}>
                      {TIPO_LABELS[p.tipo] || p.tipo}
                    </span>
                  </td>

                  {/* Categoria */}
                  <td className="px-3 py-2.5 text-xs text-[var(--surface-500)]">{p.categoria || '—'}</td>

                  {/* Custo */}
                  <td className="px-3 py-2.5 text-right text-xs text-[var(--surface-400)]">{formatMoeda(p.custo)}</td>

                  {/* Preço — edição inline */}
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1 rounded border border-transparent hover:border-[var(--surface-200)] focus-within:border-emerald-500 focus-within:bg-emerald-500/5 transition-all px-2 py-1">
                      <span className="text-[10px] font-medium text-[var(--surface-400)]">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={p.preco ?? ''}
                        placeholder="0,00"
                        className="w-20 text-right text-xs font-semibold outline-none bg-transparent text-[var(--surface-700)]"
                        onBlur={e => {
                          const raw = e.target.value.trim()
                          const novo = raw === '' ? null : parseFloat(raw)
                          if (novo !== null && (!Number.isFinite(novo) || novo < 0)) { e.target.value = String(p.preco ?? ''); return }
                          if (novo !== (p.preco ?? null)) updateField(p.id, 'preco', novo)
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { (e.target as HTMLInputElement).value = String(p.preco ?? ''); (e.target as HTMLInputElement).blur() } }}
                      />
                    </div>
                  </td>

                  {/* Nome Retorno (protocolo) — edição inline */}
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="text"
                      defaultValue={p.nome_retorno || ''}
                      placeholder="—"
                      className="w-full text-center text-[11px] font-medium px-1.5 py-1 rounded border border-transparent hover:border-[var(--surface-200)] focus:border-amber-500 focus:bg-amber-500/5 outline-none transition-all bg-transparent text-[var(--surface-600)]"
                      onBlur={e => {
                        const val = e.target.value.trim() || null
                        if (val !== (p.nome_retorno || null)) updateField(p.id, 'nome_retorno', val)
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    />
                  </td>

                  {/* Ações */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 rounded-lg hover:bg-[var(--surface-100)] transition-colors"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5 text-[var(--surface-500)]" />
                      </button>
                      <button
                        onClick={() => toggleAtivo(p)}
                        className="p-1.5 rounded-lg hover:bg-[var(--surface-100)] transition-colors"
                        title={p.ativo ? 'Ocultar' : 'Exibir'}
                        disabled={saving === p.id}
                      >
                        {saving === p.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--surface-400)]" />
                        ) : p.ativo ? (
                          <Eye className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5 text-red-400" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="px-3 py-2 text-xs text-[var(--surface-400)]" style={{ borderTop: '1px solid var(--surface-100)' }}>
            {filtered.length} produto{filtered.length !== 1 ? 's' : ''} exibido{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Modal Criar/Editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div
            className="rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            style={{ background: '#1e293b', border: '1px solid #334155' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6" style={{ borderBottom: '1px solid #334155' }}>
              <h2 className="text-lg font-semibold" style={{ color: '#e2e8f0' }}>
                {isNew ? 'Novo Produto' : `Editar: ${editProduto?.nome}`}
              </h2>
            </div>

            <div className="p-6 space-y-4">
              {/* Código + Tipo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#94a3b8' }}>Código</label>
                  <input
                    value={form.codigo}
                    onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
                    disabled={!isNew}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }}
                    placeholder="Ex: 1001"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#94a3b8' }}>Tipo</label>
                  <select
                    value={form.tipo}
                    onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }}
                  >
                    <option value="urna">Urna</option>
                    <option value="acessorio">Acessório</option>
                  </select>
                </div>
              </div>

              {/* Nome */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#94a3b8' }}>Nome</label>
                <input
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }}
                  placeholder="Nome comercial do produto"
                />
              </div>

              {/* Categoria */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#94a3b8' }}>Categoria</label>
                <input
                  value={form.categoria}
                  onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                  list="lista-categorias"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }}
                  placeholder="Escolha uma existente ou digite uma nova"
                />
                <datalist id="lista-categorias">
                  {categorias.map(c => <option key={c} value={c} />)}
                </datalist>
                <p className="text-[10px] mt-1" style={{ color: '#64748b' }}>Clique no campo pra ver as categorias já cadastradas, ou digite uma nova.</p>
              </div>

              {/* Custo + Preço */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#94a3b8' }}>Custo (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.custo}
                    onChange={e => setForm(f => ({ ...f, custo: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#94a3b8' }}>Preço (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.preco}
                    onChange={e => setForm(f => ({ ...f, preco: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Nome Retorno (protocolo) */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#94a3b8' }}>Nome no Protocolo de Retorno</label>
                <input
                  value={form.nome_retorno}
                  onChange={e => setForm(f => ({ ...f, nome_retorno: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }}
                  placeholder="Nome abreviado (ex: Plano MDF P)"
                />
                <p className="text-[10px] mt-1" style={{ color: '#64748b' }}>Aparece no protocolo de entrega. Deixe vazio se não aplicável.</p>
              </div>

              {/* Imagem do produto */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#94a3b8' }}>Imagem do Produto</label>
                <div className="flex items-start gap-3">
                  {/* Preview */}
                  <div
                    className="w-16 h-16 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                    style={{ background: '#0f172a', border: '1px solid #334155' }}
                  >
                    {form.imagem_url
                      ? <img src={form.imagem_url} alt="" className="w-full h-full object-cover" />
                      : <Image className="h-5 w-5" style={{ color: '#475569' }} />}
                  </div>
                  <div className="flex-1 space-y-2">
                    {/* Botão de upload */}
                    <label
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
                      style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }}
                    >
                      {uploadingImg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {uploadingImg ? 'Enviando...' : 'Escolher arquivo'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingImg}
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadImagem(f); e.target.value = '' }}
                      />
                    </label>
                    {/* URL (preenchida pelo upload ou colável manualmente) */}
                    <input
                      value={form.imagem_url}
                      onChange={e => setForm(f => ({ ...f, imagem_url: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                      style={{ background: '#0f172a', color: '#94a3b8', border: '1px solid #334155' }}
                      placeholder="Envie um arquivo ou cole uma URL"
                    />
                    {erroImg && <p className="text-[10px]" style={{ color: '#f87171' }}>{erroImg}</p>}
                  </div>
                </div>
              </div>

              {/* Toggles */}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.precisa_foto}
                    onChange={e => setForm(f => ({ ...f, precisa_foto: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-xs" style={{ color: '#94a3b8' }}>Exige foto do pet</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.estoque_infinito}
                    onChange={e => setForm(f => ({ ...f, estoque_infinito: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-xs" style={{ color: '#94a3b8' }}>Estoque infinito</span>
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 flex items-center justify-end gap-3" style={{ borderTop: '1px solid #334155' }}>
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ color: '#94a3b8', border: '1px solid #334155' }}>
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving === 'modal' || !form.codigo || !form.nome}
                className="btn-primary flex items-center gap-2"
              >
                {saving === 'modal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {isNew ? 'Criar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
