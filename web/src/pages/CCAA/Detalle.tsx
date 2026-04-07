import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageHeader from '../../components/layout/PageHeader'
import ContextBox from '../../components/ui/ContextBox'
import KpiCard from '../../components/ui/KpiCard'
import BarChart from '../../components/charts/BarChart'
import { ChartSkeleton } from '../../components/ui/LoadingSkeleton'
import { formatEur } from '../../utils/format'
import {
  getCcaaGastosPorCapitulo,
  getCcaaIngresosPorCapitulo,
  getCcaaYears,
  type CcaaCapitulo,
  type CcaaIngresosCapitulo,
} from '../../db/queries/ccaa'

const CCAA_NOMBRES: Record<string, string> = {
  AN: 'Andalucía',
  AR: 'Aragón',
  AS: 'Asturias',
  IB: 'Baleares',
  CN: 'Canarias',
  CB: 'Cantabria',
  CL: 'Castilla y León',
  CM: 'Castilla-La Mancha',
  CT: 'Cataluña',
  VC: 'C. Valenciana',
  EX: 'Extremadura',
  GA: 'Galicia',
  MD: 'Madrid',
  MC: 'Murcia',
  NC: 'Navarra',
  PV: 'País Vasco',
  RI: 'La Rioja',
  CE: 'Ceuta',
  ME: 'Melilla',
}

type Tab = 'gastos' | 'ingresos' | 'comparativa'

const TABS: { id: Tab; label: string }[] = [
  { id: 'gastos', label: 'Gastos' },
  { id: 'ingresos', label: 'Ingresos' },
  { id: 'comparativa', label: 'Plan vs. Ejecución' },
]

const CAPS_OPERACIONALES = [1, 2, 3, 4, 6, 7]

export default function CcaaDetalle() {
  const { cod } = useParams<{ cod: string }>()
  const ccaaNom = cod ? (CCAA_NOMBRES[cod] ?? cod) : '—'

  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [tab, setTab] = useState<Tab>('gastos')

  const [gastos, setGastos] = useState<CcaaCapitulo[]>([])
  const [ingresos, setIngresos] = useState<CcaaIngresosCapitulo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCcaaYears()
      .then((ys) => {
        setAvailableYears(ys)
        setSelectedYear(ys.length > 0 ? Math.max(...ys) : null)
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (!cod || selectedYear == null) return
    setLoading(true)
    Promise.all([
      getCcaaGastosPorCapitulo(cod, selectedYear),
      getCcaaIngresosPorCapitulo(cod, selectedYear),
    ])
      .then(([g, i]) => {
        setGastos(g)
        setIngresos(i)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [cod, selectedYear])

  // Split by fuente
  const gastosPlan = useMemo(() => gastos.filter((d) => d.fuente === 'plan'), [gastos])
  const gastosEjec = useMemo(() => gastos.filter((d) => d.fuente === 'ejecucion'), [gastos])
  const ingresosPlan = useMemo(() => ingresos.filter((d) => d.fuente === 'plan'), [ingresos])
  const ingresosEjec = useMemo(() => ingresos.filter((d) => d.fuente === 'ejecucion'), [ingresos])

  // Totals (operational chapters only for gastos)
  const totalGastosPlan = useMemo(
    () => gastosPlan.filter((d) => CAPS_OPERACIONALES.includes(d.capitulo)).reduce((s, d) => s + d.importe, 0),
    [gastosPlan],
  )
  const totalGastosEjec = useMemo(
    () => gastosEjec.filter((d) => CAPS_OPERACIONALES.includes(d.capitulo)).reduce((s, d) => s + d.importe, 0),
    [gastosEjec],
  )
  const totalIngresosPlan = useMemo(() => ingresosPlan.reduce((s, d) => s + d.importe, 0), [ingresosPlan])
  const totalIngresosEjec = useMemo(() => ingresosEjec.reduce((s, d) => s + d.importe, 0), [ingresosEjec])

  const saldoEjec = totalIngresosEjec - totalGastosEjec
  const pctEjecGastos = totalGastosPlan > 0 ? totalGastosEjec / totalGastosPlan : null

  // Gastos chart — operational chapters
  const gastosCaps = useMemo(
    () => [...new Set(gastos.map((d) => d.capitulo))].filter((c) => CAPS_OPERACIONALES.includes(c)).sort(),
    [gastos],
  )
  const gastosCats = gastosCaps.map((c) => gastos.find((d) => d.capitulo === c)?.descripcion ?? `Cap. ${c}`)
  const gastosPlanData = gastosCaps.map((c) => gastosPlan.find((d) => d.capitulo === c)?.importe ?? 0)
  const gastosEjecData = gastosCaps.map((c) => gastosEjec.find((d) => d.capitulo === c)?.importe ?? 0)

  // Ingresos chart — all chapters
  const ingresosCaps = useMemo(
    () => [...new Set(ingresos.map((d) => d.capitulo))].sort(),
    [ingresos],
  )
  const ingresosCats = ingresosCaps.map((c) => ingresos.find((d) => d.capitulo === c)?.descripcion ?? `Cap. ${c}`)
  const ingresosPlanData = ingresosCaps.map((c) => ingresosPlan.find((d) => d.capitulo === c)?.importe ?? 0)
  const ingresosEjecData = ingresosCaps.map((c) => ingresosEjec.find((d) => d.capitulo === c)?.importe ?? 0)

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        to="/ccaa"
        className="inline-flex items-center gap-1 text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-accent)] transition-colors"
      >
        ← Volver a CCAA
      </Link>

      <PageHeader
        title={ccaaNom}
        subtitle={`Presupuesto autonómico · ${selectedYear ?? ''}`}
        actions={
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
        }
      />

      <ContextBox title={`Presupuesto de ${ccaaNom}`}>
        <p>
          El presupuesto autonómico recoge los <strong>ingresos</strong> (tributos propios y cedidos,
          transferencias del Estado, endeudamiento) y los <strong>gastos</strong> (personal, servicios
          públicos, transferencias e inversiones) de la comunidad y sus organismos dependientes.
        </p>
        <p>
          Los datos proceden de las <strong>liquidaciones presupuestarias</strong> publicadas por el
          Ministerio de Hacienda (SGCIEF), que consolida los presupuestos de todas las entidades
          dependientes de cada comunidad. La serie disponible cubre 2002–2023.
        </p>
      </ContextBox>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          title="Ingresos ejecutados"
          value={loading ? '…' : formatEur(totalIngresosEjec || totalIngresosPlan)}
          subtitle={!loading && totalIngresosEjec === 0 ? 'Solo datos de plan' : undefined}
        />
        <KpiCard
          title="Gastos ejecutados"
          value={loading ? '…' : formatEur(totalGastosEjec || totalGastosPlan)}
          subtitle={!loading && totalGastosEjec === 0 ? 'Solo datos de plan' : undefined}
        />
        <KpiCard
          title="Saldo presupuestario"
          value={
            loading
              ? '…'
              : totalGastosEjec > 0 && totalIngresosEjec > 0
              ? formatEur(saldoEjec)
              : '—'
          }
          trend={totalGastosEjec > 0 && totalIngresosEjec > 0 ? (saldoEjec >= 0 ? 'up' : 'down') : 'neutral'}
          trendValue={
            totalGastosEjec > 0 && totalIngresosEjec > 0
              ? saldoEjec >= 0
                ? 'Superávit'
                : 'Déficit'
              : undefined
          }
          accent
        />
        <KpiCard
          title="Ejecución del gasto"
          value={
            loading
              ? '…'
              : pctEjecGastos != null && totalGastosEjec > 0
              ? `${(pctEjecGastos * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
              : '—'
          }
          trend={pctEjecGastos != null ? (pctEjecGastos >= 0.95 ? 'up' : 'neutral') : 'neutral'}
          trendValue={totalGastosPlan > 0 ? `Plan: ${formatEur(totalGastosPlan)}` : undefined}
        />
      </div>

      {/* Tabs */}
      <div>
        <div className="flex border-b border-[var(--color-rule)]">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === id
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-transparent text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-6">

          {/* GASTOS TAB */}
          {tab === 'gastos' && (
            <>
              <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
                <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
                  Gasto por capítulo económico · {selectedYear ?? '—'}
                </h2>
                <p className="text-xs text-[var(--color-ink-muted)] mb-3">
                  Presupuesto inicial (plan) y obligaciones reconocidas netas (ejecución). Capítulos 1–7.
                </p>
                {loading ? (
                  <ChartSkeleton height={280} />
                ) : gastosCaps.length > 0 ? (
                  <BarChart
                    categories={gastosCats}
                    series={[
                      ...(gastosPlanData.some((v) => v > 0)
                        ? [{ name: 'Plan', data: gastosPlanData, color: '#326891' }]
                        : []),
                      ...(gastosEjecData.some((v) => v > 0)
                        ? [{ name: 'Ejecución', data: gastosEjecData, color: '#e07b39' }]
                        : []),
                    ]}
                    horizontal
                    height={280}
                  />
                ) : (
                  <p className="text-sm text-[var(--color-ink-muted)] py-8 text-center">
                    Sin datos para {selectedYear}.
                  </p>
                )}
              </div>

              {!loading && gastosCaps.length > 0 && (
                <div className="overflow-x-auto border border-[var(--color-rule)] bg-white">
                  <table className="data-table w-full">
                    <thead>
                      <tr>
                        <th>Capítulo</th>
                        <th>Plan (M€)</th>
                        <th>Ejecución (M€)</th>
                        <th>% ejecución</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gastosCaps.map((cap) => {
                        const desc = gastos.find((d) => d.capitulo === cap)?.descripcion ?? `Cap. ${cap}`
                        const plan = gastosPlan.find((d) => d.capitulo === cap)?.importe ?? 0
                        const ejec = gastosEjec.find((d) => d.capitulo === cap)?.importe ?? 0
                        const pct = plan > 0 && ejec > 0 ? ejec / plan : null
                        return (
                          <tr key={cap}>
                            <td className="font-medium">{desc}</td>
                            <td>{plan > 0 ? formatEur(plan) : '—'}</td>
                            <td>{ejec > 0 ? formatEur(ejec) : '—'}</td>
                            <td className={pct != null && pct < 0.85 ? 'text-red-600' : ''}>
                              {pct != null
                                ? `${(pct * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
                                : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="total-row">
                        <td>Total operacional</td>
                        <td>{formatEur(totalGastosPlan)}</td>
                        <td>{totalGastosEjec > 0 ? formatEur(totalGastosEjec) : '—'}</td>
                        <td>
                          {pctEjecGastos != null && totalGastosEjec > 0
                            ? `${(pctEjecGastos * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
                            : '—'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <p className="text-[0.7rem] text-[var(--color-ink-faint)]">
                Fuente: Ministerio de Hacienda · SGCIEF. Datos en M€.
              </p>
            </>
          )}

          {/* INGRESOS TAB */}
          {tab === 'ingresos' && (
            <>
              <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
                <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
                  Ingresos por capítulo económico · {selectedYear ?? '—'}
                </h2>
                <p className="text-xs text-[var(--color-ink-muted)] mb-3">
                  Previsiones iniciales (plan) y derechos reconocidos netos (ejecución). M€.
                </p>
                {loading ? (
                  <ChartSkeleton height={280} />
                ) : ingresosCaps.length > 0 ? (
                  <BarChart
                    categories={ingresosCats}
                    series={[
                      ...(ingresosPlanData.some((v) => v > 0)
                        ? [{ name: 'Plan', data: ingresosPlanData, color: '#326891' }]
                        : []),
                      ...(ingresosEjecData.some((v) => v > 0)
                        ? [{ name: 'Ejecución', data: ingresosEjecData, color: '#e07b39' }]
                        : []),
                    ]}
                    horizontal
                    height={280}
                  />
                ) : (
                  <p className="text-sm text-[var(--color-ink-muted)] py-8 text-center">
                    Sin datos para {selectedYear}.
                  </p>
                )}
              </div>

              {!loading && ingresosCaps.length > 0 && (
                <div className="overflow-x-auto border border-[var(--color-rule)] bg-white">
                  <table className="data-table w-full">
                    <thead>
                      <tr>
                        <th>Capítulo</th>
                        <th>Plan (M€)</th>
                        <th>Ejecución (M€)</th>
                        <th>% s/total ejec.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ingresosCaps.map((cap) => {
                        const desc = ingresos.find((d) => d.capitulo === cap)?.descripcion ?? `Cap. ${cap}`
                        const plan = ingresosPlan.find((d) => d.capitulo === cap)?.importe ?? 0
                        const ejec = ingresosEjec.find((d) => d.capitulo === cap)?.importe ?? 0
                        const pct = totalIngresosEjec > 0 && ejec > 0 ? ejec / totalIngresosEjec : null
                        return (
                          <tr key={cap}>
                            <td className="font-medium">{desc}</td>
                            <td>{plan > 0 ? formatEur(plan) : '—'}</td>
                            <td>{ejec > 0 ? formatEur(ejec) : '—'}</td>
                            <td>
                              {pct != null
                                ? `${(pct * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
                                : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="total-row">
                        <td>Total</td>
                        <td>{formatEur(totalIngresosPlan)}</td>
                        <td>{totalIngresosEjec > 0 ? formatEur(totalIngresosEjec) : '—'}</td>
                        <td>{totalIngresosEjec > 0 ? '100,0%' : '—'}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <p className="text-[0.7rem] text-[var(--color-ink-faint)]">
                Fuente: Ministerio de Hacienda · SGCIEF. Datos en M€.
              </p>
            </>
          )}

          {/* COMPARATIVA TAB */}
          {tab === 'comparativa' && (
            <>
              <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
                <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
                  Plan vs. Ejecución por capítulo · {selectedYear ?? '—'}
                </h2>
                <p className="text-xs text-[var(--color-ink-muted)] mb-3">
                  Desviación entre el presupuesto inicial y las obligaciones reconocidas (capítulos operacionales).
                </p>
                {loading ? (
                  <ChartSkeleton height={280} />
                ) : gastosCaps.length > 0 ? (
                  <BarChart
                    categories={gastosCats}
                    series={[
                      ...(gastosPlanData.some((v) => v > 0)
                        ? [{ name: 'Plan', data: gastosPlanData, color: '#326891' }]
                        : []),
                      ...(gastosEjecData.some((v) => v > 0)
                        ? [{ name: 'Ejecución', data: gastosEjecData, color: '#e07b39' }]
                        : []),
                    ]}
                    height={280}
                  />
                ) : (
                  <p className="text-sm text-[var(--color-ink-muted)] py-8 text-center">
                    Sin datos para {selectedYear}.
                  </p>
                )}
              </div>

              {!loading && gastosCaps.length > 0 && (
                <div className="overflow-x-auto border border-[var(--color-rule)] bg-white">
                  <table className="data-table w-full">
                    <thead>
                      <tr>
                        <th>Capítulo</th>
                        <th>Plan (M€)</th>
                        <th>Ejecución (M€)</th>
                        <th>Desviación (M€)</th>
                        <th>% ejecución</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gastosCaps.map((cap) => {
                        const desc = gastos.find((d) => d.capitulo === cap)?.descripcion ?? `Cap. ${cap}`
                        const plan = gastosPlan.find((d) => d.capitulo === cap)?.importe ?? 0
                        const ejec = gastosEjec.find((d) => d.capitulo === cap)?.importe ?? 0
                        const desv = ejec > 0 && plan > 0 ? ejec - plan : null
                        const pctEj = plan > 0 && ejec > 0 ? ejec / plan : null
                        return (
                          <tr key={cap}>
                            <td className="font-medium">{desc}</td>
                            <td>{plan > 0 ? formatEur(plan) : '—'}</td>
                            <td>{ejec > 0 ? formatEur(ejec) : '—'}</td>
                            <td
                              className={
                                desv != null
                                  ? desv < 0
                                    ? 'text-red-600'
                                    : desv > 0
                                    ? 'text-emerald-600'
                                    : ''
                                  : ''
                              }
                            >
                              {desv != null ? formatEur(desv) : '—'}
                            </td>
                            <td className={pctEj != null && pctEj < 0.85 ? 'text-red-600' : ''}>
                              {pctEj != null
                                ? `${(pctEj * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
                                : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="total-row">
                        <td>Total operacional</td>
                        <td>{formatEur(totalGastosPlan)}</td>
                        <td>{totalGastosEjec > 0 ? formatEur(totalGastosEjec) : '—'}</td>
                        <td>
                          {totalGastosEjec > 0 && totalGastosPlan > 0
                            ? formatEur(totalGastosEjec - totalGastosPlan)
                            : '—'}
                        </td>
                        <td>
                          {pctEjecGastos != null && totalGastosEjec > 0
                            ? `${(pctEjecGastos * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
                            : '—'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <p className="text-[0.7rem] text-[var(--color-ink-faint)]">
                Fuente: Ministerio de Hacienda · SGCIEF. Datos en M€. Capítulos 1–7 (gastos operacionales).
              </p>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
