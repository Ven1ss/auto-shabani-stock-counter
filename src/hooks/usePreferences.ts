import { useCallback, useEffect, useState } from 'react'
import type { AppPreferences } from '../types'
import { DEFAULT_PREFERENCES } from '../types'
import {
  loadPreferences,
  updatePreferences,
} from '../services/stockCountService'

export function usePreferences() {
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadPreferences()
      .then((prefs) => {
        if (!cancelled) {
          setPreferences(prefs)
          setReady(true)
        }
      })
      .catch((error) => {
        console.error('Failed to load preferences:', error)
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const save = useCallback(async (next: AppPreferences) => {
    setPreferences(next)
    try {
      await updatePreferences(next)
    } catch (error) {
      console.error('Failed to save preferences:', error)
    }
  }, [])

  const toggleSound = useCallback(() => {
    void save({ ...preferences, soundEnabled: !preferences.soundEnabled })
  }, [preferences, save])

  const toggleVibration = useCallback(() => {
    void save({ ...preferences, vibrationEnabled: !preferences.vibrationEnabled })
  }, [preferences, save])

  return { preferences, ready, toggleSound, toggleVibration }
}
