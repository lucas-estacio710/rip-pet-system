'use client'

// /admin/planos — catálogo de PLANOS por unidade (super_admin).
// Modelo híbrido: plano nomeado (nome + o que inclui) com preço por FAIXA DE PESO.
// Consumido pela ficha pública de EM: unidade com planos ativos → tutor escolhe
// o plano no formulário (mig 098).

import { useEffect, useState, useCallback } from 'react'
import {
  Layers, Search, X, Plus, Loader2, ToggleLeft, ToggleRight, Pencil, Trash2, Upload
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

const UNIT_COLORS: Record<string, string> = {
  ST: '#7c3aed', SP: '#ef4444', CP: '#22c55e', SJ: '#cbd5e1',
  RS: '#f59e0b', PA: '#ec4899', PI: '#06b6d4', MA: '#f97316',
}

type Plano = {
  id: string
  unidade_id: string
  tipo_cremacao: 'individual' | 'coletiva'
  nome: string
  descricao: string | null
  imagem_url: string | null
  preco: number
  adicional_peso_kg: number
  adicional_valor: number
  ativo: boolean
  ordem: number
  unidade?: { nome: string; codigo: string }
  plano_grupos?: PlanoGrupo[]
}

type PlanoGrupo = {
  id?: string
  nome: string
  escolha_min: number
  escolha_max: number
  ordem: number
  plano_itens?: PlanoItem[]
}

type PlanoItem = {
  id?: string
  produto_id: string | null
  modo: 'incluso' | 'desconto'
  preco_desconto: number | null
  nome: string
  imagem_url: string | null
  ordem: number
}

// Grupo em edição no form (itens embutidos)
type FormGrupo = {
  nome: string
  min: number | ''
  max: number | ''
  itens: PlanoItem[]
}

type ProdutoCatalogo = {
  id: string
  nome: string
  tipo: string
  preco: number
  imagem_url: string | null
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })

export default function AdminPlanosPage() {
  const supabase = createClient()
  const { isSuperAdmin, allUnidades } = useUnit()

  const [planos, setPlanos] = useState<Plano[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroUnidade, setFiltroUnidade] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Form (criar/editar)
  const [formId, setFormId] = useState<string | null>(null)
  const [formNome, setFormNome] = useState('')
  const [formDescricao, setFormDescricao] = useState('')
  const [formUnidadeId, setFormUnidadeId] = useState('')
  const [formTipo, setFormTipo] = useState<'individual' | 'coletiva'>('individual')
  const [formOrdem, setFormOrdem] = useState<number | ''>(100)
  const [formPreco, setFormPreco] = useState<number | ''>('')
  const [formAdicionalPeso, setFormAdicionalPeso] = useState<number | ''>(45)
  const [formAdicionalValor, setFormAdicionalValor] = useState<number | ''>(0)
  // Grupos de escolha do plano (estilo iFood: nome + min/max + itens do catálogo)
  const [formGrupos, setFormGrupos] = useState<FormGrupo[]>([])
  const [grupoBuscaIdx, setGrupoBuscaIdx] = useState<number | null>(null)
  const [buscaProduto, setBuscaProduto] = useState('')
  const [produtosBusca, setProdutosBusca] = useState<ProdutoCatalogo[]>([])
  // Imagem do plano (upload no bucket fotos, mesmo do catálogo — mig 092)
  const [formImagemUrl, setFormImagemUrl] = useState<string | null>(null)
  const [uploadingImg, setUploadingImg] = useState(false)

  async function uploadImagemPlano(file: File) {
    setUploadingImg(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `planos/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('fotos')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (upErr) {
        alert('Falha no upload: ' + upErr.message)
        return
      }
      const { data: pub } = supabase.storage.from('fotos').getPublicUrl(path)
      setFormImagemUrl(pub.publicUrl)
    } finally {
      setUploadingImg(false)
    }
  }

  // Busca no catálogo (produtos ativos) pro picker de itens
  useEffect(() => {
    if (!showModal || buscaProduto.trim().length < 2) { setProdutosBusca([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('produtos')
        .select('id, nome, tipo, preco, imagem_url')
        .eq('ativo', true)
        .ilike('nome', `%${buscaProduto.trim()}%`)
        .order('nome')
        .limit(8)
      setProdutosBusca((data || []) as ProdutoCatalogo[])
    }, 300)
    return () => clearTimeout(t)
  }, [buscaProduto, showModal, supabase])

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('planos')
      .select('*, unidade:unidades(nome, codigo), plano_grupos(*, plano_itens(*))')
      .order('unidade_id')
      .order('tipo_cremacao')
      .order('ordem')
    if (error) {
      console.error('Erro ao carregar planos:', error)
      setPlanos([])
    } else {
      setPlanos((data || []) as Plano[])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { if (isSuperAdmin) carregar() }, [isSuperAdmin, carregar])

  const filtrados = planos.filter(p => {
    if (busca && !p.nome.toLowerCase().includes(busca.toLowerCase())) return false
    if (filtroUnidade && p.unidade_id !== filtroUnidade) return false
    return true
  })

  function abrirCriar() {
    setFormId(null)
    setFormNome('')
    setFormDescricao('')
    setFormUnidadeId(allUnidades[0]?.id || '')
    setFormTipo('individual')
    setFormOrdem(100)
    setFormPreco('')
    setFormAdicionalPeso(45)
    setFormAdicionalValor(0)
    setFormGrupos([])
    setGrupoBuscaIdx(null)
    setBuscaProduto('')
    setFormImagemUrl(null)
    setShowModal(true)
  }

  function abrirEditar(p: Plano) {
    setFormId(p.id)
    setFormNome(p.nome)
    setFormDescricao(p.descricao || '')
    setFormUnidadeId(p.unidade_id)
    setFormTipo(p.tipo_cremacao)
    setFormOrdem(p.ordem)
    setFormPreco(p.preco)
    setFormAdicionalPeso(p.adicional_peso_kg)
    setFormAdicionalValor(p.adicional_valor)
    setFormGrupos(
      [...(p.plano_grupos || [])]
        .sort((a, b) => a.ordem - b.ordem)
        .map(g => ({
          nome: g.nome,
          min: g.escolha_min,
          max: g.escolha_max,
          itens: [...(g.plano_itens || [])].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome)),
        }))
    )
    setGrupoBuscaIdx(null)
    setBuscaProduto('')
    setFormImagemUrl(p.imagem_url)
    setShowModal(true)
  }

  const formValido = formNome.trim() && formUnidadeId && formPreco !== '' && Number(formPreco) > 0

  async function salvar() {
    if (!formValido) return
    setSaving(true)
    const payload = {
      nome: formNome.trim(),
      descricao: formDescricao.trim() || null,
      unidade_id: formUnidadeId,
      tipo_cremacao: formTipo,
      ordem: formOrdem === '' ? 100 : Number(formOrdem),
      preco: Number(formPreco),
      adicional_peso_kg: formAdicionalPeso === '' ? 45 : Number(formAdicionalPeso),
      adicional_valor: formAdicionalValor === '' ? 0 : Number(formAdicionalValor),
      imagem_url: formImagemUrl,
    }
    // Upsert do plano (precisa do id pra gravar os itens)
    let planoId = formId
    if (formId) {
      const { error } = await supabase.from('planos').update(payload as never).eq('id', formId)
      if (error) { alert('Erro ao salvar: ' + error.message); setSaving(false); return }
    } else {
      const { data, error } = await supabase.from('planos').insert({ ...payload, ativo: true } as never).select('id').single()
      if (error || !data) { alert('Erro ao salvar: ' + (error?.message || 'sem retorno')); setSaving(false); return }
      planoId = (data as { id: string }).id
    }

    // Grupos + itens: substitui em lote (delete grupos → cascade apaga itens → insert)
    const { error: delErr } = await supabase.from('plano_grupos').delete().eq('plano_id', planoId!)
    if (delErr) { alert('Erro ao atualizar grupos: ' + delErr.message); setSaving(false); return }
    // Itens órfãos de versões antigas (sem grupo_id)
    await supabase.from('plano_itens').delete().eq('plano_id', planoId!)

    for (let gi = 0; gi < formGrupos.length; gi++) {
      const g = formGrupos[gi]
      const min = g.min === '' ? 0 : Math.max(0, Number(g.min))
      const max = Math.max(1, g.max === '' ? 1 : Number(g.max), min || 1)
      const { data: grupoRow, error: gErr } = await supabase
        .from('plano_grupos')
        .insert({ plano_id: planoId, nome: g.nome.trim() || `Grupo ${gi + 1}`, escolha_min: min, escolha_max: max, ordem: gi } as never)
        .select('id')
        .single()
      if (gErr || !grupoRow) { alert('Erro ao gravar grupo: ' + (gErr?.message || 'sem retorno')); setSaving(false); return }
      if (g.itens.length > 0) {
        const rows = g.itens.map((it, i) => ({
          plano_id: planoId,
          grupo_id: (grupoRow as { id: string }).id,
          produto_id: it.produto_id,
          modo: it.modo,
          preco_desconto: it.modo === 'desconto' ? (it.preco_desconto ?? 0) : null,
          nome: it.nome,
          imagem_url: it.imagem_url,
          ordem: i,
        }))
        const { error: insErr } = await supabase.from('plano_itens').insert(rows as never)
        if (insErr) { alert('Erro ao gravar itens: ' + insErr.message); setSaving(false); return }
      }
    }

    setShowModal(false)
    await carregar()
    setSaving(false)
  }

  async function toggleAtivo(p: Plano) {
    setTogglingId(p.id)
    const { error } = await supabase.from('planos').update({ ativo: !p.ativo } as never).eq('id', p.id)
    if (!error) setPlanos(prev => prev.map(x => x.id === p.id ? { ...x, ativo: !x.ativo } : x))
    setTogglingId(null)
  }

  async function excluir(p: Plano) {
    if (!confirm(`Excluir o plano "${p.nome}"? (Pra tirar da ficha sem perder o cadastro, prefira desativar.)`)) return
    const { error } = await supabase.from('planos').delete().eq('id', p.id)
    if (error) alert('Erro ao excluir: ' + error.message)
    else setPlanos(prev => prev.filter(x => x.id !== p.id))
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-[var(--surface-400)]">Acesso restrito a administradores.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--surface-800)] flex items-center gap-2">
            <Layers className="h-5 w-5 text-[var(--brand-500)]" />
            Planos
          </h1>
          <p className="text-sm text-[var(--surface-400)] mt-1">
            Unidade com planos ativos → o tutor escolhe o plano na ficha pública
          </p>
        </div>
        <button
          onClick={abrirCriar}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ background: '#7c3aed' }}
        >
          <Plus className="h-4 w-4" />
          Novo Plano
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--surface-400)]" />
          <input
            type="text"
            placeholder="Buscar por nome..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="input pl-10 w-full"
          />
          {busca && (
            <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-[var(--surface-400)]" />
            </button>
          )}
        </div>
        <select value={filtroUnidade} onChange={e => setFiltroUnidade(e.target.value)} className="input min-w-[180px]">
          <option value="">Todas as unidades</option>
          {allUnidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Nenhum plano cadastrado"
          description="Cadastre o primeiro plano — a ficha pública da unidade passa a oferecer a escolha automaticamente"
        />
      ) : (
        <div className="space-y-3">
          {filtrados.map(p => {
            const u = p.unidade as { nome: string; codigo: string } | undefined
            return (
              <div key={p.id} className={`rounded-xl border border-[var(--surface-200)] p-4 ${p.ativo ? '' : 'opacity-50'}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[220px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center font-bold shrink-0"
                        style={{ background: UNIT_COLORS[u?.codigo || ''] || '#6366f1', color: u?.codigo === 'SJ' ? '#334155' : '#fff', fontSize: 8 }}
                      >
                        {u?.codigo || '??'}
                      </div>
                      <span className="font-semibold text-[var(--surface-800)]">{p.nome}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        p.tipo_cremacao === 'individual' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-purple-900/30 text-purple-400'
                      }`}>
                        {p.tipo_cremacao}
                      </span>
                      {!p.ativo && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-900/30 text-red-400">Inativo</span>
                      )}
                    </div>
                    {p.descricao && <p className="text-xs text-[var(--surface-400)] mt-1">{p.descricao}</p>}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-mono text-[11px] px-2 py-0.5 rounded bg-[var(--surface-100)] text-[var(--surface-600)]">
                        {fmtBRL(p.preco)}
                      </span>
                      {p.adicional_valor > 0 && (
                        <span className="text-mono text-[11px] px-2 py-0.5 rounded bg-amber-900/20 text-amber-500">
                          +{fmtBRL(p.adicional_valor)} acima de {p.adicional_peso_kg}kg
                        </span>
                      )}
                      {(() => {
                        const nItens = (p.plano_grupos || []).reduce((acc, g) => acc + (g.plano_itens?.length || 0), 0)
                        return nItens > 0 ? (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-blue-900/20 text-blue-400">
                            {(p.plano_grupos || []).length} {(p.plano_grupos || []).length === 1 ? 'grupo' : 'grupos'} · {nItens} {nItens === 1 ? 'item' : 'itens'}
                          </span>
                        ) : null
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => abrirEditar(p)} className="p-1.5 rounded-lg hover:bg-[var(--surface-100)] transition-colors" title="Editar">
                      <Pencil className="h-4 w-4 text-[var(--surface-400)]" />
                    </button>
                    <button
                      onClick={() => toggleAtivo(p)}
                      disabled={togglingId === p.id}
                      className="p-1.5 rounded-lg hover:bg-[var(--surface-100)] transition-colors disabled:opacity-50"
                      title={p.ativo ? 'Desativar' : 'Ativar'}
                    >
                      {togglingId === p.id ? (
                        <Loader2 className="h-5 w-5 animate-spin text-[var(--surface-400)]" />
                      ) : p.ativo ? (
                        <ToggleRight className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-[var(--surface-400)]" />
                      )}
                    </button>
                    <button onClick={() => excluir(p)} className="p-1.5 rounded-lg hover:bg-red-900/20 transition-colors" title="Excluir">
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal criar/editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-lg rounded-2xl shadow-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto"
            style={{ background: 'var(--surface-card, #1e293b)', border: '1px solid var(--surface-200)' }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--surface-800)]">{formId ? 'Editar Plano' : 'Novo Plano'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-[var(--surface-100)]">
                <X className="h-5 w-5 text-[var(--surface-400)]" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--surface-600)] mb-1">Unidade <span className="text-red-400">*</span></label>
                  <select value={formUnidadeId} onChange={e => setFormUnidadeId(e.target.value)} className="input w-full">
                    {allUnidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--surface-600)] mb-1">Cremação <span className="text-red-400">*</span></label>
                  <select value={formTipo} onChange={e => setFormTipo(e.target.value as 'individual' | 'coletiva')} className="input w-full">
                    <option value="individual">Individual</option>
                    <option value="coletiva">Coletiva</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--surface-600)] mb-1">Nome do plano <span className="text-red-400">*</span></label>
                <input type="text" value={formNome} onChange={e => setFormNome(e.target.value)} placeholder="Ex: Plano Memórias" className="input w-full" autoFocus />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--surface-600)] mb-1">O que inclui (aparece pro tutor)</label>
                <textarea
                  value={formDescricao}
                  onChange={e => setFormDescricao(e.target.value)}
                  placeholder="Ex: Molde da patinha + urna MDF + pelinho + certificado"
                  rows={2}
                  className="input w-full resize-none"
                />
              </div>

              {/* Imagem do plano (aparece no card da ficha pública) */}
              <div>
                <label className="block text-sm font-medium text-[var(--surface-600)] mb-1">Imagem do plano</label>
                <div className="flex items-center gap-3">
                  {formImagemUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={formImagemUrl} alt="" className="w-20 h-14 rounded-lg object-cover border border-[var(--surface-200)]" />
                  ) : (
                    <div className="w-20 h-14 rounded-lg bg-[var(--surface-100)] border border-dashed border-[var(--surface-300)] flex items-center justify-center text-[10px] text-[var(--surface-400)]">
                      sem foto
                    </div>
                  )}
                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer border border-[var(--surface-200)] hover:bg-[var(--surface-100)] transition-colors text-[var(--surface-600)]">
                    {uploadingImg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploadingImg ? 'Enviando...' : formImagemUrl ? 'Trocar imagem' : 'Enviar imagem'}
                    <input
                      type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadImagemPlano(f); e.target.value = '' }}
                    />
                  </label>
                  {formImagemUrl && (
                    <button onClick={() => setFormImagemUrl(null)} className="text-xs text-red-400 hover:underline">Remover</button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--surface-600)] mb-1">Preço (R$) <span className="text-red-400">*</span></label>
                  <input
                    type="number" min={0} step="10" value={formPreco}
                    onChange={e => setFormPreco(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="1490" className="input w-full text-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--surface-600)] mb-1">Adicional acima de (kg)</label>
                  <input
                    type="number" min={1} value={formAdicionalPeso}
                    onChange={e => setFormAdicionalPeso(e.target.value === '' ? '' : Number(e.target.value))}
                    className="input w-full text-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--surface-600)] mb-1">Valor adicional (R$)</label>
                  <input
                    type="number" min={0} step="10" value={formAdicionalValor}
                    onChange={e => setFormAdicionalValor(e.target.value === '' ? '' : Number(e.target.value))}
                    className="input w-full text-mono text-sm"
                  />
                </div>
                <p className="col-span-3 text-[11px] text-[var(--surface-400)] -mt-1">
                  Pets com peso acima do limite pagam preço + adicional (a ficha já mostra o valor final pro tutor). Adicional R$ 0 = sem cobrança extra.
                </p>
              </div>

              {/* Grupos de escolha — estilo iFood: nome + quantas escolhas + itens do catálogo */}
              <div className="border-t border-[var(--surface-200)] pt-3">
                <label className="block text-sm font-medium text-[var(--surface-600)] mb-1">
                  Grupos de escolha (urnas / recordações)
                </label>
                <p className="text-[11px] text-[var(--surface-400)] mb-2">
                  Cada grupo tem nome livre e quantas escolhas o tutor faz (mín. 0 = opcional).
                  Incluso = R$ 0; Desconto = upgrade com o preço que você definir.
                </p>

                <div className="space-y-3">
                  {formGrupos.map((g, gi) => (
                    <div key={gi} className="rounded-lg border border-[var(--surface-200)] p-2.5 space-y-2">
                      {/* Cabeçalho do grupo: nome + min/max + remover */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text" value={g.nome}
                          onChange={e => setFormGrupos(prev => prev.map((x, j) => j === gi ? { ...x, nome: e.target.value } : x))}
                          placeholder="Nome do grupo (ex: Urna)" className="input flex-1 text-sm py-1.5"
                        />
                        <label className="text-[10px] text-[var(--surface-400)]">mín</label>
                        <input
                          type="number" min={0} value={g.min}
                          onChange={e => setFormGrupos(prev => prev.map((x, j) => j === gi ? { ...x, min: e.target.value === '' ? '' : Number(e.target.value) } : x))}
                          className="input w-14 text-mono text-xs py-1.5" title="Escolhas mínimas (0 = opcional)"
                        />
                        <label className="text-[10px] text-[var(--surface-400)]">máx</label>
                        <input
                          type="number" min={1} value={g.max}
                          onChange={e => setFormGrupos(prev => prev.map((x, j) => j === gi ? { ...x, max: e.target.value === '' ? '' : Number(e.target.value) } : x))}
                          className="input w-14 text-mono text-xs py-1.5" title="Escolhas máximas"
                        />
                        <button onClick={() => setFormGrupos(prev => prev.filter((_, j) => j !== gi))} className="p-1 rounded hover:bg-red-900/20 shrink-0" title="Remover grupo">
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </button>
                      </div>

                      {/* Itens do grupo */}
                      {g.itens.map((it, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)]">
                          {it.imagem_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={it.imagem_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                          )}
                          <span className="text-xs text-[var(--surface-700)] flex-1 min-w-0 truncate" title={it.nome}>{it.nome}</span>
                          <button
                            type="button"
                            onClick={() => setFormGrupos(prev => prev.map((x, j) => j === gi ? { ...x, itens: x.itens.map((y, k) => k === i ? { ...y, modo: y.modo === 'incluso' ? 'desconto' : 'incluso', preco_desconto: y.modo === 'incluso' ? (y.preco_desconto ?? 0) : null } : y) } : x))}
                            className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors ${
                              it.modo === 'incluso' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-amber-900/30 text-amber-400'
                            }`}
                            title="Alternar Incluso / Desconto"
                          >
                            {it.modo === 'incluso' ? 'Incluso' : 'Desconto'}
                          </button>
                          {it.modo === 'desconto' && (
                            <input
                              type="number" min={0} step="10" value={it.preco_desconto ?? ''}
                              onChange={e => setFormGrupos(prev => prev.map((x, j) => j === gi ? { ...x, itens: x.itens.map((y, k) => k === i ? { ...y, preco_desconto: e.target.value === '' ? null : Number(e.target.value) } : y) } : x))}
                              placeholder="R$" className="input w-20 text-mono text-xs py-1"
                            />
                          )}
                          <button
                            onClick={() => setFormGrupos(prev => prev.map((x, j) => j === gi ? { ...x, itens: x.itens.filter((_, k) => k !== i) } : x))}
                            className="p-1 rounded hover:bg-red-900/20 shrink-0" title="Remover"
                          >
                            <X className="h-3.5 w-3.5 text-red-400" />
                          </button>
                        </div>
                      ))}

                      {/* Picker do catálogo deste grupo */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--surface-400)]" />
                        <input
                          type="text"
                          placeholder="Buscar produto do catálogo pra este grupo..."
                          value={grupoBuscaIdx === gi ? buscaProduto : ''}
                          onFocus={() => { setGrupoBuscaIdx(gi); setBuscaProduto(''); setProdutosBusca([]) }}
                          onChange={e => { setGrupoBuscaIdx(gi); setBuscaProduto(e.target.value) }}
                          className="input pl-10 w-full text-sm"
                        />
                        {grupoBuscaIdx === gi && produtosBusca.length > 0 && (
                          <div className="absolute z-10 left-0 right-0 mt-1 rounded-lg border border-[var(--surface-200)] shadow-xl max-h-56 overflow-y-auto" style={{ background: 'var(--surface-card, #1e293b)' }}>
                            {produtosBusca.map(prod => (
                              <button
                                key={prod.id}
                                type="button"
                                onClick={() => {
                                  setFormGrupos(prev => prev.map((x, j) => j === gi ? {
                                    ...x,
                                    itens: [...x.itens, {
                                      produto_id: prod.id,
                                      modo: 'incluso',
                                      preco_desconto: null,
                                      nome: prod.nome,
                                      imagem_url: prod.imagem_url,
                                      ordem: x.itens.length,
                                    }],
                                  } : x))
                                  setBuscaProduto('')
                                  setProdutosBusca([])
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface-100)] transition-colors"
                              >
                                {prod.imagem_url && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={prod.imagem_url} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                                )}
                                <span className="text-xs text-[var(--surface-700)] flex-1 truncate">{prod.nome}</span>
                                <span className="text-[10px] text-[var(--surface-400)] uppercase">{prod.tipo}</span>
                                <span className="text-mono text-[11px] text-[var(--surface-500)]">{fmtBRL(prod.preco)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setFormGrupos(prev => [...prev, { nome: '', min: 1, max: 1, itens: [] }])}
                  className="mt-2 flex items-center gap-1 text-xs text-[var(--brand-500)] hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar grupo
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--surface-600)] mb-1">Ordem de exibição</label>
                <input
                  type="number" value={formOrdem}
                  onChange={e => setFormOrdem(e.target.value === '' ? '' : Number(e.target.value))}
                  className="input w-24 text-mono text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--surface-600)] hover:bg-[var(--surface-100)] transition-colors">
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={saving || !formValido}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
                style={{ background: '#7c3aed' }}
              >
                {saving ? (
                  <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</span>
                ) : formId ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
