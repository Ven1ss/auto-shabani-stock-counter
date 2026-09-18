import type { CountStatistics, SortOption, StockCount, StockCountItem } from '../types'

export function normalizeBarcode(raw: string): string {
  return raw.trim()
}

export function isValidBarcode(raw: string): boolean {
  return normalizeBarcode(raw).length > 0
}

export function calculateStatistics(items: StockCountItem[]): CountStatistics {
  return {
    uniqueProducts: items.length,
    totalUnits: items.reduce((sum, item) => sum + item.quantity, 0),
  }
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `count-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function createEmptyStockCount(): StockCount {
  return {
    id: createId(),
    createdAt: new Date().toISOString(),
    completedAt: null,
    status: 'active',
    items: [],
  }
}

export function addScan(count: StockCount, barcodeInput: string): StockCount {
  const barcode = normalizeBarcode(barcodeInput)
  if (!barcode) return count

  const now = new Date().toISOString()
  const existingIndex = count.items.findIndex((item) => item.barcode === barcode)

  let items: StockCountItem[]
  if (existingIndex === -1) {
    items = [
      ...count.items,
      {
        barcode,
        quantity: 1,
        firstScannedAt: now,
        lastScannedAt: now,
      },
    ]
  } else {
    items = count.items.map((item, index) =>
      index === existingIndex
        ? {
            ...item,
            quantity: item.quantity + 1,
            lastScannedAt: now,
          }
        : item,
    )
  }

  return { ...count, items }
}

export function incrementBarcode(count: StockCount, barcodeInput: string): StockCount {
  return addScan(count, barcodeInput)
}

export function decrementBarcode(count: StockCount, barcodeInput: string): StockCount {
  const barcode = normalizeBarcode(barcodeInput)
  const items = count.items
    .map((item) => {
      if (item.barcode !== barcode) return item
      return {
        ...item,
        quantity: item.quantity - 1,
        lastScannedAt: new Date().toISOString(),
      }
    })
    .filter((item) => item.quantity > 0)

  return { ...count, items }
}

export function setBarcodeQuantity(
  count: StockCount,
  barcodeInput: string,
  quantity: number,
): StockCount {
  const barcode = normalizeBarcode(barcodeInput)
  if (quantity <= 0) {
    return deleteBarcode(count, barcode)
  }

  const now = new Date().toISOString()
  const existingIndex = count.items.findIndex((item) => item.barcode === barcode)

  if (existingIndex === -1) {
    return {
      ...count,
      items: [
        ...count.items,
        {
          barcode,
          quantity,
          firstScannedAt: now,
          lastScannedAt: now,
        },
      ],
    }
  }

  return {
    ...count,
    items: count.items.map((item, index) =>
      index === existingIndex
        ? { ...item, quantity, lastScannedAt: now }
        : item,
    ),
  }
}

export function deleteBarcode(count: StockCount, barcodeInput: string): StockCount {
  const barcode = normalizeBarcode(barcodeInput)
  return {
    ...count,
    items: count.items.filter((item) => item.barcode !== barcode),
  }
}

export function completeStockCount(count: StockCount): StockCount {
  return {
    ...count,
    status: 'completed',
    completedAt: new Date().toISOString(),
  }
}

export function reopenStockCount(count: StockCount): StockCount {
  return {
    ...count,
    status: 'active',
    completedAt: null,
  }
}

export function filterItemsBySearch(
  items: StockCountItem[],
  query: string,
): StockCountItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((item) => item.barcode.toLowerCase().includes(q))
}

export function sortItems(items: StockCountItem[], sort: SortOption): StockCountItem[] {
  const sorted = [...items]
  switch (sort) {
    case 'barcode-asc':
      sorted.sort((a, b) => a.barcode.localeCompare(b.barcode, undefined, { numeric: true }))
      break
    case 'quantity-desc':
      sorted.sort((a, b) => b.quantity - a.quantity || a.barcode.localeCompare(b.barcode))
      break
    case 'quantity-asc':
      sorted.sort((a, b) => a.quantity - b.quantity || a.barcode.localeCompare(b.barcode))
      break
    case 'recent':
      sorted.sort(
        (a, b) =>
          new Date(b.lastScannedAt).getTime() - new Date(a.lastScannedAt).getTime(),
      )
      break
  }
  return sorted
}

export function getLastScannedItem(items: StockCountItem[]): StockCountItem | null {
  if (items.length === 0) return null
  return items.reduce((latest, item) =>
    new Date(item.lastScannedAt).getTime() > new Date(latest.lastScannedAt).getTime()
      ? item
      : latest,
  )
}
