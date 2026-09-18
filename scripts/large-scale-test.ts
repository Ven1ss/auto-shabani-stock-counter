/**
 * Large-scale logic verification (no browser UI).
 * Run: npx tsx scripts/large-scale-test.ts
 */
import {
  addScan,
  calculateStatistics,
  createEmptyStockCount,
  decrementBarcode,
  filterItemsBySearch,
  sortItems,
} from '../src/utils/stockCountLogic'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

let count = createEmptyStockCount()

// 1000 unique barcodes, varying quantities totaling >= 10_000
for (let i = 0; i < 1000; i++) {
  const barcode = `590${String(i).padStart(10, '0')}`
  const qty = 10 + (i % 7) // 10..16
  for (let q = 0; q < qty; q++) {
    count = addScan(count, barcode)
  }
}

const stats = calculateStatistics(count.items)
assert(stats.uniqueProducts === 1000, `Expected 1000 products, got ${stats.uniqueProducts}`)
assert(stats.totalUnits >= 10000, `Expected >=10000 units, got ${stats.totalUnits}`)

// Duplicate scans must merge, not create rows
const before = count.items.length
count = addScan(count, '5900000000000')
assert(count.items.length === before, 'Duplicate barcode created a new row')
assert(
  count.items.find((i) => i.barcode === '5900000000000')!.quantity === 11,
  'Quantity did not increment correctly',
)

// Search partial
const matches = filterItemsBySearch(count.items, '59000000000')
assert(matches.length >= 1, 'Partial search failed')

// Sort remains usable
const sorted = sortItems(count.items, 'quantity-desc')
assert(sorted[0].quantity >= sorted[sorted.length - 1].quantity, 'Sort failed')

// Decrement never goes below removal
let temp = createEmptyStockCount()
temp = addScan(temp, 'ABC')
temp = decrementBarcode(temp, 'ABC')
assert(temp.items.length === 0, 'Zero quantity item was not removed')

// Whitespace normalize
temp = addScan(createEmptyStockCount(), '  12345  ')
assert(temp.items[0].barcode === '12345', 'Barcode whitespace not trimmed')
temp = addScan(temp, '12345')
assert(temp.items.length === 1 && temp.items[0].quantity === 2, 'Normalized merge failed')

console.log('Large-scale test passed:', {
  uniqueProducts: stats.uniqueProducts,
  totalUnits: stats.totalUnits,
})
