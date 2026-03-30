import jsPDF from 'jspdf'

// Dados da unidade pra cabeçalho/rodapé do contrato
export type DadosUnidade = {
  razaoSocial: string
  nomeFantasia: string
  cnpj: string
  endereco: string
  cidade: string
  estado: string
  cep: string
  regiao: string // ex: "BAIXADA SANTISTA"
  sigla: string  // ex: "ST" pra Santos
}

// Dados do contrato pra preencher
export type DadosContrato = {
  codigo: string
  lacre: string | null
  tutorNome: string
  tutorTelefone: string
  tutorCpf: string
  tutorEmail: string | null
  tutorEndereco: string | null
  tutorEstado: string | null
  tutorCidade: string | null
  tutorBairro: string | null
  tutorCep: string | null
  petNome: string
  petEspecie: string | null
  petRaca: string | null
  petIdade: number | null
  petCor: string | null
  petGenero: string | null
  petPeso: number | null
  localColeta: string | null
  tipoCremacao: 'individual' | 'coletiva'
  valorPlano: number | null
  metodoPagamento: string | null
  parcelas: number | null
  velorioDeseja: boolean | null
  acompanhamentoOnline: boolean
  acompanhamentoPresencial: boolean
}

// Unidades cadastradas
const UNIDADES: Record<string, DadosUnidade> = {
  'Santos - SP': {
    razaoSocial: 'FLORES DO PARQUE SERVICOS FUNERARIOS LTDA.',
    nomeFantasia: 'R.I.P. PET BAIXADA SANTISTA',
    cnpj: '51.025.958/0001-78',
    endereco: 'Avenida Coronel Joaquim Montenegro, nº 334',
    cidade: 'Santos',
    estado: 'SP',
    cep: '11035-002',
    regiao: 'BAIXADA SANTISTA',
    sigla: 'ST',
  },
}

const FALLBACK_UNIDADE = UNIDADES['Santos - SP']

export function getUnidade(nome: string): DadosUnidade {
  return UNIDADES[nome] || FALLBACK_UNIDADE
}

function formatCurrency(value: number | null): string {
  if (!value) return ''
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function capitalize(str: string | null): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

// Carrega imagem como base64 data URL
async function loadImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function gerarContratoPDF(
  dados: DadosContrato,
  nomeUnidade: string
): Promise<Blob> {
  const unidade = getUnidade(nomeUnidade)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = 210
  const pageH = 297
  const marginL = 18
  const marginR = 18
  const contentW = pageW - marginL - marginR

  // Carregar imagem de fundo
  let bgImage: string | null = null
  try {
    bgImage = await loadImageAsBase64('/contrato-bg.png')
  } catch {
    // continua sem background
  }

  function addBackground() {
    if (bgImage) {
      doc.addImage(bgImage, 'PNG', 0, 0, pageW, pageH)
    }
  }

  function newPage() {
    doc.addPage()
    addBackground()
  }

  // Página 1
  addBackground()

  let y = 30

  // Título
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(30, 58, 95)
  const titulo = 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS FUNERÁRIOS E DE CREMAÇÃO DE ANIMAIS EMERGENCIAL'
  const tituloLines = doc.splitTextToSize(titulo, contentW)
  doc.text(tituloLines, pageW / 2, y, { align: 'center' })
  y += tituloLines.length * 5 + 6

  // Código e Lacre
  doc.setFontSize(9)
  doc.setTextColor(50, 50, 50)
  doc.setFont('helvetica', 'bold')
  doc.text(`CÓDIGO INTERNO: ${dados.codigo}`, marginL, y)
  doc.text(`LACRE: ${dados.lacre || '___________'}`, pageW / 2, y)
  y += 8

  // Cláusula 1.1 — CONTRATADA
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('1.1 -', marginL, y)
  doc.setFont('helvetica', 'normal')
  const clausula11 = `Na qualidade de CONTRATADA, a empresa ${unidade.razaoSocial}, nome fantasia ${unidade.nomeFantasia}, inscrita no CNPJ ${unidade.cnpj}, com sede à ${unidade.endereco} – ${unidade.cidade} – ${unidade.estado} - CEP ${unidade.cep}:`
  const lines11 = doc.splitTextToSize(clausula11, contentW - 10)
  doc.text(lines11, marginL + 10, y)
  y += lines11.length * 4 + 5

  // Cláusula 1.2 — CONTRATANTE
  doc.setFont('helvetica', 'bold')
  doc.text('1.2 -', marginL, y)
  doc.setFont('helvetica', 'normal')
  doc.text('Na qualidade de CONTRATANTE, cuja qualificação está descrita abaixo:', marginL + 10, y)
  y += 7

  // Dados do contratante
  const campos = [
    ['Nome', dados.tutorNome],
    ['Tel', dados.tutorTelefone],
    ['CPF', dados.tutorCpf],
    ['E-mail', dados.tutorEmail || ''],
    ['Endereço', dados.tutorEndereco || ''],
    ['Estado', dados.tutorEstado || ''],
    ['Cidade', dados.tutorCidade || ''],
    ['Bairro', dados.tutorBairro || ''],
    ['CEP', dados.tutorCep || ''],
  ]

  doc.setFontSize(9)
  for (const [label, valor] of campos) {
    doc.setFont('helvetica', 'bold')
    doc.text(`${label}:`, marginL + 6, y)
    doc.setFont('helvetica', 'normal')
    doc.text(valor || '', marginL + 30, y)
    y += 4.5
  }
  y += 3

  // Dados do pet
  const camposPet = [
    ['Nome do Pet', dados.petNome],
    ['Espécie', capitalize(dados.petEspecie)],
    ['Raça', dados.petRaca || ''],
    ['Anos Completos', dados.petIdade ? `${dados.petIdade}` : ''],
    ['Cor', dados.petCor || ''],
    ['Gênero', capitalize(dados.petGenero)],
    ['Peso Aprox.', dados.petPeso ? `${dados.petPeso} kg` : ''],
    ['Localização', dados.localColeta || ''],
  ]

  for (const [label, valor] of camposPet) {
    doc.setFont('helvetica', 'bold')
    doc.text(`${label}:`, marginL + 6, y)
    doc.setFont('helvetica', 'normal')
    doc.text(valor || '', marginL + 35, y)
    y += 4.5
  }
  y += 6

  // Cláusula 2.1
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  const c21 = '2.1 - A CONTRATADA, através de recursos próprios e de empresas designadas por ela conveniadas, se compromete a organizar e prestar serviços de assistência funeral e de cremação de animais domésticos ao CONTRATANTE em momento por este último indicado, nas condições deste contrato e conforme características do plano de cremação selecionado.'
  doc.setFont('helvetica', 'normal')
  const lines21 = doc.splitTextToSize(c21, contentW)
  doc.text(lines21, marginL, y)
  y += lines21.length * 4 + 4

  // 2.2 — Planos
  doc.setFont('helvetica', 'bold')
  doc.text('2.2 – PLANOS DE CREMAÇÃO:', marginL, y)
  y += 6

  const isIndividual = dados.tipoCremacao === 'individual'
  const isColetiva = dados.tipoCremacao === 'coletiva'

  // Individual
  doc.setFont('helvetica', 'normal')
  doc.text(isIndividual ? '(X)' : '(  )', marginL + 2, y)
  doc.setFont('helvetica', 'bold')
  doc.text('Plano de Cremação Individual.', marginL + 12, y)
  doc.setFont('helvetica', 'normal')
  const descInd = 'O pet indicado é cremado individualmente no equipamento e as cinzas são entregues em uma urna escolhida previamente.'
  const linesInd = doc.splitTextToSize(descInd, contentW - 14)
  y += 4
  doc.text(linesInd, marginL + 12, y)
  y += linesInd.length * 4
  doc.text(`Valor: ${isIndividual && dados.valorPlano ? formatCurrency(dados.valorPlano) : 'R$ ________'}`, marginL + 12, y)
  y += 7

  // Coletiva
  doc.text(isColetiva ? '(X)' : '(  )', marginL + 2, y)
  doc.setFont('helvetica', 'bold')
  doc.text('Plano de Cremação Coletiva.', marginL + 12, y)
  doc.setFont('helvetica', 'normal')
  const descCol = 'O pet indicado é cremado em conjunto com outros dois pets de mesma modalidade coletiva e as cinzas são espalhadas no jardim do crematório.'
  const linesCol = doc.splitTextToSize(descCol, contentW - 14)
  y += 4
  doc.text(linesCol, marginL + 12, y)
  y += linesCol.length * 4
  doc.text(`Valor: ${isColetiva && dados.valorPlano ? formatCurrency(dados.valorPlano) : 'R$ ________'}`, marginL + 12, y)
  y += 7

  // Forma de pagamento
  const isPix = dados.metodoPagamento === 'pix' || dados.metodoPagamento === 'dinheiro'
  const isDebito = dados.metodoPagamento === 'debito' || (dados.metodoPagamento === 'credito' && (dados.parcelas || 1) <= 6)
  const isCredito = dados.metodoPagamento === 'credito' && (dados.parcelas || 1) > 6

  doc.text('Forma de pagamento:', marginL, y)
  y += 5
  doc.text(`${isPix ? '(X)' : '(  )'} à vista Pix/Espécie   |   ${isDebito ? '(X)' : '(  )'} Cartão Débito/Crédito 01x – 06x   |   ${isCredito ? '(X)' : '(  )'} Cartão Crédito 07x – 12x`, marginL + 2, y)
  y += 8

  // Verificar se precisa nova página
  if (y > 240) {
    newPage()
    y = 25
  }

  // Cláusulas 3.x
  const clausulas = [
    '3 - DA PRESTAÇÃO DO SERVIÇO - 3.1 - A CONTRATADA se propõe a executar a prestação de serviço funeral pet padrão ao animal indicado pelo CONTRATANTE, e de acordo com o plano de cremação escolhido, e terão direito ao serviço que é abaixo discriminado;',
    `3.2 - Cerimônia de despedida com ornamentação com flores da época e/ou manto. O velório deverá ser agendado com no mínimo 1 (um) dia de antecedência, na sede da CONTRATADA, em horário e dia comercial e terá a duração de no máximo 1 (uma) hora. Caso o CONTRATANTE necessite que o velório seja realizado após as 18 horas, ou que tenha um período maior, será cobrada uma taxa extra de R$ 100,00 (cem reais) por hora.`,
    `3.3 - Serviço de remoção pet domiciliar 24 horas e translado, via terrestre, ou em clínicas veterinárias na área de atuação da CONTRATADA (${unidade.regiao}). A coleta do pet será realizada em até 6 horas a partir da comunicação do falecimento – excetuando-se situações de impedimento como acidentes, trânsito devido à obras, paralisação de rodovias e balsas, e outras situações inoportunas. § único: os valores mencionados na cláusula 2.1 são para pets de até 45 quilogramas. Para pets que ultrapassem o peso de 45 quilogramas será acrescentada uma taxa de R$100,00 (cem reais) - já somada na descrição do valor de cremação deste contrato.`,
    '3.4 - Cremação dos animais domésticos a ser realizada na sede do Crematório R.I.P. Pet, localizado na Estrada Municipal Francisco Barros de Abreu, 800, bairro do Borba, no Município de Pindamonhangaba-SP. A cremação será realizada de acordo com uma agenda obedecendo a ordem cronológica da sede R.I.P. Pet em Pindamonhangaba, com a viabilidade de acompanhamento presencial ou on-line. O prazo para cremação é de até 10 (dez) dias corridos. Caso haja necessidade de a cremação ocorrer em 24 horas, podemos abrir uma exceção desde que os custos da viagem sejam da responsabilidade do Contratante, uma vez que foge da programação da empresa.',
    '3.5 - Certificado de Cremação assinado por Veterinário responsável pelo Crematório R.I.P. Pet, devidamente credenciado no CRMV.',
  ]

  doc.setFontSize(8)
  for (const clausula of clausulas) {
    const lines = doc.splitTextToSize(clausula, contentW)
    if (y + lines.length * 3.5 > pageH - 20) {
      newPage()
      y = 25
    }
    doc.text(lines, marginL, y)
    y += lines.length * 3.5 + 3
  }

  // Cláusulas 4.x
  const clausulas4 = [
    '4 - DAS RESPONSABILIDADES - 4.1 - A responsabilidade da CONTRATADA restringe-se apenas aos translados, velório e acompanhamento da cremação, cremação conforme o plano contratado e entrega das cinzas e/ou certificado de cremação.',
    '4.2 - Se o CONTRATANTE optar por um serviço diferente do que foi contratado, ou solicitar serviços não inclusos na relação acima, arcará a diferença do serviço prestado pela CONTRATADA. As despesas assumidas pela CONTRATANTE junto à terceiros, inclusive traslado pessoal próprio, serão de inteira e exclusiva responsabilidade do CONTRATANTE, nada podendo ser exigido da CONTRATADA a título de ressarcimento, restituição ou qualquer outra forma.',
    '4.3 – O contrato poderá ser rescindido em caso de desistência após a coleta, será cobrado o valor de 50% referente ao valor total contratado e a retirada do animal da unidade da CONTRATADA será de responsabilidade do CONTRATANTE em até 1 dia corrido após a rescisão.',
    '4.4 – Do CONTRATANTE: Efetuar os pagamentos no ato da contratação, seguindo forma de pagamento indicada no quadro 2.2.',
    '4.5 - O CONTRATANTE deve retirar as cinzas e/ou certificado na sede da empresa CONTRATADA no prazo de até 15 dias úteis após a comunicação da disponibilidade, ou caso prefira, será feita a entrega no endereço de cadastro ou outro local no mesmo município do cadastrado, em data pré agendada.',
    '4.6 - O CONTRATANTE declara conhecer os benefícios e limitações deste convênio oferecido pela CONTRATADA, sendo de livre vontade optar por este tipo de prestação de serviços, cuja finalidade é única e tão somente o serviço funerário e cremação de animais domésticos.',
    '4.7 – O CONTRATANTE, a partir do presente contrato autoriza a execução da cremação do animal doméstico, constante como beneficiário no contrato, assumindo inteira responsabilidade civil e criminal pelos atos que decorrerem desta autorização, compreendendo-se ainda, a ressarcir quaisquer prejuízos ou danos que venham a ocasionar as pessoas naturais ou jurídicas que sejam prejudicadas em seus legítimos direitos e responsabilidades nesta contratação.',
    '4.8 - A CONTRATADA não se obriga a autorizar a entrada do CONTRATANTE nas dependências da sala de cremação sem horário agendado, no entanto, caso o CONTRATANTE desejar acompanhar a cremação presencialmente, será devidamente autorizado no dia e hora previamente agendados. As despesas de deslocamento do CONTRATANTE até a sede do Crematório R.I.P. Pet no município de Pindamonhangaba, serão suportadas pelo CONTRATANTE.',
  ]

  for (const clausula of clausulas4) {
    const lines = doc.splitTextToSize(clausula, contentW)
    if (y + lines.length * 3.5 > pageH - 20) {
      newPage()
      y = 25
    }
    doc.text(lines, marginL, y)
    y += lines.length * 3.5 + 3
  }

  // Foro
  if (y > pageH - 55) {
    newPage()
    y = 25
  }

  y += 3
  const foro = `As partes elegem o Foro de ${unidade.cidade} (${unidade.estado}), para dirimir quaisquer controvérsias oriundas do presente instrumento particular, com exclusão de qualquer outro por mais privilegiado que seja.`
  const linesForo = doc.splitTextToSize(foro, contentW)
  doc.text(linesForo, marginL, y)
  y += linesForo.length * 3.5 + 8

  // Local de coleta / data
  doc.setFontSize(9)
  doc.text(`(  ) Clínica/Hospital/Terceiro(a) sem a presença do CONTRATANTE:`, marginL, y)
  y += 5
  doc.text(`${unidade.cidade}, ______ de ________________________ de _________.  Hora: ____:____`, marginL, y)
  y += 5
  doc.text('Nome:                                    Cargo:', marginL, y)
  y += 10

  // Assinaturas
  const assinaturaY = y + 5
  // CONTRATANTE
  doc.setFontSize(9)
  doc.line(marginL, assinaturaY, marginL + 70, assinaturaY)
  doc.text('CONTRATANTE', marginL + 18, assinaturaY + 5)

  // Colaborador
  doc.line(pageW - marginR - 70, assinaturaY, pageW - marginR, assinaturaY)
  doc.text('Colaborador(a) Resp. Acolhimento:', pageW - marginR - 70, assinaturaY + 5)
  doc.text('CPF:', pageW - marginR - 70, assinaturaY + 9)

  y = assinaturaY + 16

  // Rodapé CONTRATADA
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('CONTRATADA', pageW / 2, y, { align: 'center' })
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(unidade.razaoSocial, pageW / 2, y, { align: 'center' })
  y += 4
  doc.text(unidade.nomeFantasia, pageW / 2, y, { align: 'center' })
  y += 4
  doc.text(`CNPJ: ${unidade.cnpj}`, pageW / 2, y, { align: 'center' })

  return doc.output('blob')
}

export function contratoFilename(codigo: string, petNome: string): string {
  const nomeLimpo = petNome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
  return `Contrato_${codigo}_${nomeLimpo}.pdf`
}
