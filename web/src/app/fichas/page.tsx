'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Search, X, Clock, CheckCircle2, FileText, Phone, MapPin, Stethoscope, ArrowRight, MessageCircle, Download, Pencil, Bell, BellOff, Copy } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sanitizeBuscaPostgrest } from '@/lib/sanitize'
import { useDebounce } from '@/hooks/useDebounce'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import TratativaModal from '@/components/fichas/TratativaModal'
import { useUnit } from '@/contexts/UnitContext'
import { useFieldPermission } from '@/hooks/useFieldPermission'
import { usePushNotification } from '@/hooks/usePushNotification'
import { gerarContratoPDF, contratoFilename, getUnidade } from '@/lib/contrato-pdf'

// ============================================
// Types
// ============================================
type Ficha = {
  id: string
  created_at: string
  // Tutor
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
  // Pet
  nome_pet: string
  idade: string | null
  especie: string
  genero: string
  raca: string | null
  cor: string
  peso: string | null
  // Servico
  cremacao: string
  valor: number | null
  pagamento: string
  parcelas: string | null
  velorio: string
  acompanhamento: string
  localizacao: string
  localizacao_outra: string | null
  // Extras
  como_conheceu: string[] | null
  veterinario_especificar: string | null
  outro_especificar: string | null
  observacoes: string | null
  // Unidade
  unidade_id: string
  // Processamento
  processada: boolean | null
  contrato_id: string | null
  processada_em: string | null
  op_dados: Record<string, unknown> | null
}

type Filtro = 'pendentes' | 'processadas' | 'contrato_criado' | 'canceladas'

// ============================================
// Helpers
// ============================================
function tempoRelativo(dataStr: string): string {
  const agora = new Date()
  const data = new Date(dataStr)
  const diffMs = agora.getTime() - data.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `ha ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `ha ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'ontem'
  if (diffD < 30) return `ha ${diffD} dias`
  return data.toLocaleDateString('pt-BR')
}

function especieEmoji(especie: string): string {
  const lower = especie?.toLowerCase() || ''
  if (lower.includes('canina') || lower.includes('cao')) return '🐕'
  if (lower.includes('felina') || lower.includes('gato')) return '🐈'
  return '🐾'
}

// Mapeamento das opções da ficha pra ícone visual (mesma identidade do pipeline)
const FICHA_FONTE_ICONS: Record<string, { img?: string; icon?: string; title: string }> = {
  'Google':                  { img: '/icons/google.svg',   title: 'Google' },
  'Veterinário':             { img: '/icons/hospital.svg', title: 'Veterinário (Indicação em Clínica)' },
  'Instagram/Facebook':      { img: '/icons/meta.svg',     title: 'Instagram/Facebook' },
  'Parente/Amigo':           { icon: '👥',                 title: 'Parente/Amigo' },
  'Já utilizei a R.I.P. Pet':{ icon: '🔄',                 title: 'Já utilizei a R.I.P. Pet (Cliente)' },
  'Passei pela Unidade':     { icon: '📍',                 title: 'Passei pela Unidade (Ponto)' },
  'Outro':                   { icon: '📝',                 title: 'Outro' },
}

function formatarTelefone(tel: string | null): string {
  if (!tel) return ''
  const limpo = tel.replace(/\D/g, '')
  if (limpo.length === 11) return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7)}`
  if (limpo.length === 10) return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 6)}-${limpo.slice(6)}`
  return tel
}

// ============================================
// Page
// ============================================
export default function FichasPage() {
  const router = useRouter()
  const supabase = createClient()
  const { currentUnit, isLoading: unitLoading } = useUnit()
  const { isVisible } = useFieldPermission()

  const [fichas, setFichas] = useState<Ficha[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('pendentes')
  const [busca, setBusca] = useState('')
  const buscaDebounced = useDebounce(busca, 300)

  // Filtro de período
  type Periodo = 'hoje' | 'ontem' | '7d' | '30d' | 'mes' | 'ano' | 'personalizado'
  const [periodo, setPeriodo] = useState<Periodo>('7d')
  const [periodoCustomDe, setPeriodoCustomDe] = useState('')
  const [periodoCustomAte, setPeriodoCustomAte] = useState('')

  function periodoRange(): { from: string; to: string } {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    switch (periodo) {
      case 'hoje': return { from: today.toISOString(), to: tomorrow.toISOString() }
      case 'ontem': { const d = new Date(today); d.setDate(d.getDate() - 1); return { from: d.toISOString(), to: today.toISOString() } }
      case '7d': { const d = new Date(today); d.setDate(d.getDate() - 7); return { from: d.toISOString(), to: tomorrow.toISOString() } }
      case '30d': { const d = new Date(today); d.setDate(d.getDate() - 30); return { from: d.toISOString(), to: tomorrow.toISOString() } }
      case 'mes': return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: tomorrow.toISOString() }
      case 'ano': return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to: tomorrow.toISOString() }
      case 'personalizado': {
        const de = periodoCustomDe ? new Date(periodoCustomDe + 'T00:00:00').toISOString() : new Date(2020, 0, 1).toISOString()
        const ate = periodoCustomAte ? new Date(periodoCustomAte + 'T23:59:59').toISOString() : tomorrow.toISOString()
        return { from: de, to: ate }
      }
    }
  }

  // Counts
  const [pendentesCount, setPendentesCount] = useState(0)
  const [processadasCount, setProcessadasCount] = useState(0)
  const [contratoCriadoCount, setContratoCriadoCount] = useState(0)
  const [canceladasCount, setCanceladasCount] = useState(0)

  // Modal
  const [fichaModal, setFichaModal] = useState<Ficha | null>(null)
  const [modalSomenteLeitura, setModalSomenteLeitura] = useState(false)

  // User + Push
  const [userId, setUserId] = useState<string | null>(null)
  const { permission, isSubscribed, loading: pushLoading, error: pushError, subscribe, unsubscribe } = usePushNotification(userId, currentUnit?.id || null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null))
  }, [])

  // Load data — recarrega quando muda de unidade
  useEffect(() => {
    carregarContagens()
    carregarFichas()
  }, [currentUnit?.id])

  // Trigger de reload — incrementado pelo realtime; useEffect[filtro,reloadKey] reage com closure atual
  const [reloadKey, setReloadKey] = useState(0)

  // Realtime — escuta novas fichas e atualizações
  useEffect(() => {
    const channel = supabase
      .channel('fichas-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fichas' }, () => {
        setReloadKey(k => k + 1)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'fichas' }, () => {
        setReloadKey(k => k + 1)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [currentUnit?.id])

  useEffect(() => {
    carregarFichas()
    carregarContagens()
  }, [filtro, buscaDebounced, periodo, periodoCustomDe, periodoCustomAte, reloadKey])

  async function carregarContagens() {
    if (!currentUnit) { setLoading(false); return }
    const { from, to } = periodoRange()
    const pendQuery = supabase
      .from('fichas')
      .select('*', { count: 'exact', head: true })
      .or('processada.is.null,processada.eq.false')
      .or('op_dados.is.null,op_dados.not.cs.{"cancelada":true}')
      .eq('unidade_id', currentUnit.id)
      .gte('created_at', from).lt('created_at', to)
    const procQuery = supabase
      .from('fichas')
      .select('id, op_dados, contrato_id')
      .eq('processada', true)
      .eq('unidade_id', currentUnit.id)
      .gte('created_at', from).lt('created_at', to)

    const [{ count: pend }, { data: procRows }] = await Promise.all([pendQuery, procQuery])
    const rows = (procRows || []) as Array<{ op_dados: Record<string, unknown> | null; contrato_id: string | null }>
    const canc = rows.filter(r => !!r.op_dados?.cancelada).length
    const comContrato = rows.filter(r => !r.op_dados?.cancelada && r.contrato_id != null).length
    const procSemContrato = rows.filter(r => !r.op_dados?.cancelada && r.contrato_id == null).length
    setPendentesCount(pend || 0)
    setProcessadasCount(procSemContrato)
    setContratoCriadoCount(comContrato)
    setCanceladasCount(canc)
  }

  const isCancelada = (f: Ficha) => !!(f.op_dados as Record<string, unknown>)?.cancelada

  async function carregarFichas() {
    if (!currentUnit) { setLoading(false); return }
    setLoading(true)

    const { from, to } = periodoRange()
    let query = supabase
      .from('fichas')
      .select('*')
      .gte('created_at', from).lt('created_at', to)
      .order('created_at', { ascending: false })
      .limit(200)

    // Filtrar por unidade
    if (currentUnit) {
      query = query.eq('unidade_id', currentUnit.id)
    }

    // Filter
    if (filtro === 'pendentes') {
      query = query.or('processada.is.null,processada.eq.false')
    } else {
      query = query.eq('processada', true)
    }

    // Search (sanitize to prevent PostgREST filter injection)
    if (buscaDebounced.trim()) {
      const termo = sanitizeBuscaPostgrest(buscaDebounced)
      if (termo) {
        query = query.or(`nome_completo.ilike.%${termo}%,nome_pet.ilike.%${termo}%,cpf.ilike.%${termo}%,telefone.ilike.%${termo}%`)
      }
    }

    const { data, error } = await query

    // Separar por status (op_dados.cancelada + contrato_id) no client-side
    const todas = (data || []) as Ficha[]

    if (filtro === 'canceladas') {
      setFichas(todas.filter(f => isCancelada(f)))
    } else if (filtro === 'contrato_criado') {
      setFichas(todas.filter(f => !isCancelada(f) && f.contrato_id != null))
    } else if (filtro === 'processadas') {
      setFichas(todas.filter(f => !isCancelada(f) && f.contrato_id == null))
    } else {
      // pendentes
      setFichas(todas.filter(f => !isCancelada(f)))
    }

    if (error) {
      console.error('Erro ao carregar fichas:', error)
    }

    setLoading(false)
  }

  function handleSuccess(contratoId: string) {
    setFichaModal(null)
    setFiltro('contrato_criado')
    carregarFichas()
    carregarContagens()
    router.push(`/contratos/${contratoId}`)
  }

  function formatarTel(tel: string | null | undefined): string {
    if (!tel) return '-'
    const n = tel.replace(/\D/g, '')
    if (n.length === 13 && n.startsWith('55')) return `(${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}`
    if (n.length >= 12) return `+${n.slice(0, n.length - 11)} (${n.slice(-11, -9)}) ${n.slice(-9, -4)}-${n.slice(-4)}`
    if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
    if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
    return tel
  }

  function formatarDisplay(valor: string | null | undefined): string {
    if (!valor) return '-'
    const map: Record<string, string> = {
      pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Cartão Débito', credito: 'Cartão Crédito',
      individual: 'Individual', coletiva: 'Coletiva',
    }
    return map[valor.toLowerCase()] || valor.charAt(0).toUpperCase() + valor.slice(1)
  }

  function montarMsgWhatsApp(ficha: Ficha): string {
    const op = (ficha.op_dados || {}) as Record<string, unknown>
    const cremacao = formatarDisplay(ficha.cremacao)
    // Valor: op_dados tem prioridade (operador pode ter ajustado)
    const valorOp = op.valorPlano ? parseFloat(String(op.valorPlano)) : null
    const descontoOp = op.descontoPreVenda ? parseFloat(String(op.descontoPreVenda)) : 0
    const descontoTipoOp = (op.descontoTipo as string) || 'valor'
    const descontoReal = descontoTipoOp === 'percentual' && valorOp ? (valorOp * descontoOp) / 100 : descontoOp
    const valorFinal = valorOp != null ? valorOp - descontoReal : (ficha.valor || 0)
    const valor = valorFinal ? `R$ ${valorFinal.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : ''
    const pagamento = formatarDisplay(ficha.pagamento)
    const velorio = ficha.velorio || ''
    const acompanhamento = ficha.acompanhamento || ''
    const dataEnvio = new Date(ficha.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const telPrincipal = ficha.telefone

    let msg = `*Por favor, _confirme_ se as informações abaixo estão _corretas_*\n\n_Dados Enviados em ${dataEnvio}_\n\n`

    const outrosNomes = ficha.outros_tutores?.filter(Boolean)
    const nomesCertificado = [ficha.nome_completo?.toUpperCase(), ...(outrosNomes || []).map(n => n.toUpperCase())].filter(Boolean).join(', ')

    msg += `*- DADOS DO TUTOR:*\n`
    msg += `*Nome p/ Contrato e Certificado:* ${nomesCertificado}\n`
    msg += `*Telefone Contato:* ${formatarTel(telPrincipal)} | *${ficha.cpf?.replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF'}:* ${ficha.cpf}\n`
    if (ficha.email) msg += `*Email:* ${ficha.email}\n`
    msg += `*Endereço:* ${ficha.endereco} ${ficha.numero}${ficha.complemento ? ` - ${ficha.complemento}` : ''} - ${ficha.bairro}\n`
    msg += `*CEP:* ${ficha.cep} | *Cidade:* ${ficha.cidade} | *UF:* ${ficha.estado}\n`

    msg += `\n*- DADOS DO PET:*\n`
    msg += `*Nome:* ${ficha.nome_pet?.toUpperCase()}\n`
    msg += `*Espécie:* ${formatarDisplay(ficha.especie)} | *Raça:* ${ficha.raca || 'Não tem'}\n`
    msg += `*Idade:* ${ficha.idade || '-'} | *Gênero:* ${formatarDisplay(ficha.genero)}\n`
    msg += `*Cor:* ${ficha.cor} | *Peso Aproximado:* ${ficha.peso || '-'}\n`
    const opLocal = (op.enderecoOutro as string) || ficha.localizacao_outra
    const opEstabNome = op.estabNome as string | null
    const opClinicaTexto = op.clinicaTextoLivre as string | null
    const opLocalColeta = op.localColeta as string | null
    const localNormalizado = opLocalColeta === 'clinica' ? (opEstabNome || opClinicaTexto || ficha.localizacao_outra || ficha.localizacao)
      : opLocalColeta === 'outro' ? (opLocal || ficha.localizacao_outra || 'Outro endereço')
      : opLocalColeta === 'residencia' ? 'Residência (Endereço de Cadastro)'
      : opLocalColeta === 'unidade' ? 'Unidade RIP PET'
      : `${ficha.localizacao}${ficha.localizacao_outra ? ` (${ficha.localizacao_outra})` : ficha.localizacao?.includes('Residência') ? ' (Endereço de Cadastro)' : ''}`
    msg += `*Localização:* ${localNormalizado}\n`

    msg += `\n*- DADOS DA CREMAÇÃO:*\n`
    // Valor só é definido no processamento — em ficha recebida (sem valor) some da msg
    msg += `*Cremação Escolhida:* ${cremacao}${valor ? ` | *Valor:* ${valor}` : ''}\n`
    msg += `*Forma de Pagamento:* ${pagamento}${ficha.parcelas ? ` ${ficha.parcelas}` : ''}\n`
    msg += `*Velório:* ${velorio}\n`
    msg += `*Acompanhamento da Cremação:* ${acompanhamento}\n`

    if (ficha.como_conheceu && ficha.como_conheceu.length > 0) {
      const indNome = (op.indicNomeQuemIndicou as string) || ficha.veterinario_especificar
      const indClinica = (op.indicEstabNome as string) || (op.indicHospClinica as string)
      const indParts = [indNome, indClinica].filter(Boolean)
      if (indParts.length > 0) {
        msg += `\n*Como nos Conheceu:* ${indParts.join(' - ')}`
      } else {
        msg += `\n*Como nos Conheceu:* ${ficha.como_conheceu.join(', ')}`
        if (ficha.outro_especificar) msg += ` (${ficha.outro_especificar})`
      }
    }

    if (ficha.observacoes) {
      msg += `\n\n*Observações:* ${ficha.observacoes}`
    }

    return msg
  }

  async function gerarPdfFicha(ficha: Ficha) {
    const op = (ficha.op_dados || {}) as Record<string, unknown>
    const nomeUnidade = currentUnit ? `${currentUnit.cidade} - ${currentUnit.estado}` : 'Santos - SP'

    try {
      // Campos provisórios ficam em branco no PDF
      const semLacre = op.semLacre as boolean
      const semLocal = op.semLocal as boolean

      // Local normalizado
      const opLocalColeta = op.localColeta as string | null
      const localPdf = semLocal ? '' : opLocalColeta === 'clinica' ? ((op.estabNome as string) || (op.clinicaTextoLivre as string) || ficha.localizacao)
        : opLocalColeta === 'outro' ? ((op.enderecoOutro as string) || ficha.localizacao_outra || '')
        : opLocalColeta === 'residencia' ? 'Residência (Endereço de Cadastro)'
        : opLocalColeta === 'unidade' ? 'Unidade RIP PET'
        : ficha.localizacao

      const blob = await gerarContratoPDF({
        codigo: String(op.codigo || ''),
        lacre: semLacre ? null : (op.lacre ? String(op.lacre) : null),
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
        valorPlano: (() => {
          const vp = op.valorPlano ? parseFloat(String(op.valorPlano)) : ficha.valor
          if (!vp) return null
          const dp = op.descontoPreVenda ? parseFloat(String(op.descontoPreVenda)) : 0
          const dt = (op.descontoTipo as string) || 'valor'
          const dr = dt === 'percentual' ? (vp * dp) / 100 : dp
          return Math.max(vp - dr, 0)
        })(),
        metodoPagamento: ficha.pagamento,
        parcelas: ficha.parcelas ? parseInt(ficha.parcelas.replace(/\D/g, '')) || null : null,
        velorioDeseja: ficha.velorio === 'Sim' ? true : ficha.velorio === 'Não' ? false : null,
        acompanhamentoOnline: ficha.acompanhamento?.includes('On-line') || false,
        acompanhamentoPresencial: ficha.acompanhamento?.includes('Presencial') || false,
        temDesconto: !!(op.descontoPreVenda && parseFloat(String(op.descontoPreVenda)) > 0),
        dataAcolhimento: op.semDataHora ? null : (op.dataHoraAcolhimento as string) || null,
      }, nomeUnidade)

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = contratoFilename(String(op.codigo || 'FICHA'), ficha.nome_pet || 'PET')
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Erro ao gerar PDF:', err)
    }
  }

  // Telefone atuante: se operador marcou tel2 como principal, usa tel2. Senão usa o original.
  function getTelefoneAtuante(ficha: Ficha): string {
    const op = (ficha.op_dados || {}) as Record<string, unknown>
    if (op.usarTelefone2ComoPrincipal && op.telefone2) {
      return String(op.telefone2).replace(/\D/g, '')
    }
    return ficha.telefone?.replace(/\D/g, '') || ''
  }

  function abrirWhatsApp(ficha: Ficha) {
    const tel = getTelefoneAtuante(ficha)
    const msg = encodeURIComponent(montarMsgWhatsApp(ficha))
    window.open(`https://wa.me/${tel}`, '_blank')
  }

  function abrirWhatsAppComMsg(ficha: Ficha) {
    const tel = getTelefoneAtuante(ficha)
    const msg = encodeURIComponent(montarMsgWhatsApp(ficha))
    window.open(`https://wa.me/${tel}?text=${msg}`, '_blank')
  }

  // ============================================
  // Render
  // ============================================
  if (unitLoading || !currentUnit) {
    return <div className="min-h-[50vh]" />
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-amber-900/30 items-center justify-center">
            <ClipboardList className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-title text-[var(--shell-text)]">Fichas de Entrada</h1>
          </div>
        </div>

        {/* Push notification toggle */}
        {permission !== 'unsupported' && (
          <button
            onClick={() => isSubscribed ? unsubscribe() : subscribe()}
            disabled={pushLoading || permission === 'denied'}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              isSubscribed
                ? 'bg-green-900/30 text-green-400 border border-green-500/30'
                : permission === 'denied'
                ? 'bg-red-900/20 text-red-400 border border-red-500/20 cursor-not-allowed'
                : 'bg-[var(--surface-100)] text-[var(--surface-500)] border border-[var(--surface-200)] hover:border-amber-500/50 hover:text-amber-400'
            }`}
            title={
              permission === 'denied'
                ? 'Notificações bloqueadas no navegador. Vá em configurações do site para permitir.'
                : isSubscribed ? 'Desativar notificações' : 'Ativar notificações de nova ficha'
            }
          >
            {isSubscribed ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            <span className="hidden sm:inline">
              {permission === 'denied' ? 'Bloqueado' : isSubscribed ? 'Notificações ON' : 'Notificar'}
            </span>
          </button>
        )}
      </div>

      {/* Push error */}
      {pushError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/20 border border-red-500/30 text-red-400 text-sm">
          {pushError}
        </div>
      )}

      {/* Filtro de período */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {([
          { key: 'hoje', label: 'Hoje' },
          { key: 'ontem', label: 'Ontem' },
          { key: '7d', label: '7 dias' },
          { key: '30d', label: '30 dias' },
          { key: 'mes', label: 'Este Mês' },
          { key: 'ano', label: 'Este Ano' },
          { key: 'personalizado', label: 'Personalizado' },
        ] as { key: Periodo; label: string }[]).map(p => (
          <button
            key={p.key}
            onClick={() => setPeriodo(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              periodo === p.key
                ? 'bg-blue-600 text-white'
                : 'bg-[var(--surface-100)] text-[var(--surface-500)] hover:text-[var(--surface-700)]'
            }`}
          >
            {p.label}
          </button>
        ))}
        {periodo === 'personalizado' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={periodoCustomDe}
              onChange={e => setPeriodoCustomDe(e.target.value)}
              className="px-2 py-1 rounded-lg border border-[var(--surface-200)] bg-[var(--surface-0)] text-[var(--surface-700)] text-xs"
            />
            <span className="text-xs text-[var(--surface-400)]">até</span>
            <input
              type="date"
              value={periodoCustomAte}
              onChange={e => setPeriodoCustomAte(e.target.value)}
              className="px-2 py-1 rounded-lg border border-[var(--surface-200)] bg-[var(--surface-0)] text-[var(--surface-700)] text-xs"
            />
          </div>
        )}
      </div>

      {/* Cards de contagem */}
      <div className="flex items-center gap-2 md:gap-3 mb-6">
        {/* Canceladas — compacto: ícone + count, sem label */}
        <button
          onClick={() => setFiltro('canceladas')}
          className={`card px-3 py-2.5 border-2 transition-all card-hover ${
            filtro === 'canceladas' ? 'border-red-500 bg-red-900/20' : 'border-[var(--surface-200)] hover:border-[var(--surface-300)]'
          }`}
          title="Canceladas"
        >
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-red-500 text-white shrink-0"><X className="h-4 w-4" /></div>
            <span className="text-lg font-bold text-[var(--shell-text)]">{canceladasCount}</span>
          </div>
        </button>

        {/* Status principais */}
        {([
          { key: 'pendentes' as Filtro, icon: <Clock className="h-4 w-4" />, label: 'Recebidas', count: pendentesCount, borderActive: 'border-amber-500 bg-amber-900/20', textActive: 'text-amber-400', iconBg: 'bg-amber-500' },
          { key: 'processadas' as Filtro, icon: <CheckCircle2 className="h-4 w-4" />, label: 'Processadas', count: processadasCount, borderActive: 'border-green-500 bg-green-900/20', textActive: 'text-green-400', iconBg: 'bg-green-500' },
          { key: 'contrato_criado' as Filtro, icon: <FileText className="h-4 w-4" />, label: 'Pipeline criado', count: contratoCriadoCount, borderActive: 'border-blue-500 bg-blue-900/20', textActive: 'text-blue-400', iconBg: 'bg-blue-500' },
        ]).map(s => (
          <button
            key={s.key}
            onClick={() => setFiltro(s.key)}
            className={`card px-3 py-2.5 border-2 transition-all card-hover flex-1 ${
              filtro === s.key ? s.borderActive : 'border-[var(--surface-200)] hover:border-[var(--surface-300)]'
            }`}
            title={s.label}
          >
            <div className="flex items-center gap-2 justify-center md:justify-start">
              <div className={`p-1.5 rounded-md ${s.iconBg} text-white shrink-0`}>{s.icon}</div>
              <span className={`hidden md:inline text-sm font-medium ${filtro === s.key ? s.textActive : 'text-[var(--shell-text-muted)]'}`}>{s.label}</span>
              <span className="text-lg font-bold text-[var(--shell-text)] md:ml-auto">{s.count}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Filtro ativo indicator — removido, navegação pelos cards é suficiente */}

      {/* Busca */}
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--surface-400)]" />
        <input
          type="text"
          placeholder="Buscar por nome, pet, CPF, telefone..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="input pl-10 pr-10"
        />
        {busca && (
          <button
            onClick={() => setBusca('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--surface-400)] hover:text-[var(--surface-600)]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card p-4 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      ) : fichas.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma ficha encontrada"
          description={busca ? 'Tente ajustar o termo de busca' : filtro === 'pendentes' ? 'Nenhuma ficha recebida para processamento' : 'Nenhuma ficha registrada'}
        />
      ) : (
        <div className="space-y-2 stagger-children">
          {fichas.map((ficha) => {
            const isPendente = !ficha.processada

            return (
              <div
                key={ficha.id}
                className="card px-3 py-2 card-hover transition-all"
              >
                <div className="flex gap-2.5">
                  {/* Badge IND/COL */}
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-white font-black text-[10px]" style={{
                    background: ficha.cremacao?.toLowerCase() === 'individual' ? '#16a34a' : '#7c3aed',
                  }}>
                    {ficha.cremacao?.toLowerCase() === 'individual' ? 'IND' : 'COL'}
                  </div>

                  {/* Info + Actions */}
                  <div className="min-w-0 flex-1">
                    {/* Linha 1: Pet + tags inline */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <span className="text-sm font-bold text-[var(--surface-800)] truncate">
                          {especieEmoji(ficha.especie)} {ficha.nome_pet?.toUpperCase()}
                        </span>
                        {ficha.peso && <span className="text-[9px] font-semibold text-[var(--surface-400)] bg-[var(--surface-100)] px-1 py-0.5 rounded">{ficha.peso}kg</span>}
                        {(() => {
                          const op = (ficha.op_dados || {}) as Record<string, unknown>
                          const vp = op.valorPlano ? parseFloat(String(op.valorPlano)) : ficha.valor
                          const dp = op.descontoPreVenda ? parseFloat(String(op.descontoPreVenda)) : 0
                          const dt = (op.descontoTipo as string) || 'valor'
                          const dr = dt === 'percentual' && vp ? (vp * dp) / 100 : dp
                          const vFinal = vp ? Math.max(vp - dr, 0) : null
                          return vFinal != null ? <span className="text-[10px] font-bold text-green-500 text-mono">R${vFinal.toLocaleString('pt-BR')}</span> : null
                        })()}
                        <span className="text-[9px] text-[var(--surface-500)]">{formatarDisplay(ficha.pagamento)}{ficha.parcelas ? ` ${ficha.parcelas}` : ''}</span>
                      </div>
                      {/* Status badge */}
                      {isCancelada(ficha) ? <Badge variant="error" dot>Cancelada</Badge> : isPendente ? <Badge variant="warning" dot>Recebida</Badge> : ficha.contrato_id ? <Badge variant="info" dot>Pipeline criado</Badge> : <Badge variant="success" dot>Processada</Badge>}
                    </div>

                    {/* Linha 2: Tutor + meta */}
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-[var(--surface-500)] flex-wrap">
                      <span className="truncate max-w-[130px] sm:max-w-[200px]" title={ficha.nome_completo}>{ficha.nome_completo}</span>
                      {ficha.telefone && (
                        <a href={`https://wa.me/${getTelefoneAtuante(ficha)}`} target="_blank" rel="noopener noreferrer"
                          className="text-green-400 hover:text-green-300" onClick={e => e.stopPropagation()}>
                          <Phone className="h-3 w-3" />
                        </a>
                      )}
                      {ficha.como_conheceu && ficha.como_conheceu.length > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          {ficha.como_conheceu.map(opt => {
                            const cfg = FICHA_FONTE_ICONS[opt]
                            if (!cfg) return null
                            return (
                              <span
                                key={opt}
                                className="w-4 h-4 rounded-full inline-flex items-center justify-center overflow-hidden shrink-0"
                                style={{
                                  background: 'linear-gradient(135deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)',
                                  border: '1px solid #cbd5e1',
                                }}
                                title={cfg.title}
                              >
                                {cfg.img ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img src={cfg.img} alt={cfg.title} className="w-2.5 h-2.5 object-contain" />
                                ) : (
                                  <span className="text-[9px] leading-none">{cfg.icon}</span>
                                )}
                              </span>
                            )
                          })}
                        </span>
                      )}
                      <span className="text-[var(--surface-200)]">|</span>
                      <span className="inline-flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{(() => {
                        const op = (ficha.op_dados || {}) as Record<string, unknown>
                        if (op.localColeta) {
                          const lc = op.localColeta as string
                          if (lc === 'clinica') return (op.estabNome as string) || (op.clinicaTextoLivre as string) || ficha.localizacao
                          if (lc === 'outro') return (op.enderecoOutro as string) || ficha.localizacao_outra || 'Outro'
                          if (lc === 'residencia') return 'Residência'
                          if (lc === 'unidade') return 'Unidade'
                        }
                        return ficha.localizacao || '-'
                      })()}</span>
                      {!isPendente && (() => {
                        const op = (ficha.op_dados || {}) as Record<string, unknown>
                        const lacreVal = op.lacre ? String(op.lacre) : null
                        return lacreVal ? <span className="text-[10px] text-[var(--surface-500)] bg-[var(--surface-100)] px-1 py-0.5 rounded">Lacre: {lacreVal}</span> : null
                      })()}
                      <span className="inline-flex items-center gap-0.5 text-[var(--surface-400)]"><Clock className="h-2.5 w-2.5" />{tempoRelativo(ficha.created_at)}</span>
                      {/* Processado por */}
                      {!isPendente && ficha.op_dados && (() => {
                        const nome = (ficha.op_dados as Record<string, unknown>).processadoPorNome
                        return nome ? <span className="text-[var(--surface-400)] italic">por {String(nome)}</span> : null
                      })()}
                      {/* Acolhimento + alertas (só processadas) */}
                      {!isPendente && ficha.op_dados && (() => {
                        const op = ficha.op_dados as Record<string, unknown>
                        const tags: React.ReactNode[] = []
                        // Data/hora
                        if (op.semDataHora) tags.push(<span key="dh" className="text-amber-400">Acolhimento: a definir</span>)
                        else if (op.dataHoraAcolhimento) tags.push(
                          <span key="dh" className="font-semibold text-amber-400 bg-amber-900/20 px-1 py-0.5 rounded">
                            Acolhido em: {new Date(String(op.dataHoraAcolhimento)).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )
                        // Pendências
                        const p: string[] = []
                        if (op.semLocal) p.push('Local')
                        if (op.semResponsavel) p.push('Resp.')
                        if (op.semDataHora) p.push('D/H')
                        if (op.semLacre) p.push('Lacre')
                        if (p.length > 0) tags.push(<span key="pend" className="font-semibold text-amber-400 bg-amber-900/20 px-1 py-0.5 rounded">Sem: {p.join(', ')}</span>)
                        return tags.length > 0 ? <>{tags}</> : null
                      })()}
                    </div>
                    {/* Linha 3: Actions */}
                    <div className="flex items-center gap-1.5 mt-1">
                    {isCancelada(ficha) ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-red-400 italic">
                          {(() => {
                            const op = (ficha.op_dados as Record<string, unknown>) || {}
                            const quem = op.cancelada_por ? String(op.cancelada_por) : ''
                            const quando = op.cancelada_em ? new Date(String(op.cancelada_em)).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
                            return `${quem}${quando ? ` em ${quando}` : ''}`
                          })()}
                        </span>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            const supabaseLocal = createClient()
                            const opAtual = (ficha.op_dados || {}) as Record<string, unknown>
                            const { cancelada, cancelada_em, cancelada_por, ...opSemCancelamento } = opAtual
                            await supabaseLocal.from('fichas').update({
                              processada: false,
                              op_dados: opSemCancelamento,
                            } as never).eq('id', ficha.id)
                            carregarFichas()
                            carregarContagens()
                          }}
                          className="btn-secondary text-[10px] py-1 px-2 whitespace-nowrap text-amber-400 border-amber-500/30"
                        >
                          Reabrir
                        </button>
                      </div>
                    ) : isPendente ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (!confirm(`Cancelar ficha de ${ficha.nome_pet || ficha.nome_completo}?`)) return
                            const supabaseLocal = createClient()
                            await supabaseLocal.from('fichas').update({
                              processada: true,
                              op_dados: { cancelada: true, cancelada_em: new Date().toISOString(), cancelada_por: userId || 'unknown' },
                            } as never).eq('id', ficha.id)
                            setFiltro('canceladas')
                            carregarFichas()
                            carregarContagens()
                          }}
                          className="btn-ghost text-xs py-1.5 px-2 text-red-400 hover:bg-red-900/20 whitespace-nowrap"
                          title="Cancelar ficha"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={async (e) => {
                            e.stopPropagation()
                            const btn = e.currentTarget
                            const msg = montarMsgWhatsApp(ficha)
                            await navigator.clipboard.writeText(msg)
                            btn.classList.add('text-emerald-400')
                            setTimeout(() => btn.classList.remove('text-emerald-400'), 1500)
                          }}
                          className="flex items-center justify-center w-8 h-8 rounded-full border border-[var(--surface-200)] text-[var(--surface-400)] hover:text-blue-400 hover:border-blue-500/30 transition-colors" title="Copiar informações">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); abrirWhatsAppComMsg(ficha) }}
                          className="flex items-center justify-center w-8 h-8 rounded-full hover:opacity-80 transition-opacity" title="WhatsApp">
                          <img src="/wts-icon.png" alt="WhatsApp" className="w-8 h-8 object-contain" />
                        </button>
                        <button
                          onClick={() => { setModalSomenteLeitura(true); setFichaModal(ficha) }}
                          className="btn-secondary text-xs py-1.5 px-3 whitespace-nowrap"
                        >
                          Visualizar Ficha
                        </button>
                        <button
                          onClick={() => { setModalSomenteLeitura(false); setFichaModal(ficha) }}
                          className="btn-primary text-xs py-1.5 px-3 whitespace-nowrap"
                          style={{ background: 'var(--brand-600)' }}
                        >
                          Processar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {!ficha.contrato_id && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              const supabaseLocal = createClient()
                              await supabaseLocal.from('fichas').update({ processada: false } as never).eq('id', ficha.id)
                              carregarFichas()
                              carregarContagens()
                              setTimeout(() => setFichaModal({ ...ficha, processada: false } as Ficha), 300)
                            }}
                            className="flex items-center justify-center w-8 h-8 rounded-full border border-amber-500/30 text-amber-400 hover:bg-amber-900/20 transition-colors"
                            title="Reprocessar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={async (e) => {
                            e.stopPropagation()
                            const btn = e.currentTarget
                            const msg = montarMsgWhatsApp(ficha)
                            await navigator.clipboard.writeText(msg)
                            btn.classList.add('text-emerald-400')
                            setTimeout(() => btn.classList.remove('text-emerald-400'), 1500)
                          }}
                          className="flex items-center justify-center w-8 h-8 rounded-full border border-[var(--surface-200)] text-[var(--surface-400)] hover:text-blue-400 hover:border-blue-500/30 transition-colors" title="Copiar informações">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); abrirWhatsAppComMsg(ficha) }}
                          className="flex items-center justify-center w-8 h-8 rounded-full hover:opacity-80 transition-opacity" title="WhatsApp">
                          <img src="/wts-icon.png" alt="WhatsApp" className="w-8 h-8 object-contain" />
                        </button>
                        {ficha.op_dados && isVisible('tela_fichas', 'btn_pdf_ficha') && (
                          <button onClick={(e) => { e.stopPropagation(); gerarPdfFicha(ficha) }}
                            className="flex items-center justify-center w-8 h-8 rounded-full hover:opacity-80 transition-opacity" title="PDF">
                            <img src="/pdf-icon.png" alt="PDF" className="w-7 h-7 object-contain" />
                          </button>
                        )}
                        <button onClick={() => setFichaModal(ficha)}
                          className="btn-primary text-xs py-1.5 px-3 whitespace-nowrap" style={{ background: 'var(--brand-600)' }}>
                          Visualizar Ficha
                        </button>
                      </div>
                    )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de tratativa */}
      <TratativaModal
        isOpen={!!fichaModal}
        onClose={(resultado?: 'processada' | 'contrato') => {
          setFichaModal(null)
          setModalSomenteLeitura(false)
          if (resultado === 'contrato') setFiltro('contrato_criado')
          else if (resultado === 'processada') setFiltro('processadas')
          // Não chamar carregarFichas/carregarContagens aqui — useEffect dispara via [filtro]
          // e evita race condition (request com filtro antigo sobrescrevia o novo)
        }}
        ficha={fichaModal}
        onSuccess={handleSuccess}
        somenteLeitura={modalSomenteLeitura}
        onRetornarPendente={() => {
          setFichaModal(null)
          carregarFichas()
          carregarContagens()
        }}
        onReprocessar={(fichaReprocessar) => {
          // Fecha, recarrega, e reabre a ficha em modo edição (agora como recebida)
          setFichaModal(null)
          carregarFichas()
          carregarContagens()
          // Reabrir com pequeno delay pra garantir que o state atualizou
          setTimeout(() => setFichaModal({ ...fichaReprocessar, processada: false } as Ficha), 300)
        }}
        onAtualizar={() => {
          carregarFichas()
          carregarContagens()
        }}
      />
    </div>
  )
}
