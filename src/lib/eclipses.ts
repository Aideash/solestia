import { PLANET_SYSTEMS } from '../data/planetSystems.ts'
import {
  KM_PER_AU,
  planetSystemAt,
  wrapRad,
  wrapRadSigned,
  type PlanetSystemSnapshot,
  type Vec3,
} from './kepler.ts'
import { vecAdd, vecCross, vecDot, vecNormalize, vecScale, vecSub } from './camera.ts'
import type { SurfaceRegion } from './globe.ts'

/** IAU nominal solar radius. */
export const R_SUN_KM = 695_700
/** Mean lunar radius. */
export const R_MOON_KM = 1737.4
export const R_EARTH_KM = PLANET_SYSTEMS.earth.radiusKm

/**
 * Provisional half-width of the residual along-track lunar-longitude error.
 * The principal inequalities are modeled now, but this band remains at its
 * former conservative width until broad catalog coverage can calibrate a true
 * 95% interval across the supported epoch.
 */
export const LUNAR_LONGITUDE_ENVELOPE_RAD = (1.8 * Math.PI) / 180

export type ShadowCaster = 'moon' | 'earth'

export type EclipseKind = 'miss' | 'penumbral' | 'partial' | 'total' | 'annular'

export type ConeHit = {
  kind: EclipseKind
  /** Distance from the shadow axis to the target center, km. */
  missKm: number
  /** Signed umbra radius at the target: negative past the apex (antumbra). */
  umbraRadiusKm: number
  penumbraRadiusKm: number
  /** Distance from caster to the target along the anti-sun axis, km. */
  alongKm: number
}

export type ShadowCone = {
  /** Apex of the umbral cone, heliocentric AU. */
  umbraApex: Vec3
  /** Apex of the penumbral cone (sunward of the caster), heliocentric AU. */
  penumbraApex: Vec3
  axis: Vec3
  caster: Vec3
  casterRadiusKm: number
  /** Caster to umbral apex, km: the cone tapers to nothing over this run. */
  umbraLengthKm: number
  /** Penumbral apex to caster, km: the cone widens at the same rate past it. */
  penumbraLengthKm: number
  target: Vec3
  targetRadiusKm: number
  hit: ConeHit
}

export type EclipseGeometry = {
  at: Date
  earth: Vec3
  moon: Vec3
  moonRelative: Vec3
  sunFromEarth: Vec3
  nodeLongitude: number
  /** Smallest angle from the Sun’s geocentric ecliptic longitude to a lunar node. */
  sunNodeSeparation: number
  /** Angle at Earth between the Moon and the Sun; 0 at new moon, π at full. */
  syzygy: number
  sunApparent: number
  moonApparent: number
  moonCast: ConeHit
  earthCast: ConeHit
  moonCone: ShadowCone
  earthCone: ShadowCone
  envelopeMoonRelative: { minus: Vec3; plus: Vec3 }
}

function hypot3(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z)
}

function rotateAboutEclipticNorth(v: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos,
    z: v.z,
  }
}

function angularRadius(radiusKm: number, distanceKm: number): number {
  if (distanceKm <= radiusKm) return Math.PI / 2
  return Math.asin(radiusKm / distanceKm)
}

function minAngle(a: number, b: number): number {
  return Math.abs(wrapRadSigned(a - b))
}

/**
 * Shadow of `caster` on `target`. Sun at the origin. Distances in AU, radii in km.
 */
export function coneOnTarget(
  caster: Vec3,
  casterRadiusKm: number,
  target: Vec3,
  targetRadiusKm: number,
  classify: 'solar' | 'lunar',
): { hit: ConeHit; cone: Omit<ShadowCone, 'hit'> } {
  const dSunCasterKm = hypot3(caster) * KM_PER_AU
  const axis = vecNormalize(caster)
  const targetFromCaster = vecSub(target, caster)
  const targetFromCasterKm = vecScale(targetFromCaster, KM_PER_AU)
  const alongKm = vecDot(targetFromCasterKm, axis)
  const perp = vecSub(targetFromCasterKm, vecScale(axis, alongKm))
  const missKm = hypot3(perp)
  const umbraLengthKm = (casterRadiusKm * dSunCasterKm) / (R_SUN_KM - casterRadiusKm)
  const penumbraLengthKm = (casterRadiusKm * dSunCasterKm) / (R_SUN_KM + casterRadiusKm)
  const umbraRadiusKm = casterRadiusKm * (1 - alongKm / umbraLengthKm)
  const penumbraRadiusKm = casterRadiusKm * (1 + alongKm / penumbraLengthKm)
  const umbraApex = vecAdd(caster, vecScale(axis, umbraLengthKm / KM_PER_AU))
  const penumbraApex = vecSub(caster, vecScale(axis, penumbraLengthKm / KM_PER_AU))

  let kind: EclipseKind = 'miss'
  if (alongKm > 0 && penumbraRadiusKm > 0 && missKm < targetRadiusKm + penumbraRadiusKm) {
    if (classify === 'solar') {
      if (umbraRadiusKm > 0 && missKm < targetRadiusKm + umbraRadiusKm) kind = 'total'
      else if (umbraRadiusKm <= 0 && missKm < targetRadiusKm - umbraRadiusKm) kind = 'annular'
      else kind = 'partial'
    } else if (umbraRadiusKm > 0 && missKm + targetRadiusKm <= umbraRadiusKm) {
      kind = 'total'
    } else if (umbraRadiusKm > 0 && missKm < targetRadiusKm + umbraRadiusKm) {
      kind = 'partial'
    } else {
      kind = 'penumbral'
    }
  }

  return {
    hit: { kind, missKm, umbraRadiusKm, penumbraRadiusKm, alongKm },
    cone: {
      umbraApex,
      penumbraApex,
      axis,
      caster,
      casterRadiusKm,
      umbraLengthKm,
      penumbraLengthKm,
      target,
      targetRadiusKm,
    },
  }
}

export function eclipseGeometryAt(date: Date): EclipseGeometry {
  const snapshot = planetSystemAt(date, 'earth')
  return eclipseGeometryFromSnapshot(snapshot)
}

export function eclipseGeometryFromSnapshot(snapshot: PlanetSystemSnapshot): EclipseGeometry {
  const moon = snapshot.satellites.find((body) => body.id === 'moon')
  if (!moon) throw new Error('Moon missing from the Earth system')
  const earth = snapshot.parent.position
  const moonHelio = moon.position
  const moonRelative = vecSub(moonHelio, earth)
  const sunFromEarth = vecScale(earth, -1)
  const earthKm = hypot3(earth) * KM_PER_AU
  const moonKm = hypot3(moonRelative) * KM_PER_AU
  const sunLon = wrapRad(Math.atan2(earth.y, earth.x) + Math.PI)
  const node = moon.nodeLongitude
  const sunNodeSeparation = Math.min(minAngle(sunLon, node), minAngle(sunLon, node + Math.PI))
  const syzygy = Math.acos(
    Math.min(1, Math.max(-1, vecDot(vecNormalize(moonRelative), vecNormalize(sunFromEarth)))),
  )

  const moonCast = coneOnTarget(moonHelio, R_MOON_KM, earth, R_EARTH_KM, 'solar')
  const earthCast = coneOnTarget(earth, R_EARTH_KM, moonHelio, R_MOON_KM, 'lunar')

  return {
    at: snapshot.at,
    earth,
    moon: moonHelio,
    moonRelative,
    sunFromEarth,
    nodeLongitude: node,
    sunNodeSeparation,
    syzygy,
    sunApparent: angularRadius(R_SUN_KM, earthKm),
    moonApparent: angularRadius(R_MOON_KM, moonKm),
    moonCast: moonCast.hit,
    earthCast: earthCast.hit,
    moonCone: { ...moonCast.cone, hit: moonCast.hit },
    earthCone: { ...earthCast.cone, hit: earthCast.hit },
    envelopeMoonRelative: {
      minus: rotateAboutEclipticNorth(moonRelative, -LUNAR_LONGITUDE_ENVELOPE_RAD),
      plus: rotateAboutEclipticNorth(moonRelative, LUNAR_LONGITUDE_ENVELOPE_RAD),
    },
  }
}

export function activeHit(geometry: EclipseGeometry, caster: ShadowCaster): ConeHit {
  return caster === 'moon' ? geometry.moonCast : geometry.earthCast
}

export function activeCone(geometry: EclipseGeometry, caster: ShadowCaster): ShadowCone {
  return caster === 'moon' ? geometry.moonCone : geometry.earthCone
}

export function kindColor(kind: EclipseKind): string {
  if (kind === 'total') return 'green'
  if (kind === 'partial' || kind === 'penumbral') return 'amber'
  if (kind === 'annular') return 'red'
  return ''
}

export function kindLabel(kind: EclipseKind, caster: ShadowCaster): string {
  if (kind === 'miss') return 'No eclipse in this model'
  if (caster === 'moon') {
    if (kind === 'total') return 'Total solar (this model)'
    if (kind === 'annular') return 'Annular solar (this model)'
    if (kind === 'partial') return 'Partial solar (this model)'
  }
  if (kind === 'total') return 'Total lunar (this model)'
  if (kind === 'partial') return 'Partial lunar (this model)'
  if (kind === 'penumbral') return 'Penumbral lunar (this model)'
  return 'Eclipse geometry (this model)'
}

/** Unit vectors around a cone, in the plane perpendicular to `axis`. */
export function coneRing(center: Vec3, axis: Vec3, radiusAu: number, samples = 48): Vec3[] {
  const n = vecNormalize(axis)
  let a = vecCross(n, { x: 0, y: 0, z: 1 })
  if (hypot3(a) < 1e-8) a = vecCross(n, { x: 1, y: 0, z: 0 })
  a = vecNormalize(a)
  const b = vecNormalize(vecCross(n, a))
  return Array.from({ length: samples }, (_, index) => {
    const t = (index / samples) * Math.PI * 2
    return vecAdd(
      center,
      vecAdd(vecScale(a, Math.cos(t) * radiusAu), vecScale(b, Math.sin(t) * radiusAu)),
    )
  })
}

export function envelopeMoonPositions(geometry: EclipseGeometry, steps = 7): Vec3[] {
  const span = LUNAR_LONGITUDE_ENVELOPE_RAD
  return Array.from({ length: steps }, (_, index) => {
    const t = -span + (2 * span * index) / (steps - 1)
    return vecAdd(geometry.earth, rotateAboutEclipticNorth(geometry.moonRelative, t))
  })
}

export type EnvelopeSample = {
  moon: Vec3
  cone: ShadowCone
}

/** The same shadow geometry recomputed at each perturbed lunar position. */
export function envelopeSamples(
  geometry: EclipseGeometry,
  caster: ShadowCaster,
  steps = 17,
): EnvelopeSample[] {
  return envelopeMoonPositions(geometry, steps).map((moon) => {
    const { hit, cone } = coneOnTarget(
      caster === 'moon' ? moon : geometry.earth,
      caster === 'moon' ? R_MOON_KM : R_EARTH_KM,
      caster === 'moon' ? geometry.earth : moon,
      caster === 'moon' ? R_EARTH_KM : R_MOON_KM,
      caster === 'moon' ? 'solar' : 'lunar',
    )
    return { moon, cone: { ...cone, hit } }
  })
}

/**
 * Perturbed lunar positions whose shadow actually reaches the target. Used to
 * decide whether the envelope is worth showing at all: away from a syzygy no
 * point in it can produce an eclipse.
 */
export function envelopeHitSamples(
  geometry: EclipseGeometry,
  caster: ShadowCaster,
  steps = 17,
): EnvelopeSample[] {
  return envelopeSamples(geometry, caster, steps).filter(
    (sample) => sample.cone.hit.kind !== 'miss',
  )
}

export type ShadowFeature = 'umbra' | 'penumbra'

type Vec2 = { x: number; y: number }

/**
 * The fundamental plane: through the target center, normal to the shadow axis.
 * A cone cross-section is a circle there and the target a disc of its own
 * radius, so a footprint is a plane figure lifted onto the sunward surface.
 */
type FundamentalPlane = {
  axis: Vec3
  e1: Vec3
  e2: Vec3
  radiusKm: number
}

/** A cone cross-section in the fundamental plane, with its taper. */
type ShadowDisc = {
  center: Vec2
  /** Signed radius `depthKm` anti-sunward of the plane; negative past an apex. */
  radiusAt: (depthKm: number) => number
}

function fundamentalPlane(cone: ShadowCone): FundamentalPlane {
  const axis = vecNormalize(cone.axis)
  let e1 = vecCross(axis, { x: 0, y: 0, z: 1 })
  if (hypot3(e1) < 1e-8) e1 = vecCross(axis, { x: 1, y: 0, z: 0 })
  e1 = vecNormalize(e1)
  return { axis, e1, e2: vecNormalize(vecCross(axis, e1)), radiusKm: cone.targetRadiusKm }
}

/**
 * Where `cone` crosses `plane`, offset from the target center by the same miss
 * distance the hit test measures. Null when the target is not down-Sun.
 */
function shadowDisc(
  plane: FundamentalPlane,
  cone: ShadowCone,
  feature: ShadowFeature,
): ShadowDisc | null {
  const toTarget = vecScale(vecSub(cone.target, cone.caster), KM_PER_AU)
  const alongKm = vecDot(toTarget, plane.axis)
  if (!(alongKm > 0)) return null
  const pierce = vecAdd(vecScale(toTarget, -1), vecScale(plane.axis, alongKm))
  const lengthKm = feature === 'umbra' ? cone.umbraLengthKm : cone.penumbraLengthKm
  const taper = feature === 'umbra' ? -1 : 1
  return {
    center: { x: vecDot(pierce, plane.e1), y: vecDot(pierce, plane.e2) },
    radiusAt: (depthKm) => cone.casterRadiusKm * (1 + (taper * (alongKm + depthKm)) / lengthKm),
  }
}

/**
 * The cross-section boundary, each point pulled to the radius the cone has
 * where it meets the sunward surface. That taper is a third of the umbra’s
 * width at Earth, so a flat circle would draw a noticeably wrong track.
 */
function discOutline(disc: ShadowDisc, radiusKm: number, samples: number): Vec2[] {
  const flatKm = Math.abs(disc.radiusAt(0))
  return Array.from({ length: samples }, (_, index) => {
    const angle = (index / samples) * Math.PI * 2
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    let r = flatKm
    for (let pass = 0; pass < 2; pass++) {
      const x = disc.center.x + r * dx
      const y = disc.center.y + r * dy
      const depthSquared = radiusKm * radiusKm - (x * x + y * y)
      // Off the target's silhouette there is no surface to land on; leave the
      // point flat and let the silhouette clip decide the boundary.
      if (depthSquared <= 0) {
        r = flatKm
        break
      }
      r = Math.abs(disc.radiusAt(-Math.sqrt(depthSquared)))
    }
    return { x: disc.center.x + r * dx, y: disc.center.y + r * dy }
  })
}

function cross2(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

/** Counter-clockwise hull, monotone chain. */
function convexHull(points: Vec2[]): Vec2[] {
  if (points.length < 3) return []
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const chain = (list: Vec2[]): Vec2[] => {
    const out: Vec2[] = []
    for (const point of list) {
      while (out.length >= 2 && cross2(out[out.length - 2], out[out.length - 1], point) <= 0) {
        out.pop()
      }
      out.push(point)
    }
    return out
  }
  const lower = chain(sorted)
  const upper = chain([...sorted].reverse())
  if (lower.length < 2 || upper.length < 2) return []
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

function inConvex(polygon: Vec2[], point: Vec2): boolean {
  for (let index = 0; index < polygon.length; index++) {
    if (cross2(polygon[index], polygon[(index + 1) % polygon.length], point) < 0) return false
  }
  return true
}

/** Fixed so that every region's rim lands on the same vertices. */
const SILHOUETTE_RIM_SAMPLES = 128

/**
 * Convex region clipped to the target's silhouette. Both parts are convex, so
 * the intersection is the hull of the vertices that survive, the edge
 * crossings, and the rim inside the region.
 */
function clipToSilhouette(polygon: Vec2[], radiusKm: number): Vec2[] {
  if (polygon.length < 3) return []
  const radiusSquared = radiusKm * radiusKm
  const kept = polygon.filter((point) => point.x * point.x + point.y * point.y <= radiusSquared)
  const crossings: Vec2[] = []
  for (let index = 0; index < polygon.length; index++) {
    const from = polygon[index]
    const to = polygon[(index + 1) % polygon.length]
    const dx = to.x - from.x
    const dy = to.y - from.y
    const a = dx * dx + dy * dy
    if (a < 1e-12) continue
    const b = 2 * (from.x * dx + from.y * dy)
    const c = from.x * from.x + from.y * from.y - radiusSquared
    const discriminant = b * b - 4 * a * c
    if (discriminant < 0) continue
    const root = Math.sqrt(discriminant)
    for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
      if (t < 0 || t > 1) continue
      crossings.push({ x: from.x + dx * t, y: from.y + dy * t })
    }
  }
  // Circumscribe the silhouette rather than inscribing it: the overshoot is
  // 0.03% of the radius, and it keeps every region a true superset of the
  // circle it clips to, so one region can still contain another exactly.
  const rimKm = radiusKm / Math.cos(Math.PI / SILHOUETTE_RIM_SAMPLES)
  const rim: Vec2[] = []
  for (let index = 0; index < SILHOUETTE_RIM_SAMPLES; index++) {
    const angle = (index / SILHOUETTE_RIM_SAMPLES) * Math.PI * 2
    const point = { x: rimKm * Math.cos(angle), y: rimKm * Math.sin(angle) }
    if (inConvex(polygon, point)) rim.push(point)
  }
  return convexHull([...kept, ...crossings, ...rim])
}

/**
 * The boundary walked at the resolution the rim is sampled at. A hull edge
 * thousands of kilometers long must not reach the screen as a single chord:
 * the lift is not affine, and near the silhouette, where it turns steeply, an
 * edge and the chord across it part company by more than the shadow is wide.
 */
function walkEdges(polygon: Vec2[], stepKm: number): Vec2[] {
  const walked: Vec2[] = []
  for (let index = 0; index < polygon.length; index++) {
    const from = polygon[index]
    const to = polygon[(index + 1) % polygon.length]
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / stepKm))
    for (let step = 0; step < steps; step++) {
      const fraction = step / steps
      walked.push({
        x: from.x + (to.x - from.x) * fraction,
        y: from.y + (to.y - from.y) * fraction,
      })
    }
  }
  return walked
}

function surfaceRegion(plane: FundamentalPlane, polygon: Vec2[]): SurfaceRegion | null {
  if (polygon.length < 3) return null
  const lift = (point: Vec2): Vec3 => {
    const depthSquared = plane.radiusKm * plane.radiusKm - (point.x * point.x + point.y * point.y)
    const depth = -Math.sqrt(Math.max(0, depthSquared))
    return vecNormalize(
      vecAdd(
        vecAdd(vecScale(plane.e1, point.x), vecScale(plane.e2, point.y)),
        vecScale(plane.axis, depth),
      ),
    )
  }
  return {
    outline: walkEdges(polygon, (Math.PI * 2 * plane.radiusKm) / SILHOUETTE_RIM_SAMPLES).map(lift),
    contains: (direction) => {
      // The lift is two-sheeted: only the sunward face is in shadow. Points
      // lifted from the silhouette sit exactly on the divide, so admit that
      // boundary rather than letting rounding push them onto the far sheet.
      if (vecDot(direction, plane.axis) > 1e-9) return false
      return inConvex(polygon, {
        x: plane.radiusKm * vecDot(direction, plane.e1),
        y: plane.radiusKm * vecDot(direction, plane.e2),
      })
    },
  }
}

/**
 * Where the shadow actually falls on the target: the cross-section disc placed
 * at its miss distance, lifted onto the sunward surface and clipped to the
 * silhouette. Null when that cone touches no visible surface.
 */
export function shadowFootprint(
  cone: ShadowCone,
  feature: ShadowFeature,
  samples = 96,
): SurfaceRegion | null {
  const plane = fundamentalPlane(cone)
  const disc = shadowDisc(plane, cone, feature)
  if (!disc) return null
  const outline = convexHull(discOutline(disc, plane.radiusKm, samples))
  return surfaceRegion(plane, clipToSilhouette(outline, plane.radiusKm))
}

/**
 * Every place one feature of the shadow could fall across the along-track
 * envelope, as one region. Perturbing the Moon barely turns the shadow axis, so
 * all the samples share the nominal fundamental plane and only slide across it,
 * and their hull is the swept band. It contains the nominal footprint because
 * the unperturbed position is one of the samples; the track curves, so the band
 * has to be sampled finely enough that the chord between neighbors cannot cut
 * inside the shadow it is meant to bound.
 *
 * The feature is named rather than defaulted because a band bounds only the
 * feature it was built from. An umbral band says nothing about where the
 * penumbra falls, and drawing one beside a penumbra reads as an error bar on a
 * shadow it does not bound — which through a penumbral eclipse, where no umbra
 * lands at all, leaves the only shadow on the disc with no bound.
 */
export function shadowEnvelope(
  geometry: EclipseGeometry,
  caster: ShadowCaster,
  feature: ShadowFeature,
  steps = 33,
  samples = 48,
): SurfaceRegion | null {
  const plane = fundamentalPlane(activeCone(geometry, caster))
  const points = envelopeSamples(geometry, caster, steps).flatMap(({ cone }) => {
    const disc = shadowDisc(plane, cone, feature)
    return disc ? discOutline(disc, plane.radiusKm, samples) : []
  })
  return surfaceRegion(plane, clipToSilhouette(convexHull(points), plane.radiusKm))
}
