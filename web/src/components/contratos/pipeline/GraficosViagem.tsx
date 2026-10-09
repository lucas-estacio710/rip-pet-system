'use client'

/**
 * Meio do card da viagem no DESKTOP = 3 gráficos do perfil da viagem — fase 2.17e (D5 de
 * docs/REDESENHO_CARDS_PIPELINE.md). Mesmos elementos do /dashboard-pipeline, pra manter a
 * identidade (pedido do Lucas): Tipo de cremação (TipoCremacaoKPI), Espécie (EspecieKPI) e
 * Como nos conheceu (ComoConheceuKPI, top 3 + "Outras"). Cores e ícones de
 * `lib/dashboard-cores.ts` — a mesma fonte dos Dashboards.
 *
 * Tudo calculado dos pets já carregados da viagem, sem biblioteca de gráfico. Várias fontes
 * por contrato contam TODAS, como no dashboard — a soma pode passar de 100% (P-16).
 */
import { Dog, Cat, Bird, type LucideIcon } from 'lucide-react'
import { COLOR_IND, COLOR_COL, COLOR_OUTRAS, ESPECIE_CORES, ESPECIE_LABELS, getFonteConfig, type EspecieKey } from '@/lib/dashboard-cores'

export type PetDoGrafico = { individual: boolean; especie: string | null; fontes: string[] }

const ESPECIES: { key: EspecieKey; icon: LucideIcon }[] = [
  { key: 'canina', icon: Dog }, { key: 'felina', icon: Cat }, { key: 'exotica', icon: Bird },
]

const pct = (n: number, t: number) => (t ? Math.round(n / t * 100) : 0)

function Caixa({ titulo, children, largo }: { titulo: string; children: React.ReactNode; largo?: boolean }) {
  return (
    <div className={`min-w-0 rounded-lg px-2 py-1.5 ${largo ? 'flex-[1.4]' : 'flex-1'}`} style={{ background: 'color-mix(in srgb, var(--surface-0) 55%, transparent)' }}>
      <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--surface-500)' }}>{titulo}</div>
      {children}
    </div>
  )
}

export default function GraficosViagem({ pets }: { pets: PetDoGrafico[] }) {
  const total = pets.length
  if (total === 0) return null
  const ind = pets.filter(p => p.individual).length
  const col = total - ind

  const porEspecie = Object.fromEntries(ESPECIES.map(e => [e.key, pets.filter(p => (p.especie || '').toLowerCase() === e.key).length])) as Record<EspecieKey, number>

  const contagem = new Map<string, number>()
  for (const p of pets) for (const f of p.fontes) contagem.set(f, (contagem.get(f) || 0) + 1)
  let fontes = [...contagem.entries()].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n)
  if (fontes.length > 4) fontes = [...fontes.slice(0, 3), { nome: 'Outras', n: fontes.slice(3).reduce((s, f) => s + f.n, 0) }]
  const maxFonte = Math.max(1, ...fontes.map(f => f.n))

  return (
    <div className="flex items-stretch gap-1.5 min-w-0 flex-1">
      <Caixa titulo="Tipo">
        <div className="flex items-baseline justify-between gap-2 font-mono">
          <span className="flex items-center gap-1"><i className="inline-block w-2 h-2 rounded-full" style={{ background: COLOR_IND }} />
            <b className="text-[15px]" style={{ color: 'var(--surface-800)' }}>{ind}</b><span className="text-[10px]" style={{ color: 'var(--surface-500)' }}>{pct(ind, total)}%</span></span>
          <span className="flex items-center gap-1"><i className="inline-block w-2 h-2 rounded-full" style={{ background: COLOR_COL }} />
            <b className="text-[15px]" style={{ color: 'var(--surface-800)' }}>{col}</b><span className="text-[10px]" style={{ color: 'var(--surface-500)' }}>{pct(col, total)}%</span></span>
        </div>
        <div className="flex h-1.5 rounded-full overflow-hidden mt-1.5" style={{ background: 'var(--surface-200)' }}>
          <div style={{ width: `${pct(ind, total)}%`, background: COLOR_IND }} />
          <div style={{ width: `${pct(col, total)}%`, background: COLOR_COL }} />
        </div>
      </Caixa>

      <Caixa titulo="Espécie">
        <div className="grid grid-cols-3 gap-1">
          {ESPECIES.map(e => {
            const n = porEspecie[e.key]
            const Icone = e.icon
            return (
              <div key={e.key} className="flex flex-col items-center text-center leading-tight">
                <Icone className="h-3.5 w-3.5" style={{ color: ESPECIE_CORES[e.key] }} />
                <b className="text-[12px] font-mono" style={{ color: 'var(--surface-800)' }}>{n}</b>
                <span className="text-[8.5px]" style={{ color: 'var(--surface-500)' }}>{ESPECIE_LABELS[e.key]} {pct(n, total)}%</span>
              </div>
            )
          })}
        </div>
      </Caixa>

      <Caixa titulo="Como nos conheceu" largo>
        {fontes.length === 0 ? (
          <span className="text-[11px]" style={{ color: 'var(--surface-400)' }}>Sem informação</span>
        ) : (
          <ul className="space-y-0.5">
            {fontes.map(f => {
              const cfg = f.nome === 'Outras' ? { color: COLOR_OUTRAS } as ReturnType<typeof getFonteConfig> : getFonteConfig(f.nome)
              return (
                <li key={f.nome} className="flex items-center gap-1 text-[10px] min-w-0">
                  <span className="w-3.5 h-3.5 flex-none grid place-items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {cfg.img ? <img src={cfg.img} alt="" className="w-3 h-3 object-contain" /> : cfg.icon ? <span className="text-[9px] leading-none">{cfg.icon}</span> : <span className="w-2 h-2 rounded-full" style={{ background: cfg.color }} />}
                  </span>
                  <span className="truncate w-[70px] flex-none" style={{ color: 'var(--surface-600)' }} title={f.nome}>{f.nome}</span>
                  <span className="flex-1 h-1.5 rounded-full overflow-hidden min-w-[16px]" style={{ background: 'var(--surface-200)' }}>
                    <i className="block h-full rounded-full" style={{ width: `${Math.round(f.n / maxFonte * 100)}%`, background: cfg.color }} />
                  </span>
                  <b className="font-mono flex-none" style={{ color: 'var(--surface-700)' }}>{f.n}</b>
                  <span className="flex-none w-7 text-right" style={{ color: 'var(--surface-500)' }}>{pct(f.n, total)}%</span>
                </li>
              )
            })}
          </ul>
        )}
      </Caixa>
    </div>
  )
}
