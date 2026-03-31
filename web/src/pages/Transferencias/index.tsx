import PageHeader from '../../components/layout/PageHeader'

export default function Transferencias() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Transferencias a CCAA"
        subtitle="Estado · Plan y Ejecución"
      />
      <div className="border border-[var(--color-rule)] bg-white px-6 py-12 text-center">
        <p className="text-sm text-[var(--color-ink-muted)]">
          Próximamente — Mapa coroplético de transferencias por Comunidad Autónoma (Fase 3.7).
        </p>
      </div>
    </div>
  )
}
