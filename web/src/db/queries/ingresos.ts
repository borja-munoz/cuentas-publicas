import { query } from '../client'

export interface IngresosAnuales {
  year: number
  entidad: string
  capitulo: number
  importe: number
}

export interface TotalAnual {
  year: number
  total: number
}

const CAP_INGRESOS: Record<number, string> = {
  1: 'Imp. directos',
  2: 'Imp. indirectos',
  3: 'Tasas y otros',
  4: 'Transf. corrientes',
  5: 'Ingresos patrimoniales',
  6: 'Enajenación activos',
  7: 'Transf. capital',
  8: 'Activos financieros',
  9: 'Pasivos financieros',
}

export const CAPITULO_INGRESOS = CAP_INGRESOS

export const CAPITULO_INGRESOS_TOOLTIP: Record<number, string> = {
  1: 'Gravan la renta y el patrimonio: IRPF (personas físicas) e Impuesto sobre Sociedades. La AEAT recauda el total; el Estado retiene ~50% tras la cesión a las CCAA.',
  2: 'Gravan el consumo independientemente de la renta: IVA e Impuestos Especiales (hidrocarburos, tabaco, alcohol). El Estado retiene ~50% tras la distribución territorial.',
  3: 'Pagos por servicios públicos concretos: tasas judiciales, consulares, precios públicos y otros ingresos no tributarios.',
  4: 'Recursos recibidos de otras administraciones o de la UE para financiar gastos corrientes del Estado.',
  5: 'Rendimientos del patrimonio del Estado: dividendos de empresas públicas, intereses y alquileres.',
  6: 'Ingresos por venta de bienes inmuebles u otros activos reales del Estado.',
  7: 'Transferencias de fondos europeos u otras administraciones para financiar inversiones.',
  8: 'Devolución de préstamos concedidos e ingresos por venta de acciones y participaciones.',
  9: 'Emisión de deuda pública (Letras, Bonos y Obligaciones del Tesoro). Financia el déficit presupuestario.',
}

// Ingresos por capítulo para un año y entidad dados (plan o ejecución)
// Nota: CAST a DOUBLE evita el bug de DuckDB WASM con DECIMAL(18,2) en toJSON()
export async function getIngresosPorCapitulo(
  year: number,
  entidad: string,
  fuente: 'plan' | 'ejecucion',
): Promise<IngresosAnuales[]> {
  if (fuente === 'plan') {
    return query<IngresosAnuales>(`
      SELECT year, entidad, capitulo,
             CAST(SUM(importe) AS DOUBLE) AS importe
      FROM cp.ingresos_plan
      WHERE year = ${year} AND entidad = '${entidad}' AND articulo IS NULL
      GROUP BY year, entidad, capitulo
      ORDER BY capitulo
    `)
  } else {
    return query<IngresosAnuales>(`
      SELECT year, entidad, capitulo,
             CAST(SUM(recaudacion_neta) / 1000.0 AS DOUBLE) AS importe
      FROM cp.ingresos_ejecucion
      WHERE year = ${year} AND entidad = '${entidad}' AND articulo IS NULL
      GROUP BY year, entidad, capitulo
      ORDER BY capitulo
    `)
  }
}

// Total ingresos por año (serie histórica) para una entidad y fuente
export async function getTotalIngresosPorAnio(
  entidad: string,
  fuente: 'plan' | 'ejecucion',
): Promise<TotalAnual[]> {
  if (fuente === 'plan') {
    return query<TotalAnual>(`
      SELECT year, CAST(SUM(importe) AS DOUBLE) AS total
      FROM cp.ingresos_plan
      WHERE entidad = '${entidad}' AND articulo IS NULL
        AND capitulo NOT IN (8, 9)
      GROUP BY year
      ORDER BY year
    `)
  } else {
    return query<TotalAnual>(`
      SELECT year, CAST(SUM(recaudacion_neta) / 1000.0 AS DOUBLE) AS total
      FROM cp.ingresos_ejecucion
      WHERE entidad = '${entidad}' AND articulo IS NULL
        AND capitulo NOT IN (8, 9)
      GROUP BY year
      ORDER BY year
    `)
  }
}

// Total ingresos y gastos por año (para dashboard histórico)
export async function getResumenAnual(entidad: string): Promise<
  { year: number; ingresos_plan: number; gastos_plan: number }[]
> {
  return query(`
    SELECT
      i.year,
      CAST(i.importe AS DOUBLE) AS ingresos_plan,
      CAST(g.importe AS DOUBLE) AS gastos_plan
    FROM (
      SELECT year, SUM(importe) AS importe
      FROM cp.ingresos_plan
      WHERE entidad = '${entidad}' AND articulo IS NULL AND capitulo NOT IN (8, 9)
      GROUP BY year
    ) i
    JOIN (
      SELECT year, SUM(importe) AS importe
      FROM cp.gastos_plan
      WHERE entidad = '${entidad}' AND articulo IS NULL AND capitulo NOT IN (8, 9)
      GROUP BY year
    ) g ON i.year = g.year
    ORDER BY i.year
  `)
}
