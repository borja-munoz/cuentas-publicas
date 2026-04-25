import { query } from '../client'

export type DeudaRow = { year: number; importe: number }
export type DeudaSubsectorRow = { subsector: string; importe: number }
export type DeudaDetalleRow = { year: number; codigo: string; nombre: string; importe: number }

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

export async function getDeudaInstrumentoHistorico(subsector: string): Promise<DeudaDetalleRow[]> {
  return query<DeudaDetalleRow>(`
    SELECT year,
           instrumento    AS codigo,
           instrumento_nom AS nombre,
           CAST(importe AS DOUBLE) AS importe
    FROM cp.deuda_instrumento
    WHERE subsector = '${subsector}'
    ORDER BY year, instrumento
  `)
}

export async function getDeudaVencimientoHistorico(subsector: string): Promise<DeudaDetalleRow[]> {
  return query<DeudaDetalleRow>(`
    SELECT year,
           vencimiento    AS codigo,
           vencimiento_nom AS nombre,
           CAST(importe AS DOUBLE) AS importe
    FROM cp.deuda_vencimiento
    WHERE subsector = '${subsector}'
    ORDER BY year, vencimiento
  `)
}

export async function getDeudaTenedoresHistorico(subsector: string): Promise<DeudaDetalleRow[]> {
  return query<DeudaDetalleRow>(`
    SELECT year,
           tenedor    AS codigo,
           tenedor_nom AS nombre,
           CAST(importe AS DOUBLE) AS importe
    FROM cp.deuda_tenedores
    WHERE subsector = '${subsector}'
    ORDER BY year, tenedor
  `)
}

// Orden canónico de vencimientos (corto → largo)
export const VENCIMIENTO_ORDER = ['Y_LE1', 'Y1-5', 'Y5-10', 'Y10-30', 'Y_GT30']

export const VENCIMIENTO_COLORS: Record<string, string> = {
  'Y_LE1':  '#B82A2A',
  'Y1-5':   '#C89B3C',
  'Y5-10':  '#2E6B9E',
  'Y10-30': '#1F7A3D',
  'Y_GT30': '#7B5EA7',
}

export const INSTRUMENTO_COLORS: Record<string, string> = {
  'GD_F4': '#B82A2A',  // Bonos/Obligaciones
  'GD_F3': '#C89B3C',  // Letras
  'F4':    '#2E6B9E',  // Préstamos
  'GD_F2': '#1F7A3D',  // Depósitos
}

export const TENEDOR_COLORS: Record<string, string> = {
  'S2':       '#B82A2A',  // No residentes
  'S121':     '#C89B3C',  // BCE/BdE
  'S122_S123':'#2E6B9E',  // Otros bancos
  'S14_S15':  '#1F7A3D',  // Hogares
  'S1':       '#7B5EA7',  // Residentes total
}
