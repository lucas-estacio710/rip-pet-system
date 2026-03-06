'use client'

import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'

type ContratoMinimal = {
  id: string
  pet_nome: string
  tutor_nome: string
  tutor_telefone?: string | null
  tutor?: { nome: string; telefone: string | null } | null
}

type Props = {
  isOpen: boolean
  onClose: () => void
  contrato: ContratoMinimal
}

type TutorTitulo = 'Sr.' | 'Sra.'
type Familia = 'sozinho' | 'familia'

type FormState = {
  tutorTitulo: TutorTitulo
  tutorNome: string
  familia: Familia
  comAvaliacao: boolean
}

// Compound first name prefixes - when the first name is one of these,
// include the second word as part of the name (e.g. "Maria Clara", "João Pedro")
const COMPOUND_PREFIXES = [
  'maria', 'ana', 'joão', 'jose', 'josé', 'pedro',
  'luiz', 'luis', 'luís', 'carlos', 'marco',
]

function getPrimeiroNome(nomeCompleto: string): string {
  const partes = nomeCompleto.trim().split(/\s+/)
  if (partes.length === 0) return ''

  const primeiro = partes[0]
  const primeiroLower = primeiro.toLowerCase()

  if (partes.length > 1 && COMPOUND_PREFIXES.includes(primeiroLower)) {
    const composto = `${capitalize(partes[0])} ${capitalize(partes[1])}`
    return composto
  }

  return capitalize(primeiro)
}

function capitalize(str: string): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55')) return digits
  return `55${digits}`
}

export default function FinalizadoraModal({ isOpen, onClose, contrato }: Props) {
  const [form, setForm] = useState<FormState>({
    tutorTitulo: 'Sra.',
    tutorNome: '',
    familia: 'familia',
    comAvaliacao: true,
  })
  const [preview, setPreview] = useState('')

  const tutorNomeCompleto = contrato.tutor?.nome || contrato.tutor_nome || ''
  const tutorTelefone = contrato.tutor?.telefone || contrato.tutor_telefone || null

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen) {
      setForm({
        tutorTitulo: 'Sra.',
        tutorNome: getPrimeiroNome(tutorNomeCompleto),
        familia: 'familia',
        comAvaliacao: true,
      })
      setPreview('')
    }
  }, [isOpen, tutorNomeCompleto])

  const gerarMensagem = useCallback((): string => {
    const { tutorTitulo, tutorNome, familia, comAvaliacao } = form

    const voces = familia === 'familia'
      ? 'vocês'
      : tutorTitulo === 'Sr.' ? 'o senhor' : 'a senhora'

    const precisarem = familia === 'familia' ? 'precisarem' : 'precisar'

    let msg = `${tutorTitulo} ${tutorNome},\n\n`
    msg += `Sabemos que não é um serviço desejado, mas esperamos ter trazido um pouco de acolhimento e conforto nesse momento delicado para ${voces}.\n\n`
    msg += `Estamos por aqui sempre, para o que ${precisarem}. \u{1F91D}\n\n`
    msg += `Um abraço de toda equipe R.I.P. Pet Crematório de Animais \u{1FA75}`

    if (comAvaliacao) {
      msg += `\n\nAbaixo está o link de avaliação do Google, caso se sintam confortáveis em nos avaliar. É bem rápido e nos ajuda muito a alcançar mais tutores especiais como ${voces} que também precisem do nosso serviço. \u{1F64F}\n\n`
      msg += `https://g.page/r/CfzJmq1OqJPDEBI/review\n\n`
      msg += `Gratidão eterna!\n\u{1F43E}`
    } else {
      msg += `\n\nGratidão eterna!\n\u{1F43E}`
    }

    return msg
  }, [form])

  function handlePreview() {
    setPreview(gerarMensagem())
  }

  async function copiar() {
    const msg = gerarMensagem()
    try {
      await navigator.clipboard.writeText(msg)
      setPreview(msg)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = msg
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setPreview(msg)
    }
  }

  function enviarWhatsapp() {
    if (!tutorTelefone) return
    const phone = formatPhone(tutorTelefone)
    const msg = gerarMensagem()
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank')
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-xl w-full max-w-md shadow-xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-emerald-900/30 rounded-t-xl">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-lg">{'\u2B50'}</span>
              <h3 className="font-semibold text-slate-100">Finalizadora</h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 ml-7">
              {contrato.pet_nome} &middot; {contrato.tutor?.nome || contrato.tutor_nome}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Tutor: titulo toggle + nome input */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Tutor</label>
            <div className="flex gap-2">
              <div className="flex rounded-lg overflow-hidden border border-slate-600 shrink-0">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, tutorTitulo: 'Sr.' }))}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    form.tutorTitulo === 'Sr.'
                      ? 'bg-blue-600/30 text-blue-300 border-r border-blue-500/50'
                      : 'text-slate-400 hover:text-slate-300 border-r border-slate-600'
                  }`}
                >
                  Sr.
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, tutorTitulo: 'Sra.' }))}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    form.tutorTitulo === 'Sra.'
                      ? 'bg-pink-600/30 text-pink-300'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  Sra.
                </button>
              </div>
              <input
                type="text"
                value={form.tutorNome}
                onChange={e => setForm(f => ({ ...f, tutorNome: e.target.value }))}
                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-slate-500"
                placeholder="Nome do tutor"
              />
            </div>
          </div>

          {/* Contexto: familia toggle */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Contexto</label>
            <div className="flex rounded-lg overflow-hidden border border-slate-600">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, familia: 'familia' }))}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  form.familia === 'familia'
                    ? 'bg-emerald-600/30 text-emerald-300'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                {'\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67'} Com fam\u00edlia
              </button>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, familia: 'sozinho' }))}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors border-l ${
                  form.familia === 'sozinho'
                    ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/50'
                    : 'text-slate-400 hover:text-slate-300 border-slate-600'
                }`}
              >
                {'\uD83E\uDDD1'} Singular
              </button>
            </div>
          </div>

          {/* Avaliacao Google toggle */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Avalia\u00e7\u00e3o Google</label>
            <div className="flex rounded-lg overflow-hidden border border-slate-600">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, comAvaliacao: true }))}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  form.comAvaliacao
                    ? 'bg-amber-600/30 text-amber-300'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                {'\u2B50'} Com avalia\u00e7\u00e3o
              </button>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, comAvaliacao: false }))}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors border-l ${
                  !form.comAvaliacao
                    ? 'bg-slate-600/30 text-slate-300 border-slate-500/50'
                    : 'text-slate-400 hover:text-slate-300 border-slate-600'
                }`}
              >
                Sem avalia\u00e7\u00e3o
              </button>
            </div>
          </div>

          {/* Preview area */}
          {preview && (
            <div className="bg-slate-700 rounded-lg p-3 max-h-48 overflow-y-auto">
              <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                {preview}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-700 bg-slate-700/50 rounded-b-xl space-y-2">
          {/* Row 1: Preview + Copiar */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePreview}
              className="flex-1 py-2 px-3 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-600 text-sm transition-colors"
            >
              {'\uD83D\uDC41'} Preview
            </button>
            <button
              type="button"
              onClick={copiar}
              className="flex-1 py-2 px-3 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-600 text-sm transition-colors"
            >
              {'\uD83D\uDCCB'} Copiar
            </button>
          </div>

          {/* Row 2: Enviar WhatsApp */}
          <button
            type="button"
            onClick={enviarWhatsapp}
            disabled={!tutorTelefone}
            className="w-full py-2.5 px-4 bg-[#25D366] text-white rounded-lg hover:bg-[#20BD5A] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            {'\uD83D\uDCAC'} Enviar no WhatsApp
          </button>
        </div>
      </div>
    </div>
  )
}
