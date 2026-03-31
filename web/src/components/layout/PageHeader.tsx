import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-[var(--color-ink)] pb-3">
      <div>
        <h1 className="text-2xl font-bold leading-tight text-[var(--color-ink)]">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
