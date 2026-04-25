import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import { useFilters } from '../../store/filters'

const SECTIONS = [
  {
    label: 'Administraciones Públicas',
    abbr: 'AAPP',
    desc: 'Cuentas consolidadas de todas las administraciones según metodología SEC2010 (Eurostat). Ingresos, gastos, saldo y deuda del sector público en su conjunto.',
    color: '#B82A2A',
    links: [
      { to: '/aapp', text: 'Resumen' },
      { to: '/aapp/ingresos', text: 'Ingresos' },
      { to: '/aapp/gastos', text: 'Gastos' },
      { to: '/aapp/deuda', text: 'Deuda' },
    ],
  },
  {
    label: 'Estado',
    abbr: 'Estado',
    desc: 'Presupuesto del Estado: plan aprobado y ejecución real. Detalle de recaudación tributaria (AEAT), gasto por función e instrumento de deuda del Tesoro.',
    color: '#2E6B9E',
    links: [
      { to: '/estado', text: 'Resumen' },
      { to: '/estado/ingresos', text: 'Ingresos' },
      { to: '/estado/gastos', text: 'Gastos' },
      { to: '/estado/deuda', text: 'Deuda' },
    ],
  },
  {
    label: 'Seguridad Social',
    abbr: 'SS',
    desc: 'Cotizaciones, prestaciones y pensiones del sistema de Seguridad Social. Evolución del gasto en pensiones contributivas y no contributivas.',
    color: '#1F7A3D',
    links: [
      { to: '/ss', text: 'Resumen' },
      { to: '/ss/ingresos', text: 'Ingresos' },
      { to: '/ss/gastos', text: 'Gastos' },
      { to: '/ss/gastos/pensiones', text: 'Pensiones' },
      { to: '/ss/deuda', text: 'Deuda' },
    ],
  },
  {
    label: 'Comunidades Autónomas',
    abbr: 'CCAA',
    desc: 'Presupuestos de las 17 comunidades autónomas. Comparativa regional de ingresos, gastos y transferencias del Estado.',
    color: '#C89B3C',
    links: [
      { to: '/ccaa', text: 'Resumen' },
      { to: '/ccaa/ingresos', text: 'Ingresos' },
      { to: '/ccaa/gastos', text: 'Gastos' },
      { to: '/ccaa/deuda', text: 'Deuda' },
    ],
  },
]

export default function Inicio() {
  const { setPageFilters } = useFilters()

  useEffect(() => {
    setPageFilters({ showViewMode: false, showComparativa: false })
    return () => setPageFilters({ showViewMode: false, showComparativa: false })
  }, [setPageFilters])

  return (
    <div className="space-y-10 max-w-3xl">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink)]">
          Cuentas Públicas de España
        </h1>
        <p className="text-sm text-[var(--color-ink-muted)] leading-relaxed">
          Explora los ingresos, gastos y deuda de las Administraciones Públicas españolas.
          Los datos provienen de fuentes oficiales (Eurostat, AEAT, IGAE, SEPG, Ministerio de Hacienda)
          y se actualizan automáticamente cada mes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <div
            key={s.abbr}
            className="border border-[var(--color-rule)] bg-white p-5 space-y-3"
          >
            <div className="flex items-baseline gap-2">
              <span
                className="text-[0.6rem] font-bold uppercase tracking-widest px-1.5 py-0.5"
                style={{ color: s.color, border: `1px solid ${s.color}`, opacity: 0.8 }}
              >
                {s.abbr}
              </span>
              <span className="text-sm font-semibold text-[var(--color-ink)]">{s.label}</span>
            </div>
            <p className="text-xs text-[var(--color-ink-muted)] leading-relaxed">{s.desc}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
              {s.links.map((l) => (
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

      <div className="border-t border-[var(--color-rule)] pt-6 space-y-1">
        <p className="text-xs font-semibold text-[var(--color-ink-muted)]">Fuentes de datos</p>
        <p className="text-[0.7rem] text-[var(--color-ink-faint)] leading-relaxed">
          Eurostat (gov_10a_main, gov_10dd_edpt1, gov_10dd_ggd) · AEAT Anuario Estadístico ·
          IGAE Ejecución Presupuestaria · SEPG Series Históricas · Ministerio de Hacienda (SGCIEF).
          Código abierto bajo licencia GPL-3.
        </p>
      </div>
    </div>
  )
}
