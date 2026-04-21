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
  getAappYears,
  getAappGastos,
  getAappGastosHistorico,
  getAappResumen,
  getPibAnual,
  SUBSECTOR_NAMES,
  CONCEPTO_GASTOS_LABELS,
  CONCEPTO_GASTOS_COLORS,
  CONCEPTOS_GASTOS_BARRA,
  type AappConcepto,
  type AappResumen,
  type PibAnual,
  type Subsector,
} from '../../db/queries/aapp'

const SUBSECTORES: Subsector[] = ['S13', 'S1311', 'S1312', 'S1313', 'S1314']

export default function AappGastos() {
  const { selectedYear, setPageFilters } = useFilters()
  const [subsector, setSubsector] = useState<Subsector>('S13')
  const [availableYears, setAvailableYears] = useState<number[]>([])

  useEffect(() => {
    setPageFilters({ showViewMode: false, showComparativa: false })
    return () => setPageFilters({ showViewMode: false, showComparativa: false })
  }, [setPageFilters])

  useEffect(() => {
    getAappYears().then(setAvailableYears).catch(console.error)
  }, [])

  const effectiveYear = useMemo(() => {
    if (availableYears.length === 0) return null
    if (availableYears.includes(selectedYear)) return selectedYear
    const below = availableYears.filter((y) => y <= selectedYear)
    return below.length > 0 ? Math.max(...below) : Math.min(...availableYears)
  }, [availableYears, selectedYear])

  const [rows, setRows] = useState<AappConcepto[]>([])
  const [historico, setHistorico] = useState<AappConcepto[]>([])
  const [resumen, setResumen] = useState<AappResumen[]>([])
  const [pib, setPib] = useState<PibAnual[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingHist, setLoadingHist] = useState(true)

  useEffect(() => {
    if (effectiveYear == null) return
    setLoading(true)
    getAappGastos(effectiveYear, subsector)
      .then(setRows)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [effectiveYear, subsector])

  useEffect(() => {
    setLoadingHist(true)
    Promise.all([
      getAappGastosHistorico(subsector),
      getAappResumen(subsector),
      getPibAnual(),
    ])
      .then(([h, r, p]) => { setHistorico(h); setResumen(r); setPib(p) })
      .catch(console.error)
      .finally(() => setLoadingHist(false))
  }, [subsector])

  const yearsInSeries = useMemo(
    () => [...new Set(historico.map((r) => r.year))].sort(),
    [historico],
  )

  const barRows = useMemo(
    () =>
      CONCEPTOS_GASTOS_BARRA
        .map((c) => rows.find((r) => r.concepto === c))
        .filter(Boolean) as AappConcepto[],
    [rows],
  )

  const lineSeries = useMemo(
    () =>
      CONCEPTOS_GASTOS_BARRA.map((c) => ({
        name: CONCEPTO_GASTOS_LABELS[c] ?? c,
        data: yearsInSeries.map(
          (y) => historico.find((r) => r.year === y && r.concepto === c)?.importe ?? null,
        ),
        color: CONCEPTO_GASTOS_COLORS[c],
      })).filter((s) => s.data.some((v) => v != null && v > 0)),
    [historico, yearsInSeries],
  )

  const total = rows.reduce((s, r) => s + r.importe, 0)
  const prestaciones = rows.find((r) => r.concepto === 'prestaciones_sociales')
  const intereses = rows.find((r) => r.concepto === 'intereses')

  const pibActual = pib.find((p) => p.year === effectiveYear)?.pib ?? null
  const pibRatio = pibActual && total > 0 ? (total / pibActual) * 100 : null
  const interesesPib = pibActual && intereses ? (intereses.importe / pibActual) * 100 : null

  const prevResumen = resumen.find((r) => r.year === (effectiveYear ?? 0) - 1)
  const currResumen = resumen.find((r) => r.year === effectiveYear)
  const saldoActual = currResumen?.saldo ?? null
  const saldoPib = pibActual && saldoActual != null ? (saldoActual / pibActual) * 100 : null

  const yoyRatio = prevResumen && currResumen && prevResumen.gastos > 0
    ? (currResumen.gastos - prevResumen.gastos) / prevResumen.gastos
    : null

  const insights: Insight[] = loading || rows.length === 0 ? [] : [
    ...(pibRatio != null ? [{
      label: 'Gasto / PIB',
      value: `${pibRatio.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`,
      trend: 'neutral' as const,
      description: `El gasto público de ${SUBSECTOR_NAMES[subsector]} representa el ${pibRatio.toFixed(1)}% del PIB en ${effectiveYear}.`,
    }] : []),
    ...(prestaciones && total > 0 ? [{
      label: 'Peso prestaciones sociales',
      value: `${((prestaciones.importe / total) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`,
      trend: 'neutral' as const,
      description: `Las prestaciones sociales (pensiones, desempleo, etc.) representan el ${((prestaciones.importe / total) * 100).toFixed(1)}% del gasto de las AAPP, con un importe de ${formatEur(prestaciones.importe)}.`,
    }] : []),
    ...(interesesPib != null ? [{
      label: 'Carga de intereses',
      value: `${interesesPib.toLocaleString('es-ES', { maximumFractionDigits: 1 })}% del PIB`,
      trend: interesesPib > 3 ? 'down' as const : 'neutral' as const,
      description: `Los intereses de la deuda pública suponen ${formatEur(intereses!.importe)}, equivalente al ${interesesPib.toFixed(1)}% del PIB.`,
    }] : []),
    ...(saldoPib != null ? [{
      label: 'Saldo presupuestario',
      value: `${saldoPib >= 0 ? '+' : ''}${saldoPib.toLocaleString('es-ES', { maximumFractionDigits: 1 })}% del PIB`,
      trend: saldoPib >= 0 ? 'up' as const : 'down' as const,
      description: `Capacidad/necesidad de financiación de las AAPP en ${effectiveYear}: ${formatEur(Math.abs(saldoActual!))} (${saldoActual! >= 0 ? 'superávit' : 'déficit'}).`,
    }] : []),
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="Gastos AAPP"
        subtitle={`SEC2010 · ${SUBSECTOR_NAMES[subsector]} · ${effectiveYear ?? '—'}${effectiveYear !== selectedYear && effectiveYear != null ? ' (último disponible)' : ''}`}
        actions={
          <select
            value={subsector}
            onChange={(e) => setSubsector(e.target.value as Subsector)}
            className="rounded border border-[var(--color-rule)] bg-white px-2 py-1.5 text-sm text-[var(--color-ink)] focus:outline-none"
          >
            {SUBSECTORES.map((s) => (
              <option key={s} value={s}>{SUBSECTOR_NAMES[s]}</option>
            ))}
          </select>
        }
      />

      <ContextBox title="Gastos de las AAPP — Contabilidad Nacional (SEC2010)">
        <p>
          El SEC2010 clasifica el gasto según su naturaleza económica. Las{' '}
          <strong>prestaciones sociales</strong> (pensiones, desempleo, incapacidad…) son
          habitualmente el mayor componente. La <strong>remuneración de empleados</strong> incluye
          sueldos y cotizaciones del empleador de todo el personal del sector público. Los{' '}
          <strong>intereses</strong> reflejan el coste del endeudamiento acumulado.
        </p>
        <p>
          Los datos proceden del dataset <strong>gov_10a_main de Eurostat</strong>. El{' '}
          <strong>saldo</strong> (capacidad o necesidad de financiación) equivale al déficit o
          superávit público en metodología SEC2010, el indicador oficial usado por la Comisión
          Europea para el Procedimiento de Déficit Excesivo (PDE).
        </p>
      </ContextBox>

      <InsightsPanel insights={insights} isLoading={loading} />

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        <KpiCard
          title="Total gastos"
          value={loading ? '—' : formatEur(total)}
          trendValue={yoyRatio != null ? `${yoyRatio >= 0 ? '+' : ''}${(yoyRatio * 100).toFixed(1)}% vs año anterior` : undefined}
          trend={yoyRatio != null ? (yoyRatio >= 0 ? 'down' : 'up') : undefined}
          subtitle={`${effectiveYear ?? ''} · ${SUBSECTOR_NAMES[subsector]}`}
          accent
        />
        <KpiCard
          title="% del PIB"
          value={loading || pibRatio == null ? '—' : `${pibRatio.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`}
          subtitle={`${effectiveYear ?? ''}`}
        />
        <KpiCard
          title="Saldo presupuestario"
          value={loading || saldoActual == null ? '—' : formatEur(saldoActual)}
          trendValue={saldoPib != null ? `${saldoPib >= 0 ? '+' : ''}${saldoPib.toFixed(1)}% PIB` : undefined}
          trend={saldoActual != null ? (saldoActual >= 0 ? 'up' : 'down') : undefined}
          subtitle={saldoActual != null ? (saldoActual >= 0 ? 'Superávit' : 'Déficit') : undefined}
        />
      </div>

      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
          Estructura de gastos · {effectiveYear ?? '—'}
        </h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">
          Millones de euros a precios corrientes.
        </p>
        {loading ? (
          <ChartSkeleton height={300} />
        ) : barRows.length > 0 ? (
          <BarChart
            categories={barRows.map((r) => CONCEPTO_GASTOS_LABELS[r.concepto] ?? r.concepto_nom)}
            series={[{
              name: 'Gastos (M€)',
              data: barRows.map((r) => r.importe),
              color: '#B82A2A',
            }]}
            horizontal
            height={300}
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
                <th>Concepto</th>
                <th>Importe (M€)</th>
                <th>% del total</th>
                {pibActual && <th>% del PIB</th>}
              </tr>
            </thead>
            <tbody>
              {[...rows].sort((a, b) => b.importe - a.importe).map((r) => (
                <tr key={r.concepto}>
                  <td className="font-medium">
                    <span
                      className="mr-2 inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: CONCEPTO_GASTOS_COLORS[r.concepto] ?? '#999' }}
                    />
                    {CONCEPTO_GASTOS_LABELS[r.concepto] ?? r.concepto_nom}
                  </td>
                  <td>{formatEur(r.importe)}</td>
                  <td>{total > 0 ? `${((r.importe / total) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%` : '—'}</td>
                  {pibActual && (
                    <td>{pibActual > 0 ? `${((r.importe / pibActual) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%` : '—'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
          Evolución histórica de gastos por concepto
        </h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">
          Millones de euros. {SUBSECTOR_NAMES[subsector]}, 1995–actual.
        </p>
        {loadingHist ? (
          <ChartSkeleton height={320} />
        ) : yearsInSeries.length > 0 ? (
          <LineChart
            categories={yearsInSeries.map(String)}
            series={lineSeries}
            height={320}
            smooth
          />
        ) : (
          <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos históricos.</p>
        )}
      </div>

      <p className="text-[0.7rem] text-[var(--color-ink-faint)]">
        Fuente: Eurostat — gov_10a_main (Government finance statistics, main aggregates). Datos en M€ a precios corrientes. Metodología SEC2010.
      </p>
    </div>
  )
}
