import { useState } from 'react'
import { NOTE_MAX_LENGTH } from '../utils/stockCountLogic'

const MAX_QUANTITY = 9999

function parseQuantity(text: string): number {
  const parsed = Number.parseInt(text, 10)
  return Number.isFinite(parsed) ? Math.min(MAX_QUANTITY, Math.max(0, parsed)) : 0
}

interface ScanConfirmDialogProps {
  open: boolean
  barcode: string
  currentQuantity: number
  currentNote: string
  confirming?: boolean
  onConfirm: (quantity: number, note: string) => void
  onCancel: () => void
}

export function ScanConfirmDialog({ open, ...props }: ScanConfirmDialogProps) {
  if (!open) return null
  // Keyed by barcode so each scan starts with fresh fields taken from the product.
  return <ScanConfirmContent key={props.barcode} {...props} />
}

function ScanConfirmContent({
  barcode,
  currentQuantity,
  currentNote,
  confirming = false,
  onConfirm,
  onCancel,
}: Omit<ScanConfirmDialogProps, 'open'>) {
  const [quantityText, setQuantityText] = useState('1')
  const [note, setNote] = useState(currentNote)

  const quantity = parseQuantity(quantityText)
  const valid = quantity >= 1

  function step(delta: number) {
    setQuantityText((prev) =>
      String(Math.min(MAX_QUANTITY, Math.max(1, parseQuantity(prev) + delta))),
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-confirm-title"
    >
      <div className="my-auto w-full max-w-sm rounded-2xl bg-white p-5 text-neutral-900 shadow-xl">
        <h2 id="scan-confirm-title" className="text-center text-lg font-semibold">
          Confirm barcode
        </h2>
        <p className="mt-1 text-center text-sm text-neutral-500">
          Is this the correct barcode?
        </p>

        <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-4 text-center">
          <p className="break-all font-mono text-xl font-semibold leading-snug">{barcode}</p>
          <p className="mt-2 text-sm text-neutral-600">
            {currentQuantity > 0 ? (
              <>
                Current <span className="font-semibold">{currentQuantity}</span>
                {' → '}
                <span className="font-semibold text-neutral-900">
                  {currentQuantity + (valid ? quantity : 0)}
                </span>
              </>
            ) : (
              'New product'
            )}
          </p>
        </div>

        <div className="mt-4">
          <label
            htmlFor="scan-confirm-quantity"
            className="block text-center text-xs font-semibold uppercase tracking-wide text-neutral-500"
          >
            How many?
          </label>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="qty-btn h-14 min-w-14 text-2xl"
              onClick={() => step(-1)}
              disabled={confirming || quantity <= 1}
              aria-label="Decrease quantity"
            >
              −
            </button>
            <input
              id="scan-confirm-quantity"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={quantityText}
              onChange={(e) => setQuantityText(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onFocus={(e) => e.target.select()}
              className="input-field h-14 flex-1 text-center text-2xl font-bold tabular-nums"
              aria-invalid={!valid}
            />
            <button
              type="button"
              className="qty-btn h-14 min-w-14 text-2xl"
              onClick={() => step(1)}
              disabled={confirming || quantity >= MAX_QUANTITY}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          {!valid ? (
            <p className="mt-2 text-center text-sm text-red-600" role="alert">
              Quantity must be at least 1.
            </p>
          ) : null}
        </div>

        <div className="mt-4">
          <label
            htmlFor="scan-confirm-note"
            className="block text-center text-xs font-semibold uppercase tracking-wide text-neutral-500"
          >
            Note (optional)
          </label>
          <input
            id="scan-confirm-note"
            type="text"
            value={note}
            maxLength={NOTE_MAX_LENGTH}
            enterKeyHint="done"
            autoComplete="off"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            placeholder="e.g. Red shampoo 250ml"
            className="input-field mt-2"
            disabled={confirming}
          />
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary flex-1"
            disabled={confirming}
          >
            Rescan
          </button>
          <button
            type="button"
            onClick={() => valid && onConfirm(quantity, note)}
            className="btn-primary flex-1"
            disabled={confirming || !valid}
          >
            {confirming ? 'Adding…' : `Add ${valid ? quantity : ''}`.trim()}
          </button>
        </div>
      </div>
    </div>
  )
}
