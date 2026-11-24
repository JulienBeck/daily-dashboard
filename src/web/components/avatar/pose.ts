import { AnimationClip, type KeyframeTrack } from 'three'
import type { Hand } from './wardrobe.js'

const FINGER = /^(?:index|middle|ring|pinky|thumb)_0[1-3]_([lr])\./

const handOf = (track: KeyframeTrack) => FINGER.exec(track.name)?.[1] as Hand | undefined

export function hold(idle: AnimationClip, grip: AnimationClip | undefined, hands: ReadonlySet<Hand>): AnimationClip[] {
  if (!grip || hands.size === 0) return [idle]
  const holding = (track: KeyframeTrack) => {
    const hand = handOf(track)
    return hand !== undefined && hands.has(hand)
  }
  return [
    new AnimationClip(idle.name, idle.duration, idle.tracks.filter((track) => !holding(track))),
    new AnimationClip(grip.name, idle.duration, grip.tracks.filter(holding)),
  ]
}
