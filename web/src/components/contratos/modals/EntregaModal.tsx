'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type ContratoMinimal = {
  id: string
  codigo: string
  pet_nome: string
  status: string
  tutor_nome: string
  tutor?: { nome: string } | null
}

type Props = {
  isOpen: boolean
  onClose: () => void
  contrato: ContratoMinimal
  onSuccess?: (updated: { id: string; status: string; data_entrega: string }) => void
}

export default function EntregaModal({ isOpen, onClose, contrato, onSuccess }: Props) {
  const supabase = createClient()

  const [entregaForm, setEntregaForm] = useState({ dataHoje: true, data_entrega: '' })
  const [salvando, setSalvando] = useState(false)

  if (!isOpen) return null

  async function confirmarEntrega() {
    const dataEntrega = entregaForm.dataHoje
      ? new Date().toISOString().split('T')[0]
      : entregaForm.data_entrega

    if (!dataEntrega) {
      alert('Selecione a data de entrega')
      return
    }

    setSalvando(true)

    try {
      const { error } = await supabase
        .from('contratos')
        .update({
          status: 'finalizado',
          data_entrega: dataEntrega,
        } as never)
        .eq('id', contrato.id)

      if (error) throw error

      onSuccess?.({ id: contrato.id, status: 'finalizado', data_entrega: dataEntrega })
      onClose()
    } catch (err) {
      console.error('Erro ao marcar entregue:', err)
      alert('Erro ao marcar entregue. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-2"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-2xl w-full max-w-sm shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header com toggle de data */}
        <div className="flex items-center justify-between p-3 border-b bg-gradient-to-r from-emerald-600 to-green-600 rounded-t-2xl">
          <div className="flex items-center gap-2 text-white">
            <span className="text-lg">📬</span>
            <h3 className="font-semibold">Marcar Entregue</h3>
          </div>
          <div className="flex items-center gap-2">
            {/* Data: Hoje ou Outra */}
            <div className="flex items-center gap-1 bg-white/10 rounded px-1">
              <button
                type="button"
                onClick={() => setEntregaForm({ dataHoje: true, data_entrega: '' })}
                className={`px-2 py-0.5 rounded text-xs transition-colors ${
                  entregaForm.dataHoje
                    ? 'bg-slate-700 text-green-400 font-medium'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                Hoje
              </button>
              {!entregaForm.dataHoje ? (
                <input
                  type="date"
                  value={entregaForm.data_entrega}
                  onChange={(e) => setEntregaForm({ ...entregaForm, data_entrega: e.target.value })}
                  onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                  className="px-1 py-0.5 rounded text-xs text-slate-300 w-28 bg-slate-700 cursor-pointer"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEntregaForm({
                    dataHoje: false,
                    data_entrega: new Date().toISOString().split('T')[0]
                  })}
                  className="px-2 py-0.5 rounded text-xs text-white/70 hover:text-white transition-colors"
                >
                  Outra
                </button>
              )}
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white ml-1">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Corpo */}
        <div className="p-4 space-y-3">
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-200">{contrato.pet_nome}</p>
            <p className="text-sm text-slate-400">
              {contrato.tutor?.nome || contrato.tutor_nome} &middot; {contrato.codigo}
            </p>
            <div className="mt-2 inline-flex items-center gap-1.5">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                contrato.status === 'retorno'
                  ? 'bg-cyan-900/40 text-cyan-300'
                  : 'bg-purple-900/40 text-purple-300'
              }`}>
                {contrato.status === 'retorno' ? '🛍️ Retorno' : '👀 Pendente'}
              </span>
              <span className="text-slate-400 text-xs">→</span>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-300">✅ Finalizado</span>
            </div>
          </div>

          {/* Botoes */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 px-4 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700 text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={confirmarEntrega}
              disabled={salvando || (!entregaForm.dataHoje && !entregaForm.data_entrega)}
              className="flex-1 py-2.5 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"
            >
              {salvando ? 'Salvando...' : 'Confirmar Entrega'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
