'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { computePreviousRange, type PeriodRange } from '@/lib/dashboard-period'
import { filtroModo, type DashboardModo } from '@/lib/dashboard-modo'

type Props = {
  range: PeriodRange
  comparePrev: boolean
  modo: DashboardModo
}

const SEM_RESPONSAVEL = '(sem responsável)'

type RankItem = { nome: string; count: number; prevCount: number }

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

// Contagem de contratos por funcionario_id no período (paginado — Supabase corta em 1000).
// `responsavel_user_id IS NULL` é obrigatório aqui: sem isso, todo contrato de unidade com
// cb_operacional (que usa responsavel_user_id em vez de funcionario_id, mig 123) cai no
// bucket funcionario_id=null — contando 2x (uma vez certo pelo nome, via
// countPorResponsavelUserId, outra errado em "(sem responsável)"). Achado pelo Lucas em
// Santos: "(sem responsável)" mostrava 6, mas os 6 contratos tinham responsável de verdade,
// só que via responsavel_user_id.
async function countPorFuncionario(
  supabase: ReturnType<typeof createClient>,
  unidadeId: string,
  modo: DashboardModo,
  from: Date,
  to: Date,
): Promise<Map<string | null, number>> {
  const PAGE = 1000
  const counts = new Map<string | null, number>()
  for (let offset = 0; ; offset += PAGE) {
    const base = supabase
      .from('contratos')
      .select('funcionario_id')
      .eq('unidade_id', unidadeId)
      .is('responsavel_user_id', null)
      .range(offset, offset + PAGE - 1)
    const { data, error } = await filtroModo(base, modo, from, to)
    if (error) { console.error('[ResponsavelKPI]', error); break }
    const rows = (data ?? []) as { funcionario_id: string | null }[]
    for (const r of rows) counts.set(r.funcionario_id, (counts.get(r.funcionario_id) ?? 0) + 1)
    if (rows.length < PAGE) break
  }
  return counts
}

// Mesma coisa por responsavel_user_id — unidades com cb_operacional (ver mig 123). Só
// entram na contagem os contratos SEM funcionario_id (os dois nunca vêm juntos, ver
// criar-contrato-de-ficha.ts), então soma-se ao mesmo ranking sem contar em dobro.
// Retorna as linhas em vez de já agregar — precisa de `executado_por_funcionario_id` junto
// pra decidir, linha a linha, se o responsável é uma posição (mig 137) e nesse caso trocar
// a identidade pra quem de fato executou, em vez de contar pro nome da posição.
async function buscarResponsavelUserId(
  supabase: ReturnType<typeof createClient>,
  unidadeId: string,
  modo: DashboardModo,
  from: Date,
  to: Date,
): Promise<{ responsavel_user_id: string; executado_por_funcionario_id: string | null }[]> {
  const PAGE = 1000
  const linhas: { responsavel_user_id: string; executado_por_funcionario_id: string | null }[] = []
  for (let offset = 0; ; offset += PAGE) {
    const base = supabase
      .from('contratos')
      .select('responsavel_user_id, executado_por_funcionario_id')
      .eq('unidade_id', unidadeId)
      .not('responsavel_user_id', 'is', null)
      .range(offset, offset + PAGE - 1)
    const { data, error } = await filtroModo(base, modo, from, to)
    if (error) { console.error('[ResponsavelKPI]', error); break }
    const pagina = (data ?? []) as { responsavel_user_id: string; executado_por_funcionario_id: string | null }[]
    linhas.push(...pagina)
    if (pagina.length < PAGE) break
  }
  return linhas
}

export default function ResponsavelKPI({ range, comparePrev, modo }: Props) {
  const { currentUnit } = useUnit()
  const [items, setItems] = useState<RankItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentUnit) return
    const supabase = createClient()
    let cancelled = false
    setLoading(true)

    const prev = computePreviousRange(range)
    Promise.all([
      supabase.from('funcionarios').select('id, nome, user_id').eq('unidade_id', currentUnit.id),
      // SEM filtro de unidade: quem é responsável pelo acolhimento de um contrato de Santos
      // pode ter o PRÓPRIO perfil cadastrado em outra unidade (super_admin, ou alguém que
      // ajuda outra filial) — `responsavel_user_id` não tem nada a ver com onde a pessoa
      // está cadastrada. Achado: Lucas (super_admin) tinha o perfil em São José dos Campos e
      // aparecia "(sem responsável)" em contratos de Santos que ele mesmo atendeu. RLS de
      // `perfis` já limita quem pode ler o quê (só o próprio, exceto super_admin) — filtrar
      // por unidade aqui só quebrava esse caso, não protegia nada a mais.
      supabase.from('perfis').select('user_id, nome, eh_posicao'),
      countPorFuncionario(supabase, currentUnit.id, modo, range.from, range.to),
      buscarResponsavelUserId(supabase, currentUnit.id, modo, range.from, range.to),
      comparePrev
        ? countPorFuncionario(supabase, currentUnit.id, modo, prev.from, prev.to)
        : Promise.resolve(new Map<string | null, number>()),
      comparePrev
        ? buscarResponsavelUserId(supabase, currentUnit.id, modo, prev.from, prev.to)
        : Promise.resolve([] as { responsavel_user_id: string; executado_por_funcionario_id: string | null }[]),
    ]).then(([funcRes, perfisRes, curr, currResp, prevC, prevRespC]) => {
      if (cancelled) return
      const funcionarios = (funcRes.data ?? []) as unknown as { id: string; nome: string; user_id: string | null }[]
      const funcionarioPorId = new Map(funcionarios.map(f => [f.id, f]))
      const perfis = (perfisRes.data ?? []) as unknown as { user_id: string; nome: string | null; eh_posicao?: boolean }[]
      const nomesPerfis = new Map(perfis.map(p => [p.user_id, p.nome]))
      const ehPosicaoPorUserId = new Map(perfis.map(p => [p.user_id, !!p.eh_posicao]))

      // Agrupa por IDENTIDADE, nunca por nome — o projeto já se queimou tentando "achar" a
      // mesma pessoa comparando nome (funcionário duplicado da Kélvia, achado numa sessão
      // anterior). `funcionarios.user_id` (mig 115) é o link EXPLÍCITO, feito por gente, de
      // "essa pessoa da equipe É esse login" — funde os dois lados só quando esse vínculo
      // existe de verdade. Achado testando: em Santos, "Kélvia Carolina" (funcionário) e
      // "Kélvia Rosa" (perfil) são a mesma pessoa (vinculados), mas o nome nunca bateria; já
      // "Ezequiel da Silva"/"Ezequiel Silva" não têm o vínculo — ficam como identidades
      // separadas de propósito, em vez de arriscar fundir gente diferente por coincidência de
      // nome parecido.
      const porIdentidade = new Map<string, RankItem>()
      const somar = (chave: string, nome: string, count: number, isPrev: boolean) => {
        const item = porIdentidade.get(chave) ?? { nome, count: 0, prevCount: 0 }
        if (isPrev) item.prevCount += count
        else item.count += count
        porIdentidade.set(chave, item)
      }
      const addFuncionario = (funcId: string | null, count: number, isPrev: boolean) => {
        const f = funcId ? funcionarioPorId.get(funcId) : null
        if (!f) { somar('sem-responsavel', SEM_RESPONSAVEL, count, isPrev); return }
        if (f.user_id) somar(`user:${f.user_id}`, nomesPerfis.get(f.user_id) || f.nome, count, isPrev)
        else somar(`func:${f.id}`, f.nome, count, isPrev)
      }
      // Responsável é uma posição (perfis.eh_posicao, mig 137) — dispositivo compartilhado,
      // então o nome dela não identifica ninguém. Conta pra quem de fato executou
      // (executado_por_funcionario_id), reaproveitando addFuncionario — mesma regra de
      // "funde por identidade, nunca por nome" de cima. Sem assinatura ainda (não devia
      // acontecer, a conclusão exige) cai em "(sem responsável)" em vez de emprestar o nome
      // da posição.
      const addResponsavel = (row: { responsavel_user_id: string; executado_por_funcionario_id: string | null }, isPrev: boolean) => {
        if (ehPosicaoPorUserId.get(row.responsavel_user_id)) {
          if (row.executado_por_funcionario_id) addFuncionario(row.executado_por_funcionario_id, 1, isPrev)
          else somar('sem-responsavel', SEM_RESPONSAVEL, 1, isPrev)
          return
        }
        somar(`user:${row.responsavel_user_id}`, nomesPerfis.get(row.responsavel_user_id) || SEM_RESPONSAVEL, 1, isPrev)
      }
      curr.forEach((count, funcId) => addFuncionario(funcId, count, false))
      prevC.forEach((count, funcId) => addFuncionario(funcId, count, true))
      currResp.forEach(row => addResponsavel(row, false))
      prevRespC.forEach(row => addResponsavel(row, true))

      const lista = Array.from(porIdentidade.values())
        .filter(i => i.count > 0 || i.prevCount > 0)
        .sort((a, b) => b.count - a.count || a.nome.localeCompare(b.nome))
      setItems(lista)
      setTotal(lista.reduce((s, i) => s + i.count, 0))
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [range.key, range.from.getTime(), range.to.getTime(), comparePrev, modo, currentUnit?.id])

  const max = items[0]?.count ?? 0

  return (
    <div className="card p-4 sm:p-6">
      <div className="text-xs uppercase tracking-wide text-[var(--surface-500)] mb-4">
        Responsável pelo acolhimento
      </div>

      {loading ? (
        <div className="h-32 flex items-center justify-center text-3xl text-[var(--surface-300)]">…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-[var(--surface-400)] py-8 text-center">Sem dados no período</div>
      ) : (
        <ul className="space-y-2">
          {items.map(item => {
            const pct = max > 0 ? (item.count / max) * 100 : 0
            const totalPct = total > 0 ? Math.round((item.count / total) * 100) : 0
            const delta = item.count - item.prevCount
            const showTrend = comparePrev && delta !== 0
            const trendPct = item.prevCount > 0 ? Math.round((delta / item.prevCount) * 100) : (item.count > 0 ? 100 : 0)
            const trendColor = delta > 0 ? '#10b981' : '#ef4444'
            const TrendIcon = delta > 0 ? TrendingUp : TrendingDown
            const isSem = item.nome === SEM_RESPONSAVEL
            return (
              <li key={item.nome} className={`flex items-center gap-2.5 text-xs ${item.count === 0 ? 'opacity-40' : ''}`}>
                <span
                  className="w-5 h-5 rounded-full inline-flex items-center justify-center shrink-0 text-[9px] font-bold"
                  style={{
                    background: isSem ? 'var(--surface-200)' : 'var(--brand-500)',
                    color: isSem ? 'var(--surface-500)' : '#fff',
                  }}
                >
                  {isSem ? '?' : iniciais(item.nome)}
                </span>
                <div className="w-24 sm:w-32 truncate text-[var(--surface-700)] font-medium" title={item.nome}>
                  {item.nome}
                </div>
                <div
                  className="flex-1 h-2 rounded-full overflow-hidden min-w-0"
                  style={{ background: item.count === 0 ? 'var(--surface-100)' : 'var(--surface-200)' }}
                >
                  <div
                    className="h-full transition-all duration-700 ease-out"
                    style={{ width: `${pct}%`, background: isSem ? 'var(--surface-400)' : 'var(--brand-500)' }}
                  />
                </div>
                <div className="font-mono font-semibold text-[var(--surface-800)] tabular-nums w-12 text-right">
                  {item.count.toLocaleString('pt-BR')}
                </div>
                <div className="font-mono text-[var(--surface-400)] tabular-nums w-10 text-right">
                  {totalPct}%
                </div>
                {showTrend && (
                  <div
                    className="inline-flex items-center gap-0.5 font-mono font-medium tabular-nums w-14 justify-end"
                    style={{ color: trendColor }}
                  >
                    <TrendIcon className="h-2.5 w-2.5 shrink-0" />
                    {Math.abs(trendPct)}%
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
