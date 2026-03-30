/**
 * Formatea un importe en millones de euros con abreviatura adaptativa.
 * Los valores de la DB están en millones de €.
 */
export function formatEur(millon: number | null | undefined): string {
  if (millon == null || isNaN(millon)) return '—'
  const abs = Math.abs(millon)
  const sign = millon < 0 ? '−' : ''
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} B€`
  }
  return `${sign}${abs.toLocaleString('es-ES', { maximumFractionDigits: 0 })} M€`
}

/**
 * Formatea un ratio como porcentaje con signo.
 * Ejemplo: 0.045 → "+4,5%"; -0.12 → "−12,0%"
 */
export function formatPct(ratio: number | null | undefined): string {
  if (ratio == null || isNaN(ratio)) return '—'
  const sign = ratio >= 0 ? '+' : '−'
  return `${sign}${Math.abs(ratio * 100).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

/**
 * Formatea un número entero (p.ej. población).
 */
export function formatNum(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString('es-ES')
}
