'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { FileText, Search, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ArrowUp, ArrowDown, Star, X, Printer, XCircle, Plus, Weight, Copy, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useDebounce } from '@/hooks/useDebounce'
import { ProtocoloData, getNomeRetorno, isProtocoloExcluido, montarProtocoloData, normalizarProtocoloData } from '@/components/protocolo/protocolo-utils'
import { computeAllTags, getPagamentoPendente, TAG_STATE_STYLES, type ComputedTag } from '@/lib/contrato-tags'
import ProtocoloEntrega from '@/components/protocolo/ProtocoloEntrega'
import { printProtocolos } from '@/components/protocolo/ProtocoloPrint'
import InteractiveTags from '@/components/contratos/InteractiveTags'
import ActionButtons from '@/components/contratos/ActionButtons'
import EntregaModal from '@/components/contratos/modals/EntregaModal'
import PelinhoModal from '@/components/contratos/modals/PelinhoModal'
import CertificadoModal from '@/components/contratos/modals/CertificadoModal'
import AtivarModal from '@/components/contratos/modals/AtivarModal'
import FinalizadoraModal from '@/components/contratos/modals/FinalizadoraModal'
import ChegamosModal from '@/components/contratos/modals/ChegamosModal'
import ChegaramModal from '@/components/contratos/modals/ChegaramModal'

function PixIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" fill="currentColor">
      <path d="M242.4 292.5C247.8 287.1 257.1 287.1 262.5 292.5L339.5 369.5C353.7 383.7 372.6 391.5 392.6 391.5H407.7L310.6 488.6C280.3 518.1 231.1 518.1 200.8 488.6L103.3 391.2H112.6C132.6 391.2 151.5 383.4 165.7 369.2L242.4 292.5zM262.5 218.9C256.1 224.4 247.9 224.5 242.4 218.9L165.7 142.2C151.5 127.1 132.6 120.2 112.6 120.2H103.3L200.7 22.76C231.1-7.586 280.3-7.586 310.6 22.76L407.8 119.9H392.6C372.6 119.9 353.7 127.7 339.5 141.9L262.5 218.9zM112.6 142.7C126.4 142.7 139.1 148.3 149.7 158.1L226.4 234.8C233.6 241.1 243 245.6 252.5 245.6C261.9 245.6 271.3 241.1 278.5 234.8L355.5 157.8C365.3 148.1 378.8 142.5 392.6 142.5H430.3L488.6 200.8C518.9 231.1 518.9 280.3 488.6 310.6L430.3 368.9H392.6C378.8 368.9 365.3 363.3 355.5 353.5L278.5 276.5C264.6 262.6 240.3 262.6 226.4 276.6L149.7 353.2C139.1 363 126.4 368.6 112.6 368.6H80.78L22.76 310.6C-7.586 280.3-7.586 231.1 22.76 200.8L80.78 142.7H112.6z"/>
    </svg>
  )
}

type Tutor = {
  id: string
  nome: string
  telefone: string | null
}

type Contrato = {
  id: string
  codigo: string
  pet_nome: string
  pet_especie: string | null
  pet_raca: string | null
  pet_cor: string | null
  pet_peso: number | null
  pet_genero: string | null
  tutor_id: string | null
  tutor: Tutor | null
  tutor_nome: string
  tutor_telefone: string | null
  tutor_cidade: string | null
  tutor_bairro: string | null
  local_coleta: string | null
  clinica_coleta: string | null
  tipo_cremacao: string
  tipo_plano: string
  status: string
  data_contrato: string | null
  data_acolhimento: string | null
  numero_lacre: string | null
  fonte_conhecimento: { nome: string } | null
  seguradora: string | null
  // Nomes para certificado
  certificado_nome_1: string | null
  certificado_nome_2: string | null
  certificado_nome_3: string | null
  certificado_nome_4: string | null
  certificado_nome_5: string | null
  certificado_confirmado: boolean | null
  // Pelinho (rescaldo padrão)
  pelinho_quer: boolean | null
  pelinho_feito: boolean
  pelinho_quantidade: number
  // Produtos do contrato (para calcular complexidade)
  contrato_produtos?: ContratoProduto[]
  // Valores e pagamentos
  valor_plano: number | null
  desconto_plano: number | null
  valor_acessorios: number | null
  desconto_acessorios: number | null
  pagamentos?: Pagamento[]
  // Supinda vinculada
  supinda_id: string | null
  supinda: Supinda | null
  // Protocolo de entrega salvo
  protocolo_data: ProtocoloData | null
  // Data de entrega
  data_entrega: string | null
}

type Produto = {
  id: string
  codigo: string
  nome: string
  tipo: 'urna' | 'acessorio' | 'incluso'
  categoria: string | null
  preco: number | null
  estoque_atual: number
  imagem_url: string | null
  estoque_infinito?: boolean
  precisa_foto?: boolean
}

const CATEGORIA_URNA_LABELS: Record<string, string> = {
  'Arca/Sleeping': 'Arca/Sleeping',
  'Porta/Box': 'Porta/Box',
  'Pedras': 'Pedras',
  'High Prices': 'High Prices',
  'Low Prices': 'Low Prices',
  'Avulsos Legado RIP': 'Avulsos Legado',
}

type ContratoProduto = {
  id: string
  produto_id: string
  quantidade: number
  foto_recebida: boolean
  separado: boolean
  rescaldo_feito: boolean
  produto: {
    codigo: string
    nome: string
    tipo: string
    precisa_foto: boolean
    imagem_url: string | null
    rescaldo_tipo: string | null
  } | null
}

type Pagamento = {
  tipo: string // 'plano' ou 'catalogo'
  valor: number
}

type Supinda = {
  id: string
  numero: number
  data: string
  responsavel: string | null
  status: 'planejada' | 'em_andamento' | 'retornada' | null
  quantidade_pets: number | null
  peso_total: number | null
}

// Ícones para fonte de conhecimento (fundo branco fixo para todos os temas)
const FONTE_STYLE: React.CSSProperties = { background: 'linear-gradient(135deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', border: '1px solid #cbd5e1' }
const FONTE_ICONS: Record<string, { icon?: string; img?: string; style: React.CSSProperties }> = {
  'Google': { img: '/icons/google.svg', style: FONTE_STYLE },
  'Instagram/Facebook': { img: '/icons/meta.svg', style: FONTE_STYLE },
  'Indicação em Clínica': { img: '/icons/hospital.svg', style: FONTE_STYLE },
  'Indicação em clínica': { img: '/icons/hospital.svg', style: FONTE_STYLE },
  'Cliente': { icon: '🔄', style: { ...FONTE_STYLE, color: '#d97706' } },
  'Parente/Amigo': { icon: '👥', style: { ...FONTE_STYLE, color: '#7c3aed' } },
  'Seguradora': { icon: '🛡️', style: { ...FONTE_STYLE, color: '#4338ca' } },
  'Ponto': { icon: '📍', style: { ...FONTE_STYLE, color: '#dc2626' } },
}

type StatusCount = {
  status: string
  count: number
}

// Configuração do flow de status
const STATUS_FLOW = [
  { key: 'preventivo', label: 'Preventivo', short: 'PRV', color: 'yellow', icon: '⏳' },
  { key: 'ativo', label: 'Ativo', short: 'ATV', color: 'red', icon: '✝️' },
  { key: 'pinda', label: 'Pinda', short: 'PIN', color: 'orange', icon: '💛' },
  { key: 'retorno', label: 'Retorno', short: 'RET', color: 'blue', icon: '🛍️' },
  { key: 'pendente', label: 'Pendente', short: 'PEN', color: 'purple', icon: '👀' },
  { key: 'finalizado', label: 'Finalizado', short: 'FIN', color: 'gray', icon: '✅' },
]

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; activeBg: string; activeGlow: string }> = {
  preventivo: {
    bg: 'bg-gradient-to-b from-amber-900/80 to-amber-950/90',
    border: 'border-amber-500/50',
    text: 'text-amber-300',
    activeBg: 'bg-gradient-to-b from-amber-400 via-yellow-500 to-amber-600',
    activeGlow: 'shadow-[0_0_30px_rgba(251,191,36,0.7)]'
  },
  ativo: {
    bg: 'bg-gradient-to-b from-red-900/80 to-red-950/90',
    border: 'border-red-500/50',
    text: 'text-red-300',
    activeBg: 'bg-gradient-to-b from-red-400 via-red-500 to-red-700',
    activeGlow: 'shadow-[0_0_30px_rgba(239,68,68,0.7)]'
  },
  pinda: {
    bg: 'bg-gradient-to-b from-orange-900/80 to-orange-950/90',
    border: 'border-orange-500/50',
    text: 'text-orange-300',
    activeBg: 'bg-gradient-to-b from-orange-400 via-orange-500 to-orange-700',
    activeGlow: 'shadow-[0_0_30px_rgba(249,115,22,0.7)]'
  },
  retorno: {
    bg: 'bg-gradient-to-b from-cyan-900/80 to-cyan-950/90',
    border: 'border-cyan-500/50',
    text: 'text-cyan-300',
    activeBg: 'bg-gradient-to-b from-cyan-400 via-cyan-500 to-cyan-700',
    activeGlow: 'shadow-[0_0_30px_rgba(34,211,238,0.7)]'
  },
  pendente: {
    bg: 'bg-gradient-to-b from-purple-900/80 to-purple-950/90',
    border: 'border-purple-500/50',
    text: 'text-purple-300',
    activeBg: 'bg-gradient-to-b from-purple-400 via-purple-500 to-purple-700',
    activeGlow: 'shadow-[0_0_30px_rgba(168,85,247,0.7)]'
  },
  finalizado: {
    bg: 'bg-gradient-to-b from-slate-700/80 to-slate-900/90',
    border: 'border-slate-500/50',
    text: 'text-slate-300',
    activeBg: 'bg-gradient-to-b from-slate-400 via-slate-500 to-slate-600',
    activeGlow: 'shadow-[0_0_30px_rgba(148,163,184,0.5)]'
  },
}

/** Calcula financeiro para o protocolo a partir dos dados da ficha */
function calcFinanceiroProtocolo(
  contrato: { valor_plano: number | null; desconto_plano: number | null; valor_acessorios: number | null; desconto_acessorios: number | null },
  pagamentos: { tipo: string; valor: number; desconto?: number | null }[]
) {
  const descontoPosPlano = pagamentos.filter(p => p.tipo === 'plano').reduce((s, p) => s + (p.desconto || 0), 0)
  const descontoPosAcessorios = pagamentos.filter(p => p.tipo === 'catalogo').reduce((s, p) => s + (p.desconto || 0), 0)
  const aPagarPlano = (contrato.valor_plano || 0) - (contrato.desconto_plano || 0) - descontoPosPlano
  const aPagarAcessorios = (contrato.valor_acessorios || 0) - (contrato.desconto_acessorios || 0) - descontoPosAcessorios
  const totalAPagar = aPagarPlano + aPagarAcessorios
  const totalPago = pagamentos.reduce((s, p) => s + p.valor - (p.desconto || 0), 0)
  const saldo = Math.max(0, totalAPagar - totalPago)
  return { totalAPagar, totalPago, saldo, aPagarPlano }
}

function ContratosContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Inicializar estado a partir dos query params
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [statusCountsOriginal, setStatusCountsOriginal] = useState<Record<string, number>>({})
  const buscaIdRef = useRef(0) // Evita race condition entre buscas
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState(searchParams.get('busca') || '')
  const buscaDebounced = useDebounce(busca, 300)
  const [campoBusca, setCampoBusca] = useState<'todos' | 'pet' | 'tutor' | 'codigo' | 'lacre'>('todos')
  const [statusFiltro, setStatusFiltro] = useState<string | null>(searchParams.get('status'))
  const [pagina, setPagina] = useState(parseInt(searchParams.get('pagina') || '0', 10))
  const [total, setTotal] = useState(0)
  const [totalGeral, setTotalGeral] = useState(0)
  const [ordenacao, setOrdenacao] = useState<'data' | 'nome'>((searchParams.get('ordenacao') as 'data' | 'nome') || 'data')
  const [ordemAsc, setOrdemAsc] = useState(searchParams.get('ordemAsc') !== 'false') // true = antigo→novo / A→Z
  const [agruparCidade, setAgruparCidade] = useState(searchParams.get('cidade') === 'true')
  const [agruparBairro, setAgruparBairro] = useState(searchParams.get('bairro') === 'true')

  // Filtro de dificuldade de montagem (só para aba Retorno)
  const [filtroMontagem, setFiltroMontagem] = useState<'todos' | 'facil' | 'dificil'>('todos')
  const [montagemInline, setMontagemInline] = useState(false)
  const [categoriaExpandida, setCategoriaExpandida] = useState<string | null>(null)

  // Highlight do card ativo (quando modal aberto)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [fadingId, setFadingId] = useState<string | null>(null)
  const fadeTimerRef = useRef<NodeJS.Timeout | null>(null)

  function highlightContrato(id: string) {
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    setFadingId(null)
    setHighlightId(id)
  }

  function unhighlightContrato() {
    const id = highlightId
    setHighlightId(null)
    if (id) {
      setFadingId(id)
      fadeTimerRef.current = setTimeout(() => setFadingId(null), 5000)
    }
  }

  // Modal do pelinho - Modal 1 (pergunta inicial) e Modal 2 (check/validação)
  const [pelinhoModal1, setPelinhoModal1] = useState(false) // Pergunta: Tira pelinho?
  const [pelinhoModal2, setPelinhoModal2] = useState(false) // Check: validação
  const [pelinhoContrato, setPelinhoContrato] = useState<Contrato | null>(null)
  const [pelinhoQuer, setPelinhoQuer] = useState(true)
  const [pelinhoFeito, setPelinhoFeito] = useState(false) // Validado
  const [pelinhoQtd, setPelinhoQtd] = useState(1)
  const [salvandoPelinho, setSalvandoPelinho] = useState(false)

  // Mobile: card expandido para ações
  const [expandedMobileId, setExpandedMobileId] = useState<string | null>(null)

  // Modal Pet Grato
  const [petGratoModal, setPetGratoModal] = useState(false)
  const [petGratoContrato, setPetGratoContrato] = useState<Contrato | null>(null)
  const [petGratoCopied, setPetGratoCopied] = useState(false)
  const [petGratoForm, setPetGratoForm] = useState({
    tutorNome: '',
    petNome: '',
    sexo: 'F' as 'M' | 'F',
    familia: 'F' as 'F' | 'S',
  })

  // Modal Urna
  const [urnaModal, setUrnaModal] = useState(false)
  const [urnaContrato, setUrnaContrato] = useState<Contrato | null>(null)
  const [urnas, setUrnas] = useState<Produto[]>([])
  const [urnaSelecionada, setUrnaSelecionada] = useState<Produto | null>(null)
  const [buscaUrna, setBuscaUrna] = useState('')
  const [filtroUrnaCategoria, setFiltroUrnaCategoria] = useState<string>('')
  const [salvandoUrna, setSalvandoUrna] = useState(false)
  const [urnaPrompt, setUrnaPrompt] = useState(false) // Prompt: Adicionar nova ou editar?
  const [urnaModoEdicao, setUrnaModoEdicao] = useState(false) // true = editar urna existente
  // Confirmação de preço da urna (passo 2 após selecionar)
  const [urnaConfirmacao, setUrnaConfirmacao] = useState(false)
  const [urnaPrecoForm, setUrnaPrecoForm] = useState({
    precoCustom: '' as number | '',
    descontoTipo: 'percent' as 'percent' | 'valor',
    descontoPercent: '' as number | '',
    descontoValor: '' as number | '',
  })

  // Modal Ativar PV (preventivo → ativo)
  const [ativarModal, setAtivarModal] = useState(false)
  const [ativarContrato, setAtivarContrato] = useState<Contrato | null>(null)
  const [ativarForm, setAtivarForm] = useState({
    data_acolhimento: '',
    hora_acolhimento: '',
    local_coleta: 'Residência' as 'Residência' | 'Unidade' | 'Clínica',
    clinica_coleta: '',
    numero_lacre: '',
    funcionario_id: '',
    supinda_id: '',
  })
  const [salvandoAtivacao, setSalvandoAtivacao] = useState(false)
  const [funcionarios, setFuncionarios] = useState<{ id: string; nome: string }[]>([])
  const [supindas, setSupindas] = useState<{ id: string; numero: number; data: string }[]>([])

  // Modal Chegamos (Ativo - pet chegou na unidade)
  const [chegamosModal, setChegamosModal] = useState(false)
  const [chegamosContrato, setChegamosContrato] = useState<Contrato | null>(null)
  const [chegamosForm, setChegamosForm] = useState({
    tutores: [{ titulo: 'Sra.' as 'Sr.' | 'Sra.', nome: '' }],
    petNome: '',
    petGenero: 'F' as 'M' | 'F',
    velorio: 'nao' as 'sim' | 'nao',
    velorioTexto: '',
    dataEncaminhamento: '',
    dataCremacao: '',
    contatoMatriz: 'proxima' as 'proxima' | 'semana',
    preRescaldo: false,
  })
  const [chegamosPreview, setChegamosPreview] = useState('')

  // Modal Chegaram (Retorno - cinzas chegaram)
  const [chegaramModal, setChegaramModal] = useState(false)
  const [chegaramContrato, setChegaramContrato] = useState<Contrato | null>(null)
  const [chegaramForm, setChegaramForm] = useState({
    tutorTitulo: 'Sra.' as 'Sr.' | 'Sra.',
    tutorNome: '',
    outrosTutores: [] as { titulo: 'Sr.' | 'Sra.'; nome: string }[],
    familia: 'familia' as 'sozinho' | 'familia',
    tom: 'neutro' as 'neutro' | 'acolhedor',
    petNome: '',
    recebimento: 'entrega' as 'entrega' | 'retirada' | 'digital',
    status: 'ok' as 'ok' | 'atencao',
    statusOk: 'com_itens' as 'com_itens' | 'basica',
    statusAtencao: 'definir_itens' as 'pelinho' | 'definir_itens',
    outroEndereco: false,
    itensRetirada: '',
    itensPendentes: [] as { tipo: 'fotinho' | 'modelo' | 'cor' | 'urninha'; artigo: 'do' | 'da' | 'dos' | 'das'; nome: string }[],
  })
  const [chegaramPreview, setChegaramPreview] = useState('')

  // Modal Finalizadora (Finalizado - mensagem de agradecimento)
  const [finalizadoraModal, setFinalizadoraModal] = useState(false)
  const [finalizadoraContrato, setFinalizadoraContrato] = useState<Contrato | null>(null)
  const [finalizadoraForm, setFinalizadoraForm] = useState({
    tutorTitulo: 'Sra.' as 'Sr.' | 'Sra.',
    tutorNome: '',
    familia: 'familia' as 'sozinho' | 'familia',
    comAvaliacao: true,
  })
  const [finalizadoraPreview, setFinalizadoraPreview] = useState('')

  // Modal Certificado (nomes para o certificado)
  const [certificadoModal, setCertificadoModal] = useState(false)
  const [certificadoContrato, setCertificadoContrato] = useState<Contrato | null>(null)
  const [certificadoNomes, setCertificadoNomes] = useState(['', '', '', '', ''])
  const [certificadoTextoColado, setCertificadoTextoColado] = useState('')
  const [salvandoCertificado, setSalvandoCertificado] = useState(false)

  // Modal Fotos Pendentes
  const [fotoModal, setFotoModal] = useState(false)
  const [fotoContrato, setFotoContrato] = useState<Contrato | null>(null)

  // Modal Mega Pagamento (igual ao da ficha)
  const [megaPagamentoModal, setMegaPagamentoModal] = useState(false)
  const [megaPagamentoContrato, setMegaPagamentoContrato] = useState<Contrato | null>(null)
  const [taxasCartao, setTaxasCartao] = useState<Array<{ id: string; tipo: string; nome: string; percentual: number; ordem: number }>>([])
  const [megaPagamentoForm, setMegaPagamentoForm] = useState({
    valorPlano: '',
    descontoPlano: '',
    descontoPlanoAtivo: false,
    valorAcessorio: '',
    descontoAcessorio: '',
    descontoAcessorioAtivo: false,
    descontoProporcionalizar: '',
    metodo: 'pix' as 'pix' | 'cartao' | 'dinheiro',
    bandeira: 'master' as '' | 'master' | 'visa' | 'elo' | 'amex' | 'hiper',
    parcelas: '',
    idTransacao: '',
    dataHoje: false,
    data_pagamento: '',
  })
  const [salvandoMegaPagamento, setSalvandoMegaPagamento] = useState(false)

  // Modal Supinda (selecionar/criar supinda para o contrato)
  const [supindaModal, setSupindaModal] = useState(false)
  const [supindaContrato, setSupindaContrato] = useState<Contrato | null>(null)
  const [supindasDisponiveis, setSupindasDisponiveis] = useState<Supinda[]>([])
  const [supindaSelecionada, setSupindaSelecionada] = useState<string>('')
  const [salvandoSupinda, setSalvandoSupinda] = useState(false)
  const [criarNovaSupinda, setCriarNovaSupinda] = useState(false)
  const [novaSupindaForm, setNovaSupindaForm] = useState({
    data: '',
    responsavel: '',
  })

  // Modal Marcar Entregue (retorno/pendente → finalizado)
  const [entregaModal, setEntregaModal] = useState(false)
  const [entregaContrato, setEntregaContrato] = useState<Contrato | null>(null)
  const [entregaForm, setEntregaForm] = useState({ dataHoje: true, data_entrega: '' })
  const [salvandoEntrega, setSalvandoEntrega] = useState(false)

  // Seleção batch para protocolo de entrega
  const [selectedContratos, setSelectedContratos] = useState<Set<string>>(new Set())
  const [protocoloBatchLoading, setProtocoloBatchLoading] = useState(false)

  // Modal Protocolo de Entrega
  const [protocoloModal, setProtocoloModal] = useState(false)
  const [protocoloContrato, setProtocoloContrato] = useState<Contrato | null>(null)
  const [protocoloEditData, setProtocoloEditData] = useState<ProtocoloData | null>(null)
  const [protocoloLoading, setProtocoloLoading] = useState(false)
  const [salvandoProtocolo, setSalvandoProtocolo] = useState(false)

  // Modal Rescaldos
  const [rescaldoModal, setRescaldoModal] = useState(false)
  const [rescaldoContrato, setRescaldoContrato] = useState<Contrato | null>(null)
  const [salvandoRescaldo, setSalvandoRescaldo] = useState(false)
  const [buscaRescaldo, setBuscaRescaldo] = useState('')
  const [produtosRescaldo, setProdutosRescaldo] = useState<Array<{ id: string; codigo: string; nome: string; tipo: string; rescaldo_tipo: string; preco: number | null; imagem_url: string | null }>>([])

  const POR_PAGINA = 30
  const supabase = createClient()

  // Função auxiliar para ajustar estoque de um produto
  // quantidade positiva = creditar (devolver), negativa = debitar (retirar)
  async function ajustarEstoque(produtoId: string, quantidade: number, estoqueInfinito?: boolean) {
    if (estoqueInfinito) return

    const { data: produto } = await supabase
      .from('produtos')
      .select('estoque_atual')
      .eq('id', produtoId)
      .single<{ estoque_atual: number }>()

    if (produto) {
      const novoEstoque = Math.max(0, (produto.estoque_atual || 0) + quantidade)
      await supabase
        .from('produtos')
        .update({ estoque_atual: novoEstoque } as never)
        .eq('id', produtoId)
    }
  }

  // Função auxiliar para ajustar estoque por código do produto
  async function ajustarEstoquePorCodigo(codigo: string, quantidade: number) {
    const { data: produto } = await supabase
      .from('produtos')
      .select('id, estoque_atual, estoque_infinito')
      .eq('codigo', codigo)
      .single<{ id: string; estoque_atual: number; estoque_infinito: boolean | null }>()

    if (produto && !produto.estoque_infinito) {
      const novoEstoque = Math.max(0, (produto.estoque_atual || 0) + quantidade)
      await supabase
        .from('produtos')
        .update({ estoque_atual: novoEstoque } as never)
        .eq('id', produto.id)
    }
  }

  // Função para formatar moeda
  function formatarMoeda(valor: number | null) {
    if (!valor) return 'R$ 0,00'
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  // Atualizar URL quando estado muda (sem recarregar página)
  useEffect(() => {
    const params = new URLSearchParams()
    if (busca) params.set('busca', busca)
    if (statusFiltro) params.set('status', statusFiltro)
    if (pagina > 0) params.set('pagina', pagina.toString())
    if (ordenacao !== 'data') params.set('ordenacao', ordenacao)
    if (!ordemAsc) params.set('ordemAsc', 'false')
    if (agruparCidade) params.set('cidade', 'true')
    if (agruparBairro) params.set('bairro', 'true')

    const queryString = params.toString()
    const newUrl = queryString ? `/contratos?${queryString}` : '/contratos'

    // Usar replace para não criar histórico a cada mudança de filtro
    router.replace(newUrl, { scroll: false })
  }, [statusFiltro, pagina, ordenacao, ordemAsc, agruparCidade, agruparBairro])

  useEffect(() => {
    carregarContagens()
    carregarProdutosRescaldo()
  }, [])

  // Busca em tempo real com debounce
  useEffect(() => {
    if (buscaDebounced.trim()) {
      buscarContratos(buscaDebounced)
    } else {
      // Busca zerada: restaurar contagens originais e recarregar
      setStatusCounts(statusCountsOriginal)
      carregarContratos()
    }
  }, [buscaDebounced, campoBusca])

  useEffect(() => {
    if (!buscaDebounced.trim()) {
      carregarContratos()
    }
  }, [pagina, statusFiltro, ordenacao, ordemAsc])

  async function carregarContagens() {
    // Carregar contagem por status usando count do Supabase (sem limite de 1000)
    const statusList = ['preventivo', 'ativo', 'pinda', 'retorno', 'pendente', 'finalizado']
    const counts: Record<string, number> = {}
    let totalCount = 0

    // Buscar contagem de cada status em paralelo
    const promises = statusList.map(async (status) => {
      const { count } = await supabase
        .from('contratos')
        .select('*', { count: 'exact', head: true })
        .eq('status', status)
      return { status, count: count || 0 }
    })

    const results = await Promise.all(promises)
    results.forEach(({ status, count }) => {
      counts[status] = count
      totalCount += count
    })

    setStatusCounts(counts)
    setStatusCountsOriginal(counts)
    setTotalGeral(totalCount)
  }

  async function carregarProdutosRescaldo() {
    const { data } = await supabase
      .from('produtos')
      .select('id, codigo, nome, tipo, rescaldo_tipo, preco, imagem_url')
      .not('rescaldo_tipo', 'is', null)
      .eq('ativo', true)
      .order('nome')
    if (data) setProdutosRescaldo(data as typeof produtosRescaldo)
  }

  async function carregarContratos() {
    const minhaBuscaId = ++buscaIdRef.current

    setLoading(true)

    // Definir campo e direção da ordenação
    const campoOrdem = ordenacao === 'data' ? 'data_acolhimento' : 'pet_nome'
    const ascending = ordemAsc

    let query = supabase
      .from('contratos')
      .select('id, codigo, pet_nome, pet_especie, pet_raca, pet_cor, pet_peso, pet_genero, tutor_id, tutor:tutores(id, nome, telefone), tutor_nome, tutor_telefone, tutor_cidade, tutor_bairro, local_coleta, clinica_coleta, tipo_cremacao, tipo_plano, status, data_contrato, data_acolhimento, numero_lacre, fonte_conhecimento:fontes_conhecimento(nome), seguradora, certificado_nome_1, certificado_nome_2, certificado_nome_3, certificado_nome_4, certificado_nome_5, certificado_confirmado, pelinho_quer, pelinho_feito, pelinho_quantidade, contrato_produtos(id, produto_id, quantidade, foto_recebida, separado, rescaldo_feito, produto:produtos(codigo, nome, tipo, precisa_foto, imagem_url, rescaldo_tipo)), valor_plano, desconto_plano, valor_acessorios, desconto_acessorios, pagamentos(tipo, valor), supinda_id, supinda:supindas(id, numero, data, responsavel, status, quantidade_pets, peso_total), protocolo_data, data_entrega', { count: 'exact' })
      .order(campoOrdem, { ascending, nullsFirst: false })
      .range(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA - 1)

    if (statusFiltro) {
      query = query.eq('status', statusFiltro)
    }

    const { data, error, count } = await query

    // Ignorar se outra operação (busca ou carregamento) já foi disparada
    if (minhaBuscaId !== buscaIdRef.current) return

    if (error) {
      console.error('Erro ao carregar contratos:', error)
    } else {
      setContratos((data || []) as Contrato[])
      setTotal(count || 0)
    }

    setLoading(false)
  }

  async function buscarContratos(termo?: string) {
    const termoBusca = termo ?? busca
    if (!termoBusca.trim()) {
      atualizarURL({ busca: '' })
      setStatusCounts(statusCountsOriginal)
      carregarContratos()
      return
    }

    // Incrementar ID para ignorar resultados de buscas anteriores (race condition)
    const minhaBuscaId = ++buscaIdRef.current

    setLoading(true)

    // Usar mesma ordenação da listagem
    const campoOrdem = ordenacao === 'data' ? 'data_acolhimento' : 'pet_nome'
    const ascending = ordemAsc

    let query = supabase
      .from('contratos')
      .select('id, codigo, pet_nome, pet_especie, pet_raca, pet_cor, pet_peso, pet_genero, tutor_id, tutor:tutores(id, nome, telefone), tutor_nome, tutor_telefone, tutor_cidade, tutor_bairro, local_coleta, clinica_coleta, tipo_cremacao, tipo_plano, status, data_contrato, data_acolhimento, numero_lacre, fonte_conhecimento:fontes_conhecimento(nome), seguradora, certificado_nome_1, certificado_nome_2, certificado_nome_3, certificado_nome_4, certificado_nome_5, certificado_confirmado, pelinho_quer, pelinho_feito, pelinho_quantidade, contrato_produtos(id, produto_id, quantidade, foto_recebida, separado, rescaldo_feito, produto:produtos(codigo, nome, tipo, precisa_foto, imagem_url, rescaldo_tipo)), valor_plano, desconto_plano, valor_acessorios, desconto_acessorios, pagamentos(tipo, valor), supinda_id, supinda:supindas(id, numero, data, responsavel, status, quantidade_pets, peso_total), protocolo_data, data_entrega', { count: 'exact' })
      .or(campoBusca === 'todos'
        ? `codigo.ilike.%${termoBusca}%,pet_nome.ilike.%${termoBusca}%,tutor_nome.ilike.%${termoBusca}%,numero_lacre.ilike.%${termoBusca}%`
        : campoBusca === 'pet' ? `pet_nome.ilike.%${termoBusca}%`
        : campoBusca === 'tutor' ? `tutor_nome.ilike.%${termoBusca}%`
        : campoBusca === 'codigo' ? `codigo.ilike.%${termoBusca}%`
        : `numero_lacre.ilike.%${termoBusca}%`
      )
      .order(campoOrdem, { ascending, nullsFirst: false })
      .limit(1000)

    const { data, error, count } = await query

    // Ignorar resultado se outra busca já foi disparada
    if (minhaBuscaId !== buscaIdRef.current) return

    if (error) {
      console.error('Erro na busca:', error)
    } else {
      const resultados = (data || []) as Contrato[]
      setContratos(resultados)
      setTotal(count || 0)
      atualizarURL({ busca: termoBusca })

      // Atualizar contagens do pipeline com base nos resultados da busca
      const buscaCounts: Record<string, number> = {}
      resultados.forEach(c => {
        buscaCounts[c.status] = (buscaCounts[c.status] || 0) + 1
      })
      setStatusCounts(buscaCounts)
    }

    setLoading(false)
  }

  // Função auxiliar para atualizar URL
  function atualizarURL(overrides: { busca?: string } = {}) {
    const params = new URLSearchParams()
    const buscaValue = overrides.busca !== undefined ? overrides.busca : busca
    if (buscaValue) params.set('busca', buscaValue)
    if (statusFiltro) params.set('status', statusFiltro)
    if (pagina > 0) params.set('pagina', pagina.toString())
    if (ordenacao !== 'data') params.set('ordenacao', ordenacao)
    if (!ordemAsc) params.set('ordemAsc', 'false')
    if (agruparCidade) params.set('cidade', 'true')
    if (agruparBairro) params.set('bairro', 'true')

    const queryString = params.toString()
    const newUrl = queryString ? `/contratos?${queryString}` : '/contratos'
    router.replace(newUrl, { scroll: false })
  }

  function toggleStatus(status: string) {
    setPagina(0)
    // Limpar seleção de protocolos ao trocar status
    setSelectedContratos(new Set())
    // Resetar filtro de montagem ao mudar de status
    if (status !== 'retorno') {
      setFiltroMontagem('todos')
    }
    if (statusFiltro === status) {
      setStatusFiltro(null) // Desseleciona se clicar no mesmo
      setFiltroMontagem('todos')
    } else {
      setStatusFiltro(status)
    }
  }

  // Toggle seleção de contrato para batch protocolo
  function toggleSelectContrato(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedContratos(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Abrir modal de protocolo de entrega
  async function abrirProtocoloModal(contrato: Contrato) {
    highlightContrato(contrato.id)
    setProtocoloContrato(contrato)
    setProtocoloModal(true)

    // Se tem protocolo salvo, carrega do banco
    if (contrato.protocolo_data) {
      setProtocoloEditData(normalizarProtocoloData(contrato.protocolo_data))
      return
    }

    // Senão, buscar dados e montar do zero
    setProtocoloLoading(true)
    try {
      const { data: cpData } = await supabase
        .from('contrato_produtos')
        .select('id, valor, produto:produtos(nome, nome_retorno, tipo, preco)')
        .eq('contrato_id', contrato.id)

      const { data: pagData } = await supabase
        .from('pagamentos')
        .select('tipo, valor, desconto')
        .eq('contrato_id', contrato.id)

      // Buscar dados de tutor (endereço etc)
      const { data: contratoCompleto } = await supabase
        .from('contratos')
        .select('*, tutor:tutores(nome, endereco, bairro, cidade, estado, cep)')
        .eq('id', contrato.id)
        .single()

      if (contratoCompleto) {
        const cpProdutos = (cpData || []).map((cp: any) => ({
          valor: cp.valor,
          produto: cp.produto ? { nome: cp.produto.nome, tipo: cp.produto.tipo, preco: cp.produto.preco } : null,
        }))
        const pags = (pagData || []).map((p: any) => ({ tipo: p.tipo, valor: p.valor, desconto: p.desconto }))
        const financeiro = calcFinanceiroProtocolo(contratoCompleto, pags)
        setProtocoloEditData(montarProtocoloData(contratoCompleto, cpProdutos, financeiro))
      }
    } catch (err) {
      console.error('Erro ao montar protocolo:', err)
    }
    setProtocoloLoading(false)
  }

  // Imprimir protocolos em batch (usa dados salvos do protocolo_data)
  async function imprimirProtocolosBatch() {
    if (selectedContratos.size === 0) return
    setProtocoloBatchLoading(true)

    try {
      const ids = Array.from(selectedContratos)
      const contSelecionados = contratos.filter(c => ids.includes(c.id))

      // Verificar se todos têm protocolo salvo
      const semProtocolo = contSelecionados.filter(c => !c.protocolo_data)
      if (semProtocolo.length > 0) {
        const nomes = semProtocolo.map(c => c.pet_nome).join(', ')
        alert(`Os seguintes contratos não têm protocolo salvo: ${nomes}\n\nClique na tag 📄 de cada um para preparar e salvar o protocolo antes de imprimir em batch.`)
        setProtocoloBatchLoading(false)
        return
      }

      // Usar dados salvos diretamente
      const protocolosData = contSelecionados.map(c => normalizarProtocoloData(c.protocolo_data))
      printProtocolos(protocolosData)
    } catch (err) {
      console.error('Erro ao imprimir protocolos:', err)
      alert('Erro ao gerar protocolos.')
    }

    setProtocoloBatchLoading(false)
  }

  function getDataBox(data: string | null): { linha1: string; linha2: string; hora: string } | null {
    if (!data) return null
    try {
      const d = new Date(data)
      const diasCurtos = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
      const mesesCurtos = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
      const diaSemana = diasCurtos[d.getDay()]
      const dia = d.getDate()
      const mes = mesesCurtos[d.getMonth()]
      const ano = d.getFullYear().toString().slice(-2)
      const hora = d.getHours().toString().padStart(2, '0')
      const min = d.getMinutes().toString().padStart(2, '0')
      return {
        linha1: `${diaSemana} ${dia}`,    // "Sex 23"
        linha2: `${mes}/${ano}`,           // "jan/25"
        hora: `${hora}:${min}`             // "14:30"
      }
    } catch {
      return null
    }
  }

  function getPetPorte(peso: number | null): string | null {
    if (!peso) return null
    if (peso <= 3) return 'PP'
    if (peso <= 11) return 'P'
    if (peso <= 25) return 'M'
    if (peso <= 32) return 'MG'
    if (peso <= 46) return 'G'
    return 'XG'
  }

  function getEmojiSize(peso: number | null): string {
    const porte = getPetPorte(peso)
    if (!porte) return '16px'  // P default
    switch (porte) {
      case 'PP': return '13px'
      case 'P':  return '16px'
      case 'M':  return '20px'
      case 'MG': return '25px'
      case 'G':  return '30px'
      case 'XG': return '38px'
      default:   return '16px'
    }
  }

  function getPetIcon(especie: string | null, peso: number | null): { emoji: string; emojiSize: string; style: React.CSSProperties } {
    const especieLower = especie?.toLowerCase() || ''
    const bg = 'linear-gradient(135deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)'
    const emojiSize = getEmojiSize(peso)

    if (especieLower.includes('canin') || especieLower.includes('cão') || especieLower.includes('cachorro')) {
      if (!peso || peso <= 5) {
        return { emoji: '🐕', emojiSize, style: { background: bg, color: '#b45309' } }
      } else if (peso <= 15) {
        return { emoji: '🐕', emojiSize, style: { background: bg, color: '#c2410c' } }
      } else {
        return { emoji: '🐕', emojiSize, style: { background: bg, color: '#b91c1c' } }
      }
    } else if (especieLower.includes('felin') || especieLower.includes('gato')) {
      return { emoji: '🐱', emojiSize, style: { background: bg, color: '#7c3aed' } }
    } else if (especieLower.includes('exotic') || especieLower.includes('exótic')) {
      return { emoji: '🐾', emojiSize, style: { background: bg, color: '#0d9488' } }
    }

    return { emoji: '🐾', emojiSize, style: { background: bg, color: '#64748b' } }
  }

  function formatarTelefone(tel: string | null) {
    if (!tel) return '-'
    const limpo = tel.replace(/\D/g, '')
    if (limpo.length === 11) {
      return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7)}`
    }
    return tel
  }

  // getPagamentoPendente moved to lib/contrato-tags.ts

  // Calcular nível de complexidade de montagem (1-5)
  // 1 = Coletiva (mais fácil)
  // 2 = Individual só urna
  // 3 = Coletiva com lembranças
  // 4 = Individual com acessórios
  // 5 = Individual com acessórios e foto (mais difícil)

  // Itens que NÃO contam para dificuldade de montagem
  const ITENS_IGNORAR_MONTAGEM = [
    'nenhum rescaldo',
    'certificado de cremação',
    'protocolo de retorno',
    'pelinho',
    'retorno de itens pessoais',
    'nenhuma urna',
  ]

  function getComplexidadeMontagem(contrato: Contrato): number {
    const isColetiva = contrato.tipo_cremacao === 'coletiva'
    const produtos = contrato.contrato_produtos || []

    // Filtrar produtos que realmente contam para montagem
    const produtosReais = produtos.filter(p => {
      if (!p.produto?.nome) return false
      const nomeLower = p.produto.nome.toLowerCase()
      return !ITENS_IGNORAR_MONTAGEM.some(item => nomeLower.includes(item))
    })

    const temAcessorios = produtosReais.some(p => p.produto?.tipo === 'acessorio')
    const precisaFoto = produtosReais.some(p => p.produto?.precisa_foto === true)

    // Coletiva sem acessórios = nível 1
    if (isColetiva && !temAcessorios) return 1

    // Individual só urna (sem acessórios) = nível 2
    if (!isColetiva && !temAcessorios) return 2

    // Coletiva com lembranças/acessórios = nível 3
    if (isColetiva && temAcessorios) return 3

    // Individual com acessórios (sem foto) = nível 4
    if (!isColetiva && temAcessorios && !precisaFoto) return 4

    // Individual com acessórios e foto = nível 5
    if (!isColetiva && temAcessorios && precisaFoto) return 5

    // Default: considera fácil
    return isColetiva ? 1 : 2
  }

  // Verificar se é fácil de montar (níveis 1-2)
  function isFacilMontar(contrato: Contrato): boolean {
    return getComplexidadeMontagem(contrato) <= 2
  }

  // ==================== MODAL CHEGAMOS ====================
  const mesesCurtos = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

  // Prefixos que formam nome composto: se o primeiro nome é um desses, inclui o segundo nome
  const PREFIXOS_NOME_COMPOSTO = [
    'maria', 'ana', 'anna', 'rosa',
    'joao', 'joão', 'jose', 'josé',
    'pedro', 'luiz', 'luis', 'luís', 'carlos', 'marco',
  ]

  // Capitalizar cada palavra do nome
  function capitalizarNome(nome: string): string {
    if (!nome) return ''
    return nome.split(/\s+/).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ')
  }

  // Pegar primeiro nome, preservando nomes compostos, com capitalização
  function getPrimeiroNome(nomeCompleto: string | null | undefined): string {
    if (!nomeCompleto) return ''
    const { primeiro } = separarPrimeiroNome(nomeCompleto)
    return capitalizarNome(primeiro)
  }

  // Separar primeiro nome (ou composto) do resto - retorna { primeiro, resto }
  // Se o primeiro nome é um prefixo conhecido (Maria, Luis, José...), inclui o segundo nome
  function separarPrimeiroNome(nomeCompleto: string | null | undefined): { primeiro: string; resto: string } {
    if (!nomeCompleto) return { primeiro: '', resto: '' }
    const partes = nomeCompleto.trim().split(/\s+/)
    if (partes.length <= 1) return { primeiro: partes[0] || '', resto: '' }

    const primeiroLower = partes[0].toLowerCase()
    const qtd = (partes.length >= 2 && PREFIXOS_NOME_COMPOSTO.includes(primeiroLower)) ? 2 : 1

    return {
      primeiro: partes.slice(0, qtd).join(' '),
      resto: partes.slice(qtd).join(' '),
    }
  }

  function getDiaPreset(diaSemana: 'sab' | 'dom', proximo: boolean): Date {
    const hoje = new Date()
    const targetDay = diaSemana === 'sab' ? 6 : 0
    let diff = targetDay - hoje.getDay()

    if (proximo) {
      if (diff <= 0) diff += 7
    } else {
      if (diff < 0) diff += 7
    }

    const data = new Date(hoje)
    data.setDate(hoje.getDate() + diff)
    return data
  }

  function presetDatasChegamos(tipo: 'este-sab' | 'este-dom' | 'prox-sab' | 'prox-dom') {
    const hoje = new Date()
    let enc: Date
    let encTexto: string

    if (tipo === 'este-sab') {
      enc = getDiaPreset('sab', false)
      if (enc.toDateString() === hoje.toDateString()) {
        encTexto = `hoje (${enc.getDate()}/${mesesCurtos[enc.getMonth()]})`
      } else if (enc.getDate() === hoje.getDate() + 1) {
        encTexto = `amanhã (${enc.getDate()}/${mesesCurtos[enc.getMonth()]})`
      } else {
        encTexto = `neste sábado (${enc.getDate()}/${mesesCurtos[enc.getMonth()]})`
      }
    } else if (tipo === 'este-dom') {
      enc = getDiaPreset('dom', false)
      if (enc.toDateString() === hoje.toDateString()) {
        encTexto = `hoje (${enc.getDate()}/${mesesCurtos[enc.getMonth()]})`
      } else if (enc.getDate() === hoje.getDate() + 1) {
        encTexto = `amanhã (${enc.getDate()}/${mesesCurtos[enc.getMonth()]})`
      } else {
        encTexto = `neste domingo (${enc.getDate()}/${mesesCurtos[enc.getMonth()]})`
      }
    } else if (tipo === 'prox-sab') {
      enc = getDiaPreset('sab', true)
      encTexto = `próximo sábado (${enc.getDate()}/${mesesCurtos[enc.getMonth()]})`
    } else {
      enc = getDiaPreset('dom', true)
      encTexto = `próximo domingo (${enc.getDate()}/${mesesCurtos[enc.getMonth()]})`
    }

    // Cremação: terça e quarta após o encaminhamento
    const diaSemanaEnc = enc.getDay()
    let ter: Date, qua: Date
    if (diaSemanaEnc === 6) { // sábado
      ter = new Date(enc); ter.setDate(enc.getDate() + 3)
      qua = new Date(enc); qua.setDate(enc.getDate() + 4)
    } else { // domingo
      ter = new Date(enc); ter.setDate(enc.getDate() + 2)
      qua = new Date(enc); qua.setDate(enc.getDate() + 3)
    }

    const cremTexto = `terça (${ter.getDate()}/${mesesCurtos[ter.getMonth()]}) e quarta (${qua.getDate()}/${mesesCurtos[qua.getMonth()]})`

    setChegamosForm(prev => ({
      ...prev,
      dataEncaminhamento: encTexto,
      dataCremacao: cremTexto,
    }))
  }

  function abrirChegamosModal(contrato: Contrato) {
    setChegamosContrato(contrato)
    setChegamosForm({
      tutores: [{ titulo: 'Sra.', nome: getPrimeiroNome(contrato.tutor?.nome || contrato.tutor_nome) }],
      petNome: capitalizarNome(contrato.pet_nome || ''),
      petGenero: contrato.pet_genero === 'macho' ? 'M' : 'F',
      velorio: 'nao',
      velorioTexto: '',
      dataEncaminhamento: '',
      dataCremacao: '',
      contatoMatriz: 'proxima',
      preRescaldo: false,
    })
    setChegamosPreview('')
    setChegamosModal(true)
    // Preset com "Este Sáb" por padrão
    setTimeout(() => presetDatasChegamos('este-sab'), 0)
  }

  function gerarMensagemChegamos(): string {
    const { tutores, petNome, petGenero, velorio, velorioTexto, dataEncaminhamento, dataCremacao, contatoMatriz, preRescaldo } = chegamosForm

    const tutoresValidos = tutores.filter(t => t.nome.trim())
    if (tutoresValidos.length === 0) return ''

    const tutorTexto = tutoresValidos.map(t => `${t.titulo} ${t.nome}`).join(' e ')
    const artigoPet = petGenero === 'F' ? 'a' : 'o'
    const deleDela = petGenero === 'F' ? 'dela' : 'dele'

    // Pronomes para "Nós a/o/as/os manteremos informado(s/a/as)"
    let pronomeTutor: string, informado: string
    if (tutoresValidos.length === 1) {
      if (tutoresValidos[0].titulo === 'Sra.') {
        pronomeTutor = 'a'
        informado = 'informada'
      } else {
        pronomeTutor = 'o'
        informado = 'informado'
      }
    } else {
      const temFem = tutoresValidos.some(t => t.titulo === 'Sra.')
      const temMasc = tutoresValidos.some(t => t.titulo === 'Sr.')
      if (temFem && !temMasc) {
        pronomeTutor = 'as'
        informado = 'informadas'
      } else {
        pronomeTutor = 'os'
        informado = 'informados'
      }
    }

    let msg = `${tutorTexto}, já estamos com ${artigoPet} ${petNome} em nossa unidade.

Vamos cuidar ${deleDela} com todo carinho, respeito e muito amor!

`

    if (velorio === 'sim') {
      let velorioFrase = 'Nossa equipe que cuida das despedidas presenciais irá entrar em contato'
      if (velorioTexto) velorioFrase += ` ${velorioTexto}`
      velorioFrase += ' para agendar o velório em nossa unidade. Caso queira enviar preferências de dia/período, já deixarei anotado.'
      msg += velorioFrase + '\n\n'
    }

    if (dataEncaminhamento && dataCremacao) {
      msg += `O encaminhamento será feito no ${dataEncaminhamento}, e a cremação ocorrerá entre ${dataCremacao}.

`
    }

    const semanaTexto = contatoMatriz === 'proxima' ? 'Na próxima segunda' : 'Na semana de cremação'
    msg += `${semanaTexto}, nossa equipe da Matriz entrará em contato para agendar o dia/horário, explicar e confirmar a escolha do acompanhamento.`

    if (preRescaldo) {
      msg += `

(Caso queira que eu envie as recordações personalizadas que podemos preparar, é só me avisar)`
    }

    msg += `

Nós ${pronomeTutor} manteremos ${informado} de todo processo e qualquer dúvida, basta nos chamar por aqui.

Novamente, nossos sinceros sentimentos 🙏😔`

    return msg
  }

  function copiarChegamos() {
    const msg = gerarMensagemChegamos()
    if (!msg) return
    navigator.clipboard.writeText(msg)
  }

  function enviarWhatsappChegamos() {
    if (!chegamosContrato) return
    const tel = chegamosContrato.tutor?.telefone || chegamosContrato.tutor_telefone
    if (!tel) return
    const msg = gerarMensagemChegamos()
    if (!msg) return
    const telLimpo = tel.replace(/\D/g, '')
    const telFormatado = telLimpo.startsWith('55') ? telLimpo : `55${telLimpo}`
    window.open(`https://wa.me/${telFormatado}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // ==================== MODAL CHEGARAM ====================
  function abrirChegaramModal(contrato: Contrato) {
    setChegaramContrato(contrato)
    setChegaramForm({
      tutorTitulo: 'Sra.',
      tutorNome: getPrimeiroNome(contrato.tutor?.nome || contrato.tutor_nome),
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
    setChegaramPreview('')
    setChegaramModal(true)
  }

  function gerarMensagemChegaram(): string {
    if (!chegaramContrato) return ''

    const { tutorTitulo, tutorNome, outrosTutores, familia, tom, petNome, recebimento, status, statusOk, statusAtencao, outroEndereco, itensRetirada, itensPendentes } = chegaramForm
    const isIndividual = chegaramContrato.tipo_cremacao === 'individual'

    if (!tutorNome.trim()) return ''

    // Outros tutores
    const outrosTutoresTexto = outrosTutores.filter(t => t.nome.trim()).map(t => `${t.titulo} ${t.nome}`).join(', ')
    const outrosTexto = outrosTutoresTexto ? `, ${outrosTutoresTexto}` : ''

    // Pronomes
    let pronome: string, verboEstar: string
    if (familia === 'familia') {
      pronome = 'vocês'
      verboEstar = 'estão'
    } else {
      pronome = tutorTitulo === 'Sr.' ? 'o senhor' : 'a senhora'
      verboEstar = 'está'
    }

    // Saudação
    let saudacao = `Oi, ${tutorTitulo} ${tutorNome}${outrosTexto}. Como ${pronome} ${verboEstar}? Esperamos que`

    if (tom === 'neutro') {
      saudacao += ' bem 🙏🩵'
    } else {
      if (familia === 'familia') {
        saudacao += ' um pouquinho melhores 🙏🩵'
      } else {
        saudacao += ' um pouquinho melhor 🙏🩵'
      }
    }

    let msg = saudacao + '\n\n'

    // O que chegou
    const oQueChegou = isIndividual ? 'As cinzinhas já chegaram' : 'O certificado já chegou'

    // DIGITAL (só COL)
    if (recebimento === 'digital') {
      msg += `${oQueChegou} à Santos. Vamos digitalizar entre hoje e amanhã e enviamos por aqui em anexo.`
      return msg
    }

    // RETIRADA
    if (recebimento === 'retirada') {
      const retiradaTexto = itensRetirada ? `a retirada ${itensRetirada}` : 'a retirada'
      msg += `${oQueChegou} à Santos. Vocês gostariam de agendar ${retiradaTexto} aqui em nossa unidade nesta semana?

(Se não estiver confortável ainda, não tem problema, nós retornamos o contato na próxima semana).`
      return msg
    }

    // ENTREGA
    let perguntaEndereco = 'Tem algum dia/horário que não pode receber no endereço de cadastro?'
    if (outroEndereco) {
      perguntaEndereco += ' Ou se tiver outro endereço com maior disponibilidade, podemos nos adaptar'
    }

    if (status === 'ok') {
      if (statusOk === 'com_itens') {
        msg += `${oQueChegou} à Santos. ${isIndividual ? 'Estamos preparando tudo com muito carinho e vamos' : 'Vamos preparar tudo com carinho e'} organizar as nossas rotas de entrega pela semana.

${perguntaEndereco}

(Se não estiver confortável ainda para receber, não tem problema, nós retornamos o contato na próxima semana).`
      } else {
        // Básica
        msg += `${oQueChegou} à Santos. Vamos organizar as nossas rotas de entrega pela semana.

${perguntaEndereco}

(Se não estiver confortável ainda para receber, não tem problema, nós retornamos o contato na próxima semana).`
      }
    } else {
      // ATENÇÃO
      if (statusAtencao === 'pelinho') {
        msg += `${oQueChegou} à Santos. Vamos organizar as nossas rotas de entrega pela semana.

Nós fizemos uma recordação com uma mechinha do pelinho em uma garrafinha delicada. Mas caso não se sinta confortável com ela, nós podemos não entregar, podendo enviar o certificado digitalizado por aqui. Como for melhor.`
      } else {
        // Definir itens
        if (itensPendentes.length === 0) return ''

        const conseguiu = familia === 'familia' ? 'Vocês conseguiram' : (tutorTitulo === 'Sr.' ? 'O senhor conseguiu' : 'A senhora conseguiu')

        // Monta lista de itens
        const itensTextos: string[] = []
        itensPendentes.forEach(item => {
          const plural = item.artigo === 'dos' || item.artigo === 'das'
          if (item.tipo === 'urninha') {
            itensTextos.push(plural ? 'as urninhas' : 'a urninha')
          } else if (item.nome) {
            if (item.tipo === 'fotinho') {
              itensTextos.push(plural ? `as fotinhos ${item.artigo} ${item.nome}` : `a fotinho ${item.artigo} ${item.nome}`)
            } else if (item.tipo === 'modelo') {
              itensTextos.push(plural ? `os modelos ${item.artigo} ${item.nome}` : `o modelo ${item.artigo} ${item.nome}`)
            } else if (item.tipo === 'cor') {
              itensTextos.push(plural ? `as cores ${item.artigo} ${item.nome}` : `a cor ${item.artigo} ${item.nome}`)
            }
          }
        })

        if (itensTextos.length === 0) return ''

        let itensTextoFinal: string
        if (itensTextos.length === 1) {
          itensTextoFinal = itensTextos[0]
        } else {
          const ultimo = itensTextos.pop()!
          itensTextoFinal = itensTextos.join(', ') + ' e ' + ultimo
        }

        msg += `${oQueChegou} à Santos. Estamos preparando tudo com muito carinho para a entrega.
${conseguiu} escolher ${itensTextoFinal}?

(Se não estiver confortável ainda para escolher ou receber, não tem problema, nós retornamos o contato na próxima semana).`
      }
    }

    return msg
  }

  function copiarChegaram() {
    const msg = gerarMensagemChegaram()
    if (!msg) return
    navigator.clipboard.writeText(msg)
  }

  function enviarWhatsappChegaram() {
    if (!chegaramContrato) return
    const tel = chegaramContrato.tutor?.telefone || chegaramContrato.tutor_telefone
    if (!tel) return
    const msg = gerarMensagemChegaram()
    if (!msg) return
    const telLimpo = tel.replace(/\D/g, '')
    const telFormatado = telLimpo.startsWith('55') ? telLimpo : `55${telLimpo}`
    window.open(`https://wa.me/${telFormatado}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // ==================== MODAL FINALIZADORA ====================
  function abrirFinalizadoraModal(contrato: Contrato) {
    setFinalizadoraContrato(contrato)
    setFinalizadoraForm({
      tutorTitulo: 'Sra.',
      tutorNome: getPrimeiroNome(contrato.tutor?.nome || contrato.tutor_nome),
      familia: 'familia',
      comAvaliacao: true,
    })
    setFinalizadoraPreview('')
    setFinalizadoraModal(true)
  }

  function gerarMensagemFinalizadora(): string {
    const { tutorTitulo, tutorNome, familia, comAvaliacao } = finalizadoraForm

    if (!tutorNome.trim()) return ''

    // Pronomes
    let voces: string, precisarem: string
    if (familia === 'familia') {
      voces = 'vocês'
      precisarem = 'precisarem'
    } else {
      voces = tutorTitulo === 'Sr.' ? 'o senhor' : 'a senhora'
      precisarem = 'precisar'
    }

    let msg = `${tutorTitulo} ${tutorNome},

Sabemos que não é um serviço desejado, mas esperamos ter trazido um pouco de acolhimento e conforto nesse momento delicado para ${voces}.

Estamos por aqui sempre, para o que ${precisarem}. 🤝

Um abraço de toda equipe R.I.P. Pet Crematório de Animais 🩵`

    if (comAvaliacao) {
      msg += `

Abaixo está o link de avaliação do Google, caso se sintam confortáveis em nos avaliar. É bem rápido e nos ajuda muito a alcançar mais tutores especiais como ${voces} que também precisem do nosso serviço. 🙏

https://g.page/r/CfzJmq1OqJPDEBI/review

Gratidão eterna!
🐾`
    } else {
      msg += `

Gratidão eterna!
🐾`
    }

    return msg
  }

  function copiarFinalizadora() {
    const msg = gerarMensagemFinalizadora()
    if (!msg) return
    navigator.clipboard.writeText(msg)
  }

  function enviarWhatsappFinalizadora() {
    if (!finalizadoraContrato) return
    const tel = finalizadoraContrato.tutor?.telefone || finalizadoraContrato.tutor_telefone
    if (!tel) return
    const msg = gerarMensagemFinalizadora()
    if (!msg) return
    const telLimpo = tel.replace(/\D/g, '')
    const telFormatado = telLimpo.startsWith('55') ? telLimpo : `55${telLimpo}`
    window.open(`https://wa.me/${telFormatado}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // Funções do modal de certificado
  function abrirCertificadoModal(contrato: Contrato) {
    highlightContrato(contrato.id)
    setCertificadoContrato(contrato)
    setCertificadoTextoColado('') // Limpar área de trabalho
    // Preencher com nomes existentes ou tutor principal como padrão
    const nomes = [
      contrato.certificado_nome_1 || '',
      contrato.certificado_nome_2 || '',
      contrato.certificado_nome_3 || '',
      contrato.certificado_nome_4 || '',
      contrato.certificado_nome_5 || ''
    ]
    // Se não tem nenhum nome definido, colocar o tutor principal no primeiro campo
    if (!nomes.some(n => n.trim())) {
      const tutorNome = contrato.tutor?.nome || contrato.tutor_nome || ''
      nomes[0] = tutorNome.toUpperCase()
    }
    setCertificadoNomes(nomes)
    setCertificadoModal(true)
  }

  async function salvarCertificado() {
    if (!certificadoContrato) return
    setSalvandoCertificado(true)

    try {
      // Converter todos os nomes para maiúsculas e limpar vazios
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
        .eq('id', certificadoContrato.id)

      if (error) throw error

      // Atualizar lista local
      setContratos(prev => prev.map(c =>
        c.id === certificadoContrato.id
          ? {
              ...c,
              certificado_nome_1: nomesUpper[0] || null,
              certificado_nome_2: nomesUpper[1] || null,
              certificado_nome_3: nomesUpper[2] || null,
              certificado_nome_4: nomesUpper[3] || null,
              certificado_nome_5: nomesUpper[4] || null,
              certificado_confirmado: true,
            }
          : c
      ))

      setCertificadoModal(false)
      unhighlightContrato()
    } catch (err) {
      console.error('Erro ao salvar certificado:', err)
      alert('Erro ao salvar. Tente novamente.')
    }

    setSalvandoCertificado(false)
  }

  // Colar texto do clipboard para área de trabalho do certificado
  async function colarTextoClipboard() {
    try {
      const texto = await navigator.clipboard.readText()
      setCertificadoTextoColado(texto)
    } catch (err) {
      console.error('Erro ao acessar clipboard:', err)
      alert('Não foi possível acessar a área de transferência')
    }
  }

  // Adicionar texto selecionado (ou todo o texto) ao próximo campo vazio
  function adicionarNomeAoProximoVazio() {
    // Pegar texto selecionado na página ou o texto todo
    const selecao = window.getSelection()?.toString().trim()
    const texto = selecao || certificadoTextoColado.trim()

    if (!texto) {
      alert('Selecione um texto ou cole algo primeiro')
      return
    }

    // Encontrar primeiro campo vazio
    const indiceVazio = certificadoNomes.findIndex(n => !n.trim())
    if (indiceVazio === -1) {
      alert('Todos os campos já estão preenchidos')
      return
    }

    const novos = [...certificadoNomes]
    novos[indiceVazio] = texto.toUpperCase()
    setCertificadoNomes(novos)
  }

  // Mover tutor para cima
  function moverTutorCima(index: number) {
    if (index <= 0) return
    const novos = [...certificadoNomes]
    const temp = novos[index - 1]
    novos[index - 1] = novos[index]
    novos[index] = temp
    setCertificadoNomes(novos)
  }

  // Mover tutor para baixo
  function moverTutorBaixo(index: number) {
    if (index >= certificadoNomes.length - 1) return
    const novos = [...certificadoNomes]
    const temp = novos[index + 1]
    novos[index + 1] = novos[index]
    novos[index] = temp
    setCertificadoNomes(novos)
  }

  // Funções do modal de fotos
  function abrirFotoModal(contrato: Contrato) {
    highlightContrato(contrato.id)
    setFotoContrato(contrato)
    setFotoModal(true)
  }

  async function toggleFotoRecebidaPipeline(cpId: string, fotoRecebidaAtual: boolean) {
    if (!fotoContrato) return

    const { error } = await supabase
      .from('contrato_produtos')
      .update({ foto_recebida: !fotoRecebidaAtual } as never)
      .eq('id', cpId)

    if (!error) {
      // Atualizar o contrato no estado local
      setContratos(prev => prev.map(c => {
        if (c.id === fotoContrato.id && c.contrato_produtos) {
          return {
            ...c,
            contrato_produtos: c.contrato_produtos.map(cp =>
              cp.id === cpId ? { ...cp, foto_recebida: !fotoRecebidaAtual } : cp
            )
          }
        }
        return c
      }))

      // Atualizar também o fotoContrato
      setFotoContrato(prev => {
        if (!prev || !prev.contrato_produtos) return prev
        return {
          ...prev,
          contrato_produtos: prev.contrato_produtos.map(cp =>
            cp.id === cpId ? { ...cp, foto_recebida: !fotoRecebidaAtual } : cp
          )
        }
      })
    }
  }

  // Funções do Mega Pagamento
  async function carregarTaxasCartao() {
    const { data } = await supabase
      .from('taxas_cartao')
      .select('id, tipo, nome, percentual, ordem')
      .eq('ativo', true)
      .order('ordem')
    if (data) setTaxasCartao(data)
  }

  async function abrirMegaPagamentoModal(contrato: Contrato) {
    highlightContrato(contrato.id)
    const { planoPendente, acessoriosPendente } = getPagamentoPendente(contrato)
    const saldoPlano = planoPendente
      ? (contrato.valor_plano || 0) - (contrato.desconto_plano || 0) - (contrato.pagamentos?.filter(p => p.tipo === 'plano').reduce((acc, p) => acc + (p.valor || 0), 0) || 0)
      : 0
    const saldoAcessorio = acessoriosPendente
      ? (contrato.valor_acessorios || 0) - (contrato.desconto_acessorios || 0) - (contrato.pagamentos?.filter(p => p.tipo === 'catalogo').reduce((acc, p) => acc + (p.valor || 0), 0) || 0)
      : 0

    setMegaPagamentoContrato(contrato)
    setMegaPagamentoForm({
      valorPlano: saldoPlano > 0 ? saldoPlano.toFixed(2) : '',
      descontoPlano: '',
      descontoPlanoAtivo: false,
      valorAcessorio: saldoAcessorio > 0 ? saldoAcessorio.toFixed(2) : '',
      descontoAcessorio: '',
      descontoAcessorioAtivo: false,
      descontoProporcionalizar: '',
      metodo: 'pix',
      bandeira: 'master',
      parcelas: '',
      idTransacao: '',
      dataHoje: false,
      data_pagamento: '',
    })
    setMegaPagamentoModal(true)
    if (taxasCartao.length === 0) {
      await carregarTaxasCartao()
    }
  }

  async function salvarMegaPagamento() {
    if (!megaPagamentoContrato) return

    // Validar data obrigatória
    if (!megaPagamentoForm.dataHoje && !megaPagamentoForm.data_pagamento) {
      alert('Informe a data do pagamento')
      return
    }

    // Validar ID transação obrigatório para cartão
    if (megaPagamentoForm.metodo === 'cartao') {
      if (!megaPagamentoForm.bandeira || !megaPagamentoForm.parcelas) {
        alert('Selecione bandeira e parcelas para cartão')
        return
      }
      if (!megaPagamentoForm.idTransacao?.trim()) {
        alert('Informe o ID da transação para pagamento em cartão')
        return
      }
    }

    setSalvandoMegaPagamento(true)

    const dataPagamento = megaPagamentoForm.dataHoje
      ? new Date().toISOString().split('T')[0]
      : megaPagamentoForm.data_pagamento

    const mesCompetencia = dataPagamento ? `${dataPagamento.slice(0, 4)}/${dataPagamento.slice(5, 7)}` : null

    const CONTAS = {
      pix: '1124d3d0-f525-450c-92d7-739e70a42cb0',
      cartao: 'c102eed4-5318-492a-a6c5-f794483f9639',
      dinheiro: 'e4b0636c-2241-4911-b444-359e83e39674',
    }
    const contaId = CONTAS[megaPagamentoForm.metodo as keyof typeof CONTAS] || null

    const tipoTaxa = megaPagamentoForm.bandeira && megaPagamentoForm.parcelas
      ? `${megaPagamentoForm.bandeira}_${megaPagamentoForm.parcelas}`
      : null
    const tipoSelecionado = taxasCartao.find(t => t.tipo === tipoTaxa)
    const taxaPercentual = tipoSelecionado?.percentual || 0

    let parcelas = 1
    if (megaPagamentoForm.parcelas && megaPagamentoForm.parcelas !== 'debito') {
      const match = megaPagamentoForm.parcelas.match(/(\d+)x/)
      if (match) parcelas = parseInt(match[1])
    }

    const idTransacao = megaPagamentoForm.idTransacao?.trim() || null
    const bandeira = megaPagamentoForm.metodo === 'cartao' ? megaPagamentoForm.bandeira : null

    const metodoBanco = megaPagamentoForm.metodo === 'cartao'
      ? (megaPagamentoForm.parcelas === 'debito' ? 'debito' : 'credito')
      : megaPagamentoForm.metodo

    // Valores
    const valorPlano = megaPagamentoForm.valorPlano ? parseFloat(megaPagamentoForm.valorPlano) : 0
    const descontoPlano = megaPagamentoForm.descontoPlanoAtivo && megaPagamentoForm.descontoPlano ? parseFloat(megaPagamentoForm.descontoPlano) : 0
    const valorBrutoPlano = valorPlano - descontoPlano

    const valorAcessorio = megaPagamentoForm.valorAcessorio ? parseFloat(megaPagamentoForm.valorAcessorio) : 0
    const descontoAcessorio = megaPagamentoForm.descontoAcessorioAtivo && megaPagamentoForm.descontoAcessorio ? parseFloat(megaPagamentoForm.descontoAcessorio) : 0
    const valorBrutoAcessorio = valorAcessorio - descontoAcessorio

    const pagamentosParaInserir = []

    if (valorBrutoPlano > 0) {
      const taxaPlano = valorBrutoPlano * (taxaPercentual / 100)
      pagamentosParaInserir.push({
        contrato_id: megaPagamentoContrato.id,
        tipo: 'plano',
        metodo: metodoBanco,
        conta_id: contaId,
        valor: valorPlano,
        desconto: descontoPlano > 0 ? descontoPlano : null,
        taxa: taxaPlano > 0 ? taxaPlano : null,
        valor_liquido_sem_taxa: valorBrutoPlano,
        valor_liquido: valorBrutoPlano - taxaPlano,
        parcelas,
        bandeira,
        id_transacao: idTransacao,
        is_seguradora: false,
        data_pagamento: dataPagamento,
        mes_competencia: mesCompetencia,
      })
    }

    if (valorBrutoAcessorio > 0) {
      const taxaAcessorio = valorBrutoAcessorio * (taxaPercentual / 100)
      pagamentosParaInserir.push({
        contrato_id: megaPagamentoContrato.id,
        tipo: 'catalogo',
        metodo: metodoBanco,
        conta_id: contaId,
        valor: valorAcessorio,
        desconto: descontoAcessorio > 0 ? descontoAcessorio : null,
        taxa: taxaAcessorio > 0 ? taxaAcessorio : null,
        valor_liquido_sem_taxa: valorBrutoAcessorio,
        valor_liquido: valorBrutoAcessorio - taxaAcessorio,
        parcelas,
        bandeira,
        id_transacao: idTransacao,
        is_seguradora: false,
        data_pagamento: dataPagamento,
        mes_competencia: mesCompetencia,
      })
    }

    if (pagamentosParaInserir.length === 0) {
      alert('Informe ao menos um valor de pagamento')
      setSalvandoMegaPagamento(false)
      return
    }

    const { data: novosPagamentos, error } = await supabase
      .from('pagamentos')
      .insert(pagamentosParaInserir as never)
      .select('tipo, valor')

    if (error) {
      console.error('Erro ao salvar pagamento:', error)
      alert('Erro ao salvar pagamento')
    } else {
      // Atualizar lista de contratos com novos pagamentos
      setContratos(prev => prev.map(c => {
        if (c.id === megaPagamentoContrato.id) {
          const pagamentosAtuais = c.pagamentos || []
          return {
            ...c,
            pagamentos: [...pagamentosAtuais, ...(novosPagamentos || [])]
          }
        }
        return c
      }))
      setMegaPagamentoModal(false)
      unhighlightContrato()
    }

    setSalvandoMegaPagamento(false)
  }

  // Toggle separado para montagem inline
  async function toggleSeparadoInline(cpId: string, contratoId: string, separadoAtual: boolean) {
    const { error } = await supabase
      .from('contrato_produtos')
      .update({ separado: !separadoAtual } as never)
      .eq('id', cpId)

    if (!error) {
      setContratos(prev => prev.map(c => {
        if (c.id === contratoId && c.contrato_produtos) {
          return {
            ...c,
            contrato_produtos: c.contrato_produtos.map(cp =>
              cp.id === cpId ? { ...cp, separado: !separadoAtual } : cp
            )
          }
        }
        return c
      }))
    }
  }

  // Separar todos de uma categoria
  async function separarTodosCategoria(categoria: string, contratos: Contrato[]) {
    const categorizarProduto = (nome: string, codigo: string, tipo: string, precisaFoto: boolean): string => {
      // Certificado (0005) e Protocolo (0006)
      if (codigo === '0005') return 'certificados'
      if (codigo === '0006') return 'protocolos'
      // Pelinhos: 0004 = Pelinho, 0007 = Pelo Extra
      if (codigo === '0004' || codigo === '0007') return 'pelinhos'
      // Rescaldos: 0003 = Molde, 0002 = Nenhum Rescaldo, 1407 = Carimbo
      if (codigo === '0003' || codigo === '0002' || codigo === '1407') return 'rescaldos'
      // Urnas - usa o tipo do produto
      if (tipo === 'urna') return 'urnas'
      // Porta-retratos: acessório com precisa_foto = true
      if (tipo === 'acessorio' && precisaFoto) return 'porta-retratos'
      // Pingentes: acessório com precisa_foto = false e nome contém Ping/Chavei/P/ Visor
      const nomeLower = nome.toLowerCase()
      if (tipo === 'acessorio' && !precisaFoto && (nomeLower.includes('ping') || nomeLower.includes('chavei') || nomeLower.includes('p/ visor'))) return 'pingentes'
      // Outros
      return 'outros'
    }

    // Coletar IDs dos produtos da categoria que não estão separados
    const idsParaSeparar: string[] = []
    contratos.forEach(c => {
      c.contrato_produtos?.forEach(cp => {
        if (!cp.produto || cp.separado) return
        const cat = categorizarProduto(cp.produto.nome, cp.produto.codigo, cp.produto.tipo, cp.produto.precisa_foto)
        if (cat === categoria) {
          idsParaSeparar.push(cp.id)
        }
      })
    })

    if (idsParaSeparar.length === 0) return

    const { error } = await supabase
      .from('contrato_produtos')
      .update({ separado: true } as never)
      .in('id', idsParaSeparar)

    if (!error) {
      setContratos(prev => prev.map(c => ({
        ...c,
        contrato_produtos: c.contrato_produtos?.map(cp =>
          idsParaSeparar.includes(cp.id) ? { ...cp, separado: true } : cp
        )
      })))
    }
  }

  // Funções do modal de pelinho
  function abrirPelinhoModal(contrato: Contrato) {
    highlightContrato(contrato.id)
    setPelinhoContrato(contrato)
    setPelinhoQtd(contrato.pelinho_quantidade || 1)
    setPelinhoFeito(contrato.pelinho_feito || false)

    // Se já quer pelinho (true), abre modal 2 (check/validação)
    // Se não definido (null) ou não quer (false), abre modal 1 (pergunta inicial)
    if (contrato.pelinho_quer === true) {
      setPelinhoQuer(true)
      setPelinhoModal2(true)
    } else {
      setPelinhoQuer(contrato.pelinho_quer === null ? true : false) // default Sim
      setPelinhoModal1(true)
    }
  }

  async function salvarPelinho() {
    if (!pelinhoContrato) return
    setSalvandoPelinho(true)

    try {
      // 1. Buscar produto_id do pelinho (código 0004)
      const resultado = await supabase
        .from('produtos')
        .select('id')
        .eq('codigo', '0004')
        .single()
      const produtoPelinho = resultado.data as { id: string } | null

      if (!produtoPelinho) {
        alert('Produto pelinho (0004) não encontrado!')
        setSalvandoPelinho(false)
        return
      }

      // 2. Buscar linhas de pelinho existentes para este contrato
      const resPelinho = await supabase
        .from('contrato_produtos')
        .select('id, separado')
        .eq('contrato_id', pelinhoContrato.id)
        .eq('produto_id', produtoPelinho.id)
      const pelinhoExistentes = resPelinho.data as Array<{ id: string; separado: boolean }> | null

      const qtdAtual = pelinhoExistentes?.length || 0
      const qtdDesejada = pelinhoQuer ? pelinhoQtd : 0

      // 3. Sincronizar contrato_produtos
      if (qtdDesejada > qtdAtual) {
        // Adicionar linhas
        const novasLinhas = Array.from({ length: qtdDesejada - qtdAtual }, () => ({
          contrato_id: pelinhoContrato.id,
          produto_id: produtoPelinho.id,
          quantidade: 1,
          valor: 0,
          desconto: 0,
          is_reserva_pv: false,
          separado: pelinhoFeito,
          foto_recebida: false
        }))
        await supabase.from('contrato_produtos').insert(novasLinhas as never)
      } else if (qtdDesejada < qtdAtual) {
        // Remover linhas extras (remove as últimas)
        const idsParaRemover = pelinhoExistentes!
          .slice(qtdDesejada)
          .map(p => p.id)
        if (idsParaRemover.length > 0) {
          await supabase
            .from('contrato_produtos')
            .delete()
            .in('id', idsParaRemover)
        }
      }

      // 4. Atualizar status 'separado' das linhas restantes (se marcou como feito)
      if (pelinhoQuer && pelinhoExistentes && pelinhoExistentes.length > 0) {
        const idsParaAtualizar = pelinhoExistentes.slice(0, qtdDesejada).map(p => p.id)
        if (idsParaAtualizar.length > 0) {
          await supabase
            .from('contrato_produtos')
            .update({ separado: pelinhoFeito } as never)
            .in('id', idsParaAtualizar)
        }
      }

      // 5. Atualizar campos no contrato (cache)
      const { error } = await supabase
        .from('contratos')
        .update({
          pelinho_quer: pelinhoQuer,
          pelinho_feito: pelinhoQuer ? pelinhoFeito : false,
          pelinho_quantidade: pelinhoQuer ? pelinhoQtd : 0
        } as never)
        .eq('id', pelinhoContrato.id)

      if (error) throw error

      // 6. Atualizar contrato na lista local
      setContratos(contratos.map(c =>
        c.id === pelinhoContrato.id
          ? {
              ...c,
              pelinho_quer: pelinhoQuer,
              pelinho_feito: pelinhoQuer ? pelinhoFeito : false,
              pelinho_quantidade: pelinhoQuer ? pelinhoQtd : 0
            }
          : c
      ))
      setPelinhoModal1(false)
      setPelinhoModal2(false)
      unhighlightContrato()

    } catch (err) {
      console.error('Erro ao salvar pelinho:', err)
      alert('Erro ao salvar. Tente novamente.')
    }

    setSalvandoPelinho(false)
  }

  // Pet Grato - abre o modal
  function abrirPetGrato(contrato: Contrato) {
    setPetGratoContrato(contrato)
    setPetGratoForm({
      tutorNome: getPrimeiroNome(contrato.tutor?.nome || contrato.tutor_nome),
      petNome: capitalizarNome((contrato.pet_nome || '').trim().split(/\s+/)[0] || ''),
      sexo: contrato.pet_genero === 'macho' ? 'M' : 'F',
      familia: 'F',
    })
    setPetGratoModal(true)
  }

  // Pet Grato - gera a mensagem
  function gerarMensagemPetGrato(): string {
    const { tutorNome, petNome, sexo, familia } = petGratoForm
    const obrigado = sexo === 'M' ? '*Obrigado*' : '*Obrigada*'

    if (familia === 'F') {
      return `*Aos meus grandes amores, ${tutorNome} e família,*

${obrigado} por tudo, fui em paz. 💐🕊️

Não chorem mais, por favor. Tenho na lembrança o nome que me deram, o calor da casa que neste tempo se tornou minha. Essa foi a família que eu tive. Eu levo o som das suas vozes falando pra mim, mesmo não entendendo sempre o que me diziam.

Eu carrego em meu coração cada carícia que vocês me deram. Tudo o que vocês fizeram foi muito valioso pra mim e eu agradeço infinitamente.

Eu só vou pedir dois favores: lavem o rosto e comecem a sorrir. Lembrem-se de como foi bom que vivemos juntos estes momentos, lembrem-se das coisas que eu fazia para alegrar. Reviva tudo que compartilhamos neste tempo. Sem vocês eu não teria vivido tudo que vivi. Ao lado de vocês, a minha vida valeu cada segundo.

Eu os acompanharei nos teus caminhos.

Hoje a noite, quando olharem para o céu e verem uma estrela brilhando, quero que saibam que sou eu piscando pra vocês e avisando que cheguei bem 😇

Eu amo vocês❣️🐾

Com carinho,
${petNome}`
    } else {
      return `*Ao meu grande amor, ${tutorNome},*

${obrigado} por tudo, fui em paz. 💐🕊️

Não chore mais, por favor. Tenho na lembrança o nome que me deu, o calor da casa que neste tempo se tornou minha. Essa foi a família que eu tive. Eu levo o som da sua voz falando pra mim, mesmo não entendendo sempre o que me dizia.

Eu carrego em meu coração cada carícia que você me deu. Tudo o que você fez foi muito valioso pra mim e eu agradeço infinitamente.

Eu só vou pedir dois favores: lave o rosto e comece a sorrir. Lembre-se de como foi bom que vivemos juntos estes momentos, lembre-se das coisas que eu fazia para alegrar. Reviva tudo que compartilhamos neste tempo. Sem você eu não teria vivido tudo que vivi. Ao seu lado, a minha vida valeu cada segundo.

Eu te acompanharei nos teus caminhos.

Hoje a noite, quando olhar para o céu e ver uma estrela brilhando, quero que saiba que sou eu piscando pra você e avisando que cheguei bem 😇

Eu te amo❣️🐾

Com carinho,
${petNome}`
    }
  }

  // Pet Grato - envia para WhatsApp
  function enviarPetGrato() {
    if (!petGratoContrato) return
    const telefone = petGratoContrato.tutor?.telefone || petGratoContrato.tutor_telefone
    if (!telefone) {
      alert('Tutor não possui telefone cadastrado')
      return
    }
    if (!petGratoForm.tutorNome || !petGratoForm.petNome) {
      alert('Preencha o nome do tutor e do pet')
      return
    }
    const mensagem = gerarMensagemPetGrato()
    const tel = telefone.replace(/\D/g, '')
    const url = `https://wa.me/${tel}?text=${encodeURIComponent(mensagem)}`
    window.open(url, '_blank')
    setPetGratoModal(false)
  }

  // Ativar PV - carrega dados auxiliares
  async function carregarDadosAtivacao() {
    // Carrega funcionários ativos
    const { data: funcs } = await supabase
      .from('funcionarios')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome')
    if (funcs) setFuncionarios(funcs)

    // Carrega supindas recentes (últimas 10)
    const { data: sups } = await supabase
      .from('supindas')
      .select('id, numero, data')
      .order('numero', { ascending: false })
      .limit(10)
    if (sups) setSupindas(sups)
  }

  // Ativar PV - abre modal
  function abrirAtivarModal(contrato: Contrato) {
    setAtivarContrato(contrato)
    // Preenche com data/hora atual
    const agora = new Date()
    const dataStr = agora.toISOString().split('T')[0]
    const horaStr = agora.toTimeString().slice(0, 5)
    setAtivarForm({
      data_acolhimento: dataStr,
      hora_acolhimento: horaStr,
      local_coleta: 'Residência',
      clinica_coleta: '',
      numero_lacre: '',
      funcionario_id: '',
      supinda_id: '',
    })
    // Carrega funcionários e supindas se ainda não carregou
    if (funcionarios.length === 0 || supindas.length === 0) {
      carregarDadosAtivacao()
    }
    setAtivarModal(true)
  }

  // Ativar PV - subtrai tempo
  function subtrairTempo(tipo: 'dia' | 'hora') {
    const dataHora = new Date(`${ativarForm.data_acolhimento}T${ativarForm.hora_acolhimento}:00`)
    if (tipo === 'dia') {
      dataHora.setDate(dataHora.getDate() - 1)
    } else {
      dataHora.setHours(dataHora.getHours() - 1)
    }
    const dataStr = dataHora.toISOString().split('T')[0]
    const horaStr = dataHora.toTimeString().slice(0, 5)
    setAtivarForm({ ...ativarForm, data_acolhimento: dataStr, hora_acolhimento: horaStr })
  }

  // Ativar PV - salva e muda status
  async function salvarAtivacao() {
    if (!ativarContrato) return
    if (!ativarForm.data_acolhimento || !ativarForm.hora_acolhimento) {
      alert('Preencha a data e hora do acolhimento')
      return
    }

    setSalvandoAtivacao(true)

    try {
      // Combina data + hora em ISO
      const dataHora = new Date(`${ativarForm.data_acolhimento}T${ativarForm.hora_acolhimento}:00`)

      const { error } = await supabase
        .from('contratos')
        .update({
          status: 'ativo',
          data_acolhimento: dataHora.toISOString(),
          local_coleta: ativarForm.local_coleta,
          clinica_coleta: ativarForm.local_coleta === 'Clínica' ? ativarForm.clinica_coleta : null,
          numero_lacre: ativarForm.numero_lacre || null,
          funcionario_id: ativarForm.funcionario_id || null,
          supinda_id: ativarForm.supinda_id || null,
        } as never)
        .eq('id', ativarContrato.id)

      if (error) throw error

      // Atualiza lista local
      setContratos(prev => prev.map(c =>
        c.id === ativarContrato.id
          ? { ...c, status: 'ativo', data_acolhimento: dataHora.toISOString(), local_coleta: ativarForm.local_coleta, numero_lacre: ativarForm.numero_lacre || null }
          : c
      ))

      // Atualiza contadores
      setStatusCounts(prev => ({
        ...prev,
        preventivo: (prev.preventivo || 0) - 1,
        ativo: (prev.ativo || 0) + 1,
      }))

      setAtivarModal(false)
    } catch (err) {
      console.error('Erro ao ativar contrato:', err)
      alert('Erro ao ativar contrato')
    } finally {
      setSalvandoAtivacao(false)
    }
  }

  // Marcar Entregue - abre modal
  function abrirEntregaModal(contrato: Contrato) {
    setEntregaContrato(contrato)
    setEntregaForm({ dataHoje: true, data_entrega: '' })
    setEntregaModal(true)
  }

  // Marcar Entregue - salva e muda status para finalizado
  async function marcarEntregue() {
    if (!entregaContrato) return

    const dataEntrega = entregaForm.dataHoje
      ? new Date().toISOString().split('T')[0]
      : entregaForm.data_entrega

    if (!dataEntrega) {
      alert('Selecione a data de entrega')
      return
    }

    setSalvandoEntrega(true)

    try {
      const { error } = await supabase
        .from('contratos')
        .update({
          status: 'finalizado',
          data_entrega: dataEntrega,
        } as never)
        .eq('id', entregaContrato.id)

      if (error) throw error

      // Atualiza lista local
      const statusAnterior = entregaContrato.status
      if (statusFiltro && statusFiltro !== 'finalizado') {
        // Remove da lista porque não pertence mais a este filtro
        setContratos(prev => prev.filter(c => c.id !== entregaContrato.id))
        setTotal(prev => Math.max(0, prev - 1))
      } else {
        // Sem filtro ou filtro finalizado: atualiza in-place
        setContratos(prev => prev.map(c =>
          c.id === entregaContrato.id
            ? { ...c, status: 'finalizado', data_entrega: dataEntrega }
            : c
        ))
      }

      // Atualiza contadores
      setStatusCounts(prev => ({
        ...prev,
        [statusAnterior]: Math.max(0, (prev[statusAnterior] || 0) - 1),
        finalizado: (prev.finalizado || 0) + 1,
      }))

      setEntregaModal(false)
    } catch (err) {
      console.error('Erro ao marcar entregue:', err)
      alert('Erro ao marcar entregue')
    } finally {
      setSalvandoEntrega(false)
    }
  }

  // Urna - carrega lista de urnas
  async function carregarUrnas() {
    const { data } = await supabase
      .from('produtos')
      .select('id, codigo, nome, tipo, categoria, preco, estoque_atual, imagem_url, estoque_infinito')
      .eq('tipo', 'urna')
      .eq('ativo', true)
      .order('nome')

    if (data) setUrnas(data as Produto[])
  }

  // Urna - abre modal (com prompt se já tem urna)
  function abrirUrnaModal(contrato: Contrato) {
    highlightContrato(contrato.id)
    setUrnaContrato(contrato)
    setBuscaUrna('')
    setFiltroUrnaCategoria('')
    setUrnaSelecionada(null)
    setUrnaModoEdicao(false)

    // Verificar se já tem urna em contrato_produtos
    const urnasExistentes = contrato.contrato_produtos?.filter(cp => cp.produto?.tipo === 'urna') || []
    const temUrna = urnasExistentes.length > 0

    // Se já tem urna definida, mostra prompt
    if (temUrna) {
      setUrnaPrompt(true)
    } else {
      // Abre direto o modal de seleção
      setUrnaModal(true)
      if (urnas.length === 0) carregarUrnas()
    }
  }

  // Urna - ação do prompt
  function urnaPromptAcao(acao: 'adicionar' | 'editar') {
    setUrnaPrompt(false)
    setUrnaModoEdicao(acao === 'editar')
    setUrnaModal(true)
    if (urnas.length === 0) carregarUrnas()
  }

  // Urna - salva seleção
  async function salvarUrna() {
    if (!urnaContrato || !urnaSelecionada) return
    setSalvandoUrna(true)

    try {
      // Buscar urnas existentes no contrato
      const urnasExistentes = urnaContrato.contrato_produtos?.filter(cp => cp.produto?.tipo === 'urna') || []

      // Se modo edição, remover a última urna adicionada
      if (urnaModoEdicao && urnasExistentes.length > 0) {
        const ultimaUrna = urnasExistentes[urnasExistentes.length - 1]
        // Remover registro de contrato_produtos
        await supabase
          .from('contrato_produtos')
          .delete()
          .eq('contrato_id', urnaContrato.id)
          .eq('produto_id', ultimaUrna.produto_id)

        // Creditar estoque da urna removida
        await ajustarEstoquePorCodigo(ultimaUrna.produto?.nome || '', +1) // fallback pelo nome se não tiver código
      }

      // Verificar se já existe registro para a nova urna
      const { data: existente } = await supabase
        .from('contrato_produtos')
        .select('id')
        .eq('contrato_id', urnaContrato.id)
        .eq('produto_id', urnaSelecionada.id)
        .maybeSingle()

      if (!existente) {
        // Calcular valor com preço custom e desconto
        const precoOriginal = urnaSelecionada.preco || 0
        const precoBase = typeof urnaPrecoForm.precoCustom === 'number' ? urnaPrecoForm.precoCustom : precoOriginal
        let descontoUnit = 0
        if (urnaPrecoForm.descontoTipo === 'percent' && urnaPrecoForm.descontoPercent) {
          descontoUnit = precoBase * (Number(urnaPrecoForm.descontoPercent) / 100)
        } else if (urnaPrecoForm.descontoTipo === 'valor' && urnaPrecoForm.descontoValor) {
          descontoUnit = Number(urnaPrecoForm.descontoValor)
        }
        const valorFinal = Math.max(0, precoBase - descontoUnit)

        // Inserir novo registro em contrato_produtos
        await supabase
          .from('contrato_produtos')
          .insert({
            contrato_id: urnaContrato.id,
            produto_id: urnaSelecionada.id,
            quantidade: 1,
            valor: valorFinal,
          } as never)

        // Debitar estoque da nova urna
        await ajustarEstoque(urnaSelecionada.id, -1, urnaSelecionada.estoque_infinito)
      }

      // Atualiza contrato_produtos na lista local
      const novoProduto: ContratoProduto = {
        id: `temp-${urnaSelecionada.codigo}`, // ID temporário usando código do produto
        produto_id: urnaSelecionada.id,
        quantidade: 1,
        foto_recebida: false,
        separado: false,
        rescaldo_feito: false,
        produto: {
          codigo: urnaSelecionada.codigo,
          nome: urnaSelecionada.nome,
          tipo: 'urna',
          precisa_foto: urnaSelecionada.precisa_foto || false,
          imagem_url: urnaSelecionada.imagem_url || null,
          rescaldo_tipo: null,
        }
      }

      setContratos(contratos.map(c => {
        if (c.id !== urnaContrato.id) return c

        let novosProdutos = c.contrato_produtos || []
        if (urnaModoEdicao && novosProdutos.length > 0) {
          // Remove última urna e adiciona nova
          const urnasAnteriores = novosProdutos.filter(cp => cp.produto?.tipo === 'urna')
          if (urnasAnteriores.length > 0) {
            const ultimaUrnaId = urnasAnteriores[urnasAnteriores.length - 1].produto_id
            novosProdutos = novosProdutos.filter(cp => cp.produto_id !== ultimaUrnaId)
          }
        }
        novosProdutos = [...novosProdutos, novoProduto]

        return { ...c, contrato_produtos: novosProdutos }
      }))

      setUrnaModal(false)
      unhighlightContrato()
    } catch (err) {
      console.error('Erro ao salvar urna:', err)
      alert('Erro ao salvar. Tente novamente.')
    }

    setSalvandoUrna(false)
  }

  // Urna - categorias disponíveis
  const categoriasUrnasModal = [...new Set(
    urnas.filter(u => u.categoria).map(u => u.categoria!)
  )].sort()

  // Urna - filtro de busca e categoria
  const urnasFiltradas = urnas.filter(u => {
    const matchBusca = u.nome.toLowerCase().includes(buscaUrna.toLowerCase()) ||
      u.codigo.toLowerCase().includes(buscaUrna.toLowerCase())
    const matchCategoria = !filtroUrnaCategoria || u.categoria === filtroUrnaCategoria
    return matchBusca && matchCategoria
  })

  // Urna - helper para imagem
  function getImagemUrna(codigo: string) {
    return `/estoque/${codigo}.png`
  }

  // ==================== SUPINDA ====================

  // Carregar supindas disponíveis (planejadas)
  async function carregarSupindasDisponiveis() {
    const { data } = await supabase
      .from('supindas')
      .select('id, numero, data, responsavel, status, quantidade_pets, peso_total')
      .or('status.eq.planejada,status.is.null')
      .order('data', { ascending: true })

    if (data) setSupindasDisponiveis(data as Supinda[])
  }

  // Abre modal de seleção de supinda
  function abrirSupindaModal(contrato: Contrato) {
    setSupindaContrato(contrato)
    setSupindaSelecionada(contrato.supinda_id || '')
    setCriarNovaSupinda(false)
    setNovaSupindaForm({ data: '', responsavel: '' })
    setSupindaModal(true)
    carregarSupindasDisponiveis()
  }

  // Calcula próximo número de supinda
  async function getProximoNumeroSupinda(): Promise<number> {
    const { data } = await supabase
      .from('supindas')
      .select('numero')
      .order('numero', { ascending: false })
      .limit(1)
      .single()

    const resultado = data as { numero: number } | null
    return (resultado?.numero || 0) + 1
  }

  // Calcula próximos sábado e domingo
  function getProximoFimDeSemana() {
    const hoje = new Date()
    const diaSemana = hoje.getDay() // 0=domingo, 6=sábado

    // Próximo sábado
    const diasAteSabado = diaSemana === 6 ? 7 : (6 - diaSemana)
    const proxSabado = new Date(hoje)
    proxSabado.setDate(hoje.getDate() + diasAteSabado)

    // Próximo domingo
    const diasAteDomingo = diaSemana === 0 ? 7 : (7 - diaSemana)
    const proxDomingo = new Date(hoje)
    proxDomingo.setDate(hoje.getDate() + diasAteDomingo)

    return {
      sabado: proxSabado.toISOString().split('T')[0],
      domingo: proxDomingo.toISOString().split('T')[0],
      hoje: hoje.toISOString().split('T')[0],
    }
  }

  // Salva supinda selecionada ou cria nova
  async function salvarSupinda() {
    if (!supindaContrato) return
    setSalvandoSupinda(true)

    try {
      let supindaIdFinal: string | null = supindaSelecionada || null

      // Se está criando nova supinda
      if (criarNovaSupinda && novaSupindaForm.data) {
        const proximoNumero = await getProximoNumeroSupinda()

        const { data: novaSupinda, error: erroCriar } = await supabase
          .from('supindas')
          .insert({
            numero: proximoNumero,
            data: novaSupindaForm.data,
            responsavel: novaSupindaForm.responsavel || null,
            status: 'planejada',
            quantidade_pets: 1,
            peso_total: supindaContrato.pet_peso || 0,
          } as never)
          .select('id')
          .single()

        if (erroCriar) throw erroCriar
        const supindaCriada = novaSupinda as { id: string } | null
        supindaIdFinal = supindaCriada?.id || null
      }

      // Atualizar contrato com supinda_id
      const { error: erroUpdate } = await supabase
        .from('contratos')
        .update({ supinda_id: supindaIdFinal } as never)
        .eq('id', supindaContrato.id)

      if (erroUpdate) throw erroUpdate

      // Recalcular estatísticas da supinda (se não for null)
      if (supindaIdFinal) {
        await recalcularEstatisticasSupinda(supindaIdFinal)
      }

      // Se tinha outra supinda antes, recalcular a anterior também
      if (supindaContrato.supinda_id && supindaContrato.supinda_id !== supindaIdFinal) {
        await recalcularEstatisticasSupinda(supindaContrato.supinda_id)
      }

      // Atualizar lista local com a nova supinda
      if (supindaIdFinal) {
        // Buscar dados completos da supinda
        const { data: supindaAtualizada } = await supabase
          .from('supindas')
          .select('id, numero, data, responsavel, status, quantidade_pets, peso_total')
          .eq('id', supindaIdFinal)
          .single()

        const supindaData = supindaAtualizada as Supinda | null
        setContratos(contratos.map(c => {
          if (c.id !== supindaContrato.id) return c
          return {
            ...c,
            supinda_id: supindaIdFinal,
            supinda: supindaData,
          }
        }))
      } else {
        // Removeu supinda
        setContratos(contratos.map(c => {
          if (c.id !== supindaContrato.id) return c
          return { ...c, supinda_id: null, supinda: null }
        }))
      }

      setSupindaModal(false)
    } catch (err) {
      console.error('Erro ao salvar supinda:', err)
      alert('Erro ao salvar. Tente novamente.')
    }

    setSalvandoSupinda(false)
  }

  // Recalcula quantidade de pets e peso total de uma supinda
  async function recalcularEstatisticasSupinda(supindaId: string) {
    const { data: contratosSupinda } = await supabase
      .from('contratos')
      .select('pet_peso')
      .eq('supinda_id', supindaId)

    const contratos = contratosSupinda as { pet_peso: number | null }[] | null
    if (contratos) {
      const quantidade = contratos.length
      const pesoTotal = contratos.reduce((acc, c) => acc + (c.pet_peso || 0), 0)

      await supabase
        .from('supindas')
        .update({
          quantidade_pets: quantidade,
          peso_total: pesoTotal,
        } as never)
        .eq('id', supindaId)
    }
  }

  // Remove supinda do contrato
  async function removerSupinda() {
    if (!supindaContrato) return
    setSalvandoSupinda(true)

    try {
      const supindaAnterior = supindaContrato.supinda_id

      await supabase
        .from('contratos')
        .update({ supinda_id: null } as never)
        .eq('id', supindaContrato.id)

      // Recalcular estatísticas da supinda anterior
      if (supindaAnterior) {
        await recalcularEstatisticasSupinda(supindaAnterior)
      }

      // Atualizar lista local
      setContratos(contratos.map(c => {
        if (c.id !== supindaContrato.id) return c
        return { ...c, supinda_id: null, supinda: null }
      }))

      setSupindaModal(false)
    } catch (err) {
      console.error('Erro ao remover supinda:', err)
      alert('Erro ao remover. Tente novamente.')
    }

    setSalvandoSupinda(false)
  }

  // === RESCALDOS (via contrato_produtos) ===

  function abrirRescaldoModal(contrato: Contrato) {
    highlightContrato(contrato.id)
    setRescaldoContrato(contrato)
    setBuscaRescaldo('')
    setRescaldoModal(true)
  }

  async function adicionarProdutoRescaldo(produto: typeof produtosRescaldo[0]) {
    if (!rescaldoContrato) return
    setSalvandoRescaldo(true)

    const { data, error } = await supabase
      .from('contrato_produtos')
      .insert({
        contrato_id: rescaldoContrato.id,
        produto_id: produto.id,
        quantidade: 1,
        valor: produto.preco || 0,
        rescaldo_feito: false,
      } as never)
      .select('id, produto_id, quantidade, foto_recebida, separado, rescaldo_feito, produto:produtos(codigo, nome, tipo, precisa_foto, imagem_url, rescaldo_tipo)')
      .single()

    if (!error && data) {
      const novoProduto = data as ContratoProduto
      // Debitar estoque
      await ajustarEstoquePorCodigo(produto.codigo, -1)
      // Atualizar estado local
      setContratos(prev => prev.map(c => {
        if (c.id !== rescaldoContrato.id) return c
        return { ...c, contrato_produtos: [...(c.contrato_produtos || []), novoProduto] }
      }))
      setRescaldoContrato(prev => {
        if (!prev) return prev
        return { ...prev, contrato_produtos: [...(prev.contrato_produtos || []), novoProduto] }
      })
    } else {
      alert('Erro ao adicionar produto de rescaldo')
    }

    setSalvandoRescaldo(false)
  }

  async function toggleRescaldoFeito(cpId: string, novoValor: boolean) {
    if (!rescaldoContrato) return

    const { error } = await supabase
      .from('contrato_produtos')
      .update({ rescaldo_feito: novoValor } as never)
      .eq('id', cpId)

    if (!error) {
      const atualizarProdutos = (prods?: ContratoProduto[]) =>
        prods?.map(cp => cp.id === cpId ? { ...cp, rescaldo_feito: novoValor } : cp)

      setContratos(prev => prev.map(c => {
        if (c.id !== rescaldoContrato.id) return c
        return { ...c, contrato_produtos: atualizarProdutos(c.contrato_produtos) }
      }))
      setRescaldoContrato(prev => {
        if (!prev) return prev
        return { ...prev, contrato_produtos: atualizarProdutos(prev.contrato_produtos) }
      })
    }
  }

  async function removerProdutoRescaldo(cpId: string, produtoId: string) {
    if (!rescaldoContrato) return

    const { error } = await supabase
      .from('contrato_produtos')
      .delete()
      .eq('id', cpId)

    if (!error) {
      // Creditar estoque
      await ajustarEstoque(produtoId, 1)
      const filtrar = (prods?: ContratoProduto[]) =>
        prods?.filter(cp => cp.id !== cpId)

      setContratos(prev => prev.map(c => {
        if (c.id !== rescaldoContrato.id) return c
        return { ...c, contrato_produtos: filtrar(c.contrato_produtos) }
      }))
      setRescaldoContrato(prev => {
        if (!prev) return prev
        return { ...prev, contrato_produtos: filtrar(prev.contrato_produtos) }
      })
    }
  }

  const totalPaginas = Math.ceil(total / POR_PAGINA)

  return (
    <div className="animate-fade-in">
      {/* Sticky Toolbar — theme-invariant (always dark slate) */}
      <div className="theme-sidebar sticky top-14 md:top-0 z-20 -mx-4 px-4 md:-mx-6 md:px-6 pb-1 pt-1.5 md:pt-1 bg-slate-900 border-b border-slate-700/50 shadow-lg space-y-1">

      {/* Search + Sort/Group */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 md:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder={campoBusca === 'todos' ? 'Buscar pet, tutor, código...'
              : campoBusca === 'pet' ? 'Pet...'
              : campoBusca === 'tutor' ? 'Tutor...'
              : campoBusca === 'codigo' ? 'Código...'
              : 'Lacre...'}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full h-8 pl-8 pr-8 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 outline-none transition-colors"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select
          value={campoBusca}
          onChange={(e) => { setCampoBusca(e.target.value as typeof campoBusca); setPagina(0) }}
          className="h-8 px-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 outline-none focus:border-purple-500 cursor-pointer"
        >
          <option value="todos">Todos</option>
          <option value="pet">Pet</option>
          <option value="tutor">Tutor</option>
          <option value="codigo">Código</option>
          <option value="lacre">Lacre</option>
        </select>
        {/* Sort/Group — desktop inline */}
        <div className="hidden md:flex items-center gap-1.5 ml-auto">
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => {
                if (ordenacao === 'data') { setOrdemAsc(!ordemAsc) } else { setOrdenacao('data'); setOrdemAsc(true) }
                setPagina(0)
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                ordenacao === 'data' ? 'bg-slate-700 text-purple-300' : 'text-slate-400 hover:text-slate-200'
              }`}
              title={ordenacao === 'data' ? (ordemAsc ? 'Antigo → Novo' : 'Novo → Antigo') : 'Ordenar por data'}
            >
              🕐 {ordenacao === 'data' && (ordemAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
            </button>
            <button
              onClick={() => {
                if (ordenacao === 'nome') { setOrdemAsc(!ordemAsc) } else { setOrdenacao('nome'); setOrdemAsc(true) }
                setPagina(0)
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                ordenacao === 'nome' ? 'bg-slate-700 text-purple-300' : 'text-slate-400 hover:text-slate-200'
              }`}
              title={ordenacao === 'nome' ? (ordemAsc ? 'A → Z' : 'Z → A') : 'Ordenar por nome'}
            >
              {ordemAsc || ordenacao !== 'nome' ? 'A→Z' : 'Z→A'} {ordenacao === 'nome' && (ordemAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
            </button>
          </div>
          {!(statusFiltro === 'retorno' && montagemInline) && (
            <button
              onClick={() => { setAgruparCidade(!agruparCidade); if (agruparCidade) setAgruparBairro(false) }}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                agruparCidade ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              📍 Cidade
            </button>
          )}
          {agruparCidade && !(statusFiltro === 'retorno' && montagemInline) && (
            <button
              onClick={() => setAgruparBairro(!agruparBairro)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                agruparBairro ? 'bg-purple-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              🏘️ Bairro
            </button>
          )}
        </div>
      </div>

      {/* Pipeline — compact single-line */}
      <div className="overflow-x-auto scrollbar-hide">
        <div className="flex gap-1">
          {STATUS_FLOW.map((status) => {
            const isActive = statusFiltro === status.key
            const count = statusCounts[status.key] || 0
            const colors = STATUS_COLORS[status.key]

            return (
              <button
                key={status.key}
                onClick={() => toggleStatus(status.key)}
                className={`
                  transition-all duration-200 border-2 whitespace-nowrap
                  flex items-center justify-center gap-1 px-2 py-1 rounded-lg flex-1 md:flex-shrink-0 md:px-3
                  ${isActive
                    ? `${colors.activeBg} border-white/40 ${colors.activeGlow} scale-105 z-10 ring-2 ring-white/20`
                    : `${colors.bg} border-transparent opacity-60 hover:opacity-90`
                  }
                `}
              >
                <span className="text-xs md:text-sm">{status.icon}</span>
                <span className="text-white text-[10px] md:text-xs font-semibold hidden md:inline">{status.label}</span>
                <span className="text-white text-[10px] md:hidden font-semibold">{status.short}</span>
                <span className="text-white font-black tabular-nums text-[11px] md:text-xs">{count}</span>
              </button>
            )
          })}
        </div>

        {/* Montagem filter — Retorno only */}
        {statusFiltro === 'retorno' && (() => {
          const countFacil = contratos.filter(c => isFacilMontar(c)).length
          const countDificil = contratos.length - countFacil
          return (
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span className="text-xs text-slate-400">Montagem:</span>
              <div className="flex items-center bg-slate-800 rounded-lg p-0.5 gap-0.5">
                <button
                  onClick={() => setFiltroMontagem('todos')}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                    filtroMontagem === 'todos' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Todos ({contratos.length})
                </button>
                <button
                  onClick={() => setFiltroMontagem('facil')}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
                    filtroMontagem === 'facil' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  🟢 Fácil ({countFacil})
                </button>
                <button
                  onClick={() => setFiltroMontagem('dificil')}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
                    filtroMontagem === 'dificil' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  🟠 Difícil ({countDificil})
                </button>
              </div>
              <div className="hidden md:block w-px h-4 bg-slate-600"></div>
              <button
                onClick={() => { setMontagemInline(!montagemInline); setCategoriaExpandida(null) }}
                className={`px-2 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                  montagemInline ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                📦 In-line
              </button>
            </div>
          )
        })()}
      </div>

      {/* Ordenação e Controles */}
      <div className="flex flex-col gap-1">
        {/* Montagem In-line (só retorno) */}
        {statusFiltro === 'retorno' && montagemInline && (
          <div className="flex-1">
            {(() => {
              // Função para categorizar produtos por código
              const categorizarProduto = (nome: string, codigo: string, tipo: string, precisaFoto: boolean): string => {
                // Certificado (0005) e Protocolo (0006)
                if (codigo === '0005') return 'certificados'
                if (codigo === '0006') return 'protocolos'
                // Pelinhos: 0004 = Pelinho, 0007 = Pelo Extra
                if (codigo === '0004' || codigo === '0007') return 'pelinhos'
                // Rescaldos: 0003 = Molde, 0002 = Nenhum Rescaldo, 1407 = Carimbo
                if (codigo === '0003' || codigo === '0002' || codigo === '1407') return 'rescaldos'
                // Urnas - usa o tipo do produto
                if (tipo === 'urna') return 'urnas'
                // Porta-retratos: acessório com precisa_foto = true
                if (tipo === 'acessorio' && precisaFoto) return 'porta-retratos'
                // Pingentes: acessório com precisa_foto = false e nome contém Ping/Chavei/P/ Visor
                const nomeLower = nome.toLowerCase()
                if (tipo === 'acessorio' && !precisaFoto && (nomeLower.includes('ping') || nomeLower.includes('chavei') || nomeLower.includes('p/ visor'))) return 'pingentes'
                // Outros
                return 'outros'
              }

              // Contratos do retorno para análise
              const contratosRetorno = contratos.filter(c => c.status === 'retorno')

              // Categorias com contagem
              const categorias = [
                { id: 'certificados', icon: '📜', label: 'Certificados', cor: 'blue' },
                { id: 'protocolos', icon: '📋', label: 'Protocolos', cor: 'slate' },
                { id: 'pelinhos', icon: '🫙', label: 'Pelinhos', cor: 'amber' },
                { id: 'rescaldos', icon: '🐾', label: 'Rescaldos', cor: 'orange' },
                { id: 'urnas', icon: '⚱️', label: 'Urnas', cor: 'purple' },
                { id: 'porta-retratos', icon: '🖼️', label: 'C/ Foto', cor: 'pink' },
                { id: 'pingentes', icon: '💎', label: 'Pingentes', cor: 'emerald' },
                { id: 'outros', icon: '📦', label: 'Outros', cor: 'gray' },
              ]

              // Calcular contagem por categoria
              const contagemPorCategoria: Record<string, { total: number; pendentes: number; contratos: string[] }> = {}
              categorias.forEach(cat => {
                contagemPorCategoria[cat.id] = { total: 0, pendentes: 0, contratos: [] }
              })

              contratosRetorno.forEach(contrato => {
                // Produtos do contrato (todos os produtos vêm da tabela contrato_produtos)
                contrato.contrato_produtos?.forEach(cp => {
                  if (!cp.produto) return
                  const cat = categorizarProduto(cp.produto.nome, cp.produto.codigo, cp.produto.tipo, cp.produto.precisa_foto)
                  if (!contagemPorCategoria[cat].contratos.includes(contrato.id)) {
                    contagemPorCategoria[cat].contratos.push(contrato.id)
                  }
                  contagemPorCategoria[cat].total += cp.quantidade
                  if (!cp.separado) contagemPorCategoria[cat].pendentes += cp.quantidade
                })
              })

              // Categoria ativa
              const catAtiva = categorias.find(c => c.id === categoriaExpandida)

              // Retorna só os botões de categorias (card expandido fica fora)
              return (
                <div className="flex flex-wrap gap-1.5">
                  {categorias.map(cat => {
                    const dados = contagemPorCategoria[cat.id]
                    if (dados.total === 0) return null
                    const isExpandido = categoriaExpandida === cat.id
                    const todasSeparadas = dados.pendentes === 0

                    return (
                      <button
                        key={cat.id}
                        onClick={() => setCategoriaExpandida(isExpandido ? null : cat.id)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all text-xs ${
                          isExpandido
                            ? 'bg-purple-900/40 border-purple-500 text-purple-300'
                            : todasSeparadas
                              ? 'bg-green-900/30 border-green-700 text-green-300'
                              : 'bg-slate-800 border-slate-600 hover:border-slate-500 text-slate-300'
                        }`}
                      >
                        <span>{cat.icon}</span>
                        <span className="font-medium">{cat.label}</span>
                        <span className={`font-bold ${todasSeparadas ? 'text-green-500' : 'text-orange-400'}`}>
                          {todasSeparadas ? '✓' : `${dados.pendentes}/${dados.total}`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )}

        {/* Sort/Group — mobile only (desktop inline with search) */}
        <div className="flex md:hidden gap-2 items-center overflow-x-auto scrollbar-hide">
          {/* Ordenação */}
          <div className="flex items-center gap-1 bg-slate-700 rounded-lg p-1 flex-shrink-0">
            <button
              onClick={() => {
                if (ordenacao === 'data') {
                  setOrdemAsc(!ordemAsc)
                } else {
                  setOrdenacao('data')
                  setOrdemAsc(true)
                }
                setPagina(0)
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                ordenacao === 'data'
                  ? 'bg-slate-700 text-purple-300 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={ordenacao === 'data' ? (ordemAsc ? 'Antigo → Novo' : 'Novo → Antigo') : 'Ordenar por data'}
            >
              🕐 {ordenacao === 'data' && (ordemAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
            </button>
            <button
              onClick={() => {
                if (ordenacao === 'nome') {
                  setOrdemAsc(!ordemAsc)
                } else {
                  setOrdenacao('nome')
                  setOrdemAsc(true)
                }
                setPagina(0)
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                ordenacao === 'nome'
                  ? 'bg-slate-700 text-purple-300 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={ordenacao === 'nome' ? (ordemAsc ? 'A → Z' : 'Z → A') : 'Ordenar por nome'}
            >
              {ordemAsc || ordenacao !== 'nome' ? 'A→Z' : 'Z→A'} {ordenacao === 'nome' && (ordemAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
            </button>
          </div>

          {/* Agrupar por cidade (esconde quando inline ativo) */}
          {!(statusFiltro === 'retorno' && montagemInline) && (
            <button
              onClick={() => {
                setAgruparCidade(!agruparCidade)
                if (agruparCidade) setAgruparBairro(false) // Desativa bairro ao desativar cidade
              }}
              className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                agruparCidade
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title={agruparCidade ? 'Desagrupar' : 'Agrupar por cidade'}
            >
              📍 Cidade
            </button>
          )}

          {/* Agrupar por bairro (só aparece se cidade estiver ativa e inline não ativo) */}
          {agruparCidade && !(statusFiltro === 'retorno' && montagemInline) && (
            <button
              onClick={() => setAgruparBairro(!agruparBairro)}
              className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                agruparBairro
                  ? 'bg-purple-500 text-white'
                  : 'bg-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title={agruparBairro ? 'Desagrupar bairros' : 'Agrupar por bairro'}
            >
              🏘️ Bairro
            </button>
          )}
        </div>
      </div>

      </div>{/* /Sticky Toolbar */}

      {/* Card expandido da categoria (Montagem In-line) */}
      {statusFiltro === 'retorno' && montagemInline && categoriaExpandida && (() => {
        // Função para categorizar produtos por código
        const categorizarProduto = (nome: string, codigo: string, tipo: string, precisaFoto: boolean): string => {
          if (codigo === '0005') return 'certificados'
          if (codigo === '0006') return 'protocolos'
          if (codigo === '0004' || codigo === '0007') return 'pelinhos'
          if (codigo === '0003' || codigo === '0002' || codigo === '1407') return 'rescaldos'
          if (tipo === 'urna') return 'urnas'
          if (tipo === 'acessorio' && precisaFoto) return 'porta-retratos'
          const nomeLower = nome.toLowerCase()
          if (tipo === 'acessorio' && !precisaFoto && (nomeLower.includes('ping') || nomeLower.includes('chavei') || nomeLower.includes('p/ visor'))) return 'pingentes'
          return 'outros'
        }

        const categorias = [
          { id: 'certificados', icon: '📜', label: 'Certificados' },
          { id: 'protocolos', icon: '📋', label: 'Protocolos' },
          { id: 'pelinhos', icon: '🫙', label: 'Pelinhos' },
          { id: 'rescaldos', icon: '🐾', label: 'Rescaldos' },
          { id: 'urnas', icon: '⚱️', label: 'Urnas' },
          { id: 'porta-retratos', icon: '🖼️', label: 'C/ Foto' },
          { id: 'pingentes', icon: '💎', label: 'Pingentes' },
          { id: 'outros', icon: '📦', label: 'Outros' },
        ]
        const catAtiva = categorias.find(c => c.id === categoriaExpandida)
        const contratosRetorno = contratos.filter(c => c.status === 'retorno')

        // Calcular contagem
        let totalCat = 0
        let pendentesCat = 0
        contratosRetorno.forEach(c => {
          c.contrato_produtos?.forEach(cp => {
            if (!cp.produto) return
            if (categorizarProduto(cp.produto.nome, cp.produto.codigo, cp.produto.tipo, cp.produto.precisa_foto) === categoriaExpandida) {
              totalCat += cp.quantidade
              if (!cp.separado) pendentesCat += cp.quantidade
            }
          })
        })

        // Coletar todos os produtos da categoria para o grid
        const todosItens: Array<{ cp: ContratoProduto; contrato: Contrato }> = []
        contratosRetorno.forEach(contrato => {
          contrato.contrato_produtos?.forEach(cp => {
            if (!cp.produto) return
            if (categorizarProduto(cp.produto.nome, cp.produto.codigo, cp.produto.tipo, cp.produto.precisa_foto) === categoriaExpandida) {
              todosItens.push({ cp, contrato })
            }
          })
        })

        return (
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border-2 border-purple-700 p-6 shadow-lg mb-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-purple-900/40 flex items-center justify-center">
                  <span className="text-3xl">{catAtiva?.icon}</span>
                </div>
                <div>
                  <h3 className="font-bold text-xl text-slate-200">{catAtiva?.label}</h3>
                  <p className="text-sm text-slate-400">
                    {pendentesCat === 0 ? (
                      <span className="text-green-400 font-medium">✓ Tudo separado!</span>
                    ) : (
                      <span><span className="text-orange-400 font-bold">{pendentesCat}</span> pendentes de {totalCat}</span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => separarTodosCategoria(categoriaExpandida, contratosRetorno)}
                disabled={pendentesCat === 0}
                className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold rounded-xl hover:from-green-600 hover:to-green-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg disabled:shadow-none"
              >
                <span className="text-xl">✓</span>
                Separar Tudo
              </button>
            </div>

            {/* Grid de produtos */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 max-h-[60vh] overflow-y-auto p-1">
              {todosItens.map(({ cp, contrato }) => (
                <div
                  key={cp.id}
                  onClick={() => toggleSeparadoInline(cp.id, contrato.id, cp.separado)}
                  className={`relative cursor-pointer rounded-xl overflow-hidden transition-all duration-200 ${
                    cp.separado
                      ? 'ring-4 ring-green-400 shadow-lg scale-[0.98] opacity-60'
                      : 'ring-2 ring-slate-600 hover:ring-purple-400 hover:shadow-xl hover:scale-[1.02]'
                  }`}
                >
                  {/* Foto do produto */}
                  <div className="aspect-square bg-slate-700 relative">
                    {cp.produto?.imagem_url ? (
                      <img
                        src={cp.produto.imagem_url}
                        alt={cp.produto.nome}
                        className="w-full h-full object-contain p-2"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/placeholder-produto.png'
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl text-slate-300">
                        {catAtiva?.icon}
                      </div>
                    )}

                    {/* Badge de separado */}
                    {cp.separado && (
                      <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                        <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
                          <span className="text-white text-3xl">✓</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Info do pet/produto */}
                  <div className={`p-3 ${cp.separado ? 'bg-green-900/30' : 'bg-slate-700'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-white bg-blue-700 px-1 py-0 rounded">
                        {contrato.numero_lacre || '-'}
                      </span>
                      <span className="text-sm font-bold truncate flex-1" style={{ background: 'linear-gradient(90deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', color: contrato.pet_genero === 'macho' ? '#1d4ed8' : '#db2777', padding: '1px 5px', borderRadius: '4px' }}>
                        {contrato.pet_nome}
                        {contrato.pet_genero && <span style={{ marginLeft: '3px', fontSize: '0.7rem' }}>{contrato.pet_genero === 'macho' ? '♂' : '♀'}</span>}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate" title={cp.produto?.nome}>
                      {cp.produto?.nome}
                    </p>
                  </div>

                  {/* Botão de ação no hover */}
                  {!cp.separado && (
                    <div className="absolute top-2 right-2 opacity-0 hover:opacity-100 transition-opacity">
                      <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center shadow-md">
                        <span className="text-sm">+</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Contador visual */}
            {todosItens.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-600 flex items-center justify-center gap-2">
                <div className="flex -space-x-1">
                  {todosItens.slice(0, 10).map((item, i) => (
                    <div
                      key={i}
                      className={`w-6 h-6 rounded-full border-2 border-white ${
                        item.cp.separado ? 'bg-green-400' : 'bg-orange-400'
                      }`}
                    />
                  ))}
                  {todosItens.length > 10 && (
                    <div className="w-6 h-6 rounded-full border-2 border-white bg-slate-500 flex items-center justify-center">
                      <span className="text-[8px] text-white font-bold">+{todosItens.length - 10}</span>
                    </div>
                  )}
                </div>
                <span className="text-sm text-slate-400 ml-2">
                  {todosItens.filter(i => i.cp.separado).length}/{todosItens.length} separados
                </span>
              </div>
            )}
          </div>
        )
      })()}

      {/* Cards de Contratos (esconde quando inline ativo) */}
      {!(statusFiltro === 'retorno' && montagemInline) && (
      <div className="space-y-2">
        {loading ? (
          <div className="bg-slate-800 rounded-lg shadow-sm border p-8 text-center text-slate-400">
            Carregando...
          </div>
        ) : contratos.length === 0 ? (
          <div className="bg-slate-800 rounded-lg shadow-sm border p-8 text-center text-slate-400">
            Nenhum contrato encontrado
          </div>
        ) : (
          (() => {
            // Quando busca ativa, filtrar client-side por status selecionado
            const contratosFiltradosStatus = (buscaDebounced.trim() && statusFiltro)
              ? contratos.filter(c => c.status === statusFiltro)
              : contratos

            // Filtrar por dificuldade de montagem (só na aba Retorno)
            const contratosFiltradosMontagem = statusFiltro === 'retorno' && filtroMontagem !== 'todos'
              ? contratosFiltradosStatus.filter(c => {
                  const facil = isFacilMontar(c)
                  return filtroMontagem === 'facil' ? facil : !facil
                })
              : contratosFiltradosStatus

            // Agrupar por cidade se necessário
            const contratosAgrupados = agruparCidade
              ? contratosFiltradosMontagem.reduce((acc, contrato) => {
                  const cidade = contrato.tutor_cidade || 'Sem cidade'
                  if (!acc[cidade]) acc[cidade] = []
                  acc[cidade].push(contrato)
                  return acc
                }, {} as Record<string, Contrato[]>)
              : { '': contratosFiltradosMontagem }

            const cidades = Object.keys(contratosAgrupados).sort()

            // Função para renderizar um card de contrato
            const renderContrato = (contrato: Contrato) => {
              const dataBox = getDataBox(contrato.data_acolhimento || contrato.data_contrato)
              const petIcon = getPetIcon(contrato.pet_especie, contrato.pet_peso)
              const statusColors = STATUS_COLORS[contrato.status]

              return (
                <div
                  key={contrato.id}
                  data-contrato-id={contrato.id}
                  onClick={() => router.push(`/contratos/${contrato.id}`)}
                  className={`relative overflow-hidden rounded-lg shadow-sm border-2 hover:shadow-md cursor-pointer ${
                    highlightId === contrato.id
                      ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/30'
                      : fadingId === contrato.id
                        ? 'animate-highlight-ring-fade'
                        : ''
                  }`}
                  style={(() => {
                    const isHighlighted = highlightId === contrato.id
                    const isInd = contrato.tipo_cremacao === 'individual'
                    return {
                      background: isInd
                        ? 'linear-gradient(135deg, #10b981 0%, #6ee7b7 30%, transparent 70%)'
                        : 'linear-gradient(135deg, #8b5cf6 0%, #c4b5fd 30%, transparent 70%)',
                      borderColor: isHighlighted ? '#fbbf24' : (isInd ? '#10b981' : '#8b5cf6'),
                      transition: 'border-color 5s ease-out',
                    }
                  })()}
                >
                {/* Overlay do highlight — gradiente forte que vai sumindo */}
                {(highlightId === contrato.id || fadingId === contrato.id) && (
                  <div
                    className={`absolute inset-0 pointer-events-none ${
                      fadingId === contrato.id ? 'animate-highlight-gradient-fade' : ''
                    }`}
                    style={{
                      background: contrato.tipo_cremacao === 'individual'
                        ? 'linear-gradient(135deg, #10b981 0%, #6ee7b7 50%, #a7f3d0 100%)'
                        : 'linear-gradient(135deg, #8b5cf6 0%, #c4b5fd 50%, #ddd6fe 100%)',
                      borderRadius: 'inherit',
                    }}
                  />
                )}
                <div className="p-1.5 relative z-[1]">
                  {/* === DESKTOP LAYOUT === */}
                  <div className="hidden md:flex items-center gap-2">
                    {/* Checkbox de seleção para protocolo batch (retorno/pendente) */}
                    {(statusFiltro === 'retorno' || statusFiltro === 'pendente') && (
                      <div
                        className="flex-shrink-0"
                        onClick={(e) => toggleSelectContrato(contrato.id, e)}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                          selectedContratos.has(contrato.id)
                            ? 'bg-cyan-600 border-cyan-600 text-white'
                            : 'border-slate-500 hover:border-cyan-500'
                        }`}>
                          {selectedContratos.has(contrato.id) && (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Data + Supinda */}
                    {dataBox && (
                      <div className={`flex-shrink-0 w-12 rounded-lg flex flex-col items-center justify-center ${contrato.supinda ? 'h-14' : 'h-12'}`} style={{ background: 'linear-gradient(135deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', color: '#334155' }}>
                        <span className="text-[10px] font-bold leading-none">{dataBox.linha1}</span>
                        <span className="text-[10px] leading-tight" style={{ color: '#94a3b8' }}>{dataBox.linha2}</span>
                        <span className="text-[9px] leading-none" style={{ color: '#64748b' }}>{dataBox.hora}</span>
                        {contrato.supinda && (
                          <span className="text-[9px] font-bold leading-none" style={{ color: '#ea580c' }}>#{contrato.supinda.numero}</span>
                        )}
                      </div>
                    )}

                    {/* Ícone do Pet */}
                    <div className="flex-shrink-0 w-11 h-11 rounded-lg flex flex-col items-center justify-end p-0 pb-0.5 overflow-hidden" style={petIcon.style}>
                      <span className="leading-none" style={{ fontSize: petIcon.emojiSize }}>{petIcon.emoji}</span>
                      <span className="text-[7px] font-bold leading-none flex items-center gap-px">{getPetPorte(contrato.pet_peso) && <span className="font-black mr-0.5">{getPetPorte(contrato.pet_peso)}</span>}{contrato.pet_peso ? <><Weight className="h-2 w-2" />{contrato.pet_peso}</> : '-'}</span>
                    </div>

                    {/* Fonte de conhecimento */}
                    {contrato.fonte_conhecimento?.nome && (
                      <div
                        className="flex-shrink-0 w-10 h-10 rounded-lg flex flex-col items-center justify-center"
                        style={FONTE_ICONS[contrato.fonte_conhecimento.nome]?.style || { background: 'linear-gradient(135deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', border: '1px solid #cbd5e1', color: '#64748b' }}
                        title={contrato.seguradora
                          ? `${contrato.fonte_conhecimento.nome}: ${contrato.seguradora}`
                          : contrato.fonte_conhecimento.nome}
                      >
                        {FONTE_ICONS[contrato.fonte_conhecimento.nome]?.img ? (
                          <img
                            src={FONTE_ICONS[contrato.fonte_conhecimento.nome].img}
                            alt={contrato.fonte_conhecimento.nome}
                            className="w-5 h-5"
                          />
                        ) : (
                          <span className="text-base leading-none">{FONTE_ICONS[contrato.fonte_conhecimento.nome]?.icon || '❓'}</span>
                        )}
                        {contrato.seguradora && (
                          <span className="text-[7px] font-semibold leading-none mt-0.5 whitespace-nowrap" style={{ color: '#4338ca' }}>
                            {contrato.seguradora}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Local de remoção */}
                    {contrato.local_coleta && (
                      <div
                        className="flex-shrink-0 w-16 h-11 rounded-lg flex items-center justify-center text-center px-1"
                        style={{
                          background: 'linear-gradient(135deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)',
                          color: contrato.local_coleta === 'Residência' ? '#1d4ed8' : contrato.local_coleta === 'Unidade' ? '#b45309' : '#7c3aed'
                        }}
                        title={contrato.clinica_coleta || contrato.local_coleta}>
                        <span className="text-[10px] font-medium leading-tight break-words line-clamp-2">
                          {contrato.local_coleta === 'Clínica' && contrato.clinica_coleta
                            ? contrato.clinica_coleta
                            : contrato.local_coleta}
                        </span>
                      </div>
                    )}

                    {/* === TAGS VERDES (à esquerda das infos) === */}
                    <InteractiveTags
                      contrato={contrato}
                      handlers={{
                        pelinho: () => abrirPelinhoModal(contrato),
                        urna: () => abrirUrnaModal(contrato),
                        certificado: () => abrirCertificadoModal(contrato),
                        protocolo: () => abrirProtocoloModal(contrato),
                        rescaldo: () => abrirRescaldoModal(contrato),
                      }}
                      layout="pipeline-desktop-green"
                    />

                    {/* Info principal */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/contratos/${contrato.id}`} className="flex items-center gap-1 hover:opacity-80">
                          {contrato.numero_lacre && (
                            <span className="text-white font-bold bg-blue-700 px-1 py-0 rounded text-base">{String(contrato.numero_lacre).replace(/\.0$/, '')}</span>
                          )}
                          <span className="text-base font-bold" style={{ background: 'linear-gradient(90deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', color: contrato.pet_genero === 'macho' ? '#1d4ed8' : '#db2777', padding: '1px 6px', borderRadius: '4px' }}>
                            {contrato.pet_nome}
                            {contrato.pet_genero && <span style={{ marginLeft: '3px', fontSize: '0.8rem' }}>{contrato.pet_genero === 'macho' ? '♂' : '♀'}</span>}
                          </span>
                        </Link>
                        {(contrato.pet_raca || contrato.pet_cor) && (
                          <span className="text-xs font-medium" style={{ background: 'linear-gradient(90deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', color: '#475569', padding: '1px 5px', borderRadius: '4px' }}>{[contrato.pet_raca, contrato.pet_cor].filter(Boolean).join(' | ')}</span>
                        )}
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          contrato.tipo_cremacao === 'individual'
                            ? 'bg-emerald-500 text-white'
                            : 'bg-violet-500 text-white'
                        }`}>
                          {contrato.tipo_cremacao === 'individual' ? 'IND' : 'COL'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs mt-0.5">
                        {(() => {
                          const { primeiro, resto } = separarPrimeiroNome(contrato.tutor?.nome || contrato.tutor_nome)
                          return (
                            <span style={{ background: 'linear-gradient(90deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', padding: '1px 5px', borderRadius: '4px' }}>
                              <span className="font-bold" style={{ color: '#6d28d9' }}>{primeiro}</span>
                              {resto && <span className="font-normal" style={{ color: '#475569' }}> {resto}</span>}
                            </span>
                          )
                        })()}
                      </div>
                    </div>

                    {/* === TAGS PENDENTES (à direita das infos) === */}
                    <InteractiveTags
                      contrato={contrato}
                      handlers={{
                        pelinho: () => abrirPelinhoModal(contrato),
                        urna: () => abrirUrnaModal(contrato),
                        certificado: () => abrirCertificadoModal(contrato),
                        foto: () => abrirFotoModal(contrato),
                        pagamento: () => abrirMegaPagamentoModal(contrato),
                        protocolo: () => abrirProtocoloModal(contrato),
                        rescaldo: () => abrirRescaldoModal(contrato),
                      }}
                      layout="pipeline-desktop-pending"
                    />

                    {/* Spacer para empurrar indicadores para direita */}
                    <div className="flex-1"></div>

                    {/* Indicadores */}
                    <div className="flex items-center gap-2">
                      {/* WhatsApp */}
                      {(contrato.tutor?.telefone || contrato.tutor_telefone) && (
                        <a
                          href={`https://wa.me/${(contrato.tutor?.telefone || contrato.tutor_telefone || '').replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center w-9 h-9 bg-[#25D366] text-white rounded-full hover:bg-[#128C7E] transition-colors"
                          title={formatarTelefone(contrato.tutor?.telefone || contrato.tutor_telefone)}
                        >
                          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                        </a>
                      )}

                      {/* Action Buttons (Pet Grato, Chegamos, Chegaram, Finalizadora) */}
                      {/* Ativar/Entrega vivem no status badge com → arrows */}
                      <ActionButtons
                        contrato={contrato}
                        handlers={{
                          onPetGrato: () => abrirPetGrato(contrato),
                          onChegamos: () => abrirChegamosModal(contrato),
                          onChegaram: () => abrirChegaramModal(contrato),
                          onFinalizadora: () => abrirFinalizadoraModal(contrato),
                        }}
                        layout="pipeline"
                      />

                      {/* Status Badge + Complexidade */}
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                          <div className={`px-2 py-1 rounded-lg text-xs font-medium border ${statusColors?.bg} ${statusColors?.text} ${statusColors?.border}`}>
                            {STATUS_FLOW.find(s => s.key === contrato.status)?.label || contrato.status}
                          </div>
                          {/* Botão Ativar - só para preventivo, com setinha */}
                          {contrato.status === 'preventivo' && (
                            <>
                              <span className="text-slate-400 text-xs">→</span>
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirAtivarModal(contrato) }}
                                className="flex items-center justify-center w-9 h-9 bg-red-900 text-white rounded-full hover:bg-red-800 transition-colors"
                                title="Ativar contrato preventivo"
                              >
                                <span className="text-base">✝️</span>
                              </button>
                            </>
                          )}
                          {/* Botão Pinda - só para ativo, com setinha */}
                          {contrato.status === 'ativo' && (
                            <>
                              <span className="text-slate-400 text-xs">→</span>
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); /* TODO: ação pinda */ }}
                                className="flex items-center justify-center w-9 h-9 bg-orange-500 text-white rounded-full hover:bg-orange-600 transition-colors"
                                title="Enviar para Pinda"
                              >
                                <span className="text-base">💛</span>
                              </button>
                            </>
                          )}
                          {/* Botão Marcar Entregue - para retorno e pendente */}
                          {(contrato.status === 'retorno' || contrato.status === 'pendente') && (
                            <>
                              <span className="text-slate-400 text-xs">→</span>
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirEntregaModal(contrato) }}
                                className="flex items-center justify-center w-9 h-9 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 transition-colors"
                                title="Marcar entregue e finalizar"
                              >
                                <span className="text-base">📬</span>
                              </button>
                            </>
                          )}
                        </div>
                        {/* Indicador de complexidade - só Retorno */}
                        {contrato.status === 'retorno' && (() => {
                          const nivel = getComplexidadeMontagem(contrato)
                          const cores = {
                            1: 'bg-emerald-500 text-white',
                            2: 'bg-green-500 text-white',
                            3: 'bg-yellow-500 text-white',
                            4: 'bg-orange-500 text-white',
                            5: 'bg-red-500 text-white',
                          }[nivel] || 'bg-slate-500 text-white'
                          return (
                            <div
                              className={`w-8 h-8 rounded-md flex items-center justify-center text-sm font-black shadow-sm ${cores}`}
                              title={`Montagem: Nível ${nivel}`}
                            >
                              {nivel}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* === MOBILE LAYOUT === */}
                  <div className="md:hidden space-y-1">
                    {/* Bloco topo: [Checkbox?] [Data] [Lacre/Tutor] ... [PetNome/Raça] [PetEmoji] */}
                    <div className="flex items-stretch gap-1.5">
                      {/* Checkbox seleção (retorno/pendente) */}
                      {(statusFiltro === 'retorno' || statusFiltro === 'pendente') && (
                        <div
                          className="flex-shrink-0 flex items-center"
                          onClick={(e) => toggleSelectContrato(contrato.id, e)}
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                            selectedContratos.has(contrato.id)
                              ? 'bg-cyan-600 border-cyan-600 text-white'
                              : 'border-slate-500 hover:border-cyan-500'
                          }`}>
                            {selectedContratos.has(contrato.id) && (
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Data box (ocupa 2 linhas, à esquerda) */}
                      {dataBox && (
                        <div className="flex-shrink-0 w-11 rounded-md flex flex-col items-center justify-center p-0" style={{ background: 'linear-gradient(135deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', color: '#334155', gap: '1px' }}>
                          <span className="text-[11px] font-bold leading-none">{dataBox.linha1}</span>
                          <span className="text-[11px] leading-none" style={{ color: '#94a3b8' }}>{dataBox.linha2}</span>
                          <span className="text-[10px] leading-none" style={{ color: '#64748b' }}>{dataBox.hora}</span>
                          {contrato.supinda && (
                            <span className="text-[10px] font-bold leading-none" style={{ color: '#ea580c' }}>#{contrato.supinda.numero}</span>
                          )}
                        </div>
                      )}
                      {/* Coluna: Lacre+Fonte+Local+IND / Tutor */}
                      <div className="min-w-0 flex flex-col justify-center gap-1 flex-1">
                        {/* Linha 1: Lacre + Fonte + Local + IND/COL */}
                        <div className="h-6 flex items-center gap-1">
                          {contrato.numero_lacre ? (
                            <span className="text-white font-bold bg-blue-700 px-1.5 rounded text-sm h-6 flex items-center flex-shrink-0">{String(contrato.numero_lacre).replace(/\.0$/, '')}</span>
                          ) : (
                            <span className="text-xs text-slate-500 h-6 flex items-center flex-shrink-0">-</span>
                          )}
                          {/* Fonte (compacto h-6) */}
                          {contrato.fonte_conhecimento?.nome && (
                            <div
                              className="flex-shrink-0 h-6 px-1 rounded flex items-center justify-center"
                              style={FONTE_ICONS[contrato.fonte_conhecimento.nome]?.style || { background: 'linear-gradient(135deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', border: '1px solid #cbd5e1', color: '#64748b' }}
                              title={contrato.seguradora
                                ? `${contrato.fonte_conhecimento.nome}: ${contrato.seguradora}`
                                : contrato.fonte_conhecimento.nome}
                            >
                              {FONTE_ICONS[contrato.fonte_conhecimento.nome]?.img ? (
                                <img src={FONTE_ICONS[contrato.fonte_conhecimento.nome].img} alt={contrato.fonte_conhecimento.nome} className="w-4 h-4" />
                              ) : (
                                <span className="text-sm leading-none">{FONTE_ICONS[contrato.fonte_conhecimento.nome]?.icon || '❓'}</span>
                              )}
                              {contrato.seguradora && (
                                <span className="text-[7px] font-semibold ml-0.5 whitespace-nowrap" style={{ color: '#4338ca' }}>{contrato.seguradora}</span>
                              )}
                            </div>
                          )}
                          {/* Local (compacto h-6) */}
                          {contrato.local_coleta && (
                            <div
                              className="flex-shrink-0 h-6 rounded flex items-center justify-center px-1.5"
                              style={{
                                background: 'linear-gradient(135deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)',
                                color: contrato.local_coleta === 'Residência' ? '#1d4ed8' : contrato.local_coleta === 'Unidade' ? '#b45309' : '#7c3aed',
                              }}
                              title={contrato.clinica_coleta || contrato.local_coleta}
                            >
                              {(() => {
                                const texto = contrato.local_coleta === 'Residência'
                                  ? '🏠'
                                  : contrato.local_coleta === 'Clínica' && contrato.clinica_coleta
                                    ? contrato.clinica_coleta
                                    : contrato.local_coleta || ''
                                const isEmoji = texto === '🏠'
                                const isShort = texto.length <= 8
                                return (
                                  <span className={`font-medium text-center max-w-[60px] ${
                                    isEmoji ? 'text-sm' : isShort ? 'text-[9px]' : 'text-[7px] leading-tight line-clamp-2'
                                  }`}>
                                    {texto}
                                  </span>
                                )
                              })()}
                            </div>
                          )}
                          {/* IND/COL (compacto h-6) */}
                          <span className={`text-[9px] font-bold px-1.5 h-6 rounded flex items-center flex-shrink-0 ${
                            contrato.tipo_cremacao === 'individual'
                              ? 'bg-emerald-500 text-white'
                              : 'bg-violet-500 text-white'
                          }`}>
                            {contrato.tipo_cremacao === 'individual' ? 'IND' : 'COL'}
                          </span>
                        </div>
                        {/* Linha 2: Tutor */}
                        <div className="h-6 flex items-center min-w-0">
                          <span className="text-xs truncate h-6 flex items-center" style={{ background: 'linear-gradient(90deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', padding: '0 5px', borderRadius: '4px' }}>
                            {(() => {
                              const { primeiro, resto } = separarPrimeiroNome(contrato.tutor?.nome || contrato.tutor_nome)
                              return (
                                <>
                                  <span className="font-bold" style={{ color: '#6d28d9' }}>{primeiro}</span>
                                  {resto && <span className="font-normal" style={{ color: '#475569' }}>&nbsp;{resto}</span>}
                                </>
                              )
                            })()}
                          </span>
                        </div>
                      </div>
                      {/* Coluna: Pet nome + Raça/Cor */}
                      <div className="min-w-0 flex flex-col justify-center gap-1 items-end">
                        <Link href={`/contratos/${contrato.id}`} className="hover:opacity-80 max-w-[140px]" onClick={(e) => e.stopPropagation()}>
                          <span className="text-sm font-bold truncate h-6 flex items-center" style={{ background: 'linear-gradient(90deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', color: contrato.pet_genero === 'macho' ? '#1d4ed8' : '#db2777', padding: '0 5px', borderRadius: '4px' }}>
                            {contrato.pet_nome}
                            {contrato.pet_genero && <span style={{ marginLeft: '2px', fontSize: '0.7rem' }}>{contrato.pet_genero === 'macho' ? '♂' : '♀'}</span>}
                          </span>
                        </Link>
                        <div className="h-6 flex items-center">
                          {(contrato.pet_raca || contrato.pet_cor) && (
                            <span className="text-[10px] font-medium truncate max-w-[140px] h-6 flex items-center" style={{ background: 'linear-gradient(90deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', color: '#475569', padding: '0 5px', borderRadius: '4px' }}>{[contrato.pet_raca, contrato.pet_cor].filter(Boolean).join(' | ')}</span>
                          )}
                        </div>
                      </div>
                      {/* Pet emoji + Peso/Porte (ocupa 2 linhas, à direita) */}
                      <div className="flex-shrink-0 w-11 rounded-md flex flex-col items-center justify-center p-0 pb-0.5 overflow-hidden" style={petIcon.style}>
                        <span className="leading-none" style={{ fontSize: petIcon.emojiSize }}>{petIcon.emoji}</span>
                        <span className="text-[8px] font-bold leading-none flex items-center gap-0.5">{getPetPorte(contrato.pet_peso) && <span className="font-black">{getPetPorte(contrato.pet_peso)}</span>}{contrato.pet_peso ? <><Weight className="h-2.5 w-2.5" />{Math.round(contrato.pet_peso)}</> : '-'}</span>
                      </div>
                    </div>

                    {/* Linha 3: Tags finalizadas — boxes grandes centralizados */}
                    <InteractiveTags
                      contrato={contrato}
                      handlers={{
                        pelinho: () => abrirPelinhoModal(contrato),
                        urna: () => abrirUrnaModal(contrato),
                        certificado: () => abrirCertificadoModal(contrato),
                        protocolo: () => abrirProtocoloModal(contrato),
                        rescaldo: () => abrirRescaldoModal(contrato),
                      }}
                      layout="pipeline-mobile-green"
                    />

                    {/* Linha 4: Tags pendentes + status + expand — boxes grandes (+30%) */}
                    <div className="flex items-center gap-1.5">
                      <InteractiveTags
                        contrato={contrato}
                        handlers={{
                          pelinho: () => abrirPelinhoModal(contrato),
                          urna: () => abrirUrnaModal(contrato),
                          certificado: () => abrirCertificadoModal(contrato),
                          foto: () => abrirFotoModal(contrato),
                          pagamento: () => abrirMegaPagamentoModal(contrato),
                          protocolo: () => abrirProtocoloModal(contrato),
                          rescaldo: () => abrirRescaldoModal(contrato),
                        }}
                        layout="pipeline-mobile-pending"
                      />
                      <div className="flex-1" />
                      {/* Status Badge compacto */}
                      {contrato.status === 'retorno' && (() => {
                        const nivel = getComplexidadeMontagem(contrato)
                        const cores = {
                          1: 'bg-emerald-500 text-white',
                          2: 'bg-green-500 text-white',
                          3: 'bg-yellow-500 text-white',
                          4: 'bg-orange-500 text-white',
                          5: 'bg-red-500 text-white',
                        }[nivel] || 'bg-slate-500 text-white'
                        return (
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${cores}`} title={`Montagem: Nível ${nivel}`}>
                            {nivel}
                          </div>
                        )
                      })()}
                      <div className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${statusColors?.bg} ${statusColors?.text} ${statusColors?.border}`}>
                        {STATUS_FLOW.find(s => s.key === contrato.status)?.short || contrato.status}
                      </div>
                      {/* Seta expandir ações */}
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpandedMobileId(prev => prev === contrato.id ? null : contrato.id) }}
                        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                        style={{ color: '#94a3b8' }}
                      >
                        {expandedMobileId === contrato.id ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                      </button>
                    </div>

                    {/* Bloco 4: Ações expandíveis */}
                    {expandedMobileId === contrato.id && (
                      <div className="flex items-center gap-2 pt-0.5">
                        {/* WhatsApp */}
                        {(contrato.tutor?.telefone || contrato.tutor_telefone) && (
                          <a
                            href={`https://wa.me/${(contrato.tutor?.telefone || contrato.tutor_telefone || '').replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center w-8 h-8 bg-[#25D366] text-white rounded-full hover:bg-[#128C7E] transition-colors"
                            title={formatarTelefone(contrato.tutor?.telefone || contrato.tutor_telefone)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                          </a>
                        )}
                        <ActionButtons
                          contrato={contrato}
                          handlers={{
                            onPetGrato: () => abrirPetGrato(contrato),
                            onChegamos: () => abrirChegamosModal(contrato),
                            onChegaram: () => abrirChegaramModal(contrato),
                            onFinalizadora: () => abrirFinalizadoraModal(contrato),
                          }}
                          layout="pipeline"
                        />
                        <div className="flex-1" />
                        {/* Flow buttons */}
                        {contrato.status === 'preventivo' && (
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirAtivarModal(contrato) }}
                            className="flex items-center justify-center w-8 h-8 bg-red-900 text-white rounded-full hover:bg-red-800 transition-colors"
                            title="Ativar"
                          >
                            <span className="text-sm">✝️</span>
                          </button>
                        )}
                        {contrato.status === 'ativo' && (
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); /* TODO: ação pinda */ }}
                            className="flex items-center justify-center w-8 h-8 bg-orange-500 text-white rounded-full hover:bg-orange-600 transition-colors"
                            title="Enviar para Pinda"
                          >
                            <span className="text-sm">💛</span>
                          </button>
                        )}
                        {(contrato.status === 'retorno' || contrato.status === 'pendente') && (
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirEntregaModal(contrato) }}
                            className="flex items-center justify-center w-8 h-8 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 transition-colors"
                            title="Marcar entregue"
                          >
                            <span className="text-sm">📬</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                </div>
                </div>
                )
              }

            return cidades.map((cidade) => (
              <div key={cidade || 'all'}>
                {/* Cabeçalho da cidade */}
                {agruparCidade && (
                  <div className="bg-slate-700 text-white px-4 py-2 rounded-t-lg font-semibold flex items-center gap-2 mt-4 first:mt-0">
                    📍 {cidade} <span className="text-slate-300 text-sm font-normal">({contratosAgrupados[cidade].length})</span>
                  </div>
                )}

                {/* Contratos da cidade (com ou sem sub-agrupamento por bairro) */}
                <div className={`${agruparCidade ? 'bg-slate-700 p-2 rounded-b-lg' : ''}`}>
                  {agruparBairro && agruparCidade ? (
                    // Sub-agrupar por bairro
                    (() => {
                      const contratosPorBairro = contratosAgrupados[cidade].reduce((acc, contrato) => {
                        const bairro = contrato.tutor_bairro || 'Sem bairro'
                        if (!acc[bairro]) acc[bairro] = []
                        acc[bairro].push(contrato)
                        return acc
                      }, {} as Record<string, Contrato[]>)

                      const bairros = Object.keys(contratosPorBairro).sort()

                      return bairros.map((bairro) => (
                        <div key={bairro} className="mb-2 last:mb-0">
                          {/* Cabeçalho do bairro */}
                          <div className="bg-amber-500 text-white px-3 py-1.5 rounded-t-md text-sm font-medium flex items-center gap-2">
                            🏘️ {bairro} <span className="text-amber-200 text-xs font-normal">({contratosPorBairro[bairro].length})</span>
                          </div>
                          {/* Contratos do bairro */}
                          <div className="bg-amber-900/30 p-2 rounded-b-md space-y-2">
                            {contratosPorBairro[bairro].map(renderContrato)}
                          </div>
                        </div>
                      ))
                    })()
                  ) : (
                    // Sem sub-agrupamento por bairro
                    <div className="space-y-2">
                      {contratosAgrupados[cidade].map(renderContrato)}
                    </div>
                  )}
                </div>
              </div>
            ))
          })()
        )}
      </div>
      )}

      {/* Paginação */}
      {totalPaginas > 1 && (
        <div className="flex flex-col md:flex-row items-center justify-between mt-4 gap-2">
          <p className="text-sm text-slate-400">
            Mostrando {pagina * POR_PAGINA + 1} - {Math.min((pagina + 1) * POR_PAGINA, total)} de {total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPagina(p => Math.max(0, p - 1))}
              disabled={pagina === 0}
              className="p-2 border rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="px-4 py-2 text-sm">
              Página {pagina + 1} de {totalPaginas}
            </span>
            <button
              onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
              disabled={pagina >= totalPaginas - 1}
              className="p-2 border rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Modal Protocolo de Entrega */}
      {protocoloModal && protocoloContrato && (() => {
        if (protocoloLoading) {
          return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={() => { setProtocoloModal(false); setProtocoloContrato(null); setProtocoloEditData(null); unhighlightContrato(); }}>
              <div className="bg-white rounded-xl p-8 text-center shadow-2xl border border-gray-200" onClick={e => e.stopPropagation()}>
                <span className="animate-spin text-2xl">⏳</span>
                <p className="mt-2 text-sm text-gray-500">Carregando protocolo...</p>
              </div>
            </div>
          )
        }
        if (!protocoloEditData) return null

        const pe = protocoloEditData

        // Sem recálculo — pe já contém os valores editáveis
        const dadosImpressao = pe

        const editProd = (idx: number, campo: Partial<ProtocoloData['produtos'][0]>) => {
          const novosProdutos = [...pe.produtos]
          novosProdutos[idx] = { ...novosProdutos[idx], ...campo }
          setProtocoloEditData({ ...pe, produtos: novosProdutos })
        }

        const removeProd = (idx: number) => {
          setProtocoloEditData({ ...pe, produtos: pe.produtos.filter((_, i) => i !== idx) })
        }

        const addProd = () => {
          setProtocoloEditData({
            ...pe,
            produtos: [...pe.produtos, {
              nome: 'Item avulso',
              nomeRetorno: '',
              valor: 0,
              pago: '',
              tipo: 'acessorio',
            }]
          })
        }

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-2" onClick={() => { setProtocoloModal(false); setProtocoloContrato(null); setProtocoloEditData(null); unhighlightContrato(); }}>
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[95vh] overflow-auto border border-gray-200" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between p-3 border-b border-gray-200 sticky top-0 bg-white z-10">
                <h3 className="text-base font-semibold text-gray-900">📄 Protocolo — {protocoloContrato.pet_nome}</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      setSalvandoProtocolo(true)
                      const { error } = await supabase
                        .from('contratos')
                        .update({ protocolo_data: dadosImpressao } as never)
                        .eq('id', protocoloContrato.id)
                      if (!error) {
                        // Atualizar no array local
                        setContratos(prev => prev.map(c =>
                          c.id === protocoloContrato.id ? { ...c, protocolo_data: dadosImpressao } : c
                        ))
                        setProtocoloContrato({ ...protocoloContrato, protocolo_data: dadosImpressao })
                        setSalvandoProtocolo(false)
                        setProtocoloModal(false)
                        setProtocoloContrato(null)
                        setProtocoloEditData(null)
                        unhighlightContrato()
                      } else {
                        alert('Erro ao salvar: ' + error.message)
                        setSalvandoProtocolo(false)
                      }
                    }}
                    disabled={salvandoProtocolo}
                    className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50"
                  >
                    {salvandoProtocolo ? '⏳ Salvando...' : '✅ Salvar'}
                  </button>
                  <button
                    onClick={async () => {
                      if (!protocoloContrato) return
                      setProtocoloLoading(true)
                      setProtocoloEditData(null)
                      try {
                        const { data: cpData } = await supabase
                          .from('contrato_produtos')
                          .select('id, valor, produto:produtos(nome, nome_retorno, tipo, preco)')
                          .eq('contrato_id', protocoloContrato.id)
                        const { data: pagData } = await supabase
                          .from('pagamentos')
                          .select('tipo, valor, desconto')
                          .eq('contrato_id', protocoloContrato.id)
                        const { data: contratoCompleto } = await supabase
                          .from('contratos')
                          .select('*, tutor:tutores(nome, endereco, bairro, cidade, estado, cep)')
                          .eq('id', protocoloContrato.id)
                          .single()
                        if (contratoCompleto) {
                          const cpProdutos = (cpData || []).map((cp: any) => ({
                            valor: cp.valor,
                            produto: cp.produto ? { nome: cp.produto.nome, tipo: cp.produto.tipo, preco: cp.produto.preco } : null,
                          }))
                          const pags = (pagData || []).map((p: any) => ({ tipo: p.tipo, valor: p.valor, desconto: p.desconto }))
                          const financeiro = calcFinanceiroProtocolo(contratoCompleto, pags)
                          setProtocoloEditData(montarProtocoloData(contratoCompleto, cpProdutos, financeiro))
                        }
                      } catch (err) {
                        console.error('Erro ao regenerar protocolo:', err)
                      }
                      setProtocoloLoading(false)
                    }}
                    disabled={protocoloLoading}
                    className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm disabled:opacity-50"
                    title="Descartar edições e regenerar do zero"
                  >
                    {protocoloLoading ? '⏳' : '🔄'} Regenerar
                  </button>
                  <button
                    onClick={() => printProtocolos([dadosImpressao])}
                    className="flex items-center gap-2 px-3 py-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors text-sm"
                  >
                    <Printer className="h-4 w-4" />
                    Imprimir
                  </button>
                  <button onClick={() => { setProtocoloModal(false); setProtocoloContrato(null); setProtocoloEditData(null); unhighlightContrato(); }} className="text-gray-400 hover:text-gray-600">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Editor */}
              <div className="p-3 space-y-3">
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Produtos</div>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-100 text-xs text-gray-500 uppercase">
                        <th className="p-1.5 text-center w-14 border border-gray-200">Sit.</th>
                        <th className="p-1.5 text-left border border-gray-200">Nome (no protocolo)</th>
                        <th className="p-1.5 text-right w-24 border border-gray-200">Valor</th>
                        <th className="p-1.5 w-8 border border-gray-200"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pe.produtos.map((prod, idx) => (
                        <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                          <td className="p-1 text-center border border-gray-200">
                            <button
                              onClick={() => {
                                const next = prod.pago === 'ok' ? 'pend' : prod.pago === 'pend' ? '' : 'ok'
                                editProd(idx, { pago: next })
                              }}
                              className={`px-1.5 py-0.5 rounded text-xs font-bold min-w-[38px] ${
                                prod.pago === 'ok'
                                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                  : prod.pago === 'pend'
                                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                              }`}
                            >
                              {prod.pago === 'ok' ? 'Ok' : prod.pago === 'pend' ? 'Pend' : '—'}
                            </button>
                          </td>
                          <td className="p-1 border border-gray-200">
                            <input
                              type="text"
                              value={prod.nomeRetorno}
                              onChange={e => editProd(idx, { nomeRetorno: e.target.value })}
                              className="w-full bg-transparent border-0 p-0.5 text-sm text-gray-900 focus:outline-none focus:bg-blue-50 rounded"
                            />
                          </td>
                          <td className="p-1 border border-gray-200">
                            <input
                              type="text"
                              value={prod.valorDisplay !== undefined ? prod.valorDisplay : (prod.valor || '')}
                              onChange={e => {
                                const raw = e.target.value
                                const num = parseFloat(raw.replace(',', '.'))
                                if (!isNaN(num) && /^[\d.,]+$/.test(raw.trim())) {
                                  editProd(idx, { valor: num, valorDisplay: undefined })
                                } else {
                                  editProd(idx, { valor: 0, valorDisplay: raw })
                                }
                              }}
                              className="w-full bg-transparent border-0 p-0.5 text-sm text-gray-900 text-right focus:outline-none focus:bg-blue-50 rounded"
                              placeholder="0"
                            />
                          </td>
                          <td className="p-1 border border-gray-200 text-center">
                            <button
                              onClick={() => removeProd(idx)}
                              className="text-gray-400 hover:text-red-500 transition-colors"
                              title="Remover"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    onClick={addProd}
                    className="mt-1.5 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 px-2 py-1 rounded transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar item
                  </button>
                </div>

                {/* Resumo financeiro (editável) */}
                {(() => {
                  const saldoEsperado = Math.round((pe.totalAPagar - pe.totalPago) * 100) / 100
                  const batendo = Math.abs(pe.saldo - saldoEsperado) < 0.01
                  return (
                    <div className={`flex items-center justify-between text-sm rounded-lg p-2 gap-2 border ${batendo ? 'bg-gray-100 border-transparent' : 'bg-red-50 border-red-300'}`}>
                      <div className="flex flex-col">
                        <span className="text-gray-500 text-xs">Total</span>
                        <input
                          type="number"
                          step="0.01"
                          value={pe.totalAPagar}
                          onChange={e => setProtocoloEditData({ ...pe, totalAPagar: parseFloat(e.target.value) || 0 })}
                          className="w-24 bg-white border border-gray-300 rounded px-1.5 py-0.5 text-sm font-bold text-gray-900 text-right focus:outline-none focus:border-blue-400"
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-500 text-xs">Pago</span>
                        <input
                          type="number"
                          step="0.01"
                          value={pe.totalPago}
                          onChange={e => setProtocoloEditData({ ...pe, totalPago: parseFloat(e.target.value) || 0 })}
                          className="w-24 bg-white border border-gray-300 rounded px-1.5 py-0.5 text-sm font-bold text-green-600 text-right focus:outline-none focus:border-blue-400"
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-500 text-xs">Saldo</span>
                        <input
                          type="number"
                          step="0.01"
                          value={pe.saldo}
                          onChange={e => setProtocoloEditData({ ...pe, saldo: parseFloat(e.target.value) || 0 })}
                          className={`w-24 bg-white border border-gray-300 rounded px-1.5 py-0.5 text-sm font-bold text-right focus:outline-none focus:border-blue-400 ${pe.saldo > 0 ? 'text-red-500' : 'text-green-600'}`}
                        />
                      </div>
                      <div className="flex flex-col items-center justify-center" title={batendo ? 'Total − Pago = Saldo ✓' : `Esperado: ${saldoEsperado.toFixed(2)}`}>
                        <span className="text-[10px] text-gray-400">T−P=S</span>
                        <span className={`text-sm ${batendo ? 'text-green-500' : 'text-red-500 animate-pulse'}`}>{batendo ? '✓' : '✗'}</span>
                      </div>
                    </div>
                  )
                })()}

                {/* Toggle + Opções de pagamento (editáveis) */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={pe.mostrarPagamento !== false}
                      onChange={e => setProtocoloEditData({ ...pe, mostrarPagamento: e.target.checked })}
                      className="rounded"
                    />
                    Mostrar opções de pagamento no protocolo
                  </label>
                  {pe.mostrarPagamento !== false && (
                    <div className="flex gap-2 text-xs">
                      <div className="flex-1 bg-gray-100 rounded p-2 text-center">
                        <div className="text-gray-500 uppercase text-[10px]">Pix/Dinheiro</div>
                        <input
                          type="number"
                          step="0.01"
                          value={pe.opcoesPagamento.pix}
                          onChange={e => setProtocoloEditData({ ...pe, opcoesPagamento: { ...pe.opcoesPagamento, pix: parseFloat(e.target.value) || 0 } })}
                          className="w-full bg-white border border-gray-300 rounded px-1 py-0.5 text-sm font-bold text-gray-900 text-center focus:outline-none focus:border-blue-400"
                        />
                      </div>
                      <div className="flex-1 bg-gray-100 rounded p-2 text-center">
                        <div className="text-gray-500 uppercase text-[10px]">1-6x cartão</div>
                        <input
                          type="number"
                          step="0.01"
                          value={pe.opcoesPagamento.parcelado6}
                          onChange={e => setProtocoloEditData({ ...pe, opcoesPagamento: { ...pe.opcoesPagamento, parcelado6: parseFloat(e.target.value) || 0 } })}
                          className="w-full bg-white border border-gray-300 rounded px-1 py-0.5 text-sm font-bold text-gray-900 text-center focus:outline-none focus:border-blue-400"
                        />
                      </div>
                      <div className="flex-1 bg-gray-100 rounded p-2 text-center">
                        <div className="text-gray-500 uppercase text-[10px]">7-12x cartão</div>
                        <input
                          type="number"
                          step="0.01"
                          value={pe.opcoesPagamento.parcelado12}
                          onChange={e => setProtocoloEditData({ ...pe, opcoesPagamento: { ...pe.opcoesPagamento, parcelado12: parseFloat(e.target.value) || 0 } })}
                          className="w-full bg-white border border-gray-300 rounded px-1 py-0.5 text-sm font-bold text-gray-900 text-center focus:outline-none focus:border-blue-400"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Preview */}
                <div className="border-t border-gray-200 pt-3">
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Preview</div>
                  <ProtocoloEntrega data={dadosImpressao} />
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Barra flutuante de seleção para protocolo batch */}
      {selectedContratos.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white rounded-2xl shadow-2xl px-3 md:px-5 py-2 md:py-3 flex items-center gap-2 md:gap-4 max-w-[calc(100vw-2rem)]">
          <span className="text-sm font-medium">
            {selectedContratos.size} selecionado{selectedContratos.size > 1 ? 's' : ''}
          </span>
          <button
            onClick={imprimirProtocolosBatch}
            disabled={protocoloBatchLoading}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            {protocoloBatchLoading ? (
              <>
                <span className="animate-spin">⏳</span>
                Gerando...
              </>
            ) : (
              <>
                <Printer className="h-4 w-4" />
                Imprimir Protocolos
              </>
            )}
          </button>
          <button
            onClick={() => setSelectedContratos(new Set())}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="Limpar seleção"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Modal Mega Pagamento - Novo / Quitar Saldo */}
      {megaPagamentoModal && megaPagamentoContrato && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-2" onClick={() => { setMegaPagamentoModal(false); unhighlightContrato(); }}>
          <div className="bg-slate-800 rounded-2xl w-full max-w-md shadow-xl max-h-[95vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header com Data */}
            <div className="flex items-center justify-between p-3 border-b bg-gradient-to-r from-green-600 to-emerald-600 rounded-t-2xl">
              <div className="flex items-center gap-2 text-white">
                <span className="text-lg">💲</span>
                <h3 className="font-semibold">Pagamento</h3>
                <span className="text-sm opacity-80">- {megaPagamentoContrato.pet_nome}</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Data: Hoje ou Outra */}
                <div className="flex items-center gap-1 bg-white/10 rounded px-1">
                  <button
                    type="button"
                    onClick={() => setMegaPagamentoForm({ ...megaPagamentoForm, dataHoje: true, data_pagamento: '' })}
                    className={`px-2 py-0.5 rounded text-xs transition-colors ${
                      megaPagamentoForm.dataHoje
                        ? 'bg-slate-700 text-green-400 font-medium'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    Hoje
                  </button>
                  {!megaPagamentoForm.dataHoje ? (
                    <input
                      type="date"
                      value={megaPagamentoForm.data_pagamento}
                      onChange={(e) => setMegaPagamentoForm({ ...megaPagamentoForm, data_pagamento: e.target.value })}
                      onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                      className="px-1 py-0.5 rounded text-xs text-slate-300 w-28 bg-slate-700 cursor-pointer"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setMegaPagamentoForm({
                        ...megaPagamentoForm,
                        dataHoje: false,
                        data_pagamento: new Date().toISOString().split('T')[0]
                      })}
                      className="px-2 py-0.5 rounded text-xs text-white/70 hover:text-white transition-colors"
                    >
                      Outra
                    </button>
                  )}
                </div>
                <button onClick={() => { setMegaPagamentoModal(false); unhighlightContrato(); }} className="text-white/80 hover:text-white ml-1">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Form compacto */}
            <div className="p-3 space-y-3">
              {/* Plano e Acessório lado a lado */}
              <div className="grid grid-cols-2 gap-2">
                {/* Plano */}
                <div className="bg-blue-900/30 rounded-lg p-2 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs shrink-0">📋</span>
                    <span className="text-xs font-semibold text-blue-800 shrink-0">Plano</span>
                    <input
                      type="number"
                      step="0.01"
                      value={megaPagamentoForm.valorPlano}
                      onChange={(e) => setMegaPagamentoForm({ ...megaPagamentoForm, valorPlano: e.target.value })}
                      className="w-full min-w-0 flex-1 ml-1 px-2 py-1 border border-blue-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-700 text-sm font-semibold text-right"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="flex items-center gap-1 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={megaPagamentoForm.descontoPlanoAtivo}
                        onChange={(e) => setMegaPagamentoForm({
                          ...megaPagamentoForm,
                          descontoPlanoAtivo: e.target.checked,
                          descontoPlano: e.target.checked ? megaPagamentoForm.descontoPlano : ''
                        })}
                        className="w-3 h-3 text-blue-400 rounded"
                      />
                      <span className="text-[10px] text-blue-400">Desc</span>
                    </label>
                    {megaPagamentoForm.descontoPlanoAtivo && (
                      <input
                        type="number"
                        step="0.01"
                        value={megaPagamentoForm.descontoPlano}
                        onChange={(e) => setMegaPagamentoForm({ ...megaPagamentoForm, descontoPlano: e.target.value })}
                        className="w-full min-w-0 flex-1 px-2 py-0.5 border border-blue-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-700 text-xs text-right"
                        placeholder="-0.00"
                      />
                    )}
                  </div>
                </div>

                {/* Acessório */}
                <div className="bg-purple-900/30 rounded-lg p-2 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs shrink-0">🎀</span>
                    <span className="text-xs font-semibold text-purple-800 shrink-0">Acess</span>
                    <input
                      type="number"
                      step="0.01"
                      value={megaPagamentoForm.valorAcessorio}
                      onChange={(e) => setMegaPagamentoForm({ ...megaPagamentoForm, valorAcessorio: e.target.value })}
                      className="w-full min-w-0 flex-1 ml-1 px-2 py-1 border border-purple-700 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 bg-slate-700 text-sm font-semibold text-right"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="flex items-center gap-1 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={megaPagamentoForm.descontoAcessorioAtivo}
                        onChange={(e) => setMegaPagamentoForm({
                          ...megaPagamentoForm,
                          descontoAcessorioAtivo: e.target.checked,
                          descontoAcessorio: e.target.checked ? megaPagamentoForm.descontoAcessorio : ''
                        })}
                        className="w-3 h-3 text-purple-400 rounded"
                      />
                      <span className="text-[10px] text-purple-400">Desc</span>
                    </label>
                    {megaPagamentoForm.descontoAcessorioAtivo && (
                      <input
                        type="number"
                        step="0.01"
                        value={megaPagamentoForm.descontoAcessorio}
                        onChange={(e) => setMegaPagamentoForm({ ...megaPagamentoForm, descontoAcessorio: e.target.value })}
                        className="w-full min-w-0 flex-1 px-2 py-0.5 border border-purple-700 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 bg-slate-700 text-xs text-right"
                        placeholder="-0.00"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Proporcionalizar (quando ambos descontos ativos) */}
              {megaPagamentoForm.descontoPlanoAtivo && megaPagamentoForm.descontoAcessorioAtivo && (
                <div className="flex items-center justify-center gap-2 py-1 px-2 bg-slate-700/50 rounded">
                  <span className="text-[10px] text-slate-400">Proporcionalizar:</span>
                  <input
                    type="number"
                    step="0.01"
                    value={megaPagamentoForm.descontoProporcionalizar}
                    onChange={(e) => {
                      const valorTotal = parseFloat(e.target.value) || 0
                      const valorPlano = parseFloat(megaPagamentoForm.valorPlano) || 0
                      const valorAcessorio = parseFloat(megaPagamentoForm.valorAcessorio) || 0
                      const soma = valorPlano + valorAcessorio
                      if (soma > 0 && valorTotal > 0) {
                        setMegaPagamentoForm({
                          ...megaPagamentoForm,
                          descontoProporcionalizar: e.target.value,
                          descontoPlano: (valorTotal * valorPlano / soma).toFixed(2),
                          descontoAcessorio: (valorTotal * valorAcessorio / soma).toFixed(2),
                        })
                      } else {
                        setMegaPagamentoForm({ ...megaPagamentoForm, descontoProporcionalizar: e.target.value })
                      }
                    }}
                    className="w-20 px-2 py-0.5 border border-slate-600 rounded text-xs text-center"
                    placeholder="0.00"
                  />
                </div>
              )}

              {/* Método */}
              {megaPagamentoForm.metodo !== 'cartao' ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-400">Método</span>
                  <div className="flex-1 flex gap-1">
                    {(['pix', 'cartao', 'dinheiro'] as const).map((metodo) => (
                      <button
                        key={metodo}
                        type="button"
                        onClick={() => setMegaPagamentoForm({
                          ...megaPagamentoForm,
                          metodo,
                          bandeira: metodo === 'cartao' ? 'master' : megaPagamentoForm.bandeira,
                          parcelas: '',
                          idTransacao: ''
                        })}
                        className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors ${
                          megaPagamentoForm.metodo === metodo
                            ? 'bg-green-600 text-white'
                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                        }`}
                      >
                        <span className="inline-flex items-center gap-0.5">{metodo === 'pix' ? <><PixIcon className="h-3.5 w-3.5 text-[#32BCAD]" />Pix</> : metodo === 'cartao' ? '💳Cartão' : '💵Din'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Modo Cartão - bandeiras centralizadas */
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center justify-center gap-2">
                    {(['master', 'visa', 'elo', 'amex', 'hiper'] as const).map((band) => (
                      <button
                        key={band}
                        type="button"
                        onClick={() => setMegaPagamentoForm({ ...megaPagamentoForm, bandeira: band, parcelas: '' })}
                        className={`p-1 rounded transition-all ${
                          megaPagamentoForm.bandeira === band
                            ? 'ring-2 ring-orange-500 scale-110 bg-orange-900/30'
                            : 'opacity-50 hover:opacity-100'
                        }`}
                      >
                        <img src={`/bandeiras/${band === 'master' ? 'mastercard' : band}.png`} alt={band} className="h-7 w-auto" />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setMegaPagamentoForm({ ...megaPagamentoForm, metodo: 'pix', parcelas: '', idTransacao: '' })}
                    className="text-[10px] text-slate-400 hover:text-slate-400"
                  >
                    ← voltar
                  </button>
                </div>
              )}

              {/* Cartão expandido - Parcelas e ID */}
              {megaPagamentoForm.metodo === 'cartao' && (
                <div className="bg-orange-900/30 rounded-lg p-2 space-y-2">
                  {/* Parcelas em botões grandes */}
                  <div className="flex flex-wrap justify-center gap-1">
                    {(megaPagamentoForm.bandeira === 'amex' || megaPagamentoForm.bandeira === 'hiper'
                      ? ['1x', '2x', '3x', '4x', '5x', '6x', '7x', '8x', '9x', '10x', '11x', '12x']
                      : ['debito', '1x', '2x', '3x', '4x', '5x', '6x', '7x', '8x', '9x', '10x', '11x', '12x']
                    ).map((parc) => {
                      const label = parc === 'debito' ? 'D' : parc.replace('x', '')
                      return (
                        <button
                          key={parc}
                          type="button"
                          onClick={() => setMegaPagamentoForm({ ...megaPagamentoForm, parcelas: parc })}
                          className={`w-9 h-9 rounded-lg font-bold text-sm transition-all ${
                            megaPagamentoForm.parcelas === parc
                              ? 'bg-orange-500 text-white shadow-md scale-105'
                              : 'bg-slate-700 text-orange-300 border border-orange-700 hover:bg-orange-900/40'
                          }`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  {/* ID Transação */}
                  {megaPagamentoForm.parcelas && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-orange-400 shrink-0">ID Trans.*</span>
                      <input
                        type="text"
                        value={megaPagamentoForm.idTransacao || ''}
                        onChange={(e) => setMegaPagamentoForm({ ...megaPagamentoForm, idTransacao: e.target.value })}
                        className="flex-1 min-w-0 px-2 py-1 border border-orange-700 rounded text-sm bg-slate-700 focus:outline-none focus:ring-1 focus:ring-orange-500"
                        placeholder="Nº maquininha"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Total compacto */}
              <div className="bg-emerald-600 rounded-lg p-2 flex justify-between items-center">
                <span className="text-xs text-emerald-100">Total:</span>
                <span className="text-lg font-bold text-white">
                  {formatarMoeda(
                    ((parseFloat(megaPagamentoForm.valorPlano) || 0) - (megaPagamentoForm.descontoPlanoAtivo ? (parseFloat(megaPagamentoForm.descontoPlano) || 0) : 0)) +
                    ((parseFloat(megaPagamentoForm.valorAcessorio) || 0) - (megaPagamentoForm.descontoAcessorioAtivo ? (parseFloat(megaPagamentoForm.descontoAcessorio) || 0) : 0))
                  )}
                </span>
              </div>
            </div>

            {/* Footer compacto */}
            <div className="flex gap-2 p-3 border-t bg-slate-700/50 rounded-b-2xl">
              <button
                onClick={() => { setMegaPagamentoModal(false); unhighlightContrato(); }}
                className="flex-1 py-2 border border-slate-600 rounded-lg text-slate-400 text-sm hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={salvarMegaPagamento}
                disabled={salvandoMegaPagamento || (!megaPagamentoForm.valorPlano && !megaPagamentoForm.valorAcessorio && !megaPagamentoForm.descontoPlano && !megaPagamentoForm.descontoAcessorio)}
                className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {salvandoMegaPagamento ? '...' : '✅ Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pelinho (2-step: pergunta + validação) */}
      {pelinhoContrato && (
        <PelinhoModal
          isOpen={pelinhoModal1 || pelinhoModal2}
          onClose={() => { setPelinhoModal1(false); setPelinhoModal2(false); unhighlightContrato(); }}
          contrato={pelinhoContrato}
          onSuccess={(updated) => {
            setContratos(prev => prev.map(c =>
              c.id === updated.id ? { ...c, ...updated } : c
            ))
          }}
        />
      )}

      {/* Modal Pet Grato */}
      {petGratoModal && petGratoContrato && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setPetGratoModal(false)}>
          <div className="relative bg-gray-950 rounded-2xl w-full max-w-md shadow-2xl mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Star granules background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute top-4 left-8 w-1 h-1 bg-amber-400 rounded-full animate-pulse opacity-60"></div>
              <div className="absolute top-12 right-12 w-1.5 h-1.5 bg-amber-300 rounded-full animate-pulse opacity-80" style={{animationDelay: '0.5s'}}></div>
              <div className="absolute top-20 left-20 w-0.5 h-0.5 bg-white rounded-full animate-pulse opacity-40" style={{animationDelay: '1s'}}></div>
              <div className="absolute top-32 right-8 w-1 h-1 bg-amber-200 rounded-full animate-pulse opacity-50" style={{animationDelay: '0.3s'}}></div>
              <div className="absolute top-48 left-6 w-1 h-1 bg-amber-400 rounded-full animate-pulse opacity-70" style={{animationDelay: '0.7s'}}></div>
              <div className="absolute top-56 right-20 w-0.5 h-0.5 bg-white rounded-full animate-pulse opacity-30" style={{animationDelay: '1.2s'}}></div>
              <div className="absolute bottom-32 left-16 w-1.5 h-1.5 bg-amber-300 rounded-full animate-pulse opacity-60" style={{animationDelay: '0.2s'}}></div>
              <div className="absolute bottom-20 right-6 w-1 h-1 bg-amber-400 rounded-full animate-pulse opacity-50" style={{animationDelay: '0.9s'}}></div>
              <div className="absolute bottom-12 left-10 w-0.5 h-0.5 bg-white rounded-full animate-pulse opacity-40" style={{animationDelay: '1.5s'}}></div>
              <div className="absolute bottom-40 right-16 w-1 h-1 bg-amber-200 rounded-full animate-pulse opacity-70" style={{animationDelay: '0.4s'}}></div>
              <div className="absolute top-40 left-1/2 w-0.5 h-0.5 bg-amber-900/40 rounded-full animate-pulse opacity-50" style={{animationDelay: '0.6s'}}></div>
              <div className="absolute bottom-56 left-1/3 w-1 h-1 bg-amber-300 rounded-full animate-pulse opacity-40" style={{animationDelay: '1.1s'}}></div>
            </div>

            {/* Header */}
            <div className="relative flex items-center justify-between p-4 border-b border-amber-900/30">
              <h3 className="text-lg font-semibold text-amber-400 flex items-center gap-2">
                <Star className="h-5 w-5 fill-amber-400" />
                Pet Grato
              </h3>
              <button onClick={() => setPetGratoModal(false)} className="p-1 hover:bg-slate-700 rounded-full transition-colors">
                <X className="h-5 w-5 text-slate-400 hover:text-slate-300" />
              </button>
            </div>

            {/* Body */}
            <div className="relative p-4 space-y-4">
              <p className="text-sm text-slate-400">
                Mensagem de despedida do <strong className="text-amber-400">{petGratoContrato.pet_nome}</strong>
                {petGratoContrato.pet_genero && (
                  <span className={`ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full text-sm font-black ${petGratoContrato.pet_genero === 'macho' ? 'bg-blue-500/30 text-blue-300' : 'bg-pink-500/30 text-pink-300'}`}>
                    {petGratoContrato.pet_genero === 'macho' ? '♂' : '♀'}
                  </span>
                )} para o tutor.
              </p>

              {/* Nome do Tutor */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Nome do Tutor(a)</label>
                <input
                  type="text"
                  value={petGratoForm.tutorNome}
                  onChange={(e) => setPetGratoForm({ ...petGratoForm, tutorNome: e.target.value })}
                  placeholder="Ex: Maria"
                  className="w-full px-3 py-2 bg-gray-900 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>

              {/* Nome do Pet */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Nome do Pet</label>
                <input
                  type="text"
                  value={petGratoForm.petNome}
                  onChange={(e) => setPetGratoForm({ ...petGratoForm, petNome: e.target.value })}
                  placeholder="Ex: Rex"
                  className="w-full px-3 py-2 bg-gray-900 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>

              {/* Sexo do Pet */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Sexo do Pet</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="petSexoList"
                      checked={petGratoForm.sexo === 'M'}
                      onChange={() => setPetGratoForm({ ...petGratoForm, sexo: 'M' })}
                      className="w-4 h-4 text-amber-500 bg-gray-900 border-slate-600 focus:ring-amber-500"
                    />
                    <span className="text-sm text-slate-300">Macho</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="petSexoList"
                      checked={petGratoForm.sexo === 'F'}
                      onChange={() => setPetGratoForm({ ...petGratoForm, sexo: 'F' })}
                      className="w-4 h-4 text-amber-500 bg-gray-900 border-slate-600 focus:ring-amber-500"
                    />
                    <span className="text-sm text-slate-300">Fêmea</span>
                  </label>
                </div>
              </div>

              {/* Família */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Tutor(a):</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="familiaList"
                      checked={petGratoForm.familia === 'F'}
                      onChange={() => setPetGratoForm({ ...petGratoForm, familia: 'F' })}
                      className="w-4 h-4 text-amber-500 bg-gray-900 border-slate-600 focus:ring-amber-500"
                    />
                    <span className="text-sm text-slate-300">Com família</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="familiaList"
                      checked={petGratoForm.familia === 'S'}
                      onChange={() => setPetGratoForm({ ...petGratoForm, familia: 'S' })}
                      className="w-4 h-4 text-amber-500 bg-gray-900 border-slate-600 focus:ring-amber-500"
                    />
                    <span className="text-sm text-slate-300">Sozinho(a)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Thumbnail da imagem */}
            <div className="relative flex items-center gap-3 px-4 pb-2">
              <img src="/pet-grato.jpg" alt="Pet Grato" className="w-12 h-12 rounded-lg border-2 border-amber-500/30 object-cover" />
              <span className="text-[10px] text-slate-500 leading-tight">Segure na imagem para copiar e enviar separadamente</span>
            </div>

            {/* Footer */}
            <div className="relative flex gap-2 p-4 border-t border-amber-900/30">
              <button
                onClick={() => setPetGratoModal(false)}
                className="py-2 px-4 border border-slate-600 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!petGratoForm.tutorNome || !petGratoForm.petNome) return
                  const msg = gerarMensagemPetGrato()
                  if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(msg)
                  } else {
                    const ta = document.createElement('textarea')
                    ta.value = msg
                    ta.style.position = 'fixed'
                    ta.style.left = '-9999px'
                    document.body.appendChild(ta)
                    ta.select()
                    ta.setSelectionRange(0, 99999)
                    document.execCommand('copy')
                    document.body.removeChild(ta)
                  }
                  setPetGratoCopied(true)
                  setTimeout(() => setPetGratoCopied(false), 2000)
                }}
                disabled={!petGratoForm.tutorNome || !petGratoForm.petNome}
                className="flex-1 py-2 px-4 border border-amber-500/50 rounded-lg text-amber-400 hover:bg-amber-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {petGratoCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {petGratoCopied ? 'Copiado!' : 'Copiar'}
              </button>
              <button
                onClick={enviarPetGrato}
                disabled={!petGratoForm.tutorNome || !petGratoForm.petNome}
                className="flex-1 py-2 px-4 bg-amber-500 text-slate-200 font-semibold rounded-lg hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ativar PV */}
      {ativarContrato && (
        <AtivarModal
          isOpen={ativarModal}
          onClose={() => setAtivarModal(false)}
          contrato={ativarContrato}
          onSuccess={(updated) => {
            if (statusFiltro && statusFiltro !== 'ativo') {
              setContratos(prev => prev.filter(c => c.id !== updated.id))
              setTotal(prev => Math.max(0, prev - 1))
            } else {
              setContratos(prev => prev.map(c =>
                c.id === updated.id ? { ...c, ...updated } : c
              ))
            }
            setStatusCounts(prev => ({
              ...prev,
              preventivo: Math.max(0, (prev.preventivo || 0) - 1),
              ativo: (prev.ativo || 0) + 1,
            }))
          }}
        />
      )}

      {/* Modal Chegamos (Ativo - pet chegou na unidade) */}
      {chegamosContrato && (
        <ChegamosModal
          isOpen={chegamosModal}
          onClose={() => setChegamosModal(false)}
          contrato={chegamosContrato}
        />
      )}

      {/* Modal Chegaram (Retorno - cinzas chegaram) */}
      {chegaramContrato && (
        <ChegaramModal
          isOpen={chegaramModal}
          onClose={() => setChegaramModal(false)}
          contrato={chegaramContrato}
        />
      )}

      {/* Modal Finalizadora (Finalizado - mensagem de agradecimento) */}
      {finalizadoraContrato && (
        <FinalizadoraModal
          isOpen={finalizadoraModal}
          onClose={() => setFinalizadoraModal(false)}
          contrato={finalizadoraContrato}
        />
      )}

      {/* Modal Prompt Urna - Adicionar nova ou editar? */}
      {urnaPrompt && urnaContrato && (() => {
        const urnasExistentes = urnaContrato.contrato_produtos?.filter(cp => cp.produto?.tipo === 'urna') || []
        const nomesUrnas = urnasExistentes.map(u => u.produto?.nome || 'Urna').join(', ')

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setUrnaPrompt(false); unhighlightContrato(); }}>
            <div className="bg-slate-800 rounded-xl shadow-xl max-w-sm w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-200">⚱️ Urna já definida</h3>
                <button onClick={() => { setUrnaPrompt(false); unhighlightContrato(); }} className="text-slate-400 hover:text-slate-400">
                  ✕
                </button>
              </div>

              <p className="text-sm text-slate-400 mb-4">
                <strong>{urnaContrato.pet_nome}</strong> já tem {urnasExistentes.length} urna(s): <span className="font-mono text-purple-400">{nomesUrnas}</span>
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => urnaPromptAcao('adicionar')}
                  className="flex-1 py-3 px-4 bg-green-900/40 border-2 border-green-500 text-green-300 rounded-lg font-medium hover:bg-green-900/50 transition-colors"
                >
                  ➕ Adicionar nova
                </button>
                <button
                  onClick={() => urnaPromptAcao('editar')}
                  className="flex-1 py-3 px-4 bg-purple-900/40 border-2 border-purple-500 text-purple-300 rounded-lg font-medium hover:bg-purple-900/50 transition-colors"
                >
                  ✏️ Trocar última
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal Urna - Seleção */}
      {urnaModal && urnaContrato && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setUrnaModal(false); unhighlightContrato(); }}>
          <div className="bg-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-slate-200">
                ⚱️ {urnaModoEdicao ? 'Editar Urna' : 'Escolher Urna'}
                <span className="ml-2 text-sm font-normal text-slate-400">
                  - {urnaContrato.pet_nome} ({urnaContrato.codigo})
                </span>
              </h3>
              <button onClick={() => { setUrnaModal(false); unhighlightContrato(); }} className="text-slate-400 hover:text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Busca + Filtros */}
            <div className="p-4 border-b space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar urna..."
                  value={buscaUrna}
                  onChange={(e) => setBuscaUrna(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              {categoriasUrnasModal.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setFiltroUrnaCategoria('')}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      !filtroUrnaCategoria
                        ? 'bg-purple-900/40 text-purple-300 border-purple-300'
                        : 'bg-slate-700/50 text-slate-400 border-slate-600 hover:bg-slate-700'
                    }`}
                  >
                    Todas ({urnas.length})
                  </button>
                  {categoriasUrnasModal.map(cat => {
                    const count = urnas.filter(u => u.categoria === cat).length
                    return (
                      <button
                        key={cat}
                        onClick={() => setFiltroUrnaCategoria(filtroUrnaCategoria === cat ? '' : cat)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          filtroUrnaCategoria === cat
                            ? 'bg-purple-900/40 text-purple-300 border-purple-300'
                            : 'bg-slate-700/50 text-slate-400 border-slate-600 hover:bg-slate-700'
                        }`}
                      >
                        {CATEGORIA_URNA_LABELS[cat] || cat} ({count})
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Grid de Urnas */}
            <div className="flex-1 overflow-y-auto p-4">
              {urnas.length === 0 ? (
                <div className="text-center py-8 text-slate-400">Carregando urnas...</div>
              ) : urnasFiltradas.length === 0 ? (
                <div className="text-center py-8 text-slate-400">Nenhuma urna encontrada</div>
              ) : filtroUrnaCategoria ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {urnasFiltradas.map((urna) => (
                    <button
                      key={urna.id}
                      onClick={() => setUrnaSelecionada(urna)}
                      className={`rounded-xl border-2 overflow-hidden transition-all hover:shadow-lg ${
                        urnaSelecionada?.id === urna.id
                          ? 'border-purple-500 ring-2 ring-purple-200'
                          : 'border-slate-600 hover:border-purple-300'
                      }`}
                    >
                      <div className="aspect-square bg-slate-700 relative">
                        <img
                          src={urna.imagem_url || getImagemUrna(urna.codigo)}
                          alt={urna.nome}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            const currentSrc = target.src
                            if (currentSrc.endsWith('.png')) {
                              target.src = `/estoque/${urna.codigo}.jpg`
                            } else {
                              target.style.display = 'none'
                            }
                          }}
                        />
                        {urnaSelecionada?.id === urna.id && (
                          <div className="absolute top-2 right-2 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                        {!urna.estoque_infinito && urna.estoque_atual <= 0 && (
                          <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-red-500 rounded text-white text-[10px] font-bold">
                            {urna.estoque_atual}
                          </div>
                        )}
                      </div>
                      <div className="p-2 text-left">
                        <p className="font-medium text-slate-200 text-sm line-clamp-2 min-h-[2.5rem]">{urna.nome}</p>
                        <div className="flex justify-between items-center mt-1">
                          <span className={`text-xs font-semibold ${
                            urna.estoque_infinito ? 'text-blue-500' :
                            urna.estoque_atual <= 0 ? 'text-red-500' :
                            urna.estoque_atual <= 2 ? 'text-amber-500' :
                            'text-slate-400'
                          }`}>
                            {urna.estoque_infinito ? '∞' : `${urna.estoque_atual} un`}
                          </span>
                          {urna.preco && urna.preco > 0 && (
                            <span className="text-xs font-semibold text-green-400">R$ {urna.preco.toFixed(0)}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-6">
                  {(() => {
                    const porCategoria = new Map<string, Produto[]>()
                    urnasFiltradas.forEach(u => {
                      const cat = u.categoria || 'Sem categoria'
                      if (!porCategoria.has(cat)) porCategoria.set(cat, [])
                      porCategoria.get(cat)!.push(u)
                    })
                    return [...porCategoria.entries()].map(([cat, prods]) => (
                      <div key={cat}>
                        <div className="flex items-center gap-2 mb-3">
                          <h4 className="text-sm font-semibold text-purple-300">{CATEGORIA_URNA_LABELS[cat] || cat}</h4>
                          <span className="text-xs text-slate-400">({prods.length})</span>
                          <div className="flex-1 h-px bg-purple-900/40" />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                          {prods.map((urna) => (
                            <button
                              key={urna.id}
                              onClick={() => setUrnaSelecionada(urna)}
                              className={`rounded-xl border-2 overflow-hidden transition-all hover:shadow-lg ${
                                urnaSelecionada?.id === urna.id
                                  ? 'border-purple-500 ring-2 ring-purple-200'
                                  : 'border-slate-600 hover:border-purple-300'
                              }`}
                            >
                              <div className="aspect-square bg-slate-700 relative">
                                <img
                                  src={urna.imagem_url || getImagemUrna(urna.codigo)}
                                  alt={urna.nome}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement
                                    const currentSrc = target.src
                                    if (currentSrc.endsWith('.png')) {
                                      target.src = `/estoque/${urna.codigo}.jpg`
                                    } else {
                                      target.style.display = 'none'
                                    }
                                  }}
                                />
                                {urnaSelecionada?.id === urna.id && (
                                  <div className="absolute top-2 right-2 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                )}
                                {!urna.estoque_infinito && urna.estoque_atual <= 0 && (
                                  <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-red-500 rounded text-white text-[10px] font-bold">
                                    {urna.estoque_atual}
                                  </div>
                                )}
                              </div>
                              <div className="p-2 text-left">
                                <p className="font-medium text-slate-200 text-sm line-clamp-2 min-h-[2.5rem]">{urna.nome}</p>
                                <div className="flex justify-between items-center mt-1">
                                  <span className={`text-xs font-semibold ${
                                    urna.estoque_infinito ? 'text-blue-500' :
                                    urna.estoque_atual <= 0 ? 'text-red-500' :
                                    urna.estoque_atual <= 2 ? 'text-amber-500' :
                                    'text-slate-400'
                                  }`}>
                                    {urna.estoque_infinito ? '∞' : `${urna.estoque_atual} un`}
                                  </span>
                                  {urna.preco && urna.preco > 0 && (
                                    <span className="text-xs font-semibold text-green-400">R$ {urna.preco.toFixed(0)}</span>
                                  )}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  })()}
                </div>
              )}
            </div>

            {/* Footer com urna selecionada e botões */}
            <div className="p-4 border-t bg-slate-700/50">
              {urnaSelecionada ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={urnaSelecionada.imagem_url || getImagemUrna(urnaSelecionada.codigo)}
                      alt=""
                      className="w-12 h-12 rounded-lg object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        if (target.src.endsWith('.png')) {
                          target.src = `/estoque/${urnaSelecionada.codigo}.jpg`
                        }
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-200 line-clamp-1">{urnaSelecionada.nome}</p>
                      <p className="text-xs text-slate-400">{urnaSelecionada.codigo}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setUrnaPrecoForm({
                        precoCustom: '',
                        descontoTipo: 'percent',
                        descontoPercent: '',
                        descontoValor: '',
                      })
                      setUrnaModal(false)
                      setUrnaConfirmacao(true)
                    }}
                    disabled={salvandoUrna}
                    className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Avançar
                  </button>
                </div>
              ) : (
                <p className="text-center text-slate-400">Selecione uma urna acima</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmação Urna (passo 2 - preço e desconto) */}
      {urnaConfirmacao && urnaSelecionada && urnaContrato && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setUrnaConfirmacao(false); setUrnaModal(true) }}>
          <div className="bg-slate-800 rounded-2xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-slate-200">Confirmar Urna</h3>
              <button onClick={() => { setUrnaConfirmacao(false); unhighlightContrato(); }} className="text-slate-400 hover:text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Produto selecionado */}
            <div className="p-4">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-20 h-20 rounded-lg bg-slate-700 overflow-hidden flex-shrink-0">
                  <img
                    src={urnaSelecionada.imagem_url || getImagemUrna(urnaSelecionada.codigo)}
                    alt={urnaSelecionada.nome}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      if (target.src.endsWith('.png')) {
                        target.src = `/estoque/${urnaSelecionada.codigo}.jpg`
                      }
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-200 line-clamp-2">{urnaSelecionada.nome}</p>
                  <p className="text-xs text-slate-400">{urnaSelecionada.codigo}</p>
                  {/* Preço editável */}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-slate-400">R$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={typeof urnaPrecoForm.precoCustom === 'number' ? urnaPrecoForm.precoCustom : (urnaSelecionada.preco || 0)}
                      onChange={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : ''
                        setUrnaPrecoForm(prev => ({ ...prev, precoCustom: val }))
                      }}
                      className="w-28 px-2 py-1 text-lg font-bold text-green-400 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-green-900/30/50"
                    />
                    {typeof urnaPrecoForm.precoCustom === 'number' && urnaPrecoForm.precoCustom !== (urnaSelecionada.preco || 0) && (
                      <span className="text-xs text-slate-400 line-through">
                        {formatarMoeda(urnaSelecionada.preco)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Opções de desconto */}
              <div className="space-y-3 p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-300">Desconto</label>
                  <div className="flex bg-slate-700 rounded-lg p-0.5 border">
                    <button
                      type="button"
                      onClick={() => setUrnaPrecoForm(prev => ({ ...prev, descontoTipo: 'percent', descontoValor: '' }))}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        urnaPrecoForm.descontoTipo === 'percent'
                          ? 'bg-purple-900/40 text-purple-300'
                          : 'text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => setUrnaPrecoForm(prev => ({ ...prev, descontoTipo: 'valor', descontoPercent: '' }))}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        urnaPrecoForm.descontoTipo === 'valor'
                          ? 'bg-purple-900/40 text-purple-300'
                          : 'text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      R$
                    </button>
                  </div>
                </div>

                {/* Botões de desconto rápido - Percentual */}
                {urnaPrecoForm.descontoTipo === 'percent' && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[100, 50, 30, 25, 20, 10].map(percent => (
                      <button
                        key={percent}
                        type="button"
                        onClick={() => setUrnaPrecoForm(prev => ({
                          ...prev,
                          descontoPercent: prev.descontoPercent === percent ? '' : percent
                        }))}
                        className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                          urnaPrecoForm.descontoPercent === percent
                            ? percent === 100
                              ? 'bg-green-600 text-white'
                              : 'bg-amber-500 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600 border'
                        }`}
                      >
                        {percent === 100 ? '🎁' : `-${percent}%`}
                      </button>
                    ))}
                    <div className="flex items-center gap-1 ml-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        placeholder="__"
                        value={typeof urnaPrecoForm.descontoPercent === 'number' && ![100, 50, 30, 25, 20, 10].includes(urnaPrecoForm.descontoPercent) ? urnaPrecoForm.descontoPercent : ''}
                        onChange={(e) => setUrnaPrecoForm(prev => ({
                          ...prev,
                          descontoPercent: e.target.value ? parseFloat(e.target.value) : ''
                        }))}
                        className="w-12 px-1 py-1 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-purple-500 text-center"
                      />
                      <span className="text-xs text-slate-400">%</span>
                    </div>
                  </div>
                )}

                {/* Botões de desconto rápido - Valor */}
                {urnaPrecoForm.descontoTipo === 'valor' && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[100, 80, 50, 30, 20].map(valor => (
                      <button
                        key={valor}
                        type="button"
                        onClick={() => setUrnaPrecoForm(prev => ({
                          ...prev,
                          descontoValor: prev.descontoValor === valor ? '' : valor
                        }))}
                        className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                          urnaPrecoForm.descontoValor === valor
                            ? 'bg-amber-500 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600 border'
                        }`}
                      >
                        -R${valor}
                      </button>
                    ))}
                    <div className="flex items-center gap-1 ml-1">
                      <span className="text-xs text-slate-400">R$</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="__"
                        value={typeof urnaPrecoForm.descontoValor === 'number' && ![100, 80, 50, 30, 20].includes(urnaPrecoForm.descontoValor) ? urnaPrecoForm.descontoValor : ''}
                        onChange={(e) => setUrnaPrecoForm(prev => ({
                          ...prev,
                          descontoValor: e.target.value ? parseFloat(e.target.value) : ''
                        }))}
                        className="w-14 px-1 py-1 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-purple-500 text-center"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Resumo valor final */}
              <div className="mt-4 p-3 bg-slate-700/50 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">Valor final:</span>
                  <span className="text-xl font-bold text-slate-200">
                    {(() => {
                      const precoOrig = urnaSelecionada.preco || 0
                      const preco = typeof urnaPrecoForm.precoCustom === 'number' ? urnaPrecoForm.precoCustom : precoOrig
                      let descontoUnit = 0
                      if (urnaPrecoForm.descontoTipo === 'percent' && urnaPrecoForm.descontoPercent) {
                        descontoUnit = preco * (Number(urnaPrecoForm.descontoPercent) / 100)
                      } else if (urnaPrecoForm.descontoTipo === 'valor' && urnaPrecoForm.descontoValor) {
                        descontoUnit = Number(urnaPrecoForm.descontoValor)
                      }
                      const valorFinal = Math.max(0, preco - descontoUnit)
                      if (urnaPrecoForm.descontoPercent === 100 || descontoUnit >= preco) {
                        return 'GRATIS'
                      }
                      return formatarMoeda(valorFinal)
                    })()}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 border-t">
              <button
                onClick={() => {
                  setUrnaConfirmacao(false)
                  setUrnaModal(true)
                }}
                className="px-4 py-2 text-slate-400 hover:text-slate-200 transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={() => {
                  setUrnaConfirmacao(false)
                  salvarUrna()
                }}
                disabled={salvandoUrna}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {salvandoUrna ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Certificado - Nomes para o certificado */}
      {certificadoContrato && (
        <CertificadoModal
          isOpen={certificadoModal}
          onClose={() => { setCertificadoModal(false); unhighlightContrato(); }}
          contrato={certificadoContrato}
          onSuccess={(updated) => {
            setContratos(prev => prev.map(c =>
              c.id === updated.id ? { ...c, ...updated } : c
            ))
          }}
        />
      )}

      {/* Modal Fotos Pendentes */}
      {fotoModal && fotoContrato && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setFotoModal(false); unhighlightContrato(); }}>
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-200">📷 Fotos dos Produtos</h3>
              <button onClick={() => { setFotoModal(false); unhighlightContrato(); }} className="text-slate-400 hover:text-slate-400">
                ✕
              </button>
            </div>

            <p className="text-sm text-slate-400 mb-4">
              <strong>{fotoContrato.pet_nome}</strong> - {fotoContrato.codigo}
            </p>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {fotoContrato.contrato_produtos
                ?.filter(cp => cp.produto?.precisa_foto === true)
                .map(cp => (
                  <div
                    key={cp.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      cp.foto_recebida ? 'bg-green-900/30 border-green-700' : 'bg-yellow-900/30 border-yellow-700'
                    }`}
                  >
                    {/* Info do produto */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-200 text-sm">{cp.produto?.nome}</p>
                    </div>

                    {/* Botão check */}
                    <button
                      onClick={() => toggleFotoRecebidaPipeline(cp.id, cp.foto_recebida)}
                      className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors ${
                        cp.foto_recebida
                          ? 'bg-green-500 text-white hover:bg-green-600'
                          : 'bg-slate-600 text-slate-400 hover:bg-yellow-400 hover:text-white'
                      }`}
                      title={cp.foto_recebida ? 'Foto recebida - clique para desmarcar' : 'Clique para marcar foto como recebida'}
                    >
                      {cp.foto_recebida ? '✓' : '📷'}
                    </button>
                  </div>
                ))}

              {(!fotoContrato.contrato_produtos || fotoContrato.contrato_produtos.filter(cp => cp.produto?.precisa_foto === true).length === 0) && (
                <p className="text-center text-slate-400 py-4">Nenhum produto requer foto</p>
              )}
            </div>

            <div className="mt-4 pt-4 border-t flex justify-end">
              <button
                onClick={() => { setFotoModal(false); unhighlightContrato(); }}
                className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Marcar Entregue */}
      {entregaContrato && (
        <EntregaModal
          isOpen={entregaModal}
          onClose={() => setEntregaModal(false)}
          contrato={entregaContrato}
          onSuccess={(updated) => {
            const statusAnterior = entregaContrato.status
            if (statusFiltro && statusFiltro !== 'finalizado') {
              setContratos(prev => prev.filter(c => c.id !== updated.id))
              setTotal(prev => Math.max(0, prev - 1))
            } else {
              setContratos(prev => prev.map(c =>
                c.id === updated.id ? { ...c, status: updated.status, data_entrega: updated.data_entrega } : c
              ))
            }
            setStatusCounts(prev => ({
              ...prev,
              [statusAnterior]: Math.max(0, (prev[statusAnterior] || 0) - 1),
              finalizado: (prev.finalizado || 0) + 1,
            }))
          }}
        />
      )}

      {/* Modal Supinda - Seleção/Criação */}
      {supindaModal && supindaContrato && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSupindaModal(false)}>
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-200">🚐 Selecionar Supinda</h3>
              <button onClick={() => setSupindaModal(false)} className="text-slate-400 hover:text-slate-400">
                ✕
              </button>
            </div>

            <p className="text-sm text-slate-400 mb-4">
              <strong>{supindaContrato.pet_nome}</strong> - {supindaContrato.codigo}
              {supindaContrato.pet_peso && <span className="ml-2 text-xs text-slate-400">({supindaContrato.pet_peso}kg)</span>}
            </p>

            {/* Toggle criar nova */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setCriarNovaSupinda(false)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  !criarNovaSupinda ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                Selecionar Existente
              </button>
              <button
                onClick={() => setCriarNovaSupinda(true)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  criarNovaSupinda ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                + Criar Nova
              </button>
            </div>

            {!criarNovaSupinda ? (
              /* Lista de supindas disponíveis */
              <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                {supindasDisponiveis.length === 0 ? (
                  <p className="text-center text-slate-400 py-4">Nenhuma supinda planejada</p>
                ) : (
                  supindasDisponiveis.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSupindaSelecionada(s.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-colors ${
                        supindaSelecionada === s.id
                          ? 'border-orange-500 bg-orange-900/30'
                          : 'border-slate-600 hover:border-orange-300 hover:bg-orange-900/30/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl font-bold text-orange-400">#{s.numero}</span>
                        <div className="text-left">
                          <p className="text-sm font-medium text-slate-200">
                            {new Date(s.data + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                          </p>
                          {s.responsavel && <p className="text-xs text-slate-400">{s.responsavel}</p>}
                        </div>
                      </div>
                      <div className="text-right text-xs text-slate-400">
                        <p>{s.quantidade_pets || 0} pets</p>
                        <p>{s.peso_total?.toFixed(1) || 0}kg</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : (
              /* Formulário para criar nova supinda */
              <div className="space-y-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Data da Supinda</label>
                  <div className="flex gap-2 mb-2">
                    {(() => {
                      const { sabado, domingo, hoje } = getProximoFimDeSemana()
                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => setNovaSupindaForm({ ...novaSupindaForm, data: domingo })}
                            className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                              novaSupindaForm.data === domingo
                                ? 'bg-orange-500 text-white border-orange-500'
                                : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-orange-900/30'
                            }`}
                          >
                            Próx. Domingo
                          </button>
                          <button
                            type="button"
                            onClick={() => setNovaSupindaForm({ ...novaSupindaForm, data: sabado })}
                            className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                              novaSupindaForm.data === sabado
                                ? 'bg-orange-500 text-white border-orange-500'
                                : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-orange-900/30'
                            }`}
                          >
                            Próx. Sábado
                          </button>
                          <button
                            type="button"
                            onClick={() => setNovaSupindaForm({ ...novaSupindaForm, data: hoje })}
                            className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                              novaSupindaForm.data === hoje
                                ? 'bg-orange-500 text-white border-orange-500'
                                : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-orange-900/30'
                            }`}
                          >
                            Hoje
                          </button>
                        </>
                      )
                    })()}
                  </div>
                  <input
                    type="date"
                    value={novaSupindaForm.data}
                    onChange={(e) => setNovaSupindaForm({ ...novaSupindaForm, data: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Responsável (opcional)</label>
                  <select
                    value={novaSupindaForm.responsavel}
                    onChange={(e) => setNovaSupindaForm({ ...novaSupindaForm, responsavel: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Não definido</option>
                    {funcionarios.map(f => (
                      <option key={f.id} value={f.nome}>{f.nome}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Se já tem supinda, mostrar botão de remover */}
            {supindaContrato.supinda_id && (
              <div className="mb-4 p-3 bg-slate-700 rounded-lg flex items-center justify-between">
                <span className="text-sm text-slate-400">
                  Atual: <strong className="text-orange-400">#{supindaContrato.supinda?.numero}</strong>
                </span>
                <button
                  onClick={removerSupinda}
                  disabled={salvandoSupinda}
                  className="text-sm text-red-400 hover:text-red-300 font-medium"
                >
                  Remover
                </button>
              </div>
            )}

            {/* Botões */}
            <div className="flex gap-2">
              <button
                onClick={() => setSupindaModal(false)}
                className="flex-1 py-2 px-4 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={salvarSupinda}
                disabled={salvandoSupinda || (!criarNovaSupinda && !supindaSelecionada) || (criarNovaSupinda && !novaSupindaForm.data)}
                className="flex-1 py-2 px-4 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
              >
                {salvandoSupinda ? 'Salvando...' : criarNovaSupinda ? 'Criar e Vincular' : 'Vincular'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rescaldos (via contrato_produtos) */}
      {rescaldoModal && rescaldoContrato && (() => {
        const rescaldosNoContrato = (rescaldoContrato.contrato_produtos || []).filter(cp => cp.produto?.rescaldo_tipo || cp.produto?.codigo === '0002')
        const temNenhum = rescaldosNoContrato.some(cp => cp.produto?.codigo === '0002')
        const rescaldosReais = rescaldosNoContrato.filter(cp => cp.produto?.codigo !== '0002')
        const produtosDisponiveis = produtosRescaldo.filter(p =>
          (buscaRescaldo ? p.nome.toLowerCase().includes(buscaRescaldo.toLowerCase()) || p.codigo.toLowerCase().includes(buscaRescaldo.toLowerCase()) : true)
        )

        const RESCALDO_TIPO_LABELS: Record<string, { label: string; icon: string }> = {
          molde_patinha: { label: 'Molde de Patinha', icon: '🐾' },
          pelo_extra: { label: 'Pelo Extra', icon: '✂️' },
          carimbo: { label: 'Carimbo', icon: '📄' },
        }

        const porTipo = new Map<string, typeof produtosDisponiveis>()
        produtosDisponiveis.forEach(p => {
          const tipo = p.rescaldo_tipo || 'outro'
          if (!porTipo.has(tipo)) porTipo.set(tipo, [])
          porTipo.get(tipo)!.push(p)
        })

        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setRescaldoModal(false); unhighlightContrato(); }}>
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-200">🐾 Rescaldos — {rescaldoContrato.pet_nome}</h3>
              <button onClick={() => { setRescaldoModal(false); unhighlightContrato(); }} className="text-slate-400 hover:text-slate-200">
                ✕
              </button>
            </div>

            <p className="text-sm text-slate-400 mb-4">{rescaldoContrato.codigo}</p>

            {/* Marcado como "Nenhum rescaldo" */}
            {temNenhum && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-red-700 bg-red-900/30 mb-4">
                <span className="text-lg">🚫</span>
                <div className="flex-1">
                  <p className="font-medium text-red-300 text-sm">Nenhum rescaldo</p>
                  <p className="text-xs text-red-400">Tutor não quer rescaldo</p>
                </div>
                <button
                  onClick={() => {
                    const cpNenhum = rescaldosNoContrato.find(cp => cp.produto?.codigo === '0002')
                    if (cpNenhum) removerProdutoRescaldo(cpNenhum.id, cpNenhum.produto_id)
                  }}
                  className="flex items-center justify-center w-9 h-9 rounded-full bg-red-900/40 text-red-500 hover:bg-red-900/50 transition-colors"
                  title="Remover"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Seção 1: Rescaldos no contrato */}
            <div className="space-y-2 mb-4">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">No contrato</p>
              {rescaldosReais.length === 0 && !temNenhum && (
                <p className="text-center text-slate-400 py-3 text-sm">Nenhum rescaldo adicionado</p>
              )}
              {rescaldosReais.map(cp => (
                <div
                  key={cp.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    cp.rescaldo_feito ? 'bg-green-900/30 border-green-700' : 'bg-amber-900/30 border-amber-700'
                  }`}
                >
                  {cp.produto?.imagem_url && (
                    <img src={cp.produto.imagem_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-200 text-sm truncate">{cp.produto?.nome || 'Produto'}</p>
                    <p className={`text-xs ${cp.rescaldo_feito ? 'text-green-400' : 'text-amber-400'}`}>
                      {cp.rescaldo_feito ? '✅ Feito' : '⏳ Pendente'}
                    </p>
                  </div>

                  {/* Toggle feito */}
                  <button
                    onClick={() => toggleRescaldoFeito(cp.id, !cp.rescaldo_feito)}
                    className={`flex items-center justify-center w-9 h-9 rounded-full transition-colors ${
                      cp.rescaldo_feito
                        ? 'bg-green-500 text-white hover:bg-green-600'
                        : 'bg-slate-600 text-slate-400 hover:bg-amber-400 hover:text-white'
                    }`}
                    title={cp.rescaldo_feito ? 'Marcar como pendente' : 'Marcar como feito'}
                  >
                    {cp.rescaldo_feito ? '✓' : '○'}
                  </button>

                  {/* Remover */}
                  <button
                    onClick={() => removerProdutoRescaldo(cp.id, cp.produto_id)}
                    className="flex items-center justify-center w-9 h-9 rounded-full bg-red-900/40 text-red-500 hover:bg-red-900/50 transition-colors"
                    title="Remover produto de rescaldo"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Seção 2: Adicionar produto de rescaldo — agrupado por tipo */}
            {!temNenhum && (
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Adicionar</p>
                  {/* Botão "Nenhum rescaldo" */}
                  <button
                    onClick={async () => {
                      setSalvandoRescaldo(true)
                      const { data: prod } = await supabase
                        .from('produtos')
                        .select('id, codigo, nome, tipo, rescaldo_tipo, preco, imagem_url')
                        .eq('codigo', '0002')
                        .single()
                      if (prod) {
                        await adicionarProdutoRescaldo(prod as typeof produtosRescaldo[0])
                      }
                      setSalvandoRescaldo(false)
                    }}
                    disabled={salvandoRescaldo}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-700 bg-red-900/30 hover:bg-red-900/50 transition-colors text-red-300 text-xs font-medium disabled:opacity-50"
                  >
                    🚫 Nenhum rescaldo
                  </button>
                </div>
                <input
                  type="text"
                  value={buscaRescaldo}
                  onChange={e => setBuscaRescaldo(e.target.value)}
                  placeholder="Buscar por nome ou codigo..."
                  className="w-full px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 mb-3"
                />
                <div className="space-y-4 max-h-60 overflow-y-auto">
                  {[...porTipo.entries()].map(([tipo, prods]) => {
                    const info = RESCALDO_TIPO_LABELS[tipo] || { label: tipo, icon: '💎' }
                    return (
                      <div key={tipo}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm">{info.icon}</span>
                          <h4 className="text-xs font-semibold text-purple-300">{info.label}</h4>
                          <span className="text-xs text-slate-500">({prods.length})</span>
                          <div className="flex-1 h-px bg-purple-900/40" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {prods.map(p => (
                            <button
                              key={p.id}
                              onClick={() => adicionarProdutoRescaldo(p)}
                              disabled={salvandoRescaldo}
                              className="flex items-center gap-2 p-2 rounded-lg border border-purple-700 bg-purple-900/30 hover:bg-purple-900/50 transition-colors text-left disabled:opacity-50"
                            >
                              {p.imagem_url ? (
                                <img src={p.imagem_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded bg-purple-900/40 flex items-center justify-center flex-shrink-0 text-xs">{info.icon}</div>
                              )}
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-slate-200 truncate">{p.nome}</p>
                                {p.preco ? <p className="text-[10px] text-slate-400">R$ {p.preco.toFixed(2)}</p> : null}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  {porTipo.size === 0 && (
                    <p className="text-center text-slate-400 py-2 text-sm">Nenhum produto encontrado</p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t flex justify-end">
              <button
                onClick={() => { setRescaldoModal(false); unhighlightContrato(); }}
                className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
        )
      })()}
    </div>
  )
}

export default function ContratosPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div></div>}>
      <ContratosContent />
    </Suspense>
  )
}
