import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePolled } from './usePolled.js'

describe('usePolled', () => {
  it('loads again on demand instead of waiting for the next interval', async () => {
    const load = vi.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b')
    const { result } = renderHook(() => usePolled(load, 600))

    await waitFor(() => expect(result.current.value).toBe('a'))
    await act(() => result.current.reload())

    expect(result.current.value).toBe('b')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('hands out the same reload on every render, so no caller restarts the polling', async () => {
    const load = vi.fn().mockResolvedValue('a')
    const { result, rerender } = renderHook(() => usePolled(load, 600))

    await waitFor(() => expect(result.current.value).toBe('a'))
    const first = result.current.reload
    rerender()

    expect(result.current.reload).toBe(first)
  })

  it('keeps the last good value when a reload fails', async () => {
    const load = vi.fn().mockResolvedValueOnce('a').mockRejectedValueOnce(new Error('weg'))
    const { result } = renderHook(() => usePolled(load, 600))

    await waitFor(() => expect(result.current.value).toBe('a'))
    await act(() => result.current.reload())

    expect(result.current.value).toBe('a')
    expect(result.current.error).toBe('weg')
  })
})
