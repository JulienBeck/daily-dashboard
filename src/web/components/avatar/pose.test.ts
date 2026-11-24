import { AnimationClip, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three'
import { describe, expect, it } from 'vitest'
import { hold } from './pose.js'

const track = (name: string) => new QuaternionKeyframeTrack(`${name}.quaternion`, [0, 4], [0, 0, 0, 1, 0, 0, 0, 1])

const idle = new AnimationClip('idle', 4, [
  track('spine_02'),
  track('index_01_r'),
  track('thumb_03_r'),
  track('pinky_02_l'),
  new VectorKeyframeTrack('hand_r.position', [0, 4], [0, 0, 0, 0, 0, 0]),
])
const grip = new AnimationClip('grip', 4, [track('spine_02'), track('index_01_r'), track('thumb_03_r'), track('pinky_02_l')])
const names = (clip: AnimationClip) => clip.tracks.map((entry) => entry.name)

describe('hold', () => {
  it('keeps the idle clip as it is while both hands are empty', () => {
    expect(hold(idle, grip, new Set())).toEqual([idle])
  })

  it('keeps the idle clip when the model has no grip yet', () => {
    expect(hold(idle, undefined, new Set(['r']))).toEqual([idle])
  })

  it('hands the fingers of a holding hand from idle to the grip and leaves everything else alone', () => {
    const [rest, fist] = hold(idle, grip, new Set(['r']))

    expect(names(rest!)).toEqual(['spine_02.quaternion', 'pinky_02_l.quaternion', 'hand_r.position'])
    expect(names(fist!)).toEqual(['index_01_r.quaternion', 'thumb_03_r.quaternion'])
    expect(fist!.duration).toBe(idle.duration)
  })

  it('closes both hands when both hold something', () => {
    const [rest, fist] = hold(idle, grip, new Set(['l', 'r']))

    expect(names(rest!)).toEqual(['spine_02.quaternion', 'hand_r.position'])
    expect(names(fist!)).toEqual(['index_01_r.quaternion', 'thumb_03_r.quaternion', 'pinky_02_l.quaternion'])
  })
})
