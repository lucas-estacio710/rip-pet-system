'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ============================================
// Config por unidade
// ============================================
export type FichaUnidadeConfig = {
  unidade_id: string      // UUID da unidade no Supabase
  codigo: string           // 'ST', 'SP', 'CP', etc.
  nome: string             // 'Santos', 'São Paulo', etc.
  cidade: string           // 'Santos'
  estado: string           // 'SP'
  label: string            // 'Unidade Santos'
  unidadeCompleta: string  // 'Santos - SP'
  maxParcelas?: number     // Máximo de parcelas no crédito (default 12)
}

// ============================================
// Types
// ============================================
type FormData = {
  // Honeypot (anti-bot)
  _hp: string
  // Tutor
  tipoDocumento: 'cpf' | 'cnpj'
  nomeCompleto: string
  outrosTutores: string[]
  cpf: string
  codigoPais: string
  codigoPaisCustom: string
  telefone: string
  email: string
  cep: string
  estado: string
  cidade: string
  bairro: string
  endereco: string
  numero: string
  complemento: string
  // Pet
  nomePet: string
  idade: string
  especie: 'canina' | 'felina' | 'exotica' | ''
  genero: 'macho' | 'femea' | ''
  raca: string
  cor: string
  peso: string
  localizacao: string
  localizacaoOutra: string
  cremacao: 'individual' | 'coletiva' | ''
  pagamento: string
  parcelas: string
  velorio: string
  acompanhamento: string
  // Como conheceu
  comoConheceu: string[]
  veterinarioEspecificar: string
  outroEspecificar: string
  // Meta
  observacoes: string
}

const INITIAL_FORM: FormData = {
  _hp: '',
  tipoDocumento: 'cpf',
  nomeCompleto: '', outrosTutores: [], cpf: '', codigoPais: '55', codigoPaisCustom: '', telefone: '', email: '',
  cep: '', estado: '', cidade: '', bairro: '', endereco: '', numero: '', complemento: '',
  nomePet: '', idade: '', especie: '', genero: '', raca: '', cor: '', peso: '',
  localizacao: '', localizacaoOutra: '', cremacao: '', pagamento: '', parcelas: '',
  velorio: '', acompanhamento: '',
  comoConheceu: [], veterinarioEspecificar: '', outroEspecificar: '', observacoes: '',
}

// STORAGE_KEY é dinâmico por unidade (definido dentro do componente)
const PENDING_KEY = 'fichaRipPet_Pending'

const UF_LIST = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

// ============================================
// Masks
// ============================================
function maskCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function maskCNPJ(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d.replace(/^(\d{2})(\d)/g, '($1) $2').replace(/(\d)(\d{4})$/, '$1-$2')
}

function maskCEP(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8)
  return d.replace(/(\d{5})(\d)/, '$1-$2')
}

function validarCPF(cpf: string) {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  let s = 0
  for (let i = 0; i < 9; i++) s += parseInt(d[i]) * (10 - i)
  let r = 11 - (s % 11)
  if ((r >= 10 ? 0 : r) !== parseInt(d[9])) return false
  s = 0
  for (let i = 0; i < 10; i++) s += parseInt(d[i]) * (11 - i)
  r = 11 - (s % 11)
  return (r >= 10 ? 0 : r) === parseInt(d[10])
}

function validarCNPJ(cnpj: string) {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const pesos1 = [5,4,3,2,9,8,7,6,5,4,3,2]
  const pesos2 = [6,5,4,3,2,9,8,7,6,5,4,3,2]
  let s = 0
  for (let i = 0; i < 12; i++) s += parseInt(d[i]) * pesos1[i]
  let r = s % 11; const d1 = r < 2 ? 0 : 11 - r
  if (parseInt(d[12]) !== d1) return false
  s = 0
  for (let i = 0; i < 13; i++) s += parseInt(d[i]) * pesos2[i]
  r = s % 11; const d2 = r < 2 ? 0 : 11 - r
  return parseInt(d[13]) === d2
}

// ============================================
// Component
// ============================================
function FichaFormContent({ config }: { config: FichaUnidadeConfig }) {
  const searchParams = useSearchParams()
  const STORAGE_KEY = `fichaRipPet_${config.codigo}`
  const [form, setForm] = useState<FormData>(INITIAL_FORM)
  const [step, setStep] = useState(1)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [autosaveMsg, setAutosaveMsg] = useState('')
  const autosaveTimer = useRef<NodeJS.Timeout | null>(null)
  const easterEggSeq = useRef<string[]>([])
  const easterEggTimer = useRef<NodeJS.Timeout | null>(null)

  // Forçar tema claro nesta página pública
  useEffect(() => {
    const prev = document.documentElement.getAttribute('data-theme')
    document.documentElement.setAttribute('data-theme', 'white')
    return () => {
      if (prev) document.documentElement.setAttribute('data-theme', prev)
    }
  }, [])

  // Load draft + URL params on mount
  useEffect(() => {
    // 1. Load draft from localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        setForm(prev => ({ ...prev, ...parsed }))
      }
    } catch { /* ignore */ }

    // 2. Override with URL params
    const paramMap: Record<string, keyof FormData> = {
      nome: 'nomeCompleto', tel: 'telefone', telefone: 'telefone',
      cpf: 'cpf', email: 'email', cep: 'cep', estado: 'estado',
      cidade: 'cidade', bairro: 'bairro', endereco: 'endereco',
      numero: 'numero', complemento: 'complemento',
      pet: 'nomePet', raca: 'raca', cor: 'cor', peso: 'peso',
      idade: 'idade', especie: 'especie', genero: 'genero',
      cremacao: 'cremacao', local: 'localizacao',
    }

    const overrides: Partial<FormData> = {}
    searchParams.forEach((value, key) => {
      const field = paramMap[key.toLowerCase()]
      if (field) {
        (overrides as Record<string, string>)[field] = value
      }
    })

    if (Object.keys(overrides).length > 0) {
      setForm(prev => ({ ...prev, ...overrides }))
    }
  }, [searchParams])

  // Autosave
  const autosave = useCallback((data: FormData) => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
        setAutosaveMsg('Rascunho salvo')
        setTimeout(() => setAutosaveMsg(''), 2000)
      } catch { /* ignore */ }
    }, 1000)
  }, [])

  // 🥚 Easter egg: clica "Unidade Santos" → logo → "Unidade Santos"
  function handleEasterEgg(element: 'unidade' | 'logo') {
    if (easterEggTimer.current) clearTimeout(easterEggTimer.current)
    easterEggSeq.current.push(element)
    easterEggTimer.current = setTimeout(() => { easterEggSeq.current = [] }, 3000)
    const seq = easterEggSeq.current
    if (seq.length >= 3 && seq[seq.length - 3] === 'unidade' && seq[seq.length - 2] === 'logo' && seq[seq.length - 1] === 'unidade') {
      easterEggSeq.current = []
      fillRandom()
    }
  }

  function fillRandom() {
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]
    const randDigits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('')
    const nomes = ['Maria Silva', 'João Santos', 'Ana Oliveira', 'Pedro Costa', 'Carla Souza', 'Lucas Ferreira', 'Juliana Lima', 'Rafael Almeida']
    const pets = ['Rex', 'Luna', 'Thor', 'Mel', 'Bob', 'Nina', 'Max', 'Lola', 'Simba', 'Pipoca', 'Amora', 'Zeus']
    const racas = ['SRD', 'Shih Tzu', 'Golden Retriever', 'Poodle', 'Labrador', 'Bulldog', 'Persa', 'Siamês', 'Vira-lata']
    const cores = ['Branco', 'Preto', 'Caramelo', 'Cinza', 'Marrom', 'Malhado', 'Tricolor', 'Dourado']
    const bairros = ['Gonzaga', 'Boqueirão', 'Embaré', 'Aparecida', 'Ponta da Praia', 'Vila Mathias', 'José Menino', 'Campo Grande']
    const ruas = ['Rua das Flores', 'Av. Ana Costa', 'Rua Oswaldo Cruz', 'Av. Conselheiro Nébias', 'Rua Carvalho de Mendonça']
    const especie = pick(['canina', 'felina'] as const)
    const genero = pick(['macho', 'femea'] as const)
    const cremacao = pick(['individual', 'coletiva'] as const)
    const pagamento = pick(['pix', 'dinheiro', 'debito', 'credito'])
    const velorio = pick(['Sim', 'Decidirei depois', 'Não'])
    const acomp = pick(['Vídeo-chamada ao vivo', 'Vídeo gravado', 'Presencial na Matriz', 'Decidirei depois', 'Não desejo'])
    const conheceu = pick([['Google'], ['Veterinário'], ['Parente/Amigo'], ['Instagram/Facebook'], ['Já utilizei a R.I.P. Pet'], ['Passei pela Unidade']])

    // Gerar CPF válido
    const cpfDigits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10))
    let s = 0
    for (let i = 0; i < 9; i++) s += cpfDigits[i] * (10 - i)
    let r = 11 - (s % 11); cpfDigits.push(r >= 10 ? 0 : r)
    s = 0
    for (let i = 0; i < 10; i++) s += cpfDigits[i] * (11 - i)
    r = 11 - (s % 11); cpfDigits.push(r >= 10 ? 0 : r)
    const cpfRaw = cpfDigits.join('')

    const randomForm: FormData = {
      _hp: '',
      tipoDocumento: 'cpf',
      nomeCompleto: pick(nomes),
      outrosTutores: [],
      cpf: maskCPF(cpfRaw),
      codigoPais: '55',
      codigoPaisCustom: '',
      telefone: maskPhone(`13${randDigits(9)}`),
      email: `teste${randDigits(4)}@email.com`,
      cep: maskCEP('11060001'),
      estado: 'SP',
      cidade: config.cidade,
      bairro: pick(bairros),
      endereco: pick(ruas),
      numero: String(Math.floor(Math.random() * 2000) + 1),
      complemento: pick(['', '', 'Apto 42', 'Casa 2', 'Bloco B']),
      nomePet: pick(pets),
      idade: String(Math.floor(Math.random() * 18) + 1),
      especie,
      genero,
      raca: pick(racas),
      cor: pick(cores),
      peso: String(Math.floor(Math.random() * 40) + 1),
      localizacao: pick(['Residência', 'Hospital/Clínica', 'Unidade Canal 6']),
      localizacaoOutra: '',
      cremacao,
      pagamento,
      parcelas: pagamento === 'credito' ? pick(['2', '3', '4', '5']) : '',
      velorio,
      acompanhamento: acomp,
      comoConheceu: conheceu,
      veterinarioEspecificar: conheceu.includes('Veterinário') ? 'Dra. Ana no Pet Care' : '',
      outroEspecificar: '',
      observacoes: pick(['', '', 'Teste dev - ignorar', 'Pet muito dócil']),
    }

    setForm(randomForm)
    setErrors({})
    setStep(1)
    console.log('🥚 Easter egg ativado! Campos preenchidos com dados aleatórios.')
  }

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      autosave(next)
      // Clear error
      if (errors[key]) setErrors(e => { const n = { ...e }; delete n[key]; return n })
      return next
    })
  }

  // CEP lookup
  async function buscarCEP() {
    const cep = form.cep.replace(/\D/g, '')
    if (cep.length !== 8) return
    setBuscandoCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setForm(prev => {
          const next = {
            ...prev,
            endereco: data.logradouro || prev.endereco,
            bairro: data.bairro || prev.bairro,
            cidade: data.localidade || prev.cidade,
            estado: data.uf || prev.estado,
          }
          autosave(next)
          return next
        })
      }
    } catch { /* ignore */ }
    setBuscandoCep(false)
  }

  // Labels legíveis para campos obrigatórios
  const FIELD_LABELS: Record<string, string> = {
    nomeCompleto: 'Nome Completo / Razão Social', cpf: 'CPF/CNPJ', telefone: 'Telefone',
    cep: 'CEP', estado: 'UF', cidade: 'Cidade', bairro: 'Bairro',
    endereco: 'Endereço', numero: 'Número',
    nomePet: 'Nome do Pet', idade: 'Idade', especie: 'Espécie',
    genero: 'Gênero', raca: 'Raça', cor: 'Cor', peso: 'Peso',
    localizacao: 'Localização do Pet', localizacaoOutra: 'Especificar local',
    cremacao: 'Cremação', pagamento: 'Forma de Pagamento', parcelas: 'Parcelas',
    velorio: 'Velório', acompanhamento: 'Acompanhamento',
    comoConheceu: 'Como nos conheceu', veterinarioEspecificar: 'Veterinário(a)/Panfleto/Recepção',
    outroEspecificar: 'Outro (especificar)',
  }

  // Validation
  function validateStep(s: number): boolean {
    const errs: Record<string, string> = {}

    if (s === 1) {
      if (!form.nomeCompleto.trim()) errs.nomeCompleto = 'Obrigatório'
      if (!form.cpf.trim()) errs.cpf = 'Obrigatório'
      else if (form.tipoDocumento === 'cpf' && !validarCPF(form.cpf)) errs.cpf = 'CPF inválido'
      else if (form.tipoDocumento === 'cnpj' && !validarCNPJ(form.cpf)) errs.cpf = 'CNPJ inválido'
      if (!form.telefone.trim()) errs.telefone = 'Obrigatório'
      if (!form.cep.trim()) errs.cep = 'Obrigatório'
      if (!form.estado) errs.estado = 'Obrigatório'
      if (!form.cidade.trim()) errs.cidade = 'Obrigatório'
      if (!form.bairro.trim()) errs.bairro = 'Obrigatório'
      if (!form.endereco.trim()) errs.endereco = 'Obrigatório'
      if (!form.numero.trim()) errs.numero = 'Obrigatório'
    }

    if (s === 2) {
      if (!form.nomePet.trim()) errs.nomePet = 'Obrigatório'
      if (!form.idade.trim()) errs.idade = 'Obrigatório'
      if (!form.especie) errs.especie = 'Selecione a espécie'
      if (!form.genero) errs.genero = 'Selecione o gênero'
      if (!form.raca.trim()) errs.raca = 'Obrigatório'
      if (!form.cor.trim()) errs.cor = 'Obrigatório'
      if (!form.peso.trim()) errs.peso = 'Obrigatório'
      if (!form.localizacao) errs.localizacao = 'Obrigatório'
      if ((form.localizacao === 'Outro' || form.localizacao === 'Hospital/Clínica Veterinária') && !form.localizacaoOutra.trim()) errs.localizacaoOutra = 'Especifique'
      if (!form.cremacao) errs.cremacao = 'Selecione o tipo'
      if (!form.pagamento) errs.pagamento = 'Obrigatório'
      if (form.pagamento === 'credito' && !form.parcelas) errs.parcelas = 'Obrigatório'
      if (!form.velorio) errs.velorio = 'Obrigatório'
      if (!form.acompanhamento) errs.acompanhamento = 'Obrigatório'
    }

    if (s === 3) {
      if (form.comoConheceu.length === 0) errs.comoConheceu = 'Selecione pelo menos uma opção'
      if (form.comoConheceu.includes('Veterinário') && !form.veterinarioEspecificar.trim()) errs.veterinarioEspecificar = 'Especifique'
      if (form.comoConheceu.includes('Outro') && !form.outroEspecificar.trim()) errs.outroEspecificar = 'Especifique'
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function nextStep() {
    if (!validateStep(step)) return
    setStep(s => Math.min(3, s + 1))
    window.scrollTo(0, 0)
  }

  function prevStep() {
    setStep(s => Math.max(1, s - 1))
    window.scrollTo(0, 0)
  }

  // Send email notification via API route
  async function sendEmail(payload: Record<string, unknown>, fallback: boolean) {
    const res = await fetch('/api/ficha/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, fallback }),
    })
    if (!res.ok) throw new Error('Email send failed')
  }

  // Submit
  async function handleSubmit() {
    if (!validateStep(3)) return
    setSubmitting(true)

    // Honeypot check: if filled, silently "succeed" without doing anything
    if (form._hp) {
      setSubmitted(true)
      setSubmitting(false)
      return
    }

    // Map camelCase form fields to snake_case DB columns
    // Values must match exactly what DB stores (capitalized, full text)
    const capitalize = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
    const pagamentoMap: Record<string, string> = {
      pix: 'Pix',
      dinheiro: 'Dinheiro',
      debito: 'Cartão Débito',
      credito: 'Cartão Crédito',
    }

    const payload = {
      unidade: config.unidadeCompleta,
      unidade_id: config.unidade_id,
      // Tutor
      nome_completo: form.nomeCompleto,
      cpf: form.cpf,
      telefone: form.codigoPais + form.telefone.replace(/\D/g, ''),
      email: form.email || null,
      cep: form.cep,
      estado: form.estado,
      cidade: form.cidade,
      endereco: form.endereco,
      numero: form.numero,
      complemento: form.complemento || null,
      bairro: form.bairro,
      // Pet
      nome_pet: form.nomePet,
      idade: form.idade || null,
      especie: ({ canina: 'Canina', felina: 'Felina', exotica: 'Exótica' } as Record<string, string>)[form.especie] || capitalize(form.especie),
      genero: ({ macho: 'Macho', femea: 'Fêmea' } as Record<string, string>)[form.genero] || capitalize(form.genero),
      raca: form.raca || null,
      cor: form.cor,
      peso: form.peso || null,
      localizacao: form.localizacao,
      localizacao_outra: form.localizacaoOutra || null,
      cremacao: capitalize(form.cremacao),
      pagamento: pagamentoMap[form.pagamento] || form.pagamento,
      parcelas: form.parcelas || null,
      velorio: form.velorio,
      acompanhamento: form.acompanhamento,
      // Extras
      outros_tutores: form.outrosTutores.filter(Boolean),
      como_conheceu: form.comoConheceu,
      veterinario_especificar: form.veterinarioEspecificar || null,
      outro_especificar: form.outroEspecificar || null,
      observacoes: form.observacoes || null,
    }

    let supabaseOk = false

    // 1. Tenta salvar no Supabase
    try {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('fichas').insert(payload as any)
      if (error) {
        console.error('Supabase error:', error.message, error.details, error.hint, error.code)
      } else {
        supabaseOk = true
      }
    } catch (err) {
      console.error('Supabase falhou:', err)
    }

    // 2. Envia email (sempre - notificacao se Supabase OK, fallback se falhou)
    try {
      await sendEmail({ ...payload, _hp: form._hp }, !supabaseOk)
    } catch (emailErr) {
      console.error('Email tambem falhou:', emailErr)

      // 3. Ultimo recurso: localStorage (so se Supabase E email falharam)
      if (!supabaseOk) {
        try {
          const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')
          pending.push(payload)
          localStorage.setItem(PENDING_KEY, JSON.stringify(pending))
        } catch { /* ignore */ }
      }
    }

    // Sucesso pro tutor em todos os cenarios
    localStorage.removeItem(STORAGE_KEY)
    setSubmitted(true)
    setSubmitting(false)
  }

  // Toggle checkbox array
  function toggleConheceu(value: string) {
    setForm(prev => {
      const arr = prev.comoConheceu.includes(value)
        ? prev.comoConheceu.filter(v => v !== value)
        : [...prev.comoConheceu, value]
      const next = { ...prev, comoConheceu: arr }
      autosave(next)
      return next
    })
    if (errors.comoConheceu) setErrors(e => { const n = { ...e }; delete n.comoConheceu; return n })
  }

  // Outros tutores
  function addOutroTutor() {
    if (form.outrosTutores.length >= 6) return
    updateField('outrosTutores', [...form.outrosTutores, ''])
  }

  function removeOutroTutor(idx: number) {
    updateField('outrosTutores', form.outrosTutores.filter((_, i) => i !== idx))
  }

  function updateOutroTutor(idx: number, value: string) {
    const arr = [...form.outrosTutores]
    arr[idx] = value
    updateField('outrosTutores', arr)
  }

  // Clear form
  function clearForm() {
    if (!confirm('Apagar todos os dados preenchidos?')) return
    setForm(INITIAL_FORM)
    localStorage.removeItem(STORAGE_KEY)
    setStep(1)
  }

  // ============================================
  // Success Screen
  // ============================================
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Ficha Enviada com Sucesso!</h2>
          <p className="text-slate-500 mb-6">Recebemos seus dados</p>

          <div className="space-y-4 text-left bg-slate-50 rounded-xl p-5">
            <div className="flex gap-3">
              <span className="text-2xl">💬</span>
              <div>
                <p className="font-semibold text-slate-700 text-sm">Confirmação por WhatsApp</p>
                <p className="text-slate-500 text-xs">Em alguns instantes enviaremos uma mensagem de confirmação.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-2xl">📋</span>
              <div>
                <p className="font-semibold text-slate-700 text-sm">Dados registrados</p>
                <p className="text-slate-500 text-xs">Nossa unidade já está com todos os dados necessários.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-2xl">🔒</span>
              <div>
                <p className="font-semibold text-slate-700 text-sm">Informações seguras</p>
                <p className="text-slate-500 text-xs">Todas as informações estão protegidas. Você pode fechar esta janela.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // Form helpers
  // ============================================
  const inputClass = (field: string) =>
    `w-full px-4 py-3 rounded-xl border-2 text-base outline-none transition-colors ${
      errors[field] ? 'border-red-400 bg-red-50' : 'border-slate-200 focus:border-blue-500 bg-white'
    }`

  const labelClass = 'block text-sm font-medium text-slate-600 mb-1.5'
  const errorClass = 'text-xs text-red-500 mt-1'

  const radioClass = (checked: boolean) =>
    `flex-1 py-3 px-4 rounded-xl border-2 text-center text-sm font-medium cursor-pointer transition-all ${
      checked ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
    }`

  // ============================================
  // Render
  // ============================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1e5a96] to-[#2d7bb8] px-4 py-5 text-white">
        <div className="max-w-lg mx-auto flex items-center gap-4">
          <img src="/logo_rounded.png" alt="R.I.P. Pet" className="w-12 h-12 rounded-full cursor-pointer" onClick={() => handleEasterEgg('logo')} />
          <div>
            <h1 className="text-xl font-bold">R.I.P. Pet</h1>
            <p className="text-sm opacity-90">Ficha de Contrato e Translado</p>
          </div>
          <span className="ml-auto text-xs bg-white/20 px-3 py-1 rounded-full font-semibold cursor-pointer select-none" onClick={() => handleEasterEgg('unidade')}>{config.label}</span>
        </div>
      </div>

      {/* Progress */}
      <div className="max-w-lg mx-auto px-4 py-5">
        <div className="flex items-center justify-between relative">
          {/* Line bg */}
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-slate-200" />
          {/* Line progress */}
          <div className="absolute top-5 left-0 h-0.5 bg-blue-500 transition-all duration-300" style={{ width: `${((step - 1) / 2) * 100}%` }} />

          {['Tutor', 'Pet', 'Confirmar'].map((label, i) => {
            const num = i + 1
            const isActive = step === num
            const isDone = step > num
            return (
              <div key={label} className="flex flex-col items-center relative z-10">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  isDone ? 'bg-green-500 text-white' : isActive ? 'bg-blue-600 text-white' : 'bg-white border-2 border-slate-200 text-slate-400'
                }`}>
                  {isDone ? '✓' : num}
                </div>
                <span className={`text-xs mt-1.5 font-medium ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>{label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Form */}
      <div className="max-w-lg mx-auto px-4">
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-5">
          {/* Honeypot - invisible to humans, bots will fill it */}
          <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" tabIndex={-1}>
            <label>Deixe em branco</label>
            <input type="text" name="website" value={form._hp} onChange={e => updateField('_hp', e.target.value)} autoComplete="off" tabIndex={-1} />
          </div>

          {/* ========== STEP 1: TUTOR ========== */}
          {step === 1 && (
            <>
              <h2 className="text-lg font-bold text-slate-800 pb-3 border-b-2 border-slate-100">Dados do Tutor</h2>

              <div>
                <label className={labelClass}>{form.tipoDocumento === 'cnpj' ? 'Razão Social / Nome Fantasia' : 'Nome Completo'} <span className="text-red-400">*</span></label>
                <input className={inputClass('nomeCompleto')} value={form.nomeCompleto} onChange={e => updateField('nomeCompleto', e.target.value)} placeholder={form.tipoDocumento === 'cnpj' ? 'Razão Social ou Nome Fantasia' : 'Nome para o contrato e certificado'} />
                {errors.nomeCompleto && <p className={errorClass}>{errors.nomeCompleto}</p>}
              </div>

              {/* Outros tutores */}
              <div>
                {form.outrosTutores.length === 0 ? (
                  <button type="button" onClick={addOutroTutor} className="text-sm text-blue-600 font-medium hover:text-blue-800 hover:underline">
                    + Adicionar outros nomes de tutores ao certificado
                  </button>
                ) : (
                  <>
                    <label className="text-sm font-medium text-slate-600 mb-2 block">Outros nomes no certificado</label>
                    {form.outrosTutores.map((t, i) => (
                      <div key={i} className="flex gap-2 mb-2">
                        <input className="flex-1 px-3 py-2 rounded-lg border-2 border-slate-200 text-sm outline-none focus:border-blue-500 bg-white" value={t} onChange={e => updateOutroTutor(i, e.target.value)} placeholder={`Nome do tutor ${i + 2}`} />
                        <button type="button" onClick={() => removeOutroTutor(i)} className="text-red-400 hover:text-red-600 text-sm px-2">Remover</button>
                      </div>
                    ))}
                    {form.outrosTutores.length < 6 && (
                      <button type="button" onClick={addOutroTutor} className="text-xs text-blue-600 font-medium hover:text-blue-800 hover:underline">
                        + Adicionar mais um nome
                      </button>
                    )}
                  </>
                )}
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label className="text-sm font-medium text-slate-600">{form.tipoDocumento === 'cnpj' ? 'CNPJ' : 'CPF'} <span className="text-red-400">*</span></label>
                  <button type="button" onClick={() => { updateField('tipoDocumento', form.tipoDocumento === 'cpf' ? 'cnpj' : 'cpf'); updateField('cpf', '') }} className="text-xs text-blue-500 hover:text-blue-700 hover:underline">
                    Usar {form.tipoDocumento === 'cpf' ? 'CNPJ' : 'CPF'}
                  </button>
                </div>
                <input className={inputClass('cpf')} value={form.cpf} onChange={e => updateField('cpf', form.tipoDocumento === 'cnpj' ? maskCNPJ(e.target.value) : maskCPF(e.target.value))} placeholder={form.tipoDocumento === 'cnpj' ? '00.000.000/0001-00' : '000.000.000-00'} inputMode="numeric" />
                {errors.cpf && <p className={errorClass}>{errors.cpf}</p>}
              </div>

              <div>
                <label className={labelClass}>Telefone <span className="text-red-400">*</span></label>
                <div className="flex gap-2">
                  {form.codigoPais === 'outro' ? (
                    <div className="flex gap-1">
                      <span className="flex items-center text-slate-400 text-sm pl-1">+</span>
                      <input
                        value={form.codigoPaisCustom || ''}
                        onChange={e => updateField('codigoPaisCustom' as keyof FormData, e.target.value.replace(/\D/g, '').slice(0, 4))}
                        className="w-[60px] px-2 py-3 rounded-xl border-2 border-slate-200 text-base outline-none focus:border-blue-500 bg-white text-center"
                        placeholder="DDI"
                        inputMode="numeric"
                      />
                      <button type="button" onClick={() => updateField('codigoPais', '55')} className="text-xs text-slate-400 hover:text-slate-600 px-1">✕</button>
                    </div>
                  ) : (
                    <select
                      value={form.codigoPais}
                      onChange={e => updateField('codigoPais', e.target.value)}
                      className="w-[100px] px-2 py-3 rounded-xl border-2 border-slate-200 text-base outline-none focus:border-blue-500 bg-white"
                    >
                      <option value="55">🇧🇷 +55</option>
                      <option value="1">🇺🇸 +1</option>
                      <option value="351">🇵🇹 +351</option>
                      <option value="54">🇦🇷 +54</option>
                      <option value="598">🇺🇾 +598</option>
                      <option value="595">🇵🇾 +595</option>
                      <option value="56">🇨🇱 +56</option>
                      <option value="57">🇨🇴 +57</option>
                      <option value="51">🇵🇪 +51</option>
                      <option value="591">🇧🇴 +591</option>
                      <option value="593">🇪🇨 +593</option>
                      <option value="58">🇻🇪 +58</option>
                      <option value="52">🇲🇽 +52</option>
                      <option value="34">🇪🇸 +34</option>
                      <option value="39">🇮🇹 +39</option>
                      <option value="33">🇫🇷 +33</option>
                      <option value="49">🇩🇪 +49</option>
                      <option value="44">🇬🇧 +44</option>
                      <option value="81">🇯🇵 +81</option>
                      <option value="86">🇨🇳 +86</option>
                      <option value="82">🇰🇷 +82</option>
                      <option value="61">🇦🇺 +61</option>
                      <option value="27">🇿🇦 +27</option>
                      <option value="972">🇮🇱 +972</option>
                      <option value="91">🇮🇳 +91</option>
                      <option value="outro">Outro...</option>
                    </select>
                  )}
                  <input className={`flex-1 ${inputClass('telefone')}`} value={form.telefone} onChange={e => updateField('telefone', maskPhone(e.target.value))} placeholder="(11) 99999-9999" inputMode="tel" />
                </div>
                {errors.telefone && <p className={errorClass}>{errors.telefone}</p>}
              </div>

              <div>
                <label className={labelClass}>E-mail</label>
                <input className={inputClass('email')} type="email" value={form.email} onChange={e => updateField('email', e.target.value)} placeholder="email@exemplo.com" />
              </div>

              {/* CEP + Buscar */}
              <div>
                <label className={labelClass}>CEP <span className="text-red-400">*</span></label>
                <div className="flex gap-2">
                  <input className={`flex-1 ${inputClass('cep')}`} value={form.cep} onChange={e => updateField('cep', maskCEP(e.target.value))} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), buscarCEP())} placeholder="00000-000" inputMode="numeric" />
                  <button type="button" onClick={buscarCEP} disabled={buscandoCep} className="px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors text-center leading-tight min-w-[80px]">
                    {buscandoCep ? 'Buscando...' : <>Buscar<br/>Endereço</>}
                  </button>
                </div>
                {errors.cep && <p className={errorClass}>{errors.cep}</p>}
              </div>

              <div>
                <label className={labelClass}>Endereço <span className="text-red-400">*</span></label>
                <input className={inputClass('endereco')} value={form.endereco} onChange={e => updateField('endereco', e.target.value)} placeholder="Av. Paulista" />
                {errors.endereco && <p className={errorClass}>{errors.endereco}</p>}
              </div>

              <div>
                <label className={labelClass}>Bairro <span className="text-red-400">*</span></label>
                <input className={inputClass('bairro')} value={form.bairro} onChange={e => updateField('bairro', e.target.value)} />
                {errors.bairro && <p className={errorClass}>{errors.bairro}</p>}
              </div>

              {/* Cidade + UF */}
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-3">
                  <label className={labelClass}>Cidade <span className="text-red-400">*</span></label>
                  <input className={inputClass('cidade')} value={form.cidade} onChange={e => updateField('cidade', e.target.value)} />
                  {errors.cidade && <p className={errorClass}>{errors.cidade}</p>}
                </div>
                <div>
                  <label className={labelClass}>UF <span className="text-red-400">*</span></label>
                  <select className={inputClass('estado')} value={form.estado} onChange={e => updateField('estado', e.target.value)}>
                    <option value="">-</option>
                    {UF_LIST.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                  {errors.estado && <p className={errorClass}>{errors.estado}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Número <span className="text-red-400">*</span></label>
                  <input className={inputClass('numero')} value={form.numero} onChange={e => updateField('numero', e.target.value)} placeholder="1000" />
                  {errors.numero && <p className={errorClass}>{errors.numero}</p>}
                </div>
                <div>
                  <label className={labelClass}>Complemento</label>
                  <input className={inputClass('complemento')} value={form.complemento} onChange={e => updateField('complemento', e.target.value)} placeholder="Apto 123, Bloco A" />
                </div>
              </div>

              <button type="button" onClick={nextStep} className="w-full py-3.5 bg-blue-600 text-white rounded-xl text-base font-semibold hover:bg-blue-700 transition-colors">
                Continuar →
              </button>
              {Object.keys(errors).length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mt-2">
                  <p className="text-xs font-semibold text-red-600 mb-1">Preencha os campos obrigatórios:</p>
                  <ul className="text-xs text-red-500 space-y-0.5">
                    {Object.keys(errors).map(k => (
                      <li key={k}>• {FIELD_LABELS[k] || k}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* ========== STEP 2: PET ========== */}
          {step === 2 && (
            <>
              <h2 className="text-lg font-bold text-slate-800 pb-3 border-b-2 border-slate-100">Dados do Pet</h2>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className={labelClass}>Nome do Pet <span className="text-red-400">*</span></label>
                  <input className={inputClass('nomePet')} value={form.nomePet} onChange={e => updateField('nomePet', e.target.value)} />
                  {errors.nomePet && <p className={errorClass}>{errors.nomePet}</p>}
                </div>
                <div>
                  <label className={labelClass}>Idade <span className="text-red-400">*</span></label>
                  <input className={inputClass('idade')} value={form.idade} onChange={e => updateField('idade', e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Ex: 14" inputMode="numeric" />
                  {errors.idade && <p className={errorClass}>{errors.idade}</p>}
                </div>
              </div>

              {/* Espécie */}
              <div>
                <label className={labelClass}>Espécie <span className="text-red-400">*</span></label>
                <div className="flex gap-2">
                  {(['canina', 'felina', 'exotica'] as const).map(e => (
                    <div key={e} onClick={() => updateField('especie', e)} className={radioClass(form.especie === e)}>
                      {e === 'canina' ? '🐕 Canina' : e === 'felina' ? '🐱 Felina' : '🦎 Exótica'}
                    </div>
                  ))}
                </div>
                {errors.especie && <p className={errorClass}>{errors.especie}</p>}
              </div>

              {/* Gênero */}
              <div>
                <label className={labelClass}>Gênero <span className="text-red-400">*</span></label>
                <div className="flex gap-2">
                  <div onClick={() => updateField('genero', 'macho')} className={radioClass(form.genero === 'macho')}>♂ Macho</div>
                  <div onClick={() => updateField('genero', 'femea')} className={radioClass(form.genero === 'femea')}>♀ Fêmea</div>
                </div>
                {errors.genero && <p className={errorClass}>{errors.genero}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Raça <span className="text-red-400">*</span></label>
                  <input className={inputClass('raca')} value={form.raca} onChange={e => updateField('raca', e.target.value)} placeholder="Ex: Shihtzu, SRD" />
                  {errors.raca && <p className={errorClass}>{errors.raca}</p>}
                </div>
                <div>
                  <label className={labelClass}>Cor <span className="text-red-400">*</span></label>
                  <input className={inputClass('cor')} value={form.cor} onChange={e => updateField('cor', e.target.value)} placeholder="Ex: Branco" />
                  {errors.cor && <p className={errorClass}>{errors.cor}</p>}
                </div>
              </div>

              <div>
                <label className={labelClass}>Peso aproximado (kg) <span className="text-red-400">*</span></label>
                <input className={inputClass('peso')} value={form.peso} onChange={e => updateField('peso', e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Ex: 8" inputMode="numeric" />
                {errors.peso && <p className={errorClass}>{errors.peso}</p>}
              </div>

              {/* Localização */}
              <div>
                <label className={labelClass}>Localização do Pet <span className="text-red-400">*</span></label>
                <select className={inputClass('localizacao')} value={form.localizacao} onChange={e => updateField('localizacao', e.target.value)}>
                  <option value="">Selecione...</option>
                  <option value="Residência (Endereço de Cadastro)">Residência (Endereço de Cadastro)</option>
                  <option value="Hospital/Clínica Veterinária">Hospital/Clínica Veterinária</option>
                  <option value="Unidade R.I.P. Pet">Unidade R.I.P. Pet</option>
                  <option value="Outro">Outro</option>
                </select>
                {errors.localizacao && <p className={errorClass}>{errors.localizacao}</p>}
                {(form.localizacao === 'Hospital/Clínica Veterinária' || form.localizacao === 'Outro') && (
                  <div className="mt-2">
                    <label className={labelClass}>
                      {form.localizacao === 'Outro' ? 'Endereço onde está o pet' : 'Nome e endereço da clínica/hospital'} <span className="text-red-400">*</span>
                    </label>
                    <input
                      className={inputClass('localizacaoOutra')}
                      value={form.localizacaoOutra}
                      onChange={e => updateField('localizacaoOutra', e.target.value)}
                      placeholder={form.localizacao === 'Outro' ? 'Ex: Casa da cuidadora Maria - Av. Brasil, 450, Jardim América' : 'Ex: Hospital Pet 24h - Rua das Acácias, 250, Centro'}
                    />
                    {errors.localizacaoOutra && <p className={errorClass}>{errors.localizacaoOutra}</p>}
                  </div>
                )}
              </div>

              {/* Cremação */}
              <div>
                <label className={labelClass}>Cremação <span className="text-red-400">*</span></label>
                <div className="flex gap-2">
                  <div onClick={() => updateField('cremacao', 'individual')} className={radioClass(form.cremacao === 'individual')}>
                    <div className="font-bold">Individual</div>
                    <div className="text-xs opacity-70 mt-0.5"><strong>Com</strong> retorno das cinzas</div>
                  </div>
                  <div onClick={() => updateField('cremacao', 'coletiva')} className={radioClass(form.cremacao === 'coletiva')}>
                    <div className="font-bold">Coletiva</div>
                    <div className="text-xs opacity-70 mt-0.5"><strong>Sem</strong> retorno das cinzas</div>
                  </div>
                </div>
                {errors.cremacao && <p className={errorClass}>{errors.cremacao}</p>}
              </div>

              {/* Pagamento */}
              <div>
                <label className={labelClass}>Forma de Pagamento <span className="text-red-400">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: 'pix', l: 'Pix' },
                    { v: 'dinheiro', l: 'Dinheiro' },
                    { v: 'debito', l: 'Cartão de Débito' },
                    { v: 'credito', l: 'Cartão de Crédito' },
                  ].map(opt => (
                    <div key={opt.v} onClick={() => { updateField('pagamento', opt.v); if (opt.v !== 'credito') updateField('parcelas', '') }} className={radioClass(form.pagamento === opt.v)}>
                      {opt.l}
                    </div>
                  ))}
                </div>
                {errors.pagamento && <p className={errorClass}>{errors.pagamento}</p>}
                {form.pagamento === 'credito' && (
                  <div className="mt-2">
                    <select className={inputClass('parcelas')} value={form.parcelas} onChange={e => updateField('parcelas', e.target.value)}>
                      <option value="">Parcelas...</option>
                      <option value="1x">À vista</option>
                      {Array.from({length: (config.maxParcelas || 12) - 1}, (_, i) => i + 2).map(n => <option key={n} value={`${n}x`}>{n}x</option>)}
                    </select>
                    {errors.parcelas && <p className={errorClass}>{errors.parcelas}</p>}
                  </div>
                )}
              </div>

              {/* Velório */}
              <div>
                <label className={labelClass}>Velório presencial em {config.cidade}? <span className="text-red-400">*</span></label>
                <div className="flex gap-2">
                  <div onClick={() => updateField('velorio', 'Não')} className={radioClass(form.velorio === 'Não')}>Não</div>
                  <div onClick={() => updateField('velorio', 'Sim')} className={radioClass(form.velorio === 'Sim')}>Sim</div>
                </div>
                {errors.velorio && <p className={errorClass}>{errors.velorio}</p>}
              </div>

              {/* Acompanhamento */}
              <div>
                <label className={labelClass}>Acompanhamento da cremação <span className="text-red-400">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: 'Não desejo', l: 'Não desejo' },
                    { v: 'Vídeo-chamada ao vivo', l: 'Vídeo-chamada ao vivo' },
                    { v: 'Vídeo gravado', l: 'Vídeo gravado' },
                    { v: 'Presencial na Matriz', l: 'Presencial na Matriz' },
                    { v: 'Decidirei depois', l: 'Decidirei depois' },
                  ].map(opt => (
                    <div key={opt.v} onClick={() => updateField('acompanhamento', opt.v)} className={radioClass(form.acompanhamento === opt.v)}>
                      {opt.l}
                    </div>
                  ))}
                </div>
                {errors.acompanhamento && <p className={errorClass}>{errors.acompanhamento}</p>}
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={prevStep} className="flex-1 py-3.5 border-2 border-slate-200 text-slate-600 rounded-xl text-base font-semibold hover:bg-slate-50 transition-colors">
                  ← Voltar
                </button>
                <button type="button" onClick={nextStep} className="flex-[2] py-3.5 bg-blue-600 text-white rounded-xl text-base font-semibold hover:bg-blue-700 transition-colors">
                  Continuar →
                </button>
              </div>
              {Object.keys(errors).length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mt-2">
                  <p className="text-xs font-semibold text-red-600 mb-1">Preencha os campos obrigatórios:</p>
                  <ul className="text-xs text-red-500 space-y-0.5">
                    {Object.keys(errors).map(k => (
                      <li key={k}>• {FIELD_LABELS[k] || k}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* ========== STEP 3: CONFIRMACAO ========== */}
          {step === 3 && (
            <>
              <h2 className="text-lg font-bold text-slate-800 pb-3 border-b-2 border-slate-100">Confirmação</h2>

              {/* Review */}
              <div className="space-y-4">
                <div className="bg-slate-50 rounded-xl p-4 space-y-1.5">
                  <h3 className="text-sm font-bold text-blue-700 mb-2">Dados do Tutor</h3>
                  <p className="text-sm"><span className="font-medium text-slate-600">Nome:</span> <span className="text-slate-800">{form.nomeCompleto}</span></p>
                  {form.outrosTutores.filter(Boolean).length > 0 && (
                    <p className="text-sm"><span className="font-medium text-slate-600">Outros:</span> <span className="text-slate-800">{form.outrosTutores.filter(Boolean).join(', ')}</span></p>
                  )}
                  <p className="text-sm"><span className="font-medium text-slate-600">{form.tipoDocumento === 'cnpj' ? 'CNPJ' : 'CPF'}:</span> <span className="text-slate-800">{form.cpf}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Telefone:</span> <span className="text-slate-800">{form.telefone}</span></p>
                  {form.email && <p className="text-sm"><span className="font-medium text-slate-600">E-mail:</span> <span className="text-slate-800">{form.email}</span></p>}
                  <p className="text-sm"><span className="font-medium text-slate-600">Endereço:</span> <span className="text-slate-800">{form.endereco}, {form.numero}{form.complemento ? ` - ${form.complemento}` : ''}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Bairro:</span> <span className="text-slate-800">{form.bairro}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Cidade/UF:</span> <span className="text-slate-800">{form.cidade} - {form.estado}</span></p>
                </div>

                <div className="bg-blue-50 rounded-xl p-4 space-y-1.5">
                  <h3 className="text-sm font-bold text-blue-700 mb-2">Dados do Pet</h3>
                  <p className="text-sm"><span className="font-medium text-slate-600">Nome:</span> <span className="text-slate-800">{form.nomePet}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Idade:</span> <span className="text-slate-800">{form.idade} anos</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Espécie:</span> <span className="text-slate-800 capitalize">{form.especie}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Gênero:</span> <span className="text-slate-800 capitalize">{form.genero === 'macho' ? 'Macho' : 'Fêmea'}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Raça:</span> <span className="text-slate-800">{form.raca}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Cor:</span> <span className="text-slate-800">{form.cor}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Peso:</span> <span className="text-slate-800">{form.peso} kg</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Local:</span> <span className="text-slate-800">{form.localizacao}{form.localizacaoOutra ? ` (${form.localizacaoOutra})` : ''}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Cremação:</span> <span className="text-slate-800 capitalize">{form.cremacao}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Pagamento:</span> <span className="text-slate-800">{form.pagamento === 'pix' ? 'Pix' : form.pagamento === 'dinheiro' ? 'Dinheiro' : form.pagamento === 'debito' ? 'Cartão de Débito' : `Cartão de Crédito ${form.parcelas}`}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Velório:</span> <span className="text-slate-800">{form.velorio}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Acompanhamento:</span> <span className="text-slate-800">{form.acompanhamento}</span></p>
                </div>
              </div>

              {/* Como conheceu */}
              <div>
                <label className={labelClass}>
                  Como nos conheceu? <span className="text-red-400">*</span>
                  <span className="ml-1 text-slate-500 font-normal">(pode marcar mais de uma)</span>
                </label>
                <div className="space-y-2">
                  {[
                    'Veterinário', 'Google', 'Já utilizei a R.I.P. Pet',
                    'Parente/Amigo', 'Passei pela Unidade',
                    'Instagram/Facebook', 'Outro',
                  ].map(opt => (
                    <label key={opt} className="flex items-center gap-3 cursor-pointer">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        form.comoConheceu.includes(opt) ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                      }`} onClick={() => toggleConheceu(opt)}>
                        {form.comoConheceu.includes(opt) && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm text-slate-700">{opt === 'Veterinário' ? 'Veterinário(a)/Panfleto/Recepção' : opt}</span>
                    </label>
                  ))}
                </div>
                {errors.comoConheceu && <p className={errorClass}>{errors.comoConheceu}</p>}

                {form.comoConheceu.includes('Veterinário') && (
                  <div className="mt-3 ml-8">
                    <p className="text-sm text-slate-600 mb-1">Especificar o(a) profissional e/ou Hospital/Clínica:</p>
                    <input className={inputClass('veterinarioEspecificar')} value={form.veterinarioEspecificar} onChange={e => updateField('veterinarioEspecificar', e.target.value)} placeholder="Dra. Maria no Hospital Pet 24h ou Panfleto na Clínica Pet" />
                    {errors.veterinarioEspecificar && <p className={errorClass}>{errors.veterinarioEspecificar}</p>}
                  </div>
                )}

                {form.comoConheceu.includes('Outro') && (
                  <div className="mt-3 ml-8">
                    <input className={inputClass('outroEspecificar')} value={form.outroEspecificar} onChange={e => updateField('outroEspecificar', e.target.value)} placeholder="Ex: Seguro do Banco X" />
                    {errors.outroEspecificar && <p className={errorClass}>{errors.outroEspecificar}</p>}
                  </div>
                )}
              </div>

              {/* Observações */}
              <div>
                <label className={labelClass}>Observações</label>
                <textarea className={`${inputClass('observacoes')} resize-none`} rows={3} value={form.observacoes} onChange={e => updateField('observacoes', e.target.value)} placeholder="Alguma informação adicional?" />
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={prevStep} className="flex-1 py-3.5 border-2 border-slate-200 text-slate-600 rounded-xl text-base font-semibold hover:bg-slate-50 transition-colors">
                  ← Voltar
                </button>
                <button type="button" onClick={handleSubmit} disabled={submitting} className="flex-[2] py-3.5 bg-green-600 text-white rounded-xl text-base font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
                  {submitting ? 'Enviando...' : 'Enviar Ficha ✓'}
                </button>
              </div>
              {Object.keys(errors).length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mt-2">
                  <p className="text-xs font-semibold text-red-600 mb-1">Preencha os campos obrigatórios:</p>
                  <ul className="text-xs text-red-500 space-y-0.5">
                    {Object.keys(errors).map(k => (
                      <li key={k}>• {FIELD_LABELS[k] || k}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Footer fixo */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-3 flex items-center justify-between">
        <button type="button" onClick={clearForm} className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Apagar tudo
        </button>
        {autosaveMsg && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            {autosaveMsg}
          </span>
        )}
      </div>
    </div>
  )
}

export default function FichaForm({ config }: { config: FichaUnidadeConfig }) {
  return (
    <Suspense fallback={<div className="p-8 text-center">Carregando...</div>}>
      <FichaFormContent config={config} />
    </Suspense>
  )
}
