import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface InfoTooltipProps {
  content: string
}

interface TooltipPos {
  left: number
  top?: number
  bottom?: number
  above: boolean
}

export default function InfoTooltip({ content }: InfoTooltipProps) {
  const [pos, setPos] = useState<TooltipPos | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  function show() {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const above = rect.top > 200
    setPos({
      left: rect.left + rect.width / 2,
      ...(above
        ? { bottom: window.innerHeight - rect.top + 8 }
        : { top: rect.bottom + 8 }),
      above,
    })
  }

  function hide() {
    setPos(null)
  }

  // Cierra al hacer clic fuera (móvil)
  useEffect(() => {
    if (!pos) return
    function handle(e: MouseEvent) {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        hide()
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [pos])

  const tooltip = pos
    ? createPortal(
        <span
          role="tooltip"
          style={{
            position: 'fixed',
            left: pos.left,
            ...(pos.above ? { bottom: pos.bottom } : { top: pos.top }),
            transform: 'translateX(-50%)',
            width: '16rem',
            zIndex: 9999,
          }}
          className="rounded border border-[var(--color-rule)] bg-white px-3 py-2.5 text-xs leading-relaxed text-[var(--color-ink)] shadow-lg"
        >
          {content}
          {pos.above ? (
            <>
              <span className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-white" />
              <span className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-[var(--color-rule)]" style={{ zIndex: -1 }} />
            </>
          ) : (
            <>
              <span className="absolute -top-[5px] left-1/2 -translate-x-1/2 border-x-4 border-b-4 border-x-transparent border-b-white" />
              <span className="absolute -top-[6px] left-1/2 -translate-x-1/2 border-x-4 border-b-4 border-x-transparent border-b-[var(--color-rule)]" style={{ zIndex: -1 }} />
            </>
          )}
        </span>,
        document.body,
      )
    : null

  return (
    <span className="inline-flex items-center">
      <button
        ref={btnRef}
        type="button"
        className="ml-1 inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border border-[var(--color-ink-faint)] text-[0.55rem] leading-none text-[var(--color-ink-faint)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] focus:outline-none"
        onMouseEnter={show}
        onMouseLeave={hide}
        onClick={() => (pos ? hide() : show())}
        aria-label="Más información"
      >
        i
      </button>
      {tooltip}
    </span>
  )
}
