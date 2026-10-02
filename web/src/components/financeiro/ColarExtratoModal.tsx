'use client'

// COLAR DO EXTRATO — UM BOTÃO SÓ (02/10/2026).
//
// Pedido do Lucas: "um botão mais inteligente, do lado do Receitas a Prazo, que
// eu colasse qualquer coisa, e ele mesmo já faria a identificação". Substitui os
// dois colares (Despesas e Receitas a Prazo) que existiram por dois dias.
//
// A PERGUNTA QUE SEPARA AS LINHAS É "ISTO JÁ ESTÁ NO SISTEMA?". Cada linha do
// extrato tem de ter um par no Caixa daquela conta (`vw_caixa`): o pagamento do
// contrato, a despesa, a liquidação. Data + valor com sinal, contando
// ocorrências, e com as partes de uma despesa DIVIDIDA somadas (mig 149). O que
// sobra é novo, e vai para um de três destinos:
//   - RECEITA A PRAZO — entrada de maquininha (maquininha escolhida pro lote,
//     movimento pelo histórico);
//   - DESPESA — saída (categoria pelo histórico, forma e fornecedor pelo texto);
//   - FORA — fatura de cartão, aplicação, ou entrada sem par (um Pix de tutor que
//     ninguém registrou no contrato: o lugar é o contrato, não aqui).
// O HISTÓRICO decide primeiro (`lib/similaridade`, sobre os registros e despesas
// que guardaram o texto do banco); sem histórico, a pista do texto e o sinal.
// Em toda linha a pessoa pode trocar o destino.
//
// ⚠️ São DOIS inserts (fin_movimentos e fin_lancamentos): não há transação entre
// tabelas pelo PostgREST. Se o segundo falhar, a tela diz o que entrou.

import { useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Loader2, ClipboardPaste, History, CheckCircle2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import { fmtBRL, fmtData } from '@/lib/financeiro'
import {
  lerExtrato, movimentoDe, pareceMaquininha, metodoDe, fornecedorDe, naoEDespesa,
  ROTULO_MOV, ENTRA_MOV, movDoRegistro, type MovMaquininha, type LinhaExtrato,
} from '@/lib/extrato'
import { criarIndice, sugerir, type Sugestao } from '@/lib/similaridade'

type ContaRow = { id: string; nome: string; produto: string | null; tipo: string | null; preferencial_recebimento: boolean | null }
type Cat = {
  id: string
  fin_conta_id: string | null
  pergunta_capex: boolean
  fin_contas?: { codigo: string; nome: string; natureza: string } | null
}
type Destino = 'receita' | 'despesa' | 'fora'
/** O que o histórico pode sugerir: uma decisão de receita OU de despesa. */
type Decisao = { tipo: 'receita'; opId: string; mov: MovMaquininha | null } | { tipo: 'despesa'; catId: string }

const METODOS = [
  { v: 'pix', l: 'Pix' }, { v: 'debito', l: 'Débito' }, { v: 'boleto', l: 'Boleto' },
  { v: 'transferencia', l: 'Transf.' }, { v: 'dinheiro', l: 'Dinheiro' },
]

type Item = LinhaExtrato & {
  jaNoSistema: string | null     // com o que bateu ("contrato MEL"), ou null
  destino: Destino
  motivoFora: string | null
  marcado: boolean
  // receita
  opId: string                   // '' = a maquininha do lote
  mov: MovMaquininha | ''
  // despesa
  catId: string
  catTexto: string
  metodo: string
  fornecedor: string
  doHistorico: boolean
  sugestoes: Sugestao<Decisao>[]
}

export default function ColarExtratoModal({
  aberto, onClose, categorias, folhas, caminhoDe, mes, onRegistrou, permiteReceitas = true,
}: {
  aberto: boolean
  onClose: () => void
  categorias: Cat[]
  folhas: { id: string }[]
  caminhoDe: (id: string) => string
  mes: string
  onRegistrou: () => void
  /** FLS `obj_fin_receitas_prazo`: escondida a faixa, o colar não cria receita a prazo. */
  permiteReceitas?: boolean
}) {
  const supabase = createClient() as unknown as SupabaseClient
  const { toast } = useToast()
  const { currentUnit, userName } = useUnit()

  const [texto, setTexto] = useState('')
  const [itens, setItens] = useState<Item[]>([])
  const [contas, setContas] = useState<ContaRow[]>([])
  const [contaId, setContaId] = useState('')         // de QUAL conta é o extrato
  const [maquininhaLote, setMaquininhaLote] = useState('')
  const [lendo, setLendo] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const maquininhas = contas.filter(c => c.produto === 'maquininha')
  const correntes = contas.filter(c => c.produto !== 'maquininha' && c.tipo !== 'cartao')

  // As contas da unidade (as dela + as compartilhadas com ela), sem legado.
  useEffect(() => {
    if (!aberto || !currentUnit?.id) return
    setTexto(''); setItens([])
    void supabase.from('contas')
      .select('id, nome, produto, tipo, preferencial_recebimento')
      .or(`unidade_id.eq.${currentUnit.id},unidades_extras.cs.{${currentUnit.id}}`)
      .eq('ativo', true).eq('legado', false).order('nome')
      .then(({ data }) => {
        const cs = (data as ContaRow[] | null) || []
        setContas(cs)
        const corr = cs.filter(c => c.produto !== 'maquininha' && c.tipo !== 'cartao')
        setContaId((corr.find(c => c.preferencial_recebimento) || corr[0])?.id || '')
        const maq = cs.filter(c => c.produto === 'maquininha')
        setMaquininhaLote(maq.length === 1 ? maq[0].id : '')
      })
  }, [aberto, currentUnit?.id, supabase])

  async function ler() {
    if (!contaId) return toast('Escolha de qual conta é o extrato', 'error')
    const ano = Number(mes.slice(0, 4)) || new Date().getFullYear()
    const linhas = lerExtrato(texto, ano)
    if (!linhas.length) { setItens([]); return toast('Nenhuma linha com data e valor no texto colado', 'error') }
    setLendo(true)
    const datas = linhas.map(l => l.data).sort()
    const ini = datas[0], fim = datas[datas.length - 1]
    const maqIds = maquininhas.map(m => m.id)

    const [caixa, divs, histMov, histDesp] = await Promise.all([
      // 1) O QUE JÁ ESTÁ no Caixa desta conta nessas datas — de qualquer origem.
      supabase.from('vw_caixa').select('data, valor, origem, origem_id, descricao')
        .eq('conta_id', contaId).gte('data', ini).lte('data', fim),
      // 2) As divisões dessas despesas, pra somar as partes (uma linha no banco).
      supabase.from('fin_lancamentos').select('id, divisao_id')
        .eq('conta_pagamento_id', contaId).not('divisao_id', 'is', null)
        .gte('data_caixa', ini).lte('data_caixa', fim),
      // 3) A MEMÓRIA de receitas: registros que guardaram o texto do banco.
      maqIds.length
        ? supabase.from('fin_movimentos').select('descricao, conta_id, conta_destino_id, data')
            .eq('tipo', 'transferencia')
            .or(`conta_id.in.(${maqIds.join(',')}),conta_destino_id.in.(${maqIds.join(',')})`)
            .like('descricao', '% — %').order('created_at', { ascending: false }).limit(1000)
        : Promise.resolve({ data: [] }),
      // 4) A MEMÓRIA de despesas da unidade.
      supabase.from('fin_lancamentos')
        .select('fornecedor_nome, descricao, observacoes, categoria_id, data_competencia')
        .eq('unidade_id', currentUnit!.id).not('categoria_id', 'is', null).neq('status', 'rejeitado')
        .order('created_at', { ascending: false }).limit(2000),
    ])

    // ── "já no sistema": data + valor com sinal, ocorrências, divisões somadas ──
    type CX = { data: string; valor: number; origem: string; origem_id: string; descricao: string | null }
    const divisaoDe = new Map(((divs.data as { id: string; divisao_id: string }[] | null) || []).map(d => [d.id, d.divisao_id]))
    type Reg = { data: string; valor: number; rotulo: string; contrato: string | null; usado: boolean }
    const agrup = new Map<string, Reg>()
    ;((caixa.data as CX[] | null) || []).forEach((r, idx) => {
      const grupo = r.origem === 'lancamento' && divisaoDe.get(r.origem_id)
      const id = grupo ? `div-${grupo}` : `${r.origem}-${idx}`
      const contrato = r.origem === 'pagamento' ? (r.descricao || '').trim() : null
      const p = agrup.get(id) || {
        data: r.data, valor: 0, contrato, usado: false,
        rotulo: contrato ? `contrato ${contrato.split(' ').slice(1).join(' ')}`.trim()
          : r.origem === 'lancamento' ? 'despesa' : 'registro do caixa',
      }
      p.valor += Number(r.valor)
      agrup.set(id, p)
    })
    const registros = [...agrup.values()]

    /** Qual registro do sistema é o par desta linha do banco (ou null). Duas
     *  passadas: (1) um registro com a mesma data e valor; (2) a SOMA dos
     *  pagamentos ainda livres de UM contrato no mesmo dia — o tutor manda um
     *  Pix só e no contrato ele vira dois pagamentos (plano + acessório): o Pix
     *  de R$ 1.360 do 04/06 é o 70 + 1.290 do contrato da MEL. */
    function parIndividual(data: string, valor: number): string | null {
      const um = registros.find(r => !r.usado && r.data === data && Math.abs(r.valor - valor) < 0.005)
      if (um) { um.usado = true; return um.rotulo }
      return null
    }
    function parPorContrato(data: string, valor: number): string | null {
      const porContrato = new Map<string, Reg[]>()
      for (const r of registros) {
        if (r.usado || !r.contrato || r.data !== data) continue
        porContrato.set(r.contrato, [...(porContrato.get(r.contrato) || []), r])
      }
      for (const partes of porContrato.values()) {
        if (partes.length > 1 && Math.abs(partes.reduce((a, r) => a + r.valor, 0) - valor) < 0.005) {
          partes.forEach(r => { r.usado = true })
          return `${partes[0].rotulo} (${partes.length} pagamentos)`
        }
      }
      return null
    }
    // As duas passadas sobre TODAS as linhas, nesta ordem: a soma por contrato só
    // entra depois que cada linha tentou o par individual — senão uma soma poderia
    // levar um pagamento que era o par exato de outra linha.
    const pares = new Map<number, string>()
    for (const l of linhas) { const p = parIndividual(l.data, l.valor); if (p) pares.set(l.n, p) }
    for (const l of linhas) {
      if (pares.has(l.n)) continue
      const p = parPorContrato(l.data, l.valor); if (p) pares.set(l.n, p)
    }

    // ── a memória dos dois lados num índice só ──
    type HM = { descricao: string; conta_id: string; conta_destino_id: string; data: string }
    type HD = { fornecedor_nome: string | null; descricao: string | null; observacoes: string | null; categoria_id: string; data_competencia: string }
    const indice = criarIndice<Decisao>([
      ...((histMov.data as HM[] | null) || []).map(h => {
        const opId = maqIds.includes(h.conta_id) ? h.conta_id : h.conta_destino_id
        const mov = movDoRegistro(h.descricao)
        return { texto: h.descricao.slice(h.descricao.indexOf(' — ') + 3), decisao: { tipo: 'receita' as const, opId, mov }, chave: `R|${opId}|${mov}`, data: h.data }
      }),
      ...((histDesp.data as HD[] | null) || []).map(l => ({
        texto: `${l.observacoes || ''} ${l.fornecedor_nome || ''} ${l.descricao || ''}`.trim(),
        decisao: { tipo: 'despesa' as const, catId: l.categoria_id },
        chave: `D|${l.categoria_id}`,
        data: (l.data_competencia || '').slice(0, 10),
      })),
    ])

    // ESTORNO NO MESMO DIA: a saída e o estorno dela se anulam ("Pagamento de
    // Convenio VIVO SP −209,12" + "Estorno Pagamento ... +209,12", 17/06/2026).
    // Nenhum dos dois vira registro — o dinheiro não saiu.
    const estornadas = new Set<number>()
    for (const e of linhas) {
      if (e.valor <= 0 || pares.has(e.n) || !/estorno/i.test(e.descricao)) continue
      const saida = linhas.find(s => s.valor < 0 && !pares.has(s.n) && !estornadas.has(s.n)
        && s.data === e.data && Math.abs(s.valor + e.valor) < 0.005)
      if (saida) { estornadas.add(e.n); estornadas.add(saida.n) }
    }

    setItens(linhas.map(l => {
      const base = {
        ...l, jaNoSistema: null as string | null, motivoFora: null as string | null, marcado: true,
        opId: '', mov: '' as MovMaquininha | '', catId: '', catTexto: '',
        metodo: metodoDe(l.descricao) || 'pix', fornecedor: fornecedorDe(l.descricao),
        doHistorico: false, sugestoes: [] as Sugestao<Decisao>[],
      }
      // 1) já está no sistema?
      const par = pares.get(l.n)
      if (par) return { ...base, destino: 'fora' as Destino, jaNoSistema: par, marcado: false }
      if (estornadas.has(l.n)) {
        return { ...base, destino: 'fora' as Destino, marcado: false,
                 motivoFora: 'estornado no mesmo dia — a saída e o estorno se anulam' }
      }
      // 2) saída que não é despesa (fatura, aplicação)
      const nao = l.valor < 0 ? naoEDespesa(l.descricao) : null
      if (nao) return { ...base, destino: 'fora' as Destino, motivoFora: nao, marcado: false }

      // 3) o histórico, só com decisões compatíveis com a direção do dinheiro
      const r = sugerir(indice, l.descricao, undefined, { max: 3 })
      const validas = r.sugestoes.filter(s => s.decisao.tipo === 'despesa'
        ? l.valor < 0
        : !!s.decisao.mov && ENTRA_MOV[s.decisao.mov] === (l.valor > 0))
      const top = validas[0]
      const alta = r.confianca === 'alta' && top === r.sugestoes[0]

      // 4) destino: histórico manda; sem ele, a pista do texto e o sinal
      let destino: Destino
      if (top && (alta || r.confianca === 'media')) destino = top.decisao.tipo
      else if (l.valor > 0) destino = pareceMaquininha(l.descricao) ? 'receita' : 'fora'
      else destino = 'despesa'
      if (destino === 'receita' && !permiteReceitas) destino = l.valor < 0 ? 'despesa' : 'fora'

      const item: Item = { ...base, destino, sugestoes: validas }
      if (destino === 'fora') {
        item.marcado = false
        item.motivoFora = /pix recebido|transfer/i.test(l.descricao)
          ? 'entrada sem par no sistema — se for de tutor, registre o pagamento no contrato'
          : 'entrada que não é de maquininha nem está no sistema — confira'
      }
      if (destino === 'receita') {
        if (alta && top?.decisao.tipo === 'receita') { item.opId = top.decisao.opId; item.mov = top.decisao.mov || ''; item.doHistorico = true }
        if (!item.mov) item.mov = movimentoDe(l.descricao, l.valor) || ''
      }
      if (destino === 'despesa' && alta && top?.decisao.tipo === 'despesa') {
        item.catId = top.decisao.catId; item.catTexto = caminhoDe(top.decisao.catId); item.doHistorico = true
      }
      return item
    }))
    setLendo(false)
  }

  const muda = (n: number, patch: Partial<Item>) => setItens(xs => xs.map(x => (x.n === n ? { ...x, ...patch } : x)))

  const receitas = itens.filter(i => !i.jaNoSistema && i.destino === 'receita')
  const despesas = itens.filter(i => !i.jaNoSistema && i.destino === 'despesa')
  const fora = itens.filter(i => i.jaNoSistema || i.destino === 'fora')
  const recProntas = receitas.filter(i => i.marcado && (i.opId || maquininhaLote) && i.mov)
  const despProntas = despesas.filter(i => i.marcado && i.catId)
  const pendentes = receitas.filter(i => i.marcado && !(i.opId || maquininhaLote) || (i.marcado && !i.mov)).length
    + despesas.filter(i => i.marcado && !i.catId).length
  const totais = {
    rec: recProntas.reduce((a, i) => a + i.valor, 0),
    desp: despProntas.reduce((a, i) => a + Math.abs(i.valor), 0),
  }

  async function registrar() {
    if (!currentUnit?.id || !contaId) return
    if (!recProntas.length && !despProntas.length) return toast('Nada pronto pra registrar', 'error')
    setSalvando(true)
    let entrouRec = 0
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const agora = new Date().toISOString()
      if (recProntas.length) {
        const rows = recProntas.map(i => {
          const mov = i.mov as MovMaquininha
          const opId = i.opId || maquininhaLote
          const op = maquininhas.find(m => m.id === opId)!
          return {
            unidade_id: currentUnit.id, tipo: 'transferencia',
            conta_id: ENTRA_MOV[mov] ? opId : contaId,
            conta_destino_id: ENTRA_MOV[mov] ? contaId : opId,
            data: i.data, valor: Math.abs(i.valor),
            descricao: `${ROTULO_MOV[mov]} · ${op.nome} — ${i.descricao}`,
            criado_por_nome: userName || null,
          }
        })
        const { error } = await supabase.from('fin_movimentos').insert(rows)
        if (error) throw new Error(`Receitas a prazo: ${error.message}`)
        entrouRec = rows.length
      }
      if (despProntas.length) {
        const rows = despProntas.map(i => {
          const cat = categorias.find(c => c.id === i.catId)
          const cc = cat?.fin_contas
          return {
            unidade_id: currentUnit.id, categoria_id: i.catId,
            conta_id: cat?.fin_conta_id || null,
            conta_codigo: cc?.codigo || null, conta_nome: cc?.nome || null,   // SNAPSHOT da DRE
            natureza: cc?.natureza || 'opex',
            descricao: null, observacoes: i.descricao,   // texto do banco: ensina a próxima colagem
            valor: Math.abs(i.valor), data_competencia: i.data, data_caixa: i.data,
            fornecedor_nome: i.fornecedor.trim() || null, conta_pagamento_id: contaId,
            metodo_pagamento: i.metodo, rateio_meses: 1, origem: 'manual',
            criado_por_nome: userName || null, status: 'aprovado',
            aprovado_por: user?.id || null, aprovado_por_nome: userName || null, aprovado_em: agora,
          }
        })
        const { error } = await supabase.from('fin_lancamentos').insert(rows)
        if (error) throw new Error(`Despesas: ${error.message}${entrouRec ? ` (as ${entrouRec} receitas a prazo JÁ entraram)` : ''}`)
      }
      toast(`${recProntas.length} receitas a prazo · ${despProntas.length} despesas registradas`, 'success')
      onRegistrou()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao registrar', 'error')
      if (entrouRec) onRegistrou()
    } finally {
      setSalvando(false)
    }
  }

  // ── linha da prévia ──
  // ⚠️ FUNÇÃO QUE DESENHA, não componente: um componente declarado aqui dentro
  // ganha identidade nova a cada render, e o React desmontaria a linha a cada
  // tecla — o campo de categoria perderia o foco no meio da digitação.
  function linha(i: Item) {
    const apagada = !!i.jaNoSistema || i.destino === 'fora' || !i.marcado
    return (
      <div key={i.n} className="flex items-start gap-2 py-2" style={{ opacity: apagada ? 0.6 : 1 }}>
        {!i.jaNoSistema && i.destino !== 'fora'
          ? <input type="checkbox" className="mt-1" checked={i.marcado} onChange={e => muda(i.n, { marcado: e.target.checked })} />
          : <span className="w-[13px]" />}
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-xs text-[var(--surface-700)] truncate" title={i.original}>{fmtData(i.data)} · {i.descricao}</p>
          {i.jaNoSistema ? (
            <p className="text-[11px] text-emerald-500 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> já no sistema · {i.jaNoSistema}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <select value={i.destino}
                      onChange={e => muda(i.n, { destino: e.target.value as Destino, marcado: e.target.value !== 'fora',
                        mov: e.target.value === 'receita' && !i.mov ? (movimentoDe(i.descricao, i.valor) || '') : i.mov })}
                      className="input text-[11px] py-0.5 px-1">
                {permiteReceitas && i.valor > 0 && <option value="receita">receita a prazo</option>}
                {i.valor < 0 && <option value="despesa">despesa</option>}
                {permiteReceitas && i.valor < 0 && <option value="receita">maquininha (chargeback/taxa)</option>}
                <option value="fora">ignorar</option>
              </select>
              {i.destino === 'receita' && (
                <>
                  <select value={i.mov} onChange={e => muda(i.n, { mov: e.target.value as MovMaquininha })}
                          className="input text-[11px] py-0.5 px-1" style={!i.mov ? { borderColor: '#f59e0b' } : undefined}>
                    <option value="">o que é?</option>
                    {(Object.keys(ROTULO_MOV) as MovMaquininha[]).filter(m => ENTRA_MOV[m] === (i.valor > 0))
                      .map(m => <option key={m} value={m}>{ROTULO_MOV[m]}</option>)}
                  </select>
                  {i.opId && i.opId !== maquininhaLote && maquininhas.length > 1 && (
                    <select value={i.opId} onChange={e => muda(i.n, { opId: e.target.value })} className="input text-[11px] py-0.5 px-1">
                      {maquininhas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                    </select>
                  )}
                </>
              )}
              {i.destino === 'despesa' && (
                <>
                  <input list="colar-cats" value={i.catTexto} placeholder="Categoria…"
                         onChange={e => {
                           const t = e.target.value
                           const achou = folhas.find(f => caminhoDe(f.id) === t)
                           muda(i.n, { catTexto: t, catId: achou?.id || '', doHistorico: false })
                         }}
                         className="input text-[11px] py-0.5 px-1.5 flex-1 min-w-[170px]"
                         style={!i.catId ? { borderColor: '#f59e0b' } : undefined} />
                  <select value={i.metodo} onChange={e => muda(i.n, { metodo: e.target.value })} className="input text-[11px] py-0.5 px-1">
                    {METODOS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                  </select>
                  <input value={i.fornecedor} placeholder="fornecedor" onChange={e => muda(i.n, { fornecedor: e.target.value })}
                         className="input text-[11px] py-0.5 px-1.5 w-32" />
                </>
              )}
              {i.doHistorico && (
                <span className="text-[11px] text-sky-500 inline-flex items-center gap-0.5" title="Muito parecido com registros anteriores">
                  <History className="h-3 w-3" /> como das outras vezes
                </span>
              )}
              {i.destino === 'fora' && i.motivoFora && <span className="text-[11px] text-amber-500">{i.motivoFora}</span>}
            </div>
          )}
          {/* A LISTINHA — decisões parecidas do mesmo destino; clicar aplica. */}
          {!i.jaNoSistema && i.destino !== 'fora' && !(i.doHistorico && i.sugestoes.length === 1) && (
            <div className="flex flex-wrap gap-1">
              {i.sugestoes.filter(s => s.decisao.tipo === i.destino).map(s => {
                const d = s.decisao
                const rotulo = d.tipo === 'despesa'
                  ? caminhoDe(d.catId)
                  : `${maquininhas.find(m => m.id === d.opId)?.nome || '?'} · ${d.mov ? ROTULO_MOV[d.mov] : '?'}`
                return (
                  <button key={s.chave} type="button"
                          onClick={() => muda(i.n, d.tipo === 'despesa'
                            ? { catId: d.catId, catTexto: caminhoDe(d.catId) }
                            : { opId: d.opId, mov: d.mov || '' })}
                          className="text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--surface-300)] text-[var(--surface-500)] hover:border-sky-500 hover:text-sky-500"
                          title={`Parecido com ${s.vezes} registro(s); o mais recente em ${fmtData(s.ultima)}`}>
                    {rotulo} — {s.vezes}×
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
  }

  const secao = (titulo: string, lista: Item[], extra?: ReactNode) =>
    lista.length ? (
      <div>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs font-semibold text-[var(--surface-600)]">{titulo} ({lista.length})</p>
          {extra}
        </div>
        <div className="divide-y divide-[var(--surface-200)]">{lista.map(i => linha(i))}</div>
      </div>
    ) : null

  return (
    <Modal
      isOpen={aberto}
      onClose={onClose}
      title="Colar do extrato"
      footer={itens.length ? (
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="text-xs text-[var(--surface-500)]">
            {recProntas.length} receitas <span className="text-mono">{fmtBRL(totais.rec)}</span>
            {' · '}{despProntas.length} despesas <span className="text-mono">{fmtBRL(totais.desp)}</span>
            {pendentes > 0 && <span className="text-amber-500"> · {pendentes} esperando escolha</span>}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setItens([])} className="btn-secondary text-sm">Voltar</button>
            <button onClick={() => void registrar()} disabled={salvando || (!recProntas.length && !despProntas.length)} className="btn-primary text-sm">
              {salvando ? <><Loader2 className="h-4 w-4 animate-spin" /> Registrando…</> : `Registrar ${recProntas.length + despProntas.length}`}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={() => void ler()} disabled={!texto.trim() || lendo || !contaId} className="btn-primary text-sm">
            {lendo ? <><Loader2 className="h-4 w-4 animate-spin" /> Lendo…</> : <><ClipboardPaste className="h-4 w-4" /> Ler</>}
          </button>
        </div>
      )}
    >
      <div className="space-y-3">
        <div>
          <label className="text-xs text-[var(--surface-500)] block mb-1">Extrato da conta</label>
          <select value={contaId} onChange={e => { setContaId(e.target.value); setItens([]) }} className="input text-sm w-full">
            <option value="">Escolher…</option>
            {correntes.map(c => <option key={c.id} value={c.id}>{c.preferencial_recebimento ? '⭐ ' : ''}{c.nome}</option>)}
          </select>
        </div>

        {!itens.length ? (
          <div className="space-y-2">
            <p className="text-xs text-[var(--surface-500)]">
              Cole o extrato do jeito que veio do banco — um dia, uma semana, tudo misturado. Cada linha é
              conferida contra o que já está no sistema; o que for novo vira receita a prazo ou despesa.
            </p>
            <textarea
              value={texto} onChange={e => setTexto(e.target.value)} rows={10} autoFocus
              placeholder={'05/06/2026;"Credito domicilio cartao: ""CARTAO DE CREDITO - INTER PAG""";102,76;22.096,94\n05/06/2026;"Pix enviado: ""Cp :10573521-Rafael Moreira Giffoni""";-3.450,00;21.994,18'}
              className="input text-xs text-mono w-full"
            />
          </div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <datalist id="colar-cats">{folhas.map(f => <option key={f.id} value={caminhoDe(f.id)} />)}</datalist>
            {secao('Receitas a prazo', receitas,
              maquininhas.length > 1 ? (
                <select value={maquininhaLote} onChange={e => setMaquininhaLote(e.target.value)}
                        className="input text-[11px] py-0.5 px-1" style={!maquininhaLote ? { borderColor: '#f59e0b' } : undefined}>
                  <option value="">qual maquininha?</option>
                  {maquininhas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              ) : maquininhas.length === 1 ? (
                <span className="text-[11px] text-[var(--surface-400)]">{maquininhas[0].nome}</span>
              ) : (
                <span className="text-[11px] text-amber-500">nenhuma maquininha cadastrada (aba Contas)</span>
              ))}
            {secao('Despesas', despesas)}
            {secao('Já no sistema ou fora', fora)}
            {itens.some(i => i.destino === 'receita' && i.mov === 'antecipacao' && i.marcado) && (
              <p className="text-[11px] text-amber-500">
                Antecipação: registre o valor LÍQUIDO que caiu. O desconto da antecipação é despesa —
                Financeiro › Encargos.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
