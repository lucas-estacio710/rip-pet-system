'use client'

/**
 * Uma linha de produto com a sua tarefa — o "gestor por item" do popup de pendências
 * (item 27 de docs/REDESENHO_CARDS_PIPELINE.md), usado por Pelinho (2.8) e Personalizados (2.10).
 *
 *   [foto ✕]  Nome do produto                 [📝 OBS] [✓]
 *             👤− Juliana - 4h   |   Atribuir a… ▾   |   ✓ Juliana · 08/10 📷
 *             (nota em âmbar, quando há)
 *
 * Modos: `operacional` (unidade do contrato com cb_operacional — tarefa por produto),
 * `simples` (sem o módulo: o ○/✓ direto no produto) e `sem_tarefa` (tipo "outro": não vira
 * tarefa, conta como resolvido). "Escolher a pessoa" é o <select> NATIVO do celular, transparente
 * por cima do botão (font-size 16px — o iOS não dá zoom).
 */
import { useState, type ReactNode } from 'react'
import { Check, UserMinus, Camera, X } from 'lucide-react'
import { formatarIdade } from '@/lib/atribuir-tarefa'
import type { TarefaDoProduto } from '@/lib/tarefas-rescaldo'

export type Atribuivel = { user_id: string; nome: string | null }

export function SeletorPessoa({ pessoas, onEscolher, children, disabled }: { pessoas: Atribuivel[]; onEscolher: (id: string) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <span className="relative inline-flex">
      {children}
      <select
        aria-label="Atribuir a"
        disabled={disabled}
        value=""
        onChange={e => { if (e.target.value) onEscolher(e.target.value) }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        style={{ fontSize: 16 }}
      >
        <option value="">Atribuir a…</option>
        {pessoas.map(p => <option key={p.user_id} value={p.user_id}>{p.nome || 'Sem nome'}</option>)}
      </select>
    </span>
  )
}

type Props = {
  titulo: string
  imagemUrl?: string | null
  emoji?: string
  feito: boolean
  observacao: string | null
  tarefa?: TarefaDoProduto
  nomes: Record<string, string>
  comFoto: Record<string, boolean>
  pessoas: Atribuivel[]
  modo: 'operacional' | 'simples' | 'sem_tarefa'
  ocupado: boolean
  onAtribuir: (userId: string) => void
  onDesatribuir: () => void
  onAbrirConclusao: () => void
  onAlternarSimples: () => void
  onSalvarObs: (texto: string | null) => void
  onRemover?: () => void
  /** Painel de conclusão (foto + anotação), quando este item está sendo concluído. */
  painelConclusao?: ReactNode
}

/** Horas desde `iso` — fora do corpo do componente (o lint do React recusa Date.now() no render). */
function horasDesde(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 36e5
}

function corIdade(horas: number): string {
  return horas > 48 ? '#dc2626' : horas > 24 ? '#d97706' : '#2563eb'
}

export default function GestorItemTarefa(p: Props) {
  const [editandoObs, setEditandoObs] = useState(false)
  const [rascunhoObs, setRascunhoObs] = useState(p.observacao || '')
  const t = p.tarefa
  const pendente = !!t && t.status === 'pendente'
  const horas = pendente ? horasDesde(t!.atribuido_em) : 0
  const temObs = !!(p.observacao && p.observacao.trim())

  function alternarObs() {
    // Tocar de novo no OBS fecha o campo SALVANDO (item 27) — e só grava se mudou.
    if (editandoObs) {
      const novo = rascunhoObs.trim() || null
      if (novo !== (p.observacao?.trim() || null)) p.onSalvarObs(novo)
      setEditandoObs(false)
    } else {
      setRascunhoObs(p.observacao || '')
      setEditandoObs(true)
    }
  }

  return (
    <div className="rounded-xl border px-2 py-1.5" style={{ borderColor: 'var(--surface-200)', opacity: p.feito ? 0.65 : 1 }}>
      <div className="flex gap-2">
        {/* Foto (44px) com o ✕ no canto */}
        <span className="relative flex-none w-11 h-11 rounded-lg bg-white border flex items-center justify-center" style={{ borderColor: 'var(--surface-200)' }}>
          {p.imagemUrl
            ? <img src={p.imagemUrl} alt="" className="w-full h-full rounded-lg" style={{ objectFit: 'contain' }} />
            : <span className="text-xl">{p.emoji || '📦'}</span>}
          {p.onRemover && (
            <button type="button" onClick={p.onRemover} disabled={p.ocupado} aria-label={`Remover ${p.titulo}`}
              className="absolute -top-1.5 -right-1.5 w-[17px] h-[17px] rounded-full flex items-center justify-center text-white"
              style={{ background: '#dc2626' }}>
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </span>

        <div className="flex-1 min-w-0 flex flex-col justify-between">
          {/* linha do nome: nome · OBS · ✓ */}
          <div className="flex items-start gap-1.5">
            <span className="flex-1 min-w-0 text-[13.5px] font-semibold leading-tight truncate" style={{ color: 'var(--surface-800)' }}>{p.titulo}</span>
            {p.modo !== 'sem_tarefa' && !p.feito && (
              <button type="button" onClick={alternarObs} disabled={p.ocupado} title="Observação deste item"
                className="flex-none w-6 h-6 rounded-md flex flex-col items-center justify-center leading-none"
                style={temObs || editandoObs ? { background: 'rgba(245,158,11,.18)', color: '#b45309' } : { background: 'var(--surface-100)', color: 'var(--surface-500)' }}>
                <span className="text-[10px]">📝</span><span className="text-[6.5px] font-black">OBS</span>
              </button>
            )}
            {p.modo === 'operacional' && !p.feito && (
              <button type="button" onClick={p.onAbrirConclusao} disabled={p.ocupado} title="Concluir"
                className="flex-none w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'rgba(16,185,129,.14)', color: '#059669' }}>
                <Check className="h-3.5 w-3.5" />
              </button>
            )}
            {p.modo === 'simples' && (
              <button type="button" onClick={p.onAlternarSimples} disabled={p.ocupado}
                className="flex-none w-6 h-6 rounded-full flex items-center justify-center"
                style={p.feito ? { background: '#10b981', color: '#fff' } : { border: '2px dashed var(--surface-300)' }}
                title={p.feito ? 'Feito — tocar desfaz' : 'Marcar feito'}>
                {p.feito && <Check className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>

          {/* linha do status (alinhada ao rodapé da foto) */}
          <div className="flex items-center gap-1.5 min-w-0 mt-[3px]">
            {p.modo === 'sem_tarefa' ? (
              <span className="text-[12px]" style={{ color: 'var(--surface-400)' }}>Sem tarefa</span>
            ) : p.modo === 'simples' ? (
              <span className="text-[12px]" style={{ color: p.feito ? '#059669' : 'var(--surface-500)' }}>{p.feito ? 'Feito' : 'Pendente'}</span>
            ) : p.feito ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: '#059669' }}>
                ✓ {t ? (p.nomes[t.atribuido_a] || '—') : 'Feito'}{t?.concluido_em ? ` · ${new Date(t.concluido_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : ''}
                <Camera className="h-3.5 w-3.5" style={{ color: t && p.comFoto[t.id] ? '#059669' : 'var(--surface-300)' }} aria-label={t && p.comFoto[t.id] ? 'Com foto de conclusão' : 'Sem foto'} />
              </span>
            ) : pendente ? (
              <>
                <button type="button" disabled={p.ocupado} title="Desatribuir" onClick={p.onDesatribuir}
                  className="w-5 h-5 rounded-md flex items-center justify-center flex-none" style={{ background: 'rgba(220,38,38,.12)', color: '#dc2626' }}>
                  <UserMinus className="h-3 w-3" />
                </button>
                <span className="text-[12px] italic truncate" style={{ color: corIdade(horas) }}>
                  {p.nomes[t!.atribuido_a] || '…'} - {formatarIdade(horas)}
                </span>
              </>
            ) : (
              <SeletorPessoa pessoas={p.pessoas} disabled={p.ocupado} onEscolher={p.onAtribuir}>
                <span className="inline-flex items-center h-6 px-2 rounded-md text-[12px] font-bold" style={{ background: 'rgba(124,58,237,.10)', color: '#7c3aed' }}>Atribuir a… ▾</span>
              </SeletorPessoa>
            )}
          </div>
        </div>
      </div>

      {editandoObs ? (
        <div className="mt-1.5 flex gap-1.5">
          <input
            value={rascunhoObs}
            onChange={e => setRascunhoObs(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') alternarObs() }}
            maxLength={140}
            placeholder="ex.: molde da patinha de trás"
            className="flex-1 min-w-0 px-2 py-1.5 rounded-md border outline-none"
            style={{ borderColor: '#f59e0b', background: 'var(--surface-50)', color: 'var(--surface-800)', fontSize: 16 }}
          />
          <button type="button" onClick={alternarObs} className="px-3 rounded-md text-[12.5px] font-bold text-white" style={{ background: '#d97706' }}>OK</button>
        </div>
      ) : temObs && (
        <p className="mt-1 text-[12px] font-medium" style={{ color: '#b45309' }}>📝 {p.observacao}</p>
      )}

      {p.painelConclusao}
    </div>
  )
}
