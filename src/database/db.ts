import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { AppPreferences, StockCount } from '../types'

interface StockCounterDB extends DBSchema {
  stockCounts: {
    key: string
    value: StockCount
    indexes: { 'by-createdAt': string; 'by-status': string }
  }
  preferences: {
    key: string
    value: AppPreferences & { id: string }
  }
}

const DB_NAME = 'auto-shabani-stock-counter'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<StockCounterDB>> | null = null

export function getDb(): Promise<IDBPDatabase<StockCounterDB>> {
  if (!dbPromise) {
    dbPromise = openDB<StockCounterDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('stockCounts')) {
          const store = db.createObjectStore('stockCounts', { keyPath: 'id' })
          store.createIndex('by-createdAt', 'createdAt')
          store.createIndex('by-status', 'status')
        }
        if (!db.objectStoreNames.contains('preferences')) {
          db.createObjectStore('preferences', { keyPath: 'id' })
        }
      },
    }).catch((error) => {
      dbPromise = null
      console.error('IndexedDB open failed:', error)
      throw error
    })
  }
  return dbPromise
}
