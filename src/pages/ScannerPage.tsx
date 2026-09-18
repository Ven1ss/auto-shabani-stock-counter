import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ManualEntryModal } from '../components/ManualEntryModal'
import { ScanFeedback } from '../components/ScanFeedback'
import { usePreferences } from '../hooks/usePreferences'
import { useStockCount } from '../hooks/useStockCount'
import {
  classifyScannerError,
  createScannerController,
  scannerErrorMessage,
  type ScannerController,
} from '../scanner/barcodeScanner'
import { provideScanFeedback } from '../services/feedbackService'
import {
  addScan,
  calculateStatistics,
  decrementBarcode,
  incrementBarcode,
} from '../services/stockCountService'
import { formatNumber } from '../utils/format'
import { getLastScannedItem } from '../utils/stockCountLogic'

const SCANNER_ELEMENT_ID = 'barcode-reader'

export function ScannerPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { count, loading, error, replaceCount, getLatest } = useStockCount(id)
  const { preferences, toggleSound, toggleVibration } = usePreferences()

  const [cameraError, setCameraError] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [cameraCount, setCameraCount] = useState(0)
  const [manualOpen, setManualOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [feedback, setFeedback] = useState<{
    barcode: string
    quantity: number
    visible: boolean
  } | null>(null)

  const scannerRef = useRef<ScannerController | null>(null)
  const processingRef = useRef(false)
  const feedbackTimerRef = useRef<number | null>(null)
  const preferencesRef = useRef(preferences)

  useEffect(() => {
    preferencesRef.current = preferences
  }, [preferences])

  const stats = useMemo(
    () => calculateStatistics(count?.items ?? []),
    [count?.items],
  )
  const lastItem = useMemo(
    () => getLastScannedItem(count?.items ?? []),
    [count?.items],
  )

  const handleScan = useCallback(
    async (barcode: string) => {
      if (processingRef.current) return
      const current = getLatest()
      if (!current || current.status === 'completed') return

      processingRef.current = true
      try {
        const updated = await addScan(current, barcode)
        replaceCount(updated)
        const item = updated.items.find((i) => i.barcode === barcode.trim())
        if (item) {
          if (feedbackTimerRef.current) {
            window.clearTimeout(feedbackTimerRef.current)
          }
          setFeedback({ barcode: item.barcode, quantity: item.quantity, visible: true })
          feedbackTimerRef.current = window.setTimeout(() => {
            setFeedback((prev) => (prev ? { ...prev, visible: false } : prev))
          }, 900)
        }
        void provideScanFeedback(preferencesRef.current)
      } catch (err) {
        console.error('Scan add failed:', err)
      } finally {
        processingRef.current = false
      }
    },
    [getLatest, replaceCount],
  )

  useEffect(() => {
    if (!count || count.status === 'completed') return

    let cancelled = false
    let controller: ScannerController | null = null
    const startTimer = window.setTimeout(() => {
      if (cancelled) return
      controller = createScannerController(SCANNER_ELEMENT_ID)
      scannerRef.current = controller

      void (async () => {
        setStarting(true)
        setCameraError(null)
        try {
          await controller.start((barcode) => {
            void handleScan(barcode)
          })
          if (!cancelled) {
            setTorchSupported(controller.getTorchSupported())
            setCameraCount(controller.getCameraCount())
          }
        } catch (err) {
          console.error('Scanner start error:', err)
          if (!cancelled) {
            setCameraError(scannerErrorMessage(classifyScannerError(err)))
          }
        } finally {
          if (!cancelled) setStarting(false)
        }
      })()
    }, 150)

    return () => {
      cancelled = true
      window.clearTimeout(startTimer)
      const active = controller ?? scannerRef.current
      scannerRef.current = null
      if (active) {
        void active.stop()
      }
      if (feedbackTimerRef.current) {
        window.clearTimeout(feedbackTimerRef.current)
      }
    }
  }, [count?.id, count?.status, handleScan])

  useEffect(() => {
    if (count?.status === 'completed' && id) {
      navigate(`/count/${id}/complete`, { replace: true })
    }
  }, [count?.status, id, navigate])

  async function handleTorch() {
    const controller = scannerRef.current
    if (!controller) return
    try {
      const on = await controller.toggleTorch()
      setTorchOn(on)
      setTorchSupported(controller.getTorchSupported())
    } catch (err) {
      console.error('Torch toggle failed:', err)
    }
  }

  async function handleSwitchCamera() {
    const controller = scannerRef.current
    if (!controller) return
    try {
      await controller.switchCamera()
      setTorchOn(false)
      setTorchSupported(controller.getTorchSupported())
    } catch (err) {
      console.error('Switch camera failed:', err)
      setCameraError('Could not switch camera.')
    }
  }

  async function handleManualSubmit(barcode: string) {
    setManualOpen(false)
    await handleScan(barcode)
  }

  async function handleManualIncrement() {
    const current = getLatest()
    const last = getLastScannedItem(current?.items ?? [])
    if (!current || !last) return
    const updated = await incrementBarcode(current, last.barcode)
    replaceCount(updated)
  }

  async function handleManualDecrement() {
    const current = getLatest()
    const last = getLastScannedItem(current?.items ?? [])
    if (!current || !last) return
    const updated = await decrementBarcode(current, last.barcode)
    replaceCount(updated)
  }

  function requestLeave() {
    setLeaveOpen(true)
  }

  if (loading) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-sm text-neutral-500">Loading stock count…</p>
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
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-neutral-950 text-white">
      <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          className="scanner-chip"
          onClick={requestLeave}
          aria-label="Close scanner"
        >
          Close
        </button>
        <div className="rounded-xl bg-black/55 px-3 py-2 text-center backdrop-blur">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
            Stock Count
          </p>
          <p className="text-sm font-semibold tabular-nums">
            {formatNumber(stats.uniqueProducts)} products · {formatNumber(stats.totalUnits)}{' '}
            units
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {torchSupported ? (
            <button
              type="button"
              className="scanner-chip"
              onClick={() => void handleTorch()}
              aria-pressed={torchOn}
            >
              {torchOn ? 'Flash Off' : 'Flash On'}
            </button>
          ) : null}
          {cameraCount > 1 ? (
            <button
              type="button"
              className="scanner-chip"
              onClick={() => void handleSwitchCamera()}
            >
              Switch Cam
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div id={SCANNER_ELEMENT_ID} className="h-full w-full [&_video]:object-cover" />

        {!cameraError ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="scan-frame" />
            <p className="mt-6 rounded-full bg-black/55 px-4 py-2 text-sm text-white backdrop-blur">
              Point the camera at a barcode
            </p>
          </div>
        ) : null}

        {starting && !cameraError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/80">
            <p className="text-sm text-white/80">Starting camera…</p>
          </div>
        ) : null}

        {cameraError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-950 px-6">
            <div className="max-w-sm text-center">
              <p className="text-base font-medium text-white">{cameraError}</p>
              <button
                type="button"
                className="btn-primary mt-5 w-full"
                onClick={() => window.location.reload()}
              >
                Try Again
              </button>
              <button
                type="button"
                className="btn-ghost mt-3 w-full text-white"
                onClick={() => setManualOpen(true)}
              >
                Enter Barcode Manually
              </button>
            </div>
          </div>
        ) : null}

        {feedback ? (
          <ScanFeedback
            barcode={feedback.barcode}
            quantity={feedback.quantity}
            visible={feedback.visible}
          />
        ) : null}
      </div>

      <div className="z-20 border-t border-white/10 bg-neutral-950/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
              Unique Products
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {formatNumber(stats.uniqueProducts)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
              Total Units
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {formatNumber(stats.totalUnits)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
              Last Scanned
            </p>
            <p className="truncate text-sm font-medium tabular-nums">
              {lastItem
                ? `${lastItem.barcode} × ${lastItem.quantity}`
                : '—'}
            </p>
          </div>
        </div>

        <div className="mx-auto mt-3 flex max-w-3xl gap-2">
          <button
            type="button"
            className="btn-secondary flex-1 bg-white text-neutral-900"
            onClick={() => navigate(`/count/${count.id}/review`)}
          >
            View Count
          </button>
          <button
            type="button"
            className="btn-secondary flex-1 border-white/20 bg-white/10 text-white"
            onClick={() => setManualOpen(true)}
          >
            Manual Entry
          </button>
        </div>

        <div className="mx-auto mt-3 flex max-w-3xl justify-center gap-4 text-xs text-white/70">
          <button
            type="button"
            className="underline-offset-2 hover:underline"
            onClick={toggleSound}
            aria-pressed={preferences.soundEnabled}
          >
            Sound {preferences.soundEnabled ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            className="underline-offset-2 hover:underline"
            onClick={toggleVibration}
            aria-pressed={preferences.vibrationEnabled}
          >
            Vibration {preferences.vibrationEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      <ManualEntryModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onSubmit={(barcode) => void handleManualSubmit(barcode)}
        lastBarcode={lastItem?.barcode}
        lastQuantity={lastItem?.quantity}
        onIncrement={() => void handleManualIncrement()}
        onDecrement={() => void handleManualDecrement()}
      />

      <ConfirmDialog
        open={leaveOpen}
        title="You have an active stock count."
        message="Leave without finishing?"
        confirmLabel="Leave"
        cancelLabel="Continue Counting"
        danger
        onCancel={() => setLeaveOpen(false)}
        onConfirm={() => navigate('/')}
      />
    </div>
  )
}
