interface KpiCardProps {
  title: string
  value: string
  trendValue?: string
  trend?: 'up' | 'down' | 'neutral'
  subtitle?: string
}

export default function KpiCard({ title, value, trendValue, trend, subtitle }: KpiCardProps) {
  const trendColor =
    trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500'
  const trendIcon = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '—'

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {trendValue && (
        <p className={`mt-1 text-sm font-medium ${trendColor}`}>
          {trendIcon} {trendValue}
        </p>
      )}
      {subtitle && <p className="mt-1 text-xs text-gray-400">{subtitle}</p>}
    </div>
  )
}
