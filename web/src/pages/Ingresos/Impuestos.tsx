import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/layout/PageHeader'
import ContextBox from '../../components/ui/ContextBox'
import KpiCard from '../../components/ui/KpiCard'
import InsightsPanel from '../../components/ui/InsightsPanel'
import LineChart from '../../components/charts/LineChart'
import BarChart from '../../components/charts/BarChart'
import { ChartSkeleton } from '../../components/ui/LoadingSkeleton'
import { useFilters } from '../../store/filters'
import {
  getRecaudacionHistorica,
  getRecaudacionAnio,
  getAniosAeat,
  IMPUESTO_COLORS,
  type RecaudacionAnual,
  type RecaudacionRow,
} from '../../db/queries/aeat'
import { formatEur } from '../../utils/format'
import type { Insight } from '../../utils/insights'

const IMPUESTOS_ORDEN = ['IRPF', 'IVA', 'Sociedades', 'Especiales', 'Aduanas', 'No Residentes', 'Otros']

export default function Impuestos() {
  const { selectedYear, setSelectedYear } = useFilters()

  const [historico, setHistorico] = useState<RecaudacionAnual[]>([])
  const [anioDetalle, setAnioDetalle] = useState<RecaudacionRow[]>([])
  const [aniosAeat, setAniosAeat] = useState<number[]>([])
  const [loading, setLoading] = useState(true)

  // Asegurar que el año seleccionado es válido para AEAT (1995-2024)
  const yearAeat = aniosAeat.includes(selectedYear)
    ? selectedYear
    : aniosAeat[aniosAeat.length - 1] ?? selectedYear

  useEffect(() => {
    setLoading(true)
    Promise.all([getRecaudacionHistorica(), getAniosAeat()])
      .then(([h, anos]) => {
        setHistorico(h)
        setAniosAeat(anos)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (yearAeat) {
      getRecaudacionAnio(yearAeat).then(setAnioDetalle).catch(console.error)
    }
  }, [yearAeat])

  // Construir series históricas por impuesto
  const allYears = [...new Set(historico.map((r) => r.year))].sort()
  const impuestos = [...new Set(historico.map((r) => r.impuesto))]
    .filter((i) => IMPUESTOS_ORDEN.includes(i))
    .sort((a, b) => IMPUESTOS_ORDEN.indexOf(a) - IMPUESTOS_ORDEN.indexOf(b))

  const lineCategories = allYears.map(String)
  const lineSeries = impuestos.map((imp) => {
    const byYear = new Map(
      historico.filter((r) => r.impuesto === imp).map((r) => [r.year, r.total]),
    )
    return {
      name: imp,
      data: allYears.map((y) => byYear.get(y) ?? null) as number[],
      color: IMPUESTO_COLORS[imp],
    }
  })

  // Totales del año seleccionado
  const totalNeto = anioDetalle.reduce((s, r) => s + r.importe_neto, 0)
  const irpf = anioDetalle.find((r) => r.impuesto === 'IRPF')
  const iva = anioDetalle.find((r) => r.impuesto === 'IVA')

  // Máximo histórico de recaudación total
  const totalPorAnio = allYears.map((y) => ({
    year: y,
    total: historico.filter((r) => r.year === y).reduce((s, r) => s + r.total, 0),
  }))
  const maxAnio = totalPorAnio.reduce<{ year: number; total: number } | null>(
    (acc, d) => (!acc || d.total > acc.total ? d : acc), null,
  )
  const prevAnioTotal = totalPorAnio.find((d) => d.year === yearAeat - 1)
  const currAnioTotal = totalPorAnio.find((d) => d.year === yearAeat)
  const yoyTotal = prevAnioTotal && currAnioTotal && prevAnioTotal.total > 0
    ? (currAnioTotal.total - prevAnioTotal.total) / prevAnioTotal.total
    : null

  // Ratio devoluciones IVA
  const ivaBruto = iva?.importe_bruto ?? 0
  const ivaDev = Math.abs(iva?.devoluciones ?? 0)
  const ratioDevIva = ivaBruto > 0 ? ivaDev / ivaBruto : null

  const insights: Insight[] = loading || anioDetalle.length === 0 ? [] : [
    ...(yoyTotal != null ? [{
      label: 'Variación recaudación total',
      value: `${yoyTotal >= 0 ? '+' : ''}${(yoyTotal * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`,
      trend: yoyTotal >= 0 ? 'up' as const : 'down' as const,
      trendValue: `vs ${yearAeat - 1}`,
      description: `La recaudación ${yoyTotal >= 0 ? 'creció' : 'cayó'} ${Math.abs(yoyTotal * 100).toFixed(1)}% respecto al año anterior. Los ingresos tributarios son un indicador directo de la actividad económica.`,
    }] : []),
    ...(ratioDevIva != null ? [{
      label: 'Devoluciones sobre bruto IVA',
      value: `${(ratioDevIva * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`,
      trend: 'neutral' as const,
      description: `Por cada 100 € recaudados en IVA bruto, ${(ratioDevIva * 100).toFixed(1)} € se devuelven (principalmente a exportadores y en ciclo recesivo). Un ratio alto indica mayor actividad exportadora o menor consumo interno.`,
    }] : []),
    ...(maxAnio ? [{
      label: 'Máximo histórico',
      value: formatEur(maxAnio.total),
      trendValue: String(maxAnio.year),
      trend: 'up' as const,
      description: `${maxAnio.year} registró la mayor recaudación tributaria de la serie histórica (1995–2024). ${yearAeat === maxAnio.year ? 'El año actual alcanza ese máximo.' : `La recaudación de ${yearAeat} representa el ${((totalNeto / maxAnio.total) * 100).toFixed(1)}% de ese máximo.`}`,
    }] : []),
  ]

  // Bar chart: bruto vs devoluciones vs neto para año seleccionado
  const barCats = anioDetalle.map((r) => r.impuesto)
  const barNeto = anioDetalle.map((r) => r.importe_neto)

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-xs text-[var(--color-ink-muted)]">
        <Link to="/ingresos" className="hover:text-[var(--color-accent)]">
          ← Ingresos
        </Link>
      </div>

      <PageHeader
        title="Recaudación Tributaria"
        subtitle={`AEAT · ${yearAeat}`}
      />

      <ContextBox title="La recaudación tributaria en España">
        <p>
          La <strong>Agencia Tributaria (AEAT)</strong> gestiona los principales impuestos
          estatales: IRPF, IVA, Impuesto sobre Sociedades, Impuestos Especiales (hidrocarburos,
          tabaco, alcohol) y Aduanas. Los datos muestran la recaudación{' '}
          <strong>líquida</strong> (bruta menos devoluciones).
        </p>
        <p>
          El IRPF y el IVA representan más del 75% de la recaudación total. El Impuesto sobre
          Sociedades es más volátil y sensible al ciclo económico.
        </p>
      </ContextBox>

      <InsightsPanel insights={insights} isLoading={loading} />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        <KpiCard
          title={`Total recaudación neta ${yearAeat}`}
          value={loading ? '—' : formatEur(totalNeto)}
          subtitle="Todos los impuestos"
          accent
        />
        <KpiCard
          title="IRPF"
          value={irpf ? formatEur(irpf.importe_neto) : '—'}
          subtitle={
            irpf && totalNeto > 0
              ? `${((irpf.importe_neto / totalNeto) * 100).toFixed(1)}% del total`
              : undefined
          }
        />
        <KpiCard
          title="IVA"
          value={iva ? formatEur(iva.importe_neto) : '—'}
          subtitle={
            iva && totalNeto > 0
              ? `${((iva.importe_neto / totalNeto) * 100).toFixed(1)}% del total`
              : undefined
          }
        />
      </div>

      {/* Evolución histórica */}
      <section>
        <div className="chart-card-rule bg-white border border-[var(--color-rule)] px-5 pt-4 pb-2">
          <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
            Evolución de la recaudación por impuesto · 1995–2024
          </h2>
          <p className="text-xs text-[var(--color-ink-muted)] mb-4">
            Recaudación líquida anual en millones de €.
          </p>
          {loading ? (
            <ChartSkeleton height={300} />
          ) : (
            <LineChart
              categories={lineCategories}
              series={lineSeries}
              height={300}
              smooth
            />
          )}
        </div>
        <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">
          Fuente: AEAT, Anuario Estadístico de la Agencia Tributaria.
        </p>
      </section>

      {/* Detalle año seleccionado */}
      <section>
        <div className="chart-card-rule bg-white border border-[var(--color-rule)] px-5 pt-4 pb-2">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">
              Recaudación neta por impuesto · {yearAeat}
            </h2>
            <select
              value={yearAeat}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="text-xs border border-[var(--color-rule)] rounded px-2 py-1 bg-white text-[var(--color-ink)]"
            >
              {aniosAeat.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-[var(--color-ink-muted)] mb-4">Millones de €.</p>
          {anioDetalle.length === 0 ? (
            <ChartSkeleton height={240} />
          ) : (
            <BarChart
              categories={barCats}
              series={[{ name: 'Recaudación neta', data: barNeto, color: '#326891' }]}
              height={240}
              horizontal
            />
          )}
        </div>
        <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">
          Fuente: AEAT, Anuario Estadístico.
        </p>
      </section>

      {/* Table */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-3">
          Detalle por impuesto · {yearAeat}
        </h2>
        <div className="overflow-x-auto border border-[var(--color-rule)] bg-white">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Impuesto</th>
                <th>Bruto (M€)</th>
                <th>Devoluciones (M€)</th>
                <th>Neto (M€)</th>
                <th>% del total</th>
              </tr>
            </thead>
            <tbody>
              {anioDetalle.map((r) => (
                <tr key={r.impuesto}>
                  <td>{r.impuesto}</td>
                  <td>{formatEur(r.importe_bruto)}</td>
                  <td className="text-red-700">
                    {r.devoluciones ? `−${formatEur(Math.abs(r.devoluciones))}` : '—'}
                  </td>
                  <td className="font-medium">{formatEur(r.importe_neto)}</td>
                  <td>
                    {totalNeto > 0
                      ? `${((r.importe_neto / totalNeto) * 100).toLocaleString('es-ES', {
                          maximumFractionDigits: 1,
                        })}%`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            {anioDetalle.length > 0 && (
              <tfoot>
                <tr className="total-row">
                  <td>Total</td>
                  <td>{formatEur(anioDetalle.reduce((s, r) => s + (r.importe_bruto ?? 0), 0))}</td>
                  <td className="text-red-700">
                    −{formatEur(Math.abs(anioDetalle.reduce((s, r) => s + (r.devoluciones ?? 0), 0)))}
                  </td>
                  <td>{formatEur(totalNeto)}</td>
                  <td>100,0%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">
          Fuente: AEAT, Anuario Estadístico de la Agencia Tributaria.
        </p>
      </section>
    </div>
  )
}
