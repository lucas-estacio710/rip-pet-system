'use client'

import { useState, useEffect, useCallback } from 'react'

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

  useEffect(() => {
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
    if (!userId || permission === 'unsupported') return false
    setLoading(true)

    try {
      const perm = await Notification.requestPermission()
      setPermission(perm as PermissionState)
      if (perm !== 'granted') {
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
          userId,
          unidadeId,
        }),
      })

      if (res.ok) {
        setIsSubscribed(true)
        setLoading(false)
        return true
      }
    } catch (err) {
      console.error('Erro ao ativar notificações:', err)
    }

    setLoading(false)
    return false
  }, [userId, unidadeId, permission])

  const unsubscribe = useCallback(async () => {
    if (!userId) return
    setLoading(true)

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
            userId,
          }),
        })
      }

      setIsSubscribed(false)
    } catch (err) {
      console.error('Erro ao desativar notificações:', err)
    }

    setLoading(false)
  }, [userId])

  return { permission, isSubscribed, loading, subscribe, unsubscribe }
}
