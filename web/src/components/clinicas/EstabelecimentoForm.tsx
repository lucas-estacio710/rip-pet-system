'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Save, Trash2, MapPin, Phone, Mail, Users, BarChart3, Briefcase, Camera, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import GooglePlacesSearch, { PlaceResult } from '@/components/clinicas/GooglePlacesSearch'

// ============================================
// Tipos
// ============================================
export type EstabelecimentoFormData = {
  id?: string
  unidade_id?: string | null
  nome: string
  tipo: string | null
  endereco: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  telefone: string | null
  whatsapp: string | null
  email: string | null
  website: string | null
  instagram: string | null
  horario_funcionamento: string | null
  latitude: number | null
  longitude: number | null
  observacoes: string | null
  fotos: string[] | null
  porte_equipe: string | null
  veterinarios_fixos: number | null
  veterinarios_volantes: number | null
  ilha_de_exibicao: string[] | null
  politica_concorrencia: string | null
  concorrentes_presentes: string[] | null
  qtde_media_obitos_mensal: number | null
  percentual_prefeitura: number | null
  valor_prefeitura_10kg: number | null
  modelo_gratificacao: string | null
  estrategia: string | null
}

// ============================================
// Catálogos
// ============================================
const TIPOS = [
  { value: 'clinica', label: 'Clínica' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'pet_shop', label: 'Pet Shop' },
  { value: 'casa-racao', label: 'Casa de Ração' },
  { value: 'laboratorio', label: 'Laboratório' },
  { value: 'autonomo', label: 'Autônomo' },
  { value: 'veterinario', label: 'Veterinário' },
  { value: 'outro', label: 'Outro' },
]

const PORTES = [
  { value: 'ate_5', label: 'Até 5 funcionários' },
  { value: '5_10', label: '5 a 10 funcionários' },
  { value: '10_15', label: '10 a 15 funcionários' },
  { value: 'mais_15', label: 'Mais de 15 funcionários' },
]

const POLITICAS = [
  { value: 'aberto_todos', label: 'Aberto a todos', icon: '🔓' },
  { value: 'seletivo', label: 'Seletivo', icon: '🎯' },
  { value: 'parceiro_exclusivo_nosso', label: 'Exclusivo conosco', icon: '⭐' },
  { value: 'parceiro_exclusivo_outro', label: 'Exclusivo com outro', icon: '🚫' },
  { value: 'nao_indica', label: 'Não indica', icon: '❌' },
]

const ILHAS = [
  { value: 'recepcao', label: 'Recepção' },
  { value: 'consultorios', label: 'Consultórios' },
  { value: 'veterinarios', label: 'Direto com veterinários' },
  { value: 'nenhum', label: 'Nenhum local' },
]

const CONCORRENTES = [
  { value: 'pet_memorial', label: 'Pet Memorial' },
  { value: 'allma', label: 'Allma' },
  { value: 'luna_pet', label: 'Luna Pet' },
  { value: 'pet_assistencia', label: 'Pet Assistência' },
  { value: 'eden_pet', label: 'Eden Pet' },
  { value: 'mypetmemo', label: 'MyPetMemo' },
]

const GRATIFICACOES = [
  { value: 'direto_clinica', label: 'Direto para clínica' },
  { value: 'direto_veterinarios', label: 'Direto para veterinários' },
  { value: 'indireto_veterinarios', label: 'Indireto para veterinários' },
  { value: 'brindes_tutores', label: 'Brindes para tutores' },
  { value: 'desconto_tutores', label: 'Desconto para tutores' },
  { value: 'nao_aceita', label: 'Não aceita' },
]

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

// ============================================
// Helpers
// ============================================
function novoEstabelecimentoVazio(unidadeId: string | null): EstabelecimentoFormData {
  return {
    unidade_id: unidadeId,
    nome: '',
    tipo: 'clinica',
    endereco: null, bairro: null, cidade: null, estado: 'SP', cep: null,
    telefone: null, whatsapp: null, email: null, website: null, instagram: null,
    horario_funcionamento: null, latitude: null, longitude: null, observacoes: null,
    fotos: [],
    porte_equipe: null, veterinarios_fixos: null, veterinarios_volantes: null,
    ilha_de_exibicao: [], politica_concorrencia: null, concorrentes_presentes: [],
    qtde_media_obitos_mensal: null, percentual_prefeitura: null, valor_prefeitura_10kg: null,
    modelo_gratificacao: null, estrategia: null,
  }
}

// Campos cuja alteração vale a pena logar em historico_alteracoes
const CAMPOS_ESTRATEGICOS: Array<{
  key: keyof EstabelecimentoFormData
  label: string
  formatar?: (v: unknown, ctx: Record<string, Record<string, string>>) => string
  tipo: 'alteracao' | 'conquista' | 'alerta'
}> = [
  { key: 'politica_concorrencia', label: 'Política de concorrência', tipo: 'alteracao',
    formatar: (v) => {
      const labels: Record<string, string> = {
        aberto_todos: 'Aberto a todos', seletivo: 'Seletivo',
        parceiro_exclusivo_nosso: 'Exclusivo conosco',
        parceiro_exclusivo_outro: 'Exclusivo com outro', nao_indica: 'Não indica',
      }
      return v ? (labels[v as string] || String(v)) : '—'
    }
  },
  { key: 'modelo_gratificacao', label: 'Modelo de gratificação', tipo: 'alteracao',
    formatar: (v) => {
      const labels: Record<string, string> = {
        direto_clinica: 'Direto p/ clínica', direto_veterinarios: 'Direto p/ vets',
        indireto_veterinarios: 'Indireto p/ vets', brindes_tutores: 'Brindes p/ tutores',
        desconto_tutores: 'Desconto p/ tutores', nao_aceita: 'Não aceita',
      }
      return v ? (labels[v as string] || String(v)) : '—'
    }
  },
  { key: 'qtde_media_obitos_mensal', label: 'Média mensal de óbitos', tipo: 'alteracao',
    formatar: (v) => v != null ? `${v}` : '—'
  },
  { key: 'percentual_prefeitura', label: '% Prefeitura', tipo: 'alteracao',
    formatar: (v) => v != null ? `${v}%` : '—'
  },
  { key: 'valor_prefeitura_10kg', label: 'Valor prefeitura 10kg', tipo: 'alteracao',
    formatar: (v) => v != null ? `R$ ${v}` : '—'
  },
  { key: 'estrategia', label: 'Estratégia', tipo: 'alteracao' },
  { key: 'ilha_de_exibicao', label: 'Ilha de exibição', tipo: 'alteracao',
    formatar: (v) => Array.isArray(v) && v.length > 0 ? v.join(', ') : '—'
  },
  { key: 'concorrentes_presentes', label: 'Concorrentes presentes', tipo: 'alteracao',
    formatar: (v) => Array.isArray(v) && v.length > 0 ? v.join(', ') : 'nenhum'
  },
  { key: 'tipo', label: 'Tipo', tipo: 'alteracao' },
  { key: 'nome', label: 'Nome', tipo: 'alteracao' },
]

function diffEstrategico(antes: EstabelecimentoFormData, depois: EstabelecimentoFormData) {
  const diffs: Array<{ campo: string; campo_label: string; valor_anterior: string; valor_novo: string; tipo: string }> = []
  for (const def of CAMPOS_ESTRATEGICOS) {
    const a = antes[def.key]
    const b = depois[def.key]
    const eq = Array.isArray(a) && Array.isArray(b)
      ? JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
      : a === b
    if (eq) continue
    const ctx = {}
    const fmt = def.formatar || ((v: unknown) => v != null ? String(v) : '—')
    diffs.push({
      campo: def.key as string,
      campo_label: def.label,
      valor_anterior: fmt(a, ctx),
      valor_novo: fmt(b, ctx),
      tipo: def.tipo,
    })
  }
  return diffs
}

async function buscarCep(cep: string): Promise<Partial<EstabelecimentoFormData> | null> {
  const limpo = cep.replace(/\D/g, '')
  if (limpo.length !== 8) return null
  try {
    const r = await fetch(`https://viacep.com.br/ws/${limpo}/json/`)
    if (!r.ok) return null
    const d = await r.json()
    if (d.erro) return null
    return {
      endereco: d.logradouro || null,
      bairro: d.bairro || null,
      cidade: d.localidade || null,
      estado: d.uf || null,
    }
  } catch {
    return null
  }
}

// ============================================
// Componente
// ============================================
type Props = {
  initial?: EstabelecimentoFormData
  modo: 'novo' | 'editar'
}

export default function EstabelecimentoForm({ initial, modo }: Props) {
  const router = useRouter()
  const { currentUnit } = useUnit()
  const supabase = createClient()

  const [form, setForm] = useState<EstabelecimentoFormData>(() =>
    initial ?? novoEstabelecimentoVazio(currentUnit?.id || null)
  )
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [uploadingFoto, setUploadingFoto] = useState(false)

  // Manter unidade_id sincronizada quando criar
  useEffect(() => {
    if (modo === 'novo' && currentUnit && !form.unidade_id) {
      setForm(f => ({ ...f, unidade_id: currentUnit.id }))
    }
  }, [currentUnit, modo, form.unidade_id])

  function set<K extends keyof EstabelecimentoFormData>(key: K, value: EstabelecimentoFormData[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function aplicarPlace(p: PlaceResult) {
    setForm(f => ({
      ...f,
      // Só substitui se o campo estiver vazio — preserva o que o user já digitou
      nome: f.nome || p.nome,
      endereco: f.endereco || p.endereco,
      bairro: f.bairro || p.bairro,
      cidade: f.cidade || p.cidade,
      estado: f.estado || p.estado,
      cep: f.cep || p.cep,
      latitude: f.latitude ?? p.latitude,
      longitude: f.longitude ?? p.longitude,
      telefone: f.telefone || p.telefone,
      website: f.website || p.website,
    }))
  }

  function toggleArray(key: 'ilha_de_exibicao' | 'concorrentes_presentes', value: string) {
    setForm(f => {
      const atual = f[key] || []
      const next = atual.includes(value) ? atual.filter(v => v !== value) : [...atual, value]
      return { ...f, [key]: next }
    })
  }

  async function onCepBlur() {
    if (!form.cep) return
    const dados = await buscarCep(form.cep)
    if (dados) {
      setForm(f => ({ ...f, ...dados }))
    }
  }

  async function uploadFoto(file: File) {
    if (!form.unidade_id && !form.id) {
      setErro('Sem unidade ativa para guardar a foto')
      return
    }
    setUploadingFoto(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${form.unidade_id || 'sem-unidade'}/${form.id || 'novo'}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('estabelecimentos')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (upErr) {
        // Se o bucket não existe ou falhou, mostra erro mas não trava
        console.error('Erro upload foto:', upErr)
        setErro('Não foi possível enviar a foto. O bucket "estabelecimentos" precisa estar criado no Storage.')
        return
      }
      const { data: pub } = supabase.storage.from('estabelecimentos').getPublicUrl(path)
      const url = pub.publicUrl
      setForm(f => ({ ...f, fotos: [...(f.fotos || []), url] }))
    } finally {
      setUploadingFoto(false)
    }
  }

  function removerFoto(idx: number) {
    setForm(f => ({ ...f, fotos: (f.fotos || []).filter((_, i) => i !== idx) }))
  }

  async function salvar() {
    setErro(null)
    if (!form.nome.trim()) {
      setErro('Nome é obrigatório')
      return
    }
    if (!form.unidade_id) {
      setErro('Unidade ativa não definida')
      return
    }
    setSalvando(true)
    try {
      if (modo === 'novo') {
        const { id: _omit, ...payload } = form
        void _omit
        const { data, error } = await supabase
          .from('estabelecimentos')
          .insert(payload as never)
          .select('id')
          .single()
        if (error) throw error
        const newId = (data as { id: string }).id
        router.push(`/clinicas/${newId}`)
      } else {
        if (!form.id) throw new Error('ID ausente')
        const { id, ...payload } = form
        const { error } = await supabase
          .from('estabelecimentos')
          .update(payload as never)
          .eq('id', id)
        if (error) throw error

        // Loga alterações estratégicas em historico_alteracoes (best-effort, não bloqueia)
        if (initial) {
          const diffs = diffEstrategico(initial, form)
          if (diffs.length > 0) {
            const { data: { user } } = await supabase.auth.getUser()
            const rows = diffs.map(d => ({
              entidade: 'estabelecimentos',
              entidade_id: id,
              entidade_nome: form.nome,
              campo: d.campo,
              campo_label: d.campo_label,
              valor_anterior: d.valor_anterior,
              valor_novo: d.valor_novo,
              tipo: d.tipo,
              alterado_por: user?.id ?? null,
              alterado_por_email: user?.email ?? null,
            }))
            const { error: histErr } = await supabase.from('historico_alteracoes').insert(rows as never)
            if (histErr) console.warn('Histórico não registrado:', histErr.message)
          }
        }

        router.push(`/clinicas/${id}`)
      }
    } catch (e: unknown) {
      console.error(e)
      setErro(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir() {
    if (!form.id) return
    if (!confirm(`Excluir "${form.nome}"? Esta ação não pode ser desfeita.`)) return
    setSalvando(true)
    const { error } = await supabase.from('estabelecimentos').delete().eq('id', form.id)
    setSalvando(false)
    if (error) {
      setErro('Erro ao excluir: ' + error.message)
      return
    }
    router.push('/clinicas')
  }

  return (
    <div className="space-y-4 pb-24 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title text-[var(--shell-text)]">
          {modo === 'novo' ? 'Nova clínica' : `Editar: ${form.nome || 'clínica'}`}
        </h1>
        <div className="flex items-center gap-2">
          <GooglePlacesSearch
            centerLat={form.latitude}
            centerLng={form.longitude}
            onSelect={aplicarPlace}
          />
          <button
            onClick={() => router.back()}
            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--surface-100)] hover:bg-[var(--surface-200)] text-[var(--shell-text)]"
          >
            Cancelar
          </button>
        </div>
      </div>

      {erro && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">{erro}</div>
      )}

      {/* Seção: Dados básicos */}
      <Section icon={<Briefcase className="h-4 w-4 text-cyan-500" />} title="Dados básicos" defaultOpen>
        <Grid>
          <Field label="Nome*" required>
            <input type="text" value={form.nome} onChange={e => set('nome', e.target.value)} className={inputCls} placeholder="Ex: Clínica Pet Vida" />
          </Field>
          <Field label="Tipo">
            <select value={form.tipo || ''} onChange={e => set('tipo', e.target.value || null)} className={inputCls}>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        </Grid>
        <Grid>
          <Field label="Telefone" icon={<Phone className="h-3 w-3" />}>
            <input type="tel" value={form.telefone || ''} onChange={e => set('telefone', e.target.value || null)} className={inputCls} placeholder="(13) 3333-4444" />
          </Field>
          <Field label="WhatsApp" icon={<Phone className="h-3 w-3" />}>
            <input type="tel" value={form.whatsapp || ''} onChange={e => set('whatsapp', e.target.value || null)} className={inputCls} placeholder="(13) 99999-8888" />
          </Field>
          <Field label="E-mail" icon={<Mail className="h-3 w-3" />}>
            <input type="email" value={form.email || ''} onChange={e => set('email', e.target.value || null)} className={inputCls} placeholder="contato@clinica.com" />
          </Field>
        </Grid>
        <Grid>
          <Field label="Instagram">
            <input type="text" value={form.instagram || ''} onChange={e => set('instagram', e.target.value || null)} className={inputCls} placeholder="@clinicapet" />
          </Field>
          <Field label="Website">
            <input type="url" value={form.website || ''} onChange={e => set('website', e.target.value || null)} className={inputCls} placeholder="https://" />
          </Field>
        </Grid>
        <Field label="Horário de funcionamento">
          <textarea value={form.horario_funcionamento || ''} onChange={e => set('horario_funcionamento', e.target.value || null)} className={`${inputCls} min-h-[60px]`} placeholder="Seg-Sex: 8h-19h&#10;Sáb: 8h-13h" />
        </Field>
      </Section>

      {/* Seção: Endereço */}
      <Section icon={<MapPin className="h-4 w-4 text-orange-500" />} title="Endereço">
        <Grid>
          <Field label="CEP">
            <input type="text" value={form.cep || ''} onChange={e => set('cep', e.target.value || null)} onBlur={onCepBlur} className={inputCls} placeholder="00000-000" />
          </Field>
          <Field label="Endereço" className="md:col-span-2">
            <input type="text" value={form.endereco || ''} onChange={e => set('endereco', e.target.value || null)} className={inputCls} placeholder="Rua, número" />
          </Field>
        </Grid>
        <Grid>
          <Field label="Bairro">
            <input type="text" value={form.bairro || ''} onChange={e => set('bairro', e.target.value || null)} className={inputCls} />
          </Field>
          <Field label="Cidade">
            <input type="text" value={form.cidade || ''} onChange={e => set('cidade', e.target.value || null)} className={inputCls} />
          </Field>
          <Field label="Estado">
            <select value={form.estado || ''} onChange={e => set('estado', e.target.value || null)} className={inputCls}>
              <option value="">—</option>
              {ESTADOS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </Field>
        </Grid>
        <Grid>
          <Field label="Latitude (opcional)">
            <input type="number" step="any" value={form.latitude ?? ''} onChange={e => set('latitude', e.target.value ? Number(e.target.value) : null)} className={inputCls} placeholder="-23.96..." />
          </Field>
          <Field label="Longitude (opcional)">
            <input type="number" step="any" value={form.longitude ?? ''} onChange={e => set('longitude', e.target.value ? Number(e.target.value) : null)} className={inputCls} placeholder="-46.33..." />
          </Field>
        </Grid>
      </Section>

      {/* Seção: Equipe */}
      <Section icon={<Users className="h-4 w-4 text-blue-500" />} title="Equipe">
        <Grid>
          <Field label="Porte da equipe">
            <select value={form.porte_equipe || ''} onChange={e => set('porte_equipe', e.target.value || null)} className={inputCls}>
              <option value="">—</option>
              {PORTES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Veterinários fixos">
            <input type="number" min="0" value={form.veterinarios_fixos ?? ''} onChange={e => set('veterinarios_fixos', e.target.value ? Number(e.target.value) : null)} className={inputCls} />
          </Field>
          <Field label="Veterinários volantes">
            <input type="number" min="0" value={form.veterinarios_volantes ?? ''} onChange={e => set('veterinarios_volantes', e.target.value ? Number(e.target.value) : null)} className={inputCls} />
          </Field>
        </Grid>
      </Section>

      {/* Seção: Material/Exibição + Concorrência */}
      <Section icon={<Camera className="h-4 w-4 text-purple-500" />} title="Material, Exibição e Concorrência">
        <Field label="Ilha de exibição (onde nosso material aparece)">
          <ChipsGroup
            options={ILHAS}
            selected={form.ilha_de_exibicao || []}
            onToggle={v => toggleArray('ilha_de_exibicao', v)}
          />
        </Field>
        <Field label="Política de concorrência">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {POLITICAS.map(p => (
              <button
                key={p.value}
                type="button"
                onClick={() => set('politica_concorrencia', form.politica_concorrencia === p.value ? null : p.value)}
                className={`text-left px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  form.politica_concorrencia === p.value
                    ? 'bg-cyan-500/15 border-cyan-500 text-cyan-700'
                    : 'bg-[var(--surface-50)] border-[var(--surface-200)] text-[var(--shell-text)] hover:bg-[var(--surface-100)]'
                }`}
              >
                <span className="mr-1">{p.icon}</span> {p.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Concorrentes presentes">
          <ChipsGroup
            options={CONCORRENTES}
            selected={form.concorrentes_presentes || []}
            onToggle={v => toggleArray('concorrentes_presentes', v)}
          />
        </Field>
      </Section>

      {/* Seção: Métricas óbitos */}
      <Section icon={<BarChart3 className="h-4 w-4 text-red-500" />} title="Métricas de Óbitos">
        <Grid>
          <Field label="Média mensal de óbitos">
            <input type="number" min="0" value={form.qtde_media_obitos_mensal ?? ''} onChange={e => set('qtde_media_obitos_mensal', e.target.value ? Number(e.target.value) : null)} className={inputCls} placeholder="Ex: 12" />
          </Field>
          <Field label="% Prefeitura">
            <input type="number" min="0" max="100" value={form.percentual_prefeitura ?? ''} onChange={e => set('percentual_prefeitura', e.target.value ? Number(e.target.value) : null)} className={inputCls} placeholder="Ex: 80" />
          </Field>
          <Field label="Valor prefeitura 10kg (R$)">
            <input type="number" step="0.01" min="0" value={form.valor_prefeitura_10kg ?? ''} onChange={e => set('valor_prefeitura_10kg', e.target.value ? Number(e.target.value) : null)} className={inputCls} placeholder="Ex: 350" />
          </Field>
        </Grid>
      </Section>

      {/* Seção: Comercial */}
      <Section icon={<Briefcase className="h-4 w-4 text-green-500" />} title="Comercial">
        <Field label="Modelo de gratificação">
          <select value={form.modelo_gratificacao || ''} onChange={e => set('modelo_gratificacao', e.target.value || null)} className={inputCls}>
            <option value="">—</option>
            {GRATIFICACOES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </Field>
        <Field label="Estratégia">
          <textarea value={form.estrategia || ''} onChange={e => set('estrategia', e.target.value || null)} className={`${inputCls} min-h-[80px]`} placeholder="Como ganhar/manter esta parceria…" />
        </Field>
      </Section>

      {/* Seção: Fotos */}
      <Section icon={<Camera className="h-4 w-4 text-pink-500" />} title="Fotos">
        <div className="flex flex-wrap gap-2 mb-3">
          {(form.fotos || []).map((url, idx) => (
            <div key={idx} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`foto ${idx + 1}`} className="w-24 h-24 object-cover rounded-lg border border-[var(--surface-200)]" />
              <button
                type="button"
                onClick={() => removerFoto(idx)}
                className="absolute -top-1.5 -right-1.5 p-1 bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remover"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <label className="w-24 h-24 rounded-lg border-2 border-dashed border-[var(--surface-300)] flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-cyan-500 hover:bg-cyan-500/5 transition-colors text-[var(--surface-500)]">
            <Camera className="h-5 w-5" />
            <span className="text-[10px]">{uploadingFoto ? 'Enviando…' : 'Adicionar'}</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploadingFoto}
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) uploadFoto(f)
                e.target.value = ''
              }}
            />
          </label>
        </div>
        <p className="text-[10px] text-[var(--surface-400)]">Bucket "estabelecimentos" no Supabase Storage. A primeira foto é usada como capa.</p>
      </Section>

      {/* Seção: Observações */}
      <Section icon={<Briefcase className="h-4 w-4 text-amber-500" />} title="Observações">
        <Field label="Observações livres">
          <textarea value={form.observacoes || ''} onChange={e => set('observacoes', e.target.value || null)} className={`${inputCls} min-h-[100px]`} placeholder="Notas internas, lembretes…" />
        </Field>
      </Section>

      {/* Botões fixos no rodapé */}
      <div className="fixed bottom-0 left-0 right-0 md:left-[var(--sidebar-width,16rem)] bg-[var(--surface-0)] border-t border-[var(--surface-200)] px-4 py-3 z-40 flex items-center justify-between gap-3">
        {modo === 'editar' && form.id ? (
          <button
            type="button"
            onClick={excluir}
            disabled={salvando}
            className="text-xs px-3 py-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500/20 inline-flex items-center gap-1 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-xs px-3 py-2 rounded-lg bg-[var(--surface-100)] hover:bg-[var(--surface-200)] text-[var(--shell-text)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={salvando || !form.nome.trim()}
            className="text-xs px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {salvando ? 'Salvando…' : modo === 'novo' ? 'Criar clínica' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Helpers de UI
// ============================================
const inputCls = 'w-full px-2.5 py-1.5 rounded-lg text-sm bg-[var(--surface-50)] border border-[var(--surface-200)] focus:outline-none focus:border-cyan-500 text-[var(--shell-text)]'

function Section({ title, icon, children, defaultOpen = false }: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-[var(--surface-200)] bg-[var(--surface-0)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[var(--surface-50)] transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--shell-text)]">
          {icon}
          {title}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-[var(--surface-400)]" /> : <ChevronDown className="h-4 w-4 text-[var(--surface-400)]" />}
      </button>
      {open && (
        <div className="p-3 border-t border-[var(--surface-200)] space-y-3">
          {children}
        </div>
      )}
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{children}</div>
}

function Field({ label, children, icon, required, className = '' }: {
  label: string
  children: React.ReactNode
  icon?: React.ReactNode
  required?: boolean
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[10px] uppercase font-bold text-[var(--surface-500)] mb-1 inline-flex items-center gap-1">
        {icon}
        {label}
        {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  )
}

function ChipsGroup({ options, selected, onToggle }: {
  options: { value: string; label: string }[]
  selected: string[]
  onToggle: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => {
        const ativo = selected.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              ativo
                ? 'bg-cyan-500/15 border-cyan-500 text-cyan-700'
                : 'bg-[var(--surface-50)] border-[var(--surface-200)] text-[var(--shell-text)] hover:bg-[var(--surface-100)]'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
