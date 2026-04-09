'use client'

import { useEffect, useState } from 'react'
import { Route, ChevronDown, ChevronUp, Truck, CheckCircle2, Clock, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import Link from 'next/link'

// ============================================
// Tipos
// ============================================

type ContratoIda = {
  id: string
  codigo: string
  pet_nome: string
  pet_peso: number | null
  tutor_nome: string
  numero_lacre: string | null
}

type ContratoVolta = {
  id: string
  codigo: string
  pet_nome: string
  tutor_nome: string
  supinda: { numero: string } | null
  contrato_gc: { cinzas_prontas: boolean; certificado_pronto: boolean } | null
}

type SupindaHistorico = {
  id: string
  numero: string
  data: string
  responsavel: string | null
  status: string
  quantidade_pets: number | null
  peso_total: number | null
}

// ============================================
// Page
// ============================================

export default function SupindasPage() {
  const supabase = createClient()
  const { currentUnit } = useUnit()

  // Painéis IDA e VOLTA
  const [contratosIda, setContratosIda] = useState<ContratoIda[]>([])
  const [contratosVolta, setContratosVolta] = useState<ContratoVolta[]>([])
  const [selectedIda, setSelectedIda] = useState<Set<string>>(new Set())
  const [selectedVolta, setSelectedVolta] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  // Formulário
  const [responsavel, setResponsavel] = useState('')
  const [dataEnc, setDataEnc] = useState(new Date().toISOString().split('T')[0])
  const [funcionarios, setFuncionarios] = useState<{ id: string; nome: string }[]>([])
  const [salvando, setSalvando] = useState(false)

  // Histórico
  const [historico, setHistorico] = useState<SupindaHistorico[]>([])
  const [showHistorico, setShowHistorico] = useState(false)

  // ============================================
  // Carregar dados
  // ============================================

  useEffect(() => {
    if (!currentUnit?.id) return
    carregarTudo()

    // Realtime
    const channel = supabase
      .channel('enc-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contratos' }, () => carregarPaineis())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contrato_gc' }, () => carregarPaineis())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [currentUnit?.id])

  async function carregarTudo() {
    setLoading(true)
    await Promise.all([carregarPaineis(), carregarFuncionarios(), carregarHistorico()])
    setLoading(false)
  }

  async function carregarPaineis() {
    if (!currentUnit?.id) return

    // IDA: contratos ativos da unidade (sem supinda ou com supinda planejada)
    const { data: ida } = await supabase
      .from('contratos')
      .select('id, codigo, pet_nome, pet_peso, tutor_nome, numero_lacre')
      .eq('unidade_id', currentUnit.id)
      .eq('status', 'ativo')
      .order('pet_nome')

    setContratosIda((ida || []) as ContratoIda[])

    // VOLTA: contratos em pinda da unidade com GC pronto
    const { data: volta } = await supabase
      .from('contratos')
      .select('id, codigo, pet_nome, tutor_nome, supinda:supindas!contratos_supinda_id_fkey(numero), contrato_gc(cinzas_prontas, certificado_pronto)')
      .eq('unidade_id', currentUnit.id)
      .eq('status', 'pinda')
      .order('pet_nome')

    // Filtrar só os que têm GC pronto
    const voltaFiltrado = ((volta || []) as any[]).filter(c => {
      const gc = Array.isArray(c.contrato_gc) ? c.contrato_gc[0] : c.contrato_gc
      return gc?.cinzas_prontas && gc?.certificado_pronto
    }).map(c => ({
      ...c,
      contrato_gc: Array.isArray(c.contrato_gc) ? c.contrato_gc[0] : c.contrato_gc,
      supinda: Array.isArray(c.supinda) ? c.supinda[0] : c.supinda,
    }))

    setContratosVolta(voltaFiltrado as ContratoVolta[])
  }

  async function carregarFuncionarios() {
    if (!currentUnit?.id) return
    const { data } = await supabase
      .from('funcionarios')
      .select('id, nome')
      .eq('ativo', true)
      .eq('unidade_id', currentUnit.id)
      .order('nome')
    if (data) setFuncionarios(data)
  }

  async function carregarHistorico() {
    if (!currentUnit?.id) return
    const { data } = await supabase
      .from('supindas')
      .select('id, numero, data, responsavel, status, quantidade_pets, peso_total')
      .eq('unidade_id', currentUnit.id)
      .in('status', ['em_andamento', 'retornada'])
      .order('data', { ascending: false })
      .limit(20)
    if (data) setHistorico(data as SupindaHistorico[])
  }

  // ============================================
  // Toggle seleção
  // ============================================

  function toggleIda(id: string) {
    setSelectedIda(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleVolta(id: string) {
    setSelectedVolta(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAllIda() {
    if (selectedIda.size === contratosIda.length) {
      setSelectedIda(new Set())
    } else {
      setSelectedIda(new Set(contratosIda.map(c => c.id)))
    }
  }

  function selectAllVolta() {
    if (selectedVolta.size === contratosVolta.length) {
      setSelectedVolta(new Set())
    } else {
      setSelectedVolta(new Set(contratosVolta.map(c => c.id)))
    }
  }

  // ============================================
  // Realizar Encaminhamento
  // ============================================

  async function realizarEncaminhamento() {
    if (selectedIda.size === 0 && selectedVolta.size === 0) return
    if (!currentUnit) return
    setSalvando(true)

    try {
      // Gerar próximo número
      const prefixo = currentUnit.codigo || 'XX'
      const { data: existentes } = await supabase
        .from('supindas')
        .select('numero')
        .like('numero', `${prefixo}%`)

      const maxNum = (existentes || []).reduce((max: number, s: any) => {
        const num = parseInt(s.numero.replace(prefixo, ''), 10)
        return isNaN(num) ? max : Math.max(max, num)
      }, 0)
      const numero = `${prefixo}${maxNum + 1}`

      // Calcular peso (só ida)
      const pesoTotal = contratosIda
        .filter(c => selectedIda.has(c.id))
        .reduce((sum, c) => sum + (c.pet_peso || 0), 0)

      // Criar supinda
      const { data: novaSupinda, error } = await supabase
        .from('supindas')
        .insert({
          numero,
          data: dataEnc,
          responsavel: responsavel || null,
          status: 'em_andamento',
          quantidade_pets: selectedIda.size,
          peso_total: pesoTotal,
          unidade_id: currentUnit.id,
        } as never)
        .select('id')
        .single()

      if (error || !novaSupinda) throw error || new Error('Erro ao criar supinda')
      const supindaId = (novaSupinda as any).id

      // IDA: vincular + mudar status
      if (selectedIda.size > 0) {
        const idsIda = Array.from(selectedIda)
        await supabase
          .from('contratos')
          .update({ supinda_id: supindaId, status: 'pinda' } as never)
          .in('id', idsIda)

        // Criar contrato_gc pra cada (se não existir)
        for (const cid of idsIda) {
          const { data: gcExiste } = await supabase
            .from('contrato_gc')
            .select('id')
            .eq('contrato_id', cid)
            .maybeSingle()
          if (!gcExiste) {
            await supabase.from('contrato_gc').insert({
              contrato_id: cid,
              etapa: 'recebido',
              data_recebimento: new Date().toISOString(),
            } as never)
          }
        }
      }

      // VOLTA: vincular supinda_volta_id + mudar status
      if (selectedVolta.size > 0) {
        await supabase
          .from('contratos')
          .update({ supinda_volta_id: supindaId, status: 'retorno' } as never)
          .in('id', Array.from(selectedVolta))
      }

      // Limpar e recarregar
      setSelectedIda(new Set())
      setSelectedVolta(new Set())
      setResponsavel('')
      setDataEnc(new Date().toISOString().split('T')[0])
      await carregarTudo()
    } catch (err) {
      console.error('Erro ao realizar encaminhamento:', err)
      alert('Erro ao realizar encaminhamento')
    }

    setSalvando(false)
  }

  // ============================================
  // Render
  // ============================================

  const totalSelecionado = selectedIda.size + selectedVolta.size

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-orange-900/30 items-center justify-center">
          <Route className="h-5 w-5 text-orange-500" />
        </div>
        <div>
          <h1 className="text-title text-[var(--shell-text)]">Encaminhamentos</h1>
          <p className="text-small text-[var(--shell-text-muted)]">Selecione os pets e realize o encaminhamento</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      ) : (
        <>
          {/* Painéis IDA + VOLTA */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

            {/* ===== PAINEL IDA ===== */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⛪</span>
                  <span className="text-sm font-bold text-amber-400">IDA →</span>
                  <span className="text-xs text-[var(--surface-400)]">{contratosIda.length} disponíveis</span>
                  {selectedIda.size > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: '#f59e0b20', color: '#f59e0b' }}>
                      {selectedIda.size} · {contratosIda.filter(c => selectedIda.has(c.id)).reduce((s, c) => s + (c.pet_peso || 0), 0).toFixed(1)}kg
                    </span>
                  )}
                </div>
                <button onClick={selectAllIda} className="text-[10px] font-medium px-2 py-1 rounded hover:bg-amber-900/20 transition-colors" style={{ color: '#f59e0b' }}>
                  {selectedIda.size === contratosIda.length && contratosIda.length > 0 ? 'Desmarcar' : 'Todos'}
                </button>
              </div>

              {contratosIda.length === 0 ? (
                <div className="card p-8 text-center text-sm" style={{ color: 'var(--surface-400)' }}>Nenhum pet ativo para encaminhar</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[55vh] overflow-y-auto pr-1">
                  {contratosIda.map(c => {
                    const sel = selectedIda.has(c.id)
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleIda(c.id)}
                        className={`relative rounded-xl p-3 text-left transition-all duration-150 hover:scale-[1.02] ${
                          sel
                            ? 'ring-2 ring-amber-400 shadow-lg shadow-amber-500/20'
                            : 'ring-1 ring-[var(--surface-200)] hover:ring-amber-400/50'
                        }`}
                        style={{ background: sel ? 'rgba(245,158,11,0.1)' : 'var(--surface-0)' }}
                      >
                        {/* Check */}
                        {sel && (
                          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                            <span className="text-white text-[10px] font-bold">✓</span>
                          </div>
                        )}

                        {/* Lacre */}
                        {c.numero_lacre && (
                          <span className="text-white font-bold bg-blue-700 px-1.5 py-0.5 rounded text-[10px] inline-block mb-1.5">
                            {String(c.numero_lacre).replace(/\.0$/, '')}
                          </span>
                        )}

                        {/* Pet */}
                        <p className="text-sm font-bold truncate" style={{ color: 'var(--surface-700)' }}>{c.pet_nome}</p>
                        <p className="text-[11px] truncate" style={{ color: 'var(--surface-400)' }}>{c.tutor_nome}</p>

                        {/* Peso */}
                        {c.pet_peso && (
                          <p className="text-[10px] font-mono mt-1" style={{ color: 'var(--surface-400)' }}>{c.pet_peso}kg</p>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ===== PAINEL VOLTA ===== */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🛍️</span>
                  <span className="text-sm font-bold text-cyan-400">← VOLTA</span>
                  <span className="text-xs text-[var(--surface-400)]">{contratosVolta.length} prontos</span>
                  {selectedVolta.size > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: '#06b6d420', color: '#06b6d4' }}>
                      {selectedVolta.size}
                    </span>
                  )}
                </div>
                <button onClick={selectAllVolta} className="text-[10px] font-medium px-2 py-1 rounded hover:bg-cyan-900/20 transition-colors" style={{ color: '#06b6d4' }}>
                  {selectedVolta.size === contratosVolta.length && contratosVolta.length > 0 ? 'Desmarcar' : 'Todos'}
                </button>
              </div>

              {contratosVolta.length === 0 ? (
                <div className="card p-8 text-center text-sm" style={{ color: 'var(--surface-400)' }}>Nenhuma cinza/certificado pronto</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[55vh] overflow-y-auto pr-1">
                  {contratosVolta.map(c => {
                    const sel = selectedVolta.has(c.id)
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleVolta(c.id)}
                        className={`relative rounded-xl p-3 text-left transition-all duration-150 hover:scale-[1.02] ${
                          sel
                            ? 'ring-2 ring-cyan-400 shadow-lg shadow-cyan-500/20'
                            : 'ring-1 ring-[var(--surface-200)] hover:ring-cyan-400/50'
                        }`}
                        style={{ background: sel ? 'rgba(6,182,212,0.1)' : 'var(--surface-0)' }}
                      >
                        {/* Check */}
                        {sel && (
                          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-cyan-500 flex items-center justify-center">
                            <span className="text-white text-[10px] font-bold">✓</span>
                          </div>
                        )}

                        {/* Enc. original */}
                        {c.supinda?.numero && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold inline-block mb-1.5" style={{ background: '#f59e0b20', color: '#f59e0b' }}>
                            {c.supinda.numero}
                          </span>
                        )}

                        {/* Pet */}
                        <p className="text-sm font-bold truncate" style={{ color: 'var(--surface-700)' }}>{c.pet_nome}</p>
                        <p className="text-[11px] truncate" style={{ color: 'var(--surface-400)' }}>{c.tutor_nome}</p>

                        {/* Status */}
                        <p className="text-[10px] mt-1" style={{ color: '#22c55e' }}>⚱️✓ 📜✓</p>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ===== BARRA DE AÇÃO ===== */}
          <div className="card px-4 py-3 flex items-center gap-3 flex-wrap mb-6">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase" style={{ color: 'var(--surface-400)' }}>Data</label>
                <input
                  type="date"
                  value={dataEnc}
                  onChange={e => setDataEnc(e.target.value)}
                  className="px-2 py-1.5 rounded-lg text-sm border focus:outline-none focus:border-orange-400"
                  style={{ borderColor: 'var(--surface-200)', background: 'var(--surface-0)', color: 'var(--surface-700)' }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase" style={{ color: 'var(--surface-400)' }}>Responsável</label>
                <select
                  value={responsavel}
                  onChange={e => setResponsavel(e.target.value)}
                  className="px-2 py-1.5 rounded-lg text-sm border focus:outline-none focus:border-orange-400"
                  style={{ borderColor: 'var(--surface-200)', background: 'var(--surface-0)', color: 'var(--surface-700)' }}
                >
                  <option value="">Selecione...</option>
                  {funcionarios.map(f => (
                    <option key={f.id} value={f.nome}>{f.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Resumo + Botão */}
            <div className="flex items-center gap-3">
              {selectedIda.size > 0 && (
                <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                  ⛪ {selectedIda.size}
                </span>
              )}
              {selectedVolta.size > 0 && (
                <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full" style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4' }}>
                  🛍️ {selectedVolta.size}
                </span>
              )}
              <button
                onClick={realizarEncaminhamento}
                disabled={totalSelecionado === 0 || salvando}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-40 hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: totalSelecionado > 0 ? 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)' : 'var(--surface-300)' }}
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>🚐</span>}
                {salvando ? 'Processando...' : 'Realizar Encaminhamento'}
              </button>
            </div>
          </div>

          {/* ===== HISTÓRICO (colapsado) ===== */}
          <div>
            <button
              onClick={() => { setShowHistorico(!showHistorico); if (!showHistorico && historico.length === 0) carregarHistorico() }}
              className="flex items-center gap-2 text-xs font-medium mb-3"
              style={{ color: '#64748b' }}
            >
              <Clock className="h-3.5 w-3.5" />
              Histórico de encaminhamentos ({historico.length})
              <span style={{ transform: showHistorico ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
            </button>

            {showHistorico && (
              <div className="space-y-2">
                {historico.length === 0 ? (
                  <p className="text-xs text-center py-4" style={{ color: '#64748b' }}>Nenhum encaminhamento registrado</p>
                ) : (
                  historico.map(s => {
                    const statusLabel = s.status === 'em_andamento' ? 'Embarcada' : s.status === 'retornada' ? 'Finalizada' : 'Planejada'
                    const statusColor = s.status === 'em_andamento' ? '#3b82f6' : s.status === 'retornada' ? '#22c55e' : '#f59e0b'
                    return (
                      <div key={s.id} className="card px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-sm" style={{ color: statusColor }}>#{s.numero}</span>
                          <span className="text-xs" style={{ color: 'var(--surface-400)' }}>
                            {new Date(s.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </span>
                          {s.responsavel && <span className="text-xs" style={{ color: 'var(--surface-400)' }}>👤 {s.responsavel}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs" style={{ color: 'var(--surface-400)' }}>
                            {s.quantidade_pets} pet{(s.quantidade_pets || 0) > 1 ? 's' : ''} · {(s.peso_total || 0).toFixed(1)}kg
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: statusColor + '20', color: statusColor }}>
                            {statusLabel}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
