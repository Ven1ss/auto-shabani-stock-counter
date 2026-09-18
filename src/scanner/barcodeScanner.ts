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

const SCAN_COOLDOWN_MS = 700

/** Keep in sync with `.scan-frame` in index.css — only this region is decoded. */
const ROI_WIDTH_RATIO = 0.9
const ROI_HEIGHT_RATIO = 0.3

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

/**
 * Crop the center scan band from the camera frame and boost contrast.
 * Ignoring surroundings outside this ROI is critical for reliable 1D reads.
 */
function prepareScanRoi(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): boolean {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return false

  const roiW = Math.max(1, Math.floor(vw * ROI_WIDTH_RATIO))
  const roiH = Math.max(1, Math.floor(vh * ROI_HEIGHT_RATIO))
  const sx = Math.floor((vw - roiW) / 2)
  const sy = Math.floor((vh - roiH) / 2)

  // Upscale thin barcode strips so detectors have enough pixels.
  const scale = Math.max(1, Math.min(2.5, 900 / roiW))
  const tw = Math.floor(roiW * scale)
  const th = Math.floor(roiH * scale)

  if (canvas.width !== tw || canvas.height !== th) {
    canvas.width = tw
    canvas.height = th
  }

  ctx.save()
  ctx.clearRect(0, 0, tw, th)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // Grayscale + contrast reduces background clutter noise.
  ctx.filter = 'grayscale(1) contrast(1.55) brightness(1.08)'
  ctx.drawImage(video, sx, sy, roiW, roiH, 0, 0, tw, th)
  ctx.restore()

  return true
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

  let stream: MediaStream | null = null
  let videoEl: HTMLVideoElement | null = null
  let detector: BarcodeDetectorLike | null = null
  let rafId = 0
  let detecting = false
  let lastDetectAt = 0
  let roiCanvas: HTMLCanvasElement | null = null
  let roiCtx: CanvasRenderingContext2D | null = null

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
    roiCanvas = null
    roiCtx = null
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
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: { ideal: 'environment' },
          }
        : {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
    ) as MediaTrackConstraints

    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: videoConstraints,
    })
    videoEl.srcObject = stream
    await videoEl.play()

    try {
      detector = new Detector({ formats: [...NATIVE_FORMATS] })
    } catch {
      detector = new Detector()
    }

    roiCanvas = document.createElement('canvas')
    roiCtx = roiCanvas.getContext('2d', {
      willReadFrequently: true,
      alpha: false,
    })
    if (!roiCtx) throw new Error('Could not create scan canvas')

    mode = 'native'
    running = true
    torchSupported = await detectTorchSupport()

    const DETECT_INTERVAL_MS = 50

    const tick = async () => {
      if (!running || mode !== 'native' || !videoEl || !detector || !roiCanvas || !roiCtx) {
        return
      }
      rafId = requestAnimationFrame(() => {
        void tick()
      })

      const now = performance.now()
      if (detecting || now - lastDetectAt < DETECT_INTERVAL_MS) return
      if (videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return

      detecting = true
      lastDetectAt = now
      try {
        if (!prepareScanRoi(videoEl, roiCanvas, roiCtx)) return

        const results = await detector.detect(roiCanvas)
        if (results.length > 0) {
          const value = results[0]?.rawValue
          if (value) {
            emitBarcode(value)
            return
          }
        }
      } catch (error) {
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
        fps: 24,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          // Match the on-screen frame so surroundings outside are ignored.
          const width = Math.floor(viewfinderWidth * ROI_WIDTH_RATIO)
          const height = Math.floor(viewfinderHeight * ROI_HEIGHT_RATIO)
          return {
            width: Math.max(220, width),
            height: Math.max(100, height),
          }
        },
        disableFlip: true,
        videoConstraints:
          typeof cameraIdOrConfig === 'string'
            ? {
                deviceId: { exact: cameraIdOrConfig },
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }
            : {
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
      } as Parameters<Html5Qrcode['start']>[1],
      (decodedText) => emitBarcode(decodedText),
      () => {
        // ignore not-found frames
      },
    )

    mode = 'html5'
    running = true

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
