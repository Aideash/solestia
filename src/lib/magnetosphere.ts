import type { IauFrame } from '../data/planets.ts'
import { vecAdd, vecCross, vecDot, vecNormalize, vecScale } from './camera.ts'
import { R_EARTH_KM } from './eclipses.ts'
import { bodyFrame, equatorialToEcliptic, type Vec3 } from './kepler.ts'

/** Mean equatorial surface dipole strength, nT. */
export const EARTH_DIPOLE_B0_NT = 31_200
/** Quiet-mean solar-wind dynamic pressure (Shue 1997 typical), nPa. */
export const QUIET_PDYN_NPA = 2
const PDYN_MIN_NPA = 0.3
const PDYN_MAX_NPA = 20
/** Quiet-mean magnetopause standoff (Shue 1997 typical), Earth radii. */
export const MAGNETOPAUSE_NOSE_RE = 10.3
const SHUE_ALPHA = 0.58
/** Asymptotic magnetotail radius, Earth radii. */
export const TAIL_RADIUS_RE = 18
/** How far downtail the drawn cavity extends, Earth radii. */
export const TAIL_LENGTH_RE = 40
/** Lobe field the stretched tail settles at, nT. */
export const TAIL_LOBE_B_NT = 22

export type SolarWind = { pdynNPa: number }

export const QUIET_WIND: SolarWind = { pdynNPa: QUIET_PDYN_NPA }

export type Cavity = {
  noseRe: number
  lobeBnT: number
  flareAlpha: number
}

export function clampPdyn(pdynNPa: number): number {
  return Math.min(PDYN_MAX_NPA, Math.max(PDYN_MIN_NPA, pdynNPa))
}

/** Shue 1997 standoff with Bz = 0, Earth radii. */
export function shueNoseRe(pdynNPa: number): number {
  return 11.4 * clampPdyn(pdynNPa) ** (-1 / 6.6)
}

export function cavityFromWind(pdynNPa: number): Cavity {
  const p = clampPdyn(pdynNPa)
  return {
    noseRe: shueNoseRe(p),
    lobeBnT: TAIL_LOBE_B_NT * Math.sqrt(p / QUIET_PDYN_NPA),
    flareAlpha: SHUE_ALPHA * (1 + 0.01 * p),
  }
}
/** Current-sheet half-thickness, Earth radii. */
const TAIL_SHEET_HALF_RE = 2.5
/** Sunward distance at which the tail field is half faded, Earth radii. */
const TAIL_ONSET_RE = 2
/** Scale over which the tail field fades in behind the terminator, Earth radii. */
const TAIL_ONSET_WIDTH_RE = 5

export type Dipole = {
  axis: Vec3
  /** Unit vector perpendicular to `axis` marking magnetic longitude zero. */
  meridian: Vec3
  b0nT: number
  radiusKm: number
}

/** Component of `hint` perpendicular to `axis`, or null if the two are parallel. */
function perpendicularTo(axis: Vec3, hint: Vec3): Vec3 | null {
  const projected = vecSub3(hint, vecScale(axis, vecDot(axis, hint)))
  const mag = Math.hypot(projected.x, projected.y, projected.z)
  if (mag < 1e-6) return null
  return vecScale(projected, 1 / mag)
}

/**
 * Fallback zero-longitude direction for callers with no body frame to anchor to.
 * Crossing against the axis' smallest component keeps it well conditioned, but
 * it still swings around as the axis moves, so animated callers should pass a
 * meridian of their own.
 */
function anyPerpendicular(axis: Vec3): Vec3 {
  const ax = Math.abs(axis.x)
  const ay = Math.abs(axis.y)
  const az = Math.abs(axis.z)
  const ref =
    ax <= ay && ax <= az
      ? { x: 1, y: 0, z: 0 }
      : ay <= az
        ? { x: 0, y: 1, z: 0 }
        : { x: 0, y: 0, z: 1 }
  return vecNormalize(vecCross(axis, ref))
}

export function magneticDipoleMoment(
  axis: Vec3 = { x: 0, y: 0, z: 1 },
  meridianHint?: Vec3,
): Dipole {
  const unit = vecNormalize(axis)
  const meridian =
    (meridianHint ? perpendicularTo(unit, meridianHint) : null) ?? anyPerpendicular(unit)
  return { axis: unit, meridian, b0nT: EARTH_DIPOLE_B0_NT, radiusKm: R_EARTH_KM }
}

/**
 * IGRF-ish centered dipole: geomagnetic pole near 80.8°N, 72.6°W (east
 * longitude −72.6°), frozen in the IAU body frame.
 *
 * Magnetic longitude is anchored to the body's own prime meridian so the frame
 * co-rotates with Earth and stays continuous. Deriving it from a fixed
 * direction instead makes the seed frame lurch whenever the tilted axis passes
 * that direction's degenerate zone, which for Earth happens twice a day.
 */
export function earthDipole(iau: IauFrame, days: number): Dipole {
  const lat = (80.8 * Math.PI) / 180
  const lon = (-72.6 * Math.PI) / 180
  const { pole, primeMeridian } = bodyFrame(iau, days)
  const east = vecCross(pole, primeMeridian)
  const x = Math.cos(lat) * Math.cos(lon)
  const y = Math.cos(lat) * Math.sin(lon)
  const z = Math.sin(lat)
  const icrf = {
    x: primeMeridian.x * x + east.x * y + pole.x * z,
    y: primeMeridian.y * x + east.y * y + pole.y * z,
    z: primeMeridian.z * x + east.z * y + pole.z * z,
  }
  return magneticDipoleMoment(equatorialToEcliptic(icrf), equatorialToEcliptic(primeMeridian))
}

export function dipoleField(dipole: Dipole, positionKm: Vec3): Vec3 {
  const r = Math.hypot(positionKm.x, positionKm.y, positionKm.z)
  if (r < 1e-6) return { x: 0, y: 0, z: 0 }
  const rhat = vecScale(positionKm, 1 / r)
  const m = dipole.axis
  const md = vecDot(m, rhat)
  const geometry = vecSub3(vecScale(rhat, 3 * md), m)
  const strength = dipole.b0nT * (dipole.radiusKm / r) ** 3
  return vecScale(geometry, strength)
}

function vecSub3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

/** log(cosh u) without overflowing for large |u|. */
function lnCosh(u: number): number {
  const a = Math.abs(u)
  return a + Math.log1p(Math.exp(-2 * a)) - Math.LN2
}

/**
 * Harris-sheet stand-in for the stretching the solar wind does to the outer
 * field: antisunward in one lobe, sunward in the other, split by a current
 * sheet and faded out on the dayside. The two components are paired so the
 * total keeps ∇·B = 0, which is what lets the tracer follow it cleanly.
 */
export function tailField(
  dipole: Dipole,
  positionKm: Vec3,
  sunFromEarth: Vec3,
  wind: SolarWind = QUIET_WIND,
): Vec3 {
  const sun = vecNormalize(sunFromEarth)
  const offAxis = vecSub3(dipole.axis, vecScale(sun, vecDot(dipole.axis, sun)))
  const offAxisMag = Math.hypot(offAxis.x, offAxis.y, offAxis.z)
  if (offAxisMag < 1e-6) return { x: 0, y: 0, z: 0 }
  const north = vecScale(offAxis, 1 / offAxisMag)
  const half = TAIL_SHEET_HALF_RE * R_EARTH_KM
  const width = TAIL_ONSET_WIDTH_RE * R_EARTH_KM
  const u = (vecDot(positionKm, sun) - TAIL_ONSET_RE * R_EARTH_KM) / width
  const zeta = vecDot(positionKm, north) / half
  const fade = 0.5 * (1 - Math.tanh(u))
  const fadeSlope = -0.5 / (Math.cosh(u) ** 2 * width)
  const lobe = cavityFromWind(wind.pdynNPa).lobeBnT
  return vecAdd(
    vecScale(sun, -lobe * Math.tanh(zeta) * fade),
    vecScale(north, lobe * half * fadeSlope * lnCosh(zeta)),
  )
}

/** Dipole plus the stretched tail, in nT. */
export function magnetosphereField(
  dipole: Dipole,
  positionKm: Vec3,
  sunFromEarth: Vec3,
  wind: SolarWind = QUIET_WIND,
): Vec3 {
  return vecAdd(dipoleField(dipole, positionKm), tailField(dipole, positionKm, sunFromEarth, wind))
}

export function magnetopauseNoseKm(noseRe = MAGNETOPAUSE_NOSE_RE): number {
  return noseRe * R_EARTH_KM
}

/** Shue standoff distance at solar-zenith angle `theta`, kilometres. */
function shueRadiusKm(cosTheta: number, noseRe: number, flareAlpha = SHUE_ALPHA): number {
  return noseRe * R_EARTH_KM * (2 / Math.max(1e-6, 1 + cosTheta)) ** flareAlpha
}

/**
 * Sharpness of the blend between the Shue flare and the tail cylinder. Higher
 * powers track both surfaces more closely but round their crossing over a
 * shorter stretch of flank.
 */
const TAIL_BLEND_POWER = 8

/** Smooth stand-in for `Math.min`, within a percent of it away from a ≈ b. */
function softMinKm(a: number, b: number): number {
  const n = TAIL_BLEND_POWER
  return (a ** -n + b ** -n) ** (-1 / n)
}

/**
 * Cavity radius along the ray at solar-zenith angle `theta`, kilometres: the
 * Shue flare capped by the magnetotail cylinder it flares into, so the night
 * side stays finite rather than opening into an endless funnel.
 *
 * The cap is a soft minimum because the two surfaces cross at a shallow angle
 * around 6 R_E downtail, where taking the plain minimum leaves a >20° corner
 * in the flank. Blending costs a few percent of flare near the terminator and
 * nothing at the nose.
 */
function cavityRadiusKm(cosTheta: number, cavity: Cavity): number {
  const shue = shueRadiusKm(cosTheta, cavity.noseRe, cavity.flareAlpha)
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta))
  if (sinTheta < 1e-6) return shue
  return softMinKm(shue, (TAIL_RADIUS_RE * R_EARTH_KM) / sinTheta)
}

/**
 * Textbook cavity: the Shue surface, truncated by the magnetotail it flares
 * into and cut off at a finite length downtail.
 * `sunFromEarth` points from Earth toward the Sun.
 */
export function insideMagnetopause(
  positionKm: Vec3,
  sunFromEarth: Vec3,
  wind: SolarWind = QUIET_WIND,
): boolean {
  const cavity = cavityFromWind(wind.pdynNPa)
  const r = Math.hypot(positionKm.x, positionKm.y, positionKm.z)
  if (r < R_EARTH_KM) return true
  const sun = vecNormalize(sunFromEarth)
  const x = vecDot(positionKm, sun)
  if (-x > TAIL_LENGTH_RE * R_EARTH_KM) return false
  const cosTheta = Math.min(1, Math.max(-1, x / r))
  return r <= cavityRadiusKm(cosTheta, cavity)
}

type CavityMeridian = {
  sun: Vec3
  flank: Vec3
  profile: { along: number; radial: number }[]
}

function cavityMeridian(sunFromEarth: Vec3, samples: number, wind: SolarWind): CavityMeridian {
  const cavity = cavityFromWind(wind.pdynNPa)
  const sun = vecNormalize(sunFromEarth)
  const ref = Math.abs(sun.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 }
  const flank = vecNormalize(vecCross(vecCross(sun, ref), sun))
  const tailEnd = TAIL_LENGTH_RE * R_EARTH_KM

  const profile: { along: number; radial: number }[] = []
  for (let i = 0; i <= samples; i++) {
    const theta = (i / samples) * Math.PI
    const r = cavityRadiusKm(Math.cos(theta), cavity)
    const along = r * Math.cos(theta)
    const radial = r * Math.sin(theta)
    const previous = profile[profile.length - 1]
    if (along < -tailEnd) {
      if (previous) {
        const t = (previous.along + tailEnd) / (previous.along - along)
        profile.push({
          along: -tailEnd,
          radial: previous.radial + (radial - previous.radial) * t,
        })
      }
      break
    }
    profile.push({ along, radial })
  }
  return { sun, flank, profile }
}

function meridianPoint(sun: Vec3, flank: Vec3, along: number, radial: number, side: 1 | -1): Vec3 {
  return vecAdd(vecScale(sun, along), vecScale(flank, side * radial))
}

/**
 * Meridian-plane outline of the cavity, running up the dusk flank from the tail
 * end, around the nose, and back down the dawn flank.
 */
export function magnetopausePoints(
  sunFromEarth: Vec3,
  samples = 64,
  wind: SolarWind = QUIET_WIND,
): Vec3[] {
  const { sun, flank, profile } = cavityMeridian(sunFromEarth, samples, wind)
  const points: Vec3[] = []
  for (let i = profile.length - 1; i >= 0; i--) {
    points.push(meridianPoint(sun, flank, profile[i].along, profile[i].radial, -1))
  }
  for (let i = 1; i < profile.length; i++) {
    points.push(meridianPoint(sun, flank, profile[i].along, profile[i].radial, 1))
  }
  return points
}

/** Radial offsets of the draped wind, Earth radii, innermost first. */
const WIND_OFFSETS_RE = [1.2, 3.5, 6, 9]
/** How far sunward of Earth the incoming wind is drawn, Earth radii. */
const WIND_INCOMING_RE = 28
const WIND_INCOMING_STEPS = 8

/**
 * Solar-wind streamlines in the magnetopause meridian: parallel incoming flow
 * that drapes as offset curves of the cavity and continues downtail.
 */
export function solarWindStreamlines(
  sunFromEarth: Vec3,
  wind: SolarWind = QUIET_WIND,
  samples = 64,
): Vec3[][] {
  const { sun, flank, profile } = cavityMeridian(sunFromEarth, samples, wind)
  if (profile.length < 2) return []
  const noseAlong = profile[0].along
  const incomingFrom = WIND_INCOMING_RE * R_EARTH_KM
  const lines: Vec3[][] = []
  for (const offsetRe of WIND_OFFSETS_RE) {
    const offsetKm = offsetRe * R_EARTH_KM
    for (const side of [-1, 1] as const) {
      const line: Vec3[] = []
      for (let i = 0; i <= WIND_INCOMING_STEPS; i++) {
        const t = i / WIND_INCOMING_STEPS
        const along = incomingFrom + (noseAlong - incomingFrom) * t
        line.push(meridianPoint(sun, flank, along, offsetKm, side))
      }
      for (let i = 1; i < profile.length; i++) {
        line.push(meridianPoint(sun, flank, profile[i].along, profile[i].radial + offsetKm, side))
      }
      lines.push(line)
    }
  }
  return lines
}

export type FieldLine = Vec3[]

const MAX_TRACE_STEPS = 900

/** Coarser steps far from Earth, where the field turns slowly. */
function traceStepKm(positionKm: Vec3): number {
  const r = Math.hypot(positionKm.x, positionKm.y, positionKm.z) / R_EARTH_KM
  return Math.min(1, Math.max(0.12, 0.15 * r)) * R_EARTH_KM
}

export function traceFieldLine(
  dipole: Dipole,
  startKm: Vec3,
  sunFromEarth: Vec3,
  direction: 1 | -1,
  wind: SolarWind = QUIET_WIND,
): FieldLine {
  const points: Vec3[] = [startKm]
  let p = startKm
  const unitField = (at: Vec3): Vec3 | null => {
    const b = magnetosphereField(dipole, at, sunFromEarth, wind)
    const mag = Math.hypot(b.x, b.y, b.z)
    if (mag < 1e-8) return null
    return vecScale(b, direction / mag)
  }
  for (let i = 0; i < MAX_TRACE_STEPS; i++) {
    const ds = traceStepKm(p)
    const first = unitField(p)
    if (!first) break
    const midpoint = unitField(vecAdd(p, vecScale(first, ds / 2)))
    if (!midpoint) break
    const next = vecAdd(p, vecScale(midpoint, ds))
    const r = Math.hypot(next.x, next.y, next.z)
    if (r <= R_EARTH_KM * 1.02) {
      points.push(vecScale(next, R_EARTH_KM / r))
      break
    }
    if (!insideMagnetopause(next, sunFromEarth, wind)) break
    points.push(next)
    p = next
  }
  return points
}

/** A line with both feet on the ground already spans both hemispheres. */
function isClosed(line: FieldLine): boolean {
  const grounded = (p: Vec3) => Math.hypot(p.x, p.y, p.z) <= R_EARTH_KM * 1.001
  return line.length > 1 && grounded(line[0]) && grounded(line[line.length - 1])
}

export function dipoleFieldLines(
  dipole: Dipole,
  sunFromEarth: Vec3,
  wind: SolarWind = QUIET_WIND,
): FieldLine[] {
  const latitudes = [15, 30, 45, 55, 65, 72, 78]
  const longitudes = [0, 45, 90, 135, 180, 225, 270, 315]
  const lines: FieldLine[] = []
  const m = dipole.axis
  const e1 = dipole.meridian
  const e2 = vecNormalize(vecCross(m, e1))
  const traceFrom = (lat: number, lon: number): FieldLine => {
    const start = vecAdd(
      vecAdd(
        vecScale(e1, Math.cos(lat) * Math.cos(lon)),
        vecScale(e2, Math.cos(lat) * Math.sin(lon)),
      ),
      vecScale(m, Math.sin(lat)),
    )
    const p = vecScale(start, R_EARTH_KM * 1.05)
    const forward = traceFieldLine(dipole, p, sunFromEarth, 1, wind)
    const back = traceFieldLine(dipole, p, sunFromEarth, -1, wind)
    return [...back.slice().reverse(), ...forward.slice(1)]
  }
  for (const latDeg of latitudes) {
    const lat = (latDeg * Math.PI) / 180
    for (const lonDeg of longitudes) {
      const lon = (lonDeg * Math.PI) / 180
      const line = traceFrom(lat, lon)
      lines.push(line)
      // Open polar-cap lines never reach the far hemisphere, so the south lobe
      // stays bare unless it gets seeded from its own footpoint.
      if (!isClosed(line)) lines.push(traceFrom(-lat, lon))
    }
  }
  return lines
}
