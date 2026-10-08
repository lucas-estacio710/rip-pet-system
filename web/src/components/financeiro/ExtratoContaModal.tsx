'use client'

// EXTRATO DA CONTA — o mesmo formato do banco, pra conferir lado a lado
// (08/10/2026, pedido do Lucas: "ao invés do Conferir, o link extrato, que
// mostra como estão os lançamentos exatamente da conta").
//
// Saldo anterior → cada linha do mês (data · descrição · valor) → SALDO NO FIM
// DE CADA DIA. Só o do fim do dia: o sistema não sabe a ordem das linhas dentro
// do dia (o banco sabe), então um saldo linha a linha divergiria do banco sem
// haver erro nenhum. O do fim do dia é o que dá pra comparar.
//
// Despesa DIVIDIDA (mig 149) aparece numa linha só, com o total — é assim que
// está no banco. O "conferir" (a boca do saldo, mig 136) mora no rodapé.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { fmtBRL, fmtData, limitesDoMes } from '@/lib/financeiro'

type Conta = { conta_id: string; nome: string; tipo: string; caixa_desde: string | null }
type Linha = { data: string; tipo: string; descricao: string | null; valor: number; origem: string; origem_id: string }
type Item = { data: string; descricao: string; valor: number; partes: number; saldoDia: number | null }

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const rotuloMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`
const somaMes = (m: string, d: number) => {
  const [a, mm] = m.split('-').map(Number)
  const x = new Date(a, mm - 1 + d, 1)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`
}
const centavos = (n: number) => Math.round(n * 100) / 100

export default function ExtratoContaModal({ conta, mesInicial, onClose, onConferir }: {
  conta: Conta | null
  mesInicial: string
  onClose: () => void
  /** Abre a conferência do saldo (CaixaTab). Ausente = somente leitura. */
  onConferir?: () => void
}) {
  const supabase = createClient() as unknown as SupabaseClient
  const [mes, setMes] = useState(mesInicial)
  const [anterior, setAnterior] = useState(0)
  const [itens, setItens] = useState<Item[]>([])
  const [carregando, setCarregando] = useState(false)

  useEffect(() => { if (conta) setMes(mesInicial) }, [conta, mesInicial])

  useEffect(() => {
    if (!conta) return
    let cancelado = false
    void (async () => {
      setCarregando(true)
      const { ini, fim } = limitesDoMes(mes)
      // Tudo até o fim do mês, paginado (limite de 1000 do PostgREST): o saldo
      // anterior é a soma do que veio antes do dia 1.
      const todas: Linha[] = []
      for (let off = 0; ; off += 1000) {
        const { data } = await supabase.from('vw_caixa')
          .select('data, tipo, descricao, valor, origem, origem_id')
          .eq('conta_id', conta.conta_id).lte('data', fim)
          .order('data').order('origem_id').range(off, off + 999)
        const pg = (data as Linha[] | null) || []
        todas.push(...pg)
        if (pg.length < 1000) break
      }
      const doMes = todas.filter(l => l.data >= ini)
      const antes = centavos(todas.filter(l => l.data < ini).reduce((a, l) => a + Number(l.valor), 0))

      // Partes de uma divisão → uma linha com o total, como no banco.
      const idsLanc = doMes.filter(l => l.origem === 'lancamento').map(l => l.origem_id)
      const divisaoDe = new Map<string, string>()
      for (let k = 0; k < idsLanc.length; k += 150) {
        const { data } = await supabase.from('fin_lancamentos').select('id, divisao_id')
          .in('id', idsLanc.slice(k, k + 150)).not('divisao_id', 'is', null)
        for (const r of (data as { id: string; divisao_id: string }[] | null) || []) divisaoDe.set(r.id, r.divisao_id)
      }
      const agrup: Item[] = []
      const porDivisao = new Map<string, Item>()
      for (const l of doMes) {
        const div = l.origem === 'lancamento' ? divisaoDe.get(l.origem_id) : undefined
        const existente = div ? porDivisao.get(div) : undefined
        if (existente) { existente.valor = centavos(existente.valor + Number(l.valor)); existente.partes++; continue }
        const it: Item = { data: l.data, descricao: l.descricao || l.tipo, valor: Number(l.valor), partes: 1, saldoDia: null }
        agrup.push(it)
        if (div) porDivisao.set(div, it)
      }
      // Saldo no fim de cada dia, na última linha do dia.
      let saldo = antes
      agrup.forEach((it, i) => {
        saldo = centavos(saldo + it.valor)
        if (agrup[i + 1]?.data !== it.data) it.saldoDia = saldo
      })
      if (cancelado) return
      setAnterior(antes); setItens(agrup); setCarregando(false)
    })()
    return () => { cancelado = true }
  }, [conta, mes, supabase])

  const cartao = conta?.tipo === 'cartao'
  const final = itens.length ? itens[itens.length - 1].saldoDia ?? anterior : anterior
  const entradas = centavos(itens.filter(i => i.valor > 0).reduce((a, i) => a + i.valor, 0))
  const saidas = centavos(itens.filter(i => i.valor < 0).reduce((a, i) => a - i.valor, 0))

  return (
    <Modal
      isOpen={!!conta}
      onClose={onClose}
      title={conta ? `Extrato · ${conta.nome}` : 'Extrato'}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="text-xs text-[var(--surface-500)]">
            {cartao ? 'Fatura no fim de' : 'Saldo no fim de'} {rotuloMes(mes)}:{' '}
            <strong className="text-mono text-[var(--surface-800)]">{fmtBRL(cartao ? Math.abs(final) : final)}</strong>
          </span>
          <div className="flex gap-2">
            {onConferir && (
              <button onClick={onConferir} className="btn-secondary text-sm" title="Digite o saldo que o banco mostra; o sistema grava o ajuste que faltar">
                conferir saldo
              </button>
            )}
            <button onClick={onClose} className="btn-primary text-sm">Fechar</button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => setMes(m => somaMes(m, -1))} className="btn-secondary text-xs py-1 px-2" aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-[var(--surface-700)] capitalize">{rotuloMes(mes)}</span>
          <button onClick={() => setMes(m => somaMes(m, 1))} className="btn-secondary text-xs py-1 px-2" aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {conta?.caixa_desde && mes < conta.caixa_desde.slice(0, 7) && (
          <p className="text-[11px] text-amber-500">
            Caixa aberto em {fmtData(conta.caixa_desde)} — antes disso o sistema não acompanha esta conta.
          </p>
        )}

        <div className="text-xs grid grid-cols-3 gap-2">
          <div className="card p-2"><p className="text-[var(--surface-400)]">saldo anterior</p><p className="text-mono text-[var(--surface-800)]">{fmtBRL(anterior)}</p></div>
          <div className="card p-2"><p className="text-[var(--surface-400)]">entradas</p><p className="text-mono text-emerald-500">+{fmtBRL(entradas)}</p></div>
          <div className="card p-2"><p className="text-[var(--surface-400)]">saídas</p><p className="text-mono text-red-400">−{fmtBRL(saidas)}</p></div>
        </div>

        {carregando ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--surface-400)]" /></div>
        ) : !itens.length ? (
          <p className="text-sm text-[var(--surface-500)] py-6 text-center">Nada nesta conta em {rotuloMes(mes)}.</p>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto -mx-1 px-1">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--surface-0)]">
                <tr className="text-[var(--surface-400)] text-left">
                  <th className="py-1 pr-2 font-normal">Data</th>
                  <th className="py-1 pr-2 font-normal">Descrição</th>
                  <th className="py-1 pr-2 font-normal text-right">Valor</th>
                  <th className="py-1 font-normal text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--surface-200)]">
                {itens.map((it, i) => (
                  <tr key={i} className={it.saldoDia !== null ? '' : 'text-[var(--surface-600)]'}>
                    <td className="py-1 pr-2 whitespace-nowrap text-[var(--surface-500)]">
                      {itens[i - 1]?.data === it.data ? '' : fmtData(it.data)}
                    </td>
                    <td className="py-1 pr-2 text-[var(--surface-700)]">
                      {it.descricao}
                      {it.partes > 1 && (
                        <span className="ml-1 px-1 rounded-full text-[10px]" style={{ background: 'rgba(99,102,241,0.14)', color: '#818cf8' }}
                              title="Despesa dividida em categorias — no banco é um pagamento só">
                          ÷ {it.partes}
                        </span>
                      )}
                    </td>
                    <td className={`py-1 pr-2 text-right text-mono tabular-nums whitespace-nowrap ${it.valor < 0 ? 'text-red-400' : 'text-emerald-500'}`}>
                      {it.valor < 0 ? '−' : '+'}{fmtBRL(Math.abs(it.valor))}
                    </td>
                    <td className="py-1 text-right text-mono tabular-nums whitespace-nowrap text-[var(--surface-800)]">
                      {it.saldoDia !== null ? fmtBRL(it.saldoDia) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-[var(--surface-400)]">
          O saldo aparece no fim de cada dia — dentro do dia o banco tem uma ordem que o sistema não
          sabe, então o número que dá pra comparar é o do fechamento do dia.
        </p>
      </div>
    </Modal>
  )
}
