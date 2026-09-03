'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, Check, Plus, Phone, AlertTriangle, MessageCircle } from 'lucide-react'

// ============================================================================
// AcolhimentoForm — bloco "Acolhimento" compartilhado (fonte: TratativaModal)
// Componente CONTROLADO: todos os dados editáveis vivem em `value` / `onChange`.
// Estado puramente visual (dropdown aberto, DDI custom do 2º telefone) é interno.
// ============================================================================

export type AcolhimentoData = {
  // Contato para Cremação
  telefone1Nome: string
  telefone2: string
  telefone2Nome: string
  usarTelefone2ComoPrincipal: boolean
  // Local de Acolhimento
  localColeta: '' | 'residencia' | 'clinica' | 'unidade' | 'outro'
  semLocal: boolean
  estabId: string | null
  estabNome: string
  estabBusca: string
  autonomo: boolean
  clinicaTextoLivre: string
  enderecoOutro: string
  // Responsável pelo Acolhimento
  funcionarioId: string
  // Unidade com cb_operacional: Responsável vem de `perfis` direto — este campo guarda o
  // user_id, `funcionarioId` fica vazio nesse caminho (ver contratos.responsavel_user_id).
  responsavelUserId: string
  semResponsavel: boolean
  // Data e Hora do Acolhimento
  dataHoraAcolhimento: string
  semDataHora: boolean
  // Lacre
  lacre: string
  semLacre: boolean
}

export const ACOLHIMENTO_INICIAL: AcolhimentoData = {
  telefone1Nome: '',
  telefone2: '',
  telefone2Nome: '',
  usarTelefone2ComoPrincipal: false,
  localColeta: '',
  semLocal: false,
  estabId: null,
  estabNome: '',
  estabBusca: '',
  autonomo: false,
  clinicaTextoLivre: '',
  enderecoOutro: '',
  funcionarioId: '',
  responsavelUserId: '',
  semResponsavel: false,
  dataHoraAcolhimento: '',
  semDataHora: false,
  lacre: '',
  semLacre: false,
}

type Funcionario = { id: string; nome: string }
type Atribuivel = { user_id: string; nome: string | null; role: string }
type Estabelecimento = { id: string; nome: string; tipo?: string | null; cidade?: string | null }

type Props = {
  value: AcolhimentoData
  onChange: (v: AcolhimentoData) => void
  temPadronizacaoClinicas: boolean
  funcionarios: Funcionario[]
  /** Unidade com cb_operacional ativo — troca a fonte/campo do picker de Responsável. */
  temOperacional?: boolean
  /** Quem já loga na unidade (listar_atribuiveis_operacional) — usado quando temOperacional. */
  atribuiveis?: Atribuivel[]
  estabelecimentos: Estabelecimento[]
  /** Telefone do tutor — imutável, vem do contrato/ficha. */
  telefoneBase: string
  /** Nome do tutor — usado no fallback do apelido do contato. */
  tutorNome: string
  /**
   * Quais campos permitem marcar "sem X provisoriamente".
   * Default: todos true (ficha emergencial — nem tudo se sabe no processamento).
   * Na ATIVAÇÃO de PV o pet já morreu/foi acionado → local, responsável e data/hora
   * são obrigatórios (passar false); só o lacre pode ficar provisório.
   */
  provisorios?: { local?: boolean; responsavel?: boolean; dataHora?: boolean; lacre?: boolean }
}

// Formata telefone BR/estrangeiro pra exibição (réplica do TratativaModal).
function formatarTel(tel: string | null | undefined): string {
  if (!tel) return '-'
  const n = tel.replace(/\D/g, '')
  if (n.length === 13 && n.startsWith('55')) return `(${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}`
  if (n.length >= 12) return `+${n.slice(0, n.length - 11)} (${n.slice(-11, -9)}) ${n.slice(-9, -4)}-${n.slice(-4)}`
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return tel
}

function abrirWhatsApp(tel: string | null | undefined) {
  if (!tel) return
  const n = tel.replace(/\D/g, '')
  if (!n) return
  const numero = (n.length === 10 || n.length === 11) ? '55' + n : n
  window.open(`https://wa.me/${numero}`, '_blank', 'noopener,noreferrer')
}

// ── Telefone do 2º contato: helpers puros (refactory 04/08) ────────────────
// O parser antigo deduzia o DDI por PREFIXO dos dígitos crus, com '1' na lista:
// qualquer número começando com 1 (DDDs 11–19 = SP/Campinas/Santos/Vale!) virava
// DDI +1 (EUA), comendo o 1º dígito. Aqui o DDI só é afirmado com segurança.
const DDIS_CONHECIDOS = ['55', '1', '351', '54']
const soDigitos = (s: string) => (s || '').replace(/\D/g, '')

// Máscara BR de exibição (parcial enquanto digita): (XX) XXXXX-XXXX / (XX) XXXX-XXXX
function mascararBR(dig: string): string {
  const d = soDigitos(dig).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/**
 * Separa DDI do número local de um telefone colado/digitado.
 *  1. "+DDI ..." explícito  → usa o DDI conhecido (55/1/351/54).
 *  2. Sem "+": deduz por COMPRIMENTO (nunca por prefixo):
 *       12–13 díg começando com 55 → tem DDI 55 (55 + DDD + 8/9 díg)
 *       10–11 díg (ou qualquer outro) → número LOCAL, DDI indefinido (ddi=null)
 *  ddi=null significa "não mexer no DDI atual do dropdown" (default +55).
 */
function parseTelefone(texto: string): { ddi: string | null; local: string } {
  const dig = soDigitos(texto)
  if (/^\s*\+/.test(texto)) {
    for (const c of ['351', '55', '54', '1']) {  // mais longo primeiro
      if (dig.startsWith(c)) return { ddi: c, local: dig.slice(c.length) }
    }
    return { ddi: null, local: dig }  // DDI desconhecido → usuário ajusta no dropdown
  }
  if (dig.length >= 12 && dig.length <= 13 && dig.startsWith('55')) {
    return { ddi: '55', local: dig.slice(2) }
  }
  return { ddi: null, local: dig }  // 10–11 díg (DDD 1X inclusive) = local BR, sem +1
}

export default function AcolhimentoForm({
  value,
  onChange,
  temPadronizacaoClinicas,
  funcionarios,
  temOperacional = false,
  atribuiveis = [],
  estabelecimentos,
  telefoneBase,
  tutorNome,
  provisorios,
}: Props) {
  // Helper pra patch parcial imutável
  const set = (patch: Partial<AcolhimentoData>) => onChange({ ...value, ...patch })

  // Quais campos permitem "sem X provisoriamente" (default: todos)
  const prov = {
    local: provisorios?.local ?? true,
    responsavel: provisorios?.responsavel ?? true,
    dataHora: provisorios?.dataHora ?? true,
    lacre: provisorios?.lacre ?? true,
  }

  // ── Estado de UI puramente visual ──────────────────────────────────────
  const [estabAberto, setEstabAberto] = useState(false)
  const estabRef = useRef<HTMLDivElement>(null)
  // 2º telefone — DDI (só visual; o número montado com DDI é salvo em value.telefone2)
  const [telefone2Raw, setTelefone2Raw] = useState('')
  const [telefone2DDI, setTelefone2DDI] = useState('55')
  const [telefone2DDICustom, setTelefone2DDICustom] = useState('')

  // Deriva o "modo de contato" a partir do value (sem estado duplicado):
  // usarTelefone2ComoPrincipal=true → operador escolheu "Não, é outro" (mostra tel2).
  const mostrarTelefone2 = value.usarTelefone2ComoPrincipal
  const telefoneConfirmado = !value.usarTelefone2ComoPrincipal

  // Pré-preenchimento: reconstrói o raw visual do 2º telefone a partir do value salvo.
  // Roda uma única vez, quando o telefone2 chega (a carga do contrato é async).
  // Não chama set → sem loop; só popula o estado visual local.
  const tel2Init = useRef(false)
  useEffect(() => {
    if (tel2Init.current || !value.telefone2) return
    tel2Init.current = true
    // O value salvo é sempre DDI+dígitos (com "+" implícito) → parseia como colagem
    const { ddi, local } = parseTelefone('+' + soDigitos(value.telefone2))
    const ddiFinal = ddi ?? '55'
    setTelefone2DDI(DDIS_CONHECIDOS.includes(ddiFinal) ? ddiFinal : 'outro')
    setTelefone2Raw(ddiFinal === '55' ? mascararBR(local) : local)
  }, [value.telefone2])

  // Click fora do dropdown do autocomplete fecha
  useEffect(() => {
    if (!estabAberto) return
    function handle(e: MouseEvent) {
      if (estabRef.current && !estabRef.current.contains(e.target as Node)) setEstabAberto(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [estabAberto])

  // Valor salvo = DDI (dropdown/custom) + dígitos locais. Fonte única da verdade.
  function montarTelefone2(local: string, ddiSel: string, ddiCustom: string): string {
    const dig = soDigitos(local)
    if (!dig) return ''
    const ddi = ddiSel === 'outro' ? soDigitos(ddiCustom) : ddiSel
    return ddi + dig
  }

  // COLAGEM (caminho feliz do WhatsApp): extrai DDI e já formata bonito.
  function onPasteTel2(textoColado: string) {
    const { ddi, local } = parseTelefone(textoColado)
    const ddiFinal = ddi ?? telefone2DDI
    if (ddi) setTelefone2DDI(DDIS_CONHECIDOS.includes(ddi) ? ddi : 'outro')
    setTelefone2Raw(ddiFinal === '55' ? mascararBR(local) : local)
    set({ telefone2: montarTelefone2(local, ddiFinal, telefone2DDICustom) })
  }

  // DIGITAÇÃO/EDIÇÃO: livre, sem re-mascarar (editar no meio funciona). Só deriva o
  // valor salvo. Se o usuário digitar um "+DDI", é tratado como colagem parcial.
  function onChangeTel2(texto: string) {
    if (/^\s*\+/.test(texto)) { onPasteTel2(texto); return }
    const local = soDigitos(texto)
    setTelefone2Raw(texto)  // mostra exatamente o que ele digitou (cursor estável)
    set({ telefone2: montarTelefone2(local, telefone2DDI, telefone2DDICustom) })
  }

  // BLUR: formata o que tiver (só BR) — deixa bonito ao sair do campo.
  function onBlurTel2() {
    if (telefone2DDI === '55') setTelefone2Raw(mascararBR(telefone2Raw))
  }

  // Troca de DDI no dropdown: revaloriza o telefone2 com os dígitos atuais.
  function onChangeDDI2(novoDDI: string, novoCustom?: string) {
    if (novoDDI === 'outro') setTelefone2DDICustom(novoCustom ?? telefone2DDICustom)
    setTelefone2DDI(novoDDI)
    const custom = novoDDI === 'outro' ? (novoCustom ?? telefone2DDICustom) : telefone2DDICustom
    set({ telefone2: montarTelefone2(telefone2Raw, novoDDI, custom) })
  }

  const estabsFiltrados = value.estabBusca.trim()
    ? estabelecimentos.filter(e => e.nome.toLowerCase().includes(value.estabBusca.toLowerCase())).slice(0, 15)
    : estabelecimentos.slice(0, 15)

  return (
    <div className="p-3 rounded-xl border border-[var(--surface-200)] space-y-3">
      <h4 className="text-xs font-bold text-[var(--surface-600)] uppercase tracking-wider">Acolhimento</h4>

      {/* ── Contato para Cremação ──────────────────────────────────────── */}
      <div className="p-3 rounded-lg border-2 border-amber-500/30 bg-amber-500/5 space-y-2">
        <div className="flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 text-amber-500" />
          <label className="text-xs font-bold text-amber-500 uppercase tracking-wider">Contato para Cremação <span className="text-red-400">*</span></label>
        </div>
        <p className="text-[10px] text-amber-400 leading-snug">
          <AlertTriangle className="inline h-3 w-3 mr-0.5 align-text-bottom" />
          Matriz usará este número para chamar no dia da cremação. Você pode alterar depois com contrato no fluxo.
        </p>
        <div className="flex gap-2 items-stretch">
          <div className="flex-1 px-3 py-2 rounded-lg bg-[var(--surface-50)] text-sm text-mono text-[var(--surface-700)]">
            {formatarTel(telefoneBase)}
          </div>
          <button
            type="button"
            onClick={() => abrirWhatsApp(telefoneBase)}
            className="px-3 rounded-lg text-[11px] font-semibold border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 transition-all flex items-center gap-1.5 whitespace-nowrap"
            title="Abrir conversa no WhatsApp"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Validar
          </button>
        </div>

        <p className="text-[11px] font-medium text-[var(--surface-600)]">Está falando com a pessoa dona deste número?</p>

        <div className="flex gap-2">
          <button type="button" onClick={() => { set({ usarTelefone2ComoPrincipal: false, telefone2: '', telefone2Nome: '' }); setTelefone2Raw('') }}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${
              telefoneConfirmado && !mostrarTelefone2
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                : 'border-[var(--surface-200)] text-[var(--surface-500)] hover:border-[var(--surface-300)]'
            }`}>
            Sim, é este
          </button>
          <button type="button" onClick={() => set({ usarTelefone2ComoPrincipal: true })}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${
              mostrarTelefone2
                ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                : 'border-[var(--surface-200)] text-[var(--surface-500)] hover:border-[var(--surface-300)]'
            }`}>
            Não, é outro
          </button>
        </div>

        {telefoneConfirmado && !mostrarTelefone2 && (
          <div className="space-y-1 pt-1 mt-1 border-t border-emerald-500/20">
            <label className="text-[10px] text-emerald-400 font-medium block">Como devemos chamar este contato? <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={value.telefone1Nome}
              onChange={e => set({ telefone1Nome: e.target.value })}
              placeholder={`Ex: ${tutorNome?.split(' ')[0] || 'Ana'}`}
              className="input text-sm w-full"
              maxLength={80}
            />
            <p className="text-[9px] text-[var(--surface-400)] leading-snug">Apelido usado nas mensagens automáticas. Pode ser editado depois no contrato.</p>
          </div>
        )}

        {mostrarTelefone2 && (
          <div className="space-y-1.5 pt-1 mt-1 border-t border-amber-500/20">
            <label className="text-[10px] text-amber-400 font-medium">Telefone do contato atual (será usado pela Matriz e WhatsApp)</label>
            <div className="flex gap-1.5">
              {telefone2DDI === 'outro' ? (
                <div className="flex gap-1 items-center">
                  <span className="text-[var(--surface-400)] text-xs">+</span>
                  <input value={telefone2DDICustom} onChange={e => onChangeDDI2('outro', e.target.value.replace(/\D/g, '').slice(0, 4))} className="input text-sm text-mono w-14 text-center" placeholder="DDI" inputMode="numeric" />
                  <button type="button" onClick={() => onChangeDDI2('55')} className="text-[10px] text-[var(--surface-400)]">x</button>
                </div>
              ) : (
                <select value={telefone2DDI} onChange={e => onChangeDDI2(e.target.value)} className="input text-sm w-24">
                  <option value="55">+55</option>
                  <option value="1">+1</option>
                  <option value="351">+351</option>
                  <option value="54">+54</option>
                  <option value="outro">Outro</option>
                </select>
              )}
              <input type="text" inputMode="tel" value={telefone2Raw} onChange={e => onChangeTel2(e.target.value)} onPaste={e => { e.preventDefault(); onPasteTel2(e.clipboardData.getData('text')) }} onBlur={onBlurTel2} placeholder="(11) 95130-9000 — pode colar do WhatsApp" maxLength={22} className="input text-sm text-mono flex-1" />
            </div>
            <label className="text-[10px] text-amber-400 font-medium block mt-1">Nome e relação com o titular <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={value.telefone2Nome}
              onChange={e => set({ telefone2Nome: e.target.value })}
              placeholder="Ex: Maria — irmã do tutor"
              className="input text-sm w-full"
              maxLength={80}
            />
            <p className="text-[9px] text-[var(--surface-400)] leading-snug">Matriz e WhatsApp passam a usar este número. O telefone original fica salvo como secundário.</p>
          </div>
        )}
      </div>

      {/* ── Local de Acolhimento ───────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-[var(--surface-600)]">Local de Acolhimento <span className="text-red-400">*</span></label>
          {prov.local && (
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={value.semLocal} onChange={e => set({ semLocal: e.target.checked, ...(e.target.checked ? { localColeta: '' } : {}) })} className="h-3 w-3 rounded accent-amber-500" />
              <span className="text-[10px] text-amber-500">Sem local provisoriamente</span>
            </label>
          )}
        </div>

        {value.semLocal ? (
          <div className="px-3 py-2 rounded-lg bg-amber-900/10 border border-amber-500/30 text-xs text-amber-400">
            A definir — preencher depois no contrato
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { key: 'residencia', label: 'Residência' },
                { key: 'clinica', label: 'Clínica / Hospital' },
                { key: 'unidade', label: 'Unidade RIP PET' },
                { key: 'outro', label: 'Outro endereço' },
              ].map(opt => (
                <button key={opt.key} type="button" onClick={() => set({ localColeta: opt.key as AcolhimentoData['localColeta'], semLocal: false })}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border-2 transition-all ${value.localColeta === opt.key ? 'border-purple-500 bg-purple-500/10 text-purple-400' : 'border-[var(--surface-200)] text-[var(--surface-500)] hover:border-[var(--surface-300)]'}`}
                >{opt.label}</button>
              ))}
            </div>

            {/* Residência / Unidade: auto-padronizado */}
            {value.localColeta === 'residencia' && (
              <p className="mt-2 text-xs text-green-400 bg-green-900/10 rounded-lg px-3 py-2">
                Endereço do tutor (padronizado automaticamente)
              </p>
            )}
            {value.localColeta === 'unidade' && (
              <p className="mt-2 text-xs text-green-400 bg-green-900/10 rounded-lg px-3 py-2">
                Endereço da unidade (padronizado automaticamente)
              </p>
            )}

            {/* Clínica: precisa padronizar */}
            {value.localColeta === 'clinica' && (
              <div className="mt-2 space-y-2">
                {temPadronizacaoClinicas ? (
                  /* COM PADRONIZAÇÃO — Autocomplete */
                  <div ref={estabRef} className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-[var(--surface-500)]">Estabelecimento</label>
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input type="checkbox" checked={value.autonomo} onChange={e => { const c = e.target.checked; set({ autonomo: c, ...(c ? { estabId: null, estabNome: '', estabBusca: '' } : {}) }) }} className="h-3 w-3 rounded accent-blue-500" />
                        <span className="text-[10px] text-blue-400">Autônomo</span>
                      </label>
                    </div>
                    {value.autonomo ? (
                      <div className="px-3 py-2 rounded-lg border-2 border-dashed border-blue-500/30 bg-blue-900/10 text-xs text-blue-400">Profissional autônomo (sem vínculo)</div>
                    ) : (
                      <>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--surface-400)]" />
                          <input type="text" value={value.estabBusca} onChange={e => { set({ estabBusca: e.target.value, estabNome: e.target.value, estabId: null }); setEstabAberto(true) }} onFocus={() => setEstabAberto(true)} placeholder="Buscar clínica..." className="input pl-9 pr-3 text-sm" />
                        </div>
                        {estabAberto && (estabsFiltrados.length > 0 || value.estabBusca.trim()) && (
                          <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-[var(--surface-0)] border border-[var(--surface-200)] rounded-lg shadow-lg">
                            {estabsFiltrados.map(e => (
                              <button key={e.id} type="button" onClick={() => { set({ estabId: e.id, estabNome: e.nome, estabBusca: e.nome }); setEstabAberto(false) }}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-50)] transition-colors flex items-center justify-between ${value.estabId === e.id ? 'bg-[var(--surface-50)] font-medium text-[var(--surface-800)]' : 'text-[var(--surface-600)]'}`}>
                                <span>{e.nome}</span>
                                {e.cidade && <span className="text-xs text-[var(--surface-400)] shrink-0">{e.cidade}</span>}
                              </button>
                            ))}
                            {value.estabBusca.trim() && !estabsFiltrados.some(e => e.nome.toLowerCase() === value.estabBusca.toLowerCase()) && (
                              <button type="button" onClick={() => { set({ estabId: null, estabNome: value.estabBusca.trim() }); setEstabAberto(false) }}
                                className="w-full text-left px-3 py-2 text-sm text-amber-500 hover:bg-amber-900/10 flex items-center gap-2 border-t border-[var(--surface-100)]">
                                <Plus className="h-3.5 w-3.5" />Criar &quot;{value.estabBusca.trim()}&quot;
                              </button>
                            )}
                          </div>
                        )}
                        {value.estabId && <p className="mt-1 text-xs text-green-500 flex items-center gap-1"><Check className="h-3 w-3" />Selecionado</p>}
                        {!value.estabId && value.estabNome.trim() && !estabAberto && <p className="mt-1 text-xs text-amber-500">Novo estabelecimento será criado</p>}
                      </>
                    )}
                  </div>
                ) : (
                  /* SEM PADRONIZAÇÃO — Campo texto livre */
                  <div>
                    <input type="text" value={value.clinicaTextoLivre} onChange={e => set({ clinicaTextoLivre: e.target.value })} placeholder="Nome da clínica ou hospital" className="input text-sm" />
                    <p className="mt-1 text-[10px] text-[var(--surface-400)]">Mantenha sempre o mesmo padrão de escrita</p>
                  </div>
                )}
              </div>
            )}

            {/* Outro endereço: precisa padronizar */}
            {value.localColeta === 'outro' && (
              <div className="mt-2 space-y-2">
                <input type="text" value={value.enderecoOutro} onChange={e => set({ enderecoOutro: e.target.value })} placeholder="Endereço completo" className="input text-sm" />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Responsável pelo Acolhimento ───────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-[var(--surface-600)]">Responsável pelo Acolhimento <span className="text-red-400">*</span></label>
          {prov.responsavel && (
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={value.semResponsavel} onChange={e => set({ semResponsavel: e.target.checked, ...(e.target.checked ? { funcionarioId: '', responsavelUserId: '' } : {}) })} className="h-3 w-3 rounded accent-amber-500" />
              <span className="text-[10px] text-amber-500">Sem responsável provisoriamente</span>
            </label>
          )}
        </div>
        {value.semResponsavel ? (
          <div className="px-3 py-2 rounded-lg bg-amber-900/10 border border-amber-500/30 text-xs text-amber-400">A definir</div>
        ) : temOperacional ? (
          <select value={value.responsavelUserId} onChange={e => set({ responsavelUserId: e.target.value, ...(e.target.value ? { semResponsavel: false } : {}) })} className="input text-sm">
            <option value="">Selecione...</option>
            {atribuiveis.map(a => (<option key={a.user_id} value={a.user_id}>{a.nome}</option>))}
          </select>
        ) : (
          <select value={value.funcionarioId} onChange={e => set({ funcionarioId: e.target.value, ...(e.target.value ? { semResponsavel: false } : {}) })} className="input text-sm">
            <option value="">Selecione...</option>
            {funcionarios.map(f => (<option key={f.id} value={f.id}>{f.nome}</option>))}
          </select>
        )}
      </div>

      {/* ── Data e Hora do Acolhimento ─────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-[var(--surface-600)]">Data e Hora do Acolhimento <span className="text-red-400">*</span></label>
          {prov.dataHora && (
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={value.semDataHora} onChange={e => set({ semDataHora: e.target.checked, ...(e.target.checked ? { dataHoraAcolhimento: '' } : {}) })} className="h-3 w-3 rounded accent-amber-500" />
              <span className="text-[10px] text-amber-500">Sem data/hora provisoriamente</span>
            </label>
          )}
        </div>
        {value.semDataHora ? (
          <div className="px-3 py-2 rounded-lg bg-amber-900/10 border border-amber-500/30 text-xs text-amber-400">A definir</div>
        ) : (
          <input type="datetime-local" step="1800" value={value.dataHoraAcolhimento} onChange={e => set({ dataHoraAcolhimento: e.target.value, ...(e.target.value ? { semDataHora: false } : {}) })} className="input text-sm" />
        )}
      </div>

      {/* ── Lacre ──────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-[var(--surface-600)]">Número do Lacre <span className="text-red-400">*</span></label>
          {prov.lacre && (
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={value.semLacre} onChange={e => set({ semLacre: e.target.checked, ...(e.target.checked ? { lacre: '' } : {}) })} className="h-3 w-3 rounded accent-amber-500" />
              <span className="text-[10px] text-amber-500">Sem lacre provisoriamente</span>
            </label>
          )}
        </div>
        {value.semLacre ? (
          <div className="px-3 py-2 rounded-lg bg-amber-900/10 border border-amber-500/30 text-xs text-amber-400">A definir — preencher depois no contrato</div>
        ) : (
          <input type="text" value={value.lacre} onChange={e => set({ lacre: e.target.value })} placeholder="Número do lacre" className="input text-sm" />
        )}
      </div>
    </div>
  )
}
