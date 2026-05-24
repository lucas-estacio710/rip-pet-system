'use client'

import { useState, useEffect } from 'react'
import { X, AlertTriangle, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Tipos mínimos do que o modal precisa do contrato
type ContratoIn = {
  id: string
  codigo: string
  unidade_id: string | null  // pra criar tutor novo caso o CPF mudou pra um inexistente
  tutor_id: string | null
  // Snapshot tutor (no contrato)
  tutor_nome: string | null
  tutor_cpf: string | null
  tutor_telefone: string | null
  tutor_telefone2: string | null
  tutor_telefone_nome: string | null
  tutor_telefone2_nome: string | null
  tutor_telefone_principal: number | null
  tutor_email: string | null
  tutor_endereco: string | null
  tutor_bairro: string | null
  tutor_cidade: string | null
  tutor_cep: string | null
  // Pet
  pet_nome: string | null
  pet_especie: string | null
  pet_genero: string | null
  pet_raca: string | null
  pet_cor: string | null
  pet_idade_anos: number | null
  pet_peso: number | null
  // Serviço
  tipo_cremacao: string | null
  velorio_deseja: boolean | null
  seguradora: string | null
  // Cadastro central (pra extrair numero/complemento/estado, se houver)
  tutor?: {
    numero: string | null
    complemento: string | null
    estado: string | null
  } | null
}

type Props = {
  isOpen: boolean
  onClose: () => void
  contrato: ContratoIn
  onSaved: () => void | Promise<void>
}

type FormState = {
  // Tutor
  tutor_nome: string
  tutor_cpf: string
  tutor_telefone: string
  tutor_telefone_nome: string
  tutor_telefone2: string
  tutor_telefone2_nome: string
  tutor_telefone_principal: 1 | 2
  tutor_email: string
  tutor_endereco: string
  tutor_numero: string
  tutor_complemento: string
  tutor_bairro: string
  tutor_cidade: string
  tutor_estado: string
  tutor_cep: string
  // Pet
  pet_nome: string
  pet_especie: string
  pet_genero: string
  pet_raca: string
  pet_cor: string
  pet_idade_anos: string
  pet_peso: string
  // Serviço
  tipo_cremacao: string
  velorio_deseja: 'sim' | 'nao' | ''
  seguradora: string
}

// Label extra pra mudança de tutor_id (não é campo do form, mas vai pro histórico)
const LABEL_TUTOR_ID = 'Tutor Vinculado'

const CAMPO_LABELS: Record<keyof FormState, string> = {
  tutor_nome: 'Nome do Tutor',
  tutor_cpf: 'CPF/CNPJ',
  tutor_telefone: 'Telefone 1',
  tutor_telefone_nome: 'Apelido Telefone 1',
  tutor_telefone2: 'Telefone 2',
  tutor_telefone2_nome: 'Apelido Telefone 2',
  tutor_telefone_principal: 'Telefone Principal',
  tutor_email: 'E-mail',
  tutor_endereco: 'Endereço',
  tutor_numero: 'Número',
  tutor_complemento: 'Complemento',
  tutor_bairro: 'Bairro',
  tutor_cidade: 'Cidade',
  tutor_estado: 'Estado',
  tutor_cep: 'CEP',
  pet_nome: 'Nome do Pet',
  pet_especie: 'Espécie',
  pet_genero: 'Gênero',
  pet_raca: 'Raça',
  pet_cor: 'Cor',
  pet_idade_anos: 'Idade (anos)',
  pet_peso: 'Peso (kg)',
  tipo_cremacao: 'Tipo de Cremação',
  velorio_deseja: 'Velório',
  seguradora: 'Seguradora',
}

function parseEnderecoConcatenado(snapshot: string | null, fallback?: { numero?: string | null; complemento?: string | null }) {
  // Snapshot vem como "Avenida X, 99 - apt. 93". Quebra em endereco / numero / complemento.
  // Se já houver dados no cadastro central, usa eles (mais confiáveis).
  if (fallback?.numero || fallback?.complemento) {
    const endereco = (snapshot || '').split(',')[0].trim()
    return { endereco, numero: fallback.numero || '', complemento: fallback.complemento || '' }
  }
  if (!snapshot) return { endereco: '', numero: '', complemento: '' }
  // tenta "rua, numero - complemento"
  const m = snapshot.match(/^(.*?),\s*([^\s-][^-]*?)(?:\s*-\s*(.+))?$/)
  if (m) return { endereco: m[1].trim(), numero: (m[2] || '').trim(), complemento: (m[3] || '').trim() }
  return { endereco: snapshot, numero: '', complemento: '' }
}

function buildFormFromContrato(c: ContratoIn): FormState {
  const { endereco, numero, complemento } = parseEnderecoConcatenado(c.tutor_endereco, {
    numero: c.tutor?.numero,
    complemento: c.tutor?.complemento,
  })
  return {
    tutor_nome: c.tutor_nome || '',
    tutor_cpf: c.tutor_cpf || '',
    tutor_telefone: c.tutor_telefone || '',
    tutor_telefone_nome: c.tutor_telefone_nome || '',
    tutor_telefone2: c.tutor_telefone2 || '',
    tutor_telefone2_nome: c.tutor_telefone2_nome || '',
    tutor_telefone_principal: (c.tutor_telefone_principal === 2 ? 2 : 1),
    tutor_email: c.tutor_email || '',
    tutor_endereco: endereco,
    tutor_numero: numero,
    tutor_complemento: complemento,
    tutor_bairro: c.tutor_bairro || '',
    tutor_cidade: c.tutor_cidade || '',
    tutor_estado: c.tutor?.estado || '',
    tutor_cep: c.tutor_cep || '',
    pet_nome: c.pet_nome || '',
    pet_especie: c.pet_especie || '',
    pet_genero: c.pet_genero || '',
    pet_raca: c.pet_raca || '',
    pet_cor: c.pet_cor || '',
    pet_idade_anos: c.pet_idade_anos != null ? String(c.pet_idade_anos) : '',
    pet_peso: c.pet_peso != null ? String(c.pet_peso) : '',
    tipo_cremacao: c.tipo_cremacao || '',
    velorio_deseja: c.velorio_deseja === true ? 'sim' : c.velorio_deseja === false ? 'nao' : '',
    seguradora: c.seguradora || '',
  }
}

export default function AlterarDadosEnviadosModal({ isOpen, onClose, contrato, onSaved }: Props) {
  const supabase = createClient()
  const [form, setForm] = useState<FormState>(() => buildFormFromContrato(contrato))
  const [original] = useState<FormState>(() => buildFormFromContrato(contrato))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // Re-inicializa quando o contrato muda (abertura nova)
  useEffect(() => {
    if (isOpen) {
      const f = buildFormFromContrato(contrato)
      setForm(f)
      setErro('')
    }
  }, [isOpen, contrato])

  if (!isOpen) return null

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function salvar() {
    setSalvando(true)
    setErro('')
    try {
      // 1. Diffs por campo (pra historico)
      const alterados: { campo: string; anterior: string; novo: string; label: string }[] = []
      ;(Object.keys(form) as (keyof FormState)[]).forEach(k => {
        const a = String(original[k] ?? '')
        const n = String(form[k] ?? '')
        if (a !== n) alterados.push({ campo: k, anterior: a, novo: n, label: CAMPO_LABELS[k] || k })
      })

      if (alterados.length === 0) {
        setErro('Nenhuma alteração para salvar.')
        setSalvando(false)
        return
      }

      // 2. Detectar mudança real de CPF (por dígitos — ignora diferença de formatação)
      const cpfDigAntigo = String(original.tutor_cpf || '').replace(/\D/g, '')
      const cpfDigNovo = String(form.tutor_cpf || '').replace(/\D/g, '')
      const cpfMudou = cpfDigAntigo !== cpfDigNovo && (cpfDigNovo.length === 11 || cpfDigNovo.length === 14)

      // 3. Se CPF mudou → buscar tutor existente, confirmar com operador, repontar
      let targetTutorId: string | null = contrato.tutor_id
      let tutorExistente: { id: string; nome: string } | null = null
      let criouTutorNovo = false

      if (cpfMudou && cpfDigNovo) {
        const formatado = cpfDigNovo.length === 11
          ? `${cpfDigNovo.slice(0, 3)}.${cpfDigNovo.slice(3, 6)}.${cpfDigNovo.slice(6, 9)}-${cpfDigNovo.slice(9)}`
          : `${cpfDigNovo.slice(0, 2)}.${cpfDigNovo.slice(2, 5)}.${cpfDigNovo.slice(5, 8)}/${cpfDigNovo.slice(8, 12)}-${cpfDigNovo.slice(12)}`
        const { data: tutorEx } = await supabase
          .from('tutores')
          .select('id, nome')
          .or(`cpf.eq.${formatado},cpf.eq.${cpfDigNovo}`)
          .limit(1)
          .maybeSingle() as { data: { id: string; nome: string } | null }
        tutorExistente = tutorEx

        const msg = tutorEx
          ? `O CPF foi alterado.\n\nJá existe um cadastro com esse CPF: ${tutorEx.nome}\n\nO contrato será REPONTADO pra esse cadastro e os dados do form serão gravados nele. O cadastro original NÃO será modificado.\n\nProsseguir?`
          : `O CPF foi alterado e não há cadastro com esse CPF na base.\n\nUm NOVO cadastro de tutor será criado e o contrato será repontado pra ele. O cadastro original NÃO será modificado.\n\nProsseguir?`
        if (!window.confirm(msg)) {
          setSalvando(false)
          return
        }

        if (tutorEx) {
          targetTutorId = tutorEx.id
        } else {
          // Criar novo cadastro
          const novoData = {
            nome: form.tutor_nome || null,
            cpf: form.tutor_cpf || null,
            telefone: form.tutor_telefone || null,
            telefone_nome: form.tutor_telefone_nome || null,
            telefone2: form.tutor_telefone2 || null,
            telefone2_nome: form.tutor_telefone2_nome || null,
            telefone_principal: form.tutor_telefone_principal,
            email: form.tutor_email || null,
            endereco: form.tutor_endereco || null,
            numero: form.tutor_numero || null,
            complemento: form.tutor_complemento || null,
            bairro: form.tutor_bairro || null,
            cidade: form.tutor_cidade || null,
            estado: form.tutor_estado || null,
            cep: form.tutor_cep || null,
            unidade_id: contrato.unidade_id,
          }
          const { data: novoTutor, error: errNovo } = await supabase
            .from('tutores')
            .insert(novoData as never)
            .select('id')
            .single() as { data: { id: string } | null; error: { message: string } | null }
          if (errNovo || !novoTutor) throw new Error('Erro ao criar novo cadastro de tutor: ' + (errNovo?.message || 'desconhecido'))
          targetTutorId = novoTutor.id
          criouTutorNovo = true
        }
      }

      // 4. Atualizar cadastro do tutor target (a menos que tenha acabado de criar — já tem os dados)
      if (targetTutorId && !criouTutorNovo) {
        const updateTutor: Record<string, unknown> = {
          nome: form.tutor_nome || null,
          cpf: form.tutor_cpf || null,
          telefone: form.tutor_telefone || null,
          telefone_nome: form.tutor_telefone_nome || null,
          telefone2: form.tutor_telefone2 || null,
          telefone2_nome: form.tutor_telefone2_nome || null,
          telefone_principal: form.tutor_telefone_principal,
          email: form.tutor_email || null,
          endereco: form.tutor_endereco || null,
          numero: form.tutor_numero || null,
          complemento: form.tutor_complemento || null,
          bairro: form.tutor_bairro || null,
          cidade: form.tutor_cidade || null,
          estado: form.tutor_estado || null,
          cep: form.tutor_cep || null,
        }
        const { error: errTut } = await supabase.from('tutores').update(updateTutor as never).eq('id', targetTutorId)
        if (errTut) throw new Error('Erro ao atualizar cadastro do tutor: ' + errTut.message)
      }

      // 5. UPDATE no contrato (snapshot + pet + serviço + tutor_id se mudou)
      const tutorEnderecoSnapshot = [
        form.tutor_endereco,
        form.tutor_numero ? ', ' + form.tutor_numero : '',
        form.tutor_complemento ? ' - ' + form.tutor_complemento : '',
      ].join('').trim()

      const updateContrato: Record<string, unknown> = {
        tutor_id: targetTutorId,
        tutor_nome: form.tutor_nome || null,
        tutor_cpf: form.tutor_cpf || null,
        tutor_telefone: form.tutor_telefone || null,
        tutor_telefone_nome: form.tutor_telefone_nome || null,
        tutor_telefone2: form.tutor_telefone2 || null,
        tutor_telefone2_nome: form.tutor_telefone2_nome || null,
        tutor_telefone_principal: form.tutor_telefone_principal,
        tutor_email: form.tutor_email || null,
        tutor_endereco: tutorEnderecoSnapshot || null,
        tutor_bairro: form.tutor_bairro || null,
        tutor_cidade: form.tutor_cidade || null,
        tutor_cep: form.tutor_cep || null,
        pet_nome: form.pet_nome || null,
        pet_especie: form.pet_especie || null,
        pet_genero: form.pet_genero || null,
        pet_raca: form.pet_raca || null,
        pet_cor: form.pet_cor || null,
        pet_idade_anos: form.pet_idade_anos ? parseInt(form.pet_idade_anos, 10) : null,
        pet_peso: form.pet_peso ? parseFloat(form.pet_peso) : null,
        tipo_cremacao: form.tipo_cremacao || null,
        velorio_deseja: form.velorio_deseja === '' ? null : form.velorio_deseja === 'sim',
        seguradora: form.seguradora || null,
      }
      const { error: errCtr } = await supabase.from('contratos').update(updateContrato as never).eq('id', contrato.id)
      if (errCtr) throw new Error('Erro ao atualizar contrato: ' + errCtr.message)

      // 6. Se mudou tutor_id, registrar essa mudança especificamente no histórico
      if (targetTutorId !== contrato.tutor_id) {
        alterados.push({
          campo: 'tutor_id',
          label: LABEL_TUTOR_ID,
          anterior: contrato.tutor_id || '',
          novo: targetTutorId || '',
        })
      }

      // 7. Histórico — uma linha por campo alterado
      const { data: { user } } = await supabase.auth.getUser()
      const notaBase = 'Edição emergencial via "Alterar Dados Enviados" (gerente).'
      const notaRepontar = tutorExistente
        ? ` Contrato repontado pro cadastro existente "${tutorExistente.nome}" (${targetTutorId}).`
        : criouTutorNovo ? ` Novo cadastro de tutor criado (${targetTutorId}) e contrato repontado.` : ''
      const linhasHistorico = alterados.map(a => ({
        entidade: 'contratos',
        entidade_id: contrato.id,
        entidade_nome: contrato.codigo,
        campo: a.campo,
        campo_label: a.label,
        valor_anterior: a.anterior || null,
        valor_novo: a.novo || null,
        tipo: 'edicao_dados_enviados',
        nota: notaBase + notaRepontar,
        alterado_por: user?.id ?? null,
        alterado_por_email: user?.email ?? null,
      }))
      await supabase.from('historico_alteracoes').insert(linhasHistorico as never)

      await onSaved()
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao salvar'
      setErro(msg)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col border-2 border-red-500/40"
        onClick={e => e.stopPropagation()}
      >
        {/* Header — fundo vermelho sólido (legível em qualquer tema) */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-red-800 bg-red-600 text-white rounded-t-2xl">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            <h3 className="text-base font-bold">Alterar Dados Enviados pelo Tutor</h3>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white" disabled={salvando}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Banner de aviso — fundo vermelho sólido + texto branco */}
        <div className="px-5 py-3 bg-red-700 border-b border-red-800 text-[13px] text-white leading-snug">
          <p className="font-bold mb-1">⚠️ Atenção — você está editando dados que o tutor enviou na ficha.</p>
          <p className="text-white/95">Antes de salvar, <strong className="font-bold">formalize a alteração por escrito</strong> (WhatsApp, e-mail ou áudio do tutor) e <strong className="font-bold">guarde a evidência</strong>. Esta ação ficará registrada no histórico do contrato.</p>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto space-y-5 text-sm">
          {/* TUTOR */}
          <section>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 pb-1 border-b border-slate-700">Tutor</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Nome" value={form.tutor_nome} onChange={v => set('tutor_nome', v)} className="md:col-span-2" />
              <Field label="CPF / CNPJ" value={form.tutor_cpf} onChange={v => set('tutor_cpf', v)} />
              <Field label="E-mail" value={form.tutor_email} onChange={v => set('tutor_email', v)} />
              <Field label="Telefone 1" value={form.tutor_telefone} onChange={v => set('tutor_telefone', v)} />
              <Field label="Apelido Telefone 1" value={form.tutor_telefone_nome} onChange={v => set('tutor_telefone_nome', v)} placeholder="Como chamar quem atende" />
              <Field label="Telefone 2" value={form.tutor_telefone2} onChange={v => set('tutor_telefone2', v)} />
              <Field label="Apelido Telefone 2" value={form.tutor_telefone2_nome} onChange={v => set('tutor_telefone2_nome', v)} />
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Telefone principal</label>
                <select
                  value={form.tutor_telefone_principal}
                  onChange={e => set('tutor_telefone_principal', parseInt(e.target.value, 10) as 1 | 2)}
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
                >
                  <option value={1}>Telefone 1</option>
                  <option value={2}>Telefone 2</option>
                </select>
              </div>
              <Field label="CEP" value={form.tutor_cep} onChange={v => set('tutor_cep', v)} />
              <Field label="Endereço (rua/avenida)" value={form.tutor_endereco} onChange={v => set('tutor_endereco', v)} className="md:col-span-2" />
              <Field label="Número" value={form.tutor_numero} onChange={v => set('tutor_numero', v)} />
              <Field label="Complemento" value={form.tutor_complemento} onChange={v => set('tutor_complemento', v)} />
              <Field label="Bairro" value={form.tutor_bairro} onChange={v => set('tutor_bairro', v)} />
              <Field label="Cidade" value={form.tutor_cidade} onChange={v => set('tutor_cidade', v)} />
              <Field label="Estado (UF)" value={form.tutor_estado} onChange={v => set('tutor_estado', v.toUpperCase().slice(0, 2))} />
            </div>
          </section>

          {/* PET */}
          <section>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 pb-1 border-b border-slate-700">Pet</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Nome do Pet" value={form.pet_nome} onChange={v => set('pet_nome', v)} />
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Espécie</label>
                <select value={form.pet_especie} onChange={e => set('pet_especie', e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm">
                  <option value="">—</option>
                  <option value="canina">Canina</option>
                  <option value="felina">Felina</option>
                  <option value="exotica">Exótica</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Gênero</label>
                <select value={form.pet_genero} onChange={e => set('pet_genero', e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm">
                  <option value="">—</option>
                  <option value="macho">Macho</option>
                  <option value="femea">Fêmea</option>
                </select>
              </div>
              <Field label="Raça" value={form.pet_raca} onChange={v => set('pet_raca', v)} />
              <Field label="Cor" value={form.pet_cor} onChange={v => set('pet_cor', v)} />
              <Field label="Idade (anos)" value={form.pet_idade_anos} onChange={v => set('pet_idade_anos', v.replace(/\D/g, ''))} />
              <Field label="Peso (kg)" value={form.pet_peso} onChange={v => set('pet_peso', v.replace(/[^\d.,]/g, '').replace(',', '.'))} />
            </div>
          </section>

          {/* SERVIÇO */}
          <section>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 pb-1 border-b border-slate-700">Serviço</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Tipo de Cremação</label>
                <select value={form.tipo_cremacao} onChange={e => set('tipo_cremacao', e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm">
                  <option value="">—</option>
                  <option value="individual">Individual</option>
                  <option value="coletiva">Coletiva</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Velório</label>
                <select value={form.velorio_deseja} onChange={e => set('velorio_deseja', e.target.value as 'sim' | 'nao' | '')} className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm">
                  <option value="">—</option>
                  <option value="sim">Deseja</option>
                  <option value="nao">Não deseja</option>
                </select>
              </div>
              <Field label="Seguradora (se houver)" value={form.seguradora} onChange={v => set('seguradora', v)} />
            </div>
            <p className="mt-2 text-[11px] text-slate-500 italic">Pagamentos são gerenciados pelo card Financeiro do contrato (fluxo próprio).</p>
          </section>

          {erro && (
            <div className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white font-medium">{erro}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-700 flex justify-end gap-2 bg-slate-900/40">
          <button
            onClick={onClose}
            disabled={salvando}
            className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {salvando ? 'Salvando…' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, className }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[11px] text-slate-400 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-red-500/60"
      />
    </div>
  )
}
