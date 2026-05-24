'use client'

import { use, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Pencil, Star, MapPin, Phone, Mail, Instagram, Globe, Calendar, Users, FileText, History, Stethoscope, ExternalLink, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import VisitaModal, { VisitaData } from '@/components/clinicas/VisitaModal'

// ============================================
// Tipos
// ============================================
type Estabelecimento = {
  id: string
  unidade_id: string | null
  nome: string
  tipo: string | null
  endereco: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  telefone: string | null
  email: string | null
  website: string | null
  instagram: string | null
  whatsapp: string | null
  horario_funcionamento: string | null
  latitude: number | null
  longitude: number | null
  relacionamento: number | null
  observacoes: string | null
  fotos: string[] | null
  ultima_visita: string | null
  criado_em: string | null
  atualizado_em: string | null
  porte_equipe: string | null
  veterinarios_fixos: number | null
  veterinarios_volantes: number | null
  ilha_de_exibicao: string[] | null
  politica_concorrencia: string | null
  concorrentes_presentes: string[] | null
  qtde_media_obitos_mensal: number | null
  percentual_prefeitura: number | null
  valor_prefeitura_10kg: number | null
  modelo_gratificacao: string | null
  estrategia: string | null
}

type Contato = {
  id: string
  nome: string | null
  cargo: string | null
  especialidade: string | null
  telefone: string | null
  whatsapp: string | null
  email: string | null
  observacoes: string | null
}

type Visita = {
  id: string
  data_visita: string | null
  data_proximo_contato: string | null
  tipo_visita: string | null
  duracao_minutos: number | null
  objetivo: string | null
  observacoes: string | null
  proximos_passos: string | null
  temperatura_pos_visita: string | null
  status: string | null
  contato_realizado: string | null
  cargo_contato: string | null
  potencial_negocio: string | null
}

type ContratoVinculado = {
  id: string
  codigo: string | null
  pet_nome: string | null
  pet_especie: string | null
  tutor_nome: string | null
  status: string | null
  data_acolhimento: string | null
}

type IndicacaoVinculada = {
  id: string
  codigo: string | null
  pet_nome: string | null
  tutor_nome: string | null
  status: string | null
  data_contrato: string | null
}

type HistoricoItem = {
  id: string
  campo: string | null
  campo_label: string | null
  valor_anterior: string | null
  valor_novo: string | null
  tipo: string | null
  criado_em: string | null
  alterado_por_email: string | null
}

// ============================================
// Helpers
// ============================================
const TIPO_LABELS: Record<string, string> = {
  clinica: 'Clínica', hospital: 'Hospital', pet_shop: 'Pet Shop', petshop: 'Pet Shop',
  'casa-racao': 'Casa de Ração', laboratorio: 'Laboratório', autonomo: 'Autônomo',
  veterinario: 'Veterinário', outro: 'Outro',
}

const TIPO_ICONES: Record<string, string> = {
  clinica: '🏥', hospital: '🏨', pet_shop: '🐾', petshop: '🐾',
  'casa-racao': '🍖', laboratorio: '🔬', autonomo: '👤', veterinario: '🩺', outro: '🏢',
}

const POLITICA_INFO: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  parceiro_exclusivo_nosso: { label: 'Exclusivo conosco', bg: 'bg-green-500', text: 'text-white', icon: '⭐' },
  parceiro_exclusivo_outro: { label: 'Exclusivo com outro', bg: 'bg-red-500', text: 'text-white', icon: '🚫' },
  aberto_todos: { label: 'Aberto a todos', bg: 'bg-blue-500', text: 'text-white', icon: '🔓' },
  seletivo: { label: 'Seletivo', bg: 'bg-yellow-500', text: 'text-white', icon: '🎯' },
  nao_indica: { label: 'Não indica', bg: 'bg-gray-500', text: 'text-white', icon: '❌' },
}

const PORTE_LABELS: Record<string, string> = {
  ate_5: 'Até 5 funcionários', '5_10': '5 a 10 funcionários',
  '10_15': '10 a 15 funcionários', mais_15: 'Mais de 15 funcionários',
}

const GRATIFICACAO_LABELS: Record<string, string> = {
  direto_clinica: 'Direto para clínica', direto_veterinarios: 'Direto para veterinários',
  indireto_veterinarios: 'Indireto para veterinários', brindes_tutores: 'Brindes para tutores',
  desconto_tutores: 'Desconto para tutores', nao_aceita: 'Não aceita',
}

const CONCORRENTE_LABELS: Record<string, string> = {
  pet_memorial: 'Pet Memorial', allma: 'Allma', luna_pet: 'Luna Pet',
  pet_assistencia: 'Pet Assistência', eden_pet: 'Eden Pet', mypetmemo: 'MyPetMemo',
}

const ILHA_LABELS: Record<string, string> = {
  recepcao: 'Recepção', consultorios: 'Consultórios',
  veterinarios: 'Direto com veterinários', nenhum: 'Nenhum local',
}

function formatTelefone(tel: string | null): string {
  if (!tel) return ''
  const d = tel.replace(/\D/g, '')
  if (d.length === 13 && d.startsWith('55')) return `(${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  return tel
}

function whatsappLink(tel: string | null | undefined): string {
  if (!tel) return ''
  const d = tel.replace(/\D/g, '')
  const num = (d.length === 10 || d.length === 11) ? '55' + d : d
  return `https://wa.me/${num}`
}

// ============================================
// Componente principal
// ============================================
export default function ClinicaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { hasModule } = useUnit()
  const supabase = createClient()

  const [estab, setEstab] = useState<Estabelecimento | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'info' | 'inteligencia' | 'visitas' | 'contatos' | 'historico' | 'pets' | 'indicacoes'>('info')

  // Datasets carregados sob demanda por aba
  const [contatos, setContatos] = useState<Contato[]>([])
  const [visitas, setVisitas] = useState<Visita[]>([])
  const [pets, setPets] = useState<ContratoVinculado[]>([])
  const [indicacoes, setIndicacoes] = useState<IndicacaoVinculada[]>([])
  const [historico, setHistorico] = useState<HistoricoItem[]>([])
  const [loadingAba, setLoadingAba] = useState(false)
  const [visitaEditando, setVisitaEditando] = useState<VisitaData | 'nova' | null>(null)

  // Carregar estabelecimento principal
  useEffect(() => {
    let cancelado = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('estabelecimentos')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (cancelado) return
      if (error) console.error('Erro estabelecimento:', error)
      setEstab(data as Estabelecimento | null)
      setLoading(false)
    }
    load()
    return () => { cancelado = true }
  }, [id, supabase])

  // Carrega dataset da aba atual sob demanda
  const carregarAba = useCallback(async (abaAtiva: typeof tab) => {
    if (!estab) return
    setLoadingAba(true)
    try {
      if (abaAtiva === 'contatos' && contatos.length === 0) {
        const { data } = await supabase
          .from('contatos')
          .select('id, nome, cargo, especialidade, telefone, whatsapp, email, observacoes')
          .eq('estabelecimento_id', id)
          .eq('ativo', true)
          .order('nome')
        setContatos((data || []) as Contato[])
      } else if (abaAtiva === 'visitas' && visitas.length === 0) {
        const { data } = await supabase
          .from('visitas')
          .select('id, data_visita, data_proximo_contato, tipo_visita, duracao_minutos, objetivo, observacoes, proximos_passos, temperatura_pos_visita, status, contato_realizado, cargo_contato, potencial_negocio')
          .eq('estabelecimento_id', id)
          .order('data_visita', { ascending: false })
          .limit(100)
        setVisitas((data || []) as Visita[])
      } else if (abaAtiva === 'pets' && pets.length === 0) {
        const { data } = await supabase
          .from('contratos')
          .select('id, codigo, pet_nome, pet_especie, tutor_nome, status, data_acolhimento')
          .eq('estabelecimento_id', id)
          .order('data_acolhimento', { ascending: false })
          .limit(50)
        setPets((data || []) as ContratoVinculado[])
      } else if (abaAtiva === 'indicacoes' && indicacoes.length === 0) {
        const { data } = await supabase
          .from('contratos')
          .select('id, codigo, pet_nome, tutor_nome, status, data_contrato')
          .eq('estabelecimento_indicacao_id', id)
          .order('data_contrato', { ascending: false })
          .limit(50)
        setIndicacoes((data || []) as IndicacaoVinculada[])
      } else if (abaAtiva === 'historico' && historico.length === 0) {
        const { data } = await supabase
          .from('historico_alteracoes')
          .select('id, campo, campo_label, valor_anterior, valor_novo, tipo, criado_em, alterado_por_email')
          .eq('entidade', 'estabelecimentos')
          .eq('entidade_id', id)
          .order('criado_em', { ascending: false })
          .limit(50)
        setHistorico((data || []) as HistoricoItem[])
      }
    } finally {
      setLoadingAba(false)
    }
  }, [estab, id, supabase, contatos.length, visitas.length, pets.length, indicacoes.length, historico.length])

  useEffect(() => { carregarAba(tab) }, [tab, carregarAba])

  const recarregarVisitas = useCallback(async () => {
    setLoadingAba(true)
    const { data } = await supabase
      .from('visitas')
      .select('id, data_visita, data_proximo_contato, tipo_visita, duracao_minutos, objetivo, observacoes, proximos_passos, temperatura_pos_visita, status, contato_realizado, cargo_contato, potencial_negocio')
      .eq('estabelecimento_id', id)
      .order('data_visita', { ascending: false })
      .limit(100)
    setVisitas((data || []) as Visita[])
    setLoadingAba(false)
  }, [id, supabase])

  async function salvarRelacionamento(novo: number) {
    if (!estab) return
    const { error } = await supabase.from('estabelecimentos').update({ relacionamento: novo } as never).eq('id', id)
    if (error) {
      console.error('Erro relacionamento:', error)
      return
    }
    setEstab({ ...estab, relacionamento: novo })
  }

  // FLS gate
  if (!hasModule('tela_clinicas')) {
    return (
      <div className="p-8 text-center">
        <p className="text-[var(--surface-500)]">Esta tela não está habilitada para sua unidade.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-500 mx-auto mb-3"></div>
          <p className="text-[var(--surface-400)] text-sm">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!estab) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">🔍</div>
        <h1 className="text-xl font-bold mb-2 text-[var(--shell-text)]">Clínica não encontrada</h1>
        <Link href="/clinicas" className="text-cyan-500 hover:underline">← Voltar</Link>
      </div>
    )
  }

  const tipo = estab.tipo || 'outro'
  const tipoLabel = TIPO_LABELS[tipo] || tipo
  const tipoIcone = TIPO_ICONES[tipo] || '🏢'
  const politica = estab.politica_concorrencia ? POLITICA_INFO[estab.politica_concorrencia] : null
  const diasDesdeVisita = estab.ultima_visita
    ? Math.floor((Date.now() - new Date(estab.ultima_visita).getTime()) / (1000 * 60 * 60 * 24))
    : null

  const tabs = [
    { id: 'info' as const, label: 'Informações', icon: FileText },
    { id: 'inteligencia' as const, label: 'Inteligência', icon: Star },
    { id: 'visitas' as const, label: 'Visitas', icon: Calendar, count: visitas.length },
    { id: 'contatos' as const, label: 'Contatos', icon: Users, count: contatos.length },
    { id: 'historico' as const, label: 'Histórico', icon: History },
    { id: 'pets' as const, label: 'Pets removidos', icon: Stethoscope, count: pets.length },
    { id: 'indicacoes' as const, label: 'Indicações', icon: ExternalLink, count: indicacoes.length },
  ]

  return (
    <div className="space-y-4 pb-6 animate-fade-in">
      {/* Header com foto/cover */}
      <div className="rounded-xl overflow-hidden bg-[var(--surface-0)] border border-[var(--surface-200)] shadow-md">
        <div className="relative h-48 sm:h-56 bg-gradient-to-br from-cyan-500/20 to-cyan-700/40">
          {estab.fotos?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={estab.fotos[0]} alt={estab.nome} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-6xl opacity-30">{tipoIcone}</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

          {/* Botão voltar */}
          <button
            onClick={() => router.back()}
            className="absolute top-3 left-3 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white transition-colors"
            title="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Ações */}
          <div className="absolute top-3 right-3 flex gap-2">
            <Link
              href={`/clinicas/${id}/editar`}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white/90 hover:bg-white text-gray-800 text-sm font-medium rounded-lg transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Editar
            </Link>
          </div>

          {/* Nome + tipo */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <div className="flex items-end justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="px-2 py-0.5 bg-white/20 backdrop-blur text-white text-xs rounded-full">
                    {tipoIcone} {tipoLabel}
                  </span>
                  {politica && (
                    <span className={`px-2 py-0.5 ${politica.bg} ${politica.text} text-xs rounded-full`}>
                      {politica.icon} {politica.label}
                    </span>
                  )}
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-white drop-shadow-lg truncate">{estab.nome}</h1>
                <p className="text-white/80 text-sm">
                  <MapPin className="inline w-3 h-3 mr-0.5" />
                  {estab.bairro ? `${estab.bairro} - ` : ''}{estab.cidade}{estab.estado ? `, ${estab.estado}` : ''}
                </p>
              </div>

              {/* Estrelas relacionamento */}
              <div className="flex flex-col items-end shrink-0">
                <div className="flex gap-0.5 mb-1">
                  {[1, 2, 3, 4, 5].map(s => (
                    <button
                      key={s}
                      onClick={() => salvarRelacionamento(s === estab.relacionamento ? 0 : s)}
                      className={`text-2xl transition-transform hover:scale-110 drop-shadow ${
                        s <= (estab.relacionamento || 0) ? 'text-yellow-400' : 'text-white/40'
                      }`}
                      title={`${s} estrela${s > 1 ? 's' : ''}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <span className="text-white/70 text-xs">
                  {(estab.relacionamento || 0) === 0 ? 'Não pontuado' : `${estab.relacionamento}/5`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Indicadores rápidos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-[var(--surface-50)]">
          <div className="text-center">
            <p className="text-2xl font-bold text-cyan-600">{estab.veterinarios_fixos ?? 0}</p>
            <p className="text-xs text-[var(--surface-500)]">Vets Fixos</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-orange-500">{estab.qtde_media_obitos_mensal ?? '?'}</p>
            <p className="text-xs text-[var(--surface-500)]">Óbitos/mês</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-500">{visitas.length || '—'}</p>
            <p className="text-xs text-[var(--surface-500)]">Visitas</p>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-bold ${
              diasDesdeVisita === null ? 'text-purple-500'
                : diasDesdeVisita > 30 ? 'text-red-500'
                : 'text-green-500'
            }`}>
              {diasDesdeVisita === null ? '∞' : diasDesdeVisita}
            </p>
            <p className="text-xs text-[var(--surface-500)]">Dias s/ visita</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-xl overflow-hidden bg-[var(--surface-0)] border border-[var(--surface-200)]">
        <div className="flex border-b border-[var(--surface-200)] overflow-x-auto">
          {tabs.map(t => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 px-3 py-2.5 text-xs font-semibold transition-colors border-b-2 inline-flex items-center gap-1.5 ${
                  active
                    ? 'border-cyan-500 text-cyan-600 bg-cyan-500/5'
                    : 'border-transparent text-[var(--surface-500)] hover:text-[var(--shell-text)] hover:bg-[var(--surface-50)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
                {typeof t.count === 'number' && t.count > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 bg-[var(--surface-100)] text-[10px] rounded-full">{t.count}</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="p-4">
          {loadingAba && tab !== 'info' && tab !== 'inteligencia' ? (
            <div className="py-12 text-center text-sm text-[var(--surface-400)]">Carregando...</div>
          ) : tab === 'info' ? (
            <TabInfo estab={estab} />
          ) : tab === 'inteligencia' ? (
            <TabInteligencia estab={estab} politica={politica} />
          ) : tab === 'visitas' ? (
            <TabVisitas
              visitas={visitas}
              estabelecimentoId={id}
              onNova={() => setVisitaEditando('nova')}
              onEditar={(v) => setVisitaEditando(visitaParaForm(v, id))}
            />
          ) : tab === 'contatos' ? (
            <TabContatos contatos={contatos} />
          ) : tab === 'historico' ? (
            <TabHistorico historico={historico} />
          ) : tab === 'pets' ? (
            <TabPets pets={pets} />
          ) : (
            <TabIndicacoes indicacoes={indicacoes} />
          )}
        </div>
      </div>

      {/* Modal de visita */}
      {visitaEditando && (
        <VisitaModal
          estabelecimentoId={id}
          visita={visitaEditando === 'nova' ? null : visitaEditando}
          onClose={() => setVisitaEditando(null)}
          onSaved={() => {
            setVisitaEditando(null)
            recarregarVisitas()
          }}
        />
      )}
    </div>
  )
}

function visitaParaForm(v: Visita, estabId: string): VisitaData {
  return {
    id: v.id,
    estabelecimento_id: estabId,
    data_visita: v.data_visita,
    data_proximo_contato: v.data_proximo_contato,
    duracao_minutos: v.duracao_minutos,
    tipo_visita: v.tipo_visita,
    status: v.status,
    temperatura_pos_visita: v.temperatura_pos_visita,
    contato_realizado: v.contato_realizado,
    cargo_contato: v.cargo_contato,
    objetivo: v.objetivo,
    observacoes: v.observacoes,
    proximos_passos: v.proximos_passos,
    potencial_negocio: v.potencial_negocio,
  }
}

// ============================================
// Tabs
// ============================================
function TabInfo({ estab }: { estab: Estabelecimento }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {estab.endereco && <InfoItem label="Endereço" value={estab.endereco} />}
        {estab.bairro && <InfoItem label="Bairro" value={estab.bairro} />}
        {(estab.cidade || estab.estado) && (
          <InfoItem label="Cidade/Estado" value={`${estab.cidade || ''}${estab.estado ? ' - ' + estab.estado : ''}`} />
        )}
        {estab.cep && <InfoItem label="CEP" value={estab.cep} />}
        {estab.telefone && <InfoItem label="Telefone" value={formatTelefone(estab.telefone)} link={`tel:${estab.telefone.replace(/\D/g,'')}`} icon={<Phone className="w-3 h-3" />} />}
        {estab.whatsapp && <InfoItem label="WhatsApp" value={formatTelefone(estab.whatsapp)} link={whatsappLink(estab.whatsapp)} linkColor="text-green-600" icon={<Phone className="w-3 h-3" />} />}
        {estab.email && <InfoItem label="E-mail" value={estab.email} link={`mailto:${estab.email}`} icon={<Mail className="w-3 h-3" />} />}
        {estab.instagram && <InfoItem label="Instagram" value={estab.instagram} link={estab.instagram.startsWith('http') ? estab.instagram : `https://instagram.com/${estab.instagram.replace('@','')}`} linkColor="text-pink-600" icon={<Instagram className="w-3 h-3" />} />}
        {estab.website && <InfoItem label="Website" value={estab.website} link={estab.website} icon={<Globe className="w-3 h-3" />} />}
      </div>

      {estab.horario_funcionamento && (
        <div className="p-3 bg-[var(--surface-50)] rounded-lg border border-[var(--surface-200)]">
          <p className="text-[10px] font-bold text-[var(--surface-500)] uppercase mb-1">Horário de Funcionamento</p>
          <p className="text-sm whitespace-pre-line text-[var(--shell-text)]">{estab.horario_funcionamento}</p>
        </div>
      )}

      {estab.observacoes && (
        <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
          <p className="text-[10px] font-bold text-yellow-700 uppercase mb-1">📝 Observações</p>
          <p className="text-sm text-[var(--shell-text)] whitespace-pre-line">{estab.observacoes}</p>
        </div>
      )}
    </div>
  )
}

function TabInteligencia({ estab, politica }: { estab: Estabelecimento; politica: { label: string; bg: string; text: string; icon: string } | null }) {
  return (
    <div className="space-y-6">
      <Section title="👥 Equipe">
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Porte" value={PORTE_LABELS[estab.porte_equipe || ''] || 'Não informado'} small />
          <StatCard label="Vets Fixos" value={estab.veterinarios_fixos?.toString() || '?'} icon="👨‍⚕️" />
          <StatCard label="Vets Volantes" value={estab.veterinarios_volantes?.toString() || '?'} icon="🚗" />
        </div>
      </Section>

      <Section title="📍 Material e Exibição">
        {estab.ilha_de_exibicao && estab.ilha_de_exibicao.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {estab.ilha_de_exibicao.map(ilha => (
              <span key={ilha} className="px-3 py-1 bg-blue-500/15 text-blue-600 text-sm rounded-full">
                {ILHA_LABELS[ilha] || ilha}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[var(--surface-400)] text-sm">Não informado</p>
        )}
      </Section>

      <Section title="⚔️ Concorrência">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--surface-500)]">Política:</span>
            {politica ? (
              <span className={`px-2 py-1 ${politica.bg} ${politica.text} text-sm rounded-full`}>
                {politica.icon} {politica.label}
              </span>
            ) : (
              <span className="text-[var(--surface-400)]">Não definida</span>
            )}
          </div>
          {estab.concorrentes_presentes && estab.concorrentes_presentes.length > 0 && (
            <div>
              <p className="text-sm text-[var(--surface-500)] mb-2">Concorrentes presentes:</p>
              <div className="flex flex-wrap gap-2">
                {estab.concorrentes_presentes.map(c => (
                  <span key={c} className="px-3 py-1 bg-red-500/15 text-red-600 text-sm rounded-full">
                    {CONCORRENTE_LABELS[c] || c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title="📈 Métricas de Óbitos">
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Média/mês" value={estab.qtde_media_obitos_mensal?.toString() || '?'} icon="💀" />
          <StatCard label="% Prefeitura" value={estab.percentual_prefeitura != null ? `${estab.percentual_prefeitura}%` : '?'} icon="🏛️" />
          <StatCard label="Valor 10kg" value={estab.valor_prefeitura_10kg != null ? `R$ ${estab.valor_prefeitura_10kg}` : '?'} icon="💰" />
        </div>
      </Section>

      <Section title="💼 Comercial">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--surface-500)]">Gratificação:</span>
            <span className="font-medium text-[var(--shell-text)]">{GRATIFICACAO_LABELS[estab.modelo_gratificacao || ''] || 'Não definido'}</span>
          </div>
          {estab.estrategia && (
            <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/30">
              <p className="text-[10px] font-bold text-green-700 uppercase mb-1">🎯 Estratégia</p>
              <p className="text-sm text-[var(--shell-text)] whitespace-pre-line">{estab.estrategia}</p>
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}

function TabVisitas({ visitas, onNova, onEditar, estabelecimentoId }: {
  visitas: Visita[]
  onNova: () => void
  onEditar: (v: Visita) => void
  estabelecimentoId: string
}) {
  void estabelecimentoId
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--surface-500)]">
          {visitas.length} visita{visitas.length === 1 ? '' : 's'} registrada{visitas.length === 1 ? '' : 's'}
        </p>
        <button
          onClick={onNova}
          className="text-xs px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-semibold inline-flex items-center gap-1"
        >
          <Plus className="h-3 w-3" /> Nova visita
        </button>
      </div>

      {visitas.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-[var(--surface-200)] rounded-lg">
          <Calendar className="w-10 h-10 mx-auto mb-2 text-[var(--surface-300)]" />
          <p className="text-[var(--surface-500)] text-sm">Nenhuma visita registrada</p>
          <p className="text-[10px] text-[var(--surface-400)] mt-1">Clique em "Nova visita" para registrar a primeira</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visitas.map(v => {
            const corStatus = v.status === 'agendada'
              ? 'border-l-blue-500 bg-blue-500/5'
              : v.status === 'cancelada'
                ? 'border-l-red-500 bg-red-500/5'
                : 'border-l-green-500 bg-[var(--surface-0)]'
            return (
              <button
                key={v.id}
                onClick={() => onEditar(v)}
                className={`w-full text-left p-3 border border-[var(--surface-200)] border-l-4 rounded-lg hover:bg-[var(--surface-50)] transition-colors ${corStatus}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-[var(--shell-text)]">
                        {v.data_visita ? new Date(v.data_visita).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </p>
                      {v.status && (
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          v.status === 'agendada' ? 'bg-blue-500/20 text-blue-600' :
                          v.status === 'cancelada' ? 'bg-red-500/20 text-red-600' :
                          'bg-green-500/20 text-green-600'
                        }`}>{v.status}</span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--surface-500)] mt-0.5">
                      {v.tipo_visita && <span className="mr-2">{v.tipo_visita}</span>}
                      {v.duracao_minutos != null && <span className="mr-2">{v.duracao_minutos} min</span>}
                      {v.contato_realizado && <span className="mr-2">· {v.contato_realizado}{v.cargo_contato ? ` (${v.cargo_contato})` : ''}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {v.potencial_negocio && (
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        v.potencial_negocio === 'alto' ? 'bg-green-500/20 text-green-600' :
                        v.potencial_negocio === 'medio' ? 'bg-yellow-500/20 text-yellow-600' :
                        'bg-slate-500/20 text-slate-600'
                      }`}>{v.potencial_negocio}</span>
                    )}
                    {v.temperatura_pos_visita && (
                      <span className="text-lg" title={v.temperatura_pos_visita}>
                        {v.temperatura_pos_visita === 'quente' ? '🔥' : v.temperatura_pos_visita === 'morno' ? '🌤️' : '❄️'}
                      </span>
                    )}
                  </div>
                </div>
                {v.objetivo && <p className="text-sm text-[var(--surface-600)] mt-1.5"><strong>Objetivo:</strong> {v.objetivo}</p>}
                {v.observacoes && <p className="text-sm text-[var(--surface-600)] mt-1 line-clamp-3">{v.observacoes}</p>}
                {v.proximos_passos && <p className="text-sm text-blue-600 mt-1.5">→ {v.proximos_passos}</p>}
                {v.data_proximo_contato && (
                  <p className="text-[10px] text-[var(--surface-500)] mt-1">
                    Próximo contato: {new Date(v.data_proximo_contato + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </p>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TabContatos({ contatos }: { contatos: Contato[] }) {
  if (contatos.length === 0) {
    return (
      <div className="text-center py-8">
        <Users className="w-10 h-10 mx-auto mb-2 text-[var(--surface-300)]" />
        <p className="text-[var(--surface-500)] text-sm">Nenhum contato cadastrado.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {contatos.map(c => (
        <div key={c.id} className="p-3 border border-[var(--surface-200)] rounded-lg bg-[var(--surface-0)]">
          <p className="font-semibold text-[var(--shell-text)] flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-[var(--surface-400)]" />
            {c.nome || '—'}
          </p>
          {(c.cargo || c.especialidade) && (
            <p className="text-xs text-[var(--surface-500)] ml-5">
              {[c.cargo, c.especialidade].filter(Boolean).join(' · ')}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 ml-5 flex-wrap text-xs">
            {c.whatsapp && (
              <a href={whatsappLink(c.whatsapp)} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline inline-flex items-center gap-1">
                <Phone className="w-3 h-3" /> {formatTelefone(c.whatsapp)}
              </a>
            )}
            {c.telefone && c.telefone !== c.whatsapp && (
              <a href={`tel:${c.telefone.replace(/\D/g,'')}`} className="text-[var(--surface-500)] hover:underline inline-flex items-center gap-1">
                <Phone className="w-3 h-3" /> {formatTelefone(c.telefone)}
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`} className="text-cyan-600 hover:underline inline-flex items-center gap-1">
                <Mail className="w-3 h-3" /> {c.email}
              </a>
            )}
          </div>
          {c.observacoes && <p className="text-xs text-[var(--surface-500)] mt-2 ml-5">{c.observacoes}</p>}
        </div>
      ))}
    </div>
  )
}

function TabHistorico({ historico }: { historico: HistoricoItem[] }) {
  if (historico.length === 0) {
    return (
      <div className="text-center py-8">
        <History className="w-10 h-10 mx-auto mb-2 text-[var(--surface-300)]" />
        <p className="text-[var(--surface-500)] text-sm">Nenhuma alteração registrada</p>
        <p className="text-[10px] text-[var(--surface-400)] mt-1">Alterações em campos estratégicos aparecerão aqui (Fase 5 da migração).</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {historico.map(h => {
        const cor =
          h.tipo === 'conquista' ? 'border-l-green-500 bg-green-500/10' :
          h.tipo === 'alerta' ? 'border-l-red-500 bg-red-500/10' :
          'border-l-blue-500 bg-blue-500/10'
        const emoji = h.tipo === 'conquista' ? '🏆' : h.tipo === 'alerta' ? '⚠️' : '📝'
        return (
          <div key={h.id} className={`p-3 rounded-lg border-l-4 ${cor}`}>
            <div className="flex items-start gap-3">
              <span className="text-xl">{emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-[var(--shell-text)]">{h.campo_label || h.campo}</p>
                <p className="text-xs text-[var(--surface-500)]">
                  {h.criado_em && new Date(h.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {h.alterado_por_email && <span className="ml-2">· {h.alterado_por_email}</span>}
                </p>
                <div className="flex items-center gap-2 mt-1 text-sm">
                  <span className="line-through text-[var(--surface-400)]">{h.valor_anterior || '—'}</span>
                  <span>→</span>
                  <span className="font-medium text-cyan-600">{h.valor_novo || '—'}</span>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TabPets({ pets }: { pets: ContratoVinculado[] }) {
  if (pets.length === 0) {
    return (
      <div className="text-center py-8">
        <Stethoscope className="w-10 h-10 mx-auto mb-2 text-[var(--surface-300)]" />
        <p className="text-[var(--surface-500)] text-sm">Nenhum pet removido vinculado.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {pets.map(p => (
        <Link
          key={p.id}
          href={`/contratos/${p.id}`}
          className="block rounded-lg p-3 bg-[var(--surface-50)] hover:bg-[var(--surface-100)] border border-[var(--surface-200)] transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--shell-text)]">{p.pet_nome || '?'}</p>
              <p className="text-xs text-[var(--surface-500)]">{p.tutor_nome || '—'}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-mono text-[var(--surface-400)]">{p.codigo}</span>
                {p.status && <StatusBadge status={p.status} />}
              </div>
            </div>
            {p.data_acolhimento && (
              <span className="text-[10px] text-[var(--surface-500)] flex-shrink-0">
                {new Date(p.data_acolhimento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}

function TabIndicacoes({ indicacoes }: { indicacoes: IndicacaoVinculada[] }) {
  if (indicacoes.length === 0) {
    return (
      <div className="text-center py-8">
        <ExternalLink className="w-10 h-10 mx-auto mb-2 text-[var(--surface-300)]" />
        <p className="text-[var(--surface-500)] text-sm">Nenhuma indicação vinculada.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {indicacoes.map(i => (
        <Link
          key={i.id}
          href={`/contratos/${i.id}`}
          className="block rounded-lg p-3 bg-[var(--surface-50)] hover:bg-[var(--surface-100)] border border-[var(--surface-200)] transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--shell-text)]">{i.pet_nome || '?'}</p>
              <p className="text-xs text-[var(--surface-500)]">{i.tutor_nome || '—'}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-mono text-[var(--surface-400)]">{i.codigo}</span>
                {i.status && <StatusBadge status={i.status} />}
              </div>
            </div>
            {i.data_contrato && (
              <span className="text-[10px] text-[var(--surface-500)] flex-shrink-0">
                {new Date(i.data_contrato + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}

// ============================================
// Helpers de UI
// ============================================
function InfoItem({ label, value, link, linkColor = 'text-cyan-600', icon }: {
  label: string
  value: string
  link?: string
  linkColor?: string
  icon?: React.ReactNode
}) {
  return (
    <div>
      <p className="text-[10px] text-[var(--surface-500)] uppercase">{label}</p>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className={`font-medium ${linkColor} hover:underline inline-flex items-center gap-1`}>
          {icon}
          {value}
        </a>
      ) : (
        <p className="font-medium text-[var(--shell-text)]">{value}</p>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-bold text-sm mb-3 text-[var(--shell-text)]">{title}</h3>
      {children}
    </div>
  )
}

function StatCard({ label, value, icon, small }: { label: string; value: string; icon?: string; small?: boolean }) {
  return (
    <div className="p-3 bg-[var(--surface-50)] rounded-lg text-center border border-[var(--surface-200)]">
      {icon && <span className="text-lg">{icon}</span>}
      <p className={`font-bold text-[var(--shell-text)] ${small ? 'text-sm' : 'text-xl'}`}>{value}</p>
      <p className="text-[10px] text-[var(--surface-500)]">{label}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cores: Record<string, string> = {
    preventivo: 'bg-yellow-500/20 text-yellow-600',
    ativo: 'bg-red-500/20 text-red-600',
    pinda: 'bg-orange-500/20 text-orange-600',
    retorno: 'bg-purple-500/20 text-purple-600',
    pendente: 'bg-amber-500/20 text-amber-600',
    finalizado: 'bg-slate-500/20 text-slate-600',
  }
  const cls = cores[status] || 'bg-slate-500/20 text-slate-600'
  return <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${cls}`}>{status}</span>
}
