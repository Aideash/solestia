import { describe, expect, it } from 'vitest'
import {
  canRebuildInPlace,
  shouldAnimateCamera,
  type SceneMode,
} from './constellationSceneLifecycle.ts'

describe('constellation scene lifecycle policy', () => {
  it('remaps only a settled slice in place', () => {
    expect(canRebuildInPlace('slice')).toBe(true)
  })

  it('defers a remap during the overview and either transition', () => {
    const deferred: SceneMode[] = ['overview', 'toSlice', 'toOverview']
    for (const mode of deferred) {
      expect(canRebuildInPlace(mode)).toBe(false)
    }
  })

  it('animates the camera only during fly-in and fly-out', () => {
    expect(shouldAnimateCamera('toSlice')).toBe(true)
    expect(shouldAnimateCamera('toOverview')).toBe(true)
    expect(shouldAnimateCamera('slice')).toBe(false)
    expect(shouldAnimateCamera('overview')).toBe(false)
  })
})
