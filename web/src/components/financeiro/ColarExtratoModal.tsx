'use client'

// COLAR DO EXTRATO — o lote de Receitas a Prazo (01/10/2026).
//
// O Lucas tem ~370 liquidações da InterPag de junho a setembro pra registrar, e
// cada dia do extrato traz 3, 4, 6 delas. Aqui ele cola as linhas do jeito que
// copiou do banco, confere e registra tudo de uma vez.
//
// O DESENHO É DELE: "a maquininha eu decido no lançamento; o colar linhas é só
// para parsear e montar separadinho... o que vier no extrato como descrição vai
// para observações, e a identificação por similaridade busca desse campo... com
// o passar do tempo, tudo vai ficando mais fácil."
//   - quem LÊ é `lib/extrato.ts` (validado contra o extrato real de Santos);
//   - a maquininha e a conta são escolhidas UMA vez, em cima, pro lote;
//   - o texto do banco vira a OBSERVAÇÃO do registro;
//   - na colagem seguinte, cada linha é comparada por SEMELHANÇA com os registros
//     já feitos (`lib/similaridade`) e ganha uma listinha de decisões ("InterPag ·
//     Liquidação — 14×"). Só vem pré-escolhida com confiança alta. Sem tabela:
//     a memória são os registros.
//
// 🔴 COLAR DUAS VEZES NÃO DUPLICA: cada linha é comparada com o que já está
// registrado (mesma maquininha, mesma data, mesmo valor), contando OCORRÊNCIAS —
// duas liquidações legítimas de R$ 102,76 no mesmo dia são duas, não uma.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Loader2, ClipboardPaste, History } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import { fmtBRL, fmtData } from '@/lib/financeiro'
import { lerExtrato, movimentoDe, type LinhaExtrato } from '@/lib/extrato'
import { criarIndice, sugerir, type Sugestao } from '@/lib/similaridade'

type Operadora = { conta_id: string; nome: string }
type ContaDestino = { id: string; nome: string; preferencial_recebimento: boolean | null }
type Mov = 'liquidacao' | 'antecipacao' | 'chargeback' | 'taxa'

/** Mesmos rótulos do registro avulso — a descrição gravada tem de ser idêntica,
 *  porque o "Reutilizar" reconhece o movimento pelo prefixo dela. */
const ROTULO: Record<Mov, string> = {
  liquidacao: 'Liquidação',
  antecipacao: 'Liquidação antecipada',
  chargeback: 'Chargeback',
  taxa: 'Taxa / aluguel da maquininha',
}
const ENTRA: Record<Mov, boolean> = { liquidacao: true, antecipacao: true, chargeback: false, taxa: false }

/** Rótulo do começo da descrição gravada → movimento (o mais longo primeiro:
 *  "Liquidação antecipada" começa com "Liquidação"). */
function movDoRegistro(descricao: string): Mov | null {
  const m = (Object.keys(ROTULO) as Mov[])
    .sort((a, b) => ROTULO[b].length - ROTULO[a].length)
    .find(k => descricao.startsWith(`${ROTULO[k]} · `))
  return m ?? null
}

type Item = LinhaExtrato & {
  marcado: boolean
  movimento: Mov | ''            // '' = precisa escolher
  operadoraId: string            // '' = a escolhida em cima, pro lote
  doHistorico: boolean           // pré-escolhido pelo histórico (confiança alta)
  sugestoes: Sugestao<Decisao>[] // os registros parecidos, agrupados por decisão
}

type Decisao = { opId: string; mov: Mov | null }

export default function ColarExtratoModal({ aberto, onClose, operadoras, destinos, mes, onRegistrou }: {
  aberto: boolean
  onClose: () => void
  operadoras: Operadora[]
  destinos: ContaDestino[]
  mes: string                    // YYYY-MM — dá o ano das datas sem ano
  onRegistrou: () => void
}) {
  const supabase = createClient() as unknown as SupabaseClient
  const { toast } = useToast()
  const { currentUnit, userName } = useUnit()

  const [texto, setTexto] = useState('')
  const [itens, setItens] = useState<Item[]>([])
  const [maquininhaLote, setMaquininhaLote] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [existentes, setExistentes] = useState<Map<string, number>>(new Map())
  const [lendo, setLendo] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setTexto(''); setItens([]); setExistentes(new Map())
    setMaquininhaLote(operadoras.length === 1 ? operadoras[0].conta_id : '')
    setDestinoId((destinos.find(d => d.preferencial_recebimento) || destinos[0])?.id || '')
  }, [aberto, destinos, operadoras])

  async function ler() {
    const ano = Number(mes.slice(0, 4)) || new Date().getFullYear()
    const linhas = lerExtrato(texto, ano)
    if (!linhas.length) { setItens([]); return toast('Nenhuma linha com data e valor no texto colado', 'error') }
    setLendo(true)
    const ids = operadoras.map(o => o.conta_id)
    const datas = linhas.map(l => l.data).sort()

    const [{ data: movs }, { data: hist }] = ids.length
      ? await Promise.all([
          // O que JÁ foi registrado nas datas coladas — pra não duplicar.
          supabase.from('fin_movimentos')
            .select('data, valor, conta_id, conta_destino_id')
            .eq('tipo', 'transferencia')
            .or(`conta_id.in.(${ids.join(',')}),conta_destino_id.in.(${ids.join(',')})`)
            .gte('data', datas[0]).lte('data', datas[datas.length - 1]),
          // A MEMÓRIA: registros anteriores que guardaram o texto do banco na
          // observação ("Liquidação · InterPag — <texto do extrato>").
          supabase.from('fin_movimentos')
            .select('descricao, conta_id, conta_destino_id, data')
            .eq('tipo', 'transferencia')
            .or(`conta_id.in.(${ids.join(',')}),conta_destino_id.in.(${ids.join(',')})`)
            .like('descricao', '% — %')
            .order('created_at', { ascending: false })
            .limit(1000),
        ])
      : [{ data: [] }, { data: [] }]

    // chave "maquininha|data|valor" → quantas já existem (ocorrências, não presença)
    const ex = new Map<string, number>()
    for (const m of (movs as { data: string; valor: number; conta_id: string; conta_destino_id: string }[] | null) || []) {
      const maq = ids.includes(m.conta_id) ? m.conta_id : m.conta_destino_id
      const k = `${maq}|${m.data}|${Number(m.valor).toFixed(2)}`
      ex.set(k, (ex.get(k) || 0) + 1)
    }
    setExistentes(ex)

    // A MEMÓRIA vira um índice de semelhança: texto do banco daquela vez →
    // maquininha + movimento decididos.
    type H = { descricao: string; conta_id: string; conta_destino_id: string; data: string }
    const indice = criarIndice(((hist as H[] | null) || []).map(h => {
      const opId = ids.includes(h.conta_id) ? h.conta_id : h.conta_destino_id
      const mov = movDoRegistro(h.descricao)
      return {
        texto: h.descricao.slice(h.descricao.indexOf(' — ') + 3),
        decisao: { opId, mov },
        chave: `${opId}|${mov}`,
        data: h.data,
      }
    }))

    setItens(linhas.map(l => {
      const r = sugerir(indice, l.descricao, undefined, { max: 3 })
      // Só serve decisão da MESMA direção do dinheiro (liquidação não vira
      // sugestão de uma saída, e vice-versa).
      const validas = r.sugestoes.filter(sg => sg.decisao.mov && ENTRA[sg.decisao.mov] === (l.valor > 0))
      const top = validas[0]
      const preEscolhe = r.confianca === 'alta' && top === r.sugestoes[0]
      return {
        ...l,
        marcado: true,
        operadoraId: preEscolhe ? top.decisao.opId : '',
        movimento: (preEscolhe ? top.decisao.mov : null) || movimentoDe(l.descricao, l.valor) || '',
        doHistorico: preEscolhe,
        sugestoes: validas,
      }
    }))
    setLendo(false)
  }

  // "Já registrado" é DERIVADO — recalcula quando a maquininha do lote muda.
  const jaRegistrado = useMemo(() => {
    const resto = new Map(existentes)
    const out = new Set<number>()
    for (const i of itens) {
      const op = i.operadoraId || maquininhaLote
      if (!op) continue
      const k = `${op}|${i.data}|${Math.abs(i.valor).toFixed(2)}`
      const n = resto.get(k) || 0
      if (n > 0) { out.add(i.n); resto.set(k, n - 1) }
    }
    return out
  }, [itens, existentes, maquininhaLote])

  const prontos = itens.filter(i =>
    i.marcado && !jaRegistrado.has(i.n) && (i.operadoraId || maquininhaLote) && i.movimento)
  const semMovimento = itens.filter(i => i.marcado && !jaRegistrado.has(i.n) && !i.movimento).length
  const total = prontos.reduce((a, i) => a + Math.abs(i.valor) * (ENTRA[i.movimento as Mov] ? 1 : -1), 0)
  const muda = (n: number, patch: Partial<Item>) => setItens(xs => xs.map(x => (x.n === n ? { ...x, ...patch } : x)))

  async function registrar() {
    if (!currentUnit?.id) return
    if (!destinoId) return toast('Escolha a conta onde o dinheiro entrou', 'error')
    if (itens.some(i => i.marcado && !jaRegistrado.has(i.n) && !(i.operadoraId || maquininhaLote))) {
      return toast('Escolha a maquininha do lote', 'error')
    }
    if (!prontos.length) return toast('Nenhuma linha marcada pronta pra registrar', 'error')
    setSalvando(true)
    try {
      // Um insert só: ou entram todas, ou nenhuma — um lote pela metade deixaria
      // o saldo do dia sem bater com o banco e sem dizer onde parou.
      const linhas = prontos.map(i => {
        const mov = i.movimento as Mov
        const opId = i.operadoraId || maquininhaLote
        const op = operadoras.find(o => o.conta_id === opId)!
        return {
          unidade_id: currentUnit.id,
          tipo: 'transferencia',
          conta_id: ENTRA[mov] ? opId : destinoId,
          conta_destino_id: ENTRA[mov] ? destinoId : opId,
          data: i.data,
          valor: Math.abs(i.valor),
          // O texto do banco vai na OBSERVAÇÃO — é o que a próxima colagem usa
          // pra reconhecer linhas parecidas.
          descricao: `${ROTULO[mov]} · ${op.nome} — ${i.descricao}`,
          criado_por_nome: userName || null,
        }
      })
      const { error } = await supabase.from('fin_movimentos').insert(linhas)
      if (error) throw new Error(error.message)
      toast(`${linhas.length} registradas — ${fmtBRL(Math.abs(total))}`, 'success')
      onRegistrou()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao registrar o lote', 'error')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      isOpen={aberto}
      onClose={onClose}
      title="Colar do extrato"
      footer={itens.length ? (
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="text-xs text-[var(--surface-500)]">
            {prontos.length} {prontos.length === 1 ? 'linha' : 'linhas'} · <span className="text-mono">{fmtBRL(total)}</span>
            {semMovimento > 0 && <span className="text-amber-500"> · {semMovimento} sem movimento escolhido</span>}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setItens([])} className="btn-secondary text-sm">Voltar</button>
            <button onClick={() => void registrar()} disabled={salvando || !prontos.length} className="btn-primary text-sm">
              {salvando ? <><Loader2 className="h-4 w-4 animate-spin" /> Registrando…</> : `Registrar ${prontos.length}`}
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
            Copie do extrato do banco as linhas desta maquininha (do CSV, da planilha ou do internet
            banking) e cole aqui. Cada linha vira um registro, com o texto do banco na observação.
          </p>
          <textarea
            value={texto} onChange={e => setTexto(e.target.value)} rows={10} autoFocus
            placeholder={'05/06/2026    Credito domicilio cartao: "CARTAO DE CREDITO - INTER PAG"    102,76\n05/06/2026    Credito domicilio cartao: "CARTAO DE CREDITO - INTER PAG"    130,92'}
            className="input text-xs text-mono w-full"
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Maquininha</label>
              {operadoras.length === 1 ? (
                <span className="text-sm text-[var(--surface-700)]">{operadoras[0].nome}</span>
              ) : (
                <select value={maquininhaLote} onChange={e => setMaquininhaLote(e.target.value)}
                        className="input text-sm w-full"
                        style={!maquininhaLote ? { borderColor: '#f59e0b' } : undefined}>
                  <option value="">Escolher…</option>
                  {operadoras.map(o => <option key={o.conta_id} value={o.conta_id}>{o.nome}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Entrou na conta</label>
              <select value={destinoId} onChange={e => setDestinoId(e.target.value)} className="input text-sm w-full">
                <option value="">Escolher…</option>
                {destinos.map(d => (
                  <option key={d.id} value={d.id}>{d.preferencial_recebimento ? '⭐ ' : ''}{d.nome}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="divide-y divide-[var(--surface-200)] max-h-[50vh] overflow-y-auto">
            {itens.map(i => {
              const ja = jaRegistrado.has(i.n)
              return (
                <div key={i.n} className="flex items-start gap-2 py-1.5" style={{ opacity: ja || !i.marcado ? 0.55 : 1 }}>
                  <input type="checkbox" className="mt-1" checked={i.marcado && !ja} disabled={ja}
                         onChange={e => muda(i.n, { marcado: e.target.checked })} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--surface-700)] truncate" title={i.original}>
                      {fmtData(i.data)} · {i.descricao}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      <select value={i.movimento} onChange={e => muda(i.n, { movimento: e.target.value as Mov })}
                              className="input text-[11px] py-0.5 px-1"
                              style={!i.movimento ? { borderColor: '#f59e0b' } : undefined}>
                        <option value="">o que é?</option>
                        {(Object.keys(ROTULO) as Mov[])
                          .filter(m => ENTRA[m] === (i.valor > 0))
                          .map(m => <option key={m} value={m}>{ROTULO[m]}</option>)}
                      </select>
                      {/* Só aparece quando o histórico apontou OUTRA maquininha
                          que a do lote — aí a pessoa vê e decide. */}
                      {i.operadoraId && i.operadoraId !== maquininhaLote && operadoras.length > 1 && (
                        <select value={i.operadoraId} onChange={e => muda(i.n, { operadoraId: e.target.value })}
                                className="input text-[11px] py-0.5 px-1">
                          {operadoras.map(o => <option key={o.conta_id} value={o.conta_id}>{o.nome}</option>)}
                        </select>
                      )}
                      {i.doHistorico && (
                        <span className="text-[11px] text-sky-500 inline-flex items-center gap-0.5"
                              title="Texto muito parecido com registros anteriores — maquininha e movimento vieram de lá">
                          <History className="h-3 w-3" /> como das outras vezes
                        </span>
                      )}
                      {ja && <span className="text-[11px] text-sky-500">já registrado</span>}
                      {i.sinalIncerto && (
                        <span className="text-[11px] text-amber-500" title="O texto não traz sinal nem saldo pra conferir">
                          confira se entrou ou saiu
                        </span>
                      )}
                    </div>
                    {/* A LISTINHA: registros parecidos agrupados por decisão. Clicar
                        aplica. Não aparece quando a primeira já foi pré-escolhida
                        e é a única — aí ela só repetiria o que está na linha. */}
                    {!ja && i.sugestoes.length > 0 && !(i.doHistorico && i.sugestoes.length === 1) && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {i.sugestoes.map(sg => {
                          const op = operadoras.find(o => o.conta_id === sg.decisao.opId)
                          const ativa = (i.operadoraId || maquininhaLote) === sg.decisao.opId && i.movimento === sg.decisao.mov
                          return (
                            <button key={sg.chave} type="button"
                                    onClick={() => muda(i.n, { operadoraId: sg.decisao.opId, movimento: sg.decisao.mov || '' })}
                                    className="text-[10px] px-1.5 py-0.5 rounded-full border transition-colors"
                                    style={{
                                      borderColor: ativa ? '#0ea5e9' : 'var(--surface-300)',
                                      color: ativa ? '#0ea5e9' : 'var(--surface-500)',
                                    }}
                                    title={`Parecido com ${sg.vezes} registro(s); o mais recente em ${fmtData(sg.ultima)}`}>
                              {op?.nome || '?'} · {sg.decisao.mov ? ROTULO[sg.decisao.mov] : '?'} — {sg.vezes}×
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs text-mono shrink-0 ${i.valor > 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                    {i.valor > 0 ? '' : '−'}{fmtBRL(Math.abs(i.valor))}
                  </span>
                </div>
              )
            })}
          </div>
          {itens.some(i => i.movimento === 'antecipacao' && i.marcado) && (
            <p className="text-[11px] text-amber-500">
              Antecipação: registre o valor LÍQUIDO que caiu (é o que o extrato mostra). O desconto
              da antecipação é despesa — lance em Despesas, Financeiro › Encargos.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
