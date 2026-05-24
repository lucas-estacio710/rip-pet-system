'use client'

import { useState, useEffect } from 'react'
import { X, Save, Trash2, Calendar, Clock, User, Target, FileText, MessageSquare, ArrowRight, Thermometer } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { inputLocalParaIso, isoParaInputLocal } from '@/lib/date-local'

// ============================================
// Tipos
// ============================================
export type VisitaData = {
  id?: string
  estabelecimento_id: string
  unidade_id?: string | null
  usuario_id?: string | null
  data_visita: string | null
  data_proximo_contato: string | null
  duracao_minutos: number | null
  tipo_visita: string | null
  status: string | null
  temperatura_pos_visita: string | null
  contato_realizado: string | null
  cargo_contato: string | null
  objetivo: string | null
  observacoes: string | null
  proximos_passos: string | null
  potencial_negocio: string | null
}

// ============================================
// Catálogos
// ============================================
const TIPOS_VISITA = [
  { value: 'presencial', label: 'Presencial', icon: '👥' },
  { value: 'telefone', label: 'Telefone', icon: '📞' },
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { value: 'email', label: 'E-mail', icon: '📧' },
  { value: 'videochamada', label: 'Videochamada', icon: '🎥' },
]

const STATUS = [
  { value: 'agendada', label: 'Agendada', cor: 'bg-blue-500/15 text-blue-600 border-blue-500' },
  { value: 'realizada', label: 'Realizada', cor: 'bg-green-500/15 text-green-600 border-green-500' },
  { value: 'cancelada', label: 'Cancelada', cor: 'bg-red-500/15 text-red-600 border-red-500' },
]

const TEMPERATURAS = [
  { value: 'quente', label: 'Quente', icon: '🔥', cor: 'bg-red-500/15 text-red-600 border-red-500' },
  { value: 'morno', label: 'Morno', icon: '🌤️', cor: 'bg-yellow-500/15 text-yellow-600 border-yellow-500' },
  { value: 'frio', label: 'Frio', icon: '❄️', cor: 'bg-blue-500/15 text-blue-600 border-blue-500' },
]

const POTENCIAIS = [
  { value: 'alto', label: 'Alto', cor: 'bg-green-500/15 text-green-600 border-green-500' },
  { value: 'medio', label: 'Médio', cor: 'bg-yellow-500/15 text-yellow-600 border-yellow-500' },
  { value: 'baixo', label: 'Baixo', cor: 'bg-slate-500/15 text-slate-600 border-slate-500' },
]

// ============================================
// Helper
// ============================================
function novaVisita(estabId: string, unidadeId: string | null): VisitaData {
  const agora = new Date()
  return {
    estabelecimento_id: estabId,
    unidade_id: unidadeId,
    data_visita: agora.toISOString(),
    data_proximo_contato: null,
    duracao_minutos: 30,
    tipo_visita: 'presencial',
    status: 'realizada',
    temperatura_pos_visita: null,
    contato_realizado: null,
    cargo_contato: null,
    objetivo: null,
    observacoes: null,
    proximos_passos: null,
    potencial_negocio: null,
  }
}

// ============================================
// Componente
// ============================================
type Props = {
  estabelecimentoId: string
  visita?: VisitaData | null
  onClose: () => void
  onSaved: () => void
}

export default function VisitaModal({ estabelecimentoId, visita, onClose, onSaved }: Props) {
  const { currentUnit } = useUnit()
  const supabase = createClient()
  const [form, setForm] = useState<VisitaData>(() =>
    visita ?? novaVisita(estabelecimentoId, currentUnit?.id || null)
  )
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Carrega contatos da clínica pra autocomplete
  const [contatos, setContatos] = useState<{ id: string; nome: string; cargo: string | null }[]>([])
  useEffect(() => {
    supabase
      .from('contatos')
      .select('id, nome, cargo')
      .eq('estabelecimento_id', estabelecimentoId)
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setContatos((data || []) as { id: string; nome: string; cargo: string | null }[]))
  }, [estabelecimentoId, supabase])

  function set<K extends keyof VisitaData>(key: K, value: VisitaData[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function salvar() {
    setErro(null)
    if (!form.estabelecimento_id) {
      setErro('Estabelecimento não definido')
      return
    }
    setSalvando(true)
    try {
      if (form.id) {
        const { id, ...payload } = form
        const { error } = await supabase
          .from('visitas')
          .update(payload as never)
          .eq('id', id)
        if (error) throw error
      } else {
        const { id: _omit, ...payload } = form
        void _omit
        // Pega o usuário atual (auth.uid) — falback null
        const { data: { user } } = await supabase.auth.getUser()
        const final = { ...payload, usuario_id: user?.id ?? null }
        const { error } = await supabase
          .from('visitas')
          .insert(final as never)
        if (error) throw error

        // Atualiza ultima_visita do estabelecimento
        if (final.data_visita && final.status === 'realizada') {
          await supabase
            .from('estabelecimentos')
            .update({ ultima_visita: final.data_visita } as never)
            .eq('id', estabelecimentoId)
        }
      }
      onSaved()
    } catch (e: unknown) {
      console.error(e)
      setErro(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir() {
    if (!form.id) return
    if (!confirm('Excluir esta visita?')) return
    setSalvando(true)
    const { error } = await supabase.from('visitas').delete().eq('id', form.id)
    setSalvando(false)
    if (error) {
      setErro('Erro ao excluir: ' + error.message)
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in" onClick={onClose}>
      <div
        className="bg-[var(--surface-0)] rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-[var(--surface-200)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[var(--surface-0)] border-b border-[var(--surface-200)] px-4 py-3 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-[var(--shell-text)] flex items-center gap-2">
            <Calendar className="h-5 w-5 text-cyan-500" />
            {form.id ? 'Editar visita' : 'Nova visita'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-[var(--surface-100)] text-[var(--surface-500)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {erro && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">{erro}</div>
          )}

          {/* Data e duração */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Data/hora" icon={<Calendar className="h-3 w-3" />}>
              <input
                type="datetime-local"
                value={form.data_visita ? isoParaInputLocal(form.data_visita) : ''}
                onChange={e => set('data_visita', e.target.value ? inputLocalParaIso(e.target.value) : null)}
                className={inputCls}
              />
            </Field>
            <Field label="Duração (min)" icon={<Clock className="h-3 w-3" />}>
              <input
                type="number"
                min="0"
                value={form.duracao_minutos ?? ''}
                onChange={e => set('duracao_minutos', e.target.value ? Number(e.target.value) : null)}
                className={inputCls}
              />
            </Field>
            <Field label="Próximo contato" icon={<Calendar className="h-3 w-3" />}>
              <input
                type="date"
                value={form.data_proximo_contato || ''}
                onChange={e => set('data_proximo_contato', e.target.value || null)}
                className={inputCls}
              />
            </Field>
          </div>

          {/* Tipo de visita */}
          <Field label="Tipo de visita">
            <div className="flex flex-wrap gap-2">
              {TIPOS_VISITA.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set('tipo_visita', t.value)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                    form.tipo_visita === t.value
                      ? 'bg-cyan-500/15 border-cyan-500 text-cyan-700'
                      : 'bg-[var(--surface-50)] border-[var(--surface-200)] text-[var(--shell-text)] hover:bg-[var(--surface-100)]'
                  }`}
                >
                  <span className="mr-1">{t.icon}</span> {t.label}
                </button>
              ))}
            </div>
          </Field>

          {/* Status */}
          <Field label="Status">
            <div className="flex flex-wrap gap-2">
              {STATUS.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => set('status', s.value)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                    form.status === s.value ? s.cor : 'bg-[var(--surface-50)] border-[var(--surface-200)] text-[var(--shell-text)] hover:bg-[var(--surface-100)]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </Field>

          {/* Contato */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Contato realizado" icon={<User className="h-3 w-3" />}>
              <input
                type="text"
                list="contatos-list"
                value={form.contato_realizado || ''}
                onChange={e => set('contato_realizado', e.target.value || null)}
                className={inputCls}
                placeholder="Nome de quem você falou"
              />
              <datalist id="contatos-list">
                {contatos.map(c => <option key={c.id} value={c.nome}>{c.cargo || ''}</option>)}
              </datalist>
            </Field>
            <Field label="Cargo do contato">
              <input
                type="text"
                value={form.cargo_contato || ''}
                onChange={e => set('cargo_contato', e.target.value || null)}
                className={inputCls}
                placeholder="Ex: Veterinário, Recepcionista"
              />
            </Field>
          </div>

          {/* Objetivo + observações */}
          <Field label="Objetivo da visita" icon={<Target className="h-3 w-3" />}>
            <input
              type="text"
              value={form.objetivo || ''}
              onChange={e => set('objetivo', e.target.value || null)}
              className={inputCls}
              placeholder="Ex: Apresentar serviços, follow-up"
            />
          </Field>
          <Field label="Observações" icon={<MessageSquare className="h-3 w-3" />}>
            <textarea
              value={form.observacoes || ''}
              onChange={e => set('observacoes', e.target.value || null)}
              className={`${inputCls} min-h-[80px]`}
              placeholder="Como foi a conversa, o clima, o que descobriu…"
            />
          </Field>
          <Field label="Próximos passos" icon={<ArrowRight className="h-3 w-3" />}>
            <textarea
              value={form.proximos_passos || ''}
              onChange={e => set('proximos_passos', e.target.value || null)}
              className={`${inputCls} min-h-[60px]`}
              placeholder="O que fazer depois desta visita…"
            />
          </Field>

          {/* Temperatura + potencial */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Temperatura pós-visita" icon={<Thermometer className="h-3 w-3" />}>
              <div className="flex flex-wrap gap-2">
                {TEMPERATURAS.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => set('temperatura_pos_visita', form.temperatura_pos_visita === t.value ? null : t.value)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                      form.temperatura_pos_visita === t.value ? t.cor : 'bg-[var(--surface-50)] border-[var(--surface-200)] text-[var(--shell-text)] hover:bg-[var(--surface-100)]'
                    }`}
                  >
                    <span className="mr-1">{t.icon}</span> {t.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Potencial de negócio">
              <div className="flex flex-wrap gap-2">
                {POTENCIAIS.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => set('potencial_negocio', form.potencial_negocio === p.value ? null : p.value)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                      form.potencial_negocio === p.value ? p.cor : 'bg-[var(--surface-50)] border-[var(--surface-200)] text-[var(--shell-text)] hover:bg-[var(--surface-100)]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[var(--surface-0)] border-t border-[var(--surface-200)] px-4 py-3 flex items-center justify-between gap-3">
          {form.id ? (
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
              onClick={onClose}
              className="text-xs px-3 py-2 rounded-lg bg-[var(--surface-100)] hover:bg-[var(--surface-200)] text-[var(--shell-text)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="text-xs px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {salvando ? 'Salvando…' : form.id ? 'Salvar' : 'Registrar visita'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Helpers
// ============================================
const inputCls = 'w-full px-2.5 py-1.5 rounded-lg text-sm bg-[var(--surface-50)] border border-[var(--surface-200)] focus:outline-none focus:border-cyan-500 text-[var(--shell-text)]'

function Field({ label, children, icon }: { label: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase font-bold text-[var(--surface-500)] mb-1 inline-flex items-center gap-1">
        {icon}
        {label}
      </span>
      {children}
    </label>
  )
}
