import type { Insight } from '../../utils/insights'
import LoadingSkeleton from './LoadingSkeleton'

interface InsightsPanelProps {
  insights: Insight[]
  isLoading?: boolean
}

export default function InsightsPanel({ insights, isLoading }: InsightsPanelProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
            <LoadingSkeleton rows={3} />
          </div>
        ))}
      </div>
    )
  }

  if (insights.length === 0) return null

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {insights.map((insight, i) => {
        const trendColor =
          insight.trend === 'up'
            ? 'text-green-600'
            : insight.trend === 'down'
              ? 'text-red-600'
              : 'text-gray-500'
        const trendIcon =
          insight.trend === 'up' ? '▲' : insight.trend === 'down' ? '▼' : '—'

        return (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              {insight.label}
            </p>
            <p className="mt-1 text-xl font-bold text-gray-900">{insight.value}</p>
            {insight.trendValue && (
              <p className={`mt-0.5 text-sm font-medium ${trendColor}`}>
                {trendIcon} {insight.trendValue}
              </p>
            )}
            <p className="mt-2 text-xs leading-snug text-gray-500">{insight.description}</p>
          </div>
        )
      })}
    </div>
  )
}
