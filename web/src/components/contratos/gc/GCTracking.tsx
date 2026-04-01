'use client'

import { useState, useEffect } from 'react'
import {
  Flame, Check, Phone, Calendar, Sparkles, Clock,
  ChevronRight, Loader2, AlertTriangle
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'

// ============================================
// Types
// ============================================
type GCData = {
  id: string
  contrato_id: string
  etapa: string
  data_recebimento: string | null
  recebido_por: string | null
  lacre_conferido: boolean
  acompanhamento_confirmado: string | null
  contato_tutor_em: string | null
  contato_tutor_obs: string | null
  forno: number | null
  data_agendamento: string | null
  data_cremacao: string | null
  cremacao_por: string | null
  pedidos_especiais_obs: string | null
  cinzas_prontas: boolean
  certificado_pronto: boolean
  data_disponivel: string | null
  observacoes_unidade: string | null
}

type Props = {
  contratoId: string
  tipoCremacao: string
  observacoesContrato: string | null
}

const ETAPAS = [
  { key: 'recebido', label: 'Recebido', icon: Check, color: '#3b82f6' },
  { key: 'contato_tutor', label: 'Contato Tutor', icon: Phone, color: '#8b5cf6' },
  { key: 'agendado', label: 'Agendado', icon: Calendar, color: '#f59e0b' },
  { key: 'pedidos_especiais', label: 'Pedidos Especiais', icon: Sparkles, color: '#ec4899' },
  { key: 'cremacao', label: 'Cremação', icon: Flame, color: '#ef4444' },
  { key: 'disponivel', label: 'Disponível', icon: Check, color: '#22c55e' },
]

const ACOMP_LABELS: Record<string, string> = {
  video_chamada: 'Vídeo-chamada ao vivo',
  video_gravado: 'Vídeo gravado',
  presencial: 'Presencial na Matriz',
  nao_deseja: 'Não deseja',
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ============================================
// Component
// ============================================
export default function GCTracking({ contratoId, tipoCremacao, observacoesContrato }: Props) {
  const supabase = createClient()
  const { currentUnit } = useUnit()

  const [gc, setGc] = useState<GCData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Pinda/Matriz pode editar, unidades só veem
  const isMatriz = currentUnit?.is_matriz === true
  const etapaIdx = gc ? ETAPAS.findIndex(e => e.key === gc.etapa) : -1

  useEffect(() => {
    loadGC()
  }, [contratoId])

  async function loadGC() {
    setLoading(true)
    const { data } = await supabase
      .from('contrato_gc')
      .select('*')
      .eq('contrato_id', contratoId)
      .single()

    setGc(data as GCData | null)
    setLoading(false)
  }

  // Criar registro GC (quando contrato chega em Pinda)
  async function criarGC() {
    setSaving(true)
    const { data } = await supabase
      .from('contrato_gc')
      .insert({
        contrato_id: contratoId,
        etapa: 'recebido',
        observacoes_unidade: observacoesContrato || null,
      } as never)
      .select()
      .single()

    if (data) setGc(data as GCData)
    setSaving(false)
  }

  // Avançar etapa
  async function avancarEtapa() {
    if (!gc || etapaIdx >= ETAPAS.length - 1) return
    const novaEtapa = ETAPAS[etapaIdx + 1].key
    await updateGC({ etapa: novaEtapa })
  }

  // Voltar etapa
  async function voltarEtapa() {
    if (!gc || etapaIdx <= 0) return
    const novaEtapa = ETAPAS[etapaIdx - 1].key
    await updateGC({ etapa: novaEtapa })
  }

  // Update genérico
  async function updateGC(fields: Partial<GCData>) {
    if (!gc) return
    setSaving(true)
    const { data } = await supabase
      .from('contrato_gc')
      .update(fields as never)
      .eq('id', gc.id)
      .select()
      .single()

    if (data) setGc(data as GCData)
    setSaving(false)
  }

  // ============================================
  // Render
  // ============================================
  if (loading) {
    return (
      <div className="bg-slate-800 rounded-xl shadow-md p-5 border border-slate-700">
        <div className="flex items-center gap-2 mb-4">
          <Flame className="h-4 w-4 text-orange-400" />
          <span className="font-semibold text-slate-200">GC — Gerenciamento de Cremação</span>
        </div>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      </div>
    )
  }

  // Sem registro GC — botão pra criar (só Matriz)
  if (!gc) {
    return (
      <div className="bg-slate-800 rounded-xl shadow-md p-5 border border-slate-700">
        <div className="flex items-center gap-2 mb-4">
          <Flame className="h-4 w-4 text-orange-400" />
          <span className="font-semibold text-slate-200">GC — Gerenciamento de Cremação</span>
        </div>
        {isMatriz ? (
          <div className="text-center py-4">
            <p className="text-sm text-slate-400 mb-3">Pet ainda não foi recepcionado na matriz.</p>
            <button onClick={criarGC} disabled={saving} className="btn-primary flex items-center gap-2 mx-auto">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirmar Recebimento
            </button>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-slate-400">Aguardando recebimento na matriz...</p>
            <Clock className="h-8 w-8 text-slate-600 mx-auto mt-2" />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-slate-800 rounded-xl shadow-md p-5 border border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-400" />
          <span className="font-semibold text-slate-200">GC — Gerenciamento de Cremação</span>
        </div>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </div>

      {/* Observações da unidade — post-it */}
      {gc.observacoes_unidade && (
        <div className="mb-4 px-3 py-2 rounded-lg text-xs leading-relaxed" style={{ background: 'rgba(250,204,21,0.15)', color: '#eab308', borderLeft: '3px solid #eab308' }}>
          <span className="font-bold">⚠️ Obs. da unidade:</span> {gc.observacoes_unidade}
        </div>
      )}

      {/* Timeline de etapas */}
      <div className="flex items-center gap-0 mb-5 overflow-x-auto pb-2">
        {ETAPAS.map((etapa, i) => {
          const isCurrent = i === etapaIdx
          const isDone = i < etapaIdx
          const isFuture = i > etapaIdx
          const EtapaIcon = etapa.icon

          return (
            <div key={etapa.key} className="flex items-center">
              {/* Círculo */}
              <div className="flex flex-col items-center" style={{ minWidth: 70 }}>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                  style={{
                    background: isDone ? etapa.color : isCurrent ? etapa.color + '30' : 'rgba(100,116,139,0.2)',
                    border: isCurrent ? `2px solid ${etapa.color}` : 'none',
                  }}
                >
                  {isDone ? (
                    <Check className="h-4 w-4 text-white" />
                  ) : (
                    <EtapaIcon className="h-3.5 w-3.5" style={{ color: isCurrent ? etapa.color : '#64748b' }} />
                  )}
                </div>
                <span className="text-[9px] mt-1 font-medium text-center leading-tight" style={{ color: isCurrent ? etapa.color : isDone ? '#94a3b8' : '#475569' }}>
                  {etapa.label}
                </span>
              </div>

              {/* Linha entre etapas */}
              {i < ETAPAS.length - 1 && (
                <div className="w-4 h-0.5 -mt-3" style={{ background: isDone ? etapa.color : '#334155' }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Detalhes da etapa atual */}
      <div className="bg-slate-700/50 rounded-lg p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          {/* Recebimento */}
          <div>
            <span className="text-slate-400 block mb-0.5">Recebido em</span>
            <span className="text-slate-200 font-medium">{formatDate(gc.data_recebimento)}</span>
          </div>
          {gc.recebido_por && (
            <div>
              <span className="text-slate-400 block mb-0.5">Recebido por</span>
              <span className="text-slate-200 font-medium">{gc.recebido_por}</span>
            </div>
          )}
          <div>
            <span className="text-slate-400 block mb-0.5">Lacre</span>
            <span className={`font-medium ${gc.lacre_conferido ? 'text-emerald-400' : 'text-amber-400'}`}>
              {gc.lacre_conferido ? '✓ Conferido' : '○ Pendente'}
            </span>
          </div>

          {/* Contato tutor */}
          {gc.acompanhamento_confirmado && (
            <div>
              <span className="text-slate-400 block mb-0.5">Acompanhamento</span>
              <span className="text-slate-200 font-medium">{ACOMP_LABELS[gc.acompanhamento_confirmado] || gc.acompanhamento_confirmado}</span>
            </div>
          )}
          {gc.contato_tutor_obs && (
            <div className="col-span-2 md:col-span-3">
              <span className="text-slate-400 block mb-0.5">Obs. Acompanhamento</span>
              <span className="text-slate-200 text-xs">{gc.contato_tutor_obs}</span>
            </div>
          )}

          {/* Agendamento */}
          {gc.forno && (
            <div>
              <span className="text-slate-400 block mb-0.5">Forno</span>
              <span className="text-slate-200 font-bold text-lg">{gc.forno}</span>
            </div>
          )}
          {gc.data_agendamento && (
            <div>
              <span className="text-slate-400 block mb-0.5">Agendado para</span>
              <span className="text-slate-200 font-medium">{formatDate(gc.data_agendamento)}</span>
            </div>
          )}

          {/* Cremação */}
          {gc.data_cremacao && (
            <div>
              <span className="text-slate-400 block mb-0.5">Cremado em</span>
              <span className="text-slate-200 font-medium">{formatDate(gc.data_cremacao)}</span>
            </div>
          )}

          {/* Disponível */}
          {(gc.etapa === 'cremacao' || gc.etapa === 'disponivel') && (
            <>
              <div>
                <span className="text-slate-400 block mb-0.5">Cinzas</span>
                <span className={gc.cinzas_prontas ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                  {tipoCremacao === 'coletiva' ? 'N/A (coletiva)' : gc.cinzas_prontas ? '✓ Prontas' : '○ Pendente'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Certificado</span>
                <span className={gc.certificado_pronto ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                  {gc.certificado_pronto ? '✓ Pronto' : '○ Pendente'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Ações — só Matriz */}
      {isMatriz && (
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {/* Toggles rápidos */}
            {gc.etapa === 'recebido' && (
              <button
                onClick={() => updateGC({ lacre_conferido: !gc.lacre_conferido })}
                className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                style={{
                  borderColor: gc.lacre_conferido ? '#22c55e' : '#475569',
                  color: gc.lacre_conferido ? '#22c55e' : '#94a3b8',
                }}
              >
                {gc.lacre_conferido ? '✓' : '○'} Lacre
              </button>
            )}
            {gc.etapa === 'contato_tutor' && (
              <>
                <select
                  value={gc.acompanhamento_confirmado || ''}
                  onChange={e => updateGC({ acompanhamento_confirmado: e.target.value || null })}
                  className="text-xs px-2 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 outline-none"
                >
                  <option value="">Acompanhamento...</option>
                  <option value="video_chamada">Vídeo-chamada</option>
                  <option value="video_gravado">Vídeo gravado</option>
                  <option value="presencial">Presencial</option>
                  <option value="nao_deseja">Não deseja</option>
                </select>
                <input
                  type="text"
                  placeholder="Obs. do acompanhamento..."
                  defaultValue={gc.contato_tutor_obs || ''}
                  onBlur={e => {
                    const val = e.target.value.trim() || null
                    if (val !== (gc.contato_tutor_obs || null)) updateGC({ contato_tutor_obs: val })
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  className="text-xs px-2 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 outline-none placeholder-slate-500 flex-1 min-w-[150px]"
                />
              </>
            )}
            {gc.etapa === 'agendado' && (
              <>
                <select
                  value={gc.forno || ''}
                  onChange={e => updateGC({ forno: e.target.value ? parseInt(e.target.value) : null })}
                  className="text-xs px-2 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 outline-none"
                >
                  <option value="">Forno...</option>
                  <option value="1">Forno 1</option>
                  <option value="2">Forno 2</option>
                  <option value="3">Forno 3</option>
                </select>
                <input
                  type="datetime-local"
                  step="1800"
                  value={gc.data_agendamento ? gc.data_agendamento.slice(0, 16) : ''}
                  onChange={e => updateGC({ data_agendamento: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  className="text-xs px-2 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 outline-none"
                />
              </>
            )}
            {(gc.etapa === 'cremacao' || gc.etapa === 'disponivel') && (
              <>
                {tipoCremacao === 'individual' && (
                  <button
                    onClick={() => updateGC({ cinzas_prontas: !gc.cinzas_prontas })}
                    className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                    style={{ borderColor: gc.cinzas_prontas ? '#22c55e' : '#475569', color: gc.cinzas_prontas ? '#22c55e' : '#94a3b8' }}
                  >
                    {gc.cinzas_prontas ? '✓' : '○'} Cinzas
                  </button>
                )}
                <button
                  onClick={() => updateGC({ certificado_pronto: !gc.certificado_pronto })}
                  className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                  style={{ borderColor: gc.certificado_pronto ? '#22c55e' : '#475569', color: gc.certificado_pronto ? '#22c55e' : '#94a3b8' }}
                >
                  {gc.certificado_pronto ? '✓' : '○'} Certificado
                </button>
              </>
            )}
          </div>

          {/* Botões avançar/voltar */}
          <div className="flex gap-2">
            {etapaIdx > 0 && (
              <button onClick={voltarEtapa} className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">
                ← Voltar
              </button>
            )}
            {etapaIdx < ETAPAS.length - 1 && (
              <button
                onClick={avancarEtapa}
                className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 transition-colors"
                style={{ background: ETAPAS[etapaIdx + 1]?.color + '20', color: ETAPAS[etapaIdx + 1]?.color }}
              >
                {ETAPAS[etapaIdx + 1]?.label} <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Unidade — read-only info */}
      {!isMatriz && (
        <div className="text-center text-xs text-slate-400 pt-2 border-t border-slate-700">
          Acompanhamento em tempo real da cremação na Matriz
        </div>
      )}
    </div>
  )
}
