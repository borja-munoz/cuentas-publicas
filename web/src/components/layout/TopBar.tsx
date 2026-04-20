import { useFilters } from '../../store/filters'
import YearSelector from '../filters/YearSelector'
import ViewModeToggle from '../filters/ViewModeToggle'

export default function TopBar() {
  const { pageFilters } = useFilters()

  return (
    <div className="sticky top-0 z-30 border-b border-[var(--color-rule)] bg-white shadow-sm">
      <div className="flex items-center gap-4 px-4 py-2 md:px-6">
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
