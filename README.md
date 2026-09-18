# Auto Shabani — Stock Counter

Mobile-first Progressive Web App for counting automotive spare-parts stock with a phone camera.

## Features

- Start a stock count in one tap
- Real rear-camera barcode scanning (EAN-13/8, UPC-A/E, Code 128/39, ITF)
- Automatic quantity increment with scan cooldown
- Manual barcode entry
- Review, search, sort, and edit quantities
- Local IndexedDB persistence (offline-first)
- Excel (.xlsx) and PDF export
- Installable PWA

## Stack

- React + TypeScript + Vite
- Tailwind CSS
- IndexedDB (`idb`)
- `html5-qrcode`
- SheetJS / jsPDF

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Notes

- Camera permission is requested only when the scanner opens.
- All stock-count data stays on the device in V1.
- Product database / LogMicro integration is intentionally not included yet; the domain model is structured for it.
