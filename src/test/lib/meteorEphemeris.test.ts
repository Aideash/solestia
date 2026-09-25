import { describe, expect, it } from 'vitest'
import { METEOR_PARENT_BY_ID } from '../../data/meteorShowers.ts'
import { eccentricAnomaly, keplerPositionAtTrueAnomaly, wrapRadSigned } from '../../lib/kepler.ts'
import {
  antiSunTail,
  earthCrossingsForOrbit,
  meteorShowersAt,
  trueAnomaliesAtRadius,
} from '../../lib/meteorEphemeris.ts'

describe('trueAnomaliesAtRadius', () => {
  it('returns empty when the radius lies outside perihelion–aphelion', () => {
    expect(trueAnomaliesAtRadius(2, 0.1, 1)).toEqual([])
    expect(trueAnomaliesAtRadius(1.5, 0.2, 3)).toEqual([])
  })

  it('returns one representative anomaly for a circular 1 AU orbit', () => {
    expect(trueAnomaliesAtRadius(1, 0, 1)).toEqual([0])
  })

  it('returns two symmetric anomalies for an Earth-crossing ellipse', () => {
    // q = 0.5, Q = 1.5 → r = 1 sits between peri and apo; cos ν = −0.5.
    const anomalies = trueAnomaliesAtRadius(1, 0.5, 1)
    expect(anomalies).toHaveLength(2)
    expect(Math.cos(anomalies[0])).toBeCloseTo(-0.5, 10)
    expect(Math.cos(anomalies[1])).toBeCloseTo(-0.5, 10)
    expect(Math.sin(anomalies[0])).toBeCloseTo(-Math.sin(anomalies[1]), 10)
  })

  it('returns a single anomaly at perihelion when r equals q', () => {
    const anomalies = trueAnomaliesAtRadius(2, 0.5, 1)
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]).toBeCloseTo(0, 10)
  })
})

describe('earthCrossingsForOrbit', () => {
  it('labels Halley’s southern and northern 1 AU nodes as η Aquariids and Orionids', () => {
    const halley = METEOR_PARENT_BY_ID.halley
    // Inclined retrograde Halley-like elements with two 1 AU solutions.
    const crossings = earthCrossingsForOrbit(halley, 17.9, 0.968, (162 * Math.PI) / 180, 1, 2)
    expect(crossings.length).toBe(2)
    expect(crossings[0].position.z).toBeLessThan(crossings[1].position.z)
    expect(crossings[0].shower?.name).toContain('Aquariid')
    expect(crossings[1].shower?.name).toContain('Orionid')
  })

  it('attaches the sole shower name on a single-shower parent', () => {
    const phaethon = METEOR_PARENT_BY_ID.phaethon
    const crossings = earthCrossingsForOrbit(
      phaethon,
      1.27,
      0.89,
      (22.3 * Math.PI) / 180,
      4.6,
      10.2,
    )
    expect(crossings.length).toBe(2)
    expect(crossings.every((crossing) => crossing.shower?.name === 'Geminids')).toBe(true)
  })

  it('drops high-latitude r = 1 piercings that foreshorten inside Earth’s ring', () => {
    const thatcher = METEOR_PARENT_BY_ID.thatcher
    // Catalog Thatcher with Ω, ϖ that put one r = 1 point at high latitude.
    const crossings = earthCrossingsForOrbit(
      thatcher,
      55.7,
      0.983,
      (79.8 * Math.PI) / 180,
      0.55,
      2.1,
    )
    expect(crossings.length).toBeGreaterThanOrEqual(1)
    for (const crossing of crossings) {
      const rho = Math.hypot(crossing.position.x, crossing.position.y)
      expect(rho).toBeGreaterThanOrEqual(0.85)
    }
  })

  it('marks the ecliptic node nearest 1 AU when perihelion stays outside Earth', () => {
    const eh1 = METEOR_PARENT_BY_ID.eh1
    // Live-like Ω, ϖ so the descending node sits near perihelion (~1.19 AU).
    const crossings = earthCrossingsForOrbit(eh1, 3.12, 0.619, (70.9 * Math.PI) / 180, 4.939, 1.647)
    expect(crossings).toHaveLength(1)
    expect(crossings[0].shower?.name).toBe('Quadrantids')
    const radius = Math.hypot(
      crossings[0].position.x,
      crossings[0].position.y,
      crossings[0].position.z,
    )
    expect(radius).toBeGreaterThan(1.05)
    expect(radius).toBeLessThan(1.25)
    expect(Math.abs(crossings[0].position.z)).toBeLessThan(1e-6)
  })
})

describe('antiSunTail', () => {
  it('points along the heliocentric position', () => {
    const tail = antiSunTail({ x: 3, y: 4, z: 0 })
    expect(tail.longitude).toBeCloseTo(Math.atan2(4, 3), 10)
    expect(tail.inPlane).toBeCloseTo(1, 10)
    expect(tail.direction.x).toBeCloseTo(0.6, 10)
    expect(tail.direction.y).toBeCloseTo(0.8, 10)
  })
})

function angularSpanDeg(radians: number[]): number {
  let widest = 0
  for (let i = 0; i < radians.length; i++) {
    for (let j = i + 1; j < radians.length; j++) {
      widest = Math.max(widest, Math.abs(wrapRadSigned(radians[i] - radians[j])))
    }
  }
  return (widest * 180) / Math.PI
}

function distanceToTrail(
  position: { x: number; y: number; z: number },
  orbit: { a: number; e: number; i: number; Omega: number; varpi: number },
): number {
  let closest = Infinity
  for (let index = 0; index < 360; index++) {
    const point = keplerPositionAtTrueAnomaly(
      orbit.a,
      orbit.e,
      orbit.i,
      orbit.Omega,
      orbit.varpi,
      (index * Math.PI) / 180,
    )
    const distance = Math.hypot(point.x - position.x, point.y - position.y, point.z - position.z)
    if (distance < closest) closest = distance
  }
  return closest
}

describe('eccentricAnomaly', () => {
  it('solves Kepler’s equation past aphelion on Halley-like eccentricity', () => {
    for (const e of [0.89, 0.968, 0.983]) {
      for (let degree = 0; degree < 360; degree++) {
        const M = (degree * Math.PI) / 180
        const E = eccentricAnomaly(M, e)
        const residual = E - e * Math.sin(E) - wrapRadSigned(M)
        expect(Math.abs(residual), `e=${e} M=${degree}°`).toBeLessThan(1e-10)
      }
    }
  })
})

describe('Halley near aphelion', () => {
  it('does not teleport through the inner solar system day to day in September 2026', () => {
    for (let day = 0; day < 10; day++) {
      const date = new Date(Date.UTC(2026, 8, 19 + day, 12))
      const halley = meteorShowersAt(date).parents.find((parent) => parent.id === 'halley')
      expect(halley).toBeDefined()
      expect(halley!.distanceAu).toBeGreaterThan(34)
      expect(halley!.distanceAu).toBeLessThan(36)
    }
  })
})

describe('Phaethon near perihelion', () => {
  const catalogQ = METEOR_PARENT_BY_ID.phaethon.a * (1 - METEOR_PARENT_BY_ID.phaethon.e)
  const perihelionWindow = Array.from(
    { length: 21 },
    (_, index) => new Date(Date.UTC(2026, 7, 21 + index)),
  )

  it('stays near catalog perihelion distance instead of cutting through the Sun', () => {
    const phaethon = meteorShowersAt(new Date('2026-08-31T00:00:00Z')).parents.find(
      (parent) => parent.id === 'phaethon',
    )
    expect(phaethon).toBeDefined()
    expect(phaethon!.distanceAu).toBeGreaterThan(catalogQ - 0.03)
    expect(phaethon!.distanceAu).toBeLessThan(0.25)
  })

  it('holds perihelion direction steady across the 2026 perihelion passage', () => {
    const perihelia = perihelionWindow.map((date) => {
      const phaethon = meteorShowersAt(date).parents.find((parent) => parent.id === 'phaethon')
      expect(phaethon).toBeDefined()
      return phaethon!.perihelionLongitude
    })
    expect(angularSpanDeg(perihelia)).toBeLessThan(2)
  })

  it('keeps the body on the drawn trail ellipse through perihelion', () => {
    for (const date of perihelionWindow) {
      const phaethon = meteorShowersAt(date).parents.find((parent) => parent.id === 'phaethon')
      expect(phaethon).toBeDefined()
      expect(distanceToTrail(phaethon!.position, phaethon!.osculating)).toBeLessThan(0.02)
    }
  })
})
