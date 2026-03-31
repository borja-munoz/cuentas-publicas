import { useFilters } from '../../store/filters'

export default function YearSelector() {
  const { years, selectedYear, setSelectedYear } = useFilters()

  return (
    <select
      value={selectedYear}
      onChange={(e) => setSelectedYear(Number(e.target.value))}
      className="w-full rounded border border-[var(--color-rule)] bg-white px-2 py-1.5 text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-accent)]"
    >
      {[...years].sort((a, b) => b - a).map((y) => (
        <option key={y} value={y}>{y}</option>
      ))}
    </select>
  )
}
