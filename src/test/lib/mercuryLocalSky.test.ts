import { describe, expect, it } from 'vitest'
import { mercurySite } from '../../data/mercurySites.ts'
import { horizonState } from '../../lib/earthLocalSky.ts'
import { mercuryLocalSkyAt } from '../../lib/mercuryLocalSky.ts'
import { MS_PER_MERCURY_SOL } from '../../lib/mercuryTime.ts'

const EPOCH = new Date(Date.UTC(2000, 0, 1, 12, 0, 0))

describe('mercuryLocalSkyAt', () => {
  it('wraps all dial fractions into [0, 1)', () => {
    const sky = mercuryLocalSkyAt(EPOCH, 'iau-pm')
    for (const value of [
      sky.dayFraction,
      sky.meanDayFraction,
      sky.siderealFraction,
      sky.yearFraction,
      sky.trueAnomalyFraction,
    ]) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('keeps mean and true solar apart when equation of time is strong', () => {
    const nearPeri = new Date(Date.UTC(2000, 1, 1, 0, 0, 0))
    const sky = mercuryLocalSkyAt(nearPeri, 'caloris')
    const delta = Math.abs(sky.dayFraction - sky.meanDayFraction)
    const wrapped = Math.min(delta, 1 - delta)
    expect(wrapped).toBeGreaterThan(0.001)
  })

  it('advances sidereal about one turn per third of a sol', () => {
    const a = mercuryLocalSkyAt(EPOCH, 'iau-pm')
    const third = mercuryLocalSkyAt(new Date(EPOCH.getTime() + MS_PER_MERCURY_SOL / 3), 'iau-pm')
    let delta = third.siderealFraction - a.siderealFraction
    if (delta < -0.5) delta += 1
    if (delta > 0.5) delta -= 1
    expect(Math.abs(delta)).toBeLessThan(0.08)
  })

  it('exposes Mercury eccentricity and a consistent true-anomaly fraction', () => {
    const sky = mercuryLocalSkyAt(EPOCH, 'iau-pm')
    expect(sky.trueAnomalyFraction).toBeGreaterThanOrEqual(0)
    expect(sky.trueAnomalyFraction).toBeLessThan(1)
    expect(sky.eccentricity).toBeGreaterThan(0.2)
    expect(sky.eccentricity).toBeLessThan(0.22)
  })

  it('places Sun rise/set on the local solar dial at the equator', () => {
    const site = mercurySite('iau-pm')
    const sky = mercuryLocalSkyAt(EPOCH, site.id)
    expect(sky.sunCrossings).toHaveLength(2)
    expect(sky.sunCrossings.map((c) => c.kind).sort()).toEqual(['rise', 'set'])

    const latitudeRad = (site.latitudeNorth * Math.PI) / 180
    const horizon = horizonState(latitudeRad, sky.subsolarLatitude)
    expect(horizon.kind).toBe('crosses')
    if (horizon.kind !== 'crosses') return

    const fractions = sky.sunCrossings.map((c) => c.fraction).sort()
    const expected = [horizon.rise, horizon.set].sort()
    expect(fractions[0]).toBeCloseTo(expected[0]!, 5)
    expect(fractions[1]).toBeCloseTo(expected[1]!, 5)
  })

  it('narrows the daylight arc at higher latitude', () => {
    const equator = mercuryLocalSkyAt(EPOCH, 'iau-pm')
    const high = mercuryLocalSkyAt(EPOCH, 'angkor')
    expect(equator.sunCrossings).toHaveLength(2)
    expect(high.sunCrossings).toHaveLength(2)

    const daylightSpan = (sky: typeof equator) => {
      const rise = sky.sunCrossings.find((c) => c.kind === 'rise')!.fraction
      const set = sky.sunCrossings.find((c) => c.kind === 'set')!.fraction
      return (set - rise + 1) % 1
    }
    expect(daylightSpan(high)).toBeLessThan(daylightSpan(equator))
  })

  it('keeps listed sites in the crossing regime; polar latitude would not', () => {
    const sky = mercuryLocalSkyAt(EPOCH, 'angkor')
    expect(sky.sunCrossings).toHaveLength(2)

    // Mercury's obliquity is tiny, so only latitudes at the pole tip are polar;
    // sky returns [] via the same horizonState branch.
    const polar = horizonState(Math.PI / 2, sky.subsolarLatitude)
    expect(polar.kind).not.toBe('crosses')
  })
})
