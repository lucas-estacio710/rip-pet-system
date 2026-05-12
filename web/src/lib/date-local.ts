// Helpers de data respeitando fuso horário LOCAL (não UTC).
//
// PROBLEMA: `new Date().toISOString().slice(0, 10)` retorna em UTC. Em BRT (UTC-3),
// após ~21h da noite, a data vira o dia SEGUINTE no UTC — o que faz `hoje` ficar
// off-by-one em datepickers / valores default / filtros.
//
// SOLUÇÃO: usar getFullYear/getMonth/getDate (locais do navegador) e montar YYYY-MM-DD.

/** Data de hoje em formato YYYY-MM-DD (fuso local). */
export function hojeLocal(): string {
  return dataLocal(new Date())
}

/** Data arbitrária em formato YYYY-MM-DD (fuso local). */
export function dataLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
