'use client'

import { useState, useEffect } from 'react'
import { X, ChevronUp, ChevronDown, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'

type ContratoResumido = {
  id: string
  codigo: string
  pet_nome: string
  pet_peso: number | null
}

type Props = {
  // Contratos selecionados pra ida
  contratosIda: ContratoResumido[]
  onRemoveIda: (id: string) => void
  // Contratos selecionados pra volta
  contratosVolta: ContratoResumido[]
  onRemoveVolta: (id: string) => void
  // Geral
  onClear: () => void
  onEncaminhamentoCriado: () => void
}

export default function BandejaEncaminhamento({ contratosIda, onRemoveIda, contratosVolta, onRemoveVolta, onClear, onEncaminhamentoCriado }: Props) {
  const supabase = createClient()
  const { currentUnit } = useUnit()
  const [expanded, setExpanded] = useState(false)
  const [funcionarios, setFuncionarios] = useState<{ id: string; nome: string }[]>([])
  const [data, setData] = useState(new Date().toISOString().split('T')[0])
  const [responsavel, setResponsavel] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    carregarFuncionarios()
  }, [currentUnit?.id])

  // Auto-expandir quando tem itens
  const totalItens = contratosIda.length + contratosVolta.length
  useEffect(() => {
    if (totalItens > 0 && !expanded) setExpanded(true)
    if (totalItens === 0) setExpanded(false)
  }, [totalItens])

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

  async function criarEncaminhamento() {
    if (contratosIda.length === 0 || !currentUnit) return
    setSalvando(true)

    try {
      // Gerar próximo número
      const prefixo = currentUnit.codigo || 'ST'
      const { data: supindasExistentes } = await supabase
        .from('supindas')
        .select('numero')
        .like('numero', `${prefixo}%`)

      const maxNum = (supindasExistentes || []).reduce((max: number, s: any) => {
        const num = parseInt(s.numero.replace(prefixo, ''), 10)
        return isNaN(num) ? max : Math.max(max, num)
      }, 0)
      const numero = `${prefixo}${maxNum + 1}`

      const pesoTotal = contratosIda.reduce((sum, c) => sum + (c.pet_peso || 0), 0)

      // Criar supinda
      const { data: novaSupinda, error: errCriar } = await supabase
        .from('supindas')
        .insert({
          numero,
          data,
          responsavel: responsavel || null,
          status: 'em_andamento',
          quantidade_pets: contratosIda.length,
          peso_total: pesoTotal,
          unidade_id: currentUnit.id,
        } as never)
        .select('id')
        .single()

      if (errCriar || !novaSupinda) throw errCriar || new Error('Erro ao criar supinda')
      const supindaId = (novaSupinda as any).id

      // Vincular contratos IDA + mudar status pra pinda
      if (contratosIda.length > 0) {
        await supabase
          .from('contratos')
          .update({
            supinda_id: supindaId,
            supinda_direcao: 'ida',
            status: 'pinda',
          } as never)
          .in('id', contratosIda.map(c => c.id))

        // Criar contrato_gc para cada contrato IDA (se não existir)
        for (const c of contratosIda) {
          const { data: gcExistente } = await supabase
            .from('contrato_gc')
            .select('id')
            .eq('contrato_id', c.id)
            .maybeSingle()
          if (!gcExistente) {
            await supabase.from('contrato_gc').insert({
              contrato_id: c.id,
              etapa: 'recebido',
              data_recebimento: new Date().toISOString(),
            } as never)
          }
        }
      }

      // Vincular contratos VOLTA + mudar status pra retorno
      if (contratosVolta.length > 0) {
        await supabase
          .from('contratos')
          .update({
            supinda_id: supindaId,
            supinda_direcao: 'volta',
            status: 'retorno',
          } as never)
          .in('id', contratosVolta.map(c => c.id))
      }

      // Limpar e notificar
      onClear()
      onEncaminhamentoCriado()
      setData(new Date().toISOString().split('T')[0])
      setResponsavel('')
    } catch (err) {
      console.error('Erro ao criar encaminhamento:', err)
      alert('Erro ao criar encaminhamento')
    }

    setSalvando(false)
  }

  const pesoTotal = contratosIda.reduce((sum, c) => sum + (c.pet_peso || 0), 0)
  const countIda = contratosIda.length
  const countVolta = contratosVolta.length

  if (countIda === 0 && countVolta === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50" style={{ marginLeft: 'var(--sidebar-width, 0px)' }}>
      {/* Barra minimizada */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors"
          style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', color: '#fff' }}
        >
          <span>🚐 {countIda > 0 ? `${countIda} ida` : ''}{countIda > 0 && countVolta > 0 ? ' · ' : ''}{countVolta > 0 ? `${countVolta} volta` : ''}</span>
          <ChevronUp className="h-4 w-4" />
        </button>
      )}

      {/* Barra expandida */}
      {expanded && (
        <div
          className="border-t shadow-2xl"
          style={{ background: 'var(--surface-0, #fff)', borderColor: 'var(--surface-200, #e2e8f0)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid var(--surface-200, #e2e8f0)' }}>
            <div className="flex items-center gap-2">
              <span className="text-lg">🚐</span>
              <span className="text-sm font-bold" style={{ color: 'var(--surface-700, #334155)' }}>Encaminhamento</span>
              {countIda > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: '#f59e0b20', color: '#f59e0b' }}>
                  {countIda} ida · {pesoTotal.toFixed(1)}kg
                </span>
              )}
              {countVolta > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: '#06b6d420', color: '#06b6d4' }}>
                  {countVolta} volta
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onClear} className="text-xs text-red-500 hover:text-red-700 font-medium">Limpar</button>
              <button onClick={() => setExpanded(false)}>
                <ChevronDown className="h-4 w-4" style={{ color: 'var(--surface-400)' }} />
              </button>
            </div>
          </div>

          {/* Conteúdo */}
          <div className="px-4 py-3">
            <div className="flex gap-4 mb-3 flex-wrap">
              {/* Lista IDA */}
              {countIda > 0 && (
                <div className="flex-1 min-w-[150px]">
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#f59e0b' }}>IDA → ({countIda})</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {contratosIda.map(c => (
                      <div key={c.id} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium" style={{ background: '#fef3c720', color: '#f59e0b', border: '1px solid #f59e0b30' }}>
                        <span>{c.pet_nome}</span>
                        {c.pet_peso && <span className="text-[10px] opacity-60">({c.pet_peso}kg)</span>}
                        <button onClick={() => onRemoveIda(c.id)} className="ml-0.5 hover:text-red-500"><X className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lista VOLTA */}
              {countVolta > 0 && (
                <div className="flex-1 min-w-[150px]">
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#06b6d4' }}>← VOLTA ({countVolta})</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {contratosVolta.map(c => (
                      <div key={c.id} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium" style={{ background: '#06b6d420', color: '#06b6d4', border: '1px solid #06b6d430' }}>
                        <span>{c.pet_nome}</span>
                        <button onClick={() => onRemoveVolta(c.id)} className="ml-0.5 hover:text-red-500"><X className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Data + Responsável + Botão */}
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase" style={{ color: 'var(--surface-400)' }}>Data</label>
                <input
                  type="date"
                  value={data}
                  onChange={e => setData(e.target.value)}
                  className="px-2 py-1.5 rounded-lg text-sm border focus:outline-none focus:border-purple-400"
                  style={{ borderColor: 'var(--surface-200)', background: 'var(--surface-0)', color: 'var(--surface-700)' }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase" style={{ color: 'var(--surface-400)' }}>Responsável</label>
                <select
                  value={responsavel}
                  onChange={e => setResponsavel(e.target.value)}
                  className="px-2 py-1.5 rounded-lg text-sm border focus:outline-none focus:border-purple-400"
                  style={{ borderColor: 'var(--surface-200)', background: 'var(--surface-0)', color: 'var(--surface-700)' }}
                >
                  <option value="">Selecione...</option>
                  {funcionarios.map(f => (
                    <option key={f.id} value={f.nome}>{f.nome}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={criarEncaminhamento}
                disabled={salvando || (countIda === 0 && countVolta === 0)}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold text-white transition-colors disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' }}
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>⛪</span>}
                {salvando ? 'Criando...' : 'Criar Encaminhamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
