'use client'

// COLAR DO EXTRATO — o lote de Receitas a Prazo (01/10/2026).
//
// O Lucas tem ~370 liquidações da InterPag de junho a setembro pra registrar, e
// cada dia do extrato traz 3, 4, 6 delas. Aqui ele cola as linhas do jeito que
// copiou do banco, confere a prévia e registra tudo de uma vez.
//
// Quem lê o texto é `lib/extrato.ts` (data/valor/descrição de qualquer banco,
// validado linha a linha contra o extrato real de Santos) e quem diz "é da
// maquininha X" é o dicionário de lá. Esta tela só mostra, deixa corrigir e grava.
//
// 🔴 NADA É GRAVADO SEM PASSAR PELA PRÉVIA, e a prévia nunca esconde linha:
// o que não é da maquininha aparece apagado com o motivo, em vez de sumir —
// sumir em silêncio é como se perde dinheiro numa conciliação.
//
// 🔴 COLAR DUAS VEZES NÃO DUPLICA: cada linha é comparada com o que já está
// registrado (mesma maquininha, mesma data, mesmo valor), contando OCORRÊNCIAS —
// duas liquidações legítimas de R$ 102,76 no mesmo dia são duas, não uma.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Loader2, ClipboardPaste } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import { fmtBRL, fmtData } from '@/lib/financeiro'
import {
  lerExtrato, adquirenteDe, movimentoDe, operadorasDaAdquirente, naoEDaqui, type LinhaExtrato,
} from '@/lib/extrato'

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

type Item = LinhaExtrato & {
  operadoraId: string            // '' = precisa escolher
  candidatas: Operadora[]        // >1 quando a adquirente tem duas maquininhas
  movimento: Mov | ''            // '' = precisa escolher
  motivoFora: string | null      // não é desta tela
  jaRegistrado: boolean
  marcado: boolean
}

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
  const [destinoId, setDestinoId] = useState('')
  const [lendo, setLendo] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setTexto(''); setItens([])
    setDestinoId((destinos.find(d => d.preferencial_recebimento) || destinos[0])?.id || '')
  }, [aberto, destinos])

  async function ler() {
    const ano = Number(mes.slice(0, 4)) || new Date().getFullYear()
    const linhas = lerExtrato(texto, ano)
    if (!linhas.length) { setItens([]); return toast('Nenhuma linha com data e valor no texto colado', 'error') }
    setLendo(true)

    // O que JÁ foi registrado nas datas coladas, pra marcar e não duplicar.
    const datas = linhas.map(l => l.data).sort()
    const ids = operadoras.map(o => o.conta_id)
    const { data: movs } = ids.length
      ? await supabase.from('fin_movimentos')
          .select('data, valor, conta_id, conta_destino_id')
          .eq('tipo', 'transferencia')
          .or(`conta_id.in.(${ids.join(',')}),conta_destino_id.in.(${ids.join(',')})`)
          .gte('data', datas[0]).lte('data', datas[datas.length - 1])
      : { data: [] }
    // chave "maquininha|data|valor" → quantas já existem (ocorrências, não presença)
    const existentes = new Map<string, number>()
    for (const m of (movs as { data: string; valor: number; conta_id: string; conta_destino_id: string }[] | null) || []) {
      const maq = ids.includes(m.conta_id) ? m.conta_id : m.conta_destino_id
      const k = `${maq}|${m.data}|${Number(m.valor).toFixed(2)}`
      existentes.set(k, (existentes.get(k) || 0) + 1)
    }

    const novos: Item[] = linhas.map(l => {
      // Tem cara de maquininha mas não se registra aqui (quitação de antecipação,
      // custo de antecipação): mostrar o porquê em vez de classificar errado.
      const naoAqui = naoEDaqui(l.descricao)
      if (naoAqui) {
        return { ...l, operadoraId: '', candidatas: [], movimento: '', motivoFora: naoAqui, jaRegistrado: false, marcado: false }
      }
      const adq = adquirenteDe(l.descricao)
      if (!adq) {
        const motivo = l.valor > 0
          ? (/pix recebido|transfer/i.test(l.descricao)
              ? 'Pix/TED recebido — se for de tutor, já está no contrato'
              : 'entrada que não é de maquininha')
          : 'saída — se for gasto, vai em Despesas'
        return { ...l, operadoraId: '', candidatas: [], movimento: '', motivoFora: motivo, jaRegistrado: false, marcado: false }
      }
      const cand = operadorasDaAdquirente(adq, operadoras)
      if (!cand.length) {
        return { ...l, operadoraId: '', candidatas: [], movimento: '', jaRegistrado: false, marcado: false,
                 motivoFora: adq === 'cartao'
                   ? 'crédito de cartão, mas a unidade não tem maquininha cadastrada (aba Contas)'
                   : `maquininha ${adq} não cadastrada nesta unidade (aba Contas)` }
      }
      const mov = movimentoDe(l.descricao, l.valor) || ''
      const opId = cand.length === 1 ? cand[0].conta_id : ''
      return { ...l, operadoraId: opId, candidatas: cand, movimento: mov, motivoFora: null, jaRegistrado: false, marcado: true }
    })

    // Marca "já registrado" consumindo as ocorrências existentes uma a uma.
    const saldoOcorr = new Map(existentes)
    for (const it of novos) {
      if (it.motivoFora || !it.operadoraId) continue
      const k = `${it.operadoraId}|${it.data}|${Math.abs(it.valor).toFixed(2)}`
      const n = saldoOcorr.get(k) || 0
      if (n > 0) { it.jaRegistrado = true; it.marcado = false; saldoOcorr.set(k, n - 1) }
    }
    setItens(novos)
    setLendo(false)
  }

  const prontos = useMemo(
    () => itens.filter(i => i.marcado && !i.motivoFora && i.operadoraId && i.movimento),
    [itens],
  )
  const pendentesEscolha = itens.filter(i => i.marcado && !i.motivoFora && (!i.operadoraId || !i.movimento)).length
  const total = prontos.reduce((a, i) => a + Math.abs(i.valor) * (ENTRA[i.movimento as Mov] ? 1 : -1), 0)
  const muda = (n: number, patch: Partial<Item>) => setItens(xs => xs.map(x => (x.n === n ? { ...x, ...patch } : x)))

  async function registrar() {
    if (!currentUnit?.id) return
    if (!destinoId) return toast('Escolha a conta onde o dinheiro entrou', 'error')
    if (!prontos.length) return toast('Nenhuma linha marcada pronta pra registrar', 'error')
    setSalvando(true)
    try {
      // Um insert só: ou entram todas, ou nenhuma — um lote pela metade deixaria
      // o saldo do dia sem bater com o banco e sem dizer onde parou.
      const linhas = prontos.map(i => {
        const mov = i.movimento as Mov
        const op = operadoras.find(o => o.conta_id === i.operadoraId)!
        return {
          unidade_id: currentUnit.id,
          tipo: 'transferencia',
          conta_id: ENTRA[mov] ? i.operadoraId : destinoId,
          conta_destino_id: ENTRA[mov] ? destinoId : i.operadoraId,
          data: i.data,
          valor: Math.abs(i.valor),
          descricao: `${ROTULO[mov]} · ${op.nome}`,
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
            {pendentesEscolha > 0 && <span className="text-amber-500"> · {pendentesEscolha} esperando escolha</span>}
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
            Copie as linhas do extrato do banco (do CSV, da planilha ou do internet banking) e cole aqui.
            Pode vir tudo junto — o que não for de maquininha aparece separado na prévia.
          </p>
          <textarea
            value={texto} onChange={e => setTexto(e.target.value)} rows={10} autoFocus
            placeholder={'05/06/2026    Credito domicilio cartao: "CARTAO DE CREDITO - INTER PAG"    102,76\n05/06/2026    Credito domicilio cartao: "CARTAO DE CREDITO - INTER PAG"    130,92'}
            className="input text-xs text-mono w-full"
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[var(--surface-500)] block mb-1">Entrou na conta</label>
            <select value={destinoId} onChange={e => setDestinoId(e.target.value)} className="input text-sm w-full">
              <option value="">Escolher…</option>
              {destinos.map(d => (
                <option key={d.id} value={d.id}>{d.preferencial_recebimento ? '⭐ ' : ''}{d.nome}</option>
              ))}
            </select>
          </div>

          <div className="divide-y divide-[var(--surface-200)] max-h-[50vh] overflow-y-auto">
            {itens.map(i => {
              const fora = !!i.motivoFora
              return (
                <div key={i.n} className="flex items-start gap-2 py-1.5" style={{ opacity: fora || i.jaRegistrado ? 0.55 : 1 }}>
                  <input
                    type="checkbox" className="mt-1"
                    checked={i.marcado} disabled={fora}
                    onChange={e => muda(i.n, { marcado: e.target.checked })}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--surface-700)] truncate" title={i.original}>
                      {fmtData(i.data)} · {i.descricao}
                    </p>
                    {fora ? (
                      <p className="text-[11px] text-[var(--surface-400)]">{i.motivoFora}</p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        {i.candidatas.length > 1 ? (
                          <select value={i.operadoraId} onChange={e => muda(i.n, { operadoraId: e.target.value })}
                                  className="input text-[11px] py-0.5 px-1"
                                  style={!i.operadoraId ? { borderColor: '#f59e0b' } : undefined}>
                            <option value="">qual maquininha?</option>
                            {i.candidatas.map(c => <option key={c.conta_id} value={c.conta_id}>{c.nome}</option>)}
                          </select>
                        ) : (
                          <span className="text-[11px] text-emerald-500">{i.candidatas[0]?.nome}</span>
                        )}
                        <select value={i.movimento} onChange={e => muda(i.n, { movimento: e.target.value as Mov })}
                                className="input text-[11px] py-0.5 px-1"
                                style={!i.movimento ? { borderColor: '#f59e0b' } : undefined}>
                          <option value="">o que é?</option>
                          {(Object.keys(ROTULO) as Mov[])
                            .filter(m => ENTRA[m] === (i.valor > 0))
                            .map(m => <option key={m} value={m}>{ROTULO[m]}</option>)}
                        </select>
                        {i.jaRegistrado && <span className="text-[11px] text-sky-500">já registrado</span>}
                        {i.sinalIncerto && <span className="text-[11px] text-amber-500" title="O texto não traz sinal nem saldo pra conferir">confira se entrou ou saiu</span>}
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
