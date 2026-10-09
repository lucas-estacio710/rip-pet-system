'use client'

/**
 * Card "Em Acolhimento" do pipeline redesenhado — fase 2.15 (item 18 do celular e D7 do
 * desktop em docs/REDESENHO_CARDS_PIPELINE.md). Só com a chave obj_enc_pipeline.
 *
 * Mudança de diretriz (30/09): o card deixa de ser TRAVADO. Na prática o colaborador esquece
 * de finalizar o acolhimento e a unidade precisa seguir — então ele ganha pendências e Ações.
 * O que continua proibido (item 18): lacre (nem o "+ Lacre"), Bypass, entrar em viagem
 * (farol 🚐, "+ Adicionar pets", arrastar — e a trava no banco do 2.13a).
 *
 * CELULAR: tom leve IND/COL + borda tracejada; linha 1 com o selo "🕐 Em Acolhimento" no
 *   lugar da data (sem lacre); linha 2 igual ao Ativo; linha 3 📍 endereço de remoção em 2
 *   linhas + setinha que abre o trilho (resumo ✓⏱ + Ações, "📋 Pet Acolhido" primeiro).
 * DESKTOP (D7): no lugar da data, bloco roxo claro tracejado com ampulheta girando devagar e
 *   "acolhendo"; nome/tutor; 📍 endereço no meio; resumo ✓⏱; "Pet Acolhido" botão vidro.
 */
import { useState, type ReactNode } from 'react'
import { ChevronDown, ClipboardCheck, Hourglass, MapPin } from 'lucide-react'
import TopoCardPet from './TopoCardPet'
import TrilhoCardPet from './TrilhoCardPet'
import Destacado from './Destacado'
import ResumoPendencias from './ResumoPendencias'
import { pesoDoCard, especieDoCard, nomeDoCard } from '@/lib/card-pet'

type Props = {
  petNome: string | null
  petGenero: string | null
  individual: boolean
  especie: string | null
  peso: number | null
  tutorNome: string | null
  telefone: string | null
  raca: string | null
  cor: string | null
  endereco: { linha1: string; linha2: string } | null
  resumo: { feitos: number; pendentes: number } | null
  resumoAberto: boolean
  onResumo: () => void
  onPetAcolhido: () => void
  onAbrir: () => void
  rotuloAcolhido: string
  /** Mensagens (CHE / PG — item 5 dos ajustes finos): vêm DEPOIS do "Pet Acolhido". */
  mensagens?: ReactNode
  /** Termos da busca por texto pra marcar no nome do pet e do tutor (parte 5 da busca nova). */
  destaque?: string[]
}

function Endereco({ e }: { e: { linha1: string; linha2: string } | null }) {
  if (!e) return <span className="text-[12px] text-amber-600">⚠ Sem endereço de remoção</span>
  return (
    <span className="flex items-start gap-1.5 min-w-0">
      <MapPin className="h-4 w-4 flex-none mt-px" style={{ color: '#dc2626' }} />
      <span className="min-w-0 leading-tight">
        <span className="block text-[12.5px] font-bold truncate" style={{ color: 'var(--surface-800)' }}>{e.linha1 || '—'}</span>
        {e.linha2 && <span className="block text-[11.5px] truncate" style={{ color: 'var(--surface-500)' }}>{e.linha2}</span>}
      </span>
    </span>
  )
}

export default function CardAcolhimento(p: Props) {
  const [aberto, setAberto] = useState(false)
  const corTipo = p.individual ? '#10b981' : '#8b5cf6'
  const fundo = `linear-gradient(135deg, color-mix(in srgb, ${corTipo} 22%, transparent) 0%, color-mix(in srgb, ${corTipo} 8%, transparent) 60%, transparent 100%)`
  const peso = pesoDoCard(p.peso)
  const esp = especieDoCard(p.especie, p.peso)

  const botaoAcolhido = (
    <button type="button" onClick={e => { e.stopPropagation(); p.onPetAcolhido() }} title={p.rotuloAcolhido}
      className="pl-btn-acolhido">
      <ClipboardCheck className="h-4 w-4" />Pet Acolhido
    </button>
  )

  return (
    <div role="button" tabIndex={0} onClick={p.onAbrir}
      onKeyDown={e => { if (e.key === 'Enter') p.onAbrir() }}
      className="rounded-lg border-2 border-dashed p-1.5 cursor-pointer"
      style={{ background: fundo, borderColor: corTipo }}>

      {/* CELULAR e TABLET (item 18; P-17) */}
      <div className="lg:hidden space-y-1">
        <TopoCardPet
          dataAcolhimento={null}
          lacre={null}
          seloNoLugarDaData={
            <span className="flex-none h-6 px-1.5 rounded-md flex items-center gap-1 text-[10.5px] font-bold whitespace-nowrap"
              style={{ background: 'rgba(139,92,246,.18)', color: '#7c3aed', border: '1px dashed #8b5cf6' }}>
              🕐 Em Acolhimento
            </span>
          }
          petNome={p.petNome} petGenero={p.petGenero} individual={p.individual} especie={p.especie} peso={p.peso}
          tutorNome={p.tutorNome} telefone={p.telefone} raca={p.raca} cor={p.cor}
          destaque={p.destaque}
        />
        <button type="button" onClick={e => { e.stopPropagation(); setAberto(a => !a) }} aria-expanded={aberto}
          className="w-full flex items-center gap-1.5 text-left pt-0.5">
          <span className="flex-1 min-w-0"><Endereco e={p.endereco} /></span>
          <ChevronDown className={`h-5 w-5 flex-none transition-transform ${aberto ? 'rotate-180' : ''}`} style={{ color: 'var(--surface-400)' }} />
        </button>
        {aberto && (
          <TrilhoCardPet resumo={p.resumo} resumoAberto={p.resumoAberto} onResumo={p.onResumo}
            acoes={[
              <span key="acolhido" onClick={e => e.stopPropagation()}>{botaoAcolhido}</span>,
              ...(p.mensagens ? [<span key="msg" className="flex items-center gap-1" onClick={e => e.stopPropagation()}>{p.mensagens}</span>] : []),
            ]} />
        )}
      </div>

      {/* DESKTOP (D7) */}
      <div className="hidden lg:flex items-center gap-3">
        <span className="pl-acolhendo flex-none">
          <Hourglass className="h-4 w-4 pl-ampulheta" />
          <span className="text-[10px] font-bold">acolhendo</span>
        </span>
        <span className="pl-chip flex-none h-7 px-1.5 rounded-md flex items-center gap-1 whitespace-nowrap">
          <span style={{ fontSize: 16 }}>{esp.emoji}</span>
          {peso && <span className="text-[12px] font-bold tabular-nums" style={{ color: esp.cor }}>{peso}</span>}
        </span>
        <span className="min-w-0 w-[230px] flex-none leading-tight">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="truncate text-[14px] font-bold" style={{ color: p.petGenero === 'macho' ? '#1d4ed8' : '#db2777' }}><Destacado texto={nomeDoCard(p.petNome)} termos={p.destaque} /></span>
            <span className="flex-none text-[10px] font-bold px-1.5 py-0.5 rounded text-white" style={{ background: corTipo }}>{p.individual ? 'IND' : 'COL'}</span>
          </span>
          <span className="block truncate text-[12px]" style={{ color: 'var(--surface-500)' }}><Destacado texto={nomeDoCard(p.tutorNome)} termos={p.destaque} /></span>
        </span>
        <span className="flex-1 min-w-0"><Endereco e={p.endereco} /></span>
        {p.resumo && (
          <ResumoPendencias feitos={p.resumo.feitos} pendentes={p.resumo.pendentes} onClick={p.onResumo} />
        )}
        {botaoAcolhido}
        {p.mensagens && <div className="flex-none flex items-center gap-1.5" onClick={e => e.stopPropagation()}>{p.mensagens}</div>}
      </div>
    </div>
  )
}
