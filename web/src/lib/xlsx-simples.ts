// Gerador mínimo de .xlsx (Office Open XML) sobre o jszip que o projeto já tem.
// Existe pra não puxar uma lib de planilha inteira por causa de um botão de download:
// só texto, número, moeda, data, negrito e largura de coluna — o que um relatório precisa.
// O Excel abre direto, sem o aviso de "formato diferente da extensão" do CSV/XML antigo.

export type Celula =
  | string
  | number
  | null
  | undefined
  | { v: string | number | null; estilo?: Estilo }

/** texto · negrito · moeda (R$) · moeda em negrito · data (dd/mm/aaaa) · percentual */
export type Estilo = 'texto' | 'negrito' | 'moeda' | 'moedaNegrito' | 'data' | 'pct'

export type Aba = {
  nome: string
  linhas: Celula[][]
  larguras?: number[]          // em "caracteres", como no Excel
  congelarLinhas?: number      // cabeçalho fixo ao rolar
}

// Índice no <cellXfs> do styles.xml, na mesma ordem.
const XF: Record<Estilo, number> = { texto: 0, negrito: 1, moeda: 2, moedaNegrito: 3, data: 4, pct: 5 }

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
   // XML 1.0 não aceita caractere de controle (fora tab/quebra) — some com eles.
   .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

function colLetra(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/** 'AAAA-MM-DD' (ou ISO com hora) → número de série do Excel, sem fuso. */
export function dataExcel(iso: string | null | undefined): number | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 + 25569
}

function celulaXml(c: Celula, ref: string): string {
  if (c === null || c === undefined || c === '') return ''
  const { v, estilo } = typeof c === 'object' ? c : { v: c, estilo: undefined }
  if (v === null || v === undefined || v === '') return ''
  const s = estilo ? ` s="${XF[estilo]}"` : ''
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`
}

function abaXml(a: Aba): string {
  const cols = a.larguras?.length
    ? `<cols>${a.larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : ''
  const congela = a.congelarLinhas
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${a.congelarLinhas}" topLeftCell="A${a.congelarLinhas + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : ''
  const linhas = a.linhas.map((l, r) =>
    `<row r="${r + 1}">${l.map((c, i) => celulaXml(c, `${colLetra(i)}${r + 1}`)).join('')}</row>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${congela}${cols}<sheetData>${linhas}</sheetData></worksheet>`
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00;[Red]-&quot;R$&quot; #,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

/** Monta o .xlsx. O jszip entra por import() — só quem baixa paga o JS. */
export async function gerarXlsx(abas: Aba[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  // Nome de aba: até 31 caracteres, sem : \ / ? * [ ], e sem repetir.
  const usados = new Set<string>()
  const nomes = abas.map((a, i) => {
    let n = a.nome.replace(/[:\/?*[\]]/g, ' ').slice(0, 31).trim() || `Aba ${i + 1}`
    while (usados.has(n)) n = `${n.slice(0, 28)} ${i + 1}`
    usados.add(n)
    return n
  })

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`)
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${nomes.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`)
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`)
  zip.file('xl/styles.xml', STYLES)
  abas.forEach((a, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, abaXml(a)))

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    compression: 'DEFLATE',
  })
}
