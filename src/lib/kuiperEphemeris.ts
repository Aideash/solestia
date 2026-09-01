import { KUIPER_OBJECTS, type KuiperObject, type KuiperObjectId } from '../data/kuiperObjects.ts'
import {
  KUIPER_EPHEMERIS_BASE64,
  KUIPER_EPHEMERIS_SAMPLE_COUNT,
  KUIPER_EPHEMERIS_START_JD,
  KUIPER_EPHEMERIS_STEP_DAYS,
} from '../data/generated/kuiperEphemerides.ts'
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
import { osculatingOrbit, PackedEphemeris, SOLAR_SYSTEM_MU } from './packedEphemeris.ts'

const J2000_JD = 2451545

/**
 * These bodies are referred to the solar-system barycenter, not the Sun. Every
 * planet is interior to them, so Jupiter tugs the Sun and a Kuiper object
 * almost equally: in a Sun-centered frame that shared motion has nowhere to go
 * and reappears as a spurious 11.9-year swing in the derived orbit, worst where
 * the eccentricity is small. Quaoar's perihelion direction swung 21 degrees
 * that way; referred to the barycenter it swings half a degree.
 */
const ephemeris = new PackedEphemeris<KuiperObjectId>({
  encoded: KUIPER_EPHEMERIS_BASE64,
  startJd: KUIPER_EPHEMERIS_START_JD,
  stepDays: KUIPER_EPHEMERIS_STEP_DAYS,
  sampleCount: KUIPER_EPHEMERIS_SAMPLE_COUNT,
  mu: SOLAR_SYSTEM_MU,
})

export type KuiperObjectState = KuiperObject & {
  position: Vec3
  longitude: number
  offsetFromEarthPerihelion: number
  distanceAu: number
  inclination: number
  meanAnomaly: number
  w0: number
  siderealRotationDays: number
  solarDayDays: number
  obliquity: number
  retrograde: boolean
  siderealOrbitDays: number
  perihelionLongitude: number
  nodeLongitude: number
  perihelionOffsetFromEarthPerihelion: number
  yearFraction: number
  dayFraction: number
  subsolarLatitude: number
  solsPerYear: number
  facing: Facing
}

export type KuiperBeltSnapshot = {
  at: Date
  earthPerihelionLongitude: number
  neptuneLongitude: number
  neptuneOffsetFromEarthPerihelion: number
  neptunePosition: Vec3
  sun: SunState
  objects: KuiperObjectState[]
}

export function kuiperObjectPositionAtJulianDate(id: KuiperObjectId, jd: number): Vec3 {
  return ephemeris.stateAt(id, jd).position
}

export function kuiperObjectOrbitPositions(id: KuiperObjectId, date: Date, samples = 128): Vec3[] {
  const { a, e, i, Omega, varpi } = ephemeris.orbitAt(id, julianDate(date))
  return keplerOrbitPositions(a, e, i, Omega, varpi, samples)
}

export function kuiperBeltAt(date: Date): KuiperBeltSnapshot {
  const solar = solarSystemAt(date)
  const neptune = solar.planets.find((planet) => planet.id === 'neptune')
  if (!neptune) throw new Error('Neptune is missing from the solar-system snapshot')

  const jd = julianDate(date)
  const objects = KUIPER_OBJECTS.map((object): KuiperObjectState => {
    const { position, velocity } = ephemeris.stateAt(object.id, jd)
    const longitude = wrapRad(Math.atan2(position.y, position.x))
    const { meanAnomaly, perihelionLongitude, Omega } = osculatingOrbit(
      position,
      velocity,
      ephemeris.mu,
    )
    const siderealRotationDays = 360 / Math.abs(object.iau.wDot)
    const retrograde = object.rotation.theta > 90
    const solarDay = solarDayDays(siderealRotationDays, object.periodDays, retrograde)
    const days = jd - J2000_JD
    const { dayFraction, subsolarLatitude } = localSolarTime(
      object.iau,
      position,
      days,
      360 / object.periodDays,
    )
    return {
      ...object,
      position,
      longitude,
      offsetFromEarthPerihelion: wrapRad(longitude - solar.earthPerihelionLongitude),
      distanceAu: Math.hypot(position.x, position.y, position.z),
      inclination: (object.inclinationDeg * Math.PI) / 180,
      meanAnomaly,
      w0: (object.iau.w0 * Math.PI) / 180,
      siderealRotationDays,
      solarDayDays: solarDay,
      obliquity: (object.rotation.theta * Math.PI) / 180,
      retrograde,
      siderealOrbitDays: object.periodDays,
      perihelionLongitude,
      nodeLongitude: Omega,
      perihelionOffsetFromEarthPerihelion: wrapRad(
        perihelionLongitude - solar.earthPerihelionLongitude,
      ),
      yearFraction: meanAnomaly / (Math.PI * 2),
      dayFraction,
      subsolarLatitude,
      solsPerYear: object.periodDays / solarDay,
      facing: primeMeridianFacing(object.iau, days),
    }
  })

  return {
    at: date,
    earthPerihelionLongitude: solar.earthPerihelionLongitude,
    neptuneLongitude: neptune.longitude,
    neptuneOffsetFromEarthPerihelion: neptune.offsetFromEarthPerihelion,
    neptunePosition: neptune.position,
    sun: solar.sun,
    objects,
  }
}
