'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Pencil, X, Loader2, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import type { PeriodRange } from '@/lib/dashboard-period'

type Props = {
  range: PeriodRange
  onChange?: () => void
}

const STATUS_REMOVIDO = ['ativo', 'pinda', 'retorno', 'pendente', 'finalizado']

const OPCOES_RECLASS = [
  'Indicação em Clínica',
  'Google',
  'Cliente',
  'Parente/Amigo',
  'Ponto',
  'Instagram/Facebook',
  'Seguradora',
  'IA',
] as const

type ContratoRow = {
  id: string
  codigo: string
  pet_nome: string | null
  data_acolhimento: string | null
  fonte_outro_especificar: string | null
  fonte_conhecimento_id: string | null
  fonte_conhecimento_ids: string[] | null
}
type Item = {
  id: string
  codigo: string
  petNome: string | null
  data: string | null
  texto: string
}

function fmtDataCurta(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}`
}

export default function FonteOutroKPI({ range, onChange }: Props) {
  const { currentUnit, isSuperAdmin } = useUnit()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)  // contratoId em edição
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!currentUnit) return
    const supabase = createClient()
    setLoading(true)

    const { data: fontesData } = await supabase
      .from('fontes_conhecimento')
      .select('id,nome')
    const fontes = (fontesData ?? []) as { id: string; nome: string }[]
    const idOutro = fontes.find(f => f.nome === 'Outro')?.id ?? null

    const { data, error } = await supabase
      .from('contratos')
      .select('id, codigo, pet_nome, data_acolhimento, fonte_outro_especificar, fonte_conhecimento_id, fonte_conhecimento_ids')
      .eq('unidade_id', currentUnit.id)
      .in('status', STATUS_REMOVIDO)
      .not('fonte_outro_especificar', 'is', null)
      .neq('fonte_outro_especificar', '')
      .gte('data_acolhimento', range.from.toISOString())
      .lte('data_acolhimento', range.to.toISOString())
      .order('data_acolhimento', { ascending: false })

    if (error) {
      console.error('[FonteOutroKPI]', error)
      setItems([]); setLoading(false); return
    }

    const rows = (data ?? []) as ContratoRow[]
    const list: Item[] = []
    for (const row of rows) {
      const t = row.fonte_outro_especificar
      if (!t) continue
      // Só lista contratos cuja fonte AINDA é Outro
      const ids = (row.fonte_conhecimento_ids && row.fonte_conhecimento_ids.length > 0)
        ? row.fonte_conhecimento_ids
        : (row.fonte_conhecimento_id ? [row.fonte_conhecimento_id] : [])
      if (!idOutro || !ids.includes(idOutro)) continue
      list.push({
        id: row.id,
        codigo: row.codigo,
        petNome: row.pet_nome,
        data: row.data_acolhimento,
        texto: t,
      })
    }

    setItems(list)
    setLoading(false)
  }, [currentUnit, range.from, range.to])

  useEffect(() => {
    let cancelled = false
    load().then(() => { if (cancelled) { /* noop */ } })
    return () => { cancelled = true }
  }, [load])

  async function reclassificar(contratoId: string, codigo: string, textoOriginal: string, novoNome: string) {
    if (!currentUnit) return
    if (!novoNome) { setEditing(null); return }
    if (!confirm(`Reclassificar contrato ${codigo} (texto "${textoOriginal}") como "${novoNome}"?\n\nO texto livre fica preservado no histórico.`)) {
      setEditing(null)
      return
    }
    setSaving(true)
    const supabase = createClient()

    try {
      const { data: fontesData } = await supabase
        .from('fontes_conhecimento')
        .select('id,nome')
      const fontes = (fontesData ?? []) as { id: string; nome: string }[]
      const idOutro = fontes.find(f => f.nome === 'Outro')?.id
      const idNovo = fontes.find(f => f.nome === novoNome)?.id
      if (!idOutro || !idNovo) {
        alert('Erro: fonte não encontrada no banco')
        setSaving(false); return
      }

      const { data: contratoData } = await supabase
        .from('contratos')
        .select('id, codigo, fonte_conhecimento_id, fonte_conhecimento_ids')
        .eq('id', contratoId)
        .maybeSingle()
      const c = contratoData as { id: string; codigo: string; fonte_conhecimento_id: string | null; fonte_conhecimento_ids: string[] | null } | null
      if (!c) {
        alert('Contrato não encontrado')
        setSaving(false); return
      }

      const oldIds = c.fonte_conhecimento_ids ?? (c.fonte_conhecimento_id ? [c.fonte_conhecimento_id] : [])
      const newIds = Array.from(new Set(oldIds.map(id => id === idOutro ? idNovo : id)))
      const newPrimary = c.fonte_conhecimento_id === idOutro ? idNovo : c.fonte_conhecimento_id

      await supabase
        .from('contratos')
        .update({
          fonte_conhecimento_id: newPrimary,
          fonte_conhecimento_ids: newIds,
        } as never)
        .eq('id', c.id)

      const { data: { user } } = await supabase.auth.getUser()
      await supabase
        .from('historico_alteracoes')
        .insert({
          entidade: 'contratos',
          entidade_id: c.id,
          entidade_nome: c.codigo,
          campo: 'fonte_conhecimento',
          campo_label: 'Como nos conheceu',
          valor_anterior: `Outro: "${textoOriginal}"`,
          valor_novo: novoNome,
          tipo: 'reclassificacao',
          nota: 'Reclassificado via Dashboards / Outros — texto livre',
          alterado_por: user?.id ?? null,
          alterado_por_email: user?.email ?? null,
        } as never)

      setEditing(null)
      await load()
      onChange?.()
    } catch (e) {
      console.error('[reclassificar]', e)
      alert('Erro ao reclassificar. Veja o console.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card p-4 sm:p-6">
      <div className="flex items-baseline gap-2 mb-4">
        <div className="text-xs uppercase tracking-wide text-[var(--surface-500)]">
          Outros — texto livre
        </div>
        {!loading && items.length > 0 && (
          <span className="text-[10px] text-[var(--surface-400)] font-mono">
            {items.length} {items.length === 1 ? 'ocorrência' : 'ocorrências'}
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-32 flex items-center justify-center text-3xl text-[var(--surface-300)]">…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-[var(--surface-400)] py-8 text-center">
          Sem texto preenchido em &quot;Outro&quot; no período
        </div>
      ) : (
        <ul className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
          {items.map(item => {
            const isEditing = editing === item.id
            return (
              <li key={item.id} className="flex items-center gap-2 text-xs py-1 border-b border-[var(--surface-100)] last:border-0">
                <span className="font-mono text-[10px] text-[var(--surface-400)] tabular-nums w-10 shrink-0">
                  {fmtDataCurta(item.data)}
                </span>
                <span className="flex-1 truncate text-[var(--surface-700)]" title={item.texto}>
                  {item.texto}
                </span>
                <Link
                  href={`/contratos/${item.id}`}
                  className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--brand-500)] hover:underline shrink-0"
                  title={item.petNome ?? item.codigo}
                >
                  {item.codigo}
                  <ExternalLink className="h-2.5 w-2.5" />
                </Link>
                {isSuperAdmin && (
                  isEditing ? (
                    <span className="inline-flex items-center gap-1 shrink-0">
                      <select
                        autoFocus
                        defaultValue=""
                        disabled={saving}
                        onChange={e => reclassificar(item.id, item.codigo, item.texto, e.target.value)}
                        className="text-[10px] bg-[var(--surface-0)] border border-[var(--surface-300)] rounded px-1 py-0.5 text-[var(--surface-800)]"
                      >
                        <option value="" disabled>Mover para…</option>
                        {OPCOES_RECLASS.map(o => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                      {saving ? (
                        <Loader2 className="h-3 w-3 animate-spin text-[var(--surface-500)]" />
                      ) : (
                        <button
                          onClick={() => setEditing(null)}
                          className="p-0.5 rounded text-[var(--surface-400)] hover:text-[var(--surface-700)]"
                          title="Cancelar"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ) : (
                    <button
                      onClick={() => setEditing(item.id)}
                      className="p-1 rounded text-[var(--surface-400)] hover:text-[var(--brand-500)] hover:bg-[var(--surface-100)] transition-colors shrink-0"
                      title="Reclassificar para a fonte correta"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
