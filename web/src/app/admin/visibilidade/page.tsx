'use client'

import { useEffect, useState } from 'react'
import { Eye, Save, Loader2, Check, Building2, Shield, Monitor, Wrench, FormInput } from 'lucide-react'
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
  { key: 'tela_estoque', label: 'Estoque', desc: 'Controle de estoque' },
  { key: 'tela_tutores', label: 'Tutores', desc: 'Cadastro de tutores' },
  { key: 'tela_comercial', label: 'Comercial', desc: 'Estabelecimentos e visitas' },
  { key: 'tela_entregas', label: 'Entregas', desc: 'Retorno + rotas de entrega' },
  { key: 'tela_gc', label: 'GC', desc: 'Gerenciamento de Cremações (Matriz)' },
]

const FUNCIONALIDADES: Item[] = [
  { key: 'func_produtos', label: 'Produtos', desc: 'Adicionar produtos ao contrato' },
  { key: 'func_financeiro', label: 'Financeiro', desc: 'Pagamentos e contas' },
  { key: 'func_nfs', label: 'NFs', desc: 'Notas fiscais' },
  { key: 'func_bac', label: 'BAC', desc: 'Botões de Ação Rápida' },
  { key: 'func_tags', label: 'Tags Pendências', desc: 'Tags de pendência no pipeline' },
  { key: 'func_gc', label: 'GC', desc: 'Tracking de cremação dentro do contrato' },
  { key: 'func_logs', label: 'Logs', desc: 'Histórico de alterações' },
]

const CAMPOS: Item[] = [
  // Sob demanda — Lucão adiciona aqui conforme identificar
  { key: 'campo_seguradora', label: 'Seguradora', desc: 'Campo de seguradora no contrato' },
  { key: 'campo_lacre', label: 'Lacre', desc: 'Número do lacre' },
  { key: 'campo_velorio', label: 'Velório', desc: 'Opções de velório' },
  { key: 'campo_acompanhamento', label: 'Acompanhamento', desc: 'Acompanhamento online/presencial' },
  { key: 'campo_pelinho', label: 'Pelinho', desc: 'Controle de pelinho' },
  { key: 'campo_certificado_nomes', label: 'Nomes Certificado', desc: 'Nomes para o certificado' },
]

type Categoria = { key: string; label: string; icon: typeof Monitor; color: string; items: Item[] }

const CATEGORIAS: Categoria[] = [
  { key: 'telas', label: 'Telas', icon: Monitor, color: '#3b82f6', items: TELAS },
  { key: 'funcionalidades', label: 'Funcionalidades', icon: Wrench, color: '#f59e0b', items: FUNCIONALIDADES },
  { key: 'campos', label: 'Campos', icon: FormInput, color: '#8b5cf6', items: CAMPOS },
]

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

  useEffect(() => { loadUnidades() }, [])

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
    const promises = Object.entries(changes).map(([unidadeId, modulos]) =>
      supabase.from('unidades').update({ modulos_ativos: modulos }).eq('id', unidadeId)
    )
    await Promise.all(promises)
    await refetch()
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
              {unidades.map(u => {
                const unitModulos = changes[u.id] || []
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--surface-100)' }} className="hover:bg-[var(--surface-50)] transition-colors">
                    <td className="px-3 py-2 sticky left-0 bg-[var(--surface-0)] z-10">
                      <button
                        onClick={() => toggleRow(u.id, cat.items)}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                        title="Marcar/desmarcar todos"
                      >
                        <Building2 className="h-3.5 w-3.5" style={{ color: '#a78bfa' }} />
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
    </div>
  )
}
