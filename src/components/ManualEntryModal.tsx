import { useState, type FormEvent } from 'react'
import { NOTE_MAX_LENGTH } from '../utils/stockCountLogic'

const MAX_QUANTITY = 9999

function parseQuantity(text: string): number {
  const parsed = Number.parseInt(text, 10)
  return Number.isFinite(parsed) ? Math.min(MAX_QUANTITY, Math.max(0, parsed)) : 0
}

interface ManualEntryModalProps {
  open: boolean
  onClose: () => void
  /** `note` is empty when the user typed none; the product's existing note is then kept. */
  onSubmit: (barcode: string, quantity: number, note: string) => void
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
  const [quantityText, setQuantityText] = useState('1')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const quantity = parseQuantity(quantityText)
  const quantityValid = quantity >= 1

  function step(delta: number) {
    setQuantityText((prev) =>
      String(Math.min(MAX_QUANTITY, Math.max(1, parseQuantity(prev) + delta))),
    )
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const value = barcode.trim()
    if (!value) {
      setError('Barcode cannot be empty.')
      return
    }
    if (!quantityValid) {
      setError('Quantity must be at least 1.')
      return
    }
    onSubmit(value, quantity, note)
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

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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

          <div>
            <label
              htmlFor="manual-quantity"
              className="mb-1.5 block text-sm font-medium text-neutral-700"
            >
              How many?
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="qty-btn h-14 min-w-14 text-2xl"
                onClick={() => step(-1)}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <input
                id="manual-quantity"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={quantityText}
                onChange={(e) => {
                  setQuantityText(e.target.value.replace(/\D/g, '').slice(0, 4))
                  if (error) setError('')
                }}
                onFocus={(e) => e.target.select()}
                className="input-field h-14 flex-1 text-center text-2xl font-bold tabular-nums"
                aria-invalid={!quantityValid}
              />
              <button
                type="button"
                className="qty-btn h-14 min-w-14 text-2xl"
                onClick={() => step(1)}
                disabled={quantity >= MAX_QUANTITY}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          </div>

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

          {error ? (
            <p id="manual-error" className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn-primary w-full" disabled={!quantityValid}>
            {`Add ${quantityValid ? quantity : ''}`.trim()}
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
