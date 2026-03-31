import { query } from '../client'

export interface RecaudacionRow {
  year: number
  impuesto: string
  importe_bruto: number
  devoluciones: number
  importe_neto: number
}

export interface RecaudacionAnual {
  year: number
  impuesto: string
  total: number
}

// Impuestos principales ordenados para las visualizaciones
export const IMPUESTOS_PRINCIPALES = ['IRPF', 'IVA', 'Sociedades', 'Especiales', 'Aduanas']

export const IMPUESTO_COLORS: Record<string, string> = {
  IRPF: '#326891',
  IVA: '#5a9ab0',
  Sociedades: '#e07b39',
  Especiales: '#2d6a4f',
  Aduanas: '#8b6e45',
  'No Residentes': '#999999',
  Otros: '#bbbbbb',
}

// Serie histórica de recaudación anual por impuesto (month=0 → total anual)
// Nota: CAST a DOUBLE evita el bug de DuckDB WASM con DECIMAL(18,2) en toJSON()
export async function getRecaudacionHistorica(): Promise<RecaudacionAnual[]> {
  return query<RecaudacionAnual>(`
    SELECT year, impuesto, CAST(SUM(importe_neto) AS DOUBLE) AS total
    FROM cp.recaudacion_aeat
    WHERE month = 0
    GROUP BY year, impuesto
    ORDER BY year, impuesto
  `)
}

// Detalle de un año: bruto, devoluciones, neto por impuesto
export async function getRecaudacionAnio(year: number): Promise<RecaudacionRow[]> {
  return query<RecaudacionRow>(`
    SELECT year, impuesto,
           CAST(SUM(importe_bruto) AS DOUBLE) AS importe_bruto,
           CAST(SUM(devoluciones) AS DOUBLE) AS devoluciones,
           CAST(SUM(importe_neto) AS DOUBLE) AS importe_neto
    FROM cp.recaudacion_aeat
    WHERE year = ${year} AND month = 0
    GROUP BY year, impuesto
    ORDER BY importe_neto DESC
  `)
}

// Años disponibles en recaudacion_aeat
export async function getAniosAeat(): Promise<number[]> {
  const rows = await query<{ year: number }>(`
    SELECT DISTINCT year FROM cp.recaudacion_aeat ORDER BY year
  `)
  return rows.map((r) => r.year)
}
