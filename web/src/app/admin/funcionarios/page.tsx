'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Users, Search, X, Plus, Loader2, ToggleLeft, ToggleRight, History, ChevronDown, Pencil, Check
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
  const { isSuperAdmin, currentUnit, currentRole, allUnidades } = useUnit()

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroUnidade, setFiltroUnidade] = useState<string>('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingNome, setEditingNome] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Form state
  const [formNome, setFormNome] = useState('')
  const [formUnidadeId, setFormUnidadeId] = useState('')

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

  // Filtrar e separar ativos/inativos
  const filtrados = funcionarios.filter(f => {
    if (busca) {
      const termo = busca.toLowerCase()
      if (!f.nome.toLowerCase().includes(termo)) return false
    }
    if (filtroUnidade && f.unidade_id !== filtroUnidade) return false
    return true
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

  // Editar nome
  function iniciarEdicao(func: Funcionario) {
    setEditingId(func.id)
    setEditingNome(func.nome)
  }

  async function salvarEdicao(func: Funcionario) {
    const novoNome = editingNome.trim()
    if (!novoNome || novoNome === func.nome) {
      setEditingId(null)
      return
    }
    setSavingEdit(true)
    const { error } = await supabase
      .from('funcionarios')
      .update({ nome: novoNome } as never)
      .eq('id', func.id)

    if (!error) {
      setFuncionarios(prev =>
        prev.map(f => f.id === func.id ? { ...f, nome: novoNome } : f)
      )
      await registrarLog({
        entidadeId: func.id,
        entidadeNome: novoNome,
        campo: 'nome',
        campoLabel: 'Nome',
        valorAnterior: func.nome,
        valorNovo: novoNome,
        tipo: 'alteracao',
      })
      await carregarLogs()
      setShowLogs(true)
    }
    setEditingId(null)
    setSavingEdit(false)
  }

  // Criar funcionário
  async function handleSalvar() {
    if (!formNome.trim()) return
    const unidadeId = isSuperAdmin ? formUnidadeId : currentUnit?.id
    if (!unidadeId) return

    setSaving(true)
    const nome = formNome.trim()
    const { data: created, error } = await supabase
      .from('funcionarios')
      .insert({ nome, unidade_id: unidadeId, ativo: true } as never)
      .select('id')
      .single() as { data: { id: string } | null; error: unknown }

    if (!error && created) {
      await registrarLog({
        entidadeId: created.id,
        entidadeNome: nome,
        campo: 'criacao',
        campoLabel: 'Funcionário criado',
        valorAnterior: null,
        valorNovo: nome,
        tipo: 'criacao',
      })
      setShowModal(false)
      setFormNome('')
      setFormUnidadeId('')
      await carregar()
      await carregarLogs()
    } else {
      console.error('Erro ao criar funcionário:', error)
    }
    setSaving(false)
  }

  function abrirModal() {
    setFormNome('')
    setFormUnidadeId(currentUnit?.id || '')
    setShowModal(true)
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
          {editingId === func.id ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editingNome}
                onChange={e => setEditingNome(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') salvarEdicao(func)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                className="input text-sm py-1 px-2 flex-1"
                autoFocus
              />
              <button
                onClick={() => salvarEdicao(func)}
                disabled={savingEdit}
                className="p-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                title="Salvar"
              >
                {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="p-1 rounded-lg hover:bg-[var(--surface-100)] transition-colors"
                title="Cancelar"
              >
                <X className="h-4 w-4 text-[var(--surface-400)]" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <span className="text-sm font-medium text-[var(--surface-800)]">{func.nome}</span>
              <button
                onClick={() => iniciarEdicao(func)}
                className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-[var(--surface-100)] transition-all"
                title="Editar nome"
              >
                <Pencil className="h-3.5 w-3.5 text-[var(--surface-400)]" />
              </button>
            </div>
          )}
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
          onClick={abrirModal}
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
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--surface-500)] uppercase tracking-wider">Nome</th>
                    {isSuperAdmin && (
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--surface-500)] uppercase tracking-wider">Unidade</th>
                    )}
                    <th className="text-center px-4 py-3 text-xs font-semibold text-[var(--surface-500)] uppercase tracking-wider">Status</th>
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

      {/* Modal Novo Funcionário */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4"
            style={{ background: 'var(--surface-card, #1e293b)', border: '1px solid var(--surface-200)' }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--surface-800)]">Novo Funcionário</h2>
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

              {isSuperAdmin && (
                <div>
                  <label className="block text-sm font-medium text-[var(--surface-600)] mb-1">
                    Unidade <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={formUnidadeId}
                    onChange={e => setFormUnidadeId(e.target.value)}
                    className="input w-full"
                  >
                    <option value="">Selecione...</option>
                    {allUnidades.map(u => (
                      <option key={u.id} value={u.id}>{u.nome}</option>
                    ))}
                  </select>
                </div>
              )}

              {!isSuperAdmin && currentUnit && (
                <div className="px-3 py-2 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)]">
                  <span className="text-sm text-[var(--surface-500)]">Unidade: </span>
                  <span className="text-sm font-medium text-[var(--surface-700)]">{currentUnit.nome}</span>
                </div>
              )}
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
                disabled={saving || !formNome.trim() || (isSuperAdmin && !formUnidadeId)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
                style={{ background: '#7c3aed' }}
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                  </span>
                ) : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
