const NUMBER_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const
const LETTER_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['-', 'Z', 'X', 'C', 'V', 'B', 'N', 'M'],
] as const

interface BarcodeKeyboardProps {
  onKey: (char: string) => void
  onBackspace: () => void
  onClear: () => void
  /** Space key for notes; hidden for barcode entry. */
  showSpace?: boolean
  disabled?: boolean
}

function KeyButton({
  label,
  ariaLabel,
  onPress,
  disabled,
  wide,
  muted,
}: {
  label: string
  ariaLabel?: string
  onPress: () => void
  disabled?: boolean
  wide?: boolean
  muted?: boolean
}) {
  return (
    <button
      type="button"
      className={`kbd-key ${wide ? 'kbd-key-wide' : ''} ${muted ? 'kbd-key-muted' : ''}`}
      aria-label={ariaLabel ?? label}
      disabled={disabled}
      onClick={(event) => {
        if (disabled) return
        event.preventDefault()
        onPress()
      }}
    >
      {label}
    </button>
  )
}

export function BarcodeKeyboard({
  onKey,
  onBackspace,
  onClear,
  showSpace = false,
  disabled = false,
}: BarcodeKeyboardProps) {
  return (
    <div className="kbd" role="group" aria-label="Barcode keyboard">
      <div className="kbd-row kbd-row-numbers">
        {NUMBER_KEYS.map((key) => (
          <KeyButton key={key} label={key} onPress={() => onKey(key)} disabled={disabled} />
        ))}
      </div>

      {LETTER_ROWS.map((row) => (
        <div key={row.join('')} className="kbd-row">
          {row.map((key) => (
            <KeyButton key={key} label={key} onPress={() => onKey(key)} disabled={disabled} />
          ))}
          {row[0] === '-' ? (
            <KeyButton
              label="⌫"
              ariaLabel="Delete"
              onPress={onBackspace}
              disabled={disabled}
              muted
            />
          ) : null}
        </div>
      ))}

      <div className="kbd-row">
        <KeyButton
          label="Clear"
          ariaLabel="Clear all"
          onPress={onClear}
          disabled={disabled}
          wide
          muted
        />
        {showSpace ? (
          <KeyButton
            label="Space"
            ariaLabel="Space"
            onPress={() => onKey(' ')}
            disabled={disabled}
            wide
          />
        ) : (
          <div className="kbd-spacer" aria-hidden="true" />
        )}
      </div>
    </div>
  )
}
