'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, Plus, Check, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'

// ============================================================================
// IndicacaoModal — modal único compartilhado entre /contratos (pipeline),
// /contratos/[id] (detalhe) e /clinicas (Indicações por Mês). Extraído do
// antigo `EditarIndicacaoModal` (só existia em /clinicas, tela sempre com o
// módulo `cb_padronizacao_clinicas` ativo — por isso nunca precisou do modo
// texto). Aqui roda em unidades COM e SEM o módulo, então tem os dois modos:
//
//  - COM módulo: autocomplete de estabelecimentos/contatos (busca existente,
//    cria se digitar um novo) — grava as FKs + espelho texto.
//  - SEM módulo: 2 campos de texto livre — grava só o espelho texto, FKs
//    ficam null. Mesmo comportamento do bloco antigo do TratativaModal.
//
// `temPadronizacaoClinicas` é resolvido pela unidade DONA DO CONTRATO
// (contrato.unidade_id via `allUnidades`), não pela unidade logada — pipeline
// e detalhe mostram contrato de outras unidades pra gerente/super_admin, e
// usar a unidade logada aqui repetiria o bug já mapeado em `2026/96`
// (cb_cremacao_local lendo currentUnit em vez da unidade do contrato).
//
// Self-contained: persiste no Supabase internamente (como CertificadoModal/
// PelinhoModal) e devolve o resultado via `onSuccess` pro pai fazer merge
// otimista local — sem refetch.
// ============================================================================

export type IndicacaoContrato = {
  id: string
  unidade_id: string
  pet_nome?: string | null
  estabelecimento_indicacao_id: string | null
  estabelecimento_indicacao?: { nome: string } | null
  contato_id: string | null
  contato?: { nome: string } | null
  indicacao_clinica: string | null
  indicacao_contato: string | null
}

type IndicacaoUpdate = {
  estabelecimento_indicacao_id: string | null
  contato_id: string | null
  indicacao_clinica: string | null
  indicacao_contato: string | null
}

type Props = {
  contrato: IndicacaoContrato
  onClose: () => void
  onSuccess: (updated: IndicacaoUpdate) => void
}

export default function IndicacaoModal({ contrato, onClose, onSuccess }: Props) {
  const supabase = createClient()
  const { allUnidades } = useUnit()

  const temPadronizacaoClinicas = useMemo(
    () => !!allUnidades.find(u => u.id === contrato.unidade_id)?.modulos_ativos?.includes('cb_padronizacao_clinicas'),
    [allUnidades, contrato.unidade_id]
  )

  // Estabelecimento (clínica que indicou)
  const [estabs, setEstabs] = useState<{ id: string; nome: string; cidade: string | null }[]>([])
  const [estabId, setEstabId] = useState<string | null>(contrato.estabelecimento_indicacao_id)
  const [estabBusca, setEstabBusca] = useState(contrato.indicacao_clinica || '')
  const [estabAberto, setEstabAberto] = useState(false)

  // Contato (pessoa que indicou)
  const [contatos, setContatos] = useState<{ id: string; nome: string; cargo: string | null; estabelecimento_id: string | null }[]>([])
  const [contatoId, setContatoId] = useState<string | null>(contrato.contato_id)
  const [contatoBusca, setContatoBusca] = useState(contrato.indicacao_contato || '')
  const [contatoCargo, setContatoCargo] = useState('')
  const [contatoAberto, setContatoAberto] = useState(false)

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Carrega estabelecimentos/contatos da unidade só no modo com módulo (autocomplete)
  useEffect(() => {
    if (!temPadronizacaoClinicas) return
    supabase.from('estabelecimentos').select('id, nome, cidade').eq('unidade_id', contrato.unidade_id).order('nome')
      .then(({ data }) => { if (data) setEstabs(data as { id: string; nome: string; cidade: string | null }[]) })
  }, [supabase, contrato.unidade_id, temPadronizacaoClinicas])

  useEffect(() => {
    if (!temPadronizacaoClinicas) return
    supabase.from('contatos').select('id, nome, cargo, estabelecimento_id').eq('unidade_id', contrato.unidade_id).eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setContatos(data as { id: string; nome: string; cargo: string | null; estabelecimento_id: string | null }[]) })
  }, [supabase, contrato.unidade_id, temPadronizacaoClinicas])

  const estabsFiltrados = useMemo(() => {
    const t = estabBusca.trim().toLowerCase()
    return estabs.filter(e => !t || e.nome.toLowerCase().includes(t)).slice(0, 8)
  }, [estabs, estabBusca])

  // Filtra por nome; com clínica selecionada, prioriza os contatos dessa clínica + sem-clínica no topo.
  const contatosFiltrados = useMemo(() => {
    const t = contatoBusca.trim().toLowerCase()
    let lista = t ? contatos.filter(c => c.nome.toLowerCase().includes(t)) : contatos
    if (estabId) {
      const desse = lista.filter(c => c.estabelecimento_id === estabId)
      const sem = lista.filter(c => !c.estabelecimento_id)
      const outros = lista.filter(c => c.estabelecimento_id && c.estabelecimento_id !== estabId)
      lista = [...desse, ...sem, ...outros]
    }
    return lista.slice(0, 10)
  }, [contatos, contatoBusca, estabId])

  function nomeEstabDe(id: string | null): string | null {
    if (!id) return null
    return estabs.find(e => e.id === id)?.nome || null
  }

  // Trocar de clínica NÃO zera o contato — só re-prioriza a lista.
  function selecionarEstab(id: string | null, nome: string) {
    setEstabId(id); setEstabBusca(nome); setEstabAberto(false)
  }

  async function salvar() {
    setErro(null)
    setSalvando(true)
    try {
      let resolvedEstabId: string | null = null
      let resolvedContatoId: string | null = null

      if (temPadronizacaoClinicas) {
        // 1. Resolver estabelecimento — cria se digitou um novo
        resolvedEstabId = estabId
        if (!resolvedEstabId && estabBusca.trim()) {
          const { data, error } = await supabase
            .from('estabelecimentos')
            // endereco é NOT NULL sem default — precisa ir como '' senão o insert falha
            .insert({ nome: estabBusca.trim(), tipo: 'clinica', unidade_id: contrato.unidade_id, endereco: '' } as never)
            .select('id').single() as { data: { id: string } | null; error: { message: string } | null }
          if (error) throw new Error('Erro ao criar clínica: ' + error.message)
          resolvedEstabId = data?.id || null
        }

        // 2. Resolver contato — busca existente, senão cria
        resolvedContatoId = contatoId
        if (!resolvedContatoId && contatoBusca.trim()) {
          let q = supabase.from('contatos').select('id').ilike('nome', contatoBusca.trim()).limit(1)
          if (resolvedEstabId) q = q.eq('estabelecimento_id', resolvedEstabId)
          const { data: existente } = await q.maybeSingle() as { data: { id: string } | null }
          if (existente) {
            resolvedContatoId = existente.id
          } else {
            const { data, error } = await supabase
              .from('contatos')
              .insert({ nome: contatoBusca.trim(), cargo: contatoCargo || null, estabelecimento_id: resolvedEstabId, unidade_id: contrato.unidade_id } as never)
              .select('id').single() as { data: { id: string } | null; error: { message: string } | null }
            if (error) throw new Error('Erro ao criar contato: ' + error.message)
            resolvedContatoId = data?.id || null
          }
        }
      }

      const updated: IndicacaoUpdate = {
        estabelecimento_indicacao_id: resolvedEstabId,
        contato_id: resolvedContatoId,
        indicacao_clinica: estabBusca.trim() || null,
        indicacao_contato: contatoBusca.trim() || null,
      }

      const { error: errCtr } = await supabase.from('contratos').update(updated as never).eq('id', contrato.id)
      if (errCtr) throw new Error('Erro ao salvar indicação: ' + errCtr.message)

      onSuccess(updated)
    } catch (e) {
      console.error(e)
      setErro(e instanceof Error ? e.message : 'Erro ao salvar')
      setSalvando(false)
    }
  }

  const contatoIsNovo = temPadronizacaoClinicas && !contatoId && !!contatoBusca.trim() && !contatos.some(c => c.nome.toLowerCase() === contatoBusca.trim().toLowerCase())
  const CARGOS: { v: string; label: string }[] = [
    { v: '', label: 'Sem cargo' },
    { v: 'veterinario', label: 'Veterinário(a)' },
    { v: 'recepcionista', label: 'Recepcionista' },
    { v: 'gerente', label: 'Gerente' },
    { v: 'proprietario', label: 'Proprietário(a)' },
    { v: 'outro', label: 'Outro' },
  ]

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => !salvando && onClose()}>
      <div className="rounded-2xl shadow-2xl w-full max-w-md bg-[var(--surface-0)] border border-[var(--surface-200)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[var(--surface-200)]">
          <h3 className="text-sm font-semibold text-[var(--shell-text)]">Indicação{contrato.pet_nome ? ` · ${contrato.pet_nome}` : ''}</h3>
          <button onClick={onClose} disabled={salvando} className="p-1 rounded hover:bg-[var(--surface-100)] text-[var(--surface-500)]"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Clínica de indicação */}
          <div className="relative">
            <label className="block text-xs font-medium text-[var(--surface-500)] mb-1">Clínica de indicação</label>
            {temPadronizacaoClinicas ? (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--surface-400)]" />
                  <input
                    value={estabBusca}
                    onChange={e => { setEstabBusca(e.target.value); setEstabId(null); setEstabAberto(true) }}
                    onFocus={() => setEstabAberto(true)}
                    placeholder="Buscar ou criar clínica..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-[var(--surface-50)] border border-[var(--surface-200)] text-[var(--shell-text)] outline-none focus:border-cyan-500"
                  />
                </div>
                {estabAberto && (estabsFiltrados.length > 0 || estabBusca.trim()) && (
                  <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-[var(--surface-0)] border border-[var(--surface-200)] rounded-lg shadow-lg">
                    {estabsFiltrados.map(e => (
                      <button key={e.id} type="button" onClick={() => selecionarEstab(e.id, e.nome)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-50)] flex items-center justify-between ${estabId === e.id ? 'bg-[var(--surface-50)] font-medium' : 'text-[var(--surface-600)]'}`}>
                        <span>{e.nome}</span>{e.cidade && <span className="text-xs text-[var(--surface-400)]">{e.cidade}</span>}
                      </button>
                    ))}
                    {estabBusca.trim() && !estabs.some(e => e.nome.toLowerCase() === estabBusca.trim().toLowerCase()) && (
                      <button type="button" onClick={() => { setEstabId(null); setEstabAberto(false); setContatoId(null); setContatoBusca('') }}
                        className="w-full text-left px-3 py-2 text-sm text-amber-500 hover:bg-amber-500/10 flex items-center gap-2 border-t border-[var(--surface-100)]">
                        <Plus className="h-3.5 w-3.5" />Criar &quot;{estabBusca.trim()}&quot;
                      </button>
                    )}
                  </div>
                )}
                {estabId && <p className="mt-1 text-xs text-green-500 flex items-center gap-1"><Check className="h-3 w-3" />Clínica cadastrada</p>}
                {!estabId && estabBusca.trim() && !estabAberto && <p className="mt-1 text-xs text-amber-500">Nova clínica será criada</p>}
              </>
            ) : (
              <input
                value={estabBusca}
                onChange={e => setEstabBusca(e.target.value)}
                placeholder="Nome do hospital ou clínica"
                className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface-50)] border border-[var(--surface-200)] text-[var(--shell-text)] outline-none focus:border-cyan-500"
              />
            )}
          </div>

          {/* Contato que indicou */}
          <div className="relative">
            <label className="block text-xs font-medium text-[var(--surface-500)] mb-1">Contato que indicou</label>
            {temPadronizacaoClinicas ? (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--surface-400)]" />
                  <input
                    value={contatoBusca}
                    onChange={e => { setContatoBusca(e.target.value); setContatoId(null); setContatoAberto(true) }}
                    onFocus={() => setContatoAberto(true)}
                    placeholder="Buscar contato ou digitar um novo..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-[var(--surface-50)] border border-[var(--surface-200)] text-[var(--shell-text)] outline-none focus:border-cyan-500"
                  />
                </div>
                {contatoAberto && (contatosFiltrados.length > 0 || contatoBusca.trim()) && (
                  <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-[var(--surface-0)] border border-[var(--surface-200)] rounded-lg shadow-lg">
                    {contatosFiltrados.map(c => (
                      <button key={c.id} type="button" onClick={() => {
                        setContatoId(c.id); setContatoBusca(c.nome); setContatoAberto(false)
                        // Auto-preenche a clínica do contato se nenhuma estiver selecionada (igual ficha)
                        if (c.estabelecimento_id && !estabId) {
                          const nome = nomeEstabDe(c.estabelecimento_id)
                          if (nome) { setEstabId(c.estabelecimento_id); setEstabBusca(nome) }
                        }
                      }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-50)] flex flex-col ${contatoId === c.id ? 'bg-[var(--surface-50)] font-medium' : 'text-[var(--surface-600)]'}`}>
                        <span>{c.nome}</span>
                        {(() => { const sub = [c.cargo, nomeEstabDe(c.estabelecimento_id)].filter(Boolean).join(' · '); return sub ? <span className="text-[11px] text-[var(--surface-400)]">{sub}</span> : null })()}
                      </button>
                    ))}
                    {contatoBusca.trim() && !contatos.some(c => c.nome.toLowerCase() === contatoBusca.trim().toLowerCase()) && (
                      <button type="button" onClick={() => setContatoAberto(false)}
                        className="w-full text-left px-3 py-2 text-sm text-amber-500 hover:bg-amber-500/10 flex items-center gap-2 border-t border-[var(--surface-100)]">
                        <Plus className="h-3.5 w-3.5" />Criar &quot;{contatoBusca.trim()}&quot;
                      </button>
                    )}
                  </div>
                )}
                {contatoId && <p className="mt-1 text-xs text-green-500 flex items-center gap-1"><Check className="h-3 w-3" />Contato cadastrado</p>}
                {contatoIsNovo && (
                  <div className="mt-2">
                    <label className="block text-[10px] uppercase text-[var(--surface-400)] mb-1">Cargo do novo contato</label>
                    <select value={contatoCargo} onChange={e => setContatoCargo(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface-50)] border border-[var(--surface-200)] text-[var(--shell-text)] outline-none">
                      {CARGOS.map(c => <option key={c.v} value={c.v}>{c.label}</option>)}
                    </select>
                  </div>
                )}
              </>
            ) : (
              <input
                value={contatoBusca}
                onChange={e => setContatoBusca(e.target.value)}
                placeholder="ex: Dra. Maria ou Recep. João"
                className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface-50)] border border-[var(--surface-200)] text-[var(--shell-text)] outline-none focus:border-cyan-500"
              />
            )}
          </div>

          {erro && <p className="text-xs text-red-500">{erro}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-[var(--surface-200)]">
          <button onClick={onClose} disabled={salvando} className="px-4 py-2 rounded-lg text-sm text-[var(--surface-500)] hover:bg-[var(--surface-100)] disabled:opacity-50">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-4 py-2 rounded-lg text-sm font-semibold bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50 inline-flex items-center gap-2">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
