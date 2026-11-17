import { useCallback, useEffect, useState } from 'react'

export type Look = 'classic' | 'questlog'

const LOOKS: readonly Look[] = ['classic', 'questlog']
const STORAGE_KEY = 'look'

export function parseLook(value: string | null): Look | undefined {
  return LOOKS.find((look) => look === value)
}

export function initialLook(search: string, stored: string | null): Look {
  return parseLook(new URLSearchParams(search).get('look')) ?? parseLook(stored) ?? 'classic'
}

export function useLook(): [Look, () => void] {
  const [look, setLook] = useState(() =>
    initialLook(window.location.search, localStorage.getItem(STORAGE_KEY)),
  )

  useEffect(() => {
    document.documentElement.dataset.look = look
  }, [look])

  const toggle = useCallback(() => {
    const next = look === 'classic' ? 'questlog' : 'classic'
    localStorage.setItem(STORAGE_KEY, next)
    setLook(next)
  }, [look])

  return [look, toggle]
}
