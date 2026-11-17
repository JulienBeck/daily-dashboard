import { useLayoutEffect, useRef, type DependencyList } from 'react'

/**
 * Sets `data-overflow` on the element while its content is taller than it is,
 * so the stylesheet can make room for a scroll column only when one is shown.
 * Watches the element and its children: a quest is swapped, the window is
 * resized, a font arrives late.
 */
export function useOverflowMark<T extends HTMLElement>(deps: DependencyList) {
  const ref = useRef<T>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const check = () =>
      element.toggleAttribute('data-overflow', element.scrollHeight > element.clientHeight)
    check()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(check)
    observer.observe(element)
    for (const child of element.children) observer.observe(child)
    return () => observer.disconnect()
    // The caller names what changes the content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return ref
}
