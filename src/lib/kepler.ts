import { MOONS, type Satellite, type SatelliteElements, type SatelliteId } from '../data/moons.ts'
import { PLANET_SYSTEMS, type PlanetSystemId } from '../data/planetSystems.ts'
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
 * A direction as a compass bearing in a reference plane: `longitude` is where
 * it points, and `inPlane` is how much of the unit vector survives the
 * projection — 1 when it lies in the plane, 0 when it points at a pole of that
 * plane and the longitude carries no information. Uranus in the ecliptic, whose
 * pole is nearly in the plane, passes through that degenerate case twice a spin.
 */
export type Facing = {
  /** Azimuth in the reference plane, radians. */
  longitude: number
  /** Length of the projection onto the reference plane, 0 to 1. */
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
 * A natural satellite at one epoch. Distances for the table are `aKm`; `a` is
 * the same semi-major axis in AU so its position can be chained to the parent.
 */
export type SatelliteState = Omit<PlanetState, 'id'> & {
  id: SatelliteId
  aKm: number
  /**
   * Where the parent planet sits on the solar-day dial: 0 opposite the prime
   * meridian, 0.5 when the parent stands on the prime meridian.
   */
  parentFraction: number
  /**
   * Synodic day relative to the parent: how long until it stands on the same
   * meridian again. `Infinity` under a 1:1 spin-orbit lock.
   */
  parentDayDays: number
  /** Planetocentric azimuth in the parent IAU equator, from that equator’s ICRF node. */
  equatorLongitude: number
  /** Periapsis azimuth in the parent IAU equator. */
  equatorPeriapsis: number
  /** Prime meridian projected onto the parent IAU equator. */
  equatorFacing: Facing
}

export type PlanetSystemSnapshot = {
  at: Date
  earthPerihelionLongitude: number
  /** Screen offset of the Sun in the ecliptic (anti-parent heliocentric longitude). */
  sunOffsetFromEarthPerihelion: number
  /**
   * Azimuth of diagram-up in the parent IAU equator (Earth perihelion projected
   * into that plane, or the equator–ecliptic node if that projection vanishes).
   */
  equatorOrigin: number
  /** Sun direction from the parent, in the parent IAU equator. */
  sunEquator: Facing
  /** Parent prime meridian projected onto its own IAU equator. */
  parentEquatorFacing: Facing
  system: PlanetSystemId
  parent: PlanetState
  satellites: SatelliteState[]
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

function radToDeg(rad: number): number {
  return rad / DEG
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
 * synchronous. The locked moons sit at 1e-7 to 1e-6, which is the rounding in
 * JPL's tabulated periods rather than any real drift.
 */
const SYNCHRONOUS_TOLERANCE = 1e-3

/**
 * Synodic day for a satellite watching its own primary, the spin beat against
 * the orbit. `orbitRetrograde` is true when the orbital angular momentum points
 * opposite IAU north (the Uranian majors orbit that way). `Infinity` for a
 * synchronous rotator: the primary hangs at a fixed point in the sky, so it
 * never comes back to a meridian because it never left.
 */
export function parentDayDays(
  siderealRotationDays: number,
  siderealOrbitDays: number,
  retrograde: boolean,
  orbitRetrograde = false,
): number {
  const spinPerDay = (retrograde ? -1 : 1) / siderealRotationDays
  const orbitPerDay = (orbitRetrograde ? -1 : 1) / siderealOrbitDays
  const beat = Math.abs(spinPerDay - orbitPerDay)
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
  if (el.periodIsSidereal) return 360 / el.periodDays
  return 360 / el.periodDays + rate.apsis + rate.node
}

/**
 * The compact IAU 2009 lunar orientation series. Later IAU reports recommend
 * numerical ephemerides for cartography, but this series is appropriately
 * matched to the mean-element accuracy used by this orrery.
 */
export function satelliteIauFrame(satellite: Satellite, days: number): IauFrame {
  if (satellite.id !== 'moon') return satellite.iau

  const t = days / 36525
  const angles = [
    125.045 - 0.0529921 * days,
    250.089 - 0.1059842 * days,
    260.008 + 13.0120009 * days,
    176.625 + 13.3407154 * days,
    357.529 + 0.9856003 * days,
    311.589 + 26.4057084 * days,
    134.963 + 13.064993 * days,
    276.617 + 0.3287146 * days,
    34.226 + 1.7484877 * days,
    15.134 - 0.1589763 * days,
    119.743 + 0.0036096 * days,
    239.961 + 0.1643573 * days,
    25.053 + 12.9590088 * days,
  ].map(degToRad)
  const sin = (index: number) => Math.sin(angles[index - 1])
  const cos = (index: number) => Math.cos(angles[index - 1])
  const ra =
    269.9949 +
    0.0031 * t -
    3.8787 * sin(1) -
    0.1204 * sin(2) +
    0.07 * sin(3) -
    0.0172 * sin(4) +
    0.0072 * sin(6) -
    0.0052 * sin(10) +
    0.0043 * sin(13)
  const dec =
    66.5392 +
    0.013 * t +
    1.5419 * cos(1) +
    0.0239 * cos(2) -
    0.0278 * cos(3) +
    0.0068 * cos(4) -
    0.0029 * cos(6) +
    0.0009 * cos(7) +
    0.0008 * cos(10) -
    0.0009 * cos(13)
  const w =
    38.3213 +
    satellite.iau.wDot * days -
    1.4e-12 * days * days +
    3.561 * sin(1) +
    0.1208 * sin(2) -
    0.0642 * sin(3) +
    0.0158 * sin(4) +
    0.0252 * sin(5) -
    0.0066 * sin(6) -
    0.0047 * sin(7) -
    0.0046 * sin(8) +
    0.0028 * sin(9) +
    0.0052 * sin(10) +
    0.004 * sin(11) +
    0.0019 * sin(12) -
    0.0044 * sin(13)
  return {
    ra0: ra,
    raDot: 0,
    dec0: dec,
    decDot: 0,
    w0: w - satellite.iau.wDot * days,
    wDot: satellite.iau.wDot,
  }
}

function evaluateSatellite(satellite: Satellite, days: number) {
  const el = satellite.elements
  const rate = precessionRates(el)
  const meanAnomalyRate = el.periodIsSidereal
    ? 360 / el.periodDays - rate.apsis - rate.node
    : 360 / el.periodDays
  const M = el.M0 + meanAnomalyRate * days
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

/** Dot product of two ICRF poles given as RA/Dec in degrees. */
function icrfPoleDot(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const a = degToRad(ra1)
  const d1 = degToRad(dec1)
  const b = degToRad(ra2)
  const d2 = degToRad(dec2)
  return Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(a - b)
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

type EquatorFrame = { pole: Vec3; node: Vec3; east: Vec3 }

/** Parent IAU equator in ICRF: +z is IAU north, +x is that equator’s ICRF node. */
function parentEquatorFrame(iau: IauFrame, days: number): EquatorFrame {
  const { pole, node } = bodyFrame(iau, days)
  return { pole, node, east: cross(pole, node) }
}

function projectIcrfOntoEquator(v: Vec3, frame: EquatorFrame): Facing {
  const x = dot(v, frame.node)
  const y = dot(v, frame.east)
  const r = Math.hypot(v.x, v.y, v.z)
  return {
    longitude: wrapRad(Math.atan2(y, x)),
    inPlane: r > 0 ? Math.hypot(x, y) / r : 0,
  }
}

function projectOntoEquator(ecliptic: Vec3, frame: EquatorFrame): Facing {
  return projectIcrfOntoEquator(eclipticToEquatorial(ecliptic), frame)
}

/** Earth perihelion in the parent equator, or the equator–ecliptic node if that vanishes. */
function equatorOriginAzimuth(earthVarpi: number, frame: EquatorFrame): number {
  const perihelion = projectOntoEquator(
    { x: Math.cos(earthVarpi), y: Math.sin(earthVarpi), z: 0 },
    frame,
  )
  if (perihelion.inPlane >= 0.15) return perihelion.longitude
  const eclipticNorth = eclipticToEquatorial({ x: 0, y: 0, z: 1 })
  const lineOfNodes = cross(eclipticNorth, frame.pole)
  return projectIcrfOntoEquator(lineOfNodes, frame).longitude
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

function satelliteState(
  satellite: Satellite,
  t: number,
  parent: PlanetState,
  earthVarpi: number,
  equator: EquatorFrame,
): SatelliteState {
  const days = t * 36525
  const { a, aKm, e, M, i, Omega, varpi } = evaluateSatellite(satellite, days)
  const meanAnomaly = wrapRadSigned(M)
  const E = eccentricAnomaly(meanAnomaly, e)
  const nu = trueAnomalyFromE(E, e)
  const inLaplace = heliocentricEcliptic(a, e, E, i, Omega, varpi)
  const relative = laplaceToEcliptic(
    inLaplace,
    satellite.elements.laplaceRa,
    satellite.elements.laplaceDec,
  )
  const periLaplace = heliocentricEcliptic(a, e, 0, i, Omega, varpi)
  const peri = laplaceToEcliptic(
    periLaplace,
    satellite.elements.laplaceRa,
    satellite.elements.laplaceDec,
  )
  const longitude = wrapRad(Math.atan2(relative.y, relative.x))
  const perihelionLongitude = wrapRad(Math.atan2(peri.y, peri.x))
  const iau = satelliteIauFrame(satellite, days)
  const siderealRotationDays = 360 / Math.abs(iau.wDot)
  let pole = equatorialToEcliptic(bodyFrame(iau, days).pole)
  // Retrograde rotators: IAU north is opposite the spin, same as the planet table.
  if (iau.wDot < 0) pole = { x: -pole.x, y: -pole.y, z: -pole.z }
  const theta = Math.acos(pole.z)
  const phi = wrapRad(Math.atan2(pole.y, pole.x))
  const retrograde = theta > Math.PI / 2
  const siderealOrbitDays = 360 / siderealMeanMotion(satellite.elements)
  const position = addVec(parent.position, relative)
  const sunOrbitDegPerDay = 360 / parent.siderealOrbitDays
  const { dayFraction, subsolarLatitude } = localSolarTime(iau, position, days, sunOrbitDegPerDay)
  const towardParent = { x: -relative.x, y: -relative.y, z: -relative.z }
  const { dayFraction: parentFraction } = localTargetTime(
    iau,
    towardParent,
    days,
    sunOrbitDegPerDay,
  )
  const solarDay = solarDayDays(siderealRotationDays, parent.siderealOrbitDays, retrograde)
  const spinRate = (2 * Math.PI) / siderealRotationDays
  const orbitRetrograde =
    icrfPoleDot(satellite.elements.laplaceRa, satellite.elements.laplaceDec, iau.ra0, iau.dec0) < 0
  return {
    id: satellite.id,
    name: satellite.name,
    color: satellite.color,
    symbol: satellite.symbol,
    a,
    aKm,
    e,
    inclination: i,
    w0: wrapRad(degToRad(satelliteIauFrame(satellite, 0).w0)),
    meanAnomaly: wrapRad(meanAnomaly),
    trueAnomaly: wrapRad(nu),
    perihelionLongitude,
    longitude,
    offsetFromEarthPerihelion: wrapRad(longitude - earthVarpi),
    rotation: { r: spinRate, theta: radToDeg(theta), phi: radToDeg(phi) },
    siderealRotationDays,
    solarDayDays: solarDay,
    obliquity: theta,
    retrograde,
    siderealOrbitDays,
    position,
    yearFraction: wrapRad(meanAnomaly) / (Math.PI * 2),
    dayFraction,
    subsolarLatitude,
    solsPerYear: siderealOrbitDays / solarDay,
    facing: primeMeridianFacing(iau, days),
    equatorLongitude: projectOntoEquator(relative, equator).longitude,
    equatorPeriapsis: projectOntoEquator(peri, equator).longitude,
    equatorFacing: projectIcrfOntoEquator(bodyFrame(iau, days).primeMeridian, equator),
    parentFraction,
    parentDayDays: parentDayDays(
      siderealRotationDays,
      siderealOrbitDays,
      retrograde,
      orbitRetrograde,
    ),
  }
}

export function planetSystemAt(date: Date, systemId: PlanetSystemId): PlanetSystemSnapshot {
  const solar = solarSystemAt(date, 'iau')
  const system = PLANET_SYSTEMS[systemId]
  const parent = solar.planets.find((planet) => planet.id === system.id)
  const parentBody = PLANETS.find((planet) => planet.id === system.id)
  if (!parent || !parentBody) {
    throw new Error(`${system.name} orbital elements are missing`)
  }
  const t = centuriesSinceJ2000(date)
  const days = t * 36525
  const parentIau = frameFor(parentBody, 'iau')
  const equator = parentEquatorFrame(parentIau, days)
  const equatorOrigin = equatorOriginAzimuth(solar.earthPerihelionLongitude, equator)
  const towardSun = { x: -parent.position.x, y: -parent.position.y, z: -parent.position.z }
  const satellites = MOONS.filter((satellite) => satellite.parent === system.id)
  return {
    at: date,
    earthPerihelionLongitude: solar.earthPerihelionLongitude,
    sunOffsetFromEarthPerihelion: wrapRad(parent.offsetFromEarthPerihelion + Math.PI),
    equatorOrigin,
    sunEquator: projectOntoEquator(towardSun, equator),
    parentEquatorFacing: projectIcrfOntoEquator(bodyFrame(parentIau, days).primeMeridian, equator),
    system: system.id,
    parent,
    satellites: satellites.map((satellite) =>
      satelliteState(satellite, t, parent, solar.earthPerihelionLongitude, equator),
    ),
  }
}

export const jupiterSystemAt = (date: Date) => planetSystemAt(date, 'jupiter')
