import { query } from '../client'

export type DeudaRow = { year: number; importe: number }
export type DeudaSubsectorRow = { subsector: string; importe: number }

export async function getDeudaHistorica(subsector: string): Promise<DeudaRow[]> {
  return query<DeudaRow>(`
    SELECT year, CAST(importe AS DOUBLE) AS importe
    FROM cp.deuda_pde
    WHERE subsector = '${subsector}'
    ORDER BY year
  `)
}

export async function getDeudaAnual(year: number): Promise<DeudaSubsectorRow[]> {
  return query<DeudaSubsectorRow>(`
    SELECT subsector, CAST(importe AS DOUBLE) AS importe
    FROM cp.deuda_pde
    WHERE year = ${year}
    ORDER BY subsector
  `)
}

export async function getDeudaYears(): Promise<number[]> {
  const rows = await query<{ year: number }>(`
    SELECT DISTINCT year FROM cp.deuda_pde ORDER BY year
  `)
  return rows.map((r) => r.year)
}
