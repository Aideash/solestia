import { ASTEROIDS, type Asteroid, type AsteroidId } from '../data/asteroids.ts'
import {
  ASTEROID_EPHEMERIS_BASE64,
  ASTEROID_EPHEMERIS_SAMPLE_COUNT,
  ASTEROID_EPHEMERIS_START_JD,
  ASTEROID_EPHEMERIS_STEP_DAYS,
} from '../data/generated/asteroidEphemerides.ts'
import {
  julianDate,
  keplerOrbitPositions,
  localSolarTime,
  primeMeridianFacing,
  solarDayDays,
  solarSystemAt,
  wrapRad,
  type Facing,
  type SunState,
  type Vec3,
} from './kepler.ts'

const VALUES_PER_SAMPLE = 6
const J2000_JD = 2451545
/** Gaussian gravitational constant squared, AU³/day². */
const SOLAR_MU = 0.0002959122082855911
const decoded = new Map<AsteroidId, Float32Array>()

export type AsteroidState = Asteroid & {
  /** Interpolated geometric heliocentric position in J2000 ecliptic AU. */
  position: Vec3
  /** Longitude in the J2000 ecliptic. */
  longitude: number
  /** Longitude measured from Earth's perihelion, matching the solar orrery. */
  offsetFromEarthPerihelion: number
  /** Actual three-dimensional heliocentric distance, AU. */
  distanceAu: number
  /** Catalog inclination converted to radians for display. */
  inclination: number
  /** Osculating mean anomaly derived from the interpolated state vector. */
  meanAnomaly: number
  /** IAU or arbitrary prime-meridian angle at J2000, radians. */
  w0: number
  /** Sidereal spin period, Earth days. */
  siderealRotationDays: number
  /** Mean solar day, Earth days. */
  solarDayDays: number
  /** Spin-axis tilt from ecliptic north, radians. */
  obliquity: number
  /** Whether the angular-velocity vector points below the ecliptic. */
  retrograde: boolean
  /** Reference sidereal orbital period, Earth days. */
  siderealOrbitDays: number
  /** Osculating longitude of perihelion in the J2000 ecliptic. */
  perihelionLongitude: number
  /** Osculating longitude of the ascending node in the J2000 ecliptic. */
  nodeLongitude: number
  /** Perihelion longitude measured from Earth's perihelion. */
  perihelionOffsetFromEarthPerihelion: number
  /** Uniform fraction of the osculating orbit since perihelion. */
  yearFraction: number
  /** Apparent local solar time at the prime meridian. */
  dayFraction: number
  /** Subsolar latitude relative to the adopted north pole, radians. */
  subsolarLatitude: number
  /** Mean solar days per orbit. */
  solsPerYear: number
  /** Prime-meridian direction projected onto the J2000 ecliptic. */
  facing: Facing
}

export type AsteroidBeltSnapshot = {
  at: Date
  earthPerihelionLongitude: number
  jupiterLongitude: number
  jupiterOffsetFromEarthPerihelion: number
  jupiterPosition: Vec3
  /** The Sun at the focus, on the Carrington W the belt view has no picker for. */
  sun: SunState
  asteroids: AsteroidState[]
}

function decode(id: AsteroidId): Float32Array {
  const existing = decoded.get(id)
  if (existing) return existing

  const binary = atob(ASTEROID_EPHEMERIS_BASE64[id])
  const view = new DataView(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index++) {
    view.setUint8(index, binary.charCodeAt(index))
  }
  const values = new Float32Array(ASTEROID_EPHEMERIS_SAMPLE_COUNT * VALUES_PER_SAMPLE)
  for (let index = 0; index < values.length; index++) {
    values[index] = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true)
  }
  decoded.set(id, values)
  return values
}

function component(values: Float32Array, sample: number, field: number): number {
  return values[sample * VALUES_PER_SAMPLE + field]
}

/**
 * Quintic Hermite interpolation of adjacent Horizons states. Dates outside the
 * generated range pin to its nearest edge.
 */
export function asteroidPositionAtJulianDate(id: AsteroidId, jd: number): Vec3 {
  return asteroidStateVectorAtJulianDate(id, jd).position
}

/** Solar two-body acceleration, which the knots imply but do not store. */
function solarAcceleration(position: Vec3): Vec3 {
  const r = Math.hypot(position.x, position.y, position.z)
  const pull = -SOLAR_MU / (r * r * r)
  return { x: pull * position.x, y: pull * position.y, z: pull * position.z }
}

function knotState(values: Float32Array, sample: number): { position: Vec3; velocity: Vec3 } {
  return {
    position: {
      x: component(values, sample, 0),
      y: component(values, sample, 1),
      z: component(values, sample, 2),
    },
    velocity: {
      x: component(values, sample, 3),
      y: component(values, sample, 4),
      z: component(values, sample, 5),
    },
  }
}

/**
 * The knots are half a year apart, which is a tenth of a belt orbit, so the
 * curve between them has to carry the shape a cubic cannot. A cubic Hermite
 * matches position and velocity at each end and lets curvature drift in
 * between; differentiating it for the velocity then loses another order, and
 * the orbit derived from that velocity is what the diagram draws. That put a
 * few percent of spurious swing into every sampled orbit, with the perihelion
 * direction sweeping degrees and snapping back at each knot — motion far larger
 * and far faster than real precession.
 *
 * Matching acceleration as well pins the curvature. It costs nothing to store,
 * because gravity gives it: the Sun holds well over 99% of the mass, so
 * −μr/|r|³ is the acceleration to within the planetary perturbations. That
 * takes the worst holdout error from 6.7e-3 AU to 2.4e-4 AU and leaves the
 * drawn orbits steady.
 */
function asteroidStateVectorAtJulianDate(
  id: AsteroidId,
  jd: number,
): { position: Vec3; velocity: Vec3 } {
  const values = decode(id)
  const last = ASTEROID_EPHEMERIS_SAMPLE_COUNT - 1
  const samplePosition = (jd - ASTEROID_EPHEMERIS_START_JD) / ASTEROID_EPHEMERIS_STEP_DAYS
  const lower = Math.min(last - 1, Math.max(0, Math.floor(samplePosition)))
  const t = Math.min(1, Math.max(0, samplePosition - lower))
  const span = ASTEROID_EPHEMERIS_STEP_DAYS

  const start = knotState(values, lower)
  const end = knotState(values, lower + 1)
  const startAcceleration = solarAcceleration(start.position)
  const endAcceleration = solarAcceleration(end.position)

  const t2 = t * t
  const t3 = t2 * t
  const t4 = t3 * t
  const t5 = t4 * t
  const h0 = 1 - 10 * t3 + 15 * t4 - 6 * t5
  const h1 = t - 6 * t3 + 8 * t4 - 3 * t5
  const h2 = 0.5 * t2 - 1.5 * t3 + 1.5 * t4 - 0.5 * t5
  const h3 = 10 * t3 - 15 * t4 + 6 * t5
  const h4 = -4 * t3 + 7 * t4 - 3 * t5
  const h5 = 0.5 * t3 - t4 + 0.5 * t5

  const d0 = (-30 * t2 + 60 * t3 - 30 * t4) / span
  const d1 = 1 - 18 * t2 + 32 * t3 - 15 * t4
  const d2 = (t - 4.5 * t2 + 6 * t3 - 2.5 * t4) * span
  const d3 = (30 * t2 - 60 * t3 + 30 * t4) / span
  const d4 = -12 * t2 + 28 * t3 - 15 * t4
  const d5 = (1.5 * t2 - 4 * t3 + 2.5 * t4) * span

  const axis = (key: 'x' | 'y' | 'z') => ({
    position:
      h0 * start.position[key] +
      h1 * span * start.velocity[key] +
      h2 * span * span * startAcceleration[key] +
      h3 * end.position[key] +
      h4 * span * end.velocity[key] +
      h5 * span * span * endAcceleration[key],
    velocity:
      d0 * start.position[key] +
      d1 * start.velocity[key] +
      d2 * startAcceleration[key] +
      d3 * end.position[key] +
      d4 * end.velocity[key] +
      d5 * endAcceleration[key],
  })

  const x = axis('x')
  const y = axis('y')
  const z = axis('z')
  return {
    position: { x: x.position, y: y.position, z: z.position },
    velocity: { x: x.velocity, y: y.velocity, z: z.velocity },
  }
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

function osculatingOrbit(
  position: Vec3,
  velocity: Vec3,
): {
  a: number
  e: number
  i: number
  Omega: number
  varpi: number
  meanAnomaly: number
  perihelionLongitude: number
} {
  const radius = Math.hypot(position.x, position.y, position.z)
  const angularMomentum = cross(position, velocity)
  const h = Math.hypot(angularMomentum.x, angularMomentum.y, angularMomentum.z)
  const speedSq = dot(velocity, velocity)
  const a = 1 / (2 / radius - speedSq / SOLAR_MU)
  const velocityCrossH = cross(velocity, angularMomentum)
  const eccentricityVector = {
    x: velocityCrossH.x / SOLAR_MU - position.x / radius,
    y: velocityCrossH.y / SOLAR_MU - position.y / radius,
    z: velocityCrossH.z / SOLAR_MU - position.z / radius,
  }
  const eccentricity = Math.hypot(eccentricityVector.x, eccentricityVector.y, eccentricityVector.z)
  const node = { x: -angularMomentum.y, y: angularMomentum.x, z: 0 }
  const nodeLength = Math.hypot(node.x, node.y)
  const Omega = nodeLength > 0 ? Math.atan2(node.y, node.x) : 0
  const i = h > 0 ? Math.acos(Math.min(1, Math.max(-1, angularMomentum.z / h))) : 0
  const eRadius = eccentricity * radius
  const cosNu =
    eRadius > 0 ? Math.max(-1, Math.min(1, dot(eccentricityVector, position) / eRadius)) : 1
  const sinNu =
    eRadius > 0 && h > 0
      ? dot(cross(eccentricityVector, position), angularMomentum) / (eRadius * h)
      : 0
  const trueAnomaly = Math.atan2(sinNu, cosNu)
  const eccentricAnomaly =
    2 *
    Math.atan2(
      Math.sqrt(Math.max(0, 1 - eccentricity)) * Math.sin(trueAnomaly / 2),
      Math.sqrt(1 + eccentricity) * Math.cos(trueAnomaly / 2),
    )
  const nodeCrossE = cross(node, eccentricityVector)
  const sinArg =
    h > 0 && nodeLength > 0 && eccentricity > 0
      ? dot(nodeCrossE, angularMomentum) / (nodeLength * eccentricity * h)
      : 0
  const cosArg =
    nodeLength > 0 && eccentricity > 0
      ? dot(node, eccentricityVector) / (nodeLength * eccentricity)
      : 1
  const varpi = wrapRad(Omega + Math.atan2(sinArg, cosArg))
  return {
    a,
    e: eccentricity,
    i,
    Omega: wrapRad(Omega),
    varpi,
    meanAnomaly: wrapRad(eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly)),
    perihelionLongitude: wrapRad(Math.atan2(eccentricityVector.y, eccentricityVector.x)),
  }
}

export function asteroidOrbitPositions(id: AsteroidId, date: Date, samples = 96): Vec3[] {
  const { position, velocity } = asteroidStateVectorAtJulianDate(id, julianDate(date))
  const { a, e, i, Omega, varpi } = osculatingOrbit(position, velocity)
  return keplerOrbitPositions(a, e, i, Omega, varpi, samples)
}

export function asteroidBeltAt(date: Date): AsteroidBeltSnapshot {
  const solar = solarSystemAt(date)
  const jupiter = solar.planets.find((planet) => planet.id === 'jupiter')
  if (!jupiter) throw new Error('Jupiter is missing from the solar-system snapshot')

  const jd = julianDate(date)
  const asteroids = ASTEROIDS.map((asteroid): AsteroidState => {
    const { position, velocity } = asteroidStateVectorAtJulianDate(asteroid.id, jd)
    const longitude = wrapRad(Math.atan2(position.y, position.x))
    const { meanAnomaly, perihelionLongitude, Omega } = osculatingOrbit(position, velocity)
    const siderealRotationDays = 360 / Math.abs(asteroid.iau.wDot)
    const retrograde = asteroid.rotation.theta > 90
    const solarDay = solarDayDays(siderealRotationDays, asteroid.periodDays, retrograde)
    const days = jd - J2000_JD
    const { dayFraction, subsolarLatitude } = localSolarTime(
      asteroid.iau,
      position,
      days,
      360 / asteroid.periodDays,
    )
    return {
      ...asteroid,
      position,
      longitude,
      offsetFromEarthPerihelion: wrapRad(longitude - solar.earthPerihelionLongitude),
      distanceAu: Math.hypot(position.x, position.y, position.z),
      inclination: (asteroid.inclinationDeg * Math.PI) / 180,
      meanAnomaly,
      w0: (asteroid.iau.w0 * Math.PI) / 180,
      siderealRotationDays,
      solarDayDays: solarDay,
      obliquity: (asteroid.rotation.theta * Math.PI) / 180,
      retrograde,
      siderealOrbitDays: asteroid.periodDays,
      perihelionLongitude,
      nodeLongitude: Omega,
      perihelionOffsetFromEarthPerihelion: wrapRad(
        perihelionLongitude - solar.earthPerihelionLongitude,
      ),
      yearFraction: meanAnomaly / (Math.PI * 2),
      dayFraction,
      subsolarLatitude,
      solsPerYear: asteroid.periodDays / solarDay,
      facing: primeMeridianFacing(asteroid.iau, days),
    }
  })

  return {
    at: date,
    earthPerihelionLongitude: solar.earthPerihelionLongitude,
    jupiterLongitude: jupiter.longitude,
    jupiterOffsetFromEarthPerihelion: jupiter.offsetFromEarthPerihelion,
    jupiterPosition: jupiter.position,
    sun: solar.sun,
    asteroids,
  }
}
