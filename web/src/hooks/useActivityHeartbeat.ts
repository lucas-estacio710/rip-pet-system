'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'

const PING_INTERVAL_MS = 60_000 // 60s

function detectDevice(): string {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  if (/ipad|tablet/.test(ua)) return 'tablet'
  if (/mobile|android|iphone/.test(ua)) return 'mobile'
  return 'desktop'
}

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

export function useActivityHeartbeat() {
  const supabase = createClient()
  const { currentUnit } = useUnit()
  const unitIdRef = useRef<string | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const userIdRef = useRef<string | null>(null)
  const startedRef = useRef(false)

  // Mantém ref atualizada pra ping usar o valor mais recente
  useEffect(() => { unitIdRef.current = currentUnit?.id ?? null }, [currentUnit?.id])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    let cancelled = false
    let intervalId: number | undefined

    async function start() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return

      const sid = newSessionId()
      sessionIdRef.current = sid
      userIdRef.current = user.id

      const nowIso = new Date().toISOString()
      await supabase.from('user_activity_pings').insert({
        user_id: user.id,
        unidade_id: unitIdRef.current,
        session_id: sid,
        opened_at: nowIso,
        last_ping_at: nowIso,
        page: typeof window !== 'undefined' ? window.location.pathname : null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 250) : null,
        device_type: detectDevice(),
      } as never)

      const ping = async () => {
        if (typeof document !== 'undefined' && document.hidden) return
        if (!userIdRef.current || !sessionIdRef.current) return
        await supabase.from('user_activity_pings')
          .update({
            last_ping_at: new Date().toISOString(),
            page: typeof window !== 'undefined' ? window.location.pathname : null,
            unidade_id: unitIdRef.current,
          } as never)
          .eq('user_id', userIdRef.current)
          .eq('session_id', sessionIdRef.current)
      }

      intervalId = window.setInterval(ping, PING_INTERVAL_MS)

      const onVisibility = () => { if (!document.hidden) ping() }
      document.addEventListener('visibilitychange', onVisibility)
      window.addEventListener('focus', ping)
    }

    start()

    return () => {
      cancelled = true
      if (intervalId) window.clearInterval(intervalId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
