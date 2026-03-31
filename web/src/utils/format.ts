/**
 * Formatea un importe en millones de euros.
 * Los valores de la DB están en millones de €.
 *
 * Reglas de escala:
 *   ≥ 1.000.000 M€  → miles de millones de millones (no alcanzable)
 *   ≥ 1.000 M€      → miles de millones: "XXX.XXX M€"  (siempre M€, sin cambio de unidad)
 *
 * Se muestra siempre en M€ con separador de miles para facilitar la comparación
 * entre páginas. Para valores muy grandes (>= 1.000 M€) se añade separador de miles.
 */
export function formatEur(millon: number | null | undefined): string {
  if (millon == null || isNaN(millon)) return '—'
  const abs = Math.abs(millon)
  const sign = millon < 0 ? '−' : ''

  // Siempre en millones de €, con separador de miles y sin decimales
  return `${sign}${abs.toLocaleString('es-ES', { maximumFractionDigits: 0, useGrouping: true })} M€`
}

/**
 * Formatea un ratio como porcentaje con signo.
 * Ejemplo: 0.045 → "+4,5%"; -0.12 → "−12,0%"
 * Devuelve null si el cambio es trivial (< 0,1%) para evitar mostrar "+0,0%".
 */
export function formatPct(ratio: number | null | undefined): string | null {
  if (ratio == null || isNaN(ratio)) return null
  if (Math.abs(ratio) < 0.001) return null   // < 0,1% → no mostrar
  const sign = ratio >= 0 ? '+' : '−'
  return `${sign}${Math.abs(ratio * 100).toLocaleString('es-ES', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
}

/**
 * Formatea un número entero (p.ej. población).
 */
export function formatNum(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString('es-ES')
}
