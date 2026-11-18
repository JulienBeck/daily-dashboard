import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { measure, panelsIn, SeasonDecor } from './SeasonDecor.js'

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect

function frameWith(html: string) {
  const frame = document.createElement('div')
  frame.innerHTML = html
  document.body.append(frame)
  return frame
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('panelsIn', () => {
  it('takes the tiles of the page, not popups inside them or dialogs', () => {
    const frame = frameWith(`
      <header class="panel" id="head"></header>
      <section class="panel" id="timer"><div class="panel" id="dial"></div></section>
      <div class="fixed"><div role="dialog"><div class="panel" id="ask"></div></div></div>
      <main><section class="panel" id="stories"></section></main>
    `)

    expect(panelsIn(frame).map((panel) => panel.id)).toEqual(['head', 'timer', 'stories'])
  })
})

describe('measure', () => {
  it('measures the tiles from the inner edge of the frame and skips hidden ones', () => {
    const frame = frameWith('<section class="panel" id="a"></section><section class="panel" id="b"></section>')
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(rect(100, 50, 812, 612))
    Object.defineProperties(frame, {
      clientLeft: { value: 6 },
      clientTop: { value: 6 },
      clientWidth: { value: 800 },
      clientHeight: { value: 600 },
    })
    vi.spyOn(frame.querySelector('#a')!, 'getBoundingClientRect').mockReturnValue(rect(118, 68, 300, 120))
    vi.spyOn(frame.querySelector('#b')!, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 0, 0))

    expect(measure(frame)).toEqual({
      frame: { x: 0, y: 0, w: 800, h: 600 },
      panels: [{ x: 12, y: 12, w: 300, h: 120 }],
    })
  })
})

describe('SeasonDecor', () => {
  const observer = { observe: vi.fn(), disconnect: vi.fn() }

  beforeEach(() => {
    observer.observe.mockReset()
    observer.disconnect.mockReset()
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn(function ResizeObserver() {
        return observer
      }),
    )
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  it('watches the frame and every tile, so a growing tile moves the decoration along', () => {
    const { container, unmount } = render(
      <div className="app-frame">
        <section className="panel" />
        <SeasonDecor season="winter" />
      </div>,
    )

    expect(observer.observe).toHaveBeenCalledWith(container.querySelector('.app-frame'))
    expect(observer.observe).toHaveBeenCalledWith(container.querySelector('.panel'))

    observer.disconnect.mockClear()
    unmount()
    expect(observer.disconnect).toHaveBeenCalled()
  })

  it('draws a layer over the frame that screen readers and the pointer ignore', () => {
    const { container } = render(
      <div className="app-frame">
        <section className="panel" />
        <SeasonDecor season="autumn" />
      </div>,
    )

    const layer = container.querySelector('svg[data-season-decor="autumn"]')!
    expect(layer).toHaveAttribute('aria-hidden', 'true')
    expect(layer).toHaveClass('pointer-events-none')
    expect(layer.querySelectorAll('use[data-sprite]').length).toBeGreaterThan(0)
  })

  it('changes the decoration with the season', () => {
    const { container, rerender } = render(
      <div>
        <SeasonDecor season="winter" />
      </div>,
    )
    expect(container.querySelectorAll('path[fill="url(#decor-snow)"]')).toHaveLength(1)

    rerender(
      <div>
        <SeasonDecor season="autumn" />
      </div>,
    )
    expect(container.querySelectorAll('path[fill="url(#decor-snow)"]')).toHaveLength(0)
    expect(container.querySelectorAll('use[data-sprite]').length).toBeGreaterThan(0)
  })
})
