import PageHeader from '../../components/layout/PageHeader'
import ContextBox from '../../components/ui/ContextBox'

export default function Inicio() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Presupuestos de España"
        subtitle="Resumen de ingresos y gastos del sector público"
      />
      <ContextBox title="¿Qué son los Presupuestos Generales del Estado?">
        <p>
          Los <strong>Presupuestos Generales del Estado (PGE)</strong> son el plan económico anual
          del Gobierno de España: recogen todos los ingresos previstos (impuestos, deuda, etc.) y
          todos los gastos autorizados (nóminas, pensiones, inversiones, etc.).
        </p>
        <p>
          Esta aplicación muestra tanto el <strong>plan aprobado</strong> (lo que se presupuestó)
          como la <strong>ejecución real</strong> (lo que finalmente se ingresó y gastó), según los
          datos publicados por la AEAT, el IGAE y el SEPG.
        </p>
      </ContextBox>
      <p className="text-sm text-gray-400">Dashboard en construcción — Fase 3.</p>
    </div>
  )
}
