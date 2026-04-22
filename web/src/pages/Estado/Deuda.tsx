import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../../components/layout/PageHeader'
import ContextBox from '../../components/ui/ContextBox'
import KpiCard from '../../components/ui/KpiCard'
import InsightsPanel from '../../components/ui/InsightsPanel'
import LineChart from '../../components/charts/LineChart'
import { ChartSkeleton } from '../../components/ui/LoadingSkeleton'
import { useFilters } from '../../store/filters'
import { formatEur } from '../../utils/format'
import type { Insight } from '../../utils/insights'
import { getPibAnual, type PibAnual } from '../../db/queries/aapp'
import { getDeudaHistorica, getDeudaYears, type DeudaRow } from '../../db/queries/deuda'

const subsector = 'S1311'

export default function EstadoDeuda() {
  const { selectedYear, setPageFilters } = useFilters()
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [historica, setHistorica] = useState<DeudaRow[]>([])
  const [pib, setPib] = useState<PibAnual[]>([])
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
    Promise.all([getDeudaHistorica(subsector), getPibAnual()])
      .then(([hist, p]) => { setHistorica(hist); setPib(p) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const currRow = historica.find((r) => r.year === effectiveYear)
  const prevRow = historica.find((r) => r.year === (effectiveYear ?? 0) - 1)
  const pibActual = pib.find((p) => p.year === effectiveYear)?.pib ?? null

  const deudaPib = pibActual && currRow ? (currRow.importe / pibActual) * 100 : null
  const yoy = prevRow && currRow && prevRow.importe > 0
    ? (currRow.importe - prevRow.importe) / prevRow.importe
    : null

  const years = historica.map((r) => String(r.year))

  const insights: Insight[] = loading || !currRow ? [] : [
    ...(deudaPib != null ? [{
      label: 'Deuda Estado / PIB',
      value: `${deudaPib.toFixed(1)}%`,
      trend: 'neutral' as const,
      description: `La deuda del Estado equivale al ${deudaPib.toFixed(1)}% del PIB en ${effectiveYear}. El Estado (Administración Central) es el principal componente de la deuda pública española.`,
    }] : []),
    ...(yoy != null ? [{
      label: 'Variación interanual',
      value: `${yoy >= 0 ? '+' : ''}${(yoy * 100).toFixed(1)}%`,
      trend: yoy <= 0 ? 'up' as const : 'down' as const,
      description: `La deuda del Estado ${yoy >= 0 ? 'aumentó' : 'disminuyó'} un ${Math.abs(yoy * 100).toFixed(1)}% en ${effectiveYear}, lo que supone ${formatEur(Math.abs(currRow.importe - (prevRow?.importe ?? 0)))} de variación.`,
    }] : []),
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="Deuda del Estado"
        subtitle={`Administración Central · PDE (Maastricht) · ${effectiveYear ?? '—'}${effectiveYear !== selectedYear && effectiveYear != null ? ' (último disponible)' : ''}`}
      />

      <ContextBox title="Deuda del Estado en metodología Maastricht">
        <p>
          Este apartado muestra la <strong>deuda bruta consolidada de la Administración
          Central del Estado</strong> (subsector S1311 en terminología SEC2010). Se calcula
          según el criterio Maastricht del{' '}
          <strong>Procedimiento de Déficit Excesivo (PDE)</strong>: incluye bonos y
          obligaciones del Tesoro, letras, préstamos y otros pasivos exigibles, valorados
          a precio nominal.
        </p>
        <p>
          Los datos provienen de Eurostat (dataset <strong>gov_10dd_edpt1</strong>). El Estado
          concentra habitualmente más del 80% de la deuda total de las AAPP españolas. El
          Tesoro Público gestiona la emisión a través del{' '}
          <em>Programa de Financiación Anual</em>.
        </p>
      </ContextBox>

      <InsightsPanel insights={insights} isLoading={loading} />

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        <KpiCard
          title="Deuda Estado"
          value={loading || !currRow ? '—' : formatEur(currRow.importe)}
          trendValue={yoy != null ? `${yoy >= 0 ? '+' : ''}${(yoy * 100).toFixed(1)}% vs año anterior` : undefined}
          trend={yoy != null ? (yoy <= 0 ? 'up' : 'down') : undefined}
          subtitle={deudaPib != null ? `${deudaPib.toFixed(1)}% del PIB` : `${effectiveYear ?? ''}`}
          accent
        />
      </div>

      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
          Deuda Estado · 1995–actual
        </h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">
          Millones de euros. Criterio Maastricht (PDE). Administración Central (S1311).
        </p>
        {loading ? (
          <ChartSkeleton height={280} />
        ) : years.length > 0 ? (
          <LineChart
            categories={years}
            series={[{ name: 'Deuda Estado', data: historica.map((r) => r.importe), color: '#B82A2A' }]}
            height={280}
            smooth
          />
        ) : (
          <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos.</p>
        )}
      </div>

      {/* Tabla histórica */}
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
        Fuente: Eurostat — gov_10dd_edpt1. Deuda bruta consolidada del Estado (S1311), criterio Maastricht. M€.
      </p>
    </div>
  )
}
