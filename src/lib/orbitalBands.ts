import type { OrbitalBand } from '../data/orbitalBands.ts'
import { KM_PER_AU } from './kepler.ts'
import { extendRadialScaleInward, radialScale, type OrbitExtent } from './radialScale.ts'

/** A band reduced to the stroked circle that draws it. */
export type ResolvedBand = {
  id: string
  name: string
  radius: number
  width: number
}

/**
 * Screen geometry for the bands of one system. Orbits carry AU, as every
 * orrery body does, so the band's kilometres are converted before they meet
 * the shared scale — mixing the two silently inflates a band by the size of
 * an astronomical unit.
 *
 * A band can reach closer in than any orbit, so the scale is anchored at the
 * parent's surface on the center disc rather than left to extrapolate.
 */
export function resolveOrbitalBands(
  bands: readonly OrbitalBand[],
  orbits: readonly OrbitExtent[],
  parentRadiusKm: number,
  innerR: number,
  outerR: number,
  centerR: number,
): ResolvedBand[] {
  const innermost = orbits[0]
  if (!innermost) return []

  const scale = extendRadialScaleInward(
    radialScale(orbits, innerR, outerR),
    parentRadiusKm / KM_PER_AU,
    centerR,
    innermost.a * (1 - innermost.e),
  )

  return bands.map((band) => {
    const inner = scale(band.innerDistanceKm / KM_PER_AU)
    const outer = scale(band.outerDistanceKm / KM_PER_AU)
    return {
      id: band.id,
      name: band.name,
      radius: (inner + outer) / 2,
      width: outer - inner,
    }
  })
}
