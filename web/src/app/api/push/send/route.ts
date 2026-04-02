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
    ensureVapid()
    const supabaseAdmin = getSupabaseAdmin()
    const { title, body, url, unidadeId } = await request.json()

    if (!title || !body) {
      return NextResponse.json({ error: 'title e body obrigatórios' }, { status: 400 })
    }

    // Buscar subscriptions da unidade (ou todas se não especificado)
    let query = supabaseAdmin.from('push_subscriptions').select('*')
    if (unidadeId) {
      query = query.eq('unidade_id', unidadeId)
    }

    const { data: subscriptions, error } = await query
    if (error) {
      console.error('Erro ao buscar subscriptions:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ sent: 0 })
    }

    const payload = JSON.stringify({
      title,
      body,
      url: url || '/fichas',
      icon: '/icon-192x192.png',
      badge: '/icon-96x96.png',
    })

    let sent = 0
    let failed = 0
    const expiredEndpoints: string[] = []

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
            },
            payload
          )
          sent++
        } catch (err: unknown) {
          failed++
          // 410 Gone or 404 = subscription expired, remove it
          const statusCode = (err as { statusCode?: number })?.statusCode
          if (statusCode === 410 || statusCode === 404) {
            expiredEndpoints.push(sub.endpoint)
          }
        }
      })
    )

    // Cleanup expired subscriptions
    if (expiredEndpoints.length > 0) {
      await supabaseAdmin
        .from('push_subscriptions')
        .delete()
        .in('endpoint', expiredEndpoints)
    }

    return NextResponse.json({ sent, failed, cleaned: expiredEndpoints.length })
  } catch (err) {
    console.error('Erro push send:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
