'use client'

// DRE — Demonstração do Resultado do mês (migration 111).
//
// Lê `vw_dre_resumo` (uma linha por unidade/mês, já com resultado calculado) e,
// ao expandir um grupo, `vw_dre_mensal` (a abertura conta a conta).
//
// Duas coisas que a tela deixa explícitas de propósito:
//  · A RECEITA vem de `contratos`, não de lançamento manual — por isso bate com o
//    Dashboard. Ninguém digita receita aqui.
//  · INVESTIMENTO (capex) aparece SEPARADO, embaixo da linha do resultado. Comprar
//    um forno não é despesa do mês: é troca de dinheiro por um bem que dura anos.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Loader2, ChevronRight, TrendingUp, Landmark } from 'lucide-react'
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

/** Linha da DRE. `grupo` liga a linha às contas de `vw_dre_mensal` no drill-down. */
type Linha = {
  rotulo: string
  valor: number
  grupo?: string
  negativo?: boolean          // exibe com sinal de menos
  soma?: boolean              // linha de subtotal (fundo destacado)
  forte?: boolean
}

export default function DRETab() {
  const supabaseTipado = createClient()
  // As views fin_*/vw_dre_* (mig 111) não estão em types/database.ts → o client
  // tipado infere `never`. Client destipado só para elas.
  const supabase = supabaseTipado as unknown as SupabaseClient
  const { currentUnit } = useUnit()

  const [mes, setMes] = useState(mesAtual())
  const [resumo, setResumo] = useState<Resumo>(ZERO)
  const [contas, setContas] = useState<LinhaConta[]>([])
  const [carregando, setCarregando] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!currentUnit?.id) return
    setCarregando(true)
    const ref = mesParaData(mes)
    const [r, m] = await Promise.all([
      supabase.from('vw_dre_resumo').select('*')
        .eq('unidade_id', currentUnit.id).eq('mes', ref).maybeSingle(),
      supabase.from('vw_dre_mensal').select('grupo_dre, conta_nome, valor, entra_no_resultado')
        .eq('unidade_id', currentUnit.id).eq('mes', ref),
    ])
    setResumo((r.data as Resumo) || ZERO)
    setContas(((m.data as LinhaConta[]) || []).sort((a, b) => b.valor - a.valor))
    setCarregando(false)
  }, [supabase, currentUnit?.id, mes])

  useEffect(() => { void carregar() }, [carregar])

  const receita = resumo.receita_bruta + resumo.outras_receitas
  const pct = (v: number) => (receita > 0 ? `${((v / receita) * 100).toFixed(1)}%` : '—')

  const linhas: Linha[] = [
    { rotulo: 'Receita de contratos', valor: resumo.receita_bruta, grupo: 'receita_bruta' },
    ...(resumo.outras_receitas ? [{ rotulo: 'Outras receitas', valor: resumo.outras_receitas, grupo: 'outras_receitas' }] : []),
    { rotulo: 'Deduções', valor: resumo.deducoes, grupo: 'deducoes', negativo: true },
    { rotulo: 'Custo do serviço', valor: resumo.custo_servico, grupo: 'custo_servico', negativo: true },
    { rotulo: 'Margem bruta', valor: resumo.margem_bruta, soma: true },
    { rotulo: 'Pessoal', valor: resumo.desp_pessoal, grupo: 'despesa_pessoal', negativo: true },
    { rotulo: 'Operacional', valor: resumo.desp_operacional, grupo: 'despesa_operacional', negativo: true },
    { rotulo: 'Administrativa', valor: resumo.desp_administrativa, grupo: 'despesa_administrativa', negativo: true },
    { rotulo: 'Comercial', valor: resumo.desp_comercial, grupo: 'despesa_comercial', negativo: true },
    { rotulo: 'Financeira', valor: resumo.desp_financeira, grupo: 'despesa_financeira', negativo: true },
    ...(resumo.outras_despesas ? [{ rotulo: 'Outras despesas', valor: resumo.outras_despesas, grupo: 'outras_despesas', negativo: true }] : []),
    { rotulo: 'Resultado', valor: resumo.resultado, soma: true, forte: true },
  ]

  const contasDo = (g: string) => contas.filter(c => c.grupo_dre === g && c.entra_no_resultado)
  const vazio = !carregando && receita === 0 && resumo.resultado === 0 && !resumo.investimentos

  return (
    <div className="animate-fade-in space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="month" value={mes} onChange={e => setMes(e.target.value)}
          className="input text-sm w-36 py-1"
        />
        <span className="text-xs text-[var(--surface-500)]">
          {currentUnit?.nome} · {rotuloMes(mesParaData(mes))}
        </span>
        {carregando && <Loader2 className="h-4 w-4 animate-spin text-[var(--surface-400)]" />}
      </div>

      {vazio ? (
        <p className="text-sm text-[var(--surface-500)] py-10 text-center">
          Sem movimento neste mês.
        </p>
      ) : (
        <>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {linhas.map((l, i) => {
                  const contasGrupo = l.grupo ? contasDo(l.grupo) : []
                  const expansivel = contasGrupo.length > 0
                  const expandido = aberto === l.grupo
                  return (
                    <tr key={i} className="contents">
                      <td colSpan={3} className="p-0">
                        <button
                          type="button"
                          onClick={() => expansivel && setAberto(expandido ? null : l.grupo!)}
                          disabled={!expansivel}
                          className="w-full flex items-center gap-2 px-3 py-2 border-b border-[var(--surface-200)] text-left transition-colors enabled:hover:bg-[var(--surface-50)] disabled:cursor-default"
                          style={{
                            background: l.soma ? 'var(--surface-50)' : undefined,
                            fontWeight: l.soma ? 600 : 400,
                          }}
                        >
                          <ChevronRight
                            className="h-3.5 w-3.5 shrink-0 transition-transform"
                            style={{
                              opacity: expansivel ? 1 : 0,
                              transform: expandido ? 'rotate(90deg)' : undefined,
                              color: 'var(--surface-400)',
                            }}
                          />
                          <span className={l.soma ? 'text-[var(--surface-800)]' : 'text-[var(--surface-700)]'}>
                            {l.negativo && <span className="text-[var(--surface-400)]">(−) </span>}
                            {l.rotulo}
                          </span>
                          <span
                            className="ml-auto text-mono tabular-nums"
                            style={{
                              color: l.forte
                                ? (l.valor >= 0 ? '#10b981' : '#ef4444')
                                : l.negativo ? 'var(--surface-600)' : 'var(--surface-800)',
                              fontSize: l.forte ? '1rem' : undefined,
                            }}
                          >
                            {l.negativo && l.valor > 0 ? '−' : ''}{fmtBRL(Math.abs(l.valor))}
                          </span>
                          <span className="w-14 text-right text-xs text-[var(--surface-400)] tabular-nums shrink-0">
                            {l.soma ? pct(l.valor) : ''}
                          </span>
                        </button>

                        {expandido && (
                          <div className="bg-[var(--surface-50)] border-b border-[var(--surface-200)] divide-y divide-[var(--surface-200)]">
                            {contasGrupo.map((c, k) => (
                              <div key={k} className="flex items-center gap-2 pl-9 pr-3 py-1.5 text-xs">
                                <span className="text-[var(--surface-600)]">{c.conta_nome}</span>
                                <span className="ml-auto text-mono text-[var(--surface-700)] tabular-nums">
                                  {fmtBRL(c.valor)}
                                </span>
                                <span className="w-14" />
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* CAPEX fica FORA do resultado — é a linha que as planilhas antigas
              misturavam com café e combustível, e que mais distorcia o mês. */}
          {resumo.investimentos > 0 && (
            <div className="card p-3">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-sky-400 shrink-0" />
                <span className="text-sm text-[var(--surface-700)]">Investimentos</span>
                <span className="ml-auto text-mono text-sm text-sky-400 tabular-nums">
                  {fmtBRL(resumo.investimentos)}
                </span>
              </div>
              <p className="text-xs text-[var(--surface-500)] mt-1.5 pl-6">
                Bens que continuam valendo depois do mês — não entram no resultado acima.
              </p>
              {contas.filter(c => !c.entra_no_resultado).length > 0 && (
                <div className="mt-2 pl-6 divide-y divide-[var(--surface-200)]">
                  {contas.filter(c => !c.entra_no_resultado).map((c, k) => (
                    <div key={k} className="flex items-center gap-2 py-1.5 text-xs">
                      <span className="text-[var(--surface-600)]">{c.conta_nome}</span>
                      <span className="ml-auto text-mono text-[var(--surface-700)] tabular-nums">{fmtBRL(c.valor)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="flex items-start gap-1.5 text-xs text-[var(--surface-500)]">
            <TrendingUp className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              Receita apurada pelos contratos do mês — a mesma base do Dashboard.
              Gastos que cobrem vários meses aparecem já divididos.
            </span>
          </p>
        </>
      )}
    </div>
  )
}
