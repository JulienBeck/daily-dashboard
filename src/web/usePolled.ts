import { useEffect, useState } from 'react'

export interface Polled<T> {
  value: T | null
  error: string | null
  loading: boolean
}

export function usePolled<T>(load: () => Promise<T>, seconds: number): Polled<T> {
  const [state, setState] = useState<Polled<T>>({ value: null, error: null, loading: true })

  useEffect(() => {
    let cancelled = false

    const run = () =>
      load().then(
        (value) => {
          if (!cancelled) setState({ value, error: null, loading: false })
        },
        (error: unknown) => {
          if (!cancelled) {
            setState((previous) => ({
              value: previous.value,
              error: error instanceof Error ? error.message : String(error),
              loading: false,
            }))
          }
        },
      )

    void run()
    const timer = setInterval(() => void run(), Math.max(5, seconds) * 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [load, seconds])

  return state
}
