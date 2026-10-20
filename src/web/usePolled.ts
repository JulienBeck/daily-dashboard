import { useCallback, useEffect, useRef, useState } from 'react'

export interface Polled<T> {
  value: T | null
  error: string | null
  loading: boolean
  reload: () => Promise<void>
}

export function usePolled<T>(load: () => Promise<T>, seconds: number): Polled<T> {
  const [state, setState] = useState<Omit<Polled<T>, 'reload'>>({
    value: null,
    error: null,
    loading: true,
  })
  const run = useRef<() => Promise<void>>(() => Promise.resolve())

  useEffect(() => {
    let cancelled = false

    run.current = () =>
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

    void run.current()
    const timer = setInterval(() => void run.current(), Math.max(5, seconds) * 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [load, seconds])

  const reload = useCallback(() => run.current(), [])

  return { ...state, reload }
}
