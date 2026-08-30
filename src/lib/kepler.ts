import {
  PLANETS,
  frameFor,
  type IauFrame,
  type Planet,
  type PlanetId,
  type RotationAxis,
  type RotationFrameChoice,
} from '../data/planets.ts'

const J2000 = 2451545.0
const MS_PER_DAY = 86_400_000
const UNIX_EPOCH_JD = 2440587.5
const DEG = Math.PI / 180
/** Obliquity of the ecliptic at J2000, degrees. */
const OBLIQUITY_J2000 = 23.43928

export type Vec3 = { x: number; y: number; z: number }

export type PlanetState = {
  id: PlanetId
  name: string
  color: string
  symbol?: string
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
  /**
   * Mean solar day in Earth days: time for the Sun to return to the same
   * meridian, from |ω_spin − n|. Retrograde spin shortens the solar day.
   */
  solarDayDays: number
  /** Spin axis tilt from ecliptic north, radians. Over π/2 means retrograde. */
  obliquity: number
  retrograde: boolean
  /** Sidereal orbital period in days, from mean-motion rate L̇. */
  siderealOrbitDays: number
  /** Heliocentric position in ecliptic-of-J2000 rectangular coordinates, AU. */
  position: Vec3
  /** Fraction of the orbit elapsed since perihelion, 0 to 1, advancing uniformly. */
  yearFraction: number
  /**
   * Apparent local solar time at the prime meridian as a fraction of the mean
   * solar day: 0 at local midnight, 0.5 at local noon. Always advances, even on
   * the retrograde rotators where the Sun rises in the west.
   */
  dayFraction: number
  /** Latitude of the subsolar point relative to the IAU north pole, radians. */
  subsolarLatitude: number
  /** Solar days in one orbit. Below 1 for Mercury, whose day outlasts its year. */
  solsPerYear: number
  /** Where the prime meridian points, seen from north of the ecliptic. */
  facing: Facing
}

/**
 * The prime meridian as a compass bearing on the ecliptic plane: `longitude`
 * is where it points, and `inPlane` is how much of the unit vector survives the
 * projection — 1 when the meridian lies in the plane, 0 when it points at an
 * ecliptic pole and the longitude carries no information. Uranus, whose pole is
 * nearly in the plane, passes through that degenerate case twice a spin.
 */
export type Facing = {
  /** Ecliptic-of-J2000 longitude, radians. */
  longitude: number
  /** Length of the projection onto the ecliptic plane, 0 to 1. */
  inPlane: number
}

export type SolarSystemSnapshot = {
  at: Date
  earthPerihelionLongitude: number
  rotationFrame: RotationFrameChoice
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

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z)
  return { x: v.x / length, y: v.y / length, z: v.z / length }
}

function evaluate(planet: Planet, t: number) {
  const { elements: el } = planet
  return {
    a: el.a0 + el.aDot * t,
    e: el.e0 + el.eDot * t,
    L: degToRad(el.L0 + el.LDot * t),
    varpi: degToRad(el.varpi0 + el.varpiDot * t),
    i: degToRad(el.i0 + el.iDot * t),
    Omega: degToRad(el.Omega0 + el.OmegaDot * t),
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

/**
 * Mean solar day from sidereal spin and mean motion. ω_spin is signed
 * (negative if retrograde) so the Sun’s apparent rate is |ω_spin − n|.
 */
export function solarDayDays(
  siderealRotationDays: number,
  siderealOrbitDays: number,
  retrograde: boolean,
): number {
  const spinPerDay = (retrograde ? -1 : 1) / siderealRotationDays
  const orbitPerDay = 1 / siderealOrbitDays
  return 1 / Math.abs(spinPerDay - orbitPerDay)
}

/**
 * Heliocentric position in ecliptic-of-J2000 rectangular coordinates, AU.
 * Orbital-plane coordinates rotated by argument of perihelion, inclination and
 * longitude of ascending node, per the JPL approximate-positions recipe.
 */
export function heliocentricEcliptic(
  a: number,
  e: number,
  E: number,
  i: number,
  Omega: number,
  varpi: number,
): Vec3 {
  const xPlane = a * (Math.cos(E) - e)
  const yPlane = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const omega = varpi - Omega
  const cosW = Math.cos(omega)
  const sinW = Math.sin(omega)
  const cosO = Math.cos(Omega)
  const sinO = Math.sin(Omega)
  const cosI = Math.cos(i)
  const sinI = Math.sin(i)
  return {
    x: (cosW * cosO - sinW * sinO * cosI) * xPlane + (-sinW * cosO - cosW * sinO * cosI) * yPlane,
    y: (cosW * sinO + sinW * cosO * cosI) * xPlane + (-sinW * sinO + cosW * cosO * cosI) * yPlane,
    z: sinW * sinI * xPlane + cosW * sinI * yPlane,
  }
}

/** Ecliptic-of-J2000 to ICRF equatorial coordinates. */
export function eclipticToEquatorial(v: Vec3): Vec3 {
  const eps = degToRad(OBLIQUITY_J2000)
  const cosE = Math.cos(eps)
  const sinE = Math.sin(eps)
  return {
    x: v.x,
    y: v.y * cosE - v.z * sinE,
    z: v.y * sinE + v.z * cosE,
  }
}

/** ICRF equatorial to ecliptic-of-J2000 coordinates. */
export function equatorialToEcliptic(v: Vec3): Vec3 {
  const eps = degToRad(OBLIQUITY_J2000)
  const cosE = Math.cos(eps)
  const sinE = Math.sin(eps)
  return {
    x: v.x,
    y: v.y * cosE + v.z * sinE,
    z: -v.y * sinE + v.z * cosE,
  }
}

/**
 * Body-fixed axes in ICRF equatorial coordinates. The node is the ascending
 * node of the body equator on the ICRF equator, at right ascension α₀ + 90°,
 * and W is measured easterly from there to the prime meridian.
 */
export function bodyFrame(
  iau: IauFrame,
  days: number,
): { pole: Vec3; node: Vec3; primeMeridian: Vec3 } {
  const t = days / 36525
  const ra = degToRad(iau.ra0 + iau.raDot * t)
  const dec = degToRad(iau.dec0 + iau.decDot * t)
  const pole = {
    x: Math.cos(dec) * Math.cos(ra),
    y: Math.cos(dec) * Math.sin(ra),
    z: Math.sin(dec),
  }
  // ẑ × pole, which stays well defined for Earth's near-polar pole because the
  // components shrink together and normalising recovers the direction.
  const node = normalize({ x: -pole.y, y: pole.x, z: 0 })
  const east = cross(pole, node)
  const w = degToRad(iau.w0 + iau.wDot * days)
  const primeMeridian = {
    x: node.x * Math.cos(w) + east.x * Math.sin(w),
    y: node.y * Math.cos(w) + east.y * Math.sin(w),
    z: node.z * Math.cos(w) + east.z * Math.sin(w),
  }
  return { pole, node, primeMeridian }
}

/**
 * Apparent local solar time at the prime meridian and the subsolar latitude,
 * from the direction of the Sun in the body-fixed frame. The hour angle runs
 * backwards for retrograde rotators, so its sign is folded in to keep the time
 * of day advancing everywhere.
 */
export function localSolarTime(
  iau: IauFrame,
  positionEcliptic: Vec3,
  days: number,
  orbitDegPerDay: number,
): { dayFraction: number; subsolarLatitude: number } {
  const { pole, primeMeridian } = bodyFrame(iau, days)
  const planet = eclipticToEquatorial(positionEcliptic)
  const sun = normalize({ x: -planet.x, y: -planet.y, z: -planet.z })
  const east = cross(pole, primeMeridian)
  const hourAngle = Math.atan2(dot(sun, east), dot(sun, primeMeridian))
  const sense = Math.sign(iau.wDot - orbitDegPerDay)
  return {
    dayFraction: wrapRad(Math.PI - sense * hourAngle) / (Math.PI * 2),
    subsolarLatitude: Math.asin(dot(sun, pole)),
  }
}

/** Prime-meridian direction projected onto the ecliptic plane. */
export function primeMeridianFacing(iau: IauFrame, days: number): Facing {
  const v = equatorialToEcliptic(bodyFrame(iau, days).primeMeridian)
  return { longitude: wrapRad(Math.atan2(v.y, v.x)), inPlane: Math.hypot(v.x, v.y) }
}

function planetState(
  planet: Planet,
  t: number,
  earthVarpi: number,
  rotationFrame: RotationFrameChoice,
): PlanetState {
  const { a, e, L, varpi, i, Omega } = evaluate(planet, t)
  const meanAnomaly = wrapRadSigned(L - varpi)
  const E = eccentricAnomaly(meanAnomaly, e)
  const nu = trueAnomalyFromE(E, e)
  const longitude = wrapRad(varpi + nu)
  const iau = frameFor(planet, rotationFrame)
  const siderealRotationDays = 360 / Math.abs(iau.wDot)
  const retrograde = planet.rotation.theta > 90
  const siderealOrbitDays = (360 * 36525) / planet.elements.LDot
  const position = heliocentricEcliptic(a, e, E, i, Omega, varpi)
  const days = t * 36525
  const { dayFraction, subsolarLatitude } = localSolarTime(
    iau,
    position,
    days,
    360 / siderealOrbitDays,
  )
  const solarDay = solarDayDays(siderealRotationDays, siderealOrbitDays, retrograde)
  const spinRate = (2 * Math.PI) / siderealRotationDays
  return {
    id: planet.id,
    name: planet.name,
    color: planet.color,
    symbol: planet.symbol,
    a,
    e,
    meanAnomaly: wrapRad(meanAnomaly),
    trueAnomaly: wrapRad(nu),
    perihelionLongitude: wrapRad(varpi),
    longitude,
    offsetFromEarthPerihelion: wrapRad(longitude - earthVarpi),
    rotation: { ...planet.rotation, r: spinRate },
    siderealRotationDays,
    solarDayDays: solarDay,
    obliquity: degToRad(planet.rotation.theta),
    retrograde,
    siderealOrbitDays,
    position,
    yearFraction: wrapRad(meanAnomaly) / (Math.PI * 2),
    dayFraction,
    subsolarLatitude,
    solsPerYear: siderealOrbitDays / solarDay,
    facing: primeMeridianFacing(iau, days),
  }
}

export function solarSystemAt(
  date: Date,
  rotationFrame: RotationFrameChoice = 'iau',
): SolarSystemSnapshot {
  const t = centuriesSinceJ2000(date)
  const earth = PLANETS.find((p) => p.id === 'earth')
  if (!earth) {
    throw new Error('Earth orbital elements are missing')
  }
  const earthVarpi = wrapRad(evaluate(earth, t).varpi)
  return {
    at: date,
    earthPerihelionLongitude: earthVarpi,
    rotationFrame,
    planets: PLANETS.map((planet) => planetState(planet, t, earthVarpi, rotationFrame)),
  }
}
