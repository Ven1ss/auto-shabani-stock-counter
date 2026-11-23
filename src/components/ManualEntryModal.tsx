import { useState } from 'react'
import { NOTE_MAX_LENGTH } from '../utils/stockCountLogic'
import { BarcodeKeyboard } from './BarcodeKeyboard'

const MAX_QUANTITY = 9999
const MAX_BARCODE_LENGTH = 64

type ActiveField = 'barcode' | 'note'

interface ManualEntryModalProps {
  open: boolean
  onClose: () => void
  /** `note` is empty when the user typed none; the product's existing note is then kept. */
  onSubmit: (barcode: string, quantity: number, note: string) => void
}

export function ManualEntryModal({ open, ...props }: ManualEntryModalProps) {
  if (!open) return null
  // Mounted fresh on every open, so the fields always start empty.
  return <ManualEntryContent {...props} />
}

function ManualEntryContent({
  onClose,
  onSubmit,
}: Omit<ManualEntryModalProps, 'open'>) {
  const [barcode, setBarcode] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [activeField, setActiveField] = useState<ActiveField>('barcode')
  const [error, setError] = useState('')

  const activeValue = activeField === 'barcode' ? barcode : note
  const activeMax = activeField === 'barcode' ? MAX_BARCODE_LENGTH : NOTE_MAX_LENGTH

  function appendChar(char: string) {
    if (activeValue.length >= activeMax) return
    // Barcodes never need spaces — ignore them so notes Space is safe if mistapped.
    if (activeField === 'barcode') {
      if (char === ' ') return
      setBarcode((prev) => (prev + char).slice(0, MAX_BARCODE_LENGTH))
    } else {
      setNote((prev) => (prev + char).slice(0, NOTE_MAX_LENGTH))
    }
    if (error) setError('')
  }

  function handleBackspace() {
    if (activeField === 'barcode') setBarcode((prev) => prev.slice(0, -1))
    else setNote((prev) => prev.slice(0, -1))
    if (error) setError('')
  }

  function handleClear() {
    if (activeField === 'barcode') setBarcode('')
    else setNote('')
    if (error) setError('')
  }

  function step(delta: number) {
    setQuantity((prev) => Math.min(MAX_QUANTITY, Math.max(1, prev + delta)))
  }

  function openNote() {
    setShowNote(true)
    setActiveField('note')
  }

  function handleAdd() {
    const value = barcode.trim()
    if (!value) {
      setActiveField('barcode')
      setError('Type the barcode with the keys below.')
      return
    }
    onSubmit(value, quantity, note)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-entry-title"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 pb-2.5 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button type="button" className="btn-ghost px-2" onClick={onClose}>
          Back
        </button>
        <h2 id="manual-entry-title" className="text-base font-semibold text-neutral-900">
          Type barcode
        </h2>
        <span className="w-14" aria-hidden="true" />
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-3 pt-3">
        <button
          type="button"
          className={`kbd-field shrink-0 ${activeField === 'barcode' ? 'kbd-field-active' : ''} ${
            barcode ? '' : 'kbd-field-empty'
          }`}
          onClick={() => setActiveField('barcode')}
          aria-label={barcode ? `Barcode ${barcode}` : 'Barcode, empty'}
          aria-pressed={activeField === 'barcode'}
        >
          {barcode || 'Barcode'}
        </button>

        <div className="mt-2.5 flex shrink-0 items-center gap-3">
          <p className="w-12 shrink-0 text-sm font-medium text-neutral-600">Qty</p>
          <button
            type="button"
            className="qty-btn h-11 min-w-11 text-xl"
            onClick={() => step(-1)}
            disabled={quantity <= 1}
            aria-label="Decrease quantity"
          >
            −
          </button>
          <p className="flex-1 text-center text-xl font-bold tabular-nums text-neutral-900">
            {quantity}
          </p>
          <button
            type="button"
            className="qty-btn h-11 min-w-11 text-xl"
            onClick={() => step(1)}
            disabled={quantity >= MAX_QUANTITY}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>

        {showNote ? (
          <button
            type="button"
            className={`mt-2 min-h-11 shrink-0 rounded-xl border px-3 py-1.5 text-left text-sm ${
              activeField === 'note'
                ? 'border-neutral-900 bg-white text-neutral-900'
                : 'border-neutral-200 bg-neutral-50 text-neutral-600'
            }`}
            onClick={() => setActiveField('note')}
            aria-pressed={activeField === 'note'}
          >
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Note
            </span>
            <span className={`mt-0.5 block truncate ${note ? 'text-neutral-900' : ''}`}>
              {note || 'Product name'}
            </span>
          </button>
        ) : (
          <button
            type="button"
            className="btn-ghost mt-1 shrink-0 self-start px-1 text-sm text-neutral-500"
            onClick={openNote}
          >
            + Add note
          </button>
        )}

        {error ? (
          <p className="mt-1 shrink-0 text-center text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
          <BarcodeKeyboard
            onKey={appendChar}
            onBackspace={handleBackspace}
            onClear={handleClear}
          />
        </div>

        <div className="shrink-0 border-t border-neutral-100 bg-white pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" className="btn-primary w-full text-lg" onClick={handleAdd}>
            {`Add ${quantity}`}
          </button>
        </div>
      </div>
    </div>
  )
}
