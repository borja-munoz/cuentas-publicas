import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ErrorBoundary from './components/ui/ErrorBoundary'
import AppShell from './components/layout/AppShell'
import { query } from './db/client'
import { useFilters } from './store/filters'

import Inicio from './pages/Inicio'
import Ingresos from './pages/Ingresos'
import Gastos from './pages/Gastos'
import Comparativa from './pages/Comparativa'
import Transferencias from './pages/Transferencias'
import CCAA from './pages/CCAA'

function DBInitializer() {
  const initYears = useFilters((s) => s.initYears)

  useEffect(() => {
    query<{ year: number }>('SELECT DISTINCT year FROM cp.gastos_plan ORDER BY year')
      .then((rows) => initYears(rows.map((r) => r.year)))
      .catch(console.error)
  }, [initYears])

  return null
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter basename="/cuentas-publicas">
        <DBInitializer />
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Inicio />} />
            <Route path="ingresos" element={<Ingresos />} />
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
