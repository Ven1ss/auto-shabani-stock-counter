import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
  type CameraDevice,
  type Html5QrcodeCameraScanConfig,
} from 'html5-qrcode'

export type ScannerErrorCode =
  | 'permission-denied'
  | 'no-camera'
  | 'unavailable'
  | 'unsupported'
  | 'unknown'

const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.ITF,
]

const SCAN_COOLDOWN_MS = 900

export function classifyScannerError(error: unknown): ScannerErrorCode {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()

  if (
    lower.includes('permission') ||
    lower.includes('notallowed') ||
    lower.includes('denied') ||
    lower.includes('not allowed')
  ) {
    return 'permission-denied'
  }
  if (
    lower.includes('notfound') ||
    lower.includes('no camera') ||
    lower.includes('requested device not found') ||
    lower.includes('devices not found')
  ) {
    return 'no-camera'
  }
  if (
    lower.includes('notsupported') ||
    lower.includes('not supported') ||
    lower.includes('secure')
  ) {
    return 'unsupported'
  }
  if (lower.includes('in use') || lower.includes('abort') || lower.includes('track')) {
    return 'unavailable'
  }
  return 'unknown'
}

export function scannerErrorMessage(code: ScannerErrorCode): string {
  switch (code) {
    case 'permission-denied':
      return 'Camera access is required to scan barcodes. Enable camera permission in your browser settings, then try again.'
    case 'no-camera':
      return 'No camera was detected on this device.'
    case 'unsupported':
      return 'This browser does not support camera barcode scanning. Try Chrome or Safari on a mobile device.'
    case 'unavailable':
      return 'Camera is unavailable. Close other apps using the camera and try again.'
    default:
      return 'Could not start the camera. Please try again.'
  }
}

export class BarcodeScanCooldown {
  private lastBarcode = ''
  private lastAt = 0

  shouldAccept(barcode: string, now = Date.now()): boolean {
    if (barcode === this.lastBarcode && now - this.lastAt < SCAN_COOLDOWN_MS) {
      return false
    }
    this.lastBarcode = barcode
    this.lastAt = now
    return true
  }

  reset(): void {
    this.lastBarcode = ''
    this.lastAt = 0
  }
}

export interface ScannerController {
  start: (onScan: (barcode: string) => void) => Promise<void>
  stop: () => Promise<void>
  toggleTorch: () => Promise<boolean>
  switchCamera: () => Promise<void>
  getTorchSupported: () => boolean
  getCameraCount: () => number
  isRunning: () => boolean
}

export function createScannerController(elementId: string): ScannerController {
  let scanner: Html5Qrcode | null = null
  let running = false
  let cameras: CameraDevice[] = []
  let cameraIndex = 0
  let torchOn = false
  let torchSupported = false
  let onScanHandler: ((barcode: string) => void) | null = null
  const cooldown = new BarcodeScanCooldown()

  async function detectTorchSupport(): Promise<boolean> {
    try {
      if (!scanner || !running) return false
      const track = scanner.getRunningTrackCameraCapabilities?.()
      if (track && typeof track.torchFeature === 'function') {
        const feature = track.torchFeature()
        return Boolean(feature?.isSupported?.())
      }
    } catch {
      // fall through
    }

    try {
      const video = document.querySelector(
        `#${elementId} video`,
      ) as HTMLVideoElement | null
      const mediaStream = video?.srcObject as MediaStream | null
      const track = mediaStream?.getVideoTracks?.()[0]
      const caps = track?.getCapabilities?.() as MediaTrackCapabilities & {
        torch?: boolean
      }
      return Boolean(caps?.torch)
    } catch {
      return false
    }
  }

  async function applyTorch(enabled: boolean): Promise<boolean> {
    if (!scanner || !running) return false
    try {
      const trackCaps = scanner.getRunningTrackCameraCapabilities?.()
      if (trackCaps && typeof trackCaps.torchFeature === 'function') {
        const feature = trackCaps.torchFeature()
        if (feature?.isSupported?.()) {
          await feature.apply(enabled)
          torchOn = enabled
          return true
        }
      }
    } catch (error) {
      console.error('Torch via capabilities failed:', error)
    }

    try {
      const video = document.querySelector(
        `#${elementId} video`,
      ) as HTMLVideoElement | null
      const mediaStream = video?.srcObject as MediaStream | null
      const track = mediaStream?.getVideoTracks?.()[0]
      if (!track) return false
      await track.applyConstraints({
        advanced: [{ torch: enabled } as MediaTrackConstraintSet],
      })
      torchOn = enabled
      return true
    } catch (error) {
      console.error('Torch applyConstraints failed:', error)
      return false
    }
  }

  async function startCamera(cameraIdOrConfig: string | MediaTrackConstraints) {
    if (!scanner || !onScanHandler) return

    const config: Html5QrcodeCameraScanConfig = {
      fps: 12,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const width = Math.floor(Math.min(viewfinderWidth * 0.85, 360))
        const height = Math.floor(Math.min(viewfinderHeight * 0.28, 160))
        return { width, height }
      },
      aspectRatio: 1.333,
    }

    await scanner.start(
      cameraIdOrConfig,
      config,
      (decodedText) => {
        const barcode = decodedText.trim()
        if (!barcode) return
        if (!cooldown.shouldAccept(barcode)) return
        onScanHandler?.(barcode)
      },
      () => {
        // ignore frame-level "not found" noise
      },
    )
    running = true
    torchSupported = await detectTorchSupport()
  }

  return {
    async start(onScan) {
      onScanHandler = onScan
      cooldown.reset()

      if (!scanner) {
        scanner = new Html5Qrcode(elementId, {
          verbose: false,
          formatsToSupport: BARCODE_FORMATS,
        })
      }

      if (running) return

      try {
        cameras = await Html5Qrcode.getCameras()
      } catch (error) {
        console.error('getCameras failed:', error)
        cameras = []
      }

      try {
        if (cameras.length > 0) {
          // Prefer rear/environment camera by label heuristics
          const rearIndex = cameras.findIndex((cam) => {
            const label = (cam.label || '').toLowerCase()
            return (
              label.includes('back') ||
              label.includes('rear') ||
              label.includes('environment') ||
              label.includes('trás') ||
              label.includes('posterior')
            )
          })
          cameraIndex = rearIndex >= 0 ? rearIndex : cameras.length > 1 ? cameras.length - 1 : 0
          await startCamera(cameras[cameraIndex].id)
        } else {
          await startCamera({ facingMode: 'environment' })
        }
      } catch (firstError) {
        console.error('Primary camera start failed:', firstError)
        // Fallback: try facingMode or first available camera
        try {
          if (running && scanner) {
            await scanner.stop()
            running = false
          }
          await startCamera({ facingMode: 'environment' })
        } catch (secondError) {
          console.error('Fallback camera start failed:', secondError)
          throw secondError
        }
      }
    },

    async stop() {
      torchOn = false
      torchSupported = false
      if (!scanner) return
      try {
        if (running) {
          await scanner.stop()
        }
      } catch (error) {
        console.error('Scanner stop failed:', error)
      } finally {
        running = false
        try {
          scanner.clear()
        } catch {
          // ignore
        }
      }
    },

    async toggleTorch() {
      if (!torchSupported) return false
      const next = !torchOn
      const ok = await applyTorch(next)
      if (!ok) torchSupported = false
      return torchOn
    },

    async switchCamera() {
      if (!scanner || cameras.length < 2 || !onScanHandler) return
      try {
        if (running) {
          await scanner.stop()
          running = false
        }
        cameraIndex = (cameraIndex + 1) % cameras.length
        torchOn = false
        await startCamera(cameras[cameraIndex].id)
      } catch (error) {
        console.error('Camera switch failed:', error)
        throw error
      }
    },

    getTorchSupported: () => torchSupported,
    getCameraCount: () => cameras.length,
    isRunning: () => running,
  }
}
