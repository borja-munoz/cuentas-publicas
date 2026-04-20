import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ErrorBoundary from './components/ui/ErrorBoundary'
import AppShell from './components/layout/AppShell'
import { query } from './db/client'
import { useFilters } from './store/filters'

import Inicio from './pages/Inicio'
import Ingresos from './pages/Ingresos'
import Impuestos from './pages/Ingresos/Impuestos'
import IvaTipos from './pages/Ingresos/IvaTipos'
import Gastos from './pages/Gastos'
import GastosFuncion from './pages/Gastos/Funcion'
import Pensiones from './pages/Gastos/Pensiones'
import Transferencias from './pages/Transferencias'
import CCAA from './pages/CCAA'
import CcaaDetalle from './pages/CCAA/Detalle'

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

            {/* Estado */}
            <Route path="estado/ingresos" element={<Ingresos entity="Estado" />} />
            <Route path="estado/ingresos/impuestos" element={<Impuestos />} />
            <Route path="estado/ingresos/impuestos/iva" element={<IvaTipos />} />
            <Route path="estado/gastos" element={<Gastos entity="Estado" />} />
            <Route path="estado/gastos/funcion" element={<GastosFuncion />} />

            {/* Seguridad Social */}
            <Route path="ss/ingresos" element={<Ingresos entity="SS" />} />
            <Route path="ss/gastos" element={<Gastos entity="SS" />} />
            <Route path="ss/gastos/pensiones" element={<Pensiones />} />

            {/* CCAA */}
            <Route path="ccaa" element={<CCAA />} />
            <Route path="ccaa/transferencias" element={<Transferencias />} />
            <Route path="ccaa/:cod" element={<CcaaDetalle />} />

            {/* Redirects desde rutas antiguas */}
            <Route path="ingresos" element={<Navigate to="/estado/ingresos" replace />} />
            <Route path="ingresos/impuestos" element={<Navigate to="/estado/ingresos/impuestos" replace />} />
            <Route path="ingresos/impuestos/iva" element={<Navigate to="/estado/ingresos/impuestos/iva" replace />} />
            <Route path="gastos" element={<Navigate to="/estado/gastos" replace />} />
            <Route path="gastos/funcion" element={<Navigate to="/estado/gastos/funcion" replace />} />
            <Route path="gastos/pensiones" element={<Navigate to="/ss/gastos/pensiones" replace />} />
            <Route path="comparativa" element={<Navigate to="/estado/gastos" replace />} />
            <Route path="transferencias" element={<Navigate to="/ccaa/transferencias" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
