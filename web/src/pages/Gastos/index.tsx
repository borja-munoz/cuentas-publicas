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
  getGastosPorCapitulo,
  getGastosHistoricoPorCapitulo,
  CAPITULO_GASTOS,
  CAPITULO_GASTOS_TOOLTIP,
  type GastosAnuales,
} from '../../db/queries/gastos'
import { formatEur, formatPct } from '../../utils/format'
import type { Insight } from '../../utils/insights'

// Capítulos con datos operacionales (excluir 8=Activos fin., 9=Pasivos fin.)
const CAPS_OPERACIONALES = [1, 2, 3, 4, 6, 7]

const CAP_COLORS: Record<number, string> = {
  1: '#1a3a52',
  2: '#326891',
  3: '#e07b39',
  4: '#5a9ab0',
  6: '#2d6a4f',
  7: '#7eb8d0',
}

export default function Gastos() {
  const { selectedYear, entityType, viewMode } = useFilters()
  const fuente = viewMode === 'ejecucion' ? 'ejecucion' : 'plan'

  const [caps, setCaps] = useState<GastosAnuales[]>([])
  const [historico, setHistorico] = useState<GastosAnuales[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getGastosPorCapitulo(selectedYear, entityType, fuente),
      getGastosHistoricoPorCapitulo(entityType, fuente),
    ])
      .then(([c, h]) => {
        setCaps(c)
        setHistorico(h)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedYear, entityType, fuente])

  const capsOp = caps.filter((c) => CAPS_OPERACIONALES.includes(c.capitulo))
  const total = caps.reduce((s, r) => s + (r.importe ?? 0), 0)
  const totalOp = capsOp.reduce((s, r) => s + (r.importe ?? 0), 0)

  const maxCap = capsOp.length > 0
    ? capsOp.reduce((a, b) => (b.importe > a.importe ? b : a))
    : null

  // Serie histórica por capítulo (para gráfico de líneas apiladas)
  const allYears = [...new Set(historico.map((r) => r.year))].sort()
  const histCategories = allYears.map(String)
  const histSeries = CAPS_OPERACIONALES.map((cap) => {
    const byYear = new Map(
      historico.filter((r) => r.capitulo === cap).map((r) => [r.year, r.importe]),
    )
    return {
      name: CAPITULO_GASTOS[cap] ?? `Cap. ${cap}`,
      data: allYears.map((y) => byYear.get(y) ?? null) as number[],
      color: CAP_COLORS[cap],
    }
  }).filter((s) => s.data.some((v) => v != null && v > 0))

  // Bar chart año actual
  const barCats = capsOp.map((c) => CAPITULO_GASTOS[c.capitulo] ?? `Cap. ${c.capitulo}`)
  const barData = capsOp.map((c) => c.importe)

  // Cap 4 (transferencias corrientes) — suele ser el mayor
  const cap4 = capsOp.find((c) => c.capitulo === 4)
  const cap1 = capsOp.find((c) => c.capitulo === 1)

  // YoY total
  const prevYearData = historico.filter(
    (h) => h.year === selectedYear - 1 && CAPS_OPERACIONALES.includes(h.capitulo),
  )
  const totalPrev = prevYearData.reduce((s, r) => s + (r.importe ?? 0), 0)
  const yoyRatio = totalPrev > 0 ? (totalOp - totalPrev) / totalPrev : null

  const insights: Insight[] = loading || capsOp.length === 0 ? [] : [
    ...(cap4 && totalOp > 0 ? [{
      label: 'Peso transf. corrientes (cap. 4)',
      value: `${((cap4.importe / totalOp) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`,
      trend: 'neutral' as const,
      description: `Las transferencias corrientes (${formatEur(cap4.importe)}) incluyen pensiones, transferencias a CCAA y subvenciones. Son el mayor bloque del gasto operacional en prácticamente todos los años.`,
    }] : []),
    ...(yoyRatio != null ? [{
      label: 'Variación gasto operacional',
      value: `${yoyRatio >= 0 ? '+' : ''}${(yoyRatio * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`,
      trend: yoyRatio > 0 ? 'down' as const : 'up' as const,
      trendValue: `vs ${selectedYear - 1}`,
      description: `El gasto operacional ${yoyRatio >= 0 ? 'aumentó' : 'disminuyó'} ${Math.abs(yoyRatio * 100).toFixed(1)}% respecto al año anterior, pasando de ${formatEur(totalPrev)} a ${formatEur(totalOp)}.`,
    }] : []),
    ...(cap1 && totalOp > 0 ? [{
      label: 'Gasto en personal (cap. 1)',
      value: formatEur(cap1.importe),
      trendValue: `${((cap1.importe / totalOp) * 100).toFixed(1)}% del total`,
      trend: 'neutral' as const,
      description: `El capítulo 1 recoge nóminas y cotizaciones sociales de empleados públicos. Su peso sobre el total operacional indica el tamaño relativo de la función pública.`,
    }] : []),
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="Gastos"
        subtitle={`${entityType} · ${fuente === 'plan' ? 'Plan' : 'Ejecución'} ${selectedYear}`}
      />

      <ContextBox title="Clasificación económica del gasto">
        <p>
          Los gastos públicos se clasifican según su <strong>naturaleza económica</strong>:{' '}
          personal (nóminas y cotizaciones), bienes y servicios, gastos financieros (intereses de
          la deuda), transferencias corrientes (pensiones, subvenciones) e inversiones reales
          (infraestructuras).
        </p>
        <p>
          El capítulo 4 (Transferencias corrientes) incluye las pensiones de la Seguridad Social,
          las transferencias a CCAA y las subvenciones a empresas y familias. En el Estado,
          representa habitualmente el mayor bloque de gasto operacional.
        </p>
      </ContextBox>

      <InsightsPanel insights={insights} isLoading={loading} />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        <KpiCard
          title={`Gasto operacional (${fuente})`}
          value={loading ? '—' : formatEur(totalOp)}
          trendValue={formatPct(yoyRatio) ? `${formatPct(yoyRatio)} vs año anterior` : undefined}
          trend={formatPct(yoyRatio) ? (yoyRatio! <= 0 ? 'up' : 'down') : undefined}
          subtitle={`${selectedYear} · caps. 1–7`}
          accent
        />
        <KpiCard
          title="Mayor capítulo"
          value={maxCap ? formatEur(maxCap.importe) : '—'}
          subtitle={maxCap ? CAPITULO_GASTOS[maxCap.capitulo] : undefined}
        />
        <KpiCard
          title="Gasto total (incl. fin.)"
          value={loading ? '—' : formatEur(total)}
          subtitle={`Caps. 1–9 · ${selectedYear}`}
        />
      </div>

      {/* Bar chart — gastos por capítulo */}
      <section>
        <div className="chart-card-rule bg-white border border-[var(--color-rule)] px-5 pt-4 pb-2">
          <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
            Gastos por capítulo económico · {selectedYear}
          </h2>
          <p className="text-xs text-[var(--color-ink-muted)] mb-4">
            Capítulos operacionales (1–7) en millones de €.
          </p>
          {loading ? (
            <ChartSkeleton height={280} />
          ) : (
            <BarChart
              categories={barCats}
              series={[{ name: 'Gasto', data: barData, color: '#326891' }]}
              horizontal
              height={280}
            />
          )}
        </div>
        <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">
          Fuente: SEPG (plan) / IGAE (ejecución).
        </p>
      </section>

      {/* Evolución histórica por capítulo */}
      <section>
        <div className="chart-card-rule bg-white border border-[var(--color-rule)] px-5 pt-4 pb-2">
          <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
            Evolución del gasto por capítulo · {entityType}
          </h2>
          <p className="text-xs text-[var(--color-ink-muted)] mb-4">
            Serie histórica en millones de €. Capítulos operacionales.
          </p>
          {loading ? (
            <ChartSkeleton height={300} />
          ) : (
            <LineChart
              categories={histCategories}
              series={histSeries}
              height={300}
              smooth
            />
          )}
        </div>
        <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">
          Fuente: SEPG (plan) / IGAE (ejecución).
        </p>
      </section>

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
                <th>Importe (M€)</th>
                <th>% del gasto operacional</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center text-[var(--color-ink-muted)] py-8">
                    Cargando…
                  </td>
                </tr>
              ) : (
                caps.map((c) => (
                  <tr key={c.capitulo}>
                    <td className="font-mono">{c.capitulo}</td>
                    <td>
                      {CAPITULO_GASTOS[c.capitulo] ?? '—'}
                      {CAPITULO_GASTOS_TOOLTIP[c.capitulo] && (
                        <InfoTooltip content={CAPITULO_GASTOS_TOOLTIP[c.capitulo]} />
                      )}
                    </td>
                    <td>{formatEur(c.importe)}</td>
                    <td>
                      {CAPS_OPERACIONALES.includes(c.capitulo) && totalOp > 0
                        ? `${((c.importe / totalOp) * 100).toLocaleString('es-ES', {
                            maximumFractionDigits: 1,
                          })}%`
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {!loading && caps.length > 0 && (
              <tfoot>
                <tr className="total-row">
                  <td colSpan={2}>Total operacional (caps. 1–7)</td>
                  <td>{formatEur(totalOp)}</td>
                  <td>100,0%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">
          Fuente: SEPG (plan) / IGAE (ejecución). El capítulo 5 (ingresos patrimoniales) no aparece en gastos.
        </p>
      </section>
    </div>
  )
}
