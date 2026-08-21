'use client'

// CAIXA — "tenho dinheiro?" (migration 124).
//
// A DRE responde se a operação dá lucro; esta aba responde se há dinheiro. São
// perguntas diferentes e por isso duas telas: um mês pode fechar com lucro e
// caixa negativo (vendeu parcelado, pagou à vista).
//
// TRÊS ORIGENS, nenhuma digitada duas vezes (view `vw_caixa`):
//   1. `pagamentos`      → o que o tutor pagou, pelo valor LÍQUIDO (já sem a taxa)
//   2. `fin_lancamentos` → a despesa, na `data_caixa` — exceto a de conta CARTÃO
//   3. `fin_movimentos`  → transferência, fatura, aporte: move dinheiro e não é DRE
//
// ⚠️ CONTA CARTÃO tem saldo NEGATIVO enquanto a fatura está aberta — é dívida, não
// dinheiro disponível. A despesa comprada no crédito não sai do caixa quando é
// lançada; sai quando alguém paga a fatura. Sem essa separação o dinheiro sairia
// duas vezes (item a item + fatura).

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  Loader2, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, CreditCard,
  Landmark, Wallet, Plus, Check,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import { fmtBRL, fmtData, hojeISO, limitesDoMes } from '@/lib/financeiro'

type Saldo = {
  conta_id: string; nome: string; tipo: string
  entradas: number; saidas: number; saldo: number
}
type Linha = {
  conta_id: string; data: string; tipo: string
  descricao: string | null; valor: number; origem: string; origem_id: string
}

const mesAtual = () => new Date().toISOString().slice(0, 7)

/** Os movimentos que o usuário pode lançar, e como cada um se comporta. */
const TIPOS = [
  { v: 'transferencia', label: 'Transferência', destino: true,  ajuda: 'Entre contas de vocês — inclui sacar do banco pro caixa.' },
  { v: 'fatura_cartao', label: 'Pagar fatura',  destino: true,  ajuda: 'A conta corrente quita o acumulado de um cartão.' },
  { v: 'aporte',        label: 'Aporte',        destino: false, ajuda: 'Sócio pôs dinheiro. Não é receita, não vai pra DRE.' },
  { v: 'emprestimo',    label: 'Empréstimo',    destino: false, ajuda: 'Entrada do principal. Os juros são despesa e vão lançados à parte.' },
  { v: 'ajuste',        label: 'Ajuste',        destino: false, ajuda: 'Acerto de saldo contra o extrato.' },
]

function IconeConta({ tipo }: { tipo: string }) {
  const C = tipo === 'cartao' ? CreditCard : tipo === 'dinheiro' ? Wallet : Landmark
  return <C className="h-4 w-4 text-[var(--surface-500)]" />
}

export default function CaixaTab({ somenteLeitura = false }: { somenteLeitura?: boolean }) {
  const supabaseTipado = createClient()
  const supabase = supabaseTipado as unknown as SupabaseClient
  const { toast } = useToast()
  const { currentUnit, userName } = useUnit()

  const [mes, setMes] = useState(mesAtual())
  const [saldos, setSaldos] = useState<Saldo[]>([])
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [carregando, setCarregando] = useState(false)
  const [conta, setConta] = useState('')          // filtro do extrato

  // formulário de movimento
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState('transferencia')
  const [origem, setOrigem] = useState('')
  const [destino, setDestino] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(hojeISO())
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    if (!currentUnit?.id) return
    setCarregando(true)
    const { ini, fim } = limitesDoMes(mes)
    const [s, k] = await Promise.all([
      // Saldo é ACUMULADO — não filtra por mês, senão não é saldo.
      supabase.from('vw_caixa_saldo').select('*').eq('unidade_id', currentUnit.id),
      supabase.from('vw_caixa').select('*')
        .eq('unidade_id', currentUnit.id)
        .gte('data', ini).lte('data', fim)
        .order('data', { ascending: false }),
    ])
    setSaldos(((s.data as Saldo[]) || []).sort((a, b) => a.nome.localeCompare(b.nome)))
    setLinhas(((k.data as Linha[]) || []))
    setCarregando(false)
  }, [supabase, currentUnit?.id, mes])

  useEffect(() => { void carregar() }, [carregar])

  const defTipo = TIPOS.find(t => t.v === tipo)!
  const contasCorrente = saldos.filter(s => s.tipo !== 'cartao')
  const cartoes = saldos.filter(s => s.tipo === 'cartao')

  function abrirPagarFatura(cartao: Saldo) {
    setTipo('fatura_cartao')
    setDestino(cartao.conta_id)
    setOrigem(contasCorrente[0]?.conta_id || '')
    setValor(String(Math.abs(cartao.saldo).toFixed(2)))
    setData(hojeISO())
    setDescricao(`Fatura ${cartao.nome}`)
    setAberto(true)
  }

  function limpar() {
    setAberto(false); setTipo('transferencia'); setOrigem(''); setDestino('')
    setValor(''); setData(hojeISO()); setDescricao('')
  }

  async function salvar() {
    if (!currentUnit?.id) return
    const v = Number(valor)
    if (!origem) return toast('Escolha a conta', 'error')
    if (defTipo.destino && !destino) return toast('Escolha a conta de destino', 'error')
    if (defTipo.destino && destino === origem) return toast('Origem e destino têm que ser diferentes', 'error')
    if (!v || v <= 0) return toast('Informe o valor', 'error')

    setSalvando(true)
    const { error } = await supabase.from('fin_movimentos').insert({
      unidade_id: currentUnit.id,
      tipo,
      conta_id: origem,
      conta_destino_id: defTipo.destino ? destino : null,
      data,
      valor: v,
      descricao: descricao.trim() || null,
      criado_por_nome: userName || null,
    })
    setSalvando(false)
    if (error) return toast(error.message, 'error')
    toast('Movimento registrado', 'success')
    limpar()
    void carregar()
  }

  const visiveis = conta ? linhas.filter(l => l.conta_id === conta) : linhas
  const totalDisponivel = saldos.filter(s => s.tipo !== 'cartao').reduce((a, s) => a + Number(s.saldo || 0), 0)
  const totalFaturas = cartoes.reduce((a, s) => a + Math.min(Number(s.saldo || 0), 0), 0)

  return (
    <div className="animate-fade-in space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="month" value={mes} onChange={e => setMes(e.target.value)}
          className="input text-sm w-36 py-1"
        />
        <span className="text-xs text-[var(--surface-500)]">
          disponível <span className="text-mono text-[var(--surface-800)]">{fmtBRL(totalDisponivel)}</span>
          {totalFaturas < 0 && (
            <> · fatura em aberto <span className="text-mono text-amber-500">{fmtBRL(-totalFaturas)}</span></>
          )}
        </span>
        {carregando && <Loader2 className="h-4 w-4 animate-spin text-[var(--surface-400)]" />}
        {!somenteLeitura && (
          <button onClick={() => setAberto(true)} className="btn-primary text-sm ml-auto">
            <Plus className="h-4 w-4" /> Movimento
          </button>
        )}
      </div>

      {/* Saldo por conta — clicar filtra o extrato */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {saldos.map(s => {
          const cartao = s.tipo === 'cartao'
          const ativo = conta === s.conta_id
          return (
            <button
              key={s.conta_id}
              onClick={() => setConta(ativo ? '' : s.conta_id)}
              className="card p-3 text-left transition-colors"
              style={{ borderColor: ativo ? 'var(--brand-500)' : undefined }}
            >
              <div className="flex items-center gap-1.5">
                <IconeConta tipo={s.tipo} />
                <span className="text-xs text-[var(--surface-600)] truncate">{s.nome}</span>
              </div>
              <p
                className="text-mono text-lg tabular-nums truncate"
                style={{ color: cartao ? '#f59e0b' : Number(s.saldo) < 0 ? '#ef4444' : 'var(--surface-800)' }}
              >
                {fmtBRL(cartao ? Math.abs(Number(s.saldo)) : Number(s.saldo))}
              </p>
              {cartao ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-[var(--surface-400)]">
                    {Number(s.saldo) < 0 ? 'fatura em aberto' : 'sem fatura'}
                  </span>
                  {!somenteLeitura && Number(s.saldo) < 0 && (
                    <span
                      onClick={e => { e.stopPropagation(); abrirPagarFatura(s) }}
                      className="text-[10px] text-[var(--brand-500)] underline cursor-pointer"
                    >
                      pagar
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-[var(--surface-400)] mt-0.5">
                  entrou {fmtBRL(s.entradas)} · saiu {fmtBRL(s.saidas)}
                </p>
              )}
            </button>
          )
        })}
      </div>

      {/* Extrato do mês */}
      <div className="card divide-y divide-[var(--surface-200)]">
        {!carregando && visiveis.length === 0 && (
          <p className="text-sm text-[var(--surface-500)] py-8 text-center">
            Sem movimento neste mês{conta ? ' nesta conta' : ''}.
          </p>
        )}
        {visiveis.map((l, i) => {
          const entra = l.valor > 0
          const Icon = l.origem === 'movimento' ? ArrowLeftRight : entra ? ArrowDownLeft : ArrowUpRight
          const cor = l.origem === 'movimento' ? 'var(--surface-500)' : entra ? '#10b981' : '#ef4444'
          return (
            <div key={`${l.origem_id}-${i}`} className="flex items-center gap-3 px-3 py-2">
              <Icon className="h-4 w-4 shrink-0" style={{ color: cor }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--surface-800)] truncate">{l.descricao || l.tipo}</p>
                <p className="text-xs text-[var(--surface-500)]">
                  {fmtData(l.data)} · {saldos.find(s => s.conta_id === l.conta_id)?.nome || '—'}
                </p>
              </div>
              <span className="text-mono text-sm tabular-nums shrink-0" style={{ color: cor }}>
                {entra ? '+' : '−'}{fmtBRL(Math.abs(l.valor))}
              </span>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-[var(--surface-500)]">
        Recebimentos entram pelo valor líquido, já sem a taxa da maquininha. Despesa comprada no
        cartão <strong className="font-medium">não sai daqui quando é lançada</strong> — ela acumula
        na fatura e sai quando alguém paga. Transferência, aporte e empréstimo movem dinheiro e não
        aparecem na DRE, porque não mudam o resultado.
      </p>

      <Modal
        isOpen={aberto}
        onClose={limpar}
        title="Novo movimento"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={limpar} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={() => void salvar()} disabled={salvando} className="btn-primary text-sm">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Registrar
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {TIPOS.map(t => {
              const on = tipo === t.v
              return (
                <button
                  key={t.v} type="button"
                  onClick={() => { setTipo(t.v); if (!t.destino) setDestino('') }}
                  className="text-xs px-2.5 py-1.5 rounded-[var(--radius-md)] border transition-colors"
                  style={{
                    background: on ? 'rgba(16,185,129,0.12)' : 'transparent',
                    borderColor: on ? '#10b981' : 'var(--surface-200)',
                    color: on ? '#10b981' : 'var(--surface-600)',
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-[var(--surface-400)]">{defTipo.ajuda}</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">
                {defTipo.destino ? 'Sai de' : 'Conta'}
              </label>
              <select value={origem} onChange={e => setOrigem(e.target.value)} className="input text-sm w-full">
                <option value="">Escolher…</option>
                {(tipo === 'fatura_cartao' ? contasCorrente : saldos).map(s => (
                  <option key={s.conta_id} value={s.conta_id}>{s.nome}</option>
                ))}
              </select>
            </div>
            {defTipo.destino && (
              <div>
                <label className="text-xs text-[var(--surface-500)] block mb-1">
                  {tipo === 'fatura_cartao' ? 'Cartão' : 'Entra em'}
                </label>
                <select value={destino} onChange={e => setDestino(e.target.value)} className="input text-sm w-full">
                  <option value="">Escolher…</option>
                  {(tipo === 'fatura_cartao' ? cartoes : saldos).map(s => (
                    <option key={s.conta_id} value={s.conta_id}>{s.nome}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Valor</label>
              <div className="flex items-center rounded-[var(--radius-md)] border overflow-hidden"
                   style={{ borderColor: 'var(--surface-300)', background: 'var(--surface-0)' }}>
                <span className="text-xs text-[var(--surface-400)] pl-2">R$</span>
                <input
                  type="number" min={0} step="0.01" value={valor}
                  onChange={e => setValor(e.target.value)}
                  placeholder="0,00"
                  className="w-full bg-transparent border-0 outline-none text-sm text-mono px-2 py-2 text-[var(--surface-800)]"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--surface-500)] block mb-1">Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)} className="input text-sm w-full" />
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--surface-500)] block mb-1">Descrição</label>
            <input
              value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder="opcional"
              className="input text-sm w-full"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
