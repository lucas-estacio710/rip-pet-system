'use client'

import RemocoesKPI from './RemocoesKPI'
import TipoCremacaoKPI from './TipoCremacaoKPI'
import LocalRemocaoKPI from './LocalRemocaoKPI'
import EspecieKPI from './EspecieKPI'
import ComoConheceuKPI from './ComoConheceuKPI'
import type { PeriodRange } from '@/lib/dashboard-period'

type Props = {
  range: PeriodRange
  comparePrev: boolean
}

export default function OperacionalTab({ range, comparePrev }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <RemocoesKPI range={range} comparePrev={comparePrev} />
        <TipoCremacaoKPI range={range} comparePrev={comparePrev} />
        <LocalRemocaoKPI range={range} comparePrev={comparePrev} />
        <EspecieKPI range={range} comparePrev={comparePrev} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ComoConheceuKPI range={range} comparePrev={comparePrev} />
      </div>
    </div>
  )
}
