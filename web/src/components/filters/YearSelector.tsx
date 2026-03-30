import { useFilters } from '../../store/filters'

export default function YearSelector() {
  const { years, selectedYear, setSelectedYear } = useFilters()

  return (
    <select
      value={selectedYear}
      onChange={(e) => setSelectedYear(Number(e.target.value))}
      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:border-gray-400 focus:outline-none"
    >
      {[...years].sort((a, b) => b - a).map((y) => (
        <option key={y} value={y}>{y}</option>
      ))}
    </select>
  )
}
