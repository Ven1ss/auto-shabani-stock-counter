import {
  getBarcodeEngines,
  type BarcodeEngines,
  type CodeBox,
  type DetectedCode,
} from './detectorEngine'

export type ScannerErrorCode =
  | 'permission-denied'
  | 'no-camera'
  | 'unavailable'
  | 'unsupported'
  | 'unknown'

const SCAN_COOLDOWN_MS = 700
const DETECT_INTERVAL_MS = 30
/**
 * The decoder sees a little beyond the box so the white quiet zone at each end of a barcode
 * that fills the box is kept; results are then filtered to the box itself.
 */
const DECODE_MARGIN_X = 0.08
const DECODE_MARGIN_Y = 0.25
/** How far a barcode's ends may poke past the left/right edge of the box. */
const EDGE_TOLERANCE_X = 0.06
const DETAIL_TARGET_WIDTH = 960
const COARSE_TARGET_WIDTH = 480
const ZOOM_LEVELS = [1, 2]
/** Formats without a check digit must be read twice in a row before they count. */
const CONFIRM_WINDOW_MS = 800
const CHECKSUMMED_FORMATS = new Set(['ean_13', 'ean_8', 'upc_a', 'upc_e'])

/** Sharpening strength; the blur radius scales with image width so it tracks bar size. */
const SHARPEN_AMOUNT = 3
const SHARPEN_RADIUS_DIVISOR = 96

interface ScanPass {
  engine: 'primary' | 'backup'
  detail: 'fine' | 'coarse'
  /** Horizontal sharpening recovers out-of-focus barcodes the decoder otherwise misses. */
  sharpen: boolean
}

const WASM_CYCLE: ScanPass[] = [
  { engine: 'primary', detail: 'fine', sharpen: false },
  { engine: 'primary', detail: 'fine', sharpen: true },
  { engine: 'primary', detail: 'fine', sharpen: false },
  { engine: 'primary', detail: 'fine', sharpen: true },
  { engine: 'primary', detail: 'coarse', sharpen: false },
]

const NATIVE_CYCLE: ScanPass[] = [
  { engine: 'primary', detail: 'fine', sharpen: false },
  { engine: 'backup', detail: 'fine', sharpen: true },
  { engine: 'primary', detail: 'fine', sharpen: true },
  { engine: 'primary', detail: 'fine', sharpen: false },
  { engine: 'backup', detail: 'fine', sharpen: false },
  { engine: 'primary', detail: 'fine', sharpen: true },
]

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
  getZoomSupported: () => boolean
  /** Steps through the zoom levels and returns the new level. */
  cycleZoom: () => Promise<number>
}

type Rect = CodeBox

interface FrameRegion {
  /** Area of the video that is decoded: the box plus a small margin. */
  crop: Rect
  /** The on-screen box itself, in video pixels. */
  frame: Rect
}

/**
 * Converts the on-screen scan box into video pixel coordinates.
 * The video is rendered with `object-fit: cover`, so part of the frame is cropped off-screen.
 */
function mapFrameToVideo(video: HTMLVideoElement, frameEl: Element | null): FrameRegion | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return null

  const viewRect = video.getBoundingClientRect()
  if (!frameEl || viewRect.width === 0 || viewRect.height === 0) return null

  const frameRect = frameEl.getBoundingClientRect()
  const scale = Math.max(viewRect.width / vw, viewRect.height / vh)
  const offsetX = (viewRect.width - vw * scale) / 2
  const offsetY = (viewRect.height - vh * scale) / 2
  const toVideoX = (px: number) => (px - viewRect.left - offsetX) / scale
  const toVideoY = (px: number) => (px - viewRect.top - offsetY) / scale

  const frame: Rect = {
    x: toVideoX(frameRect.left),
    y: toVideoY(frameRect.top),
    width: frameRect.width / scale,
    height: frameRect.height / scale,
  }

  const padX = frame.width * DECODE_MARGIN_X
  const padY = frame.height * DECODE_MARGIN_Y
  const x = Math.max(0, Math.floor(frame.x - padX))
  const y = Math.max(0, Math.floor(frame.y - padY))
  const width = Math.min(vw, Math.ceil(frame.x + frame.width + padX)) - x
  const height = Math.min(vh, Math.ceil(frame.y + frame.height + padY)) - y
  if (width < 16 || height < 16) return null
  return { crop: { x, y, width, height }, frame }
}

/** True when the barcode's centre is in the box and its ends do not stick far out of it. */
function isInsideFrame(box: CodeBox | null, frame: Rect): boolean {
  if (!box) return true
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  if (centerX < frame.x || centerX > frame.x + frame.width) return false
  if (centerY < frame.y || centerY > frame.y + frame.height) return false
  const tolerance = frame.width * EDGE_TOLERANCE_X
  return box.x >= frame.x - tolerance && box.x + box.width <= frame.x + frame.width + tolerance
}

function distanceFromCenter(box: CodeBox | null, frame: Rect): number {
  if (!box) return 0
  const dx = box.x + box.width / 2 - (frame.x + frame.width / 2)
  const dy = box.y + box.height / 2 - (frame.y + frame.height / 2)
  return dx * dx + dy * dy
}

/**
 * Grayscale unsharp mask along each row (bars are vertical, so only horizontal edges matter).
 * Uses a running box average, so cost stays linear in pixel count.
 */
function sharpenHorizontal(image: ImageData): ImageData {
  const { width, height, data } = image
  const radius = Math.max(2, Math.round(width / SHARPEN_RADIUS_DIVISOR))
  const windowSize = radius * 2 + 1
  const lum = new Float32Array(width)
  const at = (x: number) => lum[x < 0 ? 0 : x >= width ? width - 1 : x]

  for (let y = 0; y < height; y++) {
    const row = y * width * 4
    for (let x = 0; x < width; x++) {
      const i = row + x * 4
      lum[x] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) / 256
    }
    let sum = 0
    for (let k = -radius; k <= radius; k++) sum += at(k)
    for (let x = 0; x < width; x++) {
      const value = lum[x] + SHARPEN_AMOUNT * (lum[x] - sum / windowSize)
      const clamped = value < 0 ? 0 : value > 255 ? 255 : value
      const i = row + x * 4
      data[i] = clamped
      data[i + 1] = clamped
      data[i + 2] = clamped
      sum += at(x + radius + 1) - at(x - radius)
    }
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
  let engines: BarcodeEngines | null = null
  let passCycle: ScanPass[] = WASM_CYCLE
  let zoomLevel = 1
  let zoomMax = 1
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

  function detectZoomRange() {
    zoomLevel = 1
    zoomMax = 1
    try {
      const track = getVideoTrack()
      if (!track) return
      const caps = track.getCapabilities?.() as
        | (MediaTrackCapabilities & { zoom?: { min: number; max: number } })
        | undefined
      if (!caps?.zoom || caps.zoom.min > 1) return
      zoomMax = caps.zoom.max
      const current = (track.getSettings() as MediaTrackSettings & { zoom?: number }).zoom
      if (typeof current === 'number') zoomLevel = current
    } catch {
      zoomMax = 1
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

  /** Draws the box region of the current video frame; returns the image and the box within it. */
  function drawPass(pass: ScanPass): { image: ImageData; frame: Rect } | null {
    if (!videoEl || !canvas || !ctx) return null
    const region = mapFrameToVideo(videoEl, document.querySelector(frameSelector))
    if (!region) return null
    const { crop, frame } = region

    const target = pass.detail === 'fine' ? DETAIL_TARGET_WIDTH : COARSE_TARGET_WIDTH
    const scale = Math.max(0.25, Math.min(2, target / crop.width))
    const width = Math.max(1, Math.round(crop.width * scale))
    const height = Math.max(1, Math.round(crop.height * scale))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = scale < 1 ? 'high' : 'low'
    ctx.drawImage(videoEl, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height)

    const image = ctx.getImageData(0, 0, width, height)
    return {
      image: pass.sharpen ? sharpenHorizontal(image) : image,
      frame: {
        x: (frame.x - crop.x) * scale,
        y: (frame.y - crop.y) * scale,
        width: frame.width * scale,
        height: frame.height * scale,
      },
    }
  }

  async function tick() {
    if (!running) return
    rafId = requestAnimationFrame(() => {
      void tick()
    })

    const now = performance.now()
    if (detecting || now - lastDetectAt < DETECT_INTERVAL_MS) return
    if (!videoEl || !engines || videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return

    detecting = true
    lastDetectAt = now
    const pass = passCycle[passIndex % passCycle.length]
    passIndex += 1
    const engine =
      pass.engine === 'backup' ? (engines.getBackup() ?? engines.primary) : engines.primary
    try {
      const drawn = drawPass(pass)
      if (!drawn) return
      const results = await engine.detect(drawn.image)
      const best = results
        .filter((r) => r.rawValue && isInsideFrame(r.box, drawn.frame))
        .sort((a, b) => distanceFromCenter(a.box, drawn.frame) - distanceFromCenter(b.box, drawn.frame))[0]
      if (best && running) emit(best)
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
    detectZoomRange()
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
      const enginesPromise = getBarcodeEngines()

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

      engines = await enginesPromise
      passCycle = engines.primary.kind === 'native' ? NATIVE_CYCLE : WASM_CYCLE
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

    async cycleZoom() {
      const track = getVideoTrack()
      if (!track || zoomMax < 1.5) return zoomLevel
      const levels = ZOOM_LEVELS.filter((level) => level <= zoomMax)
      const currentIndex = levels.findIndex((level) => Math.abs(level - zoomLevel) < 0.25)
      const next = levels[(currentIndex + 1) % levels.length]
      try {
        await track.applyConstraints({
          advanced: [{ zoom: next } as MediaTrackConstraintSet],
        })
        zoomLevel = next
      } catch (error) {
        console.error('Zoom change failed:', error)
        zoomMax = 1
      }
      return zoomLevel
    },

    getTorchSupported: () => torchSupported,
    getCameraCount: () => cameras.length,
    isRunning: () => running,
    getZoomSupported: () => zoomMax >= 1.5,
  }
}
