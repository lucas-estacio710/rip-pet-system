'use client'

/**
 * 🫙 Pelinho — 2º nível do popup de pendências com GESTÃO DE TAREFAS (fase 2.8 do
 * docs/PLAYBOOK_REDESENHO_PIPELINE.md; item 24, molde do item 27).
 *
 * - "Tem pelinho? Não | Sim". Não apaga as linhas do produto 0004 (a tarefa cai junto pelo
 *   CASCADE) — e RECUSA se algum já foi feito: a foto-prova iria pro storage_lixo calada.
 * - Quantidade − N + (1–5): o "−" tira primeiro um pelinho SEM DONO e sem feito; se não houver,
 *   avisa em vez de apagar trabalho de alguém.
 * - Por pelinho (só com `cb_operacional` da unidade DO CONTRATO): "Atribuir a… ▾" (seletor nativo
 *   do celular) · 👤− + "Juliana - 4h" · ✓ Concluir com Foto de Conclusão (sem foto só gerente/SA,
 *   P-07) · feito = "✓ Fulano · dd/mm" + 📷. ⚡ "Atribuir os N pendentes" com 2+ sem dono.
 *   Sem o módulo: o ○/✓ de sempre, direto no produto.
 * - ⚠️ OBS por item (P-12) entra com a migration `contrato_produtos_observacao` (2.10).
 * - Estoque: pelinho (0004) não baixa estoque em lugar nenhum hoje (nem na criação do contrato);
 *   esta tela segue igual pra não criar um 3º comportamento.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Minus, Plus, UserMinus, Check, Camera, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import FotoProva from '@/components/tarefas/FotoProva'
import type { FotoComprimida } from '@/lib/comprimir-imagem'
import { listarFotosDasTarefas } from '@/lib/foto-tarefa'
import { formatarIdade } from '@/lib/atribuir-tarefa'
import {
  carregarTarefasDosProdutos, atribuirProdutos, desatribuirProduto, concluirProduto,
  type TarefaDoProduto,
} from '@/lib/tarefas-rescaldo'

type Linha = { id: string; feito: boolean }

type Props = {
  contratoId: string
  unidadeId: string
  petNome: string
  linhas: Linha[]
  /** `cb_operacional` da unidade DO CONTRATO. */
  temOperacional: boolean
  /** Gerente/SA: conclui sem foto (trigger da mig 147). */
  podeConcluirSemFoto: boolean
  /** `configuracoes.tarefas_exige_foto.pelinho`. */
  exigeFoto: boolean
  atorNome: string
  /** Recarrega as linhas de pelinho do contrato na lista. */
  onMudou: () => Promise<void>
}

type Atribuivel = { user_id: string; nome: string | null }

function corIdade(horas: number): string {
  return horas > 48 ? '#dc2626' : horas > 24 ? '#d97706' : '#2563eb'
}

function SeletorPessoa({ pessoas, onEscolher, children, disabled }: { pessoas: Atribuivel[]; onEscolher: (id: string) => void; children: React.ReactNode; disabled?: boolean }) {
  // <select> nativo transparente por cima do botão (item 27): abre o picker do próprio celular.
  // font-size 16px pro iOS não dar zoom ao focar.
  return (
    <span className="relative inline-flex">
      {children}
      <select
        aria-label="Atribuir a"
        disabled={disabled}
        value=""
        onChange={e => { if (e.target.value) onEscolher(e.target.value) }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        style={{ fontSize: 16 }}
      >
        <option value="">Atribuir a…</option>
        {pessoas.map(p => <option key={p.user_id} value={p.user_id}>{p.nome || 'Sem nome'}</option>)}
      </select>
    </span>
  )
}

export default function PelinhoTela(p: Props) {
  const supabase = createClient()
  const [tarefas, setTarefas] = useState<Record<string, TarefaDoProduto>>({})
  const [comFoto, setComFoto] = useState<Record<string, boolean>>({})
  const [nomes, setNomes] = useState<Record<string, string>>({})
  const [pessoas, setPessoas] = useState<Atribuivel[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [concluindo, setConcluindo] = useState<string | null>(null)
  const [foto, setFoto] = useState<FotoComprimida | null>(null)
  const [anotacao, setAnotacao] = useState('')
  const [ator, setAtor] = useState<{ userId: string | null; nome: string }>({ userId: null, nome: p.atorNome })

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAtor({ userId: data.user?.id ?? null, nome: p.atorNome }))
  }, [supabase, p.atorNome])

  const chave = p.linhas.map(l => `${l.id}:${l.feito ? 1 : 0}`).join(',')
  const recarregarTarefas = useCallback(async () => {
    if (!p.temOperacional) return
    const ids = p.linhas.map(l => l.id)
    const t = await carregarTarefasDosProdutos(supabase, ids)
    setTarefas(t)
    const concluidas = Object.values(t).filter(x => x.status === 'concluida').map(x => x.id)
    const fotos = await listarFotosDasTarefas(supabase, concluidas)
    setComFoto(Object.fromEntries(concluidas.map(id => [id, (fotos[id] || []).length > 0])))
    const userIds = Array.from(new Set(Object.values(t).map(x => x.atribuido_a)))
    if (userIds.length > 0) {
      const { data } = await supabase.rpc('resolver_nomes_perfis' as never, { p_user_ids: userIds } as never) as { data: { user_id: string; nome: string | null }[] | null }
      setNomes(prev => ({ ...prev, ...Object.fromEntries((data || []).map(r => [r.user_id, r.nome || 'Sem nome'])) }))
    }
  }, [supabase, p.temOperacional, chave]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { recarregarTarefas().catch(e => console.error('[PelinhoTela] tarefas:', e)) }, [recarregarTarefas])

  useEffect(() => {
    if (!p.temOperacional) return
    supabase.rpc('listar_atribuiveis_operacional' as never, { p_unidade_id: p.unidadeId, p_para: 'tarefas' } as never)
      .then(({ data }: { data: Atribuivel[] | null }) => setPessoas(data || []))
  }, [supabase, p.temOperacional, p.unidadeId])

  const ctx = useMemo(() => ({ tipo: 'pelinho' as const, unidadeId: p.unidadeId, contratoId: p.contratoId, petNome: p.petNome, ator }), [p.unidadeId, p.contratoId, p.petNome, ator])

  async function agir(fn: () => Promise<void>) {
    if (ocupado) return
    setOcupado(true)
    try {
      await fn()
      await p.onMudou()
      await recarregarTarefas()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro')
    } finally {
      setOcupado(false)
    }
  }

  const feitos = p.linhas.filter(l => l.feito).length
  const semDono = p.linhas.filter(l => !l.feito && !tarefas[l.id])

  async function inserirPelinhos(n: number) {
    const { data: prod, error } = await supabase.from('produtos').select('id, preco').eq('codigo', '0004').single() as { data: { id: string; preco: number | null } | null; error: { message: string } | null }
    if (error || !prod) throw new Error('Produto pelinho (0004) não encontrado no cadastro.')
    const rows = Array.from({ length: n }, () => ({
      contrato_id: p.contratoId, produto_id: prod.id, quantidade: 1, valor: prod.preco || 0,
      separado: false, is_reserva_pv: false, rescaldo_feito: false,
    }))
    const { error: errIns } = await supabase.from('contrato_produtos').insert(rows as never)
    if (errIns) throw new Error(errIns.message)
  }

  function responderNao() {
    if (p.linhas.length === 0) return
    if (feitos > 0) {
      alert(`${feitos} pelinho${feitos > 1 ? 's já foram feitos' : ' já foi feito'} — não dá pra marcar "Não" sem perder a foto-prova. Desfaça a conclusão no /tarefas antes.`)
      return
    }
    if (!confirm(`Tirar ${p.linhas.length === 1 ? 'o pelinho' : `os ${p.linhas.length} pelinhos`} do contrato?`)) return
    agir(async () => {
      const { error } = await supabase.from('contrato_produtos').delete().in('id', p.linhas.map(l => l.id))
      if (error) throw new Error(error.message)
    })
  }

  function menos() {
    if (p.linhas.length <= 1) return
    const alvo = semDono[semDono.length - 1]
    if (!alvo) {
      alert('Todos os pelinhos têm alguém com a tarefa ou já foram feitos. Desatribua um antes de diminuir.')
      return
    }
    agir(async () => {
      const { error } = await supabase.from('contrato_produtos').delete().eq('id', alvo.id)
      if (error) throw new Error(error.message)
    })
  }

  function atribuir(cpIds: string[], userId: string) {
    const nome = pessoas.find(x => x.user_id === userId)?.nome || 'alguém'
    agir(() => atribuirProdutos(supabase, { ...ctx, cpIds, atribuidoA: userId, nomeAtribuido: nome }))
  }

  function abrirConclusao(cpId: string) {
    setConcluindo(cpId); setFoto(null); setAnotacao('')
  }

  function concluir(cpId: string) {
    const t = tarefas[cpId]
    agir(async () => {
      await concluirProduto(supabase, {
        ...ctx, cpId,
        tarefaPendenteId: t && t.status === 'pendente' ? t.id : null,
        foto, anotacao: anotacao.trim() || null,
      })
      setConcluindo(null)
    })
  }

  function alternarSemOperacional(l: Linha) {
    agir(async () => {
      const { error } = await supabase.from('contrato_produtos').update({ rescaldo_feito: !l.feito } as never).eq('id', l.id)
      if (error) throw new Error(error.message)
    })
  }

  const fotoObrigatoria = p.exigeFoto && !p.podeConcluirSemFoto
  const tem = p.linhas.length > 0
  // Feitos descem pro fim (item 27).
  const ordenadas = [...p.linhas].sort((a, b) => Number(a.feito) - Number(b.feito))

  return (
    <div className="space-y-3">
      {/* Tem pelinho? Não | Sim */}
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-semibold flex-1" style={{ color: 'var(--surface-800)' }}>Tem pelinho?</span>
        <div className="inline-flex rounded-lg p-0.5" style={{ background: 'var(--surface-100)' }}>
          <button type="button" disabled={ocupado} onClick={responderNao}
            className="px-4 h-8 rounded-md text-[13px] font-bold"
            style={!tem ? { background: '#64748b', color: '#fff' } : { color: 'var(--surface-500)' }}>Não</button>
          <button type="button" disabled={ocupado} onClick={() => { if (!tem) agir(() => inserirPelinhos(1)) }}
            className="px-4 h-8 rounded-md text-[13px] font-bold"
            style={tem ? { background: '#10b981', color: '#fff' } : { color: 'var(--surface-500)' }}>Sim</button>
        </div>
      </div>

      {tem && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[13px] flex-1" style={{ color: 'var(--surface-500)' }}>Quantidade</span>
            <button type="button" onClick={menos} disabled={ocupado || p.linhas.length <= 1}
              className="w-8 h-8 rounded-lg border flex items-center justify-center disabled:opacity-30" style={{ borderColor: 'var(--surface-300)' }} aria-label="Menos um">
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-6 text-center text-[17px] font-black tabular-nums" style={{ color: 'var(--surface-800)' }}>{p.linhas.length}</span>
            <button type="button" onClick={() => agir(() => inserirPelinhos(1))} disabled={ocupado || p.linhas.length >= 5}
              className="w-8 h-8 rounded-lg border flex items-center justify-center disabled:opacity-30" style={{ borderColor: 'var(--surface-300)' }} aria-label="Mais um">
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {p.temOperacional && semDono.length >= 2 && (
            <SeletorPessoa pessoas={pessoas} disabled={ocupado} onEscolher={id => atribuir(semDono.map(l => l.id), id)}>
              <span className="w-full inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-bold" style={{ background: 'rgba(124,58,237,.12)', color: '#7c3aed', border: '1px dashed #7c3aed' }}>
                ⚡ Atribuir os {semDono.length} pendentes a… ▾
              </span>
            </SeletorPessoa>
          )}

          <div className="space-y-1.5">
            {ordenadas.map((l, i) => {
              const t = tarefas[l.id]
              const pendente = t && t.status === 'pendente'
              const horas = pendente ? (Date.now() - new Date(t.atribuido_em).getTime()) / 36e5 : 0
              return (
                <div key={l.id} className="rounded-xl border px-2.5 py-2" style={{ borderColor: 'var(--surface-200)', opacity: l.feito ? 0.7 : 1 }}>
                  <div className="flex items-center gap-2">
                    <span className="text-[16px]">🫙</span>
                    <span className="text-[13.5px] font-semibold flex-1" style={{ color: 'var(--surface-800)' }}>Pelinho {i + 1}</span>
                    {!p.temOperacional ? (
                      <button type="button" disabled={ocupado} onClick={() => alternarSemOperacional(l)}
                        className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={l.feito ? { background: '#10b981', color: '#fff' } : { border: '2px dashed var(--surface-300)' }}
                        title={l.feito ? 'Feito — tocar desfaz' : 'Marcar feito'}>
                        {l.feito && <Check className="h-4 w-4" />}
                      </button>
                    ) : l.feito ? (
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: '#059669' }}>
                        ✓ {t ? (nomes[t.atribuido_a] || '—') : 'Feito'}{t?.concluido_em ? ` · ${new Date(t.concluido_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : ''}
                        <Camera className="h-4 w-4" style={{ color: t && comFoto[t.id] ? '#059669' : 'var(--surface-300)' }} aria-label={t && comFoto[t.id] ? 'Com foto de conclusão' : 'Sem foto'} />
                      </span>
                    ) : (
                      <>
                        {pendente ? (
                          <span className="inline-flex items-center gap-1 min-w-0">
                            <button type="button" disabled={ocupado} title="Desatribuir"
                              onClick={() => { if (confirm(`Tirar a tarefa de ${nomes[t.atribuido_a] || 'quem está com ela'}?`)) agir(() => desatribuirProduto(supabase, { ...ctx, tarefaId: t.id, nomeAtual: nomes[t.atribuido_a] || 'alguém' })) }}
                              className="w-6 h-6 rounded-md flex items-center justify-center flex-none" style={{ background: 'rgba(220,38,38,.12)', color: '#dc2626' }}>
                              <UserMinus className="h-3.5 w-3.5" />
                            </button>
                            <span className="text-[12.5px] italic truncate" style={{ color: corIdade(horas) }}>
                              {nomes[t.atribuido_a] || '…'} - {formatarIdade(horas)}
                            </span>
                          </span>
                        ) : (
                          <SeletorPessoa pessoas={pessoas} disabled={ocupado} onEscolher={id => atribuir([l.id], id)}>
                            <span className="inline-flex items-center h-7 px-2.5 rounded-md text-[12.5px] font-bold" style={{ background: 'rgba(124,58,237,.10)', color: '#7c3aed' }}>Atribuir a… ▾</span>
                          </SeletorPessoa>
                        )}
                        <button type="button" disabled={ocupado} onClick={() => abrirConclusao(l.id)} title="Concluir"
                          className="w-7 h-7 rounded-md flex items-center justify-center flex-none" style={{ background: 'rgba(16,185,129,.14)', color: '#059669' }}>
                          <Check className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>

                  {concluindo === l.id && (
                    <div className="mt-2 pt-2 border-t space-y-2" style={{ borderColor: 'var(--surface-200)' }}>
                      <FotoProva valor={foto} onChange={setFoto} obrigatoria={fotoObrigatoria} />
                      <textarea
                        value={anotacao}
                        onChange={e => setAnotacao(e.target.value)}
                        placeholder="+ Anotação (opcional)"
                        rows={2}
                        className="w-full px-2.5 py-2 rounded-lg text-sm border outline-none"
                        style={{ borderColor: 'var(--surface-200)', background: 'var(--surface-50)', color: 'var(--surface-800)', fontSize: 16 }}
                      />
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setConcluindo(null)} disabled={ocupado} className="h-9 px-4 rounded-lg text-[13px] font-semibold" style={{ color: 'var(--surface-500)' }}>Cancelar</button>
                        <button type="button" onClick={() => concluir(l.id)} disabled={ocupado || (fotoObrigatoria && !foto)}
                          className="h-9 px-5 rounded-lg text-[13px] font-bold text-white disabled:opacity-40 inline-flex items-center gap-1.5" style={{ background: '#059669' }}>
                          {ocupado && <Loader2 className="h-4 w-4 animate-spin" />}Concluir
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
      {!tem && (
        <p className="text-[12.5px]" style={{ color: 'var(--surface-400)' }}>Sem pelinho neste contrato.</p>
      )}
    </div>
  )
}
