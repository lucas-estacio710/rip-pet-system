'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'

type ContratoMinimal = {
  id: string
  pet_nome: string
  pet_genero: string | null
  tutor_nome: string
  tutor_telefone?: string | null
  tutor?: { nome: string; telefone: string | null } | null
}

type Props = {
  isOpen: boolean
  onClose: () => void
  contrato: ContratoMinimal
}

type TutorEntry = {
  titulo: 'Sr.' | 'Sra.'
  nome: string
}

type FormState = {
  tutores: TutorEntry[]
  petNome: string
  petGenero: 'M' | 'F'
  velorio: 'sim' | 'nao'
  velorioTexto: string
  dataEncaminhamento: string
  dataCremacao: string
  contatoMatriz: 'proxima' | 'semana'
  preRescaldo: boolean
}

// ─── Helpers ────────────────────────────────────────────────

const PREFIXOS_NOME_COMPOSTO = [
  'maria', 'ana', 'anna', 'rosa', 'joao', 'joão',
  'jose', 'josé', 'pedro', 'luiz', 'luis', 'luís',
  'carlos', 'marco',
]

function capitalizarNome(nome: string): string {
  if (!nome) return ''
  return nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase()
}

function getPrimeiroNome(nomeCompleto: string): string {
  const partes = nomeCompleto.trim().split(/\s+/)
  if (partes.length === 0) return ''

  const primeiro = partes[0]
  const primeiroLower = primeiro.toLowerCase()

  if (partes.length > 1 && PREFIXOS_NOME_COMPOSTO.includes(primeiroLower)) {
    return `${capitalizarNome(partes[0])} ${capitalizarNome(partes[1])}`
  }

  return capitalizarNome(primeiro)
}

const mesesCurtos = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function formatDataCurta(date: Date): string {
  const dia = date.getDate().toString().padStart(2, '0')
  const mes = mesesCurtos[date.getMonth()]
  return `${dia}/${mes}`
}

function getDiaPreset(diaSemana: 'sab' | 'dom', proximo: boolean): Date {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const dow = hoje.getDay() // 0=dom, 6=sab
  const alvo = diaSemana === 'sab' ? 6 : 0

  let diff = alvo - dow
  if (diff < 0) diff += 7
  if (diff === 0 && proximo) diff = 7
  if (proximo && diff > 0 && diff < 7) diff += 7

  const result = new Date(hoje)
  result.setDate(result.getDate() + diff)
  return result
}

function getNomeDiaSemana(date: Date): string {
  const nomes = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
  return nomes[date.getDay()]
}

function presetDatasChegamos(
  tipo: 'este-sab' | 'este-dom' | 'prox-sab' | 'prox-dom'
): { dataEncaminhamento: string; dataCremacao: string } {
  const isProximo = tipo.startsWith('prox')
  const diaSemana = tipo.endsWith('sab') ? 'sab' : 'dom'

  const encaminhamentoDate = getDiaPreset(diaSemana, isProximo)

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const diffDias = Math.round((encaminhamentoDate.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))

  let prefixoEnc: string
  if (diffDias === 0) {
    prefixoEnc = 'hoje'
  } else if (diffDias === 1) {
    prefixoEnc = 'amanhã'
  } else if (isProximo) {
    prefixoEnc = diaSemana === 'sab' ? 'próximo sábado' : 'próximo domingo'
  } else {
    prefixoEnc = diaSemana === 'sab' ? 'neste sábado' : 'neste domingo'
  }

  const dataEncaminhamento = `${prefixoEnc} (${formatDataCurta(encaminhamentoDate)})`

  // Cremação: terça e quarta após o encaminhamento
  // sábado: +3 = terça, +4 = quarta
  // domingo: +2 = terça, +3 = quarta
  const offsetTerca = diaSemana === 'sab' ? 3 : 2
  const offsetQuarta = diaSemana === 'sab' ? 4 : 3

  const tercaDate = new Date(encaminhamentoDate)
  tercaDate.setDate(tercaDate.getDate() + offsetTerca)
  const quartaDate = new Date(encaminhamentoDate)
  quartaDate.setDate(quartaDate.getDate() + offsetQuarta)

  const dataCremacao = `terça (${formatDataCurta(tercaDate)}) e quarta (${formatDataCurta(quartaDate)})`

  return { dataEncaminhamento, dataCremacao }
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55')) return digits
  return `55${digits}`
}

// ─── Component ──────────────────────────────────────────────

export default function ChegamosModal({ isOpen, onClose, contrato }: Props) {
  const [form, setForm] = useState<FormState>({
    tutores: [{ titulo: 'Sra.', nome: '' }],
    petNome: '',
    petGenero: 'F',
    velorio: 'nao',
    velorioTexto: '',
    dataEncaminhamento: '',
    dataCremacao: '',
    contatoMatriz: 'proxima',
    preRescaldo: false,
  })
  const [preview, setPreview] = useState('')

  const tutorNomeCompleto = contrato.tutor?.nome || contrato.tutor_nome || ''
  const tutorTelefone = contrato.tutor?.telefone || contrato.tutor_telefone || null

  // Initialize form when modal opens
  useEffect(() => {
    if (!isOpen) return

    setForm({
      tutores: [{ titulo: 'Sra.', nome: getPrimeiroNome(tutorNomeCompleto) }],
      petNome: capitalizarNome(contrato.pet_nome || ''),
      petGenero: contrato.pet_genero === 'macho' ? 'M' : 'F',
      velorio: 'nao',
      velorioTexto: '',
      dataEncaminhamento: '',
      dataCremacao: '',
      contatoMatriz: 'proxima',
      preRescaldo: false,
    })
    setPreview('')

    // Auto-preset "este-sab" after mount
    const timer = setTimeout(() => {
      const preset = presetDatasChegamos('este-sab')
      setForm(f => ({
        ...f,
        dataEncaminhamento: preset.dataEncaminhamento,
        dataCremacao: preset.dataCremacao,
      }))
    }, 50)

    return () => clearTimeout(timer)
  }, [isOpen, tutorNomeCompleto, contrato.pet_nome, contrato.pet_genero])

  // ─── Pronoun logic ──────────────────────────────────────

  const getPronomes = useCallback(() => {
    const { tutores } = form

    if (tutores.length === 1) {
      if (tutores[0].titulo === 'Sra.') {
        return { artigo: 'a', dele: 'dela', informado: 'informada' }
      }
      return { artigo: 'o', dele: 'dele', informado: 'informado' }
    }

    // Multiple tutors
    const todosF = tutores.every(t => t.titulo === 'Sra.')
    if (todosF) {
      return { artigo: 'as', dele: 'dela', informado: 'informadas' }
    }
    return { artigo: 'os', dele: 'dele', informado: 'informados' }
  }, [form])

  // ─── Tutor text builder ─────────────────────────────────

  const getTutorTexto = useCallback(() => {
    const { tutores } = form
    if (tutores.length === 1) {
      return `${tutores[0].titulo} ${tutores[0].nome}`
    }
    // Multiple: "Sr. João e Sra. Maria"
    const nomes = tutores.map(t => `${t.titulo} ${t.nome}`)
    if (nomes.length === 2) {
      return `${nomes[0]} e ${nomes[1]}`
    }
    return nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1]
  }, [form])

  // ─── Message generator ─────────────────────────────────

  const gerarMensagem = useCallback((): string => {
    const { petNome, petGenero, velorio, velorioTexto, dataEncaminhamento, dataCremacao, contatoMatriz, preRescaldo } = form
    const pronomes = getPronomes()
    const tutorTexto = getTutorTexto()

    const artigo = petGenero === 'F' ? 'a' : 'o'
    const dele = petGenero === 'F' ? 'dela' : 'dele'

    let msg = `${tutorTexto}, já estamos com ${artigo} ${petNome} em nossa unidade.\n\n`
    msg += `Vamos cuidar ${dele} com todo carinho, respeito e muito amor!`

    if (velorio === 'sim') {
      msg += `\n\nNossa equipe que cuida das despedidas presenciais irá entrar em contato ${velorioTexto} para agendar o velório em nossa unidade. Caso queira enviar preferências de dia/período, já deixarei anotado.`
    }

    if (dataEncaminhamento && dataCremacao) {
      msg += `\n\nO encaminhamento será feito no ${dataEncaminhamento}, e a cremação ocorrerá entre ${dataCremacao}.`
    }

    const contatoTexto = contatoMatriz === 'proxima'
      ? 'Na próxima segunda'
      : 'Na semana de cremação'

    msg += `\n\n${contatoTexto}, nossa equipe da Matriz entrará em contato para agendar o dia/horário, explicar e confirmar a escolha do acompanhamento.`

    if (preRescaldo) {
      msg += `\n\n(Caso queira que eu envie as recordações personalizadas que podemos preparar, é só me avisar)`
    }

    msg += `\n\nNós ${pronomes.artigo} manteremos ${pronomes.informado} de todo processo e qualquer dúvida, basta nos chamar por aqui.`

    msg += `\n\nNovamente, nossos sinceros sentimentos \u{1F64F}\u{1F614}`

    return msg
  }, [form, getPronomes, getTutorTexto])

  // ─── Actions ────────────────────────────────────────────

  function handlePreview() {
    setPreview(prev => prev ? '' : gerarMensagem())
  }

  async function copiar() {
    const msg = gerarMensagem()
    try {
      await navigator.clipboard.writeText(msg)
      setPreview(msg)
    } catch {
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

  // ─── Tutor list management ─────────────────────────────

  function addTutor() {
    setForm(f => ({
      ...f,
      tutores: [...f.tutores, { titulo: 'Sr.', nome: '' }],
    }))
  }

  function removeTutor(index: number) {
    if (form.tutores.length <= 1) return
    setForm(f => ({
      ...f,
      tutores: f.tutores.filter((_, i) => i !== index),
    }))
  }

  function updateTutor(index: number, field: keyof TutorEntry, value: string) {
    setForm(f => ({
      ...f,
      tutores: f.tutores.map((t, i) =>
        i === index ? { ...t, [field]: value } : t
      ),
    }))
  }

  // ─── Preset buttons ────────────────────────────────────

  function applyPreset(tipo: 'este-sab' | 'este-dom' | 'prox-sab' | 'prox-dom') {
    const preset = presetDatasChegamos(tipo)
    setForm(f => ({
      ...f,
      dataEncaminhamento: preset.dataEncaminhamento,
      dataCremacao: preset.dataCremacao,
    }))
  }

  // Determine which preset is active based on current form values
  function isPresetActive(tipo: 'este-sab' | 'este-dom' | 'prox-sab' | 'prox-dom'): boolean {
    const preset = presetDatasChegamos(tipo)
    return form.dataEncaminhamento === preset.dataEncaminhamento && form.dataCremacao === preset.dataCremacao
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-xl w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* ─── Header (sticky) ─────────────────────────── */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-3 border-b border-slate-700 bg-green-900/30 rounded-t-xl">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-lg">{'\u{1F4E5}'}</span>
              <h3 className="font-semibold text-slate-100">Chegamos</h3>
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

        {/* ─── Body (scrollable) ───────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Tutores section */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Tutores</label>
            <div className="space-y-2">
              {form.tutores.map((tutor, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  {/* Sr./Sra. toggle */}
                  <div className="flex rounded-lg overflow-hidden border border-slate-600 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateTutor(idx, 'titulo', 'Sr.')}
                      className={`px-2.5 py-2 text-sm font-medium transition-colors ${
                        tutor.titulo === 'Sr.'
                          ? 'bg-blue-600/30 text-blue-300 border-r border-blue-500/50'
                          : 'text-slate-400 hover:text-slate-300 border-r border-slate-600'
                      }`}
                    >
                      Sr.
                    </button>
                    <button
                      type="button"
                      onClick={() => updateTutor(idx, 'titulo', 'Sra.')}
                      className={`px-2.5 py-2 text-sm font-medium transition-colors ${
                        tutor.titulo === 'Sra.'
                          ? 'bg-pink-600/30 text-pink-300'
                          : 'text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      Sra.
                    </button>
                  </div>

                  {/* Name input */}
                  <input
                    type="text"
                    value={tutor.nome}
                    onChange={e => updateTutor(idx, 'nome', e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-slate-500"
                    placeholder="Nome"
                  />

                  {/* Remove button (not for first tutor) */}
                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() => removeTutor(idx)}
                      className="p-2 text-slate-500 hover:text-red-400 transition-colors shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={addTutor}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-300 transition-colors mt-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar tutor
              </button>
            </div>
          </div>

          {/* Pet section */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Pet</label>
            <div className="flex gap-2">
              {/* Gender toggle */}
              <div className="flex rounded-lg overflow-hidden border border-slate-600 shrink-0">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, petGenero: 'M' }))}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    form.petGenero === 'M'
                      ? 'bg-blue-600/30 text-blue-300 border-r border-blue-500/50'
                      : 'text-slate-400 hover:text-slate-300 border-r border-slate-600'
                  }`}
                >
                  M
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, petGenero: 'F' }))}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    form.petGenero === 'F'
                      ? 'bg-pink-600/30 text-pink-300'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  F
                </button>
              </div>

              {/* Pet name input */}
              <input
                type="text"
                value={form.petNome}
                onChange={e => setForm(f => ({ ...f, petNome: e.target.value }))}
                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-slate-500"
                placeholder="Nome do pet"
              />
            </div>
          </div>

          {/* Velorio section */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Velorio</label>
            <div className="flex rounded-lg overflow-hidden border border-slate-600">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, velorio: 'nao', velorioTexto: '' }))}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  form.velorio === 'nao'
                    ? 'bg-slate-600/50 text-slate-200'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Sem velorio
              </button>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, velorio: 'sim' }))}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors border-l ${
                  form.velorio === 'sim'
                    ? 'bg-purple-600/30 text-purple-300 border-purple-500/50'
                    : 'text-slate-400 hover:text-slate-300 border-slate-600'
                }`}
              >
                {'\u{1F56F}'} Com velorio
              </button>
            </div>
            {form.velorio === 'sim' && (
              <input
                type="text"
                value={form.velorioTexto}
                onChange={e => setForm(f => ({ ...f, velorioTexto: e.target.value }))}
                className="mt-2 w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-slate-500"
                placeholder="Ex: ainda hoje, amanhã, nos próximos dias..."
              />
            )}
          </div>

          {/* Datas section */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Datas</label>

            {/* Preset buttons */}
            <div className="flex gap-1.5 mb-2 flex-wrap">
              {([
                ['este-sab', 'Este Sab'],
                ['este-dom', 'Este Dom'],
                ['prox-sab', 'Prox Sab'],
                ['prox-dom', 'Prox Dom'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    isPresetActive(key)
                      ? 'bg-green-600/30 text-green-300 border-green-500/50'
                      : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600 hover:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Manual text inputs */}
            <div className="space-y-2">
              <input
                type="text"
                value={form.dataEncaminhamento}
                onChange={e => setForm(f => ({ ...f, dataEncaminhamento: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-slate-500"
                placeholder="Encaminhamento (ex: neste sabado (18/jan))"
              />
              <input
                type="text"
                value={form.dataCremacao}
                onChange={e => setForm(f => ({ ...f, dataCremacao: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-slate-500"
                placeholder="Cremacao (ex: terca (21/jan) e quarta (22/jan))"
              />
            </div>
          </div>

          {/* Contato Matriz section */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Contato Matriz</label>
            <div className="flex rounded-lg overflow-hidden border border-slate-600">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, contatoMatriz: 'proxima' }))}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  form.contatoMatriz === 'proxima'
                    ? 'bg-green-600/30 text-green-300 border-r border-green-500/50'
                    : 'text-slate-400 hover:text-slate-300 border-r border-slate-600'
                }`}
              >
                Na proxima segunda
              </button>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, contatoMatriz: 'semana' }))}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  form.contatoMatriz === 'semana'
                    ? 'bg-green-600/30 text-green-300'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Na semana de cremacao
              </button>
            </div>
          </div>

          {/* Pre-Rescaldo checkbox */}
          <label className="flex items-center gap-3 cursor-pointer group">
            <div
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                form.preRescaldo
                  ? 'bg-amber-600 border-amber-500'
                  : 'bg-slate-700 border-slate-500 group-hover:border-slate-400'
              }`}
            >
              {form.preRescaldo && (
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <input
              type="checkbox"
              checked={form.preRescaldo}
              onChange={e => setForm(f => ({ ...f, preRescaldo: e.target.checked }))}
              className="sr-only"
            />
            <span className={`text-sm transition-colors ${
              form.preRescaldo ? 'text-amber-300' : 'text-slate-300'
            }`}>
              Pre-Rescaldo (mencionar recordacoes)
            </span>
          </label>

          {/* Preview area */}
          {preview && (
            <div className="bg-slate-700 rounded-lg p-3 max-h-52 overflow-y-auto">
              <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                {preview}
              </p>
            </div>
          )}
        </div>

        {/* ─── Footer (sticky) ─────────────────────────── */}
        <div className="sticky bottom-0 p-3 border-t border-slate-700 bg-slate-700/50 rounded-b-xl space-y-2">
          {/* Row 1: Preview + Copiar */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePreview}
              className="flex-1 py-2 px-3 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-600 text-sm transition-colors"
            >
              {'\u{1F441}'} Preview
            </button>
            <button
              type="button"
              onClick={copiar}
              className="flex-1 py-2 px-3 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-600 text-sm transition-colors"
            >
              {'\u{1F4CB}'} Copiar
            </button>
          </div>

          {/* Row 2: Enviar WhatsApp */}
          <button
            type="button"
            onClick={enviarWhatsapp}
            disabled={!tutorTelefone}
            className="w-full py-2.5 px-4 bg-[#25D366] text-white rounded-lg hover:bg-[#20BD5A] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            {'\u{1F4AC}'} Enviar no WhatsApp
          </button>
        </div>
      </div>
    </div>
  )
}
