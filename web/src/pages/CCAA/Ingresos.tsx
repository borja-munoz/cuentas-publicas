import { useEffect, useMemo, useState } from 'react'
import { scaleSequential } from 'd3-scale'
import { interpolateBlues } from 'd3-scale-chromatic'
import PageHeader from '../../components/layout/PageHeader'
import ContextBox from '../../components/ui/ContextBox'
import InsightsPanel from '../../components/ui/InsightsPanel'
import BarChart from '../../components/charts/BarChart'
import LineChart from '../../components/charts/LineChart'
import ChoroplethMap, { ColorLegend } from '../../components/charts/ChoroplethMap'
import { ChartSkeleton } from '../../components/ui/LoadingSkeleton'
import { useFilters } from '../../store/filters'
import { formatEur } from '../../utils/format'
import type { Insight } from '../../utils/insights'
import {
  getCcaaIngresosResumen,
  getCcaaIngresosPorCapituloNacional,
  getTransferenciasSerie,
  getCcaaYears,
  type CcaaIngresosResumen,
  type CcaaCapituloNacional,
  type TransferenciasSerie,
} from '../../db/queries/ccaa'

const CAP_LABELS: Record<number, string> = {
  1: 'Impuestos directos cedidos',
  2: 'Impuestos indirectos cedidos',
  3: 'Tasas y otros',
  4: 'Transferencias corrientes',
  5: 'Ingresos patrimoniales',
  6: 'Enajenación inversiones',
  7: 'Transferencias de capital',
}

export default function IngresosCcaa() {
  const { selectedYear: globalYear, viewMode, setPageFilters } = useFilters()
  const fuente = viewMode === 'ejecucion' ? 'ejecucion' : 'plan'

  const [availableYears, setAvailableYears] = useState<number[]>([])

  useEffect(() => {
    setPageFilters({ showViewMode: true, showComparativa: false })
    return () => setPageFilters({ showViewMode: false, showComparativa: false })
  }, [setPageFilters])

  useEffect(() => {
    getCcaaYears().then(setAvailableYears).catch(console.error)
  }, [])

  const selectedYear = useMemo(() => {
    if (availableYears.length === 0) return null
    if (availableYears.includes(globalYear)) return globalYear
    const below = availableYears.filter((y) => y <= globalYear)
    return below.length > 0 ? Math.max(...below) : Math.min(...availableYears)
  }, [availableYears, globalYear])

  const [rows, setRows] = useState<CcaaIngresosResumen[]>([])
  const [caps, setCaps] = useState<CcaaCapituloNacional[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedCcaa, setSelectedCcaa] = useState<string | null>(null)
  const [serie, setSerie] = useState<TransferenciasSerie[]>([])
  const [loadingSerie, setLoadingSerie] = useState(false)

  useEffect(() => {
    if (selectedYear == null) return
    setLoading(true)
    Promise.all([
      getCcaaIngresosResumen(selectedYear, fuente),
      getCcaaIngresosPorCapituloNacional(selectedYear, fuente),
    ])
      .then(([r, c]) => { setRows(r); setCaps(c) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedYear, fuente])

  useEffect(() => {
    if (!selectedCcaa) { setSerie([]); return }
    setLoadingSerie(true)
    getTransferenciasSerie(selectedCcaa, fuente)
      .then(setSerie)
      .catch(console.error)
      .finally(() => setLoadingSerie(false))
  }, [selectedCcaa, fuente])

  const mapData = useMemo<Record<string, number>>(
    () => Object.fromEntries(rows.map((r) => [r.ccaa_cod, r.total])),
    [rows],
  )

  const maxTotal = useMemo(() => Math.max(...rows.map((r) => r.total), 1), [rows])
  const colorScale = useMemo(
    () => scaleSequential(interpolateBlues).domain([0, maxTotal]),
    [maxTotal],
  )

  const totalNacional = rows.reduce((s, r) => s + r.total, 0)
  const totalImpuestos = rows.reduce((s, r) => s + r.impuestos, 0)
  const totalTransferencias = rows.reduce((s, r) => s + r.transferencias, 0)
  const totalPropios = rows.reduce((s, r) => s + r.propios, 0)

  const top1 = [...rows].sort((a, b) => b.total - a.total)[0]

  const insights: Insight[] = loading || rows.length === 0 ? [] : [
    ...(top1 ? [{
      label: 'Mayor ingreso autonómico',
      value: top1.ccaa_nom,
      trendValue: formatEur(top1.total),
      trend: 'neutral' as const,
      description: `${top1.ccaa_nom} es la comunidad con mayores ingresos presupuestarios en ${selectedYear ?? ''} (${formatEur(top1.total)}), el ${((top1.total / totalNacional) * 100).toFixed(1)}% del total autonómico.`,
    }] : []),
    {
      label: 'Total ingresos autonómicos',
      value: formatEur(totalNacional),
      trendValue: `${rows.length} CCAA · ${selectedYear ?? ''}`,
      trend: 'neutral' as const,
      description: `Suma de ingresos no financieros de todas las CCAA según ${fuente === 'plan' ? 'el presupuesto aprobado' : 'la liquidación'}.`,
    },
    {
      label: 'Estructura de financiación',
      value: totalNacional > 0
        ? `${((totalTransferencias / totalNacional) * 100).toFixed(0)}% transferencias`
        : '—',
      trendValue: totalNacional > 0
        ? `${((totalImpuestos / totalNacional) * 100).toFixed(0)}% tributos cedidos`
        : undefined,
      trend: 'neutral' as const,
      description: `Las transferencias del Estado (sistema de financiación) y los tributos cedidos (IRPF, IVA, especiales) son las dos principales fuentes de ingresos autonómicos.`,
    },
  ]

  const barCats = caps.map((c) => CAP_LABELS[c.capitulo] ?? `Cap. ${c.capitulo}`)
  const barData = caps.map((c) => c.importe)

  const selectedRow = rows.find((r) => r.ccaa_cod === selectedCcaa)

  return (
    <div className="space-y-8">
      <PageHeader
        title="Ingresos CCAA"
        subtitle={`Comunidades Autónomas · ${fuente === 'plan' ? 'Plan' : 'Ejecución'} · ${selectedYear ?? '—'}${selectedYear !== globalYear && selectedYear != null ? ' (último disponible)' : ''}`}
      />

      <ContextBox title="Ingresos de las Comunidades Autónomas">
        <p>
          Los ingresos autonómicos proceden de tres fuentes principales:{' '}
          <strong>tributos cedidos</strong> (capítulos 1 y 2: IRPF cedido, IVA cedido, impuestos
          especiales), <strong>transferencias del Estado</strong> (capítulos 4 y 7: sistema de
          financiación autonómica y fondos de inversión) e{' '}
          <strong>ingresos propios</strong> (capítulos 3 y 5: tasas, precios públicos y
          rendimientos del patrimonio).
        </p>
        <p>
          Los datos proceden de la <strong>liquidación presupuestaria</strong> publicada por el
          Ministerio de Hacienda (SGCIEF), que agrega los presupuestos de ingresos de todas las
          entidades dependientes de cada comunidad. Los capítulos 8 y 9 (operaciones financieras)
          quedan excluidos.
        </p>
      </ContextBox>

      <InsightsPanel insights={insights} isLoading={loading} />

      {/* Mapa + tabla resumen */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
            <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
              Total ingresos por CCAA · {selectedYear ?? '—'}
            </h2>
            <p className="text-xs text-[var(--color-ink-muted)] mb-3">
              M€. Clic en una comunidad para ver la evolución de sus transferencias.
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
                  domain={[0, maxTotal]}
                  formatValue={formatEur}
                  label="Total ingresos (M€)"
                />
              </>
            )}
          </div>
          <p className="mt-1.5 text-[0.7rem] text-[var(--color-ink-faint)]">
            Canarias aparece en su posición geográfica real (SO). Ceuta y Melilla pueden no ser visibles a esta escala.
          </p>
        </section>

        <section className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-3">
            Estructura de ingresos por CCAA · {selectedYear ?? '—'}
          </h2>
          <div className="overflow-x-auto border border-[var(--color-rule)] bg-white">
            <table className="data-table w-full text-xs">
              <thead>
                <tr>
                  <th>CCAA</th>
                  <th>Tributos</th>
                  <th>Transf.</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-[var(--color-ink-muted)]">
                      Cargando…
                    </td>
                  </tr>
                ) : (
                  [...rows]
                    .sort((a, b) => b.total - a.total)
                    .map((r) => (
                      <tr
                        key={r.ccaa_cod}
                        className={`cursor-pointer transition-colors hover:bg-[var(--color-accent)]/5 ${
                          selectedCcaa === r.ccaa_cod ? 'bg-[var(--color-accent)]/10' : ''
                        }`}
                        onClick={() => setSelectedCcaa((prev) => (prev === r.ccaa_cod ? null : r.ccaa_cod))}
                      >
                        <td className="font-medium">{r.ccaa_nom}</td>
                        <td>{formatEur(r.impuestos)}</td>
                        <td>{formatEur(r.transferencias)}</td>
                        <td>{formatEur(r.total)}</td>
                      </tr>
                    ))
                )}
              </tbody>
              {!loading && rows.length > 0 && (
                <tfoot>
                  <tr className="total-row">
                    <td>Total</td>
                    <td>{formatEur(totalImpuestos)}</td>
                    <td>{formatEur(totalTransferencias)}</td>
                    <td>{formatEur(totalNacional)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      </div>

      {/* Desglose nacional por capítulo */}
      {caps.length > 0 && (
        <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
          <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
            Desglose nacional por capítulo · {selectedYear ?? '—'}
          </h2>
          <p className="text-xs text-[var(--color-ink-muted)] mb-3">
            Suma agregada de todas las CCAA en M€.
          </p>
          {loading ? (
            <ChartSkeleton height={240} />
          ) : (
            <BarChart
              categories={barCats}
              series={[{ name: 'Ingresos (M€)', data: barData, color: '#B82A2A' }]}
              horizontal
              height={240}
            />
          )}
        </div>
      )}

      {/* Tabla detallada */}
      {!loading && rows.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-3">
            Detalle por CCAA · {selectedYear ?? '—'}
          </h2>
          <div className="overflow-x-auto border border-[var(--color-rule)] bg-white">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>CCAA</th>
                  <th>Tributos cedidos (M€)</th>
                  <th>Transferencias (M€)</th>
                  <th>Ingresos propios (M€)</th>
                  <th>Total (M€)</th>
                  <th>% s/total</th>
                </tr>
              </thead>
              <tbody>
                {[...rows]
                  .sort((a, b) => b.total - a.total)
                  .map((r) => (
                    <tr key={r.ccaa_cod}>
                      <td className="font-medium">{r.ccaa_nom}</td>
                      <td>{formatEur(r.impuestos)}</td>
                      <td>{formatEur(r.transferencias)}</td>
                      <td>{formatEur(r.propios)}</td>
                      <td>{formatEur(r.total)}</td>
                      <td>
                        {totalNacional > 0
                          ? `${((r.total / totalNacional) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
                          : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td>Total</td>
                  <td>{formatEur(totalImpuestos)}</td>
                  <td>{formatEur(totalTransferencias)}</td>
                  <td>{formatEur(totalPropios)}</td>
                  <td>{formatEur(totalNacional)}</td>
                  <td>100,0%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* Evolución histórica de transferencias para la CCAA seleccionada */}
      {selectedCcaa && (
        <section>
          <div className="border border-[var(--color-rule)] bg-white px-5 pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                Evolución de transferencias · {selectedRow?.ccaa_nom ?? selectedCcaa}
              </h2>
              <button
                onClick={() => setSelectedCcaa(null)}
                className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              >
                ✕ Cerrar
              </button>
            </div>
            <p className="text-xs text-[var(--color-ink-muted)] mb-4">
              Transferencias corrientes y de capital del Estado a la CCAA (caps. 4 y 7 de ingresos) · M€.
            </p>
            {loadingSerie ? (
              <ChartSkeleton height={240} />
            ) : (
              <LineChart
                categories={serie.map((s) => String(s.year))}
                series={[
                  { name: 'Total transferencias', data: serie.map((s) => s.total), color: '#B82A2A' },
                  { name: 'Corrientes', data: serie.map((s) => s.corriente), color: '#C89B3C', dashed: true },
                  { name: 'Capital', data: serie.map((s) => s.capital), color: '#5C6F7E', dashed: true },
                ]}
                height={240}
                smooth
              />
            )}
          </div>
          <p className="mt-1.5 text-[0.7rem] text-[var(--color-ink-faint)]">
            Fuente: Ministerio de Hacienda · SGCIEF (liquidación presupuestaria CCAA, caps. 4 y 7 de ingresos).
          </p>
        </section>
      )}

      <p className="text-[0.7rem] text-[var(--color-ink-faint)]">
        Fuente: Ministerio de Hacienda · SGCIEF. Liquidación presupuestaria de las CCAA. Datos en M€. Excluye caps. 8 y 9 (operaciones financieras).
      </p>
    </div>
  )
}
