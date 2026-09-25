import { describe, expect, it } from 'vitest'
import { projectEclipticTopDown } from '../../lib/kepler.ts'
import { projectedKeplerOrbitPaths } from '../../lib/orbitPath.ts'
import { powerRadialScale } from '../../lib/radialScale.ts'

describe('projectedKeplerOrbitPaths', () => {
  const origin = 0
  const scale = (r: number) => r * 10
  const project = (position: { x: number; y: number; z: number }) =>
    projectEclipticTopDown(50, 50, position, origin, scale)

  it('returns perihelion closer to the focus than aphelion for an eccentric orbit', () => {
    const { peri, apo } = projectedKeplerOrbitPaths(
      { a: 2, e: 0.5, i: 0, Omega: 0, varpi: 0 },
      project,
    )
    const periR = Math.hypot(peri.x - 50, peri.y - 50)
    const apoR = Math.hypot(apo.x - 50, apo.y - 50)
    // q = a(1−e) = 1 → screen 10; Q = a(1+e) = 3 → screen 30
    expect(periR).toBeCloseTo(10, 5)
    expect(apoR).toBeCloseTo(30, 5)
  })

  it('splits an inclined orbit into far and near polylines', () => {
    const { far, near } = projectedKeplerOrbitPaths(
      { a: 3, e: 0.6, i: 0.4, Omega: 0.8, varpi: 1.2 },
      project,
      'negative',
    )
    expect(far.length).toBeGreaterThan(0)
    expect(near.length).toBeGreaterThan(0)
    for (const d of [...far, ...near]) {
      expect(d.startsWith('M ')).toBe(true)
      expect(d).toContain(' L ')
    }
  })

  it('projects under a nonlinear radial scale without non-finite coordinates', () => {
    const warped = powerRadialScale(1, 50, 10, 40, 0.5)
    const projectWarped = (position: { x: number; y: number; z: number }) =>
      projectEclipticTopDown(50, 50, position, origin, warped)
    const { far, near, peri, apo } = projectedKeplerOrbitPaths(
      { a: 20, e: 0.9, i: 0.5, Omega: 0.3, varpi: 1.1 },
      projectWarped,
      'negative',
    )
    expect(Number.isFinite(peri.x) && Number.isFinite(apo.x)).toBe(true)
    for (const d of [...far, ...near]) {
      expect(d).toMatch(/^M /)
      expect(d).not.toMatch(/NaN|Infinity/)
    }
  })
})
