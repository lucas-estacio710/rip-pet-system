'use client'

import { useEffect, useState } from 'react'
import { LayoutDashboard, TrendingUp, Users, FileText, Route, Boxes } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/Skeleton'

type StatusCount = Record<string, number>

const STATUS_CARDS = [
  { key: 'ativo', label: 'Ativos', sublabel: 'Santos', color: 'border-l-red-500', bgIcon: 'bg-red-900/30', textIcon: 'text-red-400', textValue: 'text-red-400' },
  { key: 'pinda', label: 'Em Pinda', sublabel: 'Crematório', color: 'border-l-orange-500', bgIcon: 'bg-orange-900/30', textIcon: 'text-orange-400', textValue: 'text-orange-400' },
  { key: 'retorno', label: 'Retorno', sublabel: 'Cinzas prontas', color: 'border-l-cyan-500', bgIcon: 'bg-cyan-900/30', textIcon: 'text-cyan-400', textValue: 'text-cyan-400' },
  { key: 'preventivo', label: 'Preventivos', sublabel: 'Pet vivo', color: 'border-l-amber-500', bgIcon: 'bg-amber-900/30', textIcon: 'text-amber-400', textValue: 'text-amber-400' },
  { key: 'pendente', label: 'Pendentes', sublabel: 'Ação necessária', color: 'border-l-purple-500', bgIcon: 'bg-purple-900/30', textIcon: 'text-purple-400', textValue: 'text-purple-400' },
  { key: 'finalizado', label: 'Finalizados', sublabel: 'Concluídos', color: 'border-l-gray-400', bgIcon: 'bg-slate-700/50', textIcon: 'text-slate-400', textValue: 'text-slate-400' },
]

export default function DashboardPage() {
  const [statusCounts, setStatusCounts] = useState<StatusCount>({})
  const [totalContratos, setTotalContratos] = useState(0)
  const [totalTutores, setTotalTutores] = useState(0)
  const [totalProdutos, setTotalProdutos] = useState(0)
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    async function loadData() {
      const statusList = ['preventivo', 'ativo', 'pinda', 'retorno', 'pendente', 'finalizado']
      const counts: StatusCount = {}

      // Fetch all status counts + totals in parallel
      const [statusResults, contratosResult, tutoresResult, produtosResult] = await Promise.all([
        Promise.all(statusList.map(async (status) => {
          const { count } = await supabase
            .from('contratos')
            .select('*', { count: 'exact', head: true })
            .eq('status', status)
          return { status, count: count || 0 }
        })),
        supabase.from('contratos').select('*', { count: 'exact', head: true }),
        supabase.from('tutores').select('*', { count: 'exact', head: true }).eq('ativo', true),
        supabase.from('produtos').select('*', { count: 'exact', head: true }).eq('ativo', true),
      ])

      statusResults.forEach(({ status, count }) => { counts[status] = count })
      setStatusCounts(counts)
      setTotalContratos(contratosResult.count || 0)
      setTotalTutores(tutoresResult.count || 0)
      setTotalProdutos(produtosResult.count || 0)
      setLoading(false)
    }

    loadData()
  }, [])

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-[var(--brand-700)]/20 items-center justify-center">
          <LayoutDashboard className="h-5 w-5 text-[var(--brand-500)]" />
        </div>
        <div>
          <h1 className="text-title text-[var(--shell-text)]">Dashboard</h1>
          <p className="text-small text-[var(--shell-text-muted)]">Visão geral do CRM</p>
        </div>
      </div>

      {/* KPI Cards - Status */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6 stagger-children">
        {STATUS_CARDS.map(card => (
          <Link
            key={card.key}
            href={`/contratos?status=${card.key}`}
            className={`card card-hover p-4 border-l-4 ${card.color}`}
          >
            <p className="text-caption text-[var(--surface-400)] mb-1">{card.label}</p>
            {loading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <p className={`text-display text-mono ${card.textValue}`}>
                {statusCounts[card.key] || 0}
              </p>
            )}
            <p className="text-xs text-[var(--surface-400)] mt-1 hidden lg:block">{card.sublabel}</p>
          </Link>
        ))}
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Link href="/contratos" className="card card-hover p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-[var(--radius-lg)] bg-[var(--brand-700)]/20 flex items-center justify-center flex-shrink-0">
            <FileText className="h-6 w-6 text-[var(--brand-500)]" />
          </div>
          <div>
            <p className="text-caption text-[var(--surface-400)]">Total Contratos</p>
            {loading ? <Skeleton className="h-7 w-16 mt-1" /> : (
              <p className="text-title text-mono text-[var(--surface-800)]">{totalContratos.toLocaleString('pt-BR')}</p>
            )}
          </div>
        </Link>
        <Link href="/tutores" className="card card-hover p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-[var(--radius-lg)] bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <Users className="h-6 w-6 text-blue-500" />
          </div>
          <div>
            <p className="text-caption text-[var(--surface-400)]">Tutores Ativos</p>
            {loading ? <Skeleton className="h-7 w-16 mt-1" /> : (
              <p className="text-title text-mono text-[var(--surface-800)]">{totalTutores.toLocaleString('pt-BR')}</p>
            )}
          </div>
        </Link>
        <Link href="/estoque" className="card card-hover p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-[var(--radius-lg)] bg-amber-900/30 flex items-center justify-center flex-shrink-0">
            <Boxes className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <p className="text-caption text-[var(--surface-400)]">Produtos</p>
            {loading ? <Skeleton className="h-7 w-16 mt-1" /> : (
              <p className="text-title text-mono text-[var(--surface-800)]">{totalProdutos.toLocaleString('pt-BR')}</p>
            )}
          </div>
        </Link>
      </div>

      {/* Placeholder for future content */}
      <div className="card p-8">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-full bg-[var(--surface-100)] flex items-center justify-center mb-4">
            <TrendingUp className="h-6 w-6 text-[var(--surface-400)]" />
          </div>
          <p className="text-subtitle text-[var(--surface-600)] mb-1">Gráficos em breve</p>
          <p className="text-small text-[var(--surface-400)] max-w-md">
            Evolução mensal, IND vs COL, EM vs PV, ranking clínicas e métricas financeiras
          </p>
        </div>
      </div>
    </div>
  )
}
