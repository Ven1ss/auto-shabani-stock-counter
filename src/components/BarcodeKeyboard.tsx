const NUMBER_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const

const LETTER_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['-', 'Z', 'X', 'C', 'V', 'B', 'N', 'M'],
] as const

interface BarcodeKeyboardProps {
  onKey: (char: string) => void
  onBackspace: () => void
  onClear: () => void
  disabled?: boolean
}

function KeyButton({
  label,
  ariaLabel,
  onPress,
  disabled,
  wide,
  space,
  special,
}: {
  label: string
  ariaLabel?: string
  onPress: () => void
  disabled?: boolean
  wide?: boolean
  space?: boolean
  special?: boolean
}) {
  return (
    <button
      type="button"
      className={`kbd-key ${wide ? 'kbd-key-wide' : ''} ${space ? 'kbd-key-space' : ''} ${
        special ? 'kbd-key-special' : ''
      }`}
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
  disabled = false,
}: BarcodeKeyboardProps) {
  return (
    <div className="kbd" role="group" aria-label="Numbers and letters">
      <div className="kbd-row kbd-row-numbers">
        {NUMBER_ROW.map((key) => (
          <KeyButton key={key} label={key} onPress={() => onKey(key)} disabled={disabled} />
        ))}
      </div>

      <div className="kbd-row">
        {LETTER_ROWS[0].map((key) => (
          <KeyButton key={key} label={key} onPress={() => onKey(key)} disabled={disabled} />
        ))}
      </div>

      <div className="kbd-row kbd-row-inset">
        {LETTER_ROWS[1].map((key) => (
          <KeyButton key={key} label={key} onPress={() => onKey(key)} disabled={disabled} />
        ))}
      </div>

      <div className="kbd-row">
        {LETTER_ROWS[2].map((key) =>
          key === '-' ? (
            <KeyButton
              key={key}
              label={key}
              onPress={() => onKey(key)}
              disabled={disabled}
              special
            />
          ) : (
            <KeyButton key={key} label={key} onPress={() => onKey(key)} disabled={disabled} />
          ),
        )}
        <KeyButton
          label="⌫"
          ariaLabel="Delete"
          onPress={onBackspace}
          disabled={disabled}
          special
          wide
        />
      </div>

      <div className="kbd-row">
        <KeyButton
          label="Clear"
          ariaLabel="Clear all"
          onPress={onClear}
          disabled={disabled}
          special
          wide
        />
        <KeyButton
          label="space"
          ariaLabel="Space"
          onPress={() => onKey(' ')}
          disabled={disabled}
          space
        />
      </div>
    </div>
  )
}
