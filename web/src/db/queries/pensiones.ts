import { query } from '../client'

export const PENSION_TIPO_LABELS: Record<string, string> = {
  jubilacion:    'Jubilación',
  incapacidad:   'Incapacidad permanente',
  viudedad:      'Viudedad',
  orfandad:      'Orfandad',
  favor_familiar: 'Favor familiar',
}

export const PENSION_TIPO_COLORS: Record<string, string> = {
  jubilacion:    '#326891',
  incapacidad:   '#e07b39',
  viudedad:      '#5a9ab0',
  orfandad:      '#2d6a4f',
  favor_familiar: '#8b6e45',
}

export interface PensionAnual {
  year:          number
  tipo:          string
  num_pensiones: number
  importe_total: number
  pension_media: number
}

export async function getPensionesAnio(year: number): Promise<PensionAnual[]> {
  return query<PensionAnual>(`
    SELECT year, tipo, num_pensiones,
           CAST(importe_total AS DOUBLE) AS importe_total,
           CAST(pension_media AS DOUBLE) AS pension_media
    FROM cp.pensiones_ss
    WHERE year = ${year}
    ORDER BY importe_total DESC
  `)
}

export async function getPensionesHistorico(tipo: string): Promise<PensionAnual[]> {
  return query<PensionAnual>(`
    SELECT year, tipo, num_pensiones,
           CAST(importe_total AS DOUBLE) AS importe_total,
           CAST(pension_media AS DOUBLE) AS pension_media
    FROM cp.pensiones_ss
    WHERE tipo = '${tipo}'
    ORDER BY year
  `)
}

export async function getPensionesHistoricoAll(): Promise<PensionAnual[]> {
  return query<PensionAnual>(`
    SELECT year, tipo, num_pensiones,
           CAST(importe_total AS DOUBLE) AS importe_total,
           CAST(pension_media AS DOUBLE) AS pension_media
    FROM cp.pensiones_ss
    ORDER BY year, tipo
  `)
}

export async function getPensionesYears(): Promise<number[]> {
  const rows = await query<{ year: number }>(
    `SELECT DISTINCT year FROM cp.pensiones_ss ORDER BY year`,
  )
  return rows.map((r) => r.year)
}
