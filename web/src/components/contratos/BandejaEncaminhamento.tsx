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
  onClear: () => void
  onEncaminhamentoCriado: () => void
}

export default function BandejaEncaminhamento({ contratosIda, onRemoveIda, onClear, onEncaminhamentoCriado }: Props) {
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
  useEffect(() => {
    if (contratosIda.length > 0 && !expanded) setExpanded(true)
    if (contratosIda.length === 0) setExpanded(false)
  }, [contratosIda.length])

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

      // Vincular contratos + mudar status pra pinda
      const ids = contratosIda.map(c => c.id)
      await supabase
        .from('contratos')
        .update({
          supinda_id: (novaSupinda as any).id,
          supinda_direcao: 'ida',
          status: 'pinda',
        } as never)
        .in('id', ids)

      // Criar contrato_gc para cada contrato (se não existir)
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
  const count = contratosIda.length

  if (count === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50" style={{ marginLeft: 'var(--sidebar-width, 0px)' }}>
      {/* Barra minimizada */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors"
          style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', color: '#fff' }}
        >
          <span>🚐 {count} pet{count > 1 ? 's' : ''} · {pesoTotal.toFixed(1)}kg</span>
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
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: '#7c3aed20', color: '#7c3aed' }}>
                {count} pet{count > 1 ? 's' : ''} · {pesoTotal.toFixed(1)}kg
              </span>
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
            {/* Lista de pets na IDA */}
            <div className="mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#f59e0b' }}>IDA →</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {contratosIda.map(c => (
                  <div key={c.id} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium" style={{ background: 'var(--surface-100, #f1f5f9)', color: 'var(--surface-700, #334155)' }}>
                    <span>{c.pet_nome}</span>
                    {c.pet_peso && <span className="text-[10px]" style={{ color: 'var(--surface-400)' }}>({c.pet_peso}kg)</span>}
                    <button onClick={() => onRemoveIda(c.id)} className="ml-0.5 hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
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
                disabled={salvando || count === 0}
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
