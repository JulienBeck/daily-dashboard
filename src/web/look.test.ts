import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { initialLook, parseLook, useLook } from './look.js'

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.look
  window.history.replaceState(null, '', '/')
})

describe('parseLook', () => {
  it('accepts the known looks only', () => {
    expect(parseLook('questlog')).toBe('questlog')
    expect(parseLook('classic')).toBe('classic')
    expect(parseLook('pergament')).toBeUndefined()
    expect(parseLook(null)).toBeUndefined()
  })
})

describe('initialLook', () => {
  it('defaults to the classic look', () => {
    expect(initialLook('', null)).toBe('classic')
  })

  it('takes the stored look', () => {
    expect(initialLook('', 'questlog')).toBe('questlog')
  })

  it('lets the URL override the stored look', () => {
    expect(initialLook('?look=classic', 'questlog')).toBe('classic')
    expect(initialLook('?season=winter&look=questlog', null)).toBe('questlog')
  })

  it('ignores unknown values in URL and storage', () => {
    expect(initialLook('?look=neon', 'questlog')).toBe('questlog')
    expect(initialLook('', 'neon')).toBe('classic')
  })
})

describe('useLook', () => {
  it('marks the document with the current look', () => {
    renderHook(() => useLook())

    expect(document.documentElement.dataset.look).toBe('classic')
  })

  it('switches back and forth and remembers the choice', () => {
    const { result } = renderHook(() => useLook())

    act(() => result.current[1]())
    expect(result.current[0]).toBe('questlog')
    expect(document.documentElement.dataset.look).toBe('questlog')
    expect(localStorage.getItem('look')).toBe('questlog')

    act(() => result.current[1]())
    expect(result.current[0]).toBe('classic')
    expect(localStorage.getItem('look')).toBe('classic')
  })

  it('does not store a look that only came from the URL', () => {
    window.history.replaceState(null, '', '/?look=questlog')

    const { result } = renderHook(() => useLook())

    expect(result.current[0]).toBe('questlog')
    expect(localStorage.getItem('look')).toBeNull()
  })
})
