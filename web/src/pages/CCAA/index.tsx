import PageHeader from '../../components/layout/PageHeader'

export default function CCAA() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Comunidades Autónomas"
        subtitle="Presupuestos autonómicos consolidados"
      />
      <div className="border border-[var(--color-rule)] bg-white px-6 py-12 text-center">
        <p className="text-sm text-[var(--color-ink-muted)]">
          Próximamente — Mapa comparativo y detalle por CCAA (Fase 3.8).
        </p>
      </div>
    </div>
  )
}
