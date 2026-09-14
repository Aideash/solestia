import { describe, expect, it } from 'vitest'
import { marsSite } from '../../data/marsSites.ts'
import { horizonState } from '../../lib/earthLocalSky.ts'
import { planetSystemAt } from '../../lib/kepler.ts'
import { marsLocalSkyAt } from '../../lib/marsLocalSky.ts'
import { clancyMarsYear, dateAtLs } from '../../lib/marsTime.ts'

/** A mid-mission epoch with both moons well-behaved. */
const EPOCH = new Date(Date.UTC(2024, 0, 15, 12, 0, 0))

describe('planetSystemAt mars', () => {
  it('returns Phobos and Deimos', () => {
    const system = planetSystemAt(EPOCH, 'mars')
    expect(system.parent.id).toBe('mars')
    expect(system.satellites.map((body) => body.id).sort()).toEqual(['deimos', 'phobos'])
  })
})

describe('marsLocalSkyAt', () => {
  it('places Ls 0/90/180/270 season marks on the perihelion year rim', () => {
    const curiosity = marsSite('curiosity')
    const sky = marsLocalSkyAt(EPOCH, curiosity.latitudeNorth, curiosity.longitudeEast)
    expect(sky.seasonMarks).toHaveLength(4)
    const byName = Object.fromEntries(sky.seasonMarks.map((mark) => [mark.name, mark]))
    expect(byName.march?.kind).toBe('equinox')
    expect(byName.june?.kind).toBe('solstice')
    expect(byName.september?.kind).toBe('equinox')
    expect(byName.december?.kind).toBe('solstice')

    const year = clancyMarsYear(EPOCH)
    for (const [name, ls] of [
      ['march', 0],
      ['june', 90],
      ['september', 180],
      ['december', 270],
    ] as const) {
      const at = dateAtLs(year, ls)
      const expected = planetSystemAt(at, 'mars').parent.yearFraction
      expect(byName[name]?.yearFraction).toBeCloseTo(expected, 3)
    }
  })

  it('marks the Sun as polar at Planum Boreum when overhead or underfoot', () => {
    const boreum = marsSite('boreum')
    const sky = marsLocalSkyAt(EPOCH, boreum.latitudeNorth, boreum.longitudeEast)
    // At 87°N the Sun is often always-up or always-down depending on season;
    // crossings must be empty when polar is set.
    if (sky.sunPolar) {
      expect(sky.sunCrossings).toEqual([])
      expect(['overhead', 'underfoot']).toContain(sky.sunPolar)
    }
  })

  it('places Phobos rise/set on the moon-hand dial, not solar local time', () => {
    const curiosity = marsSite('curiosity')
    const sky = marsLocalSkyAt(EPOCH, curiosity.latitudeNorth, curiosity.longitudeEast)
    expect(sky.phobos.crossings.length).toBe(2)
    expect(sky.phobos.crossings.map((c) => c.kind).sort()).toEqual(['rise', 'set'])

    const latitudeRad = (curiosity.latitudeNorth * Math.PI) / 180
    const horizon = horizonState(latitudeRad, sky.phobos.sublatitude)
    expect(horizon.kind).toBe('crosses')
    if (horizon.kind !== 'crosses') return

    const fractions = sky.phobos.crossings.map((c) => c.fraction).sort()
    const expected = [horizon.rise, horizon.set].sort()
    expect(fractions[0]).toBeCloseTo(expected[0]!, 5)
    expect(fractions[1]).toBeCloseTo(expected[1]!, 5)

    // Must not be keyed to the day hand: rise/set HA angles ≠ solar dayFraction.
    for (const crossing of sky.phobos.crossings) {
      expect(Math.abs(crossing.fraction - sky.dayFraction)).toBeGreaterThan(1e-3)
    }
  })

  it('keeps Deimos phase and size factors in range', () => {
    const curiosity = marsSite('curiosity')
    const sky = marsLocalSkyAt(EPOCH, curiosity.latitudeNorth, curiosity.longitudeEast)
    expect(sky.deimos.illuminated).toBeGreaterThanOrEqual(0)
    expect(sky.deimos.illuminated).toBeLessThanOrEqual(1)
    expect(sky.deimos.sizeFactor).toBeGreaterThanOrEqual(0)
    expect(sky.deimos.sizeFactor).toBeLessThanOrEqual(1)
    expect(sky.phobos.sizeFactor).toBeGreaterThanOrEqual(0)
    expect(sky.phobos.sizeFactor).toBeLessThanOrEqual(1)
  })
})
