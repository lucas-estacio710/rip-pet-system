import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

export type DadosUnidade = {
  razaoSocial: string
  nomeFantasia: string
  cnpj: string
  endereco: string
  cidade: string
  estado: string
  cep: string
  regiao: string
  sigla: string
}

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
  /** @deprecated — preferir os campos abaixo (descontoPlanoUnificado/descontoAcessorios/descontoAcessoriosAjuste). Mantido por compat. */
  temDesconto?: boolean
  dataAcolhimento?: string | null
  /** Texto livre que substitui a descrição padrão de IND/COL no PDF (mantém o label). */
  descricaoContrato?: string | null
  /** Acessórios (calculado pelo trigger 074 — SUM dos contrato_produtos). */
  valorAcessorios?: number | null
  /** Desconto manual do plano (unificado, mig 078). */
  descontoPlanoUnificado?: number | null
  /** Desconto dos acessórios (calculado pelo trigger 074). */
  descontoAcessorios?: number | null
  /** Ajuste manual sobre o desconto de acessórios. */
  descontoAcessoriosAjuste?: number | null
  /** Chaveia o template: 'preventivo' gera o contrato PV (contrato-pv-pdf.ts, desenhado 100% via código). Ausente/emergencial = template overlay padrão. */
  tipoPlano?: 'emergencial' | 'preventivo' | null
  /** Data do contrato (YYYY-MM-DD) — usada na linha de data do contrato PV (o emergencial usa dataAcolhimento). */
  dataContrato?: string | null
  /** Só no contrato PV: imprime o bloco de campos de assinatura. Default false — aceite digital ("De Acordo" via WhatsApp). Persistido em op_dados.camposAssinatura. */
  assinaturaCampos?: boolean | null
}

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
  'Pindamonhangaba - SP': {
    razaoSocial: 'PRINA E BASSI CREMATÓRIO DE ANIMAIS LTDA',
    nomeFantasia: 'R.I.P. PET CREMATÓRIO DE ANIMAIS',
    cnpj: '19.919.278/0001-95',
    endereco: 'Estrada Municipal Francisco Barros de Abreu, 880 - Borba',
    cidade: 'Pindamonhangaba',
    estado: 'SP',
    cep: '12412-847',
    regiao: 'VALE DO PARAÍBA',
    sigla: 'PI',
  },
  'Campinas - SP': {
    razaoSocial: 'R.I.P. PET CAMPINAS',
    nomeFantasia: 'R.I.P. PET CAMPINAS',
    cnpj: '53.317.487/0001-05',
    endereco: 'Av. Dr. Heitor Penteado, 841 - Parque Taquaral',
    cidade: 'Campinas',
    estado: 'SP',
    cep: '13075-185',
    regiao: 'CAMPINAS',
    sigla: 'CP',
  },
  'São José dos Campos - SP': {
    razaoSocial: 'BASSI E PRINA CREMATORIO DE ANIMAIS LTDA',
    nomeFantasia: 'R.I.P. PET SJC',
    cnpj: '46.259.955/0001-69',
    endereco: 'Av. Dr. Adhemar de Barros, 1257 - Vila Jaci',
    cidade: 'São José dos Campos',
    estado: 'SP',
    cep: '12245-010',
    regiao: 'VALE DO PARAÍBA',
    sigla: 'SJ',
  },
  'São Paulo - SP': {
    razaoSocial: 'ANJOS DE PATAS SERVICOS FUNERARIOS PARA ANIMAIS LTDA',
    nomeFantasia: 'ANJOS DE PATAS SERVICOS FUNERARIOS PARA ANIMAIS',
    cnpj: '29.496.450/0001-07',
    endereco: 'Rua Rosa e Silva, 150 - Higienópolis',
    cidade: 'São Paulo',
    estado: 'SP',
    cep: '01230-020',
    regiao: 'SÃO PAULO',
    sigla: 'SP',
  },
  'Resende - RJ': {
    razaoSocial: 'R.I.P. PET RESENDE LTDA',
    nomeFantasia: 'R.I.P. PET RESENDE',
    cnpj: '18.042.191/0001-10',
    endereco: 'Rua Santa Terezinha, 168 - Paraíso',
    cidade: 'Resende',
    estado: 'RJ',
    cep: '27535-200',
    regiao: 'SUL FLUMINENSE',
    sigla: 'RS',
  },
  'Pouso Alegre - MG': {
    razaoSocial: 'RIP PET POUSO ALEGRE LTDA',
    nomeFantasia: 'R.I.P. PET POUSO ALEGRE',
    cnpj: '52.476.847/0001-40',
    endereco: 'Rua Paulino Pereira da Silva, nº 69 - Saúde',
    cidade: 'Pouso Alegre',
    estado: 'MG',
    cep: '35551-110',
    regiao: 'SUL DE MINAS',
    sigla: 'PA',
  },
}

const FALLBACK_UNIDADE = UNIDADES['Santos - SP']
export function getUnidade(nome: string): DadosUnidade { return UNIDADES[nome] || FALLBACK_UNIDADE }

function fmt$(v: number | null): string { return v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '' }
function cap(s: string | null): string {
  if (!s) return ''
  const map: Record<string, string> = {
    femea: 'Fêmea', macho: 'Macho', canina: 'Canina', felina: 'Felina', exotica: 'Exótica',
    individual: 'Individual', coletiva: 'Coletiva',
    pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Cartão Débito', credito: 'Cartão Crédito',
  }
  return map[s.toLowerCase()] || s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}
function fmtTel(t: string | null): string {
  if (!t) return ''
  const n = t.replace(/\D/g, '')
  // BR com DDI 55: sem parênteses, sem +55
  if (n.length === 13 && n.startsWith('55')) return `${n.slice(2,4)} ${n.slice(4,9)}-${n.slice(9)}`
  // Internacional: +DDI DDD XXXXX-XXXX
  if (n.length >= 12) return `+${n.slice(0, n.length - 11)} ${n.slice(-11,-9)} ${n.slice(-9,-4)}-${n.slice(-4)}`
  // 11 dígitos
  if (n.length === 11) return `${n.slice(0,2)} ${n.slice(2,7)}-${n.slice(7)}`
  // 10 dígitos
  if (n.length === 10) return `${n.slice(0,2)} ${n.slice(2,6)}-${n.slice(6)}`
  return t
}

export async function gerarContratoPDF(dados: DadosContrato, nomeUnidade: string): Promise<Blob> {
  // Contrato PREVENTIVO tem documento próprio (texto de cláusulas, sem template de fundo)
  if (dados.tipoPlano === 'preventivo') {
    const { gerarContratoPvPDF } = await import('./contrato-pv-pdf')
    return gerarContratoPvPDF(dados, nomeUnidade)
  }
  // Carregar template PDF
  // Template por unidade: PA e RS usam template específico
  const u = getUnidade(nomeUnidade)
  const templateFile = (u.sigla === 'PA' || u.sigla === 'RS') ? '/contrato-template-PA-RS.pdf' : '/contrato-template.pdf'
  const templateBytes = await fetch(templateFile).then(r => r.arrayBuffer())
  const pdfDoc = await PDFDocument.load(templateBytes)
  pdfDoc.registerFontkit(fontkit)
  const page = pdfDoc.getPages()[0]
  // DM Sans (alinha com o Design System) — Unicode completo, evita erros WinAnsi
  const [regularBytes, boldBytes] = await Promise.all([
    fetch('/fonts/DMSans-Regular.ttf').then(r => r.arrayBuffer()),
    fetch('/fonts/DMSans-Bold.ttf').then(r => r.arrayBuffer()),
  ])
  const font = await pdfDoc.embedFont(regularBytes, { subset: true })
  const fontBold = await pdfDoc.embedFont(boldBytes, { subset: true })
  const { width, height } = page.getSize()
  const CW = 210 // A4 width em mm

  // Helper: desenhar texto na posição (x, y em mm do topo)
  // PDF usa coordenadas de baixo pra cima, converter mm do topo pra pontos do fundo
  const mmToPt = 2.835 // 1mm = 2.835 pontos
  // Texto que encolhe pra caber na largura maxMm
  function txtFit(text: string, xMm: number, yMm: number, maxMm: number, size = 8, bold = false) {
    if (!text) return
    const f = bold ? fontBold : font
    let s = size
    while (s > 4 && f.widthOfTextAtSize(text, s) > maxMm * mmToPt) s -= 0.5
    page.drawText(text, { x: xMm * mmToPt, y: height - yMm * mmToPt, size: s, font: f, color: rgb(0, 0, 0) })
  }

  function txt(text: string, xMm: number, yMm: number, size = 8, bold = false, cor?: { r: number; g: number; b: number }) {
    if (!text) return
    page.drawText(text, {
      x: xMm * mmToPt,
      y: height - (yMm * mmToPt),
      size,
      font: bold ? fontBold : font,
      color: cor ? rgb(cor.r, cor.g, cor.b) : rgb(0, 0, 0),
    })
  }

  // ═══════════════════════════════════════════════
  // PREENCHER CAMPOS
  // Para ajustar posições: mude DEBUG pra true, gera o PDF,
  // vê onde os pontos vermelhos caem, ajusta os números
  // ═══════════════════════════════════════════════

  // CÓDIGO INTERNO + LACRE (topo)
  txt(dados.codigo, 99, 25.45, 12, true, { r: 0, g: 0, b: 0.5 })
  // Lacre centralizado entre h180 e h195
  const lacreText = dados.lacre || ''
  if (lacreText) {
    const lacreW = fontBold.widthOfTextAtSize(lacreText, 13) / mmToPt
    const lacreCenterX = 180 + (15 - lacreW) / 2
    txt(lacreText, lacreCenterX, 25, 13, true, { r: 0, g: 0, b: 0.5 })
  }

  // 1.1 — CONTRATADA (parágrafo com dados da unidade)
  const c11 = `Na qualidade de CONTRATADA, a empresa ${u.razaoSocial}, nome fantasia ${u.nomeFantasia}, inscrita no CNPJ ${u.cnpj}, com sede à ${u.endereco} – ${u.cidade} – ${u.estado} - CEP ${u.cep}:`
  const c11Lines = font.widthOfTextAtSize(c11, 6) > (CW - 20) * mmToPt
    ? c11 // precisa quebrar
    : c11
  // Desenhar com wrap manual
  const c11MaxW = (200 - 10) * mmToPt // quebra em h200
  const c11StartX = 10 * mmToPt
  const c11FontSize = 7

  // Quebrar em linhas
  const words = c11.split(' ')
  const lines: string[][] = []
  let currentLine: string[] = []
  for (const word of words) {
    const testStr = [...currentLine, word].join(' ')
    if (font.widthOfTextAtSize(testStr, c11FontSize) > c11MaxW && currentLine.length > 0) {
      lines.push(currentLine)
      currentLine = [word]
    } else {
      currentLine.push(word)
    }
  }
  if (currentLine.length > 0) lines.push(currentLine)

  // Desenhar cada linha justificada (exceto última)
  let lineY = 37
  for (let i = 0; i < lines.length; i++) {
    const lineWords = lines[i]
    const isLast = i === lines.length - 1
    const yPt = height - lineY * mmToPt

    if (isLast || lineWords.length <= 1) {
      // Última linha ou palavra única — alinha à esquerda
      page.drawText(lineWords.join(' '), { x: c11StartX, y: yPt, size: c11FontSize, font, color: rgb(0,0,0) })
    } else {
      // Justificar: distribuir espaço extra entre palavras
      const textNoSpaces = lineWords.join('')
      const textWidth = font.widthOfTextAtSize(textNoSpaces, c11FontSize)
      const extraSpace = (c11MaxW - textWidth) / (lineWords.length - 1)
      let xPos = c11StartX
      for (const w of lineWords) {
        page.drawText(w, { x: xPos, y: yPt, size: c11FontSize, font, color: rgb(0,0,0) })
        xPos += font.widthOfTextAtSize(w, c11FontSize) + extraSpace
      }
    }
    lineY += 2.8
  }

  // ── TABELA TUTOR (y base ~46mm) ──
  const tY = 46 // y do topo da primeira linha da tabela tutor
  const rh = 7.5 // row height aprox

  // Linha 1: Nome | CPF | Tel
  txtFit(dados.tutorNome.toUpperCase(), 23.5, 50.25, 90.5, 8)  // max até h114
  txt(dados.tutorCpf, 125, 50.25, 8)
  txt(fmtTel(dados.tutorTelefone), 167.5, 50.25, 8)

  // Linha 2: E-mail | Endereço
  txtFit(dados.tutorEmail || '', 25, 55.5, 58, 8)  // max até h83
  txtFit(dados.tutorEndereco || '', 102, 55.5, 93, 8)  // max até h195

  // Linha 3: Bairro | Cidade | Estado | CEP
  txtFit(dados.tutorBairro || '', 24.5, 60.85, 48.5, 8)  // max até h73
  txtFit(dados.tutorCidade || '', 90, 60.85, 63, 8)  // max até h153
  txt(dados.tutorEstado || '', 155, 60.85, 8)
  txt(dados.tutorCep || '', 173, 60.85, 8)

  // ── TABELA PET (y base ~68mm) ──
  const pY = 68.5

  // Linha 1: Nome do Pet | Espécie | Gênero
  txtFit(dados.petNome.toUpperCase(), 32.5, 66, 102.5, 8)  // max até h135
  txt(cap(dados.petEspecie), 152, 66, 8)
  txt(cap(dados.petGenero), 183.5, 66, 8)

  // Linha 2: Raça | Cor | Anos Completos
  txtFit(dados.petRaca || '', 22, 71.35, 60, 8)  // max até h82
  txtFit(dados.petCor || '', 94, 71.35, 66, 8)  // max até h160
  txt(dados.petIdade ? `${dados.petIdade}` : '', 191, 71.35, 8)

  // Linha 3: Peso | Localização
  txt(dados.petPeso ? `${dados.petPeso} kg` : '', 31.5, 76.5, 8)
  txtFit(dados.localColeta || '', 64, 76.7, 131, 8)  // max até h195

  // ── PLANO DE CREMAÇÃO (box grande ~100mm) ──
  const planoY = 96.8

  // Tipo de cremação + descrição (texto livre sobrescreve o padrão; label fica fixo pelo tipo)
  const isInd = dados.tipoCremacao === 'individual'
  const planoLabel = isInd ? 'Cremação Individual: ' : 'Cremação Coletiva: '
  const planoDescPadrao = isInd
    ? 'O pet indicado é cremado individualmente no equipamento e as cinzas são entregues em uma urna escolhida previamente.'
    : 'O pet indicado é cremado em conjunto com outros dois pets de mesma modalidade coletiva e as cinzas são espalhadas no jardim do crematório.'
  const planoDesc = (dados.descricaoContrato && dados.descricaoContrato.trim()) || planoDescPadrao

  // Label bold (2mm pra esquerda + fonte menor pra caber descrições longas em 3+ linhas)
  txt(planoLabel, 12.5, planoY, 8, true)
  const labelW = fontBold.widthOfTextAtSize(planoLabel, 8) / mmToPt

  // Descrição: TODAS as linhas usam o mesmo limite horizontal (h130) pra não invadir
  // a coluna direita (Valor/Forma de Pagamento alinhados em h193 e barra vertical em h131.5).
  const descMaxW1 = (130 - 12.5 - labelW) * mmToPt // primeira linha (ao lado do label)
  const descMaxW2 = (130 - 12.5) * mmToPt          // linhas seguintes (mesmo limite, full width sem labelW)
  const descWords = planoDesc.split(' ')
  let descLine = '', descX = 12.5 + labelW, descY = planoY, isFirstLine = true
  for (const w of descWords) {
    const test = descLine ? `${descLine} ${w}` : w
    const maxW = isFirstLine ? descMaxW1 : descMaxW2
    if (font.widthOfTextAtSize(test, 7) > maxW && descLine) {
      txt(descLine, descX, descY, 7)
      descLine = w
      descY += 3.5
      descX = 12.5
      isFirstLine = false
    } else {
      descLine = test
    }
  }
  if (descLine) txt(descLine, descX, descY, 7)

  // Barra vertical separadora
  page.drawLine({
    start: { x: 131.5 * mmToPt, y: height - 95 * mmToPt },
    end: { x: 131.5 * mmToPt, y: height - (95 + 8.9) * mmToPt },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  })

  // Valor — alinhar à direita em h195
  // "Valor c/ desc." só faz sentido quando o resultado final é > 0;
  // Total contratado = valor_plano + valor_acessorios - (desc_plano_unif + desc_acessorios + desc_acess_ajuste).
  // Os campos novos (mig 078 + trigger 074) caem em 0 quando não passados → fallback igual ao valor_plano puro (comportamento legado preservado).
  const dPlano = dados.descontoPlanoUnificado ?? 0
  const dAcess = dados.descontoAcessorios ?? 0
  const dAjuste = dados.descontoAcessoriosAjuste ?? 0
  const totalDesc = dPlano + dAcess + dAjuste
  const acess = dados.valorAcessorios ?? 0
  const valorTotalContratado = (dados.valorPlano ?? 0) + acess - totalDesc
  const houveDesconto = totalDesc > 0 || dados.temDesconto === true
  const valorLabel = houveDesconto && valorTotalContratado > 0 ? 'Valor c/ desc.:' : 'Valor:'
  const valorTexto = `${valorLabel} ${fmt$(valorTotalContratado)}`
  const valorW = fontBold.widthOfTextAtSize(valorTexto, 9) / mmToPt
  txt(valorTexto, 193.4 - valorW, 102.6, 9, true)

  // Forma de pagamento — mesmo v do plano, h135
  const pgMap: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Cartão Débito', credito: 'Cartão Crédito' }
  const pgDisplay = pgMap[(dados.metodoPagamento || '').toLowerCase()] || dados.metodoPagamento || ''
  const pgFull = `${pgDisplay}${dados.parcelas && dados.parcelas > 1 ? ` em ${dados.parcelas}x` : ''}`
  // Forma de pagamento — alinhar à direita em h195
  const pgLabelW = fontBold.widthOfTextAtSize('Forma de Pagamento: ', 8) / mmToPt
  const pgValorW = font.widthOfTextAtSize(pgFull, 8) / mmToPt
  const pgStartX = 193.4 - pgLabelW - pgValorW
  txt('Forma de Pagamento: ', pgStartX, 97.6, 8, true)
  txt(pgFull, pgStartX + pgLabelW, 97.6, 8)

  // Barra horizontal em h146 v236, 25mm
  page.drawLine({
    start: { x: 146 * mmToPt, y: height - 236.3 * mmToPt },
    end: { x: (146 + 45) * mmToPt, y: height - 236.3 * mmToPt },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  })

  // Data/hora acolhimento
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
  if (dados.dataAcolhimento) {
    const dt = new Date(dados.dataAcolhimento)
    const dataTexto = `${u.cidade}, ${dt.getDate()} de ${meses[dt.getMonth()]} de ${dt.getFullYear()}, ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
    txt(dataTexto, 125, 220, 7)
  } else {
    txt(`${u.cidade}, _____ de __________________ de _______, _____:_____`, 105, 220, 7)
  }

  // Rodapé CONTRATADA — centralizado entre h112 e h170
  const rodapeCenterX = (112 + 170) / 2 // h141
  const razaoW = font.widthOfTextAtSize(u.razaoSocial, 7) / mmToPt
  txt(u.razaoSocial, rodapeCenterX - razaoW / 2, 274, 7)
  const fantW = fontBold.widthOfTextAtSize(u.nomeFantasia, 7) / mmToPt
  txt(u.nomeFantasia, rodapeCenterX - fantW / 2, 277, 7, true)
  const cnpjTxt = `CNPJ: ${u.cnpj}`
  const cnpjW = font.widthOfTextAtSize(cnpjTxt, 7) / mmToPt
  txt(cnpjTxt, rodapeCenterX - cnpjW / 2, 280, 7)

  // Cidade/UF do foro
  txt(`${u.cidade} (${u.estado}).`, 10, 212.9, 7)

  // Remover variáveis legadas não usadas
  void tY; void rh; void pY

  // ── ASSINATURAS (fundo da página) ──
  // O template já tem as linhas e labels — não precisa desenhar nada aqui

  // Gerar
  const pdfBytes = await pdfDoc.save()
  return new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' })
}

export function contratoFilename(codigo: string, petNome: string): string {
  const nomeLimpo = petNome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
  return `Contrato_${codigo}_${nomeLimpo}.pdf`
}
