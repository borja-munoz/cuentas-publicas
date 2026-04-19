import { useEffect, useState } from 'react'
import PageHeader from '../../components/layout/PageHeader'
import ContextBox from '../../components/ui/ContextBox'
import KpiCard from '../../components/ui/KpiCard'
import InsightsPanel from '../../components/ui/InsightsPanel'
import BarChart from '../../components/charts/BarChart'
import { ChartSkeleton } from '../../components/ui/LoadingSkeleton'
import { useFilters } from '../../store/filters'
import InfoTooltip from '../../components/ui/InfoTooltip'
import { getComparativaPorCapitulo, CAPITULO_GASTOS, CAPITULO_GASTOS_TOOLTIP } from '../../db/queries/gastos'
import { formatEur } from '../../utils/format'
import type { Insight } from '../../utils/insights'

interface ComparativaRow {
  capitulo: number
  plan: number
  ejecucion: number
  desviacion: number
}

export default function Comparativa() {
  const { selectedYear, entityType, setPageFilters } = useFilters()
  const [rows, setRows] = useState<ComparativaRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setPageFilters({ showViewMode: false })
    return () => setPageFilters({ showViewMode: false })
  }, [setPageFilters])

  useEffect(() => {
    setLoading(true)
    getComparativaPorCapitulo(selectedYear, entityType)
      .then(setRows)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedYear, entityType])

  const CAPS_OP = [1, 2, 3, 4, 6, 7]
  const rowsOp = rows.filter((r) => CAPS_OP.includes(r.capitulo))

  const totalPlan = rowsOp.reduce((s, r) => s + (r.plan ?? 0), 0)
  const totalEjec = rowsOp.reduce((s, r) => s + (r.ejecucion ?? 0), 0)
  const totalDesv = totalEjec - totalPlan
  const pctEjecucion = totalPlan > 0 ? totalEjec / totalPlan : null

  const barCats = rowsOp.map((r) => CAPITULO_GASTOS[r.capitulo] ?? `Cap. ${r.capitulo}`)
  const barPlan = rowsOp.map((r) => r.plan)
  const barEjec = rowsOp.map((r) => r.ejecucion)

  // Años con ejecución disponibles: 2015-2024
  const hasEjecucion = selectedYear >= 2015 && selectedYear <= 2024

  // Capítulo con menor tasa de ejecución (más infraejecutado)
  const minEjecCap = hasEjecucion
    ? rowsOp
        .filter((r) => r.plan > 0 && r.ejecucion > 0)
        .reduce<(typeof rowsOp)[0] | null>(
          (acc, r) => (!acc || r.ejecucion / r.plan < acc.ejecucion / acc.plan ? r : acc),
          null,
        )
    : null

  const insights: Insight[] = loading || rowsOp.length === 0 || !hasEjecucion ? [] : [
    {
      label: 'Tasa de ejecución global',
      value: pctEjecucion != null
        ? `${(pctEjecucion * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
        : '—',
      trend: pctEjecucion != null
        ? pctEjecucion >= 0.95 ? 'up' : pctEjecucion >= 0.85 ? 'neutral' : 'down'
        : 'neutral',
      description: `Por cada 100 € presupuestados en gastos operacionales, se ejecutaron ${pctEjecucion != null ? (pctEjecucion * 100).toFixed(1) : '—'} €. Un 95–100% indica ejecución completa; por debajo del 85% sugiere crédito no utilizado significativo.`,
    },
    {
      label: 'Crédito no ejecutado',
      value: formatEur(Math.max(0, totalPlan - totalEjec)),
      trend: totalPlan - totalEjec > 5000 ? 'down' : 'neutral',
      description: `El crédito aprobado pero no ejecutado en ${selectedYear} asciende a ${formatEur(Math.max(0, totalPlan - totalEjec))}. Puede deberse a retrasos en proyectos, cambios en la actividad económica o gestión del crédito.`,
    },
    ...(minEjecCap ? [{
      label: 'Menor ejecución por capítulo',
      value: CAPITULO_GASTOS[minEjecCap.capitulo] ?? `Cap. ${minEjecCap.capitulo}`,
      trendValue: minEjecCap.plan > 0
        ? `${((minEjecCap.ejecucion / minEjecCap.plan) * 100).toFixed(1)}% ejecutado`
        : undefined,
      trend: 'down' as const,
      description: `El capítulo ${minEjecCap.capitulo} es el que presenta la menor tasa de ejecución en ${selectedYear} (${formatEur(minEjecCap.ejecucion)} ejecutados de ${formatEur(minEjecCap.plan)} planificados).`,
    }] : []),
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="Plan vs. Ejecución"
        subtitle={`${entityType} · Gastos · ${selectedYear}`}
      />

      <ContextBox title="¿Qué mide la comparativa plan-ejecución?">
        <p>
          El <strong>plan presupuestario</strong> recoge los créditos aprobados en los
          Presupuestos Generales del Estado. La <strong>ejecución</strong> muestra las
          obligaciones reconocidas (gasto efectivamente comprometido) según el IGAE.
        </p>
        <p>
          Una desviación positiva indica que se gastó más de lo previsto; negativa, que no se
          ejecutó el crédito completo. Los datos de ejecución están disponibles desde 2015.
        </p>
      </ContextBox>

      {hasEjecucion && <InsightsPanel insights={insights} isLoading={loading} />}

      {!hasEjecucion && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Los datos de ejecución presupuestaria del IGAE están disponibles desde 2015. Selecciona
          un año entre 2015 y 2024 para ver la comparativa.
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <KpiCard
          title="Gastos plan"
          value={loading ? '—' : formatEur(totalPlan)}
          subtitle={`${selectedYear} · caps. 1–7`}
          accent
        />
        <KpiCard
          title="Gastos ejecutados"
          value={loading || !hasEjecucion ? '—' : formatEur(totalEjec)}
          subtitle={hasEjecucion ? `${selectedYear}` : 'No disponible'}
        />
        <KpiCard
          title="Desviación"
          value={loading || !hasEjecucion ? '—' : formatEur(totalDesv)}
          trendValue={
            pctEjecucion != null
              ? `${(pctEjecucion * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}% de ejecución`
              : undefined
          }
          trend={totalDesv === 0 ? 'neutral' : totalDesv > 0 ? 'down' : 'up'}
        />
        <KpiCard
          title="Crédito no ejecutado"
          value={loading || !hasEjecucion ? '—' : formatEur(Math.max(0, totalPlan - totalEjec))}
          subtitle="Presupuesto no utilizado"
        />
      </div>

      {/* Grouped bar chart */}
      {hasEjecucion && (
        <section>
          <div className="chart-card-rule bg-white border border-[var(--color-rule)] px-5 pt-4 pb-2">
            <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
              Plan vs. ejecución por capítulo · {selectedYear}
            </h2>
            <p className="text-xs text-[var(--color-ink-muted)] mb-4">
              Millones de €. Capítulos operacionales (1–7).
            </p>
            {loading ? (
              <ChartSkeleton height={300} />
            ) : (
              <BarChart
                categories={barCats}
                series={[
                  { name: 'Plan', data: barPlan, color: '#B82A2A' },
                  { name: 'Ejecución', data: barEjec, color: '#C89B3C' },
                ]}
                height={300}
              />
            )}
          </div>
          <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">
            Fuente: SEPG (plan) · IGAE (ejecución).
          </p>
        </section>
      )}

      {/* Table */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-3">
          Desglose por capítulo · {selectedYear}
        </h2>
        <div className="overflow-x-auto border border-[var(--color-rule)] bg-white">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Cap.</th>
                <th>Descripción</th>
                <th>Plan (M€)</th>
                {hasEjecucion && (
                  <>
                    <th>Ejecución (M€)</th>
                    <th>Desviación (M€)</th>
                    <th>% Ejecución</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={hasEjecucion ? 6 : 3} className="text-center text-[var(--color-ink-muted)] py-8">
                    Cargando…
                  </td>
                </tr>
              ) : (
                rowsOp.map((r) => {
                  const pct = r.plan > 0 ? r.ejecucion / r.plan : null
                  const desvNeg = r.desviacion < 0
                  return (
                    <tr key={r.capitulo}>
                      <td className="font-mono">{r.capitulo}</td>
                      <td>
                        {CAPITULO_GASTOS[r.capitulo] ?? '—'}
                        {CAPITULO_GASTOS_TOOLTIP[r.capitulo] && (
                          <InfoTooltip content={CAPITULO_GASTOS_TOOLTIP[r.capitulo]} />
                        )}
                      </td>
                      <td>{formatEur(r.plan)}</td>
                      {hasEjecucion && (
                        <>
                          <td>{r.ejecucion > 0 ? formatEur(r.ejecucion) : '—'}</td>
                          <td className={r.ejecucion > 0 ? (desvNeg ? 'text-emerald-700' : 'text-red-700') : ''}>
                            {r.ejecucion > 0 ? formatEur(r.desviacion) : '—'}
                          </td>
                          <td>
                            {pct != null && r.ejecucion > 0
                              ? `${(pct * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
                              : '—'}
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
            {!loading && rowsOp.length > 0 && (
              <tfoot>
                <tr className="total-row">
                  <td colSpan={2}>Total operacional</td>
                  <td>{formatEur(totalPlan)}</td>
                  {hasEjecucion && (
                    <>
                      <td>{formatEur(totalEjec)}</td>
                      <td className={totalDesv < 0 ? 'text-emerald-700' : 'text-red-700'}>
                        {formatEur(totalDesv)}
                      </td>
                      <td>
                        {pctEjecucion != null
                          ? `${(pctEjecucion * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
                          : '—'}
                      </td>
                    </>
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">
          Fuente: SEPG (plan) · IGAE (obligaciones reconocidas netas).
        </p>
      </section>
    </div>
  )
}
