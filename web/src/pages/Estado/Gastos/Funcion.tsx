import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../../../components/layout/PageHeader'
import ContextBox from '../../../components/ui/ContextBox'
import InsightsPanel from '../../../components/ui/InsightsPanel'
import BarChart from '../../../components/charts/BarChart'
import LineChart from '../../../components/charts/LineChart'
import { ChartSkeleton } from '../../../components/ui/LoadingSkeleton'
import { useFilters } from '../../../store/filters'
import { formatEur } from '../../../utils/format'
import type { Insight } from '../../../utils/insights'
import {
  getGastoFuncionAnio,
  getGastoFuncionSeries,
  getCofogYears,
  COFOG_NAMES,
  COFOG_COLORS,
  SECTOR_NAMES,
  type GastoFuncion,
  type GastoFuncionSerie,
} from '../../../db/queries/cofog'

const SECTORES = ['S13', 'S1311', 'S1312', 'S1313', 'S1314'] as const
type Sector = typeof SECTORES[number]

export default function GastosFuncion() {
  const { selectedYear } = useFilters()
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [sector, setSector] = useState<Sector>('S13')

  const [rows, setRows] = useState<GastoFuncion[]>([])
  const [series, setSeries] = useState<GastoFuncionSerie[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingSeries, setLoadingSeries] = useState(true)

  useEffect(() => {
    getCofogYears().then(setAvailableYears).catch(console.error)
  }, [])

  const effectiveYear = useMemo(() => {
    if (availableYears.length === 0) return null
    if (availableYears.includes(selectedYear)) return selectedYear
    const below = availableYears.filter((y) => y <= selectedYear)
    return below.length > 0 ? Math.max(...below) : Math.min(...availableYears)
  }, [availableYears, selectedYear])

  useEffect(() => {
    if (effectiveYear == null) return
    setLoading(true)
    getGastoFuncionAnio(effectiveYear, sector)
      .then(setRows)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [effectiveYear, sector])

  useEffect(() => {
    setLoadingSeries(true)
    getGastoFuncionSeries(sector)
      .then(setSeries)
      .catch(console.error)
      .finally(() => setLoadingSeries(false))
  }, [sector])

  const sortedRows = useMemo(() => [...rows].sort((a, b) => b.importe - a.importe), [rows])
  const barCats = sortedRows.map((r) => COFOG_NAMES[r.cofog_cod] ?? r.cofog_nom)
  const barData = sortedRows.map((r) => r.importe)

  const yearsInSeries = useMemo(
    () => [...new Set(series.map((s) => s.year))].sort(),
    [series],
  )
  const COFOG_ORDER = ['GF01','GF02','GF03','GF04','GF05','GF06','GF07','GF08','GF09','GF10']
  const lineSeries = useMemo(
    () =>
      COFOG_ORDER.map((cod) => ({
        name: COFOG_NAMES[cod] ?? cod,
        data: yearsInSeries.map((y) => series.find((s) => s.year === y && s.cofog_cod === cod)?.importe ?? null),
        color: COFOG_COLORS[cod],
      })),
    [series, yearsInSeries],
  )

  const total = rows.reduce((s, r) => s + r.importe, 0)
  const top1 = sortedRows[0]
  const proteccionSocial = rows.find((r) => r.cofog_cod === 'GF10')
  const sanidad = rows.find((r) => r.cofog_cod === 'GF07')
  const educacion = rows.find((r) => r.cofog_cod === 'GF09')

  const insights: Insight[] = loading || rows.length === 0 ? [] : [
    ...(top1 ? [{
      label: 'Mayor función de gasto',
      value: COFOG_NAMES[top1.cofog_cod] ?? top1.cofog_nom,
      trendValue: formatEur(top1.importe),
      trend: 'neutral' as const,
      description: `${COFOG_NAMES[top1.cofog_cod] ?? top1.cofog_nom} acapara el ${((top1.importe / total) * 100).toFixed(1)}% del gasto total en ${effectiveYear}.`,
    }] : []),
    ...(proteccionSocial && sanidad && educacion ? [{
      label: 'Estado de bienestar',
      value: `${(((proteccionSocial.importe + sanidad.importe + educacion.importe) / total) * 100).toFixed(0)}% del total`,
      trendValue: `${formatEur(proteccionSocial.importe + sanidad.importe + educacion.importe)}`,
      trend: 'neutral' as const,
      description: `Protección social, sanidad y educación concentran la mayor parte del gasto público en ${effectiveYear}.`,
    }] : []),
    {
      label: 'Gasto total AAPP',
      value: formatEur(total),
      trendValue: `${rows.length} funciones · ${effectiveYear ?? ''}`,
      trend: 'neutral' as const,
      description: `Clasificación COFOG. Fuente: Eurostat gov_10a_exp, en millones de euros a precios corrientes.`,
    },
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="Gasto por función"
        subtitle={`COFOG · ${SECTOR_NAMES[sector] ?? sector} · ${effectiveYear ?? '—'}${effectiveYear !== selectedYear && effectiveYear != null ? ' (último disponible)' : ''}`}
        actions={
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value as Sector)}
            className="rounded border border-[var(--color-rule)] bg-white px-2 py-1.5 text-sm text-[var(--color-ink)] focus:outline-none"
          >
            {SECTORES.map((s) => (
              <option key={s} value={s}>{SECTOR_NAMES[s]}</option>
            ))}
          </select>
        }
      />

      <ContextBox title="Gasto público por función (clasificación COFOG)">
        <p>
          La clasificación <strong>COFOG</strong> (Classification of Functions of Government)
          agrupa el gasto público según su <em>finalidad económica y social</em>. Responde a la
          pregunta &ldquo;¿para qué gasta el Estado?&rdquo;: sanidad, educación, defensa,
          protección social, etc.
        </p>
        <p>
          Los datos proceden del <strong>dataset gov_10a_exp de Eurostat</strong>, con series
          anuales para todas las AAPP españolas y sus subsectores. Los importes están en millones
          de euros a precios corrientes. Datos disponibles hasta 2023.
        </p>
      </ContextBox>

      <InsightsPanel insights={insights} isLoading={loading} />

      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
          Gasto por función · {effectiveYear ?? '—'}
        </h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">
          Millones de euros. Ordenado de mayor a menor gasto.
        </p>
        {loading ? (
          <ChartSkeleton height={320} />
        ) : rows.length > 0 ? (
          <BarChart
            categories={barCats}
            series={[{ name: 'Importe', data: barData, color: '#B82A2A' }]}
            horizontal
            height={320}
          />
        ) : (
          <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos para {effectiveYear}.</p>
        )}
      </div>

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto border border-[var(--color-rule)] bg-white">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Función COFOG</th>
                <th>Importe (M€)</th>
                <th>% del total</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr key={r.cofog_cod}>
                  <td className="font-medium">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: COFOG_COLORS[r.cofog_cod] ?? '#999' }} />
                    {COFOG_NAMES[r.cofog_cod] ?? r.cofog_nom}
                  </td>
                  <td>{formatEur(r.importe)}</td>
                  <td>{total > 0 ? `${((r.importe / total) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td>Total</td>
                <td>{formatEur(total)}</td>
                <td>100,0%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
          Evolución histórica por función · 2000–2023
        </h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">
          Millones de euros a precios corrientes.
        </p>
        {loadingSeries ? (
          <ChartSkeleton height={320} />
        ) : yearsInSeries.length > 0 ? (
          <LineChart categories={yearsInSeries.map(String)} series={lineSeries} height={320} smooth />
        ) : (
          <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos históricos.</p>
        )}
      </div>

      <p className="text-[0.7rem] text-[var(--color-ink-faint)]">
        Fuente: Eurostat — dataset gov_10a_exp (Government expenditure by function COFOG). Datos en M€ a precios corrientes.
      </p>
    </div>
  )
}
