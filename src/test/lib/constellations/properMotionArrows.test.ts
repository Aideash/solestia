import { describe, expect, it } from 'vitest'
import type { ConstellationLocalFrame } from '../../../lib/constellationGeometry.ts'
import {
  buildProperMotionArrows,
  properMotionArrowLength,
  type SelectedStar,
} from '../../../lib/constellations/constellationSceneModel.ts'
import type { Vec3 } from '../../../lib/kepler.ts'

/** Equatorial frame aligned with axes: depth=+X, east=+Y, north=+Z. */
const AXIS_FRAME: ConstellationLocalFrame = {
  origin: { x: 0, y: 0, z: 0 },
  depth: { x: 1, y: 0, z: 0 },
  east: { x: 0, y: 1, z: 0 },
  north: { x: 0, y: 0, z: 1 },
}

function star(partial: Partial<SelectedStar> & Pick<SelectedStar, 'id' | 'kind'>): SelectedStar {
  return {
    properName: null,
    apparentMagnitude: 2,
    spectralType: 'A0',
    color: { r: 1, g: 1, b: 1 },
    size: 3,
    direction: { x: 1, y: 0, z: 0 },
    physical: { x: 10, y: 0, z: 0 },
    local: { x: 0, y: 0, z: 10 },
    displayLocal: { x: 0, y: 0, z: 10 },
    stem: null,
    distanceLy: 10,
    distanceErrorLy: null,
    pmRaMasYr: 0,
    pmDecMasYr: 0,
    ...partial,
  }
}

function shaftDelta(starts: readonly Vec3[], ends: readonly Vec3[]): Vec3 {
  // First segment of each arrow is the shaft.
  return {
    x: ends[0].x - starts[0].x,
    y: ends[0].y - starts[0].y,
    z: ends[0].z - starts[0].z,
  }
}

describe('properMotionArrowLength', () => {
  it('grows monotonically with total proper motion and stays capped', () => {
    const short = properMotionArrowLength(10)
    const typical = properMotionArrowLength(40)
    const fast = properMotionArrowLength(500)
    const extreme = properMotionArrowLength(5000)
    expect(short).toBeLessThan(typical)
    expect(typical).toBeLessThan(fast)
    expect(fast).toBeLessThanOrEqual(extreme)
    expect(extreme).toBeLessThanOrEqual(properMotionArrowLength(50_000))
  })
})

describe('buildProperMotionArrows', () => {
  it('points +RA motion along local east for a star on the +X equatorial axis', () => {
    const arrows = buildProperMotionArrows(
      [star({ id: 'a', kind: 'figure', pmRaMasYr: 100, pmDecMasYr: 0 })],
      'figure',
      AXIS_FRAME,
    )
    expect(arrows.segmentStarts.length).toBe(3)
    const delta = shaftDelta(arrows.segmentStarts, arrows.segmentEnds)
    expect(delta.x).toBeGreaterThan(0)
    expect(Math.abs(delta.y)).toBeLessThan(1e-9)
    expect(Math.abs(delta.z)).toBeLessThan(1e-9)
  })

  it('points +Dec motion along local north for a star on the +X equatorial axis', () => {
    const arrows = buildProperMotionArrows(
      [star({ id: 'a', kind: 'figure', pmRaMasYr: 0, pmDecMasYr: 100 })],
      'figure',
      AXIS_FRAME,
    )
    const delta = shaftDelta(arrows.segmentStarts, arrows.segmentEnds)
    expect(Math.abs(delta.x)).toBeLessThan(1e-9)
    expect(delta.y).toBeGreaterThan(0)
    expect(Math.abs(delta.z)).toBeLessThan(1e-9)
  })

  it('skips stars with null proper motion or missing display positions', () => {
    const arrows = buildProperMotionArrows(
      [
        star({ id: 'null-pm', kind: 'figure', pmRaMasYr: null, pmDecMasYr: null }),
        star({ id: 'partial', kind: 'figure', pmRaMasYr: 10, pmDecMasYr: null }),
        star({ id: 'no-pos', kind: 'figure', pmRaMasYr: 10, pmDecMasYr: 10, displayLocal: null }),
        star({ id: 'ok', kind: 'figure', pmRaMasYr: 10, pmDecMasYr: 10 }),
      ],
      'all',
      AXIS_FRAME,
    )
    // One arrow × three segments (shaft + two head arms).
    expect(arrows.segmentStarts.length).toBe(3)
    expect(arrows.morphDirections).toHaveLength(3)
  })

  it('filters to figure stars when scope is figure', () => {
    const arrows = buildProperMotionArrows(
      [
        star({ id: 'fig', kind: 'figure', pmRaMasYr: 20, pmDecMasYr: 0 }),
        star({ id: 'ctx', kind: 'context', pmRaMasYr: 20, pmDecMasYr: 0 }),
      ],
      'figure',
      AXIS_FRAME,
    )
    expect(arrows.segmentStarts.length).toBe(3)
  })

  it('includes context stars when scope is all', () => {
    const arrows = buildProperMotionArrows(
      [
        star({ id: 'fig', kind: 'figure', pmRaMasYr: 20, pmDecMasYr: 0 }),
        star({ id: 'ctx', kind: 'context', pmRaMasYr: 20, pmDecMasYr: 0 }),
      ],
      'all',
      AXIS_FRAME,
    )
    expect(arrows.segmentStarts.length).toBe(6)
  })
})
