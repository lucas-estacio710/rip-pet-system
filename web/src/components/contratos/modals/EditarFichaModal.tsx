'use client'

import { useEffect, useState } from 'react'
import { X, Save, Loader2, ClipboardList, AlertTriangle, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'

/**
 * Modal de edição da Ficha de Remoção.
 *
 * UX em 2 modos:
 *   - Padrão: edita só Clínica Veterinária (clinica_coleta) e Observações.
 *   - Sensível: toggle destrava lacre, data_acolhimento, pet_*, certificado_nome_*, funcionario_id.
 *     Esses campos vieram do tutor (formulário público) — editar com cuidado.
 *
 * Tipo de cremação e código (UUID) ficam SEMPRE read-only — mudar tipo afeta o fluxo todo.
 */

type Props = {
  isOpen: boolean
  contratoId: string | null
  unidadeId?: string | null
  onClose: () => void
  onSaved?: () => void
}

type ContratoEdit = {
  id: string
  codigo: string
  pet_nome: string
  numero_lacre: string | null
  data_acolhimento: string | null
  tipo_cremacao: 'individual' | 'coletiva'
  pet_especie: string | null
  pet_raca: string | null
  pet_cor: string | null
  pet_idade_anos: number | null
  pet_peso: number | null
  pet_genero: string | null
  certificado_nome_1: string | null
  certificado_nome_2: string | null
  certificado_nome_3: string | null
  certificado_nome_4: string | null
  certificado_nome_5: string | null
  certificado_nome_6: string | null
  certificado_nome_7: string | null
  clinica_coleta: string | null
  estabelecimento_id: string | null
  estabelecimento?: { nome: string | null } | null
  funcionario_id: string | null
  observacoes: string | null
  unidade_id: string | null
}

type Funcionario = { id: string; nome: string }

export default function EditarFichaModal({ isOpen, contratoId, unidadeId, onClose, onSaved }: Props) {
  const supabase = createClient()
  const { isSuperAdmin, currentRole } = useUnit()
  // Modo sensível só pra gerente ou super_admin — operador não vê o toggle nem o bloco
  const podeEditarSensivel = isSuperAdmin || currentRole === 'gerente'

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [contrato, setContrato] = useState<ContratoEdit | null>(null)
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [modoSensivel, setModoSensivel] = useState(false)

  // ===== Form: editáveis no modo padrão =====
  const [clinicaColeta, setClinicaColeta] = useState('')
  const [observacoes, setObservacoes] = useState('')

  // ===== Form: só editáveis no modo sensível =====
  const [lacre, setLacre] = useState('')
  const [dataAcolhimento, setDataAcolhimento] = useState('') // datetime-local
  const [petNome, setPetNome] = useState('')
  const [petEspecie, setPetEspecie] = useState('')
  const [petRaca, setPetRaca] = useState('')
  const [petCor, setPetCor] = useState('')
  const [petIdade, setPetIdade] = useState('')
  const [petPeso, setPetPeso] = useState('')
  const [petGenero, setPetGenero] = useState('')
  const [funcionarioId, setFuncionarioId] = useState('')
  const [certs, setCerts] = useState<string[]>(['', '', '', '', '', '', ''])

  // Carregar contrato + funcionários da unidade
  useEffect(() => {
    if (!isOpen || !contratoId) return
    let cancelado = false
    setLoading(true)
    setModoSensivel(false)
    ;(async () => {
      const { data: c } = await supabase
        .from('contratos')
        .select('id, codigo, pet_nome, numero_lacre, data_acolhimento, tipo_cremacao, pet_especie, pet_raca, pet_cor, pet_idade_anos, pet_peso, pet_genero, certificado_nome_1, certificado_nome_2, certificado_nome_3, certificado_nome_4, certificado_nome_5, certificado_nome_6, certificado_nome_7, clinica_coleta, estabelecimento_id, estabelecimento:estabelecimento_id(nome), funcionario_id, observacoes, unidade_id')
        .eq('id', contratoId)
        .single()
      if (cancelado) return
      const co = c as ContratoEdit | null
      setContrato(co)
      // hidrata estados
      setClinicaColeta(co?.clinica_coleta || '')
      setObservacoes(co?.observacoes || '')
      setLacre(co?.numero_lacre || '')
      // datetime-local quer "YYYY-MM-DDTHH:mm" sem timezone
      if (co?.data_acolhimento) {
        const d = new Date(co.data_acolhimento)
        const pad = (n: number) => String(n).padStart(2, '0')
        setDataAcolhimento(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`)
      } else setDataAcolhimento('')
      setPetNome(co?.pet_nome || '')
      setPetEspecie(co?.pet_especie || '')
      setPetRaca(co?.pet_raca || '')
      setPetCor(co?.pet_cor || '')
      setPetIdade(co?.pet_idade_anos != null ? String(co.pet_idade_anos) : '')
      setPetPeso(co?.pet_peso != null ? String(co.pet_peso) : '')
      setPetGenero(co?.pet_genero || '')
      setFuncionarioId(co?.funcionario_id || '')
      setCerts([
        co?.certificado_nome_1 || '', co?.certificado_nome_2 || '', co?.certificado_nome_3 || '',
        co?.certificado_nome_4 || '', co?.certificado_nome_5 || '', co?.certificado_nome_6 || '',
        co?.certificado_nome_7 || '',
      ])
      // funcionários da unidade
      const uId = co?.unidade_id || unidadeId
      if (uId) {
        const { data: f } = await supabase.from('funcionarios').select('id, nome').eq('unidade_id', uId).order('nome', { ascending: true })
        if (!cancelado) setFuncionarios((f as Funcionario[]) || [])
      }
      setLoading(false)
    })()
    return () => { cancelado = true }
  }, [isOpen, contratoId, unidadeId, supabase])

  async function salvar() {
    if (!contratoId) return
    setSaving(true)
    try {
      // Sempre grava clínica e observações
      const upd: Record<string, unknown> = {
        clinica_coleta: clinicaColeta.trim() || null,
        observacoes: observacoes.trim() || null,
      }

      // Campos sensíveis — só sobrescrevem se o modo estiver ativo E o usuário tiver permissão
      if (modoSensivel && podeEditarSensivel) {
        upd.numero_lacre = lacre.trim() || null
        upd.data_acolhimento = dataAcolhimento ? new Date(dataAcolhimento).toISOString() : null
        upd.pet_nome = petNome.trim() || null
        upd.pet_especie = petEspecie || null
        upd.pet_raca = petRaca.trim() || null
        upd.pet_cor = petCor.trim() || null
        upd.pet_idade_anos = petIdade.trim() ? parseInt(petIdade, 10) || null : null
        upd.pet_peso = petPeso.trim() ? parseFloat(petPeso.replace(',', '.')) || null : null
        upd.pet_genero = petGenero || null
        upd.funcionario_id = funcionarioId || null
        upd.certificado_nome_1 = certs[0]?.trim() || null
        upd.certificado_nome_2 = certs[1]?.trim() || null
        upd.certificado_nome_3 = certs[2]?.trim() || null
        upd.certificado_nome_4 = certs[3]?.trim() || null
        upd.certificado_nome_5 = certs[4]?.trim() || null
        upd.certificado_nome_6 = certs[5]?.trim() || null
        upd.certificado_nome_7 = certs[6]?.trim() || null
      }

      const { error } = await supabase.from('contratos').update(upd as never).eq('id', contratoId)
      if (error) throw error

      onSaved?.()
      onClose()
    } catch (err) {
      console.error('Erro ao salvar ficha:', err)
      alert('Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  function setCert(i: number, v: string) {
    setCerts(prev => prev.map((x, idx) => idx === i ? v : x))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-3" onClick={onClose}>
      <div
        className="bg-[var(--surface-0)] rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--surface-200)] sticky top-0 bg-[var(--surface-0)] z-10">
          <div className="flex items-center gap-2 text-[var(--shell-text)]">
            <ClipboardList className="h-5 w-5 text-amber-400" />
            <h3 className="text-subtitle">Editar Ficha</h3>
          </div>
          <button onClick={onClose} className="text-[var(--shell-text-muted)] hover:text-[var(--shell-text)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-[var(--shell-text-muted)]">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !contrato ? (
          <div className="p-6 text-sm text-[var(--shell-text-muted)]">Contrato não encontrado.</div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Identificação */}
            <div className="text-xs text-[var(--shell-text-muted)] font-mono">
              {contrato.codigo} · {contrato.pet_nome} · {contrato.tipo_cremacao === 'individual' ? 'Individual' : 'Coletiva'}
            </div>

            {/* ===== EDITÁVEIS POR PADRÃO ===== */}
            <div>
              <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Clínica Veterinária</label>
              <input
                value={clinicaColeta}
                onChange={(e) => setClinicaColeta(e.target.value)}
                placeholder="Nome da clínica"
                className="input w-full"
              />
              {contrato.estabelecimento?.nome && (
                <p className="text-[10px] text-[var(--shell-text-muted)] mt-1">
                  Estabelecimento padronizado vinculado: <span className="font-semibold">{contrato.estabelecimento.nome}</span> — esse vai prevalecer na ficha. Para mudar o vínculo, use o Tratativa Modal.
                </p>
              )}
            </div>

            <div>
              <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Observações especiais</label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
                className="input w-full resize-y"
                placeholder="Observações que vão na ficha"
              />
            </div>

            {/* ===== TOGGLE MODO SENSÍVEL — só gerente/super_admin ===== */}
            {podeEditarSensivel && (
              <div className="border-t border-[var(--surface-200)] pt-3">
                <button
                  type="button"
                  onClick={() => setModoSensivel(v => !v)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                  style={{
                    background: modoSensivel ? 'rgba(239,68,68,0.14)' : 'var(--surface-100)',
                    color: modoSensivel ? '#ef4444' : 'var(--shell-text-muted)',
                    border: `1px solid ${modoSensivel ? 'rgba(239,68,68,0.35)' : 'var(--surface-200)'}`,
                  }}
                >
                  {modoSensivel ? <AlertTriangle className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                  {modoSensivel ? 'Edição sensível ATIVA — campos do tutor liberados' : 'Habilitar edição sensível (dados enviados pelo tutor)'}
                </button>
              </div>
            )}

            {/* ===== CAMPOS SENSÍVEIS (visíveis só com toggle ON + permissão) ===== */}
            {modoSensivel && podeEditarSensivel && (
              <div className="rounded-lg border border-red-500/30 p-3 space-y-3" style={{ background: 'rgba(239,68,68,0.05)' }}>
                <p className="text-[11px] text-red-400 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <span>Estes campos vieram do formulário público preenchido pelo tutor. Edite só se houver erro evidente — alterações ficam registradas no histórico.</span>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-caption text-[var(--shell-text-muted)] block mb-1">N° do Lacre</label>
                    <input value={lacre} onChange={(e) => setLacre(e.target.value)} className="input w-full" />
                  </div>
                  <div>
                    <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Data/hora Acolhimento</label>
                    <input type="datetime-local" value={dataAcolhimento} onChange={(e) => setDataAcolhimento(e.target.value)} className="input w-full" />
                  </div>
                </div>

                <div>
                  <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Nome do Animal</label>
                  <input value={petNome} onChange={(e) => setPetNome(e.target.value)} className="input w-full" />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Espécie</label>
                    <select value={petEspecie} onChange={(e) => setPetEspecie(e.target.value)} className="input w-full">
                      <option value="">—</option>
                      <option value="canina">Canina</option>
                      <option value="felina">Felina</option>
                      <option value="exotica">Exótica</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Raça</label>
                    <input value={petRaca} onChange={(e) => setPetRaca(e.target.value)} className="input w-full" />
                  </div>
                  <div>
                    <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Cor</label>
                    <input value={petCor} onChange={(e) => setPetCor(e.target.value)} className="input w-full" />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Idade (anos)</label>
                    <input value={petIdade} onChange={(e) => setPetIdade(e.target.value)} inputMode="numeric" className="input w-full" />
                  </div>
                  <div>
                    <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Peso (kg)</label>
                    <input value={petPeso} onChange={(e) => setPetPeso(e.target.value)} inputMode="decimal" className="input w-full" />
                  </div>
                  <div>
                    <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Sexo</label>
                    <select value={petGenero} onChange={(e) => setPetGenero(e.target.value)} className="input w-full">
                      <option value="">—</option>
                      <option value="macho">Macho</option>
                      <option value="femea">Fêmea</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Tutor(es) — nomes que vão no certificado</label>
                  <div className="space-y-1">
                    {certs.map((v, i) => (
                      <input
                        key={i}
                        value={v}
                        onChange={(e) => setCert(i, e.target.value)}
                        placeholder={`Nome ${i + 1}`}
                        className="input w-full"
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Colaborador resp. acolhimento</label>
                  <select value={funcionarioId} onChange={(e) => setFuncionarioId(e.target.value)} className="input w-full">
                    <option value="">— sem responsável —</option>
                    {funcionarios.map(f => (
                      <option key={f.id} value={f.id}>{f.nome}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-[var(--surface-200)] sticky bottom-0 bg-[var(--surface-0)]">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button
            onClick={salvar}
            disabled={loading || saving || !contrato}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
