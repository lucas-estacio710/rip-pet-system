// TRAVA DA DATA DO ACOLHIMENTO (14/10/2026, pedido do Lucas).
//
// O campo datetime-local aceita qualquer ano digitado, e 11 contratos nasceram com o ano
// errado (0006, 0026, 0206, 1726, 2027, 2029). Como o mês do acolhimento é a COMPETÊNCIA de
// tudo — repasse, custo de cremação, receita da Matriz, painéis —, o pet "de 0026" sumiu do
// repasse e caiu num ano absurdo nas duas DREs.
//
// Regra: o acolhimento NÃO pode ser de mais de 1 mês atrás, nem no futuro (tolerância de
// algumas horas pra relógio de aparelho). O `min`/`max` do input só ajuda o seletor — digitando,
// o navegador deixa passar —, então quem trava é a validação no salvar.
//
// Exceção: a correção de um contrato JÁ existente (EditarFichaModal, campo sensível) usa
// `{ semLimiteAtras: true }` — precisa poder acertar um ano errado de meses atrás.

const FOLGA_FUTURO_MS = 6 * 60 * 60 * 1000
const ANO_MINIMO = 2020

function umMesAntes(agora: Date): Date {
  const d = new Date(agora)
  d.setMonth(d.getMonth() - 1)
  return d
}

const fmt = (d: Date) => d.toLocaleDateString('pt-BR')

/** Mensagem de erro, ou null se a data serve. Vazio → null (obrigatoriedade é de quem chama). */
export function erroDataAcolhimento(
  valor: string | null | undefined,
  opts: { agora?: Date; semLimiteAtras?: boolean } = {},
): string | null {
  if (!valor) return null
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return 'Data do acolhimento inválida'
  const agora = opts.agora ?? new Date()
  if (d.getFullYear() < ANO_MINIMO) return `Data do acolhimento com ano ${d.getFullYear()} — confira o ano`
  if (d.getTime() > agora.getTime() + FOLGA_FUTURO_MS) return 'A data do acolhimento não pode ser no futuro — confira o ano'
  if (!opts.semLimiteAtras && d < umMesAntes(agora)) {
    return `O acolhimento não pode ser de mais de 1 mês atrás (antes de ${fmt(umMesAntes(agora))}) — confira o ano`
  }
  return null
}

/** `min`/`max` pro input datetime-local (formato local "AAAA-MM-DDTHH:mm"). */
export function limitesDataAcolhimento(agora: Date = new Date()): { min: string; max: string } {
  const p = (n: number) => String(n).padStart(2, '0')
  const loc = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
  const fimDoDia = new Date(agora); fimDoDia.setHours(23, 59, 0, 0)
  return { min: loc(umMesAntes(agora)), max: loc(fimDoDia) }
}
