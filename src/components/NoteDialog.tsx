import { useState, type FormEvent } from 'react'
import { NOTE_MAX_LENGTH } from '../utils/stockCountLogic'

interface NoteDialogProps {
  open: boolean
  barcode: string
  initialNote: string
  saving?: boolean
  onSave: (note: string) => void
  onCancel: () => void
}

export function NoteDialog({ open, ...props }: NoteDialogProps) {
  if (!open) return null
  // Keyed by barcode so the field always starts from that product's saved note.
  return <NoteDialogContent key={props.barcode} {...props} />
}

function NoteDialogContent({
  barcode,
  initialNote,
  saving = false,
  onSave,
  onCancel,
}: Omit<NoteDialogProps, 'open'>) {
  const [note, setNote] = useState(initialNote)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!saving) onSave(note)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="note-dialog-title"
    >
      <form
        onSubmit={handleSubmit}
        className="my-auto w-full max-w-sm rounded-2xl bg-white p-5 text-neutral-900 shadow-xl"
      >
        <h2 id="note-dialog-title" className="text-center text-lg font-semibold">
          {initialNote ? 'Edit note' : 'Add note'}
        </h2>
        <p className="mt-1 break-all text-center font-mono text-sm text-neutral-500">{barcode}</p>

        <label htmlFor="note-dialog-input" className="mt-4 block text-sm font-medium text-neutral-700">
          What is this product?
        </label>
        <input
          id="note-dialog-input"
          type="text"
          value={note}
          maxLength={NOTE_MAX_LENGTH}
          enterKeyHint="done"
          autoComplete="off"
          autoFocus
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Red shampoo 250ml"
          className="input-field mt-1.5"
        />
        <p className="mt-1.5 text-xs text-neutral-500">
          Shown in the count list and in the Excel and PDF files. Leave empty to remove it.
        </p>

        <div className="mt-5 flex gap-3">
          <button type="button" className="btn-secondary flex-1" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
