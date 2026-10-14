'use client'

// COR DA CONTA (mig 163, 14/10/2026, pedido do Lucas): cada conta/cartão pode ter uma
// cor, e ela aparece em TODO lugar onde a conta aparece — inclusive nas droplists.
// A lista nativa do navegador não pinta fundo de <option>, então a paleta é FECHADA
// e cada cor tem um emoji: na droplist vai o emoji, no resto vai a cor de verdade.
//
// Uso: const cores = useCoresContas()  →  rotuloConta(cores, id, nome)  (texto com emoji)
//                                          estiloConta(cores.get(id))   (faixa colorida)

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export const CORES_CONTA = {
  roxo:     { emoji: '🟣', hex: '#8b5cf6', nome: 'Roxo' },
  azul:     { emoji: '🔵', hex: '#3b82f6', nome: 'Azul' },
  verde:    { emoji: '🟢', hex: '#10b981', nome: 'Verde' },
  amarelo:  { emoji: '🟡', hex: '#eab308', nome: 'Amarelo' },
  laranja:  { emoji: '🟠', hex: '#f97316', nome: 'Laranja' },
  vermelho: { emoji: '🔴', hex: '#ef4444', nome: 'Vermelho' },
  marrom:   { emoji: '🟤', hex: '#a16207', nome: 'Marrom' },
  preto:    { emoji: '⚫', hex: '#64748b', nome: 'Preto' },
  branco:   { emoji: '⚪', hex: '#e2e8f0', nome: 'Branco' },
} as const
export type CorConta = keyof typeof CORES_CONTA
export const ehCorConta = (c: unknown): c is CorConta => typeof c === 'string' && c in CORES_CONTA

// Uma carga por aba aberta; quem muda a cor (Configurações) avisa e todos recarregam.
const EVENTO = 'cores-contas:mudou'
let cache: Map<string, CorConta> | null = null
let pedido: Promise<Map<string, CorConta>> | null = null
async function carregarCores(): Promise<Map<string, CorConta>> {
  const sb = createClient()
  // Sem a mig 163 a coluna não existe: volta vazio e nada muda na tela.
  const { data, error } = await sb.from('contas').select('id, cor').not('cor', 'is', null)
  const m = new Map<string, CorConta>()
  if (!error) for (const r of (data as { id: string; cor: string | null }[] | null) || []) if (ehCorConta(r.cor)) m.set(r.id, r.cor)
  cache = m
  return m
}
export function avisarCoresMudaram() {
  cache = null; pedido = null
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO))
}

export function useCoresContas(): Map<string, CorConta> {
  const [cores, setCores] = useState<Map<string, CorConta>>(cache || new Map())
  useEffect(() => {
    let vivo = true
    const puxa = () => {
      if (cache) { setCores(cache); return }
      pedido = pedido || carregarCores()
      void pedido.then(m => { if (vivo) setCores(m) })
    }
    puxa()
    window.addEventListener(EVENTO, puxa)
    return () => { vivo = false; window.removeEventListener(EVENTO, puxa) }
  }, [])
  return cores
}

/** O nome com o emoji da cor — pra droplist e texto corrido. */
export const rotuloConta = (cores: Map<string, CorConta>, id: string | null | undefined, nome: string) => {
  const c = id ? cores.get(id) : undefined
  return c ? `${CORES_CONTA[c].emoji} ${nome}` : nome
}
/** Faixa à esquerda + fundo suave — pra cartão e linha. */
export const estiloConta = (cor: CorConta | undefined, fundo = true): React.CSSProperties =>
  cor ? { borderLeft: `4px solid ${CORES_CONTA[cor].hex}`, ...(fundo ? { background: `${CORES_CONTA[cor].hex}14` } : {}) } : {}
