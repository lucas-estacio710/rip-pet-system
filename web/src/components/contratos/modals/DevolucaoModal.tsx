'use client'

// DEVOLVER AO TUTOR (10/10/2026, pedido do Lucas — "vai usar 1 em 10.000 vezes",
// por isso mora num link discreto do bloco de pagamentos).
//
// O caso: o tutor desistiu de um item já pago (uma urninha) e recebe parte do
// dinheiro de volta. São DUAS coisas que têm de andar juntas, senão o contrato
// volta a "dever" (farol 💵 vermelho, cifrão na entrega, anomalia):
//   1. a VENDA diminui — o item sai do contrato e volta ao estoque; o que a
//      unidade reteve (preço − devolvido) vira valor de PLANO (decisão do Lucas);
//   2. o DINHEIRO sai — um pagamento NEGATIVO no contrato, que o Caixa já trata
//      como saída e o Importar extrato casa com o Pix do banco.
// Assim o saldo do contrato continua zero.
//
// Regras do pagamento negativo (revisão de 10/10/2026, todos os leitores de
// `pagamentos`): só Pix ou dinheiro (cartão viraria parcela futura negativa na
// previsão da maquininha), sem taxa (líquido = valor) e só contas desta unidade
// (devolução por conta de outra unidade exigiria acerto inverso).
//
// "Pagou a mais": sem item — só devolve o excedente (saldo a favor do tutor).
//
// ⚠️ O RETIDO MUDA DE BOLSO. O saldo do contrato é conferido POR TIPO (o farol
// 💵 compara o pago de plano com o valor do plano). O tutor pagou o item como
// acessório; o retido passa a ser plano — então, além da saída, vai um PAR de
// reclassificação sem conta (−retido acessório / +retido plano): soma zero, não
// aparece em extrato nenhum (vw_caixa é por conta) e acerta cada bolso.
// `id_transacao` marca as linhas: 'devolucao' (o dinheiro que saiu) e
// 'devolucao-reclass' (o par) — é por ele que a lista as reconhece.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import { registrarObservacaoContrato } from '@/lib/atribuir-tarefa'

export type ItemDevolvivel = { id: string; valor: number | null; desconto: number | null; quantidade: number; produto: { id: string; nome: string } | null }
type ContaRow = { id: string; nome: string; produto: string | null; tipo: string | null }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const soDigitos = (t: string) => t.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 10)
const digNum = (d: string) => Number(d || '0') / 100
const paraDig = (v: number) => String(Math.round(v * 100))

export default function DevolucaoModal({ aberto, onClose, contrato, itens, saldoAFavor, tipoExcedente = 'plano', onFeito }: {
  aberto: boolean
  onClose: () => void
  contrato: { id: string; unidade_id: string | null; valor_plano: number | null }
  itens: ItemDevolvivel[]
  /** Pago − devido, quando positivo: o tutor pagou a mais. */
  saldoAFavor: number
  /** De qual bolso é o excedente — a devolução sai dele, pro saldo por tipo fechar. */
  tipoExcedente?: 'plano' | 'catalogo'
  onFeito: () => void
}) {
  const supabase = createClient() as unknown as SupabaseClient
  const { toast } = useToast()
  const { userName } = useUnit()
  const [contas, setContas] = useState<ContaRow[]>([])
  const [alvo, setAlvo] = useState('')            // id do item · 'excedente'
  const [valor, setValor] = useState('')
  const [metodo, setMetodo] = useState<'pix' | 'dinheiro'>('pix')
  const [contaId, setContaId] = useState('')
  const [data, setData] = useState('')            // sem padrão: a data do extrato
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)

  const pagos = useMemo(() => itens.filter(i => (Number(i.valor) || 0) - (Number(i.desconto) || 0) > 0), [itens])
  const precoDe = (i: ItemDevolvivel) => Math.round(((Number(i.valor) || 0) - (Number(i.desconto) || 0)) * (i.quantidade || 1) * 100) / 100
  const item = pagos.find(i => i.id === alvo)
  const teto = item ? precoDe(item) : alvo === 'excedente' ? saldoAFavor : 0
  const v = digNum(valor)
  const retido = item ? Math.round((teto - v) * 100) / 100 : 0

  useEffect(() => {
    if (!aberto || !contrato.unidade_id) return
    setAlvo(''); setValor(''); setMetodo('pix'); setData(''); setMotivo('')
    void supabase.from('contas').select('id, nome, produto, tipo')
      .eq('unidade_id', contrato.unidade_id).eq('ativo', true).eq('legado', false).order('nome')
      .then(({ data: cs }) => {
        const lista = ((cs as ContaRow[] | null) || []).filter(c => c.produto !== 'maquininha' && c.tipo !== 'cartao' && c.produto !== 'cartao_credito')
        setContas(lista)
        setContaId(lista[0]?.id || '')
      })
  }, [aberto, contrato.unidade_id, supabase])

  async function devolver() {
    if (!alvo) return toast('Escolha o que está sendo devolvido', 'error')
    if (!(v > 0)) return toast('Informe o valor devolvido', 'error')
    if (v > teto + 0.005) return toast(`O máximo é ${brl(teto)}`, 'error')
    if (!contaId) return toast('Escolha de qual conta saiu', 'error')
    if (!data) return toast('Informe quando o dinheiro saiu', 'error')
    setSalvando(true)
    try {
      if (item) {
        // 1. a venda diminui: o item sai e volta ao estoque (a RPC trata estoque infinito)
        const { error: e1 } = await supabase.from('contrato_produtos').delete().eq('id', item.id)
        if (e1) throw new Error(`Tirar o item: ${e1.message}`)
        if (item.produto && contrato.unidade_id) {
          await supabase.rpc('ajustar_estoque_unidade', { p_produto_id: item.produto.id, p_unidade_id: contrato.unidade_id, p_delta: item.quantidade || 1 })
        }
        // o que a unidade reteve vira valor de plano
        if (retido > 0.005) {
          const { error: e2 } = await supabase.from('contratos')
            .update({ valor_plano: Math.round(((Number(contrato.valor_plano) || 0) + retido) * 100) / 100 }).eq('id', contrato.id)
          if (e2) throw new Error(`O item saiu, mas o retido não foi para o plano: ${e2.message}`)
        }
      }
      // 2. o dinheiro sai: pagamento negativo, sem taxa
      const linha = (tipo: 'plano' | 'catalogo', valorL: number, conta: string | null, marca: string) => ({
        contrato_id: contrato.id, tipo, metodo, conta_id: conta, id_transacao: marca,
        valor: valorL, desconto: 0, taxa: 0, valor_liquido: valorL, valor_liquido_sem_taxa: valorL,
        parcelas: 1, data_pagamento: data, criado_por_nome: userName || null,
      })
      const linhas = [linha(item ? 'catalogo' : tipoExcedente, -v, contaId, 'devolucao')]
      if (item && retido > 0.005) {
        linhas.push(linha('catalogo', -retido, null, 'devolucao-reclass'), linha('plano', retido, null, 'devolucao-reclass'))
      }
      const { error: e3 } = await supabase.from('pagamentos').insert(linhas)
      if (e3) throw new Error(`${item ? 'O item saiu, mas a' : 'A'} devolução não foi gravada: ${e3.message}`)
      void registrarObservacaoContrato(supabase as never, {
        contratoId: contrato.id, unidadeId: contrato.unidade_id, criadoPor: userName || 'sistema',
        descricao: `↩ Devolução ao tutor: ${brl(v)} (${metodo === 'pix' ? 'Pix' : 'dinheiro'}, ${data.split('-').reverse().join('/')})`
          + (item ? ` — ${item.produto?.nome || 'item'} saiu do contrato${retido > 0.005 ? `; ${brl(retido)} retidos foram para o plano` : ''}` : ' — pagamento a mais')
          + (motivo.trim() ? `. Motivo: ${motivo.trim()}` : ''),
      })
      toast(`Devolução de ${brl(v)} registrada`, 'success')
      onFeito(); onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao devolver', 'error')
      onFeito()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal isOpen={aberto} onClose={onClose} title="Devolver ao tutor" size="md"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={() => void devolver()} disabled={salvando || !alvo || !(v > 0)} className="btn-primary text-sm">
            {salvando ? 'Gravando…' : v > 0 ? `Devolver ${brl(v)}` : 'Devolver'}
          </button>
        </div>
      }>
      <div className="space-y-4 text-sm">
        <div className="space-y-1.5">
          <p className="font-medium text-[var(--surface-800)]">1. O que está sendo devolvido?</p>
          {pagos.map(i => (
            <label key={i.id} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="dev-alvo" checked={alvo === i.id} className="accent-[var(--brand-500)]"
                     onChange={() => { setAlvo(i.id); setValor(paraDig(precoDe(i))) }} />
              <span className="flex-1 text-[var(--surface-700)]">{i.produto?.nome || 'item'}{(i.quantidade || 1) > 1 ? ` ×${i.quantidade}` : ''}</span>
              <span className="text-mono text-[var(--surface-600)]">{brl(precoDe(i))}</span>
            </label>
          ))}
          {saldoAFavor > 0.005 && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="dev-alvo" checked={alvo === 'excedente'} className="accent-[var(--brand-500)]"
                     onChange={() => { setAlvo('excedente'); setValor(paraDig(saldoAFavor)) }} />
              <span className="flex-1 text-[var(--surface-700)]">O tutor pagou a mais</span>
              <span className="text-mono text-[var(--surface-600)]">{brl(saldoAFavor)}</span>
            </label>
          )}
          {!pagos.length && saldoAFavor <= 0.005 && <p className="text-[var(--surface-500)]">Nenhum item pago e nenhum valor pago a mais neste contrato.</p>}
        </div>

        {alvo && (<>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-[var(--surface-500)]">2. Quanto voltou
              <input inputMode="numeric" value={valor ? digNum(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}
                     onChange={e => setValor(soDigitos(e.target.value))} placeholder="0,00" className="input text-sm text-mono w-full mt-1" />
            </label>
            <label className="text-xs text-[var(--surface-500)]">Quando saiu
              <input type="date" value={data} onChange={e => setData(e.target.value)} className="input text-sm w-full mt-1"
                     style={!data ? { borderColor: '#f59e0b' } : undefined} />
            </label>
            <label className="text-xs text-[var(--surface-500)]">Como
              <select value={metodo} onChange={e => setMetodo(e.target.value as 'pix' | 'dinheiro')} className="input text-sm w-full mt-1">
                <option value="pix">Pix</option>
                <option value="dinheiro">Dinheiro</option>
              </select>
            </label>
            <label className="text-xs text-[var(--surface-500)]">De qual conta
              <select value={contaId} onChange={e => setContaId(e.target.value)} className="input text-sm w-full mt-1">
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
          </div>
          <label className="text-xs text-[var(--surface-500)] block">Motivo (opcional)
            <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="ex.: desistiu da urna" className="input text-sm w-full mt-1" />
          </label>
          <div className="rounded-[var(--radius-md)] bg-[var(--surface-100)] p-2.5 text-xs text-[var(--surface-600)] space-y-0.5">
            <p className="font-medium text-[var(--surface-700)]">Vai acontecer assim</p>
            {item ? (<>
              <p>· {item.produto?.nome || 'O item'} sai do contrato e volta ao estoque</p>
              {retido > 0.005 && <p>· {brl(retido)} que ficaram com a unidade passam a ser valor do plano</p>}
            </>) : <p>· nada muda na venda — só o excedente volta</p>}
            {v > 0 && <p>· sai {brl(v)} da conta, e o contrato continua quitado</p>}
          </div>
        </>)}
      </div>
    </Modal>
  )
}
