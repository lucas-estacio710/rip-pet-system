// Nome com que o contrato é salvo na AGENDA do celular (o "nome de referência").
//
// Formato: `AAmmmDD NomeDoContatoAtivo EM|PV NomeDoPet [IND|COL]`
//   ex: "26set22 Mariana EM Charlote COL"
//
// 🔴 O nome do meio é o **CONTATO ATIVO**, não o titular do contrato. Pedido do Lucas em
// 23/09/2026: *"fiz uma construção errada do nome para o contato, pq nós mudamos ou podemos
// mudar isso na ficha antes de gerar o contrato... é o campo contato ativo"*.
//
// O contrato guarda DOIS telefones, cada um com o nome de quem atende
// (`tutor_telefone_nome` / `tutor_telefone2_nome`), e `tutor_telefone_principal` diz qual está
// ativo. Quem a Matriz liga é esse — pode ser o filho, o vizinho, a clínica —, então é o nome
// dele que tem que estar na agenda. Até 23/09 esta função usava o primeiro nome do TUTOR: em
// contratos onde o titular atende dá no mesmo, mas quando não atende o contato salvo ficava
// com o nome de quem não vai responder.
//
// ⚠️ **Nada é congelado**: o nome sai dos campos do contrato a cada chamada, e a tela monta a
// cada carregamento. Mudar o contato ativo na ficha/contrato e recarregar já reflete — era o
// outro lado do pedido (*"sempre renderizar no carregamento pq eu posso mudar isso a qualquer
// hora"*).
//
// Morava inline em `app/contratos/[id]/page.tsx` (`gerarCodigoReferencia`), que é onde o
// botão "copiar nome para agenda" vive. Saiu pra cá em 15/09/2026 porque a
// `/gruposencaminhamentos` precisa do MESMO nome no card de contato anexado à ficha —
// é literalmente o nome que a Matriz salva no celular pra agendar a despedida, e duas
// implementações do mesmo nome divergiriam na primeira mudança de formato.
//
// 🔴 `contratos.data_contrato` é `date`, NÃO `timestamptz`. `new Date('2026-09-14')` é
// parseado como **meia-noite UTC**, e em BRT (UTC-3) `getDate()` devolve **13**. A versão
// inline fazia exatamente isso e vinha imprimindo o dia anterior desde sempre (conferido
// no contrato SJ260914INDDANBISDS: data 14/09, nome "26set13"). Aqui a string é quebrada
// em pedaços, sem instanciar `Date` nenhum — a única forma que não erra.
import { primeiroNome, tituloNome } from '@/lib/nome-tutor'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export type ContratoParaAgenda = {
  data_contrato?: string | null
  tipo_plano?: string | null
  tipo_cremacao?: string | null
  pet_nome?: string | null
  tutor_nome?: string | null
  // Contato ativo: `principal` escolhe entre os dois pares telefone/nome.
  tutor_telefone_nome?: string | null
  tutor_telefone2_nome?: string | null
  tutor_telefone_principal?: number | null
  tutor?: {
    nome?: string | null
    telefone_nome?: string | null
    telefone_principal?: number | null
  } | null
}

/**
 * Nome de quem atende o telefone ATIVO do contrato.
 *
 * Precedência: cadastro do tutor › snapshot do contrato — a mesma que o resto do sistema usa
 * (quem muda de contato atualiza o cadastro, e `/tutores/[id]` propaga pros contratos não
 * finalizados). Cai no primeiro nome do titular quando não há apelido cadastrado, que é o caso
 * da maioria: aí o contato ativo É o tutor.
 *
 * ⚠️ O cadastro só tem UM par (`telefone_nome`/`telefone_principal`); o segundo telefone é
 * só do contrato (`tutor_telefone2_nome`). Então quando o principal é 2, o nome vem
 * obrigatoriamente do snapshot.
 */
export function nomeDoContatoAtivo(contrato: ContratoParaAgenda): string {
  const principal = contrato.tutor?.telefone_principal ?? contrato.tutor_telefone_principal ?? 1
  const bruto = principal === 2
    ? contrato.tutor_telefone2_nome
    : (contrato.tutor?.telefone_nome || contrato.tutor_telefone_nome)

  const apelido = limparApelido(bruto)
  return primeiroNome(apelido || contrato.tutor?.nome || contrato.tutor_nome)
}

/**
 * O apelido do telefone é **texto livre digitado no atendimento**, e varrendo os 3.313
 * preenchidos em 23/09/2026 apareceram três formas que estragavam o nome de agenda:
 *
 *   • **9** sem letra nenhuma (`"."`) → `primeiroNome(".")` daria `"26mai14 . EM Dentinho IND"`
 *   • **9** começando com pronome de tratamento (`"Sra Irene ( mãe)"`, `"Dr. Marcio"`,
 *     `"DRA MARIANA"`) → o primeiro nome viraria **"Sra"**, que não identifica ninguém
 *   • **9** com parêntese de parentesco (`"Jessica (filha)"`, `"Larissa (esposa)"`) → este já
 *     saía certo, porque `primeiroNome` pega só a primeira palavra
 *
 * São ~0,3% do total, mas são exatamente os casos em que o nome salvo na agenda fica inútil.
 * Devolve string vazia quando não sobra nada aproveitável, e aí o chamador cai no titular.
 */
function limparApelido(bruto?: string | null): string {
  const s = (bruto || '').trim()
  if (!/[A-Za-zÀ-ÿ]/.test(s)) return ''            // "." , "-" , "123"
  return s.replace(/^(sr|sra|srta|dr|dra)\.?\s+/i, '').trim()
}

/** `AAmmmDD` a partir de um `date` YYYY-MM-DD, sem passar por `Date` (ver nota de fuso acima). */
function prefixoData(data?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data || '')
  if (!m) return ''
  const [, ano, mes, dia] = m
  return `${ano.slice(-2)}${MESES[Number(mes) - 1] ?? mes}${dia}`
}

export function nomeParaAgenda(contrato: ContratoParaAgenda | null | undefined): string {
  if (!contrato) return ''
  const partes = [
    prefixoData(contrato.data_contrato),
    nomeDoContatoAtivo(contrato),
    contrato.tipo_plano === 'preventivo' ? 'PV' : 'EM',
    tituloNome(contrato.pet_nome || ''),
    contrato.tipo_cremacao === 'individual' ? 'IND' : contrato.tipo_cremacao === 'coletiva' ? 'COL' : '',
  ]
  return partes.filter(Boolean).join(' ')
}
