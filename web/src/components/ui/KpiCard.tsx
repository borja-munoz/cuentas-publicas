interface KpiCardProps {
  title: string
  value: string
  trendValue?: string
  trend?: 'up' | 'down' | 'neutral'
  subtitle?: string
  accent?: boolean
}

export default function KpiCard({ title, value, trendValue, trend, subtitle, accent }: KpiCardProps) {
  const trendColor =
    trend === 'up' ? 'text-emerald-700' : trend === 'down' ? 'text-red-700' : 'text-[var(--color-ink-faint)]'
  const trendIcon = trend === 'up' ? '▲' : trend === 'down' ? '▼' : ''

  return (
    <div className={`border-t-2 ${accent ? 'border-[var(--color-accent)]' : 'border-[var(--color-ink)]'} bg-white pt-3 pb-4 px-1`}>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
        {title}
      </p>
      <p className="mt-1.5 text-[1.75rem] font-bold leading-none text-[var(--color-ink)] tabular-nums">
        {value}
      </p>
      {trendValue && (
        <p className={`mt-1.5 text-xs font-medium ${trendColor}`}>
          {trendIcon && <span className="mr-0.5">{trendIcon}</span>}
          {trendValue}
        </p>
      )}
      {subtitle && (
        <p className="mt-1 text-[0.7rem] text-[var(--color-ink-faint)]">{subtitle}</p>
      )}
    </div>
  )
}
