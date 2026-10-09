'use client'

/**
 * Card da VIAGEM no celular, pipeline redesenhado — fase 2.13c (itens 35 e 40 de
 * docs/REDESENHO_CARDS_PIPELINE.md, o "pans" aprovado em 01/10).
 *
 *   [🚚] ST172  📅 05/out                                   [⋮]
 *   [✓14 ⏱3]                                   🐶🐱🐶 (+10)
 *                                            14 pets · 210 kg
 *                                    🐕<10kg 6   🐕10kg+ 8
 *                                    ▬▬▬▬▬▬▬▬▬▬▬▬▬ (proporção)
 *   [$ 12/14] [9 IND] [5 COL]                         👤 Marcos
 *
 * - O "chefão" é o selo de pendências (o MESMO ✓/⏱ do card do pet, maior), somando os pets.
 *   Sem `btn_farois` na unidade (P-05) ele some.
 * - Pilha = regra do WAR (item 40): cada 10 pets viram uma ficha laranja "+10"; o resto em emoji.
 * - Peso nulo conta como leve (P-15).
 * - Tocar em qualquer parte abre a pasta; ⋮ = Adicionar pets · Editar · Enviar para Matriz
 *   (só viagem planejada). O menu não é cortado pelo card e abre pra cima perto do rodapé.
 */
import { useEffect, useRef, useState } from 'react'
import { Truck, Calendar, MoreVertical, Plus, Pencil, DollarSign, User } from 'lucide-react'

export type PetNaViagem = { id: string; emoji: string; individual: boolean; pesoKg: number | null; pago: boolean }

type Props = {
  numero: string
  data: string | null
  responsavel: string | null
  pets: PetNaViagem[]
  resumo: { feitos: number; pendentes: number } | null
  /** Corres da unidade pro número (o mesmo badge do resto da tela). */
  corUnidade: string
  textoUnidade: string
  /** null = viagem que já partiu: sem menu. */
  menu: { onAdicionar: () => void; onEditar: () => void; onEnviar: () => void } | null
  onAbrir: () => void
  onMenuAberto?: (aberto: boolean) => void
}

const dataCurta = (iso: string | null) => {
  if (!iso) return 'sem data'
  const d = new Date(iso.slice(0, 10) + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
}

/** Item 40: 14 pets = 4 emojis + ficha "+10"; 10 = só a ficha "10". */
export function pilhaWar(total: number): { emojis: number; ficha: number } {
  const ficha = Math.floor(total / 10) * 10
  return { emojis: total - ficha, ficha }
}

export default function CardViagem(p: Props) {
  const [menu, setMenu] = useState(false)
  const [paraCima, setParaCima] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { p.onMenuAberto?.(menu) }, [menu]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!menu) return
    const fora = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('pointerdown', fora)
    return () => document.removeEventListener('pointerdown', fora)
  }, [menu])

  const total = p.pets.length
  const peso = p.pets.reduce((s, x) => s + (x.pesoKg || 0), 0)
  const leves = p.pets.filter(x => (x.pesoKg || 0) < 10).length
  const pesados = total - leves
  const pagos = p.pets.filter(x => x.pago).length
  const ind = p.pets.filter(x => x.individual).length
  const col = total - ind
  const { emojis, ficha } = pilhaWar(total)
  const temPend = !!p.resumo && p.resumo.pendentes > 0

  function abrirMenu(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (!menu) {
      // Perto do rodapé (barra inferior do celular), abre pra cima.
      const r = e.currentTarget.getBoundingClientRect()
      setParaCima(window.innerHeight - r.bottom < 190)
    }
    setMenu(m => !m)
  }

  const item = (icone: React.ReactNode, rotulo: string, acao: () => void, laranja = false) => (
    <button type="button" onClick={e => { e.stopPropagation(); setMenu(false); acao() }}
      className="flex items-center gap-2 px-3 py-2.5 text-[13px] text-left"
      style={laranja ? { color: '#ea580c', fontWeight: 700, borderTop: '1px solid var(--surface-200)' } : { color: 'var(--surface-700)' }}>
      {icone}{rotulo}
    </button>
  )

  return (
    <div ref={ref} role="button" tabIndex={0} onClick={p.onAbrir}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onAbrir() } }}
      className="pl-viagem relative rounded-[14px] px-3 pt-2.5 pb-[11px] cursor-pointer active:scale-[.99] transition-transform"
      style={{ zIndex: menu ? 30 : undefined }}>
      {/* topo */}
      <div className="flex items-center gap-[7px] min-w-0">
        <span className="pl-viagem-van"><Truck className="h-[17px] w-[17px]" /></span>
        <span className="text-[13px] font-black px-1.5 py-0.5 rounded" style={{ background: p.corUnidade, color: p.textoUnidade }}>{p.numero}</span>
        <span className="flex items-center gap-[3px] text-[11.5px] font-bold" style={{ color: 'var(--surface-500)' }}>
          <Calendar className="h-3 w-3" />{dataCurta(p.data)}
        </span>
        <span className="flex-1" />
        {p.menu && (
          <span className="relative flex-none">
            <button type="button" onClick={abrirMenu} className="w-7 h-7 rounded-lg grid place-items-center" style={{ color: 'var(--surface-500)' }}
              title="Ações do encaminhamento" aria-label={`Ações do encaminhamento ${p.numero}`} aria-expanded={menu}>
              <MoreVertical className="h-[18px] w-[18px]" />
            </button>
            {menu && (
              <span className="absolute right-0 z-20 min-w-[210px] rounded-[10px] border py-1 flex flex-col"
                style={{ [paraCima ? 'bottom' : 'top']: 'calc(100% + 4px)', borderColor: 'var(--surface-200)', background: 'var(--surface-0)', boxShadow: '0 10px 24px rgba(0,0,0,.18)' }}>
                {item(<Plus className="h-4 w-4" />, 'Adicionar pets', p.menu.onAdicionar)}
                {item(<Pencil className="h-4 w-4" />, 'Editar encaminhamento', p.menu.onEditar)}
                {item(<Truck className="h-4 w-4" />, 'Enviar para Matriz', p.menu.onEnviar, true)}
              </span>
            )}
          </span>
        )}
      </div>

      {/* miolo: chefão à esquerda, pilha + totais + porte à direita */}
      <div className="flex items-center justify-between gap-2.5 mt-2">
        {p.resumo ? (
          <span className="pl-vidro pl-viagem-chefe" style={{ '--pl-c': temPend ? '#f59e0b' : '#22c55e' } as React.CSSProperties}
            title={`Pendências dos pets da viagem: ${p.resumo.feitos} feitas, ${p.resumo.pendentes} faltando`}>
            <span>✓ {p.resumo.feitos}</span>
            {p.resumo.pendentes > 0 && <span>⏱ {p.resumo.pendentes}</span>}
          </span>
        ) : <span />}
        <div className="flex flex-col items-end gap-px min-w-0 ml-auto text-right">
          {total > 0 && (
            <div className="flex pl-1">
              {p.pets.slice(0, emojis).map((x, i) => (
                <span key={x.id} className="pl-viagem-av" style={{ '--anel': x.individual ? '#10b981' : '#8b5cf6', zIndex: 10 - i } as React.CSSProperties}>{x.emoji}</span>
              ))}
              {ficha > 0 && <span className={`pl-viagem-war${emojis ? '' : ' cheio'}`} title={`${total} pets`}>{emojis ? '+' : ''}{ficha}</span>}
            </div>
          )}
          <div className="flex items-baseline gap-[5px] text-[13px]" style={{ color: 'var(--surface-500)' }}>
            <b className="text-[20px] font-black tabular-nums" style={{ color: 'var(--surface-800)' }}>{total}</b> pet{total !== 1 ? 's' : ''}
            <span>·</span>
            <b className="text-[20px] font-black tabular-nums" style={{ color: 'var(--surface-800)' }}>{Math.round(peso)}</b> kg
          </div>
          {total > 0 && (
            <>
              <div className="flex gap-[5px] mt-[3px]">
                <span className="pl-viagem-pc leve" title="Pets com menos de 10 kg (sem peso conta aqui)"><span style={{ fontSize: 11 }}>🐕</span>&lt;10kg <b>{leves}</b></span>
                <span className="pl-viagem-pc pesado" title="Pets com 10 kg ou mais"><span style={{ fontSize: 15 }}>🐕</span>10kg+ <b>{pesados}</b></span>
              </div>
              <div className="pl-viagem-split" title={`${leves} leves · ${pesados} pesados`}><i style={{ width: `${Math.round(leves / total * 100)}%` }} /></div>
            </>
          )}
        </div>
      </div>

      {/* pílulas */}
      <div className="flex flex-wrap items-center gap-[5px] mt-[9px]">
        {total > 0 && (
          <span className={`pl-viagem-pill ${pagos === total ? 'ok' : 'warn'}`}><DollarSign className="h-3 w-3" />{pagos}/{total}</span>
        )}
        {ind > 0 && <span className="pl-viagem-pill" style={{ background: '#10b981', color: '#fff' }}>{ind} IND</span>}
        {col > 0 && <span className="pl-viagem-pill" style={{ background: '#8b5cf6', color: '#fff' }}>{col} COL</span>}
        {total === 0 && <span className="text-[12px]" style={{ color: 'var(--surface-500)' }}>Viagem vazia — ⋮ → Adicionar pets</span>}
        {p.responsavel && (
          <span className="ml-auto flex items-center gap-[3px] text-[11px] font-semibold truncate max-w-[45%]" style={{ color: 'var(--surface-500)' }}>
            <User className="h-3 w-3 flex-none" />{p.responsavel.split(' ')[0]}
          </span>
        )}
      </div>
    </div>
  )
}
