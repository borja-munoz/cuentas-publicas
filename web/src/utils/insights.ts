export interface Insight {
  label: string
  value: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  description: string
}
