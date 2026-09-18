import { useEffect, useRef, useState, type FormEvent } from 'react'

interface ManualEntryModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (barcode: string) => void
  lastBarcode?: string | null
  lastQuantity?: number
  onIncrement?: () => void
  onDecrement?: () => void
}

export function ManualEntryModal({
  open,
  onClose,
  onSubmit,
  lastBarcode,
  lastQuantity,
  onIncrement,
  onDecrement,
}: ManualEntryModalProps) {
  const [barcode, setBarcode] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setBarcode('')
      setError('')
      const timer = window.setTimeout(() => inputRef.current?.focus(), 50)
      return () => window.clearTimeout(timer)
    }
  }, [open])

  if (!open) return null

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const value = barcode.trim()
    if (!value) {
      setError('Barcode cannot be empty.')
      return
    }
    onSubmit(value)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-entry-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h2 id="manual-entry-title" className="text-lg font-semibold text-neutral-900">
          Enter Barcode Manually
        </h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-700">
              Barcode
            </span>
            <input
              key={open ? 'open' : 'closed'}
              ref={inputRef}
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={barcode}
              onChange={(e) => {
                setBarcode(e.target.value)
                if (error) setError('')
              }}
              className="input-field font-mono"
              placeholder="Enter barcode"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'manual-error' : undefined}
            />
          </label>
          {error ? (
            <p id="manual-error" className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn-primary w-full">
            Add
          </button>
        </form>

        {lastBarcode ? (
          <div className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Current product
            </p>
            <p className="mt-1 break-all font-mono text-sm text-neutral-900">
              {lastBarcode}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary min-w-14"
                onClick={onDecrement}
                aria-label="Decrease quantity"
              >
                −1
              </button>
              <span className="flex-1 text-center text-lg font-semibold tabular-nums">
                {lastQuantity ?? 0}
              </span>
              <button
                type="button"
                className="btn-secondary min-w-14"
                onClick={onIncrement}
                aria-label="Increase quantity"
              >
                +1
              </button>
            </div>
          </div>
        ) : null}

        <button type="button" className="btn-ghost mt-4 w-full" onClick={onClose}>
          Back to scanner
        </button>
      </div>
    </div>
  )
}
