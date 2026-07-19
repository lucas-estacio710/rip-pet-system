// Contrato PREVENTIVO (PV) em PDF — gerado 100% client-side com pdf-lib (sem template
// de fundo, mesmo padrão do certificado-pdf.ts). Texto-fonte: CONTRATO_PV_PADRÃO.docx
// (raiz do repo). Diferente do emergencial (overlay sobre /contrato-template.pdf),
// aqui o documento inteiro é desenhado: título, cláusula 1.1 dinâmica por unidade,
// tabela de qualificação (tutor + pet), cláusulas 2–8, foro/data/assinaturas.
//
// Entrada é o MESMO DadosContrato do emergencial — o chaveamento acontece dentro de
// gerarContratoPDF (contrato-pdf.ts) quando dados.tipoPlano === 'preventivo'.
// Campos ignorados no PV: lacre, localColeta, metodoPagamento/parcelas (a forma de
// pagamento do saldo é assinalada à mão no papel), velório/acompanhamento.

import { PDFDocument, rgb, PDFFont, PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { getUnidade, type DadosContrato } from './contrato-pdf'

const mmToPt = 2.835
const PAGE_W = 210 * mmToPt
const PAGE_H = 297 * mmToPt
const ML = 10 // margem esquerda (mm)
const MR = 200 // margem direita (mm)
const MAX_Y = 285 // última linha útil antes de quebrar página (mm do topo)

// Escala tipográfica — calibrada pro contrato ocupar 3 páginas A4 (pedido de 19/07/2026).
// Mexeu no texto das cláusulas? Regere o teste (.tmp/test-pv.mts) e confira que segue em 3 páginas.
const BODY = 10 // corpo das cláusulas (pt)
const LINE_H = 4.4 // altura de linha (mm)
const SPACE_AFTER = 2.5 // respiro após parágrafo (mm)

const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function fmt$(v: number | null | undefined): string {
  return v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''
}
function cap(s: string | null): string {
  if (!s) return ''
  const map: Record<string, string> = {
    femea: 'Fêmea', macho: 'Macho', canina: 'Canina', felina: 'Felina', exotica: 'Exótica',
  }
  return map[s.toLowerCase()] || s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}
function fmtTel(t: string | null): string {
  if (!t) return ''
  const n = t.replace(/\D/g, '')
  if (n.length === 13 && n.startsWith('55')) return `${n.slice(2, 4)} ${n.slice(4, 9)}-${n.slice(9)}`
  if (n.length >= 12) return `+${n.slice(0, n.length - 11)} ${n.slice(-11, -9)} ${n.slice(-9, -4)}-${n.slice(-4)}`
  if (n.length === 11) return `${n.slice(0, 2)} ${n.slice(2, 7)}-${n.slice(7)}`
  if (n.length === 10) return `${n.slice(0, 2)} ${n.slice(2, 6)}-${n.slice(6)}`
  return t
}

export async function gerarContratoPvPDF(dados: DadosContrato, nomeUnidade: string): Promise<Blob> {
  const u = getUnidade(nomeUnidade)

  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const [regularBytes, boldBytes, logoBytes] = await Promise.all([
    fetch('/fonts/DMSans-Regular.ttf').then(r => r.arrayBuffer()),
    fetch('/fonts/DMSans-Bold.ttf').then(r => r.arrayBuffer()),
    fetch('/logo_rounded.png').then(r => r.arrayBuffer()).catch(() => null), // emblema RIP (as versões com texto são brancas — somem no fundo branco)
  ])
  const font = await pdfDoc.embedFont(regularBytes, { subset: true })
  const fontBold = await pdfDoc.embedFont(boldBytes, { subset: true })
  const logo = logoBytes ? await pdfDoc.embedPng(logoBytes).catch(() => null) : null

  // Decoração de papel timbrado — desenhada ANTES do conteúdo (pdf-lib pinta em ordem):
  // moldura retangular sutil + logo grande em marca d'água atrás do texto.
  function decorate(p: PDFPage) {
    p.drawRectangle({
      x: 5 * mmToPt, y: 5 * mmToPt,
      width: (210 - 10) * mmToPt, height: (297 - 10) * mmToPt,
      borderColor: rgb(0.16, 0.42, 0.63), // azul RIP suave
      borderWidth: 1,
      borderOpacity: 0.35,
    })
    if (logo) {
      const wmW = 110 // mm
      const wmH = wmW * (logo.height / logo.width)
      p.drawImage(logo, {
        x: ((210 - wmW) / 2) * mmToPt,
        y: PAGE_H - ((297 + wmH) / 2) * mmToPt,
        width: wmW * mmToPt,
        height: wmH * mmToPt,
        opacity: 0.05,
      })
    }
  }

  // ── Cursor de página (yMm cresce pra baixo; quebra automática) ──
  let page: PDFPage = pdfDoc.addPage([PAGE_W, PAGE_H])
  decorate(page)
  let yMm = 14

  function newPage() {
    page = pdfDoc.addPage([PAGE_W, PAGE_H])
    decorate(page)
    yMm = 14
  }
  function ensure(hMm: number) {
    if (yMm + hMm > MAX_Y) newPage()
  }
  function txt(text: string, xMm: number, yAbsMm: number, size: number, f: PDFFont, cor = rgb(0, 0, 0)) {
    if (!text) return
    page.drawText(text, { x: xMm * mmToPt, y: PAGE_H - yAbsMm * mmToPt, size, font: f, color: cor })
  }
  // Texto que encolhe pra caber na largura maxMm (células da tabela)
  function txtFit(text: string, xMm: number, yAbsMm: number, maxMm: number, size: number, f: PDFFont) {
    if (!text) return
    let s = size
    while (s > 4 && f.widthOfTextAtSize(text, s) > maxMm * mmToPt) s -= 0.5
    txt(text, xMm, yAbsMm, s, f)
  }

  // Parágrafo com wrap + justificado; prefixo em bold na primeira linha (ex: "3.2 - ").
  function paragraph(body: string, opts?: { boldPrefix?: string; size?: number; lineH?: number; spaceAfter?: number; allBold?: boolean }) {
    const size = opts?.size ?? BODY
    const lineH = opts?.lineH ?? LINE_H
    const spaceAfter = opts?.spaceAfter ?? SPACE_AFTER
    const bodyFont = opts?.allBold ? fontBold : font
    const prefix = opts?.boldPrefix ?? ''
    const prefixW = prefix ? fontBold.widthOfTextAtSize(prefix, size) / mmToPt : 0
    const fullW = MR - ML

    // Quebra em linhas (primeira linha desconta o prefixo)
    const words = body.split(' ').filter(Boolean)
    const lines: string[][] = []
    let current: string[] = []
    let isFirst = true
    for (const w of words) {
      const maxW = (isFirst ? fullW - prefixW : fullW) * mmToPt
      const test = [...current, w].join(' ')
      if (bodyFont.widthOfTextAtSize(test, size) > maxW && current.length > 0) {
        lines.push(current)
        current = [w]
        isFirst = false
      } else {
        current.push(w)
      }
    }
    if (current.length > 0) lines.push(current)

    for (let i = 0; i < lines.length; i++) {
      ensure(lineH)
      const lineWords = lines[i]
      const isLast = i === lines.length - 1
      const startX = i === 0 ? ML + prefixW : ML
      const availW = (MR - startX) * mmToPt
      if (i === 0 && prefix) txt(prefix, ML, yMm, size, fontBold)
      if (isLast || lineWords.length <= 1) {
        txt(lineWords.join(' '), startX, yMm, size, bodyFont)
      } else {
        // Justificar: distribuir espaço extra entre palavras
        const textWidth = bodyFont.widthOfTextAtSize(lineWords.join(''), size)
        const extra = (availW - textWidth) / (lineWords.length - 1)
        let x = startX * mmToPt
        for (const w of lineWords) {
          page.drawText(w, { x, y: PAGE_H - yMm * mmToPt, size, font: bodyFont, color: rgb(0, 0, 0) })
          x += bodyFont.widthOfTextAtSize(w, size) + extra
        }
      }
      yMm += lineH
    }
    yMm += spaceAfter
  }

  function heading(text: string) {
    ensure(10)
    yMm += 1.8
    txt(text, ML, yMm, 11.5, fontBold)
    yMm += 6.2
  }

  // ═══════════════ CABEÇALHO ═══════════════
  // Logo RIP no canto direito (só página 1)
  if (logo) {
    const logoW = 18 // mm
    const logoH = logoW * (logo.height / logo.width)
    page.drawImage(logo, {
      x: (MR - logoW) * mmToPt,
      y: PAGE_H - (8 + logoH) * mmToPt,
      width: logoW * mmToPt,
      height: logoH * mmToPt,
    })
    yMm = Math.max(yMm, 8 + logoH - 4)
  }
  txt('CÓDIGO INTERNO:', ML, yMm, 11, fontBold)
  txt(dados.codigo, ML + 40, yMm, 13, fontBold, rgb(0, 0, 0.5))
  yMm += 9

  // Barra de título (fundo preto, texto branco centralizado)
  const titulo = 'CONTRATO PREVENTIVO DE PRESTAÇÃO DE SERVIÇOS FUNERÁRIOS E DE CREMAÇÃO DE ANIMAIS'
  const tituloSize = 9.5
  page.drawRectangle({
    x: ML * mmToPt, y: PAGE_H - (yMm + 5.4) * mmToPt,
    width: (MR - ML) * mmToPt, height: 7.5 * mmToPt,
    color: rgb(0, 0, 0),
  })
  const tituloW = fontBold.widthOfTextAtSize(titulo, tituloSize) / mmToPt
  txt(titulo, ML + (MR - ML - tituloW) / 2, yMm + 4, tituloSize, fontBold, rgb(1, 1, 1))
  yMm += 11

  // ═══════════════ CLÁUSULA 1 ═══════════════
  heading('CLÁUSULA 1 - DAS PARTES')
  paragraph('São partes integrantes deste contrato:', { spaceAfter: 1 })
  paragraph(
    `Na qualidade de CONTRATADA, a empresa ${u.razaoSocial}, nome fantasia ${u.nomeFantasia}, inscrita no CNPJ ${u.cnpj}, com sede à ${u.endereco} – ${u.cidade} – ${u.estado} - CEP ${u.cep}.`,
    { boldPrefix: '1.1 - ' }
  )
  paragraph('Na qualidade de CONTRATANTE, cuja qualificação está descrita abaixo:', { boldPrefix: '1.2 - ', spaceAfter: 1.5 })

  // ── Tabela de qualificação (tutor + pet) ──
  type Cell = { label: string; value: string; x0: number; x1: number }
  const enderecoTutor = dados.tutorEndereco || ''
  const rows: Cell[][] = [
    [
      { label: 'Nome:', value: (dados.tutorNome || '').toUpperCase(), x0: ML, x1: 115 },
      { label: 'CPF:', value: dados.tutorCpf || '', x0: 115, x1: 158 },
      { label: 'Tel:', value: fmtTel(dados.tutorTelefone), x0: 158, x1: MR },
    ],
    [
      { label: 'E-mail:', value: dados.tutorEmail || '', x0: ML, x1: 95 },
      { label: 'Endereço:', value: enderecoTutor, x0: 95, x1: MR },
    ],
    [
      { label: 'Bairro:', value: dados.tutorBairro || '', x0: ML, x1: 85 },
      { label: 'Cidade:', value: dados.tutorCidade || '', x0: 85, x1: 150 },
      { label: 'Estado:', value: dados.tutorEstado || '', x0: 150, x1: 170 },
      { label: 'CEP:', value: dados.tutorCep || '', x0: 170, x1: MR },
    ],
    [
      { label: 'Nome do Pet:', value: (dados.petNome || '').toUpperCase(), x0: ML, x1: 145 },
      { label: 'Espécie:', value: cap(dados.petEspecie), x0: 145, x1: 175 },
      { label: 'Gênero:', value: cap(dados.petGenero), x0: 175, x1: MR },
    ],
    [
      { label: 'Raça:', value: dados.petRaca || '', x0: ML, x1: 90 },
      { label: 'Cor:', value: dados.petCor || '', x0: 90, x1: 165 },
      { label: 'Anos Completos:', value: dados.petIdade != null ? String(dados.petIdade) : '', x0: 165, x1: MR },
    ],
    [
      { label: 'Peso Aprox.:', value: dados.petPeso != null ? `${dados.petPeso} kg` : '', x0: ML, x1: MR },
    ],
  ]
  const rowH = 8.4
  ensure(rows.length * rowH + 2)
  const tableTop = yMm
  for (let r = 0; r < rows.length; r++) {
    const rowY = tableTop + r * rowH
    for (const cell of rows[r]) {
      const labelW = fontBold.widthOfTextAtSize(cell.label, 8.5) / mmToPt
      txt(cell.label, cell.x0 + 1.5, rowY + 5.7, 8.5, fontBold)
      txtFit(cell.value, cell.x0 + 1.5 + labelW + 1.5, rowY + 5.7, cell.x1 - cell.x0 - labelW - 4.5, 10, font)
      // separador vertical à esquerda da célula (menos a primeira)
      if (cell.x0 !== ML) {
        page.drawLine({
          start: { x: cell.x0 * mmToPt, y: PAGE_H - rowY * mmToPt },
          end: { x: cell.x0 * mmToPt, y: PAGE_H - (rowY + rowH) * mmToPt },
          thickness: 0.5, color: rgb(0, 0, 0),
        })
      }
    }
    // linha horizontal inferior da row
    page.drawLine({
      start: { x: ML * mmToPt, y: PAGE_H - (rowY + rowH) * mmToPt },
      end: { x: MR * mmToPt, y: PAGE_H - (rowY + rowH) * mmToPt },
      thickness: 0.5, color: rgb(0, 0, 0),
    })
  }
  // contorno externo (topo + laterais)
  page.drawLine({ start: { x: ML * mmToPt, y: PAGE_H - tableTop * mmToPt }, end: { x: MR * mmToPt, y: PAGE_H - tableTop * mmToPt }, thickness: 0.5, color: rgb(0, 0, 0) })
  page.drawLine({ start: { x: ML * mmToPt, y: PAGE_H - tableTop * mmToPt }, end: { x: ML * mmToPt, y: PAGE_H - (tableTop + rows.length * rowH) * mmToPt }, thickness: 0.5, color: rgb(0, 0, 0) })
  page.drawLine({ start: { x: MR * mmToPt, y: PAGE_H - tableTop * mmToPt }, end: { x: MR * mmToPt, y: PAGE_H - (tableTop + rows.length * rowH) * mmToPt }, thickness: 0.5, color: rgb(0, 0, 0) })
  yMm = tableTop + rows.length * rowH + 3

  // ═══════════════ CLÁUSULA 2 ═══════════════
  heading('CLÁUSULA 2 – DO OBJETO')
  paragraph(
    'A CONTRATADA, através de recursos próprios e em conjunto com a Matriz PRINA E BASSI CREMATÓRIO DE ANIMAIS, nome fantasia R.I.P. PET CREMATÓRIO DE ANIMAIS, inscrita no CNPJ/MF sob o nº 19.919.278/0001-95, com sede localizada na Estrada Municipal Francisco Barros de Abreu, nº 800, bairro Borba, na cidade de Pindamonhangaba-SP, se compromete a organizar e prestar serviços de assistência funeral e de cremação de animais domésticos ao CONTRATANTE em momento por este último indicado, nas condições deste contrato e conforme características do plano de cremação selecionado.'
  )
  paragraph('O plano de cremação contratado pelo CONTRATANTE é o descrito abaixo:', { boldPrefix: '2.1 – PLANO DE CREMAÇÃO CONTRATADO: ', spaceAfter: 1.2 })

  // Total contratado = plano + acessórios − descontos (mesma fórmula do emergencial)
  const totalDesc = (dados.descontoPlanoUnificado ?? 0) + (dados.descontoAcessorios ?? 0) + (dados.descontoAcessoriosAjuste ?? 0)
  const valorTotal = (dados.valorPlano ?? 0) + (dados.valorAcessorios ?? 0) - totalDesc
  const valorTexto = valorTotal > 0 ? fmt$(valorTotal) : 'R$ __________'
  const isInd = dados.tipoCremacao === 'individual'

  // Só o plano CONTRATADO é impresso (nada de "assinale com X" — era moderna).
  paragraph(
    isInd
      ? `Somente um pet é cremado e as cinzas são entregues em uma urna personalizada. Valor: ${valorTexto}.`
      : `Na cremação coletiva, o pet indicado pelo CONTRATANTE e mais dois pets são cremados em conjunto e as cinzas são espalhadas no jardim do Crematório situado no Município de Pindamonhangaba. Valor: ${valorTexto}.`,
    { boldPrefix: isInd ? 'Plano de cremação individual. ' : 'Plano de cremação coletiva. ', spaceAfter: 1.2 }
  )
  // Detalhamento do plano (texto livre do processamento — contratos.descricao_contrato)
  if (dados.descricaoContrato && dados.descricaoContrato.trim()) {
    paragraph(dados.descricaoContrato.trim(), { boldPrefix: 'Detalhamento do plano: ', spaceAfter: 1.2 })
  }

  // ═══════════════ CLÁUSULA 3 ═══════════════
  heading('CLÁUSULA 3 - DOS SERVIÇOS')
  paragraph(
    'A CONTRATADA se propõe a executar a prestação de serviço funeral pet padrão ao animal indicado pelo CONTRATANTE, de acordo com o plano de cremação escolhido, fazendo este jus aos serviços abaixo discriminados:'
  )
  paragraph(
    'Cerimônia de despedida com ornamentação com flores da época e/ou manto. O velório deverá ser agendado com no mínimo 1 (um) dia de antecedência e será realizado na sede da CONTRATADA ou em outra unidade, em horário e dia comercial, com duração máxima de 1 (uma) hora. Caso o CONTRATANTE necessite que o velório seja realizado após as 18 horas, ou que tenha um período maior, será cobrada uma taxa extra de R$ 100,00 (cem reais) por hora.',
    { boldPrefix: '3.1 - ' }
  )
  paragraph(
    'Serviço de remoção domiciliar 24 horas e translado, via terrestre, ou em clínicas veterinárias em município indicado neste contrato na qualificação dos dados do CONTRATANTE. Os eventuais custos de remoção, caso necessite ser realizada em outro município diferente do mencionado na qualificação dos dados do CONTRATANTE, serão suportados pelo CONTRATANTE: custos de deslocamento (combustível, pedágios e/ou balsas) calculados pela CONTRATADA e informados ao CONTRATANTE no momento do acionamento, para pagamento antecipado, podendo a CONTRATADA absorver ou descontar parte destes custos, a seu critério. A coleta do pet será realizada em até 6 (seis) horas a partir da comunicação do falecimento – excetuando-se situações de impedimento como acidentes, trânsito devido a obras, paralisação de rodovias e balsas, e outras situações inoportunas.',
    { boldPrefix: '3.2 - ' }
  )
  paragraph(
    '§ único: os valores mencionados na cláusula 2.1 são para pets de até 45 quilogramas. Para pets que ultrapassem o peso de 45 quilogramas no momento do acionamento, será acrescida uma taxa de R$ 100,00 (cem reais) a fim de alocar colaboradores adicionais durante o processo para correto manuseio do animal.'
  )
  paragraph(
    'Cremação dos animais domésticos a ser realizada na sede do Crematório R.I.P. PET, localizado na Estrada Municipal Francisco Barros de Abreu, 800, bairro do Borba, no Município de Pindamonhangaba-SP. A cremação será realizada de acordo com agenda interna, obedecendo a ordem cronológica da sede R.I.P. Pet em Pindamonhangaba, com a viabilidade de acompanhamento presencial ou on-line. O prazo para cremação é de até 10 (dez) dias corridos a contar da remoção. Caso haja necessidade de a cremação ocorrer em 24 (vinte e quatro) horas, poderá ser aberta exceção, desde que os custos da viagem sejam de responsabilidade do CONTRATANTE, uma vez que foge da programação da empresa.',
    { boldPrefix: '3.3 - ' }
  )
  paragraph('Certificado de Cremação assinado por Veterinário responsável pelo Crematório R.I.P. Pet, devidamente credenciado no CRMV.', { boldPrefix: '3.4 - ' })
  paragraph(
    'A responsabilidade da CONTRATADA restringe-se apenas ao transporte do animal, despesas com funeral e cremação conforme o plano contratado e entrega das cinzas e/ou certificado de cremação, que serão retirados pelo CONTRATANTE na sede da empresa CONTRATADA ou entregues sem custos em dia pré-agendado pela CONTRATADA em endereço dentro do município do CONTRATANTE.',
    { boldPrefix: '3.5 - ' }
  )
  paragraph(
    'Se o CONTRATANTE optar por um serviço diferente do que foi contratado, ou solicitar serviços não inclusos na relação acima, arcará com a diferença do serviço prestado pela CONTRATADA. Quaisquer despesas assumidas pelo CONTRATANTE junto a terceiros, inclusive deslocamentos pessoais dentro do município sede da CONTRATADA, serão de inteira e exclusiva responsabilidade do CONTRATANTE, nada podendo ser exigido da CONTRATADA a título de ressarcimento, restituição ou qualquer outra forma.',
    { boldPrefix: '3.6 - ' }
  )
  paragraph(
    'Os benefícios oferecidos serão prestados exclusivamente ao CONTRATANTE, cujo contrato deve estar rigorosamente quitado, não existindo qualquer tolerância quanto ao atraso de pagamentos.',
    { boldPrefix: '3.7 - ' }
  )

  // ═══════════════ CLÁUSULA 4 ═══════════════
  heading('CLÁUSULA 4 - DA CARÊNCIA')
  paragraph(
    'Os beneficiários do CONTRATANTE passarão a gozar dos direitos aqui contratados somente após o decurso do período de carência de 48 (quarenta e oito) horas, contado do pagamento integral do plano realizado no ato da contratação, ressalvada a hipótese prevista na cláusula 4.2. Decorrido o período de carência, o presente Contrato vigorará por prazo indeterminado, em caráter vitalício, até o acionamento indicado pelo CONTRATANTE.',
    { boldPrefix: '4.1 - ' }
  )
  paragraph(
    'Facultativamente, poderá o CONTRATANTE antecipar, a título de sinal e princípio de pagamento, a quantia de R$ 100,00 (cem reais), hipótese em que o período de carência previsto na cláusula 4.1 terá início na data da confirmação do respectivo pagamento, sendo o valor antecipado integralmente abatido do preço total do plano contratado por ocasião da quitação.',
    { boldPrefix: '4.2 - ' }
  )
  paragraph(
    'Caso o CONTRATANTE precise utilizar o plano antes do término da carência (48 horas), será migrado para plano emergencial, mediante acréscimo de R$ 100,00 (cem reais).',
    { boldPrefix: '4.3 - ' }
  )

  // ═══════════════ CLÁUSULA 5 ═══════════════
  heading('CLÁUSULA 5 – DA FALTA OU ATRASO NO PAGAMENTO')
  paragraph(
    'A falta ou o atraso no pagamento do preço estipulado na Cláusula 2.1, ou de seu saldo remanescente, implicará na incidência de multa equivalente a 2% (dois por cento) do valor devido e não pago, acrescida de juros de mora de 0,2% (zero vírgula dois por cento) ao dia, calculados pro rata die sobre o valor devido até a data do efetivo pagamento.',
    { boldPrefix: '5.1 - ' }
  )

  // ═══════════════ CLÁUSULA 6 ═══════════════
  heading('CLÁUSULA 6 – DA RESCISÃO')
  paragraph('O presente Contrato poderá ser rescindido pelo CONTRATANTE que já utilizou os serviços e não possui mais beneficiários vinculados ao contrato.', { boldPrefix: '6.1 - ' })
  // 6.2–6.4 em NEGRITO integral — destaque de cláusulas restritivas de direito do consumidor (CDC art. 54, §4º)
  paragraph(
    'Em caso de desistência após a coleta, será cobrado o valor de 50% referente ao plano total e a retirada do animal da unidade da CONTRATADA será de responsabilidade do CONTRATANTE, em até 1 (um) dia corrido após a rescisão.',
    { boldPrefix: '6.2 - ', allBold: true }
  )
  paragraph(
    'Sem prejuízo do disposto na cláusula 5.1 acima, a falta ou o atraso no pagamento do preço estipulado na Cláusula 2.1, ou de seu saldo remanescente, por período superior a 90 (noventa) dias, implicará na rescisão automática do Contrato, independentemente de prévia notificação ou aviso, não cabendo ao CONTRATANTE qualquer tipo de reembolso ou restituição dos valores já pagos.',
    { boldPrefix: '6.3 - ', allBold: true }
  )
  paragraph(
    'O presente Contrato poderá ser rescindido a qualquer tempo pelo CONTRATANTE, mediante simples notificação que deverá ser encaminhada com pelo menos 30 dias de antecedência, não cabendo nesta hipótese qualquer tipo de restituição ou reembolso pelos valores já pagos.',
    { boldPrefix: '6.4 – ', allBold: true }
  )

  // ═══════════════ CLÁUSULA 7 ═══════════════
  heading('CLÁUSULA 7 – DAS OBRIGAÇÕES DO CONTRATANTE')
  paragraph('Efetuar os pagamentos conforme acordado no ato da contratação.', { boldPrefix: '7.1 - ' })
  paragraph('Agendar previamente o velório, caso o CONTRATANTE opte pela sua realização.', { boldPrefix: '7.2 - ' })
  paragraph(
    'O CONTRATANTE deve retirar as cinzas e/ou certificado na sede da empresa CONTRATADA no prazo de até 15 (quinze) dias úteis após a comunicação da disponibilidade ou, caso prefira, será feita a entrega em sua residência ou local indicado em data pré-agendada sem nenhum custo, se dentro do município indicado na qualificação dos dados do CONTRATANTE.',
    { boldPrefix: '7.3 - ' }
  )
  paragraph(
    'O CONTRATANTE declara conhecer os benefícios e limitações deste convênio oferecido pela CONTRATADA, sendo de livre vontade optar por este tipo de prestação de serviços, cuja finalidade é única e tão somente o serviço funerário e cremação de animais domésticos.',
    { boldPrefix: '7.4 - ' }
  )

  // ═══════════════ CLÁUSULA 8 ═══════════════
  heading('CLÁUSULA 8 – DAS CONDIÇÕES GERAIS')
  paragraph(
    'O CONTRATANTE, a partir do presente contrato autoriza a execução da cremação do animal doméstico, constante como beneficiário no contrato ou indicado em momento posterior, assumindo inteira responsabilidade civil e criminal pelos atos que decorrerem desta autorização, compreendendo-se ainda, a ressarcir quaisquer prejuízos ou danos que venham a ocasionar as pessoas naturais ou jurídicas que sejam prejudicadas em seus legítimos direitos e responsabilidades.',
    { boldPrefix: '8.1 - ' }
  )
  paragraph(
    'A CONTRATADA não se obriga a autorizar a entrada do CONTRATANTE nas dependências da sala de cremação sem horário agendado, no entanto, caso o CONTRATANTE desejar acompanhar a cremação presencialmente, será devidamente autorizado no dia e hora previamente agendado, cujo procedimento dura entre 1 e 2 horas. As despesas de deslocamento do CONTRATANTE até a sede do Crematório R.I.P. Pet no município de Pindamonhangaba, serão suportadas pelo mesmo.',
    { boldPrefix: '8.2 - ' }
  )
  paragraph(
    `As partes elegem o Foro de ${u.cidade} (${u.estado}), para dirimir quaisquer controvérsias oriundas do presente instrumento particular, com exclusão de qualquer outro por mais privilegiado que seja.`
  )

  // ═══════════════ DATA + ASSINATURAS (bloco inteiro, sem quebrar no meio) ═══════════════
  // Campos de assinatura são OPCIONAIS (default: sem) — o aceite padrão do PV é digital
  // ("De Acordo" via WhatsApp + pagamento). Toggle no processamento da ficha (op_dados.camposAssinatura).
  const comAssinatura = dados.assinaturaCampos === true
  ensure(comAssinatura ? 50 : 34)
  yMm += 7

  // Linha de data — usa dataContrato (YYYY-MM-DD) se disponível
  let dataTexto = `${u.cidade}, _____ de __________________ de _______.`
  if (dados.dataContrato) {
    const d = new Date(dados.dataContrato.length === 10 ? dados.dataContrato + 'T12:00:00' : dados.dataContrato)
    if (!isNaN(d.getTime())) {
      dataTexto = `${u.cidade}, ${d.getDate()} de ${MESES_PT[d.getMonth()]} de ${d.getFullYear()}.`
    }
  }
  txt(dataTexto, ML, yMm, 9.5, font)

  if (!comAssinatura) {
    // Fecho de aceite eletrônico — explica como o aceite se dá no fluxo digital
    // (PDF via WhatsApp → "De Acordo" → pagamento), com o lastro legal.
    yMm += 10
    paragraph(
      'O presente Contrato é celebrado por meio eletrônico, dispensada a assinatura de próprio punho. A concordância expressa do CONTRATANTE ("De Acordo"), manifestada pelo canal eletrônico utilizado nas tratativas, acompanhada do respectivo pagamento, constitui aceitação plena e inequívoca dos termos aqui pactuados, com validade de assinatura para todos os fins de direito, na forma do art. 107 do Código Civil e do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001.',
      { boldPrefix: 'DO ACEITE ELETRÔNICO: ' }
    )
  }

  if (comAssinatura) {
    yMm += 18

    // Assinaturas em 2 colunas
    const col1cx = 60 // centro da coluna CONTRATANTE
    const col2cx = 150 // centro da coluna CONTRATADA
    const centered = (text: string, cx: number, yAbs: number, size: number, f: PDFFont) => {
      const w = f.widthOfTextAtSize(text, size) / mmToPt
      txt(text, cx - w / 2, yAbs, size, f)
    }
    page.drawLine({ start: { x: (col1cx - 35) * mmToPt, y: PAGE_H - yMm * mmToPt }, end: { x: (col1cx + 35) * mmToPt, y: PAGE_H - yMm * mmToPt }, thickness: 0.6, color: rgb(0, 0, 0) })
    page.drawLine({ start: { x: (col2cx - 35) * mmToPt, y: PAGE_H - yMm * mmToPt }, end: { x: (col2cx + 35) * mmToPt, y: PAGE_H - yMm * mmToPt }, thickness: 0.6, color: rgb(0, 0, 0) })
    centered('CONTRATANTE', col1cx, yMm + 5, 9.5, fontBold)
    centered((dados.tutorNome || '').toUpperCase(), col1cx, yMm + 9.2, 8.5, font)
    if (dados.tutorCpf) centered(`CPF: ${dados.tutorCpf}`, col1cx, yMm + 12.8, 8.5, font)
    centered('CONTRATADA', col2cx, yMm + 5, 9.5, fontBold)
    centered(u.razaoSocial, col2cx, yMm + 9.2, 8.5, font)
    centered(u.nomeFantasia, col2cx, yMm + 12.8, 8.5, fontBold)
    centered(`CNPJ: ${u.cnpj}`, col2cx, yMm + 16.4, 8.5, font)
  }

  const pdfBytes = await pdfDoc.save()
  return new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' })
}
