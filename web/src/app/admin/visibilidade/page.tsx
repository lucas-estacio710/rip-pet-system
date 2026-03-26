'use client'

import { useEffect, useState } from 'react'
import { Eye, Save, Loader2, Check, Building2, Shield } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import EmptyState from '@/components/ui/EmptyState'

// ============================================
// Módulos disponíveis
// ============================================
const MODULOS = [
  { key: 'fichas', label: 'Fichas', desc: 'Receber e processar fichas de entrada', fase: 1 },
  { key: 'pipeline', label: 'Pipeline', desc: 'Contratos, status, encaminhamentos', fase: 1 },
  { key: 'recepcao', label: 'Recepção', desc: 'Receber pets de outras unidades (Pinda)', fase: 1 },
  { key: 'preventivos', label: 'Preventivos', desc: 'Contratos preventivos', fase: 1 },
  { key: 'produtos', label: 'Produtos', desc: 'Catálogo, estoque, produtos do contrato', fase: 2 },
  { key: 'pagamentos', label: 'Pagamentos', desc: 'Financeiro, contas, taxas', fase: 2 },
  { key: 'leads', label: 'Leads', desc: 'Funil de leads do site', fase: 3 },
  { key: 'rotas', label: 'Rotas', desc: 'Rotas de entrega', fase: 3 },
  { key: 'comercial', label: 'Comercial', desc: 'Estabelecimentos, visitas, contatos', fase: 3 },
  { key: 'mensagens', label: 'Mensagens', desc: 'Templates e envio automático', fase: 3 },
  { key: 'relatorios', label: 'Relatórios', desc: 'Dashboards e exportação', fase: 3 },
]

const FASE_COLORS: Record<number, string> = {
  1: '#3b82f6',
  2: '#f59e0b',
  3: '#8b5cf6',
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
  const [changes, setChanges] = useState<Record<string, string[]>>({}) // unidade_id → modulos

  useEffect(() => {
    loadUnidades()
  }, [])

  async function loadUnidades() {
    setLoading(true)
    const { data } = await supabase
      .from('unidades')
      .select('id, codigo, nome, is_matriz, modulos_ativos, ordem')
      .order('ordem')
      .order('nome')

    if (data) {
      setUnidades(data as Unidade[])
      // Inicializar changes com estado atual
      const initial: Record<string, string[]> = {}
      data.forEach((u: any) => {
        initial[u.id] = [...(u.modulos_ativos || [])]
      })
      setChanges(initial)
    }
    setLoading(false)
  }

  function toggleModulo(unidadeId: string, modulo: string) {
    setChanges(prev => {
      const current = [...(prev[unidadeId] || [])]
      const idx = current.indexOf(modulo)
      if (idx >= 0) {
        current.splice(idx, 1)
      } else {
        current.push(modulo)
      }
      return { ...prev, [unidadeId]: current }
    })
    setSaved(false)
  }

  function toggleAll(modulo: string) {
    // Se todos têm, remove de todos. Se algum não tem, adiciona em todos.
    const allHave = unidades.every(u => (changes[u.id] || []).includes(modulo))
    setChanges(prev => {
      const next = { ...prev }
      unidades.forEach(u => {
        const current = [...(next[u.id] || [])]
        const idx = current.indexOf(modulo)
        if (allHave) {
          if (idx >= 0) current.splice(idx, 1)
        } else {
          if (idx < 0) current.push(modulo)
        }
        next[u.id] = current
      })
      return next
    })
    setSaved(false)
  }

  function toggleAllForUnit(unidadeId: string) {
    const current = changes[unidadeId] || []
    const allActive = MODULOS.every(m => current.includes(m.key))
    setChanges(prev => ({
      ...prev,
      [unidadeId]: allActive ? [] : MODULOS.map(m => m.key),
    }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)

    const promises = Object.entries(changes).map(([unidadeId, modulos]) =>
      supabase
        .from('unidades')
        .update({ modulos_ativos: modulos })
        .eq('id', unidadeId)
    )

    await Promise.all(promises)

    // Recarregar contexto pra refletir mudanças
    await refetch()

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  // Verificar se houve mudanças
  const hasChanges = unidades.some(u => {
    const original = u.modulos_ativos || []
    const current = changes[u.id] || []
    return original.length !== current.length || original.some(m => !current.includes(m))
  })

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
          <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-blue-900/30 items-center justify-center">
            <Eye className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-title text-[var(--shell-text)]">Visibilidade</h1>
            <p className="text-small text-[var(--shell-text-muted)]">Controle quais módulos cada unidade pode acessar</p>
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

      {/* Legenda de fases */}
      <div className="flex items-center gap-4 mb-4 text-xs">
        <span style={{ color: '#94a3b8' }}>Fases:</span>
        {[1, 2, 3].map(fase => (
          <span key={fase} className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ background: FASE_COLORS[fase] }} />
            <span style={{ color: '#94a3b8' }}>Fase {fase}{fase === 3 ? '+' : ''}</span>
          </span>
        ))}
      </div>

      {loading ? (
        <div className="card p-8 text-center" style={{ color: '#94a3b8' }}>Carregando...</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--surface-200)' }}>
                <th className="text-left px-3 py-3 font-semibold text-[var(--surface-600)] sticky left-0 bg-[var(--surface-bg)] z-10" style={{ minWidth: 160 }}>
                  Unidade
                </th>
                {MODULOS.map(m => (
                  <th key={m.key} className="px-2 py-3 text-center" style={{ minWidth: 80 }}>
                    <button
                      onClick={() => toggleAll(m.key)}
                      className="flex flex-col items-center gap-0.5 mx-auto hover:opacity-80 transition-opacity"
                      title={`${m.desc}\nClique para marcar/desmarcar todos`}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ background: FASE_COLORS[m.fase] }} />
                      <span className="text-xs font-semibold text-[var(--surface-600)]">{m.label}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {unidades.map(u => {
                const unitModulos = changes[u.id] || []
                const allActive = MODULOS.every(m => unitModulos.includes(m.key))

                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--surface-100)' }} className="hover:bg-[var(--surface-50)] transition-colors">
                    <td className="px-3 py-2.5 sticky left-0 bg-[var(--surface-bg)] z-10">
                      <button
                        onClick={() => toggleAllForUnit(u.id)}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                        title="Marcar/desmarcar todos"
                      >
                        <Building2 className="h-3.5 w-3.5 text-purple-400" />
                        <span className="font-medium text-[var(--surface-700)]">{u.nome}</span>
                        {u.is_matriz && (
                          <span className="text-[9px] px-1 py-0.5 rounded font-bold" style={{ background: 'rgba(245,158,11,0.2)', color: '#fbbf24' }}>MA</span>
                        )}
                        <span className="text-[10px] font-mono text-[var(--surface-400)]">{u.codigo}</span>
                      </button>
                    </td>
                    {MODULOS.map(m => {
                      const active = unitModulos.includes(m.key)
                      return (
                        <td key={m.key} className="px-2 py-2.5 text-center">
                          <button
                            onClick={() => toggleModulo(u.id, m.key)}
                            className="mx-auto flex items-center justify-center w-7 h-7 rounded-lg border-2 transition-all"
                            style={{
                              borderColor: active ? FASE_COLORS[m.fase] : 'var(--surface-200)',
                              background: active ? FASE_COLORS[m.fase] + '20' : 'transparent',
                            }}
                          >
                            {active && (
                              <Check className="h-4 w-4" style={{ color: FASE_COLORS[m.fase] }} />
                            )}
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
      )}
    </div>
  )
}
