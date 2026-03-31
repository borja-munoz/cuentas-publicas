import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ErrorBoundary from './components/ui/ErrorBoundary'
import AppShell from './components/layout/AppShell'
import { query } from './db/client'
import { useFilters } from './store/filters'

import Inicio from './pages/Inicio'
import Ingresos from './pages/Ingresos'
import Impuestos from './pages/Ingresos/Impuestos'
import Gastos from './pages/Gastos'
import Comparativa from './pages/Comparativa'
import Transferencias from './pages/Transferencias'
import CCAA from './pages/CCAA'

function DBInitializer({ onReady }: { onReady: () => void }) {
  const initYears = useFilters((s) => s.initYears)

  useEffect(() => {
    query<{ year: number }>('SELECT DISTINCT year FROM cp.gastos_plan ORDER BY year')
      .then((rows) => {
        initYears(rows.map((r) => r.year))
        onReady()
      })
      .catch(console.error)
  }, [initYears, onReady])

  return null
}

function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[var(--color-surface)]">
      <div className="flex flex-col items-center gap-3">
        <span className="text-base font-bold tracking-tight text-[var(--color-accent)]">
          Cuentas Públicas
        </span>
        <p className="text-xs text-[var(--color-ink-muted)]">Cargando base de datos…</p>
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

export default function App() {
  const [ready, setReady] = useState(false)

  return (
    <ErrorBoundary>
      <BrowserRouter basename="/cuentas-publicas">
        <DBInitializer onReady={() => setReady(true)} />
        {!ready && <LoadingScreen />}
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Inicio />} />
            <Route path="ingresos" element={<Ingresos />} />
            <Route path="ingresos/impuestos" element={<Impuestos />} />
            <Route path="gastos" element={<Gastos />} />
            <Route path="comparativa" element={<Comparativa />} />
            <Route path="transferencias" element={<Transferencias />} />
            <Route path="ccaa" element={<CCAA />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
