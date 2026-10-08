/**
 * Dados do "gestor por item" do popup de pendências (Pelinho 2.8, Personalizados 2.10):
 * a tarefa de cada produto, se a concluída teve foto, os nomes de quem está com elas, quem pode
 * receber (unidade DO CONTRATO, `p_para:'tarefas'`) e quem está logado.
 *
 * Nomes de outras pessoas só por RPC (`resolver_nomes_perfis`) — `perfis` só deixa ler o
 * próprio perfil. Quem recebe vem de `listar_atribuiveis_operacional` com `p_para` obrigatório.
 */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { listarFotosDasTarefas } from '@/lib/foto-tarefa'
import { carregarTarefasDosProdutos, type TarefaDoProduto } from '@/lib/tarefas-rescaldo'

export type Atribuivel = { user_id: string; nome: string | null }

export function useGestorTarefas(p: { cpIds: string[]; chave: string; temOperacional: boolean; unidadeId: string; atorNome: string }) {
  const supabase = createClient()
  const [tarefas, setTarefas] = useState<Record<string, TarefaDoProduto>>({})
  const [comFoto, setComFoto] = useState<Record<string, boolean>>({})
  const [nomes, setNomes] = useState<Record<string, string>>({})
  const [pessoas, setPessoas] = useState<Atribuivel[]>([])
  const [ator, setAtor] = useState<{ userId: string | null; nome: string }>({ userId: null, nome: p.atorNome })

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAtor({ userId: data.user?.id ?? null, nome: p.atorNome }))
  }, [supabase, p.atorNome])

  async function recarregar() {
    if (!p.temOperacional) return
    const t = await carregarTarefasDosProdutos(supabase, p.cpIds)
    setTarefas(t)
    const concluidas = Object.values(t).filter(x => x.status === 'concluida').map(x => x.id)
    const fotos = await listarFotosDasTarefas(supabase, concluidas)
    setComFoto(Object.fromEntries(concluidas.map(id => [id, (fotos[id] || []).length > 0])))
    const userIds = Array.from(new Set(Object.values(t).map(x => x.atribuido_a)))
    if (userIds.length > 0) {
      const { data } = await supabase.rpc('resolver_nomes_perfis' as never, { p_user_ids: userIds } as never) as { data: { user_id: string; nome: string | null }[] | null }
      setNomes(prev => ({ ...prev, ...Object.fromEntries((data || []).map(r => [r.user_id, r.nome || 'Sem nome'])) }))
    }
  }

  // Recarrega quando muda o conjunto de produtos ou o "feito" de algum (`chave`).
  useEffect(() => { recarregar().catch(e => console.error('[useGestorTarefas]', e)) }, [p.chave, p.temOperacional]) // eslint-disable-line

  useEffect(() => {
    if (!p.temOperacional) return
    supabase.rpc('listar_atribuiveis_operacional' as never, { p_unidade_id: p.unidadeId, p_para: 'tarefas' } as never)
      .then(({ data }: { data: Atribuivel[] | null }) => setPessoas(data || []))
  }, [supabase, p.temOperacional, p.unidadeId])

  return { supabase, tarefas, comFoto, nomes, pessoas, ator, recarregar }
}
