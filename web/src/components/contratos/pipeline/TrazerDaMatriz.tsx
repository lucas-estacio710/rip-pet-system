'use client'

/**
 * "Trazer da Matriz" — fase 2.14b (item 15 de docs/REDESENHO_CARDS_PIPELINE.md) no celular e,
 * desde o 2.17f (D6), também no tablet e no desktop (centralizado, 640px); a tabela antiga saiu.
 * Só o desenho: a gravação continua no `finalizarVolta` da página (reconfere no banco, lotes
 * por data+viagem, presencial pulando a Entrega).
 *
 *  - Título "Nicho de <unidade>", sem subtítulo. Cabeçalho e rodapé fixos; só a lista rola.
 *  - Cada pet = box de 2 linhas: lacre · NOME · IND/COL … ✓ Cinzas · ✓ Cert. · [P] /
 *    tutor … data de volta. Com P: "Cremação: 16/set" (laranja) e "↳ Entrega: 16/set" (azul).
 *  - Entre a lista e o aviso do P: "Todos voltaram da Matriz em [data ✎]" — Hoje · Ontem ·
 *    <viagem> · Outra data…; vale para todos sem data própria. **Começa em HOJE** (P-14).
 *    Pet com data própria fica azul e a dica vira "N pet(s) com data diferente".
 */
import { useState } from 'react'
import { Loader2, Pencil } from 'lucide-react'
import PopupCentral from '@/components/ui/PopupCentral'

export type PetNoNichoTela = {
  id: string
  pet_nome: string | null
  numero_lacre: string | null
  tipo_cremacao: string | null
  tutor_nome: string | null
  tutor: { nome: string | null } | null
  supinda: { numero: string; data: string | null } | null
  contrato_gc: { cinzas_prontas: boolean; certificado_pronto: boolean; data_cremacao: string | null } | null
}

type Props = {
  aberto: boolean
  carregando: boolean
  trazendo: boolean
  unidadeNome: string
  pets: PetNoNichoTela[]
  datas: Record<string, string>
  presencial: Set<string>
  hoje: string
  /** A viagem de ida mais recente — vira uma das opções do lote. */
  sugestaoViagem: { data: string; rotulo: string } | null
  onData: (id: string, data: string) => void
  onLote: (de: string, para: string) => void
  onPresencial: (id: string) => void
  onCancelar: () => void
  onFinalizar: () => void
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const dm = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${MESES[parseInt(m) - 1] || m}`
}
const ontemDe = (hoje: string) => {
  const d = new Date(`${hoje}T12:00:00`); d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function TrazerDaMatriz(p: Props) {
  const [lote, setLote] = useState(p.hoje)
  const [opcoes, setOpcoes] = useState(false)

  const semP = p.pets.filter(x => !p.presencial.has(x.id))
  const diferentes = semP.filter(x => (p.datas[x.id] || lote) !== lote).length
  const nP = p.presencial.size

  function mudarLote(nova: string) {
    if (!nova) return
    p.onLote(lote, nova)
    setLote(nova)
    setOpcoes(false)
  }

  const opcao = (rotulo: string, data: string) => (
    <button key={rotulo} type="button" onClick={() => mudarLote(data)}
      className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold"
      style={lote === data ? { background: '#16a34a', color: '#fff' } : { background: 'var(--surface-100)', color: 'var(--surface-600)' }}>
      {rotulo}
    </button>
  )

  return (
    <PopupCentral aberto={p.aberto} onFechar={() => { if (!p.trazendo) p.onCancelar() }} largura={640}
      titulo={<div className="text-[16px] font-bold" style={{ color: 'var(--surface-800)' }}>Nicho de {p.unidadeNome}</div>}
      rodape={
        <div className="space-y-2">
          <div className="px-3 py-2 rounded-lg text-[12px] leading-snug" style={{ background: 'rgba(249,115,22,.12)', color: '#c2410c' }}>
            <b>Presencial:</b> o tutor foi presencial na Matriz e levou todos os itens. Com &quot;P&quot; marcado, pulará a etapa &quot;Entrega&quot; e irá direto para &quot;Finalizado&quot;.
            {nP > 0 && <b> {nP} marcado{nP > 1 ? 's' : ''}.</b>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={p.onCancelar} disabled={p.trazendo} className="flex-1 h-11 rounded-lg border text-[13px] font-semibold"
              style={{ borderColor: 'var(--surface-300)', color: 'var(--surface-500)' }}>Cancelar</button>
            <button type="button" onClick={p.onFinalizar} disabled={p.trazendo || p.carregando || p.pets.length === 0}
              className="flex-1 h-11 rounded-lg text-[13px] font-bold text-white disabled:opacity-50 inline-flex items-center justify-center gap-1.5" style={{ background: '#16a34a' }}>
              {p.trazendo && <Loader2 className="h-4 w-4 animate-spin" />}Finalizar Volta
            </button>
          </div>
        </div>
      }>
      {p.carregando ? (
        <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline-block" style={{ color: 'var(--surface-400)' }} /></div>
      ) : (
        <div className="space-y-2 pt-1">
          {p.pets.map(x => {
            const col = x.tipo_cremacao === 'coletiva'
            const pres = p.presencial.has(x.id)
            const data = p.datas[x.id] || lote
            const propria = !pres && data !== lote
            return (
              <div key={x.id} className="rounded-lg border px-2.5 py-2" style={{ borderColor: 'var(--surface-200)' }}>
                <div className="flex items-center gap-1.5 min-w-0">
                  {x.numero_lacre && <span className="flex-none text-[11px] font-mono font-bold px-1 rounded text-white" style={{ background: '#1d4ed8' }}>{x.numero_lacre}</span>}
                  <span className="min-w-0 truncate text-[13.5px] font-bold uppercase" style={{ color: 'var(--surface-800)' }}>{x.pet_nome || 'sem nome'}</span>
                  <span className="flex-none text-[11px] font-black" style={{ color: col ? '#8b5cf6' : '#10b981' }}>{col ? 'COL' : 'IND'}</span>
                  <span className="flex-1" />
                  {!col && x.contrato_gc?.cinzas_prontas && <span className="flex-none text-[10.5px] font-semibold text-emerald-500">✓ Cinzas</span>}
                  {x.contrato_gc?.certificado_pronto && <span className="flex-none text-[10.5px] font-semibold text-emerald-500">✓ Cert.</span>}
                  <button type="button" onClick={() => p.onPresencial(x.id)} title="Presencial: o tutor buscou na Matriz"
                    className="flex-none w-7 h-7 rounded-md text-[12px] font-black border"
                    style={pres ? { background: '#ea580c', borderColor: '#ea580c', color: '#fff' } : { borderColor: 'var(--surface-300)', color: 'var(--surface-400)' }}>P</button>
                </div>
                <div className="flex items-center gap-2 mt-1 min-w-0">
                  <span className="flex-1 min-w-0 truncate text-[12px]" style={{ color: 'var(--surface-500)' }}>{x.tutor?.nome || x.tutor_nome || ''}</span>
                  {pres ? (
                    <span className="flex-none text-right text-[11.5px] leading-tight">
                      <span className="block font-semibold" style={{ color: '#ea580c' }}>Cremação: {dm(x.contrato_gc?.data_cremacao)}</span>
                      <span className="block italic" style={{ color: '#1d4ed8' }}>↳ Entrega: {dm(x.contrato_gc?.data_cremacao)}</span>
                    </span>
                  ) : (
                    <input type="date" value={data} onChange={e => e.target.value && p.onData(x.id, e.target.value)}
                      className="flex-none w-[138px] px-1.5 py-1 rounded-md border text-[13px] font-semibold"
                      style={{ fontSize: 16, borderColor: propria ? '#2563eb' : 'var(--surface-200)', color: propria ? '#2563eb' : 'var(--surface-700)', background: 'var(--surface-0)' }} />
                  )}
                </div>
              </div>
            )
          })}

          {/* "Todos voltaram da Matriz em [data ✎]" — vale para quem não tem data própria. */}
          {semP.length > 0 && (
            <div className="pt-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap text-[13px]" style={{ color: 'var(--surface-600)' }}>
                Todos voltaram da Matriz em
                <button type="button" onClick={() => setOpcoes(o => !o)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-white" style={{ background: '#16a34a' }}>
                  {dm(lote)}<Pencil className="h-3 w-3" />
                </button>
              </div>
              {opcoes && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {opcao('Hoje', p.hoje)}
                  {opcao('Ontem', ontemDe(p.hoje))}
                  {p.sugestaoViagem && opcao(p.sugestaoViagem.rotulo, p.sugestaoViagem.data)}
                  <label className="inline-flex items-center gap-1 text-[12px]" style={{ color: 'var(--surface-500)' }}>
                    Outra data…
                    <input type="date" onChange={e => mudarLote(e.target.value)} className="px-1.5 py-1 rounded-md border"
                      style={{ fontSize: 16, borderColor: 'var(--surface-200)', background: 'var(--surface-0)', color: 'var(--surface-700)' }} />
                  </label>
                </div>
              )}
              {diferentes > 0 && <p className="text-[12px]" style={{ color: '#2563eb' }}>{diferentes} pet{diferentes > 1 ? 's' : ''} com data diferente</p>}
            </div>
          )}
        </div>
      )}
    </PopupCentral>
  )
}
