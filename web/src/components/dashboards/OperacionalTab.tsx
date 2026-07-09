'use client'

import { useState } from 'react'
import RemocoesKPI from './RemocoesKPI'
import TipoCremacaoKPI from './TipoCremacaoKPI'
import LocalRemocaoKPI from './LocalRemocaoKPI'
import EspecieKPI from './EspecieKPI'
import ComoConheceuKPI from './ComoConheceuKPI'
import FonteOutroKPI from './FonteOutroKPI'
import ResponsavelKPI from './ResponsavelKPI'
import type { PeriodRange } from '@/lib/dashboard-period'
import type { DashboardModo } from '@/lib/dashboard-modo'

type Props = {
  range: PeriodRange
  comparePrev: boolean
  modo: DashboardModo
}

export default function OperacionalTab({ range, comparePrev, modo }: Props) {
  // Disparado pelo FonteOutroKPI quando reclassifica → invalida cache do ComoConheceuKPI
  const [refreshKey, setRefreshKey] = useState(0)
  const triggerRefresh = () => setRefreshKey(k => k + 1)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <RemocoesKPI range={range} comparePrev={comparePrev} modo={modo} />
        <TipoCremacaoKPI range={range} comparePrev={comparePrev} modo={modo} />
        <LocalRemocaoKPI range={range} comparePrev={comparePrev} modo={modo} />
        <EspecieKPI range={range} comparePrev={comparePrev} modo={modo} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ComoConheceuKPI range={range} comparePrev={comparePrev} modo={modo} refreshKey={refreshKey} />
        <FonteOutroKPI range={range} onChange={triggerRefresh} />
        <ResponsavelKPI range={range} comparePrev={comparePrev} modo={modo} />
      </div>
    </div>
  )
}
