import * as XLSX from 'xlsx'
import type { StockCount } from '../types'
import { calculateStatistics } from '../utils/stockCountLogic'
import { formatExportTimestamp, formatSlashDate } from '../utils/format'

export function exportExcel(count: StockCount): void {
  if (count.items.length === 0) {
    throw new Error('EMPTY_COUNT')
  }

  const stats = calculateStatistics(count.items)
  const dateIso = count.completedAt ?? count.createdAt

  const rows: (string | number)[][] = [
    ['AUTO SHABANI'],
    ['STOCK COUNT'],
    [],
    ['Date:', formatSlashDate(dateIso)],
    ['Total Unique Products:', stats.uniqueProducts],
    ['Total Units:', stats.totalUnits],
    [],
    ['Barcode', 'Quantity'],
  ]

  const sorted = [...count.items].sort((a, b) =>
    a.barcode.localeCompare(b.barcode, undefined, { numeric: true }),
  )

  for (const item of sorted) {
    rows.push([item.barcode, item.quantity])
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows)

  worksheet['!cols'] = [{ wch: 22 }, { wch: 12 }]
  worksheet['!views'] = [{ state: 'frozen', ySplit: 8 }]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Count')

  const stamp = formatExportTimestamp(new Date(dateIso))
  const filename = `Auto-Shabani-Stock-Count-${stamp}.xlsx`

  XLSX.writeFile(workbook, filename)
}
