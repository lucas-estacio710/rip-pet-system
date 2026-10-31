'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Visão "Ícones" do placar de pendências (10/10/2026): preferência de quem olha, guardada no
 * aparelho. UMA chave pro pipeline e pro detalhe do contrato (31/10/2026) — trocou num, troca no
 * outro (inclusive em outra aba, pelo evento `storage`). No servidor é sempre "números".
 */
const CHAVE = 'pipeline.pendencias.icones'
const ouvintes = new Set<() => void>()
// Sem localStorage (aba anônima, bloqueado), a escolha vale enquanto a página estiver aberta.
let memoria: boolean | null = null

function assinar(avisar: () => void) {
  ouvintes.add(avisar)
  window.addEventListener('storage', avisar)
  return () => { ouvintes.delete(avisar); window.removeEventListener('storage', avisar) }
}

function ler(): boolean {
  try { return localStorage.getItem(CHAVE) === '1' } catch { return memoria ?? false }
}

export function usePendenciasIcones(): [boolean, (v: boolean) => void] {
  const icones = useSyncExternalStore(assinar, ler, () => false)
  const trocar = useCallback((v: boolean) => {
    memoria = v
    try { localStorage.setItem(CHAVE, v ? '1' : '0') } catch {}
    ouvintes.forEach(f => f())
  }, [])
  return [icones, trocar]
}
