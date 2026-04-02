import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { subscription, userId, unidadeId } = await request.json()

    if (!subscription?.endpoint || !subscription?.keys || !userId) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        endpoint: subscription.endpoint,
        keys_p256dh: subscription.keys.p256dh,
        keys_auth: subscription.keys.auth,
        unidade_id: unidadeId || null,
      }, { onConflict: 'user_id,endpoint' })

    if (error) {
      console.error('Erro ao salvar subscription:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Erro push subscribe:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { endpoint, userId } = await request.json()

    if (!endpoint || !userId) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
    }

    await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Erro push unsubscribe:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
