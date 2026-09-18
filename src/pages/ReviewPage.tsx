import { useDeferredValue, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { QuantityControls } from '../components/QuantityControls'
import { useStockCount } from '../hooks/useStockCount'
import {
  calculateStatistics,
  decrementBarcode,
  deleteBarcode,
  finishStockCount,
  incrementBarcode,
} from '../services/stockCountService'
import type { SortOption } from '../types'
import { formatNumber } from '../utils/format'
import { filterItemsBySearch, sortItems } from '../utils/stockCountLogic'

export function ReviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { count, loading, error, replaceCount } = useStockCount(id)

  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [sort, setSort] = useState<SortOption>('recent')
  const [deleteBarcodeTarget, setDeleteBarcodeTarget] = useState<string | null>(null)
  const [finishOpen, setFinishOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const stats = useMemo(
    () => calculateStatistics(count?.items ?? []),
    [count?.items],
  )

  const visibleItems = useMemo(() => {
    if (!count) return []
    const filtered = filterItemsBySearch(count.items, deferredSearch)
    return sortItems(filtered, sort)
  }, [count, deferredSearch, sort])

  const readOnly = count?.status === 'completed'

  async function handleIncrement(barcode: string) {
    if (!count || readOnly) return
    const updated = await incrementBarcode(count, barcode)
    replaceCount(updated)
  }

  async function handleDecrement(barcode: string) {
    if (!count || readOnly) return
    const item = count.items.find((i) => i.barcode === barcode)
    if (!item) return
    if (item.quantity <= 1) {
      setDeleteBarcodeTarget(barcode)
      return
    }
    const updated = await decrementBarcode(count, barcode)
    replaceCount(updated)
  }

  async function confirmDeleteItem() {
    if (!count || !deleteBarcodeTarget) return
    const updated = await deleteBarcode(count, deleteBarcodeTarget)
    replaceCount(updated)
    setDeleteBarcodeTarget(null)
  }

  async function confirmFinish() {
    if (!count) return
    if (count.items.length === 0) {
      setFinishOpen(false)
      return
    }
    setBusy(true)
    try {
      const updated = await finishStockCount(count)
      replaceCount(updated)
      setFinishOpen(false)
      navigate(`/count/${updated.id}/complete`, { replace: true })
    } catch (err) {
      console.error('Finish failed:', err)
      setBusy(false)
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

  return (
    <div className="app-shell flex flex-col">
      <AppHeader
        title="Stock Count"
        subtitle={`${formatNumber(stats.uniqueProducts)} products · ${formatNumber(stats.totalUnits)} units`}
        onBack={() =>
          navigate(readOnly ? `/count/${count.id}/complete` : `/count/${count.id}/scan`)
        }
        backLabel={readOnly ? 'Back' : 'Back to scanner'}
      />

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="block flex-1">
            <span className="sr-only">Search barcode</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search barcode..."
              className="input-field"
              autoComplete="off"
            />
          </label>
          <label className="block sm:w-52">
            <span className="sr-only">Sort</span>
            <select
              className="input-field"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
            >
              <option value="recent">Recently scanned</option>
              <option value="barcode-asc">Barcode A → Z</option>
              <option value="quantity-desc">Quantity high → low</option>
              <option value="quantity-asc">Quantity low → high</option>
            </select>
          </label>
        </div>

        {count.items.length === 0 ? (
          <p className="mt-8 text-center text-sm text-neutral-500">
            Your stock count is empty. Scan products to add them here.
          </p>
        ) : visibleItems.length === 0 ? (
          <p className="mt-8 text-center text-sm text-neutral-500">
            No barcodes match your search.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            {visibleItems.map((item) => (
              <li key={item.barcode} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="break-all font-mono text-sm font-medium text-neutral-900">
                    {item.barcode}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Qty {formatNumber(item.quantity)}
                  </p>
                </div>
                {!readOnly ? (
                  <div className="flex items-center gap-2">
                    <QuantityControls
                      quantity={item.quantity}
                      onIncrement={() => void handleIncrement(item.barcode)}
                      onDecrement={() => void handleDecrement(item.barcode)}
                    />
                    <button
                      type="button"
                      className="min-h-11 rounded-xl px-2 text-xs font-medium text-red-600"
                      onClick={() => setDeleteBarcodeTarget(item.barcode)}
                    >
                      Delete
                    </button>
                  </div>
                ) : (
                  <span className="text-base font-semibold tabular-nums text-neutral-900">
                    {item.quantity}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!readOnly ? (
        <div className="sticky bottom-0 border-t border-neutral-200 bg-white/95 px-4 py-4 backdrop-blur">
          <div className="mx-auto max-w-3xl">
            <button
              type="button"
              className="btn-primary w-full"
              disabled={count.items.length === 0 || busy}
              onClick={() => {
                if (count.items.length === 0) return
                setFinishOpen(true)
              }}
            >
              Done
            </button>
            {count.items.length === 0 ? (
              <p className="mt-2 text-center text-xs text-neutral-500">
                Your stock count is empty.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteBarcodeTarget)}
        title="Remove this product?"
        message="This barcode will be removed from the stock count."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onCancel={() => setDeleteBarcodeTarget(null)}
        onConfirm={() => void confirmDeleteItem()}
      />

      <ConfirmDialog
        open={finishOpen}
        title="Finish this stock count?"
        message={`You have counted:\n\n${formatNumber(stats.uniqueProducts)} unique products\n${formatNumber(stats.totalUnits)} total units`}
        confirmLabel="Finish Count"
        cancelLabel="Cancel"
        onCancel={() => setFinishOpen(false)}
        onConfirm={() => void confirmFinish()}
      />
    </div>
  )
}
