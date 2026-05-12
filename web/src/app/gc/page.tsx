'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Church, Search, X, ChevronRight, ChevronLeft, Dog, Cat, Bug, MapPin,
  User, Clock, Weight, Lock, Phone, Check, CheckCheck, Flame, CalendarClock, SearchCheck, CheckCircle2,
  Calendar, ArrowDownAZ, Tag
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { dataLocal } from '@/lib/date-local'
import { linkAgendamentoDespedida } from '@/lib/whatsapp-msg'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import Link from 'next/link'
import GCAcaoModal from '@/components/contratos/gc/GCAcaoModal'

// ============================================
// Types
// ============================================
type ContratoGC = {
  id: string
  codigo: string
  pet_nome: string
  pet_especie: string | null
  pet_peso: number | null
  pet_genero: string | null
  pet_cor: string | null
  tutor_nome: string | null
  tutor_telefone: string | null
  pet_raca: string | null
  tipo_cremacao: string
  status: string
  data_acolhimento: string | null
  numero_lacre: string | null
  observacoes: string | null
  unidade_id: string
  supinda_id: string | null
  // Certificado (nomes que vão no documento de cremação)
  certificado_nome_1: string | null
  certificado_nome_2: string | null
  certificado_nome_3: string | null
  certificado_nome_4: string | null
  certificado_nome_5: string | null
  certificado_nome_6: string | null
  certificado_nome_7: string | null
  certificado_confirmado: boolean | null
  // GC tracking
  gc: {
    id: string
    etapa: string
    contato_status: string | null
    data_recebimento: string | null
    recebido_por: string | null
    lacre_conferido: boolean
    contato_tutor_em: string | null
    contato_tutor_obs: string | null
    forno: number | null
    data_agendamento: string | null
    acompanhamento_confirmado: string | null
    data_cremacao: string | null
    cremacao_por: string | null
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
  provisionado: 'Provisionado',
  recebido: 'Recebido',
  cremado: 'Cremado',
  disponivel: 'Finalizado',
}

const ETAPA_COLORS: Record<string, string> = {
  provisionado: '#64748b',
  recebido: '#3b82f6',
  cremado: '#eab308',
  disponivel: '#22c55e',
}

const CONTATO_LABELS: Record<string, string> = {
  contatado: 'Contatado',
  agendado: 'Agendado',
}

const CONTATO_COLORS: Record<string, string> = {
  contatado: '#f59e0b',
  agendado: '#22c55e',
}

function corPeso(peso: number | null): string {
  if (!peso) return '#64748b'
  if (peso <= 5) return '#22c55e'    // verde — leve
  if (peso <= 15) return '#84cc16'   // verde-amarelo
  if (peso <= 30) return '#eab308'   // amarelo — médio
  if (peso <= 45) return '#f97316'   // laranja
  return '#ef4444'                   // vermelho — pesado
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function formatDia(d: Date): string {
  const dia = d.getDate().toString().padStart(2, '0')
  const mes = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return `${dia}/${mes}`
}

function isMesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
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
  const [supindas, setSupindas] = useState<{ id: string; numero: string; data: string; status: string; codigo_unidade: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [ordenacao, setOrdenacao] = useState<'data' | 'nome' | 'lacre'>('data')
  const [acaoModal, setAcaoModal] = useState<ContratoGC | null>(null)

  // Calendário-line
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const [diaSelecionado, setDiaSelecionado] = useState<Date | null>(null)
  const [desktopOffset, setDesktopOffset] = useState(0)
  const mobileScrollRef = useRef<HTMLDivElement>(null)
  const mobileScrolledRef = useRef(false)
  const mobileInitialScroll = useRef(0)

  const carregarDados = useCallback(async () => {
    setLoading(true)

    // Buscar contratos provisionados (supinda_id preenchido) — GC vê desde o planejamento
    const [contratosRes, unidadesRes, supindasRes] = await Promise.all([
      supabase
        .from('contratos')
        .select('id, codigo, pet_nome, pet_especie, pet_peso, pet_raca, pet_genero, pet_cor, tutor_nome, tutor_telefone, tipo_cremacao, status, data_acolhimento, numero_lacre, observacoes, unidade_id, supinda_id, certificado_nome_1, certificado_nome_2, certificado_nome_3, certificado_nome_4, certificado_nome_5, certificado_nome_6, certificado_nome_7, certificado_confirmado, contrato_gc(*)')
        .not('supinda_id', 'is', null)
        .in('status', ['ativo', 'pinda'])
        .order('data_acolhimento', { ascending: true }),
      supabase
        .from('unidades')
        .select('id, codigo, nome')
        .eq('ativa', true)
        .neq('is_matriz', true)
        .order('ordem')
        .order('nome'),
      supabase
        .from('supindas')
        .select('id, numero, data, status, unidades(codigo)')
        .order('data'),
    ])

    // Merge: campos sensíveis do pet (nome/espécie/raça/gênero) preferem o snapshot
    // do contrato_gc (migration 081) ao valor original em contratos.
    const mergePet = (c: any) => {
      const gc = Array.isArray(c.contrato_gc) ? c.contrato_gc[0] || null : c.contrato_gc || null
      return {
        ...c,
        pet_nome:    gc?.pet_nome    ?? c.pet_nome,
        pet_especie: gc?.pet_especie ?? c.pet_especie,
        pet_raca:    gc?.pet_raca    ?? c.pet_raca,
        pet_genero:  gc?.pet_genero  ?? c.pet_genero,
        gc,
      }
    }
    const rawData = (contratosRes.data || []).map(mergePet)

    // Criar contrato_gc automaticamente para pets sem row
    const semGC = rawData.filter((c: any) => !c.gc)
    if (semGC.length > 0) {
      await supabase.from('contrato_gc').upsert(
        semGC.map((c: any) => ({
          contrato_id: c.id,
          etapa: 'provisionado',
        })) as never,
        { onConflict: 'contrato_id', ignoreDuplicates: true }
      )
      // Recarregar pra pegar as rows criadas
      const { data: reloadData } = await supabase
        .from('contratos')
        .select('id, codigo, pet_nome, pet_especie, pet_peso, pet_raca, pet_genero, pet_cor, tutor_nome, tutor_telefone, tipo_cremacao, status, data_acolhimento, numero_lacre, observacoes, unidade_id, supinda_id, certificado_nome_1, certificado_nome_2, certificado_nome_3, certificado_nome_4, certificado_nome_5, certificado_nome_6, certificado_nome_7, certificado_confirmado, contrato_gc(*)')
        .not('supinda_id', 'is', null)
        .in('status', ['ativo', 'pinda'])
        .order('data_acolhimento', { ascending: true })

      const data2 = (reloadData || []).map(mergePet)
      setContratos(data2 as ContratoGC[])
    } else {
      setContratos(rawData as ContratoGC[])
    }

    setUnidades((unidadesRes.data || []) as UnidadeInfo[])
    setSupindas((supindasRes.data || []).map((s: any) => ({
      id: s.id, numero: s.numero, data: s.data, status: s.status,
      codigo_unidade: s.unidades?.codigo || '??',
    })))
    setLoading(false)
  }, [])

  useEffect(() => {
    carregarDados()

    // Realtime — só contrato_gc (contratos é muito amplo e causa reloads fantasma)
    const channel = supabase
      .channel('gc-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contrato_gc' }, carregarDados)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [carregarDados])

  const [visao, setVisao] = useState<'unidade' | 'dia'>('unidade')
  const [activeUnit, setActiveUnit] = useState<string | null>(null)

  // Calendário: dias visíveis
  const desktopVisivel: Date[] = []
  for (let i = -2; i <= 7; i++) {
    const d = new Date(hoje)
    d.setDate(d.getDate() + desktopOffset + i)
    desktopVisivel.push(d)
  }
  const mobileDias: Date[] = []
  for (let i = -14; i <= 13; i++) {
    const d = new Date(hoje)
    d.setDate(d.getDate() + i)
    mobileDias.push(d)
  }

  // Scroll mobile
  useEffect(() => {
    if (mobileScrollRef.current && !mobileScrolledRef.current) {
      const container = mobileScrollRef.current
      const itemWidth = container.scrollWidth / mobileDias.length
      const pos = itemWidth * 13 - 8
      container.scrollLeft = pos
      mobileInitialScroll.current = pos
      mobileScrolledRef.current = true
    }
  }, [mobileDias.length])

  // Supindas por dia (pra calendário-line)
  function getSupindasDia(dia: Date) {
    const dStr = dataLocal(dia)
    return supindas.filter(s => s.data === dStr)
  }

  // IDs de supindas num dia selecionado
  function getSupindaIdsDia(dia: Date): string[] {
    return getSupindasDia(dia).map(s => s.id)
  }

  // Link de WhatsApp com mensagem padrão de "agendamento de despedida"
  function linkWhatsAppAgendamento(c: ContratoGC): string {
    return linkAgendamentoDespedida({
      telefone: c.tutor_telefone,
      tutorNome: c.tutor_nome,
      petNome: c.pet_nome,
      petGenero: c.pet_genero,
    })
  }

  // Filtrar por busca + visão ativa (unidade OU dia, nunca ambos)
  const filtered = contratos.filter(c => {
    if (visao === 'unidade' && activeUnit && c.unidade_id !== activeUnit) return false
    if (visao === 'dia' && diaSelecionado) {
      const supIdsDia = getSupindaIdsDia(diaSelecionado)
      if (!c.supinda_id || !supIdsDia.includes(c.supinda_id)) return false
    }
    if (!busca.trim()) return true
    const t = busca.toLowerCase()
    return c.pet_nome?.toLowerCase().includes(t) ||
      c.tutor_nome?.toLowerCase().includes(t) ||
      c.codigo?.toLowerCase().includes(t) ||
      c.numero_lacre?.includes(t)
  }).sort((a, b) => {
    if (ordenacao === 'nome') {
      return (a.pet_nome || '').localeCompare(b.pet_nome || '', 'pt-BR', { sensitivity: 'base' })
    }
    if (ordenacao === 'lacre') {
      // Tenta numérico; se não der, cai pra string
      const na = parseInt((a.numero_lacre || '').replace(/\D/g, ''), 10)
      const nb = parseInt((b.numero_lacre || '').replace(/\D/g, ''), 10)
      if (!isNaN(na) && !isNaN(nb)) return na - nb
      return (a.numero_lacre || '').localeCompare(b.numero_lacre || '', 'pt-BR', { numeric: true })
    }
    // default: data_acolhimento ascendente
    return (a.data_acolhimento || '').localeCompare(b.data_acolhimento || '')
  })

  // Contagem por unidade — apenas pets já recebidos fisicamente na matriz.
  // Pets ainda em encaminhamento planejado (etapa 'provisionado') ficam de fora.
  const countByUnit = new Map<string, { cremados: number; total: number }>()
  unidades.forEach(u => countByUnit.set(u.id, { cremados: 0, total: 0 }))
  contratos.forEach(c => {
    const entry = countByUnit.get(c.unidade_id)
    if (!entry) return
    const etapa = c.gc?.etapa
    if (!etapa || etapa === 'provisionado') return
    entry.total++
    if (etapa === 'cremado' || etapa === 'disponivel') entry.cremados++
  })

  // Placar
  const petsNaMatriz = contratos.filter(c => c.status === 'pinda' && c.gc?.etapa === 'recebido')
  const paraCremar = petsNaMatriz.length
  const agendados = petsNaMatriz.filter(c => c.gc?.contato_status === 'agendado').length
  const pctAgendados = paraCremar > 0 ? Math.round((agendados / paraCremar) * 100) : 0

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
          </div>
        </div>
        {/* Placar desktop */}
        <div className="hidden md:flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-900/20 border border-red-500/20">
            <Flame className="h-4 w-4 text-red-400" />
            <div className="text-right">
              <span className="text-lg font-bold text-red-400">{paraCremar}</span>
              <p className="text-[9px] text-red-400/70 leading-tight">para cremar</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-900/20 border border-blue-500/20">
            <CalendarClock className="h-4 w-4 text-blue-400" />
            <div className="text-right">
              <span className="text-lg font-bold text-blue-400">{agendados} <span className="text-[10px] font-medium">({pctAgendados}%)</span></span>
              <p className="text-[9px] text-blue-400/70 leading-tight">já agendado{agendados !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Placar mobile */}
      <div className="md:hidden flex gap-2 mb-4">
        <div className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-900/20 border border-red-500/20">
          <Flame className="h-4 w-4 text-red-400" />
          <span className="text-lg font-bold text-red-400">{paraCremar}</span>
          <span className="text-[9px] text-red-400/70">para cremar</span>
        </div>
        <div className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-900/20 border border-blue-500/20">
          <CalendarClock className="h-4 w-4 text-blue-400" />
          <span className="text-lg font-bold text-blue-400">{agendados}</span>
          <span className="text-[9px] text-blue-400/70">({pctAgendados}%) agendado{agendados !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Toggle Visão — mobile: horizontal full width, desktop: vertical à esquerda */}
      <div className="md:hidden flex items-center bg-[var(--surface-100)] rounded-lg p-0.5 mb-4">
        <button
          onClick={() => { setVisao('unidade'); setDiaSelecionado(null) }}
          className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold transition-colors ${visao === 'unidade' ? 'bg-[var(--surface-0)] text-[var(--shell-text)] shadow-sm' : 'text-[var(--surface-400)]'}`}
        >
          Unidade
        </button>
        <button
          onClick={() => { setVisao('dia'); setActiveUnit(null) }}
          className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold transition-colors ${visao === 'dia' ? 'bg-[var(--surface-0)] text-[var(--shell-text)] shadow-sm' : 'text-[var(--surface-400)]'}`}
        >
          Dia
        </button>
      </div>

      <div className="flex items-start gap-3 mb-4">
        <div className="hidden md:flex flex-col items-center bg-[var(--surface-100)] rounded-lg p-0.5 shrink-0">
          <button
            onClick={() => { setVisao('unidade'); setDiaSelecionado(null) }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors w-full ${visao === 'unidade' ? 'bg-[var(--surface-0)] text-[var(--shell-text)] shadow-sm' : 'text-[var(--surface-400)]'}`}
          >
            Unidade
          </button>
          <button
            onClick={() => { setVisao('dia'); setActiveUnit(null) }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors w-full ${visao === 'dia' ? 'bg-[var(--surface-0)] text-[var(--shell-text)] shadow-sm' : 'text-[var(--surface-400)]'}`}
          >
            Dia
          </button>
        </div>
        <div className="flex-1 min-w-0">

      {visao === 'dia' && <>
      {/* Calendário-line DESKTOP */}
      <div className="hidden md:block relative mb-4">
        {desktopOffset !== 0 && (
          <button onClick={() => { setDesktopOffset(0); setDiaSelecionado(null) }} className="absolute -top-5 left-0 text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium">Ver Hoje</button>
        )}
        {diaSelecionado && (
          <button onClick={() => setDiaSelecionado(null)} className="absolute -top-5 right-0 text-xs text-[var(--surface-400)] hover:text-[var(--shell-text)] transition-colors font-medium">Limpar filtro</button>
        )}
        <div className="flex items-center gap-1">
          <button onClick={() => setDesktopOffset(prev => prev - 2)} className="p-1 rounded-lg text-[var(--surface-400)] hover:text-[var(--shell-text)] hover:bg-[var(--surface-100)] transition-colors shrink-0">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 flex gap-1 overflow-visible pt-2">
            {desktopVisivel.map((dia, i) => {
              const ehHoje = isMesmoDia(dia, hoje)
              const selecionado = diaSelecionado ? isMesmoDia(dia, diaSelecionado) : false
              const fds = dia.getDay() === 0 || dia.getDay() === 6
              const supsDia = getSupindasDia(dia)
              return (
                <button key={i} onClick={() => setDiaSelecionado(selecionado ? null : dia)}
                  className={`relative flex-1 min-w-0 pt-3.5 pb-1 px-0 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-0.5
                    ${selecionado ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                      : fds ? 'border-[var(--surface-200)] bg-[var(--surface-100)] text-[var(--surface-400)] hover:border-[var(--surface-300)]'
                        : 'border-[var(--surface-200)] bg-transparent text-[var(--surface-500)] hover:border-[var(--surface-300)] hover:bg-[var(--surface-50)]'}`}
                >
                  {ehHoje && <span className="absolute -top-[7px] left-1/2 -translate-x-1/2 z-10 px-2 text-[9px] font-bold uppercase tracking-wider text-orange-400 bg-[var(--shell-bg)]">Hoje</span>}
                  <span className={`text-[11px] font-semibold uppercase ${selecionado ? 'text-orange-400' : ''}`}>{DIAS_SEMANA[dia.getDay()]}</span>
                  <span className={`text-[11px] ${selecionado ? 'text-orange-300' : ''}`}>{formatDia(dia)}</span>
                  <span className="flex items-center justify-center gap-0.5 mt-0.5 h-4">
                    {supsDia.map((s, j) => (
                      <span key={j} className="w-4 h-4 rounded-full shrink-0" style={{ background: UNIT_COLORS[s.codigo_unidade] || '#6366f1' }} title={s.numero} />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
          <button onClick={() => setDesktopOffset(prev => prev + 2)} className="p-1 rounded-lg text-[var(--surface-400)] hover:text-[var(--shell-text)] hover:bg-[var(--surface-100)] transition-colors shrink-0">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Calendário-line MOBILE */}
      <div className="md:hidden relative mb-4">
        {diaSelecionado && (
          <button onClick={() => setDiaSelecionado(null)} className="absolute -top-5 right-0 text-xs text-[var(--surface-400)] hover:text-[var(--shell-text)] transition-colors font-medium">Limpar filtro</button>
        )}
        <div ref={mobileScrollRef} className="flex gap-2 overflow-x-auto overflow-y-visible scrollbar-hide snap-x snap-mandatory px-1 -mx-1 pt-2" style={{ scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}>
          {mobileDias.map((dia, i) => {
            const ehHoje = isMesmoDia(dia, hoje)
            const selecionado = diaSelecionado ? isMesmoDia(dia, diaSelecionado) : false
            const fds = dia.getDay() === 0 || dia.getDay() === 6
            const supsDia = getSupindasDia(dia)
            return (
              <button key={i} onClick={() => setDiaSelecionado(selecionado ? null : dia)}
                className={`relative snap-start shrink-0 pt-3.5 pb-1 px-0 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-0.5
                  ${selecionado ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                    : fds ? 'border-[var(--surface-200)] bg-[var(--surface-100)] text-[var(--surface-400)]'
                      : 'border-[var(--surface-200)] bg-transparent text-[var(--surface-500)]'}`}
                style={{ width: 'calc((100% - 2rem) / 5)' }}
              >
                {ehHoje && <span className="absolute -top-[7px] left-1/2 -translate-x-1/2 z-10 px-2 text-[9px] font-bold uppercase tracking-wider text-orange-400 bg-[var(--shell-bg)]">Hoje</span>}
                <span className={`text-[11px] font-semibold uppercase ${selecionado ? 'text-orange-400' : ''}`}>{DIAS_SEMANA[dia.getDay()]}</span>
                <span className={`text-[11px] ${selecionado ? 'text-orange-300' : ''}`}>{formatDia(dia)}</span>
                <span className="flex items-center justify-center gap-0.5 mt-0.5 h-4">
                  {supsDia.map((s, j) => (
                    <span key={j} className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: UNIT_COLORS[s.codigo_unidade] || '#6366f1' }} title={s.numero} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      </>}

      {/* Abas tipo Chrome */}
      {visao === 'unidade' && <>
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
      </>}

        </div>
      </div>

      {/* Busca + Ordenação */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
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
        <div className="flex items-center gap-1 rounded-lg border border-[var(--surface-200)] p-0.5 bg-[var(--surface-50)]">
          {([
            { v: 'data',  l: 'Data',  icon: Calendar },
            { v: 'nome',  l: 'Nome',  icon: ArrowDownAZ },
            { v: 'lacre', l: 'Lacre', icon: Tag },
          ] as const).map(o => {
            const Ico = o.icon
            const ativo = ordenacao === o.v
            return (
              <button
                key={o.v}
                onClick={() => setOrdenacao(o.v)}
                title={`Ordenar por ${o.l.toLowerCase()}`}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${ativo ? 'bg-[var(--brand-500)] text-white' : 'text-[var(--surface-500)] hover:bg-[var(--surface-100)]'}`}
              >
                <Ico className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{o.l}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Lista agrupada por encaminhamento */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-36" />
            </div>
          ))}
        </div>
      ) : (() => {
        // Agrupar por supinda_id
        const grupos = new Map<string, { sup: typeof supindas[0] | null; contratos: typeof filtered }>()
        filtered.forEach(c => {
          const key = c.supinda_id || 'sem'
          if (!grupos.has(key)) {
            const sup = c.supinda_id ? supindas.find(s => s.id === c.supinda_id) || null : null
            grupos.set(key, { sup, contratos: [] })
          }
          grupos.get(key)!.contratos.push(c)
        })

        if (grupos.size === 0) return (
          <div className="py-12 text-center">
            <Church className="h-8 w-8 mx-auto mb-2" style={{ color: '#475569' }} />
            <p className="text-sm" style={{ color: '#64748b' }}>Nenhum pet no pipeline</p>
          </div>
        )

        // Ordena os grupos por data da supinda asc (mais antigo → mais novo).
        // Grupos sem supinda ('sem' / null) vão pro fim.
        const gruposOrdenados = Array.from(grupos.entries()).sort(([, a], [, b]) => {
          const da = a.sup?.data || ''
          const db = b.sup?.data || ''
          if (!da && !db) return 0
          if (!da) return 1
          if (!db) return -1
          return da.localeCompare(db)
        })

        return (
          <div className="space-y-4">
            {gruposOrdenados.map(([key, grupo]) => {
              const sup = grupo.sup
              const cor = sup ? (UNIT_COLORS[sup.codigo_unidade] || '#6366f1') : '#64748b'
              const todosNoNicho = grupo.contratos.length > 0 && grupo.contratos.every(c => c.gc?.etapa === 'disponivel')
              // "Em planejamento" só faz sentido pra supindas que ainda não saíram (status planejada)
              const supindaPlanejada = sup?.status === 'planejada'
              const todosProvisionados = supindaPlanejada && grupo.contratos.length > 0 && grupo.contratos.every(c => (c.gc?.etapa || 'provisionado') === 'provisionado')
              return (
                <div key={key} className={`rounded-xl border overflow-hidden ${todosNoNicho ? 'border-emerald-500/50' : todosProvisionados ? 'border-amber-500/40' : 'border-[var(--surface-200)]'}`}>
                  {/* Header do grupo */}
                  <div className={`flex items-center gap-2 px-3 py-2 ${todosNoNicho ? 'bg-emerald-900/20' : todosProvisionados ? 'bg-amber-900/15' : 'bg-[var(--surface-50)]'}`}>
                    {sup && (
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0" style={{ background: cor, color: sup.codigo_unidade === 'SJ' ? '#334155' : '#fff' }}>
                        {sup.codigo_unidade}
                      </span>
                    )}
                    <span className="text-xs font-bold text-[var(--shell-text)]">{sup?.numero || 'Sem encaminhamento'}</span>
                    {sup && <span className="text-[10px] text-[var(--surface-400)]">{new Date(sup.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>}
                    {todosNoNicho && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white animate-pulse">
                        ✨ Todos no nicho — prontos para retorno!
                      </span>
                    )}
                    {!todosNoNicho && todosProvisionados && (
                      <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/90 text-slate-900 border border-amber-400">
                        📅 Em planejamento
                      </span>
                    )}
                    <span className="text-[10px] text-[var(--surface-400)] ml-auto">{grupo.contratos.length} pet{grupo.contratos.length > 1 ? 's' : ''}</span>
                  </div>
                  {!todosNoNicho && todosProvisionados && (
                    <div className="px-3 py-2 bg-slate-900/60 border-t border-amber-500/30 text-[11px] space-y-0.5">
                      <p className="font-bold text-amber-300 uppercase tracking-wider text-[10px]">
                        📋 Aviso — Encaminhamento em planejamento
                      </p>
                      <p className="text-slate-200 leading-snug">
                        Contato e agendamento antecipados estão liberados.
                      </p>
                      <p className="text-amber-200 leading-snug">
                        ⚠ Pets contatados ou agendados ficam bloqueados neste encaminhamento e não podem ser removidos pela unidade.
                      </p>
                    </div>
                  )}
                  {/* Grid de cards */}
                  <div className="grid grid-cols-3 lg:grid-cols-7 gap-1 md:gap-2 p-1 md:p-2">
                    {grupo.contratos.map(c => {
                      const unit = unidades.find(u => u.id === c.unidade_id)
                      const unitColor = UNIT_COLORS[unit?.codigo || ''] || '#6366f1'
                      const etapa = c.gc?.etapa || 'provisionado'
                      const etapaColor = ETAPA_COLORS[etapa] || '#64748b'
                      const contatoSt = c.gc?.contato_status || null
                      const contatoColor = contatoSt ? (CONTATO_COLORS[contatoSt] || '#64748b') : null
                      const contatoLabel = contatoSt ? (CONTATO_LABELS[contatoSt] || contatoSt) : null
                      const PetIcon = c.pet_especie === 'canina' ? Dog : c.pet_especie === 'felina' ? Cat : Bug
                      const pesoColor = corPeso(c.pet_peso)
                      const isInd = c.tipo_cremacao === 'individual'
                      const borderColor = isInd ? '#22c55e' : '#8b5cf6'

                      return (
                        <div key={c.id} className="relative group">
                          <div
                            className="card p-2.5 pt-7 md:pt-1 min-h-[5rem] md:min-h-0 card-hover cursor-pointer transition-all h-full overflow-hidden"
                            style={{ borderLeft: `3px solid ${borderColor}` }}
                            onClick={() => setAcaoModal(c)}
                          >
                            {/* Lacre — corner superior esquerdo */}
                            {c.numero_lacre && (
                              <span className="absolute top-0 left-0 text-sm font-mono font-extrabold text-white px-1.5 py-0.5" style={{ background: '#1e3a8a', borderBottomRightRadius: '1rem', borderTopLeftRadius: 'inherit' }}>
                                {c.numero_lacre}
                              </span>
                            )}

                            {/* MOBILE: compacto */}
                            <div className="md:hidden">
                              {/* M1: quadradinhos com ícones WhatsApp style */}
                              <div className="absolute top-0 right-4 flex">
                                {etapa !== 'cremado' && etapa !== 'disponivel' && (
                                  <span className="w-5 h-5 flex items-center justify-center" style={{ background: !contatoSt ? '#94a3b8' : '#a7f3d0' }} title={contatoLabel || 'A Chamar'}>
                                    {!contatoSt && <Clock className="w-3 h-3" style={{ color: '#a7f3d0' }} />}
                                    {contatoSt === 'contatado' && <Check className="w-3 h-3" style={{ color: '#8696a0' }} />}
                                    {contatoSt === 'agendado' && <CheckCheck className="w-3 h-3" style={{ color: '#1a73e8' }} />}
                                  </span>
                                )}
                                <span className={`w-5 h-5 flex items-center justify-center ${etapa === 'provisionado' ? 'animate-pulse' : ''}`} style={{ background: etapaColor, borderTopRightRadius: 'inherit' }} title={ETAPA_LABELS[etapa] || etapa}>
                                  {etapa === 'provisionado' && <CalendarClock className="w-3 h-3 text-white/80" />}
                                  {etapa === 'recebido' && <SearchCheck className="w-3 h-3 text-white/80" />}
                                  {etapa === 'cremado' && <Flame className="w-3 h-3 text-white/80" />}
                                  {etapa === 'disponivel' && <CheckCircle2 className="w-3 h-3 text-white/80" />}
                                </span>
                              </div>
                              {/* M2: nome pet */}
                              <p className="font-semibold text-xs text-[var(--shell-text)] truncate">{c.pet_nome}</p>
                              {/* M3: tutor */}
                              <p className="text-[9px] text-[var(--surface-400)] truncate">{c.tutor_nome}</p>
                              {/* M4: IND/COL */}
                              <span className="text-[8px] font-bold px-1 py-0.5 rounded inline-block mt-0.5" style={{ background: isInd ? '#16a34a' : '#7c3aed', color: '#fff' }}>
                                {isInd ? 'IND' : 'COL'}
                              </span>
                            </div>

                            {/* DESKTOP: completo */}
                            <div className="hidden md:block">
                              {/* L1: Nome do pet + unidade */}
                              <div className="flex items-center justify-end gap-1.5 mb-0.5">
                                <span className="font-semibold text-xs text-[var(--shell-text)] truncate text-right flex-1" style={{ maxWidth: c.numero_lacre ? 'calc(100% - 3.5rem)' : '100%' }}>{c.pet_nome}</span>
                                {visao !== 'unidade' && unit && (
                                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold shrink-0" style={{ background: unitColor, color: unit.codigo === 'SJ' ? '#334155' : '#fff' }}>
                                    {unit.codigo}
                                  </span>
                                )}
                              </div>

                              {/* L2: Tutor */}
                              <p className="text-[9px] text-[var(--surface-400)] truncate text-right mb-0.5" style={{ maxWidth: c.numero_lacre ? 'calc(100% - 3.5rem)' : '100%', marginLeft: 'auto' }}>{c.tutor_nome}</p>

                              {/* L3: espécie + raça + peso + IND/COL */}
                              <div className="flex items-center justify-center gap-1 flex-wrap mb-1">
                                <PetIcon className="h-3 w-3 text-[var(--surface-400)]" />
                                {c.pet_raca && <span className="text-[8px] text-[var(--surface-400)] truncate max-w-[60%]">{c.pet_raca}</span>}
                                {c.pet_peso != null && (
                                  <span className="text-[8px] font-bold px-1 py-0.5 rounded-full" style={{ background: pesoColor + '20', color: pesoColor }}>
                                    {c.pet_peso}kg
                                  </span>
                                )}
                                <span className="text-[8px] font-bold px-1 py-0.5 rounded" style={{ background: isInd ? '#16a34a' : '#7c3aed', color: '#fff' }}>
                                  {isInd ? 'IND' : 'COL'}
                                </span>
                              </div>

                              {/* L4: Status (contato primeiro, depois cremação) */}
                              <div className="flex items-center gap-1 flex-wrap">
                                {etapa !== 'cremado' && etapa !== 'disponivel' && (
                                  <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5" style={{ background: !contatoSt ? '#94a3b8' : '#a7f3d0', color: !contatoSt ? '#a7f3d0' : contatoSt === 'agendado' ? '#1a73e8' : '#065f46' }}>
                                    {!contatoSt && <Clock className="w-2.5 h-2.5" style={{ color: '#a7f3d0' }} />}
                                    {contatoSt === 'contatado' && <Check className="w-2.5 h-2.5" style={{ color: '#8696a0' }} />}
                                    {contatoSt === 'agendado' && <CheckCheck className="w-2.5 h-2.5" style={{ color: '#1a73e8' }} />}
                                    {contatoLabel || 'A Chamar'}
                                  </span>
                                )}
                                <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 text-white ${etapa === 'provisionado' ? 'animate-pulse' : ''}`} style={{ background: etapaColor }}>
                                  {etapa === 'provisionado' && <CalendarClock className="w-2.5 h-2.5" />}
                                  {etapa === 'recebido' && <SearchCheck className="w-2.5 h-2.5" />}
                                  {etapa === 'cremado' && <Flame className="w-2.5 h-2.5" />}
                                  {etapa === 'disponivel' && <CheckCircle2 className="w-2.5 h-2.5" />}
                                  {ETAPA_LABELS[etapa] || etapa}
                                </span>
                                {c.gc && (etapa === 'cremado' || etapa === 'disponivel') && (
                                  <>
                                    {isInd && <span className="text-[8px]" style={{ color: c.gc.cinzas_prontas ? '#22c55e' : '#475569' }}>{c.gc.cinzas_prontas ? '✓' : '○'}Cz</span>}
                                    <span className="text-[8px]" style={{ color: c.gc.certificado_pronto ? '#22c55e' : '#475569' }}>{c.gc.certificado_pronto ? '✓' : '○'}Ct</span>
                                  </>
                                )}
                              </div>
                            </div>


                            {/* WhatsApp — escanteio inferior ESQUERDO: mensagem padrão de agendamento */}
                            {c.tutor_telefone && (
                              <a
                                href={linkWhatsAppAgendamento(c)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="absolute bottom-0 left-0 w-5 h-5 flex items-center justify-center transition-opacity opacity-100 md:opacity-60 md:hover:opacity-100"
                                style={{ background: '#128C7E', borderTopRightRadius: '1rem', borderBottomLeftRadius: 'inherit' }}
                                title="Enviar mensagem de agendamento da despedida"
                              >
                                <span className="text-[8px] font-bold text-white leading-none">✍</span>
                              </a>
                            )}

                            {/* WhatsApp — escanteio inferior direito: chat direto */}
                            {c.tutor_telefone && (
                              <a
                                href={`https://wa.me/${c.tutor_telefone.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="absolute bottom-0 right-0 w-5 h-5 flex items-center justify-center transition-opacity opacity-100 md:opacity-60 md:hover:opacity-100"
                                style={{ background: '#25D366', borderTopLeftRadius: '1rem', borderBottomRightRadius: 'inherit' }}
                                title="Abrir chat no WhatsApp"
                              >
                                <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                </svg>
                              </a>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Modal de ação GC */}
      {acaoModal && (
        <GCAcaoModal
          contratoId={acaoModal.id}
          petNome={acaoModal.pet_nome}
          tipoCremacao={acaoModal.tipo_cremacao}
          petEspecie={acaoModal.pet_especie}
          petPeso={acaoModal.pet_peso}
          petRaca={acaoModal.pet_raca}
          petGenero={acaoModal.pet_genero}
          petCor={acaoModal.pet_cor}
          numeroLacre={acaoModal.numero_lacre}
          tutorNome={acaoModal.tutor_nome}
          tutorTelefone={acaoModal.tutor_telefone}
          contratoCodigo={acaoModal.codigo}
          certificadoNomesRaw={[acaoModal.certificado_nome_1, acaoModal.certificado_nome_2, acaoModal.certificado_nome_3, acaoModal.certificado_nome_4, acaoModal.certificado_nome_5, acaoModal.certificado_nome_6, acaoModal.certificado_nome_7]}
          certificadoConfirmado={!!acaoModal.certificado_confirmado}
          onCertificadoSaved={(nomes, confirmado, petDados) => {
            setContratos(prev => prev.map(c => c.id === acaoModal.id ? {
              ...c,
              certificado_nome_1: nomes[0],
              certificado_nome_2: nomes[1],
              certificado_nome_3: nomes[2],
              certificado_nome_4: nomes[3],
              certificado_nome_5: nomes[4],
              certificado_nome_6: nomes[5],
              certificado_nome_7: nomes[6],
              certificado_confirmado: confirmado,
              // Snapshot do contrato_gc + raiz mergeada (para consistência com mergePet)
              ...(petDados ? petDados : {}),
              gc: c.gc && petDados ? { ...c.gc, ...petDados } : c.gc,
            } as ContratoGC : c))
            if (petDados) {
              setAcaoModal(prev => prev ? {
                ...prev,
                ...petDados,
                gc: prev.gc && petDados ? { ...prev.gc, ...petDados } : prev.gc,
              } : prev)
            }
          }}
          supindaStatus={supindas.find(s => s.id === acaoModal.supinda_id)?.status || null}
          gcAtual={acaoModal.gc as any}
          onClose={() => setAcaoModal(null)}
          onSaved={async (gcAtualizado?: Record<string, unknown>) => {
            if (gcAtualizado) {
              setContratos(prev => prev.map(c =>
                c.id === acaoModal.id ? { ...c, gc: { ...c.gc!, ...gcAtualizado } as ContratoGC['gc'] } : c
              ))
            }
            await carregarDados()
          }}
        />
      )}
    </div>
  )
}
