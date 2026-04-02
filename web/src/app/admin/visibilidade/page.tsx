'use client'

import React, { useEffect, useState } from 'react'
import { Eye, Save, Loader2, Check, Shield, Monitor, Wrench, FormInput, Clock, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import EmptyState from '@/components/ui/EmptyState'
import { TELAS, OBJETOS, CAMPOS_BOTOES, getItemMode, type ItemDef, type ChildItemDef, type PermMode } from '@/lib/field-catalog'
import { type PermissionLevel } from '@/hooks/useFieldPermission'

const UNIT_COLORS: Record<string, string> = {
  ST: '#7c3aed', SP: '#ef4444', CP: '#22c55e', SJ: '#cbd5e1',
  RS: '#f59e0b', PA: '#ec4899', PI: '#06b6d4', MA: '#f97316',
}

const FLS_ROLES = ['gerente', 'operador'] as const
const ROLE_LABELS: Record<string, string> = { gerente: 'G', operador: 'O' }

const PERM_STYLES: Record<PermissionLevel, { icon: string; bg: string; text: string; border: string }> = {
  edit: { icon: '✏️', bg: 'rgba(34,197,94,0.15)', text: '#22c55e', border: '#22c55e' },
  read: { icon: '👁️', bg: 'rgba(245,158,11,0.15)', text: '#f59e0b', border: '#f59e0b' },
  hidden: { icon: '🚫', bg: 'rgba(239,68,68,0.15)', text: '#ef4444', border: '#ef4444' },
}

type Unidade = { id: string; codigo: string; nome: string; is_matriz: boolean; ordem: number }
type LogEntry = { id: string; entidade_nome: string; valor_anterior: string | null; valor_novo: string | null; nota: string | null; criado_em: string; alterado_por_email: string | null }

export default function VisibilidadePage() {
  const supabase = createClient()
  const { isSuperAdmin, refetch } = useUnit()

  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [selectedTela, setSelectedTela] = useState<string>(TELAS[0]?.key || '')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [showLogs, setShowLogs] = useState(false)

  // Permissões: "unidadeId:role:campo" → permissao
  const [perms, setPerms] = useState<Record<string, PermissionLevel>>({})
  const [originalPerms, setOriginalPerms] = useState<Record<string, PermissionLevel>>({})

  // Modo overrides: campo → 'toggle' | 'full' (persistido em configuracoes)
  const [modoOverrides, setModoOverrides] = useState<Record<string, PermMode>>({})
  const [originalModoOverrides, setOriginalModoOverrides] = useState<Record<string, PermMode>>({})

  useEffect(() => { loadUnidades(); loadLogs(); loadModos() }, [])
  useEffect(() => { if (unidades.length > 0) loadPerms() }, [unidades])

  async function loadLogs() {
    const { data } = await supabase
      .from('historico_alteracoes')
      .select('id, entidade_nome, valor_anterior, valor_novo, nota, criado_em, alterado_por_email')
      .in('entidade', ['visibilidade', 'field_permissions'])
      .order('criado_em', { ascending: false })
      .limit(50)
    if (data) setLogs(data as LogEntry[])
  }

  async function loadUnidades() {
    setLoading(true)
    const { data } = await supabase.from('unidades').select('id, codigo, nome, is_matriz, ordem').order('ordem').order('nome')
    if (data) setUnidades(data as Unidade[])
    setLoading(false)
  }

  async function loadPerms() {
    // Carrega TUDO de todas as unidades e roles de uma vez
    const { data } = await supabase.from('field_permissions').select('unidade_id, campo, role, permissao')
    const map: Record<string, PermissionLevel> = {}
    for (const row of (data || []) as { unidade_id: string; campo: string; role: string; permissao: string }[]) {
      map[`${row.unidade_id}:${row.role}:${row.campo}`] = row.permissao as PermissionLevel
    }
    setPerms(map)
    setOriginalPerms({ ...map })
    setSaved(false)
  }

  async function loadModos() {
    const { data } = await supabase
      .from('configuracoes')
      .select('valor')
      .eq('chave', 'fls_modos')
      .maybeSingle() as { data: { valor: Record<string, PermMode> } | null }
    if (data?.valor && typeof data.valor === 'object') {
      setModoOverrides(data.valor)
      setOriginalModoOverrides({ ...data.valor })
    }
  }

  function toggleModo(campo: string, category: 'telas' | 'objetos' | 'campos') {
    const item = [...TELAS, ...OBJETOS, ...CAMPOS_BOTOES].find(i => i.key === campo)
    if (!item) return
    const current = getItemMode(item, category, modoOverrides)
    const next: PermMode = current === 'toggle' ? 'full' : 'toggle'
    setModoOverrides(prev => ({ ...prev, [campo]: next }))
    setSaved(false)
  }

  function getPerm(unidadeId: string, role: string, campo: string): PermissionLevel {
    return perms[`${unidadeId}:${role}:${campo}`] ?? 'edit'
  }

  function cyclePerm(unidadeId: string, role: string, campo: string, modo: PermMode = 'full') {
    const key = `${unidadeId}:${role}:${campo}`
    const current = perms[key] ?? (modo === 'toggle' ? 'read' : 'edit')
    let next: PermissionLevel
    if (modo === 'toggle') {
      // toggle: visível (read) ↔ oculto (hidden). Sem row = visível.
      next = current === 'hidden' ? 'read' : 'hidden'
    } else {
      // full: edit → read → hidden → edit
      next = current === 'edit' ? 'read' : current === 'read' ? 'hidden' : 'edit'
    }
    setPerms(prev => ({ ...prev, [key]: next }))
    setSaved(false)
  }

  /** Default de um item sem row no banco */
  function getDefaultPerm(modo: PermMode): PermissionLevel {
    return modo === 'toggle' ? 'read' : 'edit'
  }

  function getPermWithMode(unidadeId: string, role: string, campo: string, modo: PermMode): PermissionLevel {
    return perms[`${unidadeId}:${role}:${campo}`] ?? getDefaultPerm(modo)
  }

  const hasChanges = JSON.stringify(perms) !== JSON.stringify(originalPerms) || JSON.stringify(modoOverrides) !== JSON.stringify(originalModoOverrides)

  async function handleSave() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    const toUpsert: { unidade_id: string; tela: string; campo: string; role: string; permissao: string }[] = []
    const deleteKeys: string[] = []  // campo keys to delete
    const logEntries: any[] = []

    const allItems = [...TELAS, ...OBJETOS, ...CAMPOS_BOTOES]
    const itemMap = new Map(allItems.map(i => [i.key, i]))

    // Só processar mudanças (diff entre perms e originalPerms)
    const allKeys = new Set([...Object.keys(perms), ...Object.keys(originalPerms)])
    for (const key of allKeys) {
      const perm = perms[key] ?? 'edit'
      const original = originalPerms[key] ?? 'edit'
      if (perm === original) continue

      // Parse key: "unidadeId:role:campo"
      const parts = key.split(':')
      if (parts.length !== 3) continue
      const [unidadeId, role, campo] = parts

      const item = itemMap.get(campo)
      const unit = unidades.find(u => u.id === unidadeId)

      if (item && unit) {
        logEntries.push({
          entidade: 'field_permissions',
          entidade_id: unidadeId,
          entidade_nome: unit.nome,
          campo,
          campo_label: item.label,
          valor_anterior: original,
          valor_novo: perm,
          tipo: 'alteracao',
          alterado_por: user?.id || null,
          alterado_por_email: user?.email || null,
          nota: `${role}: ${original} → ${perm}`,
        })
      }

      const tela = item && 'tela' in item ? (item as ChildItemDef).tela : 'global'

      if (perm === 'edit') {
        // Default = deletar row
        deleteKeys.push(campo)
        // Delete individual (agrupamos depois)
      } else {
        toUpsert.push({ unidade_id: unidadeId, tela, campo, role, permissao: perm })
      }
    }

    // Batch delete: agrupar por campo e deletar de uma vez
    if (deleteKeys.length > 0) {
      const uniqueDeleteKeys = [...new Set(deleteKeys)]
      // Deletar todas as rows que voltaram pra edit (em paralelo, max 5)
      const deletePromises: PromiseLike<any>[] = []
      for (const key of allKeys) {
        const perm = perms[key] ?? 'edit'
        const original = originalPerms[key] ?? 'edit'
        if (perm === 'edit' && original !== 'edit') {
          const [unidadeId, role, campo] = key.split(':')
          deletePromises.push(
            supabase.from('field_permissions').delete()
              .eq('unidade_id', unidadeId).eq('campo', campo).eq('role', role).then()
          )
        }
      }
      await Promise.all(deletePromises)
    }

    // Batch upsert
    if (toUpsert.length > 0) {
      await supabase.from('field_permissions').upsert(toUpsert as never, { onConflict: 'unidade_id,tela,campo,role' })
    }

    if (logEntries.length > 0) {
      await supabase.from('historico_alteracoes').insert(logEntries as never)
    }

    // Salvar modo overrides
    if (JSON.stringify(modoOverrides) !== JSON.stringify(originalModoOverrides)) {
      // Limpar overrides que são iguais ao default (não precisa persistir)
      const cleanOverrides: Record<string, string> = {}
      for (const [key, modo] of Object.entries(modoOverrides)) {
        cleanOverrides[key] = modo
      }
      await supabase.from('configuracoes').upsert(
        { chave: 'fls_modos', valor: cleanOverrides, descricao: 'Overrides de modo (toggle/full) do FLS' } as never,
        { onConflict: 'chave' }
      )
    }

    await refetch()
    await loadPerms()
    await loadModos()
    await loadLogs()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (!isSuperAdmin) {
    return <div className="animate-fade-in"><EmptyState icon={Shield} title="Acesso restrito" description="Somente administradores." /></div>
  }

  const filteredObjetos = OBJETOS.filter(o => o.tela === selectedTela)
  const filteredCampos = CAMPOS_BOTOES.filter(c => c.tela === selectedTela)
  const selectedTelaItem = TELAS.find(t => t.key === selectedTela)

  // ============================================
  // Célula de permissão: 2 botões (G | O) lado a lado
  // ============================================
  function PermCell({ unidadeId, campo, modo = 'full' }: { unidadeId: string; campo: string; modo?: PermMode }) {
    return (
      <div className="flex items-center gap-0.5 justify-center">
        {FLS_ROLES.map(role => {
          const perm = getPermWithMode(unidadeId, role, campo, modo)
          const style = PERM_STYLES[perm]
          const label = modo === 'toggle'
            ? (perm === 'hidden' ? 'Oculto' : 'Visível')
            : (perm === 'edit' ? 'Editável' : perm === 'read' ? 'Leitura' : 'Oculto')
          return (
            <button
              key={role}
              onClick={() => cyclePerm(unidadeId, role, campo, modo)}
              className="flex items-center justify-center w-7 h-6 rounded text-[10px] font-bold transition-all hover:scale-110"
              style={{ background: style.bg, color: style.text, border: `1.5px solid ${style.border}` }}
              title={`${ROLE_LABELS[role]}: ${label}`}
            >
              {style.icon}
            </button>
          )
        })}
      </div>
    )
  }

  // ============================================
  // Linha de unidade
  // ============================================
  function UnitLabel({ u, onClick }: { u: Unidade; onClick?: () => void }) {
    return (
      <button onClick={onClick} className="flex items-center gap-2 hover:opacity-80 transition-opacity" title={onClick ? 'Marcar/desmarcar todos' : u.nome}>
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center font-bold shrink-0"
          style={{ background: UNIT_COLORS[u.codigo] || '#6366f1', color: u.codigo === 'SJ' ? '#334155' : '#fff', fontSize: 8 }}
        >
          {u.codigo}
        </div>
        <span className="font-medium text-[var(--surface-700)] text-xs">{u.nome}</span>
        {u.is_matriz && (
          <span className="text-[8px] px-1 py-0.5 rounded font-bold" style={{ background: 'rgba(245,158,11,0.2)', color: '#fbbf24' }}>MA</span>
        )}
      </button>
    )
  }

  // ============================================
  // Matrix: unidades (vertical) × itens (horizontal), cada célula = G|O
  // ============================================
  function renderMatrix(label: string, icon: typeof Monitor, color: string, items: (ItemDef | ChildItemDef)[], category: 'telas' | 'objetos' | 'campos') {
    if (items.length === 0) return null
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          {React.createElement(icon, { className: 'h-4 w-4', style: { color } })}
          <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color }}>{label}</h2>
          <span className="text-[10px]" style={{ color: '#64748b' }}>{items.length} itens</span>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full text-sm" style={{ tableLayout: 'auto' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--surface-200)' }}>
                <th className="text-left px-2 py-2 text-xs font-semibold text-[var(--surface-500)]" style={{ minWidth: 100 }}>
                  Unidade
                </th>
                {items.map(m => {
                  const modo = getItemMode(m, category, modoOverrides)
                  return (
                    <th key={m.key} className="px-1 py-2 text-center" style={{ minWidth: 70 }}>
                      <span className="text-[9px] font-semibold text-[var(--surface-600)] leading-tight block" style={{ maxWidth: 70, wordBreak: 'break-word' }}>{m.label}</span>
                      <button
                        onClick={() => toggleModo(m.key, category)}
                        className="text-[8px] px-1 rounded hover:opacity-70 transition-opacity mb-0.5"
                        style={{ color: modo === 'toggle' ? '#64748b' : '#8b5cf6' }}
                        title={`Modo: ${modo === 'toggle' ? 'On/Off (clique → 3 estados)' : '3 estados (clique → On/Off)'}`}
                      >
                        {modo === 'toggle' ? '⚡on/off' : '🎚️ 3'}
                      </button>
                      <div className="flex items-center justify-center gap-0.5">
                        {FLS_ROLES.map(role => {
                          const dflt = getDefaultPerm(modo)
                          const colPerms = unidades.map(u => getPermWithMode(u.id, role, m.key, modo))
                          const allDefault = colPerms.every(p => p === dflt)
                          const allHidden = colPerms.every(p => p === 'hidden')
                          const allRead = colPerms.every(p => p === 'read')
                          const colStyle = allHidden ? PERM_STYLES.hidden : allDefault ? PERM_STYLES[dflt] : allRead ? PERM_STYLES.read : PERM_STYLES.read

                          let nextPerm: PermissionLevel
                          let nextLabel: string
                          if (modo === 'toggle') {
                            nextPerm = allHidden ? 'read' : 'hidden'
                            nextLabel = allHidden ? '→ Visível' : '→ Oculto'
                          } else {
                            nextPerm = allDefault ? 'read' : allRead ? 'hidden' : 'edit'
                            nextLabel = allDefault ? '→ Leitura' : allRead ? '→ Oculto' : '→ Editável'
                          }

                          return (
                            <button
                              key={role}
                              onClick={() => {
                                setPerms(prev => {
                                  const next = { ...prev }
                                  unidades.forEach(u => { next[`${u.id}:${role}:${m.key}`] = nextPerm })
                                  return next
                                })
                                setSaved(false)
                              }}
                              className="w-5 h-4 rounded text-[8px] font-bold transition-all hover:scale-110"
                              style={{ background: colStyle.bg, color: colStyle.text, border: `1px solid ${colStyle.border}` }}
                              title={`${ROLE_LABELS[role]} coluna: ${nextLabel}`}
                            >
                              {ROLE_LABELS[role]}
                            </button>
                          )
                        })}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {[...unidades].sort((a, b) => {
                // Unidades com mais itens ativos (não hidden) primeiro
                const score = (uid: string) => items.reduce((sum, m) => {
                  const modo = getItemMode(m, category, modoOverrides)
                  return sum + FLS_ROLES.reduce((s, role) => s + (getPermWithMode(uid, role, m.key, modo) !== 'hidden' ? 1 : 0), 0)
                }, 0)
                return score(b.id) - score(a.id)
              }).map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--surface-100)' }} className="hover:bg-[var(--surface-50)] transition-colors">
                  <td className="px-2 py-1.5">
                    <UnitLabel u={u} />
                  </td>
                  {items.map(m => (
                    <td key={m.key} className="px-1 py-1 text-center">
                      <PermCell unidadeId={u.id} campo={m.key} modo={getItemMode(m, category, modoOverrides)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3 sticky top-0 z-30 py-3 -mx-4 px-4" style={{ background: 'var(--shell-bg, #0f172a)' }}>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-blue-900/30 items-center justify-center">
            <Eye className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-title text-[var(--shell-text)]">Visibilidade</h1>
            <p className="text-small text-[var(--shell-text-muted)]">Permissões por unidade e perfil</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className={`btn-primary flex items-center gap-2 ${saved ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
        >
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Salvando...</> : saved ? <><Check className="h-4 w-4" />Salvo!</> : <><Save className="h-4 w-4" />Salvar</>}
        </button>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 mb-4 text-xs flex-wrap" style={{ color: '#64748b' }}>
        <span>Clique para alternar:</span>
        {Object.entries(PERM_STYLES).map(([key, d]) => (
          <span key={key} className="flex items-center gap-1 px-2 py-0.5 rounded" style={{ background: d.bg, color: d.text }}>
            {d.icon} {key === 'edit' ? 'Editável' : key === 'read' ? 'Leitura' : 'Oculto'}
          </span>
        ))}
        <span className="text-[10px]">G = Gerente, O = Operador</span>
      </div>

      {loading ? (
        <div className="card p-8 text-center" style={{ color: '#94a3b8' }}>Carregando...</div>
      ) : (
        <>
          {/* Seletor de tela + permissão da tela por unidade */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Monitor className="h-4 w-4" style={{ color: '#3b82f6' }} />
              <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: '#3b82f6' }}>Tela</h2>
              <div className="relative">
                <select
                  value={selectedTela}
                  onChange={e => setSelectedTela(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-1.5 rounded-lg text-sm font-medium border-2 focus:outline-none cursor-pointer"
                  style={{ borderColor: 'var(--surface-200)', background: 'var(--surface-0)', color: 'var(--surface-700)' }}
                >
                  {TELAS.map(t => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none" style={{ color: '#94a3b8' }} />
              </div>
            </div>

            {/* Permissão da tela: unidades na vertical */}
            {selectedTelaItem && (
              <div className="card p-3">
                {/* Botões de coluna pra tela */}
                <div className="flex items-center justify-between mb-2 pb-2" style={{ borderBottom: '1px solid var(--surface-100)' }}>
                  <span className="text-[10px] font-semibold uppercase text-[var(--surface-400)]">Aplicar a todas:</span>
                  <div className="flex items-center gap-1">
                    {FLS_ROLES.map(role => {
                      const colPerms = unidades.map(u => getPermWithMode(u.id, role, selectedTelaItem.key, 'toggle'))
                      const allHidden = colPerms.every(p => p === 'hidden')
                      const colStyle = allHidden ? PERM_STYLES.hidden : PERM_STYLES.read
                      return (
                        <button
                          key={role}
                          onClick={() => {
                            const nextPerm: PermissionLevel = allHidden ? 'read' : 'hidden'
                            setPerms(prev => {
                              const next = { ...prev }
                              unidades.forEach(u => { next[`${u.id}:${role}:${selectedTelaItem.key}`] = nextPerm })
                              return next
                            })
                            setSaved(false)
                          }}
                          className="px-2 py-1 rounded text-[10px] font-bold transition-all hover:scale-105"
                          style={{ background: colStyle.bg, color: colStyle.text, border: `1.5px solid ${colStyle.border}` }}
                          title={`${role}: ${allHidden ? '→ Visível' : '→ Oculto'}`}
                        >
                          {ROLE_LABELS[role]} {colStyle.icon}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {[...unidades].sort((a, b) => {
                    const score = (uid: string) => FLS_ROLES.reduce((s, role) => s + (getPermWithMode(uid, role, selectedTelaItem.key, 'toggle') !== 'hidden' ? 1 : 0), 0)
                    return score(b.id) - score(a.id)
                  }).map(u => (
                    <div key={u.id} className="flex items-center justify-between">
                      <UnitLabel u={u} />
                      <PermCell unidadeId={u.id} campo={selectedTelaItem.key} modo="toggle" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Matrizes filtradas pela tela */}
          {renderMatrix('Objetos Relacionados', Wrench, '#f59e0b', filteredObjetos, 'objetos')}
          {renderMatrix('Campos e Botões', FormInput, '#8b5cf6', filteredCampos, 'campos')}

          {filteredObjetos.length === 0 && filteredCampos.length === 0 && (
            <div className="card p-6 text-center text-sm" style={{ color: '#94a3b8' }}>
              Nenhum objeto ou campo configurável para "{selectedTelaItem?.label}".
            </div>
          )}
        </>
      )}

      {/* Histórico */}
      <div className="mt-8">
        <button onClick={() => setShowLogs(!showLogs)} className="flex items-center gap-2 text-xs font-medium mb-3" style={{ color: '#64748b' }}>
          <Clock className="h-3.5 w-3.5" />
          Histórico ({logs.length})
          <span style={{ transform: showLogs ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
        </button>

        {showLogs && logs.length > 0 && (
          <div className="card overflow-hidden">
            <div className="divide-y divide-[var(--surface-100)] max-h-80 overflow-y-auto">
              {logs.map(log => (
                <div key={log.id} className="px-4 py-3 text-xs space-y-1">
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
                  <div>
                    <span className="font-semibold text-[var(--surface-700)] mr-2">{log.entidade_nome}</span>
                    {log.nota && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>
                        {log.nota}
                      </span>
                    )}
                  </div>
                </div>
              ))}
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
