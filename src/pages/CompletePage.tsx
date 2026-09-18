import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useStockCount } from '../hooks/useStockCount'
import { exportExcel } from '../exports/excelExport'
import { exportPDF } from '../exports/pdfExport'
import {
  calculateStatistics,
  editStockCount,
} from '../services/stockCountService'
import { formatLongDate, formatNumber, formatTime } from '../utils/format'

export function CompletePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { count, loading, error, replaceCount } = useStockCount(id)
  const [exportError, setExportError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  const stats = useMemo(
    () => calculateStatistics(count?.items ?? []),
    [count?.items],
  )

  function handleExportExcel() {
    if (!count) return
    try {
      setExportError(null)
      if (count.items.length === 0) {
        setExportError('Your stock count is empty.')
        return
      }
      exportExcel(count)
    } catch (err) {
      console.error('Excel export failed:', err)
      setExportError(
        err instanceof Error && err.message === 'EMPTY_COUNT'
          ? 'Your stock count is empty.'
          : 'Could not export Excel file. Please try again.',
      )
    }
  }

  function handleExportPdf() {
    if (!count) return
    try {
      setExportError(null)
      if (count.items.length === 0) {
        setExportError('Your stock count is empty.')
        return
      }
      exportPDF(count)
    } catch (err) {
      console.error('PDF export failed:', err)
      setExportError(
        err instanceof Error && err.message === 'EMPTY_COUNT'
          ? 'Your stock count is empty.'
          : 'Could not export PDF file. Please try again.',
      )
    }
  }

  async function confirmEdit() {
    if (!count) return
    try {
      const updated = await editStockCount(count)
      replaceCount(updated)
      setEditOpen(false)
      navigate(`/count/${updated.id}/scan`)
    } catch (err) {
      console.error('Edit reopen failed:', err)
      setExportError('Could not reopen this stock count.')
      setEditOpen(false)
    }
  }

  if (loading) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-sm text-neutral-500">Loading…</p>
      </div>
    )
  }

  if (error || !count) {
    return (
      <div className="app-shell flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-center text-sm text-neutral-600">
          {error ?? 'Stock count not found.'}
        </p>
        <button type="button" className="btn-primary" onClick={() => navigate('/')}>
          Back to Home
        </button>
      </div>
    )
  }

  const finishedAt = count.completedAt ?? count.createdAt

  return (
    <div className="app-shell">
      <AppHeader title="Completed" onBack={() => navigate('/')} backLabel="Home" />

      <main className="mx-auto flex max-w-3xl flex-col px-4 py-8">
        <div className="rounded-2xl border border-neutral-200 bg-white px-5 py-8 text-center">
          <p className="text-sm font-semibold tracking-wide text-emerald-700">
            ✓ STOCK COUNT COMPLETED
          </p>
          <p className="mt-4 text-lg font-medium text-neutral-900">
            {formatLongDate(finishedAt)}
          </p>
          <p className="text-neutral-500">{formatTime(finishedAt)}</p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-neutral-50 px-3 py-4">
              <p className="text-2xl font-bold tabular-nums text-neutral-900">
                {formatNumber(stats.uniqueProducts)}
              </p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                Products
              </p>
            </div>
            <div className="rounded-xl bg-neutral-50 px-3 py-4">
              <p className="text-2xl font-bold tabular-nums text-neutral-900">
                {formatNumber(stats.totalUnits)}
              </p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                Units
              </p>
            </div>
          </div>
        </div>

        {exportError ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-700">
            {exportError}
          </p>
        ) : null}

        <div className="mt-6 space-y-3">
          <button
            type="button"
            className="btn-primary w-full text-base"
            onClick={handleExportExcel}
          >
            Export Excel
          </button>
          <button
            type="button"
            className="btn-primary w-full text-base"
            onClick={handleExportPdf}
          >
            Export PDF
          </button>
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => navigate(`/count/${count.id}/review`)}
          >
            View Count
          </button>
          {count.status === 'completed' ? (
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => setEditOpen(true)}
            >
              Edit Count
            </button>
          ) : (
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => navigate(`/count/${count.id}/scan`)}
            >
              Continue Scanning
            </button>
          )}
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={() => navigate('/')}
          >
            Back to Home
          </button>
        </div>
      </main>

      <ConfirmDialog
        open={editOpen}
        title="Edit this stock count?"
        message="The count will be unlocked so you can change quantities and continue scanning."
        confirmLabel="Edit"
        cancelLabel="Cancel"
        onCancel={() => setEditOpen(false)}
        onConfirm={() => void confirmEdit()}
      />
    </div>
  )
}
