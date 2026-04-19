import { type ReactNode, useState } from 'react'

interface ContextBoxProps {
  title: string
  children: ReactNode
}

export default function ContextBox({ title, children }: ContextBoxProps) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="rounded-xl border border-[var(--color-rule)] bg-[var(--color-bg-paper)] px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">{title}</h2>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-shrink-0 text-xs text-[var(--color-accent)] hover:underline md:hidden"
        >
          {expanded ? 'Ocultar' : 'Leer más'}
        </button>
      </div>
      <div
        className={`mt-2 space-y-2 text-sm leading-relaxed text-[var(--color-ink-muted)] ${expanded ? '' : 'hidden md:block'}`}
      >
        {children}
      </div>
    </div>
  )
}
