import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

let vapidConfigured = false

function ensureVapid() {
  if (vapidConfigured) return
  webpush.setVapidDetails(
    'mailto:contato@rippet.com.br',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
  vapidConfigured = true
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Validar secret do webhook
    const authHeader = request.headers.get('x-webhook-secret')
    if (authHeader !== process.env.WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await request.json()

    // Supabase Database Webhook payload format
    const { type, record, table } = payload

    if (type !== 'INSERT' || table !== 'fichas') {
      return NextResponse.json({ ignored: true })
    }

    const ficha = record
    if (!ficha) {
      return NextResponse.json({ error: 'No record' }, { status: 400 })
    }

    ensureVapid()
    const supabaseAdmin = getSupabaseAdmin()

    // Buscar subscriptions da unidade da ficha
    let query = supabaseAdmin.from('push_subscriptions').select('*')
    if (ficha.unidade_id) {
      query = query.eq('unidade_id', ficha.unidade_id)
    }

    const { data: subscriptions, error } = await query
    if (error || !subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ sent: 0 })
    }

    const notifPayload = JSON.stringify({
      title: '📋 Nova Ficha Recebida',
      body: `${ficha.nome_pet || 'Pet'} — ${ficha.nome_completo || 'Tutor'}`,
      url: '/fichas',
      icon: '/icon-192x192.png',
      badge: '/icon-96x96.png',
    })

    let sent = 0
    const expiredEndpoints: string[] = []

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
            },
            notifPayload
          )
          sent++
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode
          if (statusCode === 410 || statusCode === 404) {
            expiredEndpoints.push(sub.endpoint)
          }
        }
      })
    )

    if (expiredEndpoints.length > 0) {
      await supabaseAdmin
        .from('push_subscriptions')
        .delete()
        .in('endpoint', expiredEndpoints)
    }

    return NextResponse.json({ sent, cleaned: expiredEndpoints.length })
  } catch (err) {
    console.error('Webhook push error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
