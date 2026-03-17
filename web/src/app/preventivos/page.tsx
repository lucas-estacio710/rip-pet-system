'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ChevronLeft, ChevronRight, Heart, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useDebounce } from '@/hooks/useDebounce'
import AtivarModal from '@/components/contratos/modals/AtivarModal'

// ============================================
// Types
// ============================================
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
  tutor: { id: string; nome: string; telefone: string | null } | null
  tutor_nome: string
  tutor_telefone: string | null
  tutor_cidade: string | null
  tutor_bairro: string | null
  tipo_cremacao: string
  tipo_plano: string
  status: string
  data_contrato: string | null
  seguradora: string | null
  valor_plano: number | null
  desconto_plano: number | null
  contrato_produtos?: {
    id: string
    produto: { codigo: string; nome: string; tipo: string } | null
  }[]
}

const POR_PAGINA = 30

const SELECT_FIELDS = `
  id, codigo, pet_nome, pet_especie, pet_raca, pet_cor, pet_peso, pet_genero,
  tutor_id, tutor:tutores(id, nome, telefone), tutor_nome, tutor_telefone,
  tutor_cidade, tutor_bairro, tipo_cremacao, tipo_plano, status, data_contrato,
  seguradora, valor_plano, desconto_plano,
  contrato_produtos(id, produto:produtos(codigo, nome, tipo))
`

// ============================================
// Helpers
// ============================================
function getPetIcon(especie?: string | null) {
  const s = (especie || '').toLowerCase()
  if (s.includes('canina')) return { emoji: '🐕', bg: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)' }
  if (s.includes('felina')) return { emoji: '🐈', bg: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)' }
  return { emoji: '🐾', bg: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)' }
}

function formatarData(data: string | null) {
  if (!data) return null
  const d = new Date(data + 'T00:00:00')
  const dia = String(d.getDate()).padStart(2, '0')
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const mes = meses[d.getMonth()]
  const ano = String(d.getFullYear()).slice(2)
  return { dia, mes, ano }
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
export default function PreventivosPage() {
  const router = useRouter()
  const supabase = createClient()

  const [contratos, setContratos] = useState<Contrato[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(0)
  const [busca, setBusca] = useState('')
  const buscaDebounced = useDebounce(busca, 300)
  const buscaIdRef = useRef(0)

  // Modal Ativar
  const [ativarModal, setAtivarModal] = useState(false)
  const [ativarContrato, setAtivarContrato] = useState<Contrato | null>(null)

  useEffect(() => {
    setPagina(0)
  }, [buscaDebounced])

  useEffect(() => {
    carregarContratos()
  }, [pagina, buscaDebounced])

  async function carregarContratos() {
    const minhaBuscaId = ++buscaIdRef.current
    setLoading(true)

    let query = supabase
      .from('contratos')
      .select(SELECT_FIELDS, { count: 'exact' })
      .eq('status', 'preventivo')
      .order('data_contrato', { ascending: false })

    if (buscaDebounced.trim()) {
      const termo = buscaDebounced.trim().replace(/[,.()"'\\]/g, '')
      if (termo) {
        query = query.or(`codigo.ilike.%${termo}%,pet_nome.ilike.%${termo}%,tutor_nome.ilike.%${termo}%`)
      }
    }

    if (!buscaDebounced.trim()) {
      query = query.range(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA - 1)
    } else {
      query = query.limit(200)
    }

    const { data, error, count } = await query

    if (minhaBuscaId !== buscaIdRef.current) return

    if (error) {
      console.error('Erro ao carregar preventivos:', error)
    } else {
      setContratos((data || []) as Contrato[])
      setTotal(count || 0)
    }
    setLoading(false)
  }

  function abrirAtivarModal(contrato: Contrato) {
    setAtivarContrato(contrato)
    setAtivarModal(true)
  }

  function handleAtivarSuccess() {
    setAtivarModal(false)
    setAtivarContrato(null)
    carregarContratos()
  }

  const totalPaginas = Math.ceil(total / POR_PAGINA)

  // Urna reservada
  function getUrnaReservada(contrato: Contrato): string | null {
    const urna = contrato.contrato_produtos?.find(cp => cp.produto?.tipo === 'urna')
    return urna?.produto?.nome || null
  }

  // ============================================
  // Render
  // ============================================
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-amber-900/30 items-center justify-center">
            <Heart className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-title text-[var(--shell-text)]">Preventivos</h1>
            <p className="text-small text-[var(--shell-text-muted)]">
              Pets com contrato ativo aguardando acionamento
              {!loading && <span className="ml-2 font-mono text-amber-400">{total}</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Busca */}
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--surface-400)]" />
        <input
          type="text"
          placeholder="Buscar por nome do pet, tutor ou código..."
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
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-slate-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 bg-slate-700 rounded" />
                  <div className="h-3 w-28 bg-slate-700 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : contratos.length === 0 ? (
        <div className="card p-12 text-center">
          <Heart className="h-12 w-12 mx-auto mb-3 text-[var(--surface-300)]" />
          <p className="text-[var(--shell-text-muted)]">
            {busca ? 'Nenhum preventivo encontrado para esta busca' : 'Nenhum contrato preventivo cadastrado'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {contratos.map((contrato) => {
            const pet = getPetIcon(contrato.pet_especie)
            const dataBox = formatarData(contrato.data_contrato)
            const tutorNome = contrato.tutor?.nome || contrato.tutor_nome || '—'
            const telefone = contrato.tutor?.telefone || contrato.tutor_telefone
            const valor = (contrato.valor_plano || 0) - (contrato.desconto_plano || 0)
            const urna = getUrnaReservada(contrato)

            return (
              <div
                key={contrato.id}
                className="card card-hover p-3 cursor-pointer transition-all border-l-4 border-l-amber-500"
                onClick={() => router.push(`/contratos/${contrato.id}`)}
              >
                <div className="flex items-center gap-3">
                  {/* Data */}
                  {dataBox && (
                    <div
                      className="flex-shrink-0 w-11 h-11 rounded-lg flex flex-col items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', color: '#334155' }}
                    >
                      <span className="text-[11px] font-bold leading-none">{dataBox.dia}</span>
                      <span className="text-[9px] font-medium leading-none mt-0.5">{dataBox.mes}</span>
                      <span className="text-[8px] text-slate-500 leading-none">{dataBox.ano}</span>
                    </div>
                  )}

                  {/* Pet icon */}
                  <div
                    className="flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center"
                    style={{ background: pet.bg }}
                  >
                    <span className="text-2xl">{pet.emoji}</span>
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-base font-bold inline-block"
                        style={{
                          background: 'linear-gradient(90deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)',
                          color: contrato.pet_genero === 'macho' ? '#1d4ed8' : '#db2777',
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        {contrato.pet_nome}
                        {contrato.pet_genero && (
                          <span className="ml-1 text-sm">{contrato.pet_genero === 'macho' ? '♂' : '♀'}</span>
                        )}
                      </span>
                      {(contrato.pet_raca || contrato.pet_cor) && (
                        <span
                          className="text-xs font-medium"
                          style={{ background: 'linear-gradient(90deg, #cbd5e1 0%, #f1f5f9 50%, #cbd5e1 100%)', color: '#475569', padding: '1px 5px', borderRadius: '4px' }}
                        >
                          {[contrato.pet_raca, contrato.pet_cor].filter(Boolean).join(' | ')}
                        </span>
                      )}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        contrato.tipo_cremacao === 'individual'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-violet-500 text-white'
                      }`}>
                        {contrato.tipo_cremacao === 'individual' ? 'IND' : 'COL'}
                      </span>
                      {contrato.seguradora && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-600 text-white">
                          {contrato.seguradora}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs mt-0.5 text-[var(--shell-text-muted)]">
                      <span>{tutorNome}</span>
                      {contrato.tutor_cidade && (
                        <span className="text-[var(--surface-400)]">📍 {contrato.tutor_cidade}</span>
                      )}
                    </div>
                    {urna && (
                      <div className="text-[10px] text-amber-400 mt-0.5">⚱️ {urna}</div>
                    )}
                  </div>

                  {/* Valor */}
                  {valor > 0 && (
                    <div className="flex-shrink-0 text-right hidden sm:block">
                      <div className="text-sm font-bold text-mono text-emerald-400">
                        R$ {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      {contrato.pet_peso && (
                        <div className="text-[10px] text-[var(--surface-400)]">{contrato.pet_peso}kg</div>
                      )}
                    </div>
                  )}

                  {/* WhatsApp */}
                  {telefone && (
                    <a
                      href={`https://wa.me/55${telefone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-shrink-0 flex items-center justify-center w-9 h-9 bg-[#25D366] text-white rounded-full hover:bg-[#128C7E] transition-colors"
                      title={formatarTelefone(telefone)}
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    </a>
                  )}

                  {/* Botão Ativar */}
                  <button
                    onClick={(e) => { e.stopPropagation(); abrirAtivarModal(contrato) }}
                    className="flex-shrink-0 flex items-center justify-center w-9 h-9 bg-red-900 text-white rounded-full hover:bg-red-800 transition-colors"
                    title="Ativar contrato (pet faleceu)"
                  >
                    <span className="text-base">✝️</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Paginação */}
      {!busca && totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setPagina(p => Math.max(0, p - 1))}
            disabled={pagina === 0}
            className="p-2 rounded-lg bg-[var(--surface-100)] text-[var(--surface-500)] hover:bg-[var(--surface-200)] disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm text-[var(--shell-text-muted)] font-mono">
            {pagina + 1} / {totalPaginas}
          </span>
          <button
            onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
            disabled={pagina >= totalPaginas - 1}
            className="p-2 rounded-lg bg-[var(--surface-100)] text-[var(--surface-500)] hover:bg-[var(--surface-200)] disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Modal Ativar PV */}
      {ativarContrato && (
        <AtivarModal
          isOpen={ativarModal}
          onClose={() => { setAtivarModal(false); setAtivarContrato(null) }}
          contrato={ativarContrato}
          onSuccess={handleAtivarSuccess}
        />
      )}
    </div>
  )
}
