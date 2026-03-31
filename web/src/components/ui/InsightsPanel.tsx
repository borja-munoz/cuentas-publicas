import type { Insight } from '../../utils/insights'

interface InsightsPanelProps {
  insights: Insight[]
  isLoading?: boolean
}

export default function InsightsPanel({ insights, isLoading }: InsightsPanelProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse border border-[var(--color-rule)] bg-white p-4">
            <div className="mb-2 h-2.5 w-20 rounded bg-gray-200" />
            <div className="mb-3 h-5 w-28 rounded bg-gray-200" />
            <div className="h-2.5 w-full rounded bg-gray-100" />
            <div className="mt-1.5 h-2.5 w-3/4 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    )
  }

  if (insights.length === 0) return null

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {insights.map((insight, i) => (
        <div key={i} className="border border-[var(--color-rule)] bg-white px-4 py-3">
          <p className="mb-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
            {insight.label}
          </p>
          <div className="mb-2 flex items-baseline gap-2 flex-wrap">
            <span className="text-lg font-bold tabular-nums text-[var(--color-ink)]">
              {insight.value}
            </span>
            {insight.trendValue && (
              <span
                className={`text-xs font-medium ${
                  insight.trend === 'up'
                    ? 'text-emerald-600'
                    : insight.trend === 'down'
                    ? 'text-red-600'
                    : 'text-[var(--color-ink-muted)]'
                }`}
              >
                {insight.trend === 'up' ? '▲' : insight.trend === 'down' ? '▼' : ''}{' '}
                {insight.trendValue}
              </span>
            )}
          </div>
          <p className="text-[0.7rem] leading-relaxed text-[var(--color-ink-muted)]">
            {insight.description}
          </p>
        </div>
      ))}
    </div>
  )
}
