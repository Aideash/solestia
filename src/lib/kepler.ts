import { MOONS, type Moon, type MoonId, type SatelliteElements } from '../data/moons.ts'
import {
  ELEMENTS_VALID_FROM_MS,
  ELEMENTS_VALID_TO_MS,
  PLANETS,
  SUN,
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
const JULIAN_YEAR_DAYS = 365.25
/** Obliquity of the ecliptic at J2000, degrees. */
const OBLIQUITY_J2000 = 23.43928
/** IAU 2015 equatorial radius of Jupiter, km. */
export const JUPITER_RADIUS_KM = 71492
export const KM_PER_AU = 149_597_870.7

export type Vec3 = { x: number; y: number; z: number }

export type PlanetState = {
  id: PlanetId
  name: string
  color: string
  symbol?: string
  /** Semi-major axis in AU (unused for equal-ring display). */
  a: number
  e: number
  /** Orbital inclination to the ecliptic of J2000, radians. */
  inclination: number
  /** IAU prime meridian angle W at J2000, radians, in the selected frame. */
  w0: number
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

/**
 * The Sun sits at the origin, so it has a spin but no orbit. Its rotation is
 * always the Carrington W: the frame picker leaves it alone, like the inner
 * planets.
 */
export type SunState = {
  /** Carrington sidereal rotation period in days. */
  siderealRotationDays: number
  /** Spin axis tilt from ecliptic north, radians. */
  obliquity: number
  /** Where the prime meridian points, seen from north of the ecliptic. */
  facing: Facing
}

export type SolarSystemSnapshot = {
  at: Date
  earthPerihelionLongitude: number
  rotationFrame: RotationFrameChoice
  sun: SunState
  planets: PlanetState[]
}

/**
 * A Galilean moon at one epoch. Distances for the table are `aKm`; `a` is the
 * same semi-major axis in AU so heliocentric chaining can add it to Jupiter.
 */
export type MoonState = Omit<PlanetState, 'id'> & {
  id: MoonId
  aKm: number
  /**
   * Where Jupiter sits on the solar-day dial: 0 at local midnight for a
   * Jupiter-as-sun, 0.5 when Jupiter stands on the prime meridian.
   */
  jupiterFraction: number
  /**
   * Synodic day relative to Jupiter: how long until Jupiter stands on the same
   * meridian again. `Infinity` under the 1:1 lock — Jupiter is fixed in the sky,
   * so half the moon never sees it and the other half never loses it.
   */
  jupiterDayDays: number
}

export type JupiterSystemSnapshot = {
  at: Date
  earthPerihelionLongitude: number
  /** Screen offset of the Sun (anti-Jupiter heliocentric longitude). */
  sunOffsetFromEarthPerihelion: number
  jupiter: PlanetState
  moons: MoonState[]
}

export function julianDate(date: Date): number {
  return UNIX_EPOCH_JD + date.getTime() / MS_PER_DAY
}

export function clampEpochMs(ms: number): number {
  return Math.min(ELEMENTS_VALID_TO_MS, Math.max(ELEMENTS_VALID_FROM_MS, ms))
}

export function clampEpoch(date: Date): Date {
  const ms = clampEpochMs(date.getTime())
  return ms === date.getTime() ? date : new Date(ms)
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
 * Fractional mismatch between spin and orbit below which a body counts as
 * synchronous. The Galileans sit at 1e-7 to 1e-6, which is the rounding in
 * JPL's tabulated periods rather than any real drift.
 */
const SYNCHRONOUS_TOLERANCE = 1e-3

/**
 * Synodic day for a satellite watching its own primary, the spin beat against
 * the orbit. `Infinity` for a synchronous rotator: the primary hangs at a fixed
 * point in the sky, so it never comes back to a meridian because it never left.
 */
export function parentDayDays(
  siderealRotationDays: number,
  siderealOrbitDays: number,
  retrograde: boolean,
): number {
  const spinPerDay = (retrograde ? -1 : 1) / siderealRotationDays
  const beat = Math.abs(spinPerDay - 1 / siderealOrbitDays)
  if (beat * siderealOrbitDays < SYNCHRONOUS_TOLERANCE) return Number.POSITIVE_INFINITY
  return 1 / beat
}

/**
 * Peak of ν − M, the amplitude in radians of the wobble a non-circular orbit
 * puts into an otherwise uniform spin. On a locked moon this is the optical
 * libration, the primary swinging about the sub-primary point; on a spinning
 * planet it is the eccentricity term of the equation of time.
 *
 * dν/dM = (1 + e cos ν)² / (1 − e²)^(3/2), so the peak sits at
 * cos ν = ((1 − e²)^(3/4) − 1) / e. First order it is just 2e.
 */
export function eccentricityWobble(e: number): number {
  if (e <= 0) return 0
  const cosNu = (Math.pow(1 - e * e, 0.75) - 1) / e
  const nu = Math.acos(Math.min(1, Math.max(-1, cosNu)))
  const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2))
  return nu - (E - e * Math.sin(E))
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
  // components shrink together and normalizing recovers the direction.
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
 * Apparent hour angle of a sky direction at the prime meridian. `toTarget`
 * is the ecliptic vector from the body toward the Sun, Jupiter, etc. The hour
 * angle runs backwards for retrograde rotators, so its sign is folded in to
 * keep the time of day advancing everywhere. 0.5 means the target stands on
 * the prime meridian (local “noon” for that body).
 */
export function localTargetTime(
  iau: IauFrame,
  toTargetEcliptic: Vec3,
  days: number,
  orbitDegPerDay: number,
): { dayFraction: number; subsolarLatitude: number } {
  const { pole, primeMeridian } = bodyFrame(iau, days)
  const target = normalize(eclipticToEquatorial(toTargetEcliptic))
  const east = cross(pole, primeMeridian)
  const hourAngle = Math.atan2(dot(target, east), dot(target, primeMeridian))
  const sense = Math.sign(iau.wDot - orbitDegPerDay)
  return {
    dayFraction: wrapRad(Math.PI - sense * hourAngle) / (Math.PI * 2),
    subsolarLatitude: Math.asin(dot(target, pole)),
  }
}

/**
 * Apparent local solar time at the prime meridian and the subsolar latitude,
 * from the direction of the Sun in the body-fixed frame.
 */
export function localSolarTime(
  iau: IauFrame,
  positionEcliptic: Vec3,
  days: number,
  orbitDegPerDay: number,
): { dayFraction: number; subsolarLatitude: number } {
  return localTargetTime(
    iau,
    { x: -positionEcliptic.x, y: -positionEcliptic.y, z: -positionEcliptic.z },
    days,
    orbitDegPerDay,
  )
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
    inclination: i,
    w0: wrapRad(degToRad(iau.w0)),
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

function sunState(t: number, rotationFrame: RotationFrameChoice): SunState {
  const iau = frameFor(SUN, rotationFrame)
  return {
    siderealRotationDays: 360 / Math.abs(iau.wDot),
    obliquity: degToRad(SUN.rotation.theta),
    facing: primeMeridianFacing(iau, t * 36525),
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
    sun: sunState(t, rotationFrame),
    planets: PLANETS.map((planet) => planetState(planet, t, earthVarpi, rotationFrame)),
  }
}

/** Signed apsidal and nodal precession rates, degrees per day. */
function precessionRates(el: SatelliteElements): { apsis: number; node: number } {
  const perDay = (periodYears: number, direction: number) =>
    periodYears > 0 ? (direction * 360) / (periodYears * JULIAN_YEAR_DAYS) : 0
  return {
    apsis: perDay(el.periapsisPeriodYears, el.apsisDirection),
    node: perDay(el.nodePeriodYears, el.nodeDirection),
  }
}

/**
 * Sidereal mean motion in degrees per day, from the rate of the mean longitude
 * L = M + ω + Ω. The tabulated period only carries M, so the precession has to
 * be folded back in; the result is the period the spin–orbit lock is measured
 * against.
 */
function siderealMeanMotion(el: SatelliteElements): number {
  const rate = precessionRates(el)
  return 360 / el.periodDays + rate.apsis + rate.node
}

function evaluateMoon(moon: Moon, days: number) {
  const el = moon.elements
  const rate = precessionRates(el)
  const M = el.M0 + (360 / el.periodDays) * days
  const omega = el.omega0 + rate.apsis * days
  const Omega = el.Omega0 + rate.node * days
  return {
    a: el.aKm / KM_PER_AU,
    aKm: el.aKm,
    e: el.e,
    M: degToRad(M),
    i: degToRad(el.i0),
    Omega: degToRad(Omega),
    varpi: degToRad(omega + Omega),
  }
}

/**
 * Laplace-plane orbital coordinates to ecliptic-of-J2000. The Laplace x-axis
 * is the ascending node of that plane on the ICRF equator.
 */
export function laplaceToEcliptic(pos: Vec3, poleRa: number, poleDec: number): Vec3 {
  const ra = degToRad(poleRa)
  const dec = degToRad(poleDec)
  const pole = {
    x: Math.cos(dec) * Math.cos(ra),
    y: Math.cos(dec) * Math.sin(ra),
    z: Math.sin(dec),
  }
  const node = normalize({ x: -pole.y, y: pole.x, z: 0 })
  const east = cross(pole, node)
  const icrf = {
    x: node.x * pos.x + east.x * pos.y + pole.x * pos.z,
    y: node.y * pos.x + east.y * pos.y + pole.y * pos.z,
    z: node.z * pos.x + east.z * pos.y + pole.z * pos.z,
  }
  return equatorialToEcliptic(icrf)
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

function moonState(moon: Moon, t: number, jupiter: PlanetState, earthVarpi: number): MoonState {
  const days = t * 36525
  const { a, aKm, e, M, i, Omega, varpi } = evaluateMoon(moon, days)
  const meanAnomaly = wrapRadSigned(M)
  const E = eccentricAnomaly(meanAnomaly, e)
  const nu = trueAnomalyFromE(E, e)
  const inLaplace = heliocentricEcliptic(a, e, E, i, Omega, varpi)
  const relative = laplaceToEcliptic(inLaplace, moon.elements.laplaceRa, moon.elements.laplaceDec)
  const periLaplace = heliocentricEcliptic(a, e, 0, i, Omega, varpi)
  const peri = laplaceToEcliptic(periLaplace, moon.elements.laplaceRa, moon.elements.laplaceDec)
  const longitude = wrapRad(Math.atan2(relative.y, relative.x))
  const perihelionLongitude = wrapRad(Math.atan2(peri.y, peri.x))
  const iau = moon.iau
  const siderealRotationDays = 360 / Math.abs(iau.wDot)
  const retrograde = moon.rotation.theta > 90
  const siderealOrbitDays = 360 / siderealMeanMotion(moon.elements)
  const position = addVec(jupiter.position, relative)
  const sunOrbitDegPerDay = 360 / jupiter.siderealOrbitDays
  const { dayFraction, subsolarLatitude } = localSolarTime(iau, position, days, sunOrbitDegPerDay)
  const towardJupiter = { x: -relative.x, y: -relative.y, z: -relative.z }
  const { dayFraction: jupiterFraction } = localTargetTime(
    iau,
    towardJupiter,
    days,
    sunOrbitDegPerDay,
  )
  const solarDay = solarDayDays(siderealRotationDays, jupiter.siderealOrbitDays, retrograde)
  const spinRate = (2 * Math.PI) / siderealRotationDays
  return {
    id: moon.id,
    name: moon.name,
    color: moon.color,
    symbol: moon.symbol,
    a,
    aKm,
    e,
    inclination: i,
    w0: wrapRad(degToRad(iau.w0)),
    meanAnomaly: wrapRad(meanAnomaly),
    trueAnomaly: wrapRad(nu),
    perihelionLongitude,
    longitude,
    offsetFromEarthPerihelion: wrapRad(longitude - earthVarpi),
    rotation: { ...moon.rotation, r: spinRate },
    siderealRotationDays,
    solarDayDays: solarDay,
    obliquity: degToRad(moon.rotation.theta),
    retrograde,
    siderealOrbitDays,
    position,
    yearFraction: wrapRad(meanAnomaly) / (Math.PI * 2),
    dayFraction,
    subsolarLatitude,
    solsPerYear: siderealOrbitDays / solarDay,
    facing: primeMeridianFacing(iau, days),
    jupiterFraction,
    jupiterDayDays: parentDayDays(siderealRotationDays, siderealOrbitDays, retrograde),
  }
}

export function jupiterSystemAt(date: Date): JupiterSystemSnapshot {
  const solar = solarSystemAt(date, 'iau')
  const jupiter = solar.planets.find((p) => p.id === 'jupiter')
  if (!jupiter) {
    throw new Error('Jupiter orbital elements are missing')
  }
  const t = centuriesSinceJ2000(date)
  return {
    at: date,
    earthPerihelionLongitude: solar.earthPerihelionLongitude,
    sunOffsetFromEarthPerihelion: wrapRad(jupiter.offsetFromEarthPerihelion + Math.PI),
    jupiter,
    moons: MOONS.map((moon) => moonState(moon, t, jupiter, solar.earthPerihelionLongitude)),
  }
}
