interface ScanConfirmDialogProps {
  open: boolean
  barcode: string
  currentQuantity: number
  confirming?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ScanConfirmDialog({
  open,
  barcode,
  currentQuantity,
  confirming = false,
  onConfirm,
  onCancel,
}: ScanConfirmDialogProps) {
  if (!open) return null

  const nextQuantity = currentQuantity + 1

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-confirm-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2
          id="scan-confirm-title"
          className="text-center text-lg font-semibold text-neutral-900"
        >
          Confirm barcode
        </h2>
        <p className="mt-1 text-center text-sm text-neutral-500">
          Is this the correct barcode?
        </p>

        <div className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-5 text-center">
          <p className="break-all font-mono text-xl font-semibold leading-snug text-neutral-900">
            {barcode}
          </p>
          <p className="mt-3 text-sm text-neutral-600">
            {currentQuantity > 0 ? (
              <>
                Current qty: <span className="font-semibold">{currentQuantity}</span>
                {' → '}
                <span className="font-semibold text-neutral-900">{nextQuantity}</span>
              </>
            ) : (
              <>
                New product · Qty will be{' '}
                <span className="font-semibold text-neutral-900">1</span>
              </>
            )}
          </p>
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
            onClick={onConfirm}
            className="btn-primary flex-1"
            disabled={confirming}
            autoFocus
          >
            {confirming ? 'Adding…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
