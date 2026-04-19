import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/layout/PageHeader'
import ContextBox from '../../components/ui/ContextBox'
import InsightsPanel from '../../components/ui/InsightsPanel'
import BarChart from '../../components/charts/BarChart'
import LineChart from '../../components/charts/LineChart'
import { ChartSkeleton } from '../../components/ui/LoadingSkeleton'
import { formatEur } from '../../utils/format'
import type { Insight } from '../../utils/insights'
import {
  getIvaYears,
  getIvaAnio,
  getIvaHistorico,
  IVA_TIPO_LABELS,
  IVA_TIPO_COLORS,
  type IvaTipo,
} from '../../db/queries/iva_tipos'

const TIPOS_ORDEN = ['general', 'reducido', 'superreducido'] as const

export default function IvaTipos() {
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)

  const [rows, setRows] = useState<IvaTipo[]>([])
  const [historico, setHistorico] = useState<IvaTipo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingHistorico, setLoadingHistorico] = useState(true)

  useEffect(() => {
    getIvaYears()
      .then((ys) => {
        setAvailableYears(ys)
        setSelectedYear(ys.length > 0 ? Math.max(...ys) : null)
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (selectedYear == null) return
    setLoading(true)
    getIvaAnio(selectedYear)
      .then(setRows)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedYear])

  useEffect(() => {
    setLoadingHistorico(true)
    getIvaHistorico()
      .then(setHistorico)
      .catch(console.error)
      .finally(() => setLoadingHistorico(false))
  }, [])

  const yearsInSeries = useMemo(
    () => [...new Set(historico.map((r) => r.year))].sort(),
    [historico],
  )

  // Gráfico de barras: base imponible por tipo (año seleccionado)
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => TIPOS_ORDEN.indexOf(a.tipo as typeof TIPOS_ORDEN[number]) - TIPOS_ORDEN.indexOf(b.tipo as typeof TIPOS_ORDEN[number])),
    [rows],
  )
  const barCats = sortedRows.map((r) => IVA_TIPO_LABELS[r.tipo] ?? r.tipo)
  const barBaseData = sortedRows.map((r) => r.base_imponible)
  const barCuotaData = sortedRows.map((r) => r.cuota_devengada)
  const barColors = sortedRows.map((r) => IVA_TIPO_COLORS[r.tipo] ?? '#999')

  // Series históricas: cuota devengada por tipo
  const lineSeriesCuota = useMemo(
    () =>
      TIPOS_ORDEN.map((tipo) => ({
        name: IVA_TIPO_LABELS[tipo] ?? tipo,
        data: yearsInSeries.map(
          (y) => historico.find((r) => r.year === y && r.tipo === tipo)?.cuota_devengada ?? null,
        ),
        color: IVA_TIPO_COLORS[tipo],
      })),
    [historico, yearsInSeries],
  )

  // Insights
  const totalCuota = rows.reduce((s, r) => s + r.cuota_devengada, 0)
  const totalBase = rows.reduce((s, r) => s + r.base_imponible, 0)
  const general = rows.find((r) => r.tipo === 'general')
  const reducido = rows.find((r) => r.tipo === 'reducido')
  const superreducido = rows.find((r) => r.tipo === 'superreducido')
  const tipoEfectivo = totalBase > 0 ? (totalCuota / totalBase) * 100 : null

  const insights: Insight[] = loading || rows.length === 0 ? [] : [
    ...(tipoEfectivo != null ? [{
      label: 'Tipo efectivo medio IVA',
      value: `${tipoEfectivo.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`,
      trend: 'neutral' as const,
      description: `El tipo efectivo global del IVA en ${selectedYear} es del ${tipoEfectivo.toFixed(1)}%, resultado de aplicar el 21%, 10% y 4% a distintas bases imponibles. Es inferior al tipo general del 21% porque una parte significativa del consumo tributa a tipos reducidos.`,
    }] : []),
    ...(general && reducido ? [{
      label: 'Base a tipo general vs reducido',
      value: general.base_imponible > 0 && reducido.base_imponible > 0
        ? `${((general.base_imponible / totalBase) * 100).toFixed(0)}% / ${((reducido.base_imponible / totalBase) * 100).toFixed(0)}%`
        : '—',
      trend: 'neutral' as const,
      description: `En ${selectedYear}, el ${((general.base_imponible / totalBase) * 100).toFixed(1)}% de la base imponible tributa al 21% (tipo general) y el ${((reducido.base_imponible / totalBase) * 100).toFixed(1)}% al 10% (tipo reducido). El tipo superreducido (4%) aplica a bienes de primera necesidad como alimentos básicos, medicamentos y libros.`,
    }] : []),
    {
      label: 'Cuota devengada total IVA',
      value: formatEur(totalCuota),
      trendValue: `${selectedYear ?? ''}`,
      trend: 'neutral' as const,
      description: `Suma de la cuota devengada en los tres tipos impositivos del IVA en ${selectedYear}. El IVA es un impuesto sobre el consumo que recae sobre el valor añadido en cada fase de la cadena productiva. Fuente: AEAT Modelo 390.`,
    },
    ...(superreducido ? [{
      label: 'Tipo superreducido (4%)',
      value: formatEur(superreducido.cuota_devengada),
      trendValue: `${totalCuota > 0 ? ((superreducido.cuota_devengada / totalCuota) * 100).toFixed(1) : '—'}% del total`,
      trend: 'neutral' as const,
      description: `El tipo superreducido del 4% se aplica a bienes esenciales: pan, leche, huevos, frutas y verduras frescas, medicamentos, libros, periódicos y sillas de ruedas. Su finalidad es reducir la carga fiscal sobre los hogares de menor renta.`,
    }] : []),
  ]

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-xs text-[var(--color-ink-muted)]">
        <Link to="/ingresos/impuestos" className="hover:text-[var(--color-accent)]">
          ← Impuestos AEAT
        </Link>
      </div>

      <PageHeader
        title="IVA por tipo impositivo"
        subtitle={`AEAT Modelo 390 · ${selectedYear ?? ''}`}
        actions={
          <select
            value={selectedYear ?? ''}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            disabled={availableYears.length === 0}
            className="rounded border border-[var(--color-rule)] bg-white px-2 py-1.5 text-sm text-[var(--color-ink)] focus:outline-none"
          >
            {[...availableYears].sort((a, b) => b - a).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        }
      />

      <ContextBox title="Los tres tipos del IVA">
        <p>
          El <strong>Impuesto sobre el Valor Añadido (IVA)</strong> en España opera con tres tipos
          impositivos diferenciados según la naturaleza del bien o servicio:{' '}
          <strong>general (21%)</strong>, aplicable a la mayoría de bienes y servicios;{' '}
          <strong>reducido (10%)</strong>, para transporte, hostelería, vivienda nueva y algunos
          alimentos; y <strong>superreducido (4%)</strong>, para bienes de primera necesidad como
          alimentos básicos, medicamentos, libros y material escolar.
        </p>
        <p>
          Los datos proceden del <strong>Modelo 390</strong> (declaración anual del IVA) publicado
          por la AEAT. Incluyen la <em>base imponible</em> (valor sobre el que se aplica el tipo) y
          la <em>cuota devengada</em> (impuesto generado antes de deducciones). Los importes son
          agregados nacionales en millones de euros.
        </p>
      </ContextBox>

      <InsightsPanel insights={insights} isLoading={loading} />

      {/* Barras: base imponible y cuota devengada por tipo */}
      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
          Base imponible y cuota devengada por tipo · {selectedYear ?? '—'}
        </h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">
          Millones de euros. Régimen general (Modelo 390).
        </p>
        {loading ? (
          <ChartSkeleton height={260} />
        ) : rows.length > 0 ? (
          <BarChart
            categories={barCats}
            series={[
              { name: 'Base imponible', data: barBaseData, color: '#94a3b8' },
              {
                name: 'Cuota devengada',
                data: barCuotaData,
                color: barColors[0] ?? '#B82A2A',
              },
            ]}
            height={260}
          />
        ) : (
          <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos para {selectedYear}.</p>
        )}
      </div>

      {/* Tabla detalle año */}
      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto border border-[var(--color-rule)] bg-white">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Tipo IVA</th>
                <th>Base imponible (M€)</th>
                <th>Cuota devengada (M€)</th>
                <th>Tipo efectivo</th>
                <th>% cuota / total</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr key={r.tipo}>
                  <td className="font-medium">
                    <span
                      className="mr-2 inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: IVA_TIPO_COLORS[r.tipo] ?? '#999' }}
                    />
                    {IVA_TIPO_LABELS[r.tipo] ?? r.tipo}
                  </td>
                  <td>{formatEur(r.base_imponible)}</td>
                  <td>{formatEur(r.cuota_devengada)}</td>
                  <td>
                    {r.base_imponible > 0
                      ? `${((r.cuota_devengada / r.base_imponible) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
                      : '—'}
                  </td>
                  <td>
                    {totalCuota > 0
                      ? `${((r.cuota_devengada / totalCuota) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td>Total</td>
                <td>{formatEur(totalBase)}</td>
                <td>{formatEur(totalCuota)}</td>
                <td>
                  {totalBase > 0
                    ? `${((totalCuota / totalBase) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
                    : '—'}
                </td>
                <td>100,0%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Serie histórica: cuota devengada */}
      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
          Evolución histórica de la cuota devengada por tipo
        </h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">
          Millones de euros. Régimen general del IVA.
        </p>
        {loadingHistorico ? (
          <ChartSkeleton height={280} />
        ) : yearsInSeries.length > 0 ? (
          <LineChart
            categories={yearsInSeries.map(String)}
            series={lineSeriesCuota}
            height={280}
            smooth
          />
        ) : (
          <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos históricos.</p>
        )}
      </div>

      <p className="text-[0.7rem] text-[var(--color-ink-faint)]">
        Fuente: AEAT — Modelo 390, declaración resumen anual del IVA. Datos en M€ a precios corrientes.
      </p>
    </div>
  )
}
