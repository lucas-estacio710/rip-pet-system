import { createAdminClient } from '@/lib/supabase/admin'
import { getParceiroSessao, respostaSessaoInvalida, SessaoInvalida } from '@/lib/sessao'

/**
 * Materiais de apoio ao luto (decisão #25) — o que a clínica entrega ao tutor.
 *
 * Bucket é privado, então cada arquivo sai como signed URL de vida curta. Isso evita
 * que um link vaze e vire download público de material de marca.
 */
export async function GET() {
  let sessao
  try {
    sessao = await getParceiroSessao()
  } catch (e) {
    if (e instanceof SessaoInvalida) return respostaSessaoInvalida(e)
    throw e
  }

  if (!sessao.config.materiais_ativos) return Response.json({ ativo: false, materiais: [] })

  const admin = createAdminClient()
  const { data } = await admin
    .from('parceiro_materiais')
    .select('id, titulo, descricao, arquivo_url, capa_url, ordem')
    .or(`unidade_id.eq.${sessao.unidadeId},unidade_id.is.null`)
    .eq('ativo', true)
    .order('ordem')

  const materiais = await Promise.all(
    (data ?? []).map(async (m) => {
      const { data: signed } = await admin.storage
        .from('parceiros')
        .createSignedUrl(m.arquivo_url, 60 * 30)
      const capa = m.capa_url
        ? (await admin.storage.from('parceiros').createSignedUrl(m.capa_url, 60 * 30)).data?.signedUrl
        : null
      return {
        id: m.id,
        titulo: m.titulo,
        descricao: m.descricao,
        url: signed?.signedUrl ?? null,
        capa: capa ?? null,
      }
    })
  )

  return Response.json({ ativo: true, materiais: materiais.filter((m) => m.url) })
}
