import { useEffect, useState } from 'react'
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
  getIngresosComparativaPorCapitulo,
  getTotalIngresosPorAnio,
  CAPITULO_INGRESOS,
  CAPITULO_INGRESOS_TOOLTIP,
  type IngresosAnuales,
  type TotalAnual,
} from '../../db/queries/ingresos'
import { formatEur, formatPct } from '../../utils/format'
import type { Insight } from '../../utils/insights'

const entity = 'SS'

interface ComparativaRow {
  capitulo: number
  plan: number
  ejecucion: number
  desviacion: number
}

const EJECUCION_MIN = 2015
const EJECUCION_MAX = 2024

export default function SSIngresos() {
  const { selectedYear, viewMode, setPageFilters, setViewMode } = useFilters()
  const fuente = viewMode === 'ejecucion' ? 'ejecucion' : 'plan'
  const isComparativa = viewMode === 'comparativa'
  const hasEjecucion = selectedYear >= EJECUCION_MIN && selectedYear <= EJECUCION_MAX

  useEffect(() => {
    setPageFilters({ showViewMode: true, showComparativa: true })
    return () => setPageFilters({ showViewMode: false, showComparativa: false })
  }, [setPageFilters])

  useEffect(() => {
    if (isComparativa && !hasEjecucion) setViewMode('plan')
  }, [isComparativa, hasEjecucion, setViewMode])

  const [caps, setCaps] = useState<IngresosAnuales[]>([])
  const [historico, setHistorico] = useState<TotalAnual[]>([])
  const [loading, setLoading] = useState(true)

  const [compRows, setCompRows] = useState<ComparativaRow[]>([])
  const [loadingComp, setLoadingComp] = useState(false)

  useEffect(() => {
    if (isComparativa) return
    setLoading(true)
    Promise.all([
      getIngresosPorCapitulo(selectedYear, entity, fuente),
      getTotalIngresosPorAnio(entity, fuente),
    ])
      .then(([c, h]) => { setCaps(c); setHistorico(h) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedYear, fuente, isComparativa])

  useEffect(() => {
    if (!isComparativa || !hasEjecucion) return
    setLoadingComp(true)
    getIngresosComparativaPorCapitulo(selectedYear, entity)
      .then(setCompRows)
      .catch(console.error)
      .finally(() => setLoadingComp(false))
  }, [selectedYear, isComparativa, hasEjecucion])

  const total = caps.reduce((s, r) => s + (r.importe ?? 0), 0)
  const prevYear = historico.find((h) => h.year === selectedYear - 1)
  const currYear = historico.find((h) => h.year === selectedYear)
  const yoyRatio =
    prevYear && currYear && prevYear.total > 0
      ? (currYear.total - prevYear.total) / prevYear.total
      : null

  const capsFiltrados = caps.filter((c) => c.capitulo !== 8 && c.capitulo !== 9)
  const totalNoFin = capsFiltrados.reduce((s, r) => s + (r.importe ?? 0), 0)
  const totalCotizaciones = caps.filter((c) => c.capitulo === 1)
    .reduce((s, r) => s + (r.importe ?? 0), 0)
  const cap9 = caps.find((c) => c.capitulo === 9)
  const totalConFin = caps.reduce((s, r) => s + (r.importe ?? 0), 0)
  const maxCap = capsFiltrados.length > 0
    ? capsFiltrados.reduce((a, b) => (b.importe > a.importe ? b : a))
    : null

  const barCategories = capsFiltrados.map((c) => CAPITULO_INGRESOS[c.capitulo] ?? `Cap. ${c.capitulo}`)
  const barData = capsFiltrados.map((c) => c.importe)
  const histYears = historico.map((h) => String(h.year))
  const histData = historico.map((h) => h.total)

  const insights: Insight[] = loading || caps.length === 0 ? [] : [
    {
      label: 'Peso de las cotizaciones (cap. 1)',
      value: totalNoFin > 0
        ? `${((totalCotizaciones / totalNoFin) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
        : '—',
      description: `Las cotizaciones sociales (capítulo 1) representan ${totalNoFin > 0 ? ((totalCotizaciones / totalNoFin) * 100).toFixed(1) : '—'}% de los ingresos no financieros de la Seguridad Social.`,
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
      description: `El capítulo 9 (Pasivos financieros, ${formatEur(cap9.importe)}) recoge la deuda nueva emitida.`,
    }] : []),
  ]

  const CAPS_OP = [1, 2, 3, 4, 6, 7]
  const compOp = compRows.filter((r) => CAPS_OP.includes(r.capitulo))
  const totalPlan = compOp.reduce((s, r) => s + (r.plan ?? 0), 0)
  const totalEjec = compOp.reduce((s, r) => s + (r.ejecucion ?? 0), 0)
  const totalDesv = totalEjec - totalPlan
  const pctEjecucion = totalPlan > 0 ? totalEjec / totalPlan : null

  const minEjecCap = compOp.length > 0
    ? compOp
        .filter((r) => r.plan > 0 && r.ejecucion > 0)
        .reduce<(typeof compOp)[0] | null>(
          (acc, r) => (!acc || r.ejecucion / r.plan < acc.ejecucion / acc.plan ? r : acc),
          null,
        )
    : null

  const compInsights: Insight[] = loadingComp || compOp.length === 0 ? [] : [
    {
      label: 'Tasa de ejecución global',
      value: pctEjecucion != null
        ? `${(pctEjecucion * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
        : '—',
      trend: pctEjecucion != null
        ? pctEjecucion >= 0.95 ? 'up' : pctEjecucion >= 0.85 ? 'neutral' : 'down'
        : 'neutral',
      description: `Por cada 100 € presupuestados en ingresos no financieros, se recaudaron ${pctEjecucion != null ? (pctEjecucion * 100).toFixed(1) : '—'} €.`,
    },
    {
      label: 'Desviación total',
      value: formatEur(Math.abs(totalDesv)),
      trend: totalDesv >= 0 ? 'up' : 'down',
      description: `Los ingresos ${totalDesv >= 0 ? 'superaron' : 'quedaron por debajo de'} lo planificado en ${formatEur(Math.abs(totalDesv))}.`,
    },
    ...(minEjecCap ? [{
      label: 'Menor ejecución por capítulo',
      value: CAPITULO_INGRESOS[minEjecCap.capitulo] ?? `Cap. ${minEjecCap.capitulo}`,
      trendValue: minEjecCap.plan > 0
        ? `${((minEjecCap.ejecucion / minEjecCap.plan) * 100).toFixed(1)}% ejecutado`
        : undefined,
      trend: 'down' as const,
      description: `El capítulo ${minEjecCap.capitulo} presenta la menor tasa de ejecución en ${selectedYear}.`,
    }] : []),
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="Ingresos"
        subtitle={`Seguridad Social · ${isComparativa ? `Plan vs Ejecución ${selectedYear}` : `${fuente === 'plan' ? 'Plan' : 'Ejecución'} ${selectedYear}`}`}
      />

      {!isComparativa && (
        <ContextBox title="Ingresos de la Seguridad Social">
          <p>
            Los ingresos de la Seguridad Social se financian principalmente a través de{' '}
            <strong>cotizaciones sociales</strong> (capítulo 1): aportaciones de trabajadores
            y empresas para cubrir las contingencias del sistema (jubilación, desempleo,
            incapacidad, sanidad).
          </p>
          <p>
            Las <strong>transferencias corrientes</strong> (capítulo 4) recogen las aportaciones
            del Estado para completar la financiación del sistema. El capítulo 9 (Pasivos
            financieros) registra el endeudamiento cuando los ingresos no cubren el gasto.
          </p>
        </ContextBox>
      )}

      {isComparativa && (
        <ContextBox title="¿Qué mide la comparativa plan-ejecución?">
          <p>
            El <strong>plan presupuestario</strong> recoge los créditos de ingresos aprobados en los
            Presupuestos Generales. La <strong>ejecución</strong> muestra los derechos reconocidos
            (ingresos efectivamente liquidados) según el IGAE.
          </p>
          <p>
            Una desviación positiva indica que se recaudó más de lo previsto; negativa, que no se
            alcanzó el objetivo. Los datos de ejecución están disponibles desde 2015.
          </p>
        </ContextBox>
      )}

      {isComparativa ? (
        hasEjecucion ? (
          <InsightsPanel insights={compInsights} isLoading={loadingComp} />
        ) : (
          <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Los datos de ejecución están disponibles desde 2015. Selecciona un año entre 2015 y 2024.
          </div>
        )
      ) : (
        <InsightsPanel insights={insights} isLoading={loading} />
      )}

      {isComparativa ? (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <KpiCard title="Ingresos plan" value={loadingComp ? '—' : formatEur(totalPlan)} subtitle={`${selectedYear} · caps. 1–7`} accent />
          <KpiCard title="Ingresos ejecutados" value={loadingComp || !hasEjecucion ? '—' : formatEur(totalEjec)} subtitle={hasEjecucion ? `${selectedYear}` : 'No disponible'} />
          <KpiCard
            title="Desviación"
            value={loadingComp || !hasEjecucion ? '—' : formatEur(totalDesv)}
            trendValue={pctEjecucion != null ? `${(pctEjecucion * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}% de ejecución` : undefined}
            trend={totalDesv === 0 ? 'neutral' : totalDesv > 0 ? 'up' : 'down'}
          />
          <KpiCard title="Superávit / déficit recaudación" value={loadingComp || !hasEjecucion ? '—' : formatEur(Math.abs(totalDesv))} subtitle={totalDesv >= 0 ? 'Sobre lo planificado' : 'Bajo lo planificado'} />
        </div>
      ) : (
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
            value={loading || capsFiltrados.length === 0 ? '—' : formatEur(Math.max(...capsFiltrados.map((c) => c.importe)))}
            subtitle={capsFiltrados.length > 0 ? CAPITULO_INGRESOS[capsFiltrados.reduce((a, b) => (b.importe > a.importe ? b : a)).capitulo] : undefined}
          />
          <KpiCard title="Número de capítulos" value={loading ? '—' : String(capsFiltrados.length)} subtitle="capítulos con datos" />
        </div>
      )}

      {isComparativa && hasEjecucion && (
        <section>
          <div className="chart-card-rule bg-white border border-[var(--color-rule)] px-5 pt-4 pb-2">
            <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
              Plan vs. ejecución por capítulo · {selectedYear}
            </h2>
            <p className="text-xs text-[var(--color-ink-muted)] mb-4">
              Millones de €. Capítulos no financieros (1–7).
            </p>
            {loadingComp ? (
              <ChartSkeleton height={300} />
            ) : (
              <BarChart
                categories={compOp.map((r) => CAPITULO_INGRESOS[r.capitulo] ?? `Cap. ${r.capitulo}`)}
                series={[
                  { name: 'Plan', data: compOp.map((r) => r.plan), color: '#B82A2A' },
                  { name: 'Ejecución', data: compOp.map((r) => r.ejecucion), color: '#C89B3C' },
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

      {isComparativa && (
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
                {loadingComp ? (
                  <tr>
                    <td colSpan={hasEjecucion ? 6 : 3} className="text-center text-[var(--color-ink-muted)] py-8">Cargando…</td>
                  </tr>
                ) : (
                  compOp.map((r) => {
                    const pct = r.plan > 0 ? r.ejecucion / r.plan : null
                    return (
                      <tr key={r.capitulo}>
                        <td className="font-mono">{r.capitulo}</td>
                        <td>
                          {CAPITULO_INGRESOS[r.capitulo] ?? '—'}
                          {CAPITULO_INGRESOS_TOOLTIP[r.capitulo] && (
                            <InfoTooltip content={CAPITULO_INGRESOS_TOOLTIP[r.capitulo]} />
                          )}
                        </td>
                        <td>{formatEur(r.plan)}</td>
                        {hasEjecucion && (
                          <>
                            <td>{r.ejecucion > 0 ? formatEur(r.ejecucion) : '—'}</td>
                            <td className={r.ejecucion > 0 ? (r.desviacion >= 0 ? 'text-emerald-700' : 'text-red-700') : ''}>
                              {r.ejecucion > 0 ? formatEur(r.desviacion) : '—'}
                            </td>
                            <td>{pct != null && r.ejecucion > 0 ? `${(pct * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%` : '—'}</td>
                          </>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
              {!loadingComp && compOp.length > 0 && (
                <tfoot>
                  <tr className="total-row">
                    <td colSpan={2}>Total no financiero</td>
                    <td>{formatEur(totalPlan)}</td>
                    {hasEjecucion && (
                      <>
                        <td>{formatEur(totalEjec)}</td>
                        <td className={totalDesv >= 0 ? 'text-emerald-700' : 'text-red-700'}>{formatEur(totalDesv)}</td>
                        <td>{pctEjecucion != null ? `${(pctEjecucion * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%` : '—'}</td>
                      </>
                    )}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">
            Fuente: SEPG (plan) · IGAE (derechos reconocidos netos).
          </p>
        </section>
      )}

      {!isComparativa && (
        <>
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
                  series={[{ name: 'Ingresos', data: barData, color: '#B82A2A' }]}
                  height={280}
                />
              )}
            </div>
            <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">
              Fuente: SEPG / IGAE.
            </p>
          </section>

          <section>
            <div className="chart-card-rule bg-white border border-[var(--color-rule)] px-5 pt-4 pb-2">
              <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
                Evolución de ingresos no financieros · Seguridad Social
              </h2>
              <p className="text-xs text-[var(--color-ink-muted)] mb-4">
                Serie histórica en millones de €.
              </p>
              {loading ? (
                <ChartSkeleton height={260} />
              ) : (
                <LineChart
                  categories={histYears}
                  series={[{ name: 'Ingresos', data: histData, color: '#B82A2A' }]}
                  height={260}
                  smooth
                />
              )}
            </div>
            <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">
              Fuente: SEPG / IGAE.
            </p>
          </section>

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
                      <td colSpan={4} className="text-center text-[var(--color-ink-muted)] py-8">Cargando…</td>
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
                            ? `${((c.importe / total) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
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
        </>
      )}
    </div>
  )
}
