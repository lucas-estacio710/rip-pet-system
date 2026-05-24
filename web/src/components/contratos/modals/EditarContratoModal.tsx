'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Save, Loader2, FileEdit } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  isOpen: boolean
  contratoId: string | null
  onClose: () => void
  /** Disparado após salvar — pra o pai recarregar/atualizar a lista se quiser. */
  onSaved?: () => void
}

type ContratoEdit = {
  numero_lacre: string | null
  descricao_contrato: string | null
  valor_plano: number | null
  valor_acessorios: number | null
  desconto_plano_unificado: number | null
  desconto_acessorios: number | null
  desconto_acessorios_ajuste: number | null
  tipo_cremacao: 'individual' | 'coletiva'
  codigo: string
  pet_nome: string
}

// Valores conforme gravados pelo FichaForm em fichas.pagamento (capitalizados, full text)
const METODOS = [
  { value: 'Pix', label: 'PIX' },
  { value: 'Dinheiro', label: 'Dinheiro' },
  { value: 'Cartão Crédito', label: 'Cartão Crédito' },
  { value: 'Cartão Débito', label: 'Cartão Débito' },
]

// Helpers financeiros
function parseValor(s: string): number | null {
  if (!s || !s.trim()) return null
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? null : n
}
function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function valorParaInput(v: number | null | undefined): string {
  return v != null ? v.toFixed(2).replace('.', ',') : ''
}

const DESC_PADRAO_IND = 'O pet indicado é cremado individualmente no equipamento e as cinzas são entregues em uma urna escolhida previamente.'
const DESC_PADRAO_COL = 'O pet indicado é cremado em conjunto com outros dois pets de mesma modalidade coletiva e as cinzas são espalhadas no jardim do crematório.'

// Planos prontos por tipo (preenchimento de 1 clique).
// Cada texto inclui a versão curta da explicação de IND/COL inline (depois do label "Cremação X:" fixo).
const PLANOS: Record<'individual' | 'coletiva', { nome: string; texto: string }[]> = {
  coletiva: [
    { nome: 'Descanse em Paz', texto: 'o pet é cremado com 2 pets de outros tutores e as cinzas são espalhadas em nosso jardim. Plano Descanse em Paz: sem recordações.' },
    { nome: 'Lembranças', texto: 'o pet é cremado com 2 pets de outros tutores e as cinzas são espalhadas em nosso jardim. Plano Lembranças: Molde + Garrafinha de Pêlos.' },
    { nome: 'Saudades', texto: 'o pet é cremado com 2 pets de outros tutores e as cinzas são espalhadas em nosso jardim. Plano Saudades: Porta-Retrato Duplo + Carimbo + Garrafinha.' },
  ],
  individual: [
    { nome: 'Homenagem', texto: 'o pet é cremado sozinho e as cinzas são entregues ao tutor em uma urna. Plano Homenagem: sem recordações.' },
    { nome: 'Gratidão', texto: 'o pet é cremado sozinho e as cinzas são entregues ao tutor em uma urna. Plano Gratidão: Urna de Madeira + Plaquinha/Molde.' },
    { nome: 'Memórias', texto: 'o pet é cremado sozinho e as cinzas são entregues ao tutor em uma urna. Plano Memórias: Urna de Cerâmica + Porta-Retrato + Carimbo + Garrafinha.' },
    { nome: 'Raízes', texto: 'o pet é cremado sozinho e as cinzas são entregues ao tutor em uma urna. Plano Raízes: Biourna + Porta-Retrato + Muda + Garrafinha.' },
    { nome: 'Clássico', texto: 'o pet é cremado sozinho e as cinzas são entregues ao tutor em uma urna. Plano Clássico: Urna Laqueada + Miniatura + Plaquinha + Garrafinha.' },
    { nome: 'Tributo', texto: 'o pet é cremado sozinho e as cinzas são entregues ao tutor em uma urna. Plano Tributo: Urna Porta-Retrato + Plaquinha + Carimbo + Garrafinha.' },
  ],
}

export default function EditarContratoModal({ isOpen, contratoId, onClose, onSaved }: Props) {
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [contrato, setContrato] = useState<ContratoEdit | null>(null)
  // Forma de pagamento + parcelas vêm da ficha (opção do tutor), não de pagamentos.
  const [fichaId, setFichaId] = useState<string | null>(null)
  const [pagamentoOriginal, setPagamentoOriginal] = useState<string>('')
  const [parcelasOriginal, setParcelasOriginal] = useState<string>('')

  // Form
  const [lacre, setLacre] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valorPlano, setValorPlano] = useState<string>('')
  const [descPlano, setDescPlano] = useState<string>('')
  const [descAjuste, setDescAjuste] = useState<string>('')
  const [metodo, setMetodo] = useState<string>('')
  const [parcelas, setParcelas] = useState<string>('')

  // Carrega ao abrir
  useEffect(() => {
    if (!isOpen || !contratoId) return
    let cancelado = false
    setLoading(true)
    ;(async () => {
      const { data: c } = await supabase
        .from('contratos')
        .select('numero_lacre, descricao_contrato, valor_plano, valor_acessorios, desconto_plano_unificado, desconto_acessorios, desconto_acessorios_ajuste, tipo_cremacao, codigo, pet_nome')
        .eq('id', contratoId)
        .single()
      // Forma de pagamento + parcelas vêm da FICHA (opção do tutor)
      const { data: f } = await supabase
        .from('fichas')
        .select('id, pagamento, parcelas')
        .eq('contrato_id', contratoId)
        .order('created_at', { ascending: true })
        .limit(1)
      if (cancelado) return
      const co = c as ContratoEdit | null
      const ficha = ((f as { id: string; pagamento: string | null; parcelas: string | null }[] | null) || [])[0] || null
      setContrato(co)
      setFichaId(ficha?.id || null)
      setPagamentoOriginal(ficha?.pagamento || '')
      setParcelasOriginal(ficha?.parcelas || '')
      setLacre(co?.numero_lacre || '')
      setDescricao(co?.descricao_contrato || '')
      setValorPlano(valorParaInput(co?.valor_plano))
      setDescPlano(valorParaInput(co?.desconto_plano_unificado))
      setDescAjuste(valorParaInput(co?.desconto_acessorios_ajuste))
      setMetodo(ficha?.pagamento || '')
      setParcelas(ficha?.parcelas || '')
      setLoading(false)
    })()
    return () => { cancelado = true }
  }, [isOpen, contratoId, supabase])

  // Total contratado (calculado em tempo real conforme o usuário edita)
  const totalContratado = useMemo(() => {
    const plano = parseValor(valorPlano) ?? 0
    const acess = contrato?.valor_acessorios ?? 0
    const dPlano = parseValor(descPlano) ?? 0
    const dAcessAuto = contrato?.desconto_acessorios ?? 0
    const dAjuste = parseValor(descAjuste) ?? 0
    return plano + acess - dPlano - dAcessAuto - dAjuste
  }, [valorPlano, descPlano, descAjuste, contrato])

  async function salvar() {
    if (!contratoId) return
    setSaving(true)
    try {
      // Normaliza os 3 valores editáveis (valor do plano + 2 descontos)
      const valor = parseValor(valorPlano)
      const descP = parseValor(descPlano)
      const descA = parseValor(descAjuste)
      if (valorPlano.trim() && valor === null) { alert('Valor do plano inválido.'); setSaving(false); return }
      if (descPlano.trim() && descP === null) { alert('Desconto do plano inválido.'); setSaving(false); return }
      if (descAjuste.trim() && descA === null) { alert('Ajuste de desconto inválido.'); setSaving(false); return }

      // 1) UPDATE contrato (lacre, descrição, valor_plano puro, desc_plano_unif, desc_acess_ajuste)
      // Acessórios e desconto_acessorios NÃO são editáveis aqui — vêm do trigger 074 (SUM em contrato_produtos)
      const updContrato: Record<string, unknown> = {
        numero_lacre: lacre.trim() || null,
        descricao_contrato: descricao.trim() || null,
        valor_plano: valor,
        desconto_plano_unificado: descP,
        desconto_acessorios_ajuste: descA,
      }
      const { error: e1 } = await supabase.from('contratos').update(updContrato as never).eq('id', contratoId)
      if (e1) throw e1

      // 2) UPDATE forma de pagamento + parcelas na FICHA (se houver e mudou)
      // Se método não é Cartão Crédito, parcelas zera (consistência com FichaForm)
      const parcelasFinal = metodo === 'Cartão Crédito' ? (parcelas || null) : null
      const mudouPag = metodo !== pagamentoOriginal
      const mudouParc = parcelasFinal !== (parcelasOriginal || null)
      if (fichaId && (mudouPag || mudouParc)) {
        const updFicha: Record<string, string | null> = {}
        if (mudouPag) updFicha.pagamento = metodo || null
        if (mudouParc) updFicha.parcelas = parcelasFinal
        const { error: e2 } = await supabase.from('fichas').update(updFicha as never).eq('id', fichaId)
        if (e2) throw e2
      }

      onSaved?.()
      onClose()
    } catch (err) {
      console.error('Erro ao salvar contrato:', err)
      alert('Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const placeholderDesc = contrato?.tipo_cremacao === 'coletiva' ? DESC_PADRAO_COL : DESC_PADRAO_IND

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-3" onClick={onClose}>
      <div
        className="bg-[var(--surface-0)] rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--surface-200)] sticky top-0 bg-[var(--surface-0)] z-10">
          <div className="flex items-center gap-2 text-[var(--shell-text)]">
            <FileEdit className="h-5 w-5 text-blue-400" />
            <h3 className="text-subtitle">Editar Contrato</h3>
          </div>
          <button onClick={onClose} className="text-[var(--shell-text-muted)] hover:text-[var(--shell-text)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-[var(--shell-text-muted)]">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !contrato ? (
          <div className="p-6 text-sm text-[var(--shell-text-muted)]">Contrato não encontrado.</div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Subtítulo informativo (não é menu, é contexto) */}
            <div className="text-xs text-[var(--shell-text-muted)] font-mono">
              {contrato.codigo} · {contrato.pet_nome}
            </div>

            {/* Lacre */}
            <div>
              <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Lacre</label>
              <input
                value={lacre}
                onChange={(e) => setLacre(e.target.value)}
                placeholder="Número do lacre"
                className="input w-full"
              />
            </div>

            {/* Descrição do plano (texto livre) */}
            <div>
              <label className="text-caption text-[var(--shell-text-muted)] block mb-1">
                Descrição do plano <span className="opacity-60">— vai no PDF do contrato (label fica fixo pelo tipo)</span>
              </label>

              {/* Atalhos: padrão (limpa) + planos prontos do tipo (1 clique preenche) */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                <button
                  type="button"
                  onClick={() => setDescricao('')}
                  className="px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors"
                  style={{
                    background: 'var(--surface-100)',
                    color: 'var(--shell-text)',
                    border: '1px solid var(--surface-200)',
                  }}
                  title="Limpar — o PDF volta a usar o texto padrão do tipo"
                >
                  ↺ Padrão
                </button>
                {PLANOS[contrato.tipo_cremacao].map(p => (
                  <button
                    key={p.nome}
                    type="button"
                    onClick={() => setDescricao(p.texto)}
                    className="px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors"
                    style={{
                      background: 'rgba(59,130,246,0.14)',
                      color: '#60a5fa',
                      border: '1px solid rgba(59,130,246,0.35)',
                    }}
                    title={p.texto}
                  >
                    Plano {p.nome}
                  </button>
                ))}
              </div>

              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder={placeholderDesc}
                rows={4}
                className="input w-full resize-y"
              />
              <p className="text-[10px] text-[var(--shell-text-muted)] mt-1">
                Deixe em branco para usar o texto padrão de <span className="font-semibold">{contrato.tipo_cremacao === 'coletiva' ? 'Cremação Coletiva' : 'Cremação Individual'}</span>.
              </p>
            </div>

            {/* Forma de pagamento + Parcelas (vêm da ficha) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Forma de pagamento</label>
                <select
                  value={metodo}
                  onChange={(e) => setMetodo(e.target.value)}
                  disabled={!fichaId}
                  className="input w-full"
                >
                  <option value="">{fichaId ? '—' : 'Sem ficha vinculada'}</option>
                  {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  {pagamentoOriginal && !METODOS.find(m => m.value === pagamentoOriginal) && (
                    <option value={pagamentoOriginal}>{pagamentoOriginal}</option>
                  )}
                </select>
                {!fichaId && (
                  <p className="text-[10px] text-amber-500 mt-1">
                    Contrato sem ficha vinculada. Forma de pagamento e parcelas vêm da ficha do tutor.
                  </p>
                )}
              </div>
              <div>
                <label className="text-caption text-[var(--shell-text-muted)] block mb-1">Parcelas</label>
                <select
                  value={parcelas}
                  onChange={(e) => setParcelas(e.target.value)}
                  disabled={!fichaId || metodo !== 'Cartão Crédito'}
                  className="input w-full"
                  title={metodo === 'Cartão Crédito' ? 'Quantidade de parcelas no crédito' : 'Disponível apenas para Cartão Crédito'}
                >
                  <option value="">—</option>
                  {Array.from({ length: 11 }, (_, i) => i + 2).map(n => (
                    <option key={n} value={String(n)}>{n}x</option>
                  ))}
                  {/* Compat: preserva valor original se vier fora da faixa 2-12 */}
                  {parcelasOriginal && !Array.from({ length: 11 }, (_, i) => String(i + 2)).includes(parcelasOriginal) && (
                    <option value={parcelasOriginal}>{parcelasOriginal}x</option>
                  )}
                </select>
              </div>
            </div>

            {/* Bloco financeiro — cada campo no seu lugar (sem empilhar em valor_plano) */}
            <div className="rounded-lg border border-[var(--surface-200)] p-3" style={{ background: 'var(--surface-100)' }}>
              <p className="text-caption text-[var(--shell-text-muted)] font-semibold uppercase tracking-wider mb-2">Financeiro</p>
              <div className="space-y-2 text-sm">
                {/* Valor do Plano (editável) */}
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[var(--shell-text-muted)]">Valor do Plano</label>
                  <input
                    value={valorPlano}
                    onChange={(e) => setValorPlano(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="input w-32 text-right font-mono"
                  />
                </div>
                {/* Acessórios (read-only — vem do trigger 074) */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--shell-text-muted)]">
                    Acessórios <span className="opacity-60" title="atualizado automaticamente a partir dos produtos do contrato">🔒</span>
                  </span>
                  <span className="font-mono text-[var(--shell-text)]">R$ {fmtBRL(contrato.valor_acessorios ?? 0)}</span>
                </div>
                {/* Desc. Plano (editável) */}
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[var(--shell-text-muted)]">Desc. Plano</label>
                  <input
                    value={descPlano}
                    onChange={(e) => setDescPlano(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="input w-32 text-right font-mono"
                  />
                </div>
                {/* Desc. Acessórios (read-only — soma dos descontos por produto, trigger 074) */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--shell-text-muted)]">
                    Desc. Acessórios <span className="opacity-60" title="soma dos descontos por produto (trigger)">🔒</span>
                  </span>
                  <span className="font-mono text-[var(--shell-text)]">R$ {fmtBRL(contrato.desconto_acessorios ?? 0)}</span>
                </div>
                {/* Desc. Acess. Ajuste (editável) */}
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[var(--shell-text-muted)]">Desc. Acess. Ajuste</label>
                  <input
                    value={descAjuste}
                    onChange={(e) => setDescAjuste(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="input w-32 text-right font-mono"
                  />
                </div>
                {/* Total calculado */}
                <div className="border-t border-[var(--surface-200)] pt-2 mt-1 flex items-center justify-between gap-3">
                  <span className="font-semibold text-[var(--shell-text)]">Total contratado</span>
                  <span className="font-mono font-bold text-[var(--shell-text)]">R$ {fmtBRL(totalContratado)}</span>
                </div>
              </div>
            </div>
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
