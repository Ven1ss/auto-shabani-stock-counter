import type { AppPreferences, StockCount } from '../types'
import { DEFAULT_PREFERENCES } from '../types'
import { getDb } from './db'

const PREFERENCES_ID = 'app'

export async function saveStockCount(count: StockCount): Promise<void> {
  const db = await getDb()
  await db.put('stockCounts', count)
}

export async function loadStockCount(id: string): Promise<StockCount | undefined> {
  const db = await getDb()
  return db.get('stockCounts', id)
}

export async function loadStockCounts(): Promise<StockCount[]> {
  const db = await getDb()
  const counts = await db.getAllFromIndex('stockCounts', 'by-createdAt')
  return counts.reverse()
}

export async function deleteStockCount(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('stockCounts', id)
}

export async function loadPreferences(): Promise<AppPreferences> {
  const db = await getDb()
  const stored = await db.get('preferences', PREFERENCES_ID)
  if (!stored) return { ...DEFAULT_PREFERENCES }
  return {
    soundEnabled: stored.soundEnabled,
    vibrationEnabled: stored.vibrationEnabled,
  }
}

export async function savePreferences(prefs: AppPreferences): Promise<void> {
  const db = await getDb()
  await db.put('preferences', { id: PREFERENCES_ID, ...prefs })
}
