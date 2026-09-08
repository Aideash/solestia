import { describe, expect, it } from 'vitest'
import { canRebuildInPlace, type SceneMode } from './constellationSceneLifecycle.ts'

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
})
