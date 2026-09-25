import { describe, expect, it } from 'vitest'
import { extentRadialScale, logRadialScale, powerRadialScale } from '../../lib/radialScale.ts'

describe('extentRadialScale', () => {
  const scale = extentRadialScale(
    [
      { a: 0.387, e: 0.206 }, // Mercury
      { a: 30.07, e: 0.009 }, // Neptune
      { a: 1.27, e: 0.89 }, // Phaethon: nearest comet extent
      { a: 55.7, e: 0.983 }, // Thatcher: farthest comet extent
    ],
    7,
    42,
  )

  it('fits the nearest and farthest orbital extents rather than mean distances', () => {
    expect(scale(0.1397)).toBeCloseTo(7, 10)
    expect(scale(110.4531)).toBeCloseTo(42, 10)
  })

  it('uses one smooth logarithmic mapping across planetary and comet distances', () => {
    expect(scale(1)).toBeCloseTo(17.3237807944, 10)
    expect(scale(30)).toBeCloseTo(35.1635233383, 10)
  })
})

describe('logRadialScale', () => {
  const scale = logRadialScale(0.3, 110, 10, 42)

  it('maps the fitted endpoints to the near and far radii', () => {
    expect(scale(0.3)).toBeCloseTo(10, 10)
    expect(scale(110)).toBeCloseTo(42, 10)
  })

  it('is strictly increasing', () => {
    const samples = [0.3, 0.4, 1, 3, 10, 30, 55, 110]
    for (let index = 1; index < samples.length; index++) {
      expect(scale(samples[index])).toBeGreaterThan(scale(samples[index - 1]))
    }
  })

  it('keeps geometric midpoints at the screen midpoint (smooth log)', () => {
    // Geometric mean of the endpoints should sit halfway on a log map.
    const mid = Math.sqrt(0.3 * 110)
    expect(scale(mid)).toBeCloseTo((10 + 42) / 2, 10)
  })

  it('has no pin-wise slope breaks across decade samples', () => {
    // Finite differences of log(r) vs log(d) should be nearly constant.
    const distances = Array.from({ length: 20 }, (_, i) => 0.3 * Math.pow(110 / 0.3, i / 19))
    const slopes = []
    for (let index = 1; index < distances.length; index++) {
      const d0 = Math.log(distances[index - 1])
      const d1 = Math.log(distances[index])
      slopes.push((scale(distances[index]) - scale(distances[index - 1])) / (d1 - d0))
    }
    const mean = slopes.reduce((sum, slope) => sum + slope, 0) / slopes.length
    for (const slope of slopes) {
      expect(Math.abs(slope - mean) / mean).toBeLessThan(1e-9)
    }
  })

  it('extrapolates inside the near anchor so sungrazing perihelia stay on the same log', () => {
    // Meteor view anchors at 1 AU → mid-frame; Phaethon’s perihelion falls inward.
    const anchored = logRadialScale(1, 111, 24, 42)
    expect(anchored(1)).toBeCloseTo(24, 10)
    expect(anchored(111)).toBeCloseTo(42, 10)
    expect(anchored(0.14)).toBeGreaterThan(3.2)
    expect(anchored(0.14)).toBeLessThan(24)
  })
})

describe('powerRadialScale', () => {
  const scale = powerRadialScale(1, 94, 24, 42, 0.5)

  it('maps the fitted endpoints to the near and far radii', () => {
    expect(scale(1)).toBeCloseTo(24, 10)
    expect(scale(94)).toBeCloseTo(42, 10)
  })

  it('keeps Neptune clearly inside a Thatcher-scale aphelion', () => {
    // Under a log to ~110 AU, 30 and 47 AU nearly coincide on screen; √-power separates them.
    expect(scale(47) - scale(30)).toBeGreaterThan(2.5)
  })

  it('is strictly increasing', () => {
    for (const [a, b] of [
      [0.14, 1],
      [1, 30],
      [30, 47],
      [47, 94],
    ] as const) {
      expect(scale(b)).toBeGreaterThan(scale(a))
    }
  })
})
