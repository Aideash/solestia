import { PLANETS, frameFor } from '../data/planets.ts'
import { vecCross, vecNormalize, vecSub } from './camera.ts'
import { eclipseGeometryFromSnapshot } from './eclipses.ts'
import {
  centuriesSinceJ2000,
  eccentricAnomalyFromTrue,
  KM_PER_AU,
  localTargetTime,
  planetSystemAt,
  wrapRad,
  type PlanetSystemSnapshot,
  type Vec3,
} from './kepler.ts'

/** Same threshold as EarthEclipsePage: Sun within 18.5° of a lunar node. */
export const ECLIPSE_SEASON_LIMIT = (18.5 * Math.PI) / 180

/** Mean lunar semi-major axis and eccentricity from the satellite table. */
const MOON_A_KM = 384_400
const MOON_E = 0.0554
const MOON_PERIGEE_KM = MOON_A_KM * (1 - MOON_E)
const MOON_APOGEE_KM = MOON_A_KM * (1 + MOON_E)

export type HorizonCrossing = {
  /** Dial fraction (0 at midnight/top, 0.5 at noon/bottom). */
  fraction: number
  kind: 'rise' | 'set'
}

/**
 * When a body never rises or sets at this latitude: dial marker at the bottom
 * (overhead / always up) or top (underfoot / always down).
 */
export type PolarCap = 'overhead' | 'underfoot'

export type SeasonMarkKind = 'equinox' | 'solstice'

export type SeasonMark = {
  kind: SeasonMarkKind
  /** Northern-hemisphere calendar name for the tropical event. */
  name: 'march' | 'june' | 'september' | 'december'
  /** Dial fraction on the perihelion year rim (same sense as yearFraction). */
  yearFraction: number
}

export type EarthLocalSky = {
  yearFraction: number
  solsPerYear: number
  color: string
  /** Local apparent solar time at the observer. */
  dayFraction: number
  /** Local hour-angle fraction of the Moon (0.5 = moon on the meridian / overhead). */
  moonFraction: number
  /** 0 at new, 1 at full. */
  illuminated: number
  /** True while the Moon is waxing (evening crescent after new). */
  waxing: boolean
  /**
   * Apparent-size factor from lunar distance: 0 at apogee (smallest), 1 at
   * perigee (largest). Clamped to the mean ellipse; inequalities may sit outside.
   */
  moonPerigee: number
  sunCrossings: HorizonCrossing[]
  moonCrossings: HorizonCrossing[]
  /** Set when the Sun has no rise/set at this latitude. */
  sunPolar: PolarCap | null
  /** Set when the Moon has no rise/set at this latitude. */
  moonPolar: PolarCap | null
  /** Tropical equinox/solstice positions on the perihelion year rim. */
  seasonMarks: SeasonMark[]
  inEclipseSeason: boolean
  subsolarLatitude: number
  sublunarLatitude: number
}

function hypot3(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z)
}

function wrapUnit(value: number): number {
  return ((value % 1) + 1) % 1
}

export type HorizonResult =
  { kind: 'crosses'; rise: number; set: number } | { kind: 'alwaysUp' } | { kind: 'alwaysDown' }

/**
 * Geometric rise/set for a body whose local “noon” (meridian transit, hand
 * straight down) is at dayFraction 0.5. Polar day/night return alwaysUp /
 * alwaysDown instead of crossings.
 */
export function horizonState(latitudeRad: number, declinationRad: number): HorizonResult {
  const cosH0 = -Math.tan(latitudeRad) * Math.tan(declinationRad)
  if (!Number.isFinite(cosH0)) return { kind: 'alwaysDown' }
  if (cosH0 < -1) return { kind: 'alwaysUp' }
  if (cosH0 > 1) return { kind: 'alwaysDown' }
  const h0 = Math.acos(Math.min(1, Math.max(-1, cosH0)))
  const half = h0 / (Math.PI * 2)
  return {
    kind: 'crosses',
    rise: wrapUnit(0.5 - half),
    set: wrapUnit(0.5 + half),
  }
}

/** @see horizonState */
export function horizonCrossings(
  latitudeRad: number,
  declinationRad: number,
): { rise: number; set: number } | null {
  const state = horizonState(latitudeRad, declinationRad)
  if (state.kind !== 'crosses') return null
  return { rise: state.rise, set: state.set }
}

function polarCap(state: HorizonResult): PolarCap | null {
  if (state.kind === 'alwaysUp') return 'overhead'
  if (state.kind === 'alwaysDown') return 'underfoot'
  return null
}

/**
 * 1 at mean perigee (largest apparent Moon), 0 at mean apogee. Clamped so
 * inequality excursions stay on the dial.
 */
export function moonPerigeeFactor(distanceKm: number): number {
  const span = MOON_APOGEE_KM - MOON_PERIGEE_KM
  if (span <= 0) return 0.5
  const t = (distanceKm - MOON_PERIGEE_KM) / span
  return 1 - Math.min(1, Math.max(0, t))
}

const TROPICAL_SEASONS: readonly {
  sunLon: number
  kind: SeasonMarkKind
  name: SeasonMark['name']
}[] = [
  { sunLon: 0, kind: 'equinox', name: 'march' },
  { sunLon: Math.PI / 2, kind: 'solstice', name: 'june' },
  { sunLon: Math.PI, kind: 'equinox', name: 'september' },
  { sunLon: (3 * Math.PI) / 2, kind: 'solstice', name: 'december' },
]

/**
 * Place tropical events on the perihelion year dial. Sun geocentric ecliptic
 * longitude targets map to Earth’s heliocentric longitude + π; true anomaly
 * from perihelion is converted to mean anomaly so the marks share yearFraction’s sense.
 */
export function tropicalSeasonMarks(
  perihelionLongitude: number,
  eccentricity: number,
): SeasonMark[] {
  return TROPICAL_SEASONS.map(({ sunLon, kind, name }) => {
    const earthLon = wrapRad(sunLon + Math.PI)
    const nu = wrapRad(earthLon - perihelionLongitude)
    const E = eccentricAnomalyFromTrue(nu, eccentricity)
    const M = wrapRad(E - eccentricity * Math.sin(E))
    return { kind, name, yearFraction: M / (Math.PI * 2) }
  })
}

/**
 * Previous and next horizon events on the dial for the current local fraction.
 * Daytime → today’s rise and set; nighttime → the flanking set and rise.
 * Tick positions are still at the rise/set dial angles.
 */
export function bracketCrossings(
  localFraction: number,
  rise: number,
  set: number,
): HorizonCrossing[] {
  const f = wrapUnit(localFraction)
  const daytime = rise <= set ? f >= rise && f <= set : f >= rise || f <= set
  if (daytime) {
    return [
      { fraction: rise, kind: 'rise' },
      { fraction: set, kind: 'set' },
    ]
  }
  return [
    { fraction: set, kind: 'set' },
    { fraction: rise, kind: 'rise' },
  ]
}

function earthBody() {
  const earth = PLANETS.find((planet) => planet.id === 'earth')
  if (!earth) throw new Error('Earth missing from planet table')
  return earth
}

/**
 * Observer-local sun/moon dial state for Earth at `date`. Longitude is east
 * positive in degrees (IAU / geographic). Latitude is geographic degrees.
 */
export function earthLocalSkyAt(
  date: Date,
  latitudeDeg: number,
  longitudeEastDeg: number,
  snapshot?: PlanetSystemSnapshot,
): EarthLocalSky {
  const system = snapshot ?? planetSystemAt(date, 'earth')
  const earth = system.parent
  const moon = system.satellites.find((body) => body.id === 'moon')
  if (!moon) throw new Error('Moon missing from the Earth system')

  const lonShift = longitudeEastDeg / 360
  const dayFraction = wrapUnit(earth.dayFraction + lonShift)

  const body = earthBody()
  const iau = frameFor(body, 'iau')
  const days = centuriesSinceJ2000(date) * 36525
  const orbitDegPerDay = 360 / earth.siderealOrbitDays
  const moonRelative = vecSub(moon.position, earth.position)
  const moonLocal = localTargetTime(iau, moonRelative, days, orbitDegPerDay)
  const moonFraction = wrapUnit(moonLocal.dayFraction + lonShift)

  const geometry = eclipseGeometryFromSnapshot(system)
  const illuminated = (1 - Math.cos(geometry.syzygy)) / 2
  const sunDir = vecNormalize(geometry.sunFromEarth)
  const moonDir = vecNormalize(geometry.moonRelative)
  // Ecliptic north component of sun×moon: positive → Moon east of Sun → waxing.
  const waxing = vecCross(sunDir, moonDir).z >= 0

  const latitudeRad = (latitudeDeg * Math.PI) / 180
  const sunHorizon = horizonState(latitudeRad, earth.subsolarLatitude)
  const moonHorizon = horizonState(latitudeRad, moonLocal.subsolarLatitude)
  const moonDistanceKm = hypot3(moonRelative) * KM_PER_AU

  return {
    yearFraction: earth.yearFraction,
    solsPerYear: earth.solsPerYear,
    color: earth.color,
    dayFraction,
    moonFraction,
    illuminated,
    waxing,
    moonPerigee: moonPerigeeFactor(moonDistanceKm),
    sunCrossings:
      sunHorizon.kind === 'crosses'
        ? bracketCrossings(dayFraction, sunHorizon.rise, sunHorizon.set)
        : [],
    moonCrossings:
      moonHorizon.kind === 'crosses'
        ? bracketCrossings(moonFraction, moonHorizon.rise, moonHorizon.set)
        : [],
    sunPolar: polarCap(sunHorizon),
    moonPolar: polarCap(moonHorizon),
    seasonMarks: tropicalSeasonMarks(earth.perihelionLongitude, earth.e),
    inEclipseSeason: geometry.sunNodeSeparation < ECLIPSE_SEASON_LIMIT,
    subsolarLatitude: earth.subsolarLatitude,
    sublunarLatitude: moonLocal.subsolarLatitude,
  }
}
