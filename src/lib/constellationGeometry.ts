import type { Vec3 } from './kepler.ts'

/** Maximum in-galaxy depth used by the constellation slice viewer. */
export const MILKY_WAY_DEPTH_CAP_LY = 100_000

/** Fractional padding beyond the farthest measured object when computing slice depth. */
export const SLICE_DEPTH_PADDING = 0.1

/** Gap between the slice floor and the stem reference plane, as a fraction of slice north span. */
const REFERENCE_PLANE_GAP = 0.08

/** Power exponent for compressed depth; values below 1 expand nearby depth while preserving endpoints. */
const COMPRESSED_DEPTH_EXPONENT = 0.35

export type ConstellationLocalFrame = {
  /** Earth-centered origin for equatorial Cartesian coordinates. */
  readonly origin: Vec3
  /** Unit vector from Earth toward the constellation's angular center (+depth). */
  readonly depth: Vec3
  /** Unit vector east along the tangent plane. */
  readonly east: Vec3
  /** Unit vector north along the tangent plane. */
  readonly north: Vec3
}

export type SliceBounds = {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
  readonly minZ: number
  readonly maxZ: number
}

export type ConstellationSlice = {
  readonly frame: ConstellationLocalFrame
  /** Geometric centroid of measured positions in the local frame. */
  readonly centroid: Vec3
  readonly bounds: SliceBounds
  /** Local north coordinate of the reference plane beneath the slice. */
  readonly referencePlaneY: number
  /** Physical depth limit in light-years, padded and capped at the Milky Way limit. */
  readonly depthLimitLy: number
  readonly measuredCount: number
}

export type StemSegment = {
  /** Object position in the local frame. */
  readonly tip: Vec3
  /** Stem foot on the reference plane beneath the slice. */
  readonly foot: Vec3
}

export type ConstellationDepthMode = 'true' | 'compressed'

const DEG = Math.PI / 180
const CELESTIAL_NORTH: Vec3 = { x: 0, y: 0, z: 1 }
const FALLBACK_REFERENCE: Vec3 = { x: 0, y: 1, z: 0 }
const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 }

/**
 * ICRS equatorial right-handed Earth-centered unit direction.
 * +X points at the vernal equinox (RA 0°, Dec 0°), +Y at RA 90°, Dec 0°,
 * and +Z at the north celestial pole.
 */
export function equatorialToUnitDirection(raDeg: number, decDeg: number): Vec3 {
  const ra = finiteOr(raDeg, 0) * DEG
  const dec = finiteOr(decDeg, 0) * DEG
  const cosDec = Math.cos(dec)
  return normalize({
    x: cosDec * Math.cos(ra),
    y: cosDec * Math.sin(ra),
    z: Math.sin(dec),
  })
}

/** Earth-centered equatorial Cartesian position in light-years. Nonpositive distance stays at Earth. */
export function equatorialToCartesianLy(raDeg: number, decDeg: number, distanceLy: number): Vec3 {
  const distance = sanitizeDistanceLy(distanceLy)
  if (distance === 0) return { ...ORIGIN }
  const direction = equatorialToUnitDirection(raDeg, decDeg)
  return scaleDirection(direction, distance)
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return value === Number.POSITIVE_INFINITY ? 1 : 0
  }
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

export function lerp(from: number, to: number, t: number): number {
  const clamped = clamp01(t)
  if (clamped <= 0) return Number.isFinite(from) ? from : 0
  if (clamped >= 1) return Number.isFinite(to) ? to : Number.isFinite(from) ? from : 0
  const start = Number.isFinite(from) ? from : 0
  const end = Number.isFinite(to) ? to : start
  return finiteAdd(start, finiteMul(finiteSub(end, start), clamped))
}

/** Smooth ease with exact endpoints at 0 and 1. */
export function easeInOutCubic(t: number): number {
  const clamped = clamp01(t)
  if (clamped <= 0) return 0
  if (clamped >= 1) return 1
  return clamped < 0.5 ? 4 * clamped * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 3) / 2
}

export function lerpVec3(from: Vec3, to: Vec3, t: number): Vec3 {
  const clamped = clamp01(t)
  if (clamped <= 0) return sanitizeVec3(from)
  if (clamped >= 1) return sanitizeVec3(to, sanitizeVec3(from))
  return {
    x: lerp(from.x, to.x, clamped),
    y: lerp(from.y, to.y, clamped),
    z: lerp(from.z, to.z, clamped),
  }
}

/** Clamped eased interpolation for sky-to-slice transitions. */
export function interpolateVec3(from: Vec3, to: Vec3, t: number): Vec3 {
  const eased = easeInOutCubic(t)
  if (eased <= 0) return sanitizeVec3(from)
  if (eased >= 1) return sanitizeVec3(to, sanitizeVec3(from))
  return lerpVec3(from, to, eased)
}

/**
 * Build a pole-stable tangent frame from one or more unit directions.
 * Directions are averaged on the sphere so RA wrap does not bias the frame.
 */
export function buildConstellationLocalFrame(
  anchorDirections: readonly Vec3[],
): ConstellationLocalFrame {
  const origin = { ...ORIGIN }
  const depth = averageUnitDirections(anchorDirections)
  const upReference =
    Math.abs(dot(depth, CELESTIAL_NORTH)) > 0.999 ? FALLBACK_REFERENCE : CELESTIAL_NORTH
  const east = normalize(cross(upReference, depth))
  const north = normalize(cross(depth, east))
  return { origin, depth, east, north }
}

export function toLocalCoordinates(positionLy: Vec3, frame: ConstellationLocalFrame): Vec3 {
  if (!isFiniteVec3(positionLy)) return { ...ORIGIN }
  const relative = subtract(positionLy, frame.origin)
  return {
    x: finiteOr(dot(relative, frame.east), 0),
    y: finiteOr(dot(relative, frame.north), 0),
    z: finiteOr(dot(relative, frame.depth), 0),
  }
}

export function fromLocalCoordinates(local: Vec3, frame: ConstellationLocalFrame): Vec3 {
  const safe = sanitizeVec3(local)
  return {
    x: finiteOr(
      finiteAdd(
        frame.origin.x,
        finiteAdd(
          finiteAdd(finiteMul(safe.x, frame.east.x), finiteMul(safe.y, frame.north.x)),
          finiteMul(safe.z, frame.depth.x),
        ),
      ),
      frame.origin.x,
    ),
    y: finiteOr(
      finiteAdd(
        frame.origin.y,
        finiteAdd(
          finiteAdd(finiteMul(safe.x, frame.east.y), finiteMul(safe.y, frame.north.y)),
          finiteMul(safe.z, frame.depth.y),
        ),
      ),
      frame.origin.y,
    ),
    z: finiteOr(
      finiteAdd(
        frame.origin.z,
        finiteAdd(
          finiteAdd(finiteMul(safe.x, frame.east.z), finiteMul(safe.y, frame.north.z)),
          finiteMul(safe.z, frame.depth.z),
        ),
      ),
      frame.origin.z,
    ),
  }
}

export function computeConstellationSlice(
  anchorDirections: readonly Vec3[],
  positionsLy: readonly (Vec3 | null)[],
): ConstellationSlice {
  const frame = buildConstellationLocalFrame(anchorDirections)
  const measured = positionsLy.filter(
    (position): position is Vec3 => position !== null && isFiniteVec3(position),
  )
  const localPositions = measured.map((position) => toLocalCoordinates(position, frame))

  if (localPositions.length === 0) {
    return {
      frame,
      centroid: { ...ORIGIN },
      bounds: emptyBounds(),
      referencePlaneY: 0,
      depthLimitLy: 0,
      measuredCount: 0,
    }
  }

  const centroid = averageVec3(localPositions)
  const bounds = boundsFromPoints(localPositions)
  const farthestLy = Math.max(
    0,
    ...measured.map((position) => stableMagnitude(position.x, position.y, position.z)),
  )
  const depthLimitLy = computePaddedDepthLimit(farthestLy)
  const northSpan = Math.max(finiteSub(bounds.maxY, bounds.minY), finiteMul(depthLimitLy, 0.05), 1)
  const referencePlaneY = finiteSub(bounds.minY, finiteMul(northSpan, REFERENCE_PLANE_GAP))

  return {
    frame,
    centroid,
    bounds,
    referencePlaneY: finiteOr(referencePlaneY, bounds.minY),
    depthLimitLy,
    measuredCount: measured.length,
  }
}

export function mapSliceDepth(
  depthLy: number,
  depthLimitLy: number,
  mode: ConstellationDepthMode,
): number {
  const depth = sanitizeDepthLy(depthLy)
  const limit = sanitizeDepthLimitLy(depthLimitLy)
  if (limit <= 0) return 0
  if (mode === 'true') return Math.min(depth, limit)
  if (depth <= 0) return 0
  if (depth >= limit) return limit
  const ratio = depth / limit
  return finiteOr(limit * Math.pow(ratio, COMPRESSED_DEPTH_EXPONENT), limit)
}

export function projectStemToReferencePlane(
  localPosition: Vec3,
  referencePlaneY: number,
): StemSegment {
  const tip = sanitizeVec3(localPosition)
  const planeY = finiteOr(referencePlaneY, 0)
  return {
    tip,
    foot: { x: tip.x, y: planeY, z: tip.z },
  }
}

function computePaddedDepthLimit(farthestLy: number): number {
  if (!Number.isFinite(farthestLy) || farthestLy <= 0) return 0
  if (farthestLy >= MILKY_WAY_DEPTH_CAP_LY / (1 + SLICE_DEPTH_PADDING)) {
    return MILKY_WAY_DEPTH_CAP_LY
  }
  const padded = finiteMul(farthestLy, 1 + SLICE_DEPTH_PADDING)
  if (!Number.isFinite(padded) || padded >= MILKY_WAY_DEPTH_CAP_LY) {
    return MILKY_WAY_DEPTH_CAP_LY
  }
  return padded
}

function sanitizeDistanceLy(distanceLy: number): number {
  if (!Number.isFinite(distanceLy) || distanceLy <= 0) return 0
  return distanceLy
}

function sanitizeDepthLy(depthLy: number): number {
  if (!Number.isFinite(depthLy) || depthLy < 0) return 0
  return depthLy
}

function sanitizeDepthLimitLy(depthLimitLy: number): number {
  if (!Number.isFinite(depthLimitLy) || depthLimitLy < 0) return 0
  return Math.min(depthLimitLy, MILKY_WAY_DEPTH_CAP_LY)
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function finiteAdd(a: number, b: number): number {
  if (!Number.isFinite(a)) return Number.isFinite(b) ? b : 0
  if (!Number.isFinite(b)) return a
  const result = a + b
  if (Number.isFinite(result)) return result
  if (a > 0 && b > 0) return Number.MAX_VALUE
  if (a < 0 && b < 0) return -Number.MAX_VALUE
  return 0
}

function finiteSub(a: number, b: number): number {
  if (!Number.isFinite(a)) return Number.isFinite(b) ? -b : 0
  if (!Number.isFinite(b)) return a
  const result = a - b
  if (Number.isFinite(result)) return result
  if (a > 0 && b < 0) return Number.MAX_VALUE
  if (a < 0 && b > 0) return -Number.MAX_VALUE
  return 0
}

function finiteMul(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  const result = a * b
  if (Number.isFinite(result)) return result
  return a > 0 === b > 0 ? Number.MAX_VALUE : -Number.MAX_VALUE
}

function isFiniteVec3(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
}

function sanitizeVec3(v: Vec3, fallback: Vec3 = ORIGIN): Vec3 {
  return {
    x: finiteOr(v.x, fallback.x),
    y: finiteOr(v.y, fallback.y),
    z: finiteOr(v.z, fallback.z),
  }
}

function scaleDirection(direction: Vec3, distanceLy: number): Vec3 {
  return {
    x: finiteOr(direction.x * distanceLy, 0),
    y: finiteOr(direction.y * distanceLy, 0),
    z: finiteOr(direction.z * distanceLy, 0),
  }
}

function averageUnitDirections(directions: readonly Vec3[]): Vec3 {
  if (directions.length === 0) return { ...CELESTIAL_NORTH }
  let sum = { ...ORIGIN }
  for (const direction of directions) {
    if (!isFiniteVec3(direction)) continue
    const length = Math.hypot(direction.x, direction.y, direction.z)
    if (length === 0) continue
    const unit = {
      x: direction.x / length,
      y: direction.y / length,
      z: direction.z / length,
    }
    sum = {
      x: finiteAdd(sum.x, unit.x),
      y: finiteAdd(sum.y, unit.y),
      z: finiteAdd(sum.z, unit.z),
    }
  }
  const length = Math.hypot(sum.x, sum.y, sum.z)
  if (length === 0) return { ...CELESTIAL_NORTH }
  return { x: sum.x / length, y: sum.y / length, z: sum.z / length }
}

function averageVec3(values: readonly Vec3[]): Vec3 {
  const count = values.length
  if (count === 0) return { ...ORIGIN }
  let sumX = 0
  let sumY = 0
  let sumZ = 0
  // Scale each term by the total count before summing so opposing extremes such as
  // +MAX_VALUE and -MAX_VALUE cancel to zero instead of saturating an incremental mean.
  for (const value of values) {
    sumX = finiteAdd(sumX, finiteDiv(value.x, count))
    sumY = finiteAdd(sumY, finiteDiv(value.y, count))
    sumZ = finiteAdd(sumZ, finiteDiv(value.z, count))
  }
  return {
    x: finiteOr(sumX, 0),
    y: finiteOr(sumY, 0),
    z: finiteOr(sumZ, 0),
  }
}

function finiteDiv(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0
  const result = a / b
  if (Number.isFinite(result)) return result
  return a > 0 === b > 0 ? Number.MAX_VALUE : -Number.MAX_VALUE
}

function boundsFromPoints(points: readonly Vec3[]): SliceBounds {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
    minZ = Math.min(minZ, point.z)
    maxZ = Math.max(maxZ, point.z)
  }
  if (!Number.isFinite(minX)) return emptyBounds()
  return {
    minX: finiteOr(minX, 0),
    maxX: finiteOr(maxX, 0),
    minY: finiteOr(minY, 0),
    maxY: finiteOr(maxY, 0),
    minZ: finiteOr(minZ, 0),
    maxZ: finiteOr(maxZ, 0),
  }
}

function emptyBounds(): SliceBounds {
  return {
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
    minZ: 0,
    maxZ: 0,
  }
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: finiteSub(a.x, b.x), y: finiteSub(a.y, b.y), z: finiteSub(a.z, b.z) }
}

function dot(a: Vec3, b: Vec3): number {
  const raw = a.x * b.x + a.y * b.y + a.z * b.z
  if (Number.isFinite(raw)) return raw
  // Rescale by the largest magnitude component of `a` so the products stay in range,
  // then restore scale. This preserves the true sign and saturates to MAX_VALUE only
  // when the mathematically correct result genuinely overflows double precision.
  const scale = Math.max(Math.abs(a.x), Math.abs(a.y), Math.abs(a.z))
  if (scale === 0 || !Number.isFinite(scale)) return 0
  const scaled = (a.x / scale) * b.x + (a.y / scale) * b.y + (a.z / scale) * b.z
  const result = scaled * scale
  if (Number.isFinite(result)) return result
  if (scaled > 0) return Number.MAX_VALUE
  if (scaled < 0) return -Number.MAX_VALUE
  return 0
}

/** Euclidean magnitude that saturates to MAX_VALUE instead of overflowing to Infinity. */
function stableMagnitude(x: number, y: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return 0
  const ax = Math.abs(x)
  const ay = Math.abs(y)
  const az = Math.abs(z)
  const scale = Math.max(ax, ay, az)
  if (scale === 0) return 0
  const magnitude = scale * Math.hypot(ax / scale, ay / scale, az / scale)
  return Number.isFinite(magnitude) ? magnitude : Number.MAX_VALUE
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: finiteSub(a.y * b.z, a.z * b.y),
    y: finiteSub(a.z * b.x, a.x * b.z),
    z: finiteSub(a.x * b.y, a.y * b.x),
  }
}

function normalize(v: Vec3): Vec3 {
  if (!isFiniteVec3(v)) return { ...CELESTIAL_NORTH }
  const length = Math.hypot(v.x, v.y, v.z)
  if (length === 0) return { ...CELESTIAL_NORTH }
  return { x: v.x / length, y: v.y / length, z: v.z / length }
}
