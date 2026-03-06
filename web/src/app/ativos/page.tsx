'use client'

import { useEffect, useState } from 'react'
import { Activity, Search, Phone, MapPin, Calendar, Package, DollarSign, Truck, Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type Tutor = {
  id: string
  nome: string
  telefone: string | null
}

type ContratoAtivo = {
  id: string
  codigo: string
  pet_nome: string
  pet_especie: string | null
  pet_raca: string | null
  pet_genero: string | null
  pet_peso: number | null
  tutor_id: string | null
  tutor: Tutor | null
  // Campos legados para compatibilidade
  tutor_nome: string
  tutor_telefone: string | null
  local_coleta: string | null
  tipo_cremacao: string
  tipo_plano: string
  data_acolhimento: string | null
  numero_lacre: string | null
  urna_tamanho: string | null
  urna_cor: string | null
  valor_total: number | null
  valor_pago: number | null
  numero_supinda: number | null
}

// Ícones de pet baseado em espécie e porte
function getPetIcon(especie: string | null, peso: number | null): { emoji: string; color: string } {
  const especieLower = especie?.toLowerCase() || ''

  if (especieLower.includes('canin') || especieLower.includes('cão') || especieLower.includes('cachorro')) {
    // Cachorro - cor varia por porte
    if (!peso || peso <= 5) {
      return { emoji: '🐕', color: 'bg-amber-900/30 text-amber-400' }
    } else if (peso <= 15) {
      return { emoji: '🐕', color: 'bg-orange-900/30 text-orange-400' }
    } else {
      return { emoji: '🐕', color: 'bg-red-900/30 text-red-400' }
    }
  } else if (especieLower.includes('felin') || especieLower.includes('gato')) {
    return { emoji: '🐱', color: 'bg-purple-900/30 text-purple-400' }
  } else if (especieLower.includes('exotic') || especieLower.includes('exótic')) {
    return { emoji: '🐾', color: 'bg-teal-900/30 text-teal-400' }
  }

  // Fallback
  return { emoji: '🐾', color: 'bg-slate-700/50 text-slate-400' }
}

type Supinda = {
  id: string
  numero: number
  data_prevista: string | null
  status: string
}

export default function AtivosPage() {
  const [contratos, setContratos] = useState<ContratoAtivo[]>([])
  const [supindas, setSupindas] = useState<Supinda[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<string>('')

  const supabase = createClient()

  async function carregarDados() {
    setLoading(true)

    // Carregar contratos ativos
    const { data: contratosData, error: contratosError } = await supabase
      .from('contratos')
      .select('*, tutor:tutores(id, nome, telefone)')
      .eq('status', 'ativo')
      .order('data_acolhimento', { ascending: true, nullsFirst: false })

    if (contratosError) {
      console.error('Erro ao carregar contratos:', contratosError)
    } else {
      setContratos(contratosData || [])
    }

    // Carregar próximas supindas
    const { data: supindasData } = await supabase
      .from('supindas')
      .select('*')
      .in('status', ['planejada', 'em_preparo'])
      .order('data_prevista', { ascending: true })
      .limit(5)

    setSupindas(supindasData || [])

    setLoading(false)
  }

  useEffect(() => {
    carregarDados()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function formatarData(data: string | null) {
    if (!data) return '-'
    try {
      return new Date(data).toLocaleDateString('pt-BR')
    } catch {
      return data
    }
  }

  function formatarDataHora(data: string | null) {
    if (!data) return '-'
    try {
      const d = new Date(data)
      const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
      const dia = d.getDate().toString().padStart(2, '0')
      const mes = (d.getMonth() + 1).toString().padStart(2, '0')
      const diaSemana = diasSemana[d.getDay()]
      const hora = d.getHours().toString().padStart(2, '0')
      const min = d.getMinutes().toString().padStart(2, '0')
      return `${dia}/${mes} ${diaSemana} ${hora}:${min}`
    } catch {
      return data
    }
  }

  function getDataBox(data: string | null): { diaSemana: string; diaMes: string; hora: string } | null {
    if (!data) return null
    try {
      const d = new Date(data)
      const diasCurtos = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
      const mesesCurtos = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
      const dia = d.getDate().toString().padStart(2, '0')
      const mes = mesesCurtos[d.getMonth()]
      const hora = d.getHours().toString().padStart(2, '0')
      const min = d.getMinutes().toString().padStart(2, '0')
      return {
        diaSemana: diasCurtos[d.getDay()],
        diaMes: `${dia}/${mes}`,
        hora: `${hora}:${min}`
      }
    } catch {
      return null
    }
  }

  function formatarTelefone(tel: string | null) {
    if (!tel) return '-'
    const limpo = tel.replace(/\D/g, '')
    if (limpo.length === 11) {
      return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7)}`
    }
    return tel
  }

  function calcularDiasAtivo(data: string | null) {
    if (!data) return null
    const acolhimento = new Date(data)
    const hoje = new Date()
    const diff = Math.floor((hoje.getTime() - acolhimento.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  function getStatusPagamento(total: number | null, pago: number | null) {
    if (!total || total === 0) return { icon: '💰', status: 'ok', label: 'N/A' }
    if (!pago || pago === 0) return { icon: '❌', status: 'pendente', label: 'Pendente' }
    if (pago >= total) return { icon: '✅', status: 'pago', label: 'Pago' }
    return { icon: '🕐', status: 'parcial', label: `Parcial (${Math.round((pago / total) * 100)}%)` }
  }

  function getStatusUrna(tamanho: string | null, cor: string | null) {
    if (tamanho && cor) return { icon: '✅', status: 'definida' }
    if (tamanho || cor) return { icon: '🕐', status: 'parcial' }
    return { icon: '❌', status: 'pendente' }
  }

  // Filtrar contratos
  const contratosFiltrados = contratos.filter(c => {
    // Busca por texto
    if (busca) {
      const termo = busca.toLowerCase()
      const match =
        c.pet_nome?.toLowerCase().includes(termo) ||
        c.tutor_nome?.toLowerCase().includes(termo) ||
        c.codigo?.toLowerCase().includes(termo) ||
        c.tutor_telefone?.includes(termo)
      if (!match) return false
    }

    // Filtros específicos
    if (filtro === 'sem_urna') {
      return !c.urna_tamanho || !c.urna_cor
    }
    if (filtro === 'pagamento_pendente') {
      const status = getStatusPagamento(c.valor_total, c.valor_pago)
      return status.status === 'pendente' || status.status === 'parcial'
    }
    if (filtro === 'sem_supinda') {
      return !c.numero_supinda
    }

    return true
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Activity className="h-8 w-8 text-green-400" />
          <div>
            <h1 className="text-2xl font-bold text-slate-200">Ativos</h1>
            <p className="text-sm text-slate-400">{contratos.length} pets em atendimento</p>
          </div>
        </div>
      </div>

      {/* Próximas Supindas */}
      {supindas.length > 0 && (
        <div className="bg-orange-900/30 border border-orange-700 rounded-xl p-4 mb-6">
          <h3 className="font-medium text-orange-300 mb-2 flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Próximas Supindas
          </h3>
          <div className="flex gap-4 flex-wrap">
            {supindas.map(s => (
              <div key={s.id} className="bg-slate-700 px-3 py-2 rounded-lg border border-orange-700">
                <span className="font-mono font-bold text-orange-400">#{s.numero}</span>
                <span className="text-slate-400 ml-2 text-sm">
                  {s.data_prevista ? formatarData(s.data_prevista) : 'Data não definida'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Busca e Filtros */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por pet, tutor, código, telefone..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="px-4 py-2 border border-slate-600 rounded-lg bg-slate-700"
        >
          <option value="">Todos</option>
          <option value="sem_urna">Sem urna definida</option>
          <option value="pagamento_pendente">Pagamento pendente</option>
          <option value="sem_supinda">Sem Supinda</option>
        </select>
        <button
          onClick={carregarDados}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          Atualizar
        </button>
      </div>

      {/* Cards de Contratos */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-slate-800 rounded-xl shadow-sm border p-8 text-center text-slate-400">
            Carregando...
          </div>
        ) : contratosFiltrados.length === 0 ? (
          <div className="bg-slate-800 rounded-xl shadow-sm border p-8 text-center text-slate-400">
            Nenhum contrato ativo encontrado
          </div>
        ) : (
          contratosFiltrados.map((contrato) => {
            const dias = calcularDiasAtivo(contrato.data_acolhimento)
            const pagamento = getStatusPagamento(contrato.valor_total, contrato.valor_pago)
            const urna = getStatusUrna(contrato.urna_tamanho, contrato.urna_cor)
            const petIcon = getPetIcon(contrato.pet_especie, contrato.pet_peso)
            const dataBox = getDataBox(contrato.data_acolhimento)

            return (
              <div
                key={contrato.id}
                className={`rounded-lg shadow-sm border-2 hover:shadow-md transition-shadow ${
                  contrato.tipo_cremacao === 'individual'
                    ? 'bg-emerald-900/20 border-emerald-400'
                    : 'bg-violet-900/20 border-violet-400'
                }`}
              >
                <div className="p-3">
                  {/* Linha única compacta */}
                  <div className="flex items-center gap-2">
                    {/* Data do acolhimento */}
                    {dataBox && (
                      <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-slate-700 flex flex-col items-center justify-center text-slate-300">
                        <span className="text-[10px] font-semibold leading-none">{dataBox.diaSemana}</span>
                        <span className="text-xs font-bold leading-tight">{dataBox.diaMes}</span>
                        <span className="text-[10px] leading-none text-slate-400">{dataBox.hora}</span>
                      </div>
                    )}

                    {/* Ícone do Pet */}
                    <div className={`flex-shrink-0 w-11 h-11 rounded-lg flex flex-col items-center justify-center ${petIcon.color}`}>
                      <span className="text-lg">{petIcon.emoji}</span>
                      <span className="text-[9px] font-medium leading-none">{contrato.pet_peso ? `${contrato.pet_peso}kg` : '-'}</span>
                    </div>

                    {/* Local de remoção */}
                    {contrato.local_coleta && (
                      <div className={`flex-shrink-0 w-16 h-11 rounded-lg flex items-center justify-center text-center px-1 ${
                        contrato.local_coleta === 'Residência' ? 'bg-blue-900/30 text-blue-400' :
                        contrato.local_coleta === 'Unidade' ? 'bg-amber-900/30 text-amber-400' :
                        'bg-purple-900/30 text-purple-400'
                      }`}>
                        <span className="text-[10px] font-medium leading-tight break-words">{contrato.local_coleta}</span>
                      </div>
                    )}

                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/contratos/${contrato.id}`} className="text-base font-semibold text-slate-200 hover:text-purple-300">
                          {contrato.numero_lacre && (
                            <span className="text-white font-bold mr-1 bg-blue-700 px-1 py-0 rounded text-sm">{String(contrato.numero_lacre).replace(/\.0$/, '')}</span>
                          )}
                          <span style={{ backgroundColor: '#f1f5f9', color: contrato.pet_genero === 'macho' ? '#2563eb' : '#db2777', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                            {contrato.pet_nome}
                            {contrato.pet_genero && <span style={{ marginLeft: '3px', fontSize: '0.75rem' }}>{contrato.pet_genero === 'macho' ? '♂' : '♀'}</span>}
                          </span>
                        </Link>
                        {contrato.pet_raca && (
                          <span className="text-blue-500 text-xs">({contrato.pet_raca})</span>
                        )}
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          contrato.tipo_cremacao === 'individual'
                            ? 'bg-emerald-500 text-white'
                            : 'bg-violet-500 text-white'
                        }`}>
                          {contrato.tipo_cremacao === 'individual' ? 'IND' : 'COL'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span className="font-bold" style={{ backgroundColor: '#f1f5f9', color: '#475569', padding: '1px 5px', borderRadius: '4px' }}>{contrato.tutor?.nome || contrato.tutor_nome}</span>
                      </div>
                    </div>

                    {/* Indicadores compactos */}
                    <div className="flex items-center gap-2">
                      {/* WhatsApp */}
                      {(contrato.tutor?.telefone || contrato.tutor_telefone) && (
                        <a
                          href={`https://wa.me/${(contrato.tutor?.telefone || contrato.tutor_telefone || '').replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center w-7 h-7 bg-[#25D366] text-white rounded-full hover:bg-[#128C7E] transition-colors"
                          title={formatarTelefone(contrato.tutor?.telefone || contrato.tutor_telefone)}
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                        </a>
                      )}

                      {/* Urna */}
                      <div className={`flex items-center gap-1 px-1.5 py-1 rounded text-xs ${
                        urna.status === 'definida' ? 'bg-green-900/30 text-green-400' :
                        urna.status === 'parcial' ? 'bg-yellow-900/30 text-yellow-400' :
                        'bg-red-900/30 text-red-400'
                      }`} title={`Urna: ${contrato.urna_tamanho || 'não definida'}`}>
                        <span>{urna.icon}</span>
                        <Package className="h-3 w-3" />
                      </div>

                      {/* Pagamento */}
                      <div className={`flex items-center gap-1 px-1.5 py-1 rounded text-xs ${
                        pagamento.status === 'pago' ? 'bg-green-900/30 text-green-400' :
                        pagamento.status === 'parcial' ? 'bg-yellow-900/30 text-yellow-400' :
                        pagamento.status === 'pendente' ? 'bg-red-900/30 text-red-400' :
                        'bg-slate-700/50 text-slate-400'
                      }`} title={pagamento.label}>
                        <span>{pagamento.icon}</span>
                        <DollarSign className="h-3 w-3" />
                      </div>

                      {/* Supinda */}
                      <div className={`flex items-center gap-1 px-1.5 py-1 rounded text-xs ${
                        contrato.numero_supinda
                          ? 'bg-orange-900/30 text-orange-400'
                          : 'bg-slate-700/50 text-slate-400'
                      }`} title={contrato.numero_supinda ? `Supinda #${contrato.numero_supinda}` : 'Sem Supinda'}>
                        <Truck className="h-3 w-3" />
                        {contrato.numero_supinda && <span>#{contrato.numero_supinda}</span>}
                      </div>

                      {/* Dias */}
                      {dias !== null && (
                        <div className={`text-center px-2 py-1 rounded-lg min-w-[40px] ${
                          dias > 7 ? 'bg-red-900/30 text-red-400' :
                          dias > 3 ? 'bg-yellow-900/30 text-yellow-400' :
                          'bg-green-900/30 text-green-400'
                        }`}>
                          <span className="text-sm font-bold">{dias}d</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Resumo */}
      {!loading && contratosFiltrados.length > 0 && (
        <div className="mt-6 text-sm text-slate-400 text-center">
          Mostrando {contratosFiltrados.length} de {contratos.length} contratos ativos
        </div>
      )}
    </div>
  )
}
