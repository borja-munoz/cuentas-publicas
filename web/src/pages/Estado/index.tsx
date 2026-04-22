import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/layout/PageHeader'
import ContextBox from '../../components/ui/ContextBox'
import KpiCard from '../../components/ui/KpiCard'
import InsightsPanel from '../../components/ui/InsightsPanel'
import LineChart from '../../components/charts/LineChart'
import { ChartSkeleton } from '../../components/ui/LoadingSkeleton'
import { getResumenAnualCompleto } from '../../db/queries/ingresos'
import { formatEur } from '../../utils/format'
import type { Insight } from '../../utils/insights'

type ResumenRow = { year: number; ingresos_plan: number; ingresos_ejec: number; gastos_plan: number; gastos_ejec: number }

export default function EstadoResumen() {
  const [datos, setDatos] = useState<ResumenRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getResumenAnualCompleto('Estado')
      .then((d) => setDatos(d as ResumenRow[]))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const effectiveYear = useMemo(() => {
    const withEjec = datos.filter((d) => d.ingresos_ejec > 0)
    if (withEjec.length > 0) return Math.max(...withEjec.map((d) => d.year))
    return datos.length > 0 ? Math.max(...datos.map((d) => d.year)) : null
  }, [datos])

  const curr = datos.find((d) => d.year === effectiveYear)
  const prev = datos.find((d) => d.year === (effectiveYear ?? 0) - 1)

  const hasEjec = curr != null && curr.ingresos_ejec > 0
  const ingresos = hasEjec ? curr!.ingresos_ejec : curr?.ingresos_plan ?? 0
  const gastos = hasEjec ? curr!.gastos_ejec : curr?.gastos_plan ?? 0
  const saldo = ingresos - gastos

  const prevIngresos = prev ? (prev.ingresos_ejec > 0 ? prev.ingresos_ejec : prev.ingresos_plan) : 0
  const prevGastos = prev ? (prev.gastos_ejec > 0 ? prev.gastos_ejec : prev.gastos_plan) : 0
  const yoyIng = prevIngresos > 0 ? (ingresos - prevIngresos) / prevIngresos : null
  const yoyGas = prevGastos > 0 ? (gastos - prevGastos) / prevGastos : null

  const pctEjecIng = curr && curr.ingresos_plan > 0 && curr.ingresos_ejec > 0
    ? curr.ingresos_ejec / curr.ingresos_plan
    : null
  const pctEjecGas = curr && curr.gastos_plan > 0 && curr.gastos_ejec > 0
    ? curr.gastos_ejec / curr.gastos_plan
    : null

  const insights: Insight[] = loading || !curr ? [] : [
    ...(yoyIng != null ? [{
      label: 'Variación ingresos',
      value: `${yoyIng >= 0 ? '+' : ''}${(yoyIng * 100).toFixed(1)}%`,
      trendValue: `vs ${(effectiveYear ?? 0) - 1}`,
      trend: yoyIng >= 0 ? 'up' as const : 'down' as const,
      description: `Los ingresos del Estado ${yoyIng >= 0 ? 'crecieron' : 'cayeron'} ${Math.abs(yoyIng * 100).toFixed(1)}% respecto al año anterior.`,
    }] : []),
    ...(yoyGas != null ? [{
      label: 'Variación gastos',
      value: `${yoyGas >= 0 ? '+' : ''}${(yoyGas * 100).toFixed(1)}%`,
      trendValue: `vs ${(effectiveYear ?? 0) - 1}`,
      trend: yoyGas >= 0 ? 'down' as const : 'up' as const,
      description: `El gasto del Estado ${yoyGas >= 0 ? 'aumentó' : 'disminuyó'} ${Math.abs(yoyGas * 100).toFixed(1)}% respecto al año anterior.`,
    }] : []),
    ...(pctEjecIng != null ? [{
      label: 'Ejecución ingresos',
      value: `${(pctEjecIng * 100).toFixed(1)}%`,
      trend: pctEjecIng >= 0.95 ? 'up' as const : 'neutral' as const,
      description: `Se recaudó el ${(pctEjecIng * 100).toFixed(1)}% de los ingresos presupuestados en ${effectiveYear}.`,
    }] : []),
    ...(pctEjecGas != null ? [{
      label: 'Ejecución gastos',
      value: `${(pctEjecGas * 100).toFixed(1)}%`,
      trend: pctEjecGas >= 0.95 ? 'up' as const : 'neutral' as const,
      description: `Se ejecutó el ${(pctEjecGas * 100).toFixed(1)}% del crédito de gasto aprobado en ${effectiveYear}.`,
    }] : []),
  ]

  const histYears = datos.map((d) => String(d.year))

  return (
    <div className="space-y-8">
      <PageHeader
        title="Estado"
        subtitle={`Presupuesto del Estado · ${effectiveYear ?? '—'}`}
      />

      <ContextBox title="El Presupuesto del Estado">
        <p>
          El <strong>Presupuesto General del Estado</strong> es el documento contable que recoge
          las previsiones de ingresos y las autorizaciones de gasto del Gobierno central para cada
          ejercicio. Los ingresos proceden principalmente de impuestos (IRPF, IVA, Sociedades) y
          la deuda pública; los gastos incluyen transferencias a la Seguridad Social, CCAA,
          nóminas públicas e inversiones.
        </p>
        <p>
          Los datos de <strong>plan</strong> corresponden a los Presupuestos Generales aprobados
          (SEPG); los de <strong>ejecución</strong> a los derechos reconocidos e
          obligaciones reconocidas publicados por el IGAE.
        </p>
      </ContextBox>

      <InsightsPanel insights={insights} isLoading={loading} />

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        <KpiCard
          title={`Ingresos ${hasEjec ? '(ejec.)' : '(plan)'}`}
          value={loading ? '—' : formatEur(ingresos)}
          subtitle={`${effectiveYear ?? ''}`}
          accent
        />
        <KpiCard
          title={`Gastos ${hasEjec ? '(ejec.)' : '(plan)'}`}
          value={loading ? '—' : formatEur(gastos)}
          subtitle={`${effectiveYear ?? ''}`}
        />
        <KpiCard
          title="Saldo"
          value={loading ? '—' : formatEur(saldo)}
          trend={saldo >= 0 ? 'up' : 'down'}
          subtitle={saldo >= 0 ? 'Superávit' : 'Déficit'}
        />
      </div>

      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
          Ingresos y gastos del Estado · serie histórica
        </h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">
          Millones de euros. Plan presupuestario.
        </p>
        {loading ? (
          <ChartSkeleton height={280} />
        ) : datos.length > 0 ? (
          <LineChart
            categories={histYears}
            series={[
              { name: 'Ingresos (plan)', data: datos.map((d) => d.ingresos_plan), color: '#B82A2A' },
              { name: 'Gastos (plan)', data: datos.map((d) => d.gastos_plan), color: '#C89B3C' },
            ]}
            height={280}
            smooth
          />
        ) : (
          <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos históricos.</p>
        )}
      </div>

      {!loading && datos.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-3">
            Cuadro resumen anual
          </h2>
          <div className="overflow-x-auto border border-[var(--color-rule)] bg-white">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Año</th>
                  <th>Ing. plan (M€)</th>
                  <th>Ing. ejec. (M€)</th>
                  <th>Gasto plan (M€)</th>
                  <th>Gasto ejec. (M€)</th>
                  <th>Saldo ejec. (M€)</th>
                </tr>
              </thead>
              <tbody>
                {[...datos].reverse().slice(0, 10).map((d) => {
                  const saldoEjec = d.ingresos_ejec > 0 && d.gastos_ejec > 0
                    ? d.ingresos_ejec - d.gastos_ejec
                    : null
                  return (
                    <tr key={d.year}>
                      <td className="font-mono font-medium">{d.year}</td>
                      <td>{formatEur(d.ingresos_plan)}</td>
                      <td>{d.ingresos_ejec > 0 ? formatEur(d.ingresos_ejec) : '—'}</td>
                      <td>{formatEur(d.gastos_plan)}</td>
                      <td>{d.gastos_ejec > 0 ? formatEur(d.gastos_ejec) : '—'}</td>
                      <td className={saldoEjec != null ? (saldoEjec >= 0 ? 'text-emerald-700' : 'text-red-700') : ''}>
                        {saldoEjec != null ? formatEur(saldoEjec) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">
            Fuente: SEPG (plan) · IGAE (ejecución). M€ a precios corrientes. Caps. no financieros (1–7).
          </p>
        </section>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[
          { to: '/estado/ingresos', label: 'Ingresos', desc: 'Por capítulo · plan y ejecución' },
          { to: '/estado/ingresos/impuestos', label: 'Impuestos AEAT', desc: 'IRPF, IVA, Sociedades…' },
          { to: '/estado/gastos', label: 'Gastos', desc: 'Por capítulo y por política' },
          { to: '/estado/gastos/funcion', label: 'Gasto por función', desc: 'Clasificación COFOG' },
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
