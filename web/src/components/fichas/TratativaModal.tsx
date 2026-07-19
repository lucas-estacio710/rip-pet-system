'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { User, PawPrint, Flame, Search, Check, Plus, Pencil, Loader2, Building2, UserCheck, MessageCircle, Phone, AlertTriangle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { useFieldPermission } from '@/hooks/useFieldPermission'
import { gerarContratoPDF, contratoFilename } from '@/lib/contrato-pdf'
import { hojeLocal } from '@/lib/date-local'

// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️  MODAIS GÊMEOS — TratativaModal (este)  ⇄  AtivarModal
//     (web/src/components/contratos/modals/AtivarModal.tsx)
// ───────────────────────────────────────────────────────────────────────────────
// Os dois tratam do MESMO bloco de Acolhimento (aqui em markup próprio; no Ativar
// via <AcolhimentoForm>) e dos mesmos caminhos de gravação: criar/vincular
// estabelecimento (clínica), contato p/ cremação (tel1/tel2/principal), local de
// coleta, responsável, data/hora, lacre.
//
// REGRA DE OURO: toda correção de comportamento num DEVE ser refletida no outro.
//   Ex.: insert em `estabelecimentos` precisa de `endereco: ''` (coluna NOT NULL
//   sem default) — vale tanto p/ o estab. de COLETA quanto o de INDICAÇÃO aqui.
//
// PARTICULARIDADES (o que PODE divergir de propósito):
//   • Obrigatoriedade: na ficha emergencial (aqui) local/responsável/data-hora
//     aceitam "sem X provisoriamente". Na ativação de PV (AtivarModal) são
//     OBRIGATÓRIOS (pet já faleceu/foi acionado).
//   • Este modal tem o bloco extra de INDICAÇÃO (quem indicou), ausente no Ativar.
//
// ⚠️ Este componente é CRÍTICO p/ operação — por isso NÃO foi unificado com o
//    Ativar ainda. Ao mexer aqui, replique a mesma mudança no gêmeo.
// ═══════════════════════════════════════════════════════════════════════════════

// ============================================
// Types
// ============================================
type Ficha = {
  id: string
  created_at: string
  nome_completo: string
  cpf: string // CPF ou CNPJ
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
  tipo_plano?: 'emergencial' | 'preventivo'
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
  processada: boolean | null
  contrato_id: string | null
  op_dados: Record<string, unknown> | null
}

type Estabelecimento = { id: string; nome: string; tipo: string | null; cidade: string | null }
type Contato = { id: string; nome: string; cargo: string | null; estabelecimento_id: string | null }
type Funcionario = { id: string; nome: string }
type TutorExistente = { id: string; nome: string } | null

type Props = {
  isOpen: boolean
  onClose: (resultado?: 'processada' | 'contrato') => void
  ficha: Ficha | null
  onSuccess: (contratoId: string) => void
  onRetornarPendente?: () => void
  onReprocessar?: (ficha: Ficha) => void
  onAtualizar?: () => void
  somenteLeitura?: boolean
}

// Nomes compostos: se o primeiro nome é um desses prefixos, inclui o segundo nome
const PREFIXOS_NOME_COMPOSTO = [
  'maria', 'ana', 'anna', 'rosa',
  'joao', 'joão', 'jose', 'josé',
  'pedro', 'luiz', 'luis', 'luís', 'carlos', 'marco',
]

// Detecta CPF vs CNPJ pelo número de dígitos
function labelDocumento(valor: string | null | undefined): string {
  if (!valor) return 'CPF'
  return valor.replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF'
}

function maskDocumento(v: string): string {
  const d = v.replace(/\D/g, '')
  if (d.length > 11) {
    return d.slice(0, 14).replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2')
  }
  return d.slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

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
export default function TratativaModal({ isOpen, onClose, ficha, onSuccess, onRetornarPendente, onReprocessar, onAtualizar, somenteLeitura }: Props) {
  const { toast } = useToast()
  const supabase = createClient()
  const { hasModule, currentUnit, allUnidades, userName } = useUnit()
  const { isVisible } = useFieldPermission()
  // Fonte da verdade = modulos_ativos da unidade DA FICHA. NÃO usar hasModule(): ele é baseado
  // em FLS e é PERMISSIVO por padrão (sem row 'hidden' = true), além de retornar true sempre pra
  // super_admin. Resultado do bug: SP (sem o módulo, mas sem row FLS 'hidden') caía no caminho
  // "com módulo" e mandava o estabNome cru no lugar do clinicaTextoLivre normalizado pelo concierge.
  // Preferimos a unidade da ficha; se não estiver em allUnidades, currentUnit (perfil) já traz
  // modulos_ativos confiável — mesmo padrão do cb_cremacao_local.
  const unidadeDaFicha = (ficha && allUnidades.find(u => u.id === ficha.unidade_id)) || currentUnit
  const temPadronizacaoClinicas = !!unidadeDaFicha?.modulos_ativos?.includes('cb_padronizacao_clinicas')

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
          setFichaEdits(prev => {
            const updated = { ...prev, [editingField]: editingValue }
            // Se mudou pagamento pra não-crédito, limpar parcelas
            if (editingField === 'pagamento' && editingValue !== 'Cartão Crédito') {
              updated.parcelas = ''
            }
            return updated
          })
        }
      }
    }
    setEditingField(null)
    setEditingValue('')
  }

  // Telefone2 completo com DDI
  function formatarDisplay(valor: string | null | undefined): string {
    if (!valor) return '-'
    const map: Record<string, string> = {
      pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Cartão Débito', credito: 'Cartão Crédito',
      individual: 'Individual', coletiva: 'Coletiva',
      canina: 'Canina', felina: 'Felina', exotica: 'Exótica',
      macho: 'Macho', femea: 'Fêmea',
    }
    return map[valor.toLowerCase()] || valor.charAt(0).toUpperCase() + valor.slice(1)
  }

  function formatarTel(tel: string | null | undefined): string {
    if (!tel) return '-'
    const n = tel.replace(/\D/g, '')
    // BR com DDI 55 (13 dígitos): remove DDI e formata normal
    if (n.length === 13 && n.startsWith('55')) return `(${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}`
    // DDI estrangeiro (12+ dígitos): +XX (XX) XXXXX-XXXX
    if (n.length >= 12) return `+${n.slice(0, n.length - 11)} (${n.slice(-11, -9)}) ${n.slice(-9, -4)}-${n.slice(-4)}`
    // 11 dígitos: (13) 99116-5947
    if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
    // 10 dígitos: (13) 3321-5947
    if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
    return tel
  }

  function getTelefone2Completo(): string {
    const num = telefone2.replace(/\D/g, '')
    if (!num) return ''
    const ddi = telefone2DDI === 'outro' ? telefone2DDICustom : telefone2DDI
    return ddi + num
  }

  function abrirWhatsApp(tel: string | null | undefined) {
    if (!tel) return
    const n = tel.replace(/\D/g, '')
    if (!n) return
    // BR sem DDI (10 ou 11 dígitos): adiciona 55
    const numero = (n.length === 10 || n.length === 11) ? '55' + n : n
    window.open(`https://wa.me/${numero}`, '_blank', 'noopener,noreferrer')
  }

  // Smart input pro tel2 — detecta DDI inicial colado do WhatsApp (+55, +1, +351, +54)
  function aplicarTelefone2(raw: string) {
    const d = raw.replace(/\D/g, '')
    if (!d) { setTelefone2(''); return }
    // Detectar DDI conhecido no início (só se o resto sobrar 10-11 dígitos pra BR ou 7+ pra estrangeiro)
    const ddiCandidatos = ['55', '351', '54', '1']
    for (const ddi of ddiCandidatos) {
      if (d.startsWith(ddi)) {
        const resto = d.slice(ddi.length)
        // BR: 10 ou 11 dígitos após o 55
        if (ddi === '55' && (resto.length === 10 || resto.length === 11)) {
          setTelefone2DDI('55')
          setTelefone2(resto.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 15))
          return
        }
        // Outros DDIs: aceita 7-11 dígitos no resto
        if (ddi !== '55' && resto.length >= 7 && resto.length <= 11) {
          setTelefone2DDI(ddi)
          setTelefone2(resto.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 15))
          return
        }
      }
    }
    // Sem DDI detectado — aplicar máscara padrão limitada a 15 chars
    setTelefone2(d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 15))
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

  // Estabelecimento da indicação (separado do acolhimento)
  const [indicEstabBusca, setIndicEstabBusca] = useState('')
  const [indicEstabAberto, setIndicEstabAberto] = useState(false)
  const [indicEstabId, setIndicEstabId] = useState<string | null>(null)
  const [indicEstabNome, setIndicEstabNome] = useState('')
  const indicEstabRef = useRef<HTMLDivElement>(null)

  // Form fields
  // Deriva da ficha (mig 097): preventivo → contrato nasce status/tipo_plano 'preventivo'.
  const tipoPlano: 'emergencial' | 'preventivo' = ficha?.tipo_plano === 'preventivo' ? 'preventivo' : 'emergencial'
  // Preventivo = pet vivo: sem acolhimento (data/hora, local, responsável, lacre) nem seguradora.
  const isPreventivo = tipoPlano === 'preventivo'
  const [funcionarioId, setFuncionarioId] = useState('')
  // Telefone — operador confirma ou adiciona secundário
  const [telefoneConfirmado, setTelefoneConfirmado] = useState(false)
  const [telefone1Nome, setTelefone1Nome] = useState('')
  const [telefone2, setTelefone2] = useState('')
  const [telefone2DDI, setTelefone2DDI] = useState('55')
  const [telefone2DDICustom, setTelefone2DDICustom] = useState('')
  const [telefone2Nome, setTelefone2Nome] = useState('')
  const [mostrarTelefone2, setMostrarTelefone2] = useState(false)
  const [usarTelefone2ComoPrincipal, setUsarTelefone2ComoPrincipal] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [codigoManual, setCodigoManual] = useState(false)
  const [valorPlano, setValorPlano] = useState('')
  const [descontoPreVenda, setDescontoPreVenda] = useState('')
  const [descontoTipo, setDescontoTipo] = useState<'valor' | 'percentual'>('valor')
  const [detalhamentoPlano, setDetalhamentoPlano] = useState('')
  const [camposAssinatura, setCamposAssinatura] = useState(false) // PV: bloco de assinatura no PDF (default Não = aceite digital)
  const [temSeguradora, setTemSeguradora] = useState(false)
  const [seguradoraNome, setSeguradoraNome] = useState('')
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
  const [outroNormalizado, setOutroNormalizado] = useState('')
  // Legado (manter pra padronização com busca)
  const [clinicaTextoLivre, setClinicaTextoLivre] = useState('')
  // Outros
  const [dataContrato, setDataContrato] = useState(hojeLocal())

  const [salvando, setSalvando] = useState(false)
  const [confirmarRetorno, setConfirmarRetorno] = useState(false)
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false)

  // Modo visualização: ficha já processada
  const modoVisualizacao = !!(ficha?.processada) || !!somenteLeitura

  // ============================================
  // Data loading
  // ============================================
  useEffect(() => {
    if (!isOpen || !ficha) return
    async function loadData() {
      const [{ data: estabs }, { data: conts }, { data: funcs }] = await Promise.all([
        supabase.from('estabelecimentos').select('id, nome, tipo, cidade').eq('unidade_id', ficha!.unidade_id).order('nome'),
        supabase.from('contatos').select('id, nome, cargo, estabelecimento_id').eq('ativo', true).eq('unidade_id', ficha!.unidade_id).order('nome'),
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
      if ((cpfLimpo.length !== 11 && cpfLimpo.length !== 14) || !/^\d+$/.test(cpfLimpo)) {
        setTutorExistente(null)
        setTutorChecked(true)
        return
      }
      // A base grava o CPF/CNPJ formatado (123.456.789-00). Buscar só pelos dígitos
      // limpos nunca casava — reconstrói o formato pontuado e busca pelos dois.
      const formatado = cpfLimpo.length === 11
        ? `${cpfLimpo.slice(0, 3)}.${cpfLimpo.slice(3, 6)}.${cpfLimpo.slice(6, 9)}-${cpfLimpo.slice(9)}`
        : `${cpfLimpo.slice(0, 2)}.${cpfLimpo.slice(2, 5)}.${cpfLimpo.slice(5, 8)}/${cpfLimpo.slice(8, 12)}-${cpfLimpo.slice(12)}`
      const { data } = await supabase
        .from('tutores')
        .select('id, nome')
        .or(`cpf.eq.${formatado},cpf.eq.${cpfLimpo}`)
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
    const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const tutor3 = semAcento((ficha.nome_completo || '').trim().slice(0, 3).toUpperCase())
    const pet3 = semAcento((ficha.nome_pet || '').trim().slice(0, 3).toUpperCase())
    const unidadeCod = currentUnit?.codigo || ''
    const rnd = Math.random().toString(36).slice(2, 4).toUpperCase()
    setCodigo(`${unidadeCod}${yy}${mm}${dd}${siglaCremacao}${tutor3}${pet3}${rnd}`)
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
      setDataContrato(hojeLocal())
      setSalvando(false)
      setTutorExistente(null)
      setTutorChecked(false)
      setLocalColeta('')
      setClinicaTextoLivre('')
      setEnderecoOutro('')
      setDescontoPreVenda('')
      setDescontoTipo('valor')
      setTemSeguradora(false)
      setSeguradoraNome('')
      setTelefoneConfirmado(false)
      setTelefone2('')
      setTelefone2DDI('55')
      setTelefone2DDICustom('')
      setTelefone2Nome('')
      setMostrarTelefone2(false)
      setUsarTelefone2ComoPrincipal(false)
      setConfirmarRetorno(false)
      setConfirmarCancelamento(false)
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
      setOutroNormalizado('')
      setIndicEstabBusca('')
      setIndicEstabAberto(false)
      setIndicEstabId(null)
      setIndicEstabNome('')
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
      if (ficha.localizacao_outra) {
        // Fluxo SEM módulo: input livre
        setClinicaTextoLivre(ficha.localizacao_outra)
        // Fluxo COM módulo: pré-preenche a busca para o concierge selecionar do dropdown
        // (ou criar novo registro se ainda não existir). estabId fica null até confirmar.
        setEstabBusca(ficha.localizacao_outra)
        setEstabNome(ficha.localizacao_outra)
      }
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

    // Pré-carrega o texto do tutor mas NÃO marca o checkbox automaticamente —
    // concierge decide se vai ativar e pode editar/buscar contato existente
    if (ficha.veterinario_especificar) {
      setIndicNomeQuemIndicou(ficha.veterinario_especificar)
      setIndicBusca(ficha.veterinario_especificar)
      setIndicNome(ficha.veterinario_especificar)
    }

    // Se ficha já processada, carregar op_dados do operador
    if (ficha.op_dados) {
      const op = ficha.op_dados as Record<string, unknown>
      if (op.codigo) setCodigo(String(op.codigo))
      if (op.codigoManual) setCodigoManual(true)
      if (op.funcionarioId) setFuncionarioId(String(op.funcionarioId))
      if (op.semResponsavel) setSemResponsavel(true)
      if (op.localColeta) setLocalColeta(op.localColeta as typeof localColeta)
      if (op.enderecoOutro) setEnderecoOutro(String(op.enderecoOutro))
      if (op.semLocal) setSemLocal(true)
      if (op.clinicaTextoLivre) setClinicaTextoLivre(String(op.clinicaTextoLivre))
      if (op.estabId) setEstabId(String(op.estabId))
      // Restaura o nome da clínica do concierge SEMPRE (mesmo sem estabId — clínica nova
      // digitada/criada). Sem isso, o pré-preenchimento cru (ficha.localizacao_outra) prevalece
      // no reabrir e a confirmação/PDF voltam a mostrar o texto torto do tutor.
      if (op.estabNome) { setEstabNome(String(op.estabNome)); setEstabBusca(String(op.estabNome)) }
      if (op.autonomo) setAutonomo(true)
      if (op.dataHoraAcolhimento) setDataHoraAcolhimento(String(op.dataHoraAcolhimento))
      if (op.semDataHora) setSemDataHora(true)
      if (op.lacre) setLacre(String(op.lacre))
      if (op.semLacre) setSemLacre(true)
      if (op.valorPlano) setValorPlano(String(op.valorPlano))
      if (op.descontoPreVenda) setDescontoPreVenda(String(op.descontoPreVenda))
      if (op.descontoTipo) setDescontoTipo(op.descontoTipo as 'valor' | 'percentual')
      if (op.detalhamentoPlano) setDetalhamentoPlano(String(op.detalhamentoPlano))
      if (op.camposAssinatura) setCamposAssinatura(true)
      if (op.temSeguradora) setTemSeguradora(true)
      if (op.seguradoraNome) setSeguradoraNome(String(op.seguradoraNome))
      if (op.dataContrato) setDataContrato(String(op.dataContrato))
      if (op.teveIndicacao) { setTeveIndicacao(true); setMostrarIndicacao(true) }
      if (op.indicNomeQuemIndicou) setIndicNomeQuemIndicou(String(op.indicNomeQuemIndicou))
      if (op.indicNomeAtivo) setIndicNomeAtivo(true)
      if (op.indicHospClinica) setIndicHospClinica(String(op.indicHospClinica))
      if (op.indicHospAtivo) setIndicHospAtivo(true)
      if (op.outroNormalizado) setOutroNormalizado(String(op.outroNormalizado))
      if (op.indicEstabId) { setIndicEstabId(String(op.indicEstabId)); setIndicEstabNome(String(op.indicEstabNome || '')); setIndicEstabBusca(String(op.indicEstabNome || '')) }
      if (op.indicEstabNome && !op.indicEstabId) setIndicEstabNome(String(op.indicEstabNome))
      if (op.indicId) setIndicId(String(op.indicId))
      if (op.indicNome) { setIndicNome(String(op.indicNome)); setIndicBusca(String(op.indicNome)) }
      if (op.indicCargo) setIndicCargo(String(op.indicCargo))
      if (op.telefoneConfirmado) setTelefoneConfirmado(true)
      if (op.telefone1Nome) setTelefone1Nome(String(op.telefone1Nome))
      if (op.mostrarTelefone2) setMostrarTelefone2(true)
      if (op.telefone2DDI) setTelefone2DDI(String(op.telefone2DDI))
      if (op.telefone2DDICustom) setTelefone2DDICustom(String(op.telefone2DDICustom))
      if (op.telefone2Nome) setTelefone2Nome(String(op.telefone2Nome))
      if (op.telefone2) {
        // Extrair só o número local (sem DDI) pra exibir formatado
        const tel2Completo = String(op.telefone2)
        const ddi = op.telefone2DDI ? String(op.telefone2DDI) : '55'
        const numLocal = tel2Completo.startsWith(ddi) ? tel2Completo.slice(ddi.length) : tel2Completo
        setTelefone2(numLocal.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2'))
        setMostrarTelefone2(true)
      }
      if (op.usarTelefone2ComoPrincipal) setUsarTelefone2ComoPrincipal(true)
    }
  }, [isOpen, ficha])

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (estabRef.current && !estabRef.current.contains(e.target as Node)) setEstabAberto(false)
      if (indicRef.current && !indicRef.current.contains(e.target as Node)) setIndicAberto(false)
      if (indicEstabRef.current && !indicEstabRef.current.contains(e.target as Node)) setIndicEstabAberto(false)
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

  // Contatos da indicação: filtra por nome se houver busca; quando há clínica selecionada, prioriza contatos dessa clínica + contatos sem estab cadastrado (legado).
  const contatosFiltrados = (() => {
    const termo = indicBusca.trim().toLowerCase()
    let lista = contatos
    // 1. Filtro por nome (sempre que houver texto)
    if (termo) lista = lista.filter(c => c.nome.toLowerCase().includes(termo))
    // 2. Quando há clínica selecionada: prioriza os dessa clínica + sem-estab no topo
    if (indicEstabId) {
      const desseEstab = lista.filter(c => c.estabelecimento_id === indicEstabId)
      const semEstab = lista.filter(c => !c.estabelecimento_id)
      const outros = lista.filter(c => c.estabelecimento_id && c.estabelecimento_id !== indicEstabId)
      lista = [...desseEstab, ...semEstab, ...outros]
    }
    return lista.slice(0, 10)
  })()

  // ============================================
  // processarFicha — salva dados do operador e marca como processada (NÃO cria contrato)
  // ============================================
  async function processarFicha() {
    if (!ficha) return
    // Gerar código se ainda vazio
    let codigoFinal = codigo.trim()
    if (!codigoFinal) {
      const now = new Date(dataContrato + 'T12:00:00')
      const yy = String(now.getFullYear()).slice(-2)
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const dd = String(now.getDate()).padStart(2, '0')
      const sc = ficha.cremacao?.toLowerCase() === 'individual' ? 'IND' : 'COL'
      const rmAc = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      const t3 = rmAc((ficha.nome_completo || '').trim().slice(0, 3).toUpperCase())
      const p3 = rmAc((ficha.nome_pet || '').trim().slice(0, 3).toUpperCase())
      const rnd2 = Math.random().toString(36).slice(2, 4).toUpperCase()
      codigoFinal = `${currentUnit?.codigo || ''}${yy}${mm}${dd}${sc}${t3}${p3}${rnd2}`
      setCodigo(codigoFinal)
    }
    setSalvando(true)

    try {
      // Salvar edições nos dados do cliente (se houve)
      if (Object.keys(fichaEdits).length > 0) {
        const editsParaSalvar = { ...fichaEdits }
        if (editsParaSalvar.outros_tutores) {
          editsParaSalvar.outros_tutores = JSON.parse(editsParaSalvar.outros_tutores)
        }
        const { error: errEdits } = await supabase.from('fichas').update(editsParaSalvar as never).eq('id', ficha.id)
        if (errEdits) throw new Error(`Erro ao salvar edições: ${errEdits.message}`)
      }

      // Resolver estabelecimento + contato da INDICAÇÃO — cria no banco se digitou novo
      let resolvedIndicEstabId: string | null = indicEstabId
      let resolvedIndicContatoId: string | null = indicId
      if (teveIndicacao && temPadronizacaoClinicas) {
        // Estabelecimento da indicação
        if (!resolvedIndicEstabId && indicEstabNome.trim()) {
          // endereco é NOT NULL sem default — precisa ir como '' senão o insert falha
          const { data: novoEstab, error: errEstab } = await supabase
            .from('estabelecimentos')
            .insert({ nome: indicEstabNome.trim(), tipo: 'clinica', unidade_id: ficha.unidade_id, endereco: '' } as never)
            .select('id').single() as { data: { id: string } | null; error: { message: string } | null }
          if (errEstab) throw new Error(`Erro ao criar estabelecimento: ${errEstab.message}`)
          if (novoEstab) {
            resolvedIndicEstabId = novoEstab.id
            setIndicEstabId(novoEstab.id)
          }
        }
        // Contato indicador (busca existente primeiro, senão cria)
        if (!resolvedIndicContatoId && indicNome.trim()) {
          let q = supabase.from('contatos').select('id').ilike('nome', indicNome.trim()).limit(1)
          if (resolvedIndicEstabId) q = q.eq('estabelecimento_id', resolvedIndicEstabId)
          const { data: contatoExist } = await q.maybeSingle() as { data: { id: string } | null }
          if (contatoExist) {
            resolvedIndicContatoId = contatoExist.id
            setIndicId(contatoExist.id)
          } else {
            const { data: novoContato, error: errContato } = await supabase
              .from('contatos')
              .insert({ nome: indicNome.trim(), cargo: indicCargo.trim() || null, estabelecimento_id: resolvedIndicEstabId, unidade_id: ficha.unidade_id } as never)
              .select('id').single() as { data: { id: string } | null; error: { message: string } | null }
            if (errContato) throw new Error(`Erro ao criar contato: ${errContato.message}`)
            if (novoContato) {
              resolvedIndicContatoId = novoContato.id
              setIndicId(novoContato.id)
            }
          }
        }
      }

      // Montar op_dados com tudo que o operador preencheu
      const opDados = {
        codigo: codigo.trim(),
        codigoManual,
        tipoPlano,
        funcionarioId: semResponsavel ? null : (funcionarioId || null),
        semResponsavel,
        localColeta,
        enderecoOutro: enderecoOutro || null,
        semLocal,
        clinicaTextoLivre: clinicaTextoLivre || null,
        estabId,
        estabNome: estabNome || null,
        autonomo,
        dataHoraAcolhimento: dataHoraAcolhimento || null,
        semDataHora,
        lacre: lacre || null,
        semLacre,
        valorPlano: valorPlano || null,
        descontoPreVenda: descontoPreVenda || null,
        descontoTipo,
        detalhamentoPlano: detalhamentoPlano.trim() || null,
        camposAssinatura,
        temSeguradora,
        seguradoraNome: seguradoraNome.trim() || null,
        dataContrato,
        // Indicação
        teveIndicacao,
        indicNomeQuemIndicou: indicNomeQuemIndicou || null,
        indicNomeAtivo,
        indicHospClinica: indicHospClinica || null,
        indicHospAtivo,
        indicEstabId: resolvedIndicEstabId,
        indicEstabNome: indicEstabNome || null,
        outroNormalizado: outroNormalizado || null,
        indicId: resolvedIndicContatoId,
        indicNome: indicNome || null,
        indicCargo: indicCargo || null,
        // Telefone
        telefoneConfirmado,
        telefone1Nome: telefone1Nome.trim() || null,
        telefone2: getTelefone2Completo() || null,
        telefone2Nome: telefone2Nome.trim() || null,
        usarTelefone2ComoPrincipal,
      }

      // Marcar como processada + salvar dados do operador
      const { data: { user } } = await supabase.auth.getUser()
      ;(opDados as Record<string, unknown>).processadoPorEmail = user?.email || null
      ;(opDados as Record<string, unknown>).processadoPorNome = userName || user?.email?.split('@')[0] || null

      const { error: errUpdate } = await supabase.from('fichas').update({
        processada: true,
        processada_em: new Date().toISOString(),
        op_dados: opDados,
      } as never).eq('id', ficha.id)

      if (errUpdate) throw new Error(`Erro ao salvar: ${errUpdate.message}`)

      toast('Ficha processada!', 'success')
      onClose('processada')
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
  // Criar contrato a partir de ficha processada
  async function criarContrato() {
    if (!ficha) return
    if (ficha.contrato_id) {
      toast('Esta ficha já virou contrato', 'error')
      return
    }
    setSalvando(true)
    const f = fichaAtual!

    try {
      // Step 1: Find or create tutor
      // Swap tel1↔tel2 leva o nome junto. tel1 (da ficha) é imutável; só apelido editável.
      const hasTel2 = !!getTelefone2Completo()
      const tel1NomeVal = telefone1Nome.trim() || null
      const tel2NomeVal = telefone2Nome.trim() || null
      const telPrincipal = hasTel2 && usarTelefone2ComoPrincipal ? getTelefone2Completo() : f.telefone
      const telSecundario = hasTel2 ? (usarTelefone2ComoPrincipal ? f.telefone : getTelefone2Completo()) : null
      const telPrincipalNome = hasTel2 && usarTelefone2ComoPrincipal ? tel2NomeVal : tel1NomeVal
      const telSecundarioNome = hasTel2 ? (usarTelefone2ComoPrincipal ? tel1NomeVal : tel2NomeVal) : null

      let tutorId = tutorExistente?.id || null
      if (!tutorId) {
        const { data: novoTutor, error: errTutor } = await supabase
          .from('tutores')
          .insert({
            nome: f.nome_completo?.toUpperCase() || '',
            cpf: f.cpf,
            telefone: telPrincipal,
            telefone2: telSecundario,
            telefone_nome: telPrincipalNome,
            telefone2_nome: telSecundarioNome,
            telefone_principal: 1,
            email: f.email || null,
            cep: f.cep, endereco: f.endereco, numero: f.numero, complemento: f.complemento || null,
            bairro: f.bairro, cidade: f.cidade, estado: f.estado, unidade_id: f.unidade_id,
          } as never).select('id').single() as { data: { id: string } | null; error: { message: string } | null }
        if (errTutor) throw new Error(`Erro ao criar tutor: ${errTutor.message}`)
        tutorId = novoTutor!.id
      }

      // Step 2: Fontes de conhecimento (múltiplas)
      let fonteConhecimentoId: string | null = null
      const fonteConhecimentoIds: string[] = []
      if (f.como_conheceu && f.como_conheceu.length > 0) {
        const fonteMap: Record<string, string> = {
          'Google': 'Google', 'Instagram/Facebook': 'Instagram/Facebook',
          'Veterinário': 'Indicação em Clínica', 'Parente/Amigo': 'Parente/Amigo',
          'Já utilizei a R.I.P. Pet': 'Cliente',
          'Passei pela Unidade': 'Ponto',
          'Outro': 'Outro',
        }
        for (const conheceu of f.como_conheceu) {
          const nomeExato = fonteMap[conheceu] || conheceu
          const { data: fonte } = await supabase.from('fontes_conhecimento').select('id').eq('nome', nomeExato).maybeSingle() as { data: { id: string } | null }
          if (fonte) {
            fonteConhecimentoIds.push(fonte.id)
            if (!fonteConhecimentoId) fonteConhecimentoId = fonte.id // primeiro = legado
          }
        }
      }

      // Step 3: Resolve estabelecimento + contato
      let resolvedEstabId: string | null = estabId
      let resolvedContatoId: string | null = indicId
      let clinicaColetaNome: string | null = null

      if (temPadronizacaoClinicas) {
        const AUTONOMOS_ESTAB_ID = 'b4eedcff-7ccf-4cfb-bf3a-1978eeec6382'
        if (autonomo) { resolvedEstabId = AUTONOMOS_ESTAB_ID; clinicaColetaNome = 'Autônomo' }
        else {
          clinicaColetaNome = estabNome.trim() || null
          if (!resolvedEstabId && estabNome.trim()) {
            // endereco é NOT NULL sem default — precisa ir como '' senão o insert falha silenciosamente
            const { data: novoEstab } = await supabase.from('estabelecimentos').insert({ nome: estabNome.trim(), tipo: 'clinica', unidade_id: f.unidade_id, endereco: '' } as never).select('id').single() as { data: { id: string } | null }
            if (novoEstab) resolvedEstabId = novoEstab.id
          }
        }
        // Nota: o contato indicador é resolvido por processarFicha (rehidratado via op_dados).
        // O fallback que existia aqui vinculava o contato ao estab de COLETA — semanticamente errado.
      } else {
        clinicaColetaNome = clinicaTextoLivre.trim() || null
      }

      // Step 4: Map local_coleta
      const localColetaMap: Record<string, string> = { residencia: 'Residência', clinica: 'Clínica', unidade: 'Unidade', outro: 'Outro' }
      const localColetaValor = localColetaMap[localColeta] || null

      // Step 4b: Buscar endereço do estabelecimento (se local = clínica)
      let estabEndereco: { endereco: string; bairro: string; cidade: string; cep: string } | null = null
      if (localColeta === 'clinica' && resolvedEstabId) {
        const { data: estabData } = await supabase
          .from('estabelecimentos')
          .select('endereco, bairro, cidade, cep')
          .eq('id', resolvedEstabId)
          .single() as { data: { endereco: string; bairro: string; cidade: string; cep: string } | null }
        estabEndereco = estabData
      }

      // Step 5: Insert contrato
      const contratoData = {
        codigo: codigo.trim(),
        unidade_id: f.unidade_id,
        // cb_cremacao_local (PI): EM nasce direto em 'pinda' (sem passar por 'ativo').
        // PV continua 'preventivo' até ser acionado. Trigger 091 cria contrato_gc no insert.
        // Checagem direta de modulos_ativos da unidade DA FICHA (não currentUnit) — super_admin
        // pode estar processando ficha de qualquer unidade, e hasModule() retorna true sempre pra ele.
        status: tipoPlano === 'emergencial'
          ? (currentUnit?.modulos_ativos?.includes('cb_cremacao_local') ? 'pinda' : 'ativo')
          : 'preventivo',
        tipo_plano: tipoPlano,
        tipo_cremacao: f.cremacao.toLowerCase() as 'individual' | 'coletiva',
        pet_nome: f.nome_pet?.toUpperCase() || '', pet_especie: f.especie.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
        pet_raca: f.raca || null, pet_genero: f.genero ? f.genero.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : null,
        pet_cor: f.cor || null, pet_peso: f.peso ? parseFloat(f.peso) || null : null,
        pet_idade_anos: f.idade ? parseInt(f.idade) || null : null,
        tutor_id: tutorId,
        tutor_nome: f.nome_completo?.toUpperCase() || '', tutor_cpf: f.cpf,
        tutor_telefone: telPrincipal,
        tutor_telefone2: telSecundario,
        tutor_telefone_nome: telPrincipalNome,
        tutor_telefone2_nome: telSecundarioNome,
        tutor_telefone_principal: 1,
        tutor_email: f.email || null, tutor_cidade: f.cidade || null, tutor_bairro: f.bairro || null,
        tutor_endereco: f.endereco ? `${f.endereco}, ${f.numero}${f.complemento ? ` - ${f.complemento}` : ''}` : null,
        tutor_cep: f.cep || null,
        clinica_coleta: clinicaColetaNome,
        contato_id: resolvedContatoId || null, estabelecimento_id: resolvedEstabId || null,
        funcionario_id: funcionarioId || null,
        fonte_conhecimento_id: fonteConhecimentoId,
        fonte_conhecimento_ids: fonteConhecimentoIds.length > 0 ? fonteConhecimentoIds : null,
        fonte_outro_especificar: f.como_conheceu?.includes('Outro') ? (f.outro_especificar?.trim() || null) : null,
        estabelecimento_indicacao_id: teveIndicacao && temPadronizacaoClinicas ? (indicEstabId || null) : null,
        indicacao_clinica: teveIndicacao ? (temPadronizacaoClinicas ? (indicEstabNome.trim() || null) : (indicHospClinica.trim() || null)) : null,
        indicacao_contato: teveIndicacao ? (indicNomeQuemIndicou.trim() || null) : null,
        data_contrato: dataContrato,
        data_acolhimento: dataHoraAcolhimento ? new Date(dataHoraAcolhimento).toISOString() : null,
        pelinho_quer: true, pelinho_feito: false, pelinho_quantidade: 1,
        velorio_deseja: f.velorio === 'Sim' ? true : f.velorio === 'Não' ? false : null,
        acompanhamento_online: f.acompanhamento?.includes('On-line') || false,
        acompanhamento_presencial: f.acompanhamento?.includes('Presencial') || false,
        valor_plano: valorPlano ? parseFloat(valorPlano) : null,
        desconto_plano_unificado: (() => {
          const d = parseFloat(descontoPreVenda) || 0
          if (!d) return 0
          if (descontoTipo === 'percentual') return ((parseFloat(valorPlano) || 0) * d) / 100
          return d
        })(),
        local_coleta: localColetaValor,
        remocao_endereco:
          localColeta === 'residencia' ? (f.endereco ? `${f.endereco}, ${f.numero}` : null)
          : localColeta === 'clinica' ? (estabEndereco?.endereco || clinicaColetaNome || null)
          : localColeta === 'outro' ? (enderecoOutro || null)
          : localColeta === 'unidade' ? (currentUnit?.endereco || null)
          : null,
        remocao_bairro:
          localColeta === 'residencia' ? f.bairro
          : localColeta === 'clinica' ? (estabEndereco?.bairro || null)
          : null,
        remocao_cidade:
          localColeta === 'residencia' ? f.cidade
          : localColeta === 'clinica' ? (estabEndereco?.cidade || null)
          : localColeta === 'unidade' ? (currentUnit?.cidade || null)
          : null,
        remocao_cep:
          localColeta === 'residencia' ? f.cep
          : localColeta === 'clinica' ? (estabEndereco?.cep || null)
          : null,
        numero_lacre: lacre || null,
        seguradora: temSeguradora && seguradoraNome.trim() ? seguradoraNome.trim() : null,
        observacoes: f.observacoes || null,
        descricao_contrato: detalhamentoPlano.trim() || null,
        certificado_nome_1: f.nome_completo || null,
        ...(f.outros_tutores ? Object.fromEntries(
          f.outros_tutores.filter(Boolean).slice(0, 6).map((nome, i) => [`certificado_nome_${i + 2}`, nome])
        ) : {}),
      }

      const { data: contrato, error: errContrato } = await supabase
        .from('contratos').insert(contratoData as never).select('id')
        .single() as { data: { id: string } | null; error: { message: string } | null }
      if (errContrato) throw new Error(`Erro ao criar contrato: ${errContrato.message}`)

      // Vincular contrato à ficha + marcar como processada (se ainda não estava).
      // Reconcilia op_dados com o que foi de fato usado pra criar o contrato — garante
      // que PDF da ficha, badges de pendência e o "desfazer ficha" (que preserva op_dados)
      // reflitam os campos provisórios preenchidos aqui, mesmo sem clicar "Salvar Pendências".
      const opPrev = (ficha.op_dados || {}) as Record<string, unknown>
      const opReconciliado = {
        ...opPrev,
        semLocal: localColeta ? false : semLocal,
        localColeta: localColeta || opPrev.localColeta,
        semResponsavel: funcionarioId ? false : semResponsavel,
        funcionarioId: funcionarioId || opPrev.funcionarioId,
        semDataHora: dataHoraAcolhimento ? false : semDataHora,
        dataHoraAcolhimento: dataHoraAcolhimento || opPrev.dataHoraAcolhimento,
        semLacre: lacre.trim() ? false : semLacre,
        lacre: lacre.trim() || opPrev.lacre,
      }
      const { error: errLink } = await supabase.from('fichas').update({
        contrato_id: contrato!.id,
        processada: true,
        processada_em: ficha.processada ? undefined : new Date().toISOString(),
        op_dados: opReconciliado,
      } as never).eq('id', ficha.id)
      if (errLink) throw new Error(`Erro ao vincular ficha ao contrato: ${errLink.message}`)

      // Migrar observações da ficha pra tarefas (se houver)
      if (f.observacoes) {
        const { data: tipoFicha } = await supabase.from('tarefa_tipos').select('id').eq('nome', 'Observação da Ficha').maybeSingle() as { data: { id: string } | null }
        if (tipoFicha) {
          await supabase.from('tarefas').insert({
            contrato_id: contrato!.id,
            descricao: f.observacoes,
            tipo_id: tipoFicha.id,
            unidade_id: f.unidade_id,
            criado_por: 'Tutor (ficha)',
            criado_por_email: f.email || null,
          } as never)
        }
      }

      // Detalhamento do plano vira observação no contrato (tarefa "Observação da Unidade")
      if (detalhamentoPlano.trim()) {
        const { data: tipoUnidade } = await supabase.from('tarefa_tipos').select('id').eq('nome', 'Observação da Unidade').maybeSingle() as { data: { id: string } | null }
        if (tipoUnidade) {
          await supabase.from('tarefas').insert({
            contrato_id: contrato!.id,
            descricao: `Plano: ${detalhamentoPlano.trim()}`,
            tipo_id: tipoUnidade.id,
            unidade_id: f.unidade_id,
            criado_por: userName || 'Operador',
          } as never)
        }
      }

      toast('Contrato criado com sucesso!', 'success')
      onSuccess(contrato!.id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      toast(message, 'error')
      console.error('Erro ao criar contrato:', err)
    } finally {
      setSalvando(false)
    }
  }

  // Salvar alterações nos dados do operador (ficha já processada)
  async function salvarAlteracoes() {
    if (!ficha) return
    setSalvando(true)
    try {
      // Salvar edições nos dados do cliente
      if (Object.keys(fichaEdits).length > 0) {
        const editsParaSalvar = { ...fichaEdits }
        if (editsParaSalvar.outros_tutores) {
          editsParaSalvar.outros_tutores = JSON.parse(editsParaSalvar.outros_tutores)
        }
        const { error: errEdits } = await supabase.from('fichas').update(editsParaSalvar as never).eq('id', ficha.id)
        if (errEdits) throw new Error(`Erro ao salvar edições: ${errEdits.message}`)
      }
      // Atualizar op_dados
      const opDados = {
        codigo: codigo.trim(), codigoManual, tipoPlano,
        funcionarioId: semResponsavel ? null : (funcionarioId || null), semResponsavel,
        localColeta, enderecoOutro: enderecoOutro || null, semLocal,
        clinicaTextoLivre: clinicaTextoLivre || null, estabId, estabNome: estabNome || null, autonomo,
        dataHoraAcolhimento: dataHoraAcolhimento || null, semDataHora,
        lacre: lacre || null, semLacre,
        valorPlano: valorPlano || null, descontoPreVenda: descontoPreVenda || null, descontoTipo,
        temSeguradora, seguradoraNome: seguradoraNome.trim() || null,
        dataContrato,
        teveIndicacao, indicNomeQuemIndicou: indicNomeQuemIndicou || null, indicNomeAtivo,
        indicHospClinica: indicHospClinica || null, indicHospAtivo, indicEstabId, indicEstabNome: indicEstabNome || null,
        indicId, indicNome: indicNome || null, indicCargo: indicCargo || null,
        telefoneConfirmado, telefone2: getTelefone2Completo() || null, telefone2Nome: telefone2Nome.trim() || null, telefone2DDI, telefone2DDICustom, mostrarTelefone2, usarTelefone2ComoPrincipal,
      }
      await supabase.from('fichas').update({ op_dados: opDados } as never).eq('id', ficha.id)
      toast('Alterações salvas!', 'success')
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar', 'error')
    } finally {
      setSalvando(false)
    }
  }

  // Validação do bloco de acolhimento
  // Telefone OK = (confirmou número da ficha + apelido) OU (informou número alternativo + nome/relação)
  const telefoneOk = (telefoneConfirmado && !!telefone1Nome.trim()) || (mostrarTelefone2 && !!telefone2.trim() && !!telefone2Nome.trim())
  const localOk = semLocal || !!localColeta
  const responsavelOk = semResponsavel || !!funcionarioId
  const dataHoraOk = semDataHora || !!dataHoraAcolhimento
  const lacreOk = semLacre || !!lacre.trim()
  const valorOk = !!valorPlano.trim()
  const fonteOk = !!(ficha?.como_conheceu && ficha.como_conheceu.length > 0)
  const acolhimentoValido = isPreventivo
    ? (telefoneOk && valorOk)  // PV: sem acolhimento (local/responsável/data/lacre escondidos)
    : (telefoneOk && localOk && responsavelOk && dataHoraOk && lacreOk && valorOk)

  // Iniciar Fluxo: mais rigoroso — local, responsável, data/hora e fonte de conhec. NÃO podem ser provisórios (só lacre pode)
  const fluxoValido = isPreventivo
    ? (telefoneOk && valorOk && fonteOk)  // PV: pet vivo, sem acolhimento
    : (telefoneOk && !!localColeta && !!funcionarioId && !!dataHoraAcolhimento && lacreOk && valorOk && fonteOk)

  const footer = somenteLeitura ? (
    /* Modo somente leitura (recebidas) — Cancelar, Fechar e Processar */
    <div className="flex gap-2 justify-between w-full">
      <button
        onClick={() => setConfirmarCancelamento(true)}
        className="py-2 px-4 rounded-lg text-xs font-semibold text-red-400 border border-red-500/30 hover:bg-red-900/20 transition-colors"
      >
        Cancelar Ficha
      </button>
      <div className="flex gap-2">
        <button onClick={() => onClose()} className="py-2 px-4 rounded-lg text-xs font-semibold text-[var(--surface-600)] border border-[var(--surface-200)] hover:bg-[var(--surface-50)] transition-colors">
          Fechar
        </button>
        <button
          onClick={() => { onClose(); if (ficha) setTimeout(() => onReprocessar?.(ficha), 100) }}
          className="py-2 px-4 rounded-lg text-xs font-semibold text-white bg-[var(--brand-600)] hover:bg-[var(--brand-700)] transition-colors"
        >
          Processar
        </button>
      </div>
    </div>
  ) : modoVisualizacao ? (
    /* Modo processada — ações completas */
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
      {!ficha?.contrato_id && (
        <button
          onClick={() => setConfirmarCancelamento(true)}
          className="py-2 px-3 rounded-lg text-xs font-semibold text-red-400 border border-red-500/30 hover:bg-red-900/20 transition-colors"
        >
          Cancelar Ficha
        </button>
      )}
      {!ficha?.contrato_id && (
        <button
          onClick={async () => {
            if (!ficha) return
            const supabaseLocal = createClient()
            await supabaseLocal.from('fichas').update({ processada: false } as never).eq('id', ficha.id)
            onClose()
            onReprocessar?.(ficha)
          }}
          className="py-2 px-3 rounded-lg text-xs font-semibold text-amber-400 border border-amber-500/30 hover:bg-amber-900/20 transition-colors"
        >
          Reprocessar
        </button>
      )}
      <button onClick={() => onClose()} className="py-2 px-3 rounded-lg text-xs font-semibold text-[var(--surface-600)] border border-[var(--surface-200)] hover:bg-[var(--surface-50)] transition-colors">
        Fechar
      </button>
      {ficha.contrato_id ? (
        <a
          href={`/contratos/${ficha.contrato_id}`}
          className="py-2 px-3 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors text-center"
        >
          Ver Contrato
        </a>
      ) : isVisible('tela_fichas', 'btn_iniciar_fluxo') && (() => {
        const faltam: string[] = []
        if (!telefoneOk) faltam.push('Telefone')
        if (!isPreventivo && !localColeta) faltam.push('Local de Acolhimento')
        if (!isPreventivo && !funcionarioId) faltam.push('Responsável')
        if (!isPreventivo && !dataHoraAcolhimento) faltam.push('Data/Hora')
        if (!valorPlano.trim()) faltam.push('Valor do Plano')
        if (!fonteOk) faltam.push('Como nos conheceu')
        const labelBtn = isPreventivo ? 'Criar Contrato' : 'Iniciar Fluxo'
        const titulo = fluxoValido
          ? `${labelBtn} (criar contrato)`
          : `Preencha antes: ${faltam.join(', ')}`
        return (
          <button
            onClick={criarContrato}
            disabled={salvando || !fluxoValido}
            title={titulo}
            className="py-2 px-3 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:bg-emerald-600/40 disabled:cursor-not-allowed"
          >
            {salvando ? 'Criando...' : labelBtn}
          </button>
        )
      })()}
    </div>
  ) : (
    <div className="flex gap-3 justify-between w-full">
      {!ficha?.contrato_id && (
        <button
          onClick={() => setConfirmarCancelamento(true)}
          disabled={salvando}
          className="py-2 px-4 rounded-lg text-xs font-semibold text-red-400 border border-red-500/30 hover:bg-red-900/20 transition-colors disabled:opacity-50"
        >
          Cancelar Ficha
        </button>
      )}
      <div className="flex gap-3">
        <button onClick={() => onClose()} className="btn-secondary" disabled={salvando}>
          Fechar
        </button>
        <button
          onClick={processarFicha}
          disabled={salvando || !acolhimentoValido}
          className="btn-primary disabled:opacity-50"
        >
          {salvando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processando...
            </>
          ) : (
            'Processar'
          )}
        </button>
      </div>
    </div>
  )

  const modalTitle = somenteLeitura ? 'Visualizar Ficha' : modoVisualizacao ? 'Ficha Processada' : 'Processar Ficha'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} footer={footer} size="xl">
      {/* Popup confirmar retorno */}
      {confirmarRetorno && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4 bg-[var(--surface-0)] border border-[var(--surface-200)]">
            <h3 className="text-sm font-bold text-amber-400">Retornar para Recebidas?</h3>
            <p className="text-xs text-[var(--surface-500)]">
              Esta ficha será retornada para a fila de recebidas. Os dados preenchidos serão mantidos. O concierge precisará processar novamente.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setConfirmarRetorno(false)} className="px-3 py-1.5 rounded-lg text-sm text-[var(--surface-600)] hover:bg-[var(--surface-100)]">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (!ficha) return
                  const supabaseLocal = createClient()
                  await supabaseLocal.from('fichas').update({
                    processada: false,
                    contrato_id: null,
                    processada_em: null,
                    processada_por: null,
                  } as never).eq('id', ficha.id)
                  setConfirmarRetorno(false)
                  onClose()
                  onRetornarPendente?.()
                }}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Popup confirmar cancelamento */}
      {confirmarCancelamento && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4 bg-[var(--surface-0)] border border-[var(--surface-200)]">
            <h3 className="text-sm font-bold text-red-400">Cancelar esta ficha?</h3>
            <p className="text-xs text-[var(--surface-500)]">
              A ficha será marcada como cancelada e não poderá mais ser processada. Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setConfirmarCancelamento(false)} className="px-3 py-1.5 rounded-lg text-sm text-[var(--surface-600)] hover:bg-[var(--surface-100)]">
                Voltar
              </button>
              <button
                onClick={async () => {
                  if (!ficha) return
                  const supabaseLocal = createClient()
                  const { data: { user } } = await supabaseLocal.auth.getUser()
                  await supabaseLocal.from('fichas').update({
                    op_dados: { ...(ficha.op_dados || {}), cancelada: true, cancelada_em: new Date().toISOString(), cancelada_por: user?.email || null },
                  } as never).eq('id', ficha.id)
                  setConfirmarCancelamento(false)
                  onClose()
                  onRetornarPendente?.()
                }}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700"
              >
                Cancelar Ficha
              </button>
            </div>
          </div>
        </div>
      )}
      {modoVisualizacao ? (
        /* ═══════ MODO RESUMO (ficha processada) ═══════ */
        <div className="space-y-4">
          {/* Resumo dos dados */}
          {(() => {
            const pesoNum = ficha?.peso ? parseFloat(ficha.peso) : null
            const pesoColor = pesoNum == null ? 'text-[var(--surface-400)]'
              : pesoNum <= 10 ? 'text-emerald-400' : pesoNum <= 25 ? 'text-yellow-400' : pesoNum <= 40 ? 'text-orange-400' : 'text-red-400'
            const isInd = ficha?.cremacao?.toLowerCase() === 'individual'
            const vPlano = valorPlano ? parseFloat(valorPlano) : 0
            const dDesc = descontoPreVenda ? parseFloat(descontoPreVenda) : 0
            const descReal = descontoTipo === 'percentual' ? (vPlano * dDesc) / 100 : dDesc
            const vFinal = Math.max(vPlano - descReal, 0)

            return (
            <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tutor */}
            <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)] space-y-1">
              <h4 className="text-[10px] font-bold text-[var(--surface-500)] uppercase tracking-wider mb-1">Tutor</h4>
              <p className="text-sm font-bold text-blue-400">{ficha?.nome_completo?.toUpperCase()}</p>
              <p className="text-xs text-[var(--surface-600)] text-mono">{ficha?.cpf} | {formatarTel(ficha?.telefone)}</p>
              {ficha?.email && <p className="text-xs text-[var(--surface-500)]">{ficha.email}</p>}
              <p className="text-xs text-[var(--surface-500)]">{ficha?.endereco}, {ficha?.numero} — {ficha?.bairro}, {ficha?.cidade}/{ficha?.estado}</p>
              {(telefoneConfirmado || (mostrarTelefone2 && getTelefone2Completo())) && (
                <div className="mt-1.5 pt-1.5 border-t border-[var(--surface-200)]">
                  {mostrarTelefone2 && getTelefone2Completo() ? (
                    <p className="text-xs text-amber-400">
                      <Phone className="h-3 w-3 inline mr-0.5" />
                      <strong>Chamar:</strong> <span className="text-mono">{formatarTel(getTelefone2Completo())}</span>
                      {telefone2Nome && <> — <strong>{telefone2Nome}</strong></>}
                      <span className="text-[var(--surface-400)] ml-1">(não é o tutor)</span>
                    </p>
                  ) : telefoneConfirmado ? (
                    <p className="text-xs text-emerald-400">
                      <Phone className="h-3 w-3 inline mr-0.5" />
                      <strong>Chamar:</strong> {telefone1Nome || ficha?.nome_completo?.split(' ')[0]}
                      <span className="text-[var(--surface-400)] ml-1">(no número acima)</span>
                    </p>
                  ) : null}
                </div>
              )}
              {ficha?.outros_tutores && ficha.outros_tutores.filter(Boolean).length > 0 && (
                <p className="text-xs text-[var(--surface-400)]">Certificado: {ficha.outros_tutores.filter(Boolean).join(', ')}</p>
              )}
            </div>
            {/* Pet */}
            <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)] space-y-1">
              <h4 className="text-[10px] font-bold text-[var(--surface-500)] uppercase tracking-wider mb-1">Pet</h4>
              <p className="text-sm font-bold text-[var(--surface-800)]">{ficha?.nome_pet?.toUpperCase()}</p>
              <p className="text-xs text-[var(--surface-600)]">{formatarDisplay(ficha?.especie)} | {ficha?.raca || '-'} | {formatarDisplay(ficha?.genero)}</p>
              <div className="flex items-center gap-3 text-xs">
                <span>Cor: {ficha?.cor}</span>
                <span className={`font-bold ${pesoColor}`}>Peso: {ficha?.peso ? `${ficha.peso}kg` : '-'}</span>
                <span>Idade: {ficha?.idade || '-'}</span>
              </div>
              {!isPreventivo && <p className="text-xs text-[var(--surface-600)]"><strong>Localização:</strong> {ficha?.localizacao}{ficha?.localizacao_outra ? ` (${ficha.localizacao_outra})` : ''}</p>}
            </div>
          </div>

          {/* Serviço + Acolhimento */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)] space-y-1.5">
              <h4 className="text-[10px] font-bold text-[var(--surface-500)] uppercase tracking-wider mb-1">Serviço</h4>
              <p className="text-xs text-[var(--surface-600)]">
                <strong>Cremação:</strong>{' '}
                <span className={`font-bold ${isInd ? 'text-emerald-400' : 'text-purple-400'}`}>{formatarDisplay(ficha?.cremacao)}</span>
              </p>
              {!somenteLeitura && (
                <div className="text-xs text-[var(--surface-600)]">
                  <strong>Valor Plano:</strong>{' '}
                  <span className="font-bold text-emerald-400">R$ {vPlano.toLocaleString('pt-BR')}</span>
                  {descReal > 0 && (
                    <span className="text-red-400 ml-1">
                      − R$ {descReal.toLocaleString('pt-BR')} ({descontoTipo === 'percentual' ? `${descontoPreVenda}%` : 'desc.'})
                    </span>
                  )}
                  {descReal > 0 && (
                    <span className="font-bold text-emerald-400 ml-1">= R$ {vFinal.toLocaleString('pt-BR')}</span>
                  )}
                </div>
              )}
              {!isPreventivo && (
              <p className="text-xs text-[var(--surface-600)]">
                <strong>Pagamento:</strong> {formatarDisplay(fichaAtual?.pagamento)}
                {fichaAtual?.pagamento === 'Cartão Crédito' && (
                  <>
                    {' | '}
                    <strong>Parcelas:</strong>{' '}
                    {fichaAtual?.parcelas
                      ? <span className="font-semibold text-[var(--surface-700)]">{fichaAtual.parcelas}</span>
                      : <span className="text-amber-400">a definir</span>}
                  </>
                )}
              </p>
              )}
              {!isPreventivo && <p className="text-xs text-[var(--surface-600)]"><strong>Velório:</strong> {ficha?.velorio} | <strong>Acomp.:</strong> {ficha?.acompanhamento}</p>}
            </div>
            {/* Info Adicional — como conheceu */}
            <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)] space-y-1.5">
              <h4 className="text-[10px] font-bold text-[var(--surface-500)] uppercase tracking-wider mb-1">Informações Adicionais</h4>
              {ficha?.como_conheceu && ficha.como_conheceu.length > 0 && (
                <p className="text-xs text-[var(--surface-600)]"><strong>Como conheceu:</strong> {ficha.como_conheceu.join(', ')}{ficha.veterinario_especificar ? ` (${ficha.veterinario_especificar})` : ''}{ficha.outro_especificar ? ` (${ficha.outro_especificar})` : ''}</p>
              )}
              {!somenteLeitura && teveIndicacao && (indicNomeQuemIndicou || indicEstabNome || indicHospClinica) && (
                <p className="text-xs text-[var(--surface-600)]"><strong>Indicação normalizada:</strong> {[indicNomeQuemIndicou, indicEstabNome || indicHospClinica].filter(Boolean).join(' - ')}</p>
              )}
            </div>
          </div>
            </>
            )
          })()}

          {ficha?.observacoes && (
            <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)]">
              <h4 className="text-[10px] font-bold text-[var(--surface-500)] uppercase tracking-wider mb-1">Observações</h4>
              <p className="text-xs text-[var(--surface-600)] whitespace-pre-wrap">{ficha.observacoes}</p>
            </div>
          )}

          {/* Acolhimento — só processadas E só emergencial (PV não tem acolhimento) */}
          {!somenteLeitura && !isPreventivo && (
            <div className="p-3 rounded-lg border border-amber-500/20 space-y-1.5" style={{ background: 'rgba(250, 204, 21, 0.05)' }}>
              <h4 className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1">Dados do Concierge — Acolhimento</h4>
              {(() => {
                const localMap: Record<string, string> = { residencia: 'Residência (Endereço de Cadastro)', unidade: 'Unidade RIP PET' }
                const clinicaColetaLabel = temPadronizacaoClinicas ? estabNome : clinicaTextoLivre
                const localLabel = localColeta === 'outro' ? (enderecoOutro || 'Outro endereço') : localColeta === 'clinica' ? (clinicaColetaLabel || 'Clínica / Hospital') : (localMap[localColeta] || localColeta || '')
                return <p className="text-xs text-[var(--surface-600)]"><strong>Local:</strong> {localLabel ? localLabel : <span className="text-amber-400">A definir</span>}</p>
              })()}
              <p className="text-xs text-[var(--surface-600)]"><strong>Responsável:</strong> {funcionarioId ? (funcionarios.find(f => f.id === funcionarioId)?.nome || '-') : <span className="text-amber-400">A definir</span>}</p>
              <p className="text-xs text-[var(--surface-600)]"><strong>Data/Hora:</strong> {dataHoraAcolhimento ? new Date(dataHoraAcolhimento).toLocaleString('pt-BR') : <span className="text-amber-400">A definir</span>}</p>
              <p className="text-xs text-[var(--surface-600)]"><strong>Lacre:</strong> {lacre ? lacre : <span className="text-amber-400">A definir</span>}</p>
              <p className="text-xs text-[var(--surface-600)]">
                <strong>Contato ativo:</strong>{' '}
                {telefoneConfirmado && !mostrarTelefone2 ? (
                  <span className="text-emerald-400">{formatarTel(ficha?.telefone)} (mesmo da ficha)</span>
                ) : mostrarTelefone2 && getTelefone2Completo() ? (
                  <span className="text-amber-400">
                    {formatarTel(getTelefone2Completo())}
                    {telefone2Nome.trim() && <span className="text-[var(--surface-500)]"> — {telefone2Nome.trim()}</span>}
                    <span className="text-[var(--surface-400)]"> (ficha: {formatarTel(ficha?.telefone)})</span>
                  </span>
                ) : (
                  <span className="text-amber-400">Não definido</span>
                )}
              </p>
            </div>
          )}

          {/* Botão enviar confirmação WhatsApp — só processadas */}
          {!somenteLeitura && (<>
          <button
            type="button"
            onClick={() => {
              if (!ficha) return
              const op = (ficha.op_dados || {}) as Record<string, unknown>
              // Telefone atuante
              const tel = (op.usarTelefone2ComoPrincipal && op.telefone2)
                ? String(op.telefone2).replace(/\D/g, '')
                : ficha.telefone?.replace(/\D/g, '') || ''
              // Montar mensagem
              const cremacao = ficha.cremacao || ''
              const valorOp = op.valorPlano ? parseFloat(String(op.valorPlano)) : null
              const descontoOp = op.descontoPreVenda ? parseFloat(String(op.descontoPreVenda)) : 0
              const descontoTipoOp = (op.descontoTipo as string) || 'valor'
              const descontoRealOp = descontoTipoOp === 'percentual' && valorOp ? (valorOp * descontoOp) / 100 : descontoOp
              const valorFinal = valorOp != null ? valorOp - descontoRealOp : (ficha.valor || 0)
              const valor = valorFinal ? `R$ ${valorFinal.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : ''
              const dataEnvio = new Date(ficha.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              const outrosNomes = ficha.outros_tutores?.filter(Boolean)
              const nomesCert = [ficha.nome_completo?.toUpperCase(), ...(outrosNomes || []).map(n => n.toUpperCase())].filter(Boolean).join(', ')

              let msg = `*Por favor, _confirme_ se as informações abaixo estão _corretas_*\n\n_Dados Enviados em ${dataEnvio}_\n\n`
              msg += `*- DADOS DO TUTOR:*\n`
              msg += `*Nome p/ Contrato e Certificado:* ${nomesCert}\n`
              msg += `*Telefone Contato:* ${formatarTel(ficha.telefone)} | *${labelDocumento(ficha.cpf)}:* ${ficha.cpf}\n`
              if (ficha.email) msg += `*Email:* ${ficha.email}\n`
              msg += `*Endereço:* ${ficha.endereco} ${ficha.numero}${ficha.complemento ? ` - ${ficha.complemento}` : ''} - ${ficha.bairro}\n`
              msg += `*CEP:* ${ficha.cep} | *Cidade:* ${ficha.cidade} | *UF:* ${ficha.estado}\n`
              msg += `\n*- DADOS DO PET:*\n`
              msg += `*Nome:* ${ficha.nome_pet?.toUpperCase()}\n`
              msg += `*Espécie:* ${formatarDisplay(ficha.especie)} | *Raça:* ${ficha.raca || 'Não tem'}\n`
              msg += `*Idade:* ${ficha.idade || '-'} | *Gênero:* ${formatarDisplay(ficha.genero)}\n`
              msg += `*Cor:* ${ficha.cor} | *Peso Aproximado:* ${ficha.peso || '-'}\n`
              if (!isPreventivo) {
                const clinicaColetaMsg = (temPadronizacaoClinicas ? estabNome : clinicaTextoLivre) || ficha.localizacao_outra || ficha.localizacao
                const localMsg = localColeta === 'clinica' ? clinicaColetaMsg
                  : localColeta === 'outro' ? (enderecoOutro || ficha.localizacao_outra || 'Outro endereço')
                  : localColeta === 'residencia' ? 'Residência (Endereço de Cadastro)'
                  : localColeta === 'unidade' ? 'Unidade RIP PET'
                  : `${ficha.localizacao}${ficha.localizacao_outra ? ` (${ficha.localizacao_outra})` : ''}`
                msg += `*Localização:* ${localMsg}\n`
              }
              msg += `\n*- DADOS DA ${isPreventivo ? 'CONTRATAÇÃO PREVENTIVA' : 'CREMAÇÃO'}:*\n`
              msg += `*Cremação Escolhida:* ${cremacao} | *Valor:* ${valor || '-'}\n`
              if (!isPreventivo) {
                msg += `*Forma de Pagamento:* ${formatarDisplay(ficha.pagamento)}${ficha.parcelas ? ` ${ficha.parcelas}` : ''}\n`
                msg += `*Velório:* ${ficha.velorio}\n`
                msg += `*Acompanhamento da Cremação:* ${ficha.acompanhamento}\n`
              }
              if (ficha.como_conheceu && ficha.como_conheceu.length > 0) {
                const indNome = indicNomeQuemIndicou || ficha.veterinario_especificar
                const indClinica = indicEstabNome || indicHospClinica
                const indParts = [indNome, indClinica].filter(Boolean)
                if (indParts.length > 0) {
                  msg += `\n*Como nos Conheceu:* ${indParts.join(' - ')}`
                } else {
                  msg += `\n*Como nos Conheceu:* ${ficha.como_conheceu.join(', ')}`
                  if (ficha.outro_especificar) msg += ` (${ficha.outro_especificar})`
                }
              }
              if (ficha.observacoes) msg += `\n\n*Observações:* ${ficha.observacoes}`

              window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank')
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-green-600 text-white font-semibold text-sm hover:bg-green-700 transition-colors"
          >
            <img src="/wts-icon.png" alt="WhatsApp" className="h-5 w-5 object-contain" />
            Enviar Confirmação
          </button>

          {/* Gerar Contrato PDF */}
          <button
            type="button"
            onClick={async () => {
              if (!ficha) return
              const op = (ficha.op_dados || {}) as Record<string, unknown>
              const nomeUnidade = currentUnit ? `${currentUnit.cidade} - ${currentUnit.estado}` : 'Santos - SP'
              const opLocalColeta = op.localColeta as string | null
              const opClinicaColeta = temPadronizacaoClinicas ? (op.estabNome as string) : (op.clinicaTextoLivre as string)
              const localPdf = opLocalColeta === 'clinica' ? (opClinicaColeta || ficha.localizacao_outra || ficha.localizacao)
                : opLocalColeta === 'outro' ? ((op.enderecoOutro as string) || ficha.localizacao_outra || '')
                : opLocalColeta === 'residencia' ? 'Residência (Endereço de Cadastro)'
                : opLocalColeta === 'unidade' ? 'Unidade RIP PET'
                : ficha.localizacao
              const vp = op.valorPlano ? parseFloat(String(op.valorPlano)) : ficha.valor
              const dp = op.descontoPreVenda ? parseFloat(String(op.descontoPreVenda)) : 0
              const dt = (op.descontoTipo as string) || 'valor'
              const dr = dt === 'percentual' && vp ? (vp * dp) / 100 : dp
              const valorFinal = vp ? Math.max(vp - dr, 0) : null

              try {
                const blob = await gerarContratoPDF({
                  codigo: String(op.codigo || codigo),
                  lacre: op.lacre ? String(op.lacre) : null,
                  tutorNome: ficha.nome_completo || '',
                  tutorTelefone: ficha.telefone || '',
                  tutorCpf: ficha.cpf || '',
                  tutorEmail: ficha.email,
                  tutorEndereco: ficha.endereco ? `${ficha.endereco}, ${ficha.numero}${ficha.complemento ? ` - ${ficha.complemento}` : ''}` : null,
                  tutorEstado: ficha.estado,
                  tutorCidade: ficha.cidade,
                  tutorBairro: ficha.bairro,
                  tutorCep: ficha.cep,
                  petNome: ficha.nome_pet || '',
                  petEspecie: ficha.especie,
                  petRaca: ficha.raca,
                  petIdade: ficha.idade ? parseInt(ficha.idade) || null : null,
                  petCor: ficha.cor,
                  petGenero: ficha.genero,
                  petPeso: ficha.peso ? parseFloat(ficha.peso) || null : null,
                  localColeta: localPdf,
                  tipoCremacao: ficha.cremacao?.toLowerCase() as 'individual' | 'coletiva',
                  valorPlano: valorFinal,
                  metodoPagamento: ficha.pagamento,
                  parcelas: ficha.parcelas ? parseInt(ficha.parcelas.replace(/\D/g, '')) || null : null,
                  velorioDeseja: ficha.velorio === 'Sim' ? true : ficha.velorio === 'Não' ? false : null,
                  acompanhamentoOnline: ficha.acompanhamento?.includes('On-line') || false,
                  acompanhamentoPresencial: ficha.acompanhamento?.includes('Presencial') || false,
                  temDesconto: dp > 0,
                  dataAcolhimento: (op.dataHoraAcolhimento as string) || null,
                  tipoPlano: isPreventivo ? 'preventivo' : 'emergencial',
                  dataContrato: (op.dataContrato as string) || dataContrato || null,
                  descricaoContrato: (op.detalhamentoPlano as string) || detalhamentoPlano.trim() || null,
                  assinaturaCampos: op.camposAssinatura !== undefined ? !!op.camposAssinatura : camposAssinatura,
                }, nomeUnidade)
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = contratoFilename(String(op.codigo || codigo), ficha.nome_pet || 'PET')
                a.click()
                URL.revokeObjectURL(url)
              } catch (err) {
                console.error('Erro ao gerar PDF:', err)
              }
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-600 text-white font-semibold text-sm hover:bg-red-700 transition-colors"
          >
            <img src="/pdf-icon.png" alt="PDF" className="h-5 w-5 object-contain" />
            Gerar Contrato PDF
          </button>

          {/* DA — pede o De Acordo do contrato PV (aceite eletrônico).
              ⚠️ Existe cópia em fichas/page.tsx (montarMsgDeAcordo) — manter em sincronia. */}
          {isPreventivo && (
            <button
              type="button"
              onClick={() => {
                if (!ficha) return
                const op = (ficha.op_dados || {}) as Record<string, unknown>
                const tel = (op.usarTelefone2ComoPrincipal && op.telefone2)
                  ? String(op.telefone2).replace(/\D/g, '')
                  : ficha.telefone?.replace(/\D/g, '') || ''
                const codigoDa = String(op.codigo || codigo || '')
                let msg = `📄 *Contrato Preventivo${codigoDa ? ` — ${codigoDa}` : ''}*\n`
                msg += `*Pet:* ${ficha.nome_pet?.toUpperCase() || '-'}${ficha.cremacao ? ` | *Cremação:* ${ficha.cremacao}` : ''}\n\n`
                msg += `Por favor, confira com atenção os dados e as condições do contrato enviado acima.\n\n`
                msg += `Estando tudo certo, nos responda com o seu *"De acordo"*`
                window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank')
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition-colors"
            >
              <img src="/wts-icon.png" alt="WhatsApp" className="h-5 w-5 object-contain" />
              DA — Pedir &quot;De Acordo&quot;
            </button>
          )}

          </>)}

          {/* Campos provisórios — editáveis (só processadas) */}
          {!somenteLeitura && (semLocal || semResponsavel || semDataHora || semLacre) && (
            <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(250, 204, 21, 0.08)', border: '1px solid rgba(250, 204, 21, 0.2)' }}>
              <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">Campos Pendentes (provisórios)</h4>
              <p className="text-[10px] text-amber-400/70">Preencha abaixo quando tiver as informações e clique em Salvar</p>

              {semLocal && (
                <div>
                  <label className="text-xs font-medium text-[var(--surface-600)] mb-1 block">Local de Acolhimento</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { key: 'residencia', label: 'Residência' },
                      { key: 'clinica', label: 'Clínica / Hospital' },
                      { key: 'unidade', label: 'Unidade RIP PET' },
                      { key: 'outro', label: 'Outro endereço' },
                    ].map(opt => (
                      <button key={opt.key} type="button" onClick={() => setLocalColeta(opt.key as typeof localColeta)}
                        className={`py-1.5 px-2 rounded-lg text-[10px] font-medium border transition-all ${
                          localColeta === opt.key
                            ? 'border-amber-400 bg-amber-500/10 text-amber-400'
                            : 'border-[var(--surface-200)] text-[var(--surface-500)] hover:border-amber-400'
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {localColeta === 'clinica' && (
                    temPadronizacaoClinicas ? (
                      <div ref={estabRef} className="relative mt-1.5">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-medium text-[var(--surface-500)]">Estabelecimento</label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" checked={autonomo} onChange={e => { setAutonomo(e.target.checked); if (e.target.checked) { setEstabId(null); setEstabNome(''); setEstabBusca('') } }} className="h-3 w-3 rounded accent-blue-500" />
                            <span className="text-[9px] text-blue-400">Autônomo</span>
                          </label>
                        </div>
                        {autonomo ? (
                          <div className="px-2 py-1.5 rounded-lg border-2 border-dashed border-blue-500/30 bg-blue-900/10 text-[10px] text-blue-400">Profissional autônomo</div>
                        ) : (
                          <>
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--surface-400)]" />
                              <input type="text" value={estabBusca} onChange={e => { setEstabBusca(e.target.value); setEstabNome(e.target.value); setEstabId(null); setEstabAberto(true) }} onFocus={() => setEstabAberto(true)} placeholder="Buscar clínica..." className="input pl-8 text-sm" />
                            </div>
                            {estabAberto && (estabsFiltrados.length > 0 || estabBusca.trim()) && (
                              <div className="absolute z-20 mt-1 w-full max-h-40 overflow-y-auto bg-[var(--surface-0)] border border-[var(--surface-200)] rounded-lg shadow-lg">
                                {estabsFiltrados.map(e => (
                                  <button key={e.id} type="button" onClick={() => { setEstabId(e.id); setEstabNome(e.nome); setEstabBusca(e.nome); setEstabAberto(false) }}
                                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--surface-50)] text-[var(--surface-600)] flex items-center justify-between gap-2"><span>{e.nome}</span>{e.cidade && <span className="text-[10px] text-[var(--surface-400)] shrink-0">{e.cidade}</span>}</button>
                                ))}
                                {estabBusca.trim() && !estabsFiltrados.some(e => e.nome.toLowerCase() === estabBusca.toLowerCase()) && (
                                  <button type="button" onClick={() => { setEstabId(null); setEstabNome(estabBusca.trim()); setEstabAberto(false) }}
                                    className="w-full text-left px-3 py-1.5 text-sm text-amber-500 hover:bg-amber-900/10 border-t border-[var(--surface-100)]">
                                    <Plus className="h-3 w-3 inline mr-1" />Criar &quot;{estabBusca.trim()}&quot;
                                  </button>
                                )}
                              </div>
                            )}
                            {estabId && <p className="mt-1 text-[10px] text-green-500"><Check className="h-3 w-3 inline" /> Selecionado</p>}
                          </>
                        )}
                      </div>
                    ) : (
                      <input type="text" value={clinicaTextoLivre} onChange={e => setClinicaTextoLivre(e.target.value)} placeholder="Nome da clínica ou hospital" className="input text-sm mt-1.5" />
                    )
                  )}
                  {localColeta === 'outro' && (
                    <input type="text" value={enderecoOutro} onChange={e => setEnderecoOutro(e.target.value)} placeholder="Endereço completo" className="input text-sm mt-1.5" />
                  )}
                </div>
              )}

              {semResponsavel && (
                <div>
                  <label className="text-xs font-medium text-[var(--surface-600)] mb-1 block">Responsável pelo Acolhimento</label>
                  <select value={funcionarioId} onChange={e => setFuncionarioId(e.target.value)} className="input text-sm">
                    <option value="">Selecione...</option>
                    {funcionarios.map(f => (<option key={f.id} value={f.id}>{f.nome}</option>))}
                  </select>
                </div>
              )}

              {semDataHora && (
                <div>
                  <label className="text-xs font-medium text-[var(--surface-600)] mb-1 block">Data e Hora do Acolhimento</label>
                  <input type="datetime-local" step="1800" value={dataHoraAcolhimento} onChange={e => setDataHoraAcolhimento(e.target.value)} className="input text-sm" />
                </div>
              )}

              {semLacre && (
                <div>
                  <label className="text-xs font-medium text-[var(--surface-600)] mb-1 block">Número do Lacre</label>
                  <input type="text" value={lacre} onChange={e => setLacre(e.target.value)} placeholder="Número do lacre" className="input text-sm" />
                </div>
              )}

              <button
                onClick={async () => {
                  if (!ficha) return
                  setSalvando(true)
                  try {
                    // Montar op_dados atualizado com campos preenchidos
                    const opAtual = (ficha.op_dados || {}) as Record<string, unknown>
                    const opAtualizado = {
                      ...opAtual,
                      // Desmarcar "sem" se preencheu
                      semLocal: localColeta ? false : semLocal,
                      localColeta: localColeta || opAtual.localColeta,
                      semResponsavel: funcionarioId ? false : semResponsavel,
                      funcionarioId: funcionarioId || opAtual.funcionarioId,
                      semDataHora: dataHoraAcolhimento ? false : semDataHora,
                      dataHoraAcolhimento: dataHoraAcolhimento || opAtual.dataHoraAcolhimento,
                      semLacre: lacre.trim() ? false : semLacre,
                      lacre: lacre.trim() || opAtual.lacre,
                    }
                    const { error } = await supabase.from('fichas').update({ op_dados: opAtualizado } as never).eq('id', ficha.id)
                    if (error) throw new Error(error.message)
                    // Atualizar states locais
                    if (localColeta) setSemLocal(false)
                    if (funcionarioId) setSemResponsavel(false)
                    if (dataHoraAcolhimento) setSemDataHora(false)
                    if (lacre.trim()) setSemLacre(false)
                    toast('Pendências salvas!', 'success')
                    onAtualizar?.()
                  } catch (err) {
                    toast(err instanceof Error ? err.message : 'Erro ao salvar', 'error')
                  } finally {
                    setSalvando(false)
                  }
                }}
                disabled={salvando}
                className="w-full py-2 rounded-lg text-xs font-semibold text-amber-500 border border-amber-500/30 hover:bg-amber-900/20 transition-colors"
              >
                {salvando ? <><Loader2 className="h-3 w-3 animate-spin" /> Salvando...</> : 'Salvar Pendências'}
              </button>
            </div>
          )}
        </div>
      ) : (
      /* ═══════ MODO EDIÇÃO (ficha recebida) ═══════ */
      <>
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
            Dados da Ficha — <span className={isPreventivo ? 'text-green-400' : 'text-red-400'}>Tipo: {isPreventivo ? 'Preventivo' : 'Emergencial'}</span>
          </h3>

          {/* Tutor */}
          <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)] space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--surface-700)] mb-2">
              <User className="h-4 w-4" />Tutor
            </div>
            <InfoRow label="Nome" value={getFichaValue('nome_completo')} editKey="nome_completo" edited={!!fichaEdits.nome_completo} onEdit={startEdit} />
            <InfoRow label={labelDocumento(getFichaValue('cpf'))} value={getFichaValue('cpf')} mono editKey="cpf" edited={!!fichaEdits.cpf} onEdit={startEdit} />
            <InfoRow label="Telefone" value={getFichaValue('telefone')} mono editKey="telefone" edited={!!fichaEdits.telefone} onEdit={startEdit} />
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
            {getFichaValue('pagamento') === 'Cartão Crédito' && (
              <InfoRow label="Parcelas" value={getFichaValue('parcelas') || '—'} editKey="parcelas" edited={!!fichaEdits.parcelas} onEdit={startEdit} />
            )}
            <InfoRow label="Velório" value={getFichaValue('velorio')} editKey="velorio" edited={!!fichaEdits.velorio} onEdit={startEdit} />
            <InfoRow label="Acompanhamento" value={getFichaValue('acompanhamento')} editKey="acompanhamento" edited={!!fichaEdits.acompanhamento} onEdit={startEdit} />
            <InfoRow label="Seleção de local" value={getFichaValue('localizacao')} editKey="localizacao" edited={!!fichaEdits.localizacao} onEdit={startEdit} />
            {ficha.localizacao_outra && <InfoRow label="Local específico" value={getFichaValue('localizacao_outra')} editKey="localizacao_outra" edited={!!fichaEdits.localizacao_outra} onEdit={startEdit} />}
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
        <div className="space-y-4 p-4 rounded-xl" style={{ background: 'rgba(250, 204, 21, 0.06)', border: '1px solid rgba(250, 204, 21, 0.15)' }}>
          <h3 className="text-sm font-semibold text-amber-500 uppercase tracking-wide">Dados do Concierge</h3>
          <p className="text-[10px] font-bold text-[var(--surface-400)] uppercase tracking-widest">Padronização de Dados</p>

          {/* ═══════ BLOCO: ACOLHIMENTO ═══════ */}
          <div className="p-3 rounded-xl border border-[var(--surface-200)] space-y-3">
            <h4 className="text-xs font-bold text-[var(--surface-600)] uppercase tracking-wider">{isPreventivo ? 'Contato' : 'Acolhimento'}</h4>

            {/* Telefone — quem é o contato ativo? */}
            <div className="p-3 rounded-lg border-2 border-amber-500/30 bg-amber-500/5 space-y-2">
              <div className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-amber-500" />
                <label className="text-xs font-bold text-amber-500 uppercase tracking-wider">Contato para Cremação <span className="text-red-400">*</span></label>
              </div>
              <p className="text-[10px] text-amber-400 leading-snug">
                <AlertTriangle className="inline h-3 w-3 mr-0.5 align-text-bottom" />
                Matriz usará este número para chamar no dia da cremação. Você pode alterar depois com contrato no fluxo.
              </p>
              <div className="flex gap-2 items-stretch">
                <div className="flex-1 px-3 py-2 rounded-lg bg-[var(--surface-50)] text-sm text-mono text-[var(--surface-700)]">
                  {formatarTel(getFichaValue('telefone'))}
                </div>
                <button
                  type="button"
                  onClick={() => abrirWhatsApp(getFichaValue('telefone'))}
                  className="px-3 rounded-lg text-[11px] font-semibold border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 transition-all flex items-center gap-1.5 whitespace-nowrap"
                  title="Abrir conversa no WhatsApp"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Validar
                </button>
              </div>

              <p className="text-[11px] font-medium text-[var(--surface-600)]">Está falando com a pessoa dona deste número?</p>

              <div className="flex gap-2">
                <button type="button" onClick={() => { setTelefoneConfirmado(true); setMostrarTelefone2(false); setTelefone2(''); setUsarTelefone2ComoPrincipal(false) }}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${
                    telefoneConfirmado && !mostrarTelefone2
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                      : 'border-[var(--surface-200)] text-[var(--surface-500)] hover:border-[var(--surface-300)]'
                  }`}>
                  Sim, é este
                </button>
                <button type="button" onClick={() => { setTelefoneConfirmado(false); setMostrarTelefone2(true); setUsarTelefone2ComoPrincipal(true) }}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${
                    mostrarTelefone2
                      ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                      : 'border-[var(--surface-200)] text-[var(--surface-500)] hover:border-[var(--surface-300)]'
                  }`}>
                  Não, é outro
                </button>
              </div>

              {telefoneConfirmado && !mostrarTelefone2 && (
                <div className="space-y-1 pt-1 mt-1 border-t border-emerald-500/20">
                  <label className="text-[10px] text-emerald-400 font-medium block">Como devemos chamar este contato? <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={telefone1Nome}
                    onChange={e => setTelefone1Nome(e.target.value)}
                    placeholder="Ex: Ana"
                    className="input text-sm w-full"
                    maxLength={80}
                  />
                  <p className="text-[9px] text-[var(--surface-400)] leading-snug">Apelido usado nas mensagens automáticas. Pode ser editado depois no contrato.</p>
                </div>
              )}

              {mostrarTelefone2 && (
                <div className="space-y-1.5 pt-1 mt-1 border-t border-amber-500/20">
                  <label className="text-[10px] text-amber-400 font-medium">Telefone do contato atual (será usado pela Matriz e WhatsApp)</label>
                  <div className="flex gap-1.5">
                    {telefone2DDI === 'outro' ? (
                      <div className="flex gap-1 items-center">
                        <span className="text-[var(--surface-400)] text-xs">+</span>
                        <input value={telefone2DDICustom} onChange={e => setTelefone2DDICustom(e.target.value.replace(/\D/g, '').slice(0, 4))} className="input text-sm text-mono w-14 text-center" placeholder="DDI" inputMode="numeric" />
                        <button type="button" onClick={() => setTelefone2DDI('55')} className="text-[10px] text-[var(--surface-400)]">x</button>
                      </div>
                    ) : (
                      <select value={telefone2DDI} onChange={e => setTelefone2DDI(e.target.value)} className="input text-sm w-24">
                        <option value="55">+55</option>
                        <option value="1">+1</option>
                        <option value="351">+351</option>
                        <option value="54">+54</option>
                        <option value="outro">Outro</option>
                      </select>
                    )}
                    <input type="text" inputMode="tel" value={telefone2} onChange={e => aplicarTelefone2(e.target.value)} placeholder="(00) 00000-0000 — cole com +55, ele detecta" maxLength={20} className="input text-sm text-mono flex-1" />
                  </div>
                  <label className="text-[10px] text-amber-400 font-medium block mt-1">Nome e relação com o titular <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={telefone2Nome}
                    onChange={e => setTelefone2Nome(e.target.value)}
                    placeholder="Ex: Maria — irmã do tutor"
                    className="input text-sm w-full"
                    maxLength={80}
                  />
                  <p className="text-[9px] text-[var(--surface-400)] leading-snug">Matriz e WhatsApp passam a usar este número. O telefone original fica salvo como secundário.</p>
                </div>
              )}
            </div>

            {/* Local, Responsável, Data/Hora, Lacre — só emergencial (pet vivo não tem acolhimento) */}
            {!isPreventivo && (<>
            {/* Local de Acolhimento */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-[var(--surface-600)]">Local de Acolhimento <span className="text-red-400">*</span></label>
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
                      <button key={opt.key} type="button" onClick={() => { setLocalColeta(opt.key as typeof localColeta); setSemLocal(false) }}
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
                                      {e.cidade && <span className="text-xs text-[var(--surface-400)] shrink-0">{e.cidade}</span>}
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
                <label className="text-xs font-medium text-[var(--surface-600)]">Responsável pelo Acolhimento <span className="text-red-400">*</span></label>
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
                <label className="text-xs font-medium text-[var(--surface-600)]">Data e Hora do Acolhimento <span className="text-red-400">*</span></label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={semDataHora} onChange={e => { setSemDataHora(e.target.checked); if (e.target.checked) setDataHoraAcolhimento('') }} className="h-3 w-3 rounded accent-amber-500" />
                  <span className="text-[10px] text-amber-500">Sem data/hora provisoriamente</span>
                </label>
              </div>
              {semDataHora ? (
                <div className="px-3 py-2 rounded-lg bg-amber-900/10 border border-amber-500/30 text-xs text-amber-400">A definir</div>
              ) : (
                <input type="datetime-local" step="1800" value={dataHoraAcolhimento} onChange={e => { setDataHoraAcolhimento(e.target.value); if (e.target.value) setSemDataHora(false) }} className="input text-sm" />
              )}
            </div>

            {/* Lacre */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-[var(--surface-600)]">Número do Lacre <span className="text-red-400">*</span></label>
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
            </>)}

          </div>

          {/* ═══════ BLOCO: INDICAÇÃO ═══════ */}
          <div className="p-3 rounded-xl border border-[var(--surface-200)] space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[var(--surface-600)] uppercase tracking-wider">Indicação</h4>
              <button type="button" onClick={() => setTeveIndicacao(!teveIndicacao)} className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--surface-400)]">{teveIndicacao ? 'Sim' : 'Não'}</span>
                <div className={`relative rounded-full transition-colors ${teveIndicacao ? 'bg-purple-500' : 'bg-[var(--surface-300)]'}`} style={{ width: 36, height: 20 }}>
                  <div className={`absolute top-[3px] rounded-full bg-white shadow transition-all`} style={{ width: 14, height: 14, left: teveIndicacao ? 19 : 3 }} />
                </div>
              </button>
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

            {/* Campo normalização "outro" — quando tutor escreveu algo genérico */}
            {(ficha.outro_especificar || (ficha.como_conheceu || []).some(c => c === 'Outro' || c === 'Seguradora' || c === 'Seguro')) && (
              <div>
                <label className="text-xs font-medium text-[var(--surface-600)] mb-1 block">Normalizar "Como conheceu"</label>
                <p className="text-[9px] text-[var(--surface-400)] mb-1">Tutor escreveu: "{ficha.outro_especificar || (ficha.como_conheceu || []).join(', ')}"</p>
                <input type="text" value={outroNormalizado} onChange={e => setOutroNormalizado(e.target.value)} placeholder="Ex: Seguradora Porto Seguro, Rádio Cultura, etc." className="input text-sm" />
              </div>
            )}

            {teveIndicacao && (
              <div className="space-y-3">
                {/* Hospital / Clínica */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer mb-1.5">
                    <input type="checkbox" checked={indicHospAtivo} onChange={e => setIndicHospAtivo(e.target.checked)} className="h-3.5 w-3.5 rounded accent-purple-500" />
                    <span className="text-xs font-medium text-[var(--surface-600)]">Hospital / Clínica</span>
                  </label>
                  {indicHospAtivo && (
                    temPadronizacaoClinicas ? (
                      <div ref={indicEstabRef} className="relative">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--surface-400)]" />
                          <input type="text" value={indicEstabBusca} onChange={e => { setIndicEstabBusca(e.target.value); setIndicEstabNome(e.target.value); setIndicEstabId(null); setIndicEstabAberto(true) }} onFocus={() => setIndicEstabAberto(true)} placeholder="Buscar clínica da indicação..." className="input pl-9 text-sm" />
                        </div>
                        {indicEstabAberto && (estabelecimentos.filter(e => e.nome.toLowerCase().includes(indicEstabBusca.toLowerCase())).length > 0 || indicEstabBusca.trim()) && (
                          <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-[var(--surface-0)] border border-[var(--surface-200)] rounded-lg shadow-lg">
                            {estabelecimentos.filter(e => e.nome.toLowerCase().includes(indicEstabBusca.toLowerCase())).slice(0, 15).map(e => (
                              <button key={e.id} type="button" onClick={() => { setIndicEstabId(e.id); setIndicEstabNome(e.nome); setIndicEstabBusca(e.nome); setIndicEstabAberto(false) }}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-50)] transition-colors flex items-center justify-between gap-2 ${indicEstabId === e.id ? 'bg-[var(--surface-50)] font-medium' : 'text-[var(--surface-600)]'}`}>
                                <span>{e.nome}</span>
                                {e.cidade && <span className="text-xs text-[var(--surface-400)] shrink-0">{e.cidade}</span>}
                              </button>
                            ))}
                            {indicEstabBusca.trim() && !estabelecimentos.some(e => e.nome.toLowerCase() === indicEstabBusca.toLowerCase()) && (
                              <button type="button" onClick={() => { setIndicEstabId(null); setIndicEstabNome(indicEstabBusca.trim()); setIndicEstabAberto(false) }}
                                className="w-full text-left px-3 py-2 text-sm text-amber-500 hover:bg-amber-900/10 flex items-center gap-2 border-t border-[var(--surface-100)]">
                                <Plus className="h-3.5 w-3.5" />Criar &quot;{indicEstabBusca.trim()}&quot;
                              </button>
                            )}
                          </div>
                        )}
                        {indicEstabId && (
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <p className="text-xs text-green-500 flex items-center gap-1"><Check className="h-3 w-3" />Selecionado: {indicEstabNome}</p>
                            <button type="button" onClick={() => { setIndicEstabId(null); setIndicEstabBusca(''); setIndicEstabNome('') }} className="text-[10px] text-[var(--surface-500)] hover:text-amber-500 underline">
                              trocar
                            </button>
                          </div>
                        )}
                        {!indicEstabId && indicEstabNome.trim() && !indicEstabAberto && <p className="mt-1 text-xs text-amber-500">Novo estabelecimento será criado</p>}
                      </div>
                    ) : (
                      <input type="text" value={indicHospClinica} onChange={e => setIndicHospClinica(e.target.value)} placeholder="Nome do hospital ou clínica" className="input text-sm" />
                    )
                  )}
                </div>

                {/* Nome de quem indicou */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer mb-1.5">
                    <input type="checkbox" checked={indicNomeAtivo} onChange={e => setIndicNomeAtivo(e.target.checked)} className="h-3.5 w-3.5 rounded accent-purple-500" />
                    <span className="text-xs font-medium text-[var(--surface-600)]">Nome de quem indicou</span>
                  </label>
                  {indicNomeAtivo && (
                    temPadronizacaoClinicas ? (
                      <div ref={indicRef} className="relative">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--surface-400)]" />
                          <input type="text" value={indicBusca} onChange={e => { setIndicBusca(e.target.value); setIndicNome(e.target.value); setIndicNomeQuemIndicou(e.target.value); setIndicId(null); setIndicAberto(true) }} onFocus={() => setIndicAberto(true)} placeholder="ex: Dra. Maria ou Recep. João" className="input pl-9 text-sm" />
                        </div>
                        {indicAberto && (contatosFiltrados.length > 0 || indicBusca.trim()) && (
                          <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-[var(--surface-0)] border border-[var(--surface-200)] rounded-lg shadow-lg">
                            {contatosFiltrados.map(c => (
                              <button key={c.id} type="button" onClick={() => {
                                setIndicId(c.id); setIndicNome(c.nome); setIndicBusca(c.nome); setIndicNomeQuemIndicou(c.nome); setIndicCargo(c.cargo || ''); setIndicAberto(false)
                                // Se o contato pertence a uma clínica e ainda não selecionei nenhuma, puxa automático
                                if (c.estabelecimento_id && !indicEstabId) {
                                  const estab = estabelecimentos.find(e => e.id === c.estabelecimento_id)
                                  if (estab) { setIndicEstabId(estab.id); setIndicEstabNome(estab.nome); setIndicEstabBusca(estab.nome); setIndicHospAtivo(true) }
                                }
                              }}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-50)] transition-colors flex flex-col ${indicId === c.id ? 'bg-[var(--surface-50)] font-medium' : 'text-[var(--surface-600)]'}`}>
                                <span>{c.nome}</span>
                                {(() => {
                                  const cl = c.estabelecimento_id ? estabelecimentos.find(es => es.id === c.estabelecimento_id)?.nome : null
                                  const sub = [c.cargo, cl].filter(Boolean).join(' · ')
                                  return sub ? <span className="text-[11px] text-[var(--surface-400)]">{sub}</span> : null
                                })()}
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
                            {/* Cargo: value canônico do CHECK contatos_cargo_check (veterinario/recepcionista/gerente/proprietario/outro); label amigável */}
                            <select value={indicCargo} onChange={e => setIndicCargo(e.target.value)} className="input mt-1 text-sm">
                              <option value="">Cargo (opcional)...</option>
                              <option value="veterinario">Veterinário(a)</option>
                              <option value="recepcionista">Recepcionista</option>
                              <option value="gerente">Gerente</option>
                              <option value="proprietario">Proprietário(a) / Sócio(a)</option>
                              <option value="outro">Outro</option>
                            </select>
                          </>
                        )}
                      </div>
                    ) : (
                      <input type="text" value={indicNomeQuemIndicou} onChange={e => setIndicNomeQuemIndicou(e.target.value)} placeholder="ex: Dra. Maria ou Recep. João" className="input text-sm" />
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ═══════ CAMPOS FINAIS ═══════ */}

          {/* Código gerado automaticamente — não visível ao operador */}

          {/* Valor + Desconto */}
          <div>
            <label className="block text-xs font-medium text-[var(--surface-600)] mb-1">Valor do Plano (R$) <span className="text-red-400">*</span></label>
            <div className="grid grid-cols-7 gap-1.5 mb-2">
              {[990, 1090, 1190, 1390, 1490, 1590, 1690].map(v => (
                <button key={v} type="button" onClick={() => setValorPlano(String(v))}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-all text-center ${
                    valorPlano === String(v)
                      ? 'bg-emerald-500 text-white'
                      : 'bg-[var(--surface-100)] text-[var(--surface-500)] hover:bg-[var(--surface-200)]'
                  }`}>
                  {v.toLocaleString('pt-BR')}
                </button>
              ))}
            </div>
            <input type="text" inputMode="decimal" value={valorPlano} onChange={e => setValorPlano(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))} placeholder="0.00" className="input text-mono text-sm mb-2" />

            <p className="text-[10px] text-[var(--surface-400)] -mt-1 mb-1">Desconto Pré-Venda: Por Meio de Pagamento ou Parcerias</p>
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--surface-500)]">Desconto</label>
              <div className="flex rounded-lg overflow-hidden border border-[var(--surface-200)]">
                <button type="button" onClick={() => { setDescontoTipo('valor'); setDescontoPreVenda('') }}
                  className={`px-2.5 py-1 text-[10px] font-bold transition-colors ${descontoTipo === 'valor' ? 'bg-purple-500 text-white' : 'text-[var(--surface-400)] hover:bg-[var(--surface-50)]'}`}>
                  R$
                </button>
                <button type="button" onClick={() => { setDescontoTipo('percentual'); setDescontoPreVenda('') }}
                  className={`px-2.5 py-1 text-[10px] font-bold transition-colors ${descontoTipo === 'percentual' ? 'bg-purple-500 text-white' : 'text-[var(--surface-400)] hover:bg-[var(--surface-50)]'}`}>
                  %
                </button>
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={descontoPreVenda}
                onChange={e => {
                  let v = e.target.value.replace(/[^\d.,]/g, '').replace(',', '.')
                  if (descontoTipo === 'percentual') {
                    const num = parseFloat(v)
                    if (num > 100) v = '100'
                  }
                  setDescontoPreVenda(v)
                }}
                placeholder={descontoTipo === 'percentual' ? '0' : '0.00'}
                className="input text-mono text-sm w-20"
              />
              <span className="text-[var(--surface-400)] text-sm">=</span>
              <span className="text-sm font-bold text-emerald-400 min-w-[70px] text-right">
                {(() => {
                  const v = parseFloat(valorPlano) || 0
                  const d = parseFloat(descontoPreVenda) || 0
                  const descontoReal = descontoTipo === 'percentual' ? (v * d) / 100 : d
                  return Math.max(v - descontoReal, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                })()}
              </span>
            </div>
            {descontoPreVenda && descontoTipo === 'percentual' && (
              <p className="text-[10px] text-[var(--surface-400)] mt-1">
                {parseFloat(descontoPreVenda) || 0}% = R$ {(((parseFloat(valorPlano) || 0) * (parseFloat(descontoPreVenda) || 0)) / 100).toFixed(2)} de desconto
              </p>
            )}

            {/* Detalhamento do Plano — texto livre (EM e PV) */}
            <div className="mt-3">
              <label className="block text-xs font-medium text-[var(--surface-600)] mb-1">Detalhamento do Plano</label>
              <textarea
                value={detalhamentoPlano}
                onChange={e => setDetalhamentoPlano(e.target.value)}
                rows={2}
                placeholder="Ex: Plano Gratidão, com molde da patinha e urna MDF inclusas"
                className="input text-sm resize-none"
              />
              <p className="text-[10px] text-[var(--surface-400)] mt-1">Compõe a descrição do plano no PDF do contrato e vira observação no contrato criado</p>
            </div>

            {/* Campos para assinatura no PDF — só PV (default Não = aceite digital via "De Acordo") */}
            {isPreventivo && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold text-[var(--surface-600)]">Campos para assinatura no PDF</span>
                  <p className="text-[10px] text-[var(--surface-400)]">Não = aceite digital (&quot;De Acordo&quot; pelo WhatsApp). Sim imprime as linhas de assinatura</p>
                </div>
                <div className="flex rounded-lg overflow-hidden border border-[var(--surface-200)] shrink-0">
                  <button type="button" onClick={() => setCamposAssinatura(false)}
                    className={`px-3 py-1 text-[10px] font-bold transition-colors ${!camposAssinatura ? 'bg-emerald-500 text-white' : 'text-[var(--surface-400)] hover:bg-[var(--surface-50)]'}`}>
                    Não
                  </button>
                  <button type="button" onClick={() => setCamposAssinatura(true)}
                    className={`px-3 py-1 text-[10px] font-bold transition-colors ${camposAssinatura ? 'bg-emerald-500 text-white' : 'text-[var(--surface-400)] hover:bg-[var(--surface-50)]'}`}>
                    Sim
                  </button>
                </div>
              </div>
            )}

            {/* Atendimento com Seguradora — só emergencial */}
            {!isPreventivo && (
            <div className="mt-3 pt-3 border-t border-[var(--surface-200)]">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={temSeguradora}
                  onChange={e => { setTemSeguradora(e.target.checked); if (!e.target.checked) setSeguradoraNome('') }}
                  className="rounded border-[var(--surface-300)]"
                />
                <span className="text-xs font-semibold text-[var(--surface-600)]">Atendimento com Seguradora</span>
              </label>
              {temSeguradora && (
                <input
                  type="text"
                  value={seguradoraNome}
                  onChange={e => setSeguradoraNome(e.target.value)}
                  placeholder="Nome da seguradora"
                  className="input text-sm mt-2"
                />
              )}
            </div>
            )}
          </div>

          {/* Data do contrato */}
          <div>
            <label className="block text-xs font-medium text-[var(--surface-600)] mb-1">Data do contrato <span className="text-red-400">*</span></label>
            <input type="date" value={dataContrato} onChange={e => setDataContrato(e.target.value)} className="input text-sm" />
          </div>
        </div>
      </div>
      </>
      )}
      {/* Mini-modal de edição de campo */}
      {editingField && (() => {
        // Labels legíveis com acentuação correta
        const FIELD_LABELS: Record<string, string> = {
          nome_completo: 'Nome completo', cpf: labelDocumento(getFichaValue('cpf')), telefone: 'Telefone', email: 'E-mail',
          endereco: 'Endereço', numero: 'Número', bairro: 'Bairro', cidade: 'Cidade', cep: 'CEP',
          nome_pet: 'Nome do pet', especie: 'Espécie', raca: 'Raça', genero: 'Gênero',
          cor: 'Cor', peso: 'Peso', idade: 'Idade',
          cremacao: 'Cremação', pagamento: 'Pagamento', parcelas: 'Parcelas', velorio: 'Velório',
          acompanhamento: 'Acompanhamento', localizacao: 'Seleção de local', localizacao_outra: 'Local específico',
        }

        // Campos com opções fixas (não texto livre)
        const FIELD_OPTIONS: Record<string, string[]> = {
          cremacao: ['Individual', 'Coletiva'],
          velorio: ['Sim', 'Não', 'A decidir'],
          especie: ['Canina', 'Felina', 'Exótica'],
          genero: ['Macho', 'Fêmea'],
          acompanhamento: ['Presencial', 'On-line', 'Gravado', 'Não deseja'],
          pagamento: ['Pix', 'Dinheiro', 'Cartão Débito', 'Cartão Crédito'],
          parcelas: ['1x', '2x', '3x', '4x', '5x', '6x', '7x', '8x', '9x', '10x', '11x', '12x'],
          localizacao: ['Residência', 'Hospital / Clínica', 'Unidade Canal 6', 'Outro'],
        }

        // Tipo de input e máscara por campo
        const FIELD_INPUT: Record<string, { type: string; inputMode?: string; mask?: (v: string) => string; maxLength?: number; placeholder?: string }> = {
          cpf: {
            type: 'text', inputMode: 'numeric', maxLength: 18, placeholder: '000.000.000-00',
            mask: maskDocumento,
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
            <div className="w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4 bg-[var(--surface-0)] border border-[var(--surface-200)]">
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
                  <div className="space-y-2">
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
                    {/* Parcelas — só quando edita pagamento e seleciona Cartão Crédito */}
                    {fieldKey === 'pagamento' && editingValue === 'Cartão Crédito' && (
                      <select
                        value={fichaEdits.parcelas || getFichaValue('parcelas') || ''}
                        onChange={e => setFichaEdits(prev => ({ ...prev, parcelas: e.target.value }))}
                        className="input text-sm"
                      >
                        <option value="">Parcelas...</option>
                        <option value="1x">À vista</option>
                        {[2,3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={`${n}x`}>{n}x</option>)}
                      </select>
                    )}
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
