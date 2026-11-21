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
  const [activeField, setActiveField] = useState<ActiveField>('barcode')
  const [error, setError] = useState('')

  const activeValue = activeField === 'barcode' ? barcode : note
  const activeMax = activeField === 'barcode' ? MAX_BARCODE_LENGTH : NOTE_MAX_LENGTH

  function appendChar(char: string) {
    if (activeValue.length >= activeMax) return
    if (activeField === 'barcode') {
      setBarcode((prev) => (prev + char).slice(0, MAX_BARCODE_LENGTH))
    } else {
      setNote((prev) => (prev + char).slice(0, NOTE_MAX_LENGTH))
    }
    if (error) setError('')
  }

  function handleBackspace() {
    if (activeField === 'barcode') {
      setBarcode((prev) => prev.slice(0, -1))
    } else {
      setNote((prev) => prev.slice(0, -1))
    }
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
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" className="btn-ghost px-2" onClick={onClose}>
          Back
        </button>
        <h2 id="manual-entry-title" className="text-base font-semibold text-neutral-900">
          Type barcode
        </h2>
        <span className="w-14" aria-hidden="true" />
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-4">
        <button
          type="button"
          className={`kbd-field ${activeField === 'barcode' ? 'kbd-field-active' : ''} ${
            barcode ? '' : 'kbd-field-empty'
          }`}
          onClick={() => setActiveField('barcode')}
          aria-label={barcode ? `Barcode ${barcode}` : 'Barcode, empty'}
          aria-pressed={activeField === 'barcode'}
        >
          {barcode || 'Tap keys below'}
        </button>

        <div className="mt-4 flex items-center gap-3">
          <p className="w-16 shrink-0 text-sm font-medium text-neutral-600">Qty</p>
          <button
            type="button"
            className="qty-btn h-12 min-w-12 text-2xl"
            onClick={() => step(-1)}
            disabled={quantity <= 1}
            aria-label="Decrease quantity"
          >
            −
          </button>
          <p className="flex-1 text-center text-2xl font-bold tabular-nums text-neutral-900">
            {quantity}
          </p>
          <button
            type="button"
            className="qty-btn h-12 min-w-12 text-2xl"
            onClick={() => step(1)}
            disabled={quantity >= MAX_QUANTITY}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>

        <button
          type="button"
          className={`mt-3 min-h-12 rounded-xl border px-3 py-2 text-left text-sm ${
            activeField === 'note'
              ? 'border-neutral-900 bg-white text-neutral-900'
              : 'border-neutral-200 bg-neutral-50 text-neutral-600'
          }`}
          onClick={() => setActiveField('note')}
          aria-pressed={activeField === 'note'}
        >
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            Note (optional)
          </span>
          <span className={`mt-0.5 block truncate ${note ? 'text-neutral-900' : ''}`}>
            {note || 'Tap here, then type a short name'}
          </span>
        </button>

        {error ? (
          <p className="mt-3 text-center text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : (
          <p className="mt-3 text-center text-xs text-neutral-500">
            {activeField === 'barcode'
              ? 'Numbers and letters are on the same keyboard'
              : 'Typing a note — Space is available below'}
          </p>
        )}

        <div className="mt-auto pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <BarcodeKeyboard
            onKey={appendChar}
            onBackspace={handleBackspace}
            onClear={handleClear}
            showSpace={activeField === 'note'}
          />

          <button
            type="button"
            className="btn-primary mt-3 w-full text-lg"
            onClick={handleAdd}
          >
            {`Add ${quantity}`}
          </button>
        </div>
      </div>
    </div>
  )
}
