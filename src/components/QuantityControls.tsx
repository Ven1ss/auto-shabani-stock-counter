interface QuantityControlsProps {
  quantity: number
  onIncrement: () => void
  onDecrement: () => void
  disabled?: boolean
}

export function QuantityControls({
  quantity,
  onIncrement,
  onDecrement,
  disabled = false,
}: QuantityControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="qty-btn"
        onClick={onDecrement}
        disabled={disabled}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <span className="min-w-10 text-center text-base font-semibold tabular-nums text-neutral-900">
        {quantity}
      </span>
      <button
        type="button"
        className="qty-btn"
        onClick={onIncrement}
        disabled={disabled}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  )
}
