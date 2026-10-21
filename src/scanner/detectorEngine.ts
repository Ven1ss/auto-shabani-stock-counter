import {
  BarcodeDetector as PolyfillBarcodeDetector,
  prepareZXingModule,
  type BarcodeFormat,
} from 'barcode-detector/ponyfill'
import zxingReaderWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

export const SCAN_FORMATS: BarcodeFormat[] = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'itf',
]

export interface DetectedCode {
  rawValue: string
  format: string
}

export interface BarcodeEngine {
  kind: 'native' | 'wasm'
  detect: (source: CanvasImageSource | ImageData) => Promise<DetectedCode[]>
}

interface NativeDetector {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string; format: string }>>
}

interface NativeDetectorConstructor {
  new (options?: { formats?: string[] }): NativeDetector
  getSupportedFormats?: () => Promise<string[]>
}

let wasmPrepared = false

function prepareWasm() {
  if (wasmPrepared) return
  wasmPrepared = true
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith('.wasm') ? zxingReaderWasmUrl : prefix + path,
    },
  })
}

async function createNativeEngine(): Promise<BarcodeEngine | null> {
  const Native = (window as unknown as { BarcodeDetector?: NativeDetectorConstructor })
    .BarcodeDetector
  if (!Native) return null

  try {
    const supported = (await Native.getSupportedFormats?.()) ?? []
    const formats = SCAN_FORMATS.filter((f) => supported.includes(f))
    // Native engines missing the core retail formats are not worth using.
    if (!formats.includes('ean_13') || !formats.includes('code_128')) return null
    const detector = new Native({ formats })
    return {
      kind: 'native',
      detect: (source) => detector.detect(source as ImageBitmapSource),
    }
  } catch (error) {
    console.warn('Native BarcodeDetector unavailable:', error)
    return null
  }
}

function createWasmEngine(): BarcodeEngine {
  prepareWasm()
  const detector = new PolyfillBarcodeDetector({ formats: SCAN_FORMATS })
  return {
    kind: 'wasm',
    detect: (source) => detector.detect(source as HTMLCanvasElement),
  }
}

let enginePromise: Promise<BarcodeEngine> | null = null

/** Native detector on Chrome/Android, ZXing WebAssembly on iPhone and everything else. */
export function getBarcodeEngine(): Promise<BarcodeEngine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const forceWasm = new URLSearchParams(window.location.search).has('wasm-scanner')
      const native = forceWasm ? null : await createNativeEngine()
      return native ?? createWasmEngine()
    })()
  }
  return enginePromise
}
