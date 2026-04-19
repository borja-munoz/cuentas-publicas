import { query } from '../client'

export const COFOG_NAMES: Record<string, string> = {
  GF01: 'Servicios generales',
  GF02: 'Defensa',
  GF03: 'Orden público',
  GF04: 'Asuntos económicos',
  GF05: 'Medio ambiente',
  GF06: 'Vivienda',
  GF07: 'Salud',
  GF08: 'Ocio y cultura',
  GF09: 'Educación',
  GF10: 'Protección social',
}

export const COFOG_COLORS: Record<string, string> = {
  GF01: '#999999',
  GF02: '#B82A2A',
  GF03: '#C89B3C',
  GF04: '#5C6F7E',
  GF05: '#7E9E8B',
  GF06: '#4A7A8B',
  GF07: '#8B6B7A',
  GF08: '#9A6B3C',
  GF09: '#6b7280',
  GF10: '#7a1a1a',
}

export const SECTOR_NAMES: Record<string, string> = {
  S13:   'AAPP (total)',
  S1311: 'Administración Central',
  S1312: 'Comunidades Autónomas',
  S1313: 'Administración Local',
  S1314: 'Seguridad Social',
}

export interface GastoFuncion {
  year:      number
  sector:    string
  cofog_cod: string
  cofog_nom: string
  importe:   number
}

export async function getGastoFuncionAnio(
  year: number,
  sector = 'S13',
): Promise<GastoFuncion[]> {
  return query<GastoFuncion>(`
    SELECT year, sector, cofog_cod, cofog_nom,
           CAST(importe AS DOUBLE) AS importe
    FROM cp.gastos_funcion
    WHERE year = ${year} AND sector = '${sector}'
    ORDER BY cofog_cod
  `)
}

export async function getGastoFuncionHistorico(
  cofog_cod: string,
  sector = 'S13',
): Promise<GastoFuncion[]> {
  return query<GastoFuncion>(`
    SELECT year, sector, cofog_cod, cofog_nom,
           CAST(importe AS DOUBLE) AS importe
    FROM cp.gastos_funcion
    WHERE cofog_cod = '${cofog_cod}' AND sector = '${sector}'
    ORDER BY year
  `)
}

export async function getCofogYears(): Promise<number[]> {
  const rows = await query<{ year: number }>(
    `SELECT DISTINCT year FROM cp.gastos_funcion ORDER BY year`,
  )
  return rows.map((r) => r.year)
}

export interface GastoFuncionSerie {
  year:     number
  cofog_cod: string
  importe:  number
}

export async function getGastoFuncionSeries(sector = 'S13'): Promise<GastoFuncionSerie[]> {
  return query<GastoFuncionSerie>(`
    SELECT year, cofog_cod,
           CAST(importe AS DOUBLE) AS importe
    FROM cp.gastos_funcion
    WHERE sector = '${sector}'
    ORDER BY year, cofog_cod
  `)
}
