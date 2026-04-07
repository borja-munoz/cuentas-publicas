import { useEffect, useMemo, useState } from 'react'
import { scaleSequential } from 'd3-scale'
import { interpolateBlues } from 'd3-scale-chromatic'
import PageHeader from '../../components/layout/PageHeader'
import ContextBox from '../../components/ui/ContextBox'
import InsightsPanel from '../../components/ui/InsightsPanel'
import LineChart from '../../components/charts/LineChart'
import ChoroplethMap, { ColorLegend } from '../../components/charts/ChoroplethMap'
import { ChartSkeleton } from '../../components/ui/LoadingSkeleton'
import { formatEur } from '../../utils/format'
import type { Insight } from '../../utils/insights'
import {
  getTransferenciasPorCcaa,
  getTransferenciasSerie,
  getCcaaYears,
  type TransferenciasCcaa,
  type TransferenciasSerie,
} from '../../db/queries/ccaa'

// Toggle simple plan / ejecucion (sin modo comparativa)
function FuenteToggle({
  fuente,
  onChange,
}: {
  fuente: 'plan' | 'ejecucion'
  onChange: (f: 'plan' | 'ejecucion') => void
}) {
  return (
    <div className="flex rounded-lg border border-gray-300 bg-white text-sm font-medium overflow-hidden shadow-sm">
      {(['plan', 'ejecucion'] as const).map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={`px-3 py-1.5 capitalize transition-colors ${
            fuente === f ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          {f === 'plan' ? 'Plan' : 'Ejecución'}
        </button>
      ))}
    </div>
  )
}

export default function Transferencias() {
  const [fuente, setFuente] = useState<'plan' | 'ejecucion'>('ejecucion')
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)

  // Cargar años disponibles en las tablas CCAA (solo hasta 2023)
  useEffect(() => {
    getCcaaYears().then((ys) => {
      setAvailableYears(ys)
      setSelectedYear(ys.length > 0 ? Math.max(...ys) : null)
    }).catch(console.error)
  }, [])

  const [rows, setRows] = useState<TransferenciasCcaa[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedCcaa, setSelectedCcaa] = useState<string | null>(null)
  const [serie, setSerie] = useState<TransferenciasSerie[]>([])
  const [loadingSerie, setLoadingSerie] = useState(false)

  // Cargar totales por CCAA para el año/fuente seleccionados
  useEffect(() => {
    if (selectedYear == null) return
    setLoading(true)
    getTransferenciasPorCcaa(selectedYear, fuente)
      .then(setRows)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedYear, fuente])

  // Cargar serie histórica cuando se selecciona una CCAA
  useEffect(() => {
    if (!selectedCcaa) { setSerie([]); return }
    setLoadingSerie(true)
    getTransferenciasSerie(selectedCcaa, fuente)
      .then(setSerie)
      .catch(console.error)
      .finally(() => setLoadingSerie(false))
  }, [selectedCcaa, fuente])  // serie histórica abarca todos los años disponibles

  // Mapa ccaa_cod → total para el coroplético
  const mapData = useMemo<Record<string, number>>(
    () => Object.fromEntries(rows.map((r) => [r.ccaa_cod, r.total])),
    [rows],
  )

  // Escala de color (dominio dinámico)
  const maxTotal = useMemo(() => Math.max(...rows.map((r) => r.total), 1), [rows])
  const colorScale = useMemo(
    () => scaleSequential(interpolateBlues).domain([0, maxTotal]),
    [maxTotal],
  )

  const totalNacional = rows.reduce((s, r) => s + r.total, 0)
  const top1 = rows[0]

  const insights: Insight[] = loading || rows.length === 0 ? [] : [
    ...(top1 ? [{
      label: 'Mayor receptora',
      value: top1.ccaa_nom,
      trendValue: formatEur(top1.total),
      trend: 'neutral' as const,
      description: `${top1.ccaa_nom} recibió ${formatEur(top1.total)} en transferencias del Estado en ${selectedYear ?? ''}, el ${((top1.total / totalNacional) * 100).toFixed(1)}% del total nacional.`,
    }] : []),
    {
      label: 'Total nacional',
      value: formatEur(totalNacional),
      trendValue: `${rows.length} CCAA`,
      trend: 'neutral' as const,
      description: `Suma de transferencias corrientes (cap. 4) y de capital (cap. 7) del Estado a todas las Comunidades Autónomas en ${selectedYear ?? ''} según ${fuente === 'plan' ? 'el presupuesto aprobado' : 'la ejecución liquidada'}.`,
    },
    ...(top1 && rows.length > 1 ? [{
      label: 'Corrientes vs capital',
      value: `${((rows.reduce((s, r) => s + r.corriente, 0) / totalNacional) * 100).toFixed(0)}% corrientes`,
      trendValue: `${((rows.reduce((s, r) => s + r.capital, 0) / totalNacional) * 100).toFixed(0)}% capital`,
      trend: 'neutral' as const,
      description: 'Las transferencias corrientes (financiación ordinaria de servicios públicos) suelen representar la mayor parte. Las de capital financian inversiones y proyectos estructurales.',
    }] : []),
  ]

  const selectedRow = rows.find((r) => r.ccaa_cod === selectedCcaa)

  return (
    <div className="space-y-8">
      <PageHeader
        title="Transferencias a CCAA"
        subtitle={`Estado · ${fuente === 'plan' ? 'Plan' : 'Ejecución'}${selectedYear ? ` ${selectedYear}` : ''}`}
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
            <FuenteToggle fuente={fuente} onChange={setFuente} />
          </div>
        }
      />

      <ContextBox title="Transferencias del Estado a las Comunidades Autónomas">
        <p>
          Las transferencias representan la principal vía de financiación autonómica desde el
          Estado central. Se articulan principalmente a través del{' '}
          <strong>Sistema de Financiación Autonómica</strong> (capítulo 4, corrientes) y los{' '}
          <strong>fondos de inversión y compensación</strong> (capítulo 7, capital).
        </p>
        <p>
          Los datos aquí mostrados corresponden a los <strong>ingresos por transferencias</strong>{' '}
          de cada CCAA (capítulos 4 y 7 de su presupuesto de ingresos), que incluyen tanto las
          transferencias del Estado como otras procedentes del sistema de financiación. Fuente:
          Ministerio de Hacienda (SGCIEF).
        </p>
      </ContextBox>

      <InsightsPanel insights={insights} isLoading={loading} />

      {/* Mapa + tabla */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Mapa (3/5) */}
        <section className="lg:col-span-3">
          <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
            <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
              Mapa de transferencias · {selectedYear ?? '—'}
            </h2>
            <p className="text-xs text-[var(--color-ink-muted)] mb-3">
              Haz clic en una comunidad para ver su evolución histórica.
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
                  label="Total transferencias (M€)"
                />
              </>
            )}
          </div>
          <p className="mt-1.5 text-[0.7rem] text-[var(--color-ink-faint)]">
            Canarias aparece en su posición geográfica real (SO). Ceuta y Melilla pueden no ser visibles a esta escala.
          </p>
        </section>

        {/* Tabla (2/5) */}
        <section className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-3">
            Ranking por CCAA · {selectedYear ?? '—'}
          </h2>
          <div className="overflow-x-auto border border-[var(--color-rule)] bg-white">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>CCAA</th>
                  <th>Total (M€)</th>
                  <th>% s/total</th>
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
                  rows.map((r) => (
                    <tr
                      key={r.ccaa_cod}
                      className={`cursor-pointer transition-colors hover:bg-blue-50/50 ${
                        selectedCcaa === r.ccaa_cod ? 'bg-blue-50' : ''
                      }`}
                      onClick={() =>
                        setSelectedCcaa((prev) => (prev === r.ccaa_cod ? null : r.ccaa_cod))
                      }
                    >
                      <td className="font-medium">{r.ccaa_nom}</td>
                      <td>{formatEur(r.total)}</td>
                      <td>
                        {totalNacional > 0
                          ? `${((r.total / totalNacional) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {!loading && rows.length > 0 && (
                <tfoot>
                  <tr className="total-row">
                    <td>Total</td>
                    <td>{formatEur(totalNacional)}</td>
                    <td>100,0%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      </div>

      {/* Panel de detalle: evolución histórica de la CCAA seleccionada */}
      {selectedCcaa && (
        <section>
          <div className="border border-[var(--color-rule)] bg-white px-5 pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                Evolución histórica · {selectedRow?.ccaa_nom ?? selectedCcaa}
              </h2>
              <button
                onClick={() => setSelectedCcaa(null)}
                className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              >
                ✕ Cerrar
              </button>
            </div>
            <p className="text-xs text-[var(--color-ink-muted)] mb-4">
              Transferencias corrientes y de capital en M€ · {fuente === 'plan' ? 'plan' : 'ejecución'}.
            </p>
            {loadingSerie ? (
              <ChartSkeleton height={240} />
            ) : (
              <LineChart
                categories={serie.map((s) => String(s.year))}
                series={[
                  {
                    name: 'Total',
                    data: serie.map((s) => s.total),
                    color: '#326891',
                  },
                  {
                    name: 'Corrientes',
                    data: serie.map((s) => s.corriente),
                    color: '#5a9ab0',
                    dashed: true,
                  },
                  {
                    name: 'Capital',
                    data: serie.map((s) => s.capital),
                    color: '#e07b39',
                    dashed: true,
                  },
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

      {/* Tabla de detalle corriente/capital */}
      {!loading && rows.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-3">
            Desglose corriente / capital · {selectedYear ?? '—'}
          </h2>
          <div className="overflow-x-auto border border-[var(--color-rule)] bg-white">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>CCAA</th>
                  <th>Corrientes (cap. 4)</th>
                  <th>Capital (cap. 7)</th>
                  <th>Total</th>
                  <th>% capital</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ccaa_cod}>
                    <td className="font-medium">{r.ccaa_nom}</td>
                    <td>{formatEur(r.corriente)}</td>
                    <td>{formatEur(r.capital)}</td>
                    <td>{formatEur(r.total)}</td>
                    <td>
                      {r.total > 0
                        ? `${((r.capital / r.total) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td>Total</td>
                  <td>{formatEur(rows.reduce((s, r) => s + r.corriente, 0))}</td>
                  <td>{formatEur(rows.reduce((s, r) => s + r.capital, 0))}</td>
                  <td>{formatEur(totalNacional)}</td>
                  <td>
                    {totalNacional > 0
                      ? `${((rows.reduce((s, r) => s + r.capital, 0) / totalNacional) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
                      : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">
            Fuente: Ministerio de Hacienda · SGCIEF. Datos en M€.
          </p>
        </section>
      )}
    </div>
  )
}
