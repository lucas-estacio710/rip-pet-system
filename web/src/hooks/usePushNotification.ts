'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export function usePushNotification(userId: string | null, unidadeId: string | null) {
  const [permission, setPermission] = useState<PermissionState>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Refs para ter valor atualizado dentro do callback
  const userIdRef = useRef(userId)
  const unidadeIdRef = useRef(unidadeId)
  useEffect(() => { userIdRef.current = userId }, [userId])
  useEffect(() => { unidadeIdRef.current = unidadeId }, [unidadeId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPermission('unsupported')
      return
    }
    setPermission(Notification.permission as PermissionState)

    // Check if already subscribed
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub)
      })
    })
  }, [])

  const subscribe = useCallback(async () => {
    const uid = userIdRef.current
    if (!uid) {
      setError('Usuário não identificado. Recarregue a página.')
      return false
    }
    if (permission === 'unsupported') {
      setError('Seu navegador não suporta notificações.')
      return false
    }
    if (!VAPID_PUBLIC_KEY) {
      setError('Chave de notificação não configurada.')
      return false
    }

    setLoading(true)
    setError(null)

    try {
      const perm = await Notification.requestPermission()
      setPermission(perm as PermissionState)
      if (perm !== 'granted') {
        setError('Permissão de notificação negada. Verifique as configurações do navegador.')
        setLoading(false)
        return false
      }

      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        })
      }

      // Save to backend
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          userId: uid,
          unidadeId: unidadeIdRef.current,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Erro ${res.status}`)
      }

      setIsSubscribed(true)
      setLoading(false)
      return true
    } catch (err) {
      console.error('Erro ao ativar notificações:', err)
      setError(err instanceof Error ? err.message : 'Erro ao ativar notificações')
      setLoading(false)
      return false
    }
  }, [permission])

  const unsubscribe = useCallback(async () => {
    const uid = userIdRef.current
    if (!uid) return
    setLoading(true)
    setError(null)

    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()

      if (sub) {
        await sub.unsubscribe()

        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: sub.endpoint,
            userId: uid,
          }),
        })
      }

      setIsSubscribed(false)
    } catch (err) {
      console.error('Erro ao desativar notificações:', err)
      setError(err instanceof Error ? err.message : 'Erro ao desativar')
    }

    setLoading(false)
  }, [])

  return { permission, isSubscribed, loading, error, subscribe, unsubscribe }
}
