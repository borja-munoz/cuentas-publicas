import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../../components/layout/PageHeader'
import ContextBox from '../../components/ui/ContextBox'
import KpiCard from '../../components/ui/KpiCard'
import InsightsPanel from '../../components/ui/InsightsPanel'
import BarChart from '../../components/charts/BarChart'
import LineChart from '../../components/charts/LineChart'
import TreemapChart from '../../components/charts/TreemapChart'
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
import {
  getGastosPoliticaAnio,
  getGastosPoliticaHistorico,
  getGastosPoliticaYears,
  type GastoPolitica,
} from '../../db/queries/gastos_politica'
import { formatEur, formatPct } from '../../utils/format'
import type { Insight } from '../../utils/insights'

type Vista = 'economica' | 'politica'

// Capítulos con datos operacionales (excluir 8=Activos fin., 9=Pasivos fin.)
const CAPS_OPERACIONALES = [1, 2, 3, 4, 6, 7]

const CAP_COLORS: Record<number, string> = {
  1: '#7a1a1a',
  2: '#B82A2A',
  3: '#C89B3C',
  4: '#5C6F7E',
  6: '#7E9E8B',
  7: '#8B6B7A',
}

// Grupos funcionales para el treemap jerárquico (nivel 1 → nivel 2)
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

// Colores planos por política (para tabla y líneas)
const POLITICA_COLORS: Record<string, string> = Object.fromEntries(
  GRUPOS.flatMap((g) => g.politicas.map((p) => [p, g.color])),
)

export default function Gastos() {
  const { selectedYear, entityType, viewMode, setPageFilters } = useFilters()
  const fuente = viewMode === 'ejecucion' ? 'ejecucion' : 'plan'

  useEffect(() => {
    setPageFilters({ showViewMode: true })
    return () => setPageFilters({ showViewMode: false })
  }, [setPageFilters])

  const [vista, setVista] = useState<Vista>('politica')

  // ── Clasificación económica (capítulos) ──────────────────────────────────
  const [caps, setCaps] = useState<GastosAnuales[]>([])
  const [historico, setHistorico] = useState<GastosAnuales[]>([])
  const [loadingCaps, setLoadingCaps] = useState(true)

  // ── Políticas de gasto ────────────────────────────────────────────────────
  const [politicaYears, setPoliticaYears] = useState<number[]>([])
  const [politicas, setPoliticas] = useState<GastoPolitica[]>([])
  const [politicasHist, setPoliticasHist] = useState<GastoPolitica[]>([])
  const [loadingPoliticas, setLoadingPoliticas] = useState(true)

  // El año de políticas es independiente: máximo disponible en gastos_politica
  const politicaYear = useMemo(
    () => (politicaYears.includes(selectedYear) ? selectedYear : (politicaYears[politicaYears.length - 1] ?? selectedYear)),
    [politicaYears, selectedYear],
  )

  useEffect(() => {
    setLoadingCaps(true)
    Promise.all([
      getGastosPorCapitulo(selectedYear, entityType, fuente),
      getGastosHistoricoPorCapitulo(entityType, fuente),
    ])
      .then(([c, h]) => { setCaps(c); setHistorico(h) })
      .catch(console.error)
      .finally(() => setLoadingCaps(false))
  }, [selectedYear, entityType, fuente])

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

  // ── Derivados capítulos ───────────────────────────────────────────────────
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

  // ── Derivados políticas ───────────────────────────────────────────────────
  const totalPoliticas = politicas.reduce((s, r) => s + r.importe, 0)

  const politicaHistYears = useMemo(
    () => [...new Set(politicasHist.map((r) => r.year))].sort(),
    [politicasHist],
  )

  // Top 10 políticas para el chart de líneas históricas
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

  // ── Insights ──────────────────────────────────────────────────────────────
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
        subtitle={`${entityType} · ${fuente === 'plan' ? 'Plan' : 'Ejecución'} ${selectedYear}`}
        actions={
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
        }
      />

      <ContextBox title="Clasificación del gasto público">
        {vista === 'politica' ? (
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
              El treemap muestra 6 grupos funcionales: haz <strong>clic en un grupo</strong> para
              ver el detalle de sus políticas; clic en el breadcrumb inferior para volver.
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
              las transferencias a CCAA y las subvenciones a empresas y familias. En el Estado,
              representa habitualmente el mayor bloque de gasto operacional.
            </p>
          </>
        )}
      </ContextBox>

      <InsightsPanel insights={insights} isLoading={loadingCaps} />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        <KpiCard
          title={`Gasto operacional (${fuente})`}
          value={loadingCaps ? '—' : formatEur(totalOp)}
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
          value={loadingCaps ? '—' : formatEur(total)}
          subtitle={`Caps. 1–9 · ${selectedYear}`}
        />
      </div>

      {/* ── VISTA: POLÍTICAS DE GASTO ───────────────────────────────────────── */}
      {vista === 'politica' && (
        <>
          {/* Treemap */}
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

          {/* Tabla ranking políticas */}
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

          {/* Evolución histórica top 10 políticas */}
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

      {/* ── VISTA: CLASIFICACIÓN ECONÓMICA (CAPÍTULOS) ──────────────────────── */}
      {vista === 'economica' && (
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
                Evolución del gasto por capítulo · {entityType}
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
