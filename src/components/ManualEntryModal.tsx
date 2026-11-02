import { useState, type FormEvent } from 'react'
import { NOTE_MAX_LENGTH } from '../utils/stockCountLogic'

interface ManualEntryModalProps {
  open: boolean
  onClose: () => void
  /** `note` is empty when the user typed none; the product's existing note is then kept. */
  onSubmit: (barcode: string, note: string) => void
  lastBarcode?: string | null
  lastQuantity?: number
  onIncrement?: () => void
  onDecrement?: () => void
}

export function ManualEntryModal({ open, ...props }: ManualEntryModalProps) {
  if (!open) return null
  // Mounted fresh on every open, so the fields always start empty.
  return <ManualEntryContent {...props} />
}

function ManualEntryContent({
  onClose,
  onSubmit,
  lastBarcode,
  lastQuantity,
  onIncrement,
  onDecrement,
}: Omit<ManualEntryModalProps, 'open'>) {
  const [barcode, setBarcode] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const value = barcode.trim()
    if (!value) {
      setError('Barcode cannot be empty.')
      return
    }
    onSubmit(value, note)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-entry-title"
    >
      <div className="mt-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-xl sm:my-auto">
        <h2 id="manual-entry-title" className="text-lg font-semibold text-neutral-900">
          Enter Barcode Manually
        </h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-700">
              Barcode
            </span>
            <input
              autoFocus
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

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-700">
              Note (optional)
            </span>
            <input
              type="text"
              autoComplete="off"
              value={note}
              maxLength={NOTE_MAX_LENGTH}
              onChange={(e) => setNote(e.target.value)}
              className="input-field"
              placeholder="e.g. Red shampoo 250ml"
            />
          </label>

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
