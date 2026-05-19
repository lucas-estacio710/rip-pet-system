'use client'

import { useState, useEffect } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { tituloNome } from '@/lib/certificado-pdf'
import RacaAutocomplete from '@/components/ui/RacaAutocomplete'
import type { EspeciePet } from '@/lib/racas'

type ContratoMinimal = {
  id: string
  codigo: string
  pet_nome: string
  pet_especie?: string | null
  pet_raca?: string | null
  pet_genero?: string | null
  tutor_nome: string
  tutor?: { nome: string } | null
  certificado_nome_1: string | null
  certificado_nome_2: string | null
  certificado_nome_3: string | null
  certificado_nome_4: string | null
  certificado_nome_5: string | null
  certificado_nome_6: string | null
  certificado_nome_7: string | null
  certificado_confirmado: boolean | null
}

type Props = {
  isOpen: boolean
  onClose: () => void
  contrato: ContratoMinimal
  onSuccess?: (updated: {
    id: string
    // Único campo que ainda é gravado em `contratos` via este modal:
    pet_raca_normalizada: string | null
    certificado_nome_1: string | null
    certificado_nome_2: string | null
    certificado_nome_3: string | null
    certificado_nome_4: string | null
    certificado_nome_5: string | null
    certificado_nome_6: string | null
    certificado_nome_7: string | null
    certificado_confirmado: true
    // Snapshot atualizado em contrato_gc (consumido pelo GC para refletir UI sem reload):
    contrato_gc?: {
      pet_nome: string
      pet_especie: string | null
      pet_raca: string | null
      pet_genero: string | null
    }
  }) => void
}

export default function CertificadoModal({ isOpen, onClose, contrato, onSuccess }: Props) {
  const [certificadoNomes, setCertificadoNomes] = useState<string[]>(['', '', '', '', '', '', ''])
  const [salvando, setSalvando] = useState(false)
  const [slotsVisiveis, setSlotsVisiveis] = useState(1)
  // Estados editáveis — lidos do contrato_gc (snapshot) se existir; senão do contratos.
  const [petNome, setPetNome] = useState('')
  const [petEspecie, setPetEspecie] = useState<string>('')
  const [petRaca, setPetRaca] = useState('')
  const [petGenero, setPetGenero] = useState<string>('')
  // Indica se já existe linha em contrato_gc para este contrato (pra escolher UPDATE vs INSERT)
  const [temContratoGc, setTemContratoGc] = useState(false)
  // Data de agendamento da cremação (read-only) — vem do contrato_gc, exibida pra Matriz
  const [dataAgendamento, setDataAgendamento] = useState<string | null>(null)

  const supabase = createClient()

  // On open: fill names from contrato or default tutor name in first slot
  useEffect(() => {
    if (!isOpen) return

    const nomes = [
      contrato.certificado_nome_1 || '',
      contrato.certificado_nome_2 || '',
      contrato.certificado_nome_3 || '',
      contrato.certificado_nome_4 || '',
      contrato.certificado_nome_5 || '',
      contrato.certificado_nome_6 || '',
      contrato.certificado_nome_7 || '',
    ]

    // Se nenhum nome definido, colocar o tutor principal no primeiro campo
    if (!nomes.some(n => n.trim())) {
      const tutorNome = contrato.tutor?.nome || contrato.tutor_nome || ''
      nomes[0] = tituloNome(tutorNome)
    }

    setCertificadoNomes(nomes)
    // Mostra apenas slots já preenchidos (+1 vazio se ainda houver espaço pra adicionar)
    const preenchidos = nomes.filter(n => n.trim()).length
    setSlotsVisiveis(Math.max(1, Math.min(7, preenchidos)))

    // Default inicial vindo de `contratos` — será sobrescrito se houver snapshot em contrato_gc.
    // Raça começa SEMPRE em branco — operador clica no campo e o autocomplete sugere o melhor
    // match do catálogo baseado no pet_raca enviado pelo tutor.
    setPetNome(contrato.pet_nome || '')
    setPetEspecie(contrato.pet_especie || '')
    setPetRaca('')
    setPetGenero(contrato.pet_genero || '')
    setTemContratoGc(false)
    setDataAgendamento(null)

    // Busca snapshot do GC (se existir) — fonte de verdade após migration 081.
    // Pra raça: só carrega o snapshot se o certificado já foi confirmado antes.
    supabase
      .from('contrato_gc')
      .select('pet_nome, pet_especie, pet_raca, pet_genero, data_agendamento')
      .eq('contrato_id', contrato.id)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setTemContratoGc(true)
          const gc = data as { pet_nome: string | null; pet_especie: string | null; pet_raca: string | null; pet_genero: string | null; data_agendamento: string | null }
          if (gc.pet_nome != null) setPetNome(gc.pet_nome)
          if (gc.pet_especie != null) setPetEspecie(gc.pet_especie)
          // Raça do snapshot só carrega se já foi confirmado (operador já normalizou antes)
          if (gc.pet_raca != null && contrato.certificado_confirmado === true) setPetRaca(gc.pet_raca)
          if (gc.pet_genero != null) setPetGenero(gc.pet_genero)
          if (gc.data_agendamento) setDataAgendamento(gc.data_agendamento)
        }
      })

  }, [isOpen, contrato, supabase])

  // Mover nome para cima
  function moverTutorCima(index: number) {
    if (index <= 0) return
    const novos = [...certificadoNomes]
    const temp = novos[index - 1]
    novos[index - 1] = novos[index]
    novos[index] = temp
    setCertificadoNomes(novos)
  }

  // Mover nome para baixo
  function moverTutorBaixo(index: number) {
    if (index >= certificadoNomes.length - 1) return
    const novos = [...certificadoNomes]
    const temp = novos[index + 1]
    novos[index + 1] = novos[index]
    novos[index] = temp
    setCertificadoNomes(novos)
  }

  // Salvar no Supabase
  async function salvarCertificado() {
    // Defesa: raça é obrigatória pra geração do certificado
    if (!petRaca.trim()) {
      alert('Preencha a raça antes de confirmar. Clique no campo "Raça" para ver as sugestões do catálogo.')
      return
    }
    setSalvando(true)

    try {
      // Tutores: Title Case (preserva conectivos minúsculos: de, do, da, dos, das, e…)
      // Pet: CAPS no nome (padrão do sistema). O tituloNome só roda na geração do PDF.
      const nomesNorm = certificadoNomes.map(n => tituloNome(n.trim()))
      const petNomeNorm = petNome.trim().toUpperCase()
      const petRacaNorm = petRaca.trim() ? tituloNome(petRaca.trim()) : null

      // 1) Atualiza `contratos`: apenas nomes do certificado, confirmação e raça normalizada.
      //    Os 4 campos sensíveis do pet (nome/espécie/raça/gênero) ficam intactos.
      const contratoUpdate: Record<string, unknown> = {
        certificado_confirmado: true,
        pet_raca_normalizada: petRacaNorm,
      }
      nomesNorm.forEach((n, i) => { contratoUpdate[`certificado_nome_${i + 1}`] = n || null })

      const { error: errContrato } = await supabase
        .from('contratos')
        .update(contratoUpdate as never)
        .eq('id', contrato.id)
      if (errContrato) throw errContrato

      // 2) Atualiza/insere snapshot em `contrato_gc` (4 campos sensíveis).
      const gcSnapshot = {
        pet_nome: petNomeNorm,
        pet_especie: petEspecie || null,
        pet_raca: petRacaNorm,
        pet_genero: petGenero || null,
      }
      if (temContratoGc) {
        const { error: errGc } = await supabase
          .from('contrato_gc')
          .update(gcSnapshot as never)
          .eq('contrato_id', contrato.id)
        if (errGc) throw errGc
      } else {
        // Pet ainda não chegou no GC — cria a linha com etapa default. O trigger BEFORE INSERT
        // (migration 081) preenche os campos não fornecidos a partir de contratos.
        const { error: errIns } = await supabase
          .from('contrato_gc')
          .insert({ contrato_id: contrato.id, ...gcSnapshot } as never)
        if (errIns) throw errIns
      }

      onSuccess?.({
        id: contrato.id,
        pet_raca_normalizada: petRacaNorm,
        certificado_nome_1: nomesNorm[0] || null,
        certificado_nome_2: nomesNorm[1] || null,
        certificado_nome_3: nomesNorm[2] || null,
        certificado_nome_4: nomesNorm[3] || null,
        certificado_nome_5: nomesNorm[4] || null,
        certificado_nome_6: nomesNorm[5] || null,
        certificado_nome_7: nomesNorm[6] || null,
        certificado_confirmado: true,
        contrato_gc: gcSnapshot,
      })

      onClose()
    } catch (err) {
      console.error('Erro ao salvar certificado:', err)
      alert('Erro ao salvar. Tente novamente.')
    }

    setSalvando(false)
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-200">
            📜 Certificado de Cremação
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {/* Código do contrato */}
        <p className="text-[10px] text-slate-500 mb-3 font-mono">{contrato.codigo}</p>

        {/* Data de agendamento da cremação (read-only — Matriz vê a data que irá pro certificado) */}
        {dataAgendamento && (
          <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-blue-500/15 border border-blue-500/40">
            <span className="text-base">📅</span>
            <div className="flex-1">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Data da Cremação</p>
              <p className="text-sm font-semibold text-blue-800">
                {new Date(dataAgendamento).toLocaleString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        )}

        {/* Dados do pet (editáveis — vão para o certificado e atualizam o contrato) */}
        <div className="bg-slate-700/30 rounded-lg p-3 mb-3 space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">🐾 Dados do pet</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-slate-400 mb-0.5 block">Nome</label>
              <input
                type="text"
                value={petNome}
                onChange={e => setPetNome(e.target.value.toUpperCase())}
                placeholder="NOME DO PET"
                className="w-full px-2 py-1.5 border border-slate-600 rounded text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 uppercase"
                style={{ textTransform: 'uppercase' }}
              />
              {contrato.pet_nome && contrato.pet_nome.toUpperCase() !== petNome.toUpperCase() && (
                <p className="text-[9px] text-amber-400/80 mt-0.5 italic">🐾 Contrato: {contrato.pet_nome}</p>
              )}
            </div>
            <div>
              <label className="text-[10px] font-medium text-slate-400 mb-0.5 block">Raça</label>
              {contrato.pet_raca && (
                <p className="text-[10px] text-slate-500 mb-1 px-1.5 py-0.5 rounded bg-slate-800/60 border border-slate-700">
                  Tutor enviou: <span className="text-slate-300 font-medium">{contrato.pet_raca}</span>
                </p>
              )}
              <RacaAutocomplete
                value={petRaca}
                onChange={setPetRaca}
                especie={(petEspecie || null) as EspeciePet | null}
                placeholder="Inserir raça (Sugestões disponíveis)"
                sugestaoQuandoVazio={contrato.pet_raca || ''}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-slate-400 mb-0.5 block">Espécie</label>
              <div className="flex gap-1">
                {[
                  { v: 'canina', l: 'Canina' },
                  { v: 'felina', l: 'Felina' },
                  { v: 'exotica', l: 'Exótica' },
                ].map(o => (
                  <button
                    key={o.v}
                    onClick={() => setPetEspecie(o.v)}
                    className={`flex-1 px-1.5 py-1 rounded text-[10px] font-medium border transition-colors ${petEspecie === o.v ? 'border-purple-500 bg-purple-900/20 text-purple-300' : 'border-slate-600 text-slate-400 hover:bg-slate-700'}`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
              {contrato.pet_especie && contrato.pet_especie !== petEspecie && (
                <p className="text-[9px] text-amber-400/80 mt-0.5 italic">🐾 Contrato: {contrato.pet_especie}</p>
              )}
            </div>
            <div>
              <label className="text-[10px] font-medium text-slate-400 mb-0.5 block">Gênero</label>
              <div className="flex gap-1">
                {[
                  { v: 'macho', l: '♂ Macho', activeCls: 'border-blue-500 bg-blue-900/20 text-blue-300' },
                  { v: 'femea', l: '♀ Fêmea', activeCls: 'border-pink-500 bg-pink-900/20 text-pink-300' },
                ].map(o => (
                  <button
                    key={o.v}
                    onClick={() => setPetGenero(o.v)}
                    className={`flex-1 px-1.5 py-1 rounded text-[10px] font-medium border transition-colors ${petGenero === o.v ? o.activeCls : 'border-slate-600 text-slate-400 hover:bg-slate-700'}`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
              {contrato.pet_genero && contrato.pet_genero !== petGenero && (
                <p className="text-[9px] text-amber-400/80 mt-0.5 italic">🐾 Contrato: {contrato.pet_genero}</p>
              )}
            </div>
          </div>
        </div>

        {/* Hint */}
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">📜 Nomes no certificado</p>

        {/* Inputs (mostra só os slots visíveis; + adiciona próximo) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2 mb-3">
          {certificadoNomes.slice(0, slotsVisiveis).map((nome, index) => (
            <div key={index} className="flex items-center gap-1">
              <span className="text-xs text-slate-400 w-4">{index + 1}.</span>
              <input
                type="text"
                value={nome}
                onChange={(e) => {
                  const novos = [...certificadoNomes]
                  novos[index] = e.target.value
                  setCertificadoNomes(novos)
                }}
                onBlur={(e) => {
                  const novos = [...certificadoNomes]
                  novos[index] = tituloNome(e.target.value)
                  setCertificadoNomes(novos)
                }}
                placeholder={index === 0 ? 'Tutor principal' : `Nome ${index + 1} (opcional)`}
                className="flex-1 px-3 py-2 border border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
              <div className="flex flex-col">
                <button
                  onClick={() => moverTutorCima(index)}
                  disabled={index === 0 || !nome.trim()}
                  className="p-0.5 text-slate-400 hover:text-purple-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Mover para cima"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => moverTutorBaixo(index)}
                  disabled={index === slotsVisiveis - 1 || !nome.trim()}
                  className="p-0.5 text-slate-400 hover:text-purple-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Mover para baixo"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Botão para revelar próximo slot (até 7 no total) */}
        {slotsVisiveis < 7 && (
          <button
            onClick={() => setSlotsVisiveis(s => Math.min(7, s + 1))}
            className="w-full mb-4 py-2 text-xs font-medium text-purple-300 bg-purple-900/20 hover:bg-purple-900/30 border border-dashed border-purple-700/50 rounded-lg transition-colors"
          >
            + Adicionar nome
          </button>
        )}

        {/* Footer */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={salvarCertificado}
            disabled={salvando || !petRaca.trim()}
            title={!petRaca.trim() ? 'Preencha a raça antes de confirmar — clique no campo Raça para ver sugestões' : 'Confirmar e salvar'}
            className="flex-1 py-2 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {salvando ? 'Salvando...' : '✅ Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
