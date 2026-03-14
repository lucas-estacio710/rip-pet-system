'use client'

import { useEffect, useState } from 'react'
import { Users, Search, ChevronLeft, ChevronRight, Phone, MapPin, FileText, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useDebounce } from '@/hooks/useDebounce'
import { Skeleton, SkeletonTableRow } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

type Tutor = {
  id: string
  nome: string
  cpf: string | null
  telefone: string | null
  telefone2: string | null
  email: string | null
  cidade: string | null
  bairro: string | null
  ativo: boolean
  created_at: string
  _count?: { contratos: number }
}

export default function TutoresPage() {
  const [tutores, setTutores] = useState<Tutor[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const buscaDebounced = useDebounce(busca, 300)
  const [pagina, setPagina] = useState(0)
  const [total, setTotal] = useState(0)

  const POR_PAGINA = 30
  const supabase = createClient()

  useEffect(() => {
    if (!buscaDebounced.trim()) {
      carregarTutores()
    }
  }, [pagina])

  // Busca em tempo real com debounce
  useEffect(() => {
    if (buscaDebounced.trim()) {
      buscarTutores(buscaDebounced)
    } else {
      carregarTutores()
    }
  }, [buscaDebounced])

  async function carregarTutores() {
    setLoading(true)

    const { data, error, count } = await supabase
      .from('tutores')
      .select('*', { count: 'exact' })
      .eq('ativo', true)
      .order('nome', { ascending: true })
      .range(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA - 1)

    if (error) {
      console.error('Erro ao carregar tutores:', error)
    } else {
      setTutores(data || [])
      setTotal(count || 0)
    }

    setLoading(false)
  }

  async function buscarTutores(termo?: string) {
    const termoBusca = termo ?? busca
    if (!termoBusca.trim()) {
      carregarTutores()
      return
    }

    setLoading(true)

    const termoSafe = termoBusca.trim().replace(/[,.()"'\\]/g, '')
    if (!termoSafe) {
      carregarTutores()
      return
    }

    const { data, error, count } = await supabase
      .from('tutores')
      .select('*', { count: 'exact' })
      .eq('ativo', true)
      .or(`nome.ilike.%${termoSafe}%,telefone.ilike.%${termoSafe}%,cpf.ilike.%${termoSafe}%,email.ilike.%${termoSafe}%,cidade.ilike.%${termoSafe}%`)
      .order('nome', { ascending: true })
      .limit(50)

    if (error) {
      console.error('Erro na busca:', error)
    } else {
      setTutores(data || [])
      setTotal(count || 0)
    }

    setLoading(false)
  }

  function formatarTelefone(tel: string | null) {
    if (!tel) return '-'
    const limpo = tel.replace(/\D/g, '')
    if (limpo.length === 11) {
      return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7)}`
    }
    return tel
  }

  const totalPaginas = Math.ceil(total / POR_PAGINA)

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-blue-50 items-center justify-center">
            <Users className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-title text-[var(--shell-text)]">Tutores</h1>
            <p className="text-small text-[var(--shell-text-muted)]">{total.toLocaleString()} tutores cadastrados</p>
          </div>
        </div>
      </div>

      {/* Busca */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--surface-400)]" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone, CPF, email, cidade..."
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
      </div>

      {/* Loading state */}
      {loading ? (
        <>
          {/* Desktop skeleton */}
          <div className="hidden md:block card overflow-hidden">
            <table className="w-full">
              <thead className="bg-[var(--surface-50)] border-b border-[var(--surface-200)]">
                <tr>
                  <th className="text-left px-4 py-3 text-caption text-[var(--surface-500)]">Nome</th>
                  <th className="text-left px-4 py-3 text-caption text-[var(--surface-500)]">Telefone</th>
                  <th className="text-left px-4 py-3 text-caption text-[var(--surface-500)]">Cidade</th>
                  <th className="text-left px-4 py-3 text-caption text-[var(--surface-500)]">Email</th>
                  <th className="text-center px-4 py-3 text-caption text-[var(--surface-500)]">Ações</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonTableRow key={i} cols={5} />
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile skeleton */}
          <div className="md:hidden space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="card p-4 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </>
      ) : tutores.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum tutor encontrado"
          description={busca ? 'Tente ajustar o termo de busca' : 'Nenhum tutor cadastrado ainda'}
        />
      ) : (
        <>
          {/* Desktop: Table */}
          <div className="hidden md:block card overflow-hidden">
            <table className="w-full">
              <thead className="bg-[var(--surface-50)] border-b border-[var(--surface-200)]">
                <tr>
                  <th className="text-left px-4 py-3 text-caption text-[var(--surface-500)]">Nome</th>
                  <th className="text-left px-4 py-3 text-caption text-[var(--surface-500)]">Telefone</th>
                  <th className="text-left px-4 py-3 text-caption text-[var(--surface-500)]">Cidade</th>
                  <th className="text-left px-4 py-3 text-caption text-[var(--surface-500)]">Email</th>
                  <th className="text-center px-4 py-3 text-caption text-[var(--surface-500)]">Ações</th>
                </tr>
              </thead>
              <tbody>
                {tutores.map((tutor) => (
                  <tr key={tutor.id} className="border-b border-[var(--surface-100)] hover:bg-[var(--surface-50)] transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/tutores/${tutor.id}`} className="font-medium text-[var(--surface-800)] hover:text-[var(--brand-600)]">
                        {tutor.nome}
                      </Link>
                      {tutor.cpf && (
                        <p className="text-xs text-[var(--surface-400)] text-mono">{tutor.cpf}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {tutor.telefone ? (
                        <a
                          href={`https://wa.me/${tutor.telefone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-green-400 hover:text-green-300"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                          <span className="text-mono text-sm">{formatarTelefone(tutor.telefone)}</span>
                        </a>
                      ) : (
                        <span className="text-[var(--surface-400)]">-</span>
                      )}
                      {tutor.telefone2 && (
                        <p className="text-xs text-[var(--surface-400)] mt-1 text-mono">{formatarTelefone(tutor.telefone2)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-[var(--surface-600)]">
                        {tutor.cidade ? (
                          <>
                            <MapPin className="h-3 w-3 text-[var(--surface-400)]" />
                            <span className="text-sm">{tutor.bairro ? `${tutor.bairro}, ` : ''}{tutor.cidade}</span>
                          </>
                        ) : (
                          <span className="text-[var(--surface-400)]">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-[var(--surface-600)]">{tutor.email || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link
                        href={`/tutores/${tutor.id}`}
                        className="btn-secondary text-xs py-1.5 px-3"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: Stacked cards */}
          <div className="md:hidden space-y-2 stagger-children">
            {tutores.map((tutor) => (
              <Link
                key={tutor.id}
                href={`/tutores/${tutor.id}`}
                className="card block p-4 card-hover active:scale-[0.98] transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-[var(--surface-800)] truncate">{tutor.nome}</h3>
                    {tutor.cpf && (
                      <p className="text-xs text-[var(--surface-400)] text-mono mt-0.5">{tutor.cpf}</p>
                    )}
                  </div>
                  <FileText className="h-4 w-4 text-[var(--surface-300)] flex-shrink-0 ml-2" />
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                  {tutor.telefone && (
                    <span className="inline-flex items-center gap-1.5 text-sm text-green-400">
                      <Phone className="h-3.5 w-3.5" />
                      <span className="text-mono">{formatarTelefone(tutor.telefone)}</span>
                    </span>
                  )}
                  {tutor.cidade && (
                    <span className="inline-flex items-center gap-1 text-sm text-[var(--surface-500)]">
                      <MapPin className="h-3.5 w-3.5" />
                      {tutor.bairro ? `${tutor.bairro}, ` : ''}{tutor.cidade}
                    </span>
                  )}
                </div>

                {tutor.email && (
                  <p className="text-xs text-[var(--surface-400)] mt-1.5 truncate">{tutor.email}</p>
                )}
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Paginação */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-small text-[var(--surface-400)]">
            <span className="hidden sm:inline">Mostrando </span>{pagina * POR_PAGINA + 1}-{Math.min((pagina + 1) * POR_PAGINA, total)} de {total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPagina(p => Math.max(0, p - 1))}
              disabled={pagina === 0}
              className="btn-secondary p-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="px-4 py-2 text-sm text-[var(--surface-600)]">
              {pagina + 1} / {totalPaginas}
            </span>
            <button
              onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
              disabled={pagina >= totalPaginas - 1}
              className="btn-secondary p-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
