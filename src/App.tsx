import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { CompletePage } from './pages/CompletePage'
import { HomePage } from './pages/HomePage'
import { ReviewPage } from './pages/ReviewPage'
import { ScannerPage } from './pages/ScannerPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/count/:id/scan" element={<ScannerPage />} />
        <Route path="/count/:id/review" element={<ReviewPage />} />
        <Route path="/count/:id/complete" element={<CompletePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
