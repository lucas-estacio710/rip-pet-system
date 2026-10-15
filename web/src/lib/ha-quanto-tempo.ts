// HÁ QUANTO TEMPO (15/10/2026, Lucas): o "(Hoje)", "(Há 4 dias)", "(Há +1 semana)" ao lado da
// data do último movimento da conta. Arredonda pra baixo e põe o "+" quando passou da marca:
// 9 dias é "Há +1 semana", não "Há 1 semana" nem "Há 9 dias" — a leitura é "faz mais de".

/** Dias inteiros entre duas datas 'aaaa-mm-dd' (de → até). */
const dias = (de: string, ate: string) =>
  Math.round((Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10)) - Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))) / 86400000)

export function haQuantoTempo(data: string, hoje: string): string {
  const d = dias(data.slice(0, 10), hoje.slice(0, 10))
  if (d < 0) return 'Futuro'
  if (d === 0) return 'Hoje'
  if (d === 1) return 'Ontem'
  if (d < 7) return `Há ${d} dias`
  if (d < 30) { const s = Math.floor(d / 7); return `Há ${d % 7 ? '+' : ''}${s} semana${s > 1 ? 's' : ''}` }
  if (d < 365) { const m = Math.floor(d / 30); return `Há +${m} ${m > 1 ? 'meses' : 'mês'}` }
  const a = Math.floor(d / 365)
  return `Há +${a} ano${a > 1 ? 's' : ''}`
}
