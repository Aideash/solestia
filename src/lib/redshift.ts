import type { Vec3 } from './kepler.ts'

/** Speed of light, km/s. */
export const C_KM_S = 299_792.458
const NS_PER_DAY = 86_400 * 1e9

export type GravityBody = {
  gmKm3s2: number
  positionKm: Vec3
  radiusKm: number
}

/** Newtonian gravitational potential Φ (km²/s²), zero at infinity. Capped at each body’s surface. */
export function gravitationalPotential(bodies: readonly GravityBody[], atKm: Vec3): number {
  let phi = 0
  for (const body of bodies) {
    const dx = atKm.x - body.positionKm.x
    const dy = atKm.y - body.positionKm.y
    const dz = atKm.z - body.positionKm.z
    const r = Math.max(body.radiusKm, Math.hypot(dx, dy, dz))
    phi -= body.gmKm3s2 / r
  }
  return phi
}

/**
 * How many nanoseconds per day a clock at Φ lags a clock at infinity.
 * Uses Φ/c² only (no centrifugal term, no special-relativistic motion).
 */
export function redshiftNsPerDay(phiKm2s2: number): number {
  return (-phiKm2s2 / (C_KM_S * C_KM_S)) * NS_PER_DAY
}
