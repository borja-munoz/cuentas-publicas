import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/layout/PageHeader'
import ContextBox from '../../components/ui/ContextBox'
import KpiCard from '../../components/ui/KpiCard'
import InsightsPanel from '../../components/ui/InsightsPanel'
import LineChart from '../../components/charts/LineChart'
import { ChartSkeleton } from '../../components/ui/LoadingSkeleton'
import { useFilters } from '../../store/filters'
import { formatEur } from '../../utils/format'
import type { Insight } from '../../utils/insights'
import {
  getCcaaResumen,
  getCcaaYears,
  getCcaaResumenHistorico,
  type CcaaResumen,
} from '../../db/queries/ccaa'

type ResumenHistRow = { year: number; ingresos_plan: number; ingresos_ejec: number; gastos_plan: number; gastos_ejec: number }

export default function CcaaResumenPage() {
  const { selectedYear: globalYear } = useFilters()
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [rows, setRows] = useState<CcaaResumen[]>([])
  const [historico, setHistorico] = useState<ResumenHistRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingHist, setLoadingHist] = useState(true)

  useEffect(() => {
    getCcaaYears().then(setAvailableYears).catch(console.error)
  }, [])

  const selectedYear = useMemo(() => {
    if (availableYears.length === 0) return null
    if (availableYears.includes(globalYear)) return globalYear
    const below = availableYears.filter((y) => y <= globalYear)
    return below.length > 0 ? Math.max(...below) : Math.min(...availableYears)
  }, [availableYears, globalYear])

  useEffect(() => {
    if (selectedYear == null) return
    setLoading(true)
    getCcaaResumen(selectedYear)
      .then(setRows)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedYear])

  useEffect(() => {
    setLoadingHist(true)
    getCcaaResumenHistorico()
      .then((d) => setHistorico(d as ResumenHistRow[]))
      .catch(console.error)
      .finally(() => setLoadingHist(false))
  }, [])

  const totalIngresosEjec = rows.reduce((s, r) => s + r.ingresos_ejec, 0)
  const totalIngresoesPlan = rows.reduce((s, r) => s + r.ingresos_plan, 0)
  const totalGastosEjec = rows.reduce((s, r) => s + (r.gastos_ejec ?? 0), 0)
  const totalGastosPlan = rows.reduce((s, r) => s + (r.gastos_plan ?? 0), 0)
  const saldo = totalIngresosEjec - totalGastosEjec
  const maxGastos = rows.length > 0 ? rows.reduce((a, b) => ((b.gastos_ejec ?? 0) > (a.gastos_ejec ?? 0) ? b : a), rows[0]) : null

  const insights: Insight[] = loading || rows.length === 0 ? [] : [
    ...(maxGastos ? [{
      label: 'Mayor gasto ejecutado',
      value: maxGastos.ccaa_nom,
      trendValue: formatEur(maxGastos.gastos_ejec ?? 0),
      trend: 'neutral' as const,
      description: `${maxGastos.ccaa_nom} es la comunidad con mayor gasto ejecutado en ${selectedYear ?? ''}: ${formatEur(maxGastos.gastos_ejec ?? 0)}, el ${totalGastosEjec > 0 ? ((( maxGastos.gastos_ejec ?? 0) / totalGastosEjec) * 100).toFixed(1) : '—'}% del total autonómico.`,
    }] : []),
    {
      label: 'Total gasto autonómico',
      value: formatEur(totalGastosEjec || totalGastosPlan),
      trendValue: `${rows.length} CCAA · ${selectedYear ?? ''}`,
      trend: 'neutral' as const,
      description: `Suma del gasto ${totalGastosEjec > 0 ? 'ejecutado' : 'planificado'} de todas las Comunidades Autónomas en ${selectedYear ?? ''}.`,
    },
  ]

  const histYears = historico.map((d) => String(d.year))

  return (
    <div className="space-y-8">
      <PageHeader
        title="Comunidades Autónomas"
        subtitle={`Presupuestos autonómicos · ${selectedYear ?? '—'}${selectedYear !== globalYear && selectedYear != null ? ' (último disponible)' : ''}`}
      />

      <ContextBox title="Presupuestos de las Comunidades Autónomas">
        <p>
          Las 17 Comunidades Autónomas, junto con Ceuta y Melilla, gestionan competencias clave
          como <strong>sanidad, educación y servicios sociales</strong>. Su presupuesto combina
          recursos propios (tributos cedidos y propios) con{' '}
          <strong>transferencias del Estado</strong> a través del sistema de financiación
          autonómica.
        </p>
        <p>
          Los datos proceden de la <strong>liquidación presupuestaria</strong> publicada por el
          Ministerio de Hacienda (SGCIEF), que agrega los presupuestos de todas las entidades
          dependientes de cada comunidad. Serie disponible desde 2002.
        </p>
      </ContextBox>

      <InsightsPanel insights={insights} isLoading={loading} />

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        <KpiCard
          title="Ingresos totales (ejec.)"
          value={loading ? '—' : formatEur(totalIngresosEjec || totalIngresoesPlan)}
          subtitle={`${rows.length} CCAA · ${selectedYear ?? ''}`}
          accent
        />
        <KpiCard
          title="Gastos totales (ejec.)"
          value={loading ? '—' : formatEur(totalGastosEjec || totalGastosPlan)}
          subtitle={`${selectedYear ?? ''}`}
        />
        <KpiCard
          title="Saldo"
          value={loading || totalGastosEjec === 0 ? '—' : formatEur(saldo)}
          trend={saldo >= 0 ? 'up' : 'down'}
          subtitle={totalGastosEjec > 0 ? (saldo >= 0 ? 'Superávit' : 'Déficit') : undefined}
        />
      </div>

      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
          Ingresos y gastos autonómicos · serie histórica
        </h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">
          Millones de euros. Total de todas las CCAA.
        </p>
        {loadingHist ? (
          <ChartSkeleton height={280} />
        ) : historico.length > 0 ? (
          <LineChart
            categories={histYears}
            series={[
              { name: 'Ingresos (ejec.)', data: historico.map((d) => d.ingresos_ejec || d.ingresos_plan), color: '#B82A2A' },
              { name: 'Gastos (ejec.)', data: historico.map((d) => d.gastos_ejec || d.gastos_plan), color: '#C89B3C' },
            ]}
            height={280}
            smooth
          />
        ) : (
          <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos históricos.</p>
        )}
      </div>

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
                  <th>Saldo (ejec.)</th>
                </tr>
              </thead>
              <tbody>
                {[...rows]
                  .sort((a, b) => ((b.gastos_ejec ?? 0) || b.gastos_plan) - ((a.gastos_ejec ?? 0) || a.gastos_plan))
                  .map((r) => {
                    const deficit = r.ingresos_ejec - (r.gastos_ejec ?? 0)
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
                        <td>{formatEur(r.gastos_ejec ?? 0)}</td>
                        <td className={(r.gastos_ejec ?? 0) > 0 && r.ingresos_ejec > 0 ? (deficit < 0 ? 'text-red-600 font-medium' : 'text-emerald-600') : ''}>
                          {(r.gastos_ejec ?? 0) > 0 && r.ingresos_ejec > 0 ? formatEur(deficit) : '—'}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td>Total</td>
                  <td>{formatEur(totalIngresoesPlan)}</td>
                  <td>{formatEur(totalIngresosEjec)}</td>
                  <td>{formatEur(totalGastosPlan)}</td>
                  <td>{formatEur(totalGastosEjec)}</td>
                  <td className={totalGastosEjec > 0 ? (saldo < 0 ? 'text-red-600 font-medium' : 'text-emerald-600') : ''}>
                    {totalGastosEjec > 0 ? formatEur(saldo) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">
            Fuente: Ministerio de Hacienda · SGCIEF. Datos en M€. Saldo positivo = superávit.
          </p>
        </section>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[
          { to: '/ccaa/ingresos', label: 'Ingresos CCAA', desc: 'Transferencias del Estado a CCAA' },
          { to: '/ccaa/gastos', label: 'Gastos CCAA', desc: 'Gasto por comunidad · mapa y detalle' },
        ].map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="border border-[var(--color-rule)] bg-white p-4 hover:border-[var(--color-accent)]/40 transition-colors"
          >
            <p className="text-sm font-semibold text-[var(--color-ink)] mb-1">{card.label} →</p>
            <p className="text-xs text-[var(--color-ink-muted)]">{card.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
