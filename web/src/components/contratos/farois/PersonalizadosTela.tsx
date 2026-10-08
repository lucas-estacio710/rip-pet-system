'use client'

/**
 * 💎 Personalizados — 2º nível do popup de pendências (fase 2.10 do
 * docs/PLAYBOOK_REDESENHO_PIPELINE.md; item 27 de docs/REDESENHO_CARDS_PIPELINE.md).
 *
 * - "Tem personalizado? Não | Sim". Não = produto 0002 ("Nenhum Personalizado"); Não com itens
 *   pede "Tirar os N itens?" e RECUSA se algum já foi feito (apagaria a foto-prova). Sem
 *   resposta = os dois apagados + "Ainda não perguntado ao tutor". Sim abre o catálogo.
 * - Catálogo só quando pedido (grade com foto, busca). Escolher um item com 0002 no contrato
 *   tira o 0002 — antes nada tirava ("A fazer": urna × Não tem).
 * - Itens agrupados pelo TIPO DE TAREFA (Molde · Carimbo · Pelo Extra · Outros); a tarefa é
 *   POR PRODUTO (`GestorItemTarefa`), com OBS por item (mig 154). "Outros" = sem tarefa.
 *   ⚡ "Atribuir os N pendentes a…" com 2+ sem dono. "+ Adicionar personalizado" grudado no
 *   rodapé (sticky dentro do popup — o corpo do PopupCentral é quem rola).
 * - ✕ na foto pede confirmação, dizendo o que se perde (tarefa, foto-prova, nota).
 */
import { useMemo, useState } from 'react'
import { Search, ChevronLeft, Plus } from 'lucide-react'
import type { FotoComprimida } from '@/lib/comprimir-imagem'
import { atribuirProdutos, desatribuirProduto, concluirProduto, salvarObsProduto, type TipoRescaldo } from '@/lib/tarefas-rescaldo'
import { useGestorTarefas } from '@/hooks/useGestorTarefas'
import GestorItemTarefa, { SeletorPessoa } from '@/components/contratos/farois/GestorItemTarefa'
import PainelConclusao from '@/components/contratos/farois/PainelConclusao'

export type ItemPersonalizado = {
  id: string
  produtoId: string
  nome: string
  imagemUrl: string | null
  rescaldoTipo: string
  feito: boolean
  observacao: string | null
}

export type ProdutoCatalogo = { id: string; codigo: string; nome: string; tipo: string; rescaldo_tipo: string; preco: number | null; imagem_url: string | null }

type Props = {
  contratoId: string
  unidadeId: string
  petNome: string
  itens: ItemPersonalizado[]
  /** Linha do 0002 ("Nenhum Personalizado"), se o contrato tem. */
  nenhum: { id: string; produtoId: string } | null
  catalogo: ProdutoCatalogo[]
  temOperacional: boolean
  podeConcluirSemFoto: boolean
  exigeFotoPorTipo: Record<string, boolean>
  atorNome: string
  onAdicionar: (produto: ProdutoCatalogo) => Promise<boolean>
  onRemover: (cpId: string, produtoId: string) => Promise<boolean>
  onAdicionarNenhum: () => Promise<void>
  onMudou: () => Promise<void>
}

const GRUPOS: { tipo: string; titulo: string; emoji: string }[] = [
  { tipo: 'molde_patinha', titulo: 'Tirar Molde', emoji: '🐾' },
  { tipo: 'carimbo', titulo: 'Tirar Carimbo', emoji: '📄' },
  { tipo: 'pelo_extra', titulo: 'Tirar Pelo Extra', emoji: '✂️' },
  { tipo: 'outro', titulo: 'Outros', emoji: '💎' },
]
const ROTULO_CATALOGO: Record<string, string> = { molde_patinha: 'Molde de Patinha', carimbo: 'Carimbo', pelo_extra: 'Pelo Extra', outro: 'Outros' }
const COM_TAREFA = new Set(['molde_patinha', 'carimbo', 'pelo_extra'])

export default function PersonalizadosTela(p: Props) {
  const chave = p.itens.map(i => `${i.id}:${i.feito ? 1 : 0}`).join(',')
  const g = useGestorTarefas({ cpIds: p.itens.map(i => i.id), chave, temOperacional: p.temOperacional, unidadeId: p.unidadeId, atorNome: p.atorNome })
  const [ocupado, setOcupado] = useState(false)
  const [catalogoAberto, setCatalogoAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [concluindo, setConcluindo] = useState<string | null>(null)
  const [foto, setFoto] = useState<FotoComprimida | null>(null)
  const [anotacao, setAnotacao] = useState('')

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

  const ctxDe = (tipo: string) => ({ tipo: tipo as TipoRescaldo, unidadeId: p.unidadeId, contratoId: p.contratoId, petNome: p.petNome, ator: g.ator })
  const tem = p.itens.length > 0
  const semDono = p.itens.filter(i => COM_TAREFA.has(i.rescaldoTipo) && !i.feito && !g.tarefas[i.id])

  function oQueSePerde(i: ItemPersonalizado): string[] {
    const t = g.tarefas[i.id]
    const s: string[] = []
    if (i.feito || t?.status === 'concluida') s.push('já foi feito — a foto-prova será apagada')
    else if (t) s.push(`está com ${g.nomes[t.atribuido_a] || 'alguém'} — sai da fila`)
    if (i.observacao?.trim()) s.push('a observação some')
    return s
  }

  function responderNao() {
    if (p.nenhum && !tem) return
    if (tem) {
      const feitos = p.itens.filter(i => i.feito).length
      if (feitos > 0) {
        alert(`${feitos} personalizado${feitos > 1 ? 's já foram feitos' : ' já foi feito'} — não dá pra marcar "Não" sem perder a foto-prova. Desfaça a conclusão no /tarefas antes.`)
        return
      }
      const avisos = p.itens.flatMap(i => oQueSePerde(i).map(x => `${i.nome}: ${x}`))
      if (!confirm(`Tirar ${p.itens.length === 1 ? 'o item' : `os ${p.itens.length} itens`} do contrato?${avisos.length ? `\n\n${avisos.join('\n')}` : ''}`)) return
    }
    agir(async () => {
      for (const i of p.itens) {
        if (!(await p.onRemover(i.id, i.produtoId))) throw new Error(`Não consegui tirar ${i.nome}.`)
      }
      if (!p.nenhum) await p.onAdicionarNenhum()
    })
  }

  function responderSim() {
    if (p.nenhum) {
      const n = p.nenhum
      agir(async () => { if (!(await p.onRemover(n.id, n.produtoId))) throw new Error('Não consegui tirar o "Nenhum personalizado".') })
    }
    setCatalogoAberto(true)
  }

  function escolher(prod: ProdutoCatalogo) {
    const n = p.nenhum
    agir(async () => {
      if (n && !(await p.onRemover(n.id, n.produtoId))) throw new Error('Não consegui tirar o "Nenhum personalizado".')
      if (!(await p.onAdicionar(prod))) throw new Error(`Não consegui adicionar ${prod.nome}.`)
    })
    setCatalogoAberto(false)
    setBusca('')
  }

  function remover(i: ItemPersonalizado) {
    const perdas = oQueSePerde(i)
    if (!confirm(`Tirar ${i.nome} do contrato?${perdas.length ? `\n\nAtenção: ${perdas.join('; ')}.` : ''}`)) return
    agir(async () => { if (!(await p.onRemover(i.id, i.produtoId))) throw new Error(`Não consegui tirar ${i.nome}.`) })
  }

  const catalogoFiltrado = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return p.catalogo.filter(c => !t || c.nome.toLowerCase().includes(t) || c.codigo.toLowerCase().includes(t))
  }, [p.catalogo, busca])

  // ---------- Catálogo ----------
  if (catalogoAberto) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setCatalogoAberto(false); setBusca('') }} className="inline-flex items-center gap-0.5 text-[13px] font-bold flex-none" style={{ color: '#7c3aed' }}>
            <ChevronLeft className="h-4 w-4" />Voltar aos itens
          </button>
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--surface-400)' }} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar"
              className="w-full pl-7 pr-2 py-1.5 rounded-lg border outline-none"
              style={{ borderColor: 'var(--surface-200)', background: 'var(--surface-50)', color: 'var(--surface-800)', fontSize: 16 }} />
          </div>
        </div>
        {['molde_patinha', 'carimbo', 'pelo_extra', 'outro'].map(tipo => {
          const lista = catalogoFiltrado.filter(c => (c.rescaldo_tipo || 'outro') === tipo)
          if (lista.length === 0) return null
          return (
            <div key={tipo}>
              <p className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--surface-400)' }}>{ROTULO_CATALOGO[tipo]}</p>
              <div className="grid grid-cols-4 gap-2">
                {lista.map(c => (
                  <button key={c.id} type="button" disabled={ocupado} onClick={() => escolher(c)}
                    className="flex flex-col items-center gap-1 p-1 rounded-lg border text-center" style={{ borderColor: 'var(--surface-200)' }}>
                    <span className="w-full aspect-square rounded-md bg-white flex items-center justify-center overflow-hidden">
                      {c.imagem_url ? <img src={c.imagem_url} alt="" className="w-full h-full" style={{ objectFit: 'contain' }} /> : <span className="text-xl">💎</span>}
                    </span>
                    <span className="text-[10.5px] leading-tight line-clamp-2" style={{ color: 'var(--surface-700)' }}>{c.nome}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
        {catalogoFiltrado.length === 0 && <p className="text-sm text-center py-4" style={{ color: 'var(--surface-400)' }}>Nada encontrado.</p>}
      </div>
    )
  }

  // ---------- Itens ----------
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-semibold flex-1" style={{ color: 'var(--surface-800)' }}>Tem personalizado?</span>
        <div className="inline-flex rounded-lg p-0.5" style={{ background: 'var(--surface-100)' }}>
          <button type="button" disabled={ocupado} onClick={responderNao} className="px-4 h-8 rounded-md text-[13px] font-bold"
            style={p.nenhum && !tem ? { background: '#64748b', color: '#fff' } : { color: 'var(--surface-500)' }}>Não</button>
          <button type="button" disabled={ocupado} onClick={responderSim} className="px-4 h-8 rounded-md text-[13px] font-bold"
            style={tem ? { background: '#10b981', color: '#fff' } : { color: 'var(--surface-500)' }}>Sim</button>
        </div>
      </div>

      {!tem && !p.nenhum && <p className="text-[12.5px]" style={{ color: 'var(--surface-400)' }}>Ainda não perguntado ao tutor.</p>}
      {!tem && p.nenhum && <p className="text-[12.5px]" style={{ color: 'var(--surface-400)' }}>O tutor não quer personalizado.</p>}

      {p.temOperacional && semDono.length >= 2 && (
        <SeletorPessoa pessoas={g.pessoas} disabled={ocupado} onEscolher={id => {
          const nome = g.pessoas.find(x => x.user_id === id)?.nome || 'alguém'
          // Atribui por tipo (cada tipo é uma tarefa diferente no /tarefas).
          agir(async () => {
            for (const grupo of GRUPOS.filter(x => COM_TAREFA.has(x.tipo))) {
              const ids = semDono.filter(i => i.rescaldoTipo === grupo.tipo).map(i => i.id)
              if (ids.length) await atribuirProdutos(g.supabase, { ...ctxDe(grupo.tipo), cpIds: ids, atribuidoA: id, nomeAtribuido: nome })
            }
          })
        }}>
          <span className="w-full inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-bold" style={{ background: 'rgba(124,58,237,.12)', color: '#7c3aed', border: '1px dashed #7c3aed' }}>
            ⚡ Atribuir os {semDono.length} pendentes a… ▾
          </span>
        </SeletorPessoa>
      )}

      {GRUPOS.map(grupo => {
        const doGrupo = p.itens.filter(i => (COM_TAREFA.has(i.rescaldoTipo) ? i.rescaldoTipo : 'outro') === grupo.tipo)
          .sort((a, b) => Number(a.feito) - Number(b.feito))
        if (doGrupo.length === 0) return null
        return (
          <div key={grupo.tipo} className="space-y-1.5">
            <p className="text-[12.5px] font-bold" style={{ color: 'var(--surface-600)' }}>
              {grupo.emoji} {grupo.titulo}{doGrupo.length > 1 ? ` ×${doGrupo.length}` : ''}
            </p>
            {doGrupo.map(i => {
              const t = g.tarefas[i.id]
              const comTarefa = COM_TAREFA.has(i.rescaldoTipo)
              const fotoObrigatoria = p.exigeFotoPorTipo[i.rescaldoTipo] === true && !p.podeConcluirSemFoto
              return (
                <GestorItemTarefa
                  key={i.id}
                  titulo={i.nome}
                  imagemUrl={i.imagemUrl}
                  feito={i.feito}
                  observacao={i.observacao}
                  tarefa={t}
                  nomes={g.nomes}
                  comFoto={g.comFoto}
                  pessoas={g.pessoas}
                  modo={!comTarefa ? 'sem_tarefa' : p.temOperacional ? 'operacional' : 'simples'}
                  ocupado={ocupado}
                  onAtribuir={id => agir(() => atribuirProdutos(g.supabase, { ...ctxDe(i.rescaldoTipo), cpIds: [i.id], atribuidoA: id, nomeAtribuido: g.pessoas.find(x => x.user_id === id)?.nome || 'alguém' }))}
                  onDesatribuir={() => { if (t && confirm(`Tirar a tarefa de ${g.nomes[t.atribuido_a] || 'quem está com ela'}?`)) agir(() => desatribuirProduto(g.supabase, { ...ctxDe(i.rescaldoTipo), tarefaId: t.id, nomeAtual: g.nomes[t.atribuido_a] || 'alguém' })) }}
                  onAbrirConclusao={() => { setConcluindo(i.id); setFoto(null); setAnotacao('') }}
                  onAlternarSimples={() => agir(async () => {
                    const { error } = await g.supabase.from('contrato_produtos').update({ rescaldo_feito: !i.feito } as never).eq('id', i.id)
                    if (error) throw new Error(error.message)
                  })}
                  onSalvarObs={texto => agir(() => salvarObsProduto(g.supabase, { cpId: i.id, obs: texto, nomeProduto: i.nome, petNome: p.petNome, ator: g.ator }))}
                  onRemover={() => remover(i)}
                  painelConclusao={concluindo === i.id ? (
                    <PainelConclusao
                      foto={foto} onFoto={setFoto} anotacao={anotacao} onAnotacao={setAnotacao}
                      fotoObrigatoria={fotoObrigatoria} ocupado={ocupado}
                      onCancelar={() => setConcluindo(null)}
                      onConcluir={() => agir(async () => {
                        await concluirProduto(g.supabase, { ...ctxDe(i.rescaldoTipo), cpId: i.id, tarefaPendenteId: t && t.status === 'pendente' ? t.id : null, foto, anotacao: anotacao.trim() || null })
                        setConcluindo(null)
                      })}
                    />
                  ) : undefined}
                />
              )
            })}
          </div>
        )
      })}

      {/* Sempre visível, grudado no rodapé do popup enquanto a lista rola (item 27). */}
      <div className="sticky bottom-0 pt-2 pb-1" style={{ background: 'var(--surface-0)' }}>
        <button type="button" disabled={ocupado} onClick={() => { if (p.nenhum) responderSim(); else setCatalogoAberto(true) }}
          className="w-full inline-flex items-center justify-center gap-1.5 h-10 rounded-lg text-[13.5px] font-bold border-2 border-dashed"
          style={{ borderColor: '#10b981', color: '#059669' }}>
          <Plus className="h-4 w-4" />Adicionar personalizado
        </button>
      </div>
    </div>
  )
}
