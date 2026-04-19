import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useFilters, type EntityType } from '../../store/filters'
import YearSelector from '../filters/YearSelector'

const NAV_ITEMS = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/ingresos', label: 'Ingresos' },
  { to: '/ingresos/impuestos', label: 'Impuestos AEAT', indent: true },
  { to: '/ingresos/impuestos/iva', label: 'IVA por tipo', indent: true },
  { to: '/gastos', label: 'Gastos' },
  { to: '/gastos/funcion', label: 'Gasto por función', indent: true },
  { to: '/gastos/pensiones', label: 'Pensiones', indent: true },
  { to: '/comparativa', label: 'Plan vs. Ejecución' },
  { to: '/transferencias', label: 'Transferencias CCAA' },
  { to: '/ccaa', label: 'CCAA' },
]

const ENTITY_OPTIONS: { value: EntityType; label: string }[] = [
  { value: 'Estado', label: 'Estado' },
  { value: 'SS', label: 'Seg. Social' },
]

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { entityType, setEntityType } = useFilters()

  return (
    <div className="flex min-h-screen bg-[var(--color-surface)]">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r border-[var(--color-rule)] bg-white transition-transform duration-200 md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex h-14 items-center border-b border-[var(--color-rule)] px-5">
          <span className="text-sm font-bold tracking-tight text-[var(--color-accent)]">
            Cuentas Públicas
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map(({ to, label, end, indent }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center rounded px-3 py-2 text-sm transition-colors ${
                  indent ? 'ml-3 text-xs' : ''
                } ${
                  isActive
                    ? 'bg-[var(--color-accent)]/10 font-semibold text-[var(--color-accent)]'
                    : 'text-[var(--color-ink-muted)] hover:bg-gray-50 hover:text-[var(--color-ink)]'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Filters */}
        <div className="border-t border-[var(--color-rule)] px-4 py-3 space-y-3">
          {/* Year selector */}
          <div>
            <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-widest text-[var(--color-ink-faint)]">
              Año
            </p>
            <YearSelector />
          </div>

          {/* Entity toggle */}
          <div>
            <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-widest text-[var(--color-ink-faint)]">
              Entidad
            </p>
            <div className="flex rounded border border-[var(--color-rule)] overflow-hidden text-xs font-medium">
              {ENTITY_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setEntityType(value)}
                  className={`flex-1 py-1.5 transition-colors ${
                    entityType === value
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'text-[var(--color-ink-muted)] hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Backdrop (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col md:pl-56">
        {/* Mobile top bar */}
        <header className="flex h-14 items-center border-b border-[var(--color-rule)] bg-white px-4 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded p-2 text-[var(--color-ink-muted)] hover:bg-gray-50"
            aria-label="Abrir menú"
          >
            ☰
          </button>
          <span className="ml-3 text-sm font-bold text-[var(--color-accent)]">
            Cuentas Públicas
          </span>
        </header>

        <main className="flex-1 px-4 py-8 md:px-10">
          <Outlet />
        </main>

        <footer className="border-t border-[var(--color-rule)] px-4 py-3 text-center text-[0.7rem] text-[var(--color-ink-faint)] md:px-8">
          Datos: AEAT · IGAE · SEPG · Mº Hacienda &nbsp;·&nbsp; Código abierto bajo licencia GPL-3.
        </footer>
      </div>
    </div>
  )
}
