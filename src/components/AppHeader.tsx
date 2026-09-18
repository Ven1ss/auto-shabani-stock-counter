import type { ReactNode } from 'react'

interface AppHeaderProps {
  title: string
  subtitle?: string
  onBack?: () => void
  backLabel?: string
  rightSlot?: ReactNode
}

export function AppHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  rightSlot,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-800"
            aria-label={backLabel}
          >
            ←
          </button>
        ) : (
          <div className="min-w-11" />
        )}
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-base font-semibold tracking-wide text-neutral-900">
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-xs text-neutral-500">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex min-w-11 justify-end">{rightSlot}</div>
      </div>
    </header>
  )
}
