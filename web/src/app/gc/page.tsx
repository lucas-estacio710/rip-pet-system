'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Church, Search, X, ChevronRight, Dog, Cat, Bug, MapPin,
  User, Clock, Weight, Lock, Phone, Eye
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import Link from 'next/link'

// ============================================
// Types
// ============================================
type ContratoGC = {
  id: string
  codigo: string
  pet_nome: string
  pet_especie: string
  pet_peso: number | null
  tutor_nome: string | null
  tutor_telefone: string | null
  tipo_cremacao: string
  status: string
  data_acolhimento: string | null
  numero_lacre: string | null
  observacoes: string | null
  unidade_id: string
  // GC tracking
  gc: {
    id: string
    etapa: string
    data_recebimento: string | null
    forno: number | null
    data_agendamento: string | null
    cinzas_prontas: boolean
    certificado_pronto: boolean
    observacoes_unidade: string | null
  } | null
}

type UnidadeInfo = {
  id: string
  codigo: string
  nome: string
}

const UNIT_COLORS: Record<string, string> = {
  ST: '#7c3aed',
  SP: '#ef4444',
  CP: '#22c55e',
  SJ: '#cbd5e1',
  RS: '#f59e0b',
  PA: '#ec4899',
  PI: '#06b6d4',
  MA: '#f97316',
}

const ETAPA_LABELS: Record<string, string> = {
  recebido: 'Recebido',
  contato_tutor: 'Contato Tutor',
  agendado: 'Agendado',
  pedidos_especiais: 'Pedidos Especiais',
  cremacao: 'Cremação',
  disponivel: 'Disponível',
}

const ETAPA_COLORS: Record<string, string> = {
  recebido: '#3b82f6',
  contato_tutor: '#8b5cf6',
  agendado: '#f59e0b',
  pedidos_especiais: '#ec4899',
  cremacao: '#ef4444',
  disponivel: '#22c55e',
}

function tempoRelativo(dataStr: string | null): string {
  if (!dataStr) return ''
  const diffMs = Date.now() - new Date(dataStr).getTime()
  const diffH = Math.floor(diffMs / 3600000)
  if (diffH < 1) return 'agora'
  if (diffH < 24) return `${diffH}h`
  const diffD = Math.floor(diffH / 24)
  return `${diffD}d`
}

// ============================================
// Page
// ============================================
export default function GCPage() {
  const supabase = createClient()
  const { currentUnit } = useUnit()

  const [contratos, setContratos] = useState<ContratoGC[]>([])
  const [unidades, setUnidades] = useState<UnidadeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')

  const carregarDados = useCallback(async () => {
    setLoading(true)

    // Buscar contratos em status 'pinda' de TODAS as unidades (GC vê tudo)
    const [contratosRes, unidadesRes] = await Promise.all([
      supabase
        .from('contratos')
        .select('id, codigo, pet_nome, pet_especie, pet_peso, tutor_nome, tutor_telefone, tipo_cremacao, status, data_acolhimento, numero_lacre, observacoes, unidade_id, contrato_gc(*)')
        .eq('status', 'pinda')
        .order('data_acolhimento', { ascending: true }),
      supabase
        .from('unidades')
        .select('id, codigo, nome')
        .eq('ativa', true)
        .neq('is_matriz', true)
        .order('ordem')
        .order('nome'),
    ])

    const data = (contratosRes.data || []).map((c: any) => ({
      ...c,
      gc: c.contrato_gc?.[0] || null,
    }))

    setContratos(data as ContratoGC[])
    setUnidades((unidadesRes.data || []) as UnidadeInfo[])
    setLoading(false)
  }, [])

  useEffect(() => {
    carregarDados()

    // Realtime
    const channel = supabase
      .channel('gc-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contratos' }, carregarDados)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contrato_gc' }, carregarDados)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [carregarDados])

  const [activeUnit, setActiveUnit] = useState<string | null>(null)

  // Filtrar por busca e unidade ativa
  const filtered = contratos.filter(c => {
    if (activeUnit && c.unidade_id !== activeUnit) return false
    if (!busca.trim()) return true
    const t = busca.toLowerCase()
    return c.pet_nome?.toLowerCase().includes(t) ||
      c.tutor_nome?.toLowerCase().includes(t) ||
      c.codigo?.toLowerCase().includes(t) ||
      c.numero_lacre?.includes(t)
  })

  // Contagem por unidade (sem filtro de busca/aba, sempre total)
  const countByUnit = new Map<string, { cremados: number; total: number }>()
  unidades.forEach(u => countByUnit.set(u.id, { cremados: 0, total: 0 }))
  contratos.forEach(c => {
    const entry = countByUnit.get(c.unidade_id)
    if (!entry) return
    entry.total++
    if (c.gc?.etapa === 'cremacao' || c.gc?.etapa === 'disponivel') entry.cremados++
  })

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-orange-900/30 items-center justify-center">
            <Church className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-title text-[var(--shell-text)]">GC — Gerenciamento de Cremações</h1>
            <p className="text-small text-[var(--shell-text-muted)]">
              {contratos.length} pet{contratos.length !== 1 ? 's' : ''} na matriz
            </p>
          </div>
        </div>
      </div>

      {/* Abas tipo Chrome */}
      <div className="flex items-end gap-1 mb-4 overflow-x-auto pb-0.5">
        {unidades.map(unit => {
          const isActive = activeUnit === unit.id
          const counts = countByUnit.get(unit.id) || { cremados: 0, total: 0 }
          const color = UNIT_COLORS[unit.codigo] || '#6366f1'
          const hasItems = counts.total > 0

          return (
            <button
              key={unit.id}
              onClick={() => setActiveUnit(isActive ? null : unit.id)}
              className="flex items-center gap-2 transition-all duration-300 ease-out rounded-t-xl border border-b-0 shrink-0"
              style={{
                padding: isActive ? '8px 16px 10px' : '8px 10px 10px',
                background: isActive ? 'var(--surface-0)' : 'transparent',
                borderColor: isActive ? 'var(--surface-200)' : 'transparent',
                opacity: !hasItems && !isActive ? 0.4 : 1,
              }}
            >
              {/* Bolinha */}
              <div
                className="rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-all duration-300"
                style={{
                  width: isActive ? 28 : 32,
                  height: isActive ? 28 : 32,
                  background: color,
                  color: unit.codigo === 'SJ' ? '#334155' : '#fff',
                }}
              >
                {unit.codigo}
              </div>

              {/* Nome (só quando ativo) */}
              <div className="overflow-hidden transition-all duration-300 ease-out" style={{ maxWidth: isActive ? 150 : 0, opacity: isActive ? 1 : 0 }}>
                <span className="text-sm font-semibold text-[var(--surface-700)] whitespace-nowrap">{unit.nome}</span>
              </div>

              {/* Contador */}
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 transition-all duration-300"
                style={{ background: color + '20', color }}
              >
                {counts.cremados}/{counts.total}
              </span>
            </button>
          )
        })}
      </div>

      {/* Linha divisória */}
      <div className="border-b border-[var(--surface-200)] -mt-4 mb-4" />

      {/* Busca */}
      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--surface-400)]" />
        <input
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar pet, tutor, código, lacre..."
          className="input w-full pl-9 pr-8 text-sm"
        />
        {busca && (
          <button onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2">
            <X className="h-3.5 w-3.5 text-[var(--surface-400)]" />
          </button>
        )}
      </div>

      {/* Lista de cards */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-36" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Church} title={activeUnit ? 'Nenhum pet desta unidade' : 'Nenhum pet na matriz'} description={activeUnit ? 'Selecione outra unidade ou limpe o filtro' : 'Quando as unidades enviarem pets para cremação, eles aparecerão aqui.'} />
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const unit = unidades.find(u => u.id === c.unidade_id)
            const unitColor = UNIT_COLORS[unit?.codigo || ''] || '#6366f1'
            const etapa = c.gc?.etapa || 'recebido'
            const etapaColor = ETAPA_COLORS[etapa] || '#64748b'
            const PetIcon = c.pet_especie === 'canina' ? Dog : c.pet_especie === 'felina' ? Cat : Bug

            return (
              <Link href={`/contratos/${c.id}`} key={c.id}>
                <div className="card p-3 card-hover cursor-pointer transition-all">
                  <div className="flex gap-3">
                    {/* Bolinha da unidade (quando não tem filtro ativo) */}
                    {!activeUnit && unit && (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                        style={{ background: unitColor, color: unit.codigo === 'SJ' ? '#334155' : '#fff' }}
                      >
                        {unit.codigo}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      {/* Post-it */}
                      {(c.observacoes || c.gc?.observacoes_unidade) && (
                        <div className="mb-2 px-2 py-1.5 rounded-lg text-[11px] leading-tight" style={{ background: 'rgba(250,204,21,0.15)', color: '#eab308', borderLeft: '3px solid #eab308' }}>
                          {c.gc?.observacoes_unidade || c.observacoes}
                        </div>
                      )}

                      {/* Pet + tipo */}
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <PetIcon className="h-3.5 w-3.5 text-[var(--surface-400)]" />
                          <span className="font-semibold text-sm text-[var(--surface-800)]">{c.pet_nome}</span>
                        </div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{
                          background: c.tipo_cremacao === 'individual' ? 'rgba(139,92,246,0.2)' : 'rgba(59,130,246,0.2)',
                          color: c.tipo_cremacao === 'individual' ? '#a78bfa' : '#60a5fa',
                        }}>
                          {c.tipo_cremacao === 'individual' ? 'IND' : 'COL'}
                        </span>
                      </div>

                      {/* Tutor + peso + lacre */}
                      <div className="flex items-center gap-3 text-xs text-[var(--surface-500)] mb-1.5">
                        {c.tutor_nome && (
                          <span className="flex items-center gap-1"><User className="h-3 w-3" />{c.tutor_nome}</span>
                        )}
                        {c.pet_peso && (
                          <span className="flex items-center gap-1"><Weight className="h-3 w-3" />{c.pet_peso}kg</span>
                        )}
                        {c.numero_lacre && (
                          <span className="flex items-center gap-1"><Lock className="h-3 w-3" />{c.numero_lacre}</span>
                        )}
                      </div>

                      {/* Etapa + forno + tempo */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: etapaColor + '20', color: etapaColor }}>
                          {ETAPA_LABELS[etapa]}
                        </span>
                        <div className="flex items-center gap-2">
                          {c.gc?.forno && (
                            <span className="text-[10px] font-bold text-[var(--surface-400)]">Forno {c.gc.forno}</span>
                          )}
                          {c.data_acolhimento && (
                            <span className="text-[10px] text-[var(--surface-400)] flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />{tempoRelativo(c.data_acolhimento)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Cinzas + certificado */}
                      {c.gc && (etapa === 'cremacao' || etapa === 'disponivel') && (
                        <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                          <span style={{ color: c.gc.cinzas_prontas ? '#22c55e' : '#64748b' }}>
                            {c.gc.cinzas_prontas ? '✓' : '○'} Cinzas
                          </span>
                          <span style={{ color: c.gc.certificado_pronto ? '#22c55e' : '#64748b' }}>
                            {c.gc.certificado_pronto ? '✓' : '○'} Certificado
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
