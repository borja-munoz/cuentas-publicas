import { query } from '../client'

export type Subsector = 'S13' | 'S1311' | 'S1312' | 'S1313' | 'S1314'

export const SUBSECTOR_NAMES: Record<Subsector, string> = {
  S13:   'Administraciones Públicas',
  S1311: 'Administración Central (Estado)',
  S1312: 'Administración Regional (CCAA)',
  S1313: 'Administración Local (CCLL)',
  S1314: 'Seguridad Social',
}

export const SUBSECTOR_NAMES_SHORT: Record<Subsector, string> = {
  S13:   'AAPP',
  S1311: 'Estado',
  S1312: 'CCAA',
  S1313: 'CCLL',
  S1314: 'SS',
}

export const CONCEPTO_INGRESOS_LABELS: Record<string, string> = {
  total:                    'Total ingresos',
  impuestos_produccion:     'Impuestos sobre producción e importación',
  impuestos_renta:          'Impuestos sobre renta y patrimonio',
  cotizaciones:             'Cotizaciones sociales',
  rentas_propiedad:         'Rentas de la propiedad',
  transferencias_corrientes: 'Transferencias corrientes recibidas',
  transferencias_capital:   'Transferencias de capital recibidas',
}

export const CONCEPTO_GASTOS_LABELS: Record<string, string> = {
  total:                    'Total gastos',
  remuneracion_empleados:   'Remuneración de empleados',
  consumos_intermedios:     'Consumos intermedios',
  subvenciones:             'Subvenciones',
  intereses:                'Intereses',
  prestaciones_sociales:    'Prestaciones sociales',
  transferencias_corrientes: 'Transferencias corrientes',
  transferencias_capital:   'Transferencias de capital',
  fbcf:                     'Formación bruta de capital fijo',
  saldo:                    'Saldo (capac./nec. financiación)',
}

// Conceptos a mostrar en barras (excluir total y saldo)
export const CONCEPTOS_INGRESOS_BARRA = [
  'impuestos_produccion',
  'impuestos_renta',
  'cotizaciones',
  'rentas_propiedad',
  'transferencias_corrientes',
  'transferencias_capital',
] as const

export const CONCEPTOS_GASTOS_BARRA = [
  'remuneracion_empleados',
  'consumos_intermedios',
  'subvenciones',
  'intereses',
  'prestaciones_sociales',
  'transferencias_corrientes',
  'transferencias_capital',
  'fbcf',
] as const

export const CONCEPTO_INGRESOS_COLORS: Record<string, string> = {
  impuestos_produccion:     '#B82A2A',
  impuestos_renta:          '#7a1a1a',
  cotizaciones:             '#C89B3C',
  rentas_propiedad:         '#5C6F7E',
  transferencias_corrientes: '#7E9E8B',
  transferencias_capital:   '#8B6B7A',
}

export const CONCEPTO_GASTOS_COLORS: Record<string, string> = {
  remuneracion_empleados:   '#7a1a1a',
  consumos_intermedios:     '#B82A2A',
  subvenciones:             '#C89B3C',
  intereses:                '#374151',
  prestaciones_sociales:    '#5C6F7E',
  transferencias_corrientes: '#7E9E8B',
  transferencias_capital:   '#8B6B7A',
  fbcf:                     '#a16207',
}

export interface AappConcepto {
  year: number
  subsector: string
  concepto: string
  concepto_nom: string
  importe: number
}

export interface AappResumen {
  year: number
  ingresos: number
  gastos: number
  saldo: number
}

export interface PibAnual {
  year: number
  pib: number
}

export async function getAappYears(): Promise<number[]> {
  const rows = await query<{ year: number }>(
    `SELECT DISTINCT year FROM cp.aapp_ingresos WHERE subsector = 'S13' ORDER BY year`,
  )
  return rows.map((r) => r.year)
}

export async function getAappIngresos(year: number, subsector: Subsector): Promise<AappConcepto[]> {
  return query<AappConcepto>(`
    SELECT year, subsector, concepto, concepto_nom,
           CAST(importe AS DOUBLE) AS importe
    FROM cp.aapp_ingresos
    WHERE year = ${year} AND subsector = '${subsector}'
      AND concepto <> 'total'
    ORDER BY importe DESC
  `)
}

export async function getAappGastos(year: number, subsector: Subsector): Promise<AappConcepto[]> {
  return query<AappConcepto>(`
    SELECT year, subsector, concepto, concepto_nom,
           CAST(importe AS DOUBLE) AS importe
    FROM cp.aapp_gastos
    WHERE year = ${year} AND subsector = '${subsector}'
      AND concepto NOT IN ('total', 'saldo')
    ORDER BY importe DESC
  `)
}

export async function getAappIngresosHistorico(subsector: Subsector): Promise<AappConcepto[]> {
  return query<AappConcepto>(`
    SELECT year, subsector, concepto, concepto_nom,
           CAST(importe AS DOUBLE) AS importe
    FROM cp.aapp_ingresos
    WHERE subsector = '${subsector}' AND concepto <> 'total'
    ORDER BY year, concepto
  `)
}

export async function getAappGastosHistorico(subsector: Subsector): Promise<AappConcepto[]> {
  return query<AappConcepto>(`
    SELECT year, subsector, concepto, concepto_nom,
           CAST(importe AS DOUBLE) AS importe
    FROM cp.aapp_gastos
    WHERE subsector = '${subsector}' AND concepto NOT IN ('total', 'saldo')
    ORDER BY year, concepto
  `)
}

export async function getAappResumen(subsector: Subsector): Promise<AappResumen[]> {
  return query<AappResumen>(`
    SELECT i.year,
           CAST(i.importe AS DOUBLE) AS ingresos,
           CAST(g.importe AS DOUBLE) AS gastos,
           CAST(s.importe AS DOUBLE) AS saldo
    FROM cp.aapp_ingresos i
    JOIN cp.aapp_gastos g
      ON i.year = g.year AND i.subsector = g.subsector AND g.concepto = 'total'
    JOIN cp.aapp_gastos s
      ON i.year = s.year AND i.subsector = s.subsector AND s.concepto = 'saldo'
    WHERE i.subsector = '${subsector}' AND i.concepto = 'total'
    ORDER BY i.year
  `)
}

export async function getPibAnual(): Promise<PibAnual[]> {
  return query<PibAnual>(`
    SELECT year, CAST(pib AS DOUBLE) AS pib
    FROM cp.pib_anual
    ORDER BY year
  `)
}
