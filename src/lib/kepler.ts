import { PLANETS, type Planet, type PlanetId, type RotationAxis } from '../data/planets.ts'

const J2000 = 2451545.0
const MS_PER_DAY = 86_400_000
const UNIX_EPOCH_JD = 2440587.5
const DEG = Math.PI / 180

export type PlanetState = {
  id: PlanetId
  name: string
  color: string
  /** Semi-major axis in AU (unused for equal-ring display). */
  a: number
  e: number
  /** Mean anomaly, radians. */
  meanAnomaly: number
  /** True anomaly, radians. */
  trueAnomaly: number
  /** Longitude of perihelion ϖ, radians. */
  perihelionLongitude: number
  /** Heliocentric ecliptic longitude λ ≈ ϖ + ν, radians (inclination ignored). */
  longitude: number
  /** λ minus Earth's perihelion longitude; 0 at Earth's perihelion direction. */
  offsetFromEarthPerihelion: number
  /** Angular velocity vector, ecliptic-of-J2000 spherical coordinates. */
  rotation: RotationAxis
  /** Sidereal rotation period in days, always positive. */
  siderealRotationDays: number
  /** Spin axis tilt from ecliptic north, radians. Over π/2 means retrograde. */
  obliquity: number
  retrograde: boolean
  /** Sidereal orbital period in days, from mean-motion rate L̇. */
  siderealOrbitDays: number
}

export type SolarSystemSnapshot = {
  at: Date
  earthPerihelionLongitude: number
  planets: PlanetState[]
}

export function julianDate(date: Date): number {
  return UNIX_EPOCH_JD + date.getTime() / MS_PER_DAY
}

export function centuriesSinceJ2000(date: Date): number {
  return (julianDate(date) - J2000) / 36525
}

export function wrapRad(angle: number): number {
  const tau = Math.PI * 2
  return ((angle % tau) + tau) % tau
}

/** Smallest signed angle in (−π, π]. */
export function wrapRadSigned(angle: number): number {
  const wrapped = wrapRad(angle)
  return wrapped > Math.PI ? wrapped - Math.PI * 2 : wrapped
}

function degToRad(deg: number): number {
  return deg * DEG
}

function evaluate(planet: Planet, t: number) {
  const { elements: el } = planet
  return {
    a: el.a0 + el.aDot * t,
    e: el.e0 + el.eDot * t,
    L: degToRad(el.L0 + el.LDot * t),
    varpi: degToRad(el.varpi0 + el.varpiDot * t),
  }
}

/** Newton solve of Kepler's equation M = E − e sin E. M, E in radians. */
export function eccentricAnomaly(meanAnomaly: number, e: number): number {
  const M = wrapRadSigned(meanAnomaly)
  let E = e < 0.8 ? M : Math.PI
  for (let i = 0; i < 12; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= dE
    if (Math.abs(dE) < 1e-12) break
  }
  return E
}

export function trueAnomalyFromE(E: number, e: number): number {
  const sinHalf = Math.sin(E / 2)
  const cosHalf = Math.cos(E / 2)
  return 2 * Math.atan2(Math.sqrt(1 + e) * sinHalf, Math.sqrt(1 - e) * cosHalf)
}

/**
 * Screen point for an orbit angle measured from Earth's perihelion.
 * offset = 0 is top; motion is counterclockwise as viewed from north of the ecliptic.
 */
export function orbitPoint(
  cx: number,
  cy: number,
  radius: number,
  offsetFromEarthPerihelion: number,
): { x: number; y: number } {
  return {
    x: cx - radius * Math.sin(offsetFromEarthPerihelion),
    y: cy - radius * Math.cos(offsetFromEarthPerihelion),
  }
}

function planetState(planet: Planet, t: number, earthVarpi: number): PlanetState {
  const { a, e, L, varpi } = evaluate(planet, t)
  const meanAnomaly = wrapRadSigned(L - varpi)
  const E = eccentricAnomaly(meanAnomaly, e)
  const nu = trueAnomalyFromE(E, e)
  const longitude = wrapRad(varpi + nu)
  return {
    id: planet.id,
    name: planet.name,
    color: planet.color,
    a,
    e,
    meanAnomaly: wrapRad(meanAnomaly),
    trueAnomaly: wrapRad(nu),
    perihelionLongitude: wrapRad(varpi),
    longitude,
    offsetFromEarthPerihelion: wrapRad(longitude - earthVarpi),
    rotation: planet.rotation,
    siderealRotationDays: (2 * Math.PI) / planet.rotation.r,
    obliquity: degToRad(planet.rotation.theta),
    retrograde: planet.rotation.theta > 90,
    siderealOrbitDays: (360 * 36525) / planet.elements.LDot,
  }
}

export function solarSystemAt(date: Date): SolarSystemSnapshot {
  const t = centuriesSinceJ2000(date)
  const earth = PLANETS.find((p) => p.id === 'earth')
  if (!earth) {
    throw new Error('Earth orbital elements are missing')
  }
  const earthVarpi = wrapRad(evaluate(earth, t).varpi)
  return {
    at: date,
    earthPerihelionLongitude: earthVarpi,
    planets: PLANETS.map((planet) => planetState(planet, t, earthVarpi)),
  }
}
