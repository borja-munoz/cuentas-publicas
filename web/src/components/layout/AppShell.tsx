import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import TopBar from './TopBar'

type NavItem =
  | { kind: 'group'; label: string; to?: string }
  | { kind: 'link'; to: string; label: string; end?: boolean; level?: 1 | 2 }

const NAV: NavItem[] = [
  { kind: 'link', to: '/', label: 'Inicio', end: true },

  { kind: 'group', label: 'AAPP' },
  { kind: 'link', to: '/aapp/ingresos', label: 'Ingresos' },
  { kind: 'link', to: '/aapp/gastos', label: 'Gastos' },
  { kind: 'link', to: '/aapp/deuda', label: 'Deuda' },

  { kind: 'group', label: 'Estado', to: '/estado' },
  { kind: 'link', to: '/estado/ingresos', label: 'Ingresos' },
  { kind: 'link', to: '/estado/ingresos/impuestos', label: 'Impuestos AEAT', level: 1 },
  { kind: 'link', to: '/estado/ingresos/impuestos/iva', label: 'IVA por tipo', level: 2 },
  { kind: 'link', to: '/estado/gastos', label: 'Gastos' },
  { kind: 'link', to: '/estado/gastos/funcion', label: 'Gasto por función', level: 1 },
  { kind: 'link', to: '/estado/deuda', label: 'Deuda' },

  { kind: 'group', label: 'Seguridad Social', to: '/ss' },
  { kind: 'link', to: '/ss/ingresos', label: 'Ingresos' },
  { kind: 'link', to: '/ss/gastos', label: 'Gastos' },
  { kind: 'link', to: '/ss/gastos/pensiones', label: 'Pensiones', level: 1 },
  { kind: 'link', to: '/ss/deuda', label: 'Deuda' },

  { kind: 'group', label: 'CCAA', to: '/ccaa' },
  { kind: 'link', to: '/ccaa/ingresos', label: 'Ingresos' },
  { kind: 'link', to: '/ccaa/gastos', label: 'Gastos' },
  { kind: 'link', to: '/ccaa/deuda', label: 'Deuda' },
]

const GROUP_LABEL_CLASS =
  'mt-3 mb-1 px-3 text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-faint)]'

const GROUP_LINK_BASE =
  'mt-3 mb-1 flex items-center px-3 text-xs font-semibold uppercase tracking-widest transition-colors'

const GROUP_LINK_ACTIVE = 'text-[var(--color-accent)]'
const GROUP_LINK_INACTIVE = 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
          {NAV.map((item, i) => {
            if (item.kind === 'group') {
              if (item.to) {
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `${GROUP_LINK_BASE} ${isActive ? GROUP_LINK_ACTIVE : GROUP_LINK_INACTIVE}`
                    }
                  >
                    {item.label}
                  </NavLink>
                )
              }
              return (
                <p key={i} className={GROUP_LABEL_CLASS}>
                  {item.label}
                </p>
              )
            }

            const levelClass =
              item.level === 2 ? 'ml-8 text-xs' : item.level === 1 ? 'ml-4 text-xs' : ''

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center rounded px-3 py-2 text-sm transition-colors ${levelClass} ${
                    isActive
                      ? 'bg-[var(--color-accent)]/10 font-semibold text-[var(--color-accent)]'
                      : 'text-[var(--color-ink-muted)] hover:bg-gray-50 hover:text-[var(--color-ink)]'
                  }`
                }
              >
                {item.label}
              </NavLink>
            )
          })}
        </nav>
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
        {/* Mobile header */}
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

        {/* Sticky top bar with filters */}
        <TopBar />

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
