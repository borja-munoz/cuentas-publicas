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
  getAappYears,
  getAappResumen,
  getPibAnual,
  type AappResumen,
  type PibAnual,
} from '../../db/queries/aapp'

export default function Inicio() {
  const { selectedYear, setPageFilters } = useFilters()
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [resumen, setResumen] = useState<AappResumen[]>([])
  const [pib, setPib] = useState<PibAnual[]>([])
  const [loading, setLoading] = useState(true)

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

  useEffect(() => {
    setLoading(true)
    Promise.all([getAappResumen('S13'), getPibAnual()])
      .then(([r, p]) => { setResumen(r); setPib(p) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const currResumen = resumen.find((r) => r.year === effectiveYear)
  const prevResumen = resumen.find((r) => r.year === (effectiveYear ?? 0) - 1)
  const pibActual = pib.find((p) => p.year === effectiveYear)?.pib ?? null

  const gastosPib = pibActual && currResumen ? (currResumen.gastos / pibActual) * 100 : null
  const ingresosPib = pibActual && currResumen ? (currResumen.ingresos / pibActual) * 100 : null
  const saldoPib = pibActual && currResumen ? (currResumen.saldo / pibActual) * 100 : null

  const yoyIngresos = prevResumen && currResumen && prevResumen.ingresos > 0
    ? (currResumen.ingresos - prevResumen.ingresos) / prevResumen.ingresos
    : null
  const yoyGastos = prevResumen && currResumen && prevResumen.gastos > 0
    ? (currResumen.gastos - prevResumen.gastos) / prevResumen.gastos
    : null

  const yearsInSeries = useMemo(() => resumen.map((r) => String(r.year)), [resumen])

  const insights: Insight[] = loading || !currResumen ? [] : [
    ...(ingresosPib != null ? [{
      label: 'Ingresos públicos / PIB',
      value: `${ingresosPib.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`,
      trend: 'neutral' as const,
      description: `Los ingresos de las Administraciones Públicas representan el ${ingresosPib.toFixed(1)}% del PIB en ${effectiveYear}, según metodología SEC2010 (Eurostat).`,
    }] : []),
    ...(gastosPib != null ? [{
      label: 'Gasto público / PIB',
      value: `${gastosPib.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`,
      trend: 'neutral' as const,
      description: `El gasto total de las AAPP equivale al ${gastosPib.toFixed(1)}% del PIB. Incluye prestaciones sociales, remuneración de empleados públicos, intereses de la deuda e inversión pública.`,
    }] : []),
    ...(saldoPib != null ? [{
      label: 'Saldo presupuestario',
      value: `${saldoPib >= 0 ? '+' : ''}${saldoPib.toLocaleString('es-ES', { maximumFractionDigits: 1 })}% del PIB`,
      trend: saldoPib >= 0 ? 'up' as const : 'down' as const,
      description: `Capacidad/necesidad de financiación de las AAPP en ${effectiveYear}: ${formatEur(Math.abs(currResumen.saldo))} (${currResumen.saldo >= 0 ? 'superávit' : 'déficit'}). Indicador oficial del Procedimiento de Déficit Excesivo (PDE) de la UE.`,
    }] : []),
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="Cuentas Públicas"
        subtitle={`Administraciones Públicas · SEC2010 · ${effectiveYear ?? '—'}${effectiveYear !== selectedYear && effectiveYear != null ? ' (último disponible)' : ''}`}
      />

      <ContextBox title="Cuentas consolidadas de las Administraciones Públicas">
        <p>
          Este panel muestra las cuentas <strong>consolidadas de todas las Administraciones
          Públicas españolas</strong> (Estado, CCAA, Corporaciones Locales y Seguridad Social),
          calculadas según la metodología <strong>SEC2010</strong> (Sistema Europeo de Cuentas),
          que es el estándar utilizado por la Comisión Europea para evaluar el déficit y la deuda.
        </p>
        <p>
          Los datos provienen de Eurostat (dataset <strong>gov_10a_main</strong>) y cubren desde
          1995. Explora cada subsector usando los apartados de la barra lateral.
        </p>
      </ContextBox>

      <InsightsPanel insights={insights} isLoading={loading} />

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        <KpiCard
          title="Ingresos AAPP"
          value={loading || !currResumen ? '—' : formatEur(currResumen.ingresos)}
          trendValue={yoyIngresos != null ? `${yoyIngresos >= 0 ? '+' : ''}${(yoyIngresos * 100).toFixed(1)}% vs año anterior` : undefined}
          trend={yoyIngresos != null ? (yoyIngresos >= 0 ? 'up' : 'down') : undefined}
          subtitle={ingresosPib != null ? `${ingresosPib.toFixed(1)}% del PIB` : `${effectiveYear ?? ''}`}
          accent
        />
        <KpiCard
          title="Gastos AAPP"
          value={loading || !currResumen ? '—' : formatEur(currResumen.gastos)}
          trendValue={yoyGastos != null ? `${yoyGastos >= 0 ? '+' : ''}${(yoyGastos * 100).toFixed(1)}% vs año anterior` : undefined}
          trend={yoyGastos != null ? (yoyGastos >= 0 ? 'down' : 'up') : undefined}
          subtitle={gastosPib != null ? `${gastosPib.toFixed(1)}% del PIB` : `${effectiveYear ?? ''}`}
        />
        <KpiCard
          title="Saldo presupuestario"
          value={loading || !currResumen ? '—' : formatEur(currResumen.saldo)}
          trendValue={saldoPib != null ? `${saldoPib >= 0 ? '+' : ''}${saldoPib.toFixed(1)}% PIB` : undefined}
          trend={currResumen ? (currResumen.saldo >= 0 ? 'up' : 'down') : undefined}
          subtitle={currResumen ? (currResumen.saldo >= 0 ? 'Superávit' : 'Déficit') : undefined}
        />
      </div>

      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
          Ingresos y gastos AAPP · 1995–actual
        </h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">
          Millones de euros a precios corrientes. Metodología SEC2010. Administraciones Públicas consolidadas.
        </p>
        {loading ? (
          <ChartSkeleton height={300} />
        ) : yearsInSeries.length > 0 ? (
          <LineChart
            categories={yearsInSeries}
            series={[
              { name: 'Ingresos', data: resumen.map((r) => r.ingresos), color: '#B82A2A' },
              { name: 'Gastos', data: resumen.map((r) => r.gastos), color: '#C89B3C' },
            ]}
            height={300}
            smooth
          />
        ) : (
          <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos históricos.</p>
        )}
      </div>

      {/* Scope cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'AAPP', desc: 'Ingresos y gastos consolidados (SEC2010)', links: [{ to: '/aapp/ingresos', text: 'Ingresos' }, { to: '/aapp/gastos', text: 'Gastos' }] },
          { label: 'Estado', desc: 'Presupuesto del Estado · Plan y ejecución', links: [{ to: '/estado/ingresos', text: 'Ingresos' }, { to: '/estado/gastos', text: 'Gastos' }] },
          { label: 'Seg. Social', desc: 'Cotizaciones, prestaciones y pensiones', links: [{ to: '/ss/ingresos', text: 'Ingresos' }, { to: '/ss/gastos', text: 'Gastos' }] },
          { label: 'CCAA', desc: 'Comunidades Autónomas · presupuesto regional', links: [{ to: '/ccaa', text: 'Resumen' }, { to: '/ccaa/ingresos', text: 'Ingresos' }, { to: '/ccaa/gastos', text: 'Gastos' }] },
        ].map((card) => (
          <div key={card.label} className="border border-[var(--color-rule)] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-faint)] mb-1">{card.label}</p>
            <p className="text-xs text-[var(--color-ink-muted)] mb-3">{card.desc}</p>
            <div className="flex flex-wrap gap-2">
              {card.links.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="text-xs font-medium text-[var(--color-accent)] hover:underline"
                >
                  {l.text} →
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[0.7rem] text-[var(--color-ink-faint)]">
        Fuente: Eurostat — gov_10a_main (Government finance statistics). Datos en M€ a precios corrientes. Metodología SEC2010.
      </p>
    </div>
  )
}
