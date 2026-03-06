'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type ContratoMinimal = {
  id: string
  codigo: string
  pet_nome: string
  tutor_nome: string
  tutor?: { nome: string } | null
}

type Props = {
  isOpen: boolean
  onClose: () => void
  contrato: ContratoMinimal
  onSuccess?: (updated: {
    id: string
    status: string
    data_acolhimento: string
    local_coleta: string
    numero_lacre: string | null
  }) => void
}

export default function AtivarModal({ isOpen, onClose, contrato, onSuccess }: Props) {
  const supabase = createClient()

  const [form, setForm] = useState({
    data_acolhimento: '',
    hora_acolhimento: '',
    local_coleta: 'Residência' as 'Residência' | 'Unidade' | 'Clínica',
    clinica_coleta: '',
    numero_lacre: '',
    funcionario_id: '',
    supinda_id: '',
  })
  const [salvando, setSalvando] = useState(false)
  const [funcionarios, setFuncionarios] = useState<{ id: string; nome: string }[]>([])
  const [supindas, setSupindas] = useState<{ id: string; numero: number; data: string }[]>([])

  // On open: reset form with current date/time and load auxiliary data
  useEffect(() => {
    if (!isOpen) return

    const agora = new Date()
    const dataStr = agora.toISOString().split('T')[0]
    const horaStr = agora.toTimeString().slice(0, 5)

    setForm({
      data_acolhimento: dataStr,
      hora_acolhimento: horaStr,
      local_coleta: 'Residência',
      clinica_coleta: '',
      numero_lacre: '',
      funcionario_id: '',
      supinda_id: '',
    })

    // Load funcionarios
    supabase
      .from('funcionarios')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => {
        if (data) setFuncionarios(data)
      })

    // Load supindas
    supabase
      .from('supindas')
      .select('id, numero, data')
      .order('numero', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) setSupindas(data)
      })
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  function subtrairTempo(tipo: 'dia' | 'hora') {
    const dataHora = new Date(`${form.data_acolhimento}T${form.hora_acolhimento}:00`)
    if (tipo === 'dia') {
      dataHora.setDate(dataHora.getDate() - 1)
    } else {
      dataHora.setHours(dataHora.getHours() - 1)
    }
    const dataStr = dataHora.toISOString().split('T')[0]
    const horaStr = dataHora.toTimeString().slice(0, 5)
    setForm({ ...form, data_acolhimento: dataStr, hora_acolhimento: horaStr })
  }

  async function salvarAtivacao() {
    if (!form.data_acolhimento || !form.hora_acolhimento) {
      alert('Preencha a data e hora do acolhimento')
      return
    }

    setSalvando(true)

    try {
      // Combine date + time into ISO datetime
      const dataHora = new Date(`${form.data_acolhimento}T${form.hora_acolhimento}:00`)

      const { error } = await supabase
        .from('contratos')
        .update({
          status: 'ativo',
          data_acolhimento: dataHora.toISOString(),
          local_coleta: form.local_coleta,
          clinica_coleta: form.local_coleta === 'Clínica' ? form.clinica_coleta : null,
          numero_lacre: form.numero_lacre || null,
          funcionario_id: form.funcionario_id || null,
          supinda_id: form.supinda_id || null,
        } as never)
        .eq('id', contrato.id)

      if (error) throw error

      onSuccess?.({
        id: contrato.id,
        status: 'ativo',
        data_acolhimento: dataHora.toISOString(),
        local_coleta: form.local_coleta,
        numero_lacre: form.numero_lacre || null,
      })

      onClose()
    } catch (err) {
      console.error('Erro ao ativar contrato:', err)
      alert('Erro ao ativar contrato. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-xl shadow-xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-red-900/30 rounded-t-xl">
          <div className="flex items-center gap-2">
            <span className="text-2xl">✝️</span>
            <div>
              <h3 className="font-bold text-slate-200">Ativar Contrato</h3>
              <p className="text-sm text-slate-400">
                {contrato.pet_nome} &middot; {contrato.tutor?.nome || contrato.tutor_nome}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-red-900/30 rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Data e Hora com botoes de subtracao */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-300">
                Data e Hora do Acolhimento
              </label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => subtrairTempo('dia')}
                  className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-400 rounded transition-colors"
                >
                  -1 dia
                </button>
                <button
                  type="button"
                  onClick={() => subtrairTempo('hora')}
                  className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-400 rounded transition-colors"
                >
                  -1 hora
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                value={form.data_acolhimento}
                onChange={(e) => setForm({ ...form, data_acolhimento: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <input
                type="time"
                value={form.hora_acolhimento}
                onChange={(e) => setForm({ ...form, hora_acolhimento: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          {/* Local de Coleta */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Local de Coleta
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['Residência', 'Unidade', 'Clínica'] as const).map(local => (
                <button
                  key={local}
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      local_coleta: local,
                      clinica_coleta: local !== 'Clínica' ? '' : form.clinica_coleta,
                    })
                  }
                  className={`py-2 px-3 rounded-lg text-sm font-medium border-2 transition-all ${
                    form.local_coleta === local
                      ? 'border-red-500 bg-red-900/30 text-red-300'
                      : 'border-slate-600 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {local === 'Residência' && '🏠'}
                  {local === 'Unidade' && '🏢'}
                  {local === 'Clínica' && '🏥'}
                  {' '}{local}
                </button>
              ))}
            </div>
            {/* Campo nome da clinica */}
            {form.local_coleta === 'Clínica' && (
              <input
                type="text"
                value={form.clinica_coleta}
                onChange={(e) => setForm({ ...form, clinica_coleta: e.target.value })}
                placeholder="Nome da clínica..."
                className="w-full mt-2 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                autoFocus
              />
            )}
          </div>

          {/* Funcionario e Supinda */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Responsável
              </label>
              <select
                value={form.funcionario_id}
                onChange={(e) => setForm({ ...form, funcionario_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-slate-700"
              >
                <option value="">Selecione...</option>
                {funcionarios.map(f => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Supinda
              </label>
              <select
                value={form.supinda_id}
                onChange={(e) => setForm({ ...form, supinda_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-slate-700"
              >
                <option value="">Selecione...</option>
                {supindas.map(s => (
                  <option key={s.id} value={s.id}>
                    #{s.numero} - {new Date(s.data).toLocaleDateString('pt-BR')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Numero do Lacre */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Número do Lacre <span className="text-slate-400">(opcional)</span>
            </label>
            <input
              type="text"
              value={form.numero_lacre}
              onChange={(e) => setForm({ ...form, numero_lacre: e.target.value })}
              placeholder="Ex: L12345"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t bg-slate-700/50 rounded-b-xl">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={salvarAtivacao}
            disabled={salvando || !form.data_acolhimento || !form.hora_acolhimento}
            className="flex-1 py-2 px-4 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {salvando ? (
              <>
                <span className="animate-spin">⏳</span>
                Ativando...
              </>
            ) : (
              <>
                <span>✝️</span>
                Ativar Contrato
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
