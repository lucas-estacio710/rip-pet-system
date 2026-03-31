'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Users, Search, X, Plus, Loader2, ToggleLeft, ToggleRight, History, ChevronDown, Pencil
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'

const UNIT_COLORS: Record<string, string> = {
  ST: '#7c3aed', SP: '#ef4444', CP: '#22c55e', SJ: '#cbd5e1',
  RS: '#f59e0b', PA: '#ec4899', PI: '#06b6d4', MA: '#f97316',
}
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

type Funcionario = {
  id: string
  nome: string
  ativo: boolean
  unidade_id: string
  created_at: string
  unidade?: { nome: string; codigo: string; cidade: string; estado: string }
}

type LogEntry = {
  id: string
  entidade: string
  entidade_nome: string
  campo: string
  campo_label: string
  valor_anterior: string | null
  valor_novo: string | null
  tipo: string
  criado_em: string
  nota: string | null
  alterado_por_email: string | null
}

export default function AdminFuncionariosPage() {
  const supabase = createClient()
  const { isSuperAdmin, currentUnit, currentRole, allUnidades, userPerfis } = useUnit()

  // Unidades que o usuário pode gerenciar
  const unidadesGerenciaveis = isSuperAdmin
    ? allUnidades
    : allUnidades.filter(u => userPerfis.some(p => p.unidade.id === u.id && (p.role === 'gerente' || p.role === 'super_admin')))

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroUnidade, setFiltroUnidade] = useState<string>('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [sortBy, setSortBy] = useState<'nome' | 'unidade' | 'status'>('nome')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Form state (criar/editar)
  const [formId, setFormId] = useState<string | null>(null) // null = criar, string = editar
  const [formNome, setFormNome] = useState('')
  const [formUnidadeId, setFormUnidadeId] = useState('') // edição: unidade única
  const [formUnidadeIds, setFormUnidadeIds] = useState<string[]>([]) // criação: múltiplas
  const [formOriginal, setFormOriginal] = useState<{ nome: string; unidadeId: string } | null>(null)
  const [formOriginalUnidades, setFormOriginalUnidades] = useState<string[]>([])

  const canAccess = isSuperAdmin || currentRole === 'gerente'

  async function getUser() {
    const { data } = await supabase.auth.getUser()
    return { id: data.user?.id || null, email: data.user?.email || null }
  }

  async function registrarLog(params: {
    entidadeId: string
    entidadeNome: string
    campo: string
    campoLabel: string
    valorAnterior: string | null
    valorNovo: string | null
    tipo: string
    nota?: string
  }) {
    const user = await getUser()
    await supabase.from('historico_alteracoes').insert({
      entidade: 'funcionarios',
      entidade_id: params.entidadeId,
      entidade_nome: params.entidadeNome,
      campo: params.campo,
      campo_label: params.campoLabel,
      valor_anterior: params.valorAnterior,
      valor_novo: params.valorNovo,
      tipo: params.tipo,
      alterado_por: user.id,
      alterado_por_email: user.email,
      nota: params.nota || null,
    } as never)
  }

  async function carregarLogs() {
    const { data } = await supabase
      .from('historico_alteracoes')
      .select('id, entidade, entidade_nome, campo, campo_label, valor_anterior, valor_novo, tipo, criado_em, nota, alterado_por_email')
      .eq('entidade', 'funcionarios')
      .order('criado_em', { ascending: false })
      .limit(50)
    if (data) setLogs(data as LogEntry[])
  }

  const carregar = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('funcionarios')
      .select('id, nome, ativo, unidade_id, created_at, unidade:unidades(nome, codigo, cidade, estado)')
      .order('nome')

    // Gerente vê só da própria unidade
    if (!isSuperAdmin && currentUnit) {
      query = query.eq('unidade_id', currentUnit.id)
    }

    const { data, error } = await query
    if (error) {
      console.error('Erro ao carregar funcionários:', error)
      setFuncionarios([])
    } else {
      setFuncionarios((data || []) as Funcionario[])
    }
    setLoading(false)
  }, [isSuperAdmin, currentUnit])

  useEffect(() => {
    if (canAccess) { carregar(); carregarLogs() }
  }, [carregar, canAccess])

  // Filtrar, ordenar e separar ativos/inativos
  function toggleSort(col: 'nome' | 'unidade' | 'status') {
    if (sortBy === col) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('asc')
    }
  }

  const sortIndicator = (col: 'nome' | 'unidade' | 'status') =>
    sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''

  const filtrados = funcionarios.filter(f => {
    if (busca) {
      const termo = busca.toLowerCase()
      if (!f.nome.toLowerCase().includes(termo)) return false
    }
    if (filtroUnidade && f.unidade_id !== filtroUnidade) return false
    return true
  }).sort((a, b) => {
    let cmp = 0
    if (sortBy === 'nome') {
      cmp = a.nome.localeCompare(b.nome, 'pt-BR')
    } else if (sortBy === 'unidade') {
      const uA = (a.unidade as unknown as { nome: string } | null)?.nome || ''
      const uB = (b.unidade as unknown as { nome: string } | null)?.nome || ''
      cmp = uA.localeCompare(uB, 'pt-BR')
    } else if (sortBy === 'status') {
      cmp = (a.ativo === b.ativo) ? 0 : a.ativo ? -1 : 1
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const ativos_list = filtrados.filter(f => f.ativo)
  const inativos_list = filtrados.filter(f => !f.ativo)

  // Toggle ativo/inativo
  async function toggleAtivo(func: Funcionario) {
    setTogglingId(func.id)
    const { error } = await supabase
      .from('funcionarios')
      .update({ ativo: !func.ativo } as never)
      .eq('id', func.id)

    if (!error) {
      setFuncionarios(prev =>
        prev.map(f => f.id === func.id ? { ...f, ativo: !f.ativo } : f)
      )
      await registrarLog({
        entidadeId: func.id,
        entidadeNome: func.nome,
        campo: 'ativo',
        campoLabel: 'Status',
        valorAnterior: func.ativo ? 'Ativo' : 'Inativo',
        valorNovo: !func.ativo ? 'Ativo' : 'Inativo',
        tipo: 'alteracao',
      })
      await carregarLogs()
    }
    setTogglingId(null)
  }

  // Abrir modal para criar
  function abrirModalCriar() {
    setFormId(null)
    setFormNome('')
    setFormUnidadeId('')
    setFormUnidadeIds(unidadesGerenciaveis.length === 1 ? [unidadesGerenciaveis[0].id] : [])
    setFormOriginal(null)
    setFormOriginalUnidades([])
    setShowModal(true)
  }

  // Abrir modal para editar — busca no banco todas as unidades onde o nome já existe
  async function abrirModalEditar(func: Funcionario) {
    setFormId(func.id)
    setFormNome(func.nome)
    setFormUnidadeId(func.unidade_id)
    setFormOriginal({ nome: func.nome, unidadeId: func.unidade_id })

    // Buscar todas as unidades onde este nome já está cadastrado
    const { data } = await supabase
      .from('funcionarios')
      .select('unidade_id')
      .eq('nome', func.nome)
    const existentes = (data || []).map((r: { unidade_id: string }) => r.unidade_id)
    setFormUnidadeIds(existentes)
    setFormOriginalUnidades(existentes)

    setShowModal(true)
  }

  // Salvar (criar ou editar)
  async function handleSalvar() {
    const nome = formNome.trim()
    if (!nome) return

    setSaving(true)

    if (formId) {
      // === EDITAR ===
      // 1. Atualizar nome se mudou
      if (nome !== formOriginal?.nome) {
        const { error } = await supabase
          .from('funcionarios')
          .update({ nome } as never)
          .eq('id', formId)

        if (!error) {
          await registrarLog({
            entidadeId: formId,
            entidadeNome: nome,
            campo: 'nome',
            campoLabel: 'Nome',
            valorAnterior: formOriginal?.nome || null,
            valorNovo: nome,
            tipo: 'alteracao',
          })
        }
      }

      // 2. Criar em novas unidades selecionadas (buscar no banco, não no state filtrado)
      const { data: existentes } = await supabase
        .from('funcionarios')
        .select('unidade_id')
        .eq('nome', formOriginal?.nome || nome)
      const jaExiste = (existentes || []).map((r: { unidade_id: string }) => r.unidade_id)
      const novasUnidades = formUnidadeIds.filter(uid => !jaExiste.includes(uid))

      if (novasUnidades.length > 0) {
        const rows = novasUnidades.map(uid => ({ nome, unidade_id: uid, ativo: true }))
        const { data: created, error } = await supabase
          .from('funcionarios')
          .insert(rows as never)
          .select('id, unidade_id') as { data: { id: string; unidade_id: string }[] | null; error: unknown }

        if (!error && created) {
          for (const row of created) {
            const unidadeNova = allUnidades.find(u => u.id === row.unidade_id)?.nome || ''
            await registrarLog({
              entidadeId: row.id,
              entidadeNome: nome,
              campo: 'criacao',
              campoLabel: 'Adicionado em unidade',
              valorAnterior: null,
              valorNovo: `${nome} (${unidadeNova})`,
              tipo: 'criacao',
            })
          }
        }
      }

      setShowModal(false)
      await carregar()
      await carregarLogs()
      if (nome !== formOriginal?.nome || novasUnidades.length > 0) setShowLogs(true)
    } else {
      // === CRIAR (múltiplas unidades) ===
      const ids = formUnidadeIds
      if (ids.length === 0) { setSaving(false); return }

      const rows = ids.map(uid => ({ nome, unidade_id: uid, ativo: true }))
      const { data: created, error } = await supabase
        .from('funcionarios')
        .insert(rows as never)
        .select('id, unidade_id') as { data: { id: string; unidade_id: string }[] | null; error: unknown }

      if (!error && created) {
        for (const row of created) {
          const unidadeNome = allUnidades.find(u => u.id === row.unidade_id)?.nome || ''
          await registrarLog({
            entidadeId: row.id,
            entidadeNome: nome,
            campo: 'criacao',
            campoLabel: 'Funcionário criado',
            valorAnterior: null,
            valorNovo: `${nome} (${unidadeNome})`,
            tipo: 'criacao',
          })
        }
        setShowModal(false)
        await carregar()
        await carregarLogs()
      } else {
        console.error('Erro ao criar funcionário:', error)
      }
    }
    setSaving(false)
  }

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-[var(--surface-400)]">Acesso restrito a gerentes e administradores.</p>
      </div>
    )
  }

  const ativos = ativos_list.length
  const inativos = inativos_list.length

  function renderRow(func: Funcionario) {
    const u = func.unidade as unknown as { nome: string; codigo: string } | null
    const unidadeCodigo = u?.codigo || '??'
    const unidadeNome = u?.nome || '—'
    return (
      <tr key={func.id} className="transition-colors hover:bg-[var(--surface-50)]">
        <td className="px-4 py-3">
          <span className="text-sm font-medium text-[var(--surface-800)]">{func.nome}</span>
        </td>
        {isSuperAdmin && (
          <td className="px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-[var(--surface-500)]">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center font-bold shrink-0"
                style={{
                  background: UNIT_COLORS[unidadeCodigo] || '#6366f1',
                  color: unidadeCodigo === 'SJ' ? '#334155' : '#fff',
                  fontSize: 8,
                }}
              >
                {unidadeCodigo}
              </div>
              {unidadeNome}
            </span>
          </td>
        )}
        <td className="px-4 py-3 text-center">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
            func.ativo
              ? 'bg-emerald-900/30 text-emerald-400'
              : 'bg-red-900/30 text-red-400'
          }`}>
            {func.ativo ? 'Ativo' : 'Inativo'}
          </span>
        </td>
        <td className="px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={() => abrirModalEditar(func)}
              className="p-1.5 rounded-lg hover:bg-[var(--surface-100)] transition-colors"
              title="Editar"
            >
              <Pencil className="h-4 w-4 text-[var(--surface-400)]" />
            </button>
            <button
              onClick={() => toggleAtivo(func)}
              disabled={togglingId === func.id}
              className="p-1.5 rounded-lg hover:bg-[var(--surface-100)] transition-colors disabled:opacity-50"
              title={func.ativo ? 'Desativar' : 'Ativar'}
            >
              {togglingId === func.id ? (
                <Loader2 className="h-5 w-5 animate-spin text-[var(--surface-400)]" />
              ) : func.ativo ? (
                <ToggleRight className="h-5 w-5 text-emerald-400" />
              ) : (
                <ToggleLeft className="h-5 w-5 text-[var(--surface-400)]" />
              )}
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--surface-800)] flex items-center gap-2">
            <Users className="h-5 w-5 text-[var(--brand-500)]" />
            Funcionários
          </h1>
          <p className="text-sm text-[var(--surface-400)] mt-1">
            {ativos} ativo{ativos !== 1 ? 's' : ''}{inativos > 0 ? ` · ${inativos} inativo${inativos !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <button
          onClick={abrirModalCriar}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ background: '#7c3aed' }}
        >
          <Plus className="h-4 w-4" />
          Novo Funcionário
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--surface-400)]" />
          <input
            type="text"
            placeholder="Buscar por nome..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="input pl-10 w-full"
          />
          {busca && (
            <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-[var(--surface-400)]" />
            </button>
          )}
        </div>
        {isSuperAdmin && allUnidades.length > 1 && (
          <select
            value={filtroUnidade}
            onChange={e => setFiltroUnidade(e.target.value)}
            className="input min-w-[180px]"
          >
            <option value="">Todas as unidades</option>
            {allUnidades.map(u => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum funcionário encontrado"
          description={busca ? 'Tente outro termo de busca' : 'Cadastre o primeiro funcionário da unidade'}
        />
      ) : (
        <div className="space-y-6">
          {/* Ativos */}
          {ativos_list.length > 0 && (
            <div className="rounded-xl border border-[var(--surface-200)] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-[var(--surface-50)] border-b border-[var(--surface-200)]">
                    <th onClick={() => toggleSort('nome')} className="text-left px-4 py-3 text-xs font-semibold text-[var(--surface-500)] uppercase tracking-wider cursor-pointer hover:text-[var(--surface-700)] select-none">Nome{sortIndicator('nome')}</th>
                    {isSuperAdmin && (
                      <th onClick={() => toggleSort('unidade')} className="text-left px-4 py-3 text-xs font-semibold text-[var(--surface-500)] uppercase tracking-wider cursor-pointer hover:text-[var(--surface-700)] select-none">Unidade{sortIndicator('unidade')}</th>
                    )}
                    <th onClick={() => toggleSort('status')} className="text-center px-4 py-3 text-xs font-semibold text-[var(--surface-500)] uppercase tracking-wider cursor-pointer hover:text-[var(--surface-700)] select-none">Status{sortIndicator('status')}</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-[var(--surface-500)] uppercase tracking-wider w-20">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--surface-100)]">
                  {ativos_list.map(func => renderRow(func))}
                </tbody>
              </table>
            </div>
          )}

          {/* Inativos */}
          {inativos_list.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[var(--surface-400)] uppercase tracking-wider mb-2 px-1">
                Inativos ({inativos_list.length})
              </p>
              <div className="rounded-xl border border-[var(--surface-200)] overflow-hidden opacity-60">
                <table className="w-full">
                  <tbody className="divide-y divide-[var(--surface-100)]">
                    {inativos_list.map(func => renderRow(func))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Histórico */}
      <div className="rounded-xl border border-[var(--surface-200)] overflow-hidden">
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--surface-50)] transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--surface-600)]">
            <History className="h-4 w-4" />
            Histórico de alterações ({logs.length})
          </span>
          <ChevronDown className={`h-4 w-4 text-[var(--surface-400)] transition-transform ${showLogs ? 'rotate-180' : ''}`} />
        </button>

        {showLogs && logs.length > 0 && (
          <div className="border-t border-[var(--surface-200)] divide-y divide-[var(--surface-100)] max-h-80 overflow-y-auto">
            {logs.map(log => (
              <div key={log.id} className="px-4 py-3 text-xs space-y-1.5">
                {/* Linha 1: Quem + Quando */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ background: '#7c3aed', color: '#fff' }}>
                      {(log.alterado_por_email || '?')[0].toUpperCase()}
                    </div>
                    <span className="font-medium text-[var(--surface-600)]">{log.alterado_por_email || 'Sistema'}</span>
                  </div>
                  <span className="text-[var(--surface-400)]">
                    {new Date(log.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {/* Linha 2: O quê */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[var(--surface-700)]">{log.entidade_nome}</span>
                  <span className="text-[var(--surface-400)]">—</span>
                  {log.tipo === 'criacao' ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-900/30 text-emerald-400">
                      + Criado
                    </span>
                  ) : (
                    <>
                      <span className="text-[var(--surface-500)]">{log.campo_label}:</span>
                      {log.valor_anterior && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-900/30 text-red-400">
                          − {log.valor_anterior}
                        </span>
                      )}
                      {log.valor_novo && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-900/30 text-emerald-400">
                          + {log.valor_novo}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {showLogs && logs.length === 0 && (
          <div className="border-t border-[var(--surface-200)] px-4 py-6 text-center text-sm text-[var(--surface-400)]">
            Nenhuma alteração registrada
          </div>
        )}
      </div>

      {/* Modal Criar/Editar Funcionário */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4"
            style={{ background: 'var(--surface-card, #1e293b)', border: '1px solid var(--surface-200)' }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--surface-800)]">{formId ? 'Editar Funcionário' : 'Novo Funcionário'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-[var(--surface-100)]">
                <X className="h-5 w-5 text-[var(--surface-400)]" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-[var(--surface-600)] mb-1">
                  Nome <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formNome}
                  onChange={e => setFormNome(e.target.value)}
                  placeholder="Nome do funcionário"
                  className="input w-full"
                  autoFocus
                />
              </div>

              {/* Unidade(s) — checkboxes */}
              <div>
                <label className="block text-sm font-medium text-[var(--surface-600)] mb-2">
                  Unidade{unidadesGerenciaveis.length > 1 ? 's' : ''} <span className="text-red-400">*</span>
                </label>
                {unidadesGerenciaveis.length > 1 ? (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {unidadesGerenciaveis.map(u => {
                      const checked = formUnidadeIds.includes(u.id)
                      // Na edição, unidades já cadastradas no banco ficam travadas (foram carregadas no abrirModalEditar)
                      const jaExisteNoBanco = formId ? formOriginalUnidades.includes(u.id) : false
                      return (
                        <label key={u.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${jaExisteNoBanco ? 'opacity-60' : 'cursor-pointer hover:bg-[var(--surface-50)]'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={jaExisteNoBanco}
                            onChange={() => {
                              if (jaExisteNoBanco) return
                              setFormUnidadeIds(prev =>
                                checked ? prev.filter(id => id !== u.id) : [...prev, u.id]
                              )
                            }}
                            className="h-4 w-4 rounded accent-purple-500"
                          />
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center font-bold shrink-0"
                            style={{
                              background: UNIT_COLORS[u.codigo] || '#6366f1',
                              color: u.codigo === 'SJ' ? '#334155' : '#fff',
                              fontSize: 8,
                            }}
                          >
                            {u.codigo}
                          </div>
                          <span className="text-sm text-[var(--surface-700)]">{u.nome}</span>
                          {jaExisteNoBanco && <span className="text-[10px] text-[var(--surface-400)] ml-auto">já cadastrado</span>}
                        </label>
                      )
                    })}
                  </div>
                ) : (
                  <div className="px-3 py-2 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)]">
                    <span className="text-sm font-medium text-[var(--surface-700)]">{unidadesGerenciaveis[0]?.nome}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--surface-600)] hover:bg-[var(--surface-100)] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvar}
                disabled={saving || !formNome.trim() || (!formId && formUnidadeIds.length === 0)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
                style={{ background: '#7c3aed' }}
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                  </span>
                ) : formId ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
