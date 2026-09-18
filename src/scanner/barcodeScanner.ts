import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
  type CameraDevice,
} from 'html5-qrcode'

export type ScannerErrorCode =
  | 'permission-denied'
  | 'no-camera'
  | 'unavailable'
  | 'unsupported'
  | 'unknown'

const SCAN_COOLDOWN_MS = 800

const NATIVE_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'itf',
] as const

const ZXING_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.ITF,
]

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>
}

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[]
}) => BarcodeDetectorLike

function getBarcodeDetector(): BarcodeDetectorConstructor | null {
  const Detector = (
    window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
  ).BarcodeDetector
  return Detector ?? null
}

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

function pickRearCameraIndex(cameras: CameraDevice[]): number {
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
  if (rearIndex >= 0) return rearIndex
  return cameras.length > 1 ? cameras.length - 1 : 0
}

function clearContainer(elementId: string) {
  const el = document.getElementById(elementId)
  if (el) el.innerHTML = ''
}

export function createScannerController(elementId: string): ScannerController {
  let mode: 'native' | 'html5' | null = null
  let running = false
  let cameras: CameraDevice[] = []
  let cameraIndex = 0
  let torchOn = false
  let torchSupported = false
  let onScanHandler: ((barcode: string) => void) | null = null
  const cooldown = new BarcodeScanCooldown()

  // Native path state
  let stream: MediaStream | null = null
  let videoEl: HTMLVideoElement | null = null
  let detector: BarcodeDetectorLike | null = null
  let rafId = 0
  let detecting = false
  let lastDetectAt = 0

  // html5-qrcode fallback state
  let html5Scanner: Html5Qrcode | null = null

  function emitBarcode(raw: string) {
    const barcode = raw.trim()
    if (!barcode) return
    if (!cooldown.shouldAccept(barcode)) return
    onScanHandler?.(barcode)
  }

  function getVideoTrack(): MediaStreamTrack | null {
    return stream?.getVideoTracks?.()[0] ?? null
  }

  async function detectTorchSupport(): Promise<boolean> {
    try {
      const track = getVideoTrack()
      if (!track?.getCapabilities) return false
      const caps = track.getCapabilities() as MediaTrackCapabilities & {
        torch?: boolean
      }
      return Boolean(caps.torch)
    } catch {
      return false
    }
  }

  async function applyTorch(enabled: boolean): Promise<boolean> {
    const track = getVideoTrack()
    if (!track) return false
    try {
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

  async function stopNative() {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    detecting = false
    if (videoEl) {
      videoEl.pause()
      videoEl.srcObject = null
      videoEl.remove()
      videoEl = null
    }
    if (stream) {
      for (const track of stream.getTracks()) track.stop()
      stream = null
    }
    detector = null
  }

  async function stopHtml5() {
    if (!html5Scanner) return
    try {
      if (html5Scanner.isScanning) {
        await html5Scanner.stop()
      }
    } catch (error) {
      console.error('html5 scanner stop failed:', error)
    }
    try {
      html5Scanner.clear()
    } catch {
      // ignore
    }
    html5Scanner = null
  }

  async function startNative(deviceId?: string) {
    const Detector = getBarcodeDetector()
    if (!Detector) throw new Error('BarcodeDetector not supported')

    clearContainer(elementId)
    const container = document.getElementById(elementId)
    if (!container) throw new Error('Scanner container not found')

    videoEl = document.createElement('video')
    videoEl.setAttribute('playsinline', 'true')
    videoEl.setAttribute('muted', 'true')
    videoEl.setAttribute('autoplay', 'true')
    videoEl.style.width = '100%'
    videoEl.style.height = '100%'
    videoEl.style.objectFit = 'cover'
    container.appendChild(videoEl)

    const videoConstraints = (
      deviceId
        ? {
            deviceId: { exact: deviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: { ideal: 'environment' },
          }
        : {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          }
    ) as MediaTrackConstraints

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: videoConstraints,
    }

    stream = await navigator.mediaDevices.getUserMedia(constraints)
    videoEl.srcObject = stream
    await videoEl.play()

    try {
      detector = new Detector({ formats: [...NATIVE_FORMATS] })
    } catch {
      detector = new Detector()
    }

    mode = 'native'
    running = true
    torchSupported = await detectTorchSupport()

    const DETECT_INTERVAL_MS = 45

    const tick = async () => {
      if (!running || mode !== 'native' || !videoEl || !detector) return
      rafId = requestAnimationFrame(() => {
        void tick()
      })

      const now = performance.now()
      if (detecting || now - lastDetectAt < DETECT_INTERVAL_MS) return
      if (videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return

      detecting = true
      lastDetectAt = now
      try {
        const results = await detector.detect(videoEl)
        if (results.length > 0) {
          const value = results[0]?.rawValue
          if (value) emitBarcode(value)
        }
      } catch (error) {
        // Transient detect errors are common while focusing; keep scanning.
        console.debug('Barcode detect frame skipped:', error)
      } finally {
        detecting = false
      }
    }

    rafId = requestAnimationFrame(() => {
      void tick()
    })
  }

  async function startHtml5(cameraIdOrConfig: string | MediaTrackConstraints) {
    clearContainer(elementId)

    if (!html5Scanner) {
      html5Scanner = new Html5Qrcode(elementId, {
        verbose: false,
        formatsToSupport: ZXING_FORMATS,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
      })
    }

    await html5Scanner.start(
      cameraIdOrConfig,
      {
        fps: 30,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          // Wide scan band works much better for 1D product barcodes.
          const width = Math.floor(Math.min(viewfinderWidth * 0.92, 520))
          const height = Math.floor(Math.min(viewfinderHeight * 0.42, 240))
          return { width, height }
        },
        disableFlip: true,
        videoConstraints:
          typeof cameraIdOrConfig === 'string'
            ? {
                deviceId: { exact: cameraIdOrConfig },
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              }
            : {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
      } as Parameters<Html5Qrcode['start']>[1],
      (decodedText) => emitBarcode(decodedText),
      () => {
        // ignore not-found frames
      },
    )

    mode = 'html5'
    running = true

    // Torch support via media track if present
    try {
      const video = document.querySelector(
        `#${elementId} video`,
      ) as HTMLVideoElement | null
      stream = (video?.srcObject as MediaStream | null) ?? null
      torchSupported = await detectTorchSupport()
    } catch {
      torchSupported = false
    }
  }

  return {
    async start(onScan) {
      onScanHandler = onScan
      cooldown.reset()
      if (running) return

      try {
        cameras = await Html5Qrcode.getCameras()
      } catch (error) {
        console.error('getCameras failed:', error)
        cameras = []
      }

      cameraIndex = cameras.length > 0 ? pickRearCameraIndex(cameras) : 0
      const preferredId = cameras[cameraIndex]?.id

      // Prefer native BarcodeDetector — dramatically faster on Chrome/Android.
      if (getBarcodeDetector()) {
        try {
          await startNative(preferredId)
          return
        } catch (nativeError) {
          console.error('Native scanner failed, falling back:', nativeError)
          await stopNative()
          running = false
          mode = null
        }
      }

      try {
        if (preferredId) {
          await startHtml5(preferredId)
        } else {
          await startHtml5({ facingMode: 'environment' })
        }
      } catch (firstError) {
        console.error('Primary html5 camera start failed:', firstError)
        await stopHtml5()
        running = false
        try {
          await startHtml5({ facingMode: 'environment' })
        } catch (secondError) {
          console.error('Fallback camera start failed:', secondError)
          throw secondError
        }
      }
    },

    async stop() {
      torchOn = false
      torchSupported = false
      running = false
      try {
        if (mode === 'native') {
          await stopNative()
        } else if (mode === 'html5') {
          await stopHtml5()
          stream = null
        }
      } finally {
        mode = null
        clearContainer(elementId)
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
      if (cameras.length < 2 || !onScanHandler) return
      const nextIndex = (cameraIndex + 1) % cameras.length
      const nextId = cameras[nextIndex]?.id
      if (!nextId) return

      await this.stop()
      cameraIndex = nextIndex
      torchOn = false

      if (getBarcodeDetector()) {
        try {
          await startNative(nextId)
          return
        } catch (error) {
          console.error('Native switch failed, using html5:', error)
          await stopNative()
          running = false
        }
      }
      await startHtml5(nextId)
    },

    getTorchSupported: () => torchSupported,
    getCameraCount: () => cameras.length,
    isRunning: () => running,
  }
}
