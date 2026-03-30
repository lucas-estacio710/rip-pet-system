'use client'

import { useEffect, useState } from 'react'
import { Eye, Save, Loader2, Check, Shield, Monitor, Wrench, FormInput, Clock } from 'lucide-react'

const UNIT_COLORS: Record<string, string> = {
  ST: '#7c3aed', SP: '#ef4444', CP: '#22c55e', SJ: '#cbd5e1',
  RS: '#f59e0b', PA: '#ec4899', PI: '#06b6d4', MA: '#f97316',
}
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import EmptyState from '@/components/ui/EmptyState'

// ============================================
// Definições das 3 categorias
// ============================================

type Item = { key: string; label: string; desc: string }

const TELAS: Item[] = [
  { key: 'tela_dashboard', label: 'Dashboard', desc: 'Painel de indicadores' },
  { key: 'tela_leads', label: 'Leads', desc: 'Funil de leads do site' },
  { key: 'tela_fichas', label: 'Fichas', desc: 'Receber e processar fichas' },
  { key: 'tela_preventivos', label: 'Preventivos', desc: 'Contratos preventivos' },
  { key: 'tela_pipeline', label: 'Pipeline', desc: 'Contratos e status' },
  { key: 'tela_entregas', label: 'Encaminhamentos', desc: 'Envio e retorno de pets pra Matriz' },
  { key: 'tela_estoque', label: 'Estoque', desc: 'Controle de estoque' },
  { key: 'tela_tutores', label: 'Tutores', desc: 'Cadastro de tutores' },
  { key: 'tela_gc', label: 'GC', desc: 'Gerenciamento de Cremações (Matriz)' },
]

const OBJETOS: Item[] = [
  { key: 'func_tutores', label: 'Tutores', desc: 'Link "Ver cadastro" no card do tutor' },
  { key: 'func_gc', label: 'GC', desc: 'Tracking de cremação dentro do contrato' },
]

const CAMPOS_BOTOES: Item[] = [
  { key: 'cb_padronizacao_clinicas', label: 'Padronização Clínicas', desc: 'Autocomplete de estabelecimentos no processamento de ficha' },
]

type Categoria = { key: string; label: string; icon: typeof Monitor; color: string; items: Item[] }

const CATEGORIAS: Categoria[] = [
  { key: 'telas', label: 'Telas', icon: Monitor, color: '#3b82f6', items: TELAS },
  { key: 'objetos', label: 'Objetos Relacionados', icon: Wrench, color: '#f59e0b', items: OBJETOS },
  { key: 'campos', label: 'Campos e Botões', icon: FormInput, color: '#8b5cf6', items: CAMPOS_BOTOES },
]

type LogEntry = {
  id: string
  entidade_nome: string
  valor_anterior: string | null
  valor_novo: string | null
  nota: string | null
  criado_em: string
  alterado_por_email: string | null
}

type Unidade = {
  id: string
  codigo: string
  nome: string
  is_matriz: boolean
  modulos_ativos: string[]
  ordem: number
}

// ============================================
// Page
// ============================================
export default function VisibilidadePage() {
  const supabase = createClient()
  const { isSuperAdmin, refetch } = useUnit()

  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [changes, setChanges] = useState<Record<string, string[]>>({})
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [showLogs, setShowLogs] = useState(false)

  useEffect(() => { loadUnidades(); loadLogs() }, [])

  async function loadLogs() {
    const { data } = await supabase
      .from('historico_alteracoes')
      .select('id, entidade_nome, valor_anterior, valor_novo, nota, criado_em, alterado_por_email')
      .eq('entidade', 'visibilidade')
      .order('criado_em', { ascending: false })
      .limit(50)
    if (data) setLogs(data as LogEntry[])
  }

  async function loadUnidades() {
    setLoading(true)
    const { data } = await supabase
      .from('unidades')
      .select('id, codigo, nome, is_matriz, modulos_ativos, ordem')
      .order('ordem')
      .order('nome')

    if (data) {
      setUnidades(data as Unidade[])
      const initial: Record<string, string[]> = {}
      data.forEach((u: any) => { initial[u.id] = [...(u.modulos_ativos || [])] })
      setChanges(initial)
    }
    setLoading(false)
  }

  function toggle(unidadeId: string, key: string) {
    setChanges(prev => {
      const current = [...(prev[unidadeId] || [])]
      const idx = current.indexOf(key)
      if (idx >= 0) current.splice(idx, 1)
      else current.push(key)
      return { ...prev, [unidadeId]: current }
    })
    setSaved(false)
  }

  function toggleColumn(key: string) {
    const allHave = unidades.every(u => (changes[u.id] || []).includes(key))
    setChanges(prev => {
      const next = { ...prev }
      unidades.forEach(u => {
        const current = [...(next[u.id] || [])]
        const idx = current.indexOf(key)
        if (allHave) { if (idx >= 0) current.splice(idx, 1) }
        else { if (idx < 0) current.push(key) }
        next[u.id] = current
      })
      return next
    })
    setSaved(false)
  }

  function toggleRow(unidadeId: string, items: Item[]) {
    const current = changes[unidadeId] || []
    const allActive = items.every(m => current.includes(m.key))
    const otherKeys = current.filter(k => !items.some(m => m.key === k))
    setChanges(prev => ({
      ...prev,
      [unidadeId]: allActive ? otherKeys : [...otherKeys, ...items.map(m => m.key)],
    }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)

    // Pegar user pra log
    const { data: { user } } = await supabase.auth.getUser()

    // Salvar alterações + gerar logs
    const updatePromises: any[] = []
    const logEntries: any[] = []

    for (const [unidadeId, modulos] of Object.entries(changes)) {
      const unit = unidades.find(u => u.id === unidadeId)
      if (!unit) continue

      const antes = unit.modulos_ativos || []
      const depois = modulos

      // Só loga se mudou
      const mudou = antes.length !== depois.length || antes.some(m => !depois.includes(m))
      if (!mudou) continue

      const adicionados = depois.filter(m => !antes.includes(m))
      const removidos = antes.filter(m => !depois.includes(m))

      updatePromises.push(
        supabase.from('unidades').update({ modulos_ativos: modulos } as never).eq('id', unidadeId)
      )

      const partes: string[] = []
      if (adicionados.length > 0) partes.push(`+ ${adicionados.join(', ')}`)
      if (removidos.length > 0) partes.push(`− ${removidos.join(', ')}`)

      logEntries.push({
        entidade: 'visibilidade',
        entidade_id: unidadeId,
        entidade_nome: unit.nome,
        campo: 'modulos_ativos',
        campo_label: 'Módulos',
        valor_anterior: antes.join(', ') || null,
        valor_novo: depois.join(', ') || null,
        tipo: 'alteracao',
        alterado_por: user?.id || null,
        alterado_por_email: user?.email || null,
        nota: partes.join(' | '),
      })
    }

    await Promise.all(updatePromises)

    // Inserir logs
    if (logEntries.length > 0) {
      await supabase.from('historico_alteracoes').insert(logEntries as never)
    }

    await refetch()
    await loadUnidades()
    await loadLogs()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const hasChanges = unidades.some(u => {
    const original = u.modulos_ativos || []
    const current = changes[u.id] || []
    return original.length !== current.length || original.some(m => !current.includes(m))
  })

  if (!isSuperAdmin) {
    return <div className="animate-fade-in"><EmptyState icon={Shield} title="Acesso restrito" description="Somente administradores." /></div>
  }

  // ============================================
  // Render de uma matriz
  // ============================================
  function renderMatrix(cat: Categoria) {
    return (
      <div key={cat.key} className="mb-8">
        {/* Título da categoria */}
        <div className="flex items-center gap-2 mb-3">
          <cat.icon className="h-4 w-4" style={{ color: cat.color }} />
          <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: cat.color }}>{cat.label}</h2>
          <span className="text-[10px]" style={{ color: '#64748b' }}>{cat.items.length} itens</span>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--surface-200)' }}>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-[var(--surface-500)] sticky left-0 bg-[var(--surface-0)] z-10" style={{ minWidth: 140 }}>
                  Unidade
                </th>
                {cat.items.map(m => (
                  <th key={m.key} className="px-1.5 py-2.5 text-center" style={{ minWidth: 70 }}>
                    <button
                      onClick={() => toggleColumn(m.key)}
                      className="flex flex-col items-center gap-0.5 mx-auto hover:opacity-80 transition-opacity"
                      title={`${m.desc}\nClique para marcar/desmarcar todos`}
                    >
                      <span className="text-[10px] font-semibold text-[var(--surface-600)] leading-tight">{m.label}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...unidades].sort((a, b) => {
                // Ordenar por quantidade de itens DESTA categoria habilitados (mais → menos)
                const aCount = cat.items.filter(m => (changes[a.id] || []).includes(m.key)).length
                const bCount = cat.items.filter(m => (changes[b.id] || []).includes(m.key)).length
                return bCount - aCount
              }).map(u => {
                const unitModulos = changes[u.id] || []
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--surface-100)' }} className="hover:bg-[var(--surface-50)] transition-colors">
                    <td className="px-3 py-2 sticky left-0 bg-[var(--surface-0)] z-10">
                      <button
                        onClick={() => toggleRow(u.id, cat.items)}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                        title="Marcar/desmarcar todos"
                      >
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
                        <span className="font-medium text-[var(--surface-700)] text-xs">{u.nome}</span>
                        {u.is_matriz && (
                          <span className="text-[8px] px-1 py-0.5 rounded font-bold" style={{ background: 'rgba(245,158,11,0.2)', color: '#fbbf24' }}>MA</span>
                        )}
                      </button>
                    </td>
                    {cat.items.map(m => {
                      const active = unitModulos.includes(m.key)
                      return (
                        <td key={m.key} className="px-1.5 py-2 text-center">
                          <button
                            onClick={() => toggle(u.id, m.key)}
                            className="mx-auto flex items-center justify-center w-6 h-6 rounded-md border-2 transition-all"
                            style={{
                              borderColor: active ? cat.color : 'var(--surface-200)',
                              background: active ? cat.color + '20' : 'transparent',
                            }}
                          >
                            {active && <Check className="h-3.5 w-3.5" style={{ color: cat.color }} />}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-blue-900/30 items-center justify-center">
            <Eye className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-title text-[var(--shell-text)]">Visibilidade</h1>
            <p className="text-small text-[var(--shell-text-muted)]">Telas, funcionalidades e campos por unidade</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className={`btn-primary flex items-center gap-2 ${saved ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Salvando...</>
          ) : saved ? (
            <><Check className="h-4 w-4" />Salvo!</>
          ) : (
            <><Save className="h-4 w-4" />Salvar</>
          )}
        </button>
      </div>

      {loading ? (
        <div className="card p-8 text-center" style={{ color: '#94a3b8' }}>Carregando...</div>
      ) : (
        <>
          {CATEGORIAS.map(cat => renderMatrix(cat))}
        </>
      )}

      {/* Histórico de alterações */}
      <div className="mt-8">
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="flex items-center gap-2 text-xs font-medium mb-3"
          style={{ color: '#64748b' }}
        >
          <Clock className="h-3.5 w-3.5" />
          Histórico de alterações ({logs.length})
          <span style={{ transform: showLogs ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
        </button>

        {showLogs && logs.length > 0 && (
          <div className="card overflow-hidden">
            <div className="divide-y divide-[var(--surface-100)] max-h-80 overflow-y-auto">
              {logs.map(log => {
                // Parsear nota pra extrair adicionados/removidos
                const partes = (log.nota || '').split(' | ')
                const adicionados = partes.find(p => p.startsWith('+'))?.replace('+ ', '').split(', ') || []
                const removidos = partes.find(p => p.startsWith('−'))?.replace('− ', '').split(', ') || []

                return (
                  <div key={log.id} className="px-4 py-3 text-xs space-y-1.5">
                    {/* Linha 1: Quem + Quando */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ background: '#7c3aed', color: '#fff' }}>
                          {(log.alterado_por_email || '?')[0].toUpperCase()}
                        </div>
                        <span className="font-medium text-[var(--surface-600)]">{log.alterado_por_email || 'Sistema'}</span>
                      </div>
                      <span style={{ color: '#475569' }}>
                        {new Date(log.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {/* Linha 2: Unidade + Módulos */}
                    <div>
                      <span className="font-semibold text-[var(--surface-700)] mr-2">{log.entidade_nome}</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {adicionados.filter(Boolean).map(m => (
                          <span key={m} className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                            + {m}
                          </span>
                        ))}
                        {removidos.filter(Boolean).map(m => (
                          <span key={m} className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                            − {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {showLogs && logs.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: '#64748b' }}>Nenhuma alteração registrada</p>
        )}
      </div>
    </div>
  )
}
