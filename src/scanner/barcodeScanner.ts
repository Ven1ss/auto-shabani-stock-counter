import { getBarcodeEngine, type BarcodeEngine, type DetectedCode } from './detectorEngine'

export type ScannerErrorCode =
  | 'permission-denied'
  | 'no-camera'
  | 'unavailable'
  | 'unsupported'
  | 'unknown'

const SCAN_COOLDOWN_MS = 700
const DETECT_INTERVAL_MS = 40
/** Extra margin around the on-screen box, so slightly off-centre barcodes still read. */
const ROI_PADDING_RATIO = 0.12
const ROI_TARGET_WIDTH = 960
const FULL_FRAME_MAX_WIDTH = 1280
/** Formats without a check digit must be read twice in a row before they count. */
const CONFIRM_WINDOW_MS = 800
const CHECKSUMMED_FORMATS = new Set(['ean_13', 'ean_8', 'upc_a', 'upc_e'])

type ScanPass = 'roi' | 'roi-contrast' | 'full'
const PASS_CYCLE: ScanPass[] = ['roi', 'roi-contrast', 'roi', 'full']

export function classifyScannerError(error: unknown): ScannerErrorCode {
  const name = error instanceof Error ? error.name : ''
  const message = error instanceof Error ? error.message : String(error)
  const lower = `${name} ${message}`.toLowerCase()

  if (
    lower.includes('notallowed') ||
    lower.includes('permission') ||
    lower.includes('denied') ||
    lower.includes('not allowed') ||
    lower.includes('security')
  ) {
    return 'permission-denied'
  }
  if (
    lower.includes('notfound') ||
    lower.includes('no camera') ||
    lower.includes('requested device not found') ||
    lower.includes('devices not found') ||
    lower.includes('overconstrained')
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
  if (
    lower.includes('notreadable') ||
    lower.includes('in use') ||
    lower.includes('abort') ||
    lower.includes('track')
  ) {
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

/** Accepts checksummed retail codes at once; others need two matching reads. */
export class ReadGuard {
  private candidate = ''
  private candidateAt = 0

  accept(code: DetectedCode, now = Date.now()): boolean {
    if (CHECKSUMMED_FORMATS.has(code.format)) return true
    if (code.rawValue === this.candidate && now - this.candidateAt <= CONFIRM_WINDOW_MS) {
      this.reset()
      return true
    }
    this.candidate = code.rawValue
    this.candidateAt = now
    return false
  }

  reset(): void {
    this.candidate = ''
    this.candidateAt = 0
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

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Converts the on-screen scan box into video pixel coordinates.
 * The video is rendered with `object-fit: cover`, so part of the frame is cropped off-screen.
 */
function mapFrameToVideo(
  video: HTMLVideoElement,
  frameEl: Element | null,
): Rect | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return null

  const viewRect = video.getBoundingClientRect()
  if (!frameEl || viewRect.width === 0 || viewRect.height === 0) {
    const width = vw * 0.9
    const height = vh * 0.4
    return { x: (vw - width) / 2, y: (vh - height) / 2, width, height }
  }

  const frameRect = frameEl.getBoundingClientRect()
  const scale = Math.max(viewRect.width / vw, viewRect.height / vh)
  const offsetX = (viewRect.width - vw * scale) / 2
  const offsetY = (viewRect.height - vh * scale) / 2

  const padX = frameRect.width * ROI_PADDING_RATIO
  const padY = frameRect.height * ROI_PADDING_RATIO
  const left = (frameRect.left - padX - viewRect.left - offsetX) / scale
  const top = (frameRect.top - padY - viewRect.top - offsetY) / scale
  const right = (frameRect.right + padX - viewRect.left - offsetX) / scale
  const bottom = (frameRect.bottom + padY - viewRect.top - offsetY) / scale

  const x = Math.max(0, Math.floor(left))
  const y = Math.max(0, Math.floor(top))
  const width = Math.min(vw, Math.ceil(right)) - x
  const height = Math.min(vh, Math.ceil(bottom)) - y
  if (width < 16 || height < 16) return null
  return { x, y, width, height }
}

/** Stretches luminance to the full 0-255 range: helps faded, glossy or low-light labels. */
function stretchContrast(image: ImageData): ImageData {
  const data = image.data
  let min = 255
  let max = 0
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8
    if (lum < min) min = lum
    if (lum > max) max = lum
  }
  const range = max - min
  if (range < 24) return image
  const factor = 255 / range
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8
    const value = Math.max(0, Math.min(255, (lum - min) * factor))
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
  }
  return image
}

function clearContainer(elementId: string) {
  const el = document.getElementById(elementId)
  if (el) el.innerHTML = ''
}

function isUltraWideOrTele(label: string): boolean {
  const lower = label.toLowerCase()
  return lower.includes('ultra') || lower.includes('tele')
}

interface ScannerOptions {
  /** Element whose on-screen box defines the area to decode. */
  frameSelector?: string
}

export function createScannerController(
  elementId: string,
  options: ScannerOptions = {},
): ScannerController {
  const frameSelector = options.frameSelector ?? '.scan-frame'

  let running = false
  let cameras: MediaDeviceInfo[] = []
  let activeDeviceId: string | null = null
  let torchOn = false
  let torchSupported = false
  let onScanHandler: ((barcode: string) => void) | null = null
  const cooldown = new BarcodeScanCooldown()
  const guard = new ReadGuard()

  let stream: MediaStream | null = null
  let videoEl: HTMLVideoElement | null = null
  let engine: BarcodeEngine | null = null
  let canvas: HTMLCanvasElement | null = null
  let ctx: CanvasRenderingContext2D | null = null
  let rafId = 0
  let detecting = false
  let lastDetectAt = 0
  let passIndex = 0
  /** Bumped on stop so an in-flight start() knows to release the camera. */
  let generation = 0

  function getVideoTrack(): MediaStreamTrack | null {
    return stream?.getVideoTracks()[0] ?? null
  }

  function emit(code: DetectedCode) {
    const barcode = code.rawValue.trim()
    if (!barcode) return
    if (!guard.accept({ ...code, rawValue: barcode })) return
    if (!cooldown.shouldAccept(barcode)) return
    onScanHandler?.(barcode)
  }

  async function improveFocus(track: MediaStreamTrack) {
    try {
      const caps = track.getCapabilities?.() as
        | (MediaTrackCapabilities & { focusMode?: string[] })
        | undefined
      if (caps?.focusMode?.includes('continuous')) {
        await track.applyConstraints({
          advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
        })
      }
    } catch (error) {
      console.debug('Continuous focus not applied:', error)
    }
  }

  function detectTorchSupport(): boolean {
    try {
      const caps = getVideoTrack()?.getCapabilities?.() as
        | (MediaTrackCapabilities & { torch?: boolean })
        | undefined
      return Boolean(caps?.torch)
    } catch {
      return false
    }
  }

  async function refreshCameraList() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      cameras = devices.filter((d) => d.kind === 'videoinput')
    } catch (error) {
      console.error('enumerateDevices failed:', error)
      cameras = []
    }
  }

  function drawPass(pass: ScanPass): HTMLCanvasElement | ImageData | null {
    if (!videoEl || !canvas || !ctx) return null
    const vw = videoEl.videoWidth
    const vh = videoEl.videoHeight
    if (!vw || !vh) return null

    let source: Rect
    let targetWidth: number
    if (pass === 'full') {
      source = { x: 0, y: 0, width: vw, height: vh }
      targetWidth = Math.min(vw, FULL_FRAME_MAX_WIDTH)
    } else {
      const roi = mapFrameToVideo(videoEl, document.querySelector(frameSelector))
      if (!roi) return null
      source = roi
      const scale = Math.max(0.5, Math.min(2, ROI_TARGET_WIDTH / roi.width))
      targetWidth = Math.round(roi.width * scale)
    }

    const targetHeight = Math.max(1, Math.round((source.height * targetWidth) / source.width))
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth
      canvas.height = targetHeight
    }
    ctx.drawImage(
      videoEl,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      targetWidth,
      targetHeight,
    )

    if (pass === 'roi-contrast') {
      return stretchContrast(ctx.getImageData(0, 0, targetWidth, targetHeight))
    }
    return canvas
  }

  async function tick() {
    if (!running) return
    rafId = requestAnimationFrame(() => {
      void tick()
    })

    const now = performance.now()
    if (detecting || now - lastDetectAt < DETECT_INTERVAL_MS) return
    if (!videoEl || !engine || videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return

    detecting = true
    lastDetectAt = now
    const pass = PASS_CYCLE[passIndex % PASS_CYCLE.length]
    passIndex += 1
    try {
      const input = drawPass(pass)
      if (!input) return
      const results = await engine.detect(input)
      const first = results.find((r) => r.rawValue)
      if (first && running) emit(first)
    } catch (error) {
      console.debug('Barcode detect frame skipped:', error)
    } finally {
      detecting = false
    }
  }

  async function openCamera(deviceId: string | null) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('NotSupportedError: camera API unavailable')
    }

    clearContainer(elementId)
    const container = document.getElementById(elementId)
    if (!container) throw new Error('Scanner container not found')

    const video = document.createElement('video')
    video.setAttribute('playsinline', 'true')
    video.setAttribute('autoplay', 'true')
    video.muted = true
    video.style.width = '100%'
    video.style.height = '100%'
    video.style.objectFit = 'cover'
    container.appendChild(video)
    videoEl = video

    const base: MediaTrackConstraints = {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    }
    const constraints: MediaTrackConstraints = deviceId
      ? { ...base, deviceId: { exact: deviceId } }
      : { ...base, facingMode: { ideal: 'environment' } }

    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: constraints })
    video.srcObject = stream
    await video.play()

    const track = getVideoTrack()
    if (track) {
      activeDeviceId = track.getSettings().deviceId ?? deviceId
      await improveFocus(track)
    }
    torchSupported = detectTorchSupport()
    torchOn = false
  }

  function closeCamera() {
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
  }

  function startLoop() {
    running = true
    passIndex = 0
    rafId = requestAnimationFrame(() => {
      void tick()
    })
  }

  return {
    async start(onScan) {
      onScanHandler = onScan
      cooldown.reset()
      guard.reset()
      if (running) return
      const myGeneration = generation
      const cancelled = () => myGeneration !== generation

      // Load the decoder in parallel with the camera permission prompt.
      const enginePromise = getBarcodeEngine()

      canvas = document.createElement('canvas')
      ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false })
      if (!ctx) throw new Error('NotSupportedError: canvas unavailable')

      await openCamera(null)
      if (cancelled()) return closeCamera()
      await refreshCameraList()

      // Some phones expose ultra-wide as the default; it cannot focus up close.
      const activeLabel = cameras.find((c) => c.deviceId === activeDeviceId)?.label ?? ''
      if (isUltraWideOrTele(activeLabel)) {
        const main = cameras.find(
          (c) => /back|rear|environment/i.test(c.label) && !isUltraWideOrTele(c.label),
        )
        if (main) {
          closeCamera()
          await openCamera(main.deviceId)
          if (cancelled()) return closeCamera()
        }
      }

      engine = await enginePromise
      if (cancelled()) return closeCamera()
      startLoop()
    },

    async stop() {
      generation += 1
      running = false
      torchOn = false
      torchSupported = false
      closeCamera()
      clearContainer(elementId)
    },

    async toggleTorch() {
      const track = getVideoTrack()
      if (!torchSupported || !track) return false
      const next = !torchOn
      try {
        await track.applyConstraints({
          advanced: [{ torch: next } as MediaTrackConstraintSet],
        })
        torchOn = next
      } catch (error) {
        console.error('Torch toggle failed:', error)
        torchSupported = false
      }
      return torchOn
    },

    async switchCamera() {
      if (cameras.length < 2 || !onScanHandler) return
      const currentIndex = cameras.findIndex((c) => c.deviceId === activeDeviceId)
      const next = cameras[(currentIndex + 1) % cameras.length]
      running = false
      closeCamera()
      guard.reset()
      await openCamera(next.deviceId)
      startLoop()
    },

    getTorchSupported: () => torchSupported,
    getCameraCount: () => cameras.length,
    isRunning: () => running,
  }
}
