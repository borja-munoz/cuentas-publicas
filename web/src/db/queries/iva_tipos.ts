import { query } from '../client'

export const IVA_TIPO_LABELS: Record<string, string> = {
  general:      'Tipo general (21%)',
  reducido:     'Tipo reducido (10%)',
  superreducido: 'Tipo superreducido (4%)',
}

export const IVA_TIPO_COLORS: Record<string, string> = {
  general:      '#326891',
  reducido:     '#5a9ab0',
  superreducido: '#e07b39',
}

export interface IvaTipo {
  year:            number
  tipo:            string
  base_imponible:  number
  cuota_devengada: number
}

export async function getIvaAnio(year: number): Promise<IvaTipo[]> {
  return query<IvaTipo>(`
    SELECT year, tipo,
           CAST(base_imponible  AS DOUBLE) AS base_imponible,
           CAST(cuota_devengada AS DOUBLE) AS cuota_devengada
    FROM cp.recaudacion_iva_tipo
    WHERE year = ${year}
    ORDER BY tipo
  `)
}

export async function getIvaHistorico(): Promise<IvaTipo[]> {
  return query<IvaTipo>(`
    SELECT year, tipo,
           CAST(base_imponible  AS DOUBLE) AS base_imponible,
           CAST(cuota_devengada AS DOUBLE) AS cuota_devengada
    FROM cp.recaudacion_iva_tipo
    ORDER BY year, tipo
  `)
}

export async function getIvaYears(): Promise<number[]> {
  const rows = await query<{ year: number }>(
    `SELECT DISTINCT year FROM cp.recaudacion_iva_tipo ORDER BY year`,
  )
  return rows.map((r) => r.year)
}
