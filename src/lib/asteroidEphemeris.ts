import { ASTEROIDS, type Asteroid, type AsteroidId } from '../data/asteroids.ts'
import {
  ASTEROID_EPHEMERIS_BASE64,
  ASTEROID_EPHEMERIS_SAMPLE_COUNT,
  ASTEROID_EPHEMERIS_START_JD,
  ASTEROID_EPHEMERIS_STEP_DAYS,
} from '../data/generated/asteroidEphemerides.ts'
import {
  julianDate,
  localSolarTime,
  primeMeridianFacing,
  solarDayDays,
  solarSystemAt,
  wrapRad,
  type Facing,
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
 * Cubic Hermite interpolation of adjacent Horizons positions and velocities.
 * Dates outside the generated range pin to its nearest edge.
 */
export function asteroidPositionAtJulianDate(id: AsteroidId, jd: number): Vec3 {
  return asteroidStateVectorAtJulianDate(id, jd).position
}

function asteroidStateVectorAtJulianDate(
  id: AsteroidId,
  jd: number,
): { position: Vec3; velocity: Vec3 } {
  const values = decode(id)
  const last = ASTEROID_EPHEMERIS_SAMPLE_COUNT - 1
  const samplePosition = (jd - ASTEROID_EPHEMERIS_START_JD) / ASTEROID_EPHEMERIS_STEP_DAYS
  const lower = Math.min(last - 1, Math.max(0, Math.floor(samplePosition)))
  const t = Math.min(1, Math.max(0, samplePosition - lower))
  const t2 = t * t
  const t3 = t2 * t
  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + t
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2
  const span = ASTEROID_EPHEMERIS_STEP_DAYS

  const interpolatePosition = (positionField: number, velocityField: number) =>
    h00 * component(values, lower, positionField) +
    h10 * span * component(values, lower, velocityField) +
    h01 * component(values, lower + 1, positionField) +
    h11 * span * component(values, lower + 1, velocityField)

  const dh00 = (6 * t2 - 6 * t) / span
  const dh10 = 3 * t2 - 4 * t + 1
  const dh01 = (-6 * t2 + 6 * t) / span
  const dh11 = 3 * t2 - 2 * t
  const interpolateVelocity = (positionField: number, velocityField: number) =>
    dh00 * component(values, lower, positionField) +
    dh10 * component(values, lower, velocityField) +
    dh01 * component(values, lower + 1, positionField) +
    dh11 * component(values, lower + 1, velocityField)

  return {
    position: {
      x: interpolatePosition(0, 3),
      y: interpolatePosition(1, 4),
      z: interpolatePosition(2, 5),
    },
    velocity: {
      x: interpolateVelocity(0, 3),
      y: interpolateVelocity(1, 4),
      z: interpolateVelocity(2, 5),
    },
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
): { meanAnomaly: number; perihelionLongitude: number } {
  const radius = Math.hypot(position.x, position.y, position.z)
  const angularMomentum = cross(position, velocity)
  const h = Math.hypot(angularMomentum.x, angularMomentum.y, angularMomentum.z)
  const velocityCrossH = cross(velocity, angularMomentum)
  const eccentricityVector = {
    x: velocityCrossH.x / SOLAR_MU - position.x / radius,
    y: velocityCrossH.y / SOLAR_MU - position.y / radius,
    z: velocityCrossH.z / SOLAR_MU - position.z / radius,
  }
  const eccentricity = Math.hypot(eccentricityVector.x, eccentricityVector.y, eccentricityVector.z)
  const cosNu = Math.max(
    -1,
    Math.min(1, dot(eccentricityVector, position) / (eccentricity * radius)),
  )
  const sinNu =
    dot(cross(eccentricityVector, position), angularMomentum) / (eccentricity * radius * h)
  const trueAnomaly = Math.atan2(sinNu, cosNu)
  const eccentricAnomaly =
    2 *
    Math.atan2(
      Math.sqrt(1 - eccentricity) * Math.sin(trueAnomaly / 2),
      Math.sqrt(1 + eccentricity) * Math.cos(trueAnomaly / 2),
    )
  return {
    meanAnomaly: wrapRad(eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly)),
    perihelionLongitude: wrapRad(Math.atan2(eccentricityVector.y, eccentricityVector.x)),
  }
}

export function asteroidBeltAt(date: Date): AsteroidBeltSnapshot {
  const solar = solarSystemAt(date)
  const jupiter = solar.planets.find((planet) => planet.id === 'jupiter')
  if (!jupiter) throw new Error('Jupiter is missing from the solar-system snapshot')

  const jd = julianDate(date)
  const asteroids = ASTEROIDS.map((asteroid): AsteroidState => {
    const { position, velocity } = asteroidStateVectorAtJulianDate(asteroid.id, jd)
    const longitude = wrapRad(Math.atan2(position.y, position.x))
    const { meanAnomaly, perihelionLongitude } = osculatingOrbit(position, velocity)
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
    asteroids,
  }
}
