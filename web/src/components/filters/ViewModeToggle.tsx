import { useFilters, type ViewMode } from '../../store/filters'

const OPTIONS: { value: ViewMode; label: string }[] = [
  { value: 'plan', label: 'Plan' },
  { value: 'ejecucion', label: 'Ejecución' },
  { value: 'comparativa', label: 'Comparativa' },
]

export default function ViewModeToggle() {
  const { viewMode, setViewMode } = useFilters()

  return (
    <div className="flex rounded-lg border border-gray-300 bg-white text-sm font-medium overflow-hidden shadow-sm">
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setViewMode(value)}
          className={`px-3 py-1.5 transition-colors ${
            viewMode === value
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
