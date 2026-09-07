import { EPICYCLE_FITS, EPICYCLE_PLANET_IDS } from '../data/generated/epicycleFits.ts'
import { PLANET_SYSTEMS } from '../data/planetSystems.ts'
import { KM_PER_AU, planetSystemAt, solarSystemAt, wrapRad, wrapRadSigned } from './kepler.ts'
import type {
  EpicycleCircle,
  EpicycleDepth,
  EpicycleFit,
  EpicyclePlanetId,
} from './epicycles.types.ts'

export type {
  EpicycleCircle,
  EpicycleDepth,
  EpicycleFit,
  EpicyclePlanetId,
} from './epicycles.types.ts'

export type Point2 = { x: number; y: number }
export type EpicycleArm = {
  center: Point2
  endpoint: Point2
  circle: EpicycleCircle
  angleRad: number
}
export type EpicycleModelState = {
  fit: EpicycleFit
  deferentCenter: Point2
  equantPoint: Point2
  centers: Point2[]
  arms: EpicycleArm[]
  position: Point2
  longitudeRad: number
  distance: number
}
export type GeocentricPlanetState = {
  position: { x: number; y: number; z: number }
  longitudeRad: number
  latitudeRad: number
  distanceAu: number
}
export type DistanceCalibration = 'modern-mean' | 'ptolemaic'
export type DistanceComparison = {
  model: number
  actual: number
  error: number
  unit: 'AU' | 'R⊕'
}

export const J2000_MS = Date.parse('2000-01-01T12:00:00Z')
const MS_PER_DAY = 86_400_000
const TAU = Math.PI * 2

export const PTOLEMAIC_DISTANCE_RANGES: Record<EpicyclePlanetId, { min: number; max: number }> = {
  moon: { min: 33, max: 64 },
  mercury: { min: 64, max: 166 },
  venus: { min: 166, max: 1079 },
  sun: { min: 1160, max: 1260 },
  mars: { min: 1260, max: 8820 },
  jupiter: { min: 8820, max: 14187 },
  saturn: { min: 14187, max: 19865 },
}

export type EpicycleDisplayShell = { inner: number; outer: number }

/**
 * Illustrative radii only. Multi-circle shells retain Ptolemy's touching order
 * under a logarithmic compression; one-circle tracks are spaced evenly.
 */
export function epicycleDisplayShells(
  depth: EpicycleDepth,
): Record<EpicyclePlanetId, EpicycleDisplayShell> {
  if (depth === 1) {
    return Object.fromEntries(
      EPICYCLE_PLANET_IDS.map((id, index) => {
        const radius = 0.16 + (index / (EPICYCLE_PLANET_IDS.length - 1)) * 0.8
        return [id, { inner: radius, outer: radius }]
      }),
    ) as Record<EpicyclePlanetId, EpicycleDisplayShell>
  }

  const venusSunBoundary = Math.sqrt(
    PTOLEMAIC_DISTANCE_RANGES.venus.max * PTOLEMAIC_DISTANCE_RANGES.sun.min,
  )
  const boundaries = [33, 64, 166, venusSunBoundary, 1260, 8820, 14187, 19865]
  const logMin = Math.log(boundaries[0])
  const logSpan = Math.log(boundaries.at(-1)!) - logMin
  const compress = (distance: number) => 0.12 + 0.84 * ((Math.log(distance) - logMin) / logSpan)
  return Object.fromEntries(
    EPICYCLE_PLANET_IDS.map((id, index) => [
      id,
      { inner: compress(boundaries[index]), outer: compress(boundaries[index + 1]) },
    ]),
  ) as Record<EpicyclePlanetId, EpicycleDisplayShell>
}

export function epicycleFitFor(id: EpicyclePlanetId, depth: EpicycleDepth): EpicycleFit {
  const fit = EPICYCLE_FITS[id][depth - 1]
  if (!fit || fit.depth !== depth) throw new Error(`Missing ${id} epicycle fit at depth ${depth}`)
  return fit
}

export function epicycleModelAt(
  id: EpicyclePlanetId,
  at: Date,
  depth: EpicycleDepth,
): EpicycleModelState {
  const fit = epicycleFitFor(id, depth)
  const days = (at.getTime() - J2000_MS) / MS_PER_DAY
  const centers: Point2[] = []
  const arms: EpicycleArm[] = []
  const primary = fit.circles[0]
  const apsisRad = fit.apsisRad + fit.apsisRateRadPerDay * days
  const deferentCenter = {
    x: fit.eccentricity * primary.radius * Math.cos(apsisRad),
    y: fit.eccentricity * primary.radius * Math.sin(apsisRad),
  }
  const equantPoint = { x: deferentCenter.x * 2, y: deferentCenter.y * 2 }
  const meanAngle = primary.phaseRad + primary.rateRadPerDay * days
  const direction = { x: Math.cos(meanAngle), y: Math.sin(meanAngle) }
  const equantFromCenter = {
    x: equantPoint.x - deferentCenter.x,
    y: equantPoint.y - deferentCenter.y,
  }
  const along = direction.x * equantFromCenter.x + direction.y * equantFromCenter.y
  const discriminant =
    along * along +
    primary.radius * primary.radius -
    equantFromCenter.x * equantFromCenter.x -
    equantFromCenter.y * equantFromCenter.y
  const rayDistance = -along + Math.sqrt(Math.max(0, discriminant))
  let point: Point2 = {
    x: equantPoint.x + rayDistance * direction.x,
    y: equantPoint.y + rayDistance * direction.y,
  }
  const primaryAngle = Math.atan2(point.y - deferentCenter.y, point.x - deferentCenter.x)
  centers.push(deferentCenter)
  arms.push({
    center: deferentCenter,
    endpoint: point,
    circle: primary,
    angleRad: wrapRad(primaryAngle),
  })

  for (const circle of fit.circles.slice(1)) {
    const center = point
    const angleRad = circle.phaseRad + circle.rateRadPerDay * days
    const endpoint = {
      x: center.x + circle.radius * Math.cos(angleRad),
      y: center.y + circle.radius * Math.sin(angleRad),
    }
    centers.push(center)
    arms.push({ center, endpoint, circle, angleRad: wrapRad(angleRad) })
    point = endpoint
  }

  return {
    fit,
    deferentCenter,
    equantPoint,
    centers,
    arms,
    position: point,
    longitudeRad: wrapRad(Math.atan2(point.y, point.x)),
    distance: Math.hypot(point.x, point.y),
  }
}

export function geocentricBodyAt(id: EpicyclePlanetId, at: Date): GeocentricPlanetState {
  if (id === 'moon') {
    const earthSystem = planetSystemAt(at, 'earth')
    const moon = earthSystem.satellites.find((satellite) => satellite.id === 'moon')
    if (!moon) throw new Error('Missing Moon in Earth-system snapshot')
    const position = {
      x: moon.position.x - earthSystem.parent.position.x,
      y: moon.position.y - earthSystem.parent.position.y,
      z: moon.position.z - earthSystem.parent.position.z,
    }
    const inPlane = Math.hypot(position.x, position.y)
    return {
      position,
      longitudeRad: wrapRad(Math.atan2(position.y, position.x)),
      latitudeRad: Math.atan2(position.z, inPlane),
      distanceAu: Math.hypot(inPlane, position.z),
    }
  }

  const snapshot = solarSystemAt(at)
  const earth = snapshot.planets.find((planet) => planet.id === 'earth')
  if (!earth) throw new Error('Missing Earth in solar-system snapshot')
  const planet = id === 'sun' ? null : snapshot.planets.find((body) => body.id === id)
  if (id !== 'sun' && !planet) throw new Error(`Missing ${id} in solar-system snapshot`)
  const position = {
    x: id === 'sun' ? -earth.position.x : planet!.position.x - earth.position.x,
    y: id === 'sun' ? -earth.position.y : planet!.position.y - earth.position.y,
    z: id === 'sun' ? -earth.position.z : planet!.position.z - earth.position.z,
  }
  const inPlane = Math.hypot(position.x, position.y)
  return {
    position,
    longitudeRad: wrapRad(Math.atan2(position.y, position.x)),
    latitudeRad: Math.atan2(position.z, inPlane),
    distanceAu: Math.hypot(inPlane, position.z),
  }
}

/** Smallest signed model-minus-actual longitude error in (−π, π]. */
export function angleErrorRad(modelRad: number, actualRad: number): number {
  return wrapRadSigned(modelRad - actualRad)
}

type DistanceStats = {
  modelMin: number
  modelMax: number
  modelMean: number
  actualMeanAu: number
}

const distanceStatsCache = new Map<string, DistanceStats>()

function distanceStats(id: EpicyclePlanetId, depth: EpicycleDepth): DistanceStats {
  const key = `${id}:${depth}`
  const cached = distanceStatsCache.get(key)
  if (cached) return cached

  const fit = epicycleFitFor(id, depth)
  const count = 241
  let modelMin = Infinity
  let modelMax = -Infinity
  let modelSum = 0
  let actualSum = 0
  for (let index = 0; index < count; index++) {
    const atMs = fit.fromMs + ((fit.toMs - fit.fromMs) * index) / (count - 1)
    const at = new Date(atMs)
    const modelDistance = epicycleModelAt(id, at, depth).distance
    modelMin = Math.min(modelMin, modelDistance)
    modelMax = Math.max(modelMax, modelDistance)
    modelSum += modelDistance
    actualSum += geocentricBodyAt(id, at).distanceAu
  }
  const stats = {
    modelMin,
    modelMax,
    modelMean: modelSum / count,
    actualMeanAu: actualSum / count,
  }
  distanceStatsCache.set(key, stats)
  return stats
}

function calibratedModelDistance(
  id: EpicyclePlanetId,
  depth: EpicycleDepth,
  rawDistance: number,
  calibration: DistanceCalibration,
): number {
  const stats = distanceStats(id, depth)
  if (calibration === 'modern-mean') {
    return rawDistance * (stats.actualMeanAu / stats.modelMean)
  }
  const range = PTOLEMAIC_DISTANCE_RANGES[id]
  const span = stats.modelMax - stats.modelMin
  const fraction = span > 1e-12 ? (rawDistance - stats.modelMin) / span : 0.5
  return range.min + Math.min(1, Math.max(0, fraction)) * (range.max - range.min)
}

export function distanceComparisonAt(
  id: EpicyclePlanetId,
  at: Date,
  depth: EpicycleDepth,
  calibration: DistanceCalibration,
): DistanceComparison {
  const modelState = epicycleModelAt(id, at, depth)
  const actualAu = geocentricBodyAt(id, at).distanceAu
  const model = calibratedModelDistance(id, depth, modelState.distance, calibration)
  if (calibration === 'modern-mean') {
    return { model, actual: actualAu, error: model - actualAu, unit: 'AU' }
  }
  const actual = (actualAu * KM_PER_AU) / PLANET_SYSTEMS.earth.radiusKm
  return { model, actual, error: model - actual, unit: 'R⊕' }
}

export function circlePeriodDays(circle: EpicycleCircle): number {
  return TAU / Math.abs(circle.rateRadPerDay)
}
