import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'

// ============================================================================
// Limpeza do lixo de Storage (migration 147).
//
// Por que precisa de rota server-side: o bucket `tarefas` NÃO tem policy de DELETE para
// `authenticated` — foto-prova apagável não é prova. Só service_role apaga, e só depois de
// conferir que o objeto realmente perdeu o dono.
//
// 🔴 A CONFERÊNCIA NÃO É FORMALIDADE. Num rescaldo agrupado ×N, as N linhas de `tarefa_fotos`
// apontam para o MESMO path (1 foto vale pelo lote). Deletar uma das N enfileira esse path aqui
// enquanto as outras ainda o usam — apagar direto do bucket destruiria foto viva. Por isso todo
// path é reconferido contra `tarefa_fotos` na hora de apagar, não na hora de enfileirar.
// ============================================================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function verifySuperAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return null

  const token = authHeader.replace('Bearer ', '')
  const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token)
  if (!caller) return null

  const { data: perfis } = await supabaseAdmin
    .from('perfis')
    .select('role')
    .eq('user_id', caller.id)
    .eq('role', 'super_admin')
    .limit(1)

  if (!perfis || perfis.length === 0) return null
  return caller
}

type LinhaLixo = { id: string; bucket: string; path: string; motivo: string | null; registrado_em: string }

/** Separa o que pode ser apagado do que voltou a ter dono (o caso do lote ×N). */
async function classificar(pendentes: LinhaLixo[]) {
  const paths = [...new Set(pendentes.map(l => l.path))]
  const emUso = new Set<string>()

  if (paths.length > 0) {
    const { data } = await supabaseAdmin
      .from('tarefa_fotos')
      .select('path')
      .in('path', paths)
    for (const f of (data || []) as { path: string }[]) emUso.add(f.path)
  }

  return {
    apagaveis: pendentes.filter(l => !emUso.has(l.path)),
    aindaEmUso: pendentes.filter(l => emUso.has(l.path)),
  }
}

// GET: o que está pendente, e quanto disso é apagável de verdade.
export async function GET(request: NextRequest) {
  const caller = await verifySuperAdmin(request)
  if (!caller) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('storage_lixo')
    .select('id, bucket, path, motivo, registrado_em')
    .is('removido_em', null)
    .order('registrado_em', { ascending: true })
    .limit(1000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { apagaveis, aindaEmUso } = await classificar((data || []) as LinhaLixo[])
  return NextResponse.json({
    pendentes: (data || []).length,
    apagaveis: apagaveis.length,
    aindaEmUso: aindaEmUso.length,
    amostra: apagaveis.slice(0, 20),
  })
}

// POST: apaga do bucket o que perdeu o dono e marca a fila.
export async function POST(request: NextRequest) {
  const caller = await verifySuperAdmin(request)
  if (!caller) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('storage_lixo')
    .select('id, bucket, path, motivo, registrado_em')
    .is('removido_em', null)
    .order('registrado_em', { ascending: true })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const pendentes = (data || []) as LinhaLixo[]
  if (pendentes.length === 0) {
    return NextResponse.json({ apagados: 0, mantidos: 0, falhas: 0, mensagem: 'Nada a limpar.' })
  }

  const { apagaveis, aindaEmUso } = await classificar(pendentes)

  // Quem voltou a ter dono sai da fila com carimbo próprio: não foi apagado, e não adianta
  // reavaliar todo dia. (removido_em serve de "resolvido", o motivo diz como.)
  if (aindaEmUso.length > 0) {
    await supabaseAdmin
      .from('storage_lixo')
      .update({
        removido_em: new Date().toISOString(),
        motivo: 'mantido: o arquivo ainda pertence a outra tarefa do mesmo lote',
      })
      .in('id', aindaEmUso.map(l => l.id))
  }

  let apagados = 0
  const falhas: { path: string; erro: string }[] = []

  // Por bucket, em lotes — a API do Storage aceita várias chaves por chamada.
  const porBucket = new Map<string, LinhaLixo[]>()
  for (const l of apagaveis) {
    if (!porBucket.has(l.bucket)) porBucket.set(l.bucket, [])
    porBucket.get(l.bucket)!.push(l)
  }

  for (const [bucket, linhas] of porBucket) {
    for (let i = 0; i < linhas.length; i += 100) {
      const lote = linhas.slice(i, i + 100)
      const { error: delErr } = await supabaseAdmin.storage.from(bucket).remove(lote.map(l => l.path))
      if (delErr) {
        // Falhou o lote inteiro: a fila NÃO é marcada, então a próxima rodada tenta de novo.
        // Melhor repetir do que registrar como apagado algo que continua ocupando espaço.
        for (const l of lote) falhas.push({ path: l.path, erro: delErr.message })
        continue
      }
      await supabaseAdmin
        .from('storage_lixo')
        .update({ removido_em: new Date().toISOString() })
        .in('id', lote.map(l => l.id))
      apagados += lote.length
    }
  }

  return NextResponse.json({
    apagados,
    mantidos: aindaEmUso.length,
    falhas: falhas.length,
    detalheFalhas: falhas.slice(0, 10),
  })
}
