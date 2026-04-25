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
  getDeudaAnual,
  getDeudaYears,
  getDeudaInstrumentoHistorico,
  getDeudaVencimientoHistorico,
  getDeudaTenedoresHistorico,
  INSTRUMENTO_COLORS,
  VENCIMIENTO_COLORS,
  VENCIMIENTO_ORDER,
  TENEDOR_COLORS,
  type DeudaRow,
  type DeudaSubsectorRow,
  type DeudaDetalleRow,
} from '../../db/queries/deuda'

const SUBSECTOR_LABELS: Record<string, string> = {
  S13:   'AAPP (total)',
  S1311: 'Estado',
  S1312: 'CCAA',
  S1313: 'CCLL',
  S1314: 'Seg. Social',
}

const SUBSECTOR_COLORS: Record<string, string> = {
  S1311: '#B82A2A',
  S1312: '#C89B3C',
  S1313: '#2E6B9E',
  S1314: '#1F7A3D',
}

const SUBSECTORES_DETALLE = ['S1311', 'S1312', 'S1313', 'S1314'] as const

/** Pivota filas (year, codigo, nombre, importe) en series para LineChart/BarChart */
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

export default function AappDeuda() {
  const { selectedYear, setPageFilters } = useFilters()
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [historica, setHistorica] = useState<DeudaRow[]>([])
  const [historicaSubsectores, setHistoricaSubsectores] = useState<Record<string, DeudaRow[]>>({})
  const [deudaAnual, setDeudaAnual] = useState<DeudaSubsectorRow[]>([])
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
      getDeudaHistorica('S13'),
      ...SUBSECTORES_DETALLE.map((s) => getDeudaHistorica(s)),
      getPibAnual(),
      getDeudaInstrumentoHistorico('S13'),
      getDeudaVencimientoHistorico('S13'),
      getDeudaTenedoresHistorico('S13'),
    ]).then(([hist, ...rest]) => {
      const subsectorData = rest.slice(0, SUBSECTORES_DETALLE.length) as DeudaRow[][]
      const pibData        = rest[SUBSECTORES_DETALLE.length] as PibAnual[]
      const instData       = rest[SUBSECTORES_DETALLE.length + 1] as DeudaDetalleRow[]
      const vencData       = rest[SUBSECTORES_DETALLE.length + 2] as DeudaDetalleRow[]
      const tenData        = rest[SUBSECTORES_DETALLE.length + 3] as DeudaDetalleRow[]

      setHistorica(hist as DeudaRow[])
      const bySubsector: Record<string, DeudaRow[]> = {}
      SUBSECTORES_DETALLE.forEach((s, i) => { bySubsector[s] = subsectorData[i] })
      setHistoricaSubsectores(bySubsector)
      setPib(pibData)
      setInstrumento(instData)
      setVencimiento(vencData)
      setTenedores(tenData)
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (effectiveYear == null) return
    getDeudaAnual(effectiveYear).then(setDeudaAnual).catch(console.error)
  }, [effectiveYear])

  const currTotal = historica.find((r) => r.year === effectiveYear)
  const prevTotal = historica.find((r) => r.year === (effectiveYear ?? 0) - 1)
  const pibActual = pib.find((p) => p.year === effectiveYear)?.pib ?? null

  const deudaPib = pibActual && currTotal ? (currTotal.importe / pibActual) * 100 : null
  const yoyDeuda = prevTotal && currTotal && prevTotal.importe > 0
    ? (currTotal.importe - prevTotal.importe) / prevTotal.importe
    : null
  const deudaEstado = deudaAnual.find((r) => r.subsector === 'S1311')?.importe ?? null

  // Años disponibles en los datos históricos (deuda + PIB desde 1995)
  const yearsDeuda = historica.map((r) => String(r.year))

  // Años disponibles en ggd (desde 2000)
  const yearsGgd = useMemo(() => {
    const s = new Set(instrumento.map((r) => String(r.year)))
    return Array.from(s).sort()
  }, [instrumento])

  const INSTRUMENTO_ORDER = ['GD_F4', 'GD_F3', 'F4', 'GD_F2']
  const TENEDOR_ORDER = ['S2', 'S121', 'S122_S123', 'S14_S15']

  const seriesInstrumento = useMemo(
    () => toSeries(instrumento, yearsGgd, INSTRUMENTO_ORDER, INSTRUMENTO_COLORS),
    [instrumento, yearsGgd],
  )
  const seriesVencimiento = useMemo(
    () => toSeries(vencimiento, yearsGgd, VENCIMIENTO_ORDER, VENCIMIENTO_COLORS),
    [vencimiento, yearsGgd],
  )
  const seriesTenedores = useMemo(
    () => toSeries(tenedores, yearsGgd, TENEDOR_ORDER, TENEDOR_COLORS),
    [tenedores, yearsGgd],
  )

  // Serie deuda + PIB para comparativa
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

  const insights: Insight[] = loading || !currTotal ? [] : [
    ...(deudaPib != null ? [{
      label: 'Deuda AAPP / PIB',
      value: `${deudaPib.toFixed(1)}%`,
      trend: deudaPib > 100 ? 'down' as const : deudaPib > 60 ? 'neutral' as const : 'up' as const,
      description: `La deuda bruta de las AAPP equivale al ${deudaPib.toFixed(1)}% del PIB en ${effectiveYear}. El límite del Pacto de Estabilidad y Crecimiento es el 60% del PIB.`,
    }] : []),
    ...(deudaEstado != null && currTotal ? [{
      label: 'Peso deuda Estado',
      value: `${((deudaEstado / currTotal.importe) * 100).toFixed(1)}%`,
      trend: 'neutral' as const,
      description: `El Estado (Administración Central) concentra el ${((deudaEstado / currTotal.importe) * 100).toFixed(1)}% de la deuda total de las AAPP.`,
    }] : []),
    ...(yoyDeuda != null ? [{
      label: 'Variación interanual',
      value: `${yoyDeuda >= 0 ? '+' : ''}${(yoyDeuda * 100).toFixed(1)}%`,
      trend: yoyDeuda <= 0 ? 'up' as const : 'down' as const,
      description: `La deuda de las AAPP ${yoyDeuda >= 0 ? 'creció' : 'redujo'} un ${Math.abs(yoyDeuda * 100).toFixed(1)}% en ${effectiveYear}, equivalente a ${formatEur(Math.abs(currTotal.importe - (prevTotal?.importe ?? 0)))}.`,
    }] : []),
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="Deuda Pública"
        subtitle={`Administraciones Públicas · PDE (Maastricht) · ${effectiveYear ?? '—'}${effectiveYear !== selectedYear && effectiveYear != null ? ' (último disponible)' : ''}`}
      />

      <ContextBox title="Deuda pública en metodología Maastricht (PDE)">
        <p>
          La <strong>deuda del Procedimiento de Déficit Excesivo (PDE)</strong> es el indicador
          oficial de la UE para supervisar la sostenibilidad fiscal. Es la{' '}
          <strong>deuda bruta consolidada</strong> a valor nominal: incluye bonos, letras,
          préstamos e instrumentos similares, pero excluye pasivos entre subsectores de las
          propias AAPP.
        </p>
        <p>
          Los datos provienen de Eurostat (<strong>gov_10dd_edpt1</strong> para el stock total
          y <strong>gov_10dd_ggd</strong> para el desglose por instrumento, vencimiento y
          acreedor). El límite del <em>Pacto de Estabilidad</em> es el <strong>60% del PIB</strong>.
        </p>
      </ContextBox>

      <InsightsPanel insights={insights} isLoading={loading} />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        <KpiCard
          title="Deuda AAPP"
          value={loading || !currTotal ? '—' : formatEur(currTotal.importe)}
          trendValue={yoyDeuda != null ? `${yoyDeuda >= 0 ? '+' : ''}${(yoyDeuda * 100).toFixed(1)}% vs año anterior` : undefined}
          trend={yoyDeuda != null ? (yoyDeuda <= 0 ? 'up' : 'down') : undefined}
          subtitle={deudaPib != null ? `${deudaPib.toFixed(1)}% del PIB` : `${effectiveYear ?? ''}`}
          accent
        />
        {SUBSECTORES_DETALLE.slice(0, 2).map((s) => {
          const row = deudaAnual.find((r) => r.subsector === s)
          const pct = pibActual && row ? (row.importe / pibActual) * 100 : null
          return (
            <KpiCard
              key={s}
              title={`Deuda ${SUBSECTOR_LABELS[s]}`}
              value={loading || !row ? '—' : formatEur(row.importe)}
              subtitle={pct != null ? `${pct.toFixed(1)}% del PIB` : `${effectiveYear ?? ''}`}
            />
          )
        })}
      </div>

      {/* Stock total histórico */}
      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">Stock de deuda AAPP · 1995–actual</h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">Millones de euros. Criterio Maastricht (PDE). Deuda bruta consolidada.</p>
        {loading ? <ChartSkeleton height={260} /> : (
          <LineChart
            categories={yearsDeuda}
            series={[{ name: 'Deuda AAPP', data: historica.map((r) => r.importe), color: '#B82A2A' }]}
            height={260} smooth
          />
        )}
      </div>

      {/* Deuda + PIB comparativa */}
      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">Deuda AAPP vs PIB · 1995–actual</h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">Millones de euros a precios corrientes. Permite comparar la evolución del stock de deuda con el tamaño de la economía.</p>
        {loading ? <ChartSkeleton height={260} /> : seriesDeudaPib.years.length > 0 ? (
          <LineChart
            categories={seriesDeudaPib.years}
            series={[
              { name: 'PIB', data: seriesDeudaPib.pib as number[], color: '#6B7280' },
              { name: 'Deuda AAPP', data: seriesDeudaPib.deuda as number[], color: '#B82A2A' },
            ]}
            height={260} smooth
          />
        ) : <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos.</p>}
      </div>

      {/* Deuda por subsector */}
      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">Deuda por subsector · 1995–actual</h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">Millones de euros por subsector (no consolidado entre ellos).</p>
        {loading ? <ChartSkeleton height={260} /> : (
          <LineChart
            categories={yearsDeuda}
            series={SUBSECTORES_DETALLE.map((s) => ({
              name: SUBSECTOR_LABELS[s],
              data: historicaSubsectores[s]?.map((r) => r.importe) ?? [],
              color: SUBSECTOR_COLORS[s],
            }))}
            height={260} smooth
          />
        )}
      </div>

      {/* Por instrumento */}
      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">Deuda por instrumento · 2020–actual</h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">Millones de euros. Bonos y Obligaciones son la principal fuente de financiación. Letras del Tesoro cubren necesidades a corto plazo. Fuente: Eurostat gov_10dd_ggd.</p>
        {loading ? <ChartSkeleton height={260} /> : seriesInstrumento.length > 0 ? (
          <BarChart
            categories={yearsGgd}
            series={seriesInstrumento}
            height={260}
            stacked
          />
        ) : <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos.</p>}
      </div>

      {/* Por vencimiento */}
      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">Deuda por plazo de vencimiento · 2020–actual</h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">Millones de euros. La deuda a largo plazo (&gt;5 años) proporciona estabilidad financiera y reduce el riesgo de refinanciación. Fuente: Eurostat gov_10dd_ggd.</p>
        {loading ? <ChartSkeleton height={260} /> : seriesVencimiento.length > 0 ? (
          <BarChart
            categories={yearsGgd}
            series={seriesVencimiento}
            height={260}
            stacked
          />
        ) : <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos.</p>}
      </div>

      {/* Por tenedor */}
      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">Tenedores de deuda AAPP · 2020–actual</h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">Millones de euros. Muestra quién posee la deuda pública española: no residentes (inversores extranjeros), BCE/BdE (compras QE), bancos nacionales, hogares, etc. Fuente: Eurostat gov_10dd_ggd.</p>
        {loading ? <ChartSkeleton height={260} /> : seriesTenedores.length > 0 ? (
          <BarChart
            categories={yearsGgd}
            series={seriesTenedores}
            height={260}
            stacked
          />
        ) : <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos.</p>}
      </div>

      {/* Tabla subsectores año seleccionado */}
      {!loading && deudaAnual.length > 0 && (
        <div className="border border-[var(--color-rule)] bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-rule)]">
                <th className="px-4 py-2 text-left text-xs font-semibold text-[var(--color-ink-faint)]">Subsector</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-[var(--color-ink-faint)]">Deuda (M€)</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-[var(--color-ink-faint)]">% PIB</th>
              </tr>
            </thead>
            <tbody>
              {deudaAnual.filter((row) => row.subsector !== 'S13').map((row) => {
                const pct = pibActual ? (row.importe / pibActual) * 100 : null
                return (
                  <tr key={row.subsector} className="border-b border-[var(--color-rule)] last:border-0">
                    <td className="px-4 py-2 text-[var(--color-ink)]">{SUBSECTOR_LABELS[row.subsector] ?? row.subsector}</td>
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
        Fuente: Eurostat — gov_10dd_edpt1 (stock PDE) y gov_10dd_ggd (instrumento, vencimiento, tenedores). Deuda bruta consolidada, criterio Maastricht. Datos en M€.
      </p>
    </div>
  )
}
