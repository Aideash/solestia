import { PLANETS, frameFor } from '../data/planets.ts'
import { vecCross, vecNormalize, vecSub } from './camera.ts'
import {
  bracketCrossings,
  horizonState,
  type HorizonCrossing,
  type PolarCap,
  type SeasonMark,
  type SeasonMarkKind,
} from './earthLocalSky.ts'
import {
  centuriesSinceJ2000,
  KM_PER_AU,
  localTargetTime,
  planetSystemAt,
  type PlanetSystemSnapshot,
  type SatelliteState,
  type Vec3,
} from './kepler.ts'
import { clancyMarsYear, dateAtLs } from './marsTime.ts'

export type { HorizonCrossing, PolarCap, SeasonMark, SeasonMarkKind }

export type MarsMoonSky = {
  /** Local hour-angle fraction (0.5 = moon on the meridian). */
  fraction: number
  /** 0 at new, 1 at full. */
  illuminated: number
  waxing: boolean
  /**
   * Apparent-size factor from distance: 0 at apogee (smallest), 1 at perigee
   * (largest). Clamped to the mean ellipse.
   */
  sizeFactor: number
  /**
   * Rise/set ticks on the moon-hand dial (hour-angle fractions), not solar
   * local time — same sense as `fraction`, so the hand crosses them at rise/set.
   */
  crossings: HorizonCrossing[]
  polar: PolarCap | null
  sublatitude: number
}

export type MarsLocalSky = {
  yearFraction: number
  solsPerYear: number
  color: string
  /** Local apparent solar time at the observer (LTST sense). */
  dayFraction: number
  phobos: MarsMoonSky
  deimos: MarsMoonSky
  sunCrossings: HorizonCrossing[]
  sunPolar: PolarCap | null
  seasonMarks: SeasonMark[]
  subsolarLatitude: number
}

function hypot3(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z)
}

function wrapUnit(value: number): number {
  return ((value % 1) + 1) % 1
}

function polarCap(state: ReturnType<typeof horizonState>): PolarCap | null {
  if (state.kind === 'alwaysUp') return 'overhead'
  if (state.kind === 'alwaysDown') return 'underfoot'
  return null
}

function marsBody() {
  const mars = PLANETS.find((planet) => planet.id === 'mars')
  if (!mars) throw new Error('Mars missing from planet table')
  return mars
}

/**
 * 1 at mean periapsis (largest), 0 at mean apoapsis. Clamped to the ellipse.
 */
export function moonSizeFactor(distanceKm: number, aKm: number, e: number): number {
  const perigee = aKm * (1 - e)
  const apogee = aKm * (1 + e)
  const span = apogee - perigee
  if (span <= 0) return 0.5
  const t = (distanceKm - perigee) / span
  return 1 - Math.min(1, Math.max(0, t))
}

function moonPhase(
  sunFromMars: Vec3,
  moonRelative: Vec3,
): { illuminated: number; waxing: boolean } {
  const sunDir = vecNormalize(sunFromMars)
  const moonDir = vecNormalize(moonRelative)
  const cosSyzygy = Math.min(
    1,
    Math.max(-1, sunDir.x * moonDir.x + sunDir.y * moonDir.y + sunDir.z * moonDir.z),
  )
  const illuminated = (1 - cosSyzygy) / 2
  const waxing = vecCross(sunDir, moonDir).z >= 0
  return { illuminated, waxing }
}

let seasonCache: { year: number; marks: SeasonMark[] } | null = null

const MARS_SEASONS: readonly {
  ls: number
  kind: SeasonMarkKind
  name: SeasonMark['name']
}[] = [
  { ls: 0, kind: 'equinox', name: 'march' },
  { ls: 90, kind: 'solstice', name: 'june' },
  { ls: 180, kind: 'equinox', name: 'september' },
  { ls: 270, kind: 'solstice', name: 'december' },
]

/** Equinox/solstice marks on the perihelion year rim for the current Clancy year. */
export function marsSeasonMarks(date: Date): SeasonMark[] {
  const year = clancyMarsYear(date)
  if (seasonCache && seasonCache.year === year) return seasonCache.marks
  const marks = MARS_SEASONS.map(({ ls, kind, name }) => {
    const at = dateAtLs(year, ls)
    const yearFraction = planetSystemAt(at, 'mars').parent.yearFraction
    return { kind, name, yearFraction }
  })
  seasonCache = { year, marks }
  return marks
}

function moonSky(
  mars: PlanetSystemSnapshot['parent'],
  moon: SatelliteState,
  date: Date,
  latitudeRad: number,
  longitudeEastDeg: number,
  aKm: number,
  e: number,
): MarsMoonSky {
  const body = marsBody()
  const iau = frameFor(body, 'iau')
  const days = centuriesSinceJ2000(date) * 36525
  const orbitDegPerDay = 360 / mars.siderealOrbitDays
  const lonShift = longitudeEastDeg / 360
  const moonRelative = vecSub(moon.position, mars.position)
  const moonLocal = localTargetTime(iau, moonRelative, days, orbitDegPerDay)
  const fraction = wrapUnit(moonLocal.dayFraction + lonShift)
  const sunFromMars = { x: -mars.position.x, y: -mars.position.y, z: -mars.position.z }
  const phase = moonPhase(sunFromMars, moonRelative)
  const distanceKm = hypot3(moonRelative) * KM_PER_AU
  const horizon = horizonState(latitudeRad, moonLocal.subsolarLatitude)

  return {
    fraction,
    illuminated: phase.illuminated,
    waxing: phase.waxing,
    sizeFactor: moonSizeFactor(distanceKm, aKm, e),
    crossings:
      horizon.kind === 'crosses' ? bracketCrossings(fraction, horizon.rise, horizon.set) : [],
    polar: polarCap(horizon),
    sublatitude: moonLocal.subsolarLatitude,
  }
}

/**
 * Observer-local sun / Phobos / Deimos dial state for Mars at `date`.
 * Longitude is east-positive degrees; latitude is planetocentric degrees north.
 */
export function marsLocalSkyAt(
  date: Date,
  latitudeDeg: number,
  longitudeEastDeg: number,
  snapshot?: PlanetSystemSnapshot,
): MarsLocalSky {
  const system = snapshot ?? planetSystemAt(date, 'mars')
  const mars = system.parent
  const phobos = system.satellites.find((body) => body.id === 'phobos')
  const deimos = system.satellites.find((body) => body.id === 'deimos')
  if (!phobos || !deimos) throw new Error('Phobos or Deimos missing from the Mars system')

  const lonShift = longitudeEastDeg / 360
  const dayFraction = wrapUnit(mars.dayFraction + lonShift)
  const latitudeRad = (latitudeDeg * Math.PI) / 180
  const sunHorizon = horizonState(latitudeRad, mars.subsolarLatitude)

  return {
    yearFraction: mars.yearFraction,
    solsPerYear: mars.solsPerYear,
    color: mars.color,
    dayFraction,
    phobos: moonSky(mars, phobos, date, latitudeRad, longitudeEastDeg, 9375, 0.015),
    deimos: moonSky(mars, deimos, date, latitudeRad, longitudeEastDeg, 23457, 0.0001),
    sunCrossings:
      sunHorizon.kind === 'crosses'
        ? bracketCrossings(dayFraction, sunHorizon.rise, sunHorizon.set)
        : [],
    sunPolar: polarCap(sunHorizon),
    seasonMarks: marsSeasonMarks(date),
    subsolarLatitude: mars.subsolarLatitude,
  }
}
