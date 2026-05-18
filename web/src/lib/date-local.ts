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

// PROBLEMA: input <type="datetime-local"> espera "YYYY-MM-DDTHH:mm" no fuso LOCAL.
// `iso.slice(0,16)` corta os chars UTC e o input os interpreta como local → +3h em BRT.
// Use estes helpers pra ler/escrever no input sem deslocamento de fuso.

/** ISO UTC → "YYYY-MM-DDTHH:mm" (fuso local), pronto pra ser value de <input type="datetime-local">. */
export function isoParaInputLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "YYYY-MM-DDTHH:mm" (interpretado como local) → ISO UTC, pronto pra gravar em timestamptz. */
export function inputLocalParaIso(local: string | null | undefined): string | null {
  if (!local) return null
  const d = new Date(local)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}
