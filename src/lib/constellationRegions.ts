/**
 * IAU constellation membership from equatorial coordinates.
 *
 * Uses Nancy Roman's rearranged Delporte boundary table (equinox B1875.0) with
 * Newcomb/Lieske-style precession from J2000. The table identifies which of the
 * 88 official constellations contains a sky position, including empty sky
 * between stars.
 */

import romanBoundaries from '../data/generated/romanBoundaries.ts'
import { CONSTELLATIONS } from '../data/constellations.ts'
import type { Vec3 } from './kepler.ts'

export type EquatorialDegrees = {
  readonly raDeg: number
  readonly decDeg: number
}

const DEG = Math.PI / 180
const ARCSEC = Math.PI / (180 * 3600)

const ABBREVIATION_TO_ID = new Map(
  CONSTELLATIONS.map((constellation) => [constellation.abbreviation, constellation.id]),
)

/** Precess J2000 equatorial coordinates to equinox B1875.0 (Roman table epoch). */
export function precessJ2000ToB1875(raDeg: number, decDeg: number): EquatorialDegrees {
  const T = (1875.0 - 2000.0) / 100
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * ARCSEC
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) * ARCSEC
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * ARCSEC

  const ra = raDeg * DEG
  const dec = decDeg * DEG
  const cosDec = Math.cos(dec)
  const x = Math.cos(ra) * cosDec
  const y = Math.sin(ra) * cosDec
  const z0 = Math.sin(dec)

  const cosZeta = Math.cos(zeta)
  const sinZeta = Math.sin(zeta)
  const cosZ = Math.cos(z)
  const sinZ = Math.sin(z)
  const cosTheta = Math.cos(theta)
  const sinTheta = Math.sin(theta)

  const xx = cosZeta * cosZ * cosTheta - sinZeta * sinZ
  const xy = sinZeta * cosZ * cosTheta + cosZeta * sinZ
  const xz = cosZ * sinTheta
  const yx = -cosZeta * sinZ * cosTheta - sinZeta * cosZ
  const yy = -sinZeta * sinZ * cosTheta + cosZeta * cosZ
  const yz = -sinZ * sinTheta
  const zx = -cosZeta * sinTheta
  const zy = -sinZeta * sinTheta
  const zz = cosTheta

  const xp = xx * x + yx * y + zx * z0
  const yp = xy * x + yy * y + zy * z0
  const zp = xz * x + yz * y + zz * z0

  let raOut = Math.atan2(yp, xp) / DEG
  if (raOut < 0) raOut += 360
  const decOut = Math.asin(Math.min(1, Math.max(-1, zp))) / DEG
  return { raDeg: raOut, decDeg: decOut }
}

/**
 * Resolve the constellation route id that contains a J2000 sky position.
 * Always returns one of the 88 catalog ids for finite coordinates.
 */
export function constellationAtJ2000(raDeg: number, decDeg: number): string {
  const b1875 = precessJ2000ToB1875(normalizeRaDeg(raDeg), clampDec(decDeg))
  const raHours = b1875.raDeg / 15
  const abbreviation = abbreviationAtB1875(raHours, b1875.decDeg)
  const id = ABBREVIATION_TO_ID.get(abbreviation)
  if (!id) {
    throw new Error(`Roman boundary abbreviation ${abbreviation} is not in the catalog`)
  }
  return id
}

/** Inverse of equatorialToUnitDirection for overview ray picks. */
export function unitDirectionToEquatorial(direction: Vec3): EquatorialDegrees {
  const length = Math.hypot(direction.x, direction.y, direction.z)
  if (!(length > 0)) return { raDeg: 0, decDeg: 0 }
  const x = direction.x / length
  const y = direction.y / length
  const z = direction.z / length
  let raDeg = Math.atan2(y, x) / DEG
  if (raDeg < 0) raDeg += 360
  const decDeg = Math.asin(Math.min(1, Math.max(-1, z))) / DEG
  return { raDeg, decDeg }
}

function abbreviationAtB1875(raHours: number, decDeg: number): string {
  let ra = raHours % 24
  if (ra < 0) ra += 24
  for (const [raLow, raUp, deLow, abbreviation] of romanBoundaries) {
    if (decDeg >= deLow && ra >= raLow && ra < raUp) return abbreviation
  }
  return 'Oct'
}

function normalizeRaDeg(raDeg: number): number {
  if (!Number.isFinite(raDeg)) return 0
  let ra = raDeg % 360
  if (ra < 0) ra += 360
  return ra
}

function clampDec(decDeg: number): number {
  if (!Number.isFinite(decDeg)) return 0
  if (decDeg > 90) return 90
  if (decDeg < -90) return -90
  return decDeg
}
