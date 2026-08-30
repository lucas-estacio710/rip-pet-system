// Cria um contrato a partir de uma ficha processada — mesma lógica de `criarContrato()`
// (TratativaModal.tsx, botão "Iniciar Fluxo"), extraída pra rodar fora do modal.
//
// Usada em 2 lugares: o próprio TratativaModal (monta op_dados a partir do estado do
// formulário em memória) e o gatilho automático da tela /tarefas (lê ficha.op_dados já
// persistido no banco, quando um Operacional confirma que fez a remoção). Os dois caminhos
// passam por AQUI — nenhuma duplicação da lógica de negócio.
//
// ⚠️ Lacre é obrigatório de verdade nos dois caminhos (sem o escape "sem lacre
// provisoriamente" que existia antes) — decisão de produto pra parar de ter pet sem lacre
// no pipeline.

import type { SupabaseClient } from '@supabase/supabase-js'

export class ContratoValidationError extends Error {}

export type FichaParaContrato = {
  id: string
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
  como_conheceu: string[] | null
  outro_especificar: string | null
  observacoes: string | null
  unidade_id: string
  contrato_id: string | null
  processada?: boolean | null
  op_dados: Record<string, unknown> | null
}

export type UnidadeParaContrato = {
  codigo: string
  endereco: string | null
  cidade: string | null
  modulos_ativos: string[]
}

export async function criarContratoDeFicha(
  supabase: SupabaseClient,
  ficha: FichaParaContrato,
  unidade: UnidadeParaContrato,
  criadoPorNome: string,
  // true só quando quem preenche o responsável é um usuário Operacional de verdade (perfil
  // ativo, funcionário promovido) — só nesse caso o lacre vira obrigatório sem escape.
  // Funcionário comum (não promovido) mantém o comportamento de sempre ("sem lacre
  // provisoriamente"). Decisão de produto: essa exigência é parte do módulo pago de
  // Operacional/motorista, não vale de graça pra quem não tem o módulo.
  responsavelEhOperacional = false
): Promise<{ contratoId: string }> {
  if (ficha.contrato_id) {
    throw new ContratoValidationError('Esta ficha já virou contrato')
  }

  const op = (ficha.op_dados || {}) as Record<string, unknown>
  const str = (k: string) => (op[k] != null ? String(op[k]) : '')
  const bool = (k: string) => !!op[k]

  const tipoPlano = (str('tipoPlano') || 'emergencial') as 'emergencial' | 'preventivo'
  const isPreventivo = tipoPlano === 'preventivo'
  const funcionarioId = str('funcionarioId') || null
  // Unidade com cb_operacional: Responsável vem direto de perfis (auth.users), sem passar por
  // funcionarios — ver contratos.responsavel_user_id (mig 123). Nunca os dois preenchidos juntos.
  const responsavelUserId = str('responsavelUserId') || null
  const localColeta = str('localColeta') as 'residencia' | 'clinica' | 'unidade' | 'outro' | ''
  const enderecoOutro = str('enderecoOutro')
  const estabId = str('estabId') || null
  const estabNome = str('estabNome')
  const autonomo = bool('autonomo')
  const clinicaTextoLivre = str('clinicaTextoLivre')
  const dataHoraAcolhimento = str('dataHoraAcolhimento')
  const lacre = str('lacre')
  const semLacre = bool('semLacre')
  const valorPlano = str('valorPlano')
  const descontoPreVenda = str('descontoPreVenda')
  const descontoTipo = (str('descontoTipo') || 'valor') as 'valor' | 'percentual'
  const detalhamentoPlano = str('detalhamentoPlano')
  const temSeguradora = bool('temSeguradora')
  const seguradoraNome = str('seguradoraNome')
  const dataContrato = str('dataContrato')
  const codigo = str('codigo')
  const telefoneConfirmado = bool('telefoneConfirmado')
  const telefone1Nome = str('telefone1Nome')
  const telefone2 = str('telefone2') // já vem DDI+dígitos completo (montado no momento do save)
  const telefone2Nome = str('telefone2Nome')
  const usarTelefone2ComoPrincipal = bool('usarTelefone2ComoPrincipal')

  const temPadronizacaoClinicas = unidade.modulos_ativos.includes('cb_padronizacao_clinicas')

  // Validação — espelha `fluxoValido` do TratativaModal. Lacre só é obrigatório sem escape
  // quando o responsável é um Operacional de verdade (ver parâmetro `responsavelEhOperacional`).
  const telefoneOk = telefoneConfirmado || (usarTelefone2ComoPrincipal && !!telefone2 && !!telefone2Nome)
  const fonteOk = !!(ficha.como_conheceu && ficha.como_conheceu.length > 0)
  const lacreOk = responsavelEhOperacional ? !!lacre.trim() : (semLacre || !!lacre.trim())
  const faltam: string[] = []
  if (!telefoneOk) faltam.push('Telefone')
  if (!isPreventivo) {
    if (!localColeta) faltam.push('Local de Acolhimento')
    if (!funcionarioId && !responsavelUserId) faltam.push('Responsável')
    if (!dataHoraAcolhimento) faltam.push('Data/Hora')
    if (!lacreOk) faltam.push('Lacre')
  }
  if (!valorPlano.trim()) faltam.push('Valor do Plano')
  if (!fonteOk) faltam.push('Como nos conheceu')
  if (faltam.length > 0) {
    throw new ContratoValidationError(`Preencha antes: ${faltam.join(', ')}`)
  }

  // Step 1: Find or create tutor
  const hasTel2 = !!telefone2
  const tel1NomeVal = telefone1Nome.trim() || null
  const tel2NomeVal = telefone2Nome.trim() || null
  const telPrincipal = hasTel2 && usarTelefone2ComoPrincipal ? telefone2 : ficha.telefone
  const telSecundario = hasTel2 ? (usarTelefone2ComoPrincipal ? ficha.telefone : telefone2) : null
  const telPrincipalNome = hasTel2 && usarTelefone2ComoPrincipal ? tel2NomeVal : tel1NomeVal
  const telSecundarioNome = hasTel2 ? (usarTelefone2ComoPrincipal ? tel1NomeVal : tel2NomeVal) : null

  const cpfLimpo = ficha.cpf.replace(/\D/g, '')
  let tutorId: string | null = null
  if ((cpfLimpo.length === 11 || cpfLimpo.length === 14) && /^\d+$/.test(cpfLimpo)) {
    const formatado = cpfLimpo.length === 11
      ? `${cpfLimpo.slice(0, 3)}.${cpfLimpo.slice(3, 6)}.${cpfLimpo.slice(6, 9)}-${cpfLimpo.slice(9)}`
      : `${cpfLimpo.slice(0, 2)}.${cpfLimpo.slice(2, 5)}.${cpfLimpo.slice(5, 8)}/${cpfLimpo.slice(8, 12)}-${cpfLimpo.slice(12)}`
    const { data: tutorExistente } = await supabase
      .from('tutores').select('id').or(`cpf.eq.${formatado},cpf.eq.${cpfLimpo}`).limit(1)
      .maybeSingle() as { data: { id: string } | null }
    tutorId = tutorExistente?.id || null
  }
  if (!tutorId) {
    const { data: novoTutor, error: errTutor } = await supabase
      .from('tutores')
      .insert({
        nome: ficha.nome_completo?.toUpperCase() || '',
        cpf: ficha.cpf,
        telefone: telPrincipal,
        telefone2: telSecundario,
        telefone_nome: telPrincipalNome,
        telefone2_nome: telSecundarioNome,
        telefone_principal: 1,
        email: ficha.email || null,
        cep: ficha.cep, endereco: ficha.endereco, numero: ficha.numero, complemento: ficha.complemento || null,
        bairro: ficha.bairro, cidade: ficha.cidade, estado: ficha.estado, unidade_id: ficha.unidade_id,
      } as never).select('id').single() as { data: { id: string } | null; error: { message: string } | null }
    if (errTutor) throw new Error(`Erro ao criar tutor: ${errTutor.message}`)
    tutorId = novoTutor!.id
  }

  // Step 2: Fontes de conhecimento (múltiplas)
  let fonteConhecimentoId: string | null = null
  const fonteConhecimentoIds: string[] = []
  if (ficha.como_conheceu && ficha.como_conheceu.length > 0) {
    const fonteMap: Record<string, string> = {
      'Google': 'Google', 'Instagram/Facebook': 'Instagram/Facebook',
      'Veterinário': 'Indicação em Clínica', 'Parente/Amigo': 'Parente/Amigo',
      'Já utilizei a R.I.P. Pet': 'Cliente',
      'Passei pela Unidade': 'Ponto',
      'Outro': 'Outro',
    }
    for (const conheceu of ficha.como_conheceu) {
      const nomeExato = fonteMap[conheceu] || conheceu
      const { data: fonte } = await supabase.from('fontes_conhecimento').select('id').eq('nome', nomeExato).maybeSingle() as { data: { id: string } | null }
      if (fonte) {
        fonteConhecimentoIds.push(fonte.id)
        if (!fonteConhecimentoId) fonteConhecimentoId = fonte.id
      }
    }
  }

  // Step 3: Resolve estabelecimento (local de coleta)
  let resolvedEstabId: string | null = estabId
  const resolvedContatoId: string | null = null // normalizado depois via farol 🩺 no Pipeline/Contrato
  let clinicaColetaNome: string | null = null

  if (temPadronizacaoClinicas) {
    const AUTONOMOS_ESTAB_ID = 'b4eedcff-7ccf-4cfb-bf3a-1978eeec6382'
    if (autonomo) { resolvedEstabId = AUTONOMOS_ESTAB_ID; clinicaColetaNome = 'Autônomo' }
    else {
      clinicaColetaNome = estabNome.trim() || null
      if (!resolvedEstabId && estabNome.trim()) {
        const { data: novoEstab } = await supabase.from('estabelecimentos').insert({ nome: estabNome.trim(), tipo: 'clinica', unidade_id: ficha.unidade_id, endereco: '' } as never).select('id').single() as { data: { id: string } | null }
        if (novoEstab) resolvedEstabId = novoEstab.id
      }
    }
  } else {
    clinicaColetaNome = clinicaTextoLivre.trim() || null
  }

  // Step 4: Map local_coleta
  const localColetaMap: Record<string, string> = { residencia: 'Residência', clinica: 'Clínica', unidade: 'Unidade', outro: 'Outro' }
  const localColetaValor = localColetaMap[localColeta] || null

  let estabEndereco: { endereco: string; bairro: string; cidade: string; cep: string } | null = null
  if (localColeta === 'clinica' && resolvedEstabId) {
    const { data: estabData } = await supabase
      .from('estabelecimentos')
      .select('endereco, bairro, cidade, cep')
      .eq('id', resolvedEstabId)
      .single() as { data: { endereco: string; bairro: string; cidade: string; cep: string } | null }
    estabEndereco = estabData
  }

  // Step 5: Insert contrato
  const contratoData = {
    codigo: codigo.trim(),
    unidade_id: ficha.unidade_id,
    status: tipoPlano === 'emergencial'
      ? (unidade.modulos_ativos.includes('cb_cremacao_local') ? 'pinda' : 'ativo')
      : 'preventivo',
    tipo_plano: tipoPlano,
    tipo_cremacao: ficha.cremacao.toLowerCase() as 'individual' | 'coletiva',
    pet_nome: ficha.nome_pet?.toUpperCase() || '', pet_especie: ficha.especie.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
    pet_raca: ficha.raca || null, pet_genero: ficha.genero ? ficha.genero.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() : null,
    pet_cor: ficha.cor || null, pet_peso: ficha.peso ? parseFloat(ficha.peso) || null : null,
    pet_idade_anos: ficha.idade ? parseInt(ficha.idade) || null : null,
    tutor_id: tutorId,
    tutor_nome: ficha.nome_completo?.toUpperCase() || '', tutor_cpf: ficha.cpf,
    tutor_telefone: telPrincipal,
    tutor_telefone2: telSecundario,
    tutor_telefone_nome: telPrincipalNome,
    tutor_telefone2_nome: telSecundarioNome,
    tutor_telefone_principal: 1,
    tutor_email: ficha.email || null, tutor_cidade: ficha.cidade || null, tutor_bairro: ficha.bairro || null,
    tutor_endereco: ficha.endereco ? `${ficha.endereco}, ${ficha.numero}${ficha.complemento ? ` - ${ficha.complemento}` : ''}` : null,
    tutor_cep: ficha.cep || null,
    clinica_coleta: clinicaColetaNome,
    contato_id: resolvedContatoId || null, estabelecimento_id: resolvedEstabId || null,
    funcionario_id: funcionarioId || null,
    responsavel_user_id: responsavelUserId || null,
    fonte_conhecimento_id: fonteConhecimentoId,
    fonte_conhecimento_ids: fonteConhecimentoIds.length > 0 ? fonteConhecimentoIds : null,
    fonte_outro_especificar: ficha.como_conheceu?.includes('Outro') ? (ficha.outro_especificar?.trim() || null) : null,
    data_contrato: dataContrato,
    data_acolhimento: dataHoraAcolhimento ? new Date(dataHoraAcolhimento).toISOString() : null,
    valor_plano: valorPlano ? parseFloat(valorPlano) : null,
    desconto_plano_unificado: (() => {
      const d = parseFloat(descontoPreVenda) || 0
      if (!d) return 0
      if (descontoTipo === 'percentual') return ((parseFloat(valorPlano) || 0) * d) / 100
      return d
    })(),
    local_coleta: localColetaValor,
    remocao_endereco:
      localColeta === 'residencia' ? (ficha.endereco ? `${ficha.endereco}, ${ficha.numero}` : null)
      : localColeta === 'clinica' ? (estabEndereco?.endereco || clinicaColetaNome || null)
      : localColeta === 'outro' ? (enderecoOutro || null)
      : localColeta === 'unidade' ? (unidade.endereco || null)
      : null,
    remocao_bairro:
      localColeta === 'residencia' ? ficha.bairro
      : localColeta === 'clinica' ? (estabEndereco?.bairro || null)
      : null,
    remocao_cidade:
      localColeta === 'residencia' ? ficha.cidade
      : localColeta === 'clinica' ? (estabEndereco?.cidade || null)
      : localColeta === 'unidade' ? (unidade.cidade || null)
      : null,
    remocao_cep:
      localColeta === 'residencia' ? ficha.cep
      : localColeta === 'clinica' ? (estabEndereco?.cep || null)
      : null,
    numero_lacre: lacre.trim() || null,
    seguradora: temSeguradora && seguradoraNome.trim() ? seguradoraNome.trim() : null,
    observacoes: ficha.observacoes || null,
    descricao_contrato: detalhamentoPlano.trim() || null,
    certificado_nome_1: ficha.nome_completo || null,
    ...(ficha.outros_tutores ? Object.fromEntries(
      ficha.outros_tutores.filter(Boolean).slice(0, 6).map((nome, i) => [`certificado_nome_${i + 2}`, nome])
    ) : {}),
  }

  const { data: contrato, error: errContrato } = await supabase
    .from('contratos').insert(contratoData as never).select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }
  if (errContrato) throw new Error(`Erro ao criar contrato: ${errContrato.message}`)

  const opPrev = (ficha.op_dados || {}) as Record<string, unknown>
  const opReconciliado = {
    ...opPrev,
    semLocal: localColeta ? false : opPrev.semLocal,
    localColeta: localColeta || opPrev.localColeta,
    semResponsavel: (funcionarioId || responsavelUserId) ? false : opPrev.semResponsavel,
    funcionarioId: funcionarioId || opPrev.funcionarioId,
    responsavelUserId: responsavelUserId || opPrev.responsavelUserId,
    semDataHora: dataHoraAcolhimento ? false : opPrev.semDataHora,
    dataHoraAcolhimento: dataHoraAcolhimento || opPrev.dataHoraAcolhimento,
    semLacre: lacre.trim() ? false : semLacre,
    lacre: lacre.trim() || opPrev.lacre,
  }
  const { error: errLink } = await supabase.from('fichas').update({
    contrato_id: contrato!.id,
    processada: true,
    processada_em: ficha.processada ? undefined : new Date().toISOString(),
    op_dados: opReconciliado,
  } as never).eq('id', ficha.id)
  if (errLink) throw new Error(`Erro ao vincular ficha ao contrato: ${errLink.message}`)

  // Migrar observações da ficha pra tarefas (se houver)
  if (ficha.observacoes) {
    const { data: tipoFicha } = await supabase.from('tarefa_tipos').select('id').eq('nome', 'Observação da Ficha').maybeSingle() as { data: { id: string } | null }
    if (tipoFicha) {
      await supabase.from('tarefas').insert({
        contrato_id: contrato!.id,
        descricao: ficha.observacoes,
        tipo_id: tipoFicha.id,
        unidade_id: ficha.unidade_id,
        criado_por: 'Tutor (ficha)',
        criado_por_email: ficha.email || null,
      } as never)
    }
  }

  if (detalhamentoPlano.trim()) {
    const { data: tipoUnidade } = await supabase.from('tarefa_tipos').select('id').eq('nome', 'Observação da Unidade').maybeSingle() as { data: { id: string } | null }
    if (tipoUnidade) {
      await supabase.from('tarefas').insert({
        contrato_id: contrato!.id,
        descricao: `Plano: ${detalhamentoPlano.trim()}`,
        tipo_id: tipoUnidade.id,
        unidade_id: ficha.unidade_id,
        criado_por: criadoPorNome,
      } as never)
    }
  }

  return { contratoId: contrato!.id }
}
