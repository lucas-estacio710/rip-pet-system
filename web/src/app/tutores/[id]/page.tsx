'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, User, Phone, Mail, MapPin, FileText, Calendar } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { computeAllTags, ContratoTagData } from '@/lib/contrato-tags'
import ContratoTags from '@/components/contratos/ContratoTags'
import Link from 'next/link'

type Tutor = {
  id: string
  nome: string
  cpf: string | null
  telefone: string | null
  telefone2: string | null
  email: string | null
  cep: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  observacoes: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

type Contrato = ContratoTagData & {
  id: string
  codigo: string
  pet_nome: string
  pet_especie: string | null
  pet_raca: string | null
  pet_genero: string | null
  tipo_plano: string
  data_contrato: string | null
  data_acolhimento: string | null
  numero_lacre: string | null
}

const STATUS_COLORS: Record<string, string> = {
  preventivo: 'bg-yellow-900/30 text-yellow-400',
  ativo: 'bg-red-900/30 text-red-400',
  pinda: 'bg-orange-900/30 text-orange-400',
  retorno: 'bg-blue-900/30 text-blue-400',
  pendente: 'bg-purple-900/30 text-purple-400',
  finalizado: 'bg-slate-700/50 text-slate-400',
}

const STATUS_LABELS: Record<string, string> = {
  preventivo: 'Preventivo',
  ativo: 'Ativo',
  pinda: 'Pinda',
  retorno: 'Retorno',
  pendente: 'Pendente',
  finalizado: 'Finalizado',
}

export default function TutorDetalhe() {
  const params = useParams()
  const [tutor, setTutor] = useState<Tutor | null>(null)
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    carregarDados()
  }, [params.id])

  async function carregarDados() {
    setLoading(true)
    const tutorId = params.id as string

    // Carregar tutor
    const { data: tutorData, error: tutorError } = await supabase
      .from('tutores')
      .select('*')
      .eq('id', tutorId)
      .single()

    if (tutorError) {
      console.error('Erro ao carregar tutor:', tutorError)
    } else {
      setTutor(tutorData)
    }

    // Carregar contratos do tutor
    const { data: contratosData, error: contratosError } = await supabase
      .from('contratos')
      .select('id, codigo, pet_nome, pet_especie, pet_raca, pet_genero, tipo_cremacao, tipo_plano, status, data_contrato, data_acolhimento, numero_lacre, certificado_confirmado, certificado_nome_1, certificado_nome_2, certificado_nome_3, certificado_nome_4, certificado_nome_5, pelinho_quer, pelinho_feito, pelinho_quantidade, protocolo_data, valor_plano, desconto_plano, valor_acessorios, desconto_acessorios, pagamentos(tipo, valor), contrato_produtos(foto_recebida, rescaldo_feito, produto:produtos(codigo, tipo, precisa_foto, rescaldo_tipo))')
      .eq('tutor_id', tutorId)
      .order('data_contrato', { ascending: false })

    if (contratosError) {
      console.error('Erro ao carregar contratos:', contratosError)
    } else {
      setContratos(contratosData || [])
    }

    setLoading(false)
  }

  function formatarTelefone(tel: string | null) {
    if (!tel) return null
    const limpo = tel.replace(/\D/g, '')
    if (limpo.length === 11) return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7)}`
    return tel
  }

  function formatarData(data: string | null) {
    if (!data) return '-'
    try {
      const [ano, mes, dia] = data.split('T')[0].split('-').map(Number)
      return `${dia.toString().padStart(2, '0')}/${mes.toString().padStart(2, '0')}/${ano}`
    } catch {
      return data
    }
  }

  function getPetIcon(especie: string | null): string {
    const especieLower = especie?.toLowerCase() || ''
    if (especieLower.includes('canin')) return '🐕'
    if (especieLower.includes('felin')) return '🐱'
    return '🐾'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-slate-400">Carregando...</div>
      </div>
    )
  }

  if (!tutor) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-slate-400">Tutor não encontrado</p>
        <Link href="/tutores" className="text-blue-400 hover:underline">Voltar para lista</Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto pb-8">
      {/* Header */}
      <div className="mb-4">
        <Link href="/tutores" className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-300 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">Voltar para tutores</span>
        </Link>
      </div>

      {/* Card Principal */}
      <div className="bg-gradient-to-r from-blue-900/30 to-slate-800 rounded-2xl shadow-lg p-6 mb-6">
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-2xl bg-blue-500 flex items-center justify-center shadow-lg">
            <User className="h-10 w-10 text-white" />
          </div>

          {/* Info */}
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-200 mb-1">{tutor.nome}</h1>
            {tutor.cpf && (
              <p className="text-slate-400 text-sm mb-3">CPF: {tutor.cpf}</p>
            )}

            <div className="flex flex-wrap gap-4">
              {tutor.telefone && (
                <a
                  href={`https://wa.me/${tutor.telefone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  {formatarTelefone(tutor.telefone)}
                </a>
              )}

              {tutor.telefone2 && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 text-slate-300 rounded-lg">
                  <Phone className="h-4 w-4" />
                  {formatarTelefone(tutor.telefone2)}
                </div>
              )}

              {tutor.email && (
                <a
                  href={`mailto:${tutor.email}`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700"
                >
                  <Mail className="h-4 w-4" />
                  {tutor.email}
                </a>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-400">{contratos.length}</div>
            <div className="text-sm text-slate-400">contratos</div>
          </div>
        </div>
      </div>

      {/* Endereço */}
      {(tutor.endereco || tutor.cidade) && (
        <div className="bg-slate-800 rounded-xl shadow-md p-5 border border-slate-700 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-5 w-5 text-rose-500" />
            <h2 className="font-semibold text-slate-200">Endereço</h2>
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
              <div className="flex items-center gap-3 mt-4">
                <a
                  href={`https://waze.com/ul?q=${encodeURIComponent(
                    [tutor.endereco, tutor.numero, tutor.bairro, tutor.cidade, tutor.estado, tutor.cep].filter(Boolean).join(', ')
                  )}&navigate=yes`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-xl shadow-md hover:shadow-lg hover:scale-105 transition-all overflow-hidden"
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
                  className="w-10 h-10 rounded-xl shadow-md hover:shadow-lg hover:scale-105 transition-all overflow-hidden"
                  title="Abrir no Google Maps"
                >
                  <img src="/gmaps.png" alt="Google Maps" className="w-full h-full object-cover" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Observações */}
      {tutor.observacoes && (
        <div className="bg-slate-800 rounded-xl shadow-md p-5 border border-slate-700 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-5 w-5 text-slate-400" />
            <h2 className="font-semibold text-slate-200">Observações</h2>
          </div>
          <p className="text-slate-300 whitespace-pre-wrap">{tutor.observacoes}</p>
        </div>
      )}

      {/* Contratos */}
      <div className="bg-slate-800 rounded-xl shadow-md border border-slate-700 overflow-hidden">
        <div className="flex items-center gap-2 p-5 border-b">
          <Calendar className="h-5 w-5 text-purple-500" />
          <h2 className="font-semibold text-slate-200">Histórico de Contratos</h2>
        </div>

        {contratos.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            Nenhum contrato vinculado a este tutor
          </div>
        ) : (
          <div className="divide-y">
            {contratos.map((contrato) => (
              <Link
                key={contrato.id}
                href={`/contratos/${contrato.id}`}
                className="flex items-center gap-4 p-4 hover:bg-slate-700 transition-colors"
              >
                <div className="text-2xl">{getPetIcon(contrato.pet_especie)}</div>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {contrato.numero_lacre && (
                      <span className="text-white font-bold bg-blue-700 px-1 py-0 rounded text-sm">{String(contrato.numero_lacre).replace(/\.0$/, '')}</span>
                    )}
                    <span className="font-bold" style={{ backgroundColor: '#f1f5f9', color: contrato.pet_genero === 'macho' ? '#2563eb' : '#db2777', padding: '1px 6px', borderRadius: '4px' }}>
                      {contrato.pet_nome}
                      {contrato.pet_genero && <span style={{ marginLeft: '3px', fontSize: '0.75rem' }}>{contrato.pet_genero === 'macho' ? '♂' : '♀'}</span>}
                    </span>
                    {contrato.pet_raca && (
                      <span className="text-slate-400 text-sm">({contrato.pet_raca})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <span className="font-mono">{contrato.codigo}</span>
                    <span>•</span>
                    <span>{formatarData(contrato.data_contrato || contrato.data_acolhimento)}</span>
                  </div>
                </div>

                <ContratoTags tags={computeAllTags(contrato)} />

                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    contrato.tipo_cremacao === 'individual'
                      ? 'bg-emerald-900/30 text-emerald-400'
                      : 'bg-violet-900/30 text-violet-400'
                  }`}>
                    {contrato.tipo_cremacao === 'individual' ? 'IND' : 'COL'}
                  </span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[contrato.status] || 'bg-slate-700/50 text-slate-400'}`}>
                    {STATUS_LABELS[contrato.status] || contrato.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
