import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  createStockCount,
  loadStockCounts,
  removeStockCount,
  calculateStatistics,
} from '../services/stockCountService'
import type { StockCount } from '../types'
import { formatDate, formatNumber, formatTime } from '../utils/format'

export function HomePage() {
  const navigate = useNavigate()
  const [counts, setCounts] = useState<StockCount[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StockCount | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await loadStockCounts()
      setCounts(data)
      setError(null)
    } catch (err) {
      console.error('Failed to load counts:', err)
      setError('Could not load saved stock counts.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleNewCount() {
    if (creating) return
    setCreating(true)
    try {
      const count = await createStockCount()
      navigate(`/count/${count.id}/scan`)
    } catch (err) {
      console.error('Failed to create stock count:', err)
      setError('Could not start a new stock count. Please try again.')
      setCreating(false)
    }
  }

  function handleOpen(count: StockCount) {
    if (count.status === 'completed') {
      navigate(`/count/${count.id}/complete`)
    } else {
      navigate(`/count/${count.id}/scan`)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await removeStockCount(deleteTarget.id)
      setDeleteTarget(null)
      await refresh()
    } catch (err) {
      console.error('Failed to delete count:', err)
      setError('Could not delete this stock count.')
      setDeleteTarget(null)
    }
  }

  return (
    <div className="app-shell">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Auto Shabani
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">
            Stock Counter
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <button
          type="button"
          className="btn-primary w-full text-base"
          onClick={() => void handleNewCount()}
          disabled={creating}
        >
          {creating ? 'Starting…' : '+ New Stock Count'}
        </button>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Recent Counts
          </h2>

          {loading ? (
            <p className="mt-4 text-sm text-neutral-500">Loading…</p>
          ) : counts.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
              No stock counts yet. Tap New Stock Count to begin.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {counts.map((count) => {
                const stats = calculateStatistics(count.items)
                return (
                  <li
                    key={count.id}
                    className="rounded-2xl border border-neutral-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-neutral-900">Stock Count</p>
                        <p className="mt-0.5 text-sm text-neutral-500">
                          {formatDate(count.createdAt)} • {formatTime(count.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          count.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {count.status === 'completed' ? 'Completed' : 'In Progress'}
                      </span>
                    </div>

                    <div className="mt-3 flex gap-4 text-sm text-neutral-700">
                      <span>
                        <strong className="tabular-nums">
                          {formatNumber(stats.uniqueProducts)}
                        </strong>{' '}
                        products
                      </span>
                      <span>
                        <strong className="tabular-nums">
                          {formatNumber(stats.totalUnits)}
                        </strong>{' '}
                        units
                      </span>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        className="btn-secondary flex-1"
                        onClick={() => handleOpen(count)}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        className="btn-danger-outline flex-1"
                        onClick={() => setDeleteTarget(count)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this stock count?"
        message="This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
