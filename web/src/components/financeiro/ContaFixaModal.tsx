'use client'

// CONTA FIXA — cadastrar/editar uma conta do calendário (mig 160, 10/10/2026;
// desenho fechado na bancada: docs/bancada_financeiro).
//
// Guarda a REGRA (todo dia N · N-ésimo dia útil · último dia útil + antecipa/
// adia), nunca a data. A prévia mostra os próximos vencimentos já com os dias
// riscados — fim de semana e feriado nacional (lib/vencimentos.ts).

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import { buscarCategorias } from '@/lib/busca-categoria'
import { proximosVencimentos, nomeFeriado, type RegraVencimento } from '@/lib/vencimentos'

export type ContaFixa = {
  id: string; unidade_id: string; nome: string; fornecedor_nome: string | null; categoria_id: string | null
  valor: number; valor_varia: boolean; regra: RegraVencimento['regra']; dia: number | null; ajuste: RegraVencimento['ajuste']
  conta_pagamento_id: string | null; repasse: boolean; ativo: boolean
}
type Cat = { id: string; nome: string; parent_id: string | null; termos: string[] | null }
type ContaRow = { id: string; nome: string; produto: string | null; tipo: string | null }

const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const curto = (s: string) => `${SEM[new Date(`${s}T00:00:00Z`).getUTCDay()]} ${s.slice(8, 10)}/${s.slice(5, 7)}`
const soDigitos = (t: string) => t.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12)
const digNum = (d: string) => Number(d || '0') / 100
const digTxt = (d: string) => (d ? digNum(d).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '')

export default function ContaFixaModal({ aberto, conta, onClose, onSalvou }: {
  aberto: boolean
  /** null = nova */
  conta: ContaFixa | null
  onClose: () => void
  onSalvou: () => void
}) {
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, [])
  const { toast } = useToast()
  const { currentUnit, userName } = useUnit()
  const [cats, setCats] = useState<Cat[]>([])
  const [contas, setContas] = useState<ContaRow[]>([])
  const [nome, setNome] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [catId, setCatId] = useState('')
  const [buscaCat, setBuscaCat] = useState('')
  const [valor, setValor] = useState('')
  const [varia, setVaria] = useState(false)
  const [regra, setRegra] = useState<RegraVencimento['regra']>('dia')
  const [dia, setDia] = useState(10)
  const [ajuste, setAjuste] = useState<RegraVencimento['ajuste']>('depois')
  const [contaPag, setContaPag] = useState('')
  const [repasse, setRepasse] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  useEffect(() => {
    if (!aberto || !currentUnit?.id) return
    const uid = currentUnit.id
    void Promise.all([
      supabase.from('fin_categorias').select('id, nome, parent_id, termos').eq('ativo', true).order('nivel').order('ordem'),
      supabase.from('contas').select('id, nome, produto, tipo').or(`unidade_id.eq.${uid},unidades_extras.cs.{${uid}}`)
        .eq('ativo', true).eq('legado', false).order('nome'),
    ]).then(([c, k]) => {
      setCats((c.data as Cat[] | null) || [])
      setContas(((k.data as ContaRow[] | null) || []).filter(x => x.produto !== 'maquininha' && x.tipo !== 'cartao'))
    })
  }, [aberto, currentUnit?.id, supabase])

  // Abrir = carregar o rascunho (a conta ou uma nova).
  const [carregadoDe, setCarregadoDe] = useState<string | null>(null)
  const chave = aberto ? (conta?.id || 'nova') : null
  if (chave !== carregadoDe) {
    setCarregadoDe(chave)
    if (chave) {
      setNome(conta?.nome || ''); setFornecedor(conta?.fornecedor_nome || ''); setCatId(conta?.categoria_id || ''); setBuscaCat('')
      setValor(conta?.valor ? String(Math.round(conta.valor * 100)) : ''); setVaria(conta?.valor_varia ?? false)
      setRegra(conta?.regra || 'dia'); setDia(conta?.dia || 10); setAjuste(conta?.ajuste || 'depois')
      setContaPag(conta?.conta_pagamento_id || ''); setRepasse(conta?.repasse ?? false); setExcluindo(false)
    }
  }

  const caminhoDe = (id: string) => {
    const partes: string[] = []
    let atual = cats.find(c => c.id === id)
    while (atual) { partes.unshift(atual.nome); atual = atual.parent_id ? cats.find(c => c.id === atual!.parent_id) : undefined }
    return partes.join(' › ')
  }
  const folhas = cats.filter(c => !cats.some(f => f.parent_id === c.id))
  const achados = buscaCat.trim().length >= 2 ? buscarCategorias(folhas, caminhoDe, buscaCat, 8) : []
  const hoje = new Date()
  const previa = proximosVencimentos({ regra, dia: regra === 'ultimo_util' ? null : dia, ajuste }, hoje.getFullYear(), hoje.getMonth(), 5)

  async function salvar() {
    if (!currentUnit?.id) return
    if (!nome.trim()) return toast('Dê um nome à conta', 'error')
    if (!repasse && !catId) return toast('Escolha a categoria (é a da despesa que o Paguei vai lançar)', 'error')
    setSalvando(true)
    const campos = {
      unidade_id: currentUnit.id, nome: nome.trim(), fornecedor_nome: fornecedor.trim() || null,
      categoria_id: repasse ? null : catId, valor: digNum(valor), valor_varia: varia,
      regra, dia: regra === 'ultimo_util' ? null : dia, ajuste, conta_pagamento_id: contaPag || null, repasse,
    }
    const { error } = conta
      ? await supabase.from('fin_contas_fixas').update(campos).eq('id', conta.id)
      : await supabase.from('fin_contas_fixas').insert({ ...campos, criado_por_nome: userName || null })
    setSalvando(false)
    if (error) return toast(error.message, 'error')
    toast(conta ? 'Conta fixa atualizada' : 'Conta fixa guardada', 'success')
    onSalvou(); onClose()
  }

  async function excluir() {
    if (!conta) return
    if (!excluindo) return setExcluindo(true)
    // Desativa (não apaga): as despesas que já pagaram esta conta seguem ligadas.
    const { error } = await supabase.from('fin_contas_fixas').update({ ativo: false }).eq('id', conta.id)
    if (error) return toast(error.message, 'error')
    toast('Conta fixa removida do calendário', 'success')
    onSalvou(); onClose()
  }

  const op = (sel: boolean, onClick: () => void, titulo: string, sub?: string) => (
    <button type="button" onClick={onClick}
            className={`flex flex-col gap-0.5 text-left px-3 py-2 rounded-[10px] border ${sel ? 'border-[var(--brand-500)] bg-[var(--brand-500)]/10 font-semibold' : 'border-[var(--surface-200)] hover:bg-[var(--surface-100)]'}`}>
      <span className="text-sm text-[var(--surface-800)]">{titulo}</span>
      {sub && <span className="text-[11px] font-normal text-[var(--surface-500)]">{sub}</span>}
    </button>
  )

  return (
    <Modal isOpen={aberto} onClose={onClose} title={conta ? 'Editar conta fixa' : 'Conta fixa'} size="md"
      footer={
        <div className="flex items-center gap-2 w-full">
          {conta && (
            <button onClick={() => void excluir()} className={`text-sm px-3 py-1.5 rounded-[10px] border ${excluindo ? 'bg-red-500 border-red-500 text-white' : 'border-red-400/60 text-red-400'}`}>
              {excluindo ? 'Confirmar' : 'Tirar do calendário'}
            </button>
          )}
          <button onClick={onClose} className="btn-secondary text-sm ml-auto">Cancelar</button>
          <button onClick={() => void salvar()} disabled={salvando} className="btn-primary text-sm">Guardar conta fixa</button>
        </div>
      }>
      <div className="space-y-4 text-sm">
        <div className="space-y-1.5">
          <p className="font-semibold text-[var(--surface-800)]">1. Que conta é?</p>
          <input value={nome} onChange={e => setNome(e.target.value)} className="input w-full" aria-label="Nome da conta" />
          <input value={fornecedor} onChange={e => setFornecedor(e.target.value)} className="input w-full" aria-label="Para quem paga" placeholder="" />
          <p className="text-xs text-[var(--surface-500)]">nome e para quem paga (ex.: Aluguel · Inter Finco)</p>
          <label className="flex items-center gap-2 text-xs text-[var(--surface-600)] cursor-pointer">
            <input type="checkbox" checked={repasse} onChange={e => setRepasse(e.target.checked)} className="accent-[var(--brand-500)]" />
            é o repasse à Matriz (o &quot;Pagar&quot; abre a Quitação; o valor vem do repasse em aberto)
          </label>
          {!repasse && (catId ? (
            <p className="text-xs text-[var(--surface-600)]">Categoria: <b>{caminhoDe(catId)}</b> <button className="text-[var(--brand-500)] hover:underline ml-1" onClick={() => setCatId('')}>trocar</button></p>
          ) : (
            <div>
              <input value={buscaCat} onChange={e => setBuscaCat(e.target.value)} className="input w-full" aria-label="Categoria" placeholder="" />
              <p className="text-xs text-[var(--surface-500)] mt-1">categoria da despesa — digite (ex.: aluguel, água, DAS)</p>
              {achados.map(a => (
                <button key={a.c.id} onClick={() => { setCatId(a.c.id); setBuscaCat('') }} className="block w-full text-left text-xs px-2 py-1.5 rounded hover:bg-[var(--surface-100)]">{caminhoDe(a.c.id)}</button>
              ))}
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <p className="font-semibold text-[var(--surface-800)]">2. Quanto?</p>
          <div className="grid grid-cols-2 gap-2">
            {op(!varia, () => setVaria(false), 'Valor fixo')}
            {op(varia, () => setVaria(true), 'Muda todo mês', 'água, luz, DAS — o Paguei pede o valor')}
          </div>
          <input inputMode="numeric" value={digTxt(valor)} onChange={e => setValor(soDigitos(e.target.value))} className="input w-full text-mono" aria-label="Valor" placeholder="0,00" />
          <p className="text-xs text-[var(--surface-500)]">{varia ? 'um valor médio, só pra previsão' : repasse ? 'deixe em branco: vem do repasse em aberto' : 'o valor de todo mês'}</p>
        </div>

        <div className="space-y-1.5">
          <p className="font-semibold text-[var(--surface-800)]">3. Quando vence?</p>
          <div className="grid grid-cols-2 gap-2">
            {op(regra === 'dia', () => { setRegra('dia'); if (dia > 31) setDia(10) }, 'Todo dia N', 'ex.: aluguel no dia 10')}
            {op(regra === 'dia_util', () => { setRegra('dia_util'); setDia(5) }, 'N-ésimo dia útil', 'ex.: salário no 5º dia útil')}
            {op(regra === 'ultimo_util', () => setRegra('ultimo_util'), 'Último dia útil', 'ex.: cesta básica')}
          </div>
          {regra !== 'ultimo_util' && (
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={regra === 'dia_util' ? 22 : 31} value={dia}
                     onChange={e => setDia(Math.max(1, Math.min(regra === 'dia_util' ? 22 : 31, Number(e.target.value) || 1)))}
                     className="input w-24" aria-label={regra === 'dia' ? 'Dia do mês' : 'Qual dia útil'} />
              <span className="text-xs text-[var(--surface-500)]">{regra === 'dia' ? 'dia do mês' : 'º dia útil do mês'}</span>
            </div>
          )}
        </div>

        {regra === 'dia' && (
          <div className="space-y-1.5">
            <p className="font-semibold text-[var(--surface-800)]">4. Se cair em fim de semana ou feriado</p>
            <div className="grid grid-cols-2 gap-2">
              {op(ajuste === 'depois', () => setAjuste('depois'), 'Paga no dia útil seguinte', 'o normal de boleto')}
              {op(ajuste === 'antes', () => setAjuste('antes'), 'Paga no dia útil anterior', 'quando não pode atrasar')}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <p className="font-semibold text-[var(--surface-800)]">{regra === 'dia' ? '5' : '4'}. De onde costuma sair? <span className="font-normal text-[var(--surface-500)]">(opcional)</span></p>
          <select value={contaPag} onChange={e => setContaPag(e.target.value)} className="input w-full" aria-label="Conta de onde costuma sair">
            <option value="">—</option>
            {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <p className="text-xs text-[var(--surface-500)]">vira um atalho no Paguei — nada vem marcado</p>
        </div>

        <div className="rounded-[12px] bg-[var(--surface-100)] p-3 space-y-1">
          <p className="text-[11px] font-semibold tracking-[.12em] uppercase text-[var(--surface-500)]">Próximos vencimentos</p>
          {previa.map(v => (
            <p key={v.data} className="text-sm text-[var(--surface-800)]">
              {v.riscados.map(r => <span key={r} className="line-through text-[var(--surface-400)] mr-1.5">{curto(r)}{nomeFeriado(r) ? ' feriado' : ''}</span>)}
              {v.riscados.length > 0 && '→ '}<b>{curto(v.data)}</b>
            </p>
          ))}
          <p className="text-[11px] text-[var(--surface-500)] pt-1">Feriados nacionais já entram sozinhos.</p>
        </div>
      </div>
    </Modal>
  )
}
