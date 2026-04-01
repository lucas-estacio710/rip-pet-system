'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Search, X, Clock, CheckCircle2, Phone, MapPin, Stethoscope, ArrowRight, MessageCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useDebounce } from '@/hooks/useDebounce'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import TratativaModal from '@/components/fichas/TratativaModal'
import { useUnit } from '@/contexts/UnitContext'

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

type Filtro = 'pendentes' | 'processadas' | 'todas'

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

  const [fichas, setFichas] = useState<Ficha[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('pendentes')
  const [busca, setBusca] = useState('')
  const buscaDebounced = useDebounce(busca, 300)

  // Counts
  const [pendentesCount, setPendentesCount] = useState(0)
  const [processadasCount, setProcessadasCount] = useState(0)

  // Modal
  const [fichaModal, setFichaModal] = useState<Ficha | null>(null)

  // Load data — recarrega quando muda de unidade
  useEffect(() => {
    carregarContagens()
    carregarFichas()
  }, [currentUnit?.id])

  // Realtime — escuta novas fichas e atualizações
  useEffect(() => {
    const channel = supabase
      .channel('fichas-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fichas' }, () => {
        carregarFichas()
        carregarContagens()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [currentUnit?.id, filtro, buscaDebounced])

  useEffect(() => {
    carregarFichas()
  }, [filtro, buscaDebounced])

  async function carregarContagens() {
    if (!currentUnit) { setLoading(false); return }
    let pendQuery = supabase.from('fichas').select('*', { count: 'exact', head: true }).or('processada.is.null,processada.eq.false')
    let procQuery = supabase.from('fichas').select('*', { count: 'exact', head: true }).eq('processada', true)

    if (currentUnit) {
      pendQuery = pendQuery.eq('unidade_id', currentUnit.id)
      procQuery = procQuery.eq('unidade_id', currentUnit.id)
    }

    const [{ count: pend }, { count: proc }] = await Promise.all([pendQuery, procQuery])
    setPendentesCount(pend || 0)
    setProcessadasCount(proc || 0)
  }

  async function carregarFichas() {
    if (!currentUnit) { setLoading(false); return }
    setLoading(true)

    let query = supabase
      .from('fichas')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    // Filtrar por unidade
    if (currentUnit) {
      query = query.eq('unidade_id', currentUnit.id)
    }

    // Filter
    if (filtro === 'pendentes') {
      query = query.or('processada.is.null,processada.eq.false')
    } else if (filtro === 'processadas') {
      query = query.eq('processada', true)
    }

    // Search (sanitize to prevent PostgREST filter injection)
    if (buscaDebounced.trim()) {
      const termo = buscaDebounced.trim().replace(/[,.()"'\\]/g, '')
      if (termo) {
        query = query.or(`nome_completo.ilike.%${termo}%,nome_pet.ilike.%${termo}%,cpf.ilike.%${termo}%,telefone.ilike.%${termo}%`)
      }
    }

    const { data, error } = await query

    if (error) {
      console.error('Erro ao carregar fichas:', error)
    } else {
      setFichas((data || []) as Ficha[])
    }

    setLoading(false)
  }

  function handleSuccess(contratoId: string) {
    setFichaModal(null)
    carregarFichas()
    carregarContagens()
    router.push(`/contratos/${contratoId}`)
  }

  function montarMsgWhatsApp(ficha: Ficha): string {
    const cremacao = ficha.cremacao || ''
    const valor = ficha.valor ? `R$ ${ficha.valor.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : ''
    const pagamento = ficha.pagamento || ''
    const velorio = ficha.velorio || ''
    const acompanhamento = ficha.acompanhamento || ''
    const dataEnvio = new Date(ficha.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

    let msg = `Dados Enviados em ${dataEnvio}\nVerifique se as informações abaixo estão corretas:\n\n`

    const outrosNomes = ficha.outros_tutores?.filter(Boolean)
    const nomesCertificado = [ficha.nome_completo?.toUpperCase(), ...(outrosNomes || []).map(n => n.toUpperCase())].filter(Boolean).join(', ')

    msg += `*- DADOS DO TUTOR:*\n`
    msg += `*Nome p/ Contrato e Certificado:* ${nomesCertificado}\n`
    msg += `*Telefone Contato:* ${ficha.telefone} | *CPF:* ${ficha.cpf}\n`
    if (ficha.email) msg += `*Email:* ${ficha.email}\n`
    msg += `*Endereço:* ${ficha.endereco} ${ficha.numero}${ficha.complemento ? ` - ${ficha.complemento}` : ''} - ${ficha.bairro}\n`
    msg += `*CEP:* ${ficha.cep} | *Cidade:* ${ficha.cidade} | *UF:* ${ficha.estado}\n`

    msg += `\n*- DADOS DO PET:*\n`
    msg += `*Nome:* ${ficha.nome_pet?.toUpperCase()}\n`
    msg += `*Espécie:* ${ficha.especie} | *Raça:* ${ficha.raca || 'Não tem'}\n`
    msg += `*Idade:* ${ficha.idade || '-'} | *Gênero:* ${ficha.genero}\n`
    msg += `*Cor:* ${ficha.cor} | *Peso Aproximado:* ${ficha.peso || '-'}\n`
    msg += `*Localização:* ${ficha.localizacao}${ficha.localizacao_outra ? ` (${ficha.localizacao_outra})` : ficha.localizacao?.includes('Residência') ? ' (Endereço de Cadastro)' : ''}\n`

    msg += `\n*- DADOS DA CREMAÇÃO:*\n`
    msg += `*Cremação Escolhida:* ${cremacao} | *Valor:* ${valor || '-'}\n`
    msg += `*Forma de Pagamento:* ${pagamento}${ficha.parcelas ? ` ${ficha.parcelas}` : ''}\n`
    msg += `*Velório:* ${velorio}\n`
    msg += `*Acompanhamento da Cremação:* ${acompanhamento}\n`

    if (ficha.como_conheceu && ficha.como_conheceu.length > 0) {
      msg += `\n*Como nos Conheceu:* ${ficha.como_conheceu.join(', ')}`
      if (ficha.veterinario_especificar) msg += ` (${ficha.veterinario_especificar})`
    }

    if (ficha.observacoes) {
      msg += `\n\n*Observações:* ${ficha.observacoes}`
    }

    return msg
  }

  function abrirWhatsApp(ficha: Ficha) {
    const tel = ficha.telefone?.replace(/\D/g, '') || ''
    const msg = encodeURIComponent(montarMsgWhatsApp(ficha))
    window.open(`https://wa.me/55${tel}?text=${msg}`, '_blank')
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
            <p className="text-small text-[var(--shell-text-muted)]">Fichas enviadas por tutores via WhatsApp</p>
          </div>
        </div>
      </div>

      {/* Cards de contagem */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={() => setFiltro(filtro === 'pendentes' ? 'todas' : 'pendentes')}
          className={`card p-4 border-2 transition-all card-hover ${
            filtro === 'pendentes'
              ? 'border-amber-500 bg-amber-900/20'
              : 'border-[var(--surface-200)] hover:border-[var(--surface-300)]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500 text-white">
              <Clock className="h-5 w-5" />
            </div>
            <div className="text-left">
              <p className={`text-sm font-medium ${filtro === 'pendentes' ? 'text-amber-400' : 'text-[var(--shell-text-muted)]'}`}>Recebidas</p>
              <p className="text-2xl font-bold text-[var(--shell-text)]">{pendentesCount}</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setFiltro(filtro === 'processadas' ? 'todas' : 'processadas')}
          className={`card p-4 border-2 transition-all card-hover ${
            filtro === 'processadas'
              ? 'border-green-500 bg-green-900/20'
              : 'border-[var(--surface-200)] hover:border-[var(--surface-300)]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500 text-white">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="text-left">
              <p className={`text-sm font-medium ${filtro === 'processadas' ? 'text-green-400' : 'text-[var(--shell-text-muted)]'}`}>Processadas</p>
              <p className="text-2xl font-bold text-[var(--shell-text)]">{processadasCount}</p>
            </div>
          </div>
        </button>
      </div>

      {/* Filtro ativo indicator */}
      {filtro !== 'pendentes' && (
        <div className="mb-4 flex items-center justify-between bg-[var(--surface-50)] rounded-lg px-4 py-2 border border-[var(--surface-200)]">
          <span className="text-sm text-[var(--surface-500)]">
            Filtrando: <strong>{filtro === 'processadas' ? 'Processadas' : 'Todas'}</strong>
          </span>
          <button
            onClick={() => setFiltro('pendentes')}
            className="text-sm text-amber-500 hover:text-amber-400 font-medium"
          >
            Voltar para recebidas
          </button>
        </div>
      )}

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
                className="card p-4 card-hover transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    {/* Pet name + badges */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-base font-semibold text-[var(--surface-800)]">
                        {especieEmoji(ficha.especie)} {ficha.nome_pet}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
                        background: ficha.cremacao?.toLowerCase() === 'individual' ? '#16a34a' : '#7c3aed',
                        color: '#fff',
                      }}>
                        {ficha.cremacao?.toLowerCase() === 'individual' ? 'IND' : 'COL'}
                      </span>
                      {ficha.valor != null && (
                        <span className="text-xs font-bold text-green-500 text-mono">
                          R$ {ficha.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                      {isPendente ? (
                        <Badge variant="warning" dot>Recebida</Badge>
                      ) : (
                        <Badge variant="success" dot>Processada</Badge>
                      )}
                    </div>

                    {/* Tutor + phone */}
                    <div className="flex items-center gap-3 flex-wrap text-sm text-[var(--surface-600)] mb-1">
                      <span>
                        {ficha.nome_completo}
                        {ficha.outros_tutores && ficha.outros_tutores.filter(Boolean).length > 0 && (
                          <span className="text-xs text-[var(--surface-400)]"> +{ficha.outros_tutores.filter(Boolean).length}</span>
                        )}
                      </span>
                      {ficha.telefone && (
                        <a
                          href={`https://wa.me/55${ficha.telefone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-green-400 hover:text-green-300"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Phone className="h-3.5 w-3.5" />
                          <span className="text-mono text-xs">{formatarTelefone(ficha.telefone)}</span>
                        </a>
                      )}
                    </div>

                    {/* Location + time */}
                    <div className="flex items-center gap-3 flex-wrap text-xs text-[var(--surface-400)]">
                      {(ficha.cidade || ficha.bairro) && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {ficha.bairro ? `${ficha.bairro}, ` : ''}{ficha.cidade}
                        </span>
                      )}
                      {ficha.veterinario_especificar && (
                        <span className="inline-flex items-center gap-1">
                          <Stethoscope className="h-3 w-3" />
                          {ficha.veterinario_especificar}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {tempoRelativo(ficha.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Action button */}
                  <div className="flex-shrink-0">
                    {isPendente ? (
                      <button
                        onClick={() => setFichaModal(ficha)}
                        className="btn-primary text-sm py-2 px-4 whitespace-nowrap"
                        style={{ background: 'var(--brand-600)' }}
                      >
                        Processar
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); abrirWhatsApp(ficha) }}
                          className="flex items-center justify-center w-9 h-9 rounded-full bg-green-600 text-white hover:bg-green-700 transition-colors"
                          title="Enviar confirmação por WhatsApp"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setFichaModal(ficha)}
                          className="btn-primary text-sm py-2 px-3 whitespace-nowrap"
                          style={{ background: ficha.contrato_id ? 'var(--surface-500)' : 'var(--brand-600)' }}
                        >
                          {ficha.contrato_id ? 'Visualizar' : 'Criar Contrato'}
                        </button>
                        {/* TODO: Iniciar Pipeline — habilitar quando pipeline estiver pronto */}
                        {false && ficha.contrato_id && (
                          <button
                            onClick={() => router.push(`/contratos/${ficha.contrato_id}`)}
                            className="btn-secondary text-sm py-2 px-3 whitespace-nowrap"
                          >
                            Iniciar Pipeline
                          </button>
                        )}
                      </div>
                    )}
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
        onClose={() => { setFichaModal(null); carregarFichas(); carregarContagens() }}
        ficha={fichaModal}
        onSuccess={handleSuccess}
        onRetornarPendente={() => {
          setFichaModal(null)
          carregarFichas()
          carregarContagens()
        }}
      />
    </div>
  )
}
