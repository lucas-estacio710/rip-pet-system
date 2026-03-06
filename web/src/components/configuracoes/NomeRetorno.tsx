'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, Check, ChevronUp, ChevronDown, Save, Loader2 } from 'lucide-react'

type Produto = {
  id: string
  codigo: string
  nome: string
  nome_retorno: string | null
  tipo: string
  categoria: string | null
  ativo: boolean
}

type SortField = 'codigo' | 'nome' | 'tipo' | 'nome_retorno'
type SortDir = 'asc' | 'desc'

export default function NomeRetorno() {
  const supabase = createClient()
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)

  const [tipoFiltro, setTipoFiltro] = useState<string>('todos')
  const [statusFiltro, setStatusFiltro] = useState<string>('todos')
  const [busca, setBusca] = useState('')

  const [sortField, setSortField] = useState<SortField>('tipo')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [dbValues, setDbValues] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)

  const dirtyIds = useMemo(() => {
    const dirty = new Set<string>()
    for (const id of Object.keys(editValues)) {
      if ((editValues[id] ?? '') !== (dbValues[id] ?? '')) {
        dirty.add(id)
      }
    }
    return dirty
  }, [editValues, dbValues])

  useEffect(() => {
    fetchProdutos()
  }, [])

  async function fetchProdutos() {
    setLoading(true)
    const { data, error } = await supabase
      .from('produtos')
      .select('id, codigo, nome, nome_retorno, tipo, categoria, ativo')
      .eq('ativo', true)
      .order('tipo')
      .order('nome')

    if (!error && data) {
      const lista = data as unknown as Produto[]
      setProdutos(lista)
      const initial: Record<string, string> = {}
      lista.forEach((p) => {
        initial[p.id] = p.nome_retorno ?? ''
      })
      setEditValues(initial)
      setDbValues({ ...initial })
    }
    setLoading(false)
  }

  const contadores = useMemo(() => {
    const c = { todos: produtos.length, urna: 0, acessorio: 0, incluso: 0 }
    produtos.forEach((p) => {
      if (p.tipo === 'urna') c.urna++
      else if (p.tipo === 'acessorio') c.acessorio++
      else if (p.tipo === 'incluso') c.incluso++
    })
    return c
  }, [produtos])

  const contadoresStatus = useMemo(() => {
    const c = { todos: produtos.length, preenchido: 0, vazio: 0 }
    produtos.forEach((p) => {
      if (p.nome_retorno) c.preenchido++
      else c.vazio++
    })
    return c
  }, [produtos])

  const produtosFiltrados = useMemo(() => {
    let lista = [...produtos]

    if (tipoFiltro !== 'todos') {
      lista = lista.filter((p) => p.tipo === tipoFiltro)
    }

    if (statusFiltro === 'preenchido') {
      lista = lista.filter((p) => p.nome_retorno)
    } else if (statusFiltro === 'vazio') {
      lista = lista.filter((p) => !p.nome_retorno)
    }

    if (busca.trim()) {
      const termo = busca.toLowerCase().trim()
      lista = lista.filter(
        (p) =>
          p.nome.toLowerCase().includes(termo) ||
          p.codigo.toLowerCase().includes(termo) ||
          (p.nome_retorno && p.nome_retorno.toLowerCase().includes(termo))
      )
    }

    lista.sort((a, b) => {
      const valA = (a[sortField] ?? '') as string
      const valB = (b[sortField] ?? '') as string
      const cmp = valA.localeCompare(valB, 'pt-BR', { sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })

    return lista
  }, [produtos, tipoFiltro, statusFiltro, busca, sortField, sortDir])

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function handleInputChange(id: string, value: string) {
    setEditValues((prev) => ({ ...prev, [id]: value }))
  }

  const handleSave = useCallback(async (id: string) => {
    const valor = editValues[id]?.trim() || null
    setSavingId(id)

    try {
      const res = await fetch('/api/produtos/nome-retorno', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, nome_retorno: valor }),
      })
      const json = await res.json()

      if (json.ok) {
        setProdutos((prev) =>
          prev.map((p) => (p.id === id ? { ...p, nome_retorno: valor } : p))
        )
        setDbValues((prev) => ({ ...prev, [id]: valor ?? '' }))
        setFlashId(id)
        setTimeout(() => setFlashId(null), 800)
      } else {
        alert(`Erro ao salvar: ${json.error}`)
      }
    } catch {
      alert('Erro de conexão ao salvar')
    }
    setSavingId(null)
  }, [editValues])

  const handleBulkSave = useCallback(async () => {
    const updates = Array.from(dirtyIds).map((id) => ({
      id,
      nome_retorno: editValues[id]?.trim() || null,
    }))

    if (updates.length === 0) return

    setBulkSaving(true)
    setBulkResult(null)

    try {
      const res = await fetch('/api/produtos/nome-retorno', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      const json = await res.json()

      if (json.ok > 0) {
        setProdutos((prev) =>
          prev.map((p) => {
            if (dirtyIds.has(p.id)) {
              return { ...p, nome_retorno: editValues[p.id]?.trim() || null }
            }
            return p
          })
        )
        setDbValues((prev) => {
          const next = { ...prev }
          for (const id of dirtyIds) {
            next[id] = editValues[id]?.trim() ?? ''
          }
          return next
        })
        setBulkResult(`${json.ok} salvo(s)${json.erros > 0 ? `, ${json.erros} erro(s)` : ''}`)
        setTimeout(() => setBulkResult(null), 3000)
      } else {
        setBulkResult(`Erro: ${json.error || 'falha ao salvar'}`)
      }
    } catch {
      setBulkResult('Erro de conexão')
    }
    setBulkSaving(false)
  }, [dirtyIds, editValues])

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUp className="h-3.5 w-3.5 text-slate-400 opacity-0 group-hover:opacity-100" />
    return sortDir === 'asc'
      ? <ChevronUp className="h-3.5 w-3.5 text-purple-400" />
      : <ChevronDown className="h-3.5 w-3.5 text-purple-400" />
  }

  const tipoLabel: Record<string, string> = {
    todos: 'Todos',
    urna: 'Urna',
    acessorio: 'Acessorio',
    incluso: 'Incluso',
  }

  const tipoCor: Record<string, string> = {
    urna: 'bg-amber-900/30 text-amber-400',
    acessorio: 'bg-blue-900/30 text-blue-400',
    incluso: 'bg-green-900/30 text-green-400',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
      </div>
    )
  }

  return (
    <div>
      {/* Botão Salvar Todos — fixo no canto inferior direito */}
      {dirtyIds.size > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
          {bulkResult && (
            <span className="text-sm font-medium text-green-400 bg-slate-800 px-3 py-2 rounded-lg shadow-lg border border-green-700">
              {bulkResult}
            </span>
          )}
          <button
            onClick={handleBulkSave}
            disabled={bulkSaving}
            className="flex items-center gap-2 px-5 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50 font-medium text-sm shadow-lg shadow-green-600/30"
          >
            {bulkSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar Todos ({dirtyIds.size})
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-slate-700/50 rounded-lg p-3 mb-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-500 mr-1">Tipo:</span>
          {(['todos', 'urna', 'acessorio', 'incluso'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTipoFiltro(t)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                tipoFiltro === t
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600'
              }`}
            >
              {tipoLabel[t]}{' '}
              <span className="opacity-70">
                ({contadores[t as keyof typeof contadores]})
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-500 mr-1">Status:</span>
          {(['todos', 'preenchido', 'vazio'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFiltro(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                statusFiltro === s
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600'
              }`}
            >
              {s === 'todos' ? 'Todos' : s === 'preenchido' ? 'Preenchido' : 'Vazio'}{' '}
              <span className="opacity-70">
                ({contadoresStatus[s as keyof typeof contadoresStatus]})
              </span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por código, nome ou nome retorno..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-slate-700 text-slate-200"
          />
        </div>
      </div>

      {/* Contador */}
      <div className="text-xs text-slate-500 mb-2">
        {produtosFiltrados.length} produto{produtosFiltrados.length !== 1 ? 's' : ''}
        {dirtyIds.size > 0 && (
          <span className="ml-2 text-amber-400 font-medium">
            ({dirtyIds.size} alterado{dirtyIds.size !== 1 ? 's' : ''} sem salvar)
          </span>
        )}
      </div>

      {/* Tabela */}
      <div className="bg-slate-800 rounded-lg border border-slate-600 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-600 bg-slate-700/50">
              {([
                ['codigo', 'Código'],
                ['nome', 'Nome Comercial'],
                ['tipo', 'Tipo'],
                ['nome_retorno', 'Nome Retorno'],
              ] as [SortField, string][]).map(([field, label]) => (
                <th
                  key={field}
                  onClick={() => handleSort(field)}
                  className="group text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-700 select-none"
                >
                  <div className="flex items-center gap-1">
                    {label}
                    <SortIcon field={field} />
                  </div>
                </th>
              ))}
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {produtosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-slate-400 text-sm">
                  Nenhum produto encontrado
                </td>
              </tr>
            ) : (
              produtosFiltrados.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b border-slate-700 transition-colors duration-500 ${
                    flashId === p.id
                      ? 'bg-green-900/30'
                      : dirtyIds.has(p.id)
                        ? 'bg-amber-900/20'
                        : 'hover:bg-slate-700'
                  }`}
                >
                  <td className="px-4 py-2.5 text-sm font-mono text-slate-600">
                    {p.codigo}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-slate-200">{p.nome}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        tipoCor[p.tipo] ?? 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {p.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="text"
                      value={editValues[p.id] ?? ''}
                      onChange={(e) => handleInputChange(p.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && dirtyIds.has(p.id)) handleSave(p.id)
                      }}
                      className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                        dirtyIds.has(p.id) ? 'border-amber-400 bg-amber-900/20' : 'border-slate-600'
                      }`}
                      placeholder="—"
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    {dirtyIds.has(p.id) && (
                      <button
                        onClick={() => handleSave(p.id)}
                        disabled={savingId === p.id}
                        className="p-1 rounded hover:bg-green-900/30 transition-colors disabled:opacity-50"
                        title="Salvar"
                      >
                        {savingId === p.id ? (
                          <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4 text-green-400" />
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
