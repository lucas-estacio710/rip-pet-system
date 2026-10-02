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
    const { title, body, url, unidadeId, userId, userIds, gestaoDaUnidadeId, excetoUserId } = await request.json()

    if (!title || !body) {
      return NextResponse.json({ error: 'title e body obrigatórios' }, { status: 400 })
    }

    // gestaoDaUnidadeId — gerente+concierge ATIVOS da unidade (ex: tarefa concluída). Resolvido
    // AQUI, com service_role, porque a RPC `listar_atribuiveis_operacional` recusa quem é
    // Operacional (mig 145) — e é justamente o Operacional quem mais conclui tarefa: o aviso
    // saía mudo. `excetoUserId` tira quem concluiu.
    let destinatariosGestao: string[] | null = null
    if (gestaoDaUnidadeId) {
      const { data: perfis, error: perfisError } = await supabaseAdmin
        .from('perfis')
        .select('user_id')
        .eq('unidade_id', gestaoDaUnidadeId)
        .in('role', ['gerente', 'operador'])
        .eq('ativo', true)
      if (perfisError) {
        console.error('Erro ao buscar gestão da unidade:', perfisError)
        return NextResponse.json({ error: perfisError.message }, { status: 500 })
      }
      destinatariosGestao = Array.from(new Set((perfis || []).map(p => p.user_id as string)))
        .filter(id => id && id !== excetoUserId)
      if (destinatariosGestao.length === 0) return NextResponse.json({ sent: 0 })
    }

    // Buscar subscriptions: de um usuário específico (userId — ex: atribuição de tarefa),
    // de uma lista de usuários (userIds), da gestão de uma unidade (gestaoDaUnidadeId, acima),
    // da unidade inteira (unidadeId — broadcast), ou todas se nenhum filtro vier.
    let query = supabaseAdmin.from('push_subscriptions').select('*')
    if (userId) {
      query = query.eq('user_id', userId)
    } else if (destinatariosGestao) {
      query = query.in('user_id', destinatariosGestao)
    } else if (Array.isArray(userIds) && userIds.length > 0) {
      query = query.in('user_id', userIds)
    } else if (unidadeId) {
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
