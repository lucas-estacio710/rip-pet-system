'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { User, PawPrint, Flame, Search, Check, Plus, Pencil, Loader2, Building2, UserCheck } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'

// ============================================
// Types
// ============================================
type Ficha = {
  id: string
  created_at: string
  nome_completo: string
  cpf: string
  telefone: string
  email: string | null
  cep: string
  estado: string
  cidade: string
  bairro: string
  endereco: string
  numero: string
  complemento: string | null
  outros_tutores: string[] | null
  nome_pet: string
  idade: string | null
  especie: string
  genero: string
  raca: string | null
  cor: string
  peso: string | null
  cremacao: string
  valor: number | null
  pagamento: string
  parcelas: string | null
  velorio: string
  acompanhamento: string
  localizacao: string
  localizacao_outra: string | null
  como_conheceu: string[] | null
  veterinario_especificar: string | null
  outro_especificar: string | null
  observacoes: string | null
  unidade_id: string
}

type Estabelecimento = { id: string; nome: string; tipo: string | null }
type Contato = { id: string; nome: string; cargo: string | null; estabelecimento_id: string | null }
type Funcionario = { id: string; nome: string }
type TutorExistente = { id: string; nome: string } | null

type Props = {
  isOpen: boolean
  onClose: () => void
  ficha: Ficha | null
  onSuccess: (contratoId: string) => void
}

// Nomes compostos: se o primeiro nome é um desses prefixos, inclui o segundo nome
const PREFIXOS_NOME_COMPOSTO = [
  'maria', 'ana', 'anna', 'rosa',
  'joao', 'joão', 'jose', 'josé',
  'pedro', 'luiz', 'luis', 'luís', 'carlos', 'marco',
]

function capitalizarNome(nome: string): string {
  if (!nome) return ''
  return nome.split(/\s+/).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ')
}

function getPrimeiroNome(nomeCompleto: string | null | undefined): string {
  if (!nomeCompleto) return ''
  const partes = nomeCompleto.trim().split(/\s+/)
  if (partes.length <= 1) return capitalizarNome(partes[0] || '')
  const primeiroLower = partes[0].toLowerCase()
  const qtd = PREFIXOS_NOME_COMPOSTO.includes(primeiroLower) ? 2 : 1
  return capitalizarNome(partes.slice(0, qtd).join(' '))
}

// ============================================
// Component
// ============================================
export default function TratativaModal({ isOpen, onClose, ficha, onSuccess }: Props) {
  const { toast } = useToast()
  const supabase = createClient()
  const { hasModule, currentUnit } = useUnit()
  const temPadronizacaoClinicas = hasModule('cb_padronizacao_clinicas')

  // Lookups
  const [estabelecimentos, setEstabelecimentos] = useState<Estabelecimento[]>([])
  const [contatos, setContatos] = useState<Contato[]>([])
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [tutorExistente, setTutorExistente] = useState<TutorExistente>(null)
  const [tutorChecked, setTutorChecked] = useState(false)

  // Edições nos dados originais da ficha
  const [fichaEdits, setFichaEdits] = useState<Record<string, string>>({})
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')

  // Ficha com edições aplicadas
  const fichaAtual = ficha ? {
    ...ficha,
    ...fichaEdits,
    // outros_tutores é armazenado como JSON string nas edições
    outros_tutores: fichaEdits.outros_tutores
      ? JSON.parse(fichaEdits.outros_tutores) as string[]
      : ficha.outros_tutores,
  } as Ficha : null

  function getFichaValue(key: keyof Ficha): string {
    if (fichaEdits[key] !== undefined) return fichaEdits[key]
    return String(ficha?.[key] ?? '')
  }

  function startEdit(key: string, currentValue: string) {
    setEditingField(key)
    setEditingValue(currentValue || '')
  }

  function confirmEdit() {
    if (editingField && ficha) {
      // Edição de outros_tutores individual (outros_tutores_0, outros_tutores_1, etc)
      if (editingField.startsWith('outros_tutores_')) {
        const idx = parseInt(editingField.split('_')[2])
        const atual = fichaEdits.outros_tutores
          ? JSON.parse(fichaEdits.outros_tutores) as string[]
          : [...(ficha.outros_tutores || [])]
        atual[idx] = editingValue
        setFichaEdits(prev => ({ ...prev, outros_tutores: JSON.stringify(atual) }))
      } else {
        const original = String((ficha as Record<string, unknown>)[editingField] ?? '')
        if (editingValue !== original) {
          setFichaEdits(prev => ({ ...prev, [editingField]: editingValue }))
        }
      }
    }
    setEditingField(null)
    setEditingValue('')
  }

  function cancelEdit() {
    // Se cancelou a adição de um nome vazio no certificado, remover o item
    if (editingField?.startsWith('outros_tutores_') && editingValue === '') {
      const idx = parseInt(editingField.split('_')[2])
      const atual = fichaEdits.outros_tutores
        ? JSON.parse(fichaEdits.outros_tutores) as string[]
        : [...(ficha?.outros_tutores || [])]
      if (!atual[idx]) {
        atual.splice(idx, 1)
        if (atual.length > 0 || fichaEdits.outros_tutores) {
          setFichaEdits(prev => ({ ...prev, outros_tutores: JSON.stringify(atual) }))
        }
      }
    }
    setEditingField(null)
    setEditingValue('')
  }

  // Estabelecimento autocomplete
  const [estabBusca, setEstabBusca] = useState('')
  const [estabAberto, setEstabAberto] = useState(false)
  const [estabId, setEstabId] = useState<string | null>(null)
  const [estabNome, setEstabNome] = useState('')
  const [autonomo, setAutonomo] = useState(false)
  const estabRef = useRef<HTMLDivElement>(null)

  // Contato (pessoa que indicou) autocomplete
  const [indicBusca, setIndicBusca] = useState('')
  const [indicAberto, setIndicAberto] = useState(false)
  const [indicId, setIndicId] = useState<string | null>(null)
  const [indicNome, setIndicNome] = useState('')
  const [indicCargo, setIndicCargo] = useState('')
  const indicRef = useRef<HTMLDivElement>(null)

  // Form fields
  const tipoPlano = 'emergencial' as const
  const [funcionarioId, setFuncionarioId] = useState('')
  // Telefone — operador confirma ou adiciona secundário
  const [telefoneConfirmado, setTelefoneConfirmado] = useState(false)
  const [telefone2, setTelefone2] = useState('')
  const [usarTelefone2ComoPrincipal, setUsarTelefone2ComoPrincipal] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [codigoManual, setCodigoManual] = useState(false)
  const [valorPlano, setValorPlano] = useState('')
  const [descontoPreVenda, setDescontoPreVenda] = useState('')
  const [localColeta, setLocalColeta] = useState<'residencia' | 'clinica' | 'unidade' | 'outro' | ''>('')
  const [enderecoOutro, setEnderecoOutro] = useState('')
  // Bloco Acolhimento
  const [semLocal, setSemLocal] = useState(false)
  const [semResponsavel, setSemResponsavel] = useState(false)
  const [dataHoraAcolhimento, setDataHoraAcolhimento] = useState('')
  const [semDataHora, setSemDataHora] = useState(false)
  const [lacre, setLacre] = useState('')
  const [semLacre, setSemLacre] = useState(false)
  // Bloco Indicação
  const [mostrarIndicacao, setMostrarIndicacao] = useState(false)
  const [indicacaoDeClinica, setIndicacaoDeClinica] = useState(false) // true = veio de vet/clínica, abre campos direto
  const [teveIndicacao, setTeveIndicacao] = useState(false) // toggle manual pra indicações não-clínica
  const [indicNomeQuemIndicou, setIndicNomeQuemIndicou] = useState('')
  const [indicNomeAtivo, setIndicNomeAtivo] = useState(false)
  const [indicHospClinica, setIndicHospClinica] = useState('')
  const [indicHospAtivo, setIndicHospAtivo] = useState(false)
  // Legado (manter pra padronização com busca)
  const [clinicaTextoLivre, setClinicaTextoLivre] = useState('')
  // Outros
  const [dataContrato, setDataContrato] = useState(new Date().toISOString().split('T')[0])

  const [salvando, setSalvando] = useState(false)

  // ============================================
  // Data loading
  // ============================================
  useEffect(() => {
    if (!isOpen || !ficha) return
    async function loadData() {
      const [{ data: estabs }, { data: conts }, { data: funcs }] = await Promise.all([
        supabase.from('estabelecimentos').select('id, nome, tipo').order('nome'),
        supabase.from('contatos').select('id, nome, cargo, estabelecimento_id').order('nome'),
        supabase.from('funcionarios').select('id, nome').eq('ativo', true).eq('unidade_id', ficha!.unidade_id).order('nome'),
      ])
      if (estabs) setEstabelecimentos(estabs as Estabelecimento[])
      if (conts) setContatos(conts as Contato[])
      if (funcs) setFuncionarios(funcs as Funcionario[])
    }
    loadData()
  }, [isOpen, ficha])

  // Check tutor by CPF
  useEffect(() => {
    if (!isOpen || !ficha?.cpf) {
      setTutorExistente(null)
      setTutorChecked(false)
      return
    }
    async function checkTutor() {
      const cpfLimpo = ficha!.cpf.replace(/\D/g, '')
      if (cpfLimpo.length !== 11 || !/^\d{11}$/.test(cpfLimpo)) {
        setTutorExistente(null)
        setTutorChecked(true)
        return
      }
      // Use ilike with % to match both formatted (123.456.789-00) and clean (12345678900)
      const { data } = await supabase
        .from('tutores')
        .select('id, nome')
        .ilike('cpf', `%${cpfLimpo}%`)
        .limit(1)
        .maybeSingle()
      setTutorExistente(data)
      setTutorChecked(true)
    }
    checkTutor()
  }, [isOpen, ficha?.cpf])

  // Pre-populate fields from ficha
  useEffect(() => {
    if (!isOpen || !ficha) return
    if (ficha.veterinario_especificar) {
      setEstabBusca(ficha.veterinario_especificar)
    }
    if (ficha.valor != null) {
      setValorPlano(String(ficha.valor))
    }
  }, [isOpen, ficha])

  // Auto-generate codigo: AA+mes(3 letras)+dd PrimeiroNome EM/PV Pet IND/COL
  useEffect(() => {
    if (!isOpen || !ficha || codigoManual) return
    const now = new Date(dataContrato + 'T12:00:00')
    const yy = String(now.getFullYear()).slice(-2)
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const siglaCremacao = ficha.cremacao?.toLowerCase() === 'individual' ? 'IND' : 'COL'
    const tutor3 = (ficha.nome_completo || '').trim().slice(0, 3).toUpperCase()
    const pet3 = (ficha.nome_pet || '').trim().slice(0, 3).toUpperCase()
    const unidadeCod = currentUnit?.codigo || ''
    setCodigo(`${unidadeCod}${yy}${mm}${dd}${siglaCremacao}${tutor3}${pet3}`)
  }, [isOpen, ficha, dataContrato, codigoManual, currentUnit])

  // Reset form on close
  useEffect(() => {
    if (!isOpen) {
      setFichaEdits({})
      setEditingField(null)
      setEstabId(null)
      setEstabNome('')
      setEstabBusca('')
      setAutonomo(false)
      setIndicId(null)
      setIndicNome('')
      setIndicBusca('')
      setIndicCargo('')
      setFuncionarioId('')
      setCodigo('')
      setCodigoManual(false)
      setValorPlano('')
      setLacre('')
      setSemLacre(false)
      setDataContrato(new Date().toISOString().split('T')[0])
      setSalvando(false)
      setTutorExistente(null)
      setTutorChecked(false)
      setLocalColeta('')
      setClinicaTextoLivre('')
      setEnderecoOutro('')
      setDescontoPreVenda('')
      setTelefoneConfirmado(false)
      setTelefone2('')
      setUsarTelefone2ComoPrincipal(false)
      setSemLocal(false)
      setSemResponsavel(false)
      setDataHoraAcolhimento('')
      setSemDataHora(false)
      setMostrarIndicacao(false)
      setIndicacaoDeClinica(false)
      setTeveIndicacao(false)
      setIndicNomeQuemIndicou('')
      setIndicNomeAtivo(false)
      setIndicHospClinica('')
      setIndicHospAtivo(false)
    }
  }, [isOpen])

  // Pré-setar local de coleta baseado na ficha do tutor
  useEffect(() => {
    if (!isOpen || !ficha) return
    const loc = ficha.localizacao || ''
    if (loc.includes('Residência')) {
      setLocalColeta('residencia')
    } else if (loc.includes('Hospital') || loc.includes('Clínica')) {
      setLocalColeta('clinica')
      if (ficha.localizacao_outra) setClinicaTextoLivre(ficha.localizacao_outra)
    } else if (loc.includes('Unidade')) {
      setLocalColeta('unidade')
    } else if (loc === 'Outro') {
      setLocalColeta('outro')
      if (ficha.localizacao_outra) setEnderecoOutro(ficha.localizacao_outra)
    }

    // Pré-setar indicação
    const conheceu = ficha.como_conheceu || []
    const veioDeClinica = !!(ficha.veterinario_especificar ||
      conheceu.some(c => c.includes('Veterinário') || c.includes('Indicação em Clínica')))
    const temAlgumaFonte = conheceu.length > 0 || !!ficha.veterinario_especificar || !!ficha.outro_especificar

    setMostrarIndicacao(temAlgumaFonte)
    setIndicacaoDeClinica(veioDeClinica)
    setTeveIndicacao(veioDeClinica) // se veio de clínica, já abre os campos

    if (ficha.veterinario_especificar) {
      setIndicNomeQuemIndicou(ficha.veterinario_especificar)
      setIndicNomeAtivo(true)
    }
  }, [isOpen, ficha])

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (estabRef.current && !estabRef.current.contains(e.target as Node)) setEstabAberto(false)
      if (indicRef.current && !indicRef.current.contains(e.target as Node)) setIndicAberto(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ============================================
  // Filtered lists
  // ============================================
  const estabsFiltrados = estabBusca.trim()
    ? estabelecimentos.filter(e => e.nome.toLowerCase().includes(estabBusca.toLowerCase())).slice(0, 15)
    : estabelecimentos.slice(0, 15)

  // Contatos: filter by selected establishment, then by search text
  const contatosFiltrados = (() => {
    let lista = contatos
    if (estabId) lista = lista.filter(c => c.estabelecimento_id === estabId)
    if (indicBusca.trim()) lista = lista.filter(c => c.nome.toLowerCase().includes(indicBusca.toLowerCase()))
    return lista.slice(0, 10)
  })()

  // ============================================
  // processarFicha
  // ============================================
  async function processarFicha() {
    if (!ficha || !codigo.trim()) return
    setSalvando(true)

    // Usar ficha com edições aplicadas
    const f = fichaAtual!

    try {
      // Step 0: Salvar edições na ficha original (se houve)
      if (Object.keys(fichaEdits).length > 0) {
        const editsParaSalvar = { ...fichaEdits }
        // outros_tutores: converter JSON string de volta pra array
        if (editsParaSalvar.outros_tutores) {
          editsParaSalvar.outros_tutores = JSON.parse(editsParaSalvar.outros_tutores)
        }
        await supabase.from('fichas').update(editsParaSalvar as never).eq('id', ficha.id)
      }

      // Step 1: Find or create tutor
      let tutorId = tutorExistente?.id || null
      if (!tutorId) {
        const { data: novoTutor, error: errTutor } = await supabase
          .from('tutores')
          .insert({
            nome: f.nome_completo,
            cpf: f.cpf,
            telefone: usarTelefone2ComoPrincipal && telefone2.trim() ? telefone2.replace(/\D/g, '') : f.telefone,
            telefone2: telefone2.trim() ? (usarTelefone2ComoPrincipal ? f.telefone : telefone2.replace(/\D/g, '')) : null,
            email: f.email || null,
            cep: f.cep,
            endereco: f.endereco,
            numero: f.numero,
            complemento: f.complemento || null,
            bairro: f.bairro,
            cidade: f.cidade,
            estado: f.estado,
            unidade_id: f.unidade_id,
          } as never)
          .select('id')
          .single() as { data: { id: string } | null; error: { message: string } | null }
        if (errTutor) throw new Error(`Erro ao criar tutor: ${errTutor.message}`)
        tutorId = novoTutor!.id
      }

      // Step 2: Map fonte_conhecimento (ficha → nome exato no banco)
      let fonteConhecimentoId: string | null = null
      if (f.como_conheceu && f.como_conheceu.length > 0) {
        const fonteMap: Record<string, string> = {
          'Google': 'Google',
          'Instagram/Facebook': 'Instagram/Facebook',
          'Veterinário': 'Indicação em Clínica',
          'Parente/Amigo': 'Parente/Amigo',
          'Já utilizei a R.I.P. Pet': 'Cliente',
          'Outro': 'Outro',
        }
        const nomeExato = fonteMap[f.como_conheceu[0]] || f.como_conheceu[0]
        const { data: fonte } = await supabase
          .from('fontes_conhecimento')
          .select('id')
          .eq('nome', nomeExato)
          .maybeSingle() as { data: { id: string } | null }
        if (fonte) fonteConhecimentoId = fonte.id
      }

      // Step 3 & 4: Resolve estabelecimento + contato
      let resolvedEstabId: string | null = null
      let resolvedContatoId: string | null = null
      let clinicaColetaNome: string | null = null

      if (temPadronizacaoClinicas) {
        // COM padronização — autocomplete de estabelecimentos
        const AUTONOMOS_ESTAB_ID = 'b4eedcff-7ccf-4cfb-bf3a-1978eeec6382'
        if (autonomo) {
          resolvedEstabId = AUTONOMOS_ESTAB_ID
          clinicaColetaNome = 'Autônomo'
        } else {
          resolvedEstabId = estabId
          clinicaColetaNome = estabNome.trim() || null
          if (!resolvedEstabId && estabNome.trim()) {
            const { data: novoEstab } = await supabase
              .from('estabelecimentos')
              .insert({ nome: estabNome.trim(), tipo: 'clinica' } as never)
              .select('id')
              .single() as { data: { id: string } | null }
            if (novoEstab) resolvedEstabId = novoEstab.id
          }
        }

        // Resolve contato (quem indicou)
        resolvedContatoId = indicId
        if (!resolvedContatoId && indicNome.trim()) {
          let query = supabase
            .from('contatos')
            .select('id')
            .ilike('nome', indicNome.trim())
            .limit(1)
          if (resolvedEstabId) {
            query = query.eq('estabelecimento_id', resolvedEstabId)
          }
          const { data: contatoExist } = await query.maybeSingle() as { data: { id: string } | null }

          if (contatoExist) {
            resolvedContatoId = contatoExist.id
          } else {
            const { data: novoContato } = await supabase
              .from('contatos')
              .insert({
                nome: indicNome.trim(),
                cargo: indicCargo.trim() || null,
                estabelecimento_id: resolvedEstabId,
                unidade_id: f.unidade_id,
              } as never)
              .select('id')
              .single() as { data: { id: string } | null }
            if (novoContato) resolvedContatoId = novoContato.id
          }
        }
      } else {
        // SEM padronização — texto livre
        clinicaColetaNome = clinicaTextoLivre.trim() || null
      }

      // Step 5: Build observacoes (apenas obs originais da ficha)
      const observacoes = f.observacoes || null

      // Step 6: Map local_coleta (selecionado pelo operador)
      const localColetaMap: Record<string, string> = {
        residencia: 'Residência',
        clinica: 'Clínica',
        unidade: 'Unidade',
        outro: 'Outro',
      }
      const localColetaValor = localColetaMap[localColeta] || null

      // Step 7: Insert contrato
      const status = tipoPlano === 'emergencial' ? 'ativo' : 'preventivo'

      const contratoData = {
        codigo: codigo.trim(),
        unidade_id: f.unidade_id,
        status,
        tipo_plano: tipoPlano,
        tipo_cremacao: f.cremacao.toLowerCase() as 'individual' | 'coletiva',
        pet_nome: f.nome_pet?.toUpperCase() || '',
        pet_especie: f.especie.toLowerCase(),
        pet_raca: f.raca || null,
        pet_genero: f.genero ? f.genero.toLowerCase() : null,
        pet_cor: f.cor || null,
        pet_peso: f.peso ? parseFloat(f.peso) || null : null,
        pet_idade_anos: f.idade ? parseInt(f.idade) || null : null,
        tutor_id: tutorId,
        tutor_nome: f.nome_completo?.toUpperCase() || '',
        tutor_cpf: f.cpf,
        tutor_telefone: usarTelefone2ComoPrincipal && telefone2.trim() ? telefone2.replace(/\D/g, '') : f.telefone,
        tutor_telefone2: telefone2.trim() ? (usarTelefone2ComoPrincipal ? f.telefone : telefone2.replace(/\D/g, '')) : null,
        tutor_email: f.email || null,
        tutor_cidade: f.cidade || null,
        tutor_bairro: f.bairro || null,
        tutor_endereco: f.endereco ? `${f.endereco}, ${f.numero}${f.complemento ? ` - ${f.complemento}` : ''}` : null,
        tutor_cep: f.cep || null,
        clinica_coleta: clinicaColetaNome,
        contato_id: resolvedContatoId || null,
        estabelecimento_id: resolvedEstabId || null,
        funcionario_id: semResponsavel ? null : (funcionarioId || null),
        fonte_conhecimento_id: fonteConhecimentoId,
        indicacao_clinica: teveIndicacao ? (temPadronizacaoClinicas ? (estabNome.trim() || null) : (indicHospClinica.trim() || null)) : null,
        indicacao_contato: teveIndicacao ? (indicNomeQuemIndicou.trim() || null) : null,
        data_contrato: dataContrato,
        data_acolhimento: semDataHora ? null : (dataHoraAcolhimento ? new Date(dataHoraAcolhimento).toISOString() : null),
        pelinho_quer: true,
        pelinho_feito: false,
        pelinho_quantidade: 1,
        velorio_deseja: f.velorio === 'Sim' ? true : f.velorio === 'Não' ? false : null,
        acompanhamento_online: f.acompanhamento?.includes('On-line') || false,
        acompanhamento_presencial: f.acompanhamento?.includes('Presencial') || false,
        valor_plano: valorPlano ? parseFloat(valorPlano) : null,
        desconto_plano: descontoPreVenda ? parseFloat(descontoPreVenda) : 0,
        local_coleta: semLocal ? null : localColetaValor,
        remocao_endereco: semLocal ? null : (localColeta === 'residencia' ? (f.endereco ? `${f.endereco}, ${f.numero}` : null) : localColeta === 'outro' ? enderecoOutro || null : null),
        remocao_bairro: semLocal ? null : (localColeta === 'residencia' ? f.bairro : null),
        remocao_cidade: semLocal ? null : (localColeta === 'residencia' ? f.cidade : null),
        remocao_cep: semLocal ? null : (localColeta === 'residencia' ? f.cep : null),
        numero_lacre: lacre || null,
        observacoes,
        // Nomes do certificado: tutor principal + outros tutores da ficha (até 6 extras)
        certificado_nome_1: f.nome_completo || null,
        ...(f.outros_tutores ? Object.fromEntries(
          f.outros_tutores.filter(Boolean).slice(0, 6).map((nome, i) => [`certificado_nome_${i + 2}`, nome])
        ) : {}),
      }

      const { data: contrato, error: errContrato } = await supabase
        .from('contratos')
        .insert(contratoData as never)
        .select('id')
        .single() as { data: { id: string } | null; error: { message: string } | null }

      if (errContrato) throw new Error(`Erro ao criar contrato: ${errContrato.message}`)

      // Step 8: Mark ficha as processed
      await supabase
        .from('fichas')
        .update({
          processada: true,
          contrato_id: contrato!.id,
          processada_em: new Date().toISOString(),
          processada_por: funcionarioId || null,
        } as never)
        .eq('id', ficha.id)

      toast('Contrato criado com sucesso!', 'success')
      onSuccess(contrato!.id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      toast(message, 'error')
      console.error('Erro ao processar ficha:', err)
    } finally {
      setSalvando(false)
    }
  }

  if (!ficha) return null

  // ============================================
  // Render
  // ============================================
  const footer = (
    <div className="flex gap-3 justify-end">
      <button onClick={onClose} className="btn-secondary" disabled={salvando}>
        Cancelar
      </button>
      <button
        onClick={processarFicha}
        disabled={salvando || !codigo.trim() || (!lacre.trim() && !semLacre)}
        className="btn-primary disabled:opacity-50"
      >
        {salvando ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Processando...
          </>
        ) : (
          'Criar Contrato'
        )}
      </button>
    </div>
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Processar Ficha" footer={footer} size="xl">
      {/* Tutor detection banner — só se tela_tutores habilitada */}
      {hasModule('tela_tutores') && tutorChecked && (
        <div className={`mb-4 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
          tutorExistente
            ? 'bg-green-900/30 text-green-400 border border-green-700'
            : 'bg-blue-900/30 text-blue-400 border border-blue-700'
        }`}>
          {tutorExistente ? (
            <><Check className="h-4 w-4" />Tutor existente: {tutorExistente.nome}</>
          ) : (
            <><Plus className="h-4 w-4" />Novo tutor será criado</>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ======== LEFT COLUMN — Ficha summary ======== */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-[var(--surface-500)] uppercase tracking-wide">
            Dados da Ficha — <span className="text-red-400">Tipo: Emergencial</span>
          </h3>

          {/* Tutor */}
          <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)] space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--surface-700)] mb-2">
              <User className="h-4 w-4" />Tutor
            </div>
            <InfoRow label="Nome" value={getFichaValue('nome_completo')} editKey="nome_completo" edited={!!fichaEdits.nome_completo} onEdit={startEdit} />
            <InfoRow label="CPF" value={getFichaValue('cpf')} mono editKey="cpf" edited={!!fichaEdits.cpf} onEdit={startEdit} />
            <InfoRow label="Telefone" value={getFichaValue('telefone')} mono editKey="telefone" edited={!!fichaEdits.telefone} onEdit={startEdit} />

            {/* Confirmação de telefone pelo operador */}
            <div className="ml-[78px] space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={telefoneConfirmado}
                  onChange={e => setTelefoneConfirmado(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-emerald-500"
                />
                <span className={`text-xs ${telefoneConfirmado ? 'text-emerald-400 font-medium' : 'text-[var(--surface-400)]'}`}>
                  {telefoneConfirmado ? 'Telefone confirmado com o tutor' : 'Confirmar que é o telefone correto'}
                </span>
              </label>

              {/* Adicionar telefone 2 */}
              {!telefone2 ? (
                <button
                  type="button"
                  onClick={() => setTelefone2(' ')}
                  className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Adicionar telefone secundário
                </button>
              ) : (
                <div className="space-y-1">
                  <input
                    type="text"
                    inputMode="tel"
                    value={telefone2.trim()}
                    onChange={e => setTelefone2(e.target.value.replace(/\D/g, '').replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 15))}
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                    className="input text-sm text-mono"
                  />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={usarTelefone2ComoPrincipal}
                      onChange={e => setUsarTelefone2ComoPrincipal(e.target.checked)}
                      className="h-3 w-3 rounded accent-amber-500"
                    />
                    <span className="text-[10px] text-amber-400">Usar este como principal (trocar)</span>
                  </label>
                </div>
              )}
            </div>

            <InfoRow label="Email" value={getFichaValue('email')} editKey="email" edited={!!fichaEdits.email} onEdit={startEdit} />
            <InfoRow label="Endereço" value={getFichaValue('endereco')} editKey="endereco" edited={!!fichaEdits.endereco} onEdit={startEdit} />
            <InfoRow label="Número" value={getFichaValue('numero')} editKey="numero" edited={!!fichaEdits.numero} onEdit={startEdit} />
            <InfoRow label="Bairro" value={getFichaValue('bairro')} editKey="bairro" edited={!!fichaEdits.bairro} onEdit={startEdit} />
            <InfoRow label="Cidade" value={getFichaValue('cidade')} editKey="cidade" edited={!!fichaEdits.cidade} onEdit={startEdit} />
            <InfoRow label="CEP" value={getFichaValue('cep')} mono editKey="cep" edited={!!fichaEdits.cep} onEdit={startEdit} />
            <div className="mt-2 pt-2 border-t border-[var(--surface-200)]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-[var(--surface-400)]">Outros nomes (certificado)</span>
                <button
                  type="button"
                  onClick={() => {
                    const atual = fichaEdits.outros_tutores
                      ? JSON.parse(fichaEdits.outros_tutores) as string[]
                      : [...(ficha.outros_tutores || [])]
                    if (atual.length < 6) {
                      setFichaEdits(prev => ({ ...prev, outros_tutores: JSON.stringify([...atual, '']) }))
                      // Abrir edição do novo campo
                      setTimeout(() => startEdit(`outros_tutores_${atual.length}`, ''), 50)
                    }
                  }}
                  className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-0.5"
                >
                  <Plus className="h-3 w-3" /> Adicionar
                </button>
              </div>
              {(fichaEdits.outros_tutores
                ? JSON.parse(fichaEdits.outros_tutores) as string[]
                : ficha.outros_tutores || []
              ).map((nome: string, i: number) => (
                <div key={i} className="flex items-center gap-2 group">
                  <span className={`text-sm ${fichaEdits.outros_tutores ? 'text-amber-400 font-semibold' : 'text-[var(--surface-700)]'}`}>
                    {nome || '(vazio)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingField(`outros_tutores_${i}`)
                      setEditingValue(nome || '')
                    }}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--surface-100)] transition-all"
                    title="Editar nome"
                  >
                    <Pencil className="h-3 w-3 text-[var(--surface-400)]" />
                  </button>
                </div>
              ))}
              {!(fichaEdits.outros_tutores ? JSON.parse(fichaEdits.outros_tutores) : ficha.outros_tutores || []).some(Boolean) && (
                <span className="text-xs text-[var(--surface-400)] italic">Nenhum outro nome informado</span>
              )}
            </div>
          </div>

          {/* Pet */}
          <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)] space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--surface-700)] mb-2">
              <PawPrint className="h-4 w-4" />Pet
            </div>
            <InfoRow label="Nome" value={getFichaValue('nome_pet')} bold editKey="nome_pet" edited={!!fichaEdits.nome_pet} onEdit={startEdit} />
            <InfoRow label="Espécie" value={getFichaValue('especie')} editKey="especie" edited={!!fichaEdits.especie} onEdit={startEdit} />
            <InfoRow label="Raça" value={getFichaValue('raca')} editKey="raca" edited={!!fichaEdits.raca} onEdit={startEdit} />
            <InfoRow label="Gênero" value={getFichaValue('genero')} editKey="genero" edited={!!fichaEdits.genero} onEdit={startEdit} />
            <InfoRow label="Cor" value={getFichaValue('cor')} editKey="cor" edited={!!fichaEdits.cor} onEdit={startEdit} />
            <InfoRow label="Peso" value={getFichaValue('peso')} editKey="peso" edited={!!fichaEdits.peso} onEdit={startEdit} />
            <InfoRow label="Idade" value={getFichaValue('idade')} editKey="idade" edited={!!fichaEdits.idade} onEdit={startEdit} />
          </div>

          {/* Servico */}
          <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)] space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--surface-700)] mb-2">
              <Flame className="h-4 w-4" />Serviço
            </div>
            <InfoRow label="Cremação" value={getFichaValue('cremacao')} editKey="cremacao" edited={!!fichaEdits.cremacao} onEdit={startEdit} />
            <InfoRow label="Pagamento" value={getFichaValue('pagamento')} editKey="pagamento" edited={!!fichaEdits.pagamento} onEdit={startEdit} />
            <InfoRow label="Velório" value={getFichaValue('velorio')} editKey="velorio" edited={!!fichaEdits.velorio} onEdit={startEdit} />
            <InfoRow label="Acompanhamento" value={getFichaValue('acompanhamento')} editKey="acompanhamento" edited={!!fichaEdits.acompanhamento} onEdit={startEdit} />
            <InfoRow label="Local" value={getFichaValue('localizacao')} editKey="localizacao" edited={!!fichaEdits.localizacao} onEdit={startEdit} />
            {ficha.localizacao_outra && <InfoRow label="Local (outro)" value={getFichaValue('localizacao_outra')} editKey="localizacao_outra" edited={!!fichaEdits.localizacao_outra} onEdit={startEdit} />}
          </div>

          {/* Extras */}
          {(ficha.como_conheceu || ficha.veterinario_especificar || ficha.outro_especificar || ficha.observacoes) && (
            <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)] space-y-1.5">
              {ficha.como_conheceu && ficha.como_conheceu.length > 0 && (
                <InfoRow label="Como conheceu" value={ficha.como_conheceu.join(', ')} />
              )}
              {ficha.veterinario_especificar && (
                <InfoRow label="Vet/Clínica" value={ficha.veterinario_especificar} />
              )}
              {ficha.outro_especificar && (
                <InfoRow label="Outro (indicação)" value={ficha.outro_especificar} />
              )}
              {ficha.observacoes && (
                <div>
                  <span className="text-xs text-[var(--surface-400)]">Observações</span>
                  <p className="text-sm text-[var(--surface-700)] whitespace-pre-wrap">{ficha.observacoes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ======== RIGHT COLUMN — Operator fields ======== */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-[var(--surface-500)] uppercase tracking-wide">Dados do Operador</h3>
          <p className="text-[10px] font-bold text-[var(--surface-400)] uppercase tracking-widest">Padronização de Dados</p>

          {/* ═══════ BLOCO: ACOLHIMENTO ═══════ */}
          <div className="p-3 rounded-xl border border-[var(--surface-200)] space-y-3">
            <h4 className="text-xs font-bold text-[var(--surface-600)] uppercase tracking-wider">Acolhimento</h4>

            {/* Local de Acolhimento */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-[var(--surface-600)]">Local de Acolhimento</label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={semLocal} onChange={e => { setSemLocal(e.target.checked); if (e.target.checked) setLocalColeta('') }} className="h-3 w-3 rounded accent-amber-500" />
                  <span className="text-[10px] text-amber-500">Sem local provisoriamente</span>
                </label>
              </div>

              {semLocal ? (
                <div className="px-3 py-2 rounded-lg bg-amber-900/10 border border-amber-500/30 text-xs text-amber-400">
                  A definir — preencher depois no contrato
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { key: 'residencia', label: 'Residência' },
                      { key: 'clinica', label: 'Clínica / Hospital' },
                      { key: 'unidade', label: 'Unidade RIP PET' },
                      { key: 'outro', label: 'Outro endereço' },
                    ].map(opt => (
                      <button key={opt.key} type="button" onClick={() => setLocalColeta(opt.key as typeof localColeta)}
                        className={`py-2 px-3 rounded-lg text-xs font-medium border-2 transition-all ${localColeta === opt.key ? 'border-purple-500 bg-purple-500/10 text-purple-400' : 'border-[var(--surface-200)] text-[var(--surface-500)] hover:border-[var(--surface-300)]'}`}
                      >{opt.label}</button>
                    ))}
                  </div>

                  {/* Residência / Unidade: auto-padronizado */}
                  {localColeta === 'residencia' && ficha && (
                    <p className="mt-2 text-xs text-green-400 bg-green-900/10 rounded-lg px-3 py-2">
                      Endereço do tutor (padronizado automaticamente)
                    </p>
                  )}
                  {localColeta === 'unidade' && (
                    <p className="mt-2 text-xs text-green-400 bg-green-900/10 rounded-lg px-3 py-2">
                      Endereço da unidade (padronizado automaticamente)
                    </p>
                  )}

                  {/* Clínica: precisa padronizar */}
                  {localColeta === 'clinica' && (
                    <div className="mt-2 space-y-2">
                      {ficha.localizacao_outra && (
                        <div className="px-3 py-2 rounded-lg bg-purple-900/20 border border-purple-700 text-xs">
                          <span className="text-purple-400 font-medium">Tutor marcou &quot;Clínica / Hospital&quot; e escreveu:</span>{' '}
                          <span className="text-purple-300">&quot;{ficha.localizacao_outra}&quot;</span>
                          <p className="text-purple-400/70 mt-1">Padronize abaixo somente com o nome da Clínica / Hospital</p>
                        </div>
                      )}
                      {temPadronizacaoClinicas ? (
                        /* COM PADRONIZAÇÃO — Autocomplete */
                        <div ref={estabRef} className="relative">
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-medium text-[var(--surface-500)]">Estabelecimento</label>
                            <label className="flex items-center gap-1.5 cursor-pointer select-none">
                              <input type="checkbox" checked={autonomo} onChange={e => { setAutonomo(e.target.checked); if (e.target.checked) { setEstabId(null); setEstabNome(''); setEstabBusca('') } }} className="h-3 w-3 rounded accent-blue-500" />
                              <span className="text-[10px] text-blue-400">Autônomo</span>
                            </label>
                          </div>
                          {autonomo ? (
                            <div className="px-3 py-2 rounded-lg border-2 border-dashed border-blue-500/30 bg-blue-900/10 text-xs text-blue-400">Profissional autônomo (sem vínculo)</div>
                          ) : (
                            <>
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--surface-400)]" />
                                <input type="text" value={estabBusca} onChange={e => { setEstabBusca(e.target.value); setEstabNome(e.target.value); setEstabId(null); setEstabAberto(true) }} onFocus={() => setEstabAberto(true)} placeholder="Buscar clínica..." className="input pl-9 pr-3 text-sm" />
                              </div>
                              {estabAberto && (estabsFiltrados.length > 0 || estabBusca.trim()) && (
                                <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-[var(--surface-0)] border border-[var(--surface-200)] rounded-lg shadow-lg">
                                  {estabsFiltrados.map(e => (
                                    <button key={e.id} type="button" onClick={() => { setEstabId(e.id); setEstabNome(e.nome); setEstabBusca(e.nome); setEstabAberto(false) }}
                                      className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-50)] transition-colors flex items-center justify-between ${estabId === e.id ? 'bg-[var(--surface-50)] font-medium text-[var(--surface-800)]' : 'text-[var(--surface-600)]'}`}>
                                      <span>{e.nome}</span>
                                      {e.tipo && <span className="text-xs text-[var(--surface-400)]">{e.tipo}</span>}
                                    </button>
                                  ))}
                                  {estabBusca.trim() && !estabsFiltrados.some(e => e.nome.toLowerCase() === estabBusca.toLowerCase()) && (
                                    <button type="button" onClick={() => { setEstabId(null); setEstabNome(estabBusca.trim()); setEstabAberto(false) }}
                                      className="w-full text-left px-3 py-2 text-sm text-amber-500 hover:bg-amber-900/10 flex items-center gap-2 border-t border-[var(--surface-100)]">
                                      <Plus className="h-3.5 w-3.5" />Criar &quot;{estabBusca.trim()}&quot;
                                    </button>
                                  )}
                                </div>
                              )}
                              {estabId && <p className="mt-1 text-xs text-green-500 flex items-center gap-1"><Check className="h-3 w-3" />Selecionado</p>}
                              {!estabId && estabNome.trim() && !estabAberto && <p className="mt-1 text-xs text-amber-500">Novo estabelecimento será criado</p>}
                            </>
                          )}
                        </div>
                      ) : (
                        /* SEM PADRONIZAÇÃO — Campo texto livre */
                        <div>
                          <input type="text" value={clinicaTextoLivre} onChange={e => setClinicaTextoLivre(e.target.value)} placeholder="Nome da clínica ou hospital" className="input text-sm" />
                          <p className="mt-1 text-[10px] text-[var(--surface-400)]">Mantenha sempre o mesmo padrão de escrita</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Outro endereço: precisa padronizar */}
                  {localColeta === 'outro' && (
                    <div className="mt-2 space-y-2">
                      {ficha.localizacao_outra && (
                        <div className="px-3 py-2 rounded-lg bg-purple-900/20 border border-purple-700 text-xs">
                          <span className="text-purple-400 font-medium">Tutor marcou &quot;Outro endereço&quot; e escreveu:</span>{' '}
                          <span className="text-purple-300">&quot;{ficha.localizacao_outra}&quot;</span>
                          <p className="text-purple-400/70 mt-1">Padronize abaixo com o endereço completo</p>
                        </div>
                      )}
                      <input type="text" value={enderecoOutro} onChange={e => setEnderecoOutro(e.target.value)} placeholder="Endereço completo" className="input text-sm" />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Responsável pelo Acolhimento */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-[var(--surface-600)]">Responsável pelo Acolhimento</label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={semResponsavel} onChange={e => { setSemResponsavel(e.target.checked); if (e.target.checked) setFuncionarioId('') }} className="h-3 w-3 rounded accent-amber-500" />
                  <span className="text-[10px] text-amber-500">Sem responsável provisoriamente</span>
                </label>
              </div>
              {semResponsavel ? (
                <div className="px-3 py-2 rounded-lg bg-amber-900/10 border border-amber-500/30 text-xs text-amber-400">A definir</div>
              ) : (
                <select value={funcionarioId} onChange={e => setFuncionarioId(e.target.value)} className="input text-sm">
                  <option value="">Selecione...</option>
                  {funcionarios.map(f => (<option key={f.id} value={f.id}>{f.nome}</option>))}
                </select>
              )}
            </div>

            {/* Data e Hora do Acolhimento */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-[var(--surface-600)]">Data e Hora do Acolhimento</label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={semDataHora} onChange={e => { setSemDataHora(e.target.checked); if (e.target.checked) setDataHoraAcolhimento('') }} className="h-3 w-3 rounded accent-amber-500" />
                  <span className="text-[10px] text-amber-500">Sem data/hora provisoriamente</span>
                </label>
              </div>
              {semDataHora ? (
                <div className="px-3 py-2 rounded-lg bg-amber-900/10 border border-amber-500/30 text-xs text-amber-400">A definir</div>
              ) : (
                <input type="datetime-local" value={dataHoraAcolhimento} onChange={e => setDataHoraAcolhimento(e.target.value)} className="input text-sm" />
              )}
            </div>

            {/* Lacre */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-[var(--surface-600)]">Número do Lacre</label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={semLacre} onChange={e => { setSemLacre(e.target.checked); if (e.target.checked) setLacre('') }} className="h-3 w-3 rounded accent-amber-500" />
                  <span className="text-[10px] text-amber-500">Sem lacre provisoriamente</span>
                </label>
              </div>
              {semLacre ? (
                <div className="px-3 py-2 rounded-lg bg-amber-900/10 border border-amber-500/30 text-xs text-amber-400">A definir — preencher depois no contrato</div>
              ) : (
                <input type="text" value={lacre} onChange={e => setLacre(e.target.value)} placeholder="Número do lacre" className="input text-sm" />
              )}
            </div>
          </div>

          {/* ═══════ BLOCO: INDICAÇÃO ═══════ */}
          <div className="p-3 rounded-xl border border-[var(--surface-200)] space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[var(--surface-600)] uppercase tracking-wider">Indicação</h4>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-[10px] text-[var(--surface-400)]">{teveIndicacao ? 'Sim' : 'Não'}</span>
                <button type="button" onClick={() => setTeveIndicacao(!teveIndicacao)}
                  className={`relative w-8 h-4.5 rounded-full transition-colors ${teveIndicacao ? 'bg-purple-500' : 'bg-[var(--surface-300)]'}`}
                  style={{ height: 18 }}>
                  <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${teveIndicacao ? 'translate-x-4' : 'translate-x-0.5'}`} style={{ width: 14, height: 14 }} />
                </button>
              </label>
            </div>

            {/* Contexto: o que o tutor informou */}
            {mostrarIndicacao && (ficha.como_conheceu || ficha.veterinario_especificar || ficha.outro_especificar) && (
              <div className="px-3 py-2 rounded-lg bg-purple-900/20 border border-purple-700 text-xs">
                <span className="text-purple-400 font-medium">Tutor informou:</span>{' '}
                <span className="text-purple-300">
                  &quot;{ficha.veterinario_especificar || ficha.outro_especificar || (ficha.como_conheceu || []).join(', ')}&quot;
                </span>
              </div>
            )}

            {teveIndicacao && (
              <div className="space-y-3">
                {/* Nome de quem indicou */}
                <div>
                  <label className="block text-xs font-medium text-[var(--surface-600)] mb-1">Nome de quem indicou</label>
                  {temPadronizacaoClinicas ? (
                    <div ref={indicRef} className="relative">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--surface-400)]" />
                        <input type="text" value={indicBusca} onChange={e => { setIndicBusca(e.target.value); setIndicNome(e.target.value); setIndicNomeQuemIndicou(e.target.value); setIndicId(null); setIndicAberto(true) }} onFocus={() => setIndicAberto(true)} placeholder="ex: Dra. Maria ou Recep. João" className="input pl-9 text-sm" />
                      </div>
                      {indicAberto && (contatosFiltrados.length > 0 || indicBusca.trim()) && (
                        <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-[var(--surface-0)] border border-[var(--surface-200)] rounded-lg shadow-lg">
                          {contatosFiltrados.map(c => (
                            <button key={c.id} type="button" onClick={() => { setIndicId(c.id); setIndicNome(c.nome); setIndicBusca(c.nome); setIndicNomeQuemIndicou(c.nome); setIndicCargo(c.cargo || ''); setIndicAberto(false) }}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-50)] transition-colors flex items-center justify-between ${indicId === c.id ? 'bg-[var(--surface-50)] font-medium' : 'text-[var(--surface-600)]'}`}>
                              <span>{c.nome}</span>
                              {c.cargo && <span className="text-xs text-[var(--surface-400)]">{c.cargo}</span>}
                            </button>
                          ))}
                          {indicBusca.trim() && !contatosFiltrados.some(c => c.nome.toLowerCase() === indicBusca.toLowerCase()) && (
                            <button type="button" onClick={() => { setIndicId(null); setIndicNome(indicBusca.trim()); setIndicNomeQuemIndicou(indicBusca.trim()); setIndicAberto(false) }}
                              className="w-full text-left px-3 py-2 text-sm text-amber-500 hover:bg-amber-900/10 flex items-center gap-2 border-t border-[var(--surface-100)]">
                              <Plus className="h-3.5 w-3.5" />Criar &quot;{indicBusca.trim()}&quot;
                            </button>
                          )}
                        </div>
                      )}
                      {indicId && <p className="mt-1 text-xs text-green-500 flex items-center gap-1"><Check className="h-3 w-3" />Selecionado</p>}
                      {!indicId && indicNome.trim() && !indicAberto && (
                        <>
                          <p className="mt-1 text-xs text-amber-500">Novo contato será criado</p>
                          <input type="text" value={indicCargo} onChange={e => setIndicCargo(e.target.value)} placeholder="Cargo (ex: Veterinária, Recepcionista)..." className="input mt-1 text-sm" />
                        </>
                      )}
                    </div>
                  ) : (
                    <input type="text" value={indicNomeQuemIndicou} onChange={e => setIndicNomeQuemIndicou(e.target.value)} placeholder="ex: Dra. Maria ou Recep. João" className="input text-sm" />
                  )}
                </div>

                {/* Hospital / Clínica */}
                <div>
                  <label className="block text-xs font-medium text-[var(--surface-600)] mb-1">Hospital / Clínica</label>
                  {temPadronizacaoClinicas ? (
                    <div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--surface-400)]" />
                        <input type="text" value={estabBusca} onChange={e => { setEstabBusca(e.target.value); setEstabNome(e.target.value); setEstabId(null); setEstabAberto(true) }} onFocus={() => setEstabAberto(true)} placeholder="Buscar clínica..." className="input pl-9 text-sm" />
                      </div>
                      {estabId && <p className="mt-1 text-xs text-green-500 flex items-center gap-1"><Check className="h-3 w-3" />Selecionado: {estabNome}</p>}
                    </div>
                  ) : (
                    <input type="text" value={indicHospClinica} onChange={e => setIndicHospClinica(e.target.value)} placeholder="Nome do hospital ou clínica" className="input text-sm" />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ═══════ CAMPOS FINAIS ═══════ */}

          {/* Código */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-[var(--surface-600)]">Código <span className="text-red-400">*</span></label>
              <button type="button" onClick={() => setCodigoManual(!codigoManual)} className="text-[10px] text-[var(--surface-400)] hover:text-[var(--surface-600)] flex items-center gap-1">
                <Pencil className="h-3 w-3" />{codigoManual ? 'Auto-gerar' : 'Editar'}
              </button>
            </div>
            <input type="text" value={codigo} onChange={e => setCodigo(e.target.value)} readOnly={!codigoManual} className={`input text-mono text-sm ${!codigoManual ? 'bg-[var(--surface-50)]' : ''}`} />
          </div>

          {/* Valor + Desconto */}
          <div>
            <label className="block text-xs font-medium text-[var(--surface-600)] mb-1">Valor do Plano (R$)</label>
            <div className="flex items-center gap-2">
              <input type="text" inputMode="decimal" value={valorPlano} onChange={e => setValorPlano(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))} placeholder="0.00" className="input text-mono text-sm flex-1" />
              <span className="text-[var(--surface-400)] text-sm">−</span>
              <input type="text" inputMode="decimal" value={descontoPreVenda} onChange={e => setDescontoPreVenda(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))} placeholder="Desc." className="input text-mono text-sm w-20" />
              <span className="text-[var(--surface-400)] text-sm">=</span>
              <span className="text-sm font-bold text-emerald-400 min-w-[60px] text-right">
                {(() => { const v = parseFloat(valorPlano) || 0; const d = parseFloat(descontoPreVenda) || 0; return Math.max(v - d, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) })()}
              </span>
            </div>
          </div>

          {/* Data do contrato */}
          <div>
            <label className="block text-xs font-medium text-[var(--surface-600)] mb-1">Data do contrato <span className="text-red-400">*</span></label>
            <input type="date" value={dataContrato} onChange={e => setDataContrato(e.target.value)} className="input text-sm" />
          </div>
        </div>
      </div>
      {/* Mini-modal de edição de campo */}
      {editingField && (() => {
        // Labels legíveis com acentuação correta
        const FIELD_LABELS: Record<string, string> = {
          nome_completo: 'Nome completo', cpf: 'CPF', telefone: 'Telefone', email: 'E-mail',
          endereco: 'Endereço', numero: 'Número', bairro: 'Bairro', cidade: 'Cidade', cep: 'CEP',
          nome_pet: 'Nome do pet', especie: 'Espécie', raca: 'Raça', genero: 'Gênero',
          cor: 'Cor', peso: 'Peso', idade: 'Idade',
          cremacao: 'Cremação', pagamento: 'Pagamento', velorio: 'Velório',
          acompanhamento: 'Acompanhamento', localizacao: 'Localização', localizacao_outra: 'Local (outro)',
        }

        // Campos com opções fixas (não texto livre)
        const FIELD_OPTIONS: Record<string, string[]> = {
          cremacao: ['Individual', 'Coletiva'],
          velorio: ['Sim', 'Não', 'A decidir'],
          especie: ['Canina', 'Felina', 'Exótica'],
          genero: ['Macho', 'Fêmea'],
          acompanhamento: ['Presencial', 'On-line', 'Gravado', 'Não deseja'],
          pagamento: ['Pix', 'Dinheiro', 'Cartão Débito', 'Cartão Crédito'],
          localizacao: ['Residência', 'Hospital / Clínica', 'Unidade Canal 6', 'Outro'],
        }

        // Tipo de input e máscara por campo
        const FIELD_INPUT: Record<string, { type: string; inputMode?: string; mask?: (v: string) => string; maxLength?: number; placeholder?: string }> = {
          cpf: {
            type: 'text', inputMode: 'numeric', maxLength: 14, placeholder: '000.000.000-00',
            mask: (v) => v.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2').slice(0, 14),
          },
          telefone: {
            type: 'text', inputMode: 'tel', maxLength: 15, placeholder: '(00) 00000-0000',
            mask: (v) => v.replace(/\D/g, '').replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 15),
          },
          cep: {
            type: 'text', inputMode: 'numeric', maxLength: 9, placeholder: '00000-000',
            mask: (v) => v.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 9),
          },
          email: { type: 'email', placeholder: 'email@exemplo.com' },
          peso: { type: 'text', inputMode: 'decimal', placeholder: 'Ex: 12.5', mask: (v) => v.replace(/[^\d.,]/g, '') },
          idade: { type: 'text', inputMode: 'numeric', placeholder: 'Ex: 8', mask: (v) => v.replace(/\D/g, '') },
          numero: { type: 'text', inputMode: 'text', placeholder: 'Nº' },
        }

        const fieldKey = editingField.startsWith('outros_tutores_') ? 'outros_tutores' : editingField
        const label = editingField.startsWith('outros_tutores_')
          ? `Nome ${parseInt(editingField.split('_')[2]) + 2} (certificado)`
          : FIELD_LABELS[editingField] || editingField
        const options = FIELD_OPTIONS[fieldKey]
        const inputConfig = FIELD_INPUT[fieldKey]

        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4" style={{ background: 'var(--surface-card, #1e293b)', border: '1px solid var(--surface-200)' }}>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Pencil className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--surface-800)]">Editar dados da ficha</h3>
                  <p className="text-xs text-amber-400 mt-1">
                    Estes são os dados originais do cliente. Qualquer alteração, confirme com o responsável.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--surface-500)] mb-2">{label}</label>
                {options ? (
                  <div className="flex flex-wrap gap-2">
                    {options.map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => { setEditingValue(opt) }}
                        className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                          editingValue === opt
                            ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                            : 'border-[var(--surface-200)] text-[var(--surface-500)] hover:border-[var(--surface-300)]'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    type={inputConfig?.type || 'text'}
                    inputMode={inputConfig?.inputMode as React.HTMLAttributes<HTMLInputElement>['inputMode']}
                    value={editingValue}
                    onChange={e => {
                      const v = inputConfig?.mask ? inputConfig.mask(e.target.value) : e.target.value
                      setEditingValue(v)
                    }}
                    maxLength={inputConfig?.maxLength}
                    placeholder={inputConfig?.placeholder}
                    onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') cancelEdit() }}
                    className="input w-full"
                    autoFocus
                  />
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={cancelEdit}
                  className="px-3 py-1.5 rounded-lg text-sm text-[var(--surface-600)] hover:bg-[var(--surface-100)] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmEdit}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors"
                  style={{ background: '#f59e0b' }}
                >
                  Confirmar alteração
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </Modal>
  )
}

// ============================================
// Helper
// ============================================
function InfoRow({ label, value, mono, bold, editKey, edited, onEdit }: {
  label: string; value: string; mono?: boolean; bold?: boolean
  editKey?: string; edited?: boolean; onEdit?: (key: string, value: string) => void
}) {
  return (
    <div className="flex items-baseline gap-2 group">
      <span className="text-xs text-[var(--surface-400)] min-w-[70px] flex-shrink-0">{label}</span>
      <span className={`text-sm ${edited ? 'text-amber-400 font-semibold' : 'text-[var(--surface-700)]'} ${mono ? 'text-mono' : ''} ${bold ? 'font-semibold' : ''}`}>
        {value || '-'}
      </span>
      {editKey && onEdit && (
        <button
          type="button"
          onClick={() => onEdit(editKey, value)}
          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--surface-100)] transition-all ml-auto"
          title="Editar campo"
        >
          <Pencil className="h-3 w-3 text-[var(--surface-400)]" />
        </button>
      )}
    </div>
  )
}
