'use client'

/**
 * 📬 Registrar entrega — 2º nível do popup de pendências, ORQUESTRADOR da tarefa de entrega
 * (fase 2.9 do docs/PLAYBOOK_REDESENHO_PIPELINE.md; D10 e itens 37/39).
 *
 * Bloco 🚚 Realizar entrega (só com `cb_operacional` da unidade DO CONTRATO):
 *   QUEM (1ª linha) · Previsão (data + Manhã/Tarde/Dia todo) · Endereço (o do cadastro;
 *   "alterar" abre campo livre) · Obs · tarja "grava na observação ▸ …" ao vivo.
 *   Previsão e endereço NÃO viram coluna — vão em `observacao_atribuicao` (lib/obs-entrega).
 * ✓ Concluir (cabeçalho do bloco) = BYPASS da tarefa: abre o painel de conclusão e SOME tudo de
 *   atribuição. Aviso âmbar se a tarefa está com outra pessoa · Data (Hoje + campo) · Foto
 *   (sugerida, P-06 = b) · Anotação · Cancelar / Concluir → FINALIZA o contrato.
 */
import { useEffect, useMemo, useState } from 'react'
import { Check, UserMinus, UserPlus, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { atribuiveis, nomesDePerfis, nomesConhecidos } from '@/lib/cache-pessoas'
import FotoProva from '@/components/tarefas/FotoProva'
import type { FotoComprimida } from '@/lib/comprimir-imagem'
import { hojeLocal } from '@/lib/date-local'
import { formatarIdade } from '@/lib/atribuir-tarefa'
import { montarObsEntrega, lerObsEntrega, type PeriodoEntrega } from '@/lib/obs-entrega'
import {
  carregarTarefaEntrega, atribuirEntrega, salvarObsEntrega, desatribuirEntrega, concluirEntrega,
  type TarefaEntrega,
} from '@/lib/tarefa-entrega'

type Props = {
  contratoId: string
  unidadeId: string
  petNome: string
  enderecoCadastro: string | null
  temOperacional: boolean
  atorNome: string
  /** O contrato foi finalizado — quem chama tira o card e avisa. */
  onFinalizado: (dataEntrega: string) => void
  /** A tarefa mudou (atribuiu/desatribuiu) — quem chama atualiza o farol. */
  onMudou: () => void
}

type Atribuivel = { user_id: string; nome: string | null }

const PERIODOS: { v: PeriodoEntrega; rot: string }[] = [
  { v: 'manha', rot: 'Manhã' },
  { v: 'tarde', rot: 'Tarde' },
  { v: 'dia_todo', rot: 'Dia todo' },
]

const rotulo = 'text-[11px] font-bold uppercase tracking-wider w-[74px] flex-none pt-2'

export default function EntregaTela(p: Props) {
  const supabase = createClient()
  const [tarefa, setTarefa] = useState<TarefaEntrega | null | undefined>(undefined)
  const [nomeTarefa, setNomeTarefa] = useState<string | null>(null)
  const [pessoas, setPessoas] = useState<Atribuivel[]>([])
  const [ator, setAtor] = useState<{ userId: string | null; nome: string }>({ userId: null, nome: p.atorNome })
  const [ocupado, setOcupado] = useState(false)

  // Campos do pedido (vão concatenados em observacao_atribuicao)
  const [prevData, setPrevData] = useState('')
  const [prevPeriodo, setPrevPeriodo] = useState<PeriodoEntrega | ''>('')
  const [endAlt, setEndAlt] = useState(false)
  const [end, setEnd] = useState('')
  const [obs, setObs] = useState('')
  const [obsSalva, setObsSalva] = useState<string | null>(null)
  // Item 7: até a 1ª leitura voltar não se sabe se a entrega já tem dono — nada de "Atribuir a…".
  const [carregando, setCarregando] = useState(p.temOperacional)

  // Painel de conclusão
  const [concluindo, setConcluindo] = useState(false)
  // Nasce SEM data (10/10/2026, pedido do Lucas — mesma regra do pagamento): com hoje pré-marcado
  // o operador não conferia, e a entrega costuma ser registrada depois.
  const [dataEntrega, setDataEntrega] = useState('')
  const [foto, setFoto] = useState<FotoComprimida | null>(null)
  const [anotacao, setAnotacao] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAtor({ userId: data.user?.id ?? null, nome: p.atorNome }))
  }, [supabase, p.atorNome])

  async function recarregar() {
    if (!p.temOperacional) { setTarefa(null); setCarregando(false); return }
    const t = await carregarTarefaEntrega(supabase, p.contratoId).finally(() => setCarregando(false))
    setTarefa(t)
    const o = lerObsEntrega(t?.observacao_atribuicao)
    setPrevData(o.prevData || ''); setPrevPeriodo(o.prevPeriodo || '')
    setEndAlt(!!o.endereco); setEnd(o.endereco || ''); setObs(o.texto)
    setObsSalva(t?.observacao_atribuicao ?? null)
    if (t) {
      // Nome da memória da sessão (item 7) — só vai ao banco se ainda não conhece.
      setNomeTarefa(nomesConhecidos([t.atribuido_a])[t.atribuido_a] || null)
      const n = await nomesDePerfis(supabase, [t.atribuido_a])
      setNomeTarefa(n[t.atribuido_a] || 'Sem nome')
    } else setNomeTarefa(null)
  }

  useEffect(() => { recarregar().catch(e => console.error('[EntregaTela]', e)) }, [p.contratoId, p.temOperacional]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!p.temOperacional) return
    let vivo = true
    atribuiveis(supabase, p.unidadeId, 'tarefas').then(lista => { if (vivo) setPessoas(lista) })
    return () => { vivo = false }
  }, [supabase, p.temOperacional, p.unidadeId])

  const obsMontada = useMemo(() => montarObsEntrega({
    prevData: prevData || undefined,
    prevPeriodo: prevPeriodo || undefined,
    endereco: endAlt ? end : undefined,
    texto: obs,
  }), [prevData, prevPeriodo, endAlt, end, obs])

  const ctx = { unidadeId: p.unidadeId, contratoId: p.contratoId, petNome: p.petNome, ator }

  async function agir(fn: () => Promise<void>, depois?: () => void) {
    if (ocupado) return
    setOcupado(true)
    try {
      await fn()
      depois?.()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro')
    } finally {
      setOcupado(false)
    }
  }

  const horas = tarefa ? (Date.now() - new Date(tarefa.atribuido_em).getTime()) / 36e5 : 0
  const corIdade = horas > 48 ? '#dc2626' : horas > 24 ? '#d97706' : '#2563eb'
  const campoCls = 'w-full px-2.5 py-2 rounded-lg border outline-none text-sm'
  const campoSty = { borderColor: 'var(--surface-200)', background: 'var(--surface-50)', color: 'var(--surface-800)', fontSize: 16 }

  return (
    <div className="space-y-3">
      {/* Cabeçalho do bloco: título + ✓ Concluir */}
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-bold flex-1" style={{ color: 'var(--surface-800)' }}>🚚 Realizar entrega</span>
        <button
          type="button"
          onClick={() => { setConcluindo(v => !v); setDataEntrega(hojeLocal()); setFoto(null); setAnotacao('') }}
          className="w-8 h-8 rounded-md flex items-center justify-center"
          style={concluindo ? { background: '#059669', color: '#fff' } : { background: 'rgba(16,185,129,.14)', color: '#059669' }}
          title="Concluir — registra a entrega e finaliza o contrato"
          aria-pressed={concluindo}
        >
          <Check className="h-4 w-4" />
        </button>
      </div>

      {concluindo ? (
        <div className="space-y-3">
          {tarefa && tarefa.atribuido_a !== ator.userId && (
            <p className="text-[12.5px] rounded-lg px-3 py-2" style={{ background: 'rgba(245,158,11,.12)', color: '#b45309' }}>
              Você vai concluir no lugar de <b>{nomeTarefa || 'quem está com a tarefa'}</b> — a tarefa sai da fila dele(a).
            </p>
          )}
          <div className="flex items-start gap-2">
            <span className={rotulo} style={{ color: 'var(--surface-400)' }}>Data</span>
            <div className="flex-1 flex items-center gap-2">
              <button type="button" onClick={() => setDataEntrega(hojeLocal())}
                className="h-9 px-3 rounded-lg text-[13px] font-bold border"
                style={dataEntrega === hojeLocal() ? { background: '#7c3aed', color: '#fff', borderColor: '#7c3aed' } : { borderColor: 'var(--surface-300)', color: 'var(--surface-600)' }}>
                Hoje
              </button>
              <input type="date" value={dataEntrega} max={hojeLocal()} onChange={e => setDataEntrega(e.target.value)} className={campoCls} style={campoSty} />
            </div>
          </div>
          {p.temOperacional && <FotoProva valor={foto} onChange={setFoto} obrigatoria={false} />}
          <textarea value={anotacao} onChange={e => setAnotacao(e.target.value)} placeholder="+ Anotação (opcional)" rows={2} className={campoCls} style={campoSty} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConcluindo(false)} disabled={ocupado} className="h-9 px-4 rounded-lg text-[13px] font-semibold" style={{ color: 'var(--surface-500)' }}>Cancelar</button>
            <button
              type="button"
              disabled={ocupado || !dataEntrega}
              onClick={() => agir(() => concluirEntrega(supabase, {
                ...ctx,
                usarTarefa: p.temOperacional,
                tarefaPendenteId: tarefa?.id ?? null,
                dataEntrega,
                foto,
                anotacao: anotacao.trim() || null,
                nomeNoLugarDe: tarefa && tarefa.atribuido_a !== ator.userId ? nomeTarefa : null,
              }), () => p.onFinalizado(dataEntrega))}
              className="h-9 px-5 rounded-lg text-[13px] font-bold text-white disabled:opacity-40 inline-flex items-center gap-1.5"
              style={{ background: '#059669' }}
            >
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Concluir
            </button>
          </div>
        </div>
      ) : !p.temOperacional ? (
        <p className="text-[12.5px]" style={{ color: 'var(--surface-500)' }}>Toque no ✓ para registrar a entrega e finalizar o contrato.</p>
      ) : tarefa === undefined ? (
        <p className="text-[12.5px]" style={{ color: 'var(--surface-400)' }}>Carregando…</p>
      ) : (
        <div className="space-y-2.5">
          {/* QUEM */}
          <div className="flex items-start gap-2">
            <span className={rotulo} style={{ color: 'var(--surface-400)' }}>Quem</span>
            {carregando ? (
              <span className="flex-1 min-h-9 flex items-center text-[13px] animate-pulse" style={{ color: 'var(--surface-400)' }}>carregando…</span>
            ) : tarefa ? (
              <div className="flex-1 flex items-center gap-2 min-h-9">
                <span className="flex-1 text-[13.5px] italic truncate" style={{ color: corIdade }}>
                  👤 <b className="not-italic">{nomeTarefa || '…'}</b> · {formatarIdade(horas)}
                </span>
                <button type="button" disabled={ocupado}
                  onClick={() => { if (confirm(`Tirar a entrega de ${nomeTarefa || 'quem está com ela'}?`)) agir(() => desatribuirEntrega(supabase, { ...ctx, tarefaId: tarefa.id, nomeAtual: nomeTarefa || 'alguém' }), () => { recarregar(); p.onMudou() }) }}
                  className="inline-flex items-center gap-1 h-8 px-2 rounded-md text-[12px] font-bold" style={{ color: '#dc2626', background: 'rgba(220,38,38,.10)' }}>
                  <UserMinus className="h-3.5 w-3.5" />Desatribuir
                </button>
              </div>
            ) : (
              <span className="relative flex-1">
                <span className="w-full inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-bold" style={{ border: '1.5px dashed #06b6d4', color: '#0891b2' }}>
                  <UserPlus className="h-4 w-4" />Atribuir a… ˅
                </span>
                <select
                  aria-label="Atribuir a"
                  value=""
                  disabled={ocupado}
                  onChange={e => {
                    const id = e.target.value
                    if (!id) return
                    const nome = pessoas.find(x => x.user_id === id)?.nome || 'alguém'
                    agir(() => atribuirEntrega(supabase, { ...ctx, atribuidoA: id, nomeAtribuido: nome, obs: obsMontada }), () => { recarregar(); p.onMudou() })
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{ fontSize: 16 }}
                >
                  <option value="">Atribuir a…</option>
                  {pessoas.map(x => <option key={x.user_id} value={x.user_id}>{x.nome || 'Sem nome'}</option>)}
                </select>
              </span>
            )}
          </div>

          {/* Previsão */}
          <div className="flex items-start gap-2">
            <span className={rotulo} style={{ color: 'var(--surface-400)' }}>Previsão</span>
            <div className="flex-1 space-y-1.5">
              <input type="date" value={prevData} min={hojeLocal()} onChange={e => setPrevData(e.target.value)} className={campoCls} style={campoSty} />
              <div className="flex gap-1">
                {PERIODOS.map(x => (
                  <button key={x.v} type="button" onClick={() => setPrevPeriodo(prevPeriodo === x.v ? '' : x.v)}
                    className="flex-1 h-8 rounded-md text-[12.5px] font-semibold border"
                    style={prevPeriodo === x.v ? { background: 'rgba(124,58,237,.14)', borderColor: '#7c3aed', color: '#7c3aed' } : { borderColor: 'var(--surface-300)', color: 'var(--surface-500)' }}>
                    {x.rot}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div className="flex items-start gap-2">
            <span className={rotulo} style={{ color: 'var(--surface-400)' }}>Endereço</span>
            <div className="flex-1 min-w-0">
              {endAlt ? (
                <>
                  <input value={end} onChange={e => setEnd(e.target.value)} placeholder="Rua, nº, compl. · bairro · cidade" className={campoCls} style={campoSty} />
                  <button type="button" onClick={() => { setEndAlt(false); setEnd('') }} className="text-[12px] font-semibold underline mt-1" style={{ color: 'var(--surface-500)' }}>usar o do cadastro</button>
                </>
              ) : (
                <p className="text-[13px] pt-2" style={{ color: 'var(--surface-700)' }}>
                  {p.enderecoCadastro || <span className="italic" style={{ color: 'var(--surface-400)' }}>Sem endereço no cadastro</span>}
                  {' '}<button type="button" onClick={() => setEndAlt(true)} className="text-[12px] font-semibold underline" style={{ color: '#7c3aed' }}>alterar</button>
                </p>
              )}
            </div>
          </div>

          {/* Obs */}
          <div className="flex items-start gap-2">
            <span className={rotulo} style={{ color: 'var(--surface-400)' }}>Obs</span>
            <textarea value={obs} onChange={e => setObs(e.target.value)} maxLength={140} rows={2} placeholder="ex.: ligar antes, deixar com a vizinha" className={campoCls} style={campoSty} />
          </div>

          {/* Tarja: o texto que vai pro banco, ao vivo */}
          <p className="text-[11px] rounded-md px-2 py-1.5 font-mono break-words" style={{ background: 'var(--surface-100)', color: 'var(--surface-500)' }}>
            grava na observação ▸ {obsMontada || '(vazio)'}
          </p>

          {tarefa && obsMontada !== obsSalva && (
            <div className="flex justify-end">
              <button type="button" disabled={ocupado}
                onClick={() => agir(() => salvarObsEntrega(supabase, { ...ctx, tarefaId: tarefa.id, obs: obsMontada }), () => setObsSalva(obsMontada))}
                className="h-9 px-4 rounded-lg text-[13px] font-bold text-white" style={{ background: '#7c3aed' }}>
                Salvar alterações
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
