import type { AppPreferences, StockCount } from '../types'
import {
  deleteStockCount as deleteFromDb,
  loadPreferences,
  loadStockCount,
  loadStockCounts,
  savePreferences,
  saveStockCount as saveToDb,
} from '../database/stockCountRepository'
import {
  addScan as addScanLogic,
  calculateStatistics,
  completeStockCount as completeLogic,
  createEmptyStockCount,
  decrementBarcode as decrementLogic,
  deleteBarcode as deleteBarcodeLogic,
  incrementBarcode as incrementLogic,
  isValidBarcode,
  reopenStockCount as reopenLogic,
  setBarcodeQuantity as setQuantityLogic,
} from '../utils/stockCountLogic'

export {
  calculateStatistics,
  isValidBarcode,
  loadPreferences,
  loadStockCount,
  loadStockCounts,
  savePreferences,
}

export async function saveStockCount(count: StockCount): Promise<StockCount> {
  await saveToDb(count)
  return count
}

export async function createStockCount(): Promise<StockCount> {
  const count = createEmptyStockCount()
  await saveToDb(count)
  return count
}

export async function addScan(count: StockCount, barcode: string): Promise<StockCount> {
  const updated = addScanLogic(count, barcode)
  await saveToDb(updated)
  return updated
}

export async function incrementBarcode(
  count: StockCount,
  barcode: string,
): Promise<StockCount> {
  const updated = incrementLogic(count, barcode)
  await saveToDb(updated)
  return updated
}

export async function decrementBarcode(
  count: StockCount,
  barcode: string,
): Promise<StockCount> {
  const updated = decrementLogic(count, barcode)
  await saveToDb(updated)
  return updated
}

export async function setBarcodeQuantity(
  count: StockCount,
  barcode: string,
  quantity: number,
): Promise<StockCount> {
  const updated = setQuantityLogic(count, barcode, quantity)
  await saveToDb(updated)
  return updated
}

export async function deleteBarcode(
  count: StockCount,
  barcode: string,
): Promise<StockCount> {
  const updated = deleteBarcodeLogic(count, barcode)
  await saveToDb(updated)
  return updated
}

export async function finishStockCount(count: StockCount): Promise<StockCount> {
  const updated = completeLogic(count)
  await saveToDb(updated)
  return updated
}

export async function editStockCount(count: StockCount): Promise<StockCount> {
  const updated = reopenLogic(count)
  await saveToDb(updated)
  return updated
}

export async function removeStockCount(id: string): Promise<void> {
  await deleteFromDb(id)
}

export async function updatePreferences(
  prefs: AppPreferences,
): Promise<AppPreferences> {
  await savePreferences(prefs)
  return prefs
}
