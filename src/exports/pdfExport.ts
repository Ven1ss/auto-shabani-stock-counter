import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { StockCount } from '../types'
import { calculateStatistics } from '../utils/stockCountLogic'
import {
  formatExportTimestamp,
  formatLongDate,
  formatNumber,
  formatTime,
} from '../utils/format'

export function exportPDF(count: StockCount): void {
  if (count.items.length === 0) {
    throw new Error('EMPTY_COUNT')
  }

  const stats = calculateStatistics(count.items)
  const dateIso = count.completedAt ?? count.createdAt
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('AUTO SHABANI', 14, 18)

  doc.setFontSize(12)
  doc.text('STOCK COUNT', 14, 26)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Date: ${formatLongDate(dateIso)}`, 14, 36)
  doc.text(`Start time: ${formatTime(count.createdAt)}`, 14, 42)
  if (count.completedAt) {
    doc.text(`Finish time: ${formatTime(count.completedAt)}`, 14, 48)
  }
  doc.text(`Unique Products: ${formatNumber(stats.uniqueProducts)}`, 14, 56)
  doc.text(`Total Units: ${formatNumber(stats.totalUnits)}`, 14, 62)

  const sorted = [...count.items].sort((a, b) =>
    a.barcode.localeCompare(b.barcode, undefined, { numeric: true }),
  )

  const tableBody = sorted.map((item, index) => [
    String(index + 1),
    item.barcode,
    String(item.quantity),
  ])

  autoTable(doc, {
    startY: 70,
    head: [['#', 'Barcode', 'Quantity']],
    body: tableBody,
    styles: {
      fontSize: 9,
      cellPadding: 2.5,
    },
    headStyles: {
      fillColor: [17, 17, 17],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 28, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.text('AUTO SHABANI — STOCK COUNT', 14, 12)
      }
    },
  })

  const finalY =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
    70

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(
    `Total unique products: ${formatNumber(stats.uniqueProducts)}`,
    14,
    finalY + 12,
  )
  doc.text(`Total units: ${formatNumber(stats.totalUnits)}`, 14, finalY + 18)

  const stamp = formatExportTimestamp(new Date(dateIso))
  doc.save(`Auto-Shabani-Stock-Count-${stamp}.pdf`)
}
