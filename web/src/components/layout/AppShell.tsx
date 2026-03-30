import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useFilters, type EntityType } from '../../store/filters'

const NAV_ITEMS = [
  { to: '/', label: 'Inicio', icon: '🏠', end: true },
  { to: '/ingresos', label: 'Ingresos', icon: '📈' },
  { to: '/gastos', label: 'Gastos', icon: '📉' },
  { to: '/comparativa', label: 'Comparativa', icon: '⚖️' },
  { to: '/transferencias', label: 'Transferencias', icon: '🗺️' },
  { to: '/ccaa', label: 'CCAA', icon: '🏛️' },
]

const ENTITY_OPTIONS: { value: EntityType; label: string }[] = [
  { value: 'Estado', label: 'Estado' },
  { value: 'SS', label: 'Seg. Social' },
]

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { entityType, setEntityType } = useFilters()

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r border-gray-200 bg-white transition-transform duration-200 md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center border-b border-gray-200 px-5">
          <span className="text-base font-bold text-blue-700">Cuentas Públicas</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <span className="text-base">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-gray-200 px-4 py-3">
          <p className="mb-1.5 text-xs font-medium text-gray-400 uppercase tracking-wide">Entidad</p>
          <div className="flex rounded-lg border border-gray-300 bg-gray-50 overflow-hidden text-xs font-medium">
            {ENTITY_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setEntityType(value)}
                className={`flex-1 py-1.5 transition-colors ${
                  entityType === value ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
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
        <header className="flex h-14 items-center border-b border-gray-200 bg-white px-4 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Abrir menú"
          >
            ☰
          </button>
          <span className="ml-3 text-base font-bold text-blue-700">Cuentas Públicas</span>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>

        <footer className="border-t border-gray-200 px-4 py-3 text-center text-xs text-gray-400 md:px-8">
          Datos: AEAT · IGAE · SEPG · Mº Hacienda. Código abierto bajo licencia GPL-3.
        </footer>
      </div>
    </div>
  )
}
