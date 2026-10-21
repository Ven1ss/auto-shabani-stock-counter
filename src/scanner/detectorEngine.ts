import {
  prepareZXingModule,
  readBarcodes,
  type ReaderOptions,
  type ReadResult,
} from 'zxing-wasm/reader'
import zxingReaderWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

/** Formats requested from the browser's built-in detector. */
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf']

const WASM_FORMAT_NAMES: Record<string, string> = {
  EAN13: 'ean_13',
  EAN8: 'ean_8',
  UPCA: 'upc_a',
  UPCE: 'upc_e',
  Code128: 'code_128',
  Code39: 'code_39',
  Code39Std: 'code_39',
  Code39Ext: 'code_39',
  ITF: 'itf',
  ITF14: 'itf',
}

/**
 * Rotation and inverted-colour searches are off: barcodes must sit level inside the box,
 * and skipping those searches roughly halves decode time on phones.
 */
const READER_OPTIONS: ReaderOptions = {
  formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code128', 'Code39', 'ITF'],
  tryHarder: true,
  tryRotate: false,
  tryInvert: false,
  tryDownscale: true,
  maxNumberOfSymbols: 4,
  textMode: 'Plain',
}

export interface CodeBox {
  x: number
  y: number
  width: number
  height: number
}

export interface DetectedCode {
  rawValue: string
  format: string
  /** Location in the image that was passed to `detect`. */
  box: CodeBox | null
}

export interface BarcodeEngine {
  kind: 'native' | 'wasm'
  detect: (image: ImageData) => Promise<DetectedCode[]>
}

interface NativeResult {
  rawValue: string
  format: string
  boundingBox?: DOMRectReadOnly
}

interface NativeDetector {
  detect: (source: ImageBitmapSource) => Promise<NativeResult[]>
}

interface NativeDetectorConstructor {
  new (options?: { formats?: string[] }): NativeDetector
  getSupportedFormats?: () => Promise<string[]>
}

async function createNativeEngine(): Promise<BarcodeEngine | null> {
  const Native = (window as unknown as { BarcodeDetector?: NativeDetectorConstructor })
    .BarcodeDetector
  if (!Native) return null

  try {
    const supported = (await Native.getSupportedFormats?.()) ?? []
    const formats = NATIVE_FORMATS.filter((f) => supported.includes(f))
    // Native engines missing the core retail formats are not worth using.
    if (!formats.includes('ean_13') || !formats.includes('code_128')) return null
    const detector = new Native({ formats })
    return {
      kind: 'native',
      detect: async (image) => {
        const results = await detector.detect(image)
        return results.map((r) => ({
          rawValue: r.rawValue,
          format: r.format,
          box: r.boundingBox
            ? {
                x: r.boundingBox.x,
                y: r.boundingBox.y,
                width: r.boundingBox.width,
                height: r.boundingBox.height,
              }
            : null,
        }))
      },
    }
  } catch (error) {
    console.warn('Native BarcodeDetector unavailable:', error)
    return null
  }
}

function boxFromPosition(result: ReadResult): CodeBox {
  const { topLeft, topRight, bottomLeft, bottomRight } = result.position
  const xs = [topLeft.x, topRight.x, bottomLeft.x, bottomRight.x]
  const ys = [topLeft.y, topRight.y, bottomLeft.y, bottomRight.y]
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

async function createWasmEngine(): Promise<BarcodeEngine> {
  // Self-hosted wasm keeps scanning offline and nothing is fetched from a CDN.
  await prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith('.wasm') ? zxingReaderWasmUrl : prefix + path,
    },
    fireImmediately: true,
  })
  return {
    kind: 'wasm',
    detect: async (image) => {
      const results = await readBarcodes(image, READER_OPTIONS)
      return results
        .filter((r) => r.isValid && r.text)
        .map((r) => ({
          rawValue: r.text,
          format: WASM_FORMAT_NAMES[r.format] ?? r.format,
          box: boxFromPosition(r),
        }))
    },
  }
}

export interface BarcodeEngines {
  primary: BarcodeEngine
  /** ZXing as a second opinion on devices whose primary engine is native; loads in the background. */
  getBackup: () => BarcodeEngine | null
}

let enginesPromise: Promise<BarcodeEngines> | null = null

/** Native detector on Chrome/Android (with ZXing backup), ZXing WebAssembly elsewhere. */
export function getBarcodeEngines(): Promise<BarcodeEngines> {
  if (!enginesPromise) {
    enginesPromise = (async () => {
      const forceWasm = new URLSearchParams(window.location.search).has('wasm-scanner')
      const native = forceWasm ? null : await createNativeEngine()
      if (!native) {
        const wasm = await createWasmEngine()
        return { primary: wasm, getBackup: () => null }
      }

      let backup: BarcodeEngine | null = null
      createWasmEngine()
        .then((engine) => {
          backup = engine
        })
        .catch((error: unknown) => {
          console.warn('ZXing backup decoder unavailable:', error)
        })
      return { primary: native, getBackup: () => backup }
    })()
    enginesPromise.catch(() => {
      enginesPromise = null
    })
  }
  return enginesPromise
}
