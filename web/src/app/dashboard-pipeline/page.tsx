'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, DollarSign, Building2, Megaphone, BarChart3, Calendar, type LucideIcon } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import { useFieldPermission } from '@/hooks/useFieldPermission'
import OperacionalTab from '@/components/dashboards/OperacionalTab'
import FinanceiroTab from '@/components/dashboards/FinanceiroTab'
import {
  PERIOD_GROUPS,
  DEFAULT_PERIOD,
  computeRange,
  computePreviousRange,
  formatRangeShort,
  type PeriodKey,
} from '@/lib/dashboard-period'
import { type DashboardModo, MODO_STORAGE_KEY } from '@/lib/dashboard-modo'

const TELA = 'tela_dashboards'
const PERIOD_STORAGE_KEY = 'dashboards.period'
const CUSTOM_FROM_KEY = 'dashboards.period.from'
const CUSTOM_TO_KEY = 'dashboards.period.to'
const COMPARE_PREV_KEY = 'dashboards.comparePrev'

type TabDef = {
  key: string
  obj: string
  label: string
  desc: string
  icon: LucideIcon
}

const TABS: TabDef[] = [
  { key: 'operacional', obj: 'obj_dash_operacional', label: 'Operacional', desc: 'Volume, fluxo, supindas, entregas, rescaldos', icon: Activity },
  { key: 'financeiro',  obj: 'obj_dash_financeiro',  label: 'Financeiro',  desc: 'Receita, custo cremação, ticket médio, pendentes, NFS-e', icon: DollarSign },
  { key: 'comercial',   obj: 'obj_dash_comercial',   label: 'Comercial',   desc: 'Ranking clínicas, indicações, conversão de leads', icon: Building2 },
  { key: 'marketing',   obj: 'obj_dash_marketing',   label: 'Marketing',   desc: 'UTM, leads, conversão, RIP Shield, ROAS', icon: Megaphone },
]

function toIsoDate(d: Date | null): string {
  if (!d) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
function fromIsoDate(s: string | null): Date | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

export default function DashboardsPage() {
  const { isVisible } = useFieldPermission()

  const visibleTabs = useMemo(
    () => TABS.filter(t => isVisible(TELA, t.obj)),
    [isVisible]
  )

  const [active, setActive] = useState<string | null>(visibleTabs[0]?.key ?? null)
  const [periodKey, setPeriodKey] = useState<PeriodKey>(DEFAULT_PERIOD)
  const [customFrom, setCustomFrom] = useState<Date | null>(null)
  const [customTo, setCustomTo] = useState<Date | null>(null)
  const [comparePrev, setComparePrev] = useState(false)
  const [modo, setModo] = useState<DashboardModo>('remocoes')

  // Hidrata do localStorage no client
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PERIOD_STORAGE_KEY) as PeriodKey | null
      if (saved && PERIOD_GROUPS.some(g => g.items.some(i => i.key === saved))) {
        setPeriodKey(saved)
      }
      setCustomFrom(fromIsoDate(localStorage.getItem(CUSTOM_FROM_KEY)))
      setCustomTo(fromIsoDate(localStorage.getItem(CUSTOM_TO_KEY)))
      setComparePrev(localStorage.getItem(COMPARE_PREV_KEY) === '1')
      const savedModo = localStorage.getItem(MODO_STORAGE_KEY)
      if (savedModo === 'contratos' || savedModo === 'remocoes') setModo(savedModo)
    } catch { /* ignora */ }
  }, [])

  function selectModo(m: DashboardModo) {
    setModo(m)
    try { localStorage.setItem(MODO_STORAGE_KEY, m) } catch { /* ignora */ }
  }

  function selectPeriod(k: PeriodKey) {
    setPeriodKey(k)
    try { localStorage.setItem(PERIOD_STORAGE_KEY, k) } catch { /* ignora */ }
  }

  function updateCustomFrom(s: string) {
    const d = fromIsoDate(s)
    setCustomFrom(d)
    try { localStorage.setItem(CUSTOM_FROM_KEY, s) } catch { /* ignora */ }
  }
  function updateCustomTo(s: string) {
    const d = fromIsoDate(s)
    setCustomTo(d)
    try { localStorage.setItem(CUSTOM_TO_KEY, s) } catch { /* ignora */ }
  }

  function toggleComparePrev() {
    setComparePrev(prev => {
      const next = !prev
      try { localStorage.setItem(COMPARE_PREV_KEY, next ? '1' : '0') } catch { /* ignora */ }
      return next
    })
  }

  const range = useMemo(
    () => computeRange(periodKey, new Date(), { from: customFrom, to: customTo }),
    [periodKey, customFrom, customTo]
  )
  const activeTab = visibleTabs.find(t => t.key === active) ?? visibleTabs[0]

  if (visibleTabs.length === 0) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <EmptyState
          icon={BarChart3}
          title="Nenhum dashboard disponível"
          description="Sua unidade não tem nenhuma seção de Dashboards habilitada. Fale com o administrador."
        />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-semibold text-[var(--surface-800)] flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-[var(--brand-500)]" /> Dashboards
        </h1>
      </div>

      {/* Filtro temporal — em desktop os 2 grupos ficam na mesma linha */}
      <div className="mb-4">
        <div className="flex flex-col md:flex-row md:items-center md:flex-wrap gap-x-5 gap-y-1.5">
          {PERIOD_GROUPS.map(group => (
            <div key={group.label} className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wide text-[var(--surface-400)] shrink-0 font-mono">
                {group.label}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {group.items.map(item => {
                  const isActive = periodKey === item.key
                  return (
                    <button
                      key={item.key}
                      onClick={() => selectPeriod(item.key)}
                      className="text-xs font-medium px-2.5 py-1 rounded-full transition-colors"
                      style={{
                        background: isActive ? 'var(--brand-500)' : 'transparent',
                        color: isActive ? '#fff' : 'var(--surface-600)',
                        border: `1px solid ${isActive ? 'transparent' : 'var(--surface-300)'}`,
                      }}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Inputs do Personalizado */}
        {periodKey === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <label className="flex items-center gap-1.5 text-xs text-[var(--surface-500)]">
              De
              <input
                type="date"
                value={toIsoDate(customFrom)}
                onChange={e => updateCustomFrom(e.target.value)}
                className="text-xs px-2 py-1 rounded border border-[var(--surface-300)] bg-[var(--surface-0)] text-[var(--surface-800)]"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[var(--surface-500)]">
              Até
              <input
                type="date"
                value={toIsoDate(customTo)}
                onChange={e => updateCustomTo(e.target.value)}
                className="text-xs px-2 py-1 rounded border border-[var(--surface-300)] bg-[var(--surface-0)] text-[var(--surface-800)]"
              />
            </label>
          </div>
        )}

        {/* Range + toggle de modo (Remoções/Contratos) + comparação */}
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-1.5">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--surface-500)] font-mono">
            <Calendar className="h-3 w-3" />
            {formatRangeShort(range)}
          </div>

          {/* Toggle Remoções ↔ Contratos */}
          <div className="inline-flex rounded-full border border-[var(--surface-300)] p-0.5 bg-[var(--surface-0)]">
            {([['remocoes', 'Remoções'], ['contratos', 'Contratos']] as const).map(([key, label]) => {
              const isActive = modo === key
              return (
                <button
                  key={key}
                  onClick={() => selectModo(key)}
                  className="text-[11px] font-medium px-2.5 py-0.5 rounded-full transition-colors"
                  style={{
                    background: isActive ? 'var(--brand-500)' : 'transparent',
                    color: isActive ? '#fff' : 'var(--surface-600)',
                  }}
                  title={key === 'remocoes'
                    ? 'Conta remoções (pet já coletado), por data de acolhimento'
                    : 'Conta todos os contratos (inclui preventivos), por data do contrato'}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--surface-500)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={comparePrev}
              onChange={toggleComparePrev}
              className="h-3 w-3 accent-[var(--brand-500)]"
            />
            Comparar c/ período anterior
            {comparePrev && (
              <span className="font-mono text-[var(--surface-400)]">
                ({formatRangeShort(computePreviousRange(range))})
              </span>
            )}
          </label>
        </div>
      </div>

      {/* Tabs (categorias) */}
      <div className="flex flex-wrap gap-1.5 mb-4 border-b border-[var(--surface-200)] pb-2">
        {visibleTabs.map(t => {
          const Icon = t.icon
          const isActive = activeTab?.key === t.key
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full transition-colors"
              style={{
                background: isActive ? 'var(--brand-500)' : 'transparent',
                color: isActive ? '#fff' : 'var(--surface-600)',
                border: `1px solid ${isActive ? 'transparent' : 'var(--surface-300)'}`,
              }}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Conteúdo da aba ativa */}
      {activeTab?.key === 'operacional' ? (
        <OperacionalTab range={range} comparePrev={comparePrev} modo={modo} />
      ) : activeTab?.key === 'financeiro' ? (
        <FinanceiroTab range={range} comparePrev={comparePrev} modo={modo} />
      ) : activeTab ? (
        <div className="card p-4 sm:p-6">
          <EmptyState
            icon={activeTab.icon}
            title={`Dashboard ${activeTab.label}`}
            description={`Em breve: ${activeTab.desc.toLowerCase()} no período "${range.label}".`}
          />
        </div>
      ) : null}
    </div>
  )
}
