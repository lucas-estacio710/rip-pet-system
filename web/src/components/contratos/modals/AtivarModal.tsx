'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import AcolhimentoForm, { AcolhimentoData, ACOLHIMENTO_INICIAL } from '@/components/fichas/AcolhimentoForm'

// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️  MODAIS GÊMEOS — AtivarModal (este)  ⇄  TratativaModal
//     (web/src/components/fichas/TratativaModal.tsx)
// ───────────────────────────────────────────────────────────────────────────────
// Os dois compartilham o MESMO bloco de Acolhimento (via <AcolhimentoForm>) e os
// mesmos caminhos de gravação: criar/vincular estabelecimento (clínica), contato
// para cremação (tel1/tel2/principal), local de coleta, responsável, data/hora, lacre.
//
// REGRA DE OURO: toda correção de comportamento num DEVE ser refletida no outro.
//   Ex.: insert em `estabelecimentos` precisa de `endereco: ''` (coluna NOT NULL
//   sem default) — se esquecer num, a criação de clínica nova falha em silêncio.
//
// PARTICULARIDADES (o que PODE divergir de propósito):
//   • Obrigatoriedade: na ativação de PV (aqui) local/responsável/data-hora são
//     OBRIGATÓRIOS (pet já faleceu/foi acionado) — prop `provisorios`. Na ficha
//     emergencial (Tratativa) esses campos aceitam "sem X provisoriamente".
//   • O TratativaModal tem o bloco extra de INDICAÇÃO (quem indicou), que também
//     cria estabelecimento; o AtivarModal não tem.
//
// Ainda não foram unificados de propósito: o TratativaModal é crítico p/ operação.
// Enquanto separados, andam juntos — mesmos caminhos, particularidades pontuais.
// ═══════════════════════════════════════════════════════════════════════════════

type ContratoMinimal = {
  id: string
  codigo: string
  pet_nome: string
  tutor_nome: string
  tutor_telefone?: string | null
  unidade_id?: string | null
  tutor?: { nome: string; telefone?: string | null } | null
}

type Props = {
  isOpen: boolean
  onClose: () => void
  contrato: ContratoMinimal
  onSuccess?: (updated: {
    id: string
    status: string
    data_acolhimento: string
    local_coleta: string
    numero_lacre: string | null
  }) => void
}

type Estab = { id: string; nome: string; tipo: string | null; cidade: string | null }

// Estabelecimento "Autônomo" fixo (mesmo id usado no TratativaModal).
const AUTONOMOS_ESTAB_ID = 'b4eedcff-7ccf-4cfb-bf3a-1978eeec6382'

export default function AtivarModal({ isOpen, onClose, contrato, onSuccess }: Props) {
  const supabase = createClient()
  const { currentUnit } = useUnit()

  const temPadronizacaoClinicas = !!currentUnit?.modulos_ativos?.includes('cb_padronizacao_clinicas')

  const [acolhimento, setAcolhimento] = useState<AcolhimentoData>(ACOLHIMENTO_INICIAL)
  const [salvando, setSalvando] = useState(false)

  const [funcionarios, setFuncionarios] = useState<{ id: string; nome: string }[]>([])
  const [estabelecimentos, setEstabelecimentos] = useState<Estab[]>([])

  const telefoneBase = contrato.tutor?.telefone || contrato.tutor_telefone || ''
  const tutorNome = contrato.tutor?.nome || contrato.tutor_nome || ''

  // On open: load auxiliary data + pré-preenche o form com o que já existe no contrato
  useEffect(() => {
    if (!isOpen) return

    const pad = (n: number) => String(n).padStart(2, '0')
    const isoParaDatetimeLocal = (iso: string) => {
      const d = new Date(iso)
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    const agora = new Date()
    const dataHoraAgora = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}T${pad(agora.getHours())}:${pad(agora.getMinutes())}`

    // Reverte o label salvo em local_coleta pro key do form
    const localMap: Record<string, AcolhimentoData['localColeta']> = {
      'Residência': 'residencia', 'Residencia': 'residencia',
      'Clínica': 'clinica', 'Clinica': 'clinica',
      'Unidade': 'unidade', 'Outro': 'outro',
    }

    // Funcionários ativos da unidade do contrato (fallback: unidade ativa)
    const unidadeFuncs = contrato.unidade_id || currentUnit?.id
    let funcQuery = supabase.from('funcionarios').select('id, nome').eq('ativo', true)
    if (unidadeFuncs) funcQuery = funcQuery.eq('unidade_id', unidadeFuncs)
    funcQuery.order('nome').then(({ data }) => {
      if (data) setFuncionarios(data)
    })

    // Estabelecimentos (clínicas e hospitais) para o autocomplete
    supabase
      .from('estabelecimentos')
      .select('id, nome, tipo, cidade')
      .in('tipo', ['clinica', 'hospital'])
      .order('nome')
      .then(({ data }) => {
        if (data) setEstabelecimentos(data as Estab[])
      })

    // Pré-preenche o Acolhimento com o que já está gravado no contrato (só ajustar se preciso)
    supabase
      .from('contratos')
      .select('local_coleta, clinica_coleta, estabelecimento_id, funcionario_id, numero_lacre, data_acolhimento, tutor_telefone_nome, tutor_telefone2, tutor_telefone2_nome, estab:estabelecimentos!estabelecimento_id(nome)')
      .eq('id', contrato.id)
      .single()
      .then(({ data }) => {
        const c = data as {
          local_coleta: string | null; clinica_coleta: string | null; estabelecimento_id: string | null
          funcionario_id: string | null; numero_lacre: string | null; data_acolhimento: string | null
          tutor_telefone_nome: string | null; tutor_telefone2: string | null; tutor_telefone2_nome: string | null
          estab: { nome: string } | null
        } | null

        if (!c) {
          setAcolhimento({ ...ACOLHIMENTO_INICIAL, dataHoraAcolhimento: dataHoraAgora })
          return
        }

        const localColeta = c.local_coleta ? (localMap[c.local_coleta] || '') : ''
        const temTel2 = !!c.tutor_telefone2

        setAcolhimento({
          ...ACOLHIMENTO_INICIAL,
          telefone1Nome: c.tutor_telefone_nome || '',
          telefone2: c.tutor_telefone2 || '',
          telefone2Nome: c.tutor_telefone2_nome || '',
          usarTelefone2ComoPrincipal: temTel2,
          localColeta,
          estabId: c.estabelecimento_id || null,
          estabNome: localColeta === 'clinica' && temPadronizacaoClinicas ? (c.estab?.nome || c.clinica_coleta || '') : '',
          clinicaTextoLivre: localColeta === 'clinica' && !temPadronizacaoClinicas ? (c.clinica_coleta || '') : '',
          enderecoOutro: localColeta === 'outro' ? (c.clinica_coleta || '') : '',
          funcionarioId: c.funcionario_id || '',
          dataHoraAcolhimento: c.data_acolhimento ? isoParaDatetimeLocal(c.data_acolhimento) : dataHoraAgora,
          lacre: c.numero_lacre || '',
        })
      })
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Local válido: preenchido e, se clínica/outro, com o detalhe informado
  const localOk =
    !!acolhimento.localColeta &&
    (acolhimento.localColeta !== 'clinica'
      ? true
      : temPadronizacaoClinicas
        ? acolhimento.autonomo || !!acolhimento.estabNome.trim()
        : !!acolhimento.clinicaTextoLivre.trim()) &&
    (acolhimento.localColeta !== 'outro' || !!acolhimento.enderecoOutro.trim())

  // PV: pet morreu / foi acionado → local, responsável e data/hora obrigatórios (lacre não)
  const podeAtivar = localOk && !!acolhimento.funcionarioId && !!acolhimento.dataHoraAcolhimento

  async function salvarAtivacao() {
    const a = acolhimento

    const faltando: string[] = []
    if (!a.localColeta) faltando.push('Local de acolhimento')
    else if (a.localColeta === 'clinica') {
      const clinicaOk = temPadronizacaoClinicas ? (a.autonomo || !!a.estabNome.trim()) : !!a.clinicaTextoLivre.trim()
      if (!clinicaOk) faltando.push('Clínica / hospital')
    } else if (a.localColeta === 'outro' && !a.enderecoOutro.trim()) {
      faltando.push('Endereço (Outro)')
    }
    if (!a.funcionarioId) faltando.push('Responsável pelo acolhimento')
    if (!a.dataHoraAcolhimento) faltando.push('Data e hora do acolhimento')

    if (faltando.length) {
      alert('Preencha os campos obrigatórios da ativação:\n\n• ' + faltando.join('\n• '))
      return
    }

    setSalvando(true)

    try {
      const dataHoraIso = !a.semDataHora && a.dataHoraAcolhimento
        ? new Date(a.dataHoraAcolhimento).toISOString()
        : null

      // Local de acolhimento → label + campo de texto (clínica/outro)
      const localColetaMap: Record<string, string> = { residencia: 'Residência', clinica: 'Clínica', unidade: 'Unidade', outro: 'Outro' }
      const localColetaValor = a.semLocal ? null : (localColetaMap[a.localColeta] || null)
      const isClinica = !a.semLocal && a.localColeta === 'clinica'
      const isOutro = !a.semLocal && a.localColeta === 'outro'

      // Resolve estabelecimento (com padronização): autônomo / existente / criar novo
      let resolvedEstabId: string | null = null
      let clinicaColetaNome: string | null = null
      if (isClinica) {
        if (temPadronizacaoClinicas) {
          if (a.autonomo) {
            resolvedEstabId = AUTONOMOS_ESTAB_ID
            clinicaColetaNome = 'Autônomo'
          } else {
            clinicaColetaNome = a.estabNome.trim() || null
            resolvedEstabId = a.estabId
            if (!resolvedEstabId && a.estabNome.trim()) {
              const unidadeId = contrato.unidade_id || currentUnit?.id || null
              // endereco é NOT NULL sem default — precisa ir como '' senão o insert falha
              const { data: novoEstab, error: estabErr } = await supabase
                .from('estabelecimentos')
                .insert({ nome: a.estabNome.trim(), tipo: 'clinica', unidade_id: unidadeId, endereco: '' } as never)
                .select('id')
                .single() as { data: { id: string } | null; error: { message: string } | null }
              if (estabErr) {
                setSalvando(false)
                alert('Não foi possível criar o estabelecimento "' + a.estabNome.trim() + '":\n' + estabErr.message)
                return
              }
              if (novoEstab) resolvedEstabId = novoEstab.id
            }
          }
        } else {
          clinicaColetaNome = a.clinicaTextoLivre.trim() || null
        }
      }

      // clinica_coleta grava o nome da clínica (se clínica) ou o endereço livre (se "Outro")
      const clinicaColeta = isClinica ? clinicaColetaNome : (isOutro ? (a.enderecoOutro.trim() || null) : null)

      // Contato para cremação: se marcou "Não, é outro" e informou telefone2 → vira principal
      const hasTel2 = a.usarTelefone2ComoPrincipal && !!a.telefone2.trim()
      const tel1NomeVal = a.telefone1Nome.trim() || null
      const tel2NomeVal = a.telefone2Nome.trim() || null
      const telPrincipal = hasTel2 ? a.telefone2 : telefoneBase
      const telSecundario = hasTel2 ? telefoneBase : null
      const telPrincipalNome = hasTel2 ? tel2NomeVal : tel1NomeVal
      const telSecundarioNome = hasTel2 ? tel1NomeVal : null

      // cb_cremacao_local (PI): ao acionar PV, vai direto pra 'pinda' (sem passar por 'ativo').
      // Checa modulos_ativos direto — hasModule() retorna true sempre pra super_admin.
      const novoStatus: 'ativo' | 'pinda' = currentUnit?.modulos_ativos?.includes('cb_cremacao_local') ? 'pinda' : 'ativo'

      const { error } = await supabase
        .from('contratos')
        .update({
          status: novoStatus,
          data_acolhimento: dataHoraIso,
          local_coleta: localColetaValor,
          clinica_coleta: clinicaColeta,
          estabelecimento_id: isClinica ? (resolvedEstabId || null) : null,
          numero_lacre: a.semLacre ? null : (a.lacre.trim() || null),
          funcionario_id: a.semResponsavel ? null : (a.funcionarioId || null),
          tutor_telefone: telPrincipal,
          tutor_telefone2: telSecundario,
          tutor_telefone_nome: telPrincipalNome,
          tutor_telefone2_nome: telSecundarioNome,
          tutor_telefone_principal: 1,
        } as never)
        .eq('id', contrato.id)

      if (error) throw error

      onSuccess?.({
        id: contrato.id,
        status: novoStatus,
        data_acolhimento: dataHoraIso || '',
        local_coleta: localColetaValor || '',
        numero_lacre: a.semLacre ? null : (a.lacre.trim() || null),
      })

      onClose()
    } catch (err) {
      console.error('Erro ao ativar contrato:', err)
      alert('Erro ao ativar contrato. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--surface-0)] rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--surface-200)] bg-amber-500/5 rounded-t-xl shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-2xl">✝️</span>
            <div>
              <h3 className="font-bold text-[var(--surface-800)]">Ativar Contrato</h3>
              <p className="text-sm text-[var(--surface-500)]">
                {contrato.pet_nome} &middot; {tutorNome}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[var(--surface-100)] rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-[var(--surface-500)]" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 flex-1 overflow-y-auto min-h-0">
          <AcolhimentoForm
            value={acolhimento}
            onChange={setAcolhimento}
            temPadronizacaoClinicas={temPadronizacaoClinicas}
            funcionarios={funcionarios}
            estabelecimentos={estabelecimentos}
            telefoneBase={telefoneBase}
            tutorNome={tutorNome}
            // PV: pet já morreu e foi acionado → local, responsável e data/hora obrigatórios.
            // Só o lacre pode ficar provisório.
            provisorios={{ local: false, responsavel: false, dataHora: false, lacre: true }}
          />
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-[var(--surface-200)] bg-[var(--surface-50)] rounded-b-xl shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 border border-[var(--surface-300)] rounded-lg text-[var(--surface-600)] hover:bg-[var(--surface-100)] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={salvarAtivacao}
            disabled={salvando || !podeAtivar}
            className="flex-1 py-2 px-4 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {salvando ? (
              <>
                <span className="animate-spin">⏳</span>
                Ativando...
              </>
            ) : (
              <>
                <span>✝️</span>
                Ativar Contrato
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
