/**
 * Dados do "gestor por item" do popup de pendências (Pelinho 2.8, Personalizados 2.10):
 * a tarefa de cada produto, se a concluída teve foto, os nomes de quem está com elas, quem pode
 * receber (unidade DO CONTRATO, `p_para:'tarefas'`) e quem está logado.
 *
 * Item 7 dos ajustes finos (09/10/2026: "demora 3, 4 segundos, dá até pra clicar"):
 *  - `carregando` verdadeiro até a 1ª leitura voltar — quem desenha NÃO mostra "Atribuir a…"
 *    antes de saber se o item já tem dono;
 *  - fotos e nomes vão JUNTOS depois das tarefas (antes era fila: tarefas → fotos → nomes);
 *  - nomes e atribuíveis vêm da memória da sessão (`lib/cache-pessoas.ts`);
 *  - a última leitura de cada conjunto de produtos fica em memória: reabrir mostra na hora e
 *    confere por trás. `preCarregarTarefas` deixa o popup de pendências esquentar isso antes.
 */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { listarFotosDasTarefas } from '@/lib/foto-tarefa'
import { carregarTarefasDosProdutos, type TarefaDoProduto } from '@/lib/tarefas-rescaldo'
import { atribuiveis, nomesDePerfis, nomesConhecidos, type Atribuivel as AtribuivelCache } from '@/lib/cache-pessoas'

export type Atribuivel = { user_id: string; nome: string | null }

type Leitura = { tarefas: Record<string, TarefaDoProduto>; comFoto: Record<string, boolean> }
const ultimas = new Map<string, Leitura>()
const chaveDe = (cpIds: string[]) => [...cpIds].sort().join(',')

async function ler(supabase: unknown, cpIds: string[]): Promise<Leitura> {
  const tarefas = await carregarTarefasDosProdutos(supabase as never, cpIds)
  const concluidas = Object.values(tarefas).filter(x => x.status === 'concluida').map(x => x.id)
  const [fotos] = await Promise.all([
    listarFotosDasTarefas(supabase as never, concluidas),
    nomesDePerfis(supabase, Object.values(tarefas).map(x => x.atribuido_a)),
  ])
  const leitura = { tarefas, comFoto: Object.fromEntries(concluidas.map(id => [id, (fotos[id] || []).length > 0])) }
  ultimas.set(chaveDe(cpIds), leitura)
  return leitura
}

/** Esquenta a leitura antes da tela do farol abrir (chamado ao abrir o popup de pendências). */
export function preCarregarTarefas(supabase: unknown, cpIds: string[], unidadeId: string | null) {
  if (cpIds.length > 0) void ler(supabase, cpIds).catch(() => {})
  if (unidadeId) void atribuiveis(supabase, unidadeId, 'tarefas')
}

export function useGestorTarefas(p: { cpIds: string[]; chave: string; temOperacional: boolean; unidadeId: string; atorNome: string }) {
  const supabase = createClient()
  const guardada = ultimas.get(chaveDe(p.cpIds))
  const [tarefas, setTarefas] = useState<Record<string, TarefaDoProduto>>(guardada?.tarefas || {})
  const [comFoto, setComFoto] = useState<Record<string, boolean>>(guardada?.comFoto || {})
  const [nomes, setNomes] = useState<Record<string, string>>(() => nomesConhecidos(Object.values(guardada?.tarefas || {}).map(x => x.atribuido_a)))
  const [pessoas, setPessoas] = useState<Atribuivel[]>([])
  const [carregando, setCarregando] = useState(p.temOperacional && !guardada)
  const [ator, setAtor] = useState<{ userId: string | null; nome: string }>({ userId: null, nome: p.atorNome })

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAtor({ userId: data.user?.id ?? null, nome: p.atorNome }))
  }, [supabase, p.atorNome])

  async function recarregar() {
    if (!p.temOperacional) { setCarregando(false); return }
    try {
      const l = await ler(supabase, p.cpIds)
      setTarefas(l.tarefas)
      setComFoto(l.comFoto)
      setNomes(prev => ({ ...prev, ...nomesConhecidos(Object.values(l.tarefas).map(x => x.atribuido_a)) }))
    } finally {
      setCarregando(false)
    }
  }

  // Recarrega quando muda o conjunto de produtos ou o "feito" de algum (`chave`).
  useEffect(() => { recarregar().catch(e => console.error('[useGestorTarefas]', e)) }, [p.chave, p.temOperacional]) // eslint-disable-line

  useEffect(() => {
    if (!p.temOperacional) return
    let vivo = true
    atribuiveis(supabase, p.unidadeId, 'tarefas').then((lista: AtribuivelCache[]) => { if (vivo) setPessoas(lista) })
    return () => { vivo = false }
  }, [supabase, p.temOperacional, p.unidadeId])

  return { supabase, tarefas, comFoto, nomes, pessoas, ator, recarregar, carregando }
}
