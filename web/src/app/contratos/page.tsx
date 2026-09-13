'use client'

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { FileText, Search, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ArrowUp, ArrowDown, Star, X, Printer, XCircle, Plus, Weight, Copy, Check, Clock, CheckCheck, CalendarClock, SearchCheck, Flame, CheckCircle2, Loader2, AlertTriangle, PawPrint, Tag, DollarSign, User, Calendar, Move, Hand, MoreVertical, Pencil, Trash2, Unlink, Truck, Package } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sanitizeBuscaPostgrest } from '@/lib/sanitize'
import Link from 'next/link'
import { useDebounce } from '@/hooks/useDebounce'
import { ProtocoloData, montarProtocoloData, normalizarProtocoloData } from '@/components/protocolo/protocolo-utils'
import { computeAllTags, getPagamentoPendente, TAG_STATE_STYLES, type ComputedTag } from '@/lib/contrato-tags'
import { contaPadraoPara, destinoDoRecebimento, taxaDaVenda, fmtBRL, type ContaEscolhivel } from '@/lib/financeiro'

/** Conta da unidade como o mega pagamento precisa dela: com nome (pra exibir) e `legado`. */
type ContaUnidade = ContaEscolhivel & { nome: string; legado: boolean | null }
import ProtocoloEditorModal from '@/components/protocolo/ProtocoloEditorModal'
import { printProtocolos } from '@/components/protocolo/ProtocoloPrint'
import InteractiveTags from '@/components/contratos/InteractiveTags'
import ActionButtons from '@/components/contratos/ActionButtons'
// Carrinho de encaminhamento removido do pipeline — operação na tela /encaminhamentos
import EntregaModal from '@/components/contratos/modals/EntregaModal'
import { useUnit } from '@/contexts/UnitContext'
import ProdutosFilterBar from '@/components/ui/ProdutosFilterBar'
import Modal from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { useFieldPermission } from '@/hooks/useFieldPermission'
import PelinhoModal from '@/components/contratos/modals/PelinhoModal'
import RescaldoModal from '@/components/contratos/modals/RescaldoModal'
import CertificadoModal from '@/components/contratos/modals/CertificadoModal'
import IndicacaoModal from '@/components/contratos/modals/IndicacaoModal'
import AtivarModal from '@/components/contratos/modals/AtivarModal'
import AtivacaoPVModal from '@/components/contratos/modals/AtivacaoPVModal'
import FinalizadoraModal from '@/components/contratos/modals/FinalizadoraModal'
import ChegamosModal from '@/components/contratos/modals/ChegamosModal'
import ChegaramModal from '@/components/contratos/modals/ChegaramModal'
import { ordenarCategoriasUrnas } from '@/lib/categorias'
import { hojeLocal, dataLocal } from '@/lib/date-local'
import DocMenu from '@/components/contratos/DocMenu'
import FichaRemocao, { type FichaContratoData } from '@/components/fichas/FichaRemocao'
import { gerarFichaPDFA4Duplicada, nomeFicha } from '@/lib/ficha-generator'
import { baixarContratoPDF } from '@/lib/contrato-pdf-download'
import { tituloNome, primeiroNome, separarPrimeiroNome } from '@/lib/nome-tutor'
import EditarContratoModal from '@/components/contratos/modals/EditarContratoModal'
import EditarFichaModal from '@/components/contratos/modals/EditarFichaModal'

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
  unidade_id: string
  pet_nome: string
  pet_especie: string | null
  pet_raca: string | null
  pet_raca_normalizada?: string | null
  pet_cor: string | null
  pet_peso: number | null
  pet_genero: string | null
  tutor_id: string | null
  tutor: Tutor | null
  tutor_nome: string
  tutor_telefone: string | null
  tutor_cidade: string | null
  tutor_bairro: string | null
  tutor_cep: string | null
  local_coleta: string | null
  clinica_coleta: string | null
  tipo_cremacao: string
  tipo_plano: string
  status: string
  data_contrato: string | null
  data_acolhimento: string | null
  numero_lacre: string | null
  // Ativação de Preventivo (mig 138) — true enquanto a tarefa de remoção não foi concluída;
  // contrato continua com status normal (preventivo), isso é só um flag de UI por cima.
  aguardando_acolhimento?: boolean
  fonte_conhecimento: { nome: string } | null
  fonte_conhecimento_ids: string[] | null
  fonte_outro_especificar: string | null
  seguradora: string | null
  // Indicação (quem indicou) — FK ou fallback texto. Ver FLOW §3.6.
  contato_id: string | null
  estabelecimento_indicacao_id: string | null
  indicacao_clinica: string | null
  indicacao_contato: string | null
  // Nomes para certificado
  certificado_nome_1: string | null
  certificado_nome_2: string | null
  certificado_nome_3: string | null
  certificado_nome_4: string | null
  certificado_nome_5: string | null
  certificado_nome_6: string | null
  certificado_nome_7: string | null
  certificado_confirmado: boolean | null
  // Produtos do contrato (para calcular complexidade)
  contrato_produtos?: ContratoProduto[]
  // Valores e pagamentos
  valor_plano: number | null
  desconto_plano: number | null  // DEPRECATED — usar desconto_plano_unificado
  desconto_plano_unificado: number | null
  valor_acessorios: number | null
  desconto_acessorios: number | null  // SUM(cp.desconto*qtd) via trigger 074
  desconto_acessorios_ajuste: number | null  // ajuste manual
  pagamentos?: Pagamento[]
  // Supinda vinculada
  supinda_id: string | null
  supinda: Supinda | null
  supinda_direcao: 'ida' | 'volta' | null
  // Protocolo de entrega salvo
  protocolo_data: ProtocoloData | null
  // Data de entrega
  data_entrega: string | null
  data_leva_pinda: string | null   // data em que o pet foi levado a Pinda (linha do tempo do GC, etapa 5)
  // GC (Gerenciamento de Cremações)
  // As 4 datas entraram na etapa 5: a linha do tempo do GC mostra DD/mmm embaixo de cada
  // passo concluído, e `data_agendamento` vira a previsão de cremação (§9.3).
  contrato_gc: {
    etapa: string
    cinzas_prontas: boolean
    certificado_pronto: boolean
    contato_status: string | null
    contato_tutor_em: string | null
    data_agendamento: string | null
    data_recebimento: string | null
    data_cremacao: string | null
    data_disponivel: string | null
  } | null
  // Compartilhamento entre unidades
  unidade_remocao_id: string | null
  unidade_remocao: { id: string; codigo: string; nome: string } | null
  unidade_entrega_id: string | null
  unidade_entrega: { id: string; codigo: string; nome: string } | null
}

type Produto = {
  id: string
  codigo: string
  nome: string
  tipo: 'urna' | 'acessorio'
  categoria: string | null
  preco: number | null
  estoque_atual: number
  imagem_url: string | null
  estoque_infinito?: boolean
  precisa_foto?: boolean
}

const CATEGORIA_URNA_LABELS: Record<string, string> = {
  'Sleeping': 'Sleeping',
  'Resinas': 'Resinas',
  'Porta/Box': 'Porta/Box',
  'Pedras': 'Pedras',
  'Biournas': 'Biournas',
  'Potes': 'Potes',
  'Standard': 'Standard',
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
  numero: string
  data: string
  responsavel: string | null
  // ENUM `status_supinda` real do banco (mig 082). O type antes dizia
  // `'planejada' | 'em_andamento' | 'retornada'` — dois valores que NÃO existem; nunca
  // deu erro porque nada no arquivo lia este campo até a etapa 3/4 do fluxo novo.
  // `embarcada` é legado da mig 066, sem uso.
  status: 'planejada' | 'embarcada_ida' | 'ida_finalizada' | 'finalizada' | 'embarcada' | null
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
  { key: 'ativo', label: 'Ativo', short: 'ATV', color: 'red', icon: '✝️' },
  { key: 'pinda', label: 'Pinda', short: 'PIN', color: 'orange', icon: '⛪' },
  { key: 'retorno', label: 'Entrega', short: 'ENT', color: 'blue', icon: '🛍️' },
  { key: 'pendente', label: 'Pendente', short: 'PEN', color: 'purple', icon: '⏳' },
  { key: 'finalizado', label: 'Finalizado', short: 'FIN', color: 'gray', icon: '✅' },
]

// Cor da unidade — usada no badge do número da viagem no card de encaminhamento (§9.1 do
// plano). Mesma paleta de /encaminhamentos, /gc, /agenda e RepasseTab; a constante é
// repetida em cada tela desde sempre, e centralizá-la é refactor de outra frente.
const UNIT_COLORS: Record<string, string> = {
  ST: '#7c3aed', SP: '#ef4444', CP: '#22c55e', SJ: '#cbd5e1',
  RS: '#f59e0b', PA: '#ec4899', PI: '#06b6d4', MA: '#f97316',
}

/** Um pet na conferência do "Enviar para Matriz" (§9.2). Lido do BANCO, não do state —
 *  é a lista que o operador confere antes de uma ação que não se desfaz. */
type PetDaViagem = {
  id: string
  pet_nome: string | null
  numero_lacre: string | null
  tipo_cremacao: string | null
  tutor_nome: string | null
  tutor: { nome: string | null } | null
  status: string | null
}

/** Um pet pronto no Nicho, na tela de trazer de volta (§9.5). Lido do BANCO. */
type PetNoNicho = {
  id: string
  pet_nome: string | null
  numero_lacre: string | null
  tipo_cremacao: string | null
  tutor_nome: string | null
  tutor: { nome: string | null } | null
  supinda_id: string | null
  supinda: { numero: string; data: string | null } | null
  contrato_gc: { cinzas_prontas: boolean; certificado_pronto: boolean; data_cremacao: string | null } | null
}

/** `2026-09-06` → `06/set/26`. Fatia a string em vez de `new Date()` porque
 *  `supindas.data` é `date` PURO — `new Date('2026-09-06')` é lido como meia-noite
 *  UTC e volta um dia atrás em BRT. Foi esse o bug da aba Evolução em 02/09/2026. */
function formatarDataViagem(dataStr: string | null | undefined): string {
  if (!dataStr) return 'sem data'
  const [a, m, d] = dataStr.slice(0, 10).split('-')
  if (!a || !m || !d) return 'sem data'
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${d}/${meses[parseInt(m, 10) - 1] || '?'}/${a.slice(2)}`
}

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
  contrato: { valor_plano: number | null; desconto_plano_unificado: number | null; valor_acessorios: number | null; desconto_acessorios: number | null; desconto_acessorios_ajuste: number | null },
  pagamentos: { tipo: string; valor: number }[]
) {
  const aPagarPlano = (contrato.valor_plano || 0) - (contrato.desconto_plano_unificado || 0)
  const aPagarAcessorios = (contrato.valor_acessorios || 0) - (contrato.desconto_acessorios || 0) - (contrato.desconto_acessorios_ajuste || 0)
  const totalAPagar = aPagarPlano + aPagarAcessorios
  const totalPago = pagamentos.reduce((s, p) => s + p.valor, 0)
  const saldo = Math.max(0, totalAPagar - totalPago)
  return { totalAPagar, totalPago, saldo, aPagarPlano }
}

function ContratosContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { currentUnit, allUnidades, isLoading: unitLoading, hasModule, userName } = useUnit()
  const { isVisible } = useFieldPermission()
  const T = 'tela_pipeline'

  // Inicializar estado a partir dos query params
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [statusCountsOriginal, setStatusCountsOriginal] = useState<Record<string, number>>({})
  const buscaIdRef = useRef(0) // Evita race condition entre buscas
  const [loading, setLoading] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const paginaRef = useRef(parseInt(searchParams.get('pagina') || '0', 10))  // mesma inicialização do state `pagina` pra evitar falso append na primeira carga
  const [busca, setBusca] = useState(searchParams.get('busca') || '')
  const buscaDebounced = useDebounce(busca, 300)
  const [campoBusca, setCampoBusca] = useState<'todos' | 'pet' | 'tutor' | 'codigo' | 'lacre'>('todos')
  const [statusFiltro, setStatusFiltro] = useState<string>(searchParams.get('status') || 'ativo')
  // cb_cremacao_local: contratos nascem em 'pinda' (sem passar por 'ativo'). Pill 'Ativo' some.
  // Importante: NÃO usar hasModule() — ele retorna true pra super_admin sempre. Aqui é
  // comportamento de fluxo, não visibilidade — checar modulos_ativos da unidade atual direto.
  const fluxoLocal = !!currentUnit?.modulos_ativos?.includes('cb_cremacao_local')

  // ─── NOVO FLUXO DE ENCAMINHAMENTO (docs/ENCAMINHAMENTO_NO_PIPELINE.md) ───────────
  // Interruptor de ROLLOUT, uma unidade por vez (mig 142 seeda `hidden` em todas).
  // Ligado: o pipeline monta, despacha e traz de volta o encaminhamento; a
  // /encaminhamentos vira leitura. Desligado: tudo exatamente como sempre foi.
  // ⚠️ super_admin é `edit` por hardcode — o Lucas vê o fluxo novo em TODA unidade,
  // inclusive nas que ainda não foram treinadas. É proposital (é como ele testa),
  // mas significa que ele e o gerente da mesma unidade veem telas diferentes.
  // ⚠️ PI (cb_cremacao_local) não entra: lá não existe encaminhamento (§4.5).
  const encPipeline = isVisible(T, 'obj_enc_pipeline') && !fluxoLocal

  // As 3 etapas que agrupam por viagem no fluxo novo. `finalizado` fica de fora de
  // propósito — ver `cargaTotalDaEtapa` em carregarContratos().
  const ETAPAS_AGRUPADAS = ['ativo', 'pinda', 'retorno']

  // Cor da unidade ativa — badge do número da viagem, anel de seleção e borda da barra
  // de seleção. No escopo do componente porque a barra do celular vive fora da IIFE
  // que renderiza a lista.
  const corUnidadeAtual = UNIT_COLORS[currentUnit?.codigo || ''] || '#6366f1'
  const textoBadgeUnidadeAtual = currentUnit?.codigo === 'SJ' ? '#334155' : '#fff'

  // Teto da carga total de uma etapa. Fica ABAIXO do limite de 1000 do PostgREST de
  // propósito: assim o corte é NOSSO e detectável (comparando com o `count` exato),
  // em vez do corte mudo do servidor — que foi o que escondeu o SP47 por semanas.
  // Folga real hoje: a maior etapa agrupada tem 264 contratos (SJ em retorno).
  const LIMITE_CARGA_TOTAL = 900
  // Quantos a etapa tem de verdade quando a carga total não coube (null = coube).
  const [truncadoEm, setTruncadoEm] = useState<number | null>(null)
  // Etapa carregada inteira (sem paginar) — ver o bloco em carregarContratos().
  const cargaTotalDaEtapa = encPipeline && ETAPAS_AGRUPADAS.includes(statusFiltro)
  // Cards de encaminhamento expandidos (por número da viagem). Fechados por padrão:
  // o card É o resumo; os pets abrem sob demanda.
  const [encAbertos, setEncAbertos] = useState<Set<string>>(new Set())
  // ── Gesto de incluir pet numa viagem (etapa 2) ──
  const [petArrastando, setPetArrastando] = useState<string | null>(null)   // desktop: drag
  const [encAlvo, setEncAlvo] = useState<string | null>(null)               // viagem sob o cursor
  const [petsSelecionados, setPetsSelecionados] = useState<Set<string>>(new Set()) // mobile: long-press
  const [vinculando, setVinculando] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressDisparou = useRef(false)
  // ── Criar / editar viagem no próprio pipeline (etapa 3) ──
  // `encEditando = null` com o form aberto significa CRIAR; com id, editar aquela viagem.
  const [encFormAberto, setEncFormAberto] = useState(false)
  const [encEditando, setEncEditando] = useState<{ id: string; numero: string } | null>(null)
  const [encForm, setEncForm] = useState({ numero: '', data: '', responsavel: '', observacoes: '' })
  const [encFormPets, setEncFormPets] = useState<Contrato[]>([])
  const [salvandoEnc, setSalvandoEnc] = useState(false)
  const [menuViagem, setMenuViagem] = useState<string | null>(null)   // número da viagem com o menu "⋯" aberto
  // ── Enviar para a Matriz (etapa 4) — o botão irreversível ──
  const [enviarModal, setEnviarModal] = useState<{ id: string; numero: string; data: string | null } | null>(null)
  const [enviarPets, setEnviarPets] = useState<PetDaViagem[]>([])
  const [enviarCarregando, setEnviarCarregando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  // ── Nicho + Trazer da Matriz (etapas 6 e 7) ──
  const [nichoAberto, setNichoAberto] = useState(false)
  const [trazerAberto, setTrazerAberto] = useState(false)
  const [trazerPets, setTrazerPets] = useState<PetNoNicho[]>([])
  const [trazerDatas, setTrazerDatas] = useState<Record<string, string>>({})       // contrato_id → data de volta
  const [trazerPresencial, setTrazerPresencial] = useState<Set<string>>(new Set()) // quem o tutor buscou em Pinda
  const [trazerCarregando, setTrazerCarregando] = useState(false)
  const [trazendo, setTrazendo] = useState(false)

  // Ordenação por proximidade de CEP (delta |CEP do contrato − CEP da unidade|).
  // Heurística: CEPs numericamente próximos tendem a ser geograficamente próximos
  // na mesma região. Precisa de unidades.cep (mig 102); sem CEP → botão nem aparece.
  const cepUnidadeNum = (() => {
    const d = (currentUnit?.cep || '').replace(/\D/g, '')
    return d.length === 8 ? parseInt(d, 10) : null
  })()
  const deltaCep = (c: Contrato): number => {
    if (cepUnidadeNum === null) return Number.MAX_SAFE_INTEGER
    const d = (c.tutor_cep || '').replace(/\D/g, '')
    if (d.length !== 8) return Number.MAX_SAFE_INTEGER  // sem CEP válido → fim da lista
    return Math.abs(parseInt(d, 10) - cepUnidadeNum)
  }
  const [pagina, setPagina] = useState(parseInt(searchParams.get('pagina') || '0', 10))
  const [total, setTotal] = useState(0)
  const [totalGeral, setTotalGeral] = useState(0)
  const [ordenacao, setOrdenacao] = useState<'data' | 'nome' | 'cep'>((searchParams.get('ordenacao') as 'data' | 'nome' | 'cep') || 'data')
  // Default: novo → antigo (descending) p/ data; A→Z (ascending) p/ nome
  const [ordemAsc, setOrdemAsc] = useState(searchParams.get('ordemAsc') === 'true')
  const [agruparCidade, setAgruparCidade] = useState(searchParams.get('cidade') === 'true')
  // Default: agrupado por encaminhamento (mantém comportamento histórico). URL ?encam=false desliga.
  const [agruparSupinda, setAgruparSupinda] = useState(searchParams.get('encam') !== 'false')
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

  // Modal do pelinho — agora é rescaldo "de verdade" (mig 126): 1 tela, só quantidade.
  const [pelinhoModal, setPelinhoModal] = useState(false)
  const [pelinhoContrato, setPelinhoContrato] = useState<Contrato | null>(null)

  // Mobile: card expandido para ações
  const [expandedMobileId, setExpandedMobileId] = useState<string | null>(null)

  // Edição inline de Lacre no pipeline (apenas inserir quando vazio, não editar)
  const [lacreEditandoId, setLacreEditandoId] = useState<string | null>(null)
  const [lacreInputValue, setLacreInputValue] = useState('')
  const [salvandoLacreInline, setSalvandoLacreInline] = useState(false)

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
  // Ativação de Preventivo já atribuída (aguardando_acolhimento=true, mig 138) — "Finalizar"
  // abre o mesmo popup de conclusão que /tarefas usa (AtivacaoPVModal).
  const [finalizarAtivacaoPVContrato, setFinalizarAtivacaoPVContrato] = useState<Contrato | null>(null)
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
  const [supindas, setSupindas] = useState<{ id: string; numero: string; data: string }[]>([])

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
  // Taxa da maquininha em que o dinheiro vai cair (mig 134). `cadastrada: false`
  // = taxa DESCONHECIDA, não zero — o modal avisa e o valor entra cheio.
  const [taxaVenda, setTaxaVenda] = useState<{ percentual: number; cadastrada: boolean } | null>(null)
  // Contas DESTA unidade, com o que cada uma recebe (mig 122). Substitui os UUIDs
  // que estavam chumbados aqui — ver comentário em `processarMegaPagamento`.
  const [contasUnidade, setContasUnidade] = useState<ContaUnidade[]>([])
  // Conta em que ESTE recebimento vai cair. Nasce do destino calculado e só muda
  // se o operador trocar — antes de 13/09/2026 não existia: a conta era gravada
  // sem aparecer em lugar nenhum. Ver `destinoDoRecebimento`.
  const [megaContaId, setMegaContaId] = useState('')
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

  // Modal Marcar Entregue (retorno/pendente → finalizado) — persistência é o <EntregaModal> real
  const [entregaModal, setEntregaModal] = useState(false)
  const [entregaContrato, setEntregaContrato] = useState<Contrato | null>(null)

  // Toggle mostrar compartilhados
  const [mostrarCompartilhados, setMostrarCompartilhados] = useState(false)
  const [compartilhadosCount, setCompartilhadosCount] = useState(0)


  // Modal Bypass — finalizar pulando etapas (temporário)
  const [bypassContrato, setBypassContrato] = useState<Contrato | null>(null)
  const [bypassDataCremacao, setBypassDataCremacao] = useState('')
  const [bypassDataEntrega, setBypassDataEntrega] = useState('')
  const [salvandoBypass, setSalvandoBypass] = useState(false)

  async function executarBypass() {
    if (!bypassContrato || !bypassDataCremacao) return
    if (!confirm(`Bypass: finalizar ${bypassContrato.pet_nome} (${bypassContrato.codigo}) pulando todas as etapas?\n\nIsso vai:\n• Desvincular de encaminhamentos (se houver)\n• Recalcular supinda\n• Fechar GC\n• Marcar como finalizado`)) return
    setSalvandoBypass(true)
    try {
      const c = bypassContrato

      // 1. Desvincular de supinda de IDA (se houver) + recalcular
      if (c.supinda_id) {
        await supabase.from('contratos').update({ supinda_id: null } as never).eq('id', c.id)
        // Recalcular quantidade_pets e peso_total da supinda
        const { data: restantes } = await supabase.from('contratos').select('pet_peso').eq('supinda_id', c.supinda_id)
        const qtd = restantes?.length || 0
        const peso = restantes?.reduce((acc: number, r: { pet_peso: number | null }) => acc + (r.pet_peso || 0), 0) || 0
        await supabase.from('supindas').update({ quantidade_pets: qtd, peso_total: peso } as never).eq('id', c.supinda_id)
      }

      // 2. Desvincular de supinda de VOLTA (se houver) — mesma lógica
      const supindaVoltaId = (c as Record<string, unknown>).supinda_volta_id as string | null
      if (supindaVoltaId) {
        await supabase.from('contratos').update({ supinda_volta_id: null } as never).eq('id', c.id)
      }

      // 3. Fechar contrato_gc (se existir) — marcar como disponivel com datas coerentes
      const { data: gcExiste } = await supabase.from('contrato_gc').select('id').eq('contrato_id', c.id).maybeSingle()
      if (gcExiste) {
        const agora = new Date().toISOString()
        await supabase.from('contrato_gc').update({
          etapa: 'disponivel',
          data_cremacao: bypassDataCremacao,
          data_recebimento: agora,
          data_disponivel: agora,
          cinzas_prontas: true,
          certificado_pronto: true,
          lacre_conferido: true,
        } as never).eq('contrato_id', c.id)
      }

      // 4. Finalizar contrato — limpar todas as referências
      const updates: Record<string, unknown> = {
        status: 'finalizado',
        data_cremacao: bypassDataCremacao,
        supinda_id: null,
        supinda_volta_id: null,
        supinda_direcao: null,
      }
      if (bypassDataEntrega) updates.data_entrega = bypassDataEntrega
      await supabase.from('contratos').update(updates as never).eq('id', c.id)

      // Se tinha tarefa de Entrega pendente pro Operacional nesse contrato, marca concluída —
      // senão fica órfã em /tarefas pra sempre (o bypass já finalizou o contrato, pulando a
      // etapa). Mesma classe de bug do EntregaModal/RescaldoModal (ver CHANGELOG 25/08/2026).
      await supabase.from('tarefas_operacionais').update({
        status: 'concluida',
        concluido_em: new Date().toISOString(),
        anotacao_conclusao: 'Contrato finalizado via bypass no pipeline (fora do app do Operacional).',
      } as never).eq('contrato_id', c.id).eq('tipo', 'entrega').eq('status', 'pendente')

      setBypassContrato(null)
      setBypassDataCremacao('')
      setBypassDataEntrega('')
      window.location.reload()
    } catch (err) {
      console.error('Erro no bypass:', err)
      alert('Erro ao finalizar contrato: ' + (err as Error).message)
    }
    setSalvandoBypass(false)
  }

  // Modal Compartilhar (remoção/entrega entre unidades)
  const [compartilharModal, setCompartilharModal] = useState(false)
  const [compartilharContrato, setCompartilharContrato] = useState<Contrato | null>(null)
  const [compartilharTipo, setCompartilharTipo] = useState<'remocao' | 'entrega'>('remocao')
  const [compartilharUnidadeId, setCompartilharUnidadeId] = useState<string>('')
  const [salvandoCompartilhar, setSalvandoCompartilhar] = useState(false)

  // Seleção batch para protocolo de entrega
  // Lazy init via sessionStorage — não perde seleção ao navegar pra contrato e voltar
  const [selectedContratos, setSelectedContratos] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const saved = sessionStorage.getItem('pipeline:selectedContratos')
      return saved ? new Set<string>(JSON.parse(saved)) : new Set()
    } catch { return new Set() }
  })
  // Seleção paralela para registrar entrega em lote (status retorno/pendente)
  const [selectedEntregas, setSelectedEntregas] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const saved = sessionStorage.getItem('pipeline:selectedEntregas')
      return saved ? new Set<string>(JSON.parse(saved)) : new Set()
    } catch { return new Set() }
  })
  const [entregaBatchLoading, setEntregaBatchLoading] = useState(false)
  const [entregaBatchModal, setEntregaBatchModal] = useState(false)
  const [entregaBatchForm, setEntregaBatchForm] = useState({ dataHoje: true, data_entrega: '' })
  const [protocoloBatchLoading, setProtocoloBatchLoading] = useState(false)

  // Modal Protocolo de Entrega
  const [protocoloModal, setProtocoloModal] = useState(false)
  const [protocoloContrato, setProtocoloContrato] = useState<Contrato | null>(null)
  const [protocoloEditData, setProtocoloEditData] = useState<ProtocoloData | null>(null)
  const [protocoloLoading, setProtocoloLoading] = useState(false)
  const [salvandoProtocolo, setSalvandoProtocolo] = useState(false)

  // DocMenu — geração de docs a partir do card
  const [gerandoContratoId, setGerandoContratoId] = useState<string | null>(null)
  const [fichaParaCapturar, setFichaParaCapturar] = useState<Contrato | null>(null)
  const fichaCaptureRef = useRef<HTMLDivElement>(null)
  const [editarContratoId, setEditarContratoId] = useState<string | null>(null)
  const [editarFichaId, setEditarFichaId] = useState<string | null>(null)
  const [editarFichaUnidade, setEditarFichaUnidade] = useState<string | null>(null)

  // Modal Rescaldos
  const [rescaldoModal, setRescaldoModal] = useState(false)
  const [rescaldoContrato, setRescaldoContrato] = useState<Contrato | null>(null)
  const [salvandoRescaldo, setSalvandoRescaldo] = useState(false)
  const [produtosRescaldo, setProdutosRescaldo] = useState<Array<{ id: string; codigo: string; nome: string; tipo: string; rescaldo_tipo: string; preco: number | null; imagem_url: string | null }>>([])

  // Modal Indicação
  const [indicacaoModal, setIndicacaoModal] = useState(false)
  const [indicacaoContrato, setIndicacaoContrato] = useState<Contrato | null>(null)
  // id de fontes_conhecimento p/ 'Indicação em Clínica' — resolvido 1x, alimenta o farol de Indicação
  const [indicacaoFonteId, setIndicacaoFonteId] = useState<string | null>(null)

  const POR_PAGINA = 30
  const supabase = createClient()

  useEffect(() => {
    supabase.from('fontes_conhecimento').select('id').eq('nome', 'Indicação em Clínica').maybeSingle()
      .then(({ data }) => { if (data) setIndicacaoFonteId((data as { id: string }).id) })
  }, [])

  // Salva número do lacre inline (apenas inserção; não permite edição daqui)
  async function salvarLacreInline() {
    if (!lacreEditandoId || !lacreInputValue.trim() || salvandoLacreInline) return
    const id = lacreEditandoId
    const valor = lacreInputValue.trim()
    setSalvandoLacreInline(true)
    try {
      const { error } = await supabase
        .from('contratos')
        .update({ numero_lacre: valor } as never)
        .eq('id', id)
      if (error) throw error
      setContratos(prev => prev.map(c => c.id === id ? { ...c, numero_lacre: valor } : c))
      setLacreEditandoId(null)
      setLacreInputValue('')
    } catch (err) {
      console.error('Erro ao salvar lacre:', err)
      alert('Erro ao salvar lacre')
    } finally {
      setSalvandoLacreInline(false)
    }
  }

  function cancelarLacreInline() {
    setLacreEditandoId(null)
    setLacreInputValue('')
  }

  // Renderiza a célula do lacre no pipeline (3 estados: editando, com lacre, sem lacre)
  function renderLacreCell(contrato: Contrato, layout: 'desktop' | 'mobile') {
    if (lacreEditandoId === contrato.id) {
      const inputClass = layout === 'desktop'
        ? "w-24 px-2 py-0.5 bg-blue-600 text-white font-bold rounded text-sm border border-blue-400 outline-none text-center"
        : "w-20 px-1.5 py-0 h-6 bg-blue-600 text-white font-bold rounded text-xs border border-blue-400 outline-none text-center"
      return (
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            value={lacreInputValue}
            onChange={(e) => setLacreInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') salvarLacreInline()
              if (e.key === 'Escape') cancelarLacreInline()
            }}
            placeholder="Nº lacre"
            className={inputClass}
            autoFocus
            disabled={salvandoLacreInline}
          />
          <button
            onClick={salvarLacreInline}
            disabled={salvandoLacreInline || !lacreInputValue.trim()}
            className="p-0.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            title="Salvar"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={cancelarLacreInline}
            disabled={salvandoLacreInline}
            className="p-0.5 bg-red-600 text-white rounded hover:bg-red-700"
            title="Cancelar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )
    }

    if (contrato.numero_lacre) {
      // Tem lacre — badge azul (não permite edição inline, só leitura/navegação)
      const badgeClass = layout === 'desktop'
        ? "text-white font-bold bg-blue-700 px-1 py-0 rounded text-base"
        : "text-white font-bold bg-blue-700 px-1.5 rounded text-sm h-6 flex items-center flex-shrink-0"
      return (
        <Link href={`/contratos/${contrato.id}`} className="hover:opacity-80 flex-shrink-0">
          <span className={badgeClass}>
            {String(contrato.numero_lacre).replace(/\.0$/, '')}
          </span>
        </Link>
      )
    }

    // Sem lacre — botão amber pulsante "+ Lacre" (mesma vibe do "Sem data acolh.")
    const btnClass = layout === 'desktop'
      ? "px-2 py-0.5 bg-amber-600/80 text-white font-semibold rounded text-xs shadow-sm hover:bg-amber-500 transition-colors animate-pulse flex-shrink-0"
      : "px-1.5 h-6 bg-amber-600/80 text-white font-semibold rounded text-[11px] shadow-sm hover:bg-amber-500 transition-colors animate-pulse flex items-center flex-shrink-0"
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          setLacreInputValue('')
          setLacreEditandoId(contrato.id)
        }}
        className={btnClass}
        title="Inserir nº do lacre"
      >
        + Lacre
      </button>
    )
  }

  // Ajusta estoque DA UNIDADE (produtos_estoque). Quantidade positiva = creditar,
  // negativa = debitar. Vai a negativo silenciosamente. estoque_infinito tratado server-side.
  async function ajustarEstoque(produtoId: string, quantidade: number, _estoqueInfinito?: boolean | null, unidadeId?: string) {
    const uid = unidadeId || currentUnit?.id
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

  // Variante por código do produto (resolve ID e chama o helper)
  async function ajustarEstoquePorCodigo(codigo: string, quantidade: number, unidadeId?: string) {
    const { data: produto } = await supabase
      .from('produtos')
      .select('id, estoque_infinito')
      .eq('codigo', codigo)
      .maybeSingle<{ id: string; estoque_infinito: boolean | null }>()
    if (!produto) return
    await ajustarEstoque(produto.id, quantidade, produto.estoque_infinito, unidadeId)
  }

  // Função para formatar moeda
  function formatarMoeda(valor: number | null) {
    if (!valor) return 'R$ 0,00'
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  // Persistir seleção de checkboxes em sessionStorage — sobrevive navegação no mesmo tab
  useEffect(() => {
    try {
      sessionStorage.setItem('pipeline:selectedContratos', JSON.stringify(Array.from(selectedContratos)))
    } catch {}
  }, [selectedContratos])

  // cb_cremacao_local: se a unidade tem fluxo local e o filtro caiu em 'ativo' por default
  // (sem ?status na URL), trocar pra 'pinda' — que é onde os contratos nascem em PI.
  useEffect(() => {
    if (fluxoLocal && statusFiltro === 'ativo' && !searchParams.get('status')) {
      setStatusFiltro('pinda')
    }
  }, [fluxoLocal, statusFiltro, searchParams])

  useEffect(() => {
    try {
      sessionStorage.setItem('pipeline:selectedEntregas', JSON.stringify(Array.from(selectedEntregas)))
    } catch {}
  }, [selectedEntregas])

  // Atualizar URL quando estado muda (sem recarregar página)
  useEffect(() => {
    const params = new URLSearchParams()
    if (busca) params.set('busca', busca)
    if (statusFiltro) params.set('status', statusFiltro)
    if (pagina > 0) params.set('pagina', pagina.toString())
    if (ordenacao !== 'data') params.set('ordenacao', ordenacao)
    if (ordemAsc) params.set('ordemAsc', 'true')
    if (agruparCidade) params.set('cidade', 'true')
    if (agruparBairro) params.set('bairro', 'true')
    if (!agruparSupinda) params.set('encam', 'false')

    const queryString = params.toString()
    const newUrl = queryString ? `/contratos?${queryString}` : '/contratos'

    // Usar replace para não criar histórico a cada mudança de filtro
    router.replace(newUrl, { scroll: false })
  }, [statusFiltro, pagina, ordenacao, ordemAsc, agruparCidade, agruparBairro, agruparSupinda])

  useEffect(() => {
    carregarContagens()
    carregarProdutosRescaldo()
    // Trocar de unidade reseta página pra 0 (evita 416 se a nova unidade tiver menos contratos)
    setPagina(0)
  }, [currentUnit?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
      // Pagina incrementou (scroll pediu mais) → append.
      // Caso contrário (filtros mudaram, primeira carga, reset) → substitui.
      const append = pagina > 0 && pagina > paginaRef.current
      paginaRef.current = pagina
      carregarContratos(append ? { append: true } : {})
    }
  }, [pagina, statusFiltro, ordenacao, ordemAsc, mostrarCompartilhados, currentUnit?.id])

  // IntersectionObserver: dispara carregamento da próxima página quando chega no fim da lista
  useEffect(() => {
    if (loading || carregandoMais) return
    if (contratos.length >= total) return  // já carregou tudo
    if (buscaDebounced.trim()) return  // busca ativa não tem scroll infinito
    // Etapa carregada inteira não pagina: a query ignora `pagina`, então subir a
    // página aqui só recarregaria a mesma lista em loop. Se veio truncada, o aviso
    // no topo é a saída — não mais scroll.
    if (cargaTotalDaEtapa) return

    const sentinel = sentinelRef.current
    if (!sentinel) return

    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setPagina(p => p + 1)
    }, { rootMargin: '400px' })
    obs.observe(sentinel)
    return () => obs.disconnect()
  }, [loading, carregandoMais, contratos.length, total, buscaDebounced, cargaTotalDaEtapa])

  // Contar compartilhados (ativo a pendente) em background
  useEffect(() => {
    if (!currentUnit?.id) return
    supabase
      .from('contratos')
      .select('id', { count: 'exact', head: true })
      .or(`unidade_remocao_id.eq.${currentUnit.id},unidade_entrega_id.eq.${currentUnit.id}`)
      .neq('unidade_id', currentUnit.id)
      .in('status', ['ativo', 'pinda', 'retorno', 'pendente'])
      .then(({ count }) => setCompartilhadosCount(count || 0))
  }, [currentUnit?.id])

  async function carregarContagens() {
    if (!currentUnit) { setLoading(false); return }
    // Carregar contagem por status usando count do Supabase (sem limite de 1000)
    const statusList = ['ativo', 'pinda', 'retorno', 'pendente', 'finalizado']
    const counts: Record<string, number> = {}
    let totalCount = 0

    // Buscar contagem de cada status em paralelo
    const promises = statusList.map(async (status) => {
      let q = supabase
        .from('contratos')
        .select('*', { count: 'exact', head: true })
        .eq('status', status)
      if (currentUnit) q = q.eq('unidade_id', currentUnit.id)
      const { count } = await q
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
    // Pelinho tem popup dedicado (PelinhoModal) — não entra na lista genérica do RescaldoModal,
    // senão vira um 3º caminho concorrente pra adicionar o mesmo produto.
    const { data } = await supabase
      .from('produtos')
      .select('id, codigo, nome, tipo, rescaldo_tipo, preco, imagem_url')
      .not('rescaldo_tipo', 'is', null)
      .neq('rescaldo_tipo', 'pelinho')
      .eq('ativo', true)
      .order('nome')
    if (data) setProdutosRescaldo(data as typeof produtosRescaldo)
  }

  // Enriquece os contratos já carregados com embeds pesados (em paralelo, sem bloquear UI).
  async function enriquecerContratos(arr: Contrato[], minhaBuscaId: number) {
    const ids = new Set(arr.map(c => c.id))
    const idsList = Array.from(ids)
    const fonteIds = Array.from(new Set(arr.map(c => (c as { fonte_conhecimento_id?: string }).fonte_conhecimento_id).filter(Boolean))) as string[]

    // Dispara 3 queries em paralelo (não aguarda — cada uma faz seu próprio merge)
    // IMPORTANTE: ao mesclar com setContratos, só alteramos os contratos cujo id ESTÁ
    // no batch atual. Outros contratos (já enriquecidos por chamadas anteriores)
    // são preservados — senão a página 2 zeraria os faróis da página 1.

    // 1. contrato_produtos (com produto)
    supabase
      .from('contrato_produtos')
      .select('id, contrato_id, produto_id, quantidade, foto_recebida, separado, rescaldo_feito, produto:produtos(codigo, nome, tipo, precisa_foto, imagem_url, rescaldo_tipo)')
      .in('contrato_id', idsList)
      .then(({ data, error }) => {
        if (error || !data) return
        if (minhaBuscaId !== buscaIdRef.current) return
        const byContrato = new Map<string, typeof data>()
        for (const cp of data) {
          const cid = (cp as { contrato_id: string }).contrato_id
          if (!byContrato.has(cid)) byContrato.set(cid, [])
          byContrato.get(cid)!.push(cp)
        }
        setContratos(prev => prev.map(c => {
          if (!ids.has(c.id)) return c  // fora do batch — preserva
          return { ...c, contrato_produtos: byContrato.get(c.id) || [] } as Contrato
        }))
      })

    // 2. contrato_gc
    supabase
      .from('contrato_gc')
      .select('contrato_id, etapa, cinzas_prontas, certificado_pronto, contato_status, contato_tutor_em, data_agendamento, data_recebimento, data_cremacao, data_disponivel')
      .in('contrato_id', idsList)
      .then(({ data, error }) => {
        if (error || !data) return
        if (minhaBuscaId !== buscaIdRef.current) return
        const byContrato = new Map<string, unknown>()
        for (const g of data) byContrato.set((g as { contrato_id: string }).contrato_id, g)
        setContratos(prev => prev.map(c => {
          if (!ids.has(c.id)) return c
          return { ...c, contrato_gc: (byContrato.get(c.id) ?? null) as Contrato['contrato_gc'] } as Contrato
        }))
      })

    // 3. fontes_conhecimento (só se houver IDs)
    if (fonteIds.length > 0) {
      supabase
        .from('fontes_conhecimento')
        .select('id, nome')
        .in('id', fonteIds)
        .then(({ data, error }) => {
          if (error || !data) return
          if (minhaBuscaId !== buscaIdRef.current) return
          const byId = new Map<string, { id: string; nome: string }>()
          for (const f of data as { id: string; nome: string }[]) byId.set(f.id, f)
          setContratos(prev => prev.map(c => {
            if (!ids.has(c.id)) return c
            const fid = (c as { fonte_conhecimento_id?: string }).fonte_conhecimento_id
            return { ...c, fonte_conhecimento: fid ? (byId.get(fid) ?? null) : null } as Contrato
          }))
        })
    }
  }

  async function carregarContratos(opts: { append?: boolean } = {}) {
    if (!currentUnit) { setLoading(false); return }
    const minhaBuscaId = ++buscaIdRef.current

    if (opts.append) setCarregandoMais(true)
    else setLoading(true)

    // Definir campo e direção da ordenação
    const campoOrdem = ordenacao === 'nome' ? 'pet_nome' : 'data_acolhimento'
    const ascending = ordemAsc
    // Agrupar por encaminhamento: toggle do user, mas preventivo nunca agrupa (não tem supinda)
    // e unidades com cb_cremacao_local também não (não há encaminhamento — todos seriam "sem").
    const agruparPorSupinda = agruparSupinda && statusFiltro !== 'preventivo' && !fluxoLocal

    // 🔴 CARGA TOTAL DA ETAPA — a trava que faz o placar do card ser verdade.
    //
    // No fluxo novo o card mostra "12 pets · 10 pagos · 12 com lacre" e o botão
    // "Enviar para Matriz" age sobre a viagem inteira. Com a paginação de 30, uma
    // viagem chega PARTIDA entre páginas (SP já mandou 40+ num encaminhamento só, e
    // o maior aberto hoje tem 25 pets) — o placar contaria só o pedaço que chegou e
    // mentiria com cara de número conferido. É a família do incidente SP47.
    //
    // Medido no banco em 06/09/2026 — contratos por unidade em cada etapa:
    //   ativo: SP 34 (maior) · pinda: SJ 134 · retorno: SJ 264 · finalizado: ST 1.640
    // As 3 primeiras cabem folgadas; `finalizado` estouraria o teto de 1000 do
    // PostgREST — por isso ele NÃO entra aqui e segue paginando como sempre
    // (também não agrupa: encaminhamento de pet já entregue não diz nada).
    //   → a condição vive no escopo do componente (`cargaTotalDaEtapa`), porque o
    //     IntersectionObserver do scroll infinito também precisa dela.

    // SELECT principal — só dados base + embeds leves essenciais (tutor + supinda + pagamentos).
    // Embeds pesados (contrato_produtos, contrato_gc, fonte_conhecimento) carregam em paralelo após.
    const SELECT_CONTRATO = 'id, codigo, unidade_id, pet_nome, pet_especie, pet_raca, pet_cor, pet_peso, pet_genero, tutor_id, tutor:tutores(id, nome, telefone), tutor_nome, tutor_telefone, tutor_cidade, tutor_bairro, tutor_cep, local_coleta, clinica_coleta, tipo_cremacao, tipo_plano, status, data_contrato, data_acolhimento, numero_lacre, aguardando_acolhimento, fonte_conhecimento_id, fonte_conhecimento_ids, fonte_outro_especificar, seguradora, certificado_nome_1, certificado_nome_2, certificado_nome_3, certificado_nome_4, certificado_nome_5, certificado_confirmado, valor_plano, desconto_plano, desconto_plano_unificado, valor_acessorios, desconto_acessorios, desconto_acessorios_ajuste, pagamentos(tipo, valor), supinda_id, supinda:supindas!fk_contrato_supinda(id, numero, data, responsavel, status, quantidade_pets, peso_total), supinda_direcao, protocolo_data, data_entrega, data_leva_pinda, unidade_remocao_id, unidade_entrega_id, contato_id, estabelecimento_indicacao_id, indicacao_clinica, indicacao_contato'

    // Helper para aplicar filtros comuns (unidade + status + compartilhados).
    // Tipo `any` aqui porque o builder do supabase-js encadeia tipos genéricos complexos
    // e os filtros são todos string-based — sem perda real de segurança.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aplicarFiltros = (q: any) => {
      let r = q
      if (currentUnit) {
        if (mostrarCompartilhados) {
          r = r.or(`unidade_id.eq.${currentUnit.id},unidade_remocao_id.eq.${currentUnit.id},unidade_entrega_id.eq.${currentUnit.id}`)
        } else {
          r = r.eq('unidade_id', currentUnit.id)
        }
      }
      if (statusFiltro) r = r.eq('status', statusFiltro)
      return r
    }

    try {
      if (cargaTotalDaEtapa) {
        // ============================================
        // ETAPA INTEIRA, SEM PAGINAR (fluxo novo — ativo / pinda / retorno)
        // ============================================
        // Uma query só: o agrupamento por viagem e o placar precisam de TODOS os pets
        // da etapa, senão contam pedaço. Ordenação fica toda no client (renderSupindaGroup).
        let query = supabase.from('contratos').select(SELECT_CONTRATO, { count: 'exact' })
        query = aplicarFiltros(query)
        query = query.order(campoOrdem, { ascending, nullsFirst: false })

        const { data, error, count } = await query.range(0, LIMITE_CARGA_TOTAL - 1)
        if (minhaBuscaId !== buscaIdRef.current) return
        if (error) throw error

        const arr = (data || []) as Contrato[]
        setContratos(arr)
        setTotal(count ?? arr.length)

        // 🔴 Guard de truncamento — a lição do SP47 é que a lista curta NÃO avisa.
        // Se a etapa passar do teto, o placar e o "Enviar para Matriz" passariam a
        // trabalhar sobre um recorte, em silêncio. Aqui isso vira erro visível.
        if ((count ?? 0) > arr.length) {
          console.error('[carregarContratos] ETAPA TRUNCADA', { statusFiltro, carregados: arr.length, total: count })
          setTruncadoEm(count ?? arr.length)
        } else {
          setTruncadoEm(null)
        }

        if (arr.length > 0) enriquecerContratos(arr, minhaBuscaId)
      } else if (agruparPorSupinda) {
        // ============================================
        // 2 QUERIES: sem encaminhamento (todos no topo) + com encaminhamento (paginado)
        // ============================================
        // Query A: SEM supinda — sempre TODOS no topo (não pagina; geralmente é pouco)
        // Só carrega na primeira página (append=false)
        let semSupindaData: Contrato[] = []
        if (!opts.append) {
          let querySem = supabase.from('contratos').select(SELECT_CONTRATO).is('supinda_id', null)
          querySem = aplicarFiltros(querySem)
          querySem = querySem.order(campoOrdem, { ascending, nullsFirst: false })
          const { data: semData, error: semErr } = await querySem
          if (semErr) throw semErr
          semSupindaData = (semData || []) as Contrato[]
        }

        // Query B: COM supinda — paginada, ordenada por supinda.data DESC + secundário
        let queryCom = supabase.from('contratos').select(SELECT_CONTRATO, { count: 'exact' }).not('supinda_id', 'is', null)
        queryCom = aplicarFiltros(queryCom)
        queryCom = queryCom.order('data', { foreignTable: 'supinda', ascending, nullsFirst: false })
        queryCom = queryCom.order(campoOrdem, { ascending, nullsFirst: false })
        const { data: comData, error: comErr, count: comCount } = await queryCom.range(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA - 1)
        if (minhaBuscaId !== buscaIdRef.current) return

        const isRangeError = comErr && (comErr.message === '{"' || /range/i.test(comErr.message || ''))
        if (comErr && !isRangeError) throw comErr

        const comSupindaData = (comData || []) as Contrato[]

        if (opts.append) {
          // append só dos com supinda (os sem já estão na lista)
          setContratos(prev => [...prev, ...comSupindaData])
        } else {
          // primeira página: sem + com
          setContratos([...semSupindaData, ...comSupindaData])
        }
        // total = sem.length + count(com)
        const totalCom = isRangeError ? (opts.append ? total - semSupindaData.length : comSupindaData.length) : (comCount || 0)
        setTotal(semSupindaData.length + totalCom)

        // Enriquecimento paralelo (ambos os grupos)
        const todos = opts.append ? comSupindaData : [...semSupindaData, ...comSupindaData]
        if (todos.length > 0) enriquecerContratos(todos, minhaBuscaId)
      } else {
        // ============================================
        // 1 QUERY tradicional (sem agrupamento por supinda)
        // ============================================
        let query = supabase.from('contratos').select(SELECT_CONTRATO, { count: 'exact' })
        query = aplicarFiltros(query)
        query = query.order(campoOrdem, { ascending, nullsFirst: false })

        const { data, error, count } = await query.range(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA - 1)
        if (minhaBuscaId !== buscaIdRef.current) return
        if (error) {
          const isRangeError = error.message === '{"' || /range/i.test(error.message || '')
          if (isRangeError) {
            setTotal(contratos.length)
          } else {
            console.error('[carregarContratos] erro PostgREST:', { message: error.message, code: error.code, details: error.details, hint: error.hint, raw: error })
            if (!opts.append) setContratos([])
          }
        } else {
          const arr = (data || []) as Contrato[]
          if (opts.append) setContratos(prev => [...prev, ...arr])
          else setContratos(arr)
          setTotal(count || 0)
          if (arr.length > 0) enriquecerContratos(arr, minhaBuscaId)
        }
      }
    } catch (e) {
      console.error('[carregarContratos] exception:', e)
      if (!opts.append) setContratos([])
    } finally {
      if (minhaBuscaId === buscaIdRef.current) {
        if (opts.append) setCarregandoMais(false)
        else setLoading(false)
      }
    }
  }

  async function buscarContratos(termo?: string) {
    if (!currentUnit) { setLoading(false); return }
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
    const campoOrdem = ordenacao === 'nome' ? 'pet_nome' : 'data_acolhimento'
    const ascending = ordemAsc
    const agruparPorSupinda = agruparSupinda && statusFiltro !== 'preventivo' && !fluxoLocal

    // Mesmo padrão da listagem: SELECT leve + enriquecimento paralelo
    const SELECT_BUSCA = 'id, codigo, unidade_id, pet_nome, pet_especie, pet_raca, pet_cor, pet_peso, pet_genero, tutor_id, tutor:tutores(id, nome, telefone), tutor_nome, tutor_telefone, tutor_cidade, tutor_bairro, tutor_cep, local_coleta, clinica_coleta, tipo_cremacao, tipo_plano, status, data_contrato, data_acolhimento, numero_lacre, aguardando_acolhimento, fonte_conhecimento_id, fonte_conhecimento_ids, fonte_outro_especificar, seguradora, certificado_nome_1, certificado_nome_2, certificado_nome_3, certificado_nome_4, certificado_nome_5, certificado_confirmado, valor_plano, desconto_plano, desconto_plano_unificado, valor_acessorios, desconto_acessorios, desconto_acessorios_ajuste, pagamentos(tipo, valor), supinda_id, supinda:supindas!fk_contrato_supinda(id, numero, data, responsavel, status, quantidade_pets, peso_total), supinda_direcao, protocolo_data, data_entrega, data_leva_pinda, unidade_remocao_id, unidade_entrega_id, contato_id, estabelecimento_indicacao_id, indicacao_clinica, indicacao_contato'
    // Sanitiza: escapa wildcards SQL (% _) e caracteres reservados PostgREST (, ( ) : * \)
    // + limita 80 chars. Protege contra termo malicioso quebrar o filtro `or`.
    const t = sanitizeBuscaPostgrest(termoBusca)
    const buscaOr = campoBusca === 'todos'
      ? `codigo.ilike.%${t}%,pet_nome.ilike.%${t}%,tutor_nome.ilike.%${t}%,numero_lacre.ilike.%${t}%`
      : campoBusca === 'pet' ? `pet_nome.ilike.%${t}%`
      : campoBusca === 'tutor' ? `tutor_nome.ilike.%${t}%`
      : campoBusca === 'codigo' ? `codigo.ilike.%${t}%`
      : `numero_lacre.ilike.%${t}%`

    let query = supabase.from('contratos').select(SELECT_BUSCA, { count: 'exact' }).or(buscaOr)
    if (agruparPorSupinda) {
      query = query.order('data', { foreignTable: 'supinda', ascending, nullsFirst: true })
    }
    query = query.order(campoOrdem, { ascending, nullsFirst: false })
    if (currentUnit) {
      if (mostrarCompartilhados) {
        query = query.or(`unidade_id.eq.${currentUnit.id},unidade_remocao_id.eq.${currentUnit.id},unidade_entrega_id.eq.${currentUnit.id}`)
      } else {
        query = query.eq('unidade_id', currentUnit.id)
      }
    }

    // Paginação tradicional (range) — banco já entrega ordenado, sem precisar
    // carregar tudo no client. Limita a 200 hits por página de busca.
    const { data, error, count } = await query.range(0, 199)

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

      // Enriquecimento paralelo (mesmo padrão da listagem)
      if (resultados.length > 0) enriquecerContratos(resultados, minhaBuscaId)
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
    if (ordemAsc) params.set('ordemAsc', 'true')
    if (agruparCidade) params.set('cidade', 'true')
    if (agruparBairro) params.set('bairro', 'true')
    if (!agruparSupinda) params.set('encam', 'false')

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
    // Sempre mantém um status selecionado — clique no mesmo é no-op
    if (statusFiltro !== status) {
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

  // ============================================
  // DocMenu — geração de docs do pipeline
  // ============================================
  async function gerarContratoCardPdf(contrato: Contrato) {
    setGerandoContratoId(contrato.id)
    try {
      await baixarContratoPDF(supabase, contrato.id)
    } catch (err) {
      console.error('Erro ao gerar PDF do contrato:', err)
      alert('Erro ao gerar PDF do contrato. Tente novamente.')
    } finally {
      setGerandoContratoId(null)
    }
  }

  async function gerarFichaCard(contrato: Contrato) {
    // Busca funcionario.nome + estabelecimento.nome + clinica_coleta pra preencher
    // colaborador_responsavel e clinica_veterinaria no novo layout da ficha.
    const { data: extra } = await supabase
      .from('contratos')
      .select('clinica_coleta, remocao_cidade, tutor_telefone, tutor_telefone2, tutor_telefone_nome, tutor_telefone2_nome, tutor_telefone_principal, funcionario:funcionario_id(nome), estabelecimento:estabelecimento_id(nome)')
      .eq('id', contrato.id)
      .single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ex: any = extra
    setFichaParaCapturar({
      ...contrato,
      colaborador_responsavel: ex?.funcionario?.nome || null,
      // Clínica: prioridade estabelecimento padronizado (FK) > texto livre do tutor (geralmente "lixo").
      clinica_veterinaria: ex?.estabelecimento?.nome || ex?.clinica_coleta || null,
      remocao_cidade: ex?.remocao_cidade || null,
      tutor_telefone: ex?.tutor_telefone || null,
      tutor_telefone2: ex?.tutor_telefone2 || null,
      tutor_telefone_nome: ex?.tutor_telefone_nome || null,
      tutor_telefone2_nome: ex?.tutor_telefone2_nome || null,
      tutor_telefone_principal: ex?.tutor_telefone_principal || null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
  }

  // Renderiza a FichaRemocao off-screen e gera PDF A4 com 2 cópias quando fichaParaCapturar muda
  useEffect(() => {
    if (!fichaParaCapturar) return
    const c = fichaParaCapturar
    // 300ms pra garantir que o template.png do background já carregou no <img>
    const t = setTimeout(async () => {
      if (!fichaCaptureRef.current) {
        setFichaParaCapturar(null)
        return
      }
      try {
        await gerarFichaPDFA4Duplicada(fichaCaptureRef.current, nomeFicha(c, 'pdf'))
      } catch (err) {
        console.error('Erro ao gerar PDF da ficha:', err)
        alert('Erro ao gerar PDF da ficha.')
      } finally {
        setFichaParaCapturar(null)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [fichaParaCapturar])

  function editarFichaCard(contrato: Contrato) {
    setEditarFichaUnidade(contrato.unidade_id || null)
    setEditarFichaId(contrato.id)
  }

  // Monta o protocolo do zero a partir do banco (abrir sem salvo + botão Regenerar)
  async function montarProtocoloDoBanco(contratoId: string) {
    setProtocoloLoading(true)
    try {
      const { data: cpData } = await supabase
        .from('contrato_produtos')
        .select('id, valor, produto:produtos(nome, nome_retorno, tipo, preco)')
        .eq('contrato_id', contratoId)

      const { data: pagData } = await supabase
        .from('pagamentos')
        .select('tipo, valor, desconto')
        .eq('contrato_id', contratoId)

      // Buscar dados de tutor (endereço etc)
      const { data: contratoCompleto } = await supabase
        .from('contratos')
        .select('*, tutor:tutores(nome, endereco, numero, complemento, bairro, cidade, estado, cep)')
        .eq('id', contratoId)
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
    await montarProtocoloDoBanco(contrato.id)
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

  // Capitalizar cada palavra do nome (title case com conectivos minúsculos) — lib/nome-tutor
  const capitalizarNome = tituloNome

  // Versão compacta dos badges GC (estilo da tela /gc mobile) — 2 quadradinhos com ícones
  function renderGCStatusCompacto(contrato: Contrato): React.ReactNode {
    if (contrato.status !== 'pinda' || !contrato.contrato_gc) return null
    const gc = contrato.contrato_gc
    const etapa = gc.etapa || 'provisionado'
    const contatoSt = gc.contato_status || null
    const etapaColors: Record<string, string> = { provisionado: '#64748b', recebido: '#3b82f6', cremado: '#eab308', disponivel: '#22c55e' }
    const etapaColor = etapaColors[etapa] || '#64748b'
    const etapaLabels: Record<string, string> = { provisionado: 'Provisionado', recebido: 'Recebido', cremado: 'Cremado', disponivel: 'Finalizado' }
    const contatoLabels: Record<string, string> = { contatado: 'Contatado', agendado: 'Agendado' }
    const contatoLabel = contatoSt ? (contatoLabels[contatoSt] || contatoSt) : 'A Chamar'
    const mostrarContato = etapa !== 'cremado' && etapa !== 'disponivel'
    return (
      <div className="flex-shrink-0 flex rounded overflow-hidden" title={`GC: ${mostrarContato ? `${contatoLabel} · ` : ''}${etapaLabels[etapa] || etapa}`}>
        {mostrarContato && (
          <span className="w-5 h-5 flex items-center justify-center" style={{ background: !contatoSt ? '#94a3b8' : '#a7f3d0' }}>
            {!contatoSt && <Clock className="w-3 h-3" style={{ color: '#a7f3d0' }} />}
            {contatoSt === 'contatado' && <Check className="w-3 h-3" style={{ color: '#8696a0' }} />}
            {contatoSt === 'agendado' && <CheckCheck className="w-3 h-3" style={{ color: '#1a73e8' }} />}
          </span>
        )}
        <span className={`w-5 h-5 flex items-center justify-center ${etapa === 'provisionado' ? 'animate-pulse' : ''}`} style={{ background: etapaColor }}>
          {etapa === 'provisionado' && <CalendarClock className="w-3 h-3 text-white/80" />}
          {etapa === 'recebido' && <SearchCheck className="w-3 h-3 text-white/80" />}
          {etapa === 'cremado' && <Flame className="w-3 h-3 text-white/80" />}
          {etapa === 'disponivel' && <CheckCircle2 className="w-3 h-3 text-white/80" />}
        </span>
      </div>
    )
  }

  // Badges de status GC (espelho das regras de /gc) — ao lado do tutor quando pet em pinda
  function renderGCStatusBadges(contrato: Contrato): React.ReactNode {
    if (contrato.status !== 'pinda' || !contrato.contrato_gc) return null
    const gc = contrato.contrato_gc
    const etapa = gc.etapa || 'provisionado'
    const etapaLabels: Record<string, string> = { provisionado: 'Provisionado', recebido: 'Recebido', cremado: 'Cremado', disponivel: 'Finalizado' }
    const etapaColors: Record<string, string> = { provisionado: '#64748b', recebido: '#3b82f6', cremado: '#eab308', disponivel: '#22c55e' }
    const contatoSt = gc.contato_status || null
    const contatoLabels: Record<string, string> = { contatado: 'Contatado', agendado: 'Agendado' }
    const contatoLabel = contatoSt ? (contatoLabels[contatoSt] || contatoSt) : null
    // Contato só faz sentido antes da cremação — após "cremado/disponivel" o status trava na etapa
    const mostrarContato = etapa !== 'cremado' && etapa !== 'disponivel'
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-[9px] font-semibold text-[var(--surface-500)]">GC:</span>
        {mostrarContato && (
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5" style={{ background: !contatoSt ? '#94a3b8' : '#a7f3d0', color: !contatoSt ? '#a7f3d0' : contatoSt === 'agendado' ? '#1a73e8' : '#065f46' }}>
            {!contatoSt && <Clock className="w-2.5 h-2.5" style={{ color: '#a7f3d0' }} />}
            {contatoSt === 'contatado' && <Check className="w-2.5 h-2.5" style={{ color: '#8696a0' }} />}
            {contatoSt === 'agendado' && <CheckCheck className="w-2.5 h-2.5" style={{ color: '#1a73e8' }} />}
            {contatoLabel || 'A Chamar'}
          </span>
        )}
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 text-white ${etapa === 'provisionado' ? 'animate-pulse' : ''}`} style={{ background: etapaColors[etapa] || '#64748b' }}>
          {etapa === 'provisionado' && <CalendarClock className="w-2.5 h-2.5" />}
          {etapa === 'recebido' && <SearchCheck className="w-2.5 h-2.5" />}
          {etapa === 'cremado' && <Flame className="w-2.5 h-2.5" />}
          {etapa === 'disponivel' && <CheckCircle2 className="w-2.5 h-2.5" />}
          {etapaLabels[etapa] || etapa}
        </span>
      </span>
    )
  }

  // ─── CARD DO NICHO (etapa 6, §9.4) ──────────────────────────────────────────
  // O que está PRONTO pra unidade buscar na Matriz. Sempre no fim da etapa Pinda, e
  // sempre presente — é o lugar fixo pra onde o operador olha.
  // ⚠️ Sem "mais antigo": foi proposto nos mockups e RECUSADO pelo Lucas.
  function renderCardNicho(pets: Contrato[], renderFn: (c: Contrato) => React.ReactNode): React.ReactNode {
    const total = pets.length
    const comCinzas = pets.filter(c => c.contrato_gc?.cinzas_prontas).length
    const comCertificado = pets.filter(c => c.contrato_gc?.certificado_pronto).length
    return (
      <div className="rounded-lg border-2" style={{ background: 'var(--surface-0)', borderColor: total > 0 ? '#22c55e' : 'var(--surface-200)' }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setNichoAberto(a => !a)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setNichoAberto(a => !a) } }}
          className="px-3 py-3 flex items-center gap-3 cursor-pointer hover:opacity-90"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[14px] font-bold text-[var(--surface-700)]">
              <Package className="h-4 w-4 flex-shrink-0" />
              Nicho {currentUnit?.nome || ''}
            </div>
            <div className="text-[12px] text-[var(--surface-400)] mt-0.5">
              {total === 0
                ? 'Nada pronto para buscar ainda'
                : `${total} pronto${total !== 1 ? 's' : ''} — ${comCinzas} com cinzas, ${comCertificado} com certificado`}
            </div>
          </div>
          <span className="text-[26px] font-black tabular-nums flex-shrink-0" style={{ color: total > 0 ? '#22c55e' : 'var(--surface-300)' }}>{total}</span>
          <ChevronDown className={`h-5 w-5 flex-shrink-0 text-[var(--surface-400)] transition-transform ${nichoAberto ? 'rotate-180' : ''}`} />
        </div>
        {total > 0 && (
          <div className="px-3 pb-3">
            <button
              onClick={abrirTrazerDaMatriz}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700"
            >
              <Truck className="h-4 w-4" />Trazer da Matriz
            </button>
          </div>
        )}
        {/* Clicar abre a visão de sempre do pipeline — os mesmos cards com faróis e
            informações (§3.2). O resumo é atalho, não substituto. */}
        {nichoAberto && total > 0 && (
          <div className="px-3 pb-3 space-y-2 border-t pt-3" style={{ borderColor: 'var(--surface-200)' }}>
            {pets.map(renderFn)}
          </div>
        )}
      </div>
    )
  }

  // ─── LINHA DO TEMPO DO GC (etapa 5, §9.3) ───────────────────────────────────
  // É a AMPLIAÇÃO de `renderGCStatusBadges` — mesmas cores e mesmos rótulos, agora com
  // as duas trilhas abertas e a data de cada passo cumprido.
  //
  // 🔴 Os passos são FIXOS: 3 no contato, 4 na etapa, sempre, mesmo os já vencidos.
  // Foi o Lucas quem pegou isso ("pq vc tirou o 'A chamar' quando ja contatado?"): com
  // número variável de passos, dois pets ficam impossíveis de comparar de relance.
  //
  // 🔴 `A Chamar` e `Provisionado` nascem CONCLUÍDOS, com a data do encaminhamento.
  // O verde aqui não é "tarefa cumprida", é "o relógio começou a correr" — o gestor lê
  // "está para chamar desde o dia tal". É o ponto que mais importa nesta tela, e o
  // motivo de ela existir: dar às unidades visibilidade do trabalho da Matriz.
  function renderLinhaDoTempoGC(contrato: Contrato): React.ReactNode {
    const gc = contrato.contrato_gc
    if (!gc) return null
    const etapa = gc.etapa || 'provisionado'
    const contatoSt = gc.contato_status || null
    // Data em que o pet entrou em Pinda — é o "relógio começou" dos dois primeiros passos.
    const dataIda = contrato.data_leva_pinda || null

    /** `2026-09-06T14:30:00Z` → `06/set`. Para `timestamptz` usa a data LOCAL (a lição da
     *  mig 113 / do bug da aba Evolução: `slice(0,10)` devolve o dia em UTC). */
    const dd = (iso: string | null | undefined): string | undefined => {
      if (!iso) return undefined
      const d = iso.length <= 10 ? new Date(`${iso}T12:00:00`) : new Date(iso)
      if (isNaN(d.getTime())) return undefined
      const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
      return `${String(d.getDate()).padStart(2, '0')}/${meses[d.getMonth()]}`
    }

    const ordemEtapa = ['provisionado', 'recebido', 'cremado', 'disponivel']
    const iEtapa = Math.max(0, ordemEtapa.indexOf(etapa))
    const ordemContato = [null, 'contatado', 'agendado']
    const iContato = Math.max(0, ordemContato.indexOf(contatoSt))

    // Previsão de cremação: só com o pet já RECEBIDO e agendamento marcado. O carimbo de
    // `data_cremacao` herda `data_agendamento` (GCAcaoModal.tsx:635-637), então a
    // previsão mostrada é exatamente a data que vai ser registrada.
    let prev: string | undefined
    if (etapa === 'recebido' && gc.data_agendamento) {
      const d = new Date(gc.data_agendamento)
      if (!isNaN(d.getTime())) {
        prev = `prev. ${dd(gc.data_agendamento)} ${String(d.getHours()).padStart(2, '0')}h`
      }
    }

    const trilhaContato = [
      { rotulo: 'A Chamar', cor: '#94a3b8', data: dd(dataIda) },
      { rotulo: 'Contatado', cor: '#a7f3d0', data: dd(gc.contato_tutor_em) },
      { rotulo: 'Agendado', cor: '#1a73e8', data: dd(gc.data_agendamento) },
    ]
    const trilhaEtapa = [
      { rotulo: 'Provisionado', cor: '#64748b', data: dd(dataIda) },
      { rotulo: 'Recebido', cor: '#3b82f6', data: dd(gc.data_recebimento) },
      { rotulo: 'Cremado', cor: '#eab308', data: dd(gc.data_cremacao), previsao: prev },
      { rotulo: 'Finalizado', cor: '#22c55e', data: dd(gc.data_disponivel) },
    ]

    const trilha = (
      titulo: string,
      passos: { rotulo: string; cor: string; data?: string; previsao?: string }[],
      indiceAtual: number,
    ) => (
      <div className="flex items-start gap-1.5">
        <span className="text-[9px] font-semibold uppercase text-[var(--surface-400)] w-11 flex-shrink-0 pt-1">{titulo}</span>
        <div className="flex items-start flex-1 min-w-0">
          {passos.map((passo, i) => {
            const cumprido = i <= indiceAtual
            return (
              <Fragment key={passo.rotulo}>
                {i > 0 && (
                  // A linha entre dois passos só fica colorida depois de VENCIDA.
                  <div className="h-px flex-1 mt-[7px] mx-0.5" style={{ background: cumprido ? passos[i].cor : 'var(--surface-200)' }} />
                )}
                <div className="flex flex-col items-center flex-shrink-0" style={{ minWidth: 52 }}>
                  <span
                    className={`w-3.5 h-3.5 rounded-full border-2 ${cumprido ? '' : 'animate-pulse'}`}
                    style={{
                      background: cumprido ? passo.cor : 'transparent',
                      borderColor: cumprido ? passo.cor : 'var(--surface-300)',
                    }}
                  />
                  <span className="text-[9px] leading-tight mt-0.5 text-center" style={{ color: cumprido ? 'var(--surface-600)' : 'var(--surface-400)' }}>
                    {passo.rotulo}
                  </span>
                  {passo.data && cumprido && (
                    <span className="text-[9px] leading-tight tabular-nums text-[var(--surface-400)]">{passo.data}</span>
                  )}
                  {passo.previsao && !cumprido && (
                    <span className="text-[9px] leading-tight italic text-amber-500">{passo.previsao}</span>
                  )}
                </div>
              </Fragment>
            )
          })}
        </div>
      </div>
    )

    return (
      <div className="space-y-1.5">
        {trilha('Contato', trilhaContato, iContato)}
        {trilha('Etapa', trilhaEtapa, iEtapa)}
      </div>
    )
  }

  // Badge de compartilhamento entre unidades
  function renderBadgesCompartilhamento(contrato: Contrato) {
    if (!currentUnit) return null
    const badges: React.ReactNode[] = []
    const isOwner = contrato.unidade_id === currentUnit.id || (!contrato.unidade_id)

    // Remoção compartilhada
    if (contrato.unidade_remocao_id) {
      if (contrato.unidade_remocao_id === currentUnit.id && !isOwner) {
        // Eu faço a remoção pra outra unidade
        badges.push(
          <span key="rem" className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-amber-900/40 text-amber-400 border border-amber-500/30">
            📍 Remoção p/ {contrato.unidade_remocao?.codigo || '?'}
          </span>
        )
      } else if (isOwner) {
        // Outra unidade faz a remoção pra mim
        badges.push(
          <span key="rem" className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-amber-900/40 text-amber-400 border border-amber-500/30">
            📍 Remoção: {contrato.unidade_remocao?.codigo || '?'}
          </span>
        )
      }
    }

    // Entrega compartilhada
    if (contrato.unidade_entrega_id) {
      if (contrato.unidade_entrega_id === currentUnit.id && !isOwner) {
        // Eu entrego pra outra unidade
        badges.push(
          <span key="ent" className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-cyan-900/40 text-cyan-400 border border-cyan-500/30">
            🛍️ Entrega p/ {contrato.unidade_entrega?.codigo || '?'}
          </span>
        )
      } else if (isOwner) {
        // Outra unidade entrega pra mim
        badges.push(
          <span key="ent" className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-cyan-900/40 text-cyan-400 border border-cyan-500/30">
            🛍️ Entrega: {contrato.unidade_entrega?.codigo || '?'}
          </span>
        )
      }
    }

    if (badges.length === 0) return null
    return <div className="flex flex-wrap gap-1">{badges}</div>
  }

  function abrirCompartilharModal(contrato: Contrato) {
    setCompartilharContrato(contrato)
    setCompartilharTipo('remocao')
    setCompartilharUnidadeId('')
    setCompartilharModal(true)
  }

  async function salvarCompartilhamento() {
    if (!compartilharContrato || !compartilharUnidadeId) return
    setSalvandoCompartilhar(true)
    const campo = compartilharTipo === 'remocao' ? 'unidade_remocao_id' : 'unidade_entrega_id'
    await supabase
      .from('contratos')
      .update({ [campo]: compartilharUnidadeId } as never)
      .eq('id', compartilharContrato.id)

    // Atualizar local
    setContratos(prev => prev.map(c =>
      c.id === compartilharContrato.id
        ? { ...c, [campo]: compartilharUnidadeId, [`unidade_${compartilharTipo}`]: allUnidades.find(u => u.id === compartilharUnidadeId) || null }
        : c
    ))

    setSalvandoCompartilhar(false)
    setCompartilharModal(false)
  }

  async function removerCompartilhamento(contratoId: string, tipo: 'remocao' | 'entrega') {
    const campo = tipo === 'remocao' ? 'unidade_remocao_id' : 'unidade_entrega_id'
    await supabase
      .from('contratos')
      .update({ [campo]: null } as never)
      .eq('id', contratoId)

    setContratos(prev => prev.map(c =>
      c.id === contratoId
        ? { ...c, [campo]: null, [`unidade_${tipo}`]: null }
        : c
    ))
  }

  // Nome de tratamento e sua separação vêm de lib/nome-tutor (fonte única):
  // "Maria Aparecida" e "Maria da Conceição" contam como nome; "Maria da Silva" não.
  const getPrimeiroNome = primeiroNome

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

  function presetDatasChegamos(tipo: 'este-sab' | 'este-dom' | 'prox-sab' | 'prox-dom' | 'este-fds' | 'prox-fds') {
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
    } else if (tipo === 'este-fds') {
      enc = getDiaPreset('sab', false)
      encTexto = 'neste fim de semana'
    } else if (tipo === 'prox-fds') {
      enc = getDiaPreset('sab', true)
      encTexto = 'no próximo fim de semana'
    } else if (tipo === 'prox-sab') {
      enc = getDiaPreset('sab', true)
      encTexto = `no próximo sábado (${enc.getDate()}/${mesesCurtos[enc.getMonth()]})`
    } else {
      enc = getDiaPreset('dom', true)
      encTexto = `no próximo domingo (${enc.getDate()}/${mesesCurtos[enc.getMonth()]})`
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
      msg += `O encaminhamento para nosso crematório será feito ${dataEncaminhamento}, e a cremação ocorrerá entre ${dataCremacao}.

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

  // ⚠️ `carregarTaxasCartao` foi REMOVIDA: lia `taxas_cartao`, que é global e
  // valia para o sistema inteiro — com três adquirentes na operação (Rede,
  // InterPag, Infinity), a venda de uma unidade saía descontada com a taxa da
  // maquininha de outra. A taxa agora vem da CONTA, por `taxaDaVenda` (mig 134).

  /**
   * Contas da unidade logada — a escolha do mega pagamento sai daqui.
   *
   * ⚠️ A LEGADA VEM JUNTO desde 13/09/2026. Antes havia `.eq('legado', false)`
   * com o comentário "conta de legado não recebe pagamento novo", que era a
   * regra da mig 127. A regra mudou: unidade SEM o módulo financeiro passa a
   * gravar SEMPRE na legada, porque ela não tem como cadastrar conta nenhuma
   * (a aba Contas não abre pra ela). Quem separa as duas agora é
   * `destinoDoRecebimento`, não a query — e sem a legada aqui, aquelas
   * unidades ficariam sem destino nenhum.
   */
  async function carregarContasUnidade() {
    if (!currentUnit?.id) return
    const { data } = await supabase
      .from('contas')
      .select('id, nome, entradas, preferencial_recebimento, produto, legado')
      .eq('ativo', true)
      .eq('unidade_id', currentUnit.id)
      .order('nome')
    if (data) setContasUnidade(data as unknown as ContaUnidade[])
  }

  async function abrirMegaPagamentoModal(contrato: Contrato) {
    highlightContrato(contrato.id)
    void carregarContasUnidade()
    const { planoPendente, acessoriosPendente } = getPagamentoPendente(contrato)
    const saldoPlano = planoPendente
      ? (contrato.valor_plano || 0) - (contrato.desconto_plano_unificado || 0) - (contrato.pagamentos?.filter(p => p.tipo === 'plano').reduce((acc, p) => acc + (p.valor || 0), 0) || 0)
      : 0
    const saldoAcessorio = acessoriosPendente
      ? (contrato.valor_acessorios || 0) - (contrato.desconto_acessorios || 0) - (contrato.desconto_acessorios_ajuste || 0) - (contrato.pagamentos?.filter(p => p.tipo === 'catalogo').reduce((acc, p) => acc + (p.valor || 0), 0) || 0)
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
    setTaxaVenda(null)
    setMegaPagamentoModal(true)
  }

  /** O método como o banco o conhece (o modal fala "cartão" e pergunta parcelas depois). */
  const metodoBancoMega = megaPagamentoForm.metodo === 'cartao'
    ? (megaPagamentoForm.parcelas === 'debito' ? 'debito' : 'credito')
    : megaPagamentoForm.metodo

  /** Para onde vai o dinheiro — e se o operador pode mudar isso. Ver `destinoDoRecebimento`. */
  const destinoMega = useMemo(
    () => destinoDoRecebimento(contasUnidade, metodoBancoMega, hasModule('tela_financeiro')),
    [contasUnidade, metodoBancoMega, hasModule],
  )

  // A escolha acompanha o método (trocar pix → cartão troca a maquininha), mas
  // uma troca manual do operador sobrevive enquanto o método não mudar.
  useEffect(() => { setMegaContaId(destinoMega.contaId) }, [destinoMega.contaId])

  /**
   * Consulta a taxa da maquininha assim que dá pra saber qual é — para o
   * operador ver o desconto ANTES de gravar, e ser avisado quando aquela
   * máquina ainda não tem tabela cadastrada.
   *
   * ⚠️ Lê `megaContaId`, não mais o padrão calculado: se o operador trocar a
   * maquininha no seletor, a taxa exibida tem que ser a DAQUELA máquina — senão
   * a tela mostra um líquido que não é o que vai ser gravado.
   */
  useEffect(() => {
    if (!megaPagamentoModal) return
    const metodo = metodoBancoMega
    if (metodo !== 'credito' && metodo !== 'debito') { setTaxaVenda(null); return }
    const m = megaPagamentoForm.parcelas?.match(/(\d+)x/)
    const conta = megaContaId || null
    let cancelado = false
    void taxaDaVenda(supabase, conta, metodo, m ? parseInt(m[1]) : 1,
      megaPagamentoForm.bandeira, hasModule('tela_financeiro'))
      .then(r => { if (!cancelado) setTaxaVenda(r) })
    return () => { cancelado = true }
  }, [megaPagamentoModal, megaContaId, metodoBancoMega, megaPagamentoForm.metodo, megaPagamentoForm.parcelas,
      megaPagamentoForm.bandeira, contasUnidade, supabase, hasModule])

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
      ? hojeLocal()
      : megaPagamentoForm.data_pagamento

    const mesCompetencia = dataPagamento ? `${dataPagamento.slice(0, 4)}/${dataPagamento.slice(5, 7)}` : null


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

    // 🐛 Aqui havia TRÊS UUIDs de conta chumbados no código — e eram contas de
    // SANTOS. Toda outra unidade gravava o recebimento na conta de outra filial,
    // silenciosamente. Agora sai do cadastro: a conta declara o que recebe e
    // qual é a preferencial (mig 122), e a escolha respeita a unidade logada.
    //
    // 13/09/2026: e agora o operador VÊ em qual conta vai cair, em vez de a
    // escolha acontecer no escuro — foi o escuro que pôs 73 recebimentos
    // (R$ 66.359,50) em conta de cartão de crédito. `megaContaId` é o que está
    // na tela; o fallback cobre o modal que não chegou a renderizar o campo.
    const contaId = megaContaId || destinoMega.contaId || null

    // A TAXA É DA MAQUININHA, NÃO DO SISTEMA (mig 134).
    //
    // Antes vinha de `taxas_cartao`, que é global — então a venda na Rede de
    // Campinas era descontada com a taxa da InterPag de Santos. A busca agora
    // parte da CONTA em que o dinheiro cai, e é a mesma função que o detalhe do
    // contrato usa: uma porta só, dois caminhos que não podem divergir.
    //
    // Sem taxa cadastrada o valor entra CHEIO — não se inventa percentual. Três
    // das seis maquininhas estão assim, e o modal avisa antes de gravar.
    // ⚠️ A taxa por maquininha vale só para quem TEM o módulo financeiro. As
    // demais unidades seguem na tabela global, exatamente como hoje — elas não
    // contrataram nada e não têm como cadastrar a tabela da máquina delas.
    const temFinanceiro = hasModule('tela_financeiro')
    const { percentual: taxaPercentual } = await taxaDaVenda(
      supabase, contaId, metodoBanco, parcelas, bandeira, temFinanceiro,
    )

    // Valores
    const valorPlano = megaPagamentoForm.valorPlano ? parseFloat(megaPagamentoForm.valorPlano) : 0
    const descontoPlano = megaPagamentoForm.descontoPlanoAtivo && megaPagamentoForm.descontoPlano ? parseFloat(megaPagamentoForm.descontoPlano) : 0
    const valorBrutoPlano = valorPlano - descontoPlano

    const valorAcessorio = megaPagamentoForm.valorAcessorio ? parseFloat(megaPagamentoForm.valorAcessorio) : 0
    const descontoAcessorio = megaPagamentoForm.descontoAcessorioAtivo && megaPagamentoForm.descontoAcessorio ? parseFloat(megaPagamentoForm.descontoAcessorio) : 0
    const valorBrutoAcessorio = valorAcessorio - descontoAcessorio

    // Quem registrou o recebimento (mig 133). A coluna existia desde 30/08 e
    // nenhum dos dois caminhos a preenchia — 0 de 4.010 pagamentos. Sem isso,
    // um recebimento errado não tem a quem perguntar.
    const { data: { user } } = await supabase.auth.getUser()
    const criadoPor = user?.id || null

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
        criado_por: criadoPor,
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
        criado_por: criadoPor,
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
      .select('id, tipo, valor')

    if (error) {
      console.error('Erro ao salvar pagamento:', error)
      alert('Erro ao salvar pagamento')
    } else {
      // ACERTO EXTERNO — o dinheiro caiu aqui, mas o contrato é de outra unidade.
      //
      // Acontece todo dia: o tutor de Campinas liga para Santos e paga no pix de
      // Santos. Quem fica com o dinheiro é Santos; a receita é de Campinas (ela
      // é lida de `contratos` e por isso nunca se desloca). O que faltava era
      // registrar a dívida que nasce disso — foi assim que 864 pagamentos de
      // outras unidades foram parar nas contas de Santos sem acerto nenhum.
      //
      // Nada se pergunta ao operador: ele responde o que sabe (recebi no meu
      // pix) e a cobrança nasce sozinha, para a outra unidade reconhecer.
      // Ver docs/COBRANCAS_ENTRE_UNIDADES.md.
      // Só a unidade que ESTÁ REGISTRANDO precisa ter o módulo — quem cobra pode
      // não ter ainda, e tudo bem: a cobrança fica gravada esperando, e aparece
      // no dia em que aquela unidade contratar. Deixar de registrar seria pior;
      // é o dinheiro dela parado na conta de outra filial sem rastro nenhum, que
      // foi exatamente como 864 pagamentos foram parar nas contas de Santos.
      const unidadeDoContrato = megaPagamentoContrato.unidade_id
      if (temFinanceiro
          && unidadeDoContrato && currentUnit?.id && unidadeDoContrato !== currentUnit.id) {
        const total = pagamentosParaInserir.reduce((s, p) => s + Number(p.valor || 0), 0)
        // `fin_cobrancas` (mig 135) ainda não está em types/database.ts
        await supabase.from('fin_cobrancas' as never).insert({
          unidade_credora: unidadeDoContrato,   // dona do contrato: tem a receber
          unidade_devedora: currentUnit.id,     // recebeu o dinheiro: deve
          tipo: 'recebimento_terceiro',
          valor: total,
          data: dataPagamento,
          descricao: `Recebimento do contrato ${megaPagamentoContrato.codigo || ''}`.trim(),
          status: 'emitida',
          pagamento_id: (novosPagamentos as { id: string }[] | null)?.[0]?.id || null,
          conta_id: contaId,                    // onde o dinheiro caiu
          criado_por_nome: userName || null,
        } as never)
      }

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

  // Pelinho — igual aos outros rescaldos: abre o popup de quantidade direto (sem prompt "quer?").
  function abrirPelinhoModal(contrato: Contrato) {
    highlightContrato(contrato.id)
    setPelinhoContrato(contrato)
    setPelinhoModal(true)
  }

  // Recarrega as linhas de pelinho desse contrato depois que o PelinhoModal salva — ele mexe
  // direto em contrato_produtos e não devolve os ids novos, então é mais simples reler.
  async function recarregarPelinhoLocal(contratoId: string) {
    const { data } = await supabase
      .from('contrato_produtos')
      .select('id, produto_id, quantidade, foto_recebida, separado, rescaldo_feito, produto:produtos!inner(codigo, nome, tipo, precisa_foto, imagem_url, rescaldo_tipo)')
      .eq('contrato_id', contratoId)
      .eq('produto.rescaldo_tipo', 'pelinho')
    const linhasPelinho = (data || []) as unknown as ContratoProduto[]
    const mesclar = (prods?: ContratoProduto[]) => [
      ...(prods || []).filter(cp => cp.produto?.rescaldo_tipo !== 'pelinho'),
      ...linhasPelinho,
    ]
    setContratos(prev => prev.map(c => c.id === contratoId ? { ...c, contrato_produtos: mesclar(c.contrato_produtos) } : c))
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

  // Ativação de Preventivo já atribuída — abre o popup de conclusão (mig 138)
  function abrirFinalizarAtivacaoPV(contrato: Contrato) {
    setFinalizarAtivacaoPVContrato(contrato)
  }

  // Ativar PV - abre modal
  function abrirAtivarModal(contrato: Contrato) {
    setAtivarContrato(contrato)
    // Preenche com data/hora atual
    const agora = new Date()
    const dataStr = dataLocal(agora)
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
    const dataStr = dataLocal(dataHora)
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

      // cb_cremacao_local (PI): PV vai direto pra 'pinda' ao ser acionado (trigger 091 cria GC).
      // Usa `fluxoLocal` (checa modulos_ativos direto) — hasModule retorna true pra super_admin sempre.
      const novoStatus: 'ativo' | 'pinda' = fluxoLocal ? 'pinda' : 'ativo'

      const { error } = await supabase
        .from('contratos')
        .update({
          status: novoStatus,
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
          ? { ...c, status: novoStatus, data_acolhimento: dataHora.toISOString(), local_coleta: ativarForm.local_coleta, numero_lacre: ativarForm.numero_lacre || null }
          : c
      ))

      // Atualiza contadores
      setStatusCounts(prev => ({
        ...prev,
        preventivo: (prev.preventivo || 0) - 1,
        [novoStatus]: (prev[novoStatus] || 0) + 1,
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
    setEntregaModal(true)
  }

  // Toggle de seleção pra registrar entrega em lote (retorno/pendente)
  function toggleSelectEntrega(id: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setSelectedEntregas(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Abre o modal de confirmação de entrega em lote
  function abrirEntregaBatchModal() {
    if (selectedEntregas.size === 0) return
    setEntregaBatchForm({ dataHoje: true, data_entrega: '' })
    setEntregaBatchModal(true)
  }

  // Registrar entrega de vários contratos de uma vez
  async function confirmarEntregaBatch() {
    if (selectedEntregas.size === 0) return
    const dataEntrega = entregaBatchForm.dataHoje ? hojeLocal() : entregaBatchForm.data_entrega
    if (!dataEntrega) {
      alert('Selecione a data de entrega')
      return
    }

    const ids = Array.from(selectedEntregas)
    const contSelecionados = contratos.filter(c => ids.includes(c.id))

    setEntregaBatchLoading(true)
    try {
      const { error } = await supabase
        .from('contratos')
        .update({ status: 'finalizado', data_entrega: dataEntrega } as never)
        .in('id', ids)
      if (error) throw error

      // Mesma limpeza do EntregaModal/executarBypass — senão cada contrato dessa leva que
      // tinha tarefa de Entrega pendente pro Operacional fica órfão em /tarefas.
      await supabase.from('tarefas_operacionais').update({
        status: 'concluida',
        concluido_em: new Date().toISOString(),
        anotacao_conclusao: 'Contrato finalizado via entrega em lote no pipeline (fora do app do Operacional).',
      } as never).in('contrato_id', ids).eq('tipo', 'entrega').eq('status', 'pendente')

      // Atualiza lista local + contadores
      const countByStatus: Record<string, number> = {}
      contSelecionados.forEach(c => { countByStatus[c.status] = (countByStatus[c.status] || 0) + 1 })

      if (statusFiltro && statusFiltro !== 'finalizado') {
        setContratos(prev => prev.filter(c => !ids.includes(c.id)))
        setTotal(prev => Math.max(0, prev - ids.length))
      } else {
        setContratos(prev => prev.map(c =>
          ids.includes(c.id) ? { ...c, status: 'finalizado', data_entrega: dataEntrega } : c
        ))
      }

      setStatusCounts(prev => {
        const next = { ...prev }
        Object.entries(countByStatus).forEach(([s, n]) => {
          next[s] = Math.max(0, (next[s] || 0) - n)
        })
        next.finalizado = (next.finalizado || 0) + ids.length
        return next
      })

      setSelectedEntregas(new Set())
      setEntregaBatchModal(false)
    } catch (err) {
      console.error('Erro ao registrar entrega em lote:', err)
      alert('Erro ao registrar entrega em lote.')
    } finally {
      setEntregaBatchLoading(false)
    }
  }

  // Urna - carrega lista de urnas com saldo da unidade do contrato
  async function carregarUrnas(unidadeId?: string) {
    const { data: produtosData } = await supabase
      .from('produtos')
      .select('id, codigo, nome, tipo, categoria, preco, imagem_url, estoque_infinito')
      .eq('tipo', 'urna')
      .eq('ativo', true)
      .order('nome')

    if (!produtosData) return

    // Estoque DA UNIDADE DO CONTRATO (não o legado global de produtos.estoque_atual)
    const uid = unidadeId || currentUnit?.id
    const estoqueMap = new Map<string, number>()
    if (uid) {
      const { data: peData } = await supabase
        .from('produtos_estoque')
        .select('produto_id, estoque_atual')
        .eq('unidade_id', uid)
      const rows = (peData || []) as { produto_id: string; estoque_atual: number }[]
      rows.forEach(r => estoqueMap.set(r.produto_id, r.estoque_atual))
    }

    const merged = (produtosData as unknown as Produto[]).map((p) => ({
      ...p,
      estoque_atual: estoqueMap.get(p.id) ?? 0,
    }))
    setUrnas(merged)
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
      // Sempre recarrega com a unidade do contrato (saldos por unidade)
      carregarUrnas(contrato.unidade_id)
    }
  }

  // Urna - ação do prompt
  function urnaPromptAcao(acao: 'adicionar' | 'editar') {
    setUrnaPrompt(false)
    setUrnaModoEdicao(acao === 'editar')
    setUrnaModal(true)
    carregarUrnas(urnaContrato?.unidade_id)
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

        // Creditar estoque da urna removida DA UNIDADE DO CONTRATO
        await ajustarEstoquePorCodigo(ultimaUrna.produto?.codigo || '', +1, urnaContrato.unidade_id)
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

        // Debitar estoque da nova urna DA UNIDADE DO CONTRATO
        await ajustarEstoque(urnaSelecionada.id, -1, urnaSelecionada.estoque_infinito, urnaContrato.unidade_id)
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
  const categoriasUrnasModal = ordenarCategoriasUrnas([...new Set(
    urnas.filter(u => u.categoria).map(u => u.categoria!)
  )])

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

  // Calcula próximo número de supinda com prefixo da unidade
  async function getProximoNumeroSupinda(): Promise<string> {
    const prefixo = currentUnit?.codigo || 'ST'
    let q = supabase
      .from('supindas')
      .select('numero')
      .like('numero', `${prefixo}%`)
    // Filtra por unidade além do prefixo. Os dois coincidem hoje (o número nasce com o
    // código da unidade), mas "confiar no prefixo" é exatamente a query sem escopo que
    // virou a segunda porta do incidente SP47 (§10.5, armadilha 7).
    if (currentUnit) q = q.eq('unidade_id', currentUnit.id)
    const { data: supindasUnidade } = await q

    const maxNum = (supindasUnidade || []).reduce((max, s) => {
      const num = parseInt((s as { numero: string }).numero.replace(prefixo, ''), 10)
      return isNaN(num) ? max : Math.max(max, num)
    }, 0)
    return `${prefixo}${maxNum + 1}`
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
      sabado: dataLocal(proxSabado),
      domingo: dataLocal(proxDomingo),
      hoje: dataLocal(hoje),
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

  // ─── Incluir pet(s) numa viagem — o gesto central da etapa Ativo (§3.1) ──────
  // Vale para os dois gestos: arrastar (desktop) e segurar+tocar (mobile).
  async function vincularAoEncaminhamento(contratoIds: string[], supindaId: string) {
    if (contratoIds.length === 0 || vinculando) return
    setVinculando(true)
    try {
      // ⚠️ O estado da viagem vem do BANCO no momento do gesto, nunca do embed que
      // está na tela — que pode ter minutos de idade. Se outra pessoa despachou a
      // viagem nesse meio-tempo, o pet entraria numa viagem que já saiu e ficaria
      // preso em `ativo` para sempre: foi assim que o Shu, em Campinas, ficou parado
      // desde abril (§3.1, "pet que chega depois espera a próxima").
      const { data: sup, error: errSup } = await supabase
        .from('supindas').select('id, numero, status').eq('id', supindaId).maybeSingle()
      if (errSup || !sup) {
        alert(`Não deu pra conferir o encaminhamento: ${errSup?.message || 'não encontrado'}\n\nNada foi alterado.`)
        return
      }
      const viagem = sup as { id: string; numero: string; status: string | null }
      if (viagem.status !== 'planejada') {
        alert(`O encaminhamento ${viagem.numero} já partiu — não dá mais para incluir pets nele.\n\nEste pet entra na próxima viagem.`)
        await carregarContratos()
        return
      }

      const { error } = await supabase.from('contratos')
        .update({ supinda_id: viagem.id } as never).in('id', contratoIds)
      if (error) {
        alert(`Erro ao incluir no ${viagem.numero}: ${error.message}\n\nNada foi alterado.`)
        return
      }

      // Recalcula do banco (nunca soma incremental — armadilha 6 do §10.5): esses 2
      // campos não alimentam o placar daqui, que é calculado, mas a /encaminhamentos
      // ainda os lê e mostraria número errado.
      await recalcularEstatisticasSupinda(viagem.id)

      setPetsSelecionados(new Set())
      setPetArrastando(null)
      setEncAlvo(null)
      await carregarContratos()
    } finally {
      setVinculando(false)
    }
  }

  // ─── Criar / editar a viagem no próprio pipeline (etapa 3, §3.1) ────────────
  async function abrirNovoEncaminhamento() {
    const numero = await getProximoNumeroSupinda()
    setEncEditando(null)
    setEncFormPets([])
    setEncForm({ numero, data: hojeLocal(), responsavel: userName || '', observacoes: '' })
    setEncFormAberto(true)
  }

  async function abrirEdicaoEncaminhamento(supindaId: string, numero: string) {
    setMenuViagem(null)
    // Lê do banco, não do embed da tela: observações não vêm no SELECT do pipeline,
    // e data/responsável podem ter mudado desde que a lista carregou.
    const { data, error } = await supabase
      .from('supindas').select('id, numero, data, responsavel, observacoes, status').eq('id', supindaId).maybeSingle()
    if (error || !data) {
      alert(`Não deu pra abrir o ${numero}: ${error?.message || 'não encontrado'}`)
      return
    }
    const s = data as { id: string; numero: string; data: string | null; responsavel: string | null; observacoes: string | null; status: string | null }
    setEncEditando({ id: s.id, numero: s.numero })
    setEncFormPets(contratos.filter(c => c.supinda?.id === s.id))
    setEncForm({
      numero: s.numero,
      data: (s.data || '').slice(0, 10),
      responsavel: s.responsavel || '',
      observacoes: s.observacoes || '',
    })
    setEncFormAberto(true)
  }

  async function salvarEncaminhamento() {
    if (!currentUnit || !encForm.data || salvandoEnc) return
    setSalvandoEnc(true)
    try {
      if (encEditando) {
        const { error } = await supabase.from('supindas').update({
          data: encForm.data,
          responsavel: encForm.responsavel.trim() || null,
          observacoes: encForm.observacoes.trim() || null,
        } as never).eq('id', encEditando.id)
        if (error) { alert(`Erro ao salvar o ${encEditando.numero}: ${error.message}`); return }
      } else {
        // ⚠️ O número é regerado no SALVAR, não reaproveitado do que apareceu ao abrir o
        // form: entre abrir e salvar, outra pessoa pode ter criado uma viagem e levado
        // aquele número.
        //
        // E `supindas.numero` é **UNIQUE** (mig 001, `numero INTEGER UNIQUE NOT NULL`;
        // a coluna virou texto depois, mas `ALTER COLUMN TYPE` preserva a constraint —
        // conferido nos dados: 522 viagens, zero número repetido). Ou seja, a colisão
        // não passa em silêncio: ela FALHA com `23505`. Então aqui há retry — regera e
        // tenta de novo, em vez de mandar o operador clicar de novo por um número que
        // ele nem escolheu.
        let erroFinal: { message: string; code?: string } | null = null
        for (let tentativa = 0; tentativa < 3; tentativa++) {
          const numero = await getProximoNumeroSupinda()
          const { error } = await supabase.from('supindas').insert({
            numero,
            data: encForm.data,
            responsavel: encForm.responsavel.trim() || null,
            observacoes: encForm.observacoes.trim() || null,
            status: 'planejada',
            quantidade_pets: 0,
            peso_total: 0,
            unidade_id: currentUnit.id,
          } as never)
          if (!error) { erroFinal = null; break }
          erroFinal = error
          // 23505 = unique_violation. Qualquer outro erro não melhora tentando de novo.
          if (error.code !== '23505') break
        }
        if (erroFinal) { alert(`Erro ao criar o encaminhamento: ${erroFinal.message}`); return }
      }
      setEncFormAberto(false)
      await carregarContratos()
    } finally {
      setSalvandoEnc(false)
    }
  }

  /** Tira UM pet da viagem (volta a ser pet solto). Só pela edição — o gesto de
   *  arrastar inclui, nunca remove, pra não desfazer trabalho por engano. */
  async function desvincularPet(contratoId: string, supindaId: string) {
    const { error } = await supabase.from('contratos').update({ supinda_id: null } as never).eq('id', contratoId)
    if (error) { alert(`Erro ao tirar o pet do encaminhamento: ${error.message}`); return }
    await recalcularEstatisticasSupinda(supindaId)
    setEncFormPets(prev => prev.filter(c => c.id !== contratoId))
    await carregarContratos()
  }

  async function excluirEncaminhamento() {
    if (!encEditando) return
    const n = encFormPets.length
    const aviso = n > 0
      ? `Excluir o encaminhamento ${encEditando.numero}?\n\nOs ${n} pet${n > 1 ? 's' : ''} vinculado${n > 1 ? 's voltam' : ' volta'} para a fila, sem encaminhamento. Nenhum contrato é apagado.`
      : `Excluir o encaminhamento ${encEditando.numero}?\n\n(está vazio)`
    if (!confirm(aviso)) return
    setSalvandoEnc(true)
    try {
      // Desvincula ANTES de apagar a viagem: se o delete falhar, os pets já estão
      // livres e dá pra repetir — o contrário deixaria contrato apontando pra uma
      // supinda que não existe mais. É a mesma ordem do "mover antes de fechar" (§10.5).
      const { error: errDesv } = await supabase.from('contratos').update({ supinda_id: null } as never).eq('supinda_id', encEditando.id)
      if (errDesv) { alert(`Erro ao liberar os pets: ${errDesv.message}\n\nO encaminhamento NÃO foi excluído.`); return }
      const { error } = await supabase.from('supindas').delete().eq('id', encEditando.id)
      if (error) { alert(`Os pets foram liberados, mas o encaminhamento não pôde ser excluído: ${error.message}`); return }
      setEncFormAberto(false)
      await carregarContratos()
    } finally {
      setSalvandoEnc(false)
    }
  }

  // ─── Enviar para a Matriz (etapa 4) ─────────────────────────────────────────
  const CAMPOS_PET_VIAGEM = 'id, pet_nome, numero_lacre, tipo_cremacao, tutor_nome, tutor:tutores(nome), status'

  /** Lê do BANCO os pets da viagem. Usada tanto pra montar a conferência quanto pra
   *  reconferir no instante do envio — nunca se confia no que está na tela. */
  async function lerPetsDaViagem(supindaId: string): Promise<PetDaViagem[] | null> {
    const { data, error } = await supabase.from('contratos')
      .select(CAMPOS_PET_VIAGEM).eq('supinda_id', supindaId).eq('status', 'ativo')
    if (error) {
      alert(`Não deu pra ler os pets da viagem: ${error.message}\n\nNada foi alterado.`)
      return null
    }
    return (data || []) as unknown as PetDaViagem[]
  }

  async function abrirEnvioParaMatriz(supindaId: string, numero: string) {
    setMenuViagem(null)
    setEnviarCarregando(true)
    setEnviarModal({ id: supindaId, numero, data: null })
    const { data: sup } = await supabase.from('supindas').select('data, status').eq('id', supindaId).maybeSingle()
    const s = sup as { data: string | null; status: string | null } | null
    const pets = await lerPetsDaViagem(supindaId)
    setEnviarCarregando(false)
    if (!pets) { setEnviarModal(null); return }
    if (s && s.status !== 'planejada') {
      setEnviarModal(null)
      alert(`O encaminhamento ${numero} já foi enviado.`)
      await carregarContratos()
      return
    }
    setEnviarModal({ id: supindaId, numero, data: s?.data ?? null })
    setEnviarPets(pets)
  }

  async function confirmarEnvioParaMatriz() {
    if (!enviarModal || enviando) return
    const { id: supindaId, numero, data: dataViagem } = enviarModal
    setEnviando(true)
    try {
      // 🔴 RECONFERE no banco no instante do envio. A lista da tela pode ter minutos de
      // idade, e é justamente o UPDATE em lote sobre lista desatualizada que produziu o
      // incidente SP47: a supinda fechou como `ida_finalizada` e ZERO contrato se moveu.
      const pets = await lerPetsDaViagem(supindaId)
      if (!pets) return

      // ⚠️ Viagem vazia NUNCA fecha. No fluxo antigo o gate era `encIda.every(...)`, e
      // `[].every()` é `true` — lista vazia liberava o botão. Aqui é explícito.
      if (pets.length === 0) {
        alert(`O ${numero} está sem nenhum pet para enviar.\n\nNada foi alterado — inclua os pets antes de enviar.`)
        setEnviarModal(null)
        await carregarContratos()
        return
      }
      if (pets.length !== enviarPets.length) {
        setEnviarPets(pets)
        alert(`A lista mudou desde que você abriu: agora são ${pets.length} pet${pets.length !== 1 ? 's' : ''}, não ${enviarPets.length}.\n\nConfira a lista atualizada e envie de novo.`)
        return
      }

      const ids = pets.map(p => p.id)
      // 1º os FILHOS, depois o PAI (§10.5, armadilha 3): se o UPDATE dos contratos
      // falhar, a viagem continua aberta e repetível — em vez de ficar fechada com os
      // pets para trás, que foi exatamente o estado do SP47.
      const { error: errMover } = await supabase.from('contratos')
        .update({ status: 'pinda', data_leva_pinda: dataViagem || hojeLocal() } as never).in('id', ids)
      if (errMover) {
        alert(`Erro ao levar os pets para Pinda: ${errMover.message}\n\nO ${numero} NÃO foi enviado — tente de novo.`)
        return
      }

      // 🔴 REQUISITO INEGOCIÁVEL (§10.7): `ida_finalizada` é o que destrava o "Confirmar
      // Recebimento" da Matriz (`GCAcaoModal.tsx:188`). Sem este UPDATE, os pets chegam
      // em Pinda e a Matriz não consegue recebê-los — e não saberia por quê.
      const { error: errStatus } = await supabase.from('supindas')
        .update({ status: 'ida_finalizada' } as never).eq('id', supindaId)
      if (errStatus) {
        // Tratamento de erro pedido pelo Lucas em 05/09: *"preveja um tratamento de erro
        // que volte todo encaminhamento para os ativos, para ele refazer"*. Sem isso
        // sobrariam pets em `pinda` numa viagem ainda aberta — invisíveis na etapa Ativo
        // e impossíveis de receber na Matriz.
        const { error: errVolta } = await supabase.from('contratos')
          .update({ status: 'ativo', data_leva_pinda: null } as never).in('id', ids)
        alert(errVolta
          ? `O ${numero} não pôde ser fechado (${errStatus.message}) E a volta dos pets para Ativos também falhou (${errVolta.message}).\n\n⚠️ Avise o suporte antes de mexer: ${ids.length} pets podem estar em Pinda com a viagem aberta.`
          : `O ${numero} não pôde ser fechado: ${errStatus.message}\n\nTodos os ${ids.length} pets voltaram para Ativos. Pode montar e enviar de novo.`)
        await carregarContratos()
        return
      }

      setEnviarModal(null)
      setEnviarPets([])
      await carregarContratos()
    } finally {
      setEnviando(false)
    }
  }

  // ─── Trazer da Matriz (etapa 7, §9.5) ───────────────────────────────────────
  // ⚠️ `etapa` PRECISA estar no embed: é por ela que o nicho é filtrado logo abaixo.
  // Sem ela o filtro compara com `undefined` e o nicho vem sempre vazio, em silêncio.
  // `!inner` descarta quem não tem GC — o `.not('contrato_gc','is',null)` que eu tinha
  // escrito antes não faz isso no PostgREST.
  const CAMPOS_PET_NICHO = 'id, pet_nome, numero_lacre, tipo_cremacao, tutor_nome, tutor:tutores(nome), supinda_id, supinda:supindas!fk_contrato_supinda(numero, data), contrato_gc!inner(etapa, cinzas_prontas, certificado_pronto, data_cremacao)'

  /** Só `date` (sem hora): `data_retorno`/`data_entrega` são colunas `date`. */
  const soData = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : hojeLocal())

  async function lerPetsDoNicho(): Promise<PetNoNicho[] | null> {
    if (!currentUnit) return null
    const { data, error } = await supabase.from('contratos')
      .select(CAMPOS_PET_NICHO)
      .eq('unidade_id', currentUnit.id)
      .eq('status', 'pinda')
      .eq('contrato_gc.etapa', 'disponivel')
    if (error) {
      alert(`Não deu pra ler o nicho: ${error.message}\n\nNada foi alterado.`)
      return null
    }
    return (data || []) as unknown as PetNoNicho[]
  }

  async function abrirTrazerDaMatriz() {
    setTrazerCarregando(true)
    setTrazerAberto(true)
    const pets = await lerPetsDoNicho()
    setTrazerCarregando(false)
    if (!pets) { setTrazerAberto(false); return }
    setTrazerPets(pets)
    setTrazerPresencial(new Set())
    // Sugestão inicial: a data da viagem de ida mais recente entre os pets do nicho
    // (§9.5 — "mesma data do encaminhamento ST170"). O Lucas faz isso de verdade: vai de
    // manhã, crema, e volta no fim do dia com as cinzas.
    const sugestao = sugestaoDataVolta(pets)
    const mapa: Record<string, string> = {}
    for (const p of pets) mapa[p.id] = sugestao.data
    setTrazerDatas(mapa)
  }

  /** A viagem de ida mais recente entre os pets — vira o rótulo do botão do lote. */
  function sugestaoDataVolta(pets: PetNoNicho[]): { data: string; rotulo: string | null } {
    let melhor: { numero: string; data: string } | null = null
    for (const p of pets) {
      const d = p.supinda?.data ? p.supinda.data.slice(0, 10) : null
      if (!d || !p.supinda) continue
      if (!melhor || d > melhor.data) melhor = { numero: p.supinda.numero, data: d }
    }
    if (!melhor) return { data: hojeLocal(), rotulo: null }
    return { data: melhor.data, rotulo: `${melhor.numero} · ${formatarDataViagem(melhor.data)}` }
  }

  async function finalizarVolta() {
    if (trazendo || trazerPets.length === 0) return
    setTrazendo(true)
    try {
      // Reconfere no banco (mesma trava do envio): alguém pode ter movido um pet.
      const atual = await lerPetsDoNicho()
      if (!atual) return
      if (atual.length !== trazerPets.length) {
        setTrazerPets(atual)
        alert(`A lista mudou desde que você abriu: agora são ${atual.length} pet${atual.length !== 1 ? 's' : ''}, não ${trazerPets.length}.\n\nConfira e finalize de novo.`)
        return
      }

      const idsValidos = new Set(atual.map(p => p.id))
      const presenciais = atual.filter(p => trazerPresencial.has(p.id))
      const normais = atual.filter(p => !trazerPresencial.has(p.id))

      // ⚠️ VOLUME: medido no banco em 12/09, o nicho de uma unidade chega a **138 pets**
      // (PA 138 · RS 134 · SJ 120) — é o passivo que esta tela existe pra regularizar.
      // Um UPDATE por pet seriam 138 requisições, lento e frágil (falha no meio = estado
      // parcial). Então agrupa por (data + viagem de ida), que é o que precisa ser igual
      // dentro de um lote: tipicamente vira um punhado de chamadas, não uma centena.
      //
      // `supinda_volta_id` recebe a viagem da IDA (decisão de 12/09): no fluxo novo a
      // volta sai do Nicho, que junta viagens diferentes, então não existe uma "viagem de
      // volta". Isso mantém a /encaminhamentos legível e faz a etapa Entrega agrupar pela
      // ida sozinha (§3.3).
      type Lote = { data: string; supindaId: string | null; ids: string[] }
      const agrupar = (pets: PetNoNicho[], dataDe: (p: PetNoNicho) => string): Lote[] => {
        const mapa = new Map<string, Lote>()
        for (const p of pets) {
          if (!idsValidos.has(p.id)) continue
          const data = dataDe(p)
          const chave = `${data}|${p.supinda_id ?? ''}`
          if (!mapa.has(chave)) mapa.set(chave, { data, supindaId: p.supinda_id, ids: [] })
          mapa.get(chave)!.ids.push(p.id)
        }
        return [...mapa.values()]
      }

      // ── Pets que voltam para a unidade → etapa Entrega ──
      for (const lote of agrupar(normais, p => trazerDatas[p.id] || hojeLocal())) {
        const { error } = await supabase.from('contratos').update({
          status: 'retorno',
          data_retorno: lote.data,
          supinda_volta_id: lote.supindaId,
        } as never).in('id', lote.ids)
        if (error) {
          alert(`Erro ao trazer ${lote.ids.length} pet${lote.ids.length !== 1 ? 's' : ''}: ${error.message}\n\nOs que já foram processados continuam corretos — reabra e refaça para os que restaram.`)
          await carregarContratos()
          return
        }
      }

      // ── Pets que o tutor buscou EM PINDA → pulam a Entrega e vão a finalizado ──
      // ⚠️ Atalho SÓ para o caso presencial (§3.2): não é um "já entregou" genérico, senão
      // a unidade registra o mês inteiro de uma vez e atropela quem cuida do GC.
      // `data_entrega = data_retorno = data_cremacao`: o pet saiu de Pinda no dia em que
      // foi cremado, não voltou pra unidade nenhum dia.
      for (const lote of agrupar(presenciais, p => soData(p.contrato_gc?.data_cremacao))) {
        const { error } = await supabase.from('contratos').update({
          status: 'finalizado',
          data_retorno: lote.data,
          data_entrega: lote.data,
          supinda_volta_id: lote.supindaId,
        } as never).in('id', lote.ids)
        if (error) {
          alert(`Erro ao finalizar ${lote.ids.length} pet${lote.ids.length !== 1 ? 's' : ''} presencia${lote.ids.length !== 1 ? 'is' : 'l'}: ${error.message}`)
          await carregarContratos()
          return
        }
      }

      // ── Fecha as viagens de ida que não têm mais ninguém em Pinda ──
      // A viagem só vira `finalizada` quando o ÚLTIMO pet dela saiu — com ela aberta, a
      // /encaminhamentos mostraria como em andamento uma viagem já resolvida.
      const supindasEnvolvidas = [...new Set(atual.map(p => p.supinda_id).filter((x): x is string => !!x))]
      for (const supId of supindasEnvolvidas) {
        const { count } = await supabase.from('contratos')
          .select('id', { count: 'exact', head: true }).eq('supinda_id', supId).eq('status', 'pinda')
        if ((count ?? 0) === 0) {
          await supabase.from('supindas').update({ status: 'finalizada' } as never).eq('id', supId)
        }
      }

      setTrazerAberto(false)
      setTrazerPets([])
      setTrazerPresencial(new Set())
      await carregarContratos()
    } finally {
      setTrazendo(false)
    }
  }

  // Long-press de 500 ms — MESMO gesto e MESMA duração da /encaminhamentos, de
  // propósito: quem usa as duas telas não reaprende nada (§10.2 do plano).
  function iniciarLongPress(contratoId: string) {
    longPressDisparou.current = false
    longPressTimer.current = setTimeout(() => {
      longPressDisparou.current = true
      setPetsSelecionados(prev => {
        const n = new Set(prev)
        if (n.has(contratoId)) n.delete(contratoId); else n.add(contratoId)
        return n
      })
    }, 500)
  }
  function cancelarLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
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
    setRescaldoModal(true)
  }

  function abrirIndicacaoModal(contrato: Contrato) {
    highlightContrato(contrato.id)
    setIndicacaoContrato(contrato)
    setIndicacaoModal(true)
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
      await ajustarEstoquePorCodigo(produto.codigo, -1, rescaldoContrato.unidade_id)
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
      // Se tinha tarefa pendente pro Operacional nesse mesmo item (molde/carimbo/pelo extra),
      // marca concluída — senão fica órfã em /tarefas pra sempre (o rescaldo já foi feito por
      // aqui, direto no pipeline, não pelo app). Mesma classe de bug do cancelamento de ficha
      // órfão (ver CHANGELOG 23/08/2026).
      if (novoValor) {
        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from('tarefas_operacionais').update({
          status: 'concluida',
          concluido_em: new Date().toISOString(),
          anotacao_conclusao: 'Marcado como feito direto no pipeline (fora do app do Operacional).',
        } as never).eq('contrato_produto_id', cpId).eq('status', 'pendente')
        await supabase.from('historico_alteracoes').insert({
          entidade: 'contrato_produtos',
          entidade_id: cpId,
          entidade_nome: rescaldoContrato.pet_nome || '—',
          campo: 'rescaldo_feito',
          campo_label: 'Rescaldo marcado como feito',
          valor_novo: 'Feito direto no pipeline — tarefa do Operacional (se havia) foi concluída junto',
          tipo: 'conclusao',
          alterado_por: user?.id ?? null,
          alterado_por_email: user?.email ?? null,
        } as never)
      }
    }
  }

  async function removerProdutoRescaldo(cpId: string, produtoId: string) {
    if (!rescaldoContrato) return

    const { error } = await supabase
      .from('contrato_produtos')
      .delete()
      .eq('id', cpId)

    if (!error) {
      // Creditar estoque DA UNIDADE DO CONTRATO
      await ajustarEstoque(produtoId, 1, undefined, rescaldoContrato.unidade_id)
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

  // Aguardar contexto de unidade carregar (tela em branco, sem flash)
  if (unitLoading || !currentUnit) {
    return <div className="min-h-[50vh]" />
  }

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
        {/* Toggle compartilhados (FLS: btn_compartilhar) */}
        {isVisible('tela_contrato', 'btn_compartilhar') && (
          <button
            onClick={() => setMostrarCompartilhados(!mostrarCompartilhados)}
            className={`relative h-8 px-2.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 shrink-0 ${
              mostrarCompartilhados
                ? 'bg-purple-600 border-purple-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-purple-500'
            }`}
            title={mostrarCompartilhados ? 'Mostrando compartilhados — clique pra esconder' : `Mostrar ${compartilhadosCount} contrato(s) compartilhado(s)`}
          >
            🔄
            {!mostrarCompartilhados && compartilhadosCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-[9px] font-bold text-white">
                  {compartilhadosCount}
                </span>
              </span>
            )}
          </button>
        )}
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
          {/* Ordenação: data (asc/desc) | alfabético (asc/desc) */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => {
                if (ordenacao === 'data') { setOrdemAsc(!ordemAsc) } else { setOrdenacao('data'); setOrdemAsc(false) }
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
              title={ordenacao === 'nome' ? (ordemAsc ? 'A → Z' : 'Z → A') : 'Ordenar A-Z'}
            >
              {ordenacao === 'nome' && !ordemAsc ? 'Z→A' : 'A→Z'} {ordenacao === 'nome' && (ordemAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
            </button>
            {/* Toggle: ordenar por proximidade de CEP (FLS btn_ordenar_cep; exige unidades.cep — mig 102) */}
            {isVisible(T, 'btn_ordenar_cep') && cepUnidadeNum !== null && (
              <button
                onClick={() => {
                  if (ordenacao === 'cep') { setOrdenacao('data'); setOrdemAsc(false) } else { setOrdenacao('cep'); setOrdemAsc(true) }
                  setPagina(0)
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                  ordenacao === 'cep' ? 'bg-slate-700 text-purple-300' : 'text-slate-400 hover:text-slate-200'
                }`}
                title={ordenacao === 'cep' ? 'Mais perto da unidade primeiro (clique p/ voltar à data)' : 'Ordenar por proximidade de CEP da unidade'}
              >
                📏 CEP {ordenacao === 'cep' && <ArrowUp className="h-3 w-3" />}
              </button>
            )}
          </div>
          {/* Toggle: agrupar por encaminhamento */}
          {statusFiltro !== 'preventivo' && (
            <button
              onClick={() => { setAgruparSupinda(!agruparSupinda); setPagina(0) }}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                agruparSupinda ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title={agruparSupinda ? 'Desagrupar encaminhamento' : 'Agrupar por encaminhamento'}
            >
              🚐 Encam.
            </button>
          )}
          {/* + Enc — cria a viagem aqui mesmo (etapa 3). Só na etapa Ativo: é onde a
              viagem é montada; nas outras ela já existe. */}
          {encPipeline && statusFiltro === 'ativo' && (
            <button
              onClick={abrirNovoEncaminhamento}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-orange-600 text-white hover:bg-orange-700 transition-colors"
              title="Criar um encaminhamento novo"
            >
              <Truck className="h-3.5 w-3.5" />+ Enc
            </button>
          )}
          {/* Toggle: agrupar por cidade */}
          {!(statusFiltro === 'retorno' && montagemInline) && (
            <button
              onClick={() => { setAgruparCidade(!agruparCidade); if (agruparCidade) setAgruparBairro(false) }}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                agruparCidade ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title={agruparCidade ? 'Desagrupar cidade' : 'Agrupar por cidade'}
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
          {STATUS_FLOW.filter(s => !(fluxoLocal && s.key === 'ativo')).map((status) => {
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

        {/* Montagem filter — Retorno only, FLS: btn_fluxo_retorno */}
        {statusFiltro === 'retorno' && isVisible(T, 'btn_fluxo_retorno') && (() => {
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
        {/* Montagem In-line (só retorno, FLS: btn_fluxo_retorno) */}
        {statusFiltro === 'retorno' && montagemInline && isVisible(T, 'btn_fluxo_retorno') && (
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
                { id: 'rescaldos', icon: '🐾', label: 'Personalizados', cor: 'orange' },
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
                  setOrdemAsc(false)
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
              title={ordenacao === 'nome' ? (ordemAsc ? 'A → Z' : 'Z → A') : 'Ordenar A-Z'}
            >
              {ordenacao === 'nome' && !ordemAsc ? 'Z→A' : 'A→Z'} {ordenacao === 'nome' && (ordemAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
            </button>
            {/* Toggle: ordenar por proximidade de CEP (FLS btn_ordenar_cep; exige unidades.cep — mig 102) */}
            {isVisible(T, 'btn_ordenar_cep') && cepUnidadeNum !== null && (
              <button
                onClick={() => {
                  if (ordenacao === 'cep') { setOrdenacao('data'); setOrdemAsc(false) } else { setOrdenacao('cep'); setOrdemAsc(true) }
                  setPagina(0)
                }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  ordenacao === 'cep'
                    ? 'bg-slate-700 text-purple-300 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={ordenacao === 'cep' ? 'Mais perto da unidade primeiro (clique p/ voltar à data)' : 'Ordenar por proximidade de CEP da unidade'}
              >
                📏 CEP {ordenacao === 'cep' && <ArrowUp className="h-3 w-3" />}
              </button>
            )}
          </div>

          {/* Toggle: agrupar por encaminhamento — escondido em unidades com cb_cremacao_local
              (não há encaminhamento, todos os pets cairiam em "Sem encaminhamento"). */}
          {statusFiltro !== 'preventivo' && !fluxoLocal && (
            <button
              onClick={() => { setAgruparSupinda(!agruparSupinda); setPagina(0) }}
              className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                agruparSupinda ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title={agruparSupinda ? 'Desagrupar encaminhamento' : 'Agrupar por encaminhamento'}
            >
              🚐 Encam.
            </button>
          )}

          {/* + Enc (mobile) — mesma regra da barra do desktop */}
          {encPipeline && statusFiltro === 'ativo' && (
            <button
              onClick={abrirNovoEncaminhamento}
              className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold bg-orange-600 text-white hover:bg-orange-700 transition-colors"
              title="Criar um encaminhamento novo"
            >
              <Truck className="h-4 w-4" />+ Enc
            </button>
          )}

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
          { id: 'rescaldos', icon: '🐾', label: 'Personalizados' },
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
        {/* 🔴 Etapa maior que a carga total: os placares abaixo contariam só um recorte.
            Avisa em vez de mostrar número errado com cara de conferido (lição do SP47). */}
        {truncadoEm !== null && (
          <div className="rounded-lg border border-red-500/50 bg-red-950/40 px-3 py-2 text-[11px] text-red-200">
            <strong>Esta etapa tem {truncadoEm} pets e só {contratos.length} couberam na tela.</strong>{' '}
            Os totais dos encaminhamentos abaixo estão incompletos — não use o &quot;Enviar para Matriz&quot;
            até isso ser resolvido. Avise o suporte.
          </div>
        )}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[68px] w-full" />
            ))}
          </div>
        ) : contratos.length === 0 ? (
          <EmptyState title="Nenhum contrato encontrado" description="Ajuste os filtros ou a busca para ver contratos aqui." />
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

            // Agrupar contratos por supinda: toggle do user, sem efeito em preventivo
            // nem em unidades com cb_cremacao_local (sem encaminhamento).
            // ⚠️ No fluxo novo a etapa PINDA não agrupa por viagem (§3.2 do plano): a
            // viagem que levou já não importa, importa o que está pronto pra buscar.
            // Ela vira cards soltos com linha do tempo do GC + o card do Nicho (etapas 5 e 6).
            const deveAgruparSupinda = agruparSupinda && statusFiltro !== 'preventivo' && !fluxoLocal
              && !(encPipeline && statusFiltro === 'pinda')

            // Ativação de Preventivo em andamento (mig 138) sempre primeiro, seja qual for a
            // ordenação escolhida — acabou de acontecer, não faz sentido enterrar lá embaixo
            // por causa da data (que nem existe ainda pra esses). `0` = empate, cai pro
            // critério normal de baixo.
            const prioridadeAcolhimento = (a: Contrato, b: Contrato): number => {
              if (!!a.aguardando_acolhimento === !!b.aguardando_acolhimento) return 0
              return a.aguardando_acolhimento ? -1 : 1
            }

            // ─── PLACAR DO ENCAMINHAMENTO (§9.1) ───────────────────────────────
            // Tudo CALCULADO da lista de pets que está na tela, nunca lido de
            // `supindas.quantidade_pets`/`peso_total`: esses dois campos são mantidos
            // por aritmética incremental em 4 lugares diferentes e divergem sob
            // concorrência (armadilha 6 do §10.5 do plano). A lista é confiável aqui
            // porque `cargaTotalDaEtapa` traz a etapa inteira e avisa se truncar.
            const calcularPlacar = (cs: Contrato[]) => {
              let comLacre = 0, pagos = 0, ind = 0, col = 0, peso = 0
              for (const c of cs) {
                if ((c.numero_lacre || '').trim()) comLacre++
                const { planoPendente, acessoriosPendente } = getPagamentoPendente(c)
                if (!planoPendente && !acessoriosPendente) pagos++
                if (c.tipo_cremacao === 'coletiva') col++; else ind++
                peso += c.pet_peso || 0
              }
              return { total: cs.length, comLacre, pagos, ind, col, peso }
            }

            // Cor de um par do placar: verde quando fecha, âmbar quando falta alguém (§9.1).
            const corPlacar = (ok: boolean) => (ok ? '#22c55e' : '#f59e0b')
            const corUnidade = corUnidadeAtual
            const textoBadgeUnidade = textoBadgeUnidadeAtual
            const chipsTipo = (p: ReturnType<typeof calcularPlacar>) => (
              <>
                {p.ind > 0 && <span className="flex items-center gap-0.5 text-[12px] font-semibold px-1.5 py-0.5 rounded bg-emerald-900/30 text-emerald-300"><Flame className="h-3 w-3" />{p.ind} IND</span>}
                {p.col > 0 && <span className="flex items-center gap-0.5 text-[12px] font-semibold px-1.5 py-0.5 rounded bg-violet-900/30 text-violet-300"><Flame className="h-3 w-3" />{p.col} COL</span>}
              </>
            )

            // Menu "⋯" da viagem. `stopPropagation` em tudo: o wrapper da faixa abre os
            // pets no clique, e sem isso escolher "Editar" também expandiria a lista.
            const menuEncaminhamento = (numero: string, cs: Contrato[]) => {
              const sup = cs.find(c => c.supinda)?.supinda
              const supId = sup?.id || null
              // ⚠️ O menu só existe em viagem AINDA PLANEJADA. Numa viagem que já partiu,
              // "Editar" abriria o desvincular-pet e o Excluir sobre um lote já despachado
              // — destrutivo e sem sentido. Histórico de viagem passada se olha na
              // /encaminhamentos, que existe exatamente pra isso (§4.6).
              if (!supId || (sup?.status && sup.status !== 'planejada')) return null
              const aberto = menuViagem === numero
              return (
                <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={e => { e.stopPropagation(); setMenuViagem(a => (a === numero ? null : numero)) }}
                    className="p-1 rounded hover:bg-[var(--surface-100)] text-[var(--surface-400)]"
                    title="Ações do encaminhamento"
                    aria-label={`Ações do encaminhamento ${numero}`}
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>
                  {aberto && (
                    <>
                      {/* Clique fora fecha. Fica ANTES do menu no DOM pra ficar atrás dele. */}
                      <div className="fixed inset-0 z-[55]" onClick={e => { e.stopPropagation(); setMenuViagem(null) }} />
                      <div className="absolute right-0 top-full mt-1 z-[56] min-w-[210px] rounded-lg border shadow-lg py-1" style={{ background: 'var(--surface-0)', borderColor: 'var(--surface-200)' }}>
                        <button
                          onClick={e => { e.stopPropagation(); if (supId) abrirEdicaoEncaminhamento(supId, numero) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--surface-700)] hover:bg-[var(--surface-100)] text-left"
                        >
                          <Pencil className="h-4 w-4 flex-shrink-0" />Editar encaminhamento
                        </button>
                        {/* Só na etapa Ativo: é de lá que a viagem parte. Fica por último
                            e em laranja — é a ação irreversível (§9.1). */}
                        {statusFiltro === 'ativo' && (
                          <button
                            onClick={e => { e.stopPropagation(); if (supId) abrirEnvioParaMatriz(supId, numero) }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] font-semibold text-orange-400 hover:bg-orange-950/30 text-left border-t"
                            style={{ borderColor: 'var(--surface-200)' }}
                          >
                            <Truck className="h-4 w-4 flex-shrink-0" />Enviar para Matriz
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            }

            // ─── DESKTOP: a viagem é uma FAIXA de largura cheia ─────────────────
            // Decisão do Lucas em 06/09/2026, revendo a tela: no desktop o grid de 2
            // colunas "não faz sentido" — a faixa ocupa o mesmo espaço de uma linha de
            // pet, e a leitura vertical da etapa continua igual à de sempre.
            const renderFaixaEncaminhamento = (numero: string, cs: Contrato[], aberto: boolean) => {
              const p = calcularPlacar(cs)
              const sup = cs.find(c => c.supinda)?.supinda
              // `min-h-[68px]` iguala a faixa à altura do card de pet (mesmo valor do
              // Skeleton da lista) — pedido do Lucas em 06/09: os dois tipos de item
              // ocupam o mesmo espaço, e a coluna fica com ritmo regular.
              return (
                <div className="rounded-lg border px-3 min-h-[68px] flex items-center gap-3" style={{ background: 'var(--surface-0)', borderColor: 'var(--surface-200)' }}>
                  <span className="text-[13px] font-black px-2 py-1 rounded flex-shrink-0" style={{ background: corUnidade, color: textoBadgeUnidade }}>{numero}</span>
                  <span className="flex items-center gap-1 text-[12px] text-[var(--surface-500)] flex-shrink-0">
                    <Calendar className="h-3.5 w-3.5" />{formatarDataViagem(sup?.data)}
                  </span>
                  <div className="flex items-center gap-4 text-[13px] tabular-nums flex-1 min-w-0">
                    <span className="flex items-center gap-1 text-[var(--surface-700)] font-semibold">
                      <PawPrint className="h-4 w-4" />{p.total} pet{p.total !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1 text-[var(--surface-500)]">
                      <Weight className="h-4 w-4" />{p.peso.toFixed(p.peso % 1 === 0 ? 0 : 1)} kg
                    </span>
                    {/* Ícone no lugar do rótulo pra caber na faixa; `title` preserva o
                        significado pra quem passar o mouse e pro leitor de tela. */}
                    <span className="flex items-center gap-1 font-semibold" title={`${p.comLacre} de ${p.total} com lacre`} style={{ color: corPlacar(p.comLacre === p.total) }}>
                      <Tag className="h-4 w-4" />{p.comLacre}/{p.total}
                    </span>
                    <span className="flex items-center gap-1 font-semibold" title={`${p.pagos} de ${p.total} pagos`} style={{ color: corPlacar(p.pagos === p.total) }}>
                      <DollarSign className="h-4 w-4" />{p.pagos}/{p.total}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">{chipsTipo(p)}</div>
                  {sup?.responsavel && (
                    <span className="hidden lg:flex items-center gap-1 text-[12px] text-[var(--surface-400)] truncate max-w-[150px] flex-shrink-0" title={sup.responsavel}>
                      <User className="h-3.5 w-3.5 flex-shrink-0" /><span className="truncate">{sup.responsavel}</span>
                    </span>
                  )}
                  {/* Menu de ações — separado do clique que abre os pets.
                      O §9.1 previa uma setinha "▾ ações"; ela virou este "⋯" porque a
                      setinha passou a significar "abrir os pets" quando a faixa ganhou
                      lista expansível. A intenção original se mantém: **ação
                      irreversível nunca fica visível por padrão**. */}
                  {menuEncaminhamento(numero, cs)}
                  <ChevronDown className={`h-5 w-5 flex-shrink-0 text-[var(--surface-400)] transition-transform ${aberto ? 'rotate-180' : ''}`} />
                </div>
              )
            }

            // ─── MOBILE: card resumido, 2 por linha ─────────────────────────────
            const renderCardEncMobile = (numero: string, cs: Contrato[]) => {
              const p = calcularPlacar(cs)
              const sup = cs.find(c => c.supinda)?.supinda
              return (
                <div className="rounded-lg border p-2.5" style={{ background: 'var(--surface-0)', borderColor: 'var(--surface-200)' }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-[12px] font-black px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: corUnidade, color: textoBadgeUnidade }}>{numero}</span>
                    <span className="flex items-center gap-0.5 text-[11px] text-[var(--surface-500)] truncate flex-1">
                      <Calendar className="h-3 w-3 flex-shrink-0" />{formatarDataViagem(sup?.data)}
                    </span>
                    {menuEncaminhamento(numero, cs)}
                  </div>
                  <div className="flex items-center gap-1 text-[16px] font-bold text-[var(--surface-700)] tabular-nums">
                    <PawPrint className="h-4 w-4" />{p.total} pet{p.total !== 1 ? 's' : ''}
                  </div>
                  <div className="flex items-center gap-1 text-[13px] font-semibold tabular-nums mt-0.5" style={{ color: corPlacar(p.pagos === p.total) }}>
                    <DollarSign className="h-3.5 w-3.5" />{p.pagos}/{p.total} pagos
                  </div>
                  <div className="flex flex-wrap items-center gap-1 mt-2">{chipsTipo(p)}</div>
                </div>
              )
            }

            // Pet em card resumido (mobile, dentro do grid). Informação mínima aprovada:
            // lacre · ícone · nome · IND/COL · peso · tutor. Toque abre o contrato, onde
            // tags, faróis e ações continuam todos disponíveis — nada some, só sai daqui.
            const renderPetResumidoMobile = (c: Contrato) => {
              const icone = getPetIcon(c.pet_especie, c.pet_peso)
              const col = c.tipo_cremacao === 'coletiva'
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    // Mesma precedência da /encaminhamentos: o long-press consome o
                    // toque (senão selecionar o pet abriria o contrato por cima), e com
                    // seleção ativa o toque passa a marcar/desmarcar em vez de navegar.
                    if (longPressDisparou.current) { longPressDisparou.current = false; return }
                    if (petsSelecionados.size > 0) {
                      setPetsSelecionados(prev => {
                        const n = new Set(prev)
                        if (n.has(c.id)) n.delete(c.id); else n.add(c.id)
                        return n
                      })
                      return
                    }
                    router.push(`/contratos/${c.id}`)
                  }}
                  className="rounded-lg border p-2.5 cursor-pointer active:opacity-70"
                  style={{ background: 'var(--surface-0)', borderColor: 'var(--surface-200)' }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {c.numero_lacre && (
                      <span className="flex items-center gap-0.5 text-[11px] font-mono font-bold text-[var(--surface-500)]">
                        <Tag className="h-3 w-3" />{c.numero_lacre}
                      </span>
                    )}
                    {/* O ícone do pet continua sendo o emoji de espécie/porte do card de
                        sempre (getPetIcon) — trocar por um traço Lucide perderia a
                        distinção cão/gato/exótico que o operador já lê de relance. */}
                    <span style={{ fontSize: 15 }}>{icone.emoji}</span>
                  </div>
                  <div className="text-[15px] font-bold text-[var(--surface-700)] truncate leading-tight">{c.pet_nome || 'sem nome'}</div>
                  <div className="flex items-center gap-0.5 text-[12px] font-semibold mt-0.5" style={{ color: col ? '#a78bfa' : '#6ee7b7' }}>
                    <Flame className="h-3 w-3" />{col ? 'COL' : 'IND'}{c.pet_peso ? ` · ${c.pet_peso}kg` : ''}
                  </div>
                  <div className="flex items-center gap-0.5 text-[12px] text-[var(--surface-400)] truncate mt-0.5">
                    <User className="h-3 w-3 flex-shrink-0" /><span className="truncate">{c.tutor?.nome || c.tutor_nome || ''}</span>
                  </div>
                </div>
              )
            }

            function renderSupindaGroup(lista: Contrato[], renderFn: (c: Contrato) => React.ReactNode) {
              // ─── PINDA no fluxo novo: cards soltos + linha do tempo (§3.2) ─────
              // Vem ANTES do early-return de `!deveAgruparSupinda` de propósito: Pinda
              // não agrupa por viagem no fluxo novo (a que levou já não importa; importa
              // o que está pronto pra buscar), então cairia no caminho sem agrupamento e
              // nunca chegaria aqui. Cada pet ganha a linha do tempo do GC embaixo do
              // card — a unidade SÓ OBSERVA; quem move isso é a Matriz.
              if (encPipeline && statusFiltro === 'pinda') {
                const ordenada = ordenacao === 'cep'
                  ? [...lista].sort((a, b) => prioridadeAcolhimento(a, b) || (ordemAsc ? deltaCep(a) - deltaCep(b) : deltaCep(b) - deltaCep(a)))
                  : [...lista].sort(prioridadeAcolhimento)

                // O Nicho é o que JÁ ESTÁ PRONTO pra buscar (`etapa='disponivel'`, que a
                // tela chama de "Finalizado"). O resto continua em andamento na Matriz e
                // aparece com a linha do tempo. §3.2: "se todos os pets estiverem
                // finalizados, só este card aparece" — sai daqui naturalmente, porque a
                // lista de em-andamento fica vazia.
                const noNicho = ordenada.filter(c => c.contrato_gc?.etapa === 'disponivel')
                const emAndamento = ordenada.filter(c => c.contrato_gc?.etapa !== 'disponivel')
                return (
                  <div className="space-y-2">
                    {emAndamento.map(c => (
                      <div key={c.id}>
                        {renderFn(c)}
                        {c.contrato_gc && (
                          <div className="mt-1 px-3 py-2 rounded-lg border" style={{ background: 'var(--surface-0)', borderColor: 'var(--surface-200)' }}>
                            {renderLinhaDoTempoGC(c)}
                          </div>
                        )}
                      </div>
                    ))}
                    {/* Card do Nicho — sempre no FIM, mesmo vazio (§3.2: "sempre visível"):
                        é o lugar fixo onde a unidade vai buscar o que está pronto. */}
                    {renderCardNicho(noNicho, renderFn)}
                  </div>
                )
              }

              if (!deveAgruparSupinda) {
                // CEP é ordenação client-side (o servidor não calcula delta) —
                // aplicar também no caminho SEM agrupamento por encaminhamento
                const listaOrdenada = ordenacao === 'cep'
                  ? [...lista].sort((a, b) => prioridadeAcolhimento(a, b) || (ordemAsc ? deltaCep(a) - deltaCep(b) : deltaCep(b) - deltaCep(a)))
                  : [...lista].sort(prioridadeAcolhimento)
                return <div className="space-y-2">{listaOrdenada.map(renderFn)}</div>
              }
              // Agrupar por numero da supinda
              const grupos: { numero: string | null; contratos: Contrato[] }[] = []
              const mapaGrupos = new Map<string | null, Contrato[]>()
              for (const c of lista) {
                const num = c.supinda?.numero ?? null
                if (!mapaGrupos.has(num)) {
                  const arr: Contrato[] = []
                  mapaGrupos.set(num, arr)
                  grupos.push({ numero: num, contratos: arr })
                }
                mapaGrupos.get(num)!.push(c)
              }
              // Helper: data efetiva = data_acolhimento ?? data_contrato (em ms, 0 se vazio)
              const dataEfetiva = (c: Contrato): number => {
                const d = c.data_acolhimento || c.data_contrato
                return d ? new Date(d).getTime() : 0
              }

              // Re-ordena contratos DENTRO de cada grupo pelo critério escolhido (com fallback p/ data_contrato)
              for (const g of grupos) {
                if (ordenacao === 'data') {
                  g.contratos.sort((a, b) => prioridadeAcolhimento(a, b) || (ordemAsc ? dataEfetiva(a) - dataEfetiva(b) : dataEfetiva(b) - dataEfetiva(a)))
                } else if (ordenacao === 'nome') {
                  g.contratos.sort((a, b) => {
                    const na = (a.pet_nome || '').toLowerCase()
                    const nb = (b.pet_nome || '').toLowerCase()
                    return prioridadeAcolhimento(a, b) || (ordemAsc ? na.localeCompare(nb) : nb.localeCompare(na))
                  })
                } else if (ordenacao === 'cep') {
                  // asc = mais perto da unidade primeiro; sem CEP válido vai pro fim
                  g.contratos.sort((a, b) => prioridadeAcolhimento(a, b) || (ordemAsc ? deltaCep(a) - deltaCep(b) : deltaCep(b) - deltaCep(a)))
                }
              }

              // Ordenar GRUPOS pelo NÚMERO da supinda (estável, previsível),
              // respeitando a direção asc/desc da ordenação primária.
              // "Sem encaminhamento" sempre primeiro.
              // Os pets DENTRO do grupo continuam ordenados por data/nome (lógica acima).
              grupos.sort((a, b) => {
                if (a.numero === null && b.numero === null) return 0
                if (a.numero === null) return -1
                if (b.numero === null) return 1
                const numA = parseInt(a.numero.replace(/^[A-Z]+/, ''), 10) || 0
                const numB = parseInt(b.numero.replace(/^[A-Z]+/, ''), 10) || 0
                return ordemAsc ? numA - numB : numB - numA
              })

              // ─── FLUXO NOVO: grid de cards, um por viagem (§3.1) ───────────────
              // O separador-linha vira CARD com placar. Clicar abre os pets do grupo —
              // o card resume, mas nada fica inacessível.
              if (encPipeline) {
                const alternar = (numero: string) => setEncAbertos(prev => {
                  const n = new Set(prev)
                  if (n.has(numero)) n.delete(numero); else n.add(numero)
                  return n
                })
                // Dica do gesto, entre o último pet solto e a primeira viagem. Só aparece
                // quando as duas coisas existem na tela: sem pet solto não há o que
                // arrastar, sem viagem não há destino — e instrução que não cabe no
                // momento vira ruído que o operador aprende a ignorar.
                const idxPrimeiraViagem = grupos.findIndex(g => g.numero !== null)
                const mostrarDica = idxPrimeiraViagem > 0 && grupos.some(g => g.numero === null && g.contratos.length > 0)
                const dicaGesto = (Icone: typeof Move, texto: string) => (
                  <div className="flex items-center gap-2 py-1.5">
                    <div className="flex-1 h-px bg-[var(--surface-200)]" />
                    <span className="flex items-center gap-1.5 text-[12px] text-[var(--surface-400)] text-center px-1">
                      <Icone className="h-4 w-4 flex-shrink-0" />{texto}
                    </span>
                    <div className="flex-1 h-px bg-[var(--surface-200)]" />
                  </div>
                )
                // id da supinda do grupo — vem do embed dos contratos dele.
                const supindaIdDoGrupo = (cs: Contrato[]) => cs.find(c => c.supinda)?.supinda?.id || null

                // Props da FAIXA/CARD da viagem: abre/fecha no clique, recebe o pet
                // arrastado (desktop) ou os selecionados por long-press (mobile).
                const propsViagem = (numero: string, cs: Contrato[]) => {
                  const supId = supindaIdDoGrupo(cs)
                  const temSelecao = petsSelecionados.size > 0
                  return {
                    role: 'button',
                    tabIndex: 0,
                    onClick: () => {
                      // Com seleção ativa no celular, tocar na viagem INCLUI em vez de
                      // abrir — é o segundo tempo do gesto "segure e toque".
                      if (temSelecao && supId) { vincularAoEncaminhamento([...petsSelecionados], supId); return }
                      alternar(numero)
                    },
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(numero) }
                    },
                    onDragOver: (e: React.DragEvent) => { if (petArrastando) { e.preventDefault(); setEncAlvo(numero) } },
                    onDragLeave: () => setEncAlvo(a => (a === numero ? null : a)),
                    onDrop: (e: React.DragEvent) => {
                      e.preventDefault()
                      const id = petArrastando || e.dataTransfer.getData('text/plain')
                      if (id && supId) vincularAoEncaminhamento([id], supId)
                    },
                    className: `cursor-pointer transition-all rounded-lg ${encAlvo === numero ? 'ring-2 scale-[1.01]' : 'hover:opacity-90'}`,
                    style: encAlvo === numero ? { ['--tw-ring-color' as string]: corUnidade } : undefined,
                  }
                }

                // ⚠️ Os dois gestos são SEPARADOS de propósito. Se o mesmo wrapper tivesse
                // drag e long-press juntos, no desktop segurar o botão antes de começar a
                // arrastar (o que é o movimento natural) selecionaria o pet sem querer.
                // Desktop = arrastar. Mobile = segurar e tocar. Cada um no seu layout.
                const propsPetArrastavel = (c: Contrato) => ({
                  draggable: true,
                  onDragStart: (e: React.DragEvent) => {
                    setPetArrastando(c.id)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', c.id)
                  },
                  onDragEnd: () => { setPetArrastando(null); setEncAlvo(null) },
                  className: `rounded-lg transition-opacity cursor-grab active:cursor-grabbing ${petArrastando === c.id ? 'opacity-40' : ''}`,
                })
                const propsPetSelecionavel = (c: Contrato) => ({
                  onPointerDown: () => iniciarLongPress(c.id),
                  onPointerUp: cancelarLongPress,
                  onPointerLeave: cancelarLongPress,
                  onPointerCancel: cancelarLongPress,
                  className: `rounded-lg transition-all ${petsSelecionados.has(c.id) ? 'ring-2' : ''}`,
                  style: petsSelecionados.has(c.id) ? { ['--tw-ring-color' as string]: corUnidade } : undefined,
                })
                return (
                  <>
                    {/* DESKTOP — leitura vertical de sempre: faixa da viagem e card de pet
                        ocupam a mesma largura, um por linha. */}
                    <div className="hidden md:block space-y-2">
                      {grupos.map((grupo, i) => {
                        if (grupo.numero === null) {
                          return grupo.contratos.map(c => (
                            <div key={c.id} {...propsPetArrastavel(c)}>{renderFn(c)}</div>
                          ))
                        }
                        const aberto = encAbertos.has(grupo.numero)
                        return (
                          <Fragment key={grupo.numero}>
                            {mostrarDica && i === idxPrimeiraViagem && dicaGesto(Move, 'Para encaminhar um pet, arraste o card dele até uma das viagens abaixo')}
                            <div className="space-y-2">
                              <div {...propsViagem(grupo.numero, grupo.contratos)}>
                                {renderFaixaEncaminhamento(grupo.numero, grupo.contratos, aberto)}
                              </div>
                              {aberto && (
                                <div className="space-y-2 pl-3 border-l-2" style={{ borderColor: corUnidade }}>
                                  {grupo.contratos.map(renderFn)}
                                </div>
                              )}
                            </div>
                          </Fragment>
                        )
                      })}
                    </div>

                    {/* MOBILE — grid de 2 colunas, tudo resumido. Ao abrir, a viagem toma
                        as duas colunas e os pets dela viram um sub-grid de 2. */}
                    <div className="md:hidden grid grid-cols-2 gap-2 items-start">
                      {grupos.map((grupo, i) => {
                        if (grupo.numero === null) {
                          return grupo.contratos.map(c => (
                            <div key={c.id} {...propsPetSelecionavel(c)}>{renderPetResumidoMobile(c)}</div>
                          ))
                        }
                        const aberto = encAbertos.has(grupo.numero)
                        return (
                          <Fragment key={grupo.numero}>
                            {/* No celular o gesto é outro: segurar e tocar no destino, o
                                mesmo long-press de 500 ms que a /encaminhamentos já usa. */}
                            {mostrarDica && i === idxPrimeiraViagem && (
                              <div className="col-span-2">{dicaGesto(Hand, 'Para encaminhar um pet, segure o card dele e toque na viagem')}</div>
                            )}
                            <div className={aberto ? 'col-span-2 space-y-2' : ''}>
                              <div {...propsViagem(grupo.numero, grupo.contratos)}>
                                {renderCardEncMobile(grupo.numero, grupo.contratos)}
                              </div>
                              {aberto && (
                                <div className="grid grid-cols-2 gap-2 items-start pl-2 border-l-2" style={{ borderColor: corUnidade }}>
                                  {grupo.contratos.map(renderPetResumidoMobile)}
                                </div>
                              )}
                            </div>
                          </Fragment>
                        )
                      })}
                    </div>
                  </>
                )
              }

              return (
                <div className="space-y-1">
                  {grupos.map((grupo) => (
                    <div key={grupo.numero ?? 'sem'}>
                      {/* Separador visual da supinda */}
                      {(() => {
                        const corPrimaria = grupo.numero !== null ? '#65a30d' : '#dc2626'
                        const corSecundaria = grupo.numero !== null ? '#84cc16' : '#ef4444'
                        const corTexto = grupo.numero !== null ? '#1a2e05' : 'white'
                        return (
                          <div className="flex items-center gap-2 py-1.5 px-1">
                            <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, transparent 0%, ${corPrimaria} 30%, ${corPrimaria} 70%, transparent 100%)` }} />
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{
                              background: `linear-gradient(135deg, ${corPrimaria} 0%, ${corSecundaria} 100%)`,
                              color: corTexto,
                            }}>
                              {grupo.numero !== null ? `Encaminhamento #${grupo.numero}` : 'Sem encaminhamento'}
                            </span>
                            <span className="text-[10px] text-slate-400 flex-shrink-0">{grupo.contratos.length} pet{grupo.contratos.length !== 1 ? 's' : ''}</span>
                            <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${corPrimaria} 0%, ${corPrimaria} 30%, transparent 70%, transparent 100%)` }} />
                          </div>
                        )
                      })()}
                      <div className="space-y-2">
                        {grupo.contratos.map(renderFn)}
                      </div>
                    </div>
                  ))}
                </div>
              )
            }

            // Função para renderizar um card de contrato
            const renderContrato = (contrato: Contrato) => {
              const dataBox = getDataBox(contrato.data_acolhimento)
              const petIcon = getPetIcon(contrato.pet_especie, contrato.pet_peso)
              const statusColors = STATUS_COLORS[contrato.status]

              // Ativação de Preventivo atribuída, aguardando conclusão (mig 138) — card
              // travado: nada de navegar pro detalhe (as tratativas ainda não existem de
              // verdade), só o essencial + "Finalizar" ali mesmo. Reaproveita os MESMOS
              // indicadores do card normal (peso, fonte de conhecimento, local de remoção,
              // cor por IND/COL) — pedido do Lucas: não é "faltando dado", é "bloqueado
              // de propósito", então o clock roxo substitui só o quadradinho da data.
              if (contrato.aguardando_acolhimento) {
                const isInd = contrato.tipo_cremacao === 'individual'
                const { primeiro, resto } = separarPrimeiroNome(contrato.tutor?.nome || contrato.tutor_nome)
                return (
                  <div
                    key={contrato.id}
                    data-contrato-id={contrato.id}
                    className="rounded-lg border-2 border-dashed shadow-sm opacity-90"
                    style={{
                      background: isInd
                        ? 'linear-gradient(135deg, #10b981 0%, #6ee7b7 30%, transparent 70%)'
                        : 'linear-gradient(135deg, #8b5cf6 0%, #c4b5fd 30%, transparent 70%)',
                      borderColor: isInd ? '#10b981' : '#8b5cf6',
                    }}
                  >
                    <div className="p-1.5 flex items-center gap-2 flex-wrap">
                      {/* Slot da data — clock roxo no lugar do pulsante amarelo: aqui não é
                          "faltando", é "bloqueado até concluir o acolhimento". */}
                      <div className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-xl bg-violet-900/40 text-violet-300" title="Aguardando conclusão do acolhimento">
                        🕐
                      </div>

                      {/* Ícone do Pet — mesmo padrão do card normal */}
                      <div className="flex-shrink-0 w-11 h-11 rounded-lg flex flex-col items-center justify-end p-0 pb-0.5 overflow-hidden" style={petIcon.style}>
                        <span className="leading-none" style={{ fontSize: petIcon.emojiSize }}>{petIcon.emoji}</span>
                        <span className="text-[7px] font-bold leading-none flex items-center gap-px">{getPetPorte(contrato.pet_peso) && <span className="font-black mr-0.5">{getPetPorte(contrato.pet_peso)}</span>}{contrato.pet_peso ? <><Weight className="h-2 w-2" />{contrato.pet_peso}</> : '-'}</span>
                      </div>

                      {/* Fonte de conhecimento */}
                      {contrato.fonte_conhecimento?.nome && (() => {
                        const isOutro = contrato.fonte_conhecimento.nome === 'Outro' && !!contrato.fonte_outro_especificar
                        const titleText = contrato.seguradora
                          ? `${contrato.fonte_conhecimento.nome}: ${contrato.seguradora}`
                          : isOutro
                            ? `Outro: ${contrato.fonte_outro_especificar}`
                            : contrato.fonte_conhecimento.nome
                        return (
                          <div
                            className="flex-shrink-0 w-10 h-10 rounded-lg flex flex-col items-center justify-center"
                            style={FONTE_ICONS[contrato.fonte_conhecimento.nome]?.style || { background: 'linear-gradient(135deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', border: '1px solid #cbd5e1', color: '#64748b' }}
                            title={titleText}
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
                        )
                      })()}

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

                      {/* Info principal */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-bold" style={{ background: 'linear-gradient(90deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', color: contrato.pet_genero === 'macho' ? '#1d4ed8' : '#db2777', padding: '1px 6px', borderRadius: '4px' }}>
                            {contrato.pet_nome}
                            {contrato.pet_genero && <span style={{ marginLeft: '3px', fontSize: '0.8rem' }}>{contrato.pet_genero === 'macho' ? '♂' : '♀'}</span>}
                          </span>
                          {(contrato.pet_raca || contrato.pet_cor) && (
                            <span className="text-xs font-medium" style={{ background: 'linear-gradient(90deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', color: '#475569', padding: '1px 5px', borderRadius: '4px' }}>{[contrato.pet_raca, contrato.pet_cor].filter(Boolean).join(' | ')}</span>
                          )}
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isInd ? 'bg-emerald-500 text-white' : 'bg-violet-500 text-white'}`}>
                            {isInd ? 'IND' : 'COL'}
                          </span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-700 whitespace-nowrap">
                            🕐 Em Acolhimento
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs mt-0.5">
                          <span style={{ background: 'linear-gradient(90deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', padding: '1px 5px', borderRadius: '4px' }}>
                            <span className="font-bold" style={{ color: '#6d28d9' }}>{primeiro}</span>
                            {resto && <span className="font-normal" style={{ color: '#475569' }}> {resto}</span>}
                          </span>
                        </div>
                        <p className="text-[11px] mt-1" style={{ color: '#475569' }}>
                          Dados de tratativas serão abertos após finalização do acolhimento
                        </p>
                      </div>

                      <button
                        onClick={() => abrirFinalizarAtivacaoPV(contrato)}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
                        title={`Pet Acolhido — finalizar ${contrato.tipo_plano === 'preventivo' ? 'Ativação de Preventivo' : 'Acolhimento'}`}
                      >
                        <span>📋</span>
                        <span className="hidden sm:inline">Pet Acolhido</span>
                      </button>
                    </div>
                  </div>
                )
              }

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
                    {/* Coluna de ações: [DocMenu] sempre (exceto preventivo) + [Checkbox] em retorno/pendente */}
                    {contrato.status !== 'preventivo' && (
                      <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        <DocMenu
                          contratoId={contrato.id}
                          onEditarContrato={() => setEditarContratoId(contrato.id)}
                          onImprimirContrato={() => gerarContratoCardPdf(contrato)}
                          onEditarFicha={() => editarFichaCard(contrato)}
                          onImprimirFicha={() => gerarFichaCard(contrato)}
                          onProtocolo={() => abrirProtocoloModal(contrato)}
                          loading={gerandoContratoId === contrato.id || fichaParaCapturar?.id === contrato.id}
                        />
                      </div>
                    )}

                    {/* Data — quadradinho amarelo pulsante "Sem data acolh." quando ausente */}
                    {dataBox ? (
                      <div className="flex-shrink-0 w-12 h-12 rounded-lg flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', color: '#334155' }}>
                        <span className="text-[10px] font-bold leading-none">{dataBox.linha1}</span>
                        <span className="text-[10px] leading-tight" style={{ color: '#94a3b8' }}>{dataBox.linha2}</span>
                        <span className="text-[9px] leading-none" style={{ color: '#64748b' }}>{dataBox.hora}</span>
                      </div>
                    ) : (
                      <div className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-center animate-pulse px-1" style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #fde68a 50%, #fbbf24 100%)', color: '#78350f' }} title="Pet ainda não foi acolhido">
                        <span className="text-[9px] font-bold leading-tight">Sem data acolh.</span>
                      </div>
                    )}

                    {/* Ícone do Pet */}
                    <div className="flex-shrink-0 w-11 h-11 rounded-lg flex flex-col items-center justify-end p-0 pb-0.5 overflow-hidden" style={petIcon.style}>
                      <span className="leading-none" style={{ fontSize: petIcon.emojiSize }}>{petIcon.emoji}</span>
                      <span className="text-[7px] font-bold leading-none flex items-center gap-px">{getPetPorte(contrato.pet_peso) && <span className="font-black mr-0.5">{getPetPorte(contrato.pet_peso)}</span>}{contrato.pet_peso ? <><Weight className="h-2 w-2" />{contrato.pet_peso}</> : '-'}</span>
                    </div>

                    {/* Fonte de conhecimento */}
                    {contrato.fonte_conhecimento?.nome && (() => {
                      const isOutro = contrato.fonte_conhecimento.nome === 'Outro' && !!contrato.fonte_outro_especificar
                      const titleText = contrato.seguradora
                        ? `${contrato.fonte_conhecimento.nome}: ${contrato.seguradora}`
                        : isOutro
                          ? `Outro: ${contrato.fonte_outro_especificar}`
                          : contrato.fonte_conhecimento.nome
                      return (
                        <div
                          className="flex-shrink-0 w-10 h-10 rounded-lg flex flex-col items-center justify-center"
                          style={FONTE_ICONS[contrato.fonte_conhecimento.nome]?.style || { background: 'linear-gradient(135deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', border: '1px solid #cbd5e1', color: '#64748b' }}
                          title={titleText}
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
                      )
                    })()}

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
                      contrato={{ ...contrato, indicacaoFonteId }}
                      handlers={{
                        pelinho: () => abrirPelinhoModal(contrato),
                        urna: () => abrirUrnaModal(contrato),
                        certificado: () => abrirCertificadoModal(contrato),
                        rescaldo: () => abrirRescaldoModal(contrato),
                        indicacao: () => abrirIndicacaoModal(contrato),
                      }}
                      layout="pipeline-desktop-green"
                    />

                    {/* Info principal */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {renderLacreCell(contrato, 'desktop')}
                        <Link href={`/contratos/${contrato.id}`} className="hover:opacity-80">
                          <span className="text-base font-bold" style={{ background: 'linear-gradient(90deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', color: contrato.pet_genero === 'macho' ? '#1d4ed8' : '#db2777', padding: '1px 6px', borderRadius: '4px' }}>
                            {contrato.pet_nome}
                            {contrato.pet_genero && <span style={{ marginLeft: '3px', fontSize: '0.8rem' }}>{contrato.pet_genero === 'macho' ? '♂' : '♀'}</span>}
                          </span>
                        </Link>
                        {renderBadgesCompartilhamento(contrato)}
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
                        {renderGCStatusBadges(contrato)}
                      </div>
                    </div>

                    {/* === TAGS PENDENTES (à direita das infos) === */}
                    <InteractiveTags
                      contrato={{ ...contrato, indicacaoFonteId }}
                      handlers={{
                        pelinho: () => abrirPelinhoModal(contrato),
                        urna: () => abrirUrnaModal(contrato),
                        certificado: () => abrirCertificadoModal(contrato),
                        foto: () => abrirFotoModal(contrato),
                        pagamento: () => abrirMegaPagamentoModal(contrato),
                        rescaldo: () => abrirRescaldoModal(contrato),
                        indicacao: () => abrirIndicacaoModal(contrato),
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

                      {/* Botão Compartilhar — removido do pipeline, disponível no contrato [id] */}

                      {/* Action Buttons — Mensagens Personalizadas (FLS: btn_mensagens) */}
                      {isVisible(T, 'btn_mensagens') && (
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
                      )}

                      {/* Botões Alteração Fase + Complexidade */}
                      <div className="flex flex-col items-end gap-1">
                        {isVisible(T, 'btn_alteracao_fase') && (
                        <div className="flex items-center gap-1">
                          {/* Botão Ativar - só para preventivo. Contrato com Ativação de
                              Preventivo já atribuída (mig 138) nem chega aqui — vira status
                              ativo/pinda na hora e cai no card travado (ver início de
                              renderContrato), então esse botão não precisa mais se preocupar
                              com isso. */}
                          {contrato.status === 'preventivo' && (
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirAtivarModal(contrato) }}
                              className="flex items-center justify-center w-9 h-9 bg-red-900 text-white rounded-full hover:bg-red-800 transition-colors"
                              title="Ativar contrato preventivo"
                            >
                              <span className="text-base">✝️</span>
                            </button>
                          )}
                          {/* Botão Bypass - finalizar pulando etapas (FLS: btn_bypass) */}
                          {['ativo', 'pinda'].includes(contrato.status) && isVisible(T, 'btn_bypass') && (
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBypassContrato(contrato); setBypassDataCremacao(''); setBypassDataEntrega('') }}
                              className="flex items-center justify-center w-9 h-9 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors text-xs font-black"
                              title="Bypass — finalizar pulando etapas"
                            >
                              B
                            </button>
                          )}
                          {/* Botão Marcar Pendente - para retorno */}
                          {contrato.status === 'retorno' && (
                            <button
                              onClick={async (e) => {
                                e.preventDefault(); e.stopPropagation()
                                if (!confirm(`Marcar ${contrato.pet_nome} como pendente?`)) return
                                const supabaseLocal = createClient()
                                await supabaseLocal.from('contratos').update({ status: 'pendente' } as never).eq('id', contrato.id)
                                carregarContratos()
                              }}
                              className="flex items-center justify-center w-9 h-9 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors"
                              title="Marcar como pendente"
                            >
                              <span className="text-base">⏳</span>
                            </button>
                          )}
                          {/* Botão Marcar Entregue + checkbox de seleção em lote (retorno/pendente) */}
                          {(contrato.status === 'retorno' || contrato.status === 'pendente') && (
                            <>
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirEntregaModal(contrato) }}
                                className="flex items-center justify-center w-9 h-9 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 transition-colors"
                                title="Marcar entregue e finalizar"
                              >
                                <span className="text-base">📬</span>
                              </button>
                              {/* Hit-area expandida pra reduzir clique acidental no card */}
                              <div
                                onClick={(e) => toggleSelectEntrega(contrato.id, e)}
                                className="p-2 -m-2 cursor-pointer rounded-md hover:bg-emerald-500/15 transition-colors"
                                title="Selecionar para registrar entrega em lote"
                              >
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                  selectedEntregas.has(contrato.id)
                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                    : 'border-emerald-500/60'
                                }`}>
                                  {selectedEntregas.has(contrato.id) && (
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                        )}
                        {/* Indicador de complexidade desativado por enquanto — lógica preservada em getComplexidadeMontagem() */}
                        {false && contrato.status === 'retorno' && isVisible(T, 'btn_fluxo_retorno') && (() => {
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
                      {/* Coluna de ações: [DocMenu] sempre (exceto preventivo) + [Checkbox] em retorno/pendente */}
                      {contrato.status !== 'preventivo' && (
                        <div className="flex-shrink-0 flex flex-col items-center justify-center gap-1">
                          <DocMenu
                            contratoId={contrato.id}
                            onEditarContrato={() => setEditarContratoId(contrato.id)}
                            onImprimirContrato={() => gerarContratoCardPdf(contrato)}
                            onEditarFicha={() => editarFichaCard(contrato)}
                            onImprimirFicha={() => gerarFichaCard(contrato)}
                            onProtocolo={() => abrirProtocoloModal(contrato)}
                            loading={gerandoContratoId === contrato.id || fichaParaCapturar?.id === contrato.id}
                          />
                        </div>
                      )}
                      {/* Data box (ocupa 2 linhas, à esquerda) — quadradinho amarelo pulsante "Sem data acolh." quando ausente */}
                      {dataBox ? (
                        <div className="flex-shrink-0 w-11 rounded-md flex flex-col items-center justify-center p-0" style={{ background: 'linear-gradient(135deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', color: '#334155', gap: '1px' }}>
                          <span className="text-[11px] font-bold leading-none">{dataBox.linha1}</span>
                          <span className="text-[11px] leading-none" style={{ color: '#94a3b8' }}>{dataBox.linha2}</span>
                          <span className="text-[10px] leading-none" style={{ color: '#64748b' }}>{dataBox.hora}</span>
                        </div>
                      ) : (
                        <div className="flex-shrink-0 w-11 rounded-md flex items-center justify-center text-center animate-pulse px-1 py-1" style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #fde68a 50%, #fbbf24 100%)', color: '#78350f' }} title="Pet ainda não foi acolhido">
                          <span className="text-[9px] font-bold leading-tight">Sem data acolh.</span>
                        </div>
                      )}
                      {/* Coluna: Lacre+Fonte+Local+IND / Tutor */}
                      <div className="min-w-0 flex flex-col justify-center gap-1 flex-1">
                        {/* Linha 1: Lacre + Fonte + Local + IND/COL */}
                        <div className="h-6 flex items-center gap-1">
                          {renderLacreCell(contrato, 'mobile')}
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
                        <div className="h-6 flex items-center min-w-0 gap-1">
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
                        {renderBadgesCompartilhamento(contrato)}
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
                      contrato={{ ...contrato, indicacaoFonteId }}
                      handlers={{
                        pelinho: () => abrirPelinhoModal(contrato),
                        urna: () => abrirUrnaModal(contrato),
                        certificado: () => abrirCertificadoModal(contrato),
                        rescaldo: () => abrirRescaldoModal(contrato),
                        indicacao: () => abrirIndicacaoModal(contrato),
                      }}
                      layout="pipeline-mobile-green"
                    />

                    {/* Linha 4: Tags pendentes + status + expand — boxes grandes (+30%) */}
                    <div className="flex items-center gap-1.5">
                      <InteractiveTags
                        contrato={{ ...contrato, indicacaoFonteId }}
                        handlers={{
                          pelinho: () => abrirPelinhoModal(contrato),
                          urna: () => abrirUrnaModal(contrato),
                          certificado: () => abrirCertificadoModal(contrato),
                          foto: () => abrirFotoModal(contrato),
                          pagamento: () => abrirMegaPagamentoModal(contrato),
                          rescaldo: () => abrirRescaldoModal(contrato),
                          indicacao: () => abrirIndicacaoModal(contrato),
                        }}
                        layout="pipeline-mobile-pending"
                      />
                      <div className="flex-1" />
                      {/* Status Badge compacto (mobile) — desativado por enquanto */}
                      {false && contrato.status === 'retorno' && (() => {
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
                      {/* Status GC compacto (estilo /gc mobile) — só em pinda, à esquerda do WhatsApp */}
                      {renderGCStatusCompacto(contrato)}
                      {/* WhatsApp sempre visível (não precisa expandir) */}
                      {(contrato.tutor?.telefone || contrato.tutor_telefone) && (
                        <a
                          href={`https://wa.me/${(contrato.tutor?.telefone || contrato.tutor_telefone || '').replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 flex items-center justify-center w-8 h-8 bg-[#25D366] text-white rounded-full hover:bg-[#128C7E] transition-colors"
                          title={formatarTelefone(contrato.tutor?.telefone || contrato.tutor_telefone)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                        </a>
                      )}
                      {/* Pendente + Entregar+checkbox sempre visíveis (fora da bandeja) — retorno/pendente */}
                      {isVisible(T, 'btn_alteracao_fase') && (<>
                        {contrato.status === 'retorno' && (
                          <button
                            onClick={async (e) => {
                              e.preventDefault(); e.stopPropagation()
                              if (!confirm(`Marcar ${contrato.pet_nome} como pendente?`)) return
                              const supabaseLocal = createClient()
                              await supabaseLocal.from('contratos').update({ status: 'pendente' } as never).eq('id', contrato.id)
                              carregarContratos()
                            }}
                            className="flex-shrink-0 flex items-center justify-center w-8 h-8 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors"
                            title="Marcar como pendente"
                          >
                            <span className="text-sm">⏳</span>
                          </button>
                        )}
                        {(contrato.status === 'retorno' || contrato.status === 'pendente') && (
                          <>
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirEntregaModal(contrato) }}
                              className="flex-shrink-0 flex items-center justify-center w-8 h-8 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 transition-colors"
                              title="Marcar entregue"
                            >
                              <span className="text-sm">📬</span>
                            </button>
                            <div
                              onClick={(e) => toggleSelectEntrega(contrato.id, e)}
                              className="p-2 -m-2 cursor-pointer rounded-md hover:bg-emerald-500/15 transition-colors flex-shrink-0"
                              title="Selecionar para registrar entrega em lote"
                            >
                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                selectedEntregas.has(contrato.id)
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'border-emerald-500/60'
                              }`}>
                                {selectedEntregas.has(contrato.id) && (
                                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </>)}
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
                        {/* Mensagens Personalizadas (FLS: btn_mensagens) */}
                        {isVisible(T, 'btn_mensagens') && (
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
                        )}
                        <div className="flex-1" />
                        {/* Botões Alteração Fase (FLS: btn_alteracao_fase) */}
                        {isVisible(T, 'btn_alteracao_fase') && (<>
                          {contrato.status === 'preventivo' && (
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirAtivarModal(contrato) }}
                              className="flex items-center justify-center w-8 h-8 bg-red-900 text-white rounded-full hover:bg-red-800 transition-colors"
                              title="Ativar"
                            >
                              <span className="text-sm">✝️</span>
                            </button>
                          )}
                          {/* Botão Bypass mobile (FLS: btn_bypass) */}
                          {['ativo', 'pinda'].includes(contrato.status) && isVisible(T, 'btn_bypass') && (
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBypassContrato(contrato); setBypassDataCremacao(''); setBypassDataEntrega('') }}
                              className="flex items-center justify-center w-8 h-8 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors text-xs font-black"
                              title="Bypass — finalizar pulando etapas"
                            >
                              B
                            </button>
                          )}
                        </>)}
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
                          <div className="bg-amber-900/30 p-2 rounded-b-md">
                            {renderSupindaGroup(contratosPorBairro[bairro], renderContrato)}
                          </div>
                        </div>
                      ))
                    })()
                  ) : (
                    // Sem sub-agrupamento por bairro
                    renderSupindaGroup(contratosAgrupados[cidade], renderContrato)
                  )}
                </div>
              </div>
            ))
          })()
        )}
      </div>
      )}

      {/* Scroll infinito: sentinel dispara próxima página automaticamente */}
      {contratos.length < total && !buscaDebounced.trim() && (
        <div ref={sentinelRef} className="py-6 text-center text-xs text-[var(--surface-400)]">
          {carregandoMais ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando mais...
            </span>
          ) : (
            <span>{total - contratos.length} restantes</span>
          )}
        </div>
      )}

      {/* Trazer da Matriz (§9.5). Fraseologia aprovada nos mockups — não reescrever. */}
      <Modal
        isOpen={trazerAberto}
        onClose={() => { if (!trazendo) setTrazerAberto(false) }}
        title={`Trazer ${trazerPets.length} pet${trazerPets.length !== 1 ? 's' : ''} da Matriz`}
        size="xl"
        footer={
          <div className="flex items-center gap-2 w-full">
            <span className="flex-1 text-[11px] text-[var(--surface-400)]">
              Marque &quot;presencial&quot; para finalizar o pet pulando a etapa &quot;Entrega&quot;.
            </span>
            <button
              onClick={() => setTrazerAberto(false)}
              disabled={trazendo}
              className="px-3 py-2 rounded-lg text-[13px] font-semibold text-[var(--surface-500)] hover:bg-[var(--surface-100)] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={finalizarVolta}
              disabled={trazendo || trazerCarregando || trazerPets.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
            >
              {trazendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              Finalizar Volta
            </button>
          </div>
        }
      >
        {trazerCarregando ? (
          <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline-block text-[var(--surface-400)]" /></div>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] text-[var(--surface-500)]">Seguem para o status Entrega</p>

            {/* Linha do lote */}
            {(() => {
              const sug = sugestaoDataVolta(trazerPets)
              const aplicar = (d: string) => setTrazerDatas(prev => {
                const n = { ...prev }
                for (const p of trazerPets) n[p.id] = d
                return n
              })
              return (
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--surface-100)' }}>
                  <span className="text-[12px] font-semibold text-[var(--surface-600)]">Inserir mesma data de volta para todos:</span>
                  {sug.rotulo && (
                    <button
                      onClick={() => aplicar(sug.data)}
                      className="px-2.5 py-1 rounded-lg text-[12px] font-semibold bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/50"
                    >
                      {sug.rotulo}
                    </button>
                  )}
                  <label className="flex items-center gap-1.5 text-[12px] text-[var(--surface-500)]">
                    Outra data…
                    <input
                      type="date"
                      onChange={e => { if (e.target.value) aplicar(e.target.value) }}
                      className="px-2 py-1 rounded border text-[12px]"
                      style={{ background: 'var(--surface-0)', borderColor: 'var(--surface-200)', color: 'var(--surface-700)' }}
                    />
                  </label>
                </div>
              )
            })()}

            {/* Cabeçalho + lista. Uma linha por pet, sem quebra (mobile + 40 pets da SP). */}
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--surface-200)' }}>
              <div className="flex items-center gap-2 px-2.5 py-1.5 text-[10px] font-semibold uppercase text-[var(--surface-400)]" style={{ background: 'var(--surface-100)' }}>
                <span className="flex-1">Pet</span>
                <span className="w-[120px] text-right flex-shrink-0">Data de volta da Matriz</span>
              </div>
              <div className="max-h-[45vh] overflow-y-auto divide-y" style={{ borderColor: 'var(--surface-200)' }}>
                {trazerPets.map(p => {
                  const presencial = trazerPresencial.has(p.id)
                  const coletiva = p.tipo_cremacao === 'coletiva'
                  return (
                    <div key={p.id} className="flex items-center gap-2 px-2.5 py-2 text-[12px] whitespace-nowrap">
                      <span className="font-mono text-[10px] text-[var(--surface-400)] w-10 flex-shrink-0">{p.numero_lacre || '—'}</span>
                      <span className="font-semibold w-8 flex-shrink-0" style={{ color: coletiva ? '#a78bfa' : '#6ee7b7' }}>{coletiva ? 'COL' : 'IND'}</span>
                      <span className="font-semibold text-[var(--surface-700)] truncate max-w-[110px]">{p.pet_nome || 'sem nome'}</span>
                      <span className="text-[var(--surface-400)] truncate max-w-[110px]">{p.tutor?.nome || p.tutor_nome || ''}</span>
                      {/* ✓Cz e ✓Ct são carinho visual, não filtro. Coletiva não devolve
                          cinzas — só o certificado aparece. */}
                      {!coletiva && p.contrato_gc?.cinzas_prontas && <span className="text-[10px] text-emerald-400 flex-shrink-0">✓Cz</span>}
                      {p.contrato_gc?.certificado_pronto && <span className="text-[10px] text-emerald-400 flex-shrink-0">✓Ct</span>}
                      {/* ⚠️ O `presencial` fica à ESQUERDA de propósito: a direita é zona
                          de digitar data, e o toque errado ali é caro. */}
                      <button
                        onClick={() => setTrazerPresencial(prev => {
                          const n = new Set(prev)
                          if (n.has(p.id)) n.delete(p.id); else n.add(p.id)
                          return n
                        })}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 transition-colors ${
                          presencial ? 'bg-orange-600 text-white' : 'bg-[var(--surface-100)] text-[var(--surface-400)] hover:text-[var(--surface-600)]'
                        }`}
                      >
                        presencial
                      </button>
                      <span className="flex-1" />
                      <span className="w-[120px] text-right flex-shrink-0">
                        {presencial ? (
                          // Marcado: a data vira a de cremação e TRAVA — o pet não voltou
                          // pra unidade, foi entregue em Pinda no dia da cremação.
                          <span className="text-[11px] italic text-orange-400">crem. {formatarDataViagem(soData(p.contrato_gc?.data_cremacao))}</span>
                        ) : (
                          <input
                            type="date"
                            value={trazerDatas[p.id] || ''}
                            onChange={e => setTrazerDatas(prev => ({ ...prev, [p.id]: e.target.value }))}
                            className="px-1.5 py-0.5 rounded border text-[11px] w-[116px]"
                            style={{ background: 'var(--surface-0)', borderColor: 'var(--surface-200)', color: 'var(--surface-700)' }}
                          />
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Conferência do envio (§9.2). Lista SÓ pra conferir: sem checkbox, sem interação
          — o operador lê e decide. Fraseologia aprovada nos mockups, não reescrever. */}
      <Modal
        isOpen={!!enviarModal}
        onClose={() => { if (!enviando) { setEnviarModal(null); setEnviarPets([]) } }}
        title={enviarModal ? `Enviar ${enviarModal.numero} para a Matriz?` : ''}
        size="lg"
        footer={
          <div className="flex items-center gap-2 w-full">
            <span className="flex-1 text-[12px] font-semibold text-red-400">Não é possível desfazer.</span>
            <button
              onClick={() => { setEnviarModal(null); setEnviarPets([]) }}
              disabled={enviando}
              className="px-3 py-2 rounded-lg text-[13px] font-semibold text-[var(--surface-500)] hover:bg-[var(--surface-100)] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={confirmarEnvioParaMatriz}
              disabled={enviando || enviarCarregando || enviarPets.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              Enviar
            </button>
          </div>
        }
      >
        {enviarCarregando ? (
          <div className="py-8 text-center text-[13px] text-[var(--surface-400)]">
            <Loader2 className="h-5 w-5 animate-spin inline-block" />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] text-[var(--surface-500)]">
              {enviarPets.length} pet{enviarPets.length !== 1 ? 's' : ''} de Ativo → Pinda
            </p>
            {enviarPets.length === 0 ? (
              <p className="text-[13px] text-amber-400 py-2">
                Esta viagem está sem pets. Inclua os pets antes de enviar.
              </p>
            ) : (
              <div className="max-h-[45vh] overflow-y-auto rounded-lg border divide-y" style={{ borderColor: 'var(--surface-200)' }}>
                {enviarPets.map(p => (
                  <div key={p.id} className="flex items-center gap-2 px-2.5 py-2 text-[13px]">
                    <span className="font-mono text-[11px] text-[var(--surface-400)] w-12 flex-shrink-0">{p.numero_lacre || '—'}</span>
                    <span className="font-semibold w-9 flex-shrink-0" style={{ color: p.tipo_cremacao === 'coletiva' ? '#a78bfa' : '#6ee7b7' }}>
                      {p.tipo_cremacao === 'coletiva' ? 'COL' : 'IND'}
                    </span>
                    <span className="font-semibold text-[var(--surface-700)] truncate">{p.pet_nome || 'sem nome'}</span>
                    <span className="text-[var(--surface-400)] truncate flex-1">{p.tutor?.nome || p.tutor_nome || ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Criar / editar encaminhamento — etapa 3. O mesmo formulário serve aos dois:
          `encEditando` nulo = criando. No modo edição ele também é o único lugar onde
          se TIRA um pet da viagem, e onde a viagem é excluída. */}
      <Modal
        isOpen={encFormAberto}
        onClose={() => { if (!salvandoEnc) setEncFormAberto(false) }}
        title={encEditando ? `Editar ${encEditando.numero}` : 'Novo encaminhamento'}
        size="lg"
        footer={
          <div className="flex items-center gap-2 w-full">
            {encEditando && (
              <button
                onClick={excluirEncaminhamento}
                disabled={salvandoEnc}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-red-400 hover:bg-red-950/40 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />Excluir
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={() => setEncFormAberto(false)}
              disabled={salvandoEnc}
              className="px-3 py-2 rounded-lg text-[13px] font-semibold text-[var(--surface-500)] hover:bg-[var(--surface-100)] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={salvarEncaminhamento}
              disabled={salvandoEnc || !encForm.data}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
            >
              {salvandoEnc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              {encEditando ? 'Salvar' : 'Criar encaminhamento'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-black px-2 py-1 rounded" style={{ background: corUnidadeAtual, color: textoBadgeUnidadeAtual }}>
              {encForm.numero || '—'}
            </span>
            {!encEditando && (
              <span className="text-[12px] text-[var(--surface-400)]">número gerado automaticamente</span>
            )}
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[var(--surface-500)] mb-1.5">Data da viagem</label>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {(() => {
                const { hoje, sabado, domingo } = getProximoFimDeSemana()
                const atalhos: [string, string][] = [['Hoje', hoje], ['Sábado', sabado], ['Domingo', domingo]]
                return atalhos.map(([rotulo, valor]) => (
                  <button
                    key={rotulo}
                    onClick={() => setEncForm(f => ({ ...f, data: valor }))}
                    className={`px-2.5 py-1 rounded-lg text-[12px] font-semibold transition-colors ${
                      encForm.data === valor ? 'bg-orange-600 text-white' : 'bg-[var(--surface-100)] text-[var(--surface-500)] hover:text-[var(--surface-700)]'
                    }`}
                  >
                    {rotulo}
                  </button>
                ))
              })()}
            </div>
            <input
              type="date"
              value={encForm.data}
              onChange={e => setEncForm(f => ({ ...f, data: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-[14px]"
              style={{ background: 'var(--surface-0)', borderColor: 'var(--surface-200)', color: 'var(--surface-700)' }}
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[var(--surface-500)] mb-1.5">Responsável pela viagem</label>
            <input
              type="text"
              value={encForm.responsavel}
              onChange={e => setEncForm(f => ({ ...f, responsavel: e.target.value }))}
              placeholder="Quem vai levar os pets"
              className="w-full px-3 py-2 rounded-lg border text-[14px]"
              style={{ background: 'var(--surface-0)', borderColor: 'var(--surface-200)', color: 'var(--surface-700)' }}
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[var(--surface-500)] mb-1.5">Observações</label>
            <textarea
              value={encForm.observacoes}
              onChange={e => setEncForm(f => ({ ...f, observacoes: e.target.value }))}
              rows={2}
              placeholder="Opcional"
              className="w-full px-3 py-2 rounded-lg border text-[14px] resize-none"
              style={{ background: 'var(--surface-0)', borderColor: 'var(--surface-200)', color: 'var(--surface-700)' }}
            />
          </div>

          {encEditando && (
            <div>
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--surface-500)] mb-1.5">
                <PawPrint className="h-4 w-4" />
                {encFormPets.length} pet{encFormPets.length !== 1 ? 's' : ''} nesta viagem
              </div>
              {encFormPets.length === 0 ? (
                <p className="text-[12px] text-[var(--surface-400)] py-2">
                  Nenhum pet ainda. Arraste um card do pipeline até esta viagem.
                </p>
              ) : (
                <div className="max-h-[240px] overflow-y-auto rounded-lg border divide-y" style={{ borderColor: 'var(--surface-200)' }}>
                  {encFormPets.map(c => (
                    <div key={c.id} className="flex items-center gap-2 px-2.5 py-2">
                      {c.numero_lacre && <span className="text-[11px] font-mono text-[var(--surface-400)] flex-shrink-0">{c.numero_lacre}</span>}
                      <span className="text-[13px] font-semibold text-[var(--surface-700)] truncate">{c.pet_nome || 'sem nome'}</span>
                      <span className="text-[11px] flex-shrink-0" style={{ color: c.tipo_cremacao === 'coletiva' ? '#a78bfa' : '#6ee7b7' }}>
                        {c.tipo_cremacao === 'coletiva' ? 'COL' : 'IND'}
                      </span>
                      <span className="text-[11px] text-[var(--surface-400)] truncate flex-1">{c.tutor?.nome || c.tutor_nome || ''}</span>
                      <button
                        onClick={() => desvincularPet(c.id, encEditando.id)}
                        title="Tirar este pet da viagem"
                        className="flex-shrink-0 p-1 rounded text-[var(--surface-400)] hover:text-red-400 hover:bg-red-950/30"
                      >
                        <Unlink className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Barra de seleção do celular (etapa 2). Sem ela o operador segura um pet, o card
          acende, e não tem como saber o que fazer nem como desistir. Fica acima do
          MobileBottomNav (z-40) e some sozinha quando a seleção é limpa. */}
      {encPipeline && petsSelecionados.size > 0 && (
        <div className="md:hidden fixed bottom-16 left-0 right-0 z-50 px-3 pb-2">
          <div className="rounded-xl border shadow-lg px-3 py-2.5 flex items-center gap-3" style={{ background: 'var(--surface-0)', borderColor: corUnidadeAtual }}>
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--surface-700)]">
              <PawPrint className="h-4 w-4" />
              {petsSelecionados.size} pet{petsSelecionados.size !== 1 ? 's' : ''}
            </span>
            <span className="flex-1 text-[12px] text-[var(--surface-400)] leading-tight">
              {vinculando ? 'Incluindo…' : 'Toque na viagem para incluir'}
            </span>
            <button
              onClick={() => setPetsSelecionados(new Set())}
              disabled={vinculando}
              className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg text-[var(--surface-500)] hover:bg-[var(--surface-100)] disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal Protocolo de Entrega */}
      {protocoloModal && protocoloContrato && (
        protocoloLoading || !protocoloEditData ? (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
            <div className="bg-white rounded-xl p-8 text-center shadow-2xl border border-gray-200" onClick={e => e.stopPropagation()}>
              <span className="animate-spin text-2xl">⏳</span>
              <p className="mt-2 text-sm text-gray-500">Carregando protocolo...</p>
            </div>
          </div>
        ) : (
          <ProtocoloEditorModal
            data={protocoloEditData}
            onChange={setProtocoloEditData}
            salvando={salvandoProtocolo}
            onSave={async () => {
              setSalvandoProtocolo(true)
              const { error } = await supabase
                .from('contratos')
                .update({ protocolo_data: protocoloEditData } as never)
                .eq('id', protocoloContrato.id)
              if (!error) {
                // Atualizar no array local
                setContratos(prev => prev.map(c =>
                  c.id === protocoloContrato.id ? { ...c, protocolo_data: protocoloEditData } : c
                ))
                setProtocoloContrato({ ...protocoloContrato, protocolo_data: protocoloEditData })
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
            onRegenerate={() => {
              setProtocoloEditData(null)
              montarProtocoloDoBanco(protocoloContrato.id)
            }}
            regenerando={protocoloLoading}
            onClose={() => { setProtocoloModal(false); setProtocoloContrato(null); setProtocoloEditData(null); unhighlightContrato() }}
          />
        )
      )}

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

      {/* Barra flutuante de registro de entrega em lote (retorno/pendente) */}
      {selectedEntregas.size > 0 && (
        <div className={`fixed ${selectedContratos.size > 0 ? 'bottom-20' : 'bottom-4'} left-1/2 -translate-x-1/2 z-50 bg-emerald-900 text-white rounded-2xl shadow-2xl px-3 md:px-5 py-2 md:py-3 flex items-center gap-2 md:gap-4 max-w-[calc(100vw-2rem)]`}>
          <span className="text-sm font-medium">
            {selectedEntregas.size} para entrega
          </span>
          <button
            onClick={abrirEntregaBatchModal}
            disabled={entregaBatchLoading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            <span className="text-base">📬</span>
            Registrar Entrega
          </button>
          <button
            onClick={() => setSelectedEntregas(new Set())}
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
                      className="px-1 py-0.5 rounded text-xs text-slate-300 w-28 bg-slate-700 cursor-pointer"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setMegaPagamentoForm({
                        ...megaPagamentoForm,
                        dataHoje: false,
                        data_pagamento: hojeLocal()
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
              {/* Contrato de outra unidade: o dinheiro fica aqui, a receita é de
                  lá. Avisar antes de gravar evita que o operador conte como
                  receita desta unidade — e explica o acerto que vai nascer. */}
              {hasModule('tela_financeiro')
                && megaPagamentoContrato.unidade_id && currentUnit?.id
                && megaPagamentoContrato.unidade_id !== currentUnit.id && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs bg-amber-500/10 text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Contrato de{' '}
                    {allUnidades.find(u => u.id === megaPagamentoContrato.unidade_id)?.nome || 'outra unidade'}.
                    O dinheiro entra na conta desta unidade e um acerto é enviado
                    para que a receita fique com a unidade dona do contrato.
                  </span>
                </div>
              )}

              {/* A TAXA DA MAQUININHA (mig 134). Mostrar antes de gravar é o que
                  separa "o sistema descontou algo" de "eu sei quanto entra".
                  Sem tabela cadastrada, o valor entra CHEIO e isso é dito em
                  voz alta — número incompleto e visível é melhor que número
                  plausível e errado. */}
              {taxaVenda && (
                taxaVenda.cadastrada ? (
                  taxaVenda.percentual > 0 && (
                    <p className="text-xs text-slate-400">
                      Taxa da maquininha: <span className="text-slate-300">{taxaVenda.percentual}%</span>
                      {' · '}entra{' '}
                      <span className="text-slate-300">
                        {fmtBRL(
                          ((parseFloat(megaPagamentoForm.valorPlano) || 0)
                            + (parseFloat(megaPagamentoForm.valorAcessorio) || 0))
                          * (1 - taxaVenda.percentual / 100),
                        )}
                      </span>
                    </p>
                  )
                ) : (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs bg-amber-500/10 text-amber-400">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      Esta maquininha ainda não tem tabela de taxas cadastrada —
                      o valor será registrado cheio, sem desconto. Cadastre em
                      Financeiro › Contas para o líquido ficar correto.
                    </span>
                  </div>
                )
              )}

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

              {/* EM QUE CONTA O DINHEIRO CAI (13/09/2026).
                  Antes disto a conta era gravada sem aparecer — e foi assim que
                  73 recebimentos foram parar em cartão de crédito. Agora é
                  sempre visível; editável só quando há o que escolher. */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-400 shrink-0">Cai em</span>
                {destinoMega.editavel ? (
                  <select
                    value={megaContaId}
                    onChange={(e) => setMegaContaId(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-1 border border-slate-600 rounded text-sm bg-slate-700 focus:outline-none focus:ring-1 focus:ring-green-500"
                  >
                    {destinoMega.opcoes.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                ) : (
                  <span className="flex-1 min-w-0 flex items-center gap-1.5 text-sm text-slate-300 truncate">
                    {contasUnidade.find((c) => c.id === megaContaId)?.nome || (
                      <span className="text-amber-400">nenhuma conta configurada</span>
                    )}
                    {destinoMega.legada && megaContaId && (
                      <span
                        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-slate-700 text-slate-400"
                        title="Esta unidade não tem o módulo financeiro, então o recebimento fica na conta de histórico dela."
                      >
                        histórico
                      </span>
                    )}
                  </span>
                )}
              </div>

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

      {/* Modal Pelinho (popup de quantidade) */}
      {pelinhoContrato && (
        <PelinhoModal
          isOpen={pelinhoModal}
          onClose={() => { setPelinhoModal(false); unhighlightContrato(); }}
          contrato={pelinhoContrato}
          quantidadeAtual={(pelinhoContrato.contrato_produtos || []).filter(cp => cp.produto?.rescaldo_tipo === 'pelinho').length}
          onSuccess={() => recarregarPelinhoLocal(pelinhoContrato.id)}
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

      {/* Finalizar Ativação de Preventivo (mig 138) — conclui a tarefa atribuída pelo
          AtivarModal. O contrato já é `ativo`/`pinda` desde a atribuição; aqui só
          preenche data/hora, lacre e tira o "Em Acolhimento" — status não muda. */}
      {finalizarAtivacaoPVContrato && (
        <AtivacaoPVModal
          isOpen={!!finalizarAtivacaoPVContrato}
          onClose={() => setFinalizarAtivacaoPVContrato(null)}
          contrato={finalizarAtivacaoPVContrato}
          tarefaTipo={finalizarAtivacaoPVContrato.tipo_plano === 'preventivo' ? 'ativacao_pv' : 'remocao'}
          onSuccess={(updated) => {
            setContratos(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))
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

            {/* Busca + Filtros (toolbar compartilhada, apenas urnas neste modal) */}
            <div className="p-4 border-b">
              <ProdutosFilterBar
                produtos={urnas as unknown as Array<{ tipo: 'urna' | 'acessorio'; categoria: string | null; estoque_atual: number; estoque_minimo: number; estoque_infinito?: boolean; nome?: string; codigo?: string }>}
                busca={buscaUrna}
                onBusca={setBuscaUrna}
                tipo="urna"
                onTipo={() => {}}
                categoria={filtroUrnaCategoria}
                onCategoria={setFiltroUrnaCategoria}
                status=""
                onStatus={() => {}}
                semStatus
                placeholder="Buscar urna..."
              />
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
            // `updated.contrato_gc` tem shape diferente do que /contratos guarda
            // (lá é só { etapa, cinzas_prontas, ... }); descartamos pra não destruir o cache.
            const { contrato_gc: _ignorado, ...rest } = updated
            void _ignorado
            setContratos(prev => prev.map(c =>
              c.id === updated.id ? { ...c, ...rest } : c
            ))
          }}
        />
      )}

      {indicacaoModal && indicacaoContrato && (
        <IndicacaoModal
          contrato={indicacaoContrato}
          onClose={() => { setIndicacaoModal(false); unhighlightContrato(); }}
          onSuccess={(updated) => {
            const idAtualizado = indicacaoContrato.id
            setContratos(prev => prev.map(c => c.id === idAtualizado ? { ...c, ...updated } : c))
            setIndicacaoModal(false)
            unhighlightContrato()
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

      {/* Modal Compartilhar */}
      {/* Modal Bypass — finalizar pulando etapas */}
      {bypassContrato && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setBypassContrato(null)}>
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-sm w-full mx-4 p-6 border border-red-500/30" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white font-black text-lg">B</div>
              <div>
                <h3 className="text-lg font-semibold text-slate-200">Bypass — Finalizar direto</h3>
                <p className="text-xs text-slate-400">{bypassContrato.pet_nome} ({bypassContrato.codigo})</p>
              </div>
            </div>

            <p className="text-xs text-amber-400 mb-4 bg-amber-900/20 px-3 py-2 rounded-lg">
              Pula encaminhamento e GC. Use apenas para contratos que já foram resolvidos fora do sistema.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Data da cremação *</label>
                <input
                  type="date"
                  value={bypassDataCremacao}
                  onChange={e => setBypassDataCremacao(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Data da entrega (opcional)</label>
                <input
                  type="date"
                  value={bypassDataEntrega}
                  onChange={e => setBypassDataEntrega(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setBypassContrato(null)}
                className="flex-1 py-2.5 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={executarBypass}
                disabled={salvandoBypass || !bypassDataCremacao}
                className="flex-1 py-2.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
              >
                {salvandoBypass ? 'Finalizando...' : 'Finalizar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {compartilharModal && compartilharContrato && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setCompartilharModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-1">🔄 Compartilhar</h3>
            <p className="text-xs text-gray-500 mb-4">{compartilharContrato.pet_nome} — {compartilharContrato.codigo}</p>

            {/* Tipo */}
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

            {/* Info existente */}
            {((compartilharTipo === 'remocao' && compartilharContrato.unidade_remocao_id) ||
              (compartilharTipo === 'entrega' && compartilharContrato.unidade_entrega_id)) && (
              <div className="mb-3 p-2 rounded-lg bg-gray-50 flex items-center justify-between">
                <span className="text-xs text-gray-600">
                  Atual: <strong>{compartilharTipo === 'remocao' ? compartilharContrato.unidade_remocao?.nome : compartilharContrato.unidade_entrega?.nome}</strong>
                </span>
                <button
                  onClick={async () => {
                    await removerCompartilhamento(compartilharContrato.id, compartilharTipo)
                    setCompartilharModal(false)
                  }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  Remover
                </button>
              </div>
            )}

            {/* Dropdown unidade */}
            <select
              value={compartilharUnidadeId}
              onChange={e => setCompartilharUnidadeId(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-purple-400"
            >
              <option value="">Selecione a unidade...</option>
              {allUnidades
                .filter(u => u.id !== currentUnit?.id)
                .map(u => (
                  <option key={u.id} value={u.id}>{u.codigo} — {u.nome}</option>
                ))
              }
            </select>

            {/* Botões */}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCompartilharModal(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                Cancelar
              </button>
              <button
                onClick={salvarCompartilhamento}
                disabled={!compartilharUnidadeId || salvandoCompartilhar}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {salvandoCompartilhar ? 'Salvando...' : 'Confirmar'}
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

      {/* Modal Marcar Entregue em Lote */}
      {entregaBatchModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-2"
          onClick={() => !entregaBatchLoading && setEntregaBatchModal(false)}
        >
          <div
            className="bg-slate-800 rounded-2xl w-full max-w-sm shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header com toggle de data */}
            <div className="flex items-center justify-between p-3 border-b bg-gradient-to-r from-emerald-600 to-green-600 rounded-t-2xl">
              <div className="flex items-center gap-2 text-white">
                <span className="text-lg">📬</span>
                <h3 className="font-semibold">Marcar Entregue em Lote</h3>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-white/10 rounded px-1">
                  <button
                    type="button"
                    onClick={() => setEntregaBatchForm({ dataHoje: true, data_entrega: '' })}
                    className={`px-2 py-0.5 rounded text-xs transition-colors ${
                      entregaBatchForm.dataHoje
                        ? 'bg-slate-700 text-green-400 font-medium'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    Hoje
                  </button>
                  {!entregaBatchForm.dataHoje ? (
                    <input
                      type="date"
                      value={entregaBatchForm.data_entrega}
                      onChange={(e) => setEntregaBatchForm({ ...entregaBatchForm, data_entrega: e.target.value })}
                      className="px-1 py-0.5 rounded text-xs text-slate-300 w-28 bg-slate-700 cursor-pointer"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEntregaBatchForm({ dataHoje: false, data_entrega: hojeLocal() })}
                      className="px-2 py-0.5 rounded text-xs text-white/70 hover:text-white transition-colors"
                    >
                      Outra
                    </button>
                  )}
                </div>
                <button
                  onClick={() => !entregaBatchLoading && setEntregaBatchModal(false)}
                  className="text-white/80 hover:text-white ml-1"
                  disabled={entregaBatchLoading}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Corpo */}
            <div className="p-4 space-y-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-slate-200">{selectedEntregas.size}</p>
                <p className="text-sm text-slate-400">
                  contrato{selectedEntregas.size > 1 ? 's' : ''} selecionado{selectedEntregas.size > 1 ? 's' : ''}
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-300">
                    Retorno / Pendente
                  </span>
                  <span className="text-slate-400 text-xs">→</span>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-300">
                    ✅ Finalizado
                  </span>
                </div>
              </div>

              {/* Lista compacta dos pets selecionados */}
              <div className="max-h-32 overflow-y-auto rounded-lg bg-slate-900/50 border border-slate-700 px-3 py-2 text-xs text-slate-300 space-y-0.5">
                {contratos
                  .filter(c => selectedEntregas.has(c.id))
                  .map(c => (
                    <div key={c.id} className="flex items-center justify-between gap-2">
                      <span className="truncate"><strong className="text-slate-200">{c.pet_nome}</strong> · {c.tutor?.nome || c.tutor_nome}</span>
                      <span className="text-slate-500 text-[10px] flex-shrink-0">{c.codigo}</span>
                    </div>
                  ))}
              </div>

              {/* Botões */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setEntregaBatchModal(false)}
                  disabled={entregaBatchLoading}
                  className="flex-1 py-2.5 px-4 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700 text-sm disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarEntregaBatch}
                  disabled={entregaBatchLoading || (!entregaBatchForm.dataHoje && !entregaBatchForm.data_entrega)}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"
                >
                  {entregaBatchLoading ? 'Salvando...' : `Confirmar (${selectedEntregas.size})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Supinda - Seleção/Criação */}
      {supindaModal && supindaContrato && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSupindaModal(false)}>
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-200">🚐 Selecionar Encaminhamento</h3>
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
                  <p className="text-center text-slate-400 py-4">Nenhum encaminhamento planejado</p>
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
                  <label className="block text-sm font-medium text-slate-300 mb-1">Data do Encaminhamento</label>
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

      {/* Modal Rescaldos (componente compartilhado) */}
      {rescaldoContrato && (
        <RescaldoModal
          isOpen={rescaldoModal}
          petNome={rescaldoContrato.pet_nome}
          codigo={rescaldoContrato.codigo}
          rescaldos={rescaldoContrato.contrato_produtos || []}
          produtosRescaldo={produtosRescaldo}
          salvando={salvandoRescaldo}
          onToggleFeito={toggleRescaldoFeito}
          onAdicionar={adicionarProdutoRescaldo}
          onAdicionarNenhum={async () => {
            setSalvandoRescaldo(true)
            const { data: prod } = await supabase
              .from('produtos')
              .select('id, codigo, nome, tipo, rescaldo_tipo, preco, imagem_url')
              .eq('codigo', '0002')
              .single()
            if (prod) await adicionarProdutoRescaldo(prod as typeof produtosRescaldo[0])
            setSalvandoRescaldo(false)
          }}
          onRemover={removerProdutoRescaldo}
          onClose={() => { setRescaldoModal(false); unhighlightContrato() }}
        />
      )}

      {/* Off-screen: FichaRemocao para captura via DocMenu (PNG download) */}
      {fichaParaCapturar && (
        <div style={{ position: 'fixed', left: -10000, top: 0, opacity: 0, pointerEvents: 'none' }}>
          <FichaRemocao ref={fichaCaptureRef} contrato={fichaParaCapturar as unknown as FichaContratoData} />
        </div>
      )}

      {/* Modal: Editar Contrato (via DocMenu) */}
      <EditarContratoModal
        isOpen={editarContratoId !== null}
        contratoId={editarContratoId}
        onClose={() => setEditarContratoId(null)}
        onSaved={() => { carregarContratos() }}
      />

      {/* Modal: Editar Ficha (via DocMenu) */}
      <EditarFichaModal
        isOpen={editarFichaId !== null}
        contratoId={editarFichaId}
        unidadeId={editarFichaUnidade}
        onClose={() => setEditarFichaId(null)}
        onSaved={() => { carregarContratos() }}
      />

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
