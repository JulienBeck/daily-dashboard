import { useEffect, useRef, useState } from 'react'
import type { Body } from '../../../shared/avatar.js'
import type { Stage as Handle } from './scene.js'
import { modelUrl } from './urls.js'
import { type Hand, holding, visibleParts, type Worn } from './wardrobe.js'

const still = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

export function Stage({ body, worn, title }: { body: Body; worn: Worn; title: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const handle = useRef<Handle | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const parts = [...visibleParts(worn)].sort().join(' ')
  const hands = [...holding(worn)].sort().join('')

  useEffect(() => {
    let live = true
    let made: Handle | null = null
    setState('loading')
    import('./scene.js')
      .then((module) => module.createStage(canvas.current!, modelUrl(body), still()))
      .then((stage) => {
        made = stage
        if (!live) return stage.dispose()
        handle.current = stage
        setState('ready')
      })
      .catch(() => live && setState('failed'))
    return () => {
      live = false
      handle.current = null
      made?.dispose()
    }
  }, [body])

  useEffect(() => {
    if (state === 'ready') handle.current?.show(new Set(parts.split(' ')), new Set(hands.split('') as Hand[]))
  }, [parts, hands, state])

  return (
    <div role="img" aria-label={title} className="relative size-full">
      <canvas ref={canvas} className="size-full cursor-grab touch-none active:cursor-grabbing" />
      {state === 'ready' ? null : (
        <p className="absolute inset-0 m-0 grid place-items-center text-center text-[12px] text-muted">
          {state === 'loading' ? 'Figur wird geladen …' : '3D-Ansicht nicht verfügbar'}
        </p>
      )}
    </div>
  )
}
