import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../../../components/layout/PageHeader'
import ContextBox from '../../../components/ui/ContextBox'
import KpiCard from '../../../components/ui/KpiCard'
import InsightsPanel from '../../../components/ui/InsightsPanel'
import BarChart from '../../../components/charts/BarChart'
import LineChart from '../../../components/charts/LineChart'
import TreemapChart from '../../../components/charts/TreemapChart'
import { ChartSkeleton } from '../../../components/ui/LoadingSkeleton'
import { useFilters } from '../../../store/filters'
import InfoTooltip from '../../../components/ui/InfoTooltip'
import {
  getGastosPorCapitulo,
  getGastosHistoricoPorCapitulo,
  getComparativaPorCapitulo,
  CAPITULO_GASTOS,
  CAPITULO_GASTOS_TOOLTIP,
  type GastosAnuales,
} from '../../../db/queries/gastos'
import {
  getGastosPoliticaAnio,
  getGastosPoliticaHistorico,
  getGastosPoliticaYears,
  type GastoPolitica,
} from '../../../db/queries/gastos_politica'
import { formatEur, formatPct } from '../../../utils/format'
import type { Insight } from '../../../utils/insights'

const entity = 'Estado'

type Vista = 'economica' | 'politica'

const CAPS_OPERACIONALES = [1, 2, 3, 4, 6, 7]

const CAP_COLORS: Record<number, string> = {
  1: '#7a1a1a',
  2: '#B82A2A',
  3: '#C89B3C',
  4: '#5C6F7E',
  6: '#7E9E8B',
  7: '#8B6B7A',
}

const GRUPOS: { nombre: string; color: string; politicas: string[] }[] = [
  {
    nombre: 'Protección Social',
    color: '#B82A2A',
    politicas: [
      'Pensiones',
      'Desempleo',
      'Otras Prestaciones Económicas',
      'Servicios Sociales y Promoción Social',
      'Fomento del empleo',
      'Gestión y administración de la inclusión, de la S.S. y de la migración',
      'Gestión y administración de trabajo y economía social',
    ],
  },
  {
    nombre: 'Sanidad y Educación',
    color: '#C89B3C',
    politicas: [
      'Sanidad',
      'Educación',
      'Cultura',
      'Acceso a la Vivienda y Fomento de la Edificación',
    ],
  },
  {
    nombre: 'Defensa y Seguridad',
    color: '#5C6F7E',
    politicas: [
      'Defensa',
      'Seguridad ciudadana e Instituciones penitenciarias',
      'Justicia',
      'Investigación militar',
    ],
  },
  {
    nombre: 'Economía e Industria',
    color: '#7E9E8B',
    politicas: [
      'Agricultura, Pesca y Alimentación',
      'Industria y Energía',
      'Comercio, Turismo y PYMES',
      'Subvenciones al transporte',
      'Infraestructuras y ecosistemas resilientes',
      'Investigación civil',
      'Otras actuaciones de carácter económico',
      'Política Exterior y de cooperación para el desarrollo',
    ],
  },
  {
    nombre: 'Administración y Financiero',
    color: '#8B6B7A',
    politicas: [
      'Servicios de carácter general',
      'Administración Financiera y Tributaria',
      'Transferencias a otras Administraciones Públicas',
      'Órganos Constitucionales, Gobierno y otros',
    ],
  },
  {
    nombre: 'Deuda Pública',
    color: '#374151',
    politicas: ['Deuda Pública'],
  },
]

const POLITICA_COLORS: Record<string, string> = Object.fromEntries(
  GRUPOS.flatMap((g) => g.politicas.map((p) => [p, g.color])),
)

const EJECUCION_MIN = 2015
const EJECUCION_MAX = 2024

interface ComparativaRow {
  capitulo: number
  plan: number
  ejecucion: number
  desviacion: number
}

export default function EstadoGastos() {
  const { selectedYear, viewMode, setPageFilters } = useFilters()
  const isComparativa = viewMode === 'comparativa'
  const fuente = viewMode === 'ejecucion' ? 'ejecucion' : 'plan'
  const hasEjecucion = selectedYear >= EJECUCION_MIN && selectedYear <= EJECUCION_MAX

  useEffect(() => {
    setPageFilters({ showViewMode: true, showComparativa: true })
    return () => setPageFilters({ showViewMode: false, showComparativa: false })
  }, [setPageFilters])

  const [vista, setVista] = useState<Vista>('politica')

  const [compRows, setCompRows] = useState<ComparativaRow[]>([])
  const [loadingComp, setLoadingComp] = useState(false)

  const [caps, setCaps] = useState<GastosAnuales[]>([])
  const [historico, setHistorico] = useState<GastosAnuales[]>([])
  const [loadingCaps, setLoadingCaps] = useState(true)

  const [politicaYears, setPoliticaYears] = useState<number[]>([])
  const [politicas, setPoliticas] = useState<GastoPolitica[]>([])
  const [politicasHist, setPoliticasHist] = useState<GastoPolitica[]>([])
  const [loadingPoliticas, setLoadingPoliticas] = useState(true)

  const politicaYear = useMemo(
    () => (politicaYears.includes(selectedYear) ? selectedYear : (politicaYears[politicaYears.length - 1] ?? selectedYear)),
    [politicaYears, selectedYear],
  )

  useEffect(() => {
    if (isComparativa) return
    setLoadingCaps(true)
    Promise.all([
      getGastosPorCapitulo(selectedYear, entity, fuente),
      getGastosHistoricoPorCapitulo(entity, fuente),
    ])
      .then(([c, h]) => { setCaps(c); setHistorico(h) })
      .catch(console.error)
      .finally(() => setLoadingCaps(false))
  }, [selectedYear, fuente, isComparativa])

  useEffect(() => {
    if (!isComparativa || !hasEjecucion) return
    setLoadingComp(true)
    getComparativaPorCapitulo(selectedYear, entity)
      .then(setCompRows)
      .catch(console.error)
      .finally(() => setLoadingComp(false))
  }, [selectedYear, isComparativa, hasEjecucion])

  useEffect(() => {
    getGastosPoliticaYears()
      .then(setPoliticaYears)
      .catch(console.error)
  }, [])

  useEffect(() => {
    setLoadingPoliticas(true)
    Promise.all([
      getGastosPoliticaAnio(politicaYear),
      getGastosPoliticaHistorico(),
    ])
      .then(([p, ph]) => { setPoliticas(p); setPoliticasHist(ph) })
      .catch(console.error)
      .finally(() => setLoadingPoliticas(false))
  }, [politicaYear])

  const capsOp = caps.filter((c) => CAPS_OPERACIONALES.includes(c.capitulo))
  const total = caps.reduce((s, r) => s + (r.importe ?? 0), 0)
  const totalOp = capsOp.reduce((s, r) => s + (r.importe ?? 0), 0)
  const maxCap = capsOp.length > 0 ? capsOp.reduce((a, b) => (b.importe > a.importe ? b : a)) : null

  const allYears = [...new Set(historico.map((r) => r.year))].sort()
  const histCategories = allYears.map(String)
  const histSeries = CAPS_OPERACIONALES.map((cap) => {
    const byYear = new Map(historico.filter((r) => r.capitulo === cap).map((r) => [r.year, r.importe]))
    return {
      name: CAPITULO_GASTOS[cap] ?? `Cap. ${cap}`,
      data: allYears.map((y) => byYear.get(y) ?? null) as number[],
      color: CAP_COLORS[cap],
    }
  }).filter((s) => s.data.some((v) => v != null && v > 0))

  const barCats = capsOp.map((c) => CAPITULO_GASTOS[c.capitulo] ?? `Cap. ${c.capitulo}`)
  const barData = capsOp.map((c) => c.importe)

  const cap4 = capsOp.find((c) => c.capitulo === 4)
  const cap1 = capsOp.find((c) => c.capitulo === 1)

  const prevYearData = historico.filter((h) => h.year === selectedYear - 1 && CAPS_OPERACIONALES.includes(h.capitulo))
  const totalPrev = prevYearData.reduce((s, r) => s + (r.importe ?? 0), 0)
  const yoyRatio = totalPrev > 0 ? (totalOp - totalPrev) / totalPrev : null

  const totalPoliticas = politicas.reduce((s, r) => s + r.importe, 0)

  const politicaHistYears = useMemo(
    () => [...new Set(politicasHist.map((r) => r.year))].sort(),
    [politicasHist],
  )

  const topPoliticas = useMemo(
    () => [...politicas].sort((a, b) => b.importe - a.importe).slice(0, 10).map((p) => p.politica_nom),
    [politicas],
  )

  const politicaLineSeries = useMemo(
    () =>
      topPoliticas.map((nom) => ({
        name: nom,
        data: politicaHistYears.map(
          (y) => politicasHist.find((r) => r.year === y && r.politica_nom === nom)?.importe ?? null,
        ),
        color: POLITICA_COLORS[nom],
      })),
    [topPoliticas, politicasHist, politicaHistYears],
  )

  const treemapData = useMemo(() => {
    const byNombre = new Map(politicas.map((p) => [p.politica_nom, p.importe]))
    return GRUPOS.map((g) => {
      const children = g.politicas
        .filter((nom) => byNombre.has(nom))
        .map((nom) => {
          const imp = byNombre.get(nom) ?? 0
          return {
            name: nom,
            value: imp,
            color: g.color,
            percent: totalPoliticas > 0 ? +((imp / totalPoliticas) * 100).toFixed(1) : undefined,
          }
        })
      const grupoTotal = children.reduce((s, c) => s + c.value, 0)
      return {
        name: g.nombre,
        value: grupoTotal,
        color: g.color,
        percent: totalPoliticas > 0 ? +((grupoTotal / totalPoliticas) * 100).toFixed(1) : undefined,
        children,
      }
    }).filter((g) => g.value > 0)
  }, [politicas, totalPoliticas])

  const CAPS_OP_COMP = [1, 2, 3, 4, 6, 7]
  const compOp = compRows.filter((r) => CAPS_OP_COMP.includes(r.capitulo))
  const totalPlanComp = compOp.reduce((s, r) => s + (r.plan ?? 0), 0)
  const totalEjecComp = compOp.reduce((s, r) => s + (r.ejecucion ?? 0), 0)
  const totalDesvComp = totalEjecComp - totalPlanComp
  const pctEjecucion = totalPlanComp > 0 ? totalEjecComp / totalPlanComp : null

  const minEjecCap = compOp.length > 0
    ? compOp
        .filter((r) => r.plan > 0 && r.ejecucion > 0)
        .reduce<(typeof compOp)[0] | null>(
          (acc, r) => (!acc || r.ejecucion / r.plan < acc.ejecucion / acc.plan ? r : acc),
          null,
        )
    : null

  const compInsights: Insight[] = loadingComp || compOp.length === 0 ? [] : [
    {
      label: 'Tasa de ejecución global',
      value: pctEjecucion != null
        ? `${(pctEjecucion * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
        : '—',
      trend: pctEjecucion != null
        ? pctEjecucion >= 0.95 ? 'up' : pctEjecucion >= 0.85 ? 'neutral' : 'down'
        : 'neutral',
      description: `Por cada 100 € presupuestados en gastos operacionales, se ejecutaron ${pctEjecucion != null ? (pctEjecucion * 100).toFixed(1) : '—'} €.`,
    },
    {
      label: 'Crédito no ejecutado',
      value: formatEur(Math.max(0, totalPlanComp - totalEjecComp)),
      trend: totalPlanComp - totalEjecComp > 5000 ? 'down' : 'neutral',
      description: `El crédito aprobado pero no ejecutado en ${selectedYear} asciende a ${formatEur(Math.max(0, totalPlanComp - totalEjecComp))}.`,
    },
    ...(minEjecCap ? [{
      label: 'Menor ejecución por capítulo',
      value: CAPITULO_GASTOS[minEjecCap.capitulo] ?? `Cap. ${minEjecCap.capitulo}`,
      trendValue: minEjecCap.plan > 0
        ? `${((minEjecCap.ejecucion / minEjecCap.plan) * 100).toFixed(1)}% ejecutado`
        : undefined,
      trend: 'down' as const,
      description: `El capítulo ${minEjecCap.capitulo} presenta la menor tasa de ejecución en ${selectedYear}.`,
    }] : []),
  ]

  const insights: Insight[] = loadingCaps || capsOp.length === 0 ? [] : [
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
        subtitle={isComparativa
          ? `Estado · Plan vs Ejecución ${selectedYear}`
          : `Estado · ${fuente === 'plan' ? 'Plan' : 'Ejecución'} ${selectedYear}`}
        actions={!isComparativa ? (
          <div className="flex rounded border border-[var(--color-rule)] overflow-hidden text-xs font-medium">
            <button
              onClick={() => setVista('politica')}
              className={`px-3 py-1.5 transition-colors ${vista === 'politica' ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-ink-muted)] hover:bg-gray-50'}`}
            >
              Por política
            </button>
            <button
              onClick={() => setVista('economica')}
              className={`px-3 py-1.5 transition-colors ${vista === 'economica' ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-ink-muted)] hover:bg-gray-50'}`}
            >
              Por capítulo
            </button>
          </div>
        ) : undefined}
      />

      <ContextBox title="Clasificación del gasto del Estado">
        {vista === 'politica' && !isComparativa ? (
          <>
            <p>
              La clasificación por <strong>políticas de gasto</strong> agrupa el presupuesto
              consolidado según su finalidad: Pensiones, Defensa, Sanidad, Educación,
              Infraestructuras, Deuda Pública, etc. Responde a la pregunta{' '}
              <em>¿para qué gasta el Estado?</em> con mayor detalle que la clasificación COFOG,
              pero sin la granularidad de los programas presupuestarios individuales.
            </p>
            <p>
              Los datos proceden del <strong>fichero consolidado del PGE</strong> publicado
              por la SEPG (Secretaría General de Presupuestos y Gastos), hoja de{' '}
              &ldquo;Políticas de gasto&rdquo;. Incluye Estado, Seguridad Social, Organismos
              Autónomos y resto de entidades del sector público administrativo. Años 2016–presente.
            </p>
          </>
        ) : (
          <>
            <p>
              Los gastos públicos se clasifican según su <strong>naturaleza económica</strong>:{' '}
              personal (nóminas y cotizaciones), bienes y servicios, gastos financieros (intereses de
              la deuda), transferencias corrientes (pensiones, subvenciones) e inversiones reales
              (infraestructuras).
            </p>
            <p>
              El capítulo 4 (Transferencias corrientes) incluye las pensiones de la Seguridad Social,
              las transferencias a CCAA y las subvenciones a empresas y familias.
            </p>
          </>
        )}
      </ContextBox>

      {isComparativa && (
        <>
          {!hasEjecucion ? (
            <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Los datos de ejecución presupuestaria están disponibles desde 2015. Selecciona un año entre 2015 y 2024.
            </div>
          ) : (
            <>
              <InsightsPanel insights={compInsights} isLoading={loadingComp} />
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                <KpiCard title="Gastos plan" value={loadingComp ? '—' : formatEur(totalPlanComp)} subtitle={`${selectedYear} · caps. 1–7`} accent />
                <KpiCard title="Gastos ejecutados" value={loadingComp ? '—' : formatEur(totalEjecComp)} subtitle={`${selectedYear}`} />
                <KpiCard
                  title="Desviación"
                  value={loadingComp ? '—' : formatEur(totalDesvComp)}
                  trendValue={pctEjecucion != null ? `${(pctEjecucion * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}% de ejecución` : undefined}
                  trend={totalDesvComp === 0 ? 'neutral' : totalDesvComp > 0 ? 'down' : 'up'}
                />
                <KpiCard title="Crédito no ejecutado" value={loadingComp ? '—' : formatEur(Math.max(0, totalPlanComp - totalEjecComp))} subtitle="Presupuesto no utilizado" />
              </div>
              <section>
                <div className="chart-card-rule bg-white border border-[var(--color-rule)] px-5 pt-4 pb-2">
                  <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">Plan vs. ejecución por capítulo · {selectedYear}</h2>
                  <p className="text-xs text-[var(--color-ink-muted)] mb-4">Millones de €. Capítulos operacionales (1–7).</p>
                  {loadingComp ? (
                    <ChartSkeleton height={300} />
                  ) : (
                    <BarChart
                      categories={compOp.map((r) => CAPITULO_GASTOS[r.capitulo] ?? `Cap. ${r.capitulo}`)}
                      series={[
                        { name: 'Plan', data: compOp.map((r) => r.plan), color: '#B82A2A' },
                        { name: 'Ejecución', data: compOp.map((r) => r.ejecucion), color: '#C89B3C' },
                      ]}
                      height={300}
                    />
                  )}
                </div>
                <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">Fuente: SEPG (plan) · IGAE (ejecución).</p>
              </section>
              <section>
                <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-3">Desglose por capítulo · {selectedYear}</h2>
                <div className="overflow-x-auto border border-[var(--color-rule)] bg-white">
                  <table className="data-table w-full">
                    <thead>
                      <tr>
                        <th>Cap.</th><th>Descripción</th><th>Plan (M€)</th>
                        <th>Ejecución (M€)</th><th>Desviación (M€)</th><th>% Ejecución</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingComp ? (
                        <tr><td colSpan={6} className="text-center text-[var(--color-ink-muted)] py-8">Cargando…</td></tr>
                      ) : compOp.map((r) => {
                        const pct = r.plan > 0 ? r.ejecucion / r.plan : null
                        const desvNeg = r.desviacion < 0
                        return (
                          <tr key={r.capitulo}>
                            <td className="font-mono">{r.capitulo}</td>
                            <td>
                              {CAPITULO_GASTOS[r.capitulo] ?? '—'}
                              {CAPITULO_GASTOS_TOOLTIP[r.capitulo] && <InfoTooltip content={CAPITULO_GASTOS_TOOLTIP[r.capitulo]} />}
                            </td>
                            <td>{formatEur(r.plan)}</td>
                            <td>{r.ejecucion > 0 ? formatEur(r.ejecucion) : '—'}</td>
                            <td className={r.ejecucion > 0 ? (desvNeg ? 'text-emerald-700' : 'text-red-700') : ''}>{r.ejecucion > 0 ? formatEur(r.desviacion) : '—'}</td>
                            <td>{pct != null && r.ejecucion > 0 ? `${(pct * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%` : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    {!loadingComp && compOp.length > 0 && (
                      <tfoot>
                        <tr className="total-row">
                          <td colSpan={2}>Total operacional</td>
                          <td>{formatEur(totalPlanComp)}</td>
                          <td>{formatEur(totalEjecComp)}</td>
                          <td className={totalDesvComp < 0 ? 'text-emerald-700' : 'text-red-700'}>{formatEur(totalDesvComp)}</td>
                          <td>{pctEjecucion != null ? `${(pctEjecucion * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%` : '—'}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">Fuente: SEPG (plan) · IGAE (obligaciones reconocidas netas).</p>
              </section>
            </>
          )}
        </>
      )}

      {!isComparativa && (
        <>
          <InsightsPanel insights={insights} isLoading={loadingCaps} />
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            <KpiCard
              title={`Gasto operacional (${fuente})`}
              value={loadingCaps ? '—' : formatEur(totalOp)}
              trendValue={formatPct(yoyRatio) ? `${formatPct(yoyRatio)} vs año anterior` : undefined}
              trend={formatPct(yoyRatio) ? (yoyRatio! <= 0 ? 'up' : 'down') : undefined}
              subtitle={`${selectedYear} · caps. 1–7`}
              accent
            />
            <KpiCard title="Mayor capítulo" value={maxCap ? formatEur(maxCap.importe) : '—'} subtitle={maxCap ? CAPITULO_GASTOS[maxCap.capitulo] : undefined} />
            <KpiCard title="Gasto total (incl. fin.)" value={loadingCaps ? '—' : formatEur(total)} subtitle={`Caps. 1–9 · ${selectedYear}`} />
          </div>
        </>
      )}

      {!isComparativa && vista === 'politica' && (
        <>
          <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
            <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
              Distribución del gasto por política · {politicaYear}
            </h2>
            <p className="text-xs text-[var(--color-ink-muted)] mb-3">
              Millones de euros. PGE consolidado (Estado + SS + OO.AA.). Clic en un grupo para ver el desglose por política; clic en el breadcrumb inferior para volver.
            </p>
            {loadingPoliticas ? (
              <ChartSkeleton height={420} />
            ) : treemapData.length > 0 ? (
              <TreemapChart data={treemapData} height={420} />
            ) : (
              <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos para {politicaYear}.</p>
            )}
          </div>

          {!loadingPoliticas && politicas.length > 0 && (
            <div className="overflow-x-auto border border-[var(--color-rule)] bg-white">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Política de gasto</th>
                    <th>Importe (M€)</th>
                    <th>% del total</th>
                  </tr>
                </thead>
                <tbody>
                  {politicas.map((p, i) => (
                    <tr key={p.politica_nom}>
                      <td className="font-mono text-[var(--color-ink-muted)]">{i + 1}</td>
                      <td className="font-medium">
                        <span
                          className="mr-2 inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: POLITICA_COLORS[p.politica_nom] ?? '#999' }}
                        />
                        {p.politica_nom}
                      </td>
                      <td>{formatEur(p.importe)}</td>
                      <td>
                        {totalPoliticas > 0
                          ? `${((p.importe / totalPoliticas) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="total-row">
                    <td colSpan={2}>Total</td>
                    <td>{formatEur(totalPoliticas)}</td>
                    <td>100,0%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="border border-[var(--color-rule)] bg-white px-4 pt-4 pb-3">
            <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
              Evolución histórica · Top 10 políticas de gasto
            </h2>
            <p className="text-xs text-[var(--color-ink-muted)] mb-3">
              Millones de euros. PGE consolidado, 2016–presente.
            </p>
            {loadingPoliticas ? (
              <ChartSkeleton height={320} />
            ) : politicaHistYears.length > 0 ? (
              <LineChart
                categories={politicaHistYears.map(String)}
                series={politicaLineSeries}
                height={320}
                smooth
              />
            ) : (
              <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">Sin datos históricos.</p>
            )}
          </div>

          <p className="text-[0.7rem] text-[var(--color-ink-faint)]">
            Fuente: SEPG — Presupuestos Generales del Estado Consolidados, hoja &ldquo;Políticas de gasto&rdquo; (caps. 1–8). M€.
          </p>
        </>
      )}

      {!isComparativa && vista === 'economica' && (
        <>
          <section>
            <div className="chart-card-rule bg-white border border-[var(--color-rule)] px-5 pt-4 pb-2">
              <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
                Gastos por capítulo económico · {selectedYear}
              </h2>
              <p className="text-xs text-[var(--color-ink-muted)] mb-4">
                Capítulos operacionales (1–7) en millones de €.
              </p>
              {loadingCaps ? (
                <ChartSkeleton height={280} />
              ) : (
                <BarChart
                  categories={barCats}
                  series={[{ name: 'Gasto', data: barData, color: '#B82A2A' }]}
                  horizontal
                  height={280}
                />
              )}
            </div>
            <p className="mt-2 text-[0.7rem] text-[var(--color-ink-faint)]">
              Fuente: SEPG (plan) / IGAE (ejecución).
            </p>
          </section>

          <section>
            <div className="chart-card-rule bg-white border border-[var(--color-rule)] px-5 pt-4 pb-2">
              <h2 className="text-sm font-semibold text-[var(--color-ink)] mb-1">
                Evolución del gasto por capítulo · Estado
              </h2>
              <p className="text-xs text-[var(--color-ink-muted)] mb-4">
                Serie histórica en millones de €. Capítulos operacionales.
              </p>
              {loadingCaps ? (
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
                  {loadingCaps ? (
                    <tr>
                      <td colSpan={4} className="text-center text-[var(--color-ink-muted)] py-8">Cargando…</td>
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
                            ? `${((c.importe / totalOp) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
                            : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {!loadingCaps && caps.length > 0 && (
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
        </>
      )}
    </div>
  )
}
