interface ScanFeedbackProps {
  barcode: string
  quantity: number
  visible: boolean
}

export function ScanFeedback({ barcode, quantity, visible }: ScanFeedbackProps) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-24 z-20 flex justify-center px-4 transition-all duration-200 ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white/95 px-4 py-3 text-center shadow-lg ring-1 ring-black/5 backdrop-blur">
        <p className="text-sm font-semibold tracking-wide text-emerald-700">
          ✓ SCANNED
        </p>
        <p className="mt-1 break-all font-mono text-base font-medium text-neutral-900">
          {barcode}
        </p>
        <p className="mt-1 text-sm text-neutral-600">
          Quantity: <span className="font-semibold text-neutral-900">{quantity}</span>
        </p>
      </div>
    </div>
  )
}
