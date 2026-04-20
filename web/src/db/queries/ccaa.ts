import { query } from '../client'

// Nota: las tablas ccaa_* almacenan importes en miles de euros (K€).
// Se dividen entre 1000 para obtener M€ y ser consistentes con el resto de queries.

export interface TransferenciasCcaa {
  ccaa_cod: string
  ccaa_nom: string
  total: number
  corriente: number
  capital: number
}

export async function getTransferenciasPorCcaa(
  year: number,
  fuente: 'plan' | 'ejecucion',
): Promise<TransferenciasCcaa[]> {
  return query<TransferenciasCcaa>(`
    SELECT ccaa_cod, ccaa_nom,
           CAST(SUM(importe) / 1000.0 AS DOUBLE) AS total,
           CAST(SUM(CASE WHEN tipo = 'corriente' THEN importe ELSE 0 END) / 1000.0 AS DOUBLE) AS corriente,
           CAST(SUM(CASE WHEN tipo = 'capital'   THEN importe ELSE 0 END) / 1000.0 AS DOUBLE) AS capital
    FROM cp.transferencias_ccaa
    WHERE year = ${year} AND fuente = '${fuente}'
    GROUP BY ccaa_cod, ccaa_nom
    ORDER BY total DESC
  `)
}

export interface TransferenciasSerie {
  year: number
  total: number
  corriente: number
  capital: number
}

export async function getTransferenciasSerie(
  ccaaCod: string,
  fuente: 'plan' | 'ejecucion',
): Promise<TransferenciasSerie[]> {
  return query<TransferenciasSerie>(`
    SELECT year,
           CAST(SUM(importe) / 1000.0 AS DOUBLE) AS total,
           CAST(SUM(CASE WHEN tipo = 'corriente' THEN importe ELSE 0 END) / 1000.0 AS DOUBLE) AS corriente,
           CAST(SUM(CASE WHEN tipo = 'capital'   THEN importe ELSE 0 END) / 1000.0 AS DOUBLE) AS capital
    FROM cp.transferencias_ccaa
    WHERE ccaa_cod = '${ccaaCod}' AND fuente = '${fuente}'
    GROUP BY year
    ORDER BY year
  `)
}

export interface CcaaResumen {
  ccaa_cod: string
  ccaa_nom: string
  gastos_plan: number
  gastos_ejec: number
  ingresos_plan: number
  ingresos_ejec: number
}

export async function getCcaaResumen(year: number): Promise<CcaaResumen[]> {
  return query<CcaaResumen>(`
    SELECT ccaa_cod, ccaa_nom,
           CAST(gastos_plan   / 1000.0 AS DOUBLE) AS gastos_plan,
           CAST(gastos_ejec   / 1000.0 AS DOUBLE) AS gastos_ejec,
           CAST(ingresos_plan / 1000.0 AS DOUBLE) AS ingresos_plan,
           CAST(ingresos_ejec / 1000.0 AS DOUBLE) AS ingresos_ejec
    FROM cp.v_ccaa_resumen
    WHERE year = ${year}
    ORDER BY ccaa_cod
  `)
}

export interface CcaaCapitulo {
  capitulo: number
  descripcion: string
  fuente: string
  importe: number
}

export async function getCcaaGastosPorCapitulo(
  ccaaCod: string,
  year: number,
): Promise<CcaaCapitulo[]> {
  return query<CcaaCapitulo>(`
    SELECT capitulo, descripcion, fuente,
           CAST(importe / 1000.0 AS DOUBLE) AS importe
    FROM cp.ccaa_gastos
    WHERE ccaa_cod = '${ccaaCod}' AND year = ${year}
    ORDER BY capitulo, fuente
  `)
}

export interface CcaaIngresosCapitulo {
  capitulo: number
  descripcion: string
  fuente: string
  importe: number
}

export async function getCcaaIngresosPorCapitulo(
  ccaaCod: string,
  year: number,
): Promise<CcaaIngresosCapitulo[]> {
  return query<CcaaIngresosCapitulo>(`
    SELECT capitulo, descripcion, fuente,
           CAST(importe / 1000.0 AS DOUBLE) AS importe
    FROM cp.ccaa_ingresos
    WHERE ccaa_cod = '${ccaaCod}' AND year = ${year}
    ORDER BY capitulo, fuente
  `)
}

export interface CcaaIngresosResumen {
  ccaa_cod: string
  ccaa_nom: string
  total: number
  impuestos: number       // caps 1+2 (tributos cedidos)
  transferencias: number  // caps 4+7 (financiación autonómica + fondos)
  propios: number         // caps 3+5 (tasas, patrimoniales)
}

export async function getCcaaIngresosResumen(
  year: number,
  fuente: 'plan' | 'ejecucion',
): Promise<CcaaIngresosResumen[]> {
  return query<CcaaIngresosResumen>(`
    SELECT i.ccaa_cod, r.ccaa_nom,
           CAST(SUM(i.importe) / 1000.0 AS DOUBLE) AS total,
           CAST(SUM(CASE WHEN i.capitulo IN (1, 2) THEN i.importe ELSE 0 END) / 1000.0 AS DOUBLE) AS impuestos,
           CAST(SUM(CASE WHEN i.capitulo IN (4, 7) THEN i.importe ELSE 0 END) / 1000.0 AS DOUBLE) AS transferencias,
           CAST(SUM(CASE WHEN i.capitulo IN (3, 5) THEN i.importe ELSE 0 END) / 1000.0 AS DOUBLE) AS propios
    FROM cp.ccaa_ingresos i
    JOIN cp.ccaa_ref r USING (ccaa_cod)
    WHERE i.year = ${year} AND i.fuente = '${fuente}'
      AND i.capitulo NOT IN (8, 9)
    GROUP BY i.ccaa_cod, r.ccaa_nom
    ORDER BY total DESC
  `)
}

export interface CcaaCapituloNacional {
  capitulo: number
  descripcion: string
  importe: number
}

export async function getCcaaIngresosPorCapituloNacional(
  year: number,
  fuente: 'plan' | 'ejecucion',
): Promise<CcaaCapituloNacional[]> {
  return query<CcaaCapituloNacional>(`
    SELECT capitulo,
           MAX(descripcion) AS descripcion,
           CAST(SUM(importe) / 1000.0 AS DOUBLE) AS importe
    FROM cp.ccaa_ingresos
    WHERE year = ${year} AND fuente = '${fuente}'
      AND capitulo NOT IN (8, 9)
    GROUP BY capitulo
    ORDER BY capitulo
  `)
}

// Años disponibles en las tablas CCAA
export async function getCcaaYears(): Promise<number[]> {
  const rows = await query<{ year: number }>(
    `SELECT DISTINCT year FROM cp.ccaa_gastos ORDER BY year`,
  )
  return rows.map((r) => r.year)
}
