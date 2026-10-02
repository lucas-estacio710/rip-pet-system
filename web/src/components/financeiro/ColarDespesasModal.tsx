'use client'

// COLAR DO EXTRATO — DESPESAS (01/10/2026).
//
// O irmão do Colar de Receitas a Prazo, pedido pelo Lucas ("achei que ia ter
// colar do extrato também para as despesas"). Mesmo gesto: cola as linhas do
// banco, confere a prévia, registra tudo de uma vez. Cada saída do extrato vira
// UM lançamento de despesa.
//
//   - quem LÊ é `lib/extrato.ts` (validado contra o extrato real de Santos);
//   - a CONTA é escolhida uma vez, pro lote;
//   - a FORMA DE PAGAMENTO sai do próprio texto ("Pix enviado" → pix,
//     "Pagamento de Titulo" → boleto…), editável por linha;
//   - o FORNECEDOR sai do nome no Pix ("Cp :10573521-Rafael Moreira" → Rafael Moreira);
//   - a CATEGORIA vem da busca por semelhança (`lib/similaridade`) contra as
//     despesas já lançadas; com confiança alta vem escolhida, senão a listinha;
//   - o texto do banco vai em `observacoes`, que alimenta a próxima sugestão.
//
// ⚠️ Lançamento colado é INSTANTÂNEO: pago no dia (data do gasto = data do
// caixa). Fatura de cartão de crédito não vem do extrato da conta corrente.
//
// 🔴 COLAR DUAS VEZES NÃO DUPLICA: compara com o já lançado (conta + data +
// valor), contando ocorrências.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Loader2, ClipboardPaste, History } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import { fmtBRL, fmtData } from '@/lib/financeiro'
import { lerExtrato, normTexto, type LinhaExtrato } from '@/lib/extrato'
import { sugerir, type Indice, type Sugestao } from '@/lib/similaridade'

type Conta = { id: string; nome: string; preferencial_recebimento: boolean | null }
type Cat = {
  id: string
  fin_conta_id: string | null
  pergunta_capex: boolean
  fin_contas?: { codigo: string; nome: string; natureza: string } | null
}

const METODOS = [
  { v: 'pix', l: 'Pix' }, { v: 'debito', l: 'Débito' }, { v: 'boleto', l: 'Boleto' },
  { v: 'transferencia', l: 'Transf.' }, { v: 'dinheiro', l: 'Dinheiro' },
]

/** Forma de pagamento pelo texto do banco. null = a pessoa escolhe. */
function metodoDe(descricao: string): string | null {
  const t = normTexto(descricao)
  if (/\bPIX\b/.test(t)) return 'pix'
  if (/PAGAMENTO DE (TITULO|CONVENIO)|PAGAMENTO EFETUADO|\bBOLETO\b|\bDARF\b|SIMPLES NACIONAL/.test(t)) return 'boleto'
  if (/COMPRA NO DEBITO|DEBITO EM CONTA|CARTAO DE DEBITO/.test(t)) return 'debito'
  if (/\bTED\b|\bDOC\b|TRANSFERENCIA/.test(t)) return 'transferencia'
  return null
}

/** Nome de quem recebeu: no Pix, "Cp :10573521-Rafael Moreira Giffoni"; no
 *  boleto do Inter, o texto entre aspas ('Pagamento efetuado: "CONTABILIDADE ALVORADA LTDA"'). */
function fornecedorDe(descricao: string): string {
  const pix = descricao.match(/Cp\s*:\s*\d*\s*-\s*([^"]+)/i)
  if (pix) return pix[1].trim()
  const aspas = descricao.match(/:\s*"([^"]+)"/)
  return aspas ? aspas[1].trim() : ''
}

/**
 * Saída que NÃO é despesa — lançá-la contaria o mesmo gasto duas vezes ou
 * poria na DRE dinheiro que só mudou de lugar. Achado na prévia a seco contra o
 * extrato real de Santos: "Pagamento fatura cartao Inter" (R$ 5.400,96) — as
 * despesas daquela fatura já foram lançadas no cartão.
 */
function naoEDespesa(descricao: string): string | null {
  const t = normTexto(descricao)
  if (/FATURA\s+(DO\s+)?CART(AO|OES)|PAGAMENTO\s+(DE\s+)?FATURA/.test(t)) {
    return 'pagamento de fatura de cartão — as despesas já estão no cartão; registre no Caixa como Movimento › fatura'
  }
  // Só a aplicação/resgate em si. O IOF dessas contas ("Debito Iof Conta Global
  // De Inv") é CUSTO de verdade — despesa em Financeiro › Encargos — e passa.
  if (/\bAPLICACAO\b|\bRESGATE\b/.test(t) && !/\bIOF\b/.test(t)) {
    return 'aplicação/resgate — dinheiro mudando de lugar, não é despesa'
  }
  return null
}

type Item = LinhaExtrato & {
  marcado: boolean
  catId: string
  catTexto: string
  metodo: string
  fornecedor: string
  doHistorico: boolean
  sugestoes: Sugestao<string>[]
  motivoFora: string | null      // saída que não é despesa (fatura de cartão, aplicação)
}

export default function ColarDespesasModal({
  aberto, onClose, contas, categorias, folhas, caminhoDe, indice, mes, onRegistrou,
}: {
  aberto: boolean
  onClose: () => void
  contas: Conta[]
  categorias: Cat[]
  folhas: { id: string }[]
  caminhoDe: (id: string) => string
  indice: Indice<string> | null
  mes: string
  onRegistrou: () => void
}) {
  const supabase = createClient() as unknown as SupabaseClient
  const { toast } = useToast()
  const { currentUnit, userName } = useUnit()

  const [texto, setTexto] = useState('')
  const [itens, setItens] = useState<Item[]>([])
  const [contaId, setContaId] = useState('')
  const [existentes, setExistentes] = useState<Map<string, number>>(new Map())
  const [lendo, setLendo] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setTexto(''); setItens([]); setExistentes(new Map())
    setContaId((contas.find(c => c.preferencial_recebimento) || contas[0])?.id || '')
  }, [aberto, contas])

  async function ler() {
    const ano = Number(mes.slice(0, 4)) || new Date().getFullYear()
    const linhas = lerExtrato(texto, ano)
    if (!linhas.length) { setItens([]); return toast('Nenhuma linha com data e valor no texto colado', 'error') }
    setLendo(true)

    // O que JÁ foi lançado nessas datas, em qualquer conta da unidade.
    const datas = linhas.map(l => l.data).sort()
    const { data: ja } = contas.length
      ? await supabase.from('fin_lancamentos')
          .select('conta_pagamento_id, data_caixa, valor, divisao_id')
          .in('conta_pagamento_id', contas.map(c => c.id))
          .neq('status', 'rejeitado')
          .gte('data_caixa', datas[0]).lte('data_caixa', datas[datas.length - 1])
      : { data: [] }
    // Um pagamento DIVIDIDO (mig 149) é UMA linha no banco: as partes somam o
    // valor do extrato. Sem juntar, o Pix de R$ 1.024 dividido em 724 + 300
    // apareceria como "novo" e seria lançado de novo.
    type J = { conta_pagamento_id: string; data_caixa: string; valor: number; divisao_id: string | null }
    const pagamentos = new Map<string, { conta: string; data: string; valor: number }>()
    ;((ja as J[] | null) || []).forEach((r, idx) => {
      const id = r.divisao_id || `avulso-${idx}`
      const p = pagamentos.get(id) || { conta: r.conta_pagamento_id, data: r.data_caixa, valor: 0 }
      p.valor += Number(r.valor)
      pagamentos.set(id, p)
    })
    const ex = new Map<string, number>()
    for (const p of pagamentos.values()) {
      const k = `${p.conta}|${p.data}|${p.valor.toFixed(2)}`
      ex.set(k, (ex.get(k) || 0) + 1)
    }
    setExistentes(ex)

    setItens(linhas.map(l => {
      const fora = l.valor < 0 ? naoEDespesa(l.descricao) : null
      const r = indice && l.valor < 0 && !fora ? sugerir(indice, l.descricao, undefined, { max: 3 }) : null
      const top = r?.sugestoes[0]
      const pre = r?.confianca === 'alta' && top ? top.decisao : ''
      return {
        ...l,
        marcado: l.valor < 0 && !fora,
        motivoFora: fora,
        catId: pre,
        catTexto: pre ? caminhoDe(pre) : '',
        metodo: metodoDe(l.descricao) || 'pix',
        fornecedor: fornecedorDe(l.descricao),
        doHistorico: !!pre,
        sugestoes: r?.sugestoes || [],
      }
    }))
    setLendo(false)
  }

  // "Já lançado" é derivado: recalcula quando a conta do lote muda.
  const jaLancado = useMemo(() => {
    const resto = new Map(existentes)
    const out = new Set<number>()
    for (const i of itens) {
      if (i.valor >= 0) continue
      const k = `${contaId}|${i.data}|${Math.abs(i.valor).toFixed(2)}`
      const n = resto.get(k) || 0
      if (n > 0) { out.add(i.n); resto.set(k, n - 1) }
    }
    return out
  }, [itens, existentes, contaId])

  const prontos = itens.filter(i => i.marcado && i.valor < 0 && !i.motivoFora && !jaLancado.has(i.n) && i.catId)
  const semCategoria = itens.filter(i => i.marcado && i.valor < 0 && !i.motivoFora && !jaLancado.has(i.n) && !i.catId).length
  const total = prontos.reduce((a, i) => a + Math.abs(i.valor), 0)
  const muda = (n: number, patch: Partial<Item>) => setItens(xs => xs.map(x => (x.n === n ? { ...x, ...patch } : x)))
  const escolheCat = (n: number, id: string) => muda(n, { catId: id, catTexto: caminhoDe(id) })

  async function registrar() {
    if (!currentUnit?.id) return
    if (!contaId) return toast('Escolha a conta de onde saiu', 'error')
    if (!prontos.length) return toast('Nenhuma linha pronta — falta categoria?', 'error')
    setSalvando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const agora = new Date().toISOString()
      // Mesmos campos do formulário de despesa (lançou, lançou: nasce aprovado),
      // num insert só — ou entram todos, ou nenhum.
      const linhas = prontos.map(i => {
        const cat = categorias.find(c => c.id === i.catId)
        const cc = cat?.fin_contas
        return {
          unidade_id: currentUnit.id,
          categoria_id: i.catId,
          conta_id: cat?.fin_conta_id || null,
          conta_codigo: cc?.codigo || null,     // SNAPSHOT: congela a DRE histórica
          conta_nome: cc?.nome || null,
          natureza: cc?.natureza || 'opex',
          descricao: null,
          observacoes: i.descricao,             // o texto do banco — ensina a próxima colagem
          valor: Math.abs(i.valor),
          data_competencia: i.data,
          data_caixa: i.data,                   // instantâneo: pago no dia
          fornecedor_nome: i.fornecedor.trim() || null,
          conta_pagamento_id: contaId,
          metodo_pagamento: i.metodo,
          rateio_meses: 1,
          origem: 'manual',
          criado_por_nome: userName || null,
          status: 'aprovado',
          aprovado_por: user?.id || null,
          aprovado_por_nome: userName || null,
          aprovado_em: agora,
        }
      })
      const { error } = await supabase.from('fin_lancamentos').insert(linhas)
      if (error) throw new Error(error.message)
      toast(`${linhas.length} despesas lançadas — ${fmtBRL(total)}`, 'success')
      onRegistrou()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao lançar o lote', 'error')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      isOpen={aberto}
      onClose={onClose}
      title="Colar do extrato — despesas"
      footer={itens.length ? (
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="text-xs text-[var(--surface-500)]">
            {prontos.length} {prontos.length === 1 ? 'despesa' : 'despesas'} · <span className="text-mono">{fmtBRL(total)}</span>
            {semCategoria > 0 && <span className="text-amber-500"> · {semCategoria} sem categoria</span>}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setItens([])} className="btn-secondary text-sm">Voltar</button>
            <button onClick={() => void registrar()} disabled={salvando || !prontos.length} className="btn-primary text-sm">
              {salvando ? <><Loader2 className="h-4 w-4 animate-spin" /> Lançando…</> : `Lançar ${prontos.length}`}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={() => void ler()} disabled={!texto.trim() || lendo} className="btn-primary text-sm">
            {lendo ? <><Loader2 className="h-4 w-4 animate-spin" /> Lendo…</> : <><ClipboardPaste className="h-4 w-4" /> Ler</>}
          </button>
        </div>
      )}
    >
      {!itens.length ? (
        <div className="space-y-2">
          <p className="text-xs text-[var(--surface-500)]">
            Cole as linhas do extrato do banco. Cada SAÍDA vira uma despesa, com o texto do banco
            guardado na observação. Entradas aparecem separadas — não são despesa.
          </p>
          <textarea
            value={texto} onChange={e => setTexto(e.target.value)} rows={10} autoFocus
            placeholder={'05/06/2026    Pix enviado: "Cp :10573521-Rafael Moreira Giffoni"    -3.450,00\n10/06/2026    Pagamento de Titulo - Inter    -189,90'}
            className="input text-xs text-mono w-full"
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[var(--surface-500)] block mb-1">Saiu da conta</label>
            <select value={contaId} onChange={e => setContaId(e.target.value)} className="input text-sm w-full">
              <option value="">Escolher…</option>
              {contas.map(c => <option key={c.id} value={c.id}>{c.preferencial_recebimento ? '⭐ ' : ''}{c.nome}</option>)}
            </select>
          </div>

          <datalist id="colar-desp-cats">
            {folhas.map(f => <option key={f.id} value={caminhoDe(f.id)} />)}
          </datalist>

          <div className="divide-y divide-[var(--surface-200)] max-h-[55vh] overflow-y-auto">
            {itens.map(i => {
              const entrada = i.valor >= 0
              const ja = jaLancado.has(i.n)
              const fora = !!i.motivoFora
              const apagada = entrada || ja || fora || !i.marcado
              return (
                <div key={i.n} className="flex items-start gap-2 py-2" style={{ opacity: apagada ? 0.55 : 1 }}>
                  <input type="checkbox" className="mt-1" checked={i.marcado && !entrada && !ja && !fora} disabled={entrada || ja || fora}
                         onChange={e => muda(i.n, { marcado: e.target.checked })} />
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs text-[var(--surface-700)] truncate" title={i.original}>
                      {fmtData(i.data)} · {i.descricao}
                    </p>
                    {entrada ? (
                      <p className="text-[11px] text-[var(--surface-400)]">entrada — não é despesa (Pix de tutor já está no contrato)</p>
                    ) : fora ? (
                      <p className="text-[11px] text-amber-500">{i.motivoFora}</p>
                    ) : ja ? (
                      <p className="text-[11px] text-sky-500">já lançado</p>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <input
                            list="colar-desp-cats" value={i.catTexto} placeholder="Categoria…"
                            onChange={e => {
                              const t = e.target.value
                              const achou = folhas.find(f => caminhoDe(f.id) === t)
                              muda(i.n, { catTexto: t, catId: achou?.id || '', doHistorico: false })
                            }}
                            className="input text-[11px] py-0.5 px-1.5 flex-1 min-w-[180px]"
                            style={!i.catId ? { borderColor: '#f59e0b' } : undefined}
                          />
                          <select value={i.metodo} onChange={e => muda(i.n, { metodo: e.target.value })}
                                  className="input text-[11px] py-0.5 px-1">
                            {METODOS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                          </select>
                          <input value={i.fornecedor} placeholder="fornecedor"
                                 onChange={e => muda(i.n, { fornecedor: e.target.value })}
                                 className="input text-[11px] py-0.5 px-1.5 w-36" />
                          {i.doHistorico && (
                            <span className="text-[11px] text-sky-500 inline-flex items-center gap-0.5"
                                  title="Muito parecido com despesas já lançadas — a categoria veio de lá">
                              <History className="h-3 w-3" /> como das outras vezes
                            </span>
                          )}
                        </div>
                        {/* A LISTINHA de categorias parecidas — clicar aplica. */}
                        {i.sugestoes.length > 0 && !(i.doHistorico && i.sugestoes.length === 1) && (
                          <div className="flex flex-wrap gap-1">
                            {i.sugestoes.map(sg => (
                              <button key={sg.chave} type="button" onClick={() => escolheCat(i.n, sg.decisao)}
                                      className="text-[10px] px-1.5 py-0.5 rounded-full border transition-colors"
                                      style={{
                                        borderColor: i.catId === sg.decisao ? '#0ea5e9' : 'var(--surface-300)',
                                        color: i.catId === sg.decisao ? '#0ea5e9' : 'var(--surface-500)',
                                      }}
                                      title={`Parecido com ${sg.vezes} lançamento(s); o mais recente em ${fmtData(sg.ultima)}`}>
                                {caminhoDe(sg.decisao)} — {sg.vezes}×
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <span className={`text-xs text-mono shrink-0 ${entrada ? 'text-emerald-500' : 'text-red-400'}`}>
                    {entrada ? '' : '−'}{fmtBRL(Math.abs(i.valor))}
                  </span>
                </div>
              )
            })}
          </div>
          {itens.some(i => i.marcado && i.valor < 0 && categorias.find(c => c.id === i.catId)?.pergunta_capex) && (
            <p className="text-[11px] text-amber-500">
              Alguma categoria marcada pergunta se a compra dura mais de um ano (investimento). No lote
              ela entra como despesa do mês; se for investimento, abra o lançamento depois e marque.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
