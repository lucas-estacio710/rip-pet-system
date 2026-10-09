'use client'

// VISÃO DO MÊS — a primeira aba do Financeiro (redesenho V2, 09/10/2026;
// desenho aprovado: artifact 9uEYKTjnPY3gdhNkRA6Hho, prancha "V2Mes").
//
// O ENREDO é "como foi o mês da unidade", em 4 atos, nesta ordem:
//   1. Como foi        — entrou · custou · sobrou (vw_dre_resumo, a mesma da DRE)
//   2. Para onde foi   — o custo por grupo da DRE, numa barra
//   3. Está batendo?   — por conta: o que o BANCO disse (fin_saldos_banco, mig
//                        156, gravado pelo Importar) × o que o sistema tem na
//                        mesma data × a diferença
//   4. O que falta     — cada pendência com o botão que a resolve
//
// REGRA DA FANTASIA: roxo só na ação principal; verde = conferido; âmbar =
// atenção; valores à direita em fonte de número. CADA NÚMERO LEVA AO LUGAR
// ONDE SE RESOLVE — por isso a tela recebe `onIr` (trocar de aba) e `onLancar`
// (abrir o + Lançar no item certo) da página.
//
// Cada ato respeita a aba de onde vem: sem a DRE visível, somem 1 e 2; sem o
// Caixa, some o 3; sem o Repasse, o "pagar repasse" sai da lista.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useUnit } from '@/contexts/UnitContext'
import { fmtBRL, fmtData, limitesDoMes, hojeISO } from '@/lib/financeiro'
import { mesParaData } from '@/lib/repasse'
import ExtratoContaModal from './ExtratoContaModal'
import type { AcaoLancar } from '@/lib/lancar'

type Resumo = {
  receita_bruta: number; outras_receitas: number; deducoes: number
  custo_servico: number; desp_operacional: number; desp_pessoal: number
  desp_administrativa: number; desp_comercial: number; desp_financeira: number
  outras_despesas: number; resultado: number
}
type ContaRow = { id: string; nome: string; tipo: string; produto: string | null; caixa_desde: string | null; mostrar_no_caixa: boolean | null }
type CardConta = {
  conta: ContaRow
  cartao: boolean
  banco: { data: string; saldo: number } | null   // o que o banco disse (mig 156)
  sistema: number | null                          // o sistema na mesma data
  conferidoAte: string | null                     // última linha conciliada (mig 153)
}
type Pendencia = { chave: string; titulo: string; detalhe: string; valor?: number; acao: string; onClick: () => void; atencao: boolean }

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const rotulo = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`
const somaMes = (m: string, d: number) => {
  const [a, mm] = m.split('-').map(Number)
  const x = new Date(a, mm - 1 + d, 1)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`
}
const c2 = (n: number) => Math.round(n * 100) / 100
const num = (v: number) => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Os grupos da DRE que são custo, com o nome que o gerente reconhece. */
const GRUPOS: { campo: keyof Resumo; nome: string; cor: string }[] = [
  { campo: 'custo_servico', nome: 'Cremações', cor: '#a78bfa' },
  { campo: 'desp_administrativa', nome: 'Administrativo', cor: '#60a5fa' },
  { campo: 'desp_comercial', nome: 'Comercial', cor: '#f472b6' },
  { campo: 'deducoes', nome: 'Impostos', cor: '#fbbf24' },
  { campo: 'desp_pessoal', nome: 'Pessoal', cor: '#34d399' },
  { campo: 'desp_operacional', nome: 'Operacional', cor: '#fb923c' },
  { campo: 'desp_financeira', nome: 'Financeiro', cor: '#38bdf8' },
  { campo: 'outras_despesas', nome: 'Outros', cor: '#94a3b8' },
]

export default function VisaoMesTab({ verResultado, verCaixa, verRepasse, verLancamentos, onIr, onLancar }: {
  verResultado: boolean
  verCaixa: boolean
  verRepasse: boolean
  verLancamentos: boolean
  onIr: (aba: string) => void
  onLancar?: (acao: AcaoLancar) => void
}) {
  const supabase = createClient() as unknown as SupabaseClient
  const { currentUnit } = useUnit()
  const [mes, setMes] = useState(() => hojeISO().slice(0, 7))
  const [carregando, setCarregando] = useState(false)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [qtdDespesas, setQtdDespesas] = useState(0)
  const [cards, setCards] = useState<CardConta[]>([])
  const [pend, setPend] = useState<Pendencia[]>([])
  const [extratoDe, setExtratoDe] = useState<ContaRow | null>(null)

  const carregar = useCallback(async () => {
    if (!currentUnit?.id) return
    setCarregando(true)
    const uid = currentUnit.id
    const { ini, fim } = limitesDoMes(mes)
    const corte = fim < hojeISO() ? fim : hojeISO()   // mês corrente: até hoje

    const [r, ql, cs, rp, cb] = await Promise.all([
      verResultado
        ? supabase.from('vw_dre_resumo').select('*').eq('unidade_id', uid).eq('mes', mesParaData(mes)).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('fin_lancamentos').select('id', { count: 'exact', head: true })
        .eq('unidade_id', uid).neq('status', 'rejeitado').gte('data_competencia', ini).lte('data_competencia', fim),
      verCaixa
        ? supabase.from('contas').select('id, nome, tipo, produto, caixa_desde, mostrar_no_caixa')
            .or(`unidade_id.eq.${uid},unidades_extras.cs.{${uid}}`).eq('ativo', true).eq('legado', false).order('nome')
        : Promise.resolve({ data: [] }),
      verRepasse
        ? supabase.from('fin_repasses').select('id, mes_referencia, status, qtd_pets, total_liquido')
            .eq('unidade_id', uid).not('status', 'in', '(pago,cancelado)').is('pago_movimento_id', null).order('mes_referencia')
        : Promise.resolve({ data: [] }),
      supabase.from('fin_cobrancas').select('id', { count: 'exact', head: true })
        .eq('unidade_devedora', uid).eq('status', 'emitida'),
    ])
    setResumo((r.data as Resumo | null) || null)
    setQtdDespesas((ql as { count: number | null }).count || 0)

    // ── ato 3: cada conta que aparece no Caixa (sem maquininha) ──
    const contas = ((cs.data as ContaRow[] | null) || [])
      .filter(c => c.mostrar_no_caixa !== false && c.produto !== 'maquininha')
    const novos: CardConta[] = await Promise.all(contas.map(async conta => {
      const cartao = conta.tipo === 'cartao' || conta.produto === 'cartao_credito'
      const [sb, cc] = await Promise.all([
        // A tabela pode ainda não existir (mig 156): sem ela, o card mostra só o "conferido até".
        supabase.from('fin_saldos_banco').select('data, saldo').eq('conta_id', conta.id)
          .lte('data', cartao ? limitesDoMes(somaMes(mes, 1)).fim : fim).order('data', { ascending: false }).limit(1),
        supabase.from('fin_conciliacoes').select('data_banco').eq('conta_id', conta.id)
          .order('data_banco', { ascending: false }).limit(1),
      ])
      const banco = ((sb.data as { data: string; saldo: number }[] | null) || [])[0] || null
      const conferidoAte = ((cc.data as { data_banco: string }[] | null) || [])[0]?.data_banco || null
      let sistema: number | null = null
      if (banco && cartao) {
        // Fatura: as compras lançadas com aquele vencimento (o −total é a dívida).
        const { data: ls } = await supabase.from('fin_lancamentos').select('valor')
          .eq('conta_pagamento_id', conta.id).eq('data_caixa', banco.data).neq('status', 'rejeitado')
        sistema = -c2(((ls as { valor: number }[] | null) || []).reduce((a, l) => a + Number(l.valor), 0))
      } else if (banco) {
        // Conta: tudo o que o Caixa tem até o dia — paginado (limite de 1000).
        let soma = 0
        for (let off = 0; ; off += 1000) {
          const { data: pg } = await supabase.from('vw_caixa').select('valor')
            .eq('conta_id', conta.id).lte('data', banco.data).order('data').order('origem_id').range(off, off + 999)
          const arr = (pg as { valor: number }[] | null) || []
          soma += arr.reduce((a, x) => a + Number(x.valor), 0)
          if (arr.length < 1000) break
        }
        sistema = c2(soma)
      }
      return { conta, cartao, banco: banco ? { data: banco.data, saldo: Number(banco.saldo) } : null, sistema, conferidoAte }
    }))
    setCards(novos)

    // ── ato 4: o que falta ──
    const lista: Pendencia[] = []
    for (const rep of (rp.data as { id: string; mes_referencia: string; status: string; qtd_pets: number; total_liquido: number }[] | null) || []) {
      lista.push({
        chave: `rep-${rep.id}`, titulo: `Pagar o repasse de ${rotulo(rep.mes_referencia.slice(0, 7))} à Matriz`,
        detalhe: `${rep.status === 'aberto' ? 'a Matriz ainda pode mexer' : 'salvo pela Matriz'} · ${rep.qtd_pets} cremações`,
        valor: Number(rep.total_liquido), acao: 'Pagar', atencao: true,
        onClick: () => onLancar?.('quitacao'),
      })
    }
    const nCob = (cb as { count: number | null }).count || 0
    if (nCob && verLancamentos) {
      lista.push({
        chave: 'cob', titulo: `${nCob} ${nCob === 1 ? 'cobrança' : 'cobranças'} de outra unidade esperando você`,
        detalhe: 'reconheça ou recuse em Lançamentos › Acertos entre unidades', acao: 'Ver', atencao: true,
        onClick: () => onIr('lancamentos'),
      })
    }
    for (const k of novos) {
      if (k.cartao) continue
      if (!k.conferidoAte || k.conferidoAte < corte) {
        lista.push({
          chave: `imp-${k.conta.id}`, titulo: `Importar o extrato de ${k.conta.nome}`,
          detalhe: k.conferidoAte ? `conferido até ${fmtData(k.conferidoAte)}` : 'nenhuma linha conferida ainda',
          acao: 'Importar', atencao: false, onClick: () => onLancar?.('importar'),
        })
      }
    }
    setPend(lista)
    setCarregando(false)
  }, [supabase, currentUnit?.id, mes, verResultado, verCaixa, verRepasse, verLancamentos, onIr, onLancar])

  useEffect(() => { void carregar() }, [carregar])

  const entrou = resumo ? c2(Number(resumo.receita_bruta) + Number(resumo.outras_receitas || 0)) : 0
  const sobrou = resumo ? c2(Number(resumo.resultado)) : 0
  const custou = c2(entrou - sobrou)
  const grupos = resumo
    ? GRUPOS.map(g => ({ ...g, valor: Math.abs(Number(resumo[g.campo] || 0)) })).filter(g => g.valor >= 0.005).sort((a, b) => b.valor - a.valor)
    : []
  const somaGrupos = grupos.reduce((a, g) => a + g.valor, 0)

  const titulo = 'text-[11px] font-semibold tracking-[.14em] uppercase text-[var(--surface-500)]'
  const link = 'text-[13px] text-[var(--brand-500)] hover:underline text-left'

  return (
    <div className="space-y-7 max-w-[1120px]">
      {/* A COMISSÃO DE FRENTE: o mês, grande */}
      <div className="flex items-center gap-3">
        <button onClick={() => setMes(m => somaMes(m, -1))} aria-label="Mês anterior"
                className="h-9 w-9 rounded-full border border-[var(--surface-300)] flex items-center justify-center text-[var(--surface-600)] hover:bg-[var(--surface-100)]">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="text-[28px] sm:text-[32px] font-bold tracking-tight text-[var(--surface-900)] capitalize">{rotulo(mes)}</h2>
        <button onClick={() => setMes(m => somaMes(m, 1))} aria-label="Próximo mês"
                className="h-9 w-9 rounded-full border border-[var(--surface-300)] flex items-center justify-center text-[var(--surface-600)] hover:bg-[var(--surface-100)]">
          <ChevronRight className="h-4 w-4" />
        </button>
        {carregando && <Loader2 className="h-4 w-4 animate-spin text-[var(--surface-400)]" />}
      </div>

      {/* 1 · COMO FOI O MÊS */}
      {verResultado && (
        <section className="space-y-3">
          <p className={titulo}>1 · Como foi o mês</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="card p-5 flex flex-col gap-1">
              <span className="text-sm text-[var(--surface-600)]">Entrou</span>
              <span className="text-mono text-2xl tabular-nums text-[var(--surface-900)]">{fmtBRL(entrou)}</span>
              <span className="text-[13px] text-[var(--surface-500)]">cremações, urnas e acessórios vendidos</span>
              <button onClick={() => onIr('dre')} className={`${link} mt-1.5`}>Ver de onde veio →</button>
            </div>
            <div className="card p-5 flex flex-col gap-1">
              <span className="text-sm text-[var(--surface-600)]">Custou</span>
              <span className="text-mono text-2xl tabular-nums text-[var(--surface-900)]">{fmtBRL(custou)}</span>
              <span className="text-[13px] text-[var(--surface-500)]">cremações, impostos e as {qtdDespesas} despesas</span>
              {verLancamentos && <button onClick={() => onIr('lancamentos')} className={`${link} mt-1.5`}>Ver as {qtdDespesas} despesas →</button>}
            </div>
            <div className="card p-5 flex flex-col gap-1" style={{ boxShadow: `inset 0 0 0 1px ${sobrou >= 0 ? 'rgba(16,185,129,.45)' : 'rgba(245,158,11,.5)'}` }}>
              <span className="text-sm text-[var(--surface-600)]">{sobrou >= 0 ? 'Sobrou' : 'Faltou'}</span>
              <span className={`text-mono text-2xl tabular-nums ${sobrou >= 0 ? 'text-emerald-500' : 'text-amber-500'}`}>{fmtBRL(Math.abs(sobrou))}</span>
              <span className="text-[13px] text-[var(--surface-500)]">
                {entrou > 0 ? `${Math.round((sobrou / entrou) * 100)}% do que entrou` : 'sem receita no mês'}
              </span>
              <button onClick={() => onIr('dre')} className={`${link} mt-1.5`}>Ver o resultado linha a linha →</button>
            </div>
          </div>
        </section>
      )}

      {/* 2 · PARA ONDE FOI */}
      {verResultado && grupos.length > 0 && (
        <section className="space-y-3">
          <p className={titulo}>2 · Para onde foi</p>
          <div className="card p-5 space-y-4">
            <div className="flex h-3.5 rounded-full overflow-hidden gap-0.5">
              {grupos.map(g => <span key={g.campo} style={{ flex: g.valor, background: g.cor }} title={`${g.nome}: ${fmtBRL(g.valor)}`} />)}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2.5">
              {grupos.map(g => (
                <button key={g.campo} onClick={() => onIr('dre')} className="flex items-center gap-2.5 text-left hover:opacity-80">
                  <span className="h-2.5 w-2.5 rounded-[3px] shrink-0" style={{ background: g.cor }} />
                  <span className="flex-1 text-sm text-[var(--surface-700)]">{g.nome}</span>
                  <span className="text-[11px] text-[var(--surface-400)] tabular-nums">{somaGrupos ? Math.round((g.valor / somaGrupos) * 100) : 0}%</span>
                  <span className="text-mono text-sm tabular-nums text-[var(--surface-800)] w-24 text-right">{num(g.valor)}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 3 · ESTÁ BATENDO COM O BANCO? */}
      {verCaixa && cards.length > 0 && (
        <section className="space-y-3">
          <p className={titulo}>3 · Está batendo com o banco?</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {cards.map(k => {
              const dif = k.banco && k.sistema !== null ? c2(k.banco.saldo - k.sistema) : null
              const bate = dif !== null && Math.abs(dif) < 0.005
              const estado = !k.banco ? { cor: 'var(--surface-400)', txt: 'sem extrato importado' }
                : bate ? { cor: '#10b981', txt: k.cartao ? 'fatura conferida' : 'batendo' }
                : { cor: '#f59e0b', txt: `diferença de ${fmtBRL(Math.abs(dif!))}` }
              return (
                <div key={k.conta.id} className="card p-5 flex flex-col gap-3.5">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[15px] font-semibold text-[var(--surface-900)]">{k.conta.nome}</span>
                    <span className="ml-auto inline-flex items-center gap-1.5 text-[13px]" style={{ color: estado.cor }}>
                      <span className="h-2 w-2 rounded-full" style={{ background: estado.cor }} />{estado.txt}
                    </span>
                  </div>
                  {k.banco ? (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex flex-col"><span className="text-xs text-[var(--surface-500)]">{k.cartao ? `Fatura ${fmtData(k.banco.data)}` : `No banco em ${fmtData(k.banco.data)}`}</span><span className="text-mono tabular-nums text-[var(--surface-800)]">{num(k.banco.saldo)}</span></div>
                      <div className="flex flex-col"><span className="text-xs text-[var(--surface-500)]">{k.cartao ? 'Compras lançadas' : 'No sistema'}</span><span className="text-mono tabular-nums text-[var(--surface-800)]">{num(k.sistema ?? 0)}</span></div>
                      <div className="flex flex-col"><span className="text-xs text-[var(--surface-500)]">Diferença</span><span className={`text-mono tabular-nums ${bate ? 'text-emerald-500' : 'text-amber-500'}`}>{num(dif ?? 0)}</span></div>
                    </div>
                  ) : (
                    <p className="text-[13px] text-[var(--surface-500)]">
                      Cole o {k.cartao ? 'texto da fatura' : 'extrato'} no Importar: o saldo que o banco mostra fica guardado e a conferência aparece aqui.
                      {k.conferidoAte && <> Conferido até {fmtData(k.conferidoAte)}.</>}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--surface-200)]">
                    {onLancar && (
                      <button onClick={() => onLancar('importar')} className="text-[13px] font-semibold px-3 py-1.5 rounded-[10px] border border-[var(--surface-300)] text-[var(--surface-800)] hover:bg-[var(--surface-100)]">
                        {k.cartao ? 'Importar a fatura' : 'Importar extrato'}
                      </button>
                    )}
                    {onLancar && (
                      <button onClick={() => onLancar('despesa')} className="text-[13px] font-semibold px-3 py-1.5 rounded-[10px] border border-[var(--surface-300)] text-[var(--surface-800)] hover:bg-[var(--surface-100)]">
                        {k.cartao ? '+ Compra no cartão' : '+ Despesa'}
                      </button>
                    )}
                    <button onClick={() => setExtratoDe(k.conta)} className={`${link} ml-auto`}>Ver o extrato →</button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 4 · O QUE FALTA */}
      <section className="space-y-3">
        <p className={titulo}>4 · O que falta</p>
        <div className="card px-5 py-1.5">
          {!pend.length ? (
            <p className="py-3.5 text-sm text-emerald-500">✓ Nada pendente por aqui.</p>
          ) : pend.map((p, i) => (
            <div key={p.chave} className={`flex flex-wrap items-center gap-3.5 py-3.5 ${i < pend.length - 1 ? 'border-b border-[var(--surface-200)]' : ''}`}>
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.atencao ? '#f59e0b' : 'var(--surface-400)' }} />
              <span className="flex-1 min-w-[200px] flex flex-col">
                <span className="text-[15px] text-[var(--surface-800)]">{p.titulo}</span>
                <span className="text-[13px] text-[var(--surface-500)]">{p.detalhe}</span>
              </span>
              {p.valor !== undefined && <span className="text-mono tabular-nums text-[var(--surface-800)]">{num(p.valor)}</span>}
              <button onClick={p.onClick}
                      className={`text-sm font-semibold px-3.5 py-2 rounded-[10px] border ${p.atencao ? 'border-[var(--brand-500)] text-[var(--brand-500)] hover:bg-[var(--brand-500)] hover:text-white' : 'border-[var(--surface-300)] text-[var(--surface-800)] hover:bg-[var(--surface-100)]'}`}>
                {p.acao}
              </button>
            </div>
          ))}
        </div>
      </section>

      <ExtratoContaModal
        conta={extratoDe ? { conta_id: extratoDe.id, nome: extratoDe.nome, tipo: extratoDe.tipo, caixa_desde: extratoDe.caixa_desde } : null}
        mesInicial={mes}
        onClose={() => setExtratoDe(null)}
      />
    </div>
  )
}
