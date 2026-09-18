import { mercurySite } from '../data/mercurySites.ts'
import { PLANETS, frameFor } from '../data/planets.ts'
import { bracketCrossings, horizonState, type HorizonCrossing } from './earthLocalSky.ts'
import { centuriesSinceJ2000, solarSystemAt, type SolarSystemSnapshot } from './kepler.ts'
import { localMeanSolFraction, wrapUnit } from './mercuryTime.ts'

export type { HorizonCrossing }

export type MercuryLocalSky = {
  siteId: string
  siteName: string
  color: string
  /** True local solar time [0, 1). */
  dayFraction: number
  /** Mean local solar time [0, 1). */
  meanDayFraction: number
  /** Local sidereal time [0, 1): IAU W/360 + lon/360. */
  siderealFraction: number
  /** Mean anomalistic year progress [0, 1). */
  yearFraction: number
  /** True anomaly as fraction of a turn [0, 1); perihelion = 0. */
  trueAnomalyFraction: number
  /** Heliocentric distance in AU. */
  heliocentricDistanceAu: number
  /** Osculating eccentricity (for rim geometry). */
  eccentricity: number
  /** Osculating semi-major axis in AU (fallback hand scaling). */
  semiMajorAu: number
  /** Rise/set ticks on the true-solar dial; empty when always up/down. */
  sunCrossings: HorizonCrossing[]
  /** Subsolar latitude relative to the IAU north pole, radians. */
  subsolarLatitude: number
}

function hypot3(position: { x: number; y: number; z: number }): number {
  return Math.hypot(position.x, position.y, position.z)
}

/**
 * Observer-local Sun / sidereal dial state for Mercury at `date`.
 * Site longitude is east-positive degrees (see mercurySites).
 */
export function mercuryLocalSkyAt(
  date: Date,
  siteId: string,
  snapshot?: SolarSystemSnapshot,
): MercuryLocalSky {
  const system = snapshot ?? solarSystemAt(date)
  const mercury = system.planets.find((body) => body.id === 'mercury')
  if (!mercury) throw new Error('Mercury missing from solar system snapshot')
  const site = mercurySite(siteId)
  const lonShift = site.longitudeEast / 360
  const body = PLANETS.find((planet) => planet.id === 'mercury')
  if (!body) throw new Error('Mercury missing from planet table')
  const iau = frameFor(body, 'iau')
  const days = centuriesSinceJ2000(date) * 36525
  const siderealFraction = wrapUnit((iau.w0 + iau.wDot * days) / 360 + lonShift)
  const dayFraction = wrapUnit(mercury.dayFraction + lonShift)
  const latitudeRad = (site.latitudeNorth * Math.PI) / 180
  const sunHorizon = horizonState(latitudeRad, mercury.subsolarLatitude)

  return {
    siteId: site.id,
    siteName: site.name,
    color: mercury.color,
    dayFraction,
    meanDayFraction: localMeanSolFraction(date, siteId),
    siderealFraction,
    yearFraction: mercury.yearFraction,
    trueAnomalyFraction: wrapUnit(mercury.trueAnomaly / (Math.PI * 2)),
    heliocentricDistanceAu: hypot3(mercury.position),
    eccentricity: mercury.e,
    semiMajorAu: mercury.a,
    sunCrossings:
      sunHorizon.kind === 'crosses'
        ? bracketCrossings(dayFraction, sunHorizon.rise, sunHorizon.set)
        : [],
    subsolarLatitude: mercury.subsolarLatitude,
  }
}
