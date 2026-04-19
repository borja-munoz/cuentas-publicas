import { useFilters, type EntityType } from '../../store/filters'
import YearSelector from '../filters/YearSelector'
import ViewModeToggle from '../filters/ViewModeToggle'

const ENTITY_OPTIONS: { value: EntityType; label: string }[] = [
  { value: 'Estado', label: 'Estado' },
  { value: 'SS', label: 'Seg. Social' },
]

export default function TopBar() {
  const { entityType, setEntityType, pageFilters } = useFilters()

  return (
    <div className="sticky top-0 z-30 border-b border-[var(--color-rule)] bg-white shadow-sm">
      <div className="flex items-center gap-4 px-4 py-2 md:px-6">
        {/* Entidad */}
        <div className="flex items-center gap-2">
          <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-[var(--color-ink-faint)] hidden sm:inline">
            Entidad
          </span>
          <div className="flex rounded border border-[var(--color-rule)] overflow-hidden text-xs font-medium">
            {ENTITY_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setEntityType(value)}
                className={`px-3 py-1.5 transition-colors ${
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

        {/* Año */}
        <div className="flex items-center gap-2">
          <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-[var(--color-ink-faint)] hidden sm:inline">
            Año
          </span>
          <div className="w-24">
            <YearSelector />
          </div>
        </div>

        {/* ViewMode — visible solo si la página lo declara */}
        {pageFilters.showViewMode && (
          <div className="ml-auto">
            <ViewModeToggle />
          </div>
        )}
      </div>
    </div>
  )
}
