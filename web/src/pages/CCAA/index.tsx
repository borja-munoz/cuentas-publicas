import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { scaleSequential } from 'd3-scale'
import { interpolateBlues } from 'd3-scale-chromatic'
import PageHeader from '../../components/layout/PageHeader'
import ContextBox from '../../components/ui/ContextBox'
import InsightsPanel from '../../components/ui/InsightsPanel'
import BarChart from '../../components/charts/BarChart'
import ChoroplethMap, { ColorLegend } from '../../components/charts/ChoroplethMap'
import { ChartSkeleton } from '../../components/ui/LoadingSkeleton'
import { formatEur, formatPct } from '../../utils/format'
import type { Insight } from '../../utils/insights'
import {
  getCcaaResumen,
  getCcaaGastosPorCapitulo,
  getCcaaYears,
  type CcaaResumen,
  type CcaaCapitulo,
} from '../../db/queries/ccaa'

type MapVariable = 'gastos_ejec' | 'gastos_plan' | 'deficit'

const MAP_VAR_LABELS: Record<MapVariable, string> = {
  gastos_ejec: 'Gasto ejecutado (M€)',
  gastos_plan: 'Gasto planificado (M€)',
  deficit: 'Déficit / superávit (M€)',
}

function MapVarSelector({
  value,
  onChange,
}: {
  value: MapVariable
  onChange: (v: MapVariable) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as MapVariable)}
      className="rounded border border-[var(--color-rule)] bg-white px-2 py-1.5 text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-accent)]"
    >
      {(Object.keys(MAP_VAR_LABELS) as MapVariable[]).map((k) => (
        <option key={k} value={k}>
          {MAP_VAR_LABELS[k]}
        </option>
      ))}
    </select>
  )
}

const CAPS_OPERACIONALES = [1, 2, 3, 4, 6, 7]
const CAP_LABELS: Record<number, string> = {
  1: 'Personal',
  2: 'Bienes y servicios',
  3: 'Gastos financieros',
  4: 'Transf. corrientes',
  6: 'Inversiones reales',
  7: 'Transf. capital',
}

export default function CCAA() {
  const [mapVar, setMapVar] = useState<MapVariable>('gastos_ejec')
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)

  useEffect(() => {
    getCcaaYears().then((ys) => {
      setAvailableYears(ys)
      setSelectedYear(ys.length > 0 ? Math.max(...ys) : null)
    }).catch(console.error)
  }, [])

  const [rows, setRows] = useState<CcaaResumen[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedCcaa, setSelectedCcaa] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<CcaaCapitulo[]>([])
  const [loadingDetalle, setLoadingDetalle] = useState(false)

  useEffect(() => {
    if (selectedYear == null) return
    setLoading(true)
    getCcaaResumen(selectedYear)
      .then(setRows)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedYear])

  useEffect(() => {
    if (!selectedCcaa || selectedYear == null) { setDetalle([]); return }
    setLoadingDetalle(true)
    getCcaaGastosPorCapitulo(selectedCcaa, selectedYear)
      .then(setDetalle)
      .catch(console.error)
      .finally(() => setLoadingDetalle(false))
  }, [selectedCcaa, selectedYear])

  // Valor del mapa según variable seleccionada
  const mapData = useMemo<Record<string, number>>(() => {
    const entries = rows.map((r) => {
      let val: number
      if (mapVar === 'deficit') {
        val = (r.ingresos_ejec || r.ingresos_plan) - (r.gastos_ejec || r.gastos_plan)
      } else {
        val = r[mapVar] ?? 0
      }
      return [r.ccaa_cod, Math.max(val, 0)] // para negativo en déficit usamos 0 (sin color)
    })
    return Object.fromEntries(entries)
  }, [rows, mapVar])

  const maxVal = useMemo(() => Math.max(...Object.values(mapData), 1), [mapData])
  const colorScale = useMemo(
    () => scaleSequential(interpolateBlues).domain([0, maxVal]),
    [maxVal],
  )

  // KPIs nacionales
  const totalGastosEjec = rows.reduce((s, r) => s + (r.gastos_ejec ?? 0), 0)
  const totalGastosPlan = rows.reduce((s, r) => s + (r.gastos_plan ?? 0), 0)
  const maxGastos = rows.length > 0 ? rows.reduce((a, b) => (b.gastos_ejec > a.gastos_ejec ? b : a), rows[0]) : null
  const pctEjecucion = totalGastosPlan > 0 ? totalGastosEjec / totalGastosPlan : null

  const insights: Insight[] = loading || rows.length === 0 ? [] : [
    ...(maxGastos ? [{
      label: 'Mayor gasto ejecutado',
      value: maxGastos.ccaa_nom,
      trendValue: formatEur(maxGastos.gastos_ejec),
      trend: 'neutral' as const,
      description: `${maxGastos.ccaa_nom} es la comunidad con mayor gasto ejecutado en ${selectedYear ?? ''} (${formatEur(maxGastos.gastos_ejec)}), lo que representa el ${((maxGastos.gastos_ejec / totalGastosEjec) * 100).toFixed(1)}% del total autonómico.`,
    }] : []),
    {
      label: 'Total gasto autonómico',
      value: formatEur(totalGastosEjec || totalGastosPlan),
      trendValue: `${rows.length} CCAA · ${selectedYear ?? ''}`,
      trend: 'neutral' as const,
      description: `Suma del gasto ${totalGastosEjec > 0 ? 'ejecutado' : 'planificado'} de todas las Comunidades Autónomas, equivalente al presupuesto consolidado autonómico.`,
    },
    ...(pctEjecucion != null && totalGastosEjec > 0 ? [{
      label: 'Ejecución presupuestaria',
      value: `${(pctEjecucion * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`,
      trendValue: `Plan: ${formatEur(totalGastosPlan)}`,
      trend: pctEjecucion >= 0.95 ? 'up' as const : 'neutral' as const,
      description: `Las CCAA ejecutaron el ${(pctEjecucion * 100).toFixed(1)}% del gasto planificado en ${selectedYear ?? ''}. Un porcentaje cercano al 100% indica alta capacidad de absorción presupuestaria.`,
    }] : []),
  ]

  // Detalle de la CCAA seleccionada — bar chart por capítulo
  const selectedRow = rows.find((r) => r.ccaa_cod === selectedCcaa)
  const detallePlan = detalle.filter((d) => d.fuente === 'plan' && CAPS_OPERACIONALES.includes(d.capitulo))
  const detalleEjec = detalle.filter((d) => d.fuente === 'ejecucion' && CAPS_OPERACIONALES.includes(d.capitulo))
  const detalleYears = [...new Set(detalle.map((d) => d.capitulo))].filter((c) => CAPS_OPERACIONALES.includes(c)).sort()
  const detalleCats = detalleYears.map((c) => CAP_LABELS[c] ?? `Cap. ${c}`)
  const detalleSeriesPlan = {
    name: 'Plan',
    data: detalleYears.map((c) => detallePlan.find((d) => d.capitulo === c)?.importe ?? 0),
    color: '#326891',
  }
  const detalleSeriesEjec = {
    name: 'Ejecución',
    data: detalleYears.map((c) => detalleEjec.find((d) => d.capitulo === c)?.importe ?? 0),
    color: '#e07b39',
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Comunidades Autónomas"
        subtitle={`Presupuestos autonómicos consolidados · ${selectedYear ?? ''}`}
        actions={
          <div className="flex items-center gap-3">
            <select
              value={selectedYear ?? ''}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              disabled={availableYears.length === 0}
              className="rounded border border-[var(--color-rule)] bg-white px-2 py-1.5 text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-accent)]"
            >
              {[...availableYears].sort((a, b) => b - a).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <MapVarSelector value={mapVar} onChange={setMapVar} />
          </div>
        }
      />

      <ContextBox title="Presupuestos de las Comunidades Autónomas">
        <p>
          Las 17 Comunidades Autónomas, junto con Ceuta y Melilla, gestionan competencias clave
          como sanidad, educación y servicios sociales. Su presupuesto combina{' '}
          <strong>recursos propios</strong> (tributos cedidos y propios) con{' '}
          <strong>transferencias del Estado</strong> (sistema de financiación autonómica).
        </p>
        <p>
          Los datos proceden de la <strong>liquidación presupuestaria</strong> publicada por el
          Ministerio de Hacienda (SGCIEF), que agrega los presupuestos de todas las entidades
          dependientes de cada comunidad.
        </p>
      </ContextBox>

      <InsightsPanel insights={insights} isLoading={loading} />

      {/* Mapa + tabla */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Mapa (3/5) */}
        <section className="lg:col-span-3">
          <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
            <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
              {MAP_VAR_LABELS[mapVar]} · {selectedYear ?? ''}
            </h2>
            <p className="text-xs text-[var(--color-ink-muted)] mb-3">
              Haz clic en una comunidad para ver el desglose por capítulo.
            </p>
            {loading ? (
              <ChartSkeleton height={380} />
            ) : (
              <>
                <ChoroplethMap
                  data={mapData}
                  colorScale={colorScale}
                  onSelect={(cod) => setSelectedCcaa((prev) => (prev === cod ? null : cod))}
                  selectedCcaa={selectedCcaa}
                  formatValue={formatEur}
                  height={380}
                />
                <ColorLegend
                  colorScale={colorScale}
                  domain={[0, maxVal]}
                  formatValue={formatEur}
                  label={MAP_VAR_LABELS[mapVar]}
                />
              </>
            )}
          </div>
          <p className="mt-1.5 text-[0.7rem] text-[var(--color-ink-faint)]">
            Canarias aparece en su posición geográfica real (SO). Ceuta y Melilla pueden no ser visibles a esta escala.
          </p>
        </section>

        {/* Tabla comparativa (2/5) */}
        <section className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-3">
            Comparativa autonómica · {selectedYear ?? ''}
          </h2>
          <div className="overflow-x-auto border border-[var(--color-rule)] bg-white">
            <table className="data-table w-full text-xs">
              <thead>
                <tr>
                  <th>CCAA</th>
                  <th>Gasto ejec.</th>
                  <th>% ejec.</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-[var(--color-ink-muted)]">
                      Cargando…
                    </td>
                  </tr>
                ) : (
                  [...rows]
                    .sort((a, b) => (b.gastos_ejec || b.gastos_plan) - (a.gastos_ejec || a.gastos_plan))
                    .map((r) => {
                      const gasto = r.gastos_ejec || r.gastos_plan
                      const pct = r.gastos_plan > 0 ? r.gastos_ejec / r.gastos_plan : null
                      return (
                        <tr
                          key={r.ccaa_cod}
                          className={`cursor-pointer transition-colors hover:bg-blue-50/50 ${
                            selectedCcaa === r.ccaa_cod ? 'bg-blue-50' : ''
                          }`}
                          onClick={() =>
                            setSelectedCcaa((prev) => (prev === r.ccaa_cod ? null : r.ccaa_cod))
                          }
                        >
                          <td className="font-medium">
                            <Link
                              to={`/ccaa/${r.ccaa_cod}`}
                              className="hover:text-[var(--color-accent)] transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {r.ccaa_nom}
                            </Link>
                          </td>
                          <td>{formatEur(gasto)}</td>
                          <td>
                            {pct != null && r.gastos_ejec > 0
                              ? `${(pct * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
                              : '—'}
                          </td>
                        </tr>
                      )
                    })
                )}
              </tbody>
              {!loading && rows.length > 0 && (
                <tfoot>
                  <tr className="total-row">
                    <td>Total</td>
                    <td>{formatEur(totalGastosEjec || totalGastosPlan)}</td>
                    <td>
                      {pctEjecucion != null && totalGastosEjec > 0
                        ? `${(pctEjecucion * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
                        : '—'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      </div>

      {/* Detalle de la CCAA seleccionada */}
      {selectedCcaa && (
        <section>
          <div className="border border-[var(--color-rule)] bg-white px-5 pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                Desglose por capítulo · {selectedRow?.ccaa_nom ?? selectedCcaa} · {selectedYear ?? ''}
              </h2>
              <button
                onClick={() => setSelectedCcaa(null)}
                className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              >
                ✕ Cerrar
              </button>
            </div>
            <p className="text-xs text-[var(--color-ink-muted)] mb-4">
              Comparativa plan vs. ejecución por capítulo económico (caps. operacionales).
            </p>
            {loadingDetalle ? (
              <ChartSkeleton height={260} />
            ) : detalleYears.length > 0 ? (
              <BarChart
                categories={detalleCats}
                series={[
                  ...(detalleSeriesPlan.data.some((v) => v > 0) ? [detalleSeriesPlan] : []),
                  ...(detalleSeriesEjec.data.some((v) => v > 0) ? [detalleSeriesEjec] : []),
                ]}
                horizontal
                height={260}
              />
            ) : (
              <p className="text-sm text-[var(--color-ink-muted)] py-8 text-center">
                Sin datos para {selectedYear ?? ''}.
              </p>
            )}

            {/* Mini tabla de comparativa */}
            {!loadingDetalle && detalleYears.length > 0 && (
              <div className="mt-4 overflow-x-auto border-t border-[var(--color-rule)] pt-3">
                <table className="data-table w-full text-xs">
                  <thead>
                    <tr>
                      <th>Capítulo</th>
                      <th>Plan (M€)</th>
                      <th>Ejec. (M€)</th>
                      <th>Desviación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalleYears.map((cap) => {
                      const plan = detallePlan.find((d) => d.capitulo === cap)?.importe ?? 0
                      const ejec = detalleEjec.find((d) => d.capitulo === cap)?.importe ?? 0
                      const desv = ejec - plan
                      const pctDesv = plan > 0 ? desv / plan : null
                      return (
                        <tr key={cap}>
                          <td>{CAP_LABELS[cap] ?? `Cap. ${cap}`}</td>
                          <td>{formatEur(plan)}</td>
                          <td>{formatEur(ejec)}</td>
                          <td
                            className={
                              pctDesv != null && pctDesv < -0.05
                                ? 'text-red-600'
                                : pctDesv != null && pctDesv > 0.05
                                ? 'text-emerald-600'
                                : ''
                            }
                          >
                            {pctDesv != null ? (formatPct(pctDesv) ?? '—') : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="mt-1.5 text-[0.7rem] text-[var(--color-ink-faint)]">
            Fuente: Ministerio de Hacienda · SGCIEF. Datos en M€.
          </p>
        </section>
      )}

      {/* Tabla completa plan/ejec/déficit */}
      {!loading && rows.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-3">
            Cuadro resumen · {selectedYear ?? ''}
          </h2>
          <div className="overflow-x-auto border border-[var(--color-rule)] bg-white">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>CCAA</th>
                  <th>Ingresos plan</th>
                  <th>Ingresos ejec.</th>
                  <th>Gastos plan</th>
                  <th>Gastos ejec.</th>
                  <th>Déficit (ejec.)</th>
                </tr>
              </thead>
              <tbody>
                {[...rows]
                  .sort((a, b) => (b.gastos_ejec || b.gastos_plan) - (a.gastos_ejec || a.gastos_plan))
                  .map((r) => {
                    const deficit = r.ingresos_ejec - r.gastos_ejec
                    return (
                      <tr key={r.ccaa_cod}>
                        <td className="font-medium">
                          <Link
                            to={`/ccaa/${r.ccaa_cod}`}
                            className="hover:text-[var(--color-accent)] transition-colors"
                          >
                            {r.ccaa_nom}
                          </Link>
                        </td>
                        <td>{formatEur(r.ingresos_plan)}</td>
                        <td>{formatEur(r.ingresos_ejec)}</td>
                        <td>{formatEur(r.gastos_plan)}</td>
                        <td>{formatEur(r.gastos_ejec)}</td>
                        <td
                          className={
                            deficit < 0
                              ? 'text-red-600 font-medium'
                              : deficit > 0
                              ? 'text-emerald-600'
                              : ''
                          }
                        >
                          {r.gastos_ejec > 0 && r.ingresos_ejec > 0 ? formatEur(deficit) : '—'}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td>Total</td>
                  <td>{formatEur(rows.reduce((s, r) => s + r.ingresos_plan, 0))}</td>
                  <td>{formatEur(rows.reduce((s, r) => s + r.ingresos_ejec, 0))}</td>
                  <td>{formatEur(totalGastosPlan)}</td>
                  <td>{formatEur(totalGastosEjec)}</td>
                  <td>
                    {totalGastosEjec > 0
                      ? formatEur(
                          rows.reduce((s, r) => s + r.ingresos_ejec, 0) - totalGastosEjec,
                        )
                      : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">
            Fuente: Ministerio de Hacienda · SGCIEF. Datos en M€. Déficit positivo = superávit.
          </p>
        </section>
      )}
    </div>
  )
}
