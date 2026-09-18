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

## Publish online (Vercel)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the GitHub repo `Ven1ss/auto-shabani-stock-counter`
3. Click Deploy (defaults are fine)

You get an HTTPS URL automatically. Camera scanning requires HTTPS on a real phone.

## Notes

- Camera permission is requested only when the scanner opens.
- All stock-count data stays on the device in V1.
- Product database / LogMicro integration is intentionally not included yet; the domain model is structured for it.
