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
import { osculatingOrbit, PackedEphemeris, SOLAR_MU } from './packedEphemeris.ts'

const J2000_JD = 2451545

/**
 * Main-belt bodies stay referred to the Sun. Jupiter lies outside them, so the
 * barycenter is not a focus they orbit: switching this frame to the barycenter
 * makes the derived perihelion direction three to four times less steady. The
 * Kuiper set, which lies outside every planet, takes the opposite choice.
 */
const ephemeris = new PackedEphemeris<AsteroidId>({
  encoded: ASTEROID_EPHEMERIS_BASE64,
  startJd: ASTEROID_EPHEMERIS_START_JD,
  stepDays: ASTEROID_EPHEMERIS_STEP_DAYS,
  sampleCount: ASTEROID_EPHEMERIS_SAMPLE_COUNT,
  mu: SOLAR_MU,
})

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

/**
 * Quintic Hermite interpolation of adjacent Horizons states. Dates outside the
 * generated range pin to its nearest edge.
 */
export function asteroidPositionAtJulianDate(id: AsteroidId, jd: number): Vec3 {
  return ephemeris.stateAt(id, jd).position
}

export function asteroidOrbitPositions(id: AsteroidId, date: Date, samples = 96): Vec3[] {
  const { a, e, i, Omega, varpi } = ephemeris.orbitAt(id, julianDate(date))
  return keplerOrbitPositions(a, e, i, Omega, varpi, samples)
}

export function asteroidBeltAt(date: Date): AsteroidBeltSnapshot {
  const solar = solarSystemAt(date)
  const jupiter = solar.planets.find((planet) => planet.id === 'jupiter')
  if (!jupiter) throw new Error('Jupiter is missing from the solar-system snapshot')

  const jd = julianDate(date)
  const asteroids = ASTEROIDS.map((asteroid): AsteroidState => {
    const { position, velocity } = ephemeris.stateAt(asteroid.id, jd)
    const longitude = wrapRad(Math.atan2(position.y, position.x))
    const { meanAnomaly, perihelionLongitude, Omega } = osculatingOrbit(
      position,
      velocity,
      ephemeris.mu,
    )
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
