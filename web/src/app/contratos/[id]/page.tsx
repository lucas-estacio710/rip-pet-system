'use client'

import { useEffect, useState, useRef } from 'react'
import FichaRemocao from '@/components/fichas/FichaRemocao'
import { captureElementAsBlob, fichaFilename } from '@/lib/ficha-generator'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, User, Phone, Mail, MapPin, DollarSign, FileText, X, Search, Plus, Pencil, Trash2, Check, Copy, Package, AlertTriangle, Star, Download, Share2, Receipt, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { copyToClipboard } from '@/lib/clipboard'
import Link from 'next/link'
import { ProtocoloData, getNomeRetorno, isProtocoloExcluido, montarProtocoloData, normalizarProtocoloData, formatarValor } from '@/components/protocolo/protocolo-utils'
import ProtocoloEntrega from '@/components/protocolo/ProtocoloEntrega'
import { printProtocolos } from '@/components/protocolo/ProtocoloPrint'
import InteractiveTags from '@/components/contratos/InteractiveTags'
import ActionButtons from '@/components/contratos/ActionButtons'
import EntregaModal from '@/components/contratos/modals/EntregaModal'
import GCTracking from '@/components/contratos/gc/GCTracking'
import { useUnit } from '@/contexts/UnitContext'
import { useFieldPermission } from '@/hooks/useFieldPermission'
import PelinhoModal from '@/components/contratos/modals/PelinhoModal'
import CertificadoModal from '@/components/contratos/modals/CertificadoModal'
import AtivarModal from '@/components/contratos/modals/AtivarModal'
import FinalizadoraModal from '@/components/contratos/modals/FinalizadoraModal'
import ChegamosModal from '@/components/contratos/modals/ChegamosModal'
import ChegaramModal from '@/components/contratos/modals/ChegaramModal'
import { gerarContratoPDF, contratoFilename } from '@/lib/contrato-pdf'
import ObservacoesCard from '@/components/contratos/ObservacoesCard'
import HistoricoCard from '@/components/contratos/HistoricoCard'

function PixIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" fill="currentColor">
      <path d="M242.4 292.5C247.8 287.1 257.1 287.1 262.5 292.5L339.5 369.5C353.7 383.7 372.6 391.5 392.6 391.5H407.7L310.6 488.6C280.3 518.1 231.1 518.1 200.8 488.6L103.3 391.2H112.6C132.6 391.2 151.5 383.4 165.7 369.2L242.4 292.5zM262.5 218.9C256.1 224.4 247.9 224.5 242.4 218.9L165.7 142.2C151.5 127.1 132.6 120.2 112.6 120.2H103.3L200.7 22.76C231.1-7.586 280.3-7.586 310.6 22.76L407.8 119.9H392.6C372.6 119.9 353.7 127.7 339.5 141.9L262.5 218.9zM112.6 142.7C126.4 142.7 139.1 148.3 149.7 158.1L226.4 234.8C233.6 241.1 243 245.6 252.5 245.6C261.9 245.6 271.3 241.1 278.5 234.8L355.5 157.8C365.3 148.1 378.8 142.5 392.6 142.5H430.3L488.6 200.8C518.9 231.1 518.9 280.3 488.6 310.6L430.3 368.9H392.6C378.8 368.9 365.3 363.3 355.5 353.5L278.5 276.5C264.6 262.6 240.3 262.6 226.4 276.6L149.7 353.2C139.1 363 126.4 368.6 112.6 368.6H80.78L22.76 310.6C-7.586 280.3-7.586 231.1 22.76 200.8L80.78 142.7H112.6z"/>
    </svg>
  )
}

function PaymentIcon({ metodo, bandeira, size = 'lg' }: { metodo: string; bandeira?: string | null; size?: 'sm' | 'lg' }) {
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5'
  const imgSize = size === 'sm' ? 'h-4' : 'h-6'

  if (metodo === 'pix') return <PixIcon className={`${iconSize} text-[#32BCAD]`} />
  if ((metodo === 'credito' || metodo === 'debito' || metodo === 'cartao') && bandeira) {
    return <img src={`/bandeiras/${bandeira === 'master' ? 'mastercard' : bandeira}.png`} alt={bandeira} className={`${imgSize} w-auto`} />
  }
  if (metodo === 'credito' || metodo === 'debito' || metodo === 'cartao') return <span className={size === 'sm' ? 'text-sm' : 'text-lg'}>💳</span>
  return <span className={size === 'sm' ? 'text-sm' : 'text-lg'}>💵</span>
}

type Produto = {
  id: string
  codigo: string
  nome: string
  tipo: 'urna' | 'acessorio' | 'incluso'
  categoria: string | null
  preco: number | null
  estoque_atual: number
  estoque_minimo: number
  imagem_url: string | null
  estoque_infinito?: boolean
  precisa_foto?: boolean
  rescaldo_tipo: string | null
}

// Labels das categorias
const CATEGORIA_URNA_LABELS: Record<string, string> = {
  'Arca/Sleeping': 'Arca/Sleeping',
  'Porta/Box': 'Porta/Box',
  'Pedras': 'Pedras',
  'High Prices': 'High Prices',
  'Low Prices': 'Low Prices',
  'Avulsos Legado RIP': 'Avulsos Legado',
}

const CATEGORIA_ACESSORIO_LABELS: Record<string, string> = {
  'Chaveiros Cinzas': 'Chaveiros Cinzas',
  'Porta-Pelos': 'Porta-Pelos',
  'Porta-Cinzas': 'Porta-Cinzas',
  'Porta-Retratos': 'Porta-Retratos',
  'Miniaturas': 'Miniaturas',
  'Outros': 'Outros',
}

const TIPO_LABELS: Record<string, string> = {
  urna: 'Urna',
  acessorio: 'Acessório',
  incluso: 'Incluso'
}

const TIPO_COLORS: Record<string, string> = {
  urna: 'bg-purple-900/40 text-purple-400',
  acessorio: 'bg-blue-900/40 text-blue-400',
  incluso: 'bg-green-900/40 text-green-400'
}

type ContratoProduto = {
  id: string
  quantidade: number
  valor: number | null
  desconto: number | null
  is_reserva_pv: boolean
  separado: boolean
  foto_recebida: boolean
  foto_url: string | null
  rescaldo_feito: boolean
  produto: Produto
}

type Conta = {
  id: string
  nome: string
}

type TaxaCartao = {
  id: string
  tipo: string
  nome: string
  percentual: number
  ordem: number
}

type Pagamento = {
  id: string
  contrato_id: string
  tipo: 'plano' | 'catalogo'
  metodo: string
  conta_id: string | null
  conta: Conta | null
  valor: number
  desconto: number | null
  taxa: number | null
  valor_liquido_sem_taxa: number | null
  valor_liquido: number | null
  parcelas: number
  is_seguradora: boolean
  data_pagamento: string | null
  mes_competencia: string | null
  bandeira: string | null
  id_transacao: string | null
}

type Tutor = {
  id: string
  nome: string
  cpf: string | null
  telefone: string | null
  telefone2: string | null
  telefone_nome: string | null
  telefone2_nome: string | null
  telefone_principal: number | null
  email: string | null
  cep: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
}

type Contrato = {
  id: string
  codigo: string
  unidade_id: string
  pet_nome: string
  pet_especie: string | null
  pet_raca: string | null
  pet_cor: string | null
  pet_genero: string | null
  pet_idade_anos: number | null
  pet_peso: number | null
  tutor_id: string | null
  tutor: Tutor | null
  // Campos legados mantidos para compatibilidade
  tutor_nome: string
  tutor_cpf: string | null
  tutor_telefone: string | null
  tutor_telefone2: string | null
  tutor_telefone_nome: string | null
  tutor_telefone2_nome: string | null
  tutor_telefone_principal: number | null
  tutor_email: string | null
  tutor_cep: string | null
  tutor_endereco: string | null
  tutor_numero: string | null
  tutor_complemento: string | null
  tutor_bairro: string | null
  tutor_cidade: string | null
  tutor_estado: string | null
  local_coleta: string | null
  tipo_cremacao: string
  tipo_plano: string
  status: string
  data_contrato: string | null
  data_acolhimento: string | null
  funcionario_id: string | null
  funcionario?: { nome: string } | null
  estabelecimento_id: string | null
  estabelecimento_coleta?: { nome: string } | null
  clinica_coleta: string | null
  data_leva_pinda: string | null
  data_cremacao: string | null
  data_retorno: string | null
  data_entrega: string | null
  numero_lacre: string | null
  valor_plano: number | null
  valor_acessorios: number | null
  desconto_plano: number | null
  desconto_acessorios: number | null
  observacoes: string | null
  // NFS-e
  nfse_numero: string | null
  nfse_codigo_verificacao: string | null
  nfse_data: string | null
  nfse_status: string | null
  nfse_link_pdf: string | null
  // Protocolo de entrega salvo
  protocolo_data: ProtocoloData | null
  // Compartilhamento entre unidades
  unidade_remocao_id: string | null
  unidade_remocao: { id: string; codigo: string; nome: string } | null
  unidade_entrega_id: string | null
  unidade_entrega: { id: string; codigo: string; nome: string } | null
  // Pelinho (rescaldo padrão)
  pelinho_quer: boolean | null
  pelinho_feito: boolean
  pelinho_quantidade: number
  // Certificado
  certificado_nome_1: string | null
  certificado_nome_2: string | null
  certificado_nome_3: string | null
  certificado_nome_4: string | null
  certificado_nome_5: string | null
  certificado_nome_6: string | null
  certificado_nome_7: string | null
  certificado_confirmado: boolean | null
  // Seguradora
  seguradora: string | null
  // Supinda
  supinda_id: string | null
  supinda?: { numero: string; data: string } | null
  // Velório e acompanhamento
  velorio_deseja: boolean | null
  acompanhamento_online: boolean | null
  acompanhamento_presencial: boolean | null
  // Pagamento (parcelas no 1º pagamento)
  parcelas: number | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; strip: string }> = {
  preventivo: { label: 'Preventivo', color: 'text-yellow-400', bg: 'bg-yellow-900/40', strip: '#eab308' },
  ativo: { label: '✝ Ativo', color: 'text-red-400', bg: 'bg-red-900/40', strip: '#dc2626' },
  pinda: { label: 'Em Pinda', color: 'text-orange-400', bg: 'bg-orange-900/40', strip: '#ea580c' },
  retorno: { label: 'Entrega', color: 'text-purple-400', bg: 'bg-purple-900/40', strip: '#7c3aed' },
  pendente: { label: 'Pendente', color: 'text-amber-400', bg: 'bg-amber-900/40', strip: '#d97706' },
  finalizado: { label: 'Finalizado', color: 'text-slate-400', bg: 'bg-slate-700', strip: '#6b7280' },
}

// Configuração de complexidade de montagem (1-5)
const COMPLEXIDADE_CONFIG: Record<number, { label: string; desc: string; color: string; bg: string; border: string }> = {
  1: { label: '1', desc: 'Coletiva', color: 'text-emerald-400', bg: 'bg-emerald-900/30', border: 'border-emerald-400' },
  2: { label: '2', desc: 'Ind. só urna', color: 'text-green-400', bg: 'bg-green-900/30', border: 'border-green-400' },
  3: { label: '3', desc: 'Col. c/ lembranças', color: 'text-yellow-400', bg: 'bg-yellow-900/30', border: 'border-yellow-400' },
  4: { label: '4', desc: 'Ind. c/ acessórios', color: 'text-orange-400', bg: 'bg-orange-900/30', border: 'border-orange-400' },
  5: { label: '5', desc: 'Ind. acess. + foto', color: 'text-red-400', bg: 'bg-red-900/30', border: 'border-red-400' },
}

// Itens que NÃO contam para dificuldade de montagem
const ITENS_IGNORAR_MONTAGEM = [
  'nenhum rescaldo',
  'certificado de cremação',
  'protocolo de retorno',
  'pelinho',
  'retorno de itens pessoais',
  'nenhuma urna',
]

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

export default function ContratoDetalhe() {
  const params = useParams()
  const router = useRouter()
  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [loading, setLoading] = useState(true)
  // Prompt "Adicionar nova ou Trocar?" quando user adiciona urna mas já existe outra no contrato
  const [trocaUrnaPrompt, setTrocaUrnaPrompt] = useState<{ urnaAnterior: ContratoProduto } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [contratoProdutos, setContratoProdutos] = useState<ContratoProduto[]>([])
  const [carregandoProdutos, setCarregandoProdutos] = useState(true)
  const [addProdutoModal, setAddProdutoModal] = useState(false)
  const [todosProdutos, setTodosProdutos] = useState<Produto[]>([])
  const [buscaProduto, setBuscaProduto] = useState('')
  const [filtroProdutoTipo, setFiltroProdutoTipo] = useState<string>('')
  const [filtroProdutoCategoria, setFiltroProdutoCategoria] = useState<string>('')
  const [editandoProduto, setEditandoProduto] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ quantidade: 1, valor: 0, desconto: '' as number | '' })
  // Modal de confirmação ao adicionar produto
  const [produtoParaAdicionar, setProdutoParaAdicionar] = useState<Produto | null>(null)
  const [addProdutoForm, setAddProdutoForm] = useState({
    quantidade: 1,
    precoCustom: '' as number | '',
    descontoTipo: 'percent' as 'percent' | 'valor',
    descontoPercent: '' as number | '',
    descontoValor: '' as number | ''
  })
  const [mostrarOpcoesProduto, setMostrarOpcoesProduto] = useState(false)
  // NFS-e
  const [emitindoNf, setEmitindoNf] = useState(false)
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const [nfMensagem, setNfMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  // Pagamentos
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [carregandoPagamentos, setCarregandoPagamentos] = useState(true)
  const [pagamentoModal, setPagamentoModal] = useState(false)
  const [editandoPagamento, setEditandoPagamento] = useState<Pagamento | null>(null)
  const [contas, setContas] = useState<Conta[]>([])
  const [pagamentoForm, setPagamentoForm] = useState({
    tipo: 'plano' as 'plano' | 'catalogo',
    metodo: 'pix',
    conta_id: '',
    valor: '',
    desconto: '',
    parcelas: 1,
    is_seguradora: false,
    data_pagamento: new Date().toISOString().split('T')[0],
  })
  // Mega Pagamento (quitar saldo / novo pagamento / editar)
  const [megaPagamentoModal, setMegaPagamentoModal] = useState(false)
  const [megaPagamentoEditando, setMegaPagamentoEditando] = useState<Pagamento | null>(null)
  const [taxasCartao, setTaxasCartao] = useState<TaxaCartao[]>([])
  const [megaPagamentoForm, setMegaPagamentoForm] = useState({
    valorPlano: '',
    descontoPlano: '',
    descontoPlanoAtivo: false,
    valorAcessorio: '',
    descontoAcessorio: '',
    descontoAcessorioAtivo: false,
    descontoProporcionalizar: '',  // Valor a proporcionalizar entre plano e acessório
    metodo: 'pix' as 'pix' | 'cartao' | 'dinheiro',
    bandeira: 'master' as '' | 'master' | 'visa' | 'elo' | 'amex' | 'hiper',
    parcelas: '',  // debito, 1x, 2x, 3x...
    idTransacao: '',
    dataHoje: false,  // Flag para usar data de hoje (padrão: não marcado)
    data_pagamento: '',
  })
  // Pet Grato - mensagem de despedida do pet
  const [petGratoModal, setPetGratoModal] = useState(false)
  const [petGratoForm, setPetGratoForm] = useState({
    tutorNome: '',
    petNome: '',
    sexo: 'F' as 'M' | 'F',
    familia: 'F' as 'F' | 'S', // F = com familia, S = sozinho
  })

  // Telefone 2 - adicionar e trocar
  const [telefone2Modal, setTelefone2Modal] = useState(false)
  const [novoTelefone2, setNovoTelefone2] = useState('')
  const [novoTelefone2Nome, setNovoTelefone2Nome] = useState('')
  const [novoTelefone2DDI, setNovoTelefone2DDI] = useState('55')
  const [salvandoTelefone, setSalvandoTelefone] = useState(false)

  function maskPhone(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 11)
    return d.replace(/^(\d{2})(\d)/g, '($1) $2').replace(/(\d)(\d{4})$/, '$1-$2')
  }

  // Feedback de cópia dos códigos (header do contrato)
  const [codigoCopied, setCodigoCopied] = useState(false)
  const [refCopied, setRefCopied] = useState(false)

  // Editor inline de data_acolhimento (para preencher quando vier NULL)
  const [acolhEditing, setAcolhEditing] = useState(false)
  const [acolhDataInput, setAcolhDataInput] = useState('')
  const [acolhHoraInput, setAcolhHoraInput] = useState('')
  const [acolhSaving, setAcolhSaving] = useState(false)

  // Editor inline de valor_plano
  const [valorPlanoEditing, setValorPlanoEditing] = useState(false)
  const [valorPlanoInput, setValorPlanoInput] = useState('')
  const [valorPlanoSaving, setValorPlanoSaving] = useState(false)

  // Lacre inline edit
  const [lacrePopup, setLacrePopup] = useState(false)
  const [editandoLacre, setEditandoLacre] = useState(false)
  const [lacreTemp, setLacreTemp] = useState('')
  const [salvandoLacre, setSalvandoLacre] = useState(false)
  const lacreRef = useRef<HTMLDivElement>(null)

  // Modal Fotos Pendentes
  const [fotoModal, setFotoModal] = useState(false)

  // Modal Ficha de Remoção
  const [fichaModal, setFichaModal] = useState(false)
  const fichaRef = useRef<HTMLDivElement>(null)
  const [gerandoFicha, setGerandoFicha] = useState(false)

  // Modal Protocolo de Entrega (editável)
  const [protocoloEdit, setProtocoloEdit] = useState<ProtocoloData | null>(null)
  const [salvandoProtocolo, setSalvandoProtocolo] = useState(false)

  // Rescaldos (via contrato_produtos)
  const [rescaldoModal, setRescaldoModal] = useState(false)
  const [salvandoRescaldo, setSalvandoRescaldo] = useState(false)
  const [buscaRescaldo, setBuscaRescaldo] = useState('')
  const [produtosRescaldo, setProdutosRescaldo] = useState<Array<{ id: string; codigo: string; nome: string; tipo: string; rescaldo_tipo: string; preco: number | null; imagem_url: string | null }>>([])

  // Modais de ação (componentes compartilhados)
  const [chegamosModalOpen, setChegamosModalOpen] = useState(false)
  const [chegaramModalOpen, setChegaramModalOpen] = useState(false)
  const [finalizadoraModalOpen, setFinalizadoraModalOpen] = useState(false)
  const [ativarModalOpen, setAtivarModalOpen] = useState(false)
  const [entregaModalOpen, setEntregaModalOpen] = useState(false)
  const [pelinhoModalOpen, setPelinhoModalOpen] = useState(false)
  const [certificadoModalOpen, setCertificadoModalOpen] = useState(false)

  // Modal Compartilhar
  const [compartilharModal, setCompartilharModal] = useState(false)
  const [compartilharTipo, setCompartilharTipo] = useState<'remocao' | 'entrega'>('remocao')
  const [compartilharUnidadeId, setCompartilharUnidadeId] = useState('')
  const [salvandoCompartilhar, setSalvandoCompartilhar] = useState(false)
  const [todasUnidades, setTodasUnidades] = useState<{ id: string; codigo: string; nome: string }[]>([])

  const supabase = createClient()
  const { hasModule, currentUnit } = useUnit()
  const { canEdit, isVisible } = useFieldPermission()
  const T = 'tela_contrato' // tela FLS (detalhe do contrato)

  // Função para obter URL da imagem local
  function getImagemUrl(codigo: string): string {
    return `/estoque/${codigo}.png`
  }

  // Função auxiliar para ajustar estoque de um produto
  // quantidade positiva = creditar (devolver), negativa = debitar (retirar)
  // Ajusta estoque DA UNIDADE (produtos_estoque). Delta positivo = credita,
  // negativo = debita. Vai a negativo silenciosamente. estoque_infinito é
  // tratado server-side pela RPC.
  // unidadeId: passe contrato.unidade_id (a unidade que vendeu).
  async function ajustarEstoque(produtoId: string, quantidade: number, _estoqueInfinito?: boolean | null, unidadeId?: string) {
    const uid = unidadeId || contrato?.unidade_id
    if (!uid) {
      console.warn('[ajustarEstoque] sem unidade_id — pulando ajuste')
      return
    }
    const { error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)('ajustar_estoque_unidade', {
      p_produto_id: produtoId,
      p_unidade_id: uid,
      p_delta: quantidade,
    })
    if (error) console.error('[ajustarEstoque]', error)
  }

  // Variante por código do produto (usado em rescaldo). Resolve ID e chama o helper.
  async function ajustarEstoquePorCodigo(codigo: string, quantidade: number, unidadeId?: string) {
    const { data: produto } = await supabase
      .from('produtos')
      .select('id, estoque_infinito')
      .eq('codigo', codigo)
      .maybeSingle<{ id: string; estoque_infinito: boolean | null }>()
    if (!produto) return
    await ajustarEstoque(produto.id, quantidade, produto.estoque_infinito, unidadeId)
  }

  async function iniciarEdicaoAcolhimento() {
    if (!contrato) return

    function aplicarDate(d: Date) {
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      const hh = String(d.getHours()).padStart(2, '0')
      const min = String(d.getMinutes()).padStart(2, '0')
      setAcolhDataInput(`${yyyy}-${mm}-${dd}`)
      setAcolhHoraInput(`${hh}:${min}`)
    }

    // 1. Já tem no contrato? edita o existente
    if (contrato.data_acolhimento) {
      aplicarDate(new Date(contrato.data_acolhimento))
      setAcolhEditing(true)
      return
    }

    // 2. Tenta puxar da ficha vinculada (op_dados.dataHoraAcolhimento)
    try {
      const { data: fichaData } = await supabase
        .from('fichas')
        .select('op_dados')
        .eq('contrato_id', contrato.id)
        .maybeSingle()
      const op = (fichaData as { op_dados?: Record<string, unknown> } | null)?.op_dados ?? null
      const dha = op?.dataHoraAcolhimento as string | undefined
      if (dha) {
        const d = new Date(dha)
        if (!isNaN(d.getTime())) {
          aplicarDate(d)
          setAcolhEditing(true)
          return
        }
      }
    } catch { /* ignora — cai pro fallback */ }

    // 3. Fallback: data_contrato como base, hora vazia
    if (contrato.data_contrato) {
      setAcolhDataInput(contrato.data_contrato.slice(0, 10))
    } else {
      setAcolhDataInput('')
    }
    setAcolhHoraInput('')
    setAcolhEditing(true)
  }

  async function salvarAcolhimento() {
    if (!contrato) return
    if (!acolhDataInput || !acolhHoraInput) {
      alert('Preencha data E hora')
      return
    }
    setAcolhSaving(true)
    try {
      const dataHora = new Date(`${acolhDataInput}T${acolhHoraInput}:00`)
      if (isNaN(dataHora.getTime())) {
        alert('Data/hora inválida')
        setAcolhSaving(false)
        return
      }
      const valorAnterior = contrato.data_acolhimento
      const valorNovo = dataHora.toISOString()

      const { error } = await supabase
        .from('contratos')
        .update({ data_acolhimento: valorNovo } as never)
        .eq('id', contrato.id)
      if (error) throw error

      // Log auditoria
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('historico_alteracoes').insert({
        entidade: 'contratos',
        entidade_id: contrato.id,
        entidade_nome: contrato.codigo,
        campo: 'data_acolhimento',
        campo_label: 'Data/Hora de Acolhimento',
        valor_anterior: valorAnterior ?? null,
        valor_novo: valorNovo,
        tipo: 'edicao',
        alterado_por: user?.id ?? null,
        alterado_por_email: user?.email ?? null,
      } as never)

      setContrato(prev => prev ? { ...prev, data_acolhimento: valorNovo } as typeof prev : prev)
      setAcolhEditing(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao salvar'
      alert(msg)
    } finally {
      setAcolhSaving(false)
    }
  }

  function abrirEditorValorPlano() {
    if (!contrato) return
    setValorPlanoInput(contrato.valor_plano != null ? String(contrato.valor_plano) : '')
    setValorPlanoEditing(true)
  }

  async function salvarValorPlano() {
    if (!contrato) return
    const limpo = valorPlanoInput.replace(',', '.').trim()
    const novo = parseFloat(limpo)
    if (!Number.isFinite(novo) || novo < 0) {
      alert('Valor inválido')
      return
    }
    const anterior = contrato.valor_plano
    if (novo === anterior) { setValorPlanoEditing(false); return }

    // Guard: total já pago em "plano" maior que o novo valor (alerta, não bloqueia)
    const totalPagoPlano = pagamentos
      .filter(p => p.tipo === 'plano')
      .reduce((acc, p) => acc + (p.valor || 0), 0)
    const descontoPrePlano = contrato.desconto_plano || 0
    const novoLiquido = novo - descontoPrePlano
    if (totalPagoPlano > 0 && totalPagoPlano > novoLiquido) {
      const dif = totalPagoPlano - novoLiquido
      if (!confirm(`Atenção: já há R$ ${totalPagoPlano.toFixed(2)} pago em plano e o novo valor líquido seria R$ ${novoLiquido.toFixed(2)} — sobra de R$ ${dif.toFixed(2)} (excedente).\n\nDeseja continuar?`)) {
        return
      }
    }

    setValorPlanoSaving(true)
    try {
      const { error } = await supabase
        .from('contratos')
        .update({ valor_plano: novo } as never)
        .eq('id', contrato.id)
      if (error) throw error

      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('historico_alteracoes').insert({
        entidade: 'contratos',
        entidade_id: contrato.id,
        entidade_nome: contrato.codigo,
        campo: 'valor_plano',
        campo_label: 'Valor do Plano',
        valor_anterior: anterior != null ? String(anterior) : null,
        valor_novo: String(novo),
        tipo: 'edicao',
        alterado_por: user?.id ?? null,
        alterado_por_email: user?.email ?? null,
      } as never)

      setContrato(prev => prev ? { ...prev, valor_plano: novo } as typeof prev : prev)
      setValorPlanoEditing(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao salvar'
      alert(msg)
    } finally {
      setValorPlanoSaving(false)
    }
  }

  // Re-fetch valor_acessorios e desconto_acessorios do contrato após mudanças em
  // contrato_produtos. O trigger SQL (migration 074) atualiza esses campos
  // automaticamente — só precisamos sincronizar o estado local.
  async function recarregarValoresContrato() {
    if (!params.id) return
    const { data } = await supabase
      .from('contratos')
      .select('valor_acessorios, desconto_acessorios')
      .eq('id', params.id as string)
      .single<{ valor_acessorios: number; desconto_acessorios: number }>()
    if (data) {
      setContrato(prev => prev ? { ...prev, ...data } as typeof prev : prev)
    }
  }

  // Abre o modal genérico de adicionar produto, opcionalmente com filtro de tipo
  // pré-aplicado. Substitui o antigo `abrirUrnaModal` específico.
  async function abrirAddProdutoModalComFiltro(filtroTipo: 'urna' | 'acessorio' | 'incluso' | '' = '') {
    setAddProdutoModal(true)
    setBuscaProduto('')
    setFiltroProdutoTipo(filtroTipo)
    setFiltroProdutoCategoria('')
    setProdutoParaAdicionar(null)
    await carregarTodosProdutos()
  }

  async function carregarProdutosContrato() {
    if (!params.id) return
    setCarregandoProdutos(true)

    const { data, error } = await supabase
      .from('contrato_produtos')
      .select(`
        id,
        quantidade,
        valor,
        desconto,
        is_reserva_pv,
        separado,
        foto_recebida,
        foto_url,
        rescaldo_feito,
        produto:produtos(id, codigo, nome, nome_retorno, tipo, preco, estoque_atual, imagem_url, estoque_infinito, precisa_foto, rescaldo_tipo)
      `)
      .eq('contrato_id', params.id)
      .order('created_at')

    if (!error && data) {
      setContratoProdutos(data as ContratoProduto[])
    }
    setCarregandoProdutos(false)
  }

  async function carregarPagamentos() {
    if (!params.id) return
    setCarregandoPagamentos(true)

    // NOTA: Se pagamentos não aparecerem, execute no Supabase:
    // ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS bandeira VARCHAR(20);
    const { data, error } = await supabase
      .from('pagamentos')
      .select(`
        id,
        contrato_id,
        tipo,
        metodo,
        conta_id,
        conta:contas(id, nome),
        valor,
        desconto,
        taxa,
        valor_liquido,
        parcelas,
        is_seguradora,
        data_pagamento,
        mes_competencia,
        id_transacao,
        bandeira
      `)
      .eq('contrato_id', params.id)
      .order('data_pagamento', { ascending: false })

    if (!error && data) {
      setPagamentos(data as Pagamento[])
    }
    setCarregandoPagamentos(false)
  }

  async function carregarContas() {
    const { data } = await supabase
      .from('contas')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome')

    if (data) setContas(data)
  }

  async function carregarTaxasCartao() {
    const { data } = await supabase
      .from('taxas_cartao')
      .select('id, tipo, nome, percentual, ordem')
      .eq('ativo', true)
      .order('ordem')

    if (data) setTaxasCartao(data)
  }

  function abrirPagamentoModal(pagamento?: Pagamento) {
    if (pagamento) {
      setEditandoPagamento(pagamento)
      setPagamentoForm({
        tipo: pagamento.tipo,
        metodo: pagamento.metodo,
        conta_id: pagamento.conta_id || '',
        valor: String(pagamento.valor),
        desconto: pagamento.desconto ? String(pagamento.desconto) : '',
        parcelas: pagamento.parcelas,
        is_seguradora: pagamento.is_seguradora,
        data_pagamento: pagamento.data_pagamento || new Date().toISOString().split('T')[0],
      })
    } else {
      setEditandoPagamento(null)
      setPagamentoForm({
        tipo: 'plano',
        metodo: 'pix',
        conta_id: contas[0]?.id || '',
        valor: '',
        desconto: '',
        parcelas: 1,
        is_seguradora: false,
        data_pagamento: new Date().toISOString().split('T')[0],
      })
    }
    setPagamentoModal(true)
    if (contas.length === 0) {
      carregarContas()
    }
  }

  async function salvarPagamento() {
    if (!params.id || !pagamentoForm.valor) return
    setSalvando(true)

    const valor = parseFloat(pagamentoForm.valor)
    const desconto = pagamentoForm.desconto ? parseFloat(pagamentoForm.desconto) : 0
    const valorLiquido = valor - desconto

    const dados = {
      contrato_id: params.id,
      tipo: pagamentoForm.tipo,
      metodo: pagamentoForm.metodo,
      conta_id: pagamentoForm.conta_id || null,
      valor,
      desconto,
      valor_liquido: valorLiquido,
      parcelas: pagamentoForm.parcelas,
      is_seguradora: pagamentoForm.is_seguradora,
      data_pagamento: pagamentoForm.data_pagamento,
      mes_competencia: pagamentoForm.data_pagamento?.substring(0, 7).replace('-', '/'),
    }

    let error
    if (editandoPagamento) {
      const result = await supabase
        .from('pagamentos')
        .update(dados as never)
        .eq('id', editandoPagamento.id)
      error = result.error
    } else {
      const result = await supabase
        .from('pagamentos')
        .insert(dados as never)
      error = result.error
    }

    if (!error) {
      await carregarPagamentos()
      setPagamentoModal(false)
    }
    setSalvando(false)
  }

  async function excluirPagamento(id: string) {
    if (!confirm('Excluir este pagamento?')) return
    setSalvando(true)

    const { error } = await supabase
      .from('pagamentos')
      .delete()
      .eq('id', id)

    if (!error) {
      await carregarPagamentos()
    }
    setSalvando(false)
  }

  async function carregarTodosProdutos() {
    // Produtos do catálogo
    const { data: produtosData, error } = await supabase
      .from('produtos')
      .select('id, codigo, nome, tipo, categoria, preco, estoque_atual, estoque_minimo, imagem_url, estoque_infinito')
      .eq('ativo', true)
      .order('tipo')
      .order('nome')
    if (error) { console.error('Erro ao carregar produtos:', error); return }
    if (!produtosData) return

    // Estoque DA UNIDADE DO CONTRATO (atual + mínimo) — substitui campos globais
    const unidadeId = contrato?.unidade_id
    type PeRow = { produto_id: string; estoque_atual: number; estoque_minimo: number }
    const peMap = new Map<string, PeRow>()
    if (unidadeId) {
      const { data: peData } = await supabase
        .from('produtos_estoque')
        .select('produto_id, estoque_atual, estoque_minimo')
        .eq('unidade_id', unidadeId)
      const rows = (peData || []) as PeRow[]
      rows.forEach(r => peMap.set(r.produto_id, r))
    }
    const merged = produtosData.map((p: Produto) => {
      const pe = peMap.get(p.id)
      return {
        ...p,
        estoque_atual: pe?.estoque_atual ?? 0,
        estoque_minimo: pe?.estoque_minimo ?? 0,
      }
    })
    setTodosProdutos(merged)
  }

  async function abrirAddProdutoModal() {
    setAddProdutoModal(true)
    setBuscaProduto('')
    setFiltroProdutoTipo('')
    setFiltroProdutoCategoria('')
    // Sempre recarrega para garantir dados atualizados
    await carregarTodosProdutos()
  }

  function getStatusEstoque(atual: number, minimo: number, estoqueInfinito?: boolean) {
    if (estoqueInfinito) return { status: 'infinito', color: 'bg-blue-500', label: '∞' }
    if (atual <= 0) return { status: 'critico', color: 'bg-red-500', label: 'Sem estoque' }
    if (atual <= minimo) return { status: 'baixo', color: 'bg-yellow-500', label: 'Estoque baixo' }
    return { status: 'ok', color: 'bg-green-500', label: 'OK' }
  }

  // Sincroniza pelinho_quantidade/quer/feito baseado nos contrato_produtos reais
  async function sincronizarPelinho() {
    if (!params.id || !contrato) return

    const { data: pelinhos } = await supabase
      .from('contrato_produtos')
      .select('rescaldo_feito, produto:produtos(rescaldo_tipo)')
      .eq('contrato_id', params.id)

    const items = (pelinhos || []).filter((cp: { produto: { rescaldo_tipo: string | null } | null }) => cp.produto?.rescaldo_tipo === 'pelinho')
    const qtd = items.length
    const todoFeitos = qtd > 0 && items.every((cp: { rescaldo_feito: boolean }) => cp.rescaldo_feito)

    const updates: Record<string, unknown> = {
      pelinho_quantidade: qtd,
      pelinho_quer: qtd > 0,
      pelinho_feito: todoFeitos,
    }

    await supabase
      .from('contratos')
      .update(updates as never)
      .eq('id', params.id as string)

    setContrato(prev => prev ? { ...prev, ...updates } as typeof prev : prev)
  }

  function selecionarProdutoParaAdicionar(produto: Produto) {
    setProdutoParaAdicionar(produto)
    setAddProdutoForm({ quantidade: 1, precoCustom: '', descontoTipo: 'percent', descontoPercent: '', descontoValor: '' })
    setMostrarOpcoesProduto(false)
  }

  async function confirmarAdicionarProduto(opts: { trocarUrna?: ContratoProduto; forcarAdicionarNova?: boolean } = {}) {
    if (!params.id || !produtoParaAdicionar || !contrato) return

    // Se for urna E já existe urna no contrato E não veio decisão explícita,
    // pergunta se é pra adicionar nova ou trocar a existente.
    const decisaoTomada = opts.trocarUrna !== undefined || opts.forcarAdicionarNova === true
    if (!decisaoTomada && produtoParaAdicionar.tipo === 'urna') {
      const urnaAnterior = contratoProdutos.find(cp => cp.produto?.tipo === 'urna')
      if (urnaAnterior) {
        setTrocaUrnaPrompt({ urnaAnterior })
        return
      }
    }

    setSalvando(true)

    // Se trocar: deletar urna anterior e creditar estoque ANTES de inserir a nova
    if (opts.trocarUrna) {
      await supabase.from('contrato_produtos').delete().eq('id', opts.trocarUrna.id)
      if (opts.trocarUrna.produto?.id) {
        await ajustarEstoque(
          opts.trocarUrna.produto.id,
          +(opts.trocarUrna.quantidade || 1),
          opts.trocarUrna.produto.estoque_infinito,
        )
      }
    }

    const precoOriginal = produtoParaAdicionar.preco || 0
    const precoBase = typeof addProdutoForm.precoCustom === 'number' ? addProdutoForm.precoCustom : precoOriginal
    let descontoPorUnidade = 0

    if (addProdutoForm.descontoTipo === 'percent' && addProdutoForm.descontoPercent && addProdutoForm.descontoPercent > 0) {
      descontoPorUnidade = precoBase * (addProdutoForm.descontoPercent / 100)
    } else if (addProdutoForm.descontoTipo === 'valor' && addProdutoForm.descontoValor && addProdutoForm.descontoValor > 0) {
      descontoPorUnidade = addProdutoForm.descontoValor
    }

    const produtosParaInserir = Array.from({ length: addProdutoForm.quantidade }, () => ({
      contrato_id: params.id,
      produto_id: produtoParaAdicionar.id,
      quantidade: 1,
      valor: precoBase,
      desconto: descontoPorUnidade,
    }))

    const { error } = await supabase
      .from('contrato_produtos')
      .insert(produtosParaInserir as never)

    if (!error) {
      await ajustarEstoque(
        produtoParaAdicionar.id,
        -addProdutoForm.quantidade,
        produtoParaAdicionar.estoque_infinito,
      )

      // Trigger SQL atualizou valor_acessorios e desconto_acessorios → só sincroniza local
      await carregarProdutosContrato()
      await recarregarValoresContrato()
      setProdutoParaAdicionar(null)
      setAddProdutoModal(false)
      setTrocaUrnaPrompt(null)
    }
    setSalvando(false)
  }

  function iniciarEdicao(cp: ContratoProduto) {
    setEditandoProduto(cp.id)
    setEditForm({
      quantidade: cp.quantidade,
      valor: cp.valor || 0,
      desconto: cp.desconto && cp.desconto > 0 ? cp.desconto : ''
    })
  }

  async function salvarEdicao(cpId: string) {
    if (!contrato) return
    setSalvando(true)

    // Ajustar estoque pela DIFERENÇA de quantidade (delta)
    const cpAtual = contratoProdutos.find(cp => cp.id === cpId)
    const qtdAnterior = cpAtual?.quantidade || 1
    const qtdNova = editForm.quantidade
    const delta = qtdNova - qtdAnterior  // +N = aumentou (debitar mais), -N = diminuiu (creditar)

    const { error } = await supabase
      .from('contrato_produtos')
      .update({
        quantidade: editForm.quantidade,
        valor: editForm.valor,
        desconto: editForm.desconto === '' ? 0 : editForm.desconto,
      } as never)
      .eq('id', cpId)

    if (!error) {
      // Sincronizar estoque com a nova quantidade (debita ou credita o delta)
      if (delta !== 0 && cpAtual?.produto?.id) {
        await ajustarEstoque(
          cpAtual.produto.id,
          -delta,                              // delta positivo = debitar mais
          cpAtual.produto.estoque_infinito,
        )
      }
      // Trigger SQL atualizou valor_acessorios e desconto_acessorios → só sincroniza local
      await carregarProdutosContrato()
      await recarregarValoresContrato()
      setEditandoProduto(null)
    }
    setSalvando(false)
  }

  async function removerProduto(cpId: string) {
    if (!confirm('Remover este produto do contrato?')) return
    if (!contrato) return
    setSalvando(true)

    const produtoRemovido = contratoProdutos.find(cp => cp.id === cpId)

    const { error } = await supabase
      .from('contrato_produtos')
      .delete()
      .eq('id', cpId)

    if (!error) {
      // Creditar estoque (devolver produto)
      if (produtoRemovido?.produto) {
        await ajustarEstoque(
          produtoRemovido.produto.id,
          +(produtoRemovido.quantidade || 1),
          produtoRemovido.produto.estoque_infinito,
        )
      }

      // Sincronizar pelinho se removeu um
      if (produtoRemovido?.produto?.rescaldo_tipo === 'pelinho') {
        await sincronizarPelinho()
      }

      // Trigger SQL atualizou valor_acessorios e desconto_acessorios → só sincroniza local
      await carregarProdutosContrato()
      await recarregarValoresContrato()
    }
    setSalvando(false)
  }

  async function toggleSeparado(cp: ContratoProduto) {
    const { error } = await supabase
      .from('contrato_produtos')
      .update({ separado: !cp.separado } as never)
      .eq('id', cp.id)

    if (!error) {
      setContratoProdutos(prev => prev.map(p =>
        p.id === cp.id ? { ...p, separado: !p.separado } : p
      ))
    }
  }

  async function toggleFotoRecebida(cp: ContratoProduto) {
    const { error } = await supabase
      .from('contrato_produtos')
      .update({ foto_recebida: !cp.foto_recebida } as never)
      .eq('id', cp.id)

    if (!error) {
      setContratoProdutos(prev => prev.map(p =>
        p.id === cp.id ? { ...p, foto_recebida: !p.foto_recebida } : p
      ))
    }
  }

  async function marcarTodosSeparados(separado: boolean) {
    if (contratoProdutos.length === 0) return

    const ids = contratoProdutos.map(cp => cp.id)
    const { error } = await supabase
      .from('contrato_produtos')
      .update({ separado } as never)
      .in('id', ids)

    if (!error) {
      setContratoProdutos(prev => prev.map(p => ({ ...p, separado })))
    }
  }

  // Mega Pagamento - abrir modal (novo, quitar saldo, ou editar)
  async function abrirMegaPagamento(saldoPlano: number, saldoAcessorio: number, pagamentoEditar?: Pagamento) {
    if (pagamentoEditar) {
      // Modo edição - preencher com dados do pagamento
      const isPlano = pagamentoEditar.tipo === 'plano'
      const metodo = pagamentoEditar.metodo === 'credito' || pagamentoEditar.metodo === 'debito' ? 'cartao' : pagamentoEditar.metodo as 'pix' | 'dinheiro'
      const parcelas = pagamentoEditar.metodo === 'debito' ? 'debito' : pagamentoEditar.parcelas > 1 ? `${pagamentoEditar.parcelas}x` : '1x'

      setMegaPagamentoEditando(pagamentoEditar)
      setMegaPagamentoForm({
        valorPlano: isPlano ? pagamentoEditar.valor.toFixed(2) : '',
        descontoPlano: isPlano && (pagamentoEditar.desconto ?? 0) > 0 ? pagamentoEditar.desconto!.toFixed(2) : '',
        descontoPlanoAtivo: isPlano && (pagamentoEditar.desconto ?? 0) > 0,
        valorAcessorio: !isPlano ? pagamentoEditar.valor.toFixed(2) : '',
        descontoAcessorio: !isPlano && (pagamentoEditar.desconto ?? 0) > 0 ? pagamentoEditar.desconto!.toFixed(2) : '',
        descontoAcessorioAtivo: !isPlano && (pagamentoEditar.desconto ?? 0) > 0,
        descontoProporcionalizar: '',
        metodo,
        bandeira: (pagamentoEditar.bandeira as '' | 'master' | 'visa' | 'elo' | 'amex' | 'hiper') || 'master',
        parcelas: metodo === 'cartao' ? parcelas : '',
        idTransacao: pagamentoEditar.id_transacao || '',
        dataHoje: false,
        data_pagamento: pagamentoEditar.data_pagamento || '',
      })
    } else {
      // Modo novo - valores passados ou vazios
      setMegaPagamentoEditando(null)
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
    }
    setMegaPagamentoModal(true)
    if (taxasCartao.length === 0) {
      await carregarTaxasCartao()
    }
  }

  // Salvar mega pagamento (bifurca em múltiplos pagamentos)
  async function salvarMegaPagamento() {
    if (!params.id) return

    // Validar data obrigatória
    if (!megaPagamentoForm.dataHoje && !megaPagamentoForm.data_pagamento) {
      alert('Informe a data do pagamento')
      return
    }

    // Validar ID transação obrigatório para cartão
    if (megaPagamentoForm.metodo === 'cartao') {
      if (!megaPagamentoForm.bandeira || !megaPagamentoForm.parcelas) {
        alert('Selecione a bandeira e a quantidade de parcelas')
        return
      }
      if (!megaPagamentoForm.idTransacao?.trim()) {
        alert('ID da transação é obrigatório para cartão')
        return
      }
    }

    setSalvando(true)

    // Determinar data de pagamento
    const dataPagamento = megaPagamentoForm.dataHoje
      ? new Date().toISOString().split('T')[0]
      : megaPagamentoForm.data_pagamento

    // IDs fixos das contas (sincronizados com migrar_legado.py)
    const CONTAS = {
      pix: '1124d3d0-f525-450c-92d7-739e70a42cb0',      // Inter
      cartao: 'c102eed4-5318-492a-a6c5-f794483f9639',   // Granito
      dinheiro: 'e4b0636c-2241-4911-b444-359e83e39674', // Dinheiro
    }
    const contaId = CONTAS[megaPagamentoForm.metodo as keyof typeof CONTAS] || null

    // Buscar percentual da taxa selecionada (bandeira_parcelas: master_debito, visa_2x, etc)
    const tipoTaxa = megaPagamentoForm.bandeira && megaPagamentoForm.parcelas
      ? `${megaPagamentoForm.bandeira}_${megaPagamentoForm.parcelas}`
      : ''
    const tipoSelecionado = taxasCartao.find(t => t.tipo === tipoTaxa)
    const taxaPercentual = tipoSelecionado?.percentual || 0

    // Parcelas (extrair: debito -> 1, 1x -> 1, 6x -> 6, etc)
    let parcelas = 1
    if (megaPagamentoForm.parcelas && megaPagamentoForm.parcelas !== 'debito') {
      const match = megaPagamentoForm.parcelas.match(/(\d+)x/)
      if (match) {
        parcelas = parseInt(match[1])
      }
    }

    // ID da transação (maquininha)
    const idTransacao = megaPagamentoForm.idTransacao?.trim() || null

    // Método para salvar no banco (credito ou debito)
    const metodoBanco = megaPagamentoForm.metodo === 'cartao'
      ? (megaPagamentoForm.parcelas === 'debito' ? 'debito' : 'credito')
      : megaPagamentoForm.metodo

    // Calcular valores líquidos sem taxa
    const valorPlano = megaPagamentoForm.valorPlano ? parseFloat(megaPagamentoForm.valorPlano) : 0
    const descontoPlano = megaPagamentoForm.descontoPlanoAtivo && megaPagamentoForm.descontoPlano ? parseFloat(megaPagamentoForm.descontoPlano) : 0
    const liquidoPlano = valorPlano - descontoPlano

    const valorAcessorio = megaPagamentoForm.valorAcessorio ? parseFloat(megaPagamentoForm.valorAcessorio) : 0
    const descontoAcessorio = megaPagamentoForm.descontoAcessorioAtivo && megaPagamentoForm.descontoAcessorio ? parseFloat(megaPagamentoForm.descontoAcessorio) : 0
    const liquidoAcessorio = valorAcessorio - descontoAcessorio

    // Total líquido e taxa total
    const liquidoTotal = liquidoPlano + liquidoAcessorio
    const taxaTotal = liquidoTotal * taxaPercentual / 100

    // Proporcionalizar taxa entre Plano e Acessório
    let taxaPlano = 0
    let taxaAcessorio = 0
    if (liquidoTotal > 0) {
      taxaPlano = taxaTotal * (liquidoPlano / liquidoTotal)
      taxaAcessorio = taxaTotal * (liquidoAcessorio / liquidoTotal)
    }

    const pagamentosParaCriar = []

    // Bandeira do cartão (se for cartão)
    const bandeira = megaPagamentoForm.metodo === 'cartao' ? megaPagamentoForm.bandeira : null

    // Pagamento de Plano
    if (valorPlano > 0 || descontoPlano > 0) {
      pagamentosParaCriar.push({
        contrato_id: params.id,
        tipo: 'plano',
        metodo: metodoBanco,
        conta_id: contaId,
        valor: valorPlano,
        desconto: descontoPlano,
        taxa: parseFloat(taxaPlano.toFixed(2)),
        valor_liquido_sem_taxa: liquidoPlano,
        valor_liquido: liquidoPlano - taxaPlano,
        parcelas: parcelas,
        id_transacao: idTransacao,
        bandeira: bandeira,
        data_pagamento: dataPagamento,
        mes_competencia: dataPagamento?.substring(0, 7).replace('-', '/'),
      })
    }

    // Pagamento de Acessório
    if (valorAcessorio > 0 || descontoAcessorio > 0) {
      pagamentosParaCriar.push({
        contrato_id: params.id,
        tipo: 'catalogo',
        metodo: metodoBanco,
        conta_id: contaId,
        valor: valorAcessorio,
        desconto: descontoAcessorio,
        taxa: parseFloat(taxaAcessorio.toFixed(2)),
        valor_liquido_sem_taxa: liquidoAcessorio,
        valor_liquido: liquidoAcessorio - taxaAcessorio,
        parcelas: parcelas,
        id_transacao: idTransacao,
        bandeira: bandeira,
        data_pagamento: dataPagamento,
        mes_competencia: dataPagamento?.substring(0, 7).replace('-', '/'),
      })
    }

    // Modo edição - atualiza o pagamento existente
    if (megaPagamentoEditando) {
      const dadosEditar = pagamentosParaCriar[0] // Edição sempre tem só 1 pagamento
      if (dadosEditar) {
        const { error } = await supabase
          .from('pagamentos')
          .update({
            tipo: dadosEditar.tipo,
            metodo: dadosEditar.metodo,
            conta_id: dadosEditar.conta_id,
            valor: dadosEditar.valor,
            desconto: dadosEditar.desconto,
            taxa: dadosEditar.taxa,
            valor_liquido_sem_taxa: dadosEditar.valor_liquido_sem_taxa,
            valor_liquido: dadosEditar.valor_liquido,
            parcelas: dadosEditar.parcelas,
            id_transacao: dadosEditar.id_transacao,
            bandeira: dadosEditar.bandeira,
            data_pagamento: dadosEditar.data_pagamento,
            mes_competencia: dadosEditar.mes_competencia,
          } as never)
          .eq('id', megaPagamentoEditando.id)

        if (error) {
          console.error('Erro ao atualizar pagamento:', error)
          alert(`Erro ao atualizar: ${error.message}`)
        } else {
          await carregarPagamentos()
          setMegaPagamentoModal(false)
          setMegaPagamentoEditando(null)
        }
      }
    } else if (pagamentosParaCriar.length > 0) {
      // Modo novo - insere pagamentos
      console.log('Salvando pagamentos:', pagamentosParaCriar)
      const { data, error } = await supabase
        .from('pagamentos')
        .insert(pagamentosParaCriar as never)
        .select()

      if (error) {
        console.error('Erro ao salvar pagamento:', error)
        alert(`Erro ao salvar: ${error.message}`)
      } else {
        console.log('Pagamentos salvos:', data)
        await carregarPagamentos()
        setMegaPagamentoModal(false)
      }
    } else {
      setMegaPagamentoModal(false)
    }

    setSalvando(false)
  }

  // Emitir NFS-e
  async function emitirNfse() {
    if (!contrato) return
    setEmitindoNf(true)
    setNfMensagem(null)

    try {
      const response = await fetch('/api/nfse/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contrato_id: contrato.id,
          ambiente: 'homologacao' // Mudar para 'producao' quando estiver pronto
        })
      })

      const data = await response.json()

      if (!response.ok) {
        setNfMensagem({
          tipo: 'erro',
          texto: data.erro || 'Erro ao emitir NFS-e'
        })
      } else {
        setNfMensagem({
          tipo: 'sucesso',
          texto: `NFS-e emitida! Protocolo: ${data.protocolo}`
        })
        // Atualizar contrato com dados da NF
        setContrato({
          ...contrato,
          nfse_numero: data.protocolo,
          nfse_status: 'emitida',
          nfse_data: new Date().toISOString()
        })
      }
    } catch (error) {
      setNfMensagem({
        tipo: 'erro',
        texto: 'Erro de conexão ao emitir NFS-e'
      })
    }

    setEmitindoNf(false)
  }

  // Gerar Contrato PDF
  async function gerarPdf() {
    if (!contrato) return
    setGerandoPdf(true)
    try {
      // Buscar nome da unidade
      let nomeUnidade = 'Santos - SP'
      const unidadeId = (contrato as unknown as { unidade_id?: string }).unidade_id
      if (unidadeId) {
        const { data: unidadeData } = await supabase
          .from('unidades')
          .select('nome, cidade, estado')
          .eq('id', unidadeId)
          .single() as { data: { nome: string; cidade: string; estado: string } | null }
        if (unidadeData) {
          nomeUnidade = `${unidadeData.cidade} - ${unidadeData.estado}`
        }
      }

      const tutor = contrato.tutor
      const blob = await gerarContratoPDF({
        codigo: contrato.codigo,
        lacre: contrato.numero_lacre,
        tutorNome: tutor?.nome || contrato.tutor_nome,
        tutorTelefone: tutor?.telefone || contrato.tutor_telefone || '',
        tutorCpf: tutor?.cpf || contrato.tutor_cpf || '',
        tutorEmail: tutor?.email || contrato.tutor_email,
        tutorEndereco: tutor ? `${tutor.endereco || ''}${tutor.numero ? ', ' + tutor.numero : ''}${tutor.complemento ? ' - ' + tutor.complemento : ''}` : contrato.tutor_endereco,
        tutorEstado: tutor?.estado || contrato.tutor_estado,
        tutorCidade: tutor?.cidade || contrato.tutor_cidade,
        tutorBairro: tutor?.bairro || contrato.tutor_bairro,
        tutorCep: tutor?.cep || contrato.tutor_cep,
        petNome: contrato.pet_nome,
        petEspecie: contrato.pet_especie,
        petRaca: contrato.pet_raca,
        petIdade: contrato.pet_idade_anos,
        petCor: contrato.pet_cor,
        petGenero: contrato.pet_genero,
        petPeso: contrato.pet_peso,
        localColeta: contrato.local_coleta,
        tipoCremacao: contrato.tipo_cremacao as 'individual' | 'coletiva',
        valorPlano: contrato.valor_plano,
        metodoPagamento: pagamentos[0]?.metodo || null,
        parcelas: pagamentos[0]?.parcelas || null,
        velorioDeseja: contrato.velorio_deseja ?? null,
        acompanhamentoOnline: contrato.acompanhamento_online ?? false,
        acompanhamentoPresencial: contrato.acompanhamento_presencial ?? false,
      }, nomeUnidade)

      // Download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = contratoFilename(contrato.codigo, contrato.pet_nome)
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Erro ao gerar PDF:', err)
      alert('Erro ao gerar contrato PDF')
    }
    setGerandoPdf(false)
  }

  // Filtrar produtos pela busca, tipo, categoria (exclui pelinho 0004 - gerenciado pelo PelinhoModal)
  const produtosDisponiveis = todosProdutos.filter(p => {
    if (p.codigo === '0004') return false
    // Filtro por tipo
    if (filtroProdutoTipo && p.tipo !== filtroProdutoTipo) return false
    // Filtro por categoria
    if (filtroProdutoCategoria && p.categoria !== filtroProdutoCategoria) return false
    // Filtro por busca
    if (buscaProduto) {
      const termo = buscaProduto.toLowerCase()
      return p.nome.toLowerCase().includes(termo) || p.codigo.toLowerCase().includes(termo)
    }
    return true
  })

  // Contadores por tipo (para modal)
  const contadoresProdutos = {
    total: todosProdutos.length,
    urna: todosProdutos.filter(p => p.tipo === 'urna').length,
    acessorio: todosProdutos.filter(p => p.tipo === 'acessorio').length,
    incluso: todosProdutos.filter(p => p.tipo === 'incluso').length,
  }

  // Categorias disponíveis para urnas no modal
  const categoriasUrnasModal = [...new Set(
    todosProdutos
      .filter(p => p.tipo === 'urna' && p.categoria)
      .map(p => p.categoria!)
  )].sort()

  // Categorias disponíveis para acessórios no modal
  const categoriasAcessoriosModal = [...new Set(
    todosProdutos
      .filter(p => p.tipo === 'acessorio' && p.categoria)
      .map(p => p.categoria!)
  )].sort()

  useEffect(() => {
    carregarContrato()
    carregarProdutosContrato()
    carregarPagamentos()
    carregarProdutosRescaldo()
  }, [params.id])

  async function carregarContrato() {
    setLoading(true)
    const contratoId = params.id as string
    const { data, error } = await supabase
      .from('contratos')
      .select('*, tutor:tutores(*), supinda:supindas!fk_contrato_supinda(numero, data), funcionario:funcionarios(nome), estabelecimento_coleta:estabelecimentos!contratos_estabelecimento_id_fkey(nome), unidade_remocao:unidades!contratos_unidade_remocao_id_fkey(id, codigo, nome), unidade_entrega:unidades!contratos_unidade_entrega_id_fkey(id, codigo, nome)')
      .eq('id', contratoId)
      .single()

    if (!error) setContrato(data as Contrato)
    setLoading(false)
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

  // === RESCALDO (via contrato_produtos) ===

  async function adicionarProdutoRescaldo(produto: typeof produtosRescaldo[0]) {
    setSalvandoRescaldo(true)
    const { data, error } = await supabase
      .from('contrato_produtos')
      .insert({
        contrato_id: params.id as string,
        produto_id: produto.id,
        quantidade: 1,
        valor: produto.preco || 0,
        rescaldo_feito: false,
      } as never)
      .select(`
        id,
        quantidade,
        valor,
        desconto,
        is_reserva_pv,
        separado,
        foto_recebida,
        foto_url,
        rescaldo_feito,
        produto:produtos(id, codigo, nome, nome_retorno, tipo, preco, estoque_atual, imagem_url, estoque_infinito, precisa_foto, rescaldo_tipo)
      `)
      .single()

    if (!error && data) {
      // Debitar estoque
      await ajustarEstoquePorCodigo(produto.codigo, -1)
      setContratoProdutos(prev => [...prev, data as ContratoProduto])
      // Trigger SQL atualizou valor_acessorios e desconto_acessorios → só sincroniza local
      await recarregarValoresContrato()
    } else {
      alert('Erro ao adicionar produto de rescaldo')
    }
    setSalvandoRescaldo(false)
  }

  async function toggleRescaldoFeito(cpId: string, novoValor: boolean) {
    const { error } = await supabase
      .from('contrato_produtos')
      .update({ rescaldo_feito: novoValor } as never)
      .eq('id', cpId)

    if (!error) {
      setContratoProdutos(prev => prev.map(cp => cp.id === cpId ? { ...cp, rescaldo_feito: novoValor } : cp))
    }
  }

  async function removerProdutoRescaldo(cpId: string, produtoId: string) {
    if (!contrato) return
    const cpRemovido = contratoProdutos.find(cp => cp.id === cpId)

    const { error } = await supabase
      .from('contrato_produtos')
      .delete()
      .eq('id', cpId)

    if (!error) {
      await ajustarEstoque(produtoId, 1, cpRemovido?.produto?.estoque_infinito)
      setContratoProdutos(prev => prev.filter(cp => cp.id !== cpId))

      // Sincronizar pelinho se removeu um
      if (cpRemovido?.produto?.rescaldo_tipo === 'pelinho') {
        await sincronizarPelinho()
      }

      // Trigger SQL atualizou valor_acessorios e desconto_acessorios → só sincroniza local
      await recarregarValoresContrato()
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

  function getPetIcon(especie: string | null, peso: number | null): { emoji: string; color: string } {
    const especieLower = especie?.toLowerCase() || ''
    if (especieLower.includes('canin')) {
      if (!peso || peso <= 5) return { emoji: '🐕', color: 'from-amber-400 to-amber-600' }
      if (peso <= 15) return { emoji: '🐕', color: 'from-orange-400 to-orange-600' }
      return { emoji: '🐕', color: 'from-red-400 to-red-600' }
    }
    if (especieLower.includes('felin')) return { emoji: '🐱', color: 'from-purple-400 to-purple-600' }
    if (especieLower.includes('exotic')) return { emoji: '🐾', color: 'from-teal-400 to-teal-600' }
    return { emoji: '🐾', color: 'from-gray-400 to-gray-600' }
  }

  function formatarData(data: string | null) {
    if (!data) return null
    try {
      // Parsear manualmente para evitar problema de timezone
      const [ano, mes, dia] = data.split('T')[0].split('-').map(Number)
      const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
      return `${dia.toString().padStart(2, '0')}/${meses[mes - 1]}/${ano}`
    } catch { return null }
  }

  function formatarDataHora(data: string | null) {
    if (!data) return null
    try {
      const d = new Date(data)
      const dia = d.getDate().toString().padStart(2, '0')
      const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
      const mes = meses[d.getMonth()]
      const hora = d.getHours().toString().padStart(2, '0')
      const min = d.getMinutes().toString().padStart(2, '0')
      return `${dia}/${mes} às ${hora}:${min}`
    } catch { return null }
  }

  function formatarTelefone(tel: string | null) {
    if (!tel) return null
    const limpo = tel.replace(/\D/g, '')
    if (limpo.length === 11) return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7)}`
    return tel
  }

  // Prefixos que formam nome composto: se o primeiro nome é um desses, inclui o segundo nome
  const PREFIXOS_NOME_COMPOSTO = [
    'maria', 'ana', 'anna', 'rosa',
    'joao', 'joão', 'jose', 'josé',
    'pedro', 'luiz', 'luis', 'luís', 'carlos', 'marco',
  ]

  function capitalizarNome(nome: string): string {
    if (!nome) return ''
    return nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase()
  }

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

  function getPrimeiroNome(nomeCompleto: string | null | undefined): string {
    if (!nomeCompleto) return ''
    const { primeiro } = separarPrimeiroNome(nomeCompleto)
    return capitalizarNome(primeiro)
  }

  function formatarMoeda(valor: number | null) {
    if (!valor) return 'R$ 0,00'
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  // Pet Grato - abre o modal com dados pré-preenchidos
  function abrirPetGrato() {
    setPetGratoForm({
      tutorNome: getPrimeiroNome(contrato?.tutor?.nome || contrato?.tutor_nome),
      petNome: capitalizarNome(contrato?.pet_nome || ''),
      sexo: contrato?.pet_genero === 'macho' ? 'M' : 'F',
      familia: 'F', // Padrão: com família
    })
    setPetGratoModal(true)
  }

  // Pet Grato - gera a mensagem de despedida
  function gerarMensagemPetGrato(): string {
    const { tutorNome, petNome, sexo, familia } = petGratoForm
    const obrigado = sexo === 'M' ? '*Obrigado*' : '*Obrigada*'

    if (familia === 'F') {
      return `*Aos meus grandes amores, ${tutorNome} e família,*

${obrigado} por tudo, fui em paz.

Não chorem mais, por favor. Tenho na lembrança o nome que me deram, o calor da casa que neste tempo se tornou minha. Essa foi a família que eu tive. Eu levo o som das suas vozes falando pra mim, mesmo não entendendo sempre o que me diziam.

Eu carrego em meu coração cada carícia que vocês me deram. Tudo o que vocês fizeram foi muito valioso pra mim e eu agradeço infinitamente.

Eu só vou pedir dois favores: lavem o rosto e comecem a sorrir. Lembrem-se de como foi bom que vivemos juntos estes momentos, lembrem-se das coisas que eu fazia para alegrar. Reviva tudo que compartilhamos neste tempo. Sem vocês eu não teria vivido tudo que vivi. Ao lado de vocês, a minha vida valeu cada segundo.

Eu os acompanharei nos teus caminhos.

Hoje a noite, quando olharem para o céu e verem uma estrela brilhando, quero que saibam que sou eu piscando pra vocês e avisando que cheguei bem

Eu amo vocês

Com carinho,
${petNome}`
    } else {
      return `*Ao meu grande amor, ${tutorNome},*

${obrigado} por tudo, fui em paz.

Não chore mais, por favor. Tenho na lembrança o nome que me deu, o calor da casa que neste tempo se tornou minha. Essa foi a família que eu tive. Eu levo o som da sua voz falando pra mim, mesmo não entendendo sempre o que me dizia.

Eu carrego em meu coração cada carícia que você me deu. Tudo o que você fez foi muito valioso pra mim e eu agradeço infinitamente.

Eu só vou pedir dois favores: lave o rosto e comece a sorrir. Lembre-se de como foi bom que vivemos juntos estes momentos, lembre-se das coisas que eu fazia para alegrar. Reviva tudo que compartilhamos neste tempo. Sem você eu não teria vivido tudo que vivi. Ao seu lado, a minha vida valeu cada segundo.

Eu te acompanharei nos teus caminhos.

Hoje a noite, quando olhar para o céu e ver uma estrela brilhando, quero que saiba que sou eu piscando pra você e avisando que cheguei bem

Eu te amo

Com carinho,
${petNome}`
    }
  }

  // Pet Grato - envia para WhatsApp
  function enviarPetGrato() {
    const tutor = contrato?.tutor
    if (!tutor?.telefone) {
      alert('Tutor não possui telefone cadastrado')
      return
    }
    if (!petGratoForm.tutorNome || !petGratoForm.petNome) {
      alert('Preencha o nome do tutor e do pet')
      return
    }
    const mensagem = gerarMensagemPetGrato()
    const telefone = tutor.telefone.replace(/\D/g, '')
    const url = `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`
    window.open(url, '_blank')
    setPetGratoModal(false)
  }

  // Telefone 2 - salvar novo telefone secundário
  async function salvarTelefone2() {
    if (!contrato || !novoTelefone2.trim()) return
    setSalvandoTelefone(true)

    try {
      // DDI + dígitos limpos (ex: 5511999999999)
      const telLimpo = novoTelefone2DDI + novoTelefone2.replace(/\D/g, '')

      const nomeContato = novoTelefone2Nome.trim() || null

      // Atualizar tutor + contrato (mantém fallback legado sincronizado)
      if (contrato.tutor_id && contrato.tutor) {
        await supabase
          .from('tutores')
          .update({ telefone2: telLimpo, telefone2_nome: nomeContato } as never)
          .eq('id', contrato.tutor_id)
      }
      await supabase
        .from('contratos')
        .update({ tutor_telefone2: telLimpo, tutor_telefone2_nome: nomeContato } as never)
        .eq('id', contrato.id)

      // Recarregar página para atualizar dados
      window.location.reload()
    } catch (err) {
      console.error('Erro ao salvar telefone 2:', err)
      alert('Erro ao salvar telefone')
    } finally {
      setSalvandoTelefone(false)
      setTelefone2Modal(false)
    }
  }

  // Fechar popup lacre ao clicar fora
  useEffect(() => {
    if (!lacrePopup) return
    function handleClick(e: MouseEvent) {
      if (lacreRef.current && !lacreRef.current.contains(e.target as Node)) setLacrePopup(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [lacrePopup])

  // Salvar lacre inline
  async function salvarLacre() {
    if (!contrato || !lacreTemp.trim()) return
    setSalvandoLacre(true)
    try {
      await supabase
        .from('contratos')
        .update({ numero_lacre: lacreTemp.trim() } as never)
        .eq('id', contrato.id)
      setContrato({ ...contrato, numero_lacre: lacreTemp.trim() })
      setEditandoLacre(false)
    } catch (err) {
      console.error('Erro ao salvar lacre:', err)
    } finally {
      setSalvandoLacre(false)
    }
  }

  // Alternar qual telefone é o "mais ativo" (1=ficha, 2=processado)
  async function trocarTelefones() {
    if (!contrato) return
    const novo = (contrato.tutor_telefone_principal || 1) === 1 ? 2 : 1

    setSalvandoTelefone(true)

    try {
      await supabase.from('contratos').update({ tutor_telefone_principal: novo } as never).eq('id', contrato.id)
      if (contrato.tutor_id) {
        await supabase.from('tutores').update({ telefone_principal: novo } as never).eq('id', contrato.tutor_id)
      }
      setContrato({ ...contrato, tutor_telefone_principal: novo })
    } catch (err) {
      console.error('Erro ao trocar telefones:', err)
      alert('Erro ao trocar telefones')
    } finally {
      setSalvandoTelefone(false)
    }
  }

  // Gerar código de referência: YYMmmdd NomeTutor EM/PV NomePet IND/COL
  function gerarCodigoReferencia(): string {
    if (!contrato) return ''

    const data = contrato.data_contrato ? new Date(contrato.data_contrato) : new Date()
    const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    const ano = String(data.getFullYear()).slice(-2)
    const mes = meses[data.getMonth()]
    const dia = String(data.getDate()).padStart(2, '0')

    const tutorNome = getPrimeiroNome(contrato.tutor?.nome || contrato.tutor_nome)
    const tipo = contrato.tipo_plano === 'preventivo' ? 'PV' : 'EM'
    const petNome = capitalizarNome(contrato.pet_nome || '')
    const cremacao = contrato.tipo_cremacao === 'individual' ? 'IND' : contrato.tipo_cremacao === 'coletiva' ? 'COL' : ''

    return `${ano}${mes}${dia} ${tutorNome} ${tipo} ${petNome}${cremacao ? ` ${cremacao}` : ''}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-slate-400">Carregando...</div>
      </div>
    )
  }

  if (!contrato) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-slate-400">Contrato não encontrado</p>
        <button onClick={() => router.back()} className="text-purple-400 hover:underline">Voltar para lista</button>
      </div>
    )
  }

  const petIcon = getPetIcon(contrato.pet_especie, contrato.pet_peso)
  const statusConfig = STATUS_CONFIG[contrato.status] || STATUS_CONFIG.ativo
  const valorTotal = (contrato.valor_plano || 0) + (contrato.valor_acessorios || 0) - (contrato.desconto_plano || 0) - (contrato.desconto_acessorios || 0)

  // Calcular complexidade de montagem (só relevante para retorno)
  const getComplexidadeMontagem = (): number => {
    const isColetiva = contrato.tipo_cremacao === 'coletiva'

    // Filtrar produtos que realmente contam para montagem
    const produtosReais = contratoProdutos.filter(cp => {
      if (!cp.produto?.nome) return false
      const nomeLower = cp.produto.nome.toLowerCase()
      return !ITENS_IGNORAR_MONTAGEM.some(item => nomeLower.includes(item))
    })

    const temAcessorios = produtosReais.some(cp => cp.produto?.tipo === 'acessorio')
    const precisaFoto = produtosReais.some(cp => cp.produto?.precisa_foto === true)

    if (isColetiva && !temAcessorios) return 1
    if (!isColetiva && !temAcessorios) return 2
    if (isColetiva && temAcessorios) return 3
    if (!isColetiva && temAcessorios && !precisaFoto) return 4
    if (!isColetiva && temAcessorios && precisaFoto) return 5

    return isColetiva ? 1 : 2
  }

  const complexidade = contrato.status === 'retorno' ? getComplexidadeMontagem() : null
  const complexidadeConfig = complexidade ? COMPLEXIDADE_CONFIG[complexidade] : null

  // Função para gerar e baixar/compartilhar a Ficha de Remoção
  const baixarFicha = async () => {
    if (!fichaRef.current) return

    setGerandoFicha(true)
    try {
      const blob = await captureElementAsBlob(fichaRef.current)
      const nomeArquivo = fichaFilename(contrato.codigo, contrato.pet_nome)

      // Tentar usar Web Share API se disponível (mobile)
      const canShare = typeof navigator.share === 'function' && typeof navigator.canShare === 'function'

      if (canShare) {
        const file = new File([blob], nomeArquivo, { type: 'image/png' })
        const shareData = {
          files: [file],
          title: 'Ficha de Remoção',
          text: `Ficha de Remoção - ${contrato.pet_nome}`,
        }
        try {
          if (navigator.canShare && navigator.canShare(shareData)) {
            await navigator.share(shareData)
          } else {
            downloadBlob(blob, nomeArquivo)
          }
        } catch {
          downloadBlob(blob, nomeArquivo)
        }
      } else {
        downloadBlob(blob, nomeArquivo)
      }
    } catch (error) {
      console.error('Erro ao gerar ficha:', error)
      alert('Erro ao gerar a ficha. Tente novamente.')
    } finally {
      setGerandoFicha(false)
    }
  }

  const downloadBlob = (blob: Blob, nomeArquivo: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = nomeArquivo
    link.href = url
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-4xl mx-auto pb-8">
      {/* Header com botão voltar */}
      <div className="mb-4">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-300 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">Voltar</span>
        </button>
      </div>

      {/* Hero Card - Pet + Info Principal */}
      <div className="rounded-xl overflow-hidden mb-6 bg-[var(--surface-0)] border border-[var(--surface-200)] shadow-md">
        {/* Status accent strip */}
        <div className="h-1.5" style={{ background: statusConfig.strip }} />

        <div className="p-4 md:p-5">
          {/* Row 1: Lacre + Pet Name + Badges + Code */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {/* Lacre */}
            <div className="relative" ref={lacreRef}>
              {editandoLacre ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={lacreTemp}
                    onChange={(e) => setLacreTemp(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') salvarLacre()
                      if (e.key === 'Escape') { setEditandoLacre(false); setLacrePopup(false) }
                    }}
                    placeholder="N do lacre"
                    className="w-28 px-2 py-1 bg-blue-600 text-white font-bold rounded-lg text-base border-2 border-blue-400 outline-none text-center"
                    autoFocus
                    disabled={salvandoLacre}
                  />
                  <button onClick={salvarLacre} disabled={salvandoLacre || !lacreTemp.trim()} className="p-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50" title="Salvar">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => { setEditandoLacre(false); setLacrePopup(false) }} className="p-1 bg-red-600 text-white rounded hover:bg-red-700" title="Cancelar">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : contrato.numero_lacre ? (
                <button
                  onClick={() => setLacrePopup(!lacrePopup)}
                  className="px-2.5 py-0.5 bg-blue-600 text-white font-bold rounded-lg text-base shadow-sm hover:bg-blue-500 transition-colors"
                  title="Clique para alterar lacre"
                >
                  {String(contrato.numero_lacre).replace(/\.0$/, '')}
                </button>
              ) : (
                <button
                  onClick={() => { setLacreTemp(''); setLacrePopup(false); setEditandoLacre(true) }}
                  className="px-2.5 py-0.5 bg-amber-600/80 text-white font-semibold rounded-lg text-sm shadow-sm hover:bg-amber-500 transition-colors animate-pulse"
                  title="Adicionar lacre"
                >
                  + Lacre
                </button>
              )}

              {/* Popup de confirmação */}
              {lacrePopup && !editandoLacre && (
                <div className="absolute top-full left-0 mt-2 z-30 bg-[var(--surface-0)] border border-[var(--surface-200)] rounded-xl shadow-xl p-3 min-w-[180px]">
                  <p className="text-sm text-[var(--surface-600)] mb-2.5">Alterar Lacre?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setLacreTemp(String(contrato.numero_lacre || '').replace(/\.0$/, ''))
                        setLacrePopup(false)
                        setEditandoLacre(true)
                      }}
                      className="flex-1 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Sim
                    </button>
                    <button
                      onClick={() => setLacrePopup(false)}
                      className="flex-1 px-3 py-1.5 text-sm font-medium bg-[var(--surface-100)] text-[var(--surface-600)] rounded-lg hover:bg-[var(--surface-200)] transition-colors"
                    >
                      Nao
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Pet Name + Gender */}
            <h1 className="text-2xl font-bold text-[var(--surface-800)]">
              {contrato.pet_nome}
              {contrato.pet_genero && (
                <span className="ml-1 text-lg" style={{ color: contrato.pet_genero === 'macho' ? '#3b82f6' : '#ec4899' }}>
                  {contrato.pet_genero === 'macho' ? '♂' : '♀'}
                </span>
              )}
            </h1>

            {/* Inline Badges */}
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
              contrato.tipo_plano === 'preventivo' ? 'bg-yellow-900/40 text-yellow-300' : 'bg-red-900/40 text-red-300'
            }`}>
              {contrato.tipo_plano === 'preventivo' ? 'PV' : 'EM'}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
              contrato.tipo_cremacao === 'individual' ? 'bg-green-900/40 text-green-300' : 'bg-purple-900/40 text-purple-300'
            }`}>
              {contrato.tipo_cremacao === 'individual' ? 'IND' : 'COL'}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusConfig.bg} ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
            {contrato.supinda ? (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-yellow-900/40 text-yellow-300" title="Encaminhamento de ida vinculado">
                ↑ {contrato.supinda.numero} · {new Date(contrato.supinda.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-yellow-900/20 text-yellow-400/60 italic" title="Pet ainda não provisionado em um encaminhamento">
                ↑ Sem encaminhamento
              </span>
            )}

            {/* Complexidade (retorno only) */}
            {complexidadeConfig && (
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${complexidadeConfig.bg} ${complexidadeConfig.color} ${complexidadeConfig.border}`}>
                ⚡{complexidadeConfig.label}
              </span>
            )}

            {/* Códigos (pushed right on desktop): contrato + referência, empilhados */}
            <div className="md:ml-auto flex flex-col items-end gap-1">
              <button
                onClick={async () => {
                  await copyToClipboard(contrato.codigo)
                  setCodigoCopied(true)
                  setTimeout(() => setCodigoCopied(false), 1500)
                }}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono font-semibold transition-colors ${
                  codigoCopied
                    ? 'bg-green-900/30 text-green-400'
                    : 'bg-[var(--surface-50)] hover:bg-[var(--surface-100)] text-[var(--surface-400)] hover:text-[var(--surface-600)]'
                }`}
                title={codigoCopied ? 'Copiado!' : 'Copiar código do contrato'}
              >
                {codigoCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {contrato.codigo}
              </button>
              <button
                onClick={async () => {
                  const ref = gerarCodigoReferencia()
                  await copyToClipboard(ref)
                  setRefCopied(true)
                  setTimeout(() => setRefCopied(false), 1500)
                }}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono transition-colors ${
                  refCopied
                    ? 'bg-green-900/30 text-green-400'
                    : 'bg-[var(--surface-50)] hover:bg-[var(--surface-100)] text-[var(--surface-400)] hover:text-[var(--surface-600)]'
                }`}
                title={refCopied ? 'Copiado!' : 'Copiar nome para agenda'}
              >
                {refCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {gerarCodigoReferencia()}
              </button>
            </div>
          </div>

          {/* Row 2: Pet details */}
          <div className="flex items-center gap-1.5 text-sm text-[var(--surface-500)] mb-3 flex-wrap">
            <span className="text-base">{petIcon.emoji}</span>
            {contrato.pet_raca && <span className="font-medium text-[var(--surface-600)]">{contrato.pet_raca}</span>}
            {contrato.pet_cor && <><span className="text-[var(--surface-300)]">·</span><span>{contrato.pet_cor}</span></>}
            {contrato.pet_idade_anos && <><span className="text-[var(--surface-300)]">·</span><span>{contrato.pet_idade_anos} anos</span></>}
            {contrato.pet_peso && (
              <><span className="text-[var(--surface-300)]">·</span><span className="font-mono font-semibold">{contrato.pet_peso}kg</span>
              {getPetPorte(contrato.pet_peso) && <span className="font-bold text-[var(--surface-600)]">{getPetPorte(contrato.pet_peso)}</span>}</>
            )}
          </div>

          {/* Row 2.5: Infos do acolhimento */}
          <div className="flex items-center gap-1.5 text-xs text-[var(--surface-500)] mb-3 flex-wrap">
            <span className="text-[var(--surface-400)]">🕒</span>
            <span className="font-medium text-[var(--surface-600)]">Acolhimento:</span>
            {acolhEditing ? (
              <>
                <input
                  type="date"
                  value={acolhDataInput}
                  onChange={e => setAcolhDataInput(e.target.value)}
                  disabled={acolhSaving}
                  className="text-xs px-2 py-0.5 rounded border border-[var(--surface-300)] bg-[var(--surface-0)] text-[var(--surface-800)]"
                />
                <input
                  type="time"
                  value={acolhHoraInput}
                  onChange={e => setAcolhHoraInput(e.target.value)}
                  disabled={acolhSaving}
                  className="text-xs px-2 py-0.5 rounded border border-[var(--surface-300)] bg-[var(--surface-0)] text-[var(--surface-800)]"
                />
                <button
                  onClick={salvarAcolhimento}
                  disabled={acolhSaving || !acolhDataInput || !acolhHoraInput}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {acolhSaving ? 'Salvando…' : 'Salvar'}
                </button>
                <button
                  onClick={() => setAcolhEditing(false)}
                  disabled={acolhSaving}
                  className="px-1.5 py-0.5 rounded text-[var(--surface-400)] hover:text-[var(--surface-700)] hover:bg-[var(--surface-100)]"
                  title="Cancelar"
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            ) : contrato.data_acolhimento ? (
              <>
                <span className="font-mono">
                  {(() => {
                    const d = new Date(contrato.data_acolhimento)
                    const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
                    const dia = String(d.getDate()).padStart(2, '0')
                    const mes = meses[d.getMonth()]
                    const ano = d.getFullYear()
                    return `${dia}/${mes}/${ano}`
                  })()}
                </span>
                <span className="text-[var(--surface-300)]">·</span>
                <span className="font-mono">
                  {new Date(contrato.data_acolhimento).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <button
                  onClick={iniciarEdicaoAcolhimento}
                  className="p-0.5 rounded text-[var(--surface-400)] hover:text-[var(--brand-500)] hover:bg-[var(--surface-100)] transition-colors"
                  title="Editar data/hora de acolhimento"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-900/20 text-amber-400 font-medium">
                  ⚠️ Não preenchido
                </span>
                <button
                  onClick={iniciarEdicaoAcolhimento}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold text-amber-400 border border-amber-500/40 hover:bg-amber-900/20 transition-colors"
                >
                  Definir
                </button>
              </>
            )}
              {contrato.funcionario?.nome && (
                <>
                  <span className="text-[var(--surface-300)]">·</span>
                  <span>por <span className="font-semibold text-[var(--surface-600)]">{contrato.funcionario.nome}</span></span>
                </>
              )}
              {contrato.local_coleta && (() => {
                const isClinica = contrato.local_coleta !== 'Residência' && contrato.local_coleta !== 'Unidade'
                const nomeClinica = contrato.estabelecimento_coleta?.nome || contrato.clinica_coleta
                const rotulo = isClinica && nomeClinica ? nomeClinica : contrato.local_coleta
                return (
                  <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                    contrato.local_coleta === 'Residência' ? 'bg-blue-900/30 text-blue-400' :
                    contrato.local_coleta === 'Unidade' ? 'bg-amber-900/30 text-amber-400' :
                    'bg-purple-900/30 text-purple-400'
                  }`}>
                    {contrato.local_coleta === 'Residência' ? '🏠' :
                     contrato.local_coleta === 'Unidade' ? '🏢' : '🏥'} {rotulo}
                  </span>
                )
              })()}
          </div>

          {/* Row 3: Tags */}
          <div className="mb-3">
            <InteractiveTags
              contrato={{
                ...contrato,
                contrato_produtos: contratoProdutos.map(cp => ({
                  foto_recebida: cp.foto_recebida,
                  rescaldo_feito: cp.rescaldo_feito,
                  produto: cp.produto ? {
                    codigo: cp.produto.codigo,
                    tipo: cp.produto.tipo,
                    precisa_foto: cp.produto.precisa_foto ?? false,
                    rescaldo_tipo: cp.produto.rescaldo_tipo ?? null,
                  } : null,
                })),
                pagamentos: pagamentos.map(p => ({ tipo: p.tipo, valor: p.valor })),
              }}
              handlers={{
                pelinho: () => setPelinhoModalOpen(true),
                urna: () => abrirAddProdutoModalComFiltro('urna'),
                certificado: () => setCertificadoModalOpen(true),
                foto: () => setFotoModal(true),
                pagamento: () => abrirMegaPagamento(0, 0),
                protocolo: () => {
                  if (contrato.protocolo_data) {
                    setProtocoloEdit(normalizarProtocoloData(contrato.protocolo_data))
                  } else {
                    const cpProdutos = contratoProdutos.map(cp => ({
                      valor: cp.valor,
                      produto: cp.produto ? { nome: cp.produto.nome, tipo: cp.produto.tipo, preco: cp.produto.preco } : null,
                    }))
                    const financeiro = calcFinanceiroProtocolo(contrato, pagamentos)
                    setProtocoloEdit(montarProtocoloData(contrato, cpProdutos, financeiro))
                  }
                },
                rescaldo: () => { setBuscaRescaldo(''); setRescaldoModal(true) },
              }}
              layout="detail"
              stopPropagation={false}
            />
          </div>

          {/* Row 4: Actions + Copy ref */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Mensagens Personalizadas (FLS: btn_mensagens — 3-way com pipeline) */}
            {isVisible(T, 'btn_mensagens') && (
              <ActionButtons
                contrato={contrato}
                handlers={{
                  onPetGrato: () => abrirPetGrato(),
                  onChegamos: () => setChegamosModalOpen(true),
                  onChegaram: () => setChegaramModalOpen(true),
                  onFinalizadora: () => setFinalizadoraModalOpen(true),
                }}
                layout="detail"
                stopPropagation={false}
              />
            )}
            {/* Botões Alteração Fase (FLS: btn_alteracao_fase — 3-way com pipeline) */}
            {isVisible(T, 'btn_alteracao_fase') && (
              <ActionButtons
                contrato={contrato}
                handlers={{
                  onAtivar: () => setAtivarModalOpen(true),
                  onEntrega: () => setEntregaModalOpen(true),
                }}
                layout="detail"
                stopPropagation={false}
              />
            )}

            {/* Botão Compartilhar (FLS: btn_compartilhar) */}
            {isVisible(T, 'btn_compartilhar') && (
              <button
                onClick={async () => {
                  setCompartilharTipo('remocao'); setCompartilharUnidadeId(''); setCompartilharModal(true)
                  if (todasUnidades.length === 0) {
                    const { data } = await supabase.from('unidades').select('id, codigo, nome').eq('ativa', true).order('ordem').order('nome')
                    if (data) setTodasUnidades(data as { id: string; codigo: string; nome: string }[])
                  }
                }}
                className="flex items-center justify-center w-7 h-7 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors"
                title="Compartilhar com outra unidade"
              >
                <span className="text-sm">🔄</span>
              </button>
            )}
            {/* Badges de compartilhamento (sempre visíveis, informativos) */}
            {contrato.unidade_remocao && (
              <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full font-bold bg-amber-900/40 text-amber-400 border border-amber-500/30">
                📍 Remoção: {contrato.unidade_remocao.codigo}
                {isVisible(T, 'btn_compartilhar') && (
                  <button
                    onClick={async () => {
                      await supabase.from('contratos').update({ unidade_remocao_id: null } as never).eq('id', contrato.id)
                      setContrato({ ...contrato, unidade_remocao_id: null, unidade_remocao: null })
                    }}
                    className="ml-1 hover:text-red-400"
                    title="Remover compartilhamento de remoção"
                  >✕</button>
                )}
              </span>
            )}
            {contrato.unidade_entrega && (
              <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full font-bold bg-cyan-900/40 text-cyan-400 border border-cyan-500/30">
                🛍️ Entrega: {contrato.unidade_entrega.codigo}
                {isVisible(T, 'btn_compartilhar') && (
                  <button
                    onClick={async () => {
                      await supabase.from('contratos').update({ unidade_entrega_id: null } as never).eq('id', contrato.id)
                      setContrato({ ...contrato, unidade_entrega_id: null, unidade_entrega: null })
                    }}
                    className="ml-1 hover:text-red-400"
                    title="Remover compartilhamento de entrega"
                  >✕</button>
                )}
              </span>
            )}

            {/* Botão Protocolo de Entrega (FLS: btn_fluxo_retorno) */}
            {(contrato.status === 'retorno' || contrato.status === 'pendente' || contrato.status === 'finalizado') && isVisible(T, 'btn_fluxo_retorno') && (
              <button
                onClick={() => {
                  if (contrato.protocolo_data) {
                    setProtocoloEdit(normalizarProtocoloData(contrato.protocolo_data))
                    return
                  }
                  const cpProdutos = contratoProdutos.map(cp => ({
                    valor: cp.valor,
                    produto: cp.produto ? {
                      nome: cp.produto.nome,
                      tipo: cp.produto.tipo,
                      preco: cp.produto.preco,
                    } : null,
                  }))
                  const financeiro = calcFinanceiroProtocolo(contrato, pagamentos)
                  setProtocoloEdit(montarProtocoloData(contrato, cpProdutos, financeiro))
                }}
                className={`flex items-center justify-center w-7 h-7 text-white rounded-full transition-colors ${
                  contrato.protocolo_data
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-cyan-600 hover:bg-cyan-700'
                }`}
                title={contrato.protocolo_data ? 'Protocolo: Salvo (clique para editar)' : 'Protocolo de Entrega'}
              >
                <Receipt className="h-4 w-4" />
              </button>
            )}

          </div>
        </div>
      </div>

      {/* Grid de Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Card Tutor */}
        <div className="bg-slate-800 rounded-xl shadow-md p-5 border border-slate-700 md:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-900/40 flex items-center justify-center">
              <User className="h-4 w-4 text-blue-400" />
            </div>
            <h2 className="font-semibold text-slate-200">Tutor</h2>
            {contrato.tutor && hasModule('func_tutores') && (
              <Link href={`/tutores/${contrato.tutor.id}`} className="text-xs text-purple-400 hover:underline ml-2">
                Ver cadastro
              </Link>
            )}
          </div>

          {(() => {
            // Usar dados do tutor vinculado, com fallback para campos legados
            const tutor = {
              nome: contrato.tutor?.nome || contrato.tutor_nome,
              telefone: contrato.tutor?.telefone || contrato.tutor_telefone,
              telefone2: contrato.tutor?.telefone2 || contrato.tutor_telefone2,
              telefoneNome: contrato.tutor?.telefone_nome || contrato.tutor_telefone_nome || null,
              telefone2Nome: contrato.tutor?.telefone2_nome || contrato.tutor_telefone2_nome || null,
              telefonePrincipal: contrato.tutor_telefone_principal || 1,
              email: contrato.tutor?.email || contrato.tutor_email,
              endereco: contrato.tutor?.endereco || contrato.tutor_endereco,
              numero: contrato.tutor?.numero || contrato.tutor_numero,
              complemento: contrato.tutor?.complemento || contrato.tutor_complemento,
              bairro: contrato.tutor?.bairro || contrato.tutor_bairro,
              cidade: contrato.tutor?.cidade || contrato.tutor_cidade,
              estado: contrato.tutor?.estado || contrato.tutor_estado,
              cep: contrato.tutor?.cep || contrato.tutor_cep,
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Contato */}
                <div>
                  <p className="text-xl font-bold mb-3 inline-block px-2 py-0.5 rounded-md bg-[var(--surface-50)] text-[var(--surface-700)]">{tutor.nome}</p>

                  <div className="space-y-2">
                    {/* Telefone 1 (Ficha) */}
                    {tutor.telefone && (
                      <div className="flex items-center gap-2">
                        <a
                          href={`https://wa.me/${tutor.telefone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex-1 flex items-center gap-3 p-2 rounded-lg transition-colors ${
                            tutor.telefonePrincipal === 1 ? 'bg-green-900/30 hover:bg-green-900/40' : 'bg-slate-700/50 hover:bg-slate-700/70'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tutor.telefonePrincipal === 1 ? 'bg-[#25D366]' : 'bg-slate-600'}`}>
                            <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                          </div>
                          <div className="flex flex-col">
                            <span className={`font-medium ${tutor.telefonePrincipal === 1 ? 'text-green-400' : 'text-slate-400'}`}>{formatarTelefone(tutor.telefone)}</span>
                            <span className="text-[10px] text-slate-500">
                              {tutor.telefoneNome && <span className="text-slate-300 font-medium">{tutor.telefoneNome} · </span>}
                              Ficha
                            </span>
                          </div>
                        </a>
                        <button
                          onClick={trocarTelefones}
                          disabled={salvandoTelefone || !tutor.telefone2}
                          className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold shrink-0 transition-colors ${
                            tutor.telefonePrincipal === 1
                              ? 'bg-green-600 text-white'
                              : 'bg-slate-700 text-slate-400 hover:bg-green-900/40 hover:text-green-400'
                          }`}
                          title={tutor.telefonePrincipal === 1 ? 'Este é o mais ativo' : 'Tornar este o mais ativo'}
                        >
                          {tutor.telefonePrincipal === 1 ? 'Mais ativo' : 'Tornar ativo'}
                        </button>
                      </div>
                    )}

                    {/* Telefone 2 (Processado) ou botão para adicionar */}
                    {tutor.telefone2 ? (
                      <div className="flex items-center gap-2">
                        <a
                          href={`https://wa.me/${tutor.telefone2.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex-1 flex items-center gap-3 p-2 rounded-lg transition-colors ${
                            tutor.telefonePrincipal === 2 ? 'bg-green-900/30 hover:bg-green-900/40' : 'bg-slate-700/50 hover:bg-slate-700/70'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tutor.telefonePrincipal === 2 ? 'bg-[#25D366]' : 'bg-slate-600'}`}>
                            <Phone className="h-4 w-4 text-white" />
                          </div>
                          <div className="flex flex-col">
                            <span className={`font-medium ${tutor.telefonePrincipal === 2 ? 'text-green-400' : 'text-slate-400'}`}>{formatarTelefone(tutor.telefone2)}</span>
                            <span className="text-[10px] text-slate-500">
                              {tutor.telefone2Nome && <span className="text-slate-300 font-medium">{tutor.telefone2Nome} · </span>}
                              Processado
                            </span>
                          </div>
                        </a>
                        <button
                          onClick={trocarTelefones}
                          disabled={salvandoTelefone}
                          className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold shrink-0 transition-colors ${
                            tutor.telefonePrincipal === 2
                              ? 'bg-green-600 text-white'
                              : 'bg-slate-700 text-slate-400 hover:bg-green-900/40 hover:text-green-400'
                          }`}
                          title={tutor.telefonePrincipal === 2 ? 'Este é o mais ativo' : 'Tornar este o mais ativo'}
                        >
                          {tutor.telefonePrincipal === 2 ? 'Mais ativo' : 'Tornar ativo'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setTelefone2Modal(true)}
                        className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-400 hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        + Adicionar telefone 2
                      </button>
                    )}

                    {tutor.email && (
                      <div className="flex items-center gap-3 text-slate-400">
                        <Mail className="h-4 w-4" />
                        <span className="text-sm">{tutor.email}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Endereço */}
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <MapPin className="h-4 w-4 text-rose-500" />
                    <span className="text-sm font-medium text-slate-400">Endereço</span>
                  </div>

                  <div className="text-slate-300">
                    {tutor.endereco && (
                      <p className="font-medium">
                        {tutor.endereco}{tutor.numero ? `, ${tutor.numero}` : ''}
                      </p>
                    )}
                    {tutor.complemento && (
                      <p className="text-slate-400 text-sm">{tutor.complemento}</p>
                    )}
                    {(tutor.bairro || tutor.cidade) && (
                      <p className="text-slate-400">
                        {[tutor.bairro, tutor.cidade, tutor.estado].filter(Boolean).join(' - ')}
                      </p>
                    )}
                    {tutor.cep && (
                      <p className="text-slate-400 text-sm mt-1">CEP: {tutor.cep}</p>
                    )}
                    {(tutor.endereco || tutor.cep) && (
                      <div className="flex items-center justify-center gap-3 mt-4">
                        <a
                          href={`https://waze.com/ul?q=${encodeURIComponent(
                            [tutor.endereco, tutor.numero, tutor.bairro, tutor.cidade, tutor.estado, tutor.cep].filter(Boolean).join(', ')
                          )}&navigate=yes`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-11 h-11 rounded-2xl shadow-md hover:shadow-lg hover:scale-105 transition-all overflow-hidden"
                          title="Abrir no Waze"
                        >
                          <img src="/waze.png" alt="Waze" className="w-full h-full object-cover" />
                        </a>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            [tutor.endereco, tutor.numero, tutor.bairro, tutor.cidade, tutor.estado, tutor.cep].filter(Boolean).join(', ')
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-11 h-11 rounded-2xl shadow-md hover:shadow-lg hover:scale-105 transition-all overflow-hidden"
                          title="Abrir no Google Maps"
                        >
                          <img src="/gmaps.png" alt="Google Maps" className="w-full h-full object-cover" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>


        {/* Card Financeiro + Pagamentos - Ocupa 2 colunas (FLS: obj_financeiro) */}
        {isVisible(T, 'obj_financeiro') && <div className="bg-slate-800 rounded-xl shadow-md p-5 border border-slate-700 md:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-900/40 flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-emerald-400" />
              </div>
              <h2 className="font-semibold text-slate-200">Financeiro</h2>
            </div>

            <div className="flex items-center gap-2">
              {/* Botão/Status NFS-e */}
              {contrato.nfse_numero ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-900/40 text-green-400 rounded-lg text-sm">
                  <span>📄</span>
                  <span>NF: {contrato.nfse_numero}</span>
                  {contrato.nfse_link_pdf && (
                    <a
                      href={contrato.nfse_link_pdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-400 hover:underline ml-1"
                    >
                      PDF
                    </a>
                  )}
                </div>
              ) : valorTotal > 0 && isVisible(T, 'btn_emitir_nfse') ? (
                <button
                  onClick={emitirNfse}
                  disabled={emitindoNf || !canEdit(T, 'btn_emitir_nfse')}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileText className="h-4 w-4" />
                  {emitindoNf ? 'Emitindo...' : 'Emitir NF'}
                </button>
              ) : null}

              {/* Botão Adicionar Pagamento (FLS: btn_mega_pagamento) */}
              {isVisible(T, 'btn_mega_pagamento') && (
                <button
                  onClick={() => abrirMegaPagamento(0, 0)}
                  disabled={!canEdit(T, 'btn_mega_pagamento')}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Pagamento
                </button>
              )}
            </div>
          </div>

          {/* Mensagem de NF */}
          {nfMensagem && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${
              nfMensagem.tipo === 'sucesso' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'
            }`}>
              {nfMensagem.texto}
            </div>
          )}

          {/* Resumo Financeiro */}
          {(() => {
            // Calcular descontos pós-venda por tipo
            const descontoPosPlano = pagamentos
              .filter(p => p.tipo === 'plano')
              .reduce((sum, p) => sum + (p.desconto || 0), 0)
            const descontoPosAcessorios = pagamentos
              .filter(p => p.tipo === 'catalogo')
              .reduce((sum, p) => sum + (p.desconto || 0), 0)

            // Totais de desconto
            const totalDescontoPlano = (contrato.desconto_plano || 0) + descontoPosPlano
            const totalDescontoAcessorios = (contrato.desconto_acessorios || 0) + descontoPosAcessorios

            // A pagar (descontando pré e pós)
            const aPagarPlano = (contrato.valor_plano || 0) - totalDescontoPlano
            const aPagarAcessorios = (contrato.valor_acessorios || 0) - totalDescontoAcessorios
            const aPagarTotal = aPagarPlano + aPagarAcessorios

            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {/* Valores Brutos */}
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-400 uppercase mb-2">Valores</p>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">Plano:</span>
                      {valorPlanoEditing ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-slate-400">R$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            autoFocus
                            value={valorPlanoInput}
                            onChange={e => setValorPlanoInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') salvarValorPlano()
                              if (e.key === 'Escape') setValorPlanoEditing(false)
                            }}
                            disabled={valorPlanoSaving}
                            className="w-20 px-1.5 py-0.5 bg-slate-900 border border-slate-600 rounded text-xs text-slate-200 text-right focus:outline-none focus:border-blue-500"
                          />
                          <button
                            onClick={salvarValorPlano}
                            disabled={valorPlanoSaving}
                            className="p-0.5 text-green-400 hover:text-green-300 disabled:opacity-50"
                            title="Salvar (Enter)"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setValorPlanoEditing(false)}
                            disabled={valorPlanoSaving}
                            className="p-0.5 text-slate-400 hover:text-slate-300 disabled:opacity-50"
                            title="Cancelar (Esc)"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-slate-200">{formatarMoeda(contrato.valor_plano)}</span>
                          {isVisible(T, 'valor_plano') && canEdit(T, 'valor_plano') && (
                            <button
                              onClick={abrirEditorValorPlano}
                              className="p-0.5 text-slate-500 hover:text-blue-400 transition-colors"
                              title="Editar valor do plano"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-slate-400">Acessórios:</span>
                      <span className="text-sm font-semibold text-slate-200">{formatarMoeda(contrato.valor_acessorios)}</span>
                    </div>
                  </div>
                </div>

                {/* Descontos (Pré + Pós) */}
                <div className="bg-amber-900/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-xs text-amber-400 uppercase">Descontos</p>
                    <div className="flex gap-3 text-[9px] text-slate-400 uppercase">
                      <span>Pré</span>
                      <span>Pós</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">Plano:</span>
                      <div className="flex gap-3">
                        <span className="text-xs font-semibold text-amber-400 w-16 text-right">-{formatarMoeda(contrato.desconto_plano || 0)}</span>
                        <span className="text-xs font-semibold text-orange-400 w-16 text-right">-{formatarMoeda(descontoPosPlano)}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">Acess.:</span>
                      <div className="flex gap-3">
                        <span className="text-xs font-semibold text-amber-400 w-16 text-right">-{formatarMoeda(contrato.desconto_acessorios || 0)}</span>
                        <span className="text-xs font-semibold text-orange-400 w-16 text-right">-{formatarMoeda(descontoPosAcessorios)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* A Pagar (líquido) */}
                <div className="bg-emerald-900/30 rounded-lg p-3">
                  <p className="text-xs text-emerald-400 uppercase mb-2">A Pagar</p>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-xs text-emerald-500">Plano:</span>
                      <span className="text-sm font-semibold text-emerald-400">{formatarMoeda(aPagarPlano)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-emerald-500">Acessórios:</span>
                      <span className="text-sm font-semibold text-emerald-400">{formatarMoeda(aPagarAcessorios)}</span>
                    </div>
                  </div>
                </div>

                {/* Total */}
                <div className="bg-emerald-900/40 rounded-lg p-3 flex flex-col justify-center">
                  <p className="text-xs text-emerald-400 uppercase mb-1">Total</p>
                  <p className="text-2xl font-bold text-emerald-400">{formatarMoeda(aPagarTotal)}</p>
                </div>
              </div>
            )
          })()}

          {/* Lista de Pagamentos */}
          <div className="border-t border-slate-600 pt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-300">Pagamentos</span>
              {pagamentos.length > 0 && (
                <span className="text-xs text-slate-400">({pagamentos.length})</span>
              )}
            </div>

            {carregandoPagamentos ? (
              <div className="text-center py-4 text-slate-400">Carregando...</div>
            ) : pagamentos.length === 0 ? (
              <div className="text-center py-4 text-slate-400">Nenhum pagamento registrado</div>
            ) : (
              <div className="space-y-2">
                {pagamentos.map((pag) => (
                  <div
                    key={pag.id}
                    className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {/* Ícone do método */}
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        pag.metodo === 'pix' ? 'bg-green-900/40' :
                        pag.metodo === 'credito' ? 'bg-blue-900/40' :
                        pag.metodo === 'debito' ? 'bg-purple-900/40' :
                        'bg-amber-900/40'
                      }`}>
                        <PaymentIcon metodo={pag.metodo} bandeira={pag.bandeira} />
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200">
                            {formatarMoeda(pag.valor - (pag.desconto || 0))}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            pag.tipo === 'plano' ? 'bg-blue-900/40 text-blue-400' : 'bg-purple-900/40 text-purple-400'
                          }`}>
                            {pag.tipo === 'plano' ? 'Plano' : 'Acessório'}
                          </span>
                          {pag.is_seguradora && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400">
                              Seguradora
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span className="capitalize">{pag.metodo}</span>
                          {pag.conta?.nome && <span>• {pag.conta.nome}</span>}
                          {pag.data_pagamento && (
                            <span>• {new Date(pag.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                          )}
                          {pag.parcelas > 1 && <span>• {pag.parcelas}x</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => abrirMegaPagamento(0, 0, pag)}
                        className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-900/30 rounded transition-colors"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => excluirPagamento(pag.id)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/30 rounded transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Rodapé com totais */}
            {(() => {
              // Calcular valores
              const valorRecebido = pagamentos.reduce((sum, p) => sum + p.valor - (p.desconto || 0), 0) // Dinheiro que entrou no caixa

              // Calcular A Pagar (consistente com o card acima)
              const descontoPosPlano = pagamentos
                .filter(p => p.tipo === 'plano')
                .reduce((sum, p) => sum + (p.desconto || 0), 0)
              const descontoPosAcessorios = pagamentos
                .filter(p => p.tipo === 'catalogo')
                .reduce((sum, p) => sum + (p.desconto || 0), 0)
              // A pagar por tipo
              const aPagarPlano = (contrato.valor_plano || 0) - (contrato.desconto_plano || 0) - descontoPosPlano
              const aPagarAcessorios = (contrato.valor_acessorios || 0) - (contrato.desconto_acessorios || 0) - descontoPosAcessorios
              const aPagarTotal = aPagarPlano + aPagarAcessorios

              // Saldo = A Pagar - Recebido
              const saldo = aPagarTotal - valorRecebido

              // Calcular saldos por tipo para mega pagamento
              const recebidoPlano = pagamentos
                .filter(p => p.tipo === 'plano')
                .reduce((sum, p) => sum + p.valor - (p.desconto || 0), 0)
              const recebidoAcessorio = pagamentos
                .filter(p => p.tipo === 'catalogo')
                .reduce((sum, p) => sum + p.valor - (p.desconto || 0), 0)
              const saldoPlano = aPagarPlano - recebidoPlano
              const saldoAcessorio = aPagarAcessorios - recebidoAcessorio

              return (
                <div className={`${pagamentos.length > 0 ? 'mt-4 pt-3 border-t border-slate-600' : ''}`}>
                  <div className="grid grid-cols-2 gap-4 mb-2">
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-400">Recebido</span>
                      <span className="text-lg font-bold text-green-400">
                        {formatarMoeda(valorRecebido)}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Saldo</span>
                        {saldo > 0.01 && (
                          <button
                            onClick={() => abrirMegaPagamento(saldoPlano, saldoAcessorio)}
                            className="hover:scale-110 transition-all"
                            title="Quitar saldo"
                          >
                            <span className="text-lg opacity-60 hover:opacity-100">💲</span>
                          </button>
                        )}
                      </div>
                      <span className={`text-xl font-bold ${
                        saldo > 0.01 ? 'text-red-400' : saldo < -0.01 ? 'text-blue-400' : 'text-green-400'
                      }`}>
                        {Math.abs(saldo) < 0.01 ? '✓ Quitado' : formatarMoeda(saldo)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>}

        {/* Card Produtos do Contrato (FLS: obj_produtos) */}
        {isVisible(T, 'obj_produtos') && <div className="bg-slate-800 rounded-xl shadow-md p-5 border border-slate-700 md:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-900/40 flex items-center justify-center">
                <span className="text-lg">🛒</span>
              </div>
              <h2 className="font-semibold text-slate-200">Produtos</h2>
              {contratoProdutos.length > 0 && (
                <span className="text-sm text-slate-400">({contratoProdutos.length})</span>
              )}
              {/* Indicador de Fotos Pendentes */}
              {(() => {
                const produtosPrecisamFoto = contratoProdutos.filter(cp => cp.produto?.precisa_foto === true)
                const fotoTotal = produtosPrecisamFoto.length
                const fotoRecebidas = produtosPrecisamFoto.filter(cp => cp.foto_recebida === true).length
                const fotoPendentes = fotoTotal - fotoRecebidas
                if (fotoTotal === 0) return null
                return (
                  <button
                    onClick={() => setFotoModal(true)}
                    className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border-2 cursor-pointer hover:opacity-80 transition-opacity ${
                      fotoPendentes > 0
                        ? 'bg-yellow-900/40 text-yellow-400 border-yellow-500'
                        : 'bg-green-900/40 text-green-400 border-green-500'
                    }`}
                    title={fotoPendentes > 0 ? `${fotoPendentes} foto(s) pendente(s)` : 'Todas as fotos recebidas'}
                  >
                    <span>📷</span>
                    <span className="font-bold">{fotoPendentes > 0 ? fotoPendentes : '✅'}</span>
                  </button>
                )
              })()}
            </div>
            <div className="flex items-center gap-2">
              {contratoProdutos.length > 0 && (
                contratoProdutos.every(cp => cp.separado) ? (
                  <button
                    onClick={() => marcarTodosSeparados(false)}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-green-900/40 text-green-400 hover:bg-red-900/40 hover:text-red-400 transition-colors"
                  >
                    📦 Todos ✓
                  </button>
                ) : (
                  <button
                    onClick={() => marcarTodosSeparados(true)}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-slate-700 text-slate-400 hover:bg-green-900/40 hover:text-green-400 transition-colors"
                  >
                    📦 Separar todos
                  </button>
                )
              )}
              {isVisible(T, 'btn_add_produto') && (
                <button
                  onClick={abrirAddProdutoModal}
                  disabled={!canEdit(T, 'btn_add_produto')}
                  className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar
                </button>
              )}
            </div>
          </div>

          {carregandoProdutos ? (
            <div className="text-center py-4 text-slate-400">Carregando produtos...</div>
          ) : contratoProdutos.length === 0 ? (
            <div className="text-center py-4 text-slate-400">Nenhum produto vinculado</div>
          ) : (
            <div className="space-y-2">
              {[...contratoProdutos]
                .sort((a, b) => {
                  // 1. Ordenar por tipo: urna primeiro, depois acessorio, depois incluso
                  const tipoOrdem = { urna: 0, acessorio: 1, incluso: 2 }
                  const tipoA = tipoOrdem[a.produto.tipo as keyof typeof tipoOrdem] ?? 3
                  const tipoB = tipoOrdem[b.produto.tipo as keyof typeof tipoOrdem] ?? 3
                  if (tipoA !== tipoB) return tipoA - tipoB
                  // 2. Dentro do mesmo tipo, ordenar por preço (mais caro primeiro)
                  const precoA = a.valor || a.produto.preco || 0
                  const precoB = b.valor || b.produto.preco || 0
                  return precoB - precoA
                })
                .map((cp) => (
                <div
                  key={cp.id}
                  className={`rounded-lg border ${
                    cp.produto.tipo === 'urna' ? 'bg-amber-900/30 border-amber-200' :
                    cp.produto.tipo === 'acessorio' ? 'bg-purple-900/30 border-purple-200' :
                    'bg-green-900/30 border-green-200'
                  }`}
                >
                  {editandoProduto === cp.id ? (
                    /* Modo Edição */
                    <div className="p-3">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-700 border overflow-hidden flex-shrink-0">
                          <img
                            src={cp.produto.imagem_url || `/estoque/${cp.produto.codigo}.png`}
                            alt={cp.produto.nome}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              const currentSrc = target.src
                              if (cp.produto.imagem_url && currentSrc.includes(cp.produto.imagem_url)) {
                                target.src = `/estoque/${cp.produto.codigo}.png`
                              } else if (currentSrc.endsWith('.png')) {
                                target.src = `/estoque/${cp.produto.codigo}.jpg`
                              }
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-200 text-sm line-clamp-2">{cp.produto.nome}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">Qtd</label>
                          <input
                            type="number"
                            min="1"
                            value={editForm.quantidade}
                            onChange={(e) => setEditForm({ ...editForm, quantidade: parseInt(e.target.value) || 1 })}
                            className="w-full px-2 py-1 border rounded text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">Valor R$</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editForm.valor}
                            onChange={(e) => setEditForm({ ...editForm, valor: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1 border rounded text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">Desconto R$</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0"
                            value={editForm.desconto}
                            onChange={(e) => setEditForm({ ...editForm, desconto: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                            className="w-full px-2 py-1 border rounded text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 mt-3">
                        <button
                          onClick={() => setEditandoProduto(null)}
                          className="px-3 py-1 text-sm text-slate-400 hover:text-slate-200"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => salvarEdicao(cp.id)}
                          disabled={salvando}
                          className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          <Check className="h-3 w-3" />
                          Salvar
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Modo Visualização */
                    <div className="flex items-center gap-3 p-2">
                      {/* Imagem */}
                      <div className="w-12 h-12 rounded-lg bg-slate-700 border overflow-hidden flex-shrink-0">
                        <img
                          src={cp.produto.imagem_url || `/estoque/${cp.produto.codigo}.png`}
                          alt={cp.produto.nome}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            const currentSrc = target.src
                            if (cp.produto.imagem_url && currentSrc.includes(cp.produto.imagem_url)) {
                              target.src = `/estoque/${cp.produto.codigo}.png`
                            } else if (currentSrc.endsWith('.png')) {
                              target.src = `/estoque/${cp.produto.codigo}.jpg`
                            } else {
                              target.style.display = 'none'
                            }
                          }}
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        {cp.is_reserva_pv && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-200 text-yellow-800 font-semibold">PV</span>
                        )}
                        <p className="font-semibold text-slate-200 text-sm line-clamp-2">{cp.produto.nome}</p>
                      </div>

                      {/* Valor */}
                      <div className="text-right flex-shrink-0">
                        {cp.valor && cp.valor > 0 ? (
                          <div>
                            {cp.desconto && cp.desconto > 0 ? (
                              <>
                                <p className="text-sm text-slate-400 line-through">R$ {cp.valor.toFixed(0)}</p>
                                <p className="text-base font-bold text-green-400">R$ {(cp.valor - cp.desconto).toFixed(0)}</p>
                              </>
                            ) : (
                              <p className="text-base font-bold text-green-400">R$ {cp.valor.toFixed(0)}</p>
                            )}
                          </div>
                        ) : cp.desconto && cp.desconto > 0 ? (
                          <p className="text-sm text-red-500">-R$ {cp.desconto.toFixed(0)}</p>
                        ) : null}
                      </div>

                      {/* Status Foto Recebida (só para produtos que precisam foto) */}
                      {cp.produto.precisa_foto && (
                        <button
                          onClick={() => toggleFotoRecebida(cp)}
                          className="flex-shrink-0 hover:scale-110 transition-transform"
                          title={cp.foto_recebida ? 'Foto recebida - clique para desmarcar' : 'Clique para marcar foto como recebida'}
                        >
                          <span className={`text-lg ${cp.foto_recebida ? '' : 'opacity-30'}`}>
                            📷
                          </span>
                        </button>
                      )}

                      {/* Status Separado (clicável) */}
                      <button
                        onClick={() => toggleSeparado(cp)}
                        className="flex-shrink-0 hover:scale-110 transition-transform"
                        title={cp.separado ? 'Clique para desmarcar' : 'Clique para marcar como separado'}
                      >
                        <span className={`text-lg ${cp.separado ? '' : 'opacity-30'}`}>
                          📦
                        </span>
                      </button>

                      {/* Ações */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => iniciarEdicao(cp)}
                          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-900/30 rounded transition-colors"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {cp.produto?.codigo !== '0004' && (
                          <button
                            onClick={() => removerProduto(cp.id)}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/30 rounded transition-colors"
                            title="Remover"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>}

        {/* Card GC — aparece quando status é 'pinda' ou posterior E func_gc habilitado */}
        {hasModule('func_gc') && (['pinda', 'retorno', 'pendente', 'finalizado'].includes(contrato.status)) && (
          <div className="md:col-span-2">
            <GCTracking
              contratoId={contrato.id}
              tipoCremacao={contrato.tipo_cremacao}
              observacoesContrato={contrato.observacoes}
            />
          </div>
        )}

        {/* Card Observações */}
        <ObservacoesCard contratoId={contrato.id} observacoesFicha={contrato.observacoes} />

        {/* Histórico de alterações */}
        <HistoricoCard contratoId={contrato.id} />
      </div>


      {/* Modal Adicionar Produto */}
      {/* Prompt: Adicionar nova urna OU Trocar pela existente? */}
      {trocaUrnaPrompt && contrato && produtoParaAdicionar && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={() => setTrocaUrnaPrompt(null)}>
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-200 mb-2">⚱️ Já existe uma urna no contrato</h3>
            <p className="text-sm text-slate-400 mb-4">
              Atual: <span className="text-slate-200 font-medium">{trocaUrnaPrompt.urnaAnterior.produto?.nome || 'urna'}</span>
              <br />
              Nova: <span className="text-slate-200 font-medium">{produtoParaAdicionar.nome}</span>
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => confirmarAdicionarProduto({ trocarUrna: trocaUrnaPrompt.urnaAnterior })}
                disabled={salvando}
                className="w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                {salvando ? 'Trocando…' : 'Trocar pela existente (devolve a anterior pro estoque)'}
              </button>
              <button
                onClick={() => {
                  setTrocaUrnaPrompt(null)
                  confirmarAdicionarProduto({ forcarAdicionarNova: true })
                }}
                disabled={salvando}
                className="w-full py-2 px-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                Adicionar como NOVA urna (manter a existente)
              </button>
              <button
                onClick={() => setTrocaUrnaPrompt(null)}
                disabled={salvando}
                className="w-full py-2 px-3 rounded-lg text-slate-400 hover:text-slate-200 text-sm disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {addProdutoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setAddProdutoModal(false)}>
          <div className="bg-slate-800 rounded-2xl w-full max-w-5xl max-h-[90vh] shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-slate-200">➕ Adicionar Produto</h3>
              <button onClick={() => setAddProdutoModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Busca */}
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar produto por nome ou código..."
                  value={buscaProduto}
                  onChange={(e) => setBuscaProduto(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            {/* Filtros por tipo */}
            <div className="px-4 pt-4">
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => { setFiltroProdutoTipo(''); setFiltroProdutoCategoria(''); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filtroProdutoTipo === '' ? 'bg-purple-600 text-white' : 'text-slate-400 bg-slate-700 hover:bg-slate-600'
                  }`}
                >
                  Todos ({contadoresProdutos.total})
                </button>
                <button
                  onClick={() => { setFiltroProdutoTipo('urna'); setFiltroProdutoCategoria(''); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filtroProdutoTipo === 'urna' ? 'bg-purple-600 text-white' : 'text-slate-400 bg-slate-700 hover:bg-slate-600'
                  }`}
                >
                  Urnas ({contadoresProdutos.urna})
                </button>
                <button
                  onClick={() => { setFiltroProdutoTipo('acessorio'); setFiltroProdutoCategoria(''); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filtroProdutoTipo === 'acessorio' ? 'bg-purple-600 text-white' : 'text-slate-400 bg-slate-700 hover:bg-slate-600'
                  }`}
                >
                  Acessórios ({contadoresProdutos.acessorio})
                </button>
                <button
                  onClick={() => { setFiltroProdutoTipo('incluso'); setFiltroProdutoCategoria(''); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filtroProdutoTipo === 'incluso' ? 'bg-purple-600 text-white' : 'text-slate-400 bg-slate-700 hover:bg-slate-600'
                  }`}
                >
                  Inclusos ({contadoresProdutos.incluso})
                </button>
              </div>

              {/* Filtros por categoria de urna */}
              {filtroProdutoTipo === 'urna' && categoriasUrnasModal.length > 0 && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button
                    onClick={() => setFiltroProdutoCategoria('')}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      filtroProdutoCategoria === '' ? 'bg-amber-500 text-white' : 'text-slate-400 bg-slate-700 hover:bg-slate-600'
                    }`}
                  >
                    Todas
                  </button>
                  {categoriasUrnasModal.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setFiltroProdutoCategoria(cat)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        filtroProdutoCategoria === cat ? 'bg-amber-500 text-white' : 'text-slate-400 bg-slate-700 hover:bg-slate-600'
                      }`}
                    >
                      {CATEGORIA_URNA_LABELS[cat] || cat}
                    </button>
                  ))}
                </div>
              )}

              {/* Filtros por categoria de acessório */}
              {filtroProdutoTipo === 'acessorio' && categoriasAcessoriosModal.length > 0 && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button
                    onClick={() => setFiltroProdutoCategoria('')}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      filtroProdutoCategoria === '' ? 'bg-blue-500 text-white' : 'text-slate-400 bg-slate-700 hover:bg-slate-600'
                    }`}
                  >
                    Todas
                  </button>
                  {categoriasAcessoriosModal.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setFiltroProdutoCategoria(cat)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        filtroProdutoCategoria === cat ? 'bg-blue-500 text-white' : 'text-slate-400 bg-slate-700 hover:bg-slate-600'
                      }`}
                    >
                      {CATEGORIA_ACESSORIO_LABELS[cat] || cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Grid de Produtos agrupado por categoria */}
            <div className="flex-1 overflow-y-auto p-4">
              {todosProdutos.length === 0 ? (
                <div className="text-center py-8 text-slate-400">Carregando produtos...</div>
              ) : produtosDisponiveis.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  {buscaProduto || filtroProdutoTipo ? 'Nenhum produto encontrado' : 'Todos os produtos já foram adicionados'}
                </div>
              ) : (() => {
                // Agrupar por tipo (se "Todos") e depois por categoria
                const TIPO_ORDER = ['urna', 'acessorio', 'incluso']
                const tiposParaMostrar = filtroProdutoTipo ? [filtroProdutoTipo] : TIPO_ORDER

                const CATEGORIA_LABELS: Record<string, string> = { ...CATEGORIA_URNA_LABELS, ...CATEGORIA_ACESSORIO_LABELS }
                const TIPO_HEADER_COLORS: Record<string, string> = {
                  urna: 'text-purple-400 border-purple-200 bg-purple-900/30',
                  acessorio: 'text-blue-400 border-blue-200 bg-blue-900/30',
                  incluso: 'text-green-400 border-green-200 bg-green-900/30',
                }

                return (
                  <div className="space-y-6">
                    {tiposParaMostrar.map(tipo => {
                      const produtosTipo = produtosDisponiveis.filter(p => p.tipo === tipo)
                      if (produtosTipo.length === 0) return null

                      // Agrupar por categoria
                      const porCategoriaMap = new Map<string, typeof produtosTipo>()
                      produtosTipo.forEach(p => {
                        const cat = p.categoria || 'Sem categoria'
                        if (!porCategoriaMap.has(cat)) porCategoriaMap.set(cat, [])
                        porCategoriaMap.get(cat)!.push(p)
                      })

                      // Ordenar categorias: acessórios na ordem do estoque, urnas alfabética
                      const ORDEM_ACESSORIOS = ['Porta-Retratos', 'Porta-Pelos', 'Porta-Cinzas', 'Miniaturas', 'Chaveiros Cinzas', 'Outros']
                      const categoriasOrdenadas = [...porCategoriaMap.keys()].sort((a, b) => {
                        if (tipo === 'acessorio') {
                          const idxA = ORDEM_ACESSORIOS.indexOf(a)
                          const idxB = ORDEM_ACESSORIOS.indexOf(b)
                          return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB)
                        }
                        return a.localeCompare(b)
                      })

                      // Se já filtrou por categoria, não precisa sub-header
                      const mostrarSubHeaders = !filtroProdutoCategoria && porCategoriaMap.size > 1

                      return (
                        <div key={tipo}>
                          {/* Header do tipo (só mostra quando "Todos") */}
                          {!filtroProdutoTipo && (
                            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border mb-3 ${TIPO_HEADER_COLORS[tipo]}`}>
                              <span className="font-semibold text-sm">{TIPO_LABELS[tipo]}s</span>
                              <span className="text-xs opacity-70">({produtosTipo.length})</span>
                            </div>
                          )}

                          <div className="space-y-4">
                            {categoriasOrdenadas.map(cat => { const produtos = porCategoriaMap.get(cat)!; return (
                              <div key={cat}>
                                {mostrarSubHeaders && (
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{CATEGORIA_LABELS[cat] || cat}</span>
                                    <span className="text-xs text-slate-400">({produtos.length})</span>
                                    <div className="flex-1 h-px bg-slate-600" />
                                  </div>
                                )}
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                  {produtos.map((produto) => {
                                    const statusEstoque = getStatusEstoque(produto.estoque_atual, produto.estoque_minimo, produto.estoque_infinito)
                                    const temEstoque = produto.estoque_infinito || produto.estoque_atual > 0

                                    return (
                                      <button
                                        key={produto.id}
                                        onClick={() => selecionarProdutoParaAdicionar(produto)}
                                        disabled={salvando}
                                        className="bg-slate-700 rounded-xl border hover:shadow-lg transition-all text-left overflow-hidden disabled:opacity-50"
                                      >
                                        {/* Imagem */}
                                        <div className="aspect-square bg-slate-700 relative">
                                          <img
                                            src={produto.imagem_url || `/estoque/${produto.codigo}.png`}
                                            alt={produto.nome}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                              const target = e.target as HTMLImageElement
                                              const currentSrc = target.src
                                              if (produto.imagem_url && currentSrc.includes(produto.imagem_url)) {
                                                target.src = `/estoque/${produto.codigo}.png`
                                              } else if (currentSrc.endsWith('.png')) {
                                                target.src = `/estoque/${produto.codigo}.jpg`
                                              } else if (currentSrc.endsWith('.jpg')) {
                                                target.src = `/estoque/${produto.codigo}.jpeg`
                                              } else {
                                                target.style.display = 'none'
                                                target.nextElementSibling?.classList.remove('hidden')
                                              }
                                            }}
                                          />
                                          <div className="hidden w-full h-full flex items-center justify-center absolute inset-0">
                                            <Package className="h-12 w-12 text-slate-300" />
                                          </div>
                                          {/* Indicador estoque */}
                                          {statusEstoque.status !== 'ok' && statusEstoque.status !== 'infinito' && (
                                            <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${statusEstoque.color}`} title={statusEstoque.label} />
                                          )}
                                          {/* Sem estoque overlay */}
                                          {!temEstoque && (
                                            <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-red-500 rounded text-white text-[10px] font-bold">
                                              {produto.estoque_atual}
                                            </div>
                                          )}
                                        </div>

                                        {/* Info */}
                                        <div className="p-3">
                                          <p className="font-medium text-slate-200 text-sm line-clamp-2 min-h-[2.5rem]" title={produto.nome}>{produto.nome}</p>

                                          <div className="flex justify-between items-center mt-2">
                                            <div className="flex items-center gap-1">
                                              {statusEstoque.status === 'critico' && <AlertTriangle className="h-3 w-3 text-red-500" />}
                                              {statusEstoque.status === 'baixo' && <AlertTriangle className="h-3 w-3 text-yellow-500" />}
                                              <span className={`text-sm font-semibold ${
                                                statusEstoque.status === 'infinito' ? 'text-blue-400' :
                                                statusEstoque.status === 'critico' ? 'text-red-400' :
                                                statusEstoque.status === 'baixo' ? 'text-yellow-600' :
                                                'text-slate-300'
                                              }`}>
                                                {produto.estoque_infinito ? '∞' : produto.estoque_atual}
                                              </span>
                                              {!produto.estoque_infinito && <span className="text-xs text-slate-400">un</span>}
                                            </div>
                                            {produto.preco && produto.preco > 0 && (
                                              <span className="text-sm font-semibold text-green-400">
                                                R$ {produto.preco.toFixed(0)}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            ); })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-slate-700/50 text-center text-sm text-slate-400">
              Clique em um produto para adicioná-lo ao contrato
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmação Adicionar Produto */}
      {produtoParaAdicionar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setProdutoParaAdicionar(null)}>
          <div className="bg-slate-800 rounded-2xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-slate-200">Adicionar Produto</h3>
              <button onClick={() => setProdutoParaAdicionar(null)} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Produto selecionado */}
            <div className="p-4">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-20 h-20 rounded-lg bg-slate-700 overflow-hidden flex-shrink-0">
                  <img
                    src={produtoParaAdicionar.imagem_url || `/estoque/${produtoParaAdicionar.codigo}.png`}
                    alt={produtoParaAdicionar.nome}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      if (target.src.endsWith('.png')) {
                        target.src = `/estoque/${produtoParaAdicionar.codigo}.jpg`
                      }
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-200 line-clamp-2">{produtoParaAdicionar.nome}</p>
                  {/* Preço editável */}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-slate-400">R$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={typeof addProdutoForm.precoCustom === 'number' ? addProdutoForm.precoCustom : (produtoParaAdicionar.preco || 0)}
                      onChange={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : ''
                        setAddProdutoForm(prev => ({ ...prev, precoCustom: val }))
                      }}
                      className="w-28 px-2 py-1 text-lg font-bold text-green-400 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-green-900/20"
                    />
                    {typeof addProdutoForm.precoCustom === 'number' && addProdutoForm.precoCustom !== (produtoParaAdicionar.preco || 0) && (
                      <span className="text-xs text-slate-400 line-through">
                        {formatarMoeda(produtoParaAdicionar.preco)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Toggle para opções avançadas (quantidade/desconto) */}
              <div className="mb-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={mostrarOpcoesProduto}
                    onChange={(e) => setMostrarOpcoesProduto(e.target.checked)}
                    className="w-4 h-4 text-purple-400 border-slate-600 rounded focus:ring-purple-500"
                  />
                  <span className="text-sm text-slate-400">Alterar quantidade ou aplicar desconto</span>
                </label>
              </div>

              {/* Opções avançadas (colapsável) */}
              {mostrarOpcoesProduto && (
                <div className="space-y-4 p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                  {/* Quantidade */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Quantidade</label>
                    <input
                      type="number"
                      min="1"
                      value={addProdutoForm.quantidade}
                      onChange={(e) => setAddProdutoForm(prev => ({ ...prev, quantidade: parseInt(e.target.value) || 1 }))}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-slate-700"
                    />
                  </div>

                  {/* Opções de desconto */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-slate-300">Desconto</label>
                      {/* Toggle % / R$ */}
                      <div className="flex bg-slate-700 rounded-lg p-0.5 border">
                        <button
                          type="button"
                          onClick={() => setAddProdutoForm(prev => ({ ...prev, descontoTipo: 'percent', descontoValor: '' }))}
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                            addProdutoForm.descontoTipo === 'percent'
                              ? 'bg-purple-900/40 text-purple-400'
                              : 'text-slate-400 hover:text-slate-300'
                          }`}
                        >
                          %
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddProdutoForm(prev => ({ ...prev, descontoTipo: 'valor', descontoPercent: '' }))}
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                            addProdutoForm.descontoTipo === 'valor'
                              ? 'bg-purple-900/40 text-purple-400'
                              : 'text-slate-400 hover:text-slate-300'
                          }`}
                        >
                          R$
                        </button>
                      </div>
                    </div>

                    {/* Botões de desconto rápido - Percentual */}
                    {addProdutoForm.descontoTipo === 'percent' && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[100, 50, 30, 25, 20, 10].map(percent => (
                          <button
                            key={percent}
                            type="button"
                            onClick={() => setAddProdutoForm(prev => ({
                              ...prev,
                              descontoPercent: prev.descontoPercent === percent ? '' : percent
                            }))}
                            className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                              addProdutoForm.descontoPercent === percent
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
                            value={typeof addProdutoForm.descontoPercent === 'number' && ![100, 50, 30, 25, 20, 10].includes(addProdutoForm.descontoPercent) ? addProdutoForm.descontoPercent : ''}
                            onChange={(e) => setAddProdutoForm(prev => ({
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
                    {addProdutoForm.descontoTipo === 'valor' && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[100, 80, 50, 30, 20].map(valor => (
                          <button
                            key={valor}
                            type="button"
                            onClick={() => setAddProdutoForm(prev => ({
                              ...prev,
                              descontoValor: prev.descontoValor === valor ? '' : valor
                            }))}
                            className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                              addProdutoForm.descontoValor === valor
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
                            value={typeof addProdutoForm.descontoValor === 'number' && ![100, 80, 50, 30, 20].includes(addProdutoForm.descontoValor) ? addProdutoForm.descontoValor : ''}
                            onChange={(e) => setAddProdutoForm(prev => ({
                              ...prev,
                              descontoValor: e.target.value ? parseFloat(e.target.value) : ''
                            }))}
                            className="w-14 px-1 py-1 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-purple-500 text-center"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Resumo */}
              <div className="mt-4 p-3 bg-slate-700/50 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">Valor final:</span>
                  <span className="text-xl font-bold text-slate-200">
                    {(() => {
                      const precoOrig = produtoParaAdicionar.preco || 0
                      const preco = typeof addProdutoForm.precoCustom === 'number' ? addProdutoForm.precoCustom : precoOrig
                      let descontoUnit = 0
                      if (addProdutoForm.descontoTipo === 'percent' && addProdutoForm.descontoPercent) {
                        descontoUnit = preco * (addProdutoForm.descontoPercent / 100)
                      } else if (addProdutoForm.descontoTipo === 'valor' && addProdutoForm.descontoValor) {
                        descontoUnit = addProdutoForm.descontoValor
                      }
                      const valorFinal = Math.max(0, preco - descontoUnit) * addProdutoForm.quantidade
                      if (addProdutoForm.descontoPercent === 100 || descontoUnit >= preco) {
                        return 'GRATIS'
                      }
                      return formatarMoeda(valorFinal)
                    })()}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-4 border-t bg-slate-700/50">
              <button
                onClick={() => setProdutoParaAdicionar(null)}
                className="flex-1 px-4 py-2 border rounded-lg text-slate-300 hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => confirmarAdicionarProduto()}
                disabled={salvando}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {salvando ? 'Adicionando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pagamento */}
      {pagamentoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPagamentoModal(false)}>
          <div className="bg-slate-800 rounded-2xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-slate-200">
                💳 {editandoPagamento ? 'Editar Pagamento' : 'Novo Pagamento'}
              </h3>
              <button onClick={() => setPagamentoModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <div className="p-4 space-y-4">
              {/* Tipo */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Tipo</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPagamentoForm({ ...pagamentoForm, tipo: 'plano' })}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      pagamentoForm.tipo === 'plano'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    }`}
                  >
                    Plano
                  </button>
                  <button
                    type="button"
                    onClick={() => setPagamentoForm({ ...pagamentoForm, tipo: 'catalogo' })}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      pagamentoForm.tipo === 'catalogo'
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    }`}
                  >
                    Acessório
                  </button>
                </div>
              </div>

              {/* Valor e Desconto */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Valor *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={pagamentoForm.valor}
                    onChange={(e) => setPagamentoForm({ ...pagamentoForm, valor: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Desconto</label>
                  <input
                    type="number"
                    step="0.01"
                    value={pagamentoForm.desconto}
                    onChange={(e) => setPagamentoForm({ ...pagamentoForm, desconto: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Método */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Método</label>
                <div className="grid grid-cols-4 gap-2">
                  {['pix', 'credito', 'debito', 'dinheiro'].map((metodo) => (
                    <button
                      key={metodo}
                      type="button"
                      onClick={() => setPagamentoForm({ ...pagamentoForm, metodo })}
                      className={`py-2 px-2 rounded-lg text-xs font-medium transition-colors ${
                        pagamentoForm.metodo === metodo
                          ? 'bg-green-600 text-white'
                          : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <PaymentIcon metodo={metodo} size="sm" />
                        {metodo === 'pix' ? 'Pix' : metodo === 'credito' ? 'Crédito' : metodo === 'debito' ? 'Débito' : 'Dinheiro'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Conta e Data */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Conta</label>
                  <select
                    value={pagamentoForm.conta_id}
                    onChange={(e) => setPagamentoForm({ ...pagamentoForm, conta_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Selecione...</option>
                    {contas.map((conta) => (
                      <option key={conta.id} value={conta.id}>{conta.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Data</label>
                  <input
                    type="date"
                    value={pagamentoForm.data_pagamento}
                    onChange={(e) => setPagamentoForm({ ...pagamentoForm, data_pagamento: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              {/* Parcelas e Seguradora */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Parcelas</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={pagamentoForm.parcelas}
                    onChange={(e) => setPagamentoForm({ ...pagamentoForm, parcelas: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer py-2">
                    <input
                      type="checkbox"
                      checked={pagamentoForm.is_seguradora}
                      onChange={(e) => setPagamentoForm({ ...pagamentoForm, is_seguradora: e.target.checked })}
                      className="w-4 h-4 text-green-400 rounded focus:ring-green-500"
                    />
                    <span className="text-sm text-slate-300">Seguradora</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-2 p-4 border-t bg-slate-700/50">
              <button
                onClick={() => setPagamentoModal(false)}
                className="flex-1 py-2 px-4 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={salvarPagamento}
                disabled={salvando || !pagamentoForm.valor}
                className="flex-1 py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {salvando ? 'Salvando...' : editandoPagamento ? 'Atualizar' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Mega Pagamento - Novo / Editar / Quitar Saldo */}
      {megaPagamentoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-2" onClick={() => { setMegaPagamentoModal(false); setMegaPagamentoEditando(null) }}>
          <div className="bg-slate-800 rounded-2xl w-full max-w-md shadow-xl max-h-[95vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header com Data */}
            <div className="flex items-center justify-between p-3 border-b bg-gradient-to-r from-green-600 to-emerald-600 rounded-t-2xl">
              <div className="flex items-center gap-2 text-white">
                <span className="text-lg">{megaPagamentoEditando ? '✏️' : '💲'}</span>
                <h3 className="font-semibold">{megaPagamentoEditando ? 'Editar Pagamento' : 'Pagamento'}</h3>
              </div>
              <div className="flex items-center gap-2">
                {/* Data: Hoje ou Outra */}
                <div className="flex items-center gap-1 bg-white/10 rounded px-1">
                  <button
                    type="button"
                    onClick={() => setMegaPagamentoForm({ ...megaPagamentoForm, dataHoje: true, data_pagamento: '' })}
                    className={`px-2 py-0.5 rounded text-xs transition-colors ${
                      megaPagamentoForm.dataHoje
                        ? 'bg-slate-200 text-green-400 font-medium'
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
                <button onClick={() => { setMegaPagamentoModal(false); setMegaPagamentoEditando(null) }} className="text-white/80 hover:text-white ml-1">
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
                      className="w-full min-w-0 flex-1 ml-1 px-2 py-1 border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-700 text-sm font-semibold text-right"
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
                        className="w-full min-w-0 flex-1 px-2 py-0.5 border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-700 text-xs text-right"
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
                      className="w-full min-w-0 flex-1 ml-1 px-2 py-1 border border-purple-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 bg-slate-700 text-sm font-semibold text-right"
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
                        className="w-full min-w-0 flex-1 px-2 py-0.5 border border-purple-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 bg-slate-700 text-xs text-right"
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
                        <span className="inline-flex items-center gap-0.5"><PaymentIcon metodo={metodo} size="sm" />{metodo === 'pix' ? 'Pix' : metodo === 'cartao' ? 'Cartão' : 'Din'}</span>
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
                    className="text-[10px] text-slate-400 hover:text-slate-200"
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
                              : 'bg-slate-700 text-orange-400 border border-orange-200 hover:bg-orange-900/30'
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
                        className="flex-1 min-w-0 px-2 py-1 border border-orange-200 rounded text-sm bg-slate-700 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
                onClick={() => { setMegaPagamentoModal(false); setMegaPagamentoEditando(null) }}
                className="flex-1 py-2 border border-slate-600 rounded-lg text-slate-400 text-sm hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={salvarMegaPagamento}
                disabled={salvando || (!megaPagamentoForm.valorPlano && !megaPagamentoForm.valorAcessorio && !megaPagamentoForm.descontoPlano && !megaPagamentoForm.descontoAcessorio)}
                className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {salvando ? '...' : megaPagamentoEditando ? '✅ Atualizar' : '✅ Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pet Grato */}
      {petGratoModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setPetGratoModal(false)}>
          <div className="relative bg-gray-950 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
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
                Mensagem carinhosa de despedida, como se fosse escrita pelo pet para o tutor.
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
                      name="petSexo"
                      checked={petGratoForm.sexo === 'M'}
                      onChange={() => setPetGratoForm({ ...petGratoForm, sexo: 'M' })}
                      className="w-4 h-4 text-amber-500 bg-gray-900 border-slate-600 focus:ring-amber-500"
                    />
                    <span className="text-sm text-slate-300">Macho</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="petSexo"
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
                      name="familia"
                      checked={petGratoForm.familia === 'F'}
                      onChange={() => setPetGratoForm({ ...petGratoForm, familia: 'F' })}
                      className="w-4 h-4 text-amber-500 bg-gray-900 border-slate-600 focus:ring-amber-500"
                    />
                    <span className="text-sm text-slate-300">Com família</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="familia"
                      checked={petGratoForm.familia === 'S'}
                      onChange={() => setPetGratoForm({ ...petGratoForm, familia: 'S' })}
                      className="w-4 h-4 text-amber-500 bg-gray-900 border-slate-600 focus:ring-amber-500"
                    />
                    <span className="text-sm text-slate-300">Sozinho(a)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="relative flex gap-2 p-4 border-t border-amber-900/30">
              <button
                onClick={() => setPetGratoModal(false)}
                className="flex-1 py-2 px-4 border border-slate-600 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
              >
                Cancelar
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

      {/* Modal Fotos Pendentes */}
      {fotoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setFotoModal(false)}>
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-200">📷 Fotos dos Produtos</h3>
              <button onClick={() => setFotoModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {contratoProdutos
                .filter(cp => cp.produto?.precisa_foto === true)
                .map(cp => (
                  <div
                    key={cp.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      cp.foto_recebida ? 'bg-green-900/30 border-green-200' : 'bg-yellow-900/30 border-yellow-200'
                    }`}
                  >
                    {/* Imagem do produto */}
                    <div className="w-12 h-12 rounded-lg bg-slate-700 border overflow-hidden flex-shrink-0">
                      <img
                        src={cp.produto?.imagem_url || `/estoque/${cp.produto?.codigo}.png`}
                        alt={cp.produto?.nome || ''}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.style.display = 'none'
                        }}
                      />
                    </div>

                    {/* Info do produto */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-200 text-sm line-clamp-2">{cp.produto?.nome}</p>
                    </div>

                    {/* Botão check */}
                    <button
                      onClick={() => toggleFotoRecebida(cp)}
                      className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors ${
                        cp.foto_recebida
                          ? 'bg-green-500 text-white hover:bg-green-600'
                          : 'bg-slate-600 text-slate-400 hover:bg-yellow-400 hover:text-white'
                      }`}
                      title={cp.foto_recebida ? 'Foto recebida - clique para desmarcar' : 'Clique para marcar foto como recebida'}
                    >
                      {cp.foto_recebida ? <Check className="h-5 w-5" /> : <span className="text-lg">📷</span>}
                    </button>
                  </div>
                ))}

              {contratoProdutos.filter(cp => cp.produto?.precisa_foto === true).length === 0 && (
                <p className="text-center text-slate-400 py-4">Nenhum produto requer foto</p>
              )}
            </div>

            <div className="mt-4 pt-4 border-t flex justify-end">
              <button
                onClick={() => setFotoModal(false)}
                className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Adicionar Telefone 2 */}
      {telefone2Modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setTelefone2Modal(false)}>
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-sm w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-200 mb-4">📱 Adicionar Telefone 2</h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Nome do contato</label>
                <input
                  value={novoTelefone2Nome}
                  onChange={(e) => setNovoTelefone2Nome(e.target.value)}
                  placeholder="Ex: Cuidadora Ana, Esposa Maria (vazio = próprio tutor)"
                  className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-slate-900 border-slate-600 text-slate-200"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Telefone</label>
                <div className="flex gap-2">
                  <select
                    value={novoTelefone2DDI}
                    onChange={(e) => setNovoTelefone2DDI(e.target.value)}
                    className="w-[100px] px-2 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-slate-900 border-slate-600 text-slate-200"
                  >
                    <option value="55">🇧🇷 +55</option>
                    <option value="1">🇺🇸 +1</option>
                    <option value="351">🇵🇹 +351</option>
                    <option value="54">🇦🇷 +54</option>
                    <option value="598">🇺🇾 +598</option>
                    <option value="595">🇵🇾 +595</option>
                  </select>
                  <input
                    type="tel"
                    value={novoTelefone2}
                    onChange={(e) => setNovoTelefone2(maskPhone(e.target.value))}
                    placeholder="(11) 99999-9999"
                    className="flex-1 px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg bg-slate-900 border-slate-600 text-slate-200"
                    inputMode="tel"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setTelefone2Modal(false)}
                className="flex-1 py-2 px-4 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={salvarTelefone2}
                disabled={salvandoTelefone || !novoTelefone2.trim()}
                className="flex-1 py-2 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {salvandoTelefone ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Protocolo de Entrega (editável) */}
      {protocoloEdit && (() => {
        const pe = protocoloEdit

        // Sem recálculo — pe já contém os valores editáveis (totalAPagar, totalPago, saldo, opcoesPagamento)
        const dadosImpressao = pe

        // Helper para editar um produto
        const editProd = (idx: number, campo: Partial<ProtocoloData['produtos'][0]>) => {
          const novosProdutos = [...pe.produtos]
          novosProdutos[idx] = { ...novosProdutos[idx], ...campo }
          setProtocoloEdit({ ...pe, produtos: novosProdutos })
        }

        const removeProd = (idx: number) => {
          setProtocoloEdit({ ...pe, produtos: pe.produtos.filter((_, i) => i !== idx) })
        }

        const addProd = () => {
          setProtocoloEdit({
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
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2" onClick={() => setProtocoloEdit(null)}>
            <div className="bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[95vh] overflow-auto" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between p-3 border-b sticky top-0 bg-slate-800 z-10">
                <h3 className="text-base font-semibold text-slate-200">📄 Protocolo de Entrega</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      if (!contrato) return
                      setSalvandoProtocolo(true)
                      const { error } = await supabase
                        .from('contratos')
                        .update({ protocolo_data: dadosImpressao } as never)
                        .eq('id', contrato.id)
                      if (!error) {
                        setContrato({ ...contrato, protocolo_data: dadosImpressao })
                        setSalvandoProtocolo(false)
                        setProtocoloEdit(null)
                      } else {
                        alert('Erro ao salvar protocolo: ' + error.message)
                        setSalvandoProtocolo(false)
                      }
                    }}
                    disabled={salvandoProtocolo}
                    className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    {salvandoProtocolo ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button
                    onClick={() => {
                      if (!confirm('Regenerar protocolo do zero? As edições atuais serão perdidas.')) return
                      const cpProdutos = contratoProdutos.map(cp => ({
                        valor: cp.valor,
                        produto: cp.produto ? { nome: cp.produto.nome, tipo: cp.produto.tipo, preco: cp.produto.preco } : null,
                      }))
                      const financeiro = calcFinanceiroProtocolo(contrato, pagamentos)
                      setProtocoloEdit(montarProtocoloData(contrato, cpProdutos, financeiro))
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm"
                    title="Regenerar do zero (descarta edições)"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Regenerar
                  </button>
                  <button
                    onClick={() => printProtocolos([dadosImpressao])}
                    className="flex items-center gap-2 px-3 py-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors text-sm"
                  >
                    <FileText className="h-4 w-4" />
                    Imprimir
                  </button>
                  <button onClick={() => setProtocoloEdit(null)} className="text-slate-400 hover:text-slate-200">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Editor */}
              <div className="p-3 space-y-3">
                {/* Tabela editável de produtos */}
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase mb-1">Produtos</div>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-700/50 text-xs text-slate-400 uppercase">
                        <th className="p-1.5 text-center w-14 border">Sit.</th>
                        <th className="p-1.5 text-left border">Nome (no protocolo)</th>
                        <th className="p-1.5 text-right w-24 border">Valor</th>
                        <th className="p-1.5 w-8 border"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pe.produtos.map((prod, idx) => (
                        <tr key={idx} className="border-b hover:bg-slate-700">
                          <td className="p-1 text-center border">
                            <button
                              onClick={() => {
                                const next = prod.pago === 'ok' ? 'pend' : prod.pago === 'pend' ? '' : 'ok'
                                editProd(idx, { pago: next })
                              }}
                              className={`px-1.5 py-0.5 rounded text-xs font-bold min-w-[38px] ${
                                prod.pago === 'ok'
                                  ? 'bg-green-900/40 text-green-400 hover:bg-green-200'
                                  : prod.pago === 'pend'
                                  ? 'bg-red-900/40 text-red-400 hover:bg-red-900/50'
                                  : 'bg-slate-600/40 text-slate-400 hover:bg-slate-600'
                              }`}
                            >
                              {prod.pago === 'ok' ? 'Ok' : prod.pago === 'pend' ? 'Pend' : '—'}
                            </button>
                          </td>
                          <td className="p-1 border">
                            <input
                              type="text"
                              value={prod.nomeRetorno}
                              onChange={e => editProd(idx, { nomeRetorno: e.target.value })}
                              className="w-full bg-transparent border-0 p-0.5 text-sm focus:outline-none focus:bg-blue-900/30 rounded"
                            />
                          </td>
                          <td className="p-1 border">
                            <input
                              type="text"
                              value={prod.valorDisplay !== undefined ? prod.valorDisplay : (prod.valor || '')}
                              onChange={e => {
                                const raw = e.target.value
                                const num = parseFloat(raw.replace(',', '.'))
                                if (!isNaN(num) && /^[\d.,]+$/.test(raw.trim())) {
                                  // É número puro
                                  editProd(idx, { valor: num, valorDisplay: undefined })
                                } else {
                                  // É texto livre (ex: "Incluso", "Cortesia Vet")
                                  editProd(idx, { valor: 0, valorDisplay: raw })
                                }
                              }}
                              className="w-full bg-transparent border-0 p-0.5 text-sm text-right focus:outline-none focus:bg-blue-900/30 rounded"
                              placeholder="0"
                            />
                          </td>
                          <td className="p-1 border text-center">
                            <button
                              onClick={() => removeProd(idx)}
                              className="text-slate-300 hover:text-red-500 transition-colors"
                              title="Remover"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Soma real-time dos itens + botão adicionar */}
                  <div className="flex items-center justify-between mt-1.5">
                    <button
                      onClick={addProd}
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 px-2 py-1 rounded transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar item
                    </button>
                    <div className="text-xs font-mono text-gray-500 pr-10">
                      Soma itens: <span className="font-bold text-gray-800">{formatarValor(pe.produtos.reduce((acc, p) => acc + (p.valor || 0), 0))}</span>
                    </div>
                  </div>
                </div>

                {/* Resumo financeiro (editável) */}
                {(() => {
                  const somaItens = Math.round(pe.produtos.reduce((acc, p) => acc + (p.valor || 0), 0) * 100) / 100
                  const batendo = Math.abs((pe.totalPago + pe.saldo) - somaItens) < 0.01
                  return (
                    <div className={`flex items-center justify-between text-sm rounded-lg p-2 gap-2 border ${batendo ? 'bg-slate-700/50 border-transparent' : 'bg-red-900/20 border-red-500/40'}`}>
                      <div className="flex flex-col">
                        <span className="text-slate-400 text-xs">Total</span>
                        <input
                          type="number"
                          step="0.01"
                          value={pe.totalAPagar}
                          onChange={e => setProtocoloEdit({ ...pe, totalAPagar: parseFloat(e.target.value) || 0 })}
                          className="w-24 bg-slate-600/50 border border-slate-500 rounded px-1.5 py-0.5 text-sm font-bold text-right focus:outline-none focus:border-blue-400"
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-slate-400 text-xs">Pago</span>
                        <input
                          type="number"
                          step="0.01"
                          value={pe.totalPago}
                          onChange={e => setProtocoloEdit({ ...pe, totalPago: parseFloat(e.target.value) || 0 })}
                          className="w-24 bg-slate-600/50 border border-slate-500 rounded px-1.5 py-0.5 text-sm font-bold text-green-400 text-right focus:outline-none focus:border-blue-400"
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-slate-400 text-xs">Saldo</span>
                        <input
                          type="number"
                          step="0.01"
                          value={pe.saldo}
                          onChange={e => setProtocoloEdit({ ...pe, saldo: parseFloat(e.target.value) || 0 })}
                          className={`w-24 bg-slate-600/50 border border-slate-500 rounded px-1.5 py-0.5 text-sm font-bold text-right focus:outline-none focus:border-blue-400 ${pe.saldo > 0 ? 'text-red-400' : 'text-green-400'}`}
                        />
                      </div>
                      <div className="flex flex-col items-center justify-center" title={batendo ? 'Pago + Saldo = Soma Itens ✓' : `Soma itens: ${somaItens.toFixed(2)} | P+S: ${(pe.totalPago + pe.saldo).toFixed(2)}`}>
                        <span className="text-[10px] text-slate-500">P+S=Σ</span>
                        <span className={`text-sm ${batendo ? 'text-green-400' : 'text-red-400 animate-pulse'}`}>{batendo ? '✓' : '✗'}</span>
                      </div>
                    </div>
                  )
                })()}

                {/* Toggle + Opções de pagamento (editáveis) */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={pe.mostrarPagamento !== false}
                      onChange={e => setProtocoloEdit({ ...pe, mostrarPagamento: e.target.checked })}
                      className="rounded"
                    />
                    Mostrar opções de pagamento no protocolo
                  </label>
                  {pe.mostrarPagamento !== false && (
                    <div className="flex gap-2 text-xs">
                      <div className="flex-1 bg-slate-700/50 rounded p-2 text-center">
                        <div className="text-slate-400 uppercase text-[10px]">Pix/Dinheiro</div>
                        <input
                          type="number"
                          step="0.01"
                          value={pe.opcoesPagamento.pix}
                          onChange={e => setProtocoloEdit({ ...pe, opcoesPagamento: { ...pe.opcoesPagamento, pix: parseFloat(e.target.value) || 0 } })}
                          className="w-full bg-slate-600/50 border border-slate-500 rounded px-1 py-0.5 text-sm font-bold text-center focus:outline-none focus:border-blue-400"
                        />
                      </div>
                      <div className="flex-1 bg-slate-700/50 rounded p-2 text-center">
                        <div className="text-slate-400 uppercase text-[10px]">1-6x cartão</div>
                        <input
                          type="number"
                          step="0.01"
                          value={pe.opcoesPagamento.parcelado6}
                          onChange={e => setProtocoloEdit({ ...pe, opcoesPagamento: { ...pe.opcoesPagamento, parcelado6: parseFloat(e.target.value) || 0 } })}
                          className="w-full bg-slate-600/50 border border-slate-500 rounded px-1 py-0.5 text-sm font-bold text-center focus:outline-none focus:border-blue-400"
                        />
                      </div>
                      <div className="flex-1 bg-slate-700/50 rounded p-2 text-center">
                        <div className="text-slate-400 uppercase text-[10px]">7-12x cartão</div>
                        <input
                          type="number"
                          step="0.01"
                          value={pe.opcoesPagamento.parcelado12}
                          onChange={e => setProtocoloEdit({ ...pe, opcoesPagamento: { ...pe.opcoesPagamento, parcelado12: parseFloat(e.target.value) || 0 } })}
                          className="w-full bg-slate-600/50 border border-slate-500 rounded px-1 py-0.5 text-sm font-bold text-center focus:outline-none focus:border-blue-400"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Separador */}
                <div className="border-t pt-3">
                  <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Preview</div>
                  <ProtocoloEntrega data={dadosImpressao} />
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal Compartilhar */}
      {compartilharModal && contrato && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setCompartilharModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-1">🔄 Compartilhar</h3>
            <p className="text-xs text-gray-500 mb-4">{contrato.pet_nome} — {contrato.codigo}</p>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setCompartilharTipo('remocao')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border-2 transition-colors ${
                  compartilharTipo === 'remocao' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500'
                }`}
              >
                📍 Remoção
              </button>
              <button
                onClick={() => setCompartilharTipo('entrega')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border-2 transition-colors ${
                  compartilharTipo === 'entrega' ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-gray-200 text-gray-500'
                }`}
              >
                🛍️ Entrega
              </button>
            </div>

            <select
              value={compartilharUnidadeId}
              onChange={e => setCompartilharUnidadeId(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-purple-400"
            >
              <option value="">Selecione a unidade...</option>
              {todasUnidades
                .filter(u => u.id !== currentUnit?.id)
                .map(u => (
                  <option key={u.id} value={u.id}>{u.codigo} — {u.nome}</option>
                ))
              }
            </select>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setCompartilharModal(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (!compartilharUnidadeId) return
                  setSalvandoCompartilhar(true)
                  const campo = compartilharTipo === 'remocao' ? 'unidade_remocao_id' : 'unidade_entrega_id'
                  await supabase.from('contratos').update({ [campo]: compartilharUnidadeId } as never).eq('id', contrato.id)
                  setContrato({ ...contrato, [campo]: compartilharUnidadeId })
                  setSalvandoCompartilhar(false)
                  setCompartilharModal(false)
                }}
                disabled={!compartilharUnidadeId || salvandoCompartilhar}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {salvandoCompartilhar ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ficha de Remoção */}
      {fichaModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setFichaModal(false)}>
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            {/* Header do Modal */}
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-slate-800 z-10">
              <h3 className="text-lg font-semibold text-slate-200">📋 Ficha de Remoção</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={baixarFicha}
                  disabled={gerandoFicha}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {gerandoFicha ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Baixar
                    </>
                  )}
                </button>
                <button onClick={() => setFichaModal(false)} className="text-slate-400 hover:text-slate-200">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Ficha para Captura */}
            <div className="p-4">
              <FichaRemocao ref={fichaRef} contrato={contrato as import('@/components/fichas/FichaRemocao').FichaContratoData} />
            </div>
          </div>
        </div>
      )}

      {/* Modal Rescaldos (via contrato_produtos) */}
      {rescaldoModal && contrato && (() => {
        const rescaldosNoContrato = contratoProdutos.filter(cp => cp.produto?.rescaldo_tipo)
        const produtosDisponiveis = produtosRescaldo.filter(p =>
          (buscaRescaldo ? p.nome.toLowerCase().includes(buscaRescaldo.toLowerCase()) || p.codigo.toLowerCase().includes(buscaRescaldo.toLowerCase()) : true)
        )
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setRescaldoModal(false)}>
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-200">🐾 Rescaldos — {contrato.pet_nome}</h3>
              <button onClick={() => setRescaldoModal(false)} className="text-slate-400 hover:text-slate-200">
                ✕
              </button>
            </div>

            <p className="text-sm text-slate-400 mb-4">{contrato.codigo}</p>

            {/* Seção 1: Rescaldos no contrato */}
            <div className="space-y-2 mb-4">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">No contrato</p>
              {rescaldosNoContrato.length === 0 && (
                <p className="text-center text-slate-400 py-3 text-sm">Nenhum rescaldo adicionado</p>
              )}
              {rescaldosNoContrato.map(cp => (
                <div
                  key={cp.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    cp.rescaldo_feito ? 'bg-green-900/30 border-green-200' : 'bg-amber-900/30 border-amber-200'
                  }`}
                >
                  {cp.produto?.imagem_url && (
                    <img src={cp.produto.imagem_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-200 text-sm truncate">{cp.produto?.nome || 'Produto'}</p>
                    <div className="flex items-center gap-2">
                      <p className={`text-xs ${cp.rescaldo_feito ? 'text-green-400' : 'text-amber-400'}`}>
                        {cp.rescaldo_feito ? '✅ Feito' : '⏳ Pendente'}
                      </p>
                      {cp.produto?.rescaldo_tipo && (
                        <span className="text-[10px] text-slate-400 bg-slate-700 px-1.5 py-0.5 rounded">{cp.produto.rescaldo_tipo}</span>
                      )}
                    </div>
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
                    onClick={() => removerProdutoRescaldo(cp.id, cp.produto?.id || '')}
                    className="flex items-center justify-center w-9 h-9 rounded-full bg-red-900/40 text-red-500 hover:bg-red-900/50 transition-colors"
                    title="Remover produto de rescaldo"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Seção 2: Adicionar produto de rescaldo */}
            <div className="border-t pt-4">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Adicionar</p>
              <input
                type="text"
                value={buscaRescaldo}
                onChange={e => setBuscaRescaldo(e.target.value)}
                placeholder="Buscar por nome ou codigo..."
                className="w-full px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 mb-3"
              />
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {produtosDisponiveis.map(p => (
                  <button
                    key={p.id}
                    onClick={() => adicionarProdutoRescaldo(p)}
                    disabled={salvandoRescaldo}
                    className="flex items-center gap-2 p-2 rounded-lg border border-purple-200 bg-purple-900/30 hover:bg-purple-900/40 transition-colors text-left disabled:opacity-50"
                  >
                    {p.imagem_url ? (
                      <img src={p.imagem_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-purple-200 flex items-center justify-center flex-shrink-0 text-xs">🐾</div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-200 truncate">{p.nome}</p>
                      {p.preco ? <p className="text-[10px] text-slate-400">R$ {p.preco.toFixed(2)}</p> : null}
                    </div>
                  </button>
                ))}
                {produtosDisponiveis.length === 0 && (
                  <p className="col-span-2 text-center text-slate-400 py-2 text-sm">Nenhum produto encontrado</p>
                )}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t flex justify-end">
              <button
                onClick={() => setRescaldoModal(false)}
                className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Modais de ação compartilhados */}
      {contrato && (
        <>
          <ChegamosModal
            isOpen={chegamosModalOpen}
            onClose={() => setChegamosModalOpen(false)}
            contrato={contrato}
          />
          <ChegaramModal
            isOpen={chegaramModalOpen}
            onClose={() => setChegaramModalOpen(false)}
            contrato={contrato}
          />
          <FinalizadoraModal
            isOpen={finalizadoraModalOpen}
            onClose={() => setFinalizadoraModalOpen(false)}
            contrato={contrato}
          />
          <AtivarModal
            isOpen={ativarModalOpen}
            onClose={() => setAtivarModalOpen(false)}
            contrato={contrato}
            onSuccess={(updated) => {
              setContrato(prev => prev ? { ...prev, ...updated } : prev)
            }}
          />
          <EntregaModal
            isOpen={entregaModalOpen}
            onClose={() => setEntregaModalOpen(false)}
            contrato={contrato}
            onSuccess={(updated) => {
              setContrato(prev => prev ? { ...prev, status: updated.status, data_entrega: updated.data_entrega } : prev)
            }}
          />
          <PelinhoModal
            isOpen={pelinhoModalOpen}
            onClose={() => setPelinhoModalOpen(false)}
            contrato={contrato}
            onSuccess={(updated) => {
              setContrato(prev => prev ? { ...prev, ...updated } : prev)
            }}
          />
          <CertificadoModal
            isOpen={certificadoModalOpen}
            onClose={() => setCertificadoModalOpen(false)}
            contrato={contrato}
            onSuccess={(updated) => {
              setContrato(prev => prev ? { ...prev, ...updated } : prev)
            }}
          />
        </>
      )}
    </div>
  )
}
