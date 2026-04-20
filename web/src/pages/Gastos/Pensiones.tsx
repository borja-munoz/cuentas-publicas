import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../../components/layout/PageHeader'
import ContextBox from '../../components/ui/ContextBox'
import KpiCard from '../../components/ui/KpiCard'
import InsightsPanel from '../../components/ui/InsightsPanel'
import BarChart from '../../components/charts/BarChart'
import LineChart from '../../components/charts/LineChart'
import { ChartSkeleton } from '../../components/ui/LoadingSkeleton'
import { useFilters } from '../../store/filters'
import { formatEur } from '../../utils/format'
import type { Insight } from '../../utils/insights'
import {
  getPensionesYears,
  getPensionesAnio,
  getPensionesHistoricoAll,
  PENSION_TIPO_LABELS,
  PENSION_TIPO_COLORS,
  type PensionAnual,
} from '../../db/queries/pensiones'

const TIPOS_ORDEN = ['jubilacion', 'incapacidad', 'viudedad', 'orfandad', 'favor_familiar'] as const

export default function Pensiones() {
  const { selectedYear } = useFilters()
  const [availableYears, setAvailableYears] = useState<number[]>([])

  const [rows, setRows] = useState<PensionAnual[]>([])
  const [historico, setHistorico] = useState<PensionAnual[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingHistorico, setLoadingHistorico] = useState(true)

  useEffect(() => {
    getPensionesYears().then(setAvailableYears).catch(console.error)
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
    getPensionesAnio(effectiveYear)
      .then(setRows)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [effectiveYear])

  useEffect(() => {
    setLoadingHistorico(true)
    getPensionesHistoricoAll()
      .then(setHistorico)
      .catch(console.error)
      .finally(() => setLoadingHistorico(false))
  }, [])

  const yearsInSeries = useMemo(
    () => [...new Set(historico.map((r) => r.year))].sort(),
    [historico],
  )

  const sortedRows = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          TIPOS_ORDEN.indexOf(a.tipo as typeof TIPOS_ORDEN[number]) -
          TIPOS_ORDEN.indexOf(b.tipo as typeof TIPOS_ORDEN[number]),
      ),
    [rows],
  )

  const stackedImporteSeries = useMemo(
    () =>
      TIPOS_ORDEN.map((tipo) => ({
        name: PENSION_TIPO_LABELS[tipo] ?? tipo,
        data: yearsInSeries.map(
          (y) => historico.find((r) => r.year === y && r.tipo === tipo)?.importe_total ?? 0,
        ),
        color: PENSION_TIPO_COLORS[tipo],
      })),
    [historico, yearsInSeries],
  )

  const lineSeriesNPensiones = useMemo(
    () =>
      TIPOS_ORDEN.map((tipo) => ({
        name: PENSION_TIPO_LABELS[tipo] ?? tipo,
        data: yearsInSeries.map((y) => {
          const val = historico.find((r) => r.year === y && r.tipo === tipo)?.num_pensiones
          return val != null ? Math.round(val / 1000) : null
        }),
        color: PENSION_TIPO_COLORS[tipo],
      })),
    [historico, yearsInSeries],
  )

  const lineSeriesMedia = useMemo(
    () =>
      TIPOS_ORDEN.map((tipo) => ({
        name: PENSION_TIPO_LABELS[tipo] ?? tipo,
        data: yearsInSeries.map(
          (y) => historico.find((r) => r.year === y && r.tipo === tipo)?.pension_media ?? null,
        ),
        color: PENSION_TIPO_COLORS[tipo],
      })),
    [historico, yearsInSeries],
  )

  const totalImporte = rows.reduce((s, r) => s + r.importe_total, 0)
  const totalPensiones = rows.reduce((s, r) => s + r.num_pensiones, 0)
  const jubilacion = rows.find((r) => r.tipo === 'jubilacion')
  const viudedad = rows.find((r) => r.tipo === 'viudedad')
  const mediaGlobal = totalPensiones > 0
    ? rows.reduce((s, r) => s + r.pension_media * r.num_pensiones, 0) / totalPensiones
    : null

  const prevYear = effectiveYear != null ? effectiveYear - 1 : null
  const prevRows = prevYear != null ? historico.filter((r) => r.year === prevYear) : []
  const totalImportePrev = prevRows.reduce((s, r) => s + r.importe_total, 0)
  const yoyImporte = totalImportePrev > 0 ? (totalImporte - totalImportePrev) / totalImportePrev : null

  const insights: Insight[] = loading || rows.length === 0 ? [] : [
    ...(jubilacion ? [{
      label: 'Pensiones de jubilación',
      value: formatEur(jubilacion.importe_total),
      trendValue: `${totalImporte > 0 ? ((jubilacion.importe_total / totalImporte) * 100).toFixed(1) : '—'}% del total`,
      trend: 'neutral' as const,
      description: `La jubilación es el tipo de pensión más numeroso: ${jubilacion.num_pensiones.toLocaleString('es-ES')} pensiones en ${effectiveYear} con una media de ${jubilacion.pension_media.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €/mes.`,
    }] : []),
    ...(viudedad ? [{
      label: 'Pensiones de viudedad',
      value: formatEur(viudedad.importe_total),
      trendValue: `${viudedad.num_pensiones.toLocaleString('es-ES')} beneficiarios`,
      trend: 'neutral' as const,
      description: `Las pensiones de viudedad son el segundo tipo por número de beneficiarios (${viudedad.num_pensiones.toLocaleString('es-ES')} en ${effectiveYear}).`,
    }] : []),
    ...(yoyImporte != null ? [{
      label: 'Variación del gasto YoY',
      value: `${yoyImporte >= 0 ? '+' : ''}${(yoyImporte * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`,
      trendValue: `vs ${prevYear}`,
      trend: 'neutral' as const,
      description: `El gasto en pensiones ${yoyImporte >= 0 ? 'aumentó' : 'disminuyó'} ${Math.abs(yoyImporte * 100).toFixed(1)}% respecto al año anterior.`,
    }] : []),
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="Pensiones contributivas"
        subtitle={`Seguridad Social · ${effectiveYear ?? '—'}${effectiveYear !== selectedYear && effectiveYear != null ? ' (último disponible)' : ''}`}
      />

      <ContextBox title="El sistema de pensiones contributivas">
        <p>
          Las <strong>pensiones contributivas</strong> de la Seguridad Social se financian con las
          cotizaciones de trabajadores y empresas. Existen cinco modalidades:{' '}
          <strong>jubilación</strong>, <strong>incapacidad permanente</strong>,{' '}
          <strong>viudedad</strong>, <strong>orfandad</strong> y{' '}
          <strong>favor familiar</strong>.
        </p>
        <p>
          Los datos reflejan el <em>número de pensiones en vigor</em> y la{' '}
          <em>pensión media mensual</em> por tipo. El importe total anual se calcula como{' '}
          nº pensiones × pensión media × 12 mensualidades. Fuente: Ministerio de Inclusión —
          Estadística de Pensiones (BEL PEN-3).
        </p>
      </ContextBox>

      <InsightsPanel insights={insights} isLoading={loading} />

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        <KpiCard
          title="Gasto total pensiones"
          value={loading ? '—' : formatEur(totalImporte)}
          trendValue={yoyImporte != null ? `${yoyImporte >= 0 ? '+' : ''}${(yoyImporte * 100).toFixed(1)}% vs ${prevYear}` : undefined}
          trend={yoyImporte != null ? (yoyImporte >= 0 ? 'down' : 'up') : undefined}
          subtitle={`${effectiveYear ?? ''} · anual`}
          accent
        />
        <KpiCard title="Nº pensionistas" value={loading ? '—' : totalPensiones.toLocaleString('es-ES')} subtitle="Todas las clases" />
        <KpiCard
          title="Pensión media global"
          value={loading || mediaGlobal == null ? '—' : `${Math.round(mediaGlobal).toLocaleString('es-ES')} €/mes`}
          subtitle="Media ponderada por nº pensiones"
        />
      </div>

      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
          Gasto por tipo de pensión · {effectiveYear ?? '—'}
        </h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">Importe total anual en millones de euros.</p>
        {loading ? (
          <ChartSkeleton height={240} />
        ) : rows.length > 0 ? (
          <BarChart
            categories={sortedRows.map((r) => PENSION_TIPO_LABELS[r.tipo] ?? r.tipo)}
            series={[{ name: 'Importe total (M€)', data: sortedRows.map((r) => r.importe_total), color: '#B82A2A' }]}
            horizontal
            height={240}
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
                <th>Tipo de pensión</th>
                <th>Nº pensiones</th>
                <th>Pensión media (€/mes)</th>
                <th>Importe total (M€/año)</th>
                <th>% del gasto total</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr key={r.tipo}>
                  <td className="font-medium">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PENSION_TIPO_COLORS[r.tipo] ?? '#999' }} />
                    {PENSION_TIPO_LABELS[r.tipo] ?? r.tipo}
                  </td>
                  <td>{r.num_pensiones.toLocaleString('es-ES')}</td>
                  <td>{r.pension_media.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €</td>
                  <td>{formatEur(r.importe_total)}</td>
                  <td>{totalImporte > 0 ? `${((r.importe_total / totalImporte) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td>Total</td>
                <td>{totalPensiones.toLocaleString('es-ES')}</td>
                <td>—</td>
                <td>{formatEur(totalImporte)}</td>
                <td>100,0%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">Evolución del gasto total por tipo de pensión</h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">Importe total anual en millones de euros (barras apiladas).</p>
        {loadingHistorico ? (
          <ChartSkeleton height={280} />
        ) : yearsInSeries.length > 0 ? (
          <BarChart categories={yearsInSeries.map(String)} series={stackedImporteSeries} height={280} stacked />
        ) : (
          <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos históricos.</p>
        )}
      </div>

      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">Evolución del número de pensionistas por tipo</h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">Miles de pensiones en vigor.</p>
        {loadingHistorico ? (
          <ChartSkeleton height={280} />
        ) : yearsInSeries.length > 0 ? (
          <LineChart categories={yearsInSeries.map(String)} series={lineSeriesNPensiones} height={280} smooth />
        ) : (
          <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos históricos.</p>
        )}
      </div>

      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">Evolución de la pensión media por tipo</h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">Euros mensuales (importe bruto antes de IRPF).</p>
        {loadingHistorico ? (
          <ChartSkeleton height={280} />
        ) : yearsInSeries.length > 0 ? (
          <LineChart categories={yearsInSeries.map(String)} series={lineSeriesMedia} height={280} smooth />
        ) : (
          <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos históricos.</p>
        )}
      </div>

      <p className="text-[0.7rem] text-[var(--color-ink-faint)]">
        Fuente: Ministerio de Inclusión, Seguridad Social y Migraciones — Estadística de Pensiones del Sistema de la Seguridad Social (BEL PEN-3).
      </p>
    </div>
  )
}
