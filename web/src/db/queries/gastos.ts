import { query } from '../client'

export interface GastosAnuales {
  year: number
  entidad: string
  capitulo: number
  importe: number
}

export interface TotalAnual {
  year: number
  total: number
}

const CAP_GASTOS: Record<number, string> = {
  1: 'Personal',
  2: 'Bienes y servicios',
  3: 'Gastos financieros',
  4: 'Transf. corrientes',
  6: 'Inversiones reales',
  7: 'Transf. capital',
  8: 'Activos financieros',
  9: 'Pasivos financieros',
}

export const CAPITULO_GASTOS = CAP_GASTOS

export const CAPITULO_GASTOS_TOOLTIP: Record<number, string> = {
  1: 'Retribuciones salariales y cotizaciones sociales de los empleados públicos del Estado.',
  2: 'Suministros, servicios externos, mantenimiento y funcionamiento de los organismos públicos.',
  3: 'Pago de intereses de la deuda pública emitida por el Estado.',
  4: 'Incluye pensiones (SS), transferencias a las CCAA, subvenciones a empresas y ayudas a familias. Es el mayor capítulo de gasto operacional.',
  5: 'Dotación al Fondo de Contingencia para atender necesidades imprevistas y no discrecionales.',
  6: 'Obras públicas, infraestructuras y adquisición de equipos e inmuebles.',
  7: 'Ayudas a CCAA, empresas públicas y fondos europeos para proyectos de inversión.',
  8: 'Préstamos concedidos y adquisición de acciones en empresas públicas.',
  9: 'Amortización (devolución del principal) de la deuda pública emitida en años anteriores.',
}

// Gastos por capítulo para un año y entidad dados (plan o ejecución)
// Nota: CAST a DOUBLE evita el bug de DuckDB WASM con DECIMAL(18,2) en toJSON()
export async function getGastosPorCapitulo(
  year: number,
  entidad: string,
  fuente: 'plan' | 'ejecucion',
): Promise<GastosAnuales[]> {
  if (fuente === 'plan') {
    return query<GastosAnuales>(`
      SELECT year, entidad, capitulo,
             CAST(SUM(importe) AS DOUBLE) AS importe
      FROM cp.gastos_plan
      WHERE year = ${year} AND entidad = '${entidad}' AND articulo IS NULL
      GROUP BY year, entidad, capitulo
      ORDER BY capitulo
    `)
  } else {
    return query<GastosAnuales>(`
      SELECT year, entidad, capitulo,
             CAST(SUM(obligaciones_reconocidas) / 1000.0 AS DOUBLE) AS importe
      FROM cp.gastos_ejecucion
      WHERE year = ${year} AND entidad = '${entidad}'
      GROUP BY year, entidad, capitulo
      ORDER BY capitulo
    `)
  }
}

// Serie histórica de gastos por capítulo (todos los años)
export async function getGastosHistoricoPorCapitulo(
  entidad: string,
  fuente: 'plan' | 'ejecucion',
): Promise<GastosAnuales[]> {
  if (fuente === 'plan') {
    return query<GastosAnuales>(`
      SELECT year, entidad, capitulo,
             CAST(SUM(importe) AS DOUBLE) AS importe
      FROM cp.gastos_plan
      WHERE entidad = '${entidad}' AND articulo IS NULL
      GROUP BY year, entidad, capitulo
      ORDER BY year, capitulo
    `)
  } else {
    return query<GastosAnuales>(`
      SELECT year, entidad, capitulo,
             CAST(SUM(obligaciones_reconocidas) / 1000.0 AS DOUBLE) AS importe
      FROM cp.gastos_ejecucion
      WHERE entidad = '${entidad}'
      GROUP BY year, entidad, capitulo
      ORDER BY year, capitulo
    `)
  }
}

// Total gastos por año (para serie histórica)
export async function getTotalGastosPorAnio(
  entidad: string,
  fuente: 'plan' | 'ejecucion',
): Promise<TotalAnual[]> {
  if (fuente === 'plan') {
    return query<TotalAnual>(`
      SELECT year, CAST(SUM(importe) AS DOUBLE) AS total
      FROM cp.gastos_plan
      WHERE entidad = '${entidad}' AND articulo IS NULL
        AND capitulo NOT IN (8, 9)
      GROUP BY year
      ORDER BY year
    `)
  } else {
    return query<TotalAnual>(`
      SELECT year, CAST(SUM(obligaciones_reconocidas) / 1000.0 AS DOUBLE) AS total
      FROM cp.gastos_ejecucion
      WHERE entidad = '${entidad}'
        AND capitulo NOT IN (8, 9)
      GROUP BY year
      ORDER BY year
    `)
  }
}

// Plan vs ejecución por capítulo para un año dado
export async function getComparativaPorCapitulo(
  year: number,
  entidad: string,
): Promise<{ capitulo: number; plan: number; ejecucion: number; desviacion: number }[]> {
  return query(`
    SELECT
      p.capitulo,
      CAST(p.importe AS DOUBLE)       AS plan,
      CAST(COALESCE(e.importe, 0) AS DOUBLE) AS ejecucion,
      CAST(COALESCE(e.importe, 0) - p.importe AS DOUBLE) AS desviacion
    FROM (
      SELECT capitulo, SUM(importe) AS importe
      FROM cp.gastos_plan
      WHERE year = ${year} AND entidad = '${entidad}' AND articulo IS NULL
      GROUP BY capitulo
    ) p
    LEFT JOIN (
      SELECT capitulo, SUM(obligaciones_reconocidas) / 1000.0 AS importe
      FROM cp.gastos_ejecucion
      WHERE year = ${year} AND entidad = '${entidad}'
      GROUP BY capitulo
    ) e ON p.capitulo = e.capitulo
    ORDER BY p.capitulo
  `)
}
