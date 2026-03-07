'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { User, PawPrint, Flame, Search, Check, Plus, Pencil, Loader2, Building2, UserCheck } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'

// ============================================
// Types
// ============================================
type Ficha = {
  id: string
  created_at: string
  nome_completo: string
  cpf: string
  telefone: string
  email: string | null
  cep: string
  estado: string
  cidade: string
  bairro: string
  endereco: string
  numero: string
  complemento: string | null
  outros_tutores: string[] | null
  nome_pet: string
  idade: string | null
  especie: string
  genero: string
  raca: string | null
  cor: string
  peso: string | null
  cremacao: string
  valor: number | null
  pagamento: string
  parcelas: string | null
  velorio: string
  acompanhamento: string
  localizacao: string
  localizacao_outra: string | null
  como_conheceu: string[] | null
  veterinario_especificar: string | null
  outro_especificar: string | null
  observacoes: string | null
}

type Estabelecimento = { id: string; nome: string; tipo: string | null }
type Contato = { id: string; nome: string; cargo: string | null; estabelecimento_id: string | null }
type Funcionario = { id: string; nome: string }
type TutorExistente = { id: string; nome: string } | null

type Props = {
  isOpen: boolean
  onClose: () => void
  ficha: Ficha | null
  onSuccess: (contratoId: string) => void
}

// Nomes compostos: se o primeiro nome é um desses prefixos, inclui o segundo nome
const PREFIXOS_NOME_COMPOSTO = [
  'maria', 'ana', 'anna', 'rosa',
  'joao', 'joão', 'jose', 'josé',
  'pedro', 'luiz', 'luis', 'luís', 'carlos', 'marco',
]

function capitalizarNome(nome: string): string {
  if (!nome) return ''
  return nome.split(/\s+/).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ')
}

function getPrimeiroNome(nomeCompleto: string | null | undefined): string {
  if (!nomeCompleto) return ''
  const partes = nomeCompleto.trim().split(/\s+/)
  if (partes.length <= 1) return capitalizarNome(partes[0] || '')
  const primeiroLower = partes[0].toLowerCase()
  const qtd = PREFIXOS_NOME_COMPOSTO.includes(primeiroLower) ? 2 : 1
  return capitalizarNome(partes.slice(0, qtd).join(' '))
}

// ============================================
// Component
// ============================================
export default function TratativaModal({ isOpen, onClose, ficha, onSuccess }: Props) {
  const { toast } = useToast()
  const supabase = createClient()

  // Lookups
  const [estabelecimentos, setEstabelecimentos] = useState<Estabelecimento[]>([])
  const [contatos, setContatos] = useState<Contato[]>([])
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [tutorExistente, setTutorExistente] = useState<TutorExistente>(null)
  const [tutorChecked, setTutorChecked] = useState(false)

  // Estabelecimento autocomplete
  const [estabBusca, setEstabBusca] = useState('')
  const [estabAberto, setEstabAberto] = useState(false)
  const [estabId, setEstabId] = useState<string | null>(null)
  const [estabNome, setEstabNome] = useState('')
  const [autonomo, setAutonomo] = useState(false)
  const estabRef = useRef<HTMLDivElement>(null)

  // Contato (pessoa que indicou) autocomplete
  const [indicBusca, setIndicBusca] = useState('')
  const [indicAberto, setIndicAberto] = useState(false)
  const [indicId, setIndicId] = useState<string | null>(null)
  const [indicNome, setIndicNome] = useState('')
  const [indicCargo, setIndicCargo] = useState('')
  const indicRef = useRef<HTMLDivElement>(null)

  // Form fields
  const [tipoPlano, setTipoPlano] = useState<'emergencial' | 'preventivo'>('emergencial')
  const [funcionarioId, setFuncionarioId] = useState('')
  const [codigo, setCodigo] = useState('')
  const [codigoManual, setCodigoManual] = useState(false)
  const [valorPlano, setValorPlano] = useState('')
  const [lacre, setLacre] = useState('')
  const [semLacre, setSemLacre] = useState(false)
  const [dataContrato, setDataContrato] = useState(new Date().toISOString().split('T')[0])

  const [salvando, setSalvando] = useState(false)

  // ============================================
  // Data loading
  // ============================================
  useEffect(() => {
    if (!isOpen || !ficha) return
    async function loadData() {
      const [{ data: estabs }, { data: conts }, { data: funcs }] = await Promise.all([
        supabase.from('estabelecimentos').select('id, nome, tipo').order('nome'),
        supabase.from('contatos').select('id, nome, cargo, estabelecimento_id').order('nome'),
        supabase.from('funcionarios').select('id, nome').eq('ativo', true).order('nome'),
      ])
      if (estabs) setEstabelecimentos(estabs as Estabelecimento[])
      if (conts) setContatos(conts as Contato[])
      if (funcs) setFuncionarios(funcs as Funcionario[])
    }
    loadData()
  }, [isOpen, ficha])

  // Check tutor by CPF
  useEffect(() => {
    if (!isOpen || !ficha?.cpf) {
      setTutorExistente(null)
      setTutorChecked(false)
      return
    }
    async function checkTutor() {
      const cpfLimpo = ficha!.cpf.replace(/\D/g, '')
      if (cpfLimpo.length < 11) {
        setTutorExistente(null)
        setTutorChecked(true)
        return
      }
      const { data } = await supabase
        .from('tutores')
        .select('id, nome')
        .or(`cpf.eq.${ficha!.cpf},cpf.eq.${cpfLimpo}`)
        .limit(1)
        .maybeSingle()
      setTutorExistente(data)
      setTutorChecked(true)
    }
    checkTutor()
  }, [isOpen, ficha?.cpf])

  // Pre-populate fields from ficha
  useEffect(() => {
    if (!isOpen || !ficha) return
    if (ficha.veterinario_especificar) {
      setEstabBusca(ficha.veterinario_especificar)
    }
    if (ficha.valor != null) {
      setValorPlano(String(ficha.valor))
    }
  }, [isOpen, ficha])

  // Auto-generate codigo: AA+mes(3 letras)+dd PrimeiroNome EM/PV Pet IND/COL
  useEffect(() => {
    if (!isOpen || !ficha || codigoManual) return
    const now = new Date(dataContrato + 'T12:00:00')
    const yy = String(now.getFullYear()).slice(-2)
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const siglaCremacao = ficha.cremacao?.toLowerCase() === 'individual' ? 'IND' : 'COL'
    const tutor3 = (ficha.nome_completo || '').trim().slice(0, 3).toUpperCase()
    const pet3 = (ficha.nome_pet || '').trim().slice(0, 3).toUpperCase()
    setCodigo(`${yy}${mm}${dd}${siglaCremacao}${tutor3}${pet3}`)
  }, [isOpen, ficha, tipoPlano, dataContrato, codigoManual])

  // Reset form on close
  useEffect(() => {
    if (!isOpen) {
      setTipoPlano('emergencial')
      setEstabId(null)
      setEstabNome('')
      setEstabBusca('')
      setAutonomo(false)
      setIndicId(null)
      setIndicNome('')
      setIndicBusca('')
      setIndicCargo('')
      setFuncionarioId('')
      setCodigo('')
      setCodigoManual(false)
      setValorPlano('')
      setLacre('')
      setSemLacre(false)
      setDataContrato(new Date().toISOString().split('T')[0])
      setSalvando(false)
      setTutorExistente(null)
      setTutorChecked(false)
    }
  }, [isOpen])

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (estabRef.current && !estabRef.current.contains(e.target as Node)) setEstabAberto(false)
      if (indicRef.current && !indicRef.current.contains(e.target as Node)) setIndicAberto(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ============================================
  // Filtered lists
  // ============================================
  const estabsFiltrados = estabBusca.trim()
    ? estabelecimentos.filter(e => e.nome.toLowerCase().includes(estabBusca.toLowerCase())).slice(0, 15)
    : estabelecimentos.slice(0, 15)

  // Contatos: filter by selected establishment, then by search text
  const contatosFiltrados = (() => {
    let lista = contatos
    if (estabId) lista = lista.filter(c => c.estabelecimento_id === estabId)
    if (indicBusca.trim()) lista = lista.filter(c => c.nome.toLowerCase().includes(indicBusca.toLowerCase()))
    return lista.slice(0, 10)
  })()

  // ============================================
  // processarFicha
  // ============================================
  async function processarFicha() {
    if (!ficha || !codigo.trim()) return
    setSalvando(true)

    try {
      // Step 1: Find or create tutor
      let tutorId = tutorExistente?.id || null
      if (!tutorId) {
        const { data: novoTutor, error: errTutor } = await supabase
          .from('tutores')
          .insert({
            nome: ficha.nome_completo,
            cpf: ficha.cpf,
            telefone: ficha.telefone,
            email: ficha.email || null,
            cep: ficha.cep,
            endereco: ficha.endereco,
            numero: ficha.numero,
            complemento: ficha.complemento || null,
            bairro: ficha.bairro,
            cidade: ficha.cidade,
            estado: ficha.estado,
          } as never)
          .select('id')
          .single() as { data: { id: string } | null; error: { message: string } | null }
        if (errTutor) throw new Error(`Erro ao criar tutor: ${errTutor.message}`)
        tutorId = novoTutor!.id
      }

      // Step 2: Map fonte_conhecimento
      let fonteConhecimentoId: string | null = null
      if (ficha.como_conheceu && ficha.como_conheceu.length > 0) {
        const fonteMap: Record<string, string> = {
          'Google': 'Google', 'Instagram/Facebook': 'Instagram',
          'Veterinário': 'Clínica', 'Parente/Amigo': 'Parente/Amigo',
          'Já utilizei a R.I.P. Pet': 'Cliente', 'Outro': 'Outro',
        }
        const nomeBusca = fonteMap[ficha.como_conheceu[0]] || ficha.como_conheceu[0]
        const { data: fonte } = await supabase
          .from('fontes_conhecimento')
          .select('id')
          .ilike('nome', `%${nomeBusca}%`)
          .limit(1)
          .maybeSingle() as { data: { id: string } | null }
        if (fonte) fonteConhecimentoId = fonte.id
      }

      // Step 3: Resolve estabelecimento
      const AUTONOMOS_ESTAB_ID = 'b4eedcff-7ccf-4cfb-bf3a-1978eeec6382'
      let resolvedEstabId: string | null = null
      if (autonomo) {
        resolvedEstabId = AUTONOMOS_ESTAB_ID
      } else {
        resolvedEstabId = estabId
        if (!resolvedEstabId && estabNome.trim()) {
          const { data: novoEstab } = await supabase
            .from('estabelecimentos')
            .insert({ nome: estabNome.trim(), tipo: 'clinica' } as never)
            .select('id')
            .single() as { data: { id: string } | null }
          if (novoEstab) resolvedEstabId = novoEstab.id
        }
      }

      // Step 4: Resolve contato (quem indicou)
      let resolvedContatoId: string | null = indicId

      if (!resolvedContatoId && indicNome.trim()) {
        // Busca contato existente pelo nome (+ estabelecimento se tiver)
        let query = supabase
          .from('contatos')
          .select('id')
          .ilike('nome', indicNome.trim())
          .limit(1)
        if (resolvedEstabId) {
          query = query.eq('estabelecimento_id', resolvedEstabId)
        }
        const { data: contatoExist } = await query.maybeSingle() as { data: { id: string } | null }

        if (contatoExist) {
          resolvedContatoId = contatoExist.id
        } else {
          // Cria novo contato
          const { data: novoContato } = await supabase
            .from('contatos')
            .insert({
              nome: indicNome.trim(),
              cargo: indicCargo.trim() || null,
              estabelecimento_id: resolvedEstabId,
            } as never)
            .select('id')
            .single() as { data: { id: string } | null }
          if (novoContato) resolvedContatoId = novoContato.id
        }
      }

      // Step 5: Build observacoes
      const obsPartes: string[] = []
      if (ficha.observacoes) obsPartes.push(ficha.observacoes)
      if (ficha.pagamento) obsPartes.push(`Pagamento: ${ficha.pagamento}${ficha.parcelas ? ` (${ficha.parcelas})` : ''}`)
      if (ficha.outros_tutores && ficha.outros_tutores.filter(Boolean).length > 0) {
        obsPartes.push(`Outros tutores: ${ficha.outros_tutores.filter(Boolean).join(', ')}`)
      }
      if (ficha.localizacao_outra) obsPartes.push(`Local: ${ficha.localizacao_outra}`)

      // Step 6: Map local_coleta
      let localColeta: string | null = null
      if (ficha.localizacao) {
        if (ficha.localizacao.includes('Residência')) localColeta = 'Residência'
        else if (ficha.localizacao.includes('Hospital') || ficha.localizacao.includes('Clínica')) localColeta = 'Clínica'
        else if (ficha.localizacao.includes('Unidade')) localColeta = 'Unidade Canal 6'
        else localColeta = ficha.localizacao
      }

      // Step 7: Insert contrato
      const status = tipoPlano === 'emergencial' ? 'ativo' : 'preventivo'

      const contratoData = {
        codigo: codigo.trim(),
        status,
        tipo_plano: tipoPlano,
        tipo_cremacao: ficha.cremacao.toLowerCase() as 'individual' | 'coletiva',
        pet_nome: ficha.nome_pet?.toUpperCase() || '',
        pet_especie: ficha.especie.toLowerCase(),
        pet_raca: ficha.raca || null,
        pet_genero: ficha.genero ? ficha.genero.toLowerCase() : null,
        pet_cor: ficha.cor || null,
        pet_peso: ficha.peso ? parseFloat(ficha.peso) || null : null,
        pet_idade_anos: ficha.idade ? parseInt(ficha.idade) || null : null,
        tutor_id: tutorId,
        tutor_nome: ficha.nome_completo?.toUpperCase() || '',
        tutor_cpf: ficha.cpf,
        tutor_telefone: ficha.telefone,
        tutor_email: ficha.email || null,
        tutor_cidade: ficha.cidade || null,
        tutor_bairro: ficha.bairro || null,
        tutor_endereco: ficha.endereco ? `${ficha.endereco}, ${ficha.numero}${ficha.complemento ? ` - ${ficha.complemento}` : ''}` : null,
        tutor_cep: ficha.cep || null,
        contato_id: resolvedContatoId || null,
        estabelecimento_id: resolvedEstabId || null,
        funcionario_id: funcionarioId || null,
        fonte_conhecimento_id: fonteConhecimentoId,
        data_contrato: dataContrato,
        pelinho_quer: true,
        pelinho_feito: false,
        pelinho_quantidade: 1,
        velorio_deseja: ficha.velorio === 'Sim' ? true : ficha.velorio === 'Não' ? false : null,
        acompanhamento_online: ficha.acompanhamento?.includes('On-line') || false,
        acompanhamento_presencial: ficha.acompanhamento?.includes('Presencial') || false,
        valor_plano: valorPlano ? parseFloat(valorPlano) : null,
        local_coleta: localColeta,
        numero_lacre: lacre || null,
        observacoes: obsPartes.length > 0 ? obsPartes.join('\n') : null,
      }

      const { data: contrato, error: errContrato } = await supabase
        .from('contratos')
        .insert(contratoData as never)
        .select('id')
        .single() as { data: { id: string } | null; error: { message: string } | null }

      if (errContrato) throw new Error(`Erro ao criar contrato: ${errContrato.message}`)

      // Step 8: Mark ficha as processed
      await supabase
        .from('fichas')
        .update({
          processada: true,
          contrato_id: contrato!.id,
          processada_em: new Date().toISOString(),
          processada_por: funcionarioId || null,
        } as never)
        .eq('id', ficha.id)

      toast('Contrato criado com sucesso!', 'success')
      onSuccess(contrato!.id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      toast(message, 'error')
      console.error('Erro ao processar ficha:', err)
    } finally {
      setSalvando(false)
    }
  }

  if (!ficha) return null

  // ============================================
  // Render
  // ============================================
  const footer = (
    <div className="flex gap-3 justify-end">
      <button onClick={onClose} className="btn-secondary" disabled={salvando}>
        Cancelar
      </button>
      <button
        onClick={processarFicha}
        disabled={salvando || !codigo.trim() || (!lacre.trim() && !semLacre)}
        className="btn-primary disabled:opacity-50"
      >
        {salvando ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Processando...
          </>
        ) : (
          'Criar Contrato'
        )}
      </button>
    </div>
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Processar Ficha" footer={footer} size="xl">
      {/* Tutor detection banner */}
      {tutorChecked && (
        <div className={`mb-4 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
          tutorExistente
            ? 'bg-green-900/30 text-green-400 border border-green-700'
            : 'bg-blue-900/30 text-blue-400 border border-blue-700'
        }`}>
          {tutorExistente ? (
            <><Check className="h-4 w-4" />Tutor existente: {tutorExistente.nome}</>
          ) : (
            <><Plus className="h-4 w-4" />Novo tutor sera criado</>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ======== LEFT COLUMN — Ficha summary ======== */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-[var(--surface-500)] uppercase tracking-wide">Dados da Ficha</h3>

          {/* Tutor */}
          <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)] space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--surface-700)] mb-2">
              <User className="h-4 w-4" />Tutor
            </div>
            <InfoRow label="Nome" value={ficha.nome_completo} />
            <InfoRow label="CPF" value={ficha.cpf} mono />
            <InfoRow label="Telefone" value={ficha.telefone} mono />
            {ficha.email && <InfoRow label="Email" value={ficha.email} />}
            <InfoRow label="Endereco" value={`${ficha.endereco}, ${ficha.numero}${ficha.complemento ? ` - ${ficha.complemento}` : ''}`} />
            <InfoRow label="Bairro/Cidade" value={`${ficha.bairro}, ${ficha.cidade} - ${ficha.estado}`} />
            <InfoRow label="CEP" value={ficha.cep} mono />
          </div>

          {/* Pet */}
          <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)] space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--surface-700)] mb-2">
              <PawPrint className="h-4 w-4" />Pet
            </div>
            <InfoRow label="Nome" value={ficha.nome_pet} bold />
            <InfoRow label="Especie" value={ficha.especie} />
            {ficha.raca && <InfoRow label="Raca" value={ficha.raca} />}
            <InfoRow label="Genero" value={ficha.genero} />
            <InfoRow label="Cor" value={ficha.cor} />
            {ficha.peso && <InfoRow label="Peso" value={`${ficha.peso} kg`} />}
            {ficha.idade && <InfoRow label="Idade" value={ficha.idade} />}
          </div>

          {/* Servico */}
          <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)] space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--surface-700)] mb-2">
              <Flame className="h-4 w-4" />Servico
            </div>
            <InfoRow label="Cremacao" value={ficha.cremacao} />
            {ficha.valor != null && <InfoRow label="Valor" value={`R$ ${ficha.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} mono bold />}
            <InfoRow label="Pagamento" value={`${ficha.pagamento}${ficha.parcelas ? ` (${ficha.parcelas})` : ''}`} />
            <InfoRow label="Velorio" value={ficha.velorio} />
            <InfoRow label="Acompanhamento" value={ficha.acompanhamento} />
            <InfoRow label="Local" value={ficha.localizacao} />
            {ficha.localizacao_outra && <InfoRow label="Local (outro)" value={ficha.localizacao_outra} />}
          </div>

          {/* Extras */}
          {(ficha.como_conheceu || ficha.veterinario_especificar || ficha.observacoes) && (
            <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)] space-y-1.5">
              {ficha.como_conheceu && ficha.como_conheceu.length > 0 && (
                <InfoRow label="Como conheceu" value={ficha.como_conheceu.join(', ')} />
              )}
              {ficha.veterinario_especificar && (
                <InfoRow label="Vet/Clinica" value={ficha.veterinario_especificar} />
              )}
              {ficha.observacoes && (
                <div>
                  <span className="text-xs text-[var(--surface-400)]">Observacoes</span>
                  <p className="text-sm text-[var(--surface-700)] whitespace-pre-wrap">{ficha.observacoes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ======== RIGHT COLUMN — Operator fields ======== */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-[var(--surface-500)] uppercase tracking-wide">Dados do Operador</h3>

          {/* Tipo Plano */}
          <div>
            <label className="block text-sm font-medium text-[var(--surface-600)] mb-2">
              Tipo de Plano <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTipoPlano('emergencial')}
                className={`flex-1 py-2.5 px-4 rounded-lg border-2 text-sm font-semibold transition-all ${
                  tipoPlano === 'emergencial'
                    ? 'border-red-500 bg-red-900/30 text-red-400'
                    : 'border-[var(--surface-200)] text-[var(--surface-500)] hover:border-[var(--surface-300)]'
                }`}
              >
                EM - Emergencial
              </button>
              <button
                type="button"
                onClick={() => setTipoPlano('preventivo')}
                className={`flex-1 py-2.5 px-4 rounded-lg border-2 text-sm font-semibold transition-all ${
                  tipoPlano === 'preventivo'
                    ? 'border-amber-500 bg-amber-900/30 text-amber-400'
                    : 'border-[var(--surface-200)] text-[var(--surface-500)] hover:border-[var(--surface-300)]'
                }`}
              >
                PV - Preventivo
              </button>
            </div>
          </div>

          {/* === Origem da Indicacao === */}
          {ficha.veterinario_especificar && (
            <div className="px-3 py-2 rounded-lg bg-purple-900/20 border border-purple-700 text-sm">
              <span className="text-purple-400 font-medium">Tutor informou:</span>{' '}
              <span className="text-purple-300">&quot;{ficha.veterinario_especificar}&quot;</span>
            </div>
          )}

          {/* Estabelecimento (clinica) */}
          <div ref={estabRef} className="relative">
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-[var(--surface-600)]">
                <Building2 className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                Estabelecimento (clinica)
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autonomo}
                  onChange={(e) => {
                    setAutonomo(e.target.checked)
                    if (e.target.checked) {
                      setEstabId(null)
                      setEstabNome('')
                      setEstabBusca('')
                    }
                  }}
                  className="h-3.5 w-3.5 rounded accent-blue-500"
                />
                <span className="text-xs text-blue-400">Autonomo</span>
              </label>
            </div>
            {autonomo ? (
              <div className="px-3 py-2.5 rounded-lg border-2 border-dashed border-blue-500/30 bg-blue-900/10 text-sm text-blue-400">
                Profissional autonomo (sem vinculo com estabelecimento)
              </div>
            ) : (
            <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--surface-400)]" />
              <input
                type="text"
                value={estabBusca}
                onChange={(e) => {
                  setEstabBusca(e.target.value)
                  setEstabNome(e.target.value)
                  setEstabId(null)
                  setEstabAberto(true)
                }}
                onFocus={() => setEstabAberto(true)}
                placeholder="Buscar clinica..."
                className="input pl-9 pr-3"
              />
            </div>

            {estabAberto && (estabsFiltrados.length > 0 || estabBusca.trim()) && (
              <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-[var(--surface-0)] border border-[var(--surface-200)] rounded-lg shadow-lg">
                {estabsFiltrados.map(e => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      setEstabId(e.id)
                      setEstabNome(e.nome)
                      setEstabBusca(e.nome)
                      setEstabAberto(false)
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-50)] transition-colors flex items-center justify-between ${
                      estabId === e.id ? 'bg-[var(--surface-50)] font-medium text-[var(--surface-800)]' : 'text-[var(--surface-600)]'
                    }`}
                  >
                    <span>{e.nome}</span>
                    {e.tipo && <span className="text-xs text-[var(--surface-400)]">{e.tipo}</span>}
                  </button>
                ))}
                {estabBusca.trim() && !estabsFiltrados.some(e => e.nome.toLowerCase() === estabBusca.toLowerCase()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setEstabId(null)
                      setEstabNome(estabBusca.trim())
                      setEstabAberto(false)
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-amber-500 hover:bg-amber-900/10 flex items-center gap-2 border-t border-[var(--surface-100)]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Criar &quot;{estabBusca.trim()}&quot;
                  </button>
                )}
              </div>
            )}
            {estabId && <p className="mt-1 text-xs text-green-500 flex items-center gap-1"><Check className="h-3 w-3" />Estabelecimento selecionado</p>}
            {!estabId && estabNome.trim() && !estabAberto && <p className="mt-1 text-xs text-amber-500">Novo estabelecimento sera criado</p>}
            </>
            )}
          </div>

          {/* Contato (pessoa que indicou) */}
          <div ref={indicRef} className="relative">
            <label className="block text-sm font-medium text-[var(--surface-600)] mb-1">
              <UserCheck className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
              Contato (quem indicou)
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--surface-400)]" />
              <input
                type="text"
                value={indicBusca}
                onChange={(e) => {
                  setIndicBusca(e.target.value)
                  setIndicNome(e.target.value)
                  setIndicId(null)
                  setIndicAberto(true)
                }}
                onFocus={() => setIndicAberto(true)}
                placeholder={estabId ? 'Buscar contato da clinica...' : 'Nome do indicador (vet, recepcionista)...'}
                className="input pl-9 pr-3"
              />
            </div>

            {indicAberto && (contatosFiltrados.length > 0 || indicBusca.trim()) && (
              <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-[var(--surface-0)] border border-[var(--surface-200)] rounded-lg shadow-lg">
                {contatosFiltrados.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setIndicId(c.id)
                      setIndicNome(c.nome)
                      setIndicBusca(c.nome)
                      setIndicCargo(c.cargo || '')
                      setIndicAberto(false)
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-50)] transition-colors flex items-center justify-between ${
                      indicId === c.id ? 'bg-[var(--surface-50)] font-medium text-[var(--surface-800)]' : 'text-[var(--surface-600)]'
                    }`}
                  >
                    <span>{c.nome}</span>
                    {c.cargo && <span className="text-xs text-[var(--surface-400)]">{c.cargo}</span>}
                  </button>
                ))}
                {indicBusca.trim() && !contatosFiltrados.some(c => c.nome.toLowerCase() === indicBusca.toLowerCase()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setIndicId(null)
                      setIndicNome(indicBusca.trim())
                      setIndicAberto(false)
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-amber-500 hover:bg-amber-900/10 flex items-center gap-2 border-t border-[var(--surface-100)]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Criar contato &quot;{indicBusca.trim()}&quot;
                    {estabId && <span className="text-xs text-[var(--surface-400)]">vinculado a clinica</span>}
                  </button>
                )}
              </div>
            )}
            {indicId && <p className="mt-1 text-xs text-green-500 flex items-center gap-1"><Check className="h-3 w-3" />Contato selecionado</p>}
            {!indicId && indicNome.trim() && !indicAberto && (
              <p className="mt-1 text-xs text-amber-500">
                Novo contato sera criado{estabId ? ' e vinculado a clinica' : ' (autonomo)'}
              </p>
            )}

            {/* Cargo field when creating new contact */}
            {!indicId && indicNome.trim() && !indicAberto && (
              <input
                type="text"
                value={indicCargo}
                onChange={(e) => setIndicCargo(e.target.value)}
                placeholder="Cargo (ex: Veterinaria, Recepcionista)..."
                className="input mt-2 text-sm"
              />
            )}
          </div>

          {/* Responsavel */}
          <div>
            <label className="block text-sm font-medium text-[var(--surface-600)] mb-1">Responsavel</label>
            <select
              value={funcionarioId}
              onChange={(e) => setFuncionarioId(e.target.value)}
              className="input"
            >
              <option value="">Nao definido</option>
              {funcionarios.map(f => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>

          {/* Codigo */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-[var(--surface-600)]">
                Codigo <span className="text-red-400">*</span>
              </label>
              <button
                type="button"
                onClick={() => setCodigoManual(!codigoManual)}
                className="text-xs text-[var(--surface-400)] hover:text-[var(--surface-600)] flex items-center gap-1"
              >
                <Pencil className="h-3 w-3" />
                {codigoManual ? 'Auto-gerar' : 'Editar'}
              </button>
            </div>
            <input
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              readOnly={!codigoManual}
              className={`input text-mono ${!codigoManual ? 'bg-[var(--surface-50)]' : ''}`}
            />
          </div>

          {/* Valor */}
          <div>
            <label className="block text-sm font-medium text-[var(--surface-600)] mb-1">
              Valor do Plano (R$)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={valorPlano}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.,]/g, '').replace(',', '.')
                setValorPlano(v)
              }}
              placeholder="0.00"
              className="input text-mono"
            />
          </div>

          {/* Lacre */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-[var(--surface-600)]">
                Numero do Lacre <span className="text-red-400">*</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={semLacre}
                  onChange={(e) => {
                    setSemLacre(e.target.checked)
                    if (e.target.checked) setLacre('')
                  }}
                  className="h-3.5 w-3.5 rounded accent-amber-500"
                />
                <span className="text-xs text-amber-500">Sem lacre provisoriamente</span>
              </label>
            </div>
            <input
              type="text"
              value={lacre}
              onChange={(e) => setLacre(e.target.value)}
              disabled={semLacre}
              placeholder={semLacre ? 'Sera preenchido depois...' : 'Numero do lacre'}
              className={`input ${semLacre ? 'opacity-50 bg-[var(--surface-50)]' : ''}`}
            />
            {semLacre && (
              <p className="mt-1 text-xs text-amber-500">Lacre pendente — preencher depois no contrato</p>
            )}
          </div>

          {/* Data */}
          <div>
            <label className="block text-sm font-medium text-[var(--surface-600)] mb-1">
              Data do contrato <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={dataContrato}
              onChange={(e) => setDataContrato(e.target.value)}
              className="input"
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ============================================
// Helper
// ============================================
function InfoRow({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-[var(--surface-400)] min-w-[70px] flex-shrink-0">{label}</span>
      <span className={`text-sm text-[var(--surface-700)] ${mono ? 'text-mono' : ''} ${bold ? 'font-semibold' : ''}`}>
        {value || '-'}
      </span>
    </div>
  )
}
