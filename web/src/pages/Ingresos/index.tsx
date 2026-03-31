import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/layout/PageHeader'
import ContextBox from '../../components/ui/ContextBox'
import KpiCard from '../../components/ui/KpiCard'
import InsightsPanel from '../../components/ui/InsightsPanel'
import BarChart from '../../components/charts/BarChart'
import LineChart from '../../components/charts/LineChart'
import { ChartSkeleton } from '../../components/ui/LoadingSkeleton'
import { useFilters } from '../../store/filters'
import InfoTooltip from '../../components/ui/InfoTooltip'
import {
  getIngresosPorCapitulo,
  getTotalIngresosPorAnio,
  CAPITULO_INGRESOS,
  CAPITULO_INGRESOS_TOOLTIP,
  type IngresosAnuales,
  type TotalAnual,
} from '../../db/queries/ingresos'
import { formatEur, formatPct } from '../../utils/format'
import type { Insight } from '../../utils/insights'

export default function Ingresos() {
  const { selectedYear, entityType, viewMode } = useFilters()
  const fuente = viewMode === 'ejecucion' ? 'ejecucion' : 'plan'

  const [caps, setCaps] = useState<IngresosAnuales[]>([])
  const [historico, setHistorico] = useState<TotalAnual[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getIngresosPorCapitulo(selectedYear, entityType, fuente),
      getTotalIngresosPorAnio(entityType, fuente),
    ])
      .then(([c, h]) => {
        setCaps(c)
        setHistorico(h)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedYear, entityType, fuente])

  const total = caps.reduce((s, r) => s + (r.importe ?? 0), 0)
  const prevYear = historico.find((h) => h.year === selectedYear - 1)
  const currYear = historico.find((h) => h.year === selectedYear)
  const yoyRatio =
    prevYear && currYear && prevYear.total > 0
      ? (currYear.total - prevYear.total) / prevYear.total
      : null

  // Excluir cap 9 (pasivos financieros) de la barra — ya excluido en la query
  const capsFiltrados = caps.filter((c) => c.capitulo !== 8 && c.capitulo !== 9)

  // Insights
  const totalNoFin = caps.filter((c) => c.capitulo !== 8 && c.capitulo !== 9)
    .reduce((s, r) => s + (r.importe ?? 0), 0)
  const totalImpuestos = caps.filter((c) => c.capitulo === 1 || c.capitulo === 2)
    .reduce((s, r) => s + (r.importe ?? 0), 0)
  const cap9 = caps.find((c) => c.capitulo === 9)
  const totalConFin = caps.reduce((s, r) => s + (r.importe ?? 0), 0)
  const maxCap = capsFiltrados.length > 0
    ? capsFiltrados.reduce((a, b) => (b.importe > a.importe ? b : a))
    : null

  const insights: Insight[] = loading || caps.length === 0 ? [] : [
    {
      label: 'Peso de los impuestos',
      value: totalNoFin > 0
        ? `${((totalImpuestos / totalNoFin) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
        : '—',
      description: `Los capítulos 1 (directos) y 2 (indirectos) representan ${totalNoFin > 0 ? ((totalImpuestos / totalNoFin) * 100).toFixed(1) : '—'}% de los ingresos no financieros. Son la columna vertebral de la financiación del Estado.`,
    },
    {
      label: 'Mayor fuente de ingresos',
      value: maxCap ? (CAPITULO_INGRESOS[maxCap.capitulo] ?? `Cap. ${maxCap.capitulo}`) : '—',
      trendValue: maxCap && totalNoFin > 0
        ? `${((maxCap.importe / totalNoFin) * 100).toFixed(1)}% del total`
        : undefined,
      trend: 'neutral',
      description: maxCap
        ? `El capítulo ${maxCap.capitulo} (${formatEur(maxCap.importe)}) es la mayor fuente de ingresos no financieros en ${selectedYear}.`
        : '',
    },
    ...(cap9 && totalConFin > 0 ? [{
      label: 'Dependencia de deuda (cap. 9)',
      value: `${((cap9.importe / totalConFin) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`,
      trend: cap9.importe / totalConFin > 0.20 ? 'down' as const : 'neutral' as const,
      description: `El capítulo 9 (Pasivos financieros, ${formatEur(cap9.importe)}) recoge la deuda nueva emitida. Un peso elevado indica que el Estado financia una parte relevante de su gasto mediante endeudamiento.`,
    }] : []),
  ]
  const barCategories = capsFiltrados.map((c) => CAPITULO_INGRESOS[c.capitulo] ?? `Cap. ${c.capitulo}`)
  const barData = capsFiltrados.map((c) => c.importe)

  const histYears = historico.map((h) => String(h.year))
  const histData = historico.map((h) => h.total)

  return (
    <div className="space-y-8">
      <PageHeader
        title="Ingresos"
        subtitle={`${entityType} · ${fuente === 'plan' ? 'Plan' : 'Ejecución'} ${selectedYear}`}
      />

      <ContextBox title="Ingresos del sector público">
        <p>
          Los ingresos del Estado se clasifican en nueve capítulos. Los{' '}
          <strong>capítulos 1 y 2</strong> recogen los impuestos directos (IRPF, Sociedades) e
          indirectos (IVA, Especiales). El <strong>capítulo 9</strong> (Pasivos financieros)
          incluye la deuda pública emitida para financiar el déficit.
        </p>
        <p>
          Para ver el detalle de la recaudación tributaria por figura impositiva (AEAT), consulta
          la sección{' '}
          <Link to="/ingresos/impuestos" className="underline text-[var(--color-accent)]">
            Impuestos
          </Link>
          .
        </p>
      </ContextBox>

      <InsightsPanel insights={insights} isLoading={loading} />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        <KpiCard
          title={`Total ingresos no financieros (${fuente})`}
          value={loading ? '—' : formatEur(total)}
          trendValue={formatPct(yoyRatio) ? `${formatPct(yoyRatio)} vs año anterior` : undefined}
          trend={formatPct(yoyRatio) ? (yoyRatio! >= 0 ? 'up' : 'down') : undefined}
          subtitle={`${selectedYear}`}
          accent
        />
        <KpiCard
          title="Mayor capítulo"
          value={
            loading || capsFiltrados.length === 0
              ? '—'
              : formatEur(Math.max(...capsFiltrados.map((c) => c.importe)))
          }
          subtitle={
            capsFiltrados.length > 0
              ? CAPITULO_INGRESOS[
                  capsFiltrados.reduce((a, b) => (b.importe > a.importe ? b : a)).capitulo
                ]
              : undefined
          }
        />
        <KpiCard
          title="Número de capítulos"
          value={loading ? '—' : String(capsFiltrados.length)}
          subtitle="capítulos con datos"
        />
      </div>

      {/* Bar chart — ingresos por capítulo */}
      <section>
        <div className="chart-card-rule bg-white border border-[var(--color-rule)] px-5 pt-4 pb-2">
          <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
            Ingresos por capítulo · {selectedYear}
          </h2>
          <p className="text-xs text-[var(--color-ink-muted)] mb-4">
            Importe en millones de €. Excluye capítulos 8 y 9 (operaciones financieras).
          </p>
          {loading ? (
            <ChartSkeleton height={280} />
          ) : (
            <BarChart
              categories={barCategories}
              series={[
                {
                  name: 'Ingresos',
                  data: barData,
                  color: '#326891',
                },
              ]}
              height={280}
            />
          )}
        </div>
        <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">
          Fuente: SEPG / IGAE.
        </p>
      </section>

      {/* Line chart — evolución histórica */}
      <section>
        <div className="chart-card-rule bg-white border border-[var(--color-rule)] px-5 pt-4 pb-2">
          <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
            Evolución de ingresos no financieros · {entityType}
          </h2>
          <p className="text-xs text-[var(--color-ink-muted)] mb-4">
            Serie histórica en millones de €.
          </p>
          {loading ? (
            <ChartSkeleton height={260} />
          ) : (
            <LineChart
              categories={histYears}
              series={[{ name: 'Ingresos', data: histData, color: '#326891' }]}
              height={260}
              smooth
            />
          )}
        </div>
        <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">
          Fuente: SEPG / IGAE.
        </p>
      </section>

      {/* Table — desglose por capítulo */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-3">
          Desglose por capítulo
        </h2>
        <div className="overflow-x-auto border border-[var(--color-rule)] bg-white">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Capítulo</th>
                <th>Descripción</th>
                <th>Importe (M€)</th>
                <th>% del total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center text-[var(--color-ink-muted)] py-8">
                    Cargando…
                  </td>
                </tr>
              ) : (
                caps.map((c) => (
                  <tr key={c.capitulo}>
                    <td className="font-mono">{c.capitulo}</td>
                    <td>
                      {CAPITULO_INGRESOS[c.capitulo] ?? '—'}
                      {CAPITULO_INGRESOS_TOOLTIP[c.capitulo] && (
                        <InfoTooltip content={CAPITULO_INGRESOS_TOOLTIP[c.capitulo]} />
                      )}
                    </td>
                    <td>{formatEur(c.importe)}</td>
                    <td>
                      {total > 0
                        ? `${((c.importe / total) * 100).toLocaleString('es-ES', {
                            maximumFractionDigits: 1,
                          })}%`
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {!loading && caps.length > 0 && (
              <tfoot>
                <tr className="total-row">
                  <td colSpan={2}>Total</td>
                  <td>{formatEur(total)}</td>
                  <td>100,0%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">
          Fuente: SEPG (plan) / IGAE (ejecución).
        </p>
      </section>
    </div>
  )
}
