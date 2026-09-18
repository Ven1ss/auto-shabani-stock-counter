export type StockCountStatus = 'active' | 'completed'

export interface StockCountItem {
  barcode: string
  quantity: number
  firstScannedAt: string
  lastScannedAt: string
}

/**
 * Future LogMicro / product DB fields (not used in V1).
 * Kept here so the domain model can expand without rewriting core flows.
 */
export interface ProductLookupResult {
  barcode: string
  productCode?: string
  name?: string
  brand?: string
  currentStock?: number
  countedStock?: number
  difference?: number
  purchasePrice?: number
  sellingPrice?: number
  image?: string
}

export interface StockCount {
  id: string
  createdAt: string
  completedAt: string | null
  status: StockCountStatus
  items: StockCountItem[]
}

export interface CountStatistics {
  uniqueProducts: number
  totalUnits: number
}

export type SortOption =
  | 'barcode-asc'
  | 'quantity-desc'
  | 'quantity-asc'
  | 'recent'

export interface AppPreferences {
  soundEnabled: boolean
  vibrationEnabled: boolean
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  soundEnabled: true,
  vibrationEnabled: true,
}
