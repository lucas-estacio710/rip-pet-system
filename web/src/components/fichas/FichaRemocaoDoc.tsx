'use client'

import { forwardRef } from 'react'
import { type FichaContratoData, fmtTelefone } from './FichaRemocao'

/**
 * Ficha de Remoção — versão DOCUMENTO (HTML + CSS puro, sem imagem de fundo).
 *
 * POR QUE ELA EXISTE (Lucas, 15/09/2026): *"queria que você tentasse imitar os campos do PNG,
 * mais ou menos o layout, para não dependermos de coordenadas, sabe? e ficar mais leve também."*
 *
 * O `FichaRemocao.tsx` (irmão deste arquivo) desenha a ficha **em cima de um PNG de 398×512**,
 * posicionando cada campo por `top`/`left` absoluto. Funciona e é fiel, mas:
 *
 * | Problema lá | Como fica aqui |
 * |---|---|
 * | 57 KB de PNG baixados só pra ver a ficha | **0 bytes** de imagem — é texto e borda |
 * | Cada campo tem `top`/`left`/`width` na mão; mexer no template desalinha tudo | o layout é **fluxo normal**: `label` + linha que ocupa o resto. Nada de coordenada |
 * | `whiteSpace: nowrap` + `width` fixo → **nome comprido é CORTADO em silêncio** | o texto **quebra linha** e a ficha cresce |
 * | Só existe como pixel | é DOM: dá pra selecionar, copiar e buscar com Ctrl+F |
 *
 * ⚠️ **Fidelidade: "mais ou menos", como pedido.** A moldura, a barra preta, a ordem dos campos,
 * as linhas de preenchimento e as 7 linhas de tutor estão iguais. O que NÃO veio: o **desenho do
 * cachorro** (logo de cima e rodapé), que é arte raster — aqui o cabeçalho é tipografia. Se ela
 * sentir falta, o caminho é um SVG do mascote, não voltar o PNG inteiro.
 *
 * 🔴 **TUDO em estilo inline, de propósito.** Esta ficha é rasterizada por `html2canvas` para
 * virar PNG/PDF, e o html2canvas **não entende as cores `oklch()` do Tailwind v4** — classe
 * Tailwind aqui sairia com cor errada ou preta no arquivo baixado. Hex inline sempre.
 *
 * ⚠️ Largura de projeto FIXA (`DOC_W`), altura livre. Quem exibe escala com
 * `transform: scale()`; quem rasteriza usa o tamanho natural. Não trocar por largura fluida sem
 * resolver os dois casos.
 */

/** Largura de projeto. A altura é livre — cresce com o conteúdo. */
export const DOC_W = 420
/** Altura mínima, só pra ficha vazia ainda parecer a folha. */
export const DOC_MIN_H = 560

// Linhas de tutor. A folha impressa tem 7 fixas, e o Lucas explicou o porquê: *"as linhas de
// tutor é que podem ter mais tutores que 4"*. Então NÃO há teto artificial — mostra todos os
// nomes preenchidos (o contrato guarda até 7 em `certificado_nome_1..7`) e ainda deixa **uma
// linha sobrando** pra quem imprimir poder acrescentar à mão, nunca menos de 4 no total.
const LINHAS_TUTOR_MIN = 4
const LINHAS_TUTOR_MAX = 7

const TINTA = '#111827'        // preto do impresso
const PREENCHIDO = '#1d4ed8'   // azul do que foi preenchido (mesma escolha do irmão)

// Fonte da MARCA (só do "R.I.P PET" do cabeçalho — o corpo da folha é Arial, como no impresso).
// O Lucas informou que a do logo é Arial Rounded, e ela está instalada na máquina dele
// (conferido em 15/09/2026: `Arial Rounded MT Bold` na lista de fontes do Windows).
// ⚠️ **Não é fonte web** — vem com o Microsoft Office, não com o Windows. Onde não existir, a
// cadeia cai em Arial e o cabeçalho fica reto em vez de arredondado; a ficha não quebra. Se um
// dia precisar ser igual em qualquer máquina, aí sim tem que empacotar um .woff2 em
// `public/fonts/` (custo: mais um download, o que esta tela evita de propósito).
const FONTE_MARCA = '"Arial Rounded MT Bold", "Arial Rounded MT", "Helvetica Rounded", Arial, sans-serif'

const S = {
  folha: {
    width: DOC_W,
    minHeight: DOC_MIN_H,
    boxSizing: 'border-box' as const,
    background: '#fff',
    color: TINTA,
    border: `2px solid ${TINTA}`,
    borderRadius: 10,
    padding: 9,
    fontFamily: 'Arial, Helvetica, sans-serif',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  // ---- cabeçalho ----
  topo: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  // `fontWeight: 700` e não 800: a Arial Rounded só tem uma face, e peso alto faz o browser
  // sintetizar negrito em cima (faux bold), engrossando e sujando o contorno arredondado.
  marcaNome: { fontFamily: FONTE_MARCA, fontSize: 18, fontWeight: 700, letterSpacing: 0.3, lineHeight: 1 },
  marcaSub: { fontFamily: FONTE_MARCA, fontSize: 7, fontWeight: 400, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: '#4b5563', marginTop: 2 },
  autLabel: { fontSize: 7.5, fontWeight: 700, textAlign: 'right' as const, lineHeight: 1.25 },
  autValor: { fontSize: 7, fontFamily: 'Consolas, Menlo, monospace', color: PREENCHIDO, textAlign: 'right' as const, wordBreak: 'break-all' as const },
  faixa: {
    background: TINTA, color: '#fff', fontSize: 10.5, fontWeight: 800,
    letterSpacing: 0.3, padding: '3px 7px', marginBottom: 8,
  },
  // ---- bloco central (centralizado, como no impresso) ----
  centro: { textAlign: 'center' as const, marginBottom: 9 },
  lacreLinha: { fontSize: 12.5, fontWeight: 700, marginBottom: 5 },
  tipoLinha: { fontSize: 12, fontWeight: 700, marginBottom: 5 },
  dataLinha: { fontSize: 10, fontWeight: 700 },
  // ---- campos ----
  linha: { display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: 5, minHeight: 14 },
  rot: { fontSize: 9, fontWeight: 600, whiteSpace: 'nowrap' as const, paddingBottom: 1 },
  campo: {
    flex: 1, minWidth: 0, borderBottom: `1px solid ${TINTA}`,
    fontSize: 9.5, color: PREENCHIDO, lineHeight: 1.35, paddingBottom: 1,
    overflowWrap: 'anywhere' as const,
  },
  obsTitulo: { fontSize: 9, fontWeight: 600, marginTop: 4, marginBottom: 3 },
  obsTexto: { fontSize: 8.5, color: PREENCHIDO, lineHeight: 1.4, flex: 1, minHeight: 26, overflowWrap: 'anywhere' as const },
}

/** Slot pequeno e sublinhado, pro dia/mês/ano/hora do bloco central. */
function Slot({ children, w }: { children?: React.ReactNode; w: number }) {
  return (
    <span style={{ display: 'inline-block', width: w, borderBottom: `1px solid ${TINTA}`, color: PREENCHIDO, textAlign: 'center' }}>
      {children || ' '}
    </span>
  )
}

/** Uma linha "Rótulo: ____valor____". `flex` reparte o espaço quando há vários na mesma linha. */
function Campo({ rotulo, valor, flex = 1 }: { rotulo: string; valor?: React.ReactNode; flex?: number }) {
  return (
    <>
      <span style={S.rot}>{rotulo}</span>
      <span style={{ ...S.campo, flex }}>{valor || ' '}</span>
    </>
  )
}

/**
 * "Rua Tal" + "765" → "Rua Tal, 765". Mas **não repete** o número quando o logradouro já
 * termina nele.
 *
 * 🔴 Medido nos 4.927 tutores em 15/09/2026: **364 (7,4% — 1 em cada 13 fichas)** têm o número
 * digitado DENTRO de `endereco` e também em `numero` — "Rua: Honduras, 765" + "765". Concatenar
 * cegamente imprimia *"Rua: Honduras, 765, 765"*.
 *
 * ⚠️ Só pula quando o fim do logradouro é **exatamente** aquele número. Há 66 casos em que o
 * logradouro acaba num dígito DIFERENTE do campo (ex: "Rua Teofilo Julio Bicudo, 19" + "168") —
 * ali os dois entram, porque descartar um seria apagar dado que pode ser o certo. Quem conserta
 * cadastro é o cadastro, não a ficha.
 */
function juntarRuaENumero(endereco?: string | null, numero?: string | null): string {
  const rua = (endereco || '').trim()
  const num = (numero || '').trim()
  if (!rua) return num
  if (!num) return rua
  const jaTem = new RegExp(`(^|[\\s,.-])${num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`).test(rua)
  return jaTem ? rua : `${rua}, ${num}`
}

/** Quebra o `timestamptz` do acolhimento em pedaços, no fuso do navegador. */
function parteData(d?: string | null) {
  if (!d) return { dd: '', mm: '', yyyy: '', hh: '', min: '' }
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return { dd: '', mm: '', yyyy: '', hh: '', min: '' }
  const p = (n: number) => String(n).padStart(2, '0')
  return { dd: p(dt.getDate()), mm: p(dt.getMonth() + 1), yyyy: String(dt.getFullYear()), hh: p(dt.getHours()), min: p(dt.getMinutes()) }
}

const FichaRemocaoDoc = forwardRef<HTMLDivElement, { contrato: FichaContratoData }>(
  function FichaRemocaoDoc({ contrato }, ref) {
    const isCol = contrato.tipo_cremacao === 'coletiva'
    const d = parteData(contrato.data_acolhimento)

    // Telefone: o "principal" manda, igual ao irmão — é o número que a Matriz liga.
    const usaTel2 = contrato.tutor_telefone_principal === 2
    const telBruto = usaTel2 ? contrato.tutor_telefone2 : contrato.tutor_telefone
    const telNome = usaTel2 ? contrato.tutor_telefone2_nome : contrato.tutor_telefone_nome
    const telCont = [fmtTelefone(telBruto), telNome?.trim()].filter(Boolean).join(' — ')

    const nomes = [
      contrato.certificado_nome_1, contrato.certificado_nome_2, contrato.certificado_nome_3,
      contrato.certificado_nome_4, contrato.certificado_nome_5, contrato.certificado_nome_6,
      contrato.certificado_nome_7,
    ].map(n => n?.trim() || '')
    // Todos os preenchidos + 1 linha sobrando, nunca menos de 4 nem mais de 7. Nome do tutor
    // em CAIXA ALTA (pedido do Lucas): é como sai no certificado e no contrato impresso.
    const preenchidos = nomes.filter(Boolean).map(n => n.toLocaleUpperCase('pt-BR'))
    const totalLinhas = Math.min(LINHAS_TUTOR_MAX, Math.max(LINHAS_TUTOR_MIN, preenchidos.length + 1))
    const linhasTutor = [...preenchidos, ...Array(Math.max(0, totalLinhas - preenchidos.length)).fill('')]

    // Endereço do tutor: CADASTRO na frente, snapshot do contrato como fallback.
    const t = contrato.tutor
    const ruaCadastro = juntarRuaENumero(t?.endereco, t?.numero)
    const ruaComComplemento = [ruaCadastro, t?.complemento?.trim()].filter(Boolean).join(' - ')
    const logradouro = ruaComComplemento || contrato.tutor_endereco || ''
    const bairro = t?.bairro || contrato.tutor_bairro || ''
    const cidade = t?.cidade || contrato.tutor_cidade || ''
    const uf = t?.estado || ''
    const cidadeUf = [cidade, uf].filter(Boolean).join('/')
    const cep = t?.cep || contrato.tutor_cep || ''

    return (
      <div ref={ref} style={S.folha}>
        {/* ---- Cabeçalho: marca + código interno ---- */}
        <div style={S.topo}>
          <div>
            <div style={S.marcaNome}>R.I.P PET</div>
            <div style={S.marcaSub}>Crematório de animais</div>
          </div>
          <div style={{ maxWidth: 190 }}>
            <div style={S.autLabel}>Código interno de autenticação:</div>
            <div style={S.autValor}>{contrato.id || contrato.codigo}</div>
          </div>
        </div>

        <div style={S.faixa}>DOCUMENTO DE REMOÇÃO DE ANIMAL EM ÓBITO</div>

        {/* ---- Bloco central ---- */}
        <div style={S.centro}>
          <div style={S.lacreLinha}>
            Nº do Lacre: <Slot w={92}>{contrato.numero_lacre || ''}</Slot>
          </div>
          <div style={S.tipoLinha}>
            Tipo de Cremação: ({<span style={{ color: PREENCHIDO }}>{isCol ? 'X' : ' '}</span>}) Coletiva
            {'  '}({<span style={{ color: PREENCHIDO }}>{isCol ? ' ' : 'X'}</span>}) Individual
          </div>
          {/* O bloco da HORA fica separado da data por um vão explícito (`marginLeft`) — com
              espaços em branco no JSX as duas metades encostavam e "2026 09:39" lia como um
              número só (reclamação do Lucas em 15/09). */}
          <div style={S.dataLinha}>
            Data/hora de Acolhimento: <Slot w={22}>{d.dd}</Slot> / <Slot w={22}>{d.mm}</Slot> / <Slot w={34}>{d.yyyy}</Slot>
            <span style={{ marginLeft: 18 }}>
              <Slot w={22}>{d.hh}</Slot> : <Slot w={22}>{d.min}</Slot>
            </span>
          </div>
        </div>

        {/* ---- Pet ---- */}
        <div style={S.linha}><Campo rotulo="Nome do Animal:" valor={contrato.pet_nome} /></div>
        <div style={S.linha}>
          <Campo rotulo="Espécie:" valor={contrato.pet_especie} flex={1} />
          <Campo rotulo="Raça:" valor={contrato.pet_raca} flex={1.4} />
          <Campo rotulo="Cor:" valor={contrato.pet_cor} flex={1.2} />
        </div>
        <div style={S.linha}>
          <Campo rotulo="Idade:" valor={contrato.pet_idade_anos ? `${contrato.pet_idade_anos} anos` : ''} flex={1} />
          <Campo rotulo="Peso Aprox.:" valor={contrato.pet_peso ? `${contrato.pet_peso} kg` : ''} flex={1} />
          <Campo
            rotulo="Sexo:"
            valor={contrato.pet_genero === 'macho' ? 'Macho' : contrato.pet_genero === 'femea' ? 'Fêmea' : ''}
            flex={1}
          />
        </div>

        {/* ---- Tutor(es): 1ª linha com rótulo, as outras recuadas, como no impresso ---- */}
        <div style={{ marginTop: 5 }}>
          {linhasTutor.map((n, i) => (
            <div key={i} style={S.linha}>
              <span style={{ ...S.rot, visibility: i === 0 ? 'visible' : 'hidden' }}>Tutor(es):</span>
              <span style={S.campo}>{n || ' '}</span>
            </div>
          ))}
        </div>

        {/* ---- Contato e endereço do tutor ---- */}
        <div style={{ ...S.linha, marginTop: 4 }}><Campo rotulo="Tel/Cont:" valor={telCont} /></div>
        {/* Endereço do tutor (pedido do Lucas, 15/09). Não existe na folha impressa — entrou
            aqui porque é o que a Matriz precisa pra agendar a entrega das cinzas, e hoje ela
            vai buscar noutra tela. Fica junto do Tel/Cont: os dois são contato do tutor. */}
        <div style={S.linha}><Campo rotulo="Endereço:" valor={logradouro} /></div>
        <div style={S.linha}>
          <Campo rotulo="Bairro:" valor={bairro} flex={1.5} />
          <Campo rotulo="Cidade:" valor={cidadeUf} flex={1.5} />
          <Campo rotulo="CEP:" valor={cep} flex={1} />
        </div>
        <div style={{ ...S.linha, marginTop: 4 }}><Campo rotulo="Cidade Acolhimento:" valor={contrato.remocao_cidade} /></div>
        <div style={S.linha}>
          <Campo rotulo="Clínica Veterinária:" valor={contrato.clinica_veterinaria || contrato.local_coleta} />
        </div>
        <div style={{ ...S.linha, marginTop: 5 }}>
          <Campo rotulo="Colaborador resp. acolhimento:" valor={contrato.colaborador_responsavel} />
        </div>

        {/* ---- Observações: ocupa o resto da folha ---- */}
        <div style={S.obsTitulo}>Observações especiais:</div>
        <div style={S.obsTexto}>{contrato.observacoes || ''}</div>
      </div>
    )
  }
)

export default FichaRemocaoDoc
