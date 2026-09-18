import { useCallback, useEffect, useRef, useState } from 'react'
import type { StockCount } from '../types'
import { loadStockCount } from '../services/stockCountService'

export function useStockCount(id: string | undefined) {
  const [count, setCount] = useState<StockCount | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const countRef = useRef<StockCount | null>(null)

  useEffect(() => {
    countRef.current = count
  }, [count])

  useEffect(() => {
    if (!id) {
      setCount(null)
      setLoading(false)
      setError('Stock count not found.')
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    loadStockCount(id)
      .then((loaded) => {
        if (cancelled) return
        if (!loaded) {
          setError('Stock count not found.')
          setCount(null)
        } else {
          setCount(loaded)
        }
      })
      .catch((err) => {
        console.error('Failed to load stock count:', err)
        if (!cancelled) {
          setError('Could not load this stock count.')
          setCount(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  const replaceCount = useCallback((next: StockCount) => {
    countRef.current = next
    setCount(next)
  }, [])

  const getLatest = useCallback(() => countRef.current, [])

  return { count, loading, error, replaceCount, getLatest }
}
