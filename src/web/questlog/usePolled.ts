import { useCallback, useEffect, useState } from 'react'

export interface Polled<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

export function usePolled<T>(
  load: () => Promise<T>,
  seconds: number,
  deps: readonly unknown[],
): Polled<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((value) => value + 1), [])

  useEffect(() => {
    let alive = true
    setLoading(true)

    const run = () =>
      load()
        .then((value) => {
          if (!alive) return
          setData(value)
          setError(null)
        })
        .catch((reason: unknown) => {
          if (!alive) return
          setError(reason instanceof Error ? reason.message : String(reason))
        })
        .finally(() => {
          if (alive) setLoading(false)
        })

    void run()
    // Polling off when seconds <= 0 — the dev proxy then stays quiet.
    const timer = seconds > 0 ? setInterval(run, seconds * 1000) : null
    return () => {
      alive = false
      if (timer) clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, tick, ...deps])

  return { data, error, loading, reload }
}
