'use client'

/**
 * 🫙 Pelinho — 2º nível do popup de pendências com GESTÃO DE TAREFAS (fase 2.8 do
 * docs/PLAYBOOK_REDESENHO_PIPELINE.md; item 24, molde do item 27). OBS por item desde o 2.10
 * (mig 154).
 *
 * - "Tem pelinho? Não | Sim". Não apaga as linhas do produto 0004 (a tarefa cai junto pelo
 *   CASCADE) — e RECUSA se algum já foi feito: a foto-prova iria pro storage_lixo calada.
 * - Quantidade − N + (1–5): o "−" tira primeiro um pelinho SEM DONO, sem feito e sem OBS; se não
 *   houver, avisa em vez de apagar trabalho ou pedido de alguém.
 * - Cada pelinho é uma linha do `GestorItemTarefa` (tarefa por produto, só com `cb_operacional`
 *   da unidade DO CONTRATO; sem o módulo, o ○/✓ de sempre). ⚡ com 2+ sem dono.
 * - Estoque: pelinho (0004) não baixa estoque em lugar nenhum hoje (nem na criação do contrato);
 *   esta tela segue igual pra não criar um 3º comportamento.
 */
import { useMemo, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import type { FotoComprimida } from '@/lib/comprimir-imagem'
import { atribuirProdutos, desatribuirProduto, concluirProduto, salvarObsProduto } from '@/lib/tarefas-rescaldo'
import { useGestorTarefas } from '@/hooks/useGestorTarefas'
import GestorItemTarefa, { SeletorPessoa } from '@/components/contratos/farois/GestorItemTarefa'
import PainelConclusao from '@/components/contratos/farois/PainelConclusao'

type Linha = { id: string; feito: boolean; observacao: string | null }

type Props = {
  contratoId: string
  unidadeId: string
  petNome: string
  linhas: Linha[]
  temOperacional: boolean
  podeConcluirSemFoto: boolean
  exigeFoto: boolean
  atorNome: string
  onMudou: () => Promise<void>
}

export default function PelinhoTela(p: Props) {
  const chave = p.linhas.map(l => `${l.id}:${l.feito ? 1 : 0}`).join(',')
  const g = useGestorTarefas({ cpIds: p.linhas.map(l => l.id), chave, temOperacional: p.temOperacional, unidadeId: p.unidadeId, atorNome: p.atorNome })
  const [ocupado, setOcupado] = useState(false)
  const [concluindo, setConcluindo] = useState<string | null>(null)
  const [foto, setFoto] = useState<FotoComprimida | null>(null)
  const [anotacao, setAnotacao] = useState('')

  const ctx = useMemo(() => ({ tipo: 'pelinho' as const, unidadeId: p.unidadeId, contratoId: p.contratoId, petNome: p.petNome, ator: g.ator }), [p.unidadeId, p.contratoId, p.petNome, g.ator])

  async function agir(fn: () => Promise<void>) {
    if (ocupado) return
    setOcupado(true)
    try {
      await fn()
      await p.onMudou()
      await g.recarregar()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro')
    } finally {
      setOcupado(false)
    }
  }

  const feitos = p.linhas.filter(l => l.feito).length
  const semDono = p.linhas.filter(l => !l.feito && !g.tarefas[l.id])

  async function inserirPelinhos(n: number) {
    const { data: prod, error } = await g.supabase.from('produtos').select('id, preco').eq('codigo', '0004').single() as { data: { id: string; preco: number | null } | null; error: { message: string } | null }
    if (error || !prod) throw new Error('Produto pelinho (0004) não encontrado no cadastro.')
    const rows = Array.from({ length: n }, () => ({
      contrato_id: p.contratoId, produto_id: prod.id, quantidade: 1, valor: prod.preco || 0,
      separado: false, is_reserva_pv: false, rescaldo_feito: false,
    }))
    const { error: errIns } = await g.supabase.from('contrato_produtos').insert(rows as never)
    if (errIns) throw new Error(errIns.message)
  }

  function responderNao() {
    if (p.linhas.length === 0) return
    if (feitos > 0) {
      alert(`${feitos} pelinho${feitos > 1 ? 's já foram feitos' : ' já foi feito'} — não dá pra marcar "Não" sem perder a foto-prova. Desfaça a conclusão no /tarefas antes.`)
      return
    }
    const comObs = p.linhas.filter(l => l.observacao?.trim()).length
    const comDono = p.linhas.filter(l => g.tarefas[l.id]).length
    const avisos = [comDono ? `${comDono} com alguém (sai da fila)` : '', comObs ? `${comObs} com observação (a nota some)` : ''].filter(Boolean).join(', ')
    if (!confirm(`Tirar ${p.linhas.length === 1 ? 'o pelinho' : `os ${p.linhas.length} pelinhos`} do contrato?${avisos ? `\n\n${avisos}.` : ''}`)) return
    agir(async () => {
      const { error } = await g.supabase.from('contrato_produtos').delete().in('id', p.linhas.map(l => l.id))
      if (error) throw new Error(error.message)
    })
  }

  function menos() {
    if (p.linhas.length <= 1) return
    const livres = semDono.filter(l => !l.observacao?.trim())
    const alvo = livres[livres.length - 1]
    if (!alvo) {
      alert('Todos os pelinhos têm alguém, uma observação ou já foram feitos. Desatribua ou apague a nota de um antes de diminuir.')
      return
    }
    agir(async () => {
      const { error } = await g.supabase.from('contrato_produtos').delete().eq('id', alvo.id)
      if (error) throw new Error(error.message)
    })
  }

  function atribuir(cpIds: string[], userId: string) {
    const nome = g.pessoas.find(x => x.user_id === userId)?.nome || 'alguém'
    agir(() => atribuirProdutos(g.supabase, { ...ctx, cpIds, atribuidoA: userId, nomeAtribuido: nome }))
  }

  const fotoObrigatoria = p.exigeFoto && !p.podeConcluirSemFoto
  const tem = p.linhas.length > 0
  const ordenadas = [...p.linhas].sort((a, b) => Number(a.feito) - Number(b.feito))

  return (
    <div className="space-y-3">
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

      {tem ? (
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

          {p.temOperacional && !g.carregando && semDono.length >= 2 && (
            <SeletorPessoa pessoas={g.pessoas} disabled={ocupado} onEscolher={id => atribuir(semDono.map(l => l.id), id)}>
              <span className="w-full inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-bold" style={{ background: 'rgba(124,58,237,.12)', color: '#7c3aed', border: '1px dashed #7c3aed' }}>
                ⚡ Atribuir os {semDono.length} pendentes a… ▾
              </span>
            </SeletorPessoa>
          )}

          <div className="space-y-1.5">
            {ordenadas.map((l, i) => {
              const t = g.tarefas[l.id]
              return (
                <GestorItemTarefa
                  key={l.id}
                  titulo={`Pelinho ${i + 1}`}
                  emoji="🫙"
                  feito={l.feito}
                  observacao={l.observacao}
                  tarefa={t}
                  nomes={g.nomes}
                  comFoto={g.comFoto}
                  pessoas={g.pessoas}
                  carregando={g.carregando}
                  modo={p.temOperacional ? 'operacional' : 'simples'}
                  ocupado={ocupado}
                  onAtribuir={id => atribuir([l.id], id)}
                  onDesatribuir={() => { if (t && confirm(`Tirar a tarefa de ${g.nomes[t.atribuido_a] || 'quem está com ela'}?`)) agir(() => desatribuirProduto(g.supabase, { ...ctx, tarefaId: t.id, nomeAtual: g.nomes[t.atribuido_a] || 'alguém' })) }}
                  onAbrirConclusao={() => { setConcluindo(l.id); setFoto(null); setAnotacao('') }}
                  onAlternarSimples={() => agir(async () => {
                    const { error } = await g.supabase.from('contrato_produtos').update({ rescaldo_feito: !l.feito } as never).eq('id', l.id)
                    if (error) throw new Error(error.message)
                  })}
                  onSalvarObs={texto => agir(() => salvarObsProduto(g.supabase, { cpId: l.id, obs: texto, nomeProduto: `Pelinho ${i + 1}`, petNome: p.petNome, ator: g.ator }))}
                  painelConclusao={concluindo === l.id ? (
                    <PainelConclusao
                      foto={foto} onFoto={setFoto} anotacao={anotacao} onAnotacao={setAnotacao}
                      fotoObrigatoria={fotoObrigatoria} ocupado={ocupado}
                      onCancelar={() => setConcluindo(null)}
                      onConcluir={() => agir(async () => {
                        await concluirProduto(g.supabase, { ...ctx, cpId: l.id, tarefaPendenteId: t && t.status === 'pendente' ? t.id : null, foto, anotacao: anotacao.trim() || null })
                        setConcluindo(null)
                      })}
                    />
                  ) : undefined}
                />
              )
            })}
          </div>
        </>
      ) : (
        <p className="text-[12.5px]" style={{ color: 'var(--surface-400)' }}>Sem pelinho neste contrato.</p>
      )}
    </div>
  )
}
