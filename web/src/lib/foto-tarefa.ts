// ============================================================================
// Foto-prova de tarefa: upload, leitura e configuração (migration 147).
//
// ⚠️ ORDEM IMPORTA NA CONCLUSÃO: sobe a foto ANTES do update de status. O trigger
// `tarefa_exige_foto_ao_concluir` recusa a conclusão quando o tipo exige foto e não há linha em
// `tarefa_fotos` — quem inverter a ordem toma erro de check_violation sem entender por quê.
//
// ⚠️ O UPLOAD SÓ ACONTECE NO SUBMIT, nunca ao escolher a foto na tela. Subir na hora da escolha
// deixaria arquivo pago no bucket toda vez que alguém abre o popup, tira foto e desiste — o
// "vários uploads de uma mesma tarefa" que a mig 147 existe pra impedir.
// ============================================================================

import type { createClient } from '@/lib/supabase/client'
import { pathDaFoto, type FotoComprimida } from '@/lib/comprimir-imagem'

type Supabase = ReturnType<typeof createClient>

export const BUCKET_TAREFAS = 'tarefas'

export type FotoDeTarefa = {
  id: string
  tarefa_id: string
  slot: number
  path: string
  bytes: number
  criado_por: string | null
  created_at: string
}

/** Quais tipos de tarefa exigem foto. Tipo ausente = NÃO exige (mesma regra do trigger). */
export type ExigeFotoPorTipo = Record<string, boolean>

export async function carregarExigeFoto(supabase: Supabase): Promise<ExigeFotoPorTipo> {
  const { data } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'tarefas_exige_foto')
    .maybeSingle() as { data: { valor: ExigeFotoPorTipo } | null }
  return data?.valor || {}
}

/**
 * Sobe a foto e registra a(s) linha(s). `upsert` no MESMO path (slot) — trocar a foto sobrescreve
 * o objeto, então não existe "apagar o anterior" que possa falhar e deixar lixo no bucket.
 *
 * ⚠️ RECEBE O LOTE INTEIRO, não uma tarefa. O rescaldo agrupa ×N (3 pelinhos do mesmo contrato =
 * 3 linhas em `tarefas_operacionais`, 1 card na tela) e a conclusão é um `update ... in (ids)`,
 * com o trigger `tarefa_exige_foto_ao_concluir` rodando UMA VEZ POR LINHA. Registrar a foto só na
 * primeira faria as outras N-1 serem recusadas por falta de foto. Então: **1 objeto no bucket**
 * (o path é o da primeira tarefa) e **N linhas** em `tarefa_fotos` apontando pra ele — o custo de
 * storage continua sendo de uma foto.
 *
 * 🔴 Consequência pra quem for escrever a limpeza de `storage_lixo`: o path é COMPARTILHADO pelo
 * lote. Deletar uma das N tarefas enfileira o path no lixo enquanto as outras ainda o usam —
 * a rotina TEM que conferir se sobrou alguma linha em `tarefa_fotos` com aquele path antes de
 * apagar do bucket, senão apaga foto viva.
 */
export async function enviarFotoTarefa(
  supabase: Supabase,
  tarefaIds: string[],
  foto: FotoComprimida,
  userId: string | null,
  slot = 1,
): Promise<{ path: string }> {
  if (tarefaIds.length === 0) throw new Error('Sem tarefa para anexar a foto')
  const path = pathDaFoto(tarefaIds[0], slot)

  const { error: upErr } = await supabase.storage
    .from(BUCKET_TAREFAS)
    .upload(path, foto.blob, { contentType: foto.mime, upsert: true })
  if (upErr) throw new Error('Não consegui enviar a foto: ' + upErr.message)

  // onConflict no índice único (tarefa_id, slot): reenviar atualiza a linha, nunca acumula.
  const { error: dbErr } = await supabase
    .from('tarefa_fotos')
    .upsert(tarefaIds.map(id => ({
      tarefa_id: id,
      slot,
      path,
      bytes: foto.bytes,
      largura: foto.largura,
      altura: foto.altura,
      mime: foto.mime,
      criado_por: userId,
    })) as never, { onConflict: 'tarefa_id,slot' })
  if (dbErr) throw new Error('Foto enviada, mas não consegui registrar: ' + dbErr.message)

  return { path }
}

export async function listarFotosDasTarefas(
  supabase: Supabase,
  tarefaIds: string[],
): Promise<Record<string, FotoDeTarefa[]>> {
  if (tarefaIds.length === 0) return {}
  const { data } = await supabase
    .from('tarefa_fotos')
    .select('id, tarefa_id, slot, path, bytes, criado_por, created_at')
    .in('tarefa_id', tarefaIds)
    .order('slot') as { data: FotoDeTarefa[] | null }

  const porTarefa: Record<string, FotoDeTarefa[]> = {}
  for (const f of data || []) {
    if (!porTarefa[f.tarefa_id]) porTarefa[f.tarefa_id] = []
    porTarefa[f.tarefa_id].push(f)
  }
  return porTarefa
}

/** O bucket é PRIVADO (foto de pet morto na casa do cliente): exibir exige URL assinada. */
export async function urlAssinadaFoto(supabase: Supabase, path: string, segundos = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET_TAREFAS).createSignedUrl(path, segundos)
  return data?.signedUrl || null
}
