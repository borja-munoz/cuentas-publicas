import { useEffect, useState } from 'react'
import PageHeader from '../../components/layout/PageHeader'
import ContextBox from '../../components/ui/ContextBox'
import KpiCard from '../../components/ui/KpiCard'
import InsightsPanel from '../../components/ui/InsightsPanel'
import LineChart from '../../components/charts/LineChart'
import { ChartSkeleton } from '../../components/ui/LoadingSkeleton'
import { useFilters } from '../../store/filters'
import { getResumenAnual } from '../../db/queries/ingresos'
import { formatEur, formatPct } from '../../utils/format'
import type { Insight } from '../../utils/insights'

interface ResumenRow {
  year: number
  ingresos_plan: number
  gastos_plan: number
}

export default function Inicio() {
  const { selectedYear, entityType } = useFilters()
  const [data, setData] = useState<ResumenRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getResumenAnual(entityType)
      .then(setData)
      .catch((e) => {
        console.error(e)
        setError(String(e))
      })
      .finally(() => setLoading(false))
  }, [entityType])

  const current = data.find((d) => d.year === selectedYear)
  const prev = data.find((d) => d.year === selectedYear - 1)

  const ingresosTrend =
    current && prev && prev.ingresos_plan > 0
      ? (current.ingresos_plan - prev.ingresos_plan) / prev.ingresos_plan
      : null

  const gastosTrend =
    current && prev && prev.gastos_plan > 0
      ? (current.gastos_plan - prev.gastos_plan) / prev.gastos_plan
      : null

  const balance = current ? current.ingresos_plan - current.gastos_plan : null

  const years = data.map((d) => String(d.year))
  const seriesIngresos = data.map((d) => d.ingresos_plan)
  const seriesGastos = data.map((d) => d.gastos_plan)

  // Insight: año con mayor déficit histórico
  const maxDeficit = data.reduce<{ year: number; saldo: number } | null>((acc, d) => {
    const saldo = d.ingresos_plan - d.gastos_plan
    if (!acc || saldo < acc.saldo) return { year: d.year, saldo }
    return acc
  }, null)

  // Insight: años consecutivos en déficit
  const aniosDeficit = data.filter((d) => d.ingresos_plan < d.gastos_plan).length

  const insights: Insight[] = loading || !current ? [] : [
    {
      label: 'Saldo presupuestario',
      value: formatEur(balance ?? 0),
      trend: balance == null ? 'neutral' : balance >= 0 ? 'up' : 'down',
      trendValue: balance != null ? (balance >= 0 ? 'Superávit' : 'Déficit') : undefined,
      description: `En ${selectedYear} los ingresos ${balance != null && balance < 0 ? 'no cubren' : 'superan'} los gastos planificados. El saldo excluye operaciones financieras (caps. 8 y 9).`,
    },
    {
      label: 'Años en déficit (serie)',
      value: `${aniosDeficit} de ${data.length}`,
      trend: aniosDeficit > data.length / 2 ? 'down' : 'neutral',
      description: `En ${aniosDeficit} de los ${data.length} años disponibles los gastos superaron los ingresos no financieros. La norma desde 2008 ha sido el déficit estructural.`,
    },
    ...(maxDeficit ? [{
      label: 'Mayor déficit histórico',
      value: formatEur(Math.abs(maxDeficit.saldo)),
      trend: 'down' as const,
      trendValue: String(maxDeficit.year),
      description: `${maxDeficit.year} registró el mayor desequilibrio presupuestario de la serie, coincidiendo con el impacto económico de ${maxDeficit.year <= 2010 ? 'la crisis financiera' : maxDeficit.year <= 2021 ? 'la pandemia de COVID-19' : 'los últimos ejercicios'}.`,
    }] : []),
  ]

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 font-mono">
          Error al cargar datos: {error}
        </div>
      )}
      <PageHeader
        title="Presupuestos Generales del Estado"
        subtitle={`${entityType} · ${selectedYear}`}
      />

      <ContextBox title="¿Qué son los Presupuestos Generales del Estado?">
        <p>
          Los <strong>Presupuestos Generales del Estado (PGE)</strong> son el plan económico anual
          del Gobierno de España: recogen todos los ingresos previstos (impuestos, deuda pública,
          tasas, etc.) y todos los gastos autorizados (nóminas, pensiones, inversiones, intereses,
          transferencias, etc.).
        </p>
        <p>
          Esta aplicación muestra el <strong>plan aprobado</strong> y la{' '}
          <strong>ejecución real</strong> según los datos publicados por la AEAT, el IGAE y el
          SEPG. Los importes excluyen operaciones financieras (capítulos 8 y 9).
        </p>
      </ContextBox>

      <InsightsPanel insights={insights} isLoading={loading} />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-3">
        {(() => {
          const ingPct = formatPct(ingresosTrend)
          const gasPct = formatPct(gastosTrend)
          return (
            <>
              <KpiCard
                title="Ingresos no financieros"
                value={loading || !current ? '—' : formatEur(current.ingresos_plan)}
                trendValue={ingPct ? `${ingPct} vs año anterior` : undefined}
                trend={ingPct ? (ingresosTrend! >= 0 ? 'up' : 'down') : undefined}
                subtitle={`Plan ${selectedYear}`}
                accent
              />
              <KpiCard
                title="Gastos no financieros"
                value={loading || !current ? '—' : formatEur(current.gastos_plan)}
                trendValue={gasPct ? `${gasPct} vs año anterior` : undefined}
                trend={gasPct ? (gastosTrend! <= 0 ? 'up' : 'down') : undefined}
                subtitle={`Plan ${selectedYear}`}
              />
              <KpiCard
                title="Saldo presupuestario"
                value={loading || balance == null ? '—' : formatEur(balance)}
                trendValue={balance != null ? (balance >= 0 ? 'Superávit' : 'Déficit') : undefined}
                trend={balance == null ? undefined : balance >= 0 ? 'up' : 'down'}
                subtitle={`Plan ${selectedYear}`}
              />
            </>
          )
        })()}
      </div>

      {/* Historical chart */}
      <section>
        <div className="chart-card-rule bg-white border border-[var(--color-rule)] px-5 pt-4 pb-2">
          <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
            Ingresos y gastos no financieros · {entityType}
          </h2>
          <p className="text-xs text-[var(--color-ink-muted)] mb-4">
            Plan presupuestario aprobado, en millones de €. Excluye capítulos 8 y 9 (operaciones financieras).
          </p>
          {loading ? (
            <ChartSkeleton height={300} />
          ) : (
            <LineChart
              categories={years}
              series={[
                { name: 'Ingresos', data: seriesIngresos, color: '#B82A2A' },
                { name: 'Gastos', data: seriesGastos, color: '#C89B3C' },
              ]}
              height={300}
              smooth
            />
          )}
        </div>
        <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">
          Fuente: SEPG (Secretaría General de Presupuestos y Gastos), series históricas PGE.
        </p>
      </section>
    </div>
  )
}
