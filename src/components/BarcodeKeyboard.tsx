const NUMBER_PAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['-', '0', '⌫'],
] as const

const LETTER_ROWS = [
  ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  ['H', 'I', 'J', 'K', 'L', 'M', 'N'],
  ['O', 'P', 'Q', 'R', 'S', 'T', 'U'],
  ['V', 'W', 'X', 'Y', 'Z'],
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
  muted,
  number,
}: {
  label: string
  ariaLabel?: string
  onPress: () => void
  disabled?: boolean
  wide?: boolean
  muted?: boolean
  number?: boolean
}) {
  return (
    <button
      type="button"
      className={`kbd-key ${wide ? 'kbd-key-wide' : ''} ${muted ? 'kbd-key-muted' : ''} ${
        number ? 'kbd-key-number' : ''
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
      <div className="kbd-pad">
        {NUMBER_PAD.map((row) => (
          <div key={row.join('')} className="kbd-row kbd-row-pad">
            {row.map((key) =>
              key === '⌫' ? (
                <KeyButton
                  key={key}
                  label="⌫"
                  ariaLabel="Delete"
                  onPress={onBackspace}
                  disabled={disabled}
                  muted
                  number
                />
              ) : (
                <KeyButton
                  key={key}
                  label={key}
                  onPress={() => onKey(key)}
                  disabled={disabled}
                  number
                />
              ),
            )}
          </div>
        ))}
      </div>

      <div className="kbd-letters">
        {LETTER_ROWS.map((row) => (
          <div key={row.join('')} className="kbd-row">
            {row.map((key) => (
              <KeyButton key={key} label={key} onPress={() => onKey(key)} disabled={disabled} />
            ))}
          </div>
        ))}
      </div>

      <div className="kbd-row">
        <KeyButton
          label="Clear"
          ariaLabel="Clear all"
          onPress={onClear}
          disabled={disabled}
          wide
          muted
        />
        <KeyButton
          label="Space"
          ariaLabel="Space"
          onPress={() => onKey(' ')}
          disabled={disabled}
          wide
        />
      </div>
    </div>
  )
}
