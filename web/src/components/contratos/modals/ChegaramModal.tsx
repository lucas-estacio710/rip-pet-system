'use client'

import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'

type ContratoMinimal = {
  id: string
  pet_nome: string
  tipo_cremacao: string
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
type Tom = 'neutro' | 'acolhedor'
type Recebimento = 'entrega' | 'retirada' | 'digital'
type Status = 'ok' | 'atencao'
type StatusOk = 'com_itens' | 'basica'
type StatusAtencao = 'pelinho' | 'definir_itens'
type ItemTipo = 'fotinho' | 'modelo' | 'cor' | 'urninha'
type ItemArtigo = 'do' | 'da' | 'dos' | 'das'

type OutroTutor = {
  titulo: TutorTitulo
  nome: string
}

type ItemPendente = {
  tipo: ItemTipo
  artigo: ItemArtigo
  nome: string
}

type FormState = {
  tutorTitulo: TutorTitulo
  tutorNome: string
  outrosTutores: OutroTutor[]
  familia: Familia
  tom: Tom
  petNome: string
  recebimento: Recebimento
  status: Status
  statusOk: StatusOk
  statusAtencao: StatusAtencao
  outroEndereco: boolean
  itensRetirada: string
  itensPendentes: ItemPendente[]
}

// Compound first name prefixes - when the first name is one of these,
// include the second word as part of the name (e.g. "Maria Clara", "Joao Pedro")
const COMPOUND_PREFIXES = [
  'maria', 'ana', 'joao', 'jose', 'jose', 'pedro',
  'luiz', 'luis', 'luis', 'carlos', 'marco',
]

function capitalize(str: string): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

function getPrimeiroNome(nomeCompleto: string): string {
  const partes = nomeCompleto.trim().split(/\s+/)
  if (partes.length === 0) return ''

  const primeiro = partes[0]
  const primeiroLower = primeiro.toLowerCase()

  if (partes.length > 1 && COMPOUND_PREFIXES.includes(primeiroLower)) {
    return `${capitalize(partes[0])} ${capitalize(partes[1])}`
  }

  return capitalize(primeiro)
}

function capitalizarNome(nome: string): string {
  if (!nome) return ''
  return nome
    .trim()
    .split(/\s+/)
    .map(p => capitalize(p))
    .join(' ')
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55')) return digits
  return `55${digits}`
}

export default function ChegaramModal({ isOpen, onClose, contrato }: Props) {
  const [form, setForm] = useState<FormState>({
    tutorTitulo: 'Sra.',
    tutorNome: '',
    outrosTutores: [],
    familia: 'familia',
    tom: 'neutro',
    petNome: '',
    recebimento: 'entrega',
    status: 'ok',
    statusOk: 'com_itens',
    statusAtencao: 'definir_itens',
    outroEndereco: false,
    itensRetirada: '',
    itensPendentes: [],
  })
  const [preview, setPreview] = useState('')

  const tutorNomeCompleto = contrato.tutor?.nome || contrato.tutor_nome || ''
  const tutorTelefone = contrato.tutor?.telefone || contrato.tutor_telefone || null
  const isIndividual = contrato.tipo_cremacao === 'individual'
  const isColetiva = contrato.tipo_cremacao === 'coletiva'

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen) {
      setForm({
        tutorTitulo: 'Sra.',
        tutorNome: getPrimeiroNome(tutorNomeCompleto),
        outrosTutores: [],
        familia: 'familia',
        tom: 'neutro',
        petNome: capitalizarNome(contrato.pet_nome || ''),
        recebimento: 'entrega',
        status: 'ok',
        statusOk: 'com_itens',
        statusAtencao: 'definir_itens',
        outroEndereco: false,
        itensRetirada: '',
        itensPendentes: [],
      })
      setPreview('')
    }
  }, [isOpen, tutorNomeCompleto, contrato.pet_nome])

  const gerarMensagem = useCallback((): string => {
    const {
      tutorTitulo, tutorNome, outrosTutores, familia, tom,
      recebimento, status, statusOk, statusAtencao,
      outroEndereco, itensRetirada, itensPendentes,
    } = form

    // --- Saudacao ---
    let outrosTutoresTexto = ''
    if (outrosTutores.length > 0) {
      outrosTutoresTexto = ', ' + outrosTutores
        .filter(t => t.nome.trim())
        .map(t => `${t.titulo} ${t.nome}`)
        .join(', ')
    }

    let pronome: string
    let verboEstar: string
    if (familia === 'familia') {
      pronome = 'voces'
      verboEstar = 'estao'
    } else {
      pronome = tutorTitulo === 'Sr.' ? 'o senhor' : 'a senhora'
      verboEstar = 'esta'
    }

    // Use proper unicode characters for accented text
    const pronomeDisplay = familia === 'familia' ? 'voc\u00EAs' : pronome
    const verboEstarDisplay = familia === 'familia' ? 'est\u00E3o' : 'est\u00E1'

    let saudacao = `Oi, ${tutorTitulo} ${tutorNome}${outrosTutoresTexto}. Como ${pronomeDisplay} ${verboEstarDisplay}? Esperamos que`

    if (tom === 'neutro') {
      saudacao += ' bem \uD83D\uDE4F\uD83E\uDE75'
    } else {
      if (familia === 'familia') {
        saudacao += ' um pouquinho melhores \uD83D\uDE4F\uD83E\uDE75'
      } else {
        saudacao += ' um pouquinho melhor \uD83D\uDE4F\uD83E\uDE75'
      }
    }

    let msg = saudacao + '\n\n'

    // --- O que chegou ---
    const oQueChegou = isIndividual ? 'As cinzinhas j\u00E1 chegaram' : 'O certificado j\u00E1 chegou'

    // --- DIGITAL (only COL) ---
    if (recebimento === 'digital') {
      msg += `${oQueChegou} \u00E0 Santos. Vamos digitalizar entre hoje e amanh\u00E3 e enviamos por aqui em anexo.`
      return msg
    }

    // --- RETIRADA ---
    if (recebimento === 'retirada') {
      const retiradaTexto = itensRetirada.trim()
        ? `a retirada ${itensRetirada.trim()}`
        : 'a retirada'
      msg += `${oQueChegou} \u00E0 Santos. Voc\u00EAs gostariam de agendar ${retiradaTexto} aqui em nossa unidade nesta semana?\n\n(Se n\u00E3o estiver confort\u00E1vel ainda, n\u00E3o tem problema, n\u00F3s retornamos o contato na pr\u00F3xima semana).`
      return msg
    }

    // --- ENTREGA ---
    if (status === 'ok') {
      if (statusOk === 'com_itens') {
        const preparando = isIndividual
          ? 'Estamos preparando tudo com muito carinho e vamos'
          : 'Vamos preparar tudo com carinho e'

        let perguntaEndereco = 'Tem algum dia/hor\u00E1rio que n\u00E3o pode receber no endere\u00E7o de cadastro?'
        if (outroEndereco) {
          perguntaEndereco += ' Ou se tiver outro endere\u00E7o com maior disponibilidade, podemos nos adaptar'
        }

        msg += `${oQueChegou} \u00E0 Santos. ${preparando} organizar as nossas rotas de entrega pela semana.\n\n${perguntaEndereco}\n\n(Se n\u00E3o estiver confort\u00E1vel ainda para receber, n\u00E3o tem problema, n\u00F3s retornamos o contato na pr\u00F3xima semana).`
      } else {
        // basica
        let perguntaEndereco = 'Tem algum dia/hor\u00E1rio que n\u00E3o pode receber no endere\u00E7o de cadastro?'
        if (outroEndereco) {
          perguntaEndereco += ' Ou se tiver outro endere\u00E7o com maior disponibilidade, podemos nos adaptar'
        }

        msg += `${oQueChegou} \u00E0 Santos. Vamos organizar as nossas rotas de entrega pela semana.\n\n${perguntaEndereco}\n\n(Se n\u00E3o estiver confort\u00E1vel ainda para receber, n\u00E3o tem problema, n\u00F3s retornamos o contato na pr\u00F3xima semana).`
      }
    } else {
      // status === 'atencao'
      if (statusAtencao === 'pelinho') {
        msg += `${oQueChegou} \u00E0 Santos. Vamos organizar as nossas rotas de entrega pela semana.\n\nN\u00F3s fizemos uma recorda\u00E7\u00E3o com uma mechinha do pelinho em uma garrafinha delicada. Mas caso n\u00E3o se sinta confort\u00E1vel com ela, n\u00F3s podemos n\u00E3o entregar, podendo enviar o certificado digitalizado por aqui. Como for melhor.`
      } else {
        // definir_itens
        if (itensPendentes.length === 0) {
          msg += `${oQueChegou} \u00E0 Santos. Estamos preparando tudo com muito carinho para a entrega.`
          return msg
        }

        const conseguiu = familia === 'familia'
          ? 'Voc\u00EAs conseguiram'
          : tutorTitulo === 'Sr.'
            ? 'O senhor conseguiu'
            : 'A senhora conseguiu'

        // Build item list
        const itensTextoArr: string[] = []
        for (const item of itensPendentes) {
          const isPlural = item.artigo === 'dos' || item.artigo === 'das'
          if (item.tipo === 'urninha') {
            itensTextoArr.push(isPlural ? 'as urninhas' : 'a urninha')
          } else if (item.nome.trim()) {
            if (item.tipo === 'fotinho') {
              itensTextoArr.push(isPlural ? `as fotinhos ${item.artigo} ${item.nome}` : `a fotinho ${item.artigo} ${item.nome}`)
            } else if (item.tipo === 'modelo') {
              itensTextoArr.push(isPlural ? `os modelos ${item.artigo} ${item.nome}` : `o modelo ${item.artigo} ${item.nome}`)
            } else if (item.tipo === 'cor') {
              itensTextoArr.push(isPlural ? `as cores ${item.artigo} ${item.nome}` : `a cor ${item.artigo} ${item.nome}`)
            }
          }
        }

        let itensTexto: string
        if (itensTextoArr.length === 0) {
          msg += `${oQueChegou} \u00E0 Santos. Estamos preparando tudo com muito carinho para a entrega.`
          return msg
        } else if (itensTextoArr.length === 1) {
          itensTexto = itensTextoArr[0]
        } else {
          const ultimo = itensTextoArr.pop()!
          itensTexto = itensTextoArr.join(', ') + ' e ' + ultimo
        }

        msg += `${oQueChegou} \u00E0 Santos. Estamos preparando tudo com muito carinho para a entrega.\n${conseguiu} escolher ${itensTexto}?\n\n(Se n\u00E3o estiver confort\u00E1vel ainda para escolher ou receber, n\u00E3o tem problema, n\u00F3s retornamos o contato na pr\u00F3xima semana).`
      }
    }

    return msg
  }, [form, isIndividual])

  function handlePreview() {
    setPreview(gerarMensagem())
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

  // --- Helpers for outrosTutores ---
  function addOutroTutor() {
    setForm(f => ({
      ...f,
      outrosTutores: [...f.outrosTutores, { titulo: 'Sra.', nome: '' }],
    }))
  }

  function removeOutroTutor(index: number) {
    setForm(f => ({
      ...f,
      outrosTutores: f.outrosTutores.filter((_, i) => i !== index),
    }))
  }

  function updateOutroTutor(index: number, field: 'titulo' | 'nome', value: string) {
    setForm(f => ({
      ...f,
      outrosTutores: f.outrosTutores.map((t, i) =>
        i === index ? { ...t, [field]: value } : t
      ),
    }))
  }

  // --- Helpers for itensPendentes ---
  function addItemPendente() {
    setForm(f => ({
      ...f,
      itensPendentes: [...f.itensPendentes, { tipo: 'fotinho', artigo: 'do', nome: '' }],
    }))
  }

  function removeItemPendente(index: number) {
    setForm(f => ({
      ...f,
      itensPendentes: f.itensPendentes.filter((_, i) => i !== index),
    }))
  }

  function updateItemPendente(index: number, field: keyof ItemPendente, value: string) {
    setForm(f => ({
      ...f,
      itensPendentes: f.itensPendentes.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }))
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
        {/* Header - sticky */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-3 border-b border-slate-700 bg-cyan-900/30 rounded-t-xl">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-lg">{'\uD83D\uDCE6'}</span>
              <h3 className="font-semibold text-slate-100">Chegaram</h3>
            </div>
            <div className="flex items-center gap-2 mt-0.5 ml-7">
              <p className="text-xs text-slate-400">
                {contrato.pet_nome} &middot; {contrato.tutor?.nome || contrato.tutor_nome}
              </p>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                isIndividual
                  ? 'bg-amber-900/40 text-amber-300'
                  : 'bg-teal-900/40 text-teal-300'
              }`}>
                {isIndividual ? 'IND' : 'COL'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body - scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Tutor: titulo toggle + name input */}
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

          {/* Outros tutores */}
          {form.outrosTutores.map((tutor, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <div className="flex rounded-lg overflow-hidden border border-slate-600 shrink-0">
                <button
                  type="button"
                  onClick={() => updateOutroTutor(idx, 'titulo', 'Sr.')}
                  className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    tutor.titulo === 'Sr.'
                      ? 'bg-blue-600/30 text-blue-300 border-r border-blue-500/50'
                      : 'text-slate-400 hover:text-slate-300 border-r border-slate-600'
                  }`}
                >
                  Sr.
                </button>
                <button
                  type="button"
                  onClick={() => updateOutroTutor(idx, 'titulo', 'Sra.')}
                  className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    tutor.titulo === 'Sra.'
                      ? 'bg-pink-600/30 text-pink-300'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  Sra.
                </button>
              </div>
              <input
                type="text"
                value={tutor.nome}
                onChange={e => updateOutroTutor(idx, 'nome', e.target.value)}
                className="flex-1 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-slate-500"
                placeholder="Nome do tutor"
              />
              <button
                type="button"
                onClick={() => removeOutroTutor(idx)}
                className="px-2 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors text-sm"
              >
                {'\u2715'}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addOutroTutor}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            + Mencionar outro tutor
          </button>

          {/* Grid: Contexto + Tom */}
          <div className="grid grid-cols-2 gap-3">
            {/* Contexto */}
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">Contexto</label>
              <div className="flex flex-col rounded-lg overflow-hidden border border-slate-600">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, familia: 'sozinho' }))}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    form.familia === 'sozinho'
                      ? 'bg-cyan-600/30 text-cyan-300'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  {'\uD83E\uDDD1'} Sozinho
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, familia: 'familia' }))}
                  className={`px-3 py-2 text-sm font-medium transition-colors border-t ${
                    form.familia === 'familia'
                      ? 'bg-cyan-600/30 text-cyan-300 border-cyan-500/50'
                      : 'text-slate-400 hover:text-slate-300 border-slate-600'
                  }`}
                >
                  {'\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67'} Com fam{'\u00ED'}lia
                </button>
              </div>
            </div>

            {/* Tom */}
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">Tom</label>
              <div className="flex flex-col rounded-lg overflow-hidden border border-slate-600">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, tom: 'neutro' }))}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    form.tom === 'neutro'
                      ? 'bg-cyan-600/30 text-cyan-300'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  {'\uD83D\uDE0A'} bem
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, tom: 'acolhedor' }))}
                  className={`px-3 py-2 text-sm font-medium transition-colors border-t ${
                    form.tom === 'acolhedor'
                      ? 'bg-cyan-600/30 text-cyan-300 border-cyan-500/50'
                      : 'text-slate-400 hover:text-slate-300 border-slate-600'
                  }`}
                >
                  {'\uD83E\uDE75'} melhor
                </button>
              </div>
            </div>
          </div>

          {/* Recebimento */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Recebimento</label>
            <div className="flex rounded-lg overflow-hidden border border-slate-600">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, recebimento: 'entrega' }))}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  form.recebimento === 'entrega'
                    ? 'bg-cyan-600/30 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                {'\uD83D\uDCE6'} Entrega
              </button>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, recebimento: 'retirada' }))}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors border-l ${
                  form.recebimento === 'retirada'
                    ? 'bg-cyan-600/30 text-cyan-300 border-cyan-500/50'
                    : 'text-slate-400 hover:text-slate-300 border-slate-600'
                }`}
              >
                {'\uD83C\uDFE0'} Retirada
              </button>
              {isColetiva && (
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, recebimento: 'digital' }))}
                  className={`flex-1 px-3 py-2 text-sm font-medium transition-colors border-l ${
                    form.recebimento === 'digital'
                      ? 'bg-cyan-600/30 text-cyan-300 border-cyan-500/50'
                      : 'text-slate-400 hover:text-slate-300 border-slate-600'
                  }`}
                >
                  {'\uD83D\uDCC4'} Digital
                </button>
              )}
            </div>
          </div>

          {/* === ENTREGA OPTIONS === */}
          {form.recebimento === 'entrega' && (
            <div className="space-y-3">
              {/* Status toggle */}
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Status</label>
                <div className="flex rounded-lg overflow-hidden border border-slate-600">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, status: 'ok' }))}
                    className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                      form.status === 'ok'
                        ? 'bg-emerald-600/30 text-emerald-300'
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    {'\u2705'} OK
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, status: 'atencao' }))}
                    className={`flex-1 px-3 py-2 text-sm font-medium transition-colors border-l ${
                      form.status === 'atencao'
                        ? 'bg-amber-600/30 text-amber-300 border-amber-500/50'
                        : 'text-slate-400 hover:text-slate-300 border-slate-600'
                    }`}
                  >
                    {'\u26A0\uFE0F'} Aten{'\u00E7\u00E3'}o
                  </button>
                </div>
              </div>

              {/* Sub-options for OK */}
              {form.status === 'ok' && (
                <div className="space-y-3">
                  <div className="flex rounded-lg overflow-hidden border border-slate-600">
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, statusOk: 'com_itens' }))}
                      className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                        form.statusOk === 'com_itens'
                          ? 'bg-cyan-600/30 text-cyan-300'
                          : 'text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      {'\uD83D\uDCE6'} Com itens
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, statusOk: 'basica' }))}
                      className={`flex-1 px-3 py-2 text-sm font-medium transition-colors border-l ${
                        form.statusOk === 'basica'
                          ? 'bg-cyan-600/30 text-cyan-300 border-cyan-500/50'
                          : 'text-slate-400 hover:text-slate-300 border-slate-600'
                      }`}
                    >
                      {'\uD83D\uDCC4'} B{'\u00E1'}sica
                    </button>
                  </div>

                  {/* Outro endereco toggle */}
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, outroEndereco: !f.outroEndereco }))}
                    className={`w-full px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      form.outroEndereco
                        ? 'bg-cyan-600/30 text-cyan-300 border-cyan-500/50'
                        : 'text-slate-400 hover:text-slate-300 border-slate-600'
                    }`}
                  >
                    {'\uD83D\uDCCD'} Oferecer outro endere{'\u00E7'}o
                  </button>
                </div>
              )}

              {/* Sub-options for Atencao */}
              {form.status === 'atencao' && (
                <div className="space-y-3">
                  <div className="flex rounded-lg overflow-hidden border border-slate-600">
                    {isColetiva && (
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, statusAtencao: 'pelinho' }))}
                        className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                          form.statusAtencao === 'pelinho'
                            ? 'bg-red-600/30 text-red-300'
                            : 'text-slate-400 hover:text-slate-300'
                        }`}
                      >
                        {'\uD83D\uDC3E'} Pelinho?
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, statusAtencao: 'definir_itens' }))}
                      className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${isColetiva ? 'border-l' : ''} ${
                        form.statusAtencao === 'definir_itens'
                          ? 'bg-amber-600/30 text-amber-300 border-amber-500/50'
                          : 'text-slate-400 hover:text-slate-300 border-slate-600'
                      }`}
                    >
                      {'\uD83D\uDCDD'} Definir itens
                    </button>
                  </div>

                  {/* Itens pendentes (only for definir_itens) */}
                  {form.statusAtencao === 'definir_itens' && (
                    <div className="space-y-2">
                      {form.itensPendentes.map((item, idx) => (
                        <div key={idx} className="flex gap-2 items-center bg-slate-700/50 rounded-lg p-2">
                          <select
                            value={item.tipo}
                            onChange={e => updateItemPendente(idx, 'tipo', e.target.value)}
                            className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-slate-200 text-xs focus:outline-none focus:border-slate-500"
                          >
                            <option value="fotinho">fotinho</option>
                            <option value="modelo">modelo</option>
                            <option value="cor">cor</option>
                            <option value="urninha">urninha</option>
                          </select>

                          {item.tipo !== 'urninha' && (
                            <>
                              <select
                                value={item.artigo}
                                onChange={e => updateItemPendente(idx, 'artigo', e.target.value)}
                                className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-slate-200 text-xs focus:outline-none focus:border-slate-500 w-14"
                              >
                                <option value="do">do</option>
                                <option value="da">da</option>
                                <option value="dos">dos</option>
                                <option value="das">das</option>
                              </select>
                              <input
                                type="text"
                                value={item.nome}
                                onChange={e => updateItemPendente(idx, 'nome', e.target.value)}
                                className="flex-1 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-slate-200 text-xs focus:outline-none focus:border-slate-500"
                                placeholder="nome do item"
                              />
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => removeItemPendente(idx)}
                            className="px-2 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors text-xs"
                          >
                            {'\u2715'}
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addItemPendente}
                        className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                      >
                        + Adicionar item pendente
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* === RETIRADA OPTIONS === */}
          {form.recebimento === 'retirada' && (
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">Itens para retirada (opcional)</label>
              <input
                type="text"
                value={form.itensRetirada}
                onChange={e => setForm(f => ({ ...f, itensRetirada: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-slate-500"
                placeholder="Ex: dele e do carimbinho"
              />
            </div>
          )}

          {/* === DIGITAL INFO === */}
          {form.recebimento === 'digital' && (
            <div className="bg-slate-700/50 rounded-lg p-3 text-center">
              <p className="text-sm text-slate-400">
                {'\uD83D\uDCC4'} Certificado ser{'\u00E1'} digitalizado e enviado por aqui
              </p>
            </div>
          )}

          {/* Preview area */}
          {preview && (
            <div className="bg-slate-700 rounded-lg p-3 max-h-48 overflow-y-auto">
              <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                {preview}
              </p>
            </div>
          )}
        </div>

        {/* Footer - sticky */}
        <div className="sticky bottom-0 p-3 border-t border-slate-700 bg-slate-700/50 rounded-b-xl space-y-2">
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
