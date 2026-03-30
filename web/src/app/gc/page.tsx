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

function corPeso(peso: number | null): string {
  if (!peso) return '#64748b'
  if (peso <= 5) return '#22c55e'    // verde — leve
  if (peso <= 15) return '#84cc16'   // verde-amarelo
  if (peso <= 30) return '#eab308'   // amarelo — médio
  if (peso <= 45) return '#f97316'   // laranja
  return '#ef4444'                   // vermelho — pesado
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

          return (
            <button
              key={unit.id}
              onClick={() => setActiveUnit(isActive ? null : unit.id)}
              className="flex items-center gap-2 transition-all duration-300 ease-out rounded-t-xl border border-b-0 shrink-0"
              style={{
                padding: '8px 12px 10px',
                background: isActive ? 'var(--surface-0)' : 'var(--surface-50)',
                borderColor: isActive ? 'var(--surface-200)' : 'var(--surface-100)',
              }}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                style={{ background: color, color: unit.codigo === 'SJ' ? '#334155' : '#fff' }}
              >
                {unit.codigo}
              </div>

              <div className="overflow-hidden transition-all duration-300 ease-out" style={{ maxWidth: isActive ? 150 : 0, opacity: isActive ? 1 : 0 }}>
                <span className="text-sm font-semibold text-[var(--surface-700)] whitespace-nowrap">{unit.nome}</span>
              </div>

              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: color + '20', color }}>
                {counts.cremados}/{counts.total}
              </span>
            </button>
          )
        })}
      </div>

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
        <div className="grid grid-cols-3 lg:grid-cols-7 gap-2">
          {filtered.map(c => {
            const unit = unidades.find(u => u.id === c.unidade_id)
            const unitColor = UNIT_COLORS[unit?.codigo || ''] || '#6366f1'
            const etapa = c.gc?.etapa || 'recebido'
            const etapaColor = ETAPA_COLORS[etapa] || '#64748b'
            const PetIcon = c.pet_especie === 'canina' ? Dog : c.pet_especie === 'felina' ? Cat : Bug
            const pesoColor = corPeso(c.pet_peso)
            const isInd = c.tipo_cremacao === 'individual'

            const gradientBg = isInd
              ? 'linear-gradient(135deg, rgba(34,197,94,0.12) 0%, rgba(34,197,94,0.04) 100%)'
              : 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(139,92,246,0.04) 100%)'
            const borderColor = isInd ? '#22c55e' : '#8b5cf6'

            return (
              <Link href={`/contratos/${c.id}`} key={c.id}>
                <div
                  className="card p-2.5 card-hover cursor-pointer transition-all h-full"
                  style={{ borderLeft: `3px solid ${borderColor}`, background: gradientBg }}
                >
                  {/* Lacre + Pet */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {c.numero_lacre && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#1e3a5f', color: '#fff' }}>
                        {c.numero_lacre}
                      </span>
                    )}
                    <PetIcon className="h-3 w-3 text-[var(--surface-400)]" />
                    <span className="font-semibold text-xs text-[var(--surface-800)] truncate">{c.pet_nome}</span>
                    {/* Bolinha unidade (sem filtro) */}
                    {!activeUnit && unit && (
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold ml-auto shrink-0"
                        style={{ background: unitColor, color: unit.codigo === 'SJ' ? '#334155' : '#fff' }}
                      >
                        {unit.codigo}
                      </div>
                    )}
                  </div>

                  {/* IND/COL + Peso + Etapa — tudo na mesma linha */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{
                      background: isInd ? '#16a34a' : '#7c3aed',
                      color: '#fff',
                    }}>
                      {isInd ? 'IND' : 'COL'}
                    </span>
                    {c.pet_peso != null && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: pesoColor + '20', color: pesoColor }}>
                        {c.pet_peso}kg
                      </span>
                    )}
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: etapaColor + '20', color: etapaColor }}>
                      {ETAPA_LABELS[etapa]}
                    </span>
                    {c.gc?.forno && (
                      <span className="text-[9px] font-bold" style={{ color: '#f59e0b' }}>F{c.gc.forno}</span>
                    )}
                  </div>

                  {/* Tutor */}
                  {c.tutor_nome && (
                    <p className="text-[10px] text-[var(--surface-500)] truncate">
                      <User className="h-2.5 w-2.5 inline mr-0.5" />{c.tutor_nome}
                    </p>
                  )}

                  {/* Ações */}
                  <div className="flex items-center justify-center gap-2 mt-1.5" onClick={e => e.preventDefault()}>
                    {c.tutor_telefone && (
                      <a
                        href={`https://wa.me/${c.tutor_telefone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                        style={{ background: '#25D366' }}
                        title={`WhatsApp: ${c.tutor_telefone}`}
                      >
                        <Phone className="h-3 w-3 text-white" />
                      </a>
                    )}
                  </div>

                  {/* Cinzas/Certificado */}
                  {c.gc && (etapa === 'cremacao' || etapa === 'disponivel') && (
                    <div className="flex items-center gap-1.5 mt-1 text-[9px]">
                      <span style={{ color: c.gc.cinzas_prontas ? '#22c55e' : '#475569' }}>
                        {c.gc.cinzas_prontas ? '✓' : '○'}Cz
                      </span>
                      <span style={{ color: c.gc.certificado_pronto ? '#22c55e' : '#475569' }}>
                        {c.gc.certificado_pronto ? '✓' : '○'}Ct
                      </span>
                    </div>
                  )}

                  {/* Post-it */}
                  {(c.observacoes || c.gc?.observacoes_unidade) && (
                    <div className="mt-1.5 px-1.5 py-1 rounded text-[9px] leading-tight truncate" style={{ background: 'rgba(250,204,21,0.15)', color: '#eab308' }}>
                      ⚠️ {c.gc?.observacoes_unidade || c.observacoes}
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
