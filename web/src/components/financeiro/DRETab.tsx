'use client'

// DRE — Demonstração do Resultado do mês (migration 111).
//
// ── O DESENHO (e por que ele é assim) ──────────────────────────────────────
// A primeira versão era uma lista de linhas largas com o valor jogado na borda
// direita: um vão enorme no meio, o olho perdia a linha, e cada número aparecia
// sozinho, sem nada com que se comparar. Refeito seguindo o que a literatura de
// relatório gerencial converge:
//
//  1. CASCATA COM SUBTOTAIS PRÓPRIOS. A DRE não é uma lista de contas: é uma
//     conta que se fecha por etapas. Receita líquida, lucro bruto e resultado
//     operacional são LINHAS, não algo que o leitor calcula de cabeça. A ordem é
//     a contábil — nunca alfabética, nunca por valor.
//  2. TODO NÚMERO TEM COMPARAÇÃO. Um valor sozinho não informa: R$ 34 mil de
//     custo é bom ou ruim? Por isso cada linha carrega **AV%** (peso sobre a
//     receita líquida — análise vertical) e **Δ vs mês anterior** (análise
//     horizontal). É o que transforma a tabela em leitura.
//  3. LARGURA CONTIDA. Rótulo e número perto um do outro; as colunas de
//     comparação ocupam o espaço que antes era vazio.
//  4. COR SÓ ONDE DECIDE. Vermelho não é "número negativo" — despesa negativa é
//     o normal. Vermelho é *piorou*, verde é *melhorou*, e a direção depende da
//     linha: receita subindo é bom, despesa subindo é ruim (`maiorEhMelhor`).
//
// ── DUAS COISAS QUE A TELA DEIXA EXPLÍCITAS ────────────────────────────────
//  · A RECEITA vem de `contratos`, não de lançamento manual — por isso bate com
//    o Dashboard. Ninguém digita receita aqui.
//  · INVESTIMENTO (capex) fica FORA da cascata. Comprar um forno não é despesa
//    do mês: é trocar dinheiro por um bem que dura anos.

import { Fragment, useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Loader2, ChevronRight, Landmark, TrendingUp, TrendingDown } from 'lucide-react'
import { useUnit } from '@/contexts/UnitContext'
import { fmtBRL, mesParaData, rotuloMes } from '@/lib/repasse'

type Resumo = {
  receita_bruta: number; outras_receitas: number; deducoes: number
  custo_servico: number; desp_operacional: number; desp_pessoal: number
  desp_administrativa: number; desp_comercial: number; desp_financeira: number
  outras_despesas: number; investimentos: number
  margem_bruta: number; resultado: number
}
type LinhaConta = { grupo_dre: string; conta_nome: string; valor: number; entra_no_resultado: boolean }

const ZERO: Resumo = {
  receita_bruta: 0, outras_receitas: 0, deducoes: 0, custo_servico: 0,
  desp_operacional: 0, desp_pessoal: 0, desp_administrativa: 0, desp_comercial: 0,
  desp_financeira: 0, outras_despesas: 0, investimentos: 0, margem_bruta: 0, resultado: 0,
}

const mesAtual = () => new Date().toISOString().slice(0, 7)

/** Mês anterior a 'YYYY-MM'. */
function mesAnterior(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Só o número, sem "R$" — na tabela o cifrão em toda linha vira ruído. */
const num = (v: number) =>
  Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Tipo = 'conta' | 'subtotal' | 'total'
type Linha = {
  rotulo: string
  valor: number
  anterior: number
  tipo: Tipo
  grupo?: string            // liga ao drill-down de vw_dre_mensal
  negativo?: boolean        // exibe com (−) e desconta na cascata
  maiorEhMelhor: boolean    // decide a cor do Δ
}

export default function DRETab() {
  const supabaseTipado = createClient()
  // As views vw_dre_* (mig 111) não estão em types/database.ts → client destipado.
  const supabase = supabaseTipado as unknown as SupabaseClient
  const { currentUnit } = useUnit()

  const [mes, setMes] = useState(mesAtual())
  const [resumo, setResumo] = useState<Resumo>(ZERO)
  const [antes, setAntes] = useState<Resumo>(ZERO)
  const [contas, setContas] = useState<LinhaConta[]>([])
  const [carregando, setCarregando] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!currentUnit?.id) return
    setCarregando(true)
    const ref = mesParaData(mes)
    const refAntes = mesParaData(mesAnterior(mes))
    const [r, p, m] = await Promise.all([
      supabase.from('vw_dre_resumo').select('*').eq('unidade_id', currentUnit.id).eq('mes', ref).maybeSingle(),
      supabase.from('vw_dre_resumo').select('*').eq('unidade_id', currentUnit.id).eq('mes', refAntes).maybeSingle(),
      supabase.from('vw_dre_mensal').select('grupo_dre, conta_nome, valor, entra_no_resultado')
        .eq('unidade_id', currentUnit.id).eq('mes', ref),
    ])
    setResumo((r.data as Resumo) || ZERO)
    setAntes((p.data as Resumo) || ZERO)
    setContas(((m.data as LinhaConta[]) || []).sort((a, b) => b.valor - a.valor))
    setCarregando(false)
  }, [supabase, currentUnit?.id, mes])

  useEffect(() => { void carregar() }, [carregar])

  /** Monta a cascata de um resumo — usada pro mês e pro anterior. */
  const cascata = (x: Resumo) => {
    const receitaLiquida = x.receita_bruta - x.deducoes
    const lucroBruto = receitaLiquida - x.custo_servico
    const despOper = x.desp_pessoal + x.desp_operacional + x.desp_administrativa + x.desp_comercial
    const resultadoOper = lucroBruto - despOper
    return { receitaLiquida, lucroBruto, despOper, resultadoOper }
  }
  const c = cascata(resumo)
  const cA = cascata(antes)

  // AV% sobre a RECEITA LÍQUIDA — é a base usual da análise vertical.
  const base = c.receitaLiquida
  const av = (v: number) => (base > 0 ? `${((v / base) * 100).toFixed(1)}%` : '—')

  const L = (
    rotulo: string, valor: number, anterior: number, tipo: Tipo,
    opt: { grupo?: string; negativo?: boolean; maiorEhMelhor?: boolean } = {}
  ): Linha => ({
    rotulo, valor, anterior, tipo,
    grupo: opt.grupo, negativo: opt.negativo,
    maiorEhMelhor: opt.maiorEhMelhor ?? !opt.negativo,
  })

  const linhas: Linha[] = [
    L('Receita de contratos', resumo.receita_bruta, antes.receita_bruta, 'conta', { grupo: 'receita_bruta' }),
    L('Deduções', resumo.deducoes, antes.deducoes, 'conta', { grupo: 'deducoes', negativo: true }),
    L('Receita líquida', c.receitaLiquida, cA.receitaLiquida, 'subtotal'),
    L('Custo do serviço', resumo.custo_servico, antes.custo_servico, 'conta', { grupo: 'custo_servico', negativo: true }),
    L('Lucro bruto', c.lucroBruto, cA.lucroBruto, 'subtotal'),
    L('Pessoal', resumo.desp_pessoal, antes.desp_pessoal, 'conta', { grupo: 'despesa_pessoal', negativo: true }),
    L('Operacional', resumo.desp_operacional, antes.desp_operacional, 'conta', { grupo: 'despesa_operacional', negativo: true }),
    L('Administrativa', resumo.desp_administrativa, antes.desp_administrativa, 'conta', { grupo: 'despesa_administrativa', negativo: true }),
    L('Comercial', resumo.desp_comercial, antes.desp_comercial, 'conta', { grupo: 'despesa_comercial', negativo: true }),
    L('Resultado operacional', c.resultadoOper, cA.resultadoOper, 'subtotal'),
    L('Financeira', resumo.desp_financeira, antes.desp_financeira, 'conta', { grupo: 'despesa_financeira', negativo: true }),
    ...(resumo.outras_receitas || antes.outras_receitas
      ? [L('Outras receitas', resumo.outras_receitas, antes.outras_receitas, 'conta', { grupo: 'outras_receitas' })] : []),
    ...(resumo.outras_despesas || antes.outras_despesas
      ? [L('Outras despesas', resumo.outras_despesas, antes.outras_despesas, 'conta', { grupo: 'outras_despesas', negativo: true })] : []),
    L('Resultado do mês', resumo.resultado, antes.resultado, 'total'),
  ]

  const contasDo = (g: string) => contas.filter(x => x.grupo_dre === g && x.entra_no_resultado)
  const capex = contas.filter(x => !x.entra_no_resultado)
  const vazio = !carregando && !resumo.receita_bruta && !resumo.resultado && !resumo.investimentos

  /** Δ% vs mês anterior, já com a cor certa pro tipo de linha. */
  function Delta({ l }: { l: Linha }) {
    if (!l.anterior) return <span className="text-[var(--surface-300)]">—</span>
    const d = ((l.valor - l.anterior) / Math.abs(l.anterior)) * 100
    if (Math.abs(d) < 0.05) return <span className="text-[var(--surface-400)]">=</span>
    const bom = d > 0 === l.maiorEhMelhor
    const Icon = d > 0 ? TrendingUp : TrendingDown
    return (
      <span
        className="inline-flex items-center gap-0.5 justify-end"
        style={{ color: bom ? '#10b981' : '#ef4444' }}
        title={`Mês anterior: ${fmtBRL(l.anterior)}`}
      >
        <Icon className="h-3 w-3 shrink-0" />
        {Math.abs(d).toFixed(0)}%
      </span>
    )
  }

  /** Card do topo — o resumo que se lê em dois segundos. */
  function KPI({ rotulo, valor, anterior, pct, maiorEhMelhor = true }: {
    rotulo: string; valor: number; anterior: number; pct?: string; maiorEhMelhor?: boolean
  }) {
    return (
      <div className="card p-3 min-w-0">
        <p className="text-xs text-[var(--surface-500)] truncate">{rotulo}</p>
        <p
          className="text-mono text-lg tabular-nums truncate"
          style={{ color: valor < 0 ? '#ef4444' : 'var(--surface-800)' }}
        >
          {valor < 0 ? '−' : ''}{num(valor)}
        </p>
        <div className="flex items-center gap-2 text-xs mt-0.5">
          {pct && <span className="text-[var(--surface-500)]">{pct}</span>}
          <Delta l={{ rotulo, valor, anterior, tipo: 'conta', maiorEhMelhor }} />
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="month" value={mes} onChange={e => setMes(e.target.value)}
          className="input text-sm w-36 py-1"
        />
        <span className="text-xs text-[var(--surface-500)]">
          {currentUnit?.nome} · {rotuloMes(mesParaData(mes))} · comparado com {rotuloMes(mesParaData(mesAnterior(mes)))}
        </span>
        {carregando && <Loader2 className="h-4 w-4 animate-spin text-[var(--surface-400)]" />}
      </div>

      {vazio ? (
        <p className="text-sm text-[var(--surface-500)] py-10 text-center">Sem movimento neste mês.</p>
      ) : (
        <div className="max-w-4xl space-y-3">
          {/* KPIs: o mês em dois segundos */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <KPI rotulo="Receita líquida" valor={c.receitaLiquida} anterior={cA.receitaLiquida} />
            <KPI rotulo="Lucro bruto" valor={c.lucroBruto} anterior={cA.lucroBruto} pct={av(c.lucroBruto)} />
            <KPI rotulo="Resultado" valor={resumo.resultado} anterior={antes.resultado} pct={av(resumo.resultado)} />
            <KPI rotulo="Investimentos" valor={resumo.investimentos} anterior={antes.investimentos} maiorEhMelhor={false} />
          </div>

          {/* A cascata */}
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <colgroup>
                <col />
                <col className="w-32" />
                <col className="w-16" />
                <col className="w-20" />
              </colgroup>
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-[var(--surface-400)]">
                  <th className="text-left font-medium px-3 py-1.5">Conta</th>
                  <th className="text-right font-medium px-3 py-1.5">R$</th>
                  <th className="text-right font-medium px-2 py-1.5" title="Peso sobre a receita líquida">AV</th>
                  <th className="text-right font-medium px-3 py-1.5" title="Variação sobre o mês anterior">Δ mês</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => {
                  const grupoContas = l.grupo ? contasDo(l.grupo) : []
                  const expansivel = grupoContas.length > 0
                  const expandido = aberto === l.grupo
                  const sub = l.tipo !== 'conta'
                  const total = l.tipo === 'total'
                  return (
                    <Fragment key={i}>
                      <tr
                        onClick={() => expansivel && setAberto(expandido ? null : l.grupo!)}
                        className={`border-t border-[var(--surface-200)] ${expansivel ? 'cursor-pointer hover:bg-[var(--surface-50)]' : ''}`}
                        style={{
                          background: sub ? 'var(--surface-50)' : undefined,
                          fontWeight: sub ? 600 : 400,
                        }}
                      >
                        <td className={`px-3 ${sub ? 'py-2' : 'py-1.5'}`}>
                          <span className="inline-flex items-center gap-1">
                            <ChevronRight
                              className="h-3 w-3 shrink-0 transition-transform"
                              style={{
                                opacity: expansivel ? 1 : 0,
                                transform: expandido ? 'rotate(90deg)' : undefined,
                                color: 'var(--surface-400)',
                              }}
                            />
                            <span
                              className={sub ? 'text-[var(--surface-800)]' : 'text-[var(--surface-600)] pl-1'}
                              style={{ fontSize: total ? '0.95rem' : undefined }}
                            >
                              {sub ? '=' : l.negativo ? '(−)' : '(+)'} {l.rotulo}
                            </span>
                          </span>
                        </td>
                        <td
                          className="px-3 text-right text-mono tabular-nums whitespace-nowrap"
                          style={{
                            fontSize: total ? '1.05rem' : undefined,
                            color: total
                              ? (l.valor >= 0 ? '#10b981' : '#ef4444')
                              : sub ? 'var(--surface-800)' : 'var(--surface-600)',
                          }}
                        >
                          {(l.negativo || l.valor < 0) && l.valor !== 0 ? '−' : ''}{num(l.valor)}
                        </td>
                        <td className="px-2 text-right text-xs text-[var(--surface-400)] tabular-nums whitespace-nowrap">
                          {av(l.valor)}
                        </td>
                        <td className="px-3 text-right text-xs tabular-nums whitespace-nowrap">
                          <Delta l={l} />
                        </td>
                      </tr>

                      {expandido && grupoContas.map((x, k) => (
                        <tr key={`${i}-${k}`} className="bg-[var(--surface-50)] text-xs">
                          <td className="pl-10 pr-3 py-1 text-[var(--surface-500)]">{x.conta_nome}</td>
                          <td className="px-3 py-1 text-right text-mono tabular-nums text-[var(--surface-600)]">{num(x.valor)}</td>
                          <td className="px-2 py-1 text-right text-[var(--surface-300)] tabular-nums">{av(x.valor)}</td>
                          <td />
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* CAPEX fora da cascata — é a linha que as planilhas antigas
              misturavam com café e combustível, e que mais distorcia o mês. */}
          {resumo.investimentos > 0 && (
            <div className="card p-3">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-sky-400 shrink-0" />
                <span className="text-sm text-[var(--surface-700)]">Investimentos</span>
                <span className="ml-auto text-mono text-sm text-sky-400 tabular-nums">{num(resumo.investimentos)}</span>
              </div>
              <p className="text-xs text-[var(--surface-500)] mt-1 pl-6">
                Bens que continuam valendo depois do mês — por isso não entram no resultado acima.
              </p>
              {capex.length > 0 && (
                <div className="mt-2 pl-6 divide-y divide-[var(--surface-200)]">
                  {capex.map((x, k) => (
                    <div key={k} className="flex items-center gap-2 py-1 text-xs">
                      <span className="text-[var(--surface-600)]">{x.conta_nome}</span>
                      <span className="ml-auto text-mono text-[var(--surface-700)] tabular-nums">{num(x.valor)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-[var(--surface-500)]">
            <strong className="font-medium">AV</strong> = peso da linha sobre a receita líquida ·
            <strong className="font-medium"> Δ mês</strong> = variação sobre {rotuloMes(mesParaData(mesAnterior(mes)))},
            em verde quando melhorou. Receita apurada pelos contratos do mês, a mesma base do
            Dashboard; gastos que cobrem vários meses entram já divididos.
          </p>
        </div>
      )}
    </div>
  )
}
