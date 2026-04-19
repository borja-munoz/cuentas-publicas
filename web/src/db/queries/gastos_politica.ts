import { query } from '../client'

export interface GastoPolitica {
  year:         number
  politica_nom: string
  importe:      number
}

export async function getGastosPoliticaAnio(year: number): Promise<GastoPolitica[]> {
  return query<GastoPolitica>(`
    SELECT year, politica_nom,
           CAST(importe AS DOUBLE) AS importe
    FROM cp.gastos_politica
    WHERE year = ${year}
    ORDER BY importe DESC
  `)
}

export async function getGastosPoliticaHistorico(): Promise<GastoPolitica[]> {
  return query<GastoPolitica>(`
    SELECT year, politica_nom,
           CAST(importe AS DOUBLE) AS importe
    FROM cp.gastos_politica
    ORDER BY year, importe DESC
  `)
}

export async function getGastosPoliticaYears(): Promise<number[]> {
  const rows = await query<{ year: number }>(
    `SELECT DISTINCT year FROM cp.gastos_politica ORDER BY year`,
  )
  return rows.map((r) => r.year)
}
