'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ============================================
// Types
// ============================================
type FormData = {
  // Honeypot (anti-bot)
  _hp: string
  // Tutor
  nomeCompleto: string
  outrosTutores: string[]
  cpf: string
  codigoPais: string
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
  nomeCompleto: '', outrosTutores: [], cpf: '', codigoPais: '55', telefone: '', email: '',
  cep: '', estado: '', cidade: '', bairro: '', endereco: '', numero: '', complemento: '',
  nomePet: '', idade: '', especie: '', genero: '', raca: '', cor: '', peso: '',
  localizacao: '', localizacaoOutra: '', cremacao: '', pagamento: '', parcelas: '',
  velorio: '', acompanhamento: '',
  comoConheceu: [], veterinarioEspecificar: '', outroEspecificar: '', observacoes: '',
}

const STORAGE_KEY = 'fichaRipPet_Santos'
const PENDING_KEY = 'fichaRipPet_Pending'

const UF_LIST = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

// ============================================
// Masks
// ============================================
function maskCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
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

// ============================================
// Component
// ============================================
function FichaSantosContent() {
  const searchParams = useSearchParams()
  const [form, setForm] = useState<FormData>(INITIAL_FORM)
  const [step, setStep] = useState(1)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [autosaveMsg, setAutosaveMsg] = useState('')
  const autosaveTimer = useRef<NodeJS.Timeout | null>(null)

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

  // Validation
  function validateStep(s: number): boolean {
    const errs: Record<string, string> = {}

    if (s === 1) {
      if (!form.nomeCompleto.trim()) errs.nomeCompleto = 'Obrigatório'
      if (!form.cpf.trim()) errs.cpf = 'Obrigatório'
      else if (!validarCPF(form.cpf)) errs.cpf = 'CPF inválido'
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
      if (form.pagamento === 'cartao' && !form.parcelas) errs.parcelas = 'Obrigatório'
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
      pix: 'À Vista por Pix/Dinheiro',
      cartao: 'Cartão de Débito/Crédito',
    }

    const payload = {
      unidade: 'Santos - SP',
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
      especie: capitalize(form.especie),
      genero: capitalize(form.genero),
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
                <p className="font-semibold text-slate-700 text-sm">Confirmacao por WhatsApp</p>
                <p className="text-slate-500 text-xs">Em alguns instantes enviaremos uma mensagem de confirmacao.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-2xl">📋</span>
              <div>
                <p className="font-semibold text-slate-700 text-sm">Dados registrados</p>
                <p className="text-slate-500 text-xs">Nossa unidade ja esta com todos os dados necessarios.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-2xl">🔒</span>
              <div>
                <p className="font-semibold text-slate-700 text-sm">Informacoes seguras</p>
                <p className="text-slate-500 text-xs">Todas as informacoes estao protegidas. Voce pode fechar esta janela.</p>
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
          <span className="text-4xl">🐾</span>
          <div>
            <h1 className="text-xl font-bold">R.I.P. Pet</h1>
            <p className="text-sm opacity-90">Ficha de Contrato e Translado</p>
          </div>
          <span className="ml-auto text-xs bg-white/20 px-3 py-1 rounded-full font-semibold">Santos</span>
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
                <label className={labelClass}>Nome Completo <span className="text-red-400">*</span></label>
                <input className={inputClass('nomeCompleto')} value={form.nomeCompleto} onChange={e => updateField('nomeCompleto', e.target.value)} placeholder="Nome para o contrato e certificado" />
                {errors.nomeCompleto && <p className={errorClass}>{errors.nomeCompleto}</p>}
              </div>

              {/* Outros tutores */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-600">Outros nomes no certificado</label>
                  {form.outrosTutores.length < 6 && (
                    <button type="button" onClick={addOutroTutor} className="text-xs text-blue-600 font-medium hover:text-blue-800">+ Adicionar</button>
                  )}
                </div>
                {form.outrosTutores.map((t, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input className="flex-1 px-3 py-2 rounded-lg border-2 border-slate-200 text-sm outline-none focus:border-blue-500" value={t} onChange={e => updateOutroTutor(i, e.target.value)} placeholder={`Tutor ${i + 1}`} />
                    <button type="button" onClick={() => removeOutroTutor(i)} className="text-red-400 hover:text-red-600 text-sm px-2">Remover</button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>CPF <span className="text-red-400">*</span></label>
                  <input className={inputClass('cpf')} value={form.cpf} onChange={e => updateField('cpf', maskCPF(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" />
                  {errors.cpf && <p className={errorClass}>{errors.cpf}</p>}
                </div>
                <div>
                  <label className={labelClass}>Telefone <span className="text-red-400">*</span></label>
                  <div className="flex gap-1.5">
                    <select
                      value={form.codigoPais}
                      onChange={e => updateField('codigoPais', e.target.value)}
                      className="w-[90px] px-2 py-2 rounded-lg border-2 border-slate-200 text-sm outline-none focus:border-blue-500 bg-white"
                    >
                      <option value="55">🇧🇷 +55</option>
                      <option value="1">🇺🇸 +1</option>
                      <option value="351">🇵🇹 +351</option>
                      <option value="54">🇦🇷 +54</option>
                      <option value="598">🇺🇾 +598</option>
                      <option value="595">🇵🇾 +595</option>
                      <option value="56">🇨🇱 +56</option>
                      <option value="57">🇨🇴 +57</option>
                      <option value="34">🇪🇸 +34</option>
                      <option value="39">🇮🇹 +39</option>
                      <option value="81">🇯🇵 +81</option>
                    </select>
                    <input className={`flex-1 ${inputClass('telefone')}`} value={form.telefone} onChange={e => updateField('telefone', maskPhone(e.target.value))} placeholder="(11) 99999-9999" inputMode="tel" />
                  </div>
                  {errors.telefone && <p className={errorClass}>{errors.telefone}</p>}
                </div>
              </div>

              <div>
                <label className={labelClass}>E-mail</label>
                <input className={inputClass('email')} type="email" value={form.email} onChange={e => updateField('email', e.target.value)} placeholder="email@exemplo.com" />
              </div>

              {/* CEP + busca */}
              <div>
                <label className={labelClass}>CEP <span className="text-red-400">*</span></label>
                <div className="flex gap-2">
                  <input className={`flex-1 ${inputClass('cep')}`} value={form.cep} onChange={e => updateField('cep', maskCEP(e.target.value))} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), buscarCEP())} placeholder="00000-000" inputMode="numeric" />
                  <button type="button" onClick={buscarCEP} disabled={buscandoCep} className="px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap">
                    {buscandoCep ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
                {errors.cep && <p className={errorClass}>{errors.cep}</p>}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>UF <span className="text-red-400">*</span></label>
                  <select className={inputClass('estado')} value={form.estado} onChange={e => updateField('estado', e.target.value)}>
                    <option value="">-</option>
                    {UF_LIST.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                  {errors.estado && <p className={errorClass}>{errors.estado}</p>}
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Cidade <span className="text-red-400">*</span></label>
                  <input className={inputClass('cidade')} value={form.cidade} onChange={e => updateField('cidade', e.target.value)} />
                  {errors.cidade && <p className={errorClass}>{errors.cidade}</p>}
                </div>
              </div>

              <div>
                <label className={labelClass}>Bairro <span className="text-red-400">*</span></label>
                <input className={inputClass('bairro')} value={form.bairro} onChange={e => updateField('bairro', e.target.value)} />
                {errors.bairro && <p className={errorClass}>{errors.bairro}</p>}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className={labelClass}>Endereco <span className="text-red-400">*</span></label>
                  <input className={inputClass('endereco')} value={form.endereco} onChange={e => updateField('endereco', e.target.value)} placeholder="Av. Paulista" />
                  {errors.endereco && <p className={errorClass}>{errors.endereco}</p>}
                </div>
                <div>
                  <label className={labelClass}>Numero <span className="text-red-400">*</span></label>
                  <input className={inputClass('numero')} value={form.numero} onChange={e => updateField('numero', e.target.value)} placeholder="1000" />
                  {errors.numero && <p className={errorClass}>{errors.numero}</p>}
                </div>
              </div>

              <div>
                <label className={labelClass}>Complemento</label>
                <input className={inputClass('complemento')} value={form.complemento} onChange={e => updateField('complemento', e.target.value)} placeholder="Apto 123, Bloco A" />
              </div>

              <button type="button" onClick={nextStep} className="w-full py-3.5 bg-blue-600 text-white rounded-xl text-base font-semibold hover:bg-blue-700 transition-colors">
                Continuar →
              </button>
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
                  <input className={inputClass('idade')} type="number" min="0" max="50" value={form.idade} onChange={e => updateField('idade', e.target.value)} placeholder="14" inputMode="numeric" />
                  {errors.idade && <p className={errorClass}>{errors.idade}</p>}
                </div>
              </div>

              {/* Especie */}
              <div>
                <label className={labelClass}>Especie <span className="text-red-400">*</span></label>
                <div className="flex gap-2">
                  {(['canina', 'felina', 'exotica'] as const).map(e => (
                    <div key={e} onClick={() => updateField('especie', e)} className={radioClass(form.especie === e)}>
                      {e === 'canina' ? '🐕 Canina' : e === 'felina' ? '🐱 Felina' : '🦎 Exotica'}
                    </div>
                  ))}
                </div>
                {errors.especie && <p className={errorClass}>{errors.especie}</p>}
              </div>

              {/* Genero */}
              <div>
                <label className={labelClass}>Genero <span className="text-red-400">*</span></label>
                <div className="flex gap-2">
                  <div onClick={() => updateField('genero', 'macho')} className={radioClass(form.genero === 'macho')}>♂ Macho</div>
                  <div onClick={() => updateField('genero', 'femea')} className={radioClass(form.genero === 'femea')}>♀ Femea</div>
                </div>
                {errors.genero && <p className={errorClass}>{errors.genero}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Raca <span className="text-red-400">*</span></label>
                  <input className={inputClass('raca')} value={form.raca} onChange={e => updateField('raca', e.target.value)} placeholder="Ex: Poodle, SRD" />
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
                <input className={inputClass('peso')} type="number" min="0.1" step="0.1" value={form.peso} onChange={e => updateField('peso', e.target.value)} placeholder="6" inputMode="decimal" />
                {errors.peso && <p className={errorClass}>{errors.peso}</p>}
              </div>

              {/* Localizacao */}
              <div>
                <label className={labelClass}>Localizacao do Pet <span className="text-red-400">*</span></label>
                <select className={inputClass('localizacao')} value={form.localizacao} onChange={e => updateField('localizacao', e.target.value)}>
                  <option value="">Selecione...</option>
                  <option value="Residência (Endereço de Cadastro)">Residencia (Endereco de Cadastro)</option>
                  <option value="Hospital/Clínica Veterinária">Hospital/Clinica Veterinaria</option>
                  <option value="Unidade R.I.P. Pet">Unidade R.I.P. Pet</option>
                  <option value="Outro">Outro</option>
                </select>
                {errors.localizacao && <p className={errorClass}>{errors.localizacao}</p>}
                {(form.localizacao === 'Hospital/Clínica Veterinária' || form.localizacao === 'Outro') && (
                  <div className="mt-2">
                    <input className={inputClass('localizacaoOutra')} value={form.localizacaoOutra} onChange={e => updateField('localizacaoOutra', e.target.value)} placeholder={form.localizacao === 'Outro' ? 'Especifique o endereco' : 'Nome do hospital/clinica'} />
                    {errors.localizacaoOutra && <p className={errorClass}>{errors.localizacaoOutra}</p>}
                  </div>
                )}
              </div>

              {/* Cremacao */}
              <div>
                <label className={labelClass}>Cremacao <span className="text-red-400">*</span></label>
                <div className="flex gap-2">
                  <div onClick={() => updateField('cremacao', 'individual')} className={radioClass(form.cremacao === 'individual')}>
                    <div className="font-bold">Individual</div>
                    <div className="text-xs opacity-70 mt-0.5">Cinzas retornam</div>
                  </div>
                  <div onClick={() => updateField('cremacao', 'coletiva')} className={radioClass(form.cremacao === 'coletiva')}>
                    <div className="font-bold">Coletiva</div>
                    <div className="text-xs opacity-70 mt-0.5">Sem retorno</div>
                  </div>
                </div>
                {errors.cremacao && <p className={errorClass}>{errors.cremacao}</p>}
              </div>

              {/* Pagamento */}
              <div>
                <label className={labelClass}>Forma de Pagamento <span className="text-red-400">*</span></label>
                <select className={inputClass('pagamento')} value={form.pagamento} onChange={e => updateField('pagamento', e.target.value)}>
                  <option value="">Selecione...</option>
                  <option value="pix">Pix / Dinheiro</option>
                  <option value="cartao">Cartao de Debito/Credito</option>
                </select>
                {errors.pagamento && <p className={errorClass}>{errors.pagamento}</p>}
                {form.pagamento === 'cartao' && (
                  <div className="mt-2">
                    <select className={inputClass('parcelas')} value={form.parcelas} onChange={e => updateField('parcelas', e.target.value)}>
                      <option value="">Parcelas...</option>
                      <option value="debito">Debito</option>
                      <option value="1x">Credito a vista</option>
                      {[2,3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={`${n}x`}>{n}x</option>)}
                    </select>
                    {errors.parcelas && <p className={errorClass}>{errors.parcelas}</p>}
                  </div>
                )}
              </div>

              {/* Velorio */}
              <div>
                <label className={labelClass}>Velorio presencial em Santos? <span className="text-red-400">*</span></label>
                <div className="flex gap-2">
                  <div onClick={() => updateField('velorio', 'Não')} className={radioClass(form.velorio === 'Não')}>Nao</div>
                  <div onClick={() => updateField('velorio', 'Sim')} className={radioClass(form.velorio === 'Sim')}>Sim</div>
                </div>
                {errors.velorio && <p className={errorClass}>{errors.velorio}</p>}
              </div>

              {/* Acompanhamento */}
              <div>
                <label className={labelClass}>Acompanhamento da cremacao <span className="text-red-400">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: 'Não desejo', l: 'Nao desejo' },
                    { v: 'On-line (tempo real)', l: 'On-line' },
                    { v: 'Vídeo gravado', l: 'Video gravado' },
                    { v: 'Presencial em Pindamonhangaba-SP', l: 'Presencial' },
                    { v: 'Decidirei depois', l: 'Depois' },
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
            </>
          )}

          {/* ========== STEP 3: CONFIRMACAO ========== */}
          {step === 3 && (
            <>
              <h2 className="text-lg font-bold text-slate-800 pb-3 border-b-2 border-slate-100">Confirmacao</h2>

              {/* Review */}
              <div className="space-y-4">
                <div className="bg-slate-50 rounded-xl p-4 space-y-1.5">
                  <h3 className="text-sm font-bold text-blue-700 mb-2">Dados do Tutor</h3>
                  <p className="text-sm"><span className="font-medium text-slate-600">Nome:</span> <span className="text-slate-800">{form.nomeCompleto}</span></p>
                  {form.outrosTutores.filter(Boolean).length > 0 && (
                    <p className="text-sm"><span className="font-medium text-slate-600">Outros:</span> <span className="text-slate-800">{form.outrosTutores.filter(Boolean).join(', ')}</span></p>
                  )}
                  <p className="text-sm"><span className="font-medium text-slate-600">CPF:</span> <span className="text-slate-800">{form.cpf}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Telefone:</span> <span className="text-slate-800">{form.telefone}</span></p>
                  {form.email && <p className="text-sm"><span className="font-medium text-slate-600">E-mail:</span> <span className="text-slate-800">{form.email}</span></p>}
                  <p className="text-sm"><span className="font-medium text-slate-600">Endereco:</span> <span className="text-slate-800">{form.endereco}, {form.numero}{form.complemento ? ` - ${form.complemento}` : ''}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Bairro:</span> <span className="text-slate-800">{form.bairro}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Cidade/UF:</span> <span className="text-slate-800">{form.cidade} - {form.estado}</span></p>
                </div>

                <div className="bg-blue-50 rounded-xl p-4 space-y-1.5">
                  <h3 className="text-sm font-bold text-blue-700 mb-2">Dados do Pet</h3>
                  <p className="text-sm"><span className="font-medium text-slate-600">Nome:</span> <span className="text-slate-800">{form.nomePet}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Idade:</span> <span className="text-slate-800">{form.idade} anos</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Especie:</span> <span className="text-slate-800 capitalize">{form.especie}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Genero:</span> <span className="text-slate-800 capitalize">{form.genero === 'macho' ? 'Macho' : 'Femea'}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Raca:</span> <span className="text-slate-800">{form.raca}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Cor:</span> <span className="text-slate-800">{form.cor}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Peso:</span> <span className="text-slate-800">{form.peso} kg</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Local:</span> <span className="text-slate-800">{form.localizacao}{form.localizacaoOutra ? ` (${form.localizacaoOutra})` : ''}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Cremacao:</span> <span className="text-slate-800 capitalize">{form.cremacao}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Pagamento:</span> <span className="text-slate-800">{form.pagamento === 'pix' ? 'Pix/Dinheiro' : `Cartao ${form.parcelas}`}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Velorio:</span> <span className="text-slate-800">{form.velorio}</span></p>
                  <p className="text-sm"><span className="font-medium text-slate-600">Acompanhamento:</span> <span className="text-slate-800">{form.acompanhamento}</span></p>
                </div>
              </div>

              {/* Como conheceu */}
              <div>
                <label className={labelClass}>Como nos conheceu? <span className="text-red-400">*</span></label>
                <div className="space-y-2">
                  {[
                    'Google', 'Instagram/Facebook', 'Veterinário', 'Parente/Amigo',
                    'Já utilizei a R.I.P. Pet', 'Outro',
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
                      <span className="text-sm text-slate-700">{opt === 'Veterinário' ? 'Veterinario/Clinica' : opt}</span>
                    </label>
                  ))}
                </div>
                {errors.comoConheceu && <p className={errorClass}>{errors.comoConheceu}</p>}

                {form.comoConheceu.includes('Veterinário') && (
                  <div className="mt-3 ml-8">
                    <input className={inputClass('veterinarioEspecificar')} value={form.veterinarioEspecificar} onChange={e => updateField('veterinarioEspecificar', e.target.value)} placeholder="Nome do profissional e/ou clinica" />
                    {errors.veterinarioEspecificar && <p className={errorClass}>{errors.veterinarioEspecificar}</p>}
                  </div>
                )}

                {form.comoConheceu.includes('Outro') && (
                  <div className="mt-3 ml-8">
                    <input className={inputClass('outroEspecificar')} value={form.outroEspecificar} onChange={e => updateField('outroEspecificar', e.target.value)} placeholder="Como nos conheceu?" />
                    {errors.outroEspecificar && <p className={errorClass}>{errors.outroEspecificar}</p>}
                  </div>
                )}
              </div>

              {/* Observacoes */}
              <div>
                <label className={labelClass}>Observacoes</label>
                <textarea className={`${inputClass('observacoes')} resize-none`} rows={3} value={form.observacoes} onChange={e => updateField('observacoes', e.target.value)} placeholder="Alguma informacao adicional?" />
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={prevStep} className="flex-1 py-3.5 border-2 border-slate-200 text-slate-600 rounded-xl text-base font-semibold hover:bg-slate-50 transition-colors">
                  ← Voltar
                </button>
                <button type="button" onClick={handleSubmit} disabled={submitting} className="flex-[2] py-3.5 bg-green-600 text-white rounded-xl text-base font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
                  {submitting ? 'Enviando...' : 'Enviar Ficha ✓'}
                </button>
              </div>
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

export default function FichaSantos() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Carregando...</div>}>
      <FichaSantosContent />
    </Suspense>
  )
}
