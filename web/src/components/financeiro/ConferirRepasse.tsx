'use client'

// CONFERIR O REPASSE — a tela da UNIDADE (16/10/2026, Lucas: "não precisa abrir como se fosse um
// excelzão na parte de cremações, imitando o layout desktop de /repasse; pode ser algo mais simples,
// pensado para desk e mobile também").
//
// A Matriz monta e fecha o repasse em /repasse (a planilha continua lá). Aqui a unidade vê o que foi
// cobrado — quantos pets, os descontos, os acertos e o total —, confere a lista de pets e marca
// "Conferi" (mig 170). Conferido, o repasse fica Pronto pra pagar (até o dia 20 do mês seguinte) ou
// Pronto pra conciliar (depois): o pagamento entra pela Conciliação com Extrato, da linha do banco.
// Só conta SEM extrato (Dinheiro) registra "Paguei" à mão.

import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Loader2, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useUnit } from '@/contexts/UnitContext'
import { useToast } from '@/components/ui/Toast'
import { useFinanceiroVersao } from '@/lib/financeiro-eventos'
import { calcularAbatimento, calcularValorFinal, fmtBRL, mesParaData, type DeflatorTipo, type ItemRepasse } from '@/lib/repasse'
import { estadoDoRepasse, faltaRepasse, pendenciaRepasse, vencimentoRepasse, ROTULO_ESTADO_REPASSE, type EstadoRepasse } from '@/lib/repasse-estado'
import { carregarRepassesDaUnidade, type RepasseDaUnidade } from '@/lib/repasse-carregar'
import { hojeLocal } from '@/lib/date-local'
import LancamentosEspeciaisModal from './LancamentosEspeciaisModal'

type Acerto = { descricao: string; valor: number; direcao: 'abate' | 'acresce' }
type Ordem = 'data' | 'nome' | 'lacre' | 'tipo' | 'valor'
/** Ind/Col: individual antes, como diz o botão */
const POS_TIPO: Record<string, number> = { individual: 0, coletiva: 1 }
const ORDENS: [Ordem, string][] = [['data', 'Data'], ['nome', 'Nome'], ['lacre', 'Lacre'], ['tipo', 'Ind/Col'], ['valor', 'Valor']]
const ddmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—')
const COR: Record<EstadoRepasse, string> = {
  em_aberto: 'text-amber-500 border-amber-500/40 bg-amber-500/5', pago_parte: 'text-amber-500 border-amber-500/40 bg-amber-500/5',
  pronto_pagar: 'text-sky-500 border-sky-500/40 bg-sky-500/5', pronto_conciliar: 'text-sky-500 border-sky-500/40 bg-sky-500/5',
  pago: 'text-emerald-500 border-emerald-500/40 bg-emerald-500/5',
}

export default function ConferirRepasse({ mes, podeConferir }: { mes: string; podeConferir: boolean }) {
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, [])
  const { currentUnit, userName } = useUnit()
  const { toast } = useToast()
  const versaoFin = useFinanceiroVersao()
  const [carregando, setCarregando] = useState(true)
  const [rep, setRep] = useState<RepasseDaUnidade | null>(null)
  const [itens, setItens] = useState<ItemRepasse[]>([])
  const [acertos, setAcertos] = useState<Acerto[]>([])
  const [petsAbertos, setPetsAbertos] = useState(false)
  const [busca, setBusca] = useState('')
  // CLASSIFICAR (16/10/2026, Lucas): Data · Nome · Lacre · Ind/Col · Valor; clicar de novo inverte
  const [ordem, setOrdem] = useState<{ por: Ordem; desc: boolean }>({ por: 'data', desc: false })
  const [gravando, setGravando] = useState(false)
  const [semExtrato, setSemExtrato] = useState(0)
  const [pagarAberto, setPagarAberto] = useState(false)
  const [recarga, setRecarga] = useState(0)
  // PAGAMENTOS (16/10/2026, Lucas): conciliado, a data é a do BANCO (fin_conciliacoes.data_banco)
  const [pagamentos, setPagamentos] = useState<{ valor: number; data: string; conciliado: boolean }[]>([])

  useEffect(() => {
    const uid = currentUnit?.id
    if (!uid) return
    let vivo = true
    void (async () => {
      const todos = await carregarRepassesDaUnidade(supabase, uid)
      const r = todos.find(x => x.ref === mes) || null
      let lista: ItemRepasse[] = [], acs: Acerto[] = []
      let pgs: { valor: number; data: string; conciliado: boolean }[] = []
      if (r && r.pago > 0.005) {
        const { data: mv } = await supabase.from('fin_movimentos').select('id, valor, data')
          .or(`repasse_id.eq.${r.id}${r.pagoMovimentoId ? `,id.eq.${r.pagoMovimentoId}` : ''}`).order('data')
        const movs = (mv as { id: string; valor: number; data: string }[] | null) || []
        const { data: cc } = movs.length
          ? await supabase.from('fin_conciliacoes').select('origem_id, data_banco').eq('origem', 'movimento').in('origem_id', movs.map(m => m.id))
          : { data: [] }
        const banco = new Map(((cc as { origem_id: string; data_banco: string | null }[] | null) || []).map(c => [c.origem_id, c.data_banco]))
        pgs = movs.map(m => ({ valor: Number(m.valor), data: (banco.get(m.id) || m.data).slice(0, 10), conciliado: banco.has(m.id) }))
      }
      if (r) {
        const [{ data: its }, { data: ps }] = await Promise.all([
          supabase.from('fin_repasse_itens')
            .select('contrato_id, contrato_codigo, pet_nome, tutor_nome, numero_lacre, data_acolhimento, tipo_cremacao, valor_base, deflator_tipo, deflator_valor, deflator_motivo')
            .eq('repasse_id', r.id).order('data_acolhimento'),
          supabase.from('fin_repasse_permutas').select('descricao, valor, direcao').eq('repasse_id', r.id),
        ])
        lista = (its as ItemRepasse[] | null) || []
        acs = ((ps as Acerto[] | null) || []).map(p => ({ ...p, valor: Number(p.valor) }))
      } else {
        // a Matriz ainda não fechou: a prévia pela tabela de preços, só pra ver
        const { data: el } = await supabase.from('vw_repasse_elegivel')
          .select('contrato_id, contrato_codigo, pet_nome, tutor_nome, numero_lacre, data_acolhimento, tipo_cremacao, valor_tabela')
          .eq('unidade_id', uid).eq('mes_referencia', mesParaData(mes)).order('data_acolhimento')
        lista = ((el as (Omit<ItemRepasse, 'valor_base' | 'deflator_tipo' | 'deflator_valor'> & { valor_tabela: number })[] | null) || [])
          .map(e => ({ ...e, valor_base: Number(e.valor_tabela || 0), deflator_tipo: 'nenhum' as DeflatorTipo, deflator_valor: 0 }))
      }
      // conta sem extrato (Dinheiro): a única que ainda registra "Paguei" à mão
      const { data: cs } = await supabase.from('contas').select('id').or(`unidade_id.eq.${uid},unidades_extras.cs.{${uid}}`)
        .eq('ativo', true).eq('conciliavel', false)
      if (!vivo) return
      setRep(r); setItens(lista); setAcertos(acs); setPagamentos(pgs)
      setSemExtrato(((cs as { id: string }[] | null) || []).length)
      setCarregando(false)
    })()
    return () => { vivo = false }
  }, [supabase, currentUnit?.id, mes, versaoFin, recarga])

  const resumo = useMemo(() => {
    const ind = itens.filter(i => i.tipo_cremacao === 'individual').length
    const bruto = itens.reduce((a, i) => a + Number(i.valor_base || 0), 0)
    const descontos = itens.reduce((a, i) => a + calcularAbatimento(i), 0)
    return { ind, col: itens.length - ind, bruto, descontos, comDesconto: itens.filter(i => calcularAbatimento(i) > 0).length }
  }, [itens])
  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const xs = t ? itens.filter(i => `${i.pet_nome || ''} ${i.tutor_nome || ''} ${i.numero_lacre || ''}`.toLowerCase().includes(t)) : [...itens]
    const lacre = (i: ItemRepasse) => { const n = Number((i.numero_lacre || '').replace(/\D/g, '')); return Number.isFinite(n) && i.numero_lacre ? n : Infinity }
    const cmp: Record<Ordem, (a: ItemRepasse, b: ItemRepasse) => number> = {
      data: (a, b) => (a.data_acolhimento || '').localeCompare(b.data_acolhimento || ''),
      nome: (a, b) => (a.pet_nome || '').localeCompare(b.pet_nome || '', 'pt-BR'),
      lacre: (a, b) => lacre(a) - lacre(b) || (a.numero_lacre || '').localeCompare(b.numero_lacre || ''),
      tipo: (a, b) => (POS_TIPO[a.tipo_cremacao || ''] ?? 2) - (POS_TIPO[b.tipo_cremacao || ''] ?? 2) || (a.data_acolhimento || '').localeCompare(b.data_acolhimento || ''),
      valor: (a, b) => calcularValorFinal(a) - calcularValorFinal(b),
    }
    const f = cmp[ordem.por]
    return xs.sort((a, b) => (ordem.desc ? -f(a, b) : f(a, b)))
  }, [itens, busca, ordem])

  async function marcarConferido(desfazer = false) {
    if (!rep) return
    setGravando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('fin_repasses').update(desfazer
      ? { conferido_em: null, conferido_por: null, conferido_por_nome: null, conferido_total: null }
      : { conferido_em: new Date().toISOString(), conferido_por: user?.id || null, conferido_por_nome: userName || null, conferido_total: rep.total })
      .eq('id', rep.id)
    setGravando(false)
    if (error) return toast(/conferido/i.test(error.message) ? 'Falta rodar a migration 170 no banco (conferência do repasse).' : `Não gravou: ${error.message}`, 'error')
    toast(desfazer ? 'Conferência desfeita' : 'Repasse conferido: pronto pra pagar', 'success')
    setRecarga(x => x + 1)
  }

  if (carregando) return <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--surface-400)]" /></div>
  if (!rep && !itens.length) return <p className="text-sm text-[var(--surface-500)] py-6">Nenhuma cremação neste mês.</p>

  const hoje = hojeLocal()
  const estado = rep ? estadoDoRepasse(rep, hoje) : null
  const pend = rep ? pendenciaRepasse(rep) : null
  const totalPrevia = resumo.bruto - resumo.descontos

  return (
    <div className="flex flex-col gap-3">
      {/* 1) o estado e o total — o que importa, em cima */}
      {rep && estado ? (
        <div className={`rounded-[12px] border p-3.5 ${COR[estado]}`}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-semibold">{estado === 'em_aberto' || estado === 'pago_parte' ? ROTULO_ESTADO_REPASSE[estado] : estado === 'pago' ? (pagamentos.length && pagamentos.every(p => p.conciliado) ? '© Pago' : 'Pago') : `✓ ${ROTULO_ESTADO_REPASSE[estado]}`}</span>
            <span className="ml-auto text-mono text-xl tabular-nums text-[var(--surface-900)]">{fmtBRL(rep.total)}</span>
          </div>
          <p className="text-[12px] text-[var(--surface-600)] mt-1">
            {estado === 'pago' ? (pagamentos.length ? null : `Pago${rep.pago ? ` · ${fmtBRL(rep.pago)}` : ''}.`)
              : estado === 'pago_parte' ? `Pagos ${fmtBRL(rep.pago)} · faltam ${fmtBRL(faltaRepasse(rep))}. O próximo pagamento aparece na Conciliação com Extrato ligado a este repasse.`
              : `${vencimentoRepasse(rep.ref) < hoje ? 'Venceu' : 'Vence'} em ${ddmm(vencimentoRepasse(rep.ref))}. `}
            {(estado === 'pronto_pagar' || estado === 'pronto_conciliar') && <>
              {estado === 'pronto_pagar' ? 'Pague no banco até o vencimento.' : 'Já venceu.'} Quando o extrato (OFX) chegar na Conciliação com Extrato, a linha do Pix pra Matriz já aparece ligada a este repasse: é só conciliar.
            </>}
            {estado === 'em_aberto' && pend && <span className="block mt-0.5">Para ficar pronto: {pend}.</span>}
          </p>
          {pagamentos.length > 0 && (
            <div className="mt-1.5 flex flex-col gap-0.5">
              {pagamentos.map((p, k) => (
                <span key={k} className="text-[12px] text-[var(--surface-700)]">
                  {p.conciliado ? <b className="text-emerald-500">©</b> : <span className="text-sky-500">•</span>} Pago em <b>{ddmm(p.data)}</b> · <span className="text-mono">{fmtBRL(p.valor)}</span>
                  <span className="text-[var(--surface-500)]">{p.conciliado ? ' · data do banco (conciliado)' : ' · falta conciliar'}</span>
                </span>
              ))}
            </div>
          )}
          {rep.conferidoEm && estado !== 'em_aberto' && (
            <p className="text-[11px] text-[var(--surface-500)] mt-1">
              Conferido{rep.conferidoPorNome ? ` por ${rep.conferidoPorNome}` : ''} em {ddmm(rep.conferidoEm.slice(0, 10))}
              {podeConferir && estado !== 'pago' && <> · <button onClick={() => void marcarConferido(true)} disabled={gravando} className="underline hover:text-[var(--surface-700)]">desfazer</button></>}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-[12px] border border-[var(--surface-200)] p-3.5">
          <div className="flex items-baseline gap-3">
            <span className="font-semibold text-[var(--surface-700)]">Prévia</span>
            <span className="ml-auto text-mono text-xl tabular-nums text-[var(--surface-900)]">{fmtBRL(totalPrevia)}</span>
          </div>
          <p className="text-[12px] text-[var(--surface-500)] mt-1">A Matriz ainda não fechou este repasse. Pela tabela de preços, sem descontos nem acertos. Dá para conferir quando ela fechar.</p>
        </div>
      )}

      {/* 2) a conta: pets → descontos → acertos → total */}
      <div className="rounded-[12px] border border-[var(--surface-200)] divide-y divide-[var(--surface-100)] text-sm">
        <Linha rotulo={`${itens.length} ${itens.length === 1 ? 'cremação' : 'cremações'} · ${resumo.ind} IND · ${resumo.col} COL`} valor={fmtBRL(resumo.bruto)} />
        {resumo.descontos > 0 && <Linha rotulo={`Descontos em ${resumo.comDesconto} ${resumo.comDesconto === 1 ? 'pet' : 'pets'}`} valor={`− ${fmtBRL(resumo.descontos)}`} />}
        {acertos.map((a, k) => <Linha key={k} rotulo={a.descricao || 'Acerto'} sub={a.direcao === 'abate' ? 'acerto que abate' : 'acerto que soma'} valor={`${a.direcao === 'abate' ? '−' : '+'} ${fmtBRL(a.valor)}`} />)}
        <Linha rotulo="Total a pagar" valor={fmtBRL(rep ? rep.total : totalPrevia)} forte />
        {rep && rep.pago > 0.005 && rep.status !== 'pago' && <Linha rotulo="Já pago" valor={`− ${fmtBRL(rep.pago)}`} />}
      </div>

      {/* 3) os pets — fechados por padrão; no celular cada um vira um cartão de duas linhas */}
      {itens.length > 0 && (
        <div className="rounded-[12px] border border-[var(--surface-200)]">
          <button onClick={() => setPetsAbertos(v => !v)} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-left">
            <ChevronRight className={`h-4 w-4 text-[var(--surface-400)] transition-transform ${petsAbertos ? 'rotate-90' : ''}`} />
            <span className="text-[var(--surface-800)]">Ver os {itens.length} pets</span>
          </button>
          {petsAbertos && (
            <div className="px-3.5 pb-3">
              {itens.length > 12 && (
                <label className="flex items-center gap-2 mb-2 rounded-[10px] border border-[var(--surface-200)] px-2.5 py-1.5">
                  <Search className="h-3.5 w-3.5 text-[var(--surface-400)]" />
                  <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="pet, tutor ou lacre" className="bg-transparent text-sm outline-none flex-1 min-w-0" />
                </label>
              )}
              <div className="flex flex-wrap items-center gap-1.5 mb-2 text-[12px]">
                <span className="text-[var(--surface-500)] mr-0.5">Ordenar por</span>
                {ORDENS.map(([k, rot]) => {
                  const ativa = ordem.por === k
                  return (
                    <button key={k} onClick={() => setOrdem(o => (o.por === k ? { por: k, desc: !o.desc } : { por: k, desc: k === 'valor' }))}
                            className={`px-2.5 py-0.5 rounded-full border ${ativa ? 'border-[var(--brand-500)] text-[var(--brand-500)] font-medium' : 'border-[var(--surface-200)] text-[var(--surface-600)] hover:border-[var(--surface-400)]'}`}>
                      {rot}{ativa ? (ordem.desc ? ' ↓' : ' ↑') : ''}
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-col gap-1">
                {filtrados.map(i => {
                  const desc = calcularAbatimento(i)
                  return (
                    // IND verde · COL roxo — as cores do resto do CRM (detalhe do contrato, grupos de encaminhamento)
                    <div key={i.contrato_id} className={`py-1.5 pl-2.5 pr-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 items-baseline border-l-[3px] rounded-r-[6px] ${i.tipo_cremacao === 'individual' ? 'border-emerald-500 bg-emerald-500/5' : i.tipo_cremacao === 'coletiva' ? 'border-violet-500 bg-violet-500/5' : 'border-[var(--surface-300)]'}`}>
                      <span className="min-w-0 truncate text-sm text-[var(--surface-800)]">
                        {i.numero_lacre && <span className="text-mono text-[11px] text-[var(--surface-400)] mr-1.5">{i.numero_lacre}</span>}
                        {i.pet_nome || '—'}
                      </span>
                      <span className="text-mono text-sm tabular-nums text-[var(--surface-800)] text-right">{fmtBRL(calcularValorFinal(i))}</span>
                      <span className="min-w-0 truncate text-[11.5px] text-[var(--surface-500)]">
                        <span className={`font-semibold ${i.tipo_cremacao === 'individual' ? 'text-emerald-500' : i.tipo_cremacao === 'coletiva' ? 'text-violet-400' : ''}`}>{i.tipo_cremacao === 'individual' ? 'IND' : i.tipo_cremacao === 'coletiva' ? 'COL' : '—'}</span> · {ddmm(i.data_acolhimento)} · {i.tutor_nome || '—'}
                      </span>
                      <span className="text-[11px] text-right text-amber-500">{desc > 0 ? `− ${fmtBRL(desc)}${i.deflator_motivo ? ` · ${i.deflator_motivo}` : ''}` : ''}</span>
                    </div>
                  )
                })}
                {!filtrados.length && <p className="py-3 text-sm text-[var(--surface-500)]">Nenhum pet com esse nome.</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4) as ações */}
      {rep && podeConferir && estado === 'em_aberto' && (
        <div className="flex flex-col gap-1.5">
          <button onClick={() => void marcarConferido()} disabled={gravando} className="btn-primary text-sm self-stretch sm:self-start">
            {gravando ? 'gravando…' : `✓ Conferi, está certo · ${fmtBRL(rep.total)}`}
          </button>
          <p className="text-[11.5px] text-[var(--surface-500)]">Se algum pet, desconto ou acerto não bate, fale com a Matriz antes de conferir. Se ela mudar o repasse depois, a conferência cai e você confere de novo.</p>
        </div>
      )}
      {rep && podeConferir && semExtrato > 0 && estado !== 'pago' && estado !== 'em_aberto' && (
        <button onClick={() => setPagarAberto(true)} className="text-[12.5px] text-[var(--brand-500)] hover:underline self-start">Paguei com uma conta sem extrato (Dinheiro) ›</button>
      )}
      <LancamentosEspeciaisModal aberto={pagarAberto} abrirEm="repasse" onClose={() => setPagarAberto(false)} onRegistrou={() => setRecarga(x => x + 1)} />
    </div>
  )
}

function Linha({ rotulo, sub, valor, forte }: { rotulo: string; sub?: string; valor: string; forte?: boolean }) {
  return (
    <div className={`flex items-baseline gap-3 px-3.5 py-2 ${forte ? 'font-semibold' : ''}`}>
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${forte ? 'text-[var(--surface-900)]' : 'text-[var(--surface-700)]'}`}>{rotulo}</span>
        {sub && <span className="block text-[11px] text-[var(--surface-500)]">{sub}</span>}
      </span>
      <span className="text-mono tabular-nums text-[var(--surface-900)]">{valor}</span>
    </div>
  )
}
