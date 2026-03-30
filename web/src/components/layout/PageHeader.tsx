import type { ReactNode } from 'react'
import YearSelector from '../filters/YearSelector'

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  showYearSelector?: boolean
}

export default function PageHeader({
  title,
  subtitle,
  actions,
  showYearSelector = true,
}: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        {showYearSelector && <YearSelector />}
      </div>
    </div>
  )
}
