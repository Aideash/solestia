import {
  METEOR_PARENTS,
  METEOR_PARENT_BY_ID,
  type MeteorParent,
  type MeteorParentId,
  type MeteorShower,
} from '../data/meteorShowers.ts'
import {
  METEOR_EPHEMERIS_BASE64,
  METEOR_EPHEMERIS_SAMPLE_COUNT,
  METEOR_EPHEMERIS_START_JD,
  METEOR_EPHEMERIS_STEP_DAYS,
} from '../data/generated/meteorEphemerides.ts'
import {
  argumentOfPerihelion,
  eccentricAnomalyFromTrue,
  heliocentricEcliptic,
  julianDate,
  keplerOrbitPositions,
  nodeTrueAnomalies,
  solarSystemAt,
  wrapRad,
  type Facing,
  type PlanetState,
  type SunState,
  type Vec3,
} from './kepler.ts'
import { osculatingOrbit, PackedEphemeris, SOLAR_MU } from './packedEphemeris.ts'

/**
 * Shower parents are Earth-crossing and referred to the Sun, like the main
 * belt — not the barycenter the Kuiper set uses.
 */
const ephemeris = new PackedEphemeris<MeteorParentId>({
  encoded: METEOR_EPHEMERIS_BASE64,
  startJd: METEOR_EPHEMERIS_START_JD,
  stepDays: METEOR_EPHEMERIS_STEP_DAYS,
  sampleCount: METEOR_EPHEMERIS_SAMPLE_COUNT,
  mu: SOLAR_MU,
  // High-e parents (Phaethon especially) race through perihelion between the
  // 30-day knots. A Cartesian Hermite then chords through the Sun, the
  // two-body fit goes wild, and the body leaves the drawn ellipse.
  interpolation: 'kepler',
})

export type EarthCrossing = {
  /** Heliocentric position near Earth’s orbit on the osculating ellipse. */
  position: Vec3
  /** True anomaly of the crossing, radians. */
  trueAnomaly: number
  /** Associated shower when the parent has a named node (Halley has two). */
  shower?: MeteorShower
}

export type MeteorParentState = MeteorParent & {
  position: Vec3
  longitude: number
  offsetFromEarthPerihelion: number
  distanceAu: number
  inclination: number
  meanAnomaly: number
  siderealOrbitDays: number
  perihelionLongitude: number
  nodeLongitude: number
  perihelionOffsetFromEarthPerihelion: number
  /** Uniform fraction of the osculating orbit since perihelion. */
  yearFraction: number
  /** Placeholder so rim-only PlanetClock can reuse ClockBody. */
  dayFraction: number
  subsolarLatitude: number
  solsPerYear: number
  retrograde: boolean
  /** Osculating perihelion and aphelion distances, AU. */
  perihelionAu: number
  aphelionAu: number
  /** Osculating elements used to stroke the debris-trail orbit. Size and shape
   * come from the catalog so near-perihelion hyperbolic fits cannot break the
   * diagram; node and perihelion follow the live state. */
  osculating: { a: number; e: number; i: number; Omega: number; varpi: number }
  /** Anti-sunward direction: body-from-Sun unit vector projected to ecliptic. */
  tail: Facing
  /** Osculating approaches to Earth’s orbit (near-ecliptic r ≈ 1, or closest node). */
  earthCrossings: EarthCrossing[]
}

export type MeteorShowersSnapshot = {
  at: Date
  earthPerihelionLongitude: number
  sun: SunState
  mercury: PlanetState
  earth: PlanetState
  neptune: PlanetState
  parents: MeteorParentState[]
}

/** True anomalies where r(ν) = radiusAu on an ellipse, if any. */
export function trueAnomaliesAtRadius(a: number, e: number, radiusAu = 1): number[] {
  if (!(a > 0) || !(e >= 0) || e >= 1 || !(radiusAu > 0)) return []
  const peri = a * (1 - e)
  const apo = a * (1 + e)
  if (radiusAu < peri - 1e-12 || radiusAu > apo + 1e-12) return []
  if (e < 1e-12) {
    // Circular: every true anomaly sits at a; treat as a single representative.
    return Math.abs(a - radiusAu) < 1e-9 ? [0] : []
  }
  const cosNu = ((a * (1 - e * e)) / radiusAu - 1) / e
  if (cosNu > 1 + 1e-12 || cosNu < -1 - 1e-12) return []
  const clamped = Math.min(1, Math.max(-1, cosNu))
  const nu = Math.acos(clamped)
  if (nu < 1e-12 || Math.abs(nu - Math.PI) < 1e-12) return [wrapRad(nu)]
  return [wrapRad(nu), wrapRad(-nu)]
}

function crossingPosition(
  a: number,
  e: number,
  i: number,
  Omega: number,
  varpi: number,
  trueAnomaly: number,
): Vec3 {
  const E = eccentricAnomalyFromTrue(trueAnomaly, e)
  return heliocentricEcliptic(a, e, E, i, Omega, varpi)
}

/**
 * Minimum cylindrical radius ρ = √(x²+y²) for an r ≈ 1 AU mark to count as an
 * Earth-path approach. High-latitude r = 1 piercings foreshorten inside the
 * 1 AU ring under top-down cylindrical projection; this drops them.
 */
const EARTH_CROSSING_MIN_RHO = 0.85

/** Nodes within this heliocentric distance of 1 AU are kept as dual crossings. */
const EARTH_NODE_RADIUS_TOL = 0.25

/**
 * Label Halley's two Earth approaches by ecliptic latitude sign: η Aquariids
 * near the descending node (south), Orionids near the ascending (north). Other
 * parents keep a single shower label on every crossing.
 */
function labelCrossings(
  parent: MeteorParent,
  crossings: { position: Vec3; trueAnomaly: number }[],
): EarthCrossing[] {
  if (parent.id === 'halley' && crossings.length === 2 && parent.showers.length >= 2) {
    const sorted = [...crossings].sort((a, b) => a.position.z - b.position.z)
    const eta = parent.showers.find((shower) => shower.name.includes('Aquariid'))
    const orion = parent.showers.find((shower) => shower.name.includes('Orionid'))
    return [
      { ...sorted[0], shower: eta ?? parent.showers[0] },
      { ...sorted[1], shower: orion ?? parent.showers[1] },
    ]
  }
  const shower = parent.showers.length === 1 ? parent.showers[0] : undefined
  return crossings.map((crossing) => ({ ...crossing, shower }))
}

function cylindricalRho(position: Vec3): number {
  return Math.hypot(position.x, position.y)
}

function heliocentricRadius(position: Vec3): number {
  return Math.hypot(position.x, position.y, position.z)
}

/**
 * Ecliptic-node candidates. Prefer nodes near 1 AU; otherwise the single node
 * closest to Earth’s distance (parents like 2003 EH1 with q > 1 AU).
 */
function nodeEarthApproaches(
  a: number,
  e: number,
  i: number,
  Omega: number,
  varpi: number,
): { position: Vec3; trueAnomaly: number }[] {
  const omega = argumentOfPerihelion(varpi, Omega)
  const nodes = nodeTrueAnomalies(omega)
  const candidates = [nodes.ascending, nodes.descending].map((trueAnomaly) => ({
    trueAnomaly,
    position: crossingPosition(a, e, i, Omega, varpi, trueAnomaly),
  }))
  const nearEarth = candidates.filter(
    (crossing) => Math.abs(heliocentricRadius(crossing.position) - 1) <= EARTH_NODE_RADIUS_TOL,
  )
  if (nearEarth.length > 0) return nearEarth
  return candidates.reduce<{ position: Vec3; trueAnomaly: number }[]>((best, crossing) => {
    if (best.length === 0) return [crossing]
    const bestDist = Math.abs(heliocentricRadius(best[0].position) - 1)
    const nextDist = Math.abs(heliocentricRadius(crossing.position) - 1)
    return nextDist < bestDist ? [crossing] : best
  }, [])
}

/**
 * Approaches to Earth’s orbit on the osculating ellipse: r ≈ 1 AU points that
 * also sit near the ecliptic (cylindrical ρ ≥ EARTH_CROSSING_MIN_RHO), or the
 * ecliptic node nearest 1 AU when the ellipse never reaches Earth.
 */
export function earthCrossingsForOrbit(
  parent: MeteorParent,
  a: number,
  e: number,
  i: number,
  Omega: number,
  varpi: number,
): EarthCrossing[] {
  const anomalies = trueAnomaliesAtRadius(a, e, 1)
  const atRadius = anomalies
    .map((trueAnomaly) => ({
      trueAnomaly,
      position: crossingPosition(a, e, i, Omega, varpi, trueAnomaly),
    }))
    .filter((crossing) => cylindricalRho(crossing.position) >= EARTH_CROSSING_MIN_RHO)
  const crossings = atRadius.length > 0 ? atRadius : nodeEarthApproaches(a, e, i, Omega, varpi)
  return labelCrossings(parent, crossings)
}

/** Anti-sunward facing: same azimuth as the heliocentric position vector. */
export function antiSunTail(position: Vec3): Facing {
  const length = Math.hypot(position.x, position.y, position.z)
  if (length < 1e-12) {
    return { longitude: 0, inPlane: 0, direction: { x: 0, y: 0, z: 0 } }
  }
  const direction = { x: position.x / length, y: position.y / length, z: position.z / length }
  const inPlane = Math.hypot(direction.x, direction.y)
  return {
    longitude: wrapRad(Math.atan2(position.y, position.x)),
    inPlane,
    direction,
  }
}

export function meteorParentPositionAtJulianDate(id: MeteorParentId, jd: number): Vec3 {
  return ephemeris.stateAt(id, jd).position
}

export function meteorParentOrbitPositions(id: MeteorParentId, date: Date, samples = 128): Vec3[] {
  const parent = METEOR_PARENT_BY_ID[id]
  const orbit = ephemeris.orbitAt(id, julianDate(date))
  // Catalog a,e keep the debris trail bound when the heliocentric two-body fit
  // goes hyperbolic near perihelion (Phaethon). Orientation still follows the state.
  return keplerOrbitPositions(
    parent.a,
    parent.e,
    (parent.inclinationDeg * Math.PI) / 180,
    orbit.Omega,
    orbit.varpi,
    samples,
  )
}

/** Bound ellipse used to stroke the debris trail and pin the outer scale. */
function trailOrbit(
  parent: MeteorParent,
  orbit: { Omega: number; varpi: number; perihelionLongitude: number },
): { a: number; e: number; i: number; Omega: number; varpi: number } {
  return {
    a: parent.a,
    e: parent.e,
    i: (parent.inclinationDeg * Math.PI) / 180,
    Omega: Number.isFinite(orbit.Omega) ? orbit.Omega : 0,
    varpi: Number.isFinite(orbit.varpi) ? orbit.varpi : 0,
  }
}

export function meteorShowersAt(date: Date): MeteorShowersSnapshot {
  const solar = solarSystemAt(date)
  const mercury = solar.planets.find((planet) => planet.id === 'mercury')
  const earth = solar.planets.find((planet) => planet.id === 'earth')
  const neptune = solar.planets.find((planet) => planet.id === 'neptune')
  if (!mercury || !earth || !neptune) {
    throw new Error('Mercury, Earth, or Neptune missing from the solar-system snapshot')
  }

  const jd = julianDate(date)
  const parents = METEOR_PARENTS.map((parent): MeteorParentState => {
    const { position, velocity } = ephemeris.stateAt(parent.id, jd)
    const longitude = wrapRad(Math.atan2(position.y, position.x))
    const orbit = osculatingOrbit(position, velocity, ephemeris.mu)
    const trail = trailOrbit(parent, orbit)
    // Instantaneous two-body a,e go hyperbolic near Phaethon’s perihelion; the
    // rim clock still wants a finite fraction of the catalog ellipse.
    const bound = orbit.a > 0 && orbit.e < 1 && Number.isFinite(orbit.meanAnomaly)
    return {
      ...parent,
      position,
      longitude,
      offsetFromEarthPerihelion: wrapRad(longitude - solar.earthPerihelionLongitude),
      distanceAu: Math.hypot(position.x, position.y, position.z),
      inclination: trail.i,
      meanAnomaly: bound ? orbit.meanAnomaly : 0,
      siderealOrbitDays: parent.periodDays,
      perihelionLongitude: bound ? orbit.perihelionLongitude : trail.varpi,
      nodeLongitude: trail.Omega,
      perihelionOffsetFromEarthPerihelion: wrapRad(
        (bound ? orbit.perihelionLongitude : trail.varpi) - solar.earthPerihelionLongitude,
      ),
      yearFraction: bound ? orbit.meanAnomaly / (Math.PI * 2) : 0,
      dayFraction: 0,
      subsolarLatitude: 0,
      solsPerYear: 1,
      retrograde: false,
      perihelionAu: trail.a * (1 - trail.e),
      aphelionAu: trail.a * (1 + trail.e),
      osculating: trail,
      tail: antiSunTail(position),
      earthCrossings: earthCrossingsForOrbit(
        parent,
        trail.a,
        trail.e,
        trail.i,
        trail.Omega,
        trail.varpi,
      ),
    }
  })

  return {
    at: date,
    earthPerihelionLongitude: solar.earthPerihelionLongitude,
    sun: solar.sun,
    mercury,
    earth,
    neptune,
    parents,
  }
}
