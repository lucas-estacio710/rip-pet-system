'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type GCData = {
  id?: string
  contrato_id: string
  etapa: string
  lacre_conferido?: boolean | null
  acompanhamento_confirmado?: string | null
  contato_tutor_em?: string | null
  contato_tutor_obs?: string | null
  forno?: number | null
  data_agendamento?: string | null
  pedidos_especiais_obs?: string | null
  data_cremacao?: string | null
  cremacao_por?: string | null
  cinzas_prontas?: boolean
  certificado_pronto?: boolean
  data_disponivel?: string | null
}

type Props = {
  contratoId: string
  petNome: string
  tipoCremacao: string
  gcAtual: GCData | null
  onClose: () => void
  onSaved: () => void
}

const ETAPAS = ['recebido', 'contato_tutor', 'agendado', 'pedidos_especiais', 'cremacao', 'disponivel'] as const
type Etapa = typeof ETAPAS[number]

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

export default function GCAcaoModal({ contratoId, petNome, tipoCremacao, gcAtual, onClose, onSaved }: Props) {
  const supabase = createClient()
  const [salvando, setSalvando] = useState(false)
  const [gc, setGc] = useState<GCData>(
    gcAtual || { contrato_id: contratoId, etapa: 'recebido', cinzas_prontas: false, certificado_pronto: false }
  )

  useEffect(() => {
    if (gcAtual) setGc(gcAtual)
  }, [gcAtual])

  const etapa = gc.etapa as Etapa
  const etapaIdx = ETAPAS.indexOf(etapa)
  const etapaColor = ETAPA_COLORS[etapa]
  const isInd = tipoCremacao === 'individual'

  async function salvar(novaEtapa?: Etapa) {
    setSalvando(true)
    const updates: any = { ...gc }
    if (novaEtapa) {
      updates.etapa = novaEtapa
      // Se avançou pra disponivel, marca data
      if (novaEtapa === 'disponivel') updates.data_disponivel = new Date().toISOString()
    }
    delete updates.id

    if (gc.id) {
      await supabase.from('contrato_gc').update(updates as never).eq('id', gc.id)
    } else {
      updates.data_recebimento = updates.data_recebimento || new Date().toISOString()
      await supabase.from('contrato_gc').insert(updates as never)
    }

    setSalvando(false)
    onSaved()
    onClose()
  }

  function avancar() {
    const proxima = ETAPAS[etapaIdx + 1]
    if (proxima) salvar(proxima)
    else salvar()
  }

  function voltar() {
    const anterior = ETAPAS[etapaIdx - 1]
    if (anterior) salvar(anterior)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${etapaColor}30 0%, ${etapaColor}10 100%)`, borderBottom: `2px solid ${etapaColor}` }}>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: etapaColor }}>
              Etapa {etapaIdx + 1}/6 · {ETAPA_LABELS[etapa]}
            </p>
            <h3 className="text-base font-bold text-slate-100 mt-0.5">{petNome}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Conteúdo por etapa */}
        <div className="p-5 space-y-4">

          {etapa === 'recebido' && (
            <>
              <p className="text-sm text-slate-300">Confirme o recebimento do pet na Matriz.</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!gc.lacre_conferido}
                  onChange={e => setGc({ ...gc, lacre_conferido: e.target.checked })}
                  className="w-5 h-5 rounded"
                />
                <span className="text-sm font-medium text-slate-200">Lacre conferido</span>
              </label>
            </>
          )}

          {etapa === 'contato_tutor' && (
            <>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-400 mb-2 block">Acompanhamento confirmado</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: 'video_chamada', l: '📹 Vídeo chamada' },
                    { v: 'video_gravado', l: '🎥 Vídeo gravado' },
                    { v: 'presencial', l: '👥 Presencial' },
                    { v: 'nao_deseja', l: '❌ Não deseja' },
                  ].map(o => (
                    <button
                      key={o.v}
                      onClick={() => setGc({ ...gc, acompanhamento_confirmado: o.v })}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border-2 transition-colors ${
                        gc.acompanhamento_confirmado === o.v
                          ? 'border-purple-500 bg-purple-900/30 text-purple-300'
                          : 'border-slate-600 text-slate-400 hover:border-purple-500/50'
                      }`}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-400 mb-1 block">Observações</label>
                <textarea
                  value={gc.contato_tutor_obs || ''}
                  onChange={e => setGc({ ...gc, contato_tutor_obs: e.target.value })}
                  placeholder="Detalhes do contato..."
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                />
              </div>
            </>
          )}

          {etapa === 'agendado' && (
            <>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-400 mb-2 block">Forno</label>
                <div className="flex gap-2">
                  {[1, 2, 3].map(f => (
                    <button
                      key={f}
                      onClick={() => setGc({ ...gc, forno: f })}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold border-2 transition-colors ${
                        gc.forno === f
                          ? 'border-amber-500 bg-amber-900/30 text-amber-300'
                          : 'border-slate-600 text-slate-400 hover:border-amber-500/50'
                      }`}
                    >
                      F{f}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-400 mb-1 block">Data e hora</label>
                <input
                  type="datetime-local"
                  value={gc.data_agendamento ? gc.data_agendamento.slice(0, 16) : ''}
                  onChange={e => setGc({ ...gc, data_agendamento: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </>
          )}

          {etapa === 'pedidos_especiais' && (
            <div>
              <label className="text-xs font-semibold uppercase text-slate-400 mb-1 block">Pedidos especiais</label>
              <textarea
                value={gc.pedidos_especiais_obs || ''}
                onChange={e => setGc({ ...gc, pedidos_especiais_obs: e.target.value })}
                placeholder="Molde de patinha, pelo extra, carimbo..."
                rows={3}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-pink-500"
              />
            </div>
          )}

          {etapa === 'cremacao' && (
            <>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-400 mb-1 block">Data da cremação</label>
                <input
                  type="datetime-local"
                  value={gc.data_cremacao ? gc.data_cremacao.slice(0, 16) : ''}
                  onChange={e => setGc({ ...gc, data_cremacao: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-400 mb-1 block">Funcionário responsável</label>
                <input
                  type="text"
                  value={gc.cremacao_por || ''}
                  onChange={e => setGc({ ...gc, cremacao_por: e.target.value })}
                  placeholder="Nome do funcionário..."
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-red-500"
                />
              </div>
            </>
          )}

          {etapa === 'disponivel' && (
            <>
              <p className="text-sm text-slate-300">Marque o que está pronto pra retornar:</p>
              {isInd && (
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700">
                  <input
                    type="checkbox"
                    checked={!!gc.cinzas_prontas}
                    onChange={e => setGc({ ...gc, cinzas_prontas: e.target.checked })}
                    className="w-5 h-5 rounded"
                  />
                  <span className="text-2xl">⚱️</span>
                  <span className="text-sm font-medium text-slate-200">Cinzas prontas</span>
                </label>
              )}
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700">
                <input
                  type="checkbox"
                  checked={!!gc.certificado_pronto}
                  onChange={e => setGc({ ...gc, certificado_pronto: e.target.checked })}
                  className="w-5 h-5 rounded"
                />
                <span className="text-2xl">📜</span>
                <span className="text-sm font-medium text-slate-200">Certificado pronto</span>
              </label>
            </>
          )}
        </div>

        {/* Footer com ações */}
        <div className="px-5 py-3 flex items-center justify-between border-t border-slate-700 bg-slate-900/50">
          <button
            onClick={voltar}
            disabled={etapaIdx === 0 || salvando}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" /> Voltar
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => salvar()}
              disabled={salvando}
              className="px-3 py-1.5 text-xs text-slate-300 hover:text-white border border-slate-600 rounded-lg hover:bg-slate-700"
            >
              Salvar
            </button>
            {etapaIdx < ETAPAS.length - 1 && (
              <button
                onClick={avancar}
                disabled={salvando}
                className="flex items-center gap-1 px-4 py-1.5 text-sm font-bold text-white rounded-lg disabled:opacity-50"
                style={{ background: etapaColor }}
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Avançar <ChevronRight className="h-4 w-4" /></>}
              </button>
            )}
            {etapaIdx === ETAPAS.length - 1 && (
              <button
                onClick={() => salvar()}
                disabled={salvando}
                className="flex items-center gap-1 px-4 py-1.5 text-sm font-bold text-white rounded-lg disabled:opacity-50 bg-emerald-600 hover:bg-emerald-700"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Concluir'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
