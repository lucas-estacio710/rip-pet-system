'use client'

import { useState, useEffect } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type ContratoMinimal = {
  id: string
  codigo: string
  pet_nome: string
  tutor_nome: string
  tutor?: { nome: string } | null
  certificado_nome_1: string | null
  certificado_nome_2: string | null
  certificado_nome_3: string | null
  certificado_nome_4: string | null
  certificado_nome_5: string | null
  certificado_confirmado: boolean | null
}

type Props = {
  isOpen: boolean
  onClose: () => void
  contrato: ContratoMinimal
  onSuccess?: (updated: {
    id: string
    certificado_nome_1: string | null
    certificado_nome_2: string | null
    certificado_nome_3: string | null
    certificado_nome_4: string | null
    certificado_nome_5: string | null
    certificado_confirmado: true
  }) => void
}

export default function CertificadoModal({ isOpen, onClose, contrato, onSuccess }: Props) {
  const [certificadoNomes, setCertificadoNomes] = useState<string[]>(['', '', '', '', ''])
  const [certificadoTextoColado, setCertificadoTextoColado] = useState('')
  const [salvando, setSalvando] = useState(false)

  const supabase = createClient()

  // On open: fill names from contrato or default tutor name in first slot
  useEffect(() => {
    if (!isOpen) return

    const nomes = [
      contrato.certificado_nome_1 || '',
      contrato.certificado_nome_2 || '',
      contrato.certificado_nome_3 || '',
      contrato.certificado_nome_4 || '',
      contrato.certificado_nome_5 || '',
    ]

    // Se nenhum nome definido, colocar o tutor principal no primeiro campo
    if (!nomes.some(n => n.trim())) {
      const tutorNome = contrato.tutor?.nome || contrato.tutor_nome || ''
      nomes[0] = tutorNome.toUpperCase()
    }

    setCertificadoNomes(nomes)
    setCertificadoTextoColado('')
  }, [isOpen, contrato])

  // Colar texto do clipboard para area de trabalho
  async function colarTextoClipboard() {
    try {
      const texto = await navigator.clipboard.readText()
      setCertificadoTextoColado(texto)
    } catch (err) {
      console.error('Erro ao acessar clipboard:', err)
      alert('Nao foi possivel acessar a area de transferencia')
    }
  }

  // Adicionar texto selecionado (ou todo o texto) ao proximo campo vazio
  function adicionarNomeAoProximoVazio() {
    const selecao = window.getSelection()?.toString().trim()
    const texto = selecao || certificadoTextoColado.trim()

    if (!texto) {
      alert('Selecione um texto ou cole algo primeiro')
      return
    }

    const indiceVazio = certificadoNomes.findIndex(n => !n.trim())
    if (indiceVazio === -1) {
      alert('Todos os campos ja estao preenchidos')
      return
    }

    const novos = [...certificadoNomes]
    novos[indiceVazio] = texto.toUpperCase()
    setCertificadoNomes(novos)
  }

  // Mover nome para cima
  function moverTutorCima(index: number) {
    if (index <= 0) return
    const novos = [...certificadoNomes]
    const temp = novos[index - 1]
    novos[index - 1] = novos[index]
    novos[index] = temp
    setCertificadoNomes(novos)
  }

  // Mover nome para baixo
  function moverTutorBaixo(index: number) {
    if (index >= certificadoNomes.length - 1) return
    const novos = [...certificadoNomes]
    const temp = novos[index + 1]
    novos[index + 1] = novos[index]
    novos[index] = temp
    setCertificadoNomes(novos)
  }

  // Salvar no Supabase
  async function salvarCertificado() {
    setSalvando(true)

    try {
      const nomesUpper = certificadoNomes.map(n => n.trim().toUpperCase())

      const { error } = await supabase
        .from('contratos')
        .update({
          certificado_nome_1: nomesUpper[0] || null,
          certificado_nome_2: nomesUpper[1] || null,
          certificado_nome_3: nomesUpper[2] || null,
          certificado_nome_4: nomesUpper[3] || null,
          certificado_nome_5: nomesUpper[4] || null,
          certificado_confirmado: true,
        } as never)
        .eq('id', contrato.id)

      if (error) throw error

      onSuccess?.({
        id: contrato.id,
        certificado_nome_1: nomesUpper[0] || null,
        certificado_nome_2: nomesUpper[1] || null,
        certificado_nome_3: nomesUpper[2] || null,
        certificado_nome_4: nomesUpper[3] || null,
        certificado_nome_5: nomesUpper[4] || null,
        certificado_confirmado: true,
      })

      onClose()
    } catch (err) {
      console.error('Erro ao salvar certificado:', err)
      alert('Erro ao salvar. Tente novamente.')
    }

    setSalvando(false)
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-200">
            📜 Nomes para Certificado
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {/* Pet info */}
        <p className="text-sm text-slate-400 mb-4">
          <strong>{contrato.pet_nome}</strong> - {contrato.codigo}
        </p>

        {/* Area para colar texto do WhatsApp */}
        <div className="bg-slate-700/50 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">
              📋 Area de trabalho
            </span>
            <div className="flex gap-1">
              <button
                onClick={colarTextoClipboard}
                className="px-2 py-1 text-xs bg-slate-600 hover:bg-slate-500 rounded transition-colors"
                title="Colar da area de transferencia"
              >
                📋 Colar
              </button>
              <button
                onClick={adicionarNomeAoProximoVazio}
                className="px-2 py-1 text-xs bg-purple-900/40 hover:bg-purple-900/50 text-purple-300 rounded transition-colors font-medium"
                title="Selecione um texto e clique para adicionar ao proximo campo vazio"
              >
                ➕ Adicionar seleção
              </button>
            </div>
          </div>
          <textarea
            value={certificadoTextoColado}
            onChange={(e) => setCertificadoTextoColado(e.target.value)}
            placeholder="Cole aqui a mensagem do WhatsApp. Depois selecione o nome e clique em 'Adicionar seleção'"
            className="w-full h-20 px-2 py-1.5 text-xs border border-slate-600 rounded resize-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
          />
          <p className="text-[10px] text-slate-400 mt-1">
            💡 Selecione o nome na area acima e clique em &quot;Adicionar seleção&quot; para inserir no proximo campo vazio
          </p>
        </div>

        {/* Hint */}
        <p className="text-xs text-slate-400 mb-2">
          Os nomes serão salvos em MAIÚSCULAS. Use as setas para reordenar.
        </p>

        {/* 5 input fields */}
        <div className="space-y-2 mb-4">
          {certificadoNomes.map((nome, index) => (
            <div key={index} className="flex items-center gap-1">
              <span className="text-xs text-slate-400 w-4">{index + 1}.</span>
              <input
                type="text"
                value={nome}
                onChange={(e) => {
                  const novos = [...certificadoNomes]
                  novos[index] = e.target.value.toUpperCase()
                  setCertificadoNomes(novos)
                }}
                placeholder={index === 0 ? 'Tutor principal' : `Nome ${index + 1} (opcional)`}
                className="flex-1 px-3 py-2 border border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 uppercase"
                style={{ textTransform: 'uppercase' }}
              />
              <div className="flex flex-col">
                <button
                  onClick={() => moverTutorCima(index)}
                  disabled={index === 0 || !nome.trim()}
                  className="p-0.5 text-slate-400 hover:text-purple-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Mover para cima"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => moverTutorBaixo(index)}
                  disabled={index === certificadoNomes.length - 1 || !nome.trim()}
                  className="p-0.5 text-slate-400 hover:text-purple-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Mover para baixo"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              setCertificadoTextoColado('')
              onClose()
            }}
            className="flex-1 py-2 px-4 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={salvarCertificado}
            disabled={salvando}
            className="flex-1 py-2 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {salvando ? 'Salvando...' : '✅ Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
