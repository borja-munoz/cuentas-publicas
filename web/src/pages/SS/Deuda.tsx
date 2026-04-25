import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../../components/layout/PageHeader'
import ContextBox from '../../components/ui/ContextBox'
import KpiCard from '../../components/ui/KpiCard'
import InsightsPanel from '../../components/ui/InsightsPanel'
import LineChart from '../../components/charts/LineChart'
import BarChart from '../../components/charts/BarChart'
import { ChartSkeleton } from '../../components/ui/LoadingSkeleton'
import { useFilters } from '../../store/filters'
import { formatEur } from '../../utils/format'
import type { Insight } from '../../utils/insights'
import { getPibAnual, type PibAnual } from '../../db/queries/aapp'
import {
  getDeudaHistorica,
  getDeudaYears,
  getDeudaInstrumentoHistorico,
  getDeudaVencimientoHistorico,
  getDeudaTenedoresHistorico,
  INSTRUMENTO_COLORS,
  VENCIMIENTO_COLORS,
  VENCIMIENTO_ORDER,
  TENEDOR_COLORS,
  type DeudaRow,
  type DeudaDetalleRow,
} from '../../db/queries/deuda'

const subsector = 'S1314'

const INSTRUMENTO_ORDER = ['GD_F4', 'GD_F3', 'F4', 'GD_F2']
const TENEDOR_ORDER = ['S2', 'S121', 'S122_S123', 'S14_S15']

function toSeries(
  rows: DeudaDetalleRow[],
  years: string[],
  order: string[],
  colors: Record<string, string>,
) {
  const byCode = new Map<string, { name: string; data: (number | null)[] }>()
  const yearIdx = Object.fromEntries(years.map((y, i) => [y, i]))
  for (const row of rows) {
    if (!order.includes(row.codigo)) continue
    if (!byCode.has(row.codigo)) {
      byCode.set(row.codigo, { name: row.nombre, data: Array(years.length).fill(null) })
    }
    const i = yearIdx[String(row.year)]
    if (i !== undefined) byCode.get(row.codigo)!.data[i] = row.importe
  }
  return order
    .filter((c) => byCode.has(c))
    .map((c) => ({ name: byCode.get(c)!.name, data: byCode.get(c)!.data as number[], color: colors[c] }))
}

export default function SSDeuda() {
  const { selectedYear, setPageFilters } = useFilters()
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [historica, setHistorica] = useState<DeudaRow[]>([])
  const [pib, setPib] = useState<PibAnual[]>([])
  const [instrumento, setInstrumento] = useState<DeudaDetalleRow[]>([])
  const [vencimiento, setVencimiento] = useState<DeudaDetalleRow[]>([])
  const [tenedores, setTenedores] = useState<DeudaDetalleRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setPageFilters({ showViewMode: false, showComparativa: false })
    return () => setPageFilters({ showViewMode: false, showComparativa: false })
  }, [setPageFilters])

  useEffect(() => {
    getDeudaYears().then(setAvailableYears).catch(console.error)
  }, [])

  const effectiveYear = useMemo(() => {
    if (availableYears.length === 0) return null
    if (availableYears.includes(selectedYear)) return selectedYear
    const below = availableYears.filter((y) => y <= selectedYear)
    return below.length > 0 ? Math.max(...below) : Math.min(...availableYears)
  }, [availableYears, selectedYear])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getDeudaHistorica(subsector),
      getPibAnual(),
      getDeudaInstrumentoHistorico(subsector),
      getDeudaVencimientoHistorico(subsector),
      getDeudaTenedoresHistorico(subsector),
    ]).then(([hist, p, inst, venc, ten]) => {
      setHistorica(hist as DeudaRow[])
      setPib(p as PibAnual[])
      setInstrumento(inst as DeudaDetalleRow[])
      setVencimiento(venc as DeudaDetalleRow[])
      setTenedores(ten as DeudaDetalleRow[])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const currRow   = historica.find((r) => r.year === effectiveYear)
  const prevRow   = historica.find((r) => r.year === (effectiveYear ?? 0) - 1)
  const pibActual = pib.find((p) => p.year === effectiveYear)?.pib ?? null

  const deudaPib = pibActual && currRow ? (currRow.importe / pibActual) * 100 : null
  const yoy = prevRow && currRow && prevRow.importe > 0
    ? (currRow.importe - prevRow.importe) / prevRow.importe
    : null

  const yearsDeuda = historica.map((r) => String(r.year))
  const yearsGgd = useMemo(() => {
    const s = new Set(instrumento.map((r) => String(r.year)))
    return Array.from(s).sort()
  }, [instrumento])

  const seriesDeudaPib = useMemo(() => {
    const deudaByYear = Object.fromEntries(historica.map((r) => [r.year, r.importe]))
    const pibByYear   = Object.fromEntries(pib.map((r) => [r.year, r.pib]))
    const years = historica.map((r) => r.year).filter((y) => pibByYear[y] != null)
    return {
      years: years.map(String),
      deuda: years.map((y) => deudaByYear[y] ?? null),
      pib:   years.map((y) => pibByYear[y] ?? null),
    }
  }, [historica, pib])

  const seriesInstrumento = useMemo(() => toSeries(instrumento, yearsGgd, INSTRUMENTO_ORDER, INSTRUMENTO_COLORS), [instrumento, yearsGgd])
  const seriesVencimiento = useMemo(() => toSeries(vencimiento, yearsGgd, VENCIMIENTO_ORDER, VENCIMIENTO_COLORS), [vencimiento, yearsGgd])
  const seriesTenedores   = useMemo(() => toSeries(tenedores, yearsGgd, TENEDOR_ORDER, TENEDOR_COLORS), [tenedores, yearsGgd])

  const insights: Insight[] = loading || !currRow ? [] : [
    ...(deudaPib != null ? [{
      label: 'Deuda SS / PIB',
      value: `${deudaPib.toFixed(1)}%`,
      trend: 'neutral' as const,
      description: `La deuda bruta de la Seguridad Social equivale al ${deudaPib.toFixed(1)}% del PIB en ${effectiveYear}.`,
    }] : []),
    ...(yoy != null ? [{
      label: 'Variación interanual',
      value: `${yoy >= 0 ? '+' : ''}${(yoy * 100).toFixed(1)}%`,
      trend: yoy <= 0 ? 'up' as const : 'down' as const,
      description: `La deuda de la Seguridad Social ${yoy >= 0 ? 'aumentó' : 'disminuyó'} un ${Math.abs(yoy * 100).toFixed(1)}% en ${effectiveYear}.`,
    }] : []),
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="Deuda Seguridad Social"
        subtitle={`Seguridad Social · PDE (Maastricht) · ${effectiveYear ?? '—'}${effectiveYear !== selectedYear && effectiveYear != null ? ' (último disponible)' : ''}`}
      />

      <ContextBox title="Deuda de la Seguridad Social en metodología Maastricht">
        <p>
          Muestra la <strong>deuda bruta consolidada de las Administraciones de Seguridad
          Social</strong> (subsector S1314 SEC2010), calculada según el criterio{' '}
          <strong>Maastricht (PDE)</strong>. Incluye los pasivos de la Tesorería General de la
          Seguridad Social, el SEPE y demás entidades de previsión social.
        </p>
        <p>
          Datos: Eurostat <strong>gov_10dd_edpt1</strong> y <strong>gov_10dd_ggd</strong>.
          La deuda de la SS ha crecido desde 2012 por el déficit estructural del sistema
          contributivo y los préstamos del Estado al Fondo de Reserva.
        </p>
      </ContextBox>

      <InsightsPanel insights={insights} isLoading={loading} />

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        <KpiCard
          title="Deuda SS"
          value={loading || !currRow ? '—' : formatEur(currRow.importe)}
          trendValue={yoy != null ? `${yoy >= 0 ? '+' : ''}${(yoy * 100).toFixed(1)}% vs año anterior` : undefined}
          trend={yoy != null ? (yoy <= 0 ? 'up' : 'down') : undefined}
          subtitle={deudaPib != null ? `${deudaPib.toFixed(1)}% del PIB` : `${effectiveYear ?? ''}`}
          accent
        />
      </div>

      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">Stock de deuda · 1995–actual</h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">Millones de euros. Criterio Maastricht. Seguridad Social (S1314).</p>
        {loading ? <ChartSkeleton height={240} /> : (
          <LineChart categories={yearsDeuda} series={[{ name: 'Deuda SS', data: historica.map((r) => r.importe), color: '#B82A2A' }]} height={240} smooth />
        )}
      </div>

      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">Deuda SS vs PIB · 1995–actual</h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">Millones de euros a precios corrientes.</p>
        {loading ? <ChartSkeleton height={240} /> : seriesDeudaPib.years.length > 0 ? (
          <LineChart
            categories={seriesDeudaPib.years}
            series={[
              { name: 'PIB', data: seriesDeudaPib.pib as number[], color: '#6B7280' },
              { name: 'Deuda SS', data: seriesDeudaPib.deuda as number[], color: '#B82A2A' },
            ]}
            height={240} smooth
          />
        ) : <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos.</p>}
      </div>

      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">Deuda por instrumento · 2020–actual</h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">Millones de euros. Fuente: gov_10dd_ggd.</p>
        {loading ? <ChartSkeleton height={240} /> : seriesInstrumento.length > 0 ? (
          <BarChart categories={yearsGgd} series={seriesInstrumento} height={240} stacked />
        ) : <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos.</p>}
      </div>

      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">Deuda por plazo de vencimiento · 2020–actual</h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">Millones de euros. Fuente: gov_10dd_ggd.</p>
        {loading ? <ChartSkeleton height={240} /> : seriesVencimiento.length > 0 ? (
          <BarChart categories={yearsGgd} series={seriesVencimiento} height={240} stacked />
        ) : <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos.</p>}
      </div>

      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">Tenedores de deuda · 2020–actual</h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">Millones de euros. Fuente: gov_10dd_ggd.</p>
        {loading ? <ChartSkeleton height={240} /> : seriesTenedores.length > 0 ? (
          <BarChart categories={yearsGgd} series={seriesTenedores} height={240} stacked />
        ) : <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos.</p>}
      </div>

      {!loading && historica.length > 0 && (
        <div className="border border-[var(--color-rule)] bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-rule)]">
                <th className="px-4 py-2 text-left text-xs font-semibold text-[var(--color-ink-faint)]">Año</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-[var(--color-ink-faint)]">Deuda (M€)</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-[var(--color-ink-faint)]">% PIB</th>
              </tr>
            </thead>
            <tbody>
              {[...historica].reverse().map((row) => {
                const p = pib.find((p) => p.year === row.year)?.pib ?? null
                const pct = p ? (row.importe / p) * 100 : null
                return (
                  <tr key={row.year} className="border-b border-[var(--color-rule)] last:border-0">
                    <td className="px-4 py-2 text-[var(--color-ink)]">{row.year}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-[var(--color-ink)]">{formatEur(row.importe)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-[var(--color-ink-muted)]">{pct != null ? `${pct.toFixed(1)}%` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[0.7rem] text-[var(--color-ink-faint)]">
        Fuente: Eurostat — gov_10dd_edpt1 y gov_10dd_ggd. Deuda bruta consolidada SS (S1314), criterio Maastricht. M€.
      </p>
    </div>
  )
}
