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
import { getDeudaHistorica, getDeudaAnual, getDeudaYears, type DeudaRow, type DeudaSubsectorRow } from '../../db/queries/deuda'

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

export default function AappDeuda() {
  const { selectedYear, setPageFilters } = useFilters()
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [historica, setHistorica] = useState<DeudaRow[]>([])
  const [historicaSubsectores, setHistoricaSubsectores] = useState<Record<string, DeudaRow[]>>({})
  const [deudaAnual, setDeudaAnual] = useState<DeudaSubsectorRow[]>([])
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
    Promise.all([
      getDeudaHistorica('S13'),
      ...SUBSECTORES_DETALLE.map((s) => getDeudaHistorica(s)),
      getPibAnual(),
    ]).then(([hist, ...rest]) => {
      const subsectorData = rest.slice(0, SUBSECTORES_DETALLE.length) as DeudaRow[][]
      const pibData = rest[SUBSECTORES_DETALLE.length] as PibAnual[]
      setHistorica(hist as DeudaRow[])
      const bySubsector: Record<string, DeudaRow[]> = {}
      SUBSECTORES_DETALLE.forEach((s, i) => { bySubsector[s] = subsectorData[i] })
      setHistoricaSubsectores(bySubsector)
      setPib(pibData)
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

  const deudaAnualRow = deudaAnual.find((r) => r.subsector === 'S1311')
  const deudaEstado = deudaAnualRow?.importe ?? null

  const years = historica.map((r) => String(r.year))

  const insights: Insight[] = loading || !currTotal ? [] : [
    ...(deudaPib != null ? [{
      label: 'Deuda AAPP / PIB',
      value: `${deudaPib.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`,
      trend: deudaPib > 100 ? 'down' as const : deudaPib > 60 ? 'neutral' as const : 'up' as const,
      description: `La deuda bruta de las Administraciones Públicas equivale al ${deudaPib.toFixed(1)}% del PIB en ${effectiveYear}, según el criterio Maastricht (Procedimiento de Déficit Excesivo, PDE). El límite del Pacto de Estabilidad y Crecimiento es el 60% del PIB.`,
    }] : []),
    ...(deudaEstado != null && currTotal ? [{
      label: 'Peso deuda Estado',
      value: `${((deudaEstado / currTotal.importe) * 100).toFixed(1)}%`,
      trend: 'neutral' as const,
      description: `El Estado (Administración Central) concentra el ${((deudaEstado / currTotal.importe) * 100).toFixed(1)}% de la deuda total de las AAPP. El resto se distribuye entre CCAA, Corporaciones Locales y Seguridad Social.`,
    }] : []),
    ...(yoyDeuda != null ? [{
      label: 'Variación interanual',
      value: `${yoyDeuda >= 0 ? '+' : ''}${(yoyDeuda * 100).toFixed(1)}%`,
      trend: yoyDeuda <= 0 ? 'up' as const : 'down' as const,
      description: `La deuda de las AAPP ${yoyDeuda >= 0 ? 'creció' : 'redujo'} un ${Math.abs(yoyDeuda * 100).toFixed(1)}% respecto a ${(effectiveYear ?? 0) - 1}, equivalente a ${formatEur(Math.abs(currTotal.importe - (prevTotal?.importe ?? 0)))} de variación.`,
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
          oficial utilizado por la Unión Europea para supervisar la sostenibilidad fiscal de los
          Estados miembros. Se calcula como el <strong>stock bruto consolidado de pasivos
          financieros</strong> a valor nominal: incluye bonos del Estado, letras del Tesoro,
          préstamos y otros instrumentos de deuda, pero excluye los pasivos entre subsectores de
          las propias AAPP (consolidación interna).
        </p>
        <p>
          Los datos provienen de Eurostat (dataset <strong>gov_10dd_edpt1</strong>) y cubren
          desde 1995. El límite del <em>Pacto de Estabilidad y Crecimiento</em> es el{' '}
          <strong>60% del PIB</strong>. España ha estado por encima de ese umbral desde la crisis
          financiera de 2010.
        </p>
      </ContextBox>

      <InsightsPanel insights={insights} isLoading={loading} />

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

      {/* Histórico deuda total */}
      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
          Deuda AAPP · 1995–actual
        </h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">
          Millones de euros. Criterio Maastricht (PDE). Deuda bruta consolidada.
        </p>
        {loading ? (
          <ChartSkeleton height={280} />
        ) : years.length > 0 ? (
          <LineChart
            categories={years}
            series={[{ name: 'Deuda AAPP', data: historica.map((r) => r.importe), color: '#B82A2A' }]}
            height={280}
            smooth
          />
        ) : (
          <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos.</p>
        )}
      </div>

      {/* Deuda por subsector */}
      <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
          Deuda por subsector · 1995–actual
        </h2>
        <p className="text-xs text-[var(--color-ink-muted)] mb-3">
          Millones de euros. Deuda de cada subsector (no consolida entre ellos). Estado, CCAA, CCLL y Seg. Social.
        </p>
        {loading ? (
          <ChartSkeleton height={280} />
        ) : years.length > 0 ? (
          <LineChart
            categories={years}
            series={SUBSECTORES_DETALLE.map((s) => ({
              name: SUBSECTOR_LABELS[s],
              data: historicaSubsectores[s]?.map((r) => r.importe) ?? [],
              color: SUBSECTOR_COLORS[s],
            }))}
            height={280}
            smooth
          />
        ) : (
          <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos.</p>
        )}
      </div>

      {/* Tabla resumen año seleccionado */}
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
              {deudaAnual.map((row) => {
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
        Fuente: Eurostat — gov_10dd_edpt1 (Government deficit and debt). Deuda bruta consolidada (criterio Maastricht). Datos en M€.
      </p>
    </div>
  )
}
