import type { PlanetSystemId } from './planetSystems.ts'

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
