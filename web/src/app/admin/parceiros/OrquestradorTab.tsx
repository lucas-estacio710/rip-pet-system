'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Check, Power, X, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { Skeleton } from '@/components/ui/Skeleton'

type Config = {
  unidade_id: string
  comissao: Record<'bronze' | 'prata' | 'ouro', { ind: number; col: number }>
  faixas: { bronze_max: number; prata_max: number }
  desconto_percentual: number
  beneficios_ativos: { comissao: boolean; desconto: boolean; cortesia: boolean }
  cortesia_produtos: { individual: string[]; coletiva: string[] }
  orcamento_validade_modo: 'fim_do_dia_seguinte' | 'horas'
  orcamento_validade_horas: number
  sorteio_ativo: boolean
  bilhete_por_indicacao: boolean
  bilhete_por_mgm: boolean
  mgm_ativo: boolean
  remocao_ativa: boolean
  materiais_ativos: boolean
  cidades_cobertura: string[]
  max_parcelas: number
}
type Produto = { id: string; nome: string; tipo: string }

const CATS = ['bronze', 'prata', 'ouro'] as const
const ROTULO_CAT = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro' }

const num = 'w-full rounded-[var(--radius-sm)] border border-[var(--surface-200)] bg-[var(--surface-50)] px-2.5 py-2 text-sm text-[var(--surface-800)] outline-none focus:border-[var(--brand-500)]'

function Toggle({ on, onChange, label, desc }: { on: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      className="flex w-full items-start gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left transition hover:bg-[var(--surface-50)]">
      <span className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full transition ${on ? 'bg-[var(--brand-500)]' : 'bg-[var(--surface-300)]'}`}>
        <span className={`h-4 w-4 rounded-full bg-white transition ${on ? 'ml-[18px]' : 'ml-0.5'}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-[var(--surface-700)]">{label}</span>
        {desc && <span className="mt-0.5 block text-xs text-[var(--surface-400)]">{desc}</span>}
      </span>
    </button>
  )
}

export default function OrquestradorTab() {
  const supabase = createClient()
  const { currentUnit } = useUnit()

  const [cfg, setCfg] = useState<Config | null>(null)
  const [moduloAtivo, setModuloAtivo] = useState(false)
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [novaCidade, setNovaCidade] = useState('')

  const carregar = useCallback(async () => {
    if (!currentUnit) return
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/admin/parceiros/config?unidade_id=${currentUnit.id}`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    const j = await res.json()
    if (!res.ok) { setErro(j.error); return }
    setCfg(j.config); setModuloAtivo(j.moduloAtivo); setProdutos(j.produtos ?? [])
  }, [currentUnit, supabase])

  useEffect(() => { carregar() }, [carregar])

  function up<K extends keyof Config>(k: K, v: Config[K]) {
    setCfg(c => c ? { ...c, [k]: v } : c)
    setSalvo(false)
  }

  async function salvar() {
    if (!cfg || !currentUnit) return
    setSalvando(true); setErro(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/parceiros/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ ...cfg, unidade_id: currentUnit.id }),
    })
    const j = await res.json()
    setSalvando(false)
    if (!res.ok) { setErro(j.error ?? 'Falha ao salvar.'); return }
    setSalvo(true); setTimeout(() => setSalvo(false), 2500)
  }

  async function alternarModulo() {
    if (!currentUnit) return
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/parceiros/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ unidade_id: currentUnit.id, ativo: !moduloAtivo }),
    })
    if (res.ok) setModuloAtivo(!moduloAtivo)
  }

  if (!cfg) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>

  const cortesiasDe = (t: 'individual' | 'coletiva') => cfg.cortesia_produtos?.[t] ?? []
  function toggleCortesia(t: 'individual' | 'coletiva', id: string) {
    const atual = cortesiasDe(t)
    up('cortesia_produtos', {
      ...cfg!.cortesia_produtos,
      [t]: atual.includes(id) ? atual.filter(x => x !== id) : [...atual, id],
    })
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Módulo */}
      <section className="rounded-[var(--radius-lg)] bg-[var(--surface-0)] p-4 shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--surface-700)]">
              Programa em {currentUnit?.nome}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--surface-400)]">
              Desligado, o app do parceiro responde &quot;indisponível nesta região&quot; — vale como
              interruptor geral.
            </p>
          </div>
          <button onClick={alternarModulo}
            className={`flex items-center gap-2 rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-medium transition ${moduloAtivo ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[var(--surface-100)] text-[var(--surface-400)]'}`}>
            <Power className="h-4 w-4" />
            {moduloAtivo ? 'Ativo' : 'Desativado'}
          </button>
        </div>
      </section>

      {/* Comissões */}
      <section className="rounded-[var(--radius-lg)] bg-[var(--surface-0)] p-4 shadow-[var(--shadow-sm)]">
        <h2 className="mb-1 text-sm font-semibold text-[var(--surface-700)]">Comissões</h2>
        <p className="mb-3 text-xs text-[var(--surface-400)]">
          Valor por indicação, conforme a categoria do parceiro no ano móvel.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm">
            <thead>
              <tr className="text-xs text-[var(--surface-400)]">
                <th className="pb-2 text-left font-normal">Categoria</th>
                <th className="pb-2 text-left font-normal">Coletiva</th>
                <th className="pb-2 text-left font-normal">Individual</th>
              </tr>
            </thead>
            <tbody>
              {CATS.map(cat => (
                <tr key={cat}>
                  <td className="py-1.5 pr-3 text-[var(--surface-600)]">{ROTULO_CAT[cat]}</td>
                  {(['col', 'ind'] as const).map(tipo => (
                    <td key={tipo} className="py-1.5 pr-3">
                      <input type="number" min={0} className={num}
                        value={cfg.comissao?.[cat]?.[tipo] ?? 0}
                        onChange={e => up('comissao', {
                          ...cfg.comissao,
                          [cat]: { ...cfg.comissao[cat], [tipo]: Number(e.target.value) },
                        })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--surface-100)] pt-4">
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--surface-400)]">Bronze vai até</span>
            <input type="number" min={0} className={num} value={cfg.faixas?.bronze_max ?? 5}
              onChange={e => up('faixas', { ...cfg.faixas, bronze_max: Number(e.target.value) })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--surface-400)]">Prata vai até</span>
            <input type="number" min={0} className={num} value={cfg.faixas?.prata_max ?? 12}
              onChange={e => up('faixas', { ...cfg.faixas, prata_max: Number(e.target.value) })} />
          </label>
        </div>
        <p className="mt-2 text-xs text-[var(--surface-400)]">
          Acima de {cfg.faixas?.prata_max ?? 12} indicações no ano, o parceiro é Ouro.
        </p>
      </section>

      {/* Benefícios */}
      <section className="rounded-[var(--radius-lg)] bg-[var(--surface-0)] p-4 shadow-[var(--shadow-sm)]">
        <h2 className="mb-3 text-sm font-semibold text-[var(--surface-700)]">Benefícios</h2>
        <Toggle on={cfg.beneficios_ativos?.comissao ?? true} label="Receber comissão"
          onChange={v => up('beneficios_ativos', { ...cfg.beneficios_ativos, comissao: v })} />
        <Toggle on={cfg.beneficios_ativos?.desconto ?? true} label="Dar desconto ao tutor"
          onChange={v => up('beneficios_ativos', { ...cfg.beneficios_ativos, desconto: v })} />
        <Toggle on={cfg.beneficios_ativos?.cortesia ?? true} label="Oferecer recordação de cortesia"
          onChange={v => up('beneficios_ativos', { ...cfg.beneficios_ativos, cortesia: v })} />

        <label className="mt-3 block border-t border-[var(--surface-100)] pt-3">
          <span className="mb-1 block text-xs text-[var(--surface-400)]">Desconto ao tutor (%)</span>
          <input type="number" min={0} max={100} className={num + ' max-w-[120px]'}
            value={cfg.desconto_percentual ?? 10}
            onChange={e => up('desconto_percentual', Number(e.target.value))} />
        </label>

        {cfg.beneficios_ativos?.cortesia && (
          <div className="mt-4 border-t border-[var(--surface-100)] pt-4">
            <p className="mb-2 text-xs text-[var(--surface-400)]">
              Produtos elegíveis como cortesia
            </p>
            {(['individual', 'coletiva'] as const).map(t => (
              <div key={t} className="mb-3">
                <p className="mb-1.5 text-xs font-medium text-[var(--surface-600)]">
                  {t === 'individual' ? 'Individual' : 'Coletiva'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {produtos.map(p => {
                    const on = cortesiasDe(t).includes(p.id)
                    return (
                      <button key={p.id} onClick={() => toggleCortesia(t, p.id)}
                        className={`rounded-full px-2.5 py-1 text-xs transition ${on ? 'bg-[var(--brand-500)] text-white' : 'bg-[var(--surface-100)] text-[var(--surface-500)]'}`}>
                        {p.nome}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Orçamento e features */}
      <section className="rounded-[var(--radius-lg)] bg-[var(--surface-0)] p-4 shadow-[var(--shadow-sm)]">
        <h2 className="mb-3 text-sm font-semibold text-[var(--surface-700)]">Funcionalidades</h2>
        <Toggle on={cfg.remocao_ativa ?? true} label="Solicitar remoção"
          desc="Botão que abre uma ficha direto do portal"
          onChange={v => up('remocao_ativa', v)} />
        <Toggle on={cfg.sorteio_ativo ?? true} label="Sorteio mensal"
          onChange={v => up('sorteio_ativo', v)} />
        <Toggle on={cfg.bilhete_por_indicacao ?? true} label="1 bilhete por indicação"
          onChange={v => up('bilhete_por_indicacao', v)} />
        <Toggle on={cfg.bilhete_por_mgm ?? true} label="1 bilhete por colega convidado"
          onChange={v => up('bilhete_por_mgm', v)} />
        <Toggle on={cfg.mgm_ativo ?? true} label="Parceiro pode convidar colegas"
          onChange={v => up('mgm_ativo', v)} />
        <Toggle on={cfg.materiais_ativos ?? true} label="Materiais de apoio ao luto"
          onChange={v => up('materiais_ativos', v)} />

        <div className="mt-3 border-t border-[var(--surface-100)] pt-3">
          <span className="mb-1 block text-xs text-[var(--surface-400)]">Validade do orçamento</span>
          <select className={num + ' max-w-[260px]'} value={cfg.orcamento_validade_modo}
            onChange={e => up('orcamento_validade_modo', e.target.value as Config['orcamento_validade_modo'])}>
            <option value="fim_do_dia_seguinte">Até o fim do dia seguinte</option>
            <option value="horas">Por um número de horas</option>
          </select>
          {cfg.orcamento_validade_modo === 'horas' && (
            <input type="number" min={1} className={num + ' mt-2 max-w-[120px]'}
              value={cfg.orcamento_validade_horas ?? 24}
              onChange={e => up('orcamento_validade_horas', Number(e.target.value))} />
          )}
        </div>

        <div className="mt-3 border-t border-[var(--surface-100)] pt-3">
          <span className="mb-1 block text-xs text-[var(--surface-400)]">
            Máximo de parcelas no crédito
          </span>
          <input type="number" min={1} max={24} className={num + ' max-w-[120px]'}
            value={cfg.max_parcelas ?? 12}
            onChange={e => up('max_parcelas', Number(e.target.value))} />
          <p className="mt-1 text-xs text-[var(--surface-400)]">
            Oferecido ao tutor na página do orçamento. Mantenha igual ao `maxParcelas`
            da ficha pública desta unidade (`lib/ficha-unidades.ts`).
          </p>
        </div>
      </section>

      {/* Cidades */}
      <section className="rounded-[var(--radius-lg)] bg-[var(--surface-0)] p-4 shadow-[var(--shadow-sm)]">
        <h2 className="mb-1 text-sm font-semibold text-[var(--surface-700)]">Cidades de cobertura</h2>
        <p className="mb-3 text-xs text-[var(--surface-400)]">
          É a lista da &quot;Região de atuação&quot; dos convites. Vazia, nenhum convite pode ser gerado.
        </p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(cfg.cidades_cobertura ?? []).map(c => (
            <span key={c} className="flex items-center gap-1.5 rounded-full bg-[var(--surface-100)] px-3 py-1.5 text-xs text-[var(--surface-600)]">
              {c}
              <button onClick={() => up('cidades_cobertura', cfg.cidades_cobertura.filter(x => x !== c))}
                aria-label={`Remover ${c}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {(cfg.cidades_cobertura ?? []).length === 0 && (
            <span className="text-xs text-amber-400">Nenhuma cidade — convites bloqueados.</span>
          )}
        </div>
        <div className="flex gap-2">
          <input value={novaCidade} onChange={e => setNovaCidade(e.target.value)}
            placeholder="Adicionar cidade" className={num + ' flex-1'}
            onKeyDown={e => {
              if (e.key === 'Enter' && novaCidade.trim()) {
                e.preventDefault()
                up('cidades_cobertura', [...(cfg.cidades_cobertura ?? []), novaCidade.trim()])
                setNovaCidade('')
              }
            }} />
          <button onClick={() => {
            if (!novaCidade.trim()) return
            up('cidades_cobertura', [...(cfg.cidades_cobertura ?? []), novaCidade.trim()])
            setNovaCidade('')
          }} className="rounded-[var(--radius-sm)] bg-[var(--surface-100)] px-3 text-[var(--surface-600)]">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </section>

      {erro && <p role="alert" className="text-sm text-red-400">{erro}</p>}

      <div className="fixed inset-x-0 bottom-0 border-t border-[var(--surface-200)] bg-[var(--surface-0)]/95 px-4 py-3 backdrop-blur lg:left-[var(--sidebar-w,0)]">
        <div className="mx-auto flex max-w-5xl justify-end">
          <button onClick={salvar} disabled={salvando}
            className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--brand-600)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand-700)] disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : salvo ? <Check className="h-4 w-4" /> : null}
            {salvo ? 'Salvo' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}
