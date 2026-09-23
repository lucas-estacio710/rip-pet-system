// Nome com que o contrato é salvo na AGENDA do celular (o "nome de referência").
//
// Formato: `AAmmmDD PrimeiroNomeDoTutor EM|PV NomeDoPet [IND|COL]`
//   ex: "26set14 Daniana EM Biscoito COL"
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
  tutor?: { nome?: string | null } | null
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
    primeiroNome(contrato.tutor?.nome || contrato.tutor_nome),
    contrato.tipo_plano === 'preventivo' ? 'PV' : 'EM',
    tituloNome(contrato.pet_nome || ''),
    contrato.tipo_cremacao === 'individual' ? 'IND' : contrato.tipo_cremacao === 'coletiva' ? 'COL' : '',
  ]
  return partes.filter(Boolean).join(' ')
}
