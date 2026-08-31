import type { PlanetSystemId } from './planetSystems.ts'
import { KM_PER_AU } from '../lib/kepler.ts'

/**
 * A decorative radial span drawn at its true extent, in kilometers. Orrery
 * bodies carry AU, so the renderer converts; keeping the catalog physical lets
 * a ring and an asteroid belt be written the same way.
 */
export type OrbitalBand = {
  id: string
  name: string
  innerDistanceKm: number
  outerDistanceKm: number
}

function auKm(au: number): number {
  return au * KM_PER_AU
}

export const PLANET_SYSTEM_BANDS: Partial<Record<PlanetSystemId, readonly OrbitalBand[]>> = {
  saturn: [
    {
      id: 'saturn-main-rings',
      name: 'Saturn’s main rings (D through A)',
      innerDistanceKm: 66900,
      outerDistanceKm: 136800,
    },
  ],
}

/** Main belt 2.06–3.27 AU; classical Kuiper belt 30–50 AU (clipped to the orrery frame). */
export const SOLAR_SYSTEM_BANDS: readonly OrbitalBand[] = [
  {
    id: 'asteroid-belt',
    name: 'Main asteroid belt',
    innerDistanceKm: auKm(2.06),
    outerDistanceKm: auKm(3.27),
  },
  {
    id: 'kuiper-belt',
    name: 'Kuiper belt',
    innerDistanceKm: auKm(30),
    outerDistanceKm: auKm(50),
  },
]
