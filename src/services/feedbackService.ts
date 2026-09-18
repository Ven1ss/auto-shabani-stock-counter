import type { AppPreferences } from '../types'

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new Ctx()
    }
    return audioCtx
  } catch (error) {
    console.error('AudioContext unavailable:', error)
    return null
  }
}

/** Short, subtle success beep via Web Audio (no external file). */
export async function playScanBeep(): Promise<void> {
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    const now = ctx.currentTime
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, now)
    oscillator.frequency.exponentialRampToValueAtTime(1175, now + 0.06)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1)

    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.12)
  } catch (error) {
    console.error('Scan beep failed:', error)
  }
}

export function vibrateScan(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(40)
    }
  } catch (error) {
    console.error('Vibration failed:', error)
  }
}

export async function provideScanFeedback(prefs: AppPreferences): Promise<void> {
  const tasks: Promise<void>[] = []
  if (prefs.soundEnabled) {
    tasks.push(playScanBeep())
  }
  if (prefs.vibrationEnabled) {
    vibrateScan()
  }
  await Promise.all(tasks)
}
