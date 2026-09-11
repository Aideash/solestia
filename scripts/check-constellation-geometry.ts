import {
  MILKY_WAY_DEPTH_CAP_LY,
  SLICE_DEPTH_PADDING,
  buildConstellationLocalFrame,
  clamp01,
  computeConstellationSlice,
  easeInOutCubic,
  equatorialToCartesianLy,
  equatorialToUnitDirection,
  fromLocalCoordinates,
  interpolateVec3,
  lerp,
  lerpVec3,
  mapSliceDepth,
  projectStemToReferencePlane,
  toLocalCoordinates,
  type ConstellationSlice,
} from '../src/lib/constellationGeometry.ts'
import type { Vec3 } from '../src/lib/kepler.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertFinite(value: number, label: string): void {
  assert(Number.isFinite(value), `${label} must be finite`)
}

function assertFiniteVec3(v: Vec3, label: string): void {
  assert(
    Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z),
    `${label} must be finite`,
  )
}

function assertClose(actual: number, expected: number, tolerance: number, label: string): void {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual} (±${tolerance})`,
  )
}

function assertUnit(v: Vec3, label: string, tolerance = 1e-9): void {
  assertFiniteVec3(v, label)
  assertClose(Math.hypot(v.x, v.y, v.z), 1, tolerance, `${label} length`)
}

function assertOrthonormalFrame(frame: ReturnType<typeof buildConstellationLocalFrame>): void {
  assertUnit(frame.depth, 'frame.depth')
  assertUnit(frame.east, 'frame.east')
  assertUnit(frame.north, 'frame.north')
  assertClose(
    Math.abs(
      frame.depth.x * frame.east.x + frame.depth.y * frame.east.y + frame.depth.z * frame.east.z,
    ),
    0,
    1e-9,
    'depth·east',
  )
  assertClose(
    Math.abs(
      frame.depth.x * frame.north.x + frame.depth.y * frame.north.y + frame.depth.z * frame.north.z,
    ),
    0,
    1e-9,
    'depth·north',
  )
  assertClose(
    Math.abs(
      frame.east.x * frame.north.x + frame.east.y * frame.north.y + frame.east.z * frame.north.z,
    ),
    0,
    1e-9,
    'east·north',
  )
}

function assertSliceFinite(slice: ConstellationSlice): void {
  assertFiniteVec3(slice.centroid, 'centroid')
  assertFiniteVec3(slice.frame.depth, 'frame.depth')
  assertFinite(slice.depthLimitLy, 'depthLimitLy')
  assertFinite(slice.referencePlaneY, 'referencePlaneY')
  for (const key of ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'] as const) {
    assertFinite(slice.bounds[key], `bounds.${key}`)
  }
}

// Cardinal equatorial directions (ICRS right-handed: +X vernal equinox, +Y RA 90°, +Z north pole).
const vernalEquinox = equatorialToUnitDirection(0, 0)
assertClose(vernalEquinox.x, 1, 1e-12, 'vernal equinox x')
assertClose(vernalEquinox.y, 0, 1e-12, 'vernal equinox y')
assertClose(vernalEquinox.z, 0, 1e-12, 'vernal equinox z')
assertUnit(vernalEquinox, 'vernal equinox')

const ra90 = equatorialToUnitDirection(90, 0)
assertClose(ra90.x, 0, 1e-12, 'RA 90 x')
assertClose(ra90.y, 1, 1e-12, 'RA 90 y')
assertClose(ra90.z, 0, 1e-12, 'RA 90 z')

const northPole = equatorialToUnitDirection(0, 90)
assertClose(northPole.x, 0, 1e-12, 'north pole x')
assertClose(northPole.y, 0, 1e-12, 'north pole y')
assertClose(northPole.z, 1, 1e-12, 'north pole z')

const cartesian = equatorialToCartesianLy(0, 0, 10)
assertClose(cartesian.x, 10, 1e-9, '10 ly at vernal equinox x')
assertClose(cartesian.y, 0, 1e-9, '10 ly at vernal equinox y')
assertClose(cartesian.z, 0, 1e-9, '10 ly at vernal equinox z')

// RA wrap: opposing edges of the sky should average near RA 0°.
const wrapFrame = buildConstellationLocalFrame([
  equatorialToUnitDirection(359, 0),
  equatorialToUnitDirection(1, 0),
])
assertOrthonormalFrame(wrapFrame)
assertClose(wrapFrame.depth.y, 0, 0.02, 'RA wrap frame depth y')
assert(wrapFrame.depth.x > 0.99, 'RA wrap frame depth should point near +X')

// Pole-stable local frame near the north celestial pole.
const poleFrame = buildConstellationLocalFrame([
  equatorialToUnitDirection(0, 89),
  equatorialToUnitDirection(90, 88),
  equatorialToUnitDirection(180, 89),
])
assertOrthonormalFrame(poleFrame)
assertFiniteVec3(poleFrame.depth, 'pole frame depth')
assert(poleFrame.depth.z > 0.9, 'pole frame depth should remain northward')

const poleFrameAtPole = buildConstellationLocalFrame([equatorialToUnitDirection(12, 90)])
assertOrthonormalFrame(poleFrameAtPole)
assertClose(poleFrameAtPole.depth.z, 1, 1e-9, 'exact pole depth z')

// Exact centroid and bounds on a simple local fixture (x=east, y=north/up, z=depth).
const fixtureFrame = buildConstellationLocalFrame([{ x: 1, y: 0, z: 0 }])
const fixturePositions = [
  fromLocalCoordinates({ x: -2, y: 3, z: 10 }, fixtureFrame),
  fromLocalCoordinates({ x: 4, y: 7, z: 20 }, fixtureFrame),
  fromLocalCoordinates({ x: 0, y: 1, z: 15 }, fixtureFrame),
]
const fixtureSlice = computeConstellationSlice([{ x: 1, y: 0, z: 0 }], fixturePositions)
assertClose(fixtureSlice.centroid.x, 2 / 3, 1e-9, 'fixture centroid x')
assertClose(fixtureSlice.centroid.y, 11 / 3, 1e-9, 'fixture centroid y')
assertClose(fixtureSlice.centroid.z, 15, 1e-9, 'fixture centroid z')
assertClose(fixtureSlice.bounds.minX, -2, 1e-9, 'fixture bounds minX')
assertClose(fixtureSlice.bounds.maxX, 4, 1e-9, 'fixture bounds maxX')
assertClose(fixtureSlice.bounds.minY, 1, 1e-9, 'fixture bounds minY')
assertClose(fixtureSlice.bounds.maxY, 7, 1e-9, 'fixture bounds maxY')
assertClose(fixtureSlice.bounds.minZ, 10, 1e-9, 'fixture bounds minZ')
assertClose(fixtureSlice.bounds.maxZ, 20, 1e-9, 'fixture bounds maxZ')
assert(
  fixtureSlice.referencePlaneY < fixtureSlice.bounds.minY,
  'reference plane must sit beneath the slice along local north',
)

// Centroid, bounds, padding, and Milky Way cap.
const orionPositions = [
  equatorialToCartesianLy(83, -5, 400),
  equatorialToCartesianLy(81, 6, 800),
  equatorialToCartesianLy(78, -8, 1200),
]
const orionDirections = orionPositions.map((position) => {
  const length = Math.hypot(position.x, position.y, position.z)
  return { x: position.x / length, y: position.y / length, z: position.z / length }
})
const orionSlice = computeConstellationSlice(orionDirections, orionPositions)
assert(orionSlice.measuredCount === 3, 'slice must count measured positions')
assert(orionSlice.depthLimitLy > 1200, 'depth limit must exceed farthest object')
assertClose(
  orionSlice.depthLimitLy,
  Math.min(1200 * (1 + SLICE_DEPTH_PADDING), MILKY_WAY_DEPTH_CAP_LY),
  1e-6,
  'depth limit padding',
)
assert(orionSlice.bounds.minZ <= orionSlice.bounds.maxZ, 'slice bounds must include depth')
assert(
  orionSlice.referencePlaneY < orionSlice.bounds.minY,
  'reference plane must sit beneath the slice along local north',
)
assertFiniteVec3(orionSlice.centroid, 'slice centroid')

const cappedSlice = computeConstellationSlice(
  [equatorialToUnitDirection(0, 0)],
  [equatorialToCartesianLy(0, 0, 95_000)],
)
assertClose(cappedSlice.depthLimitLy, MILKY_WAY_DEPTH_CAP_LY, 1e-6, 'Milky Way depth cap')

// Depth modes: true linearity, compressed monotonicity, shared endpoint, zero preservation.
const depthLimit = 1000
assertClose(mapSliceDepth(0, depthLimit, 'true'), 0, 1e-12, 'true depth at zero')
assertClose(mapSliceDepth(depthLimit, depthLimit, 'true'), depthLimit, 1e-9, 'true depth at limit')
assertClose(mapSliceDepth(250, depthLimit, 'true'), 250, 1e-9, 'true depth linear')

assertClose(mapSliceDepth(0, depthLimit, 'compressed'), 0, 1e-12, 'compressed depth at zero')
assertClose(
  mapSliceDepth(depthLimit, depthLimit, 'compressed'),
  depthLimit,
  1e-6,
  'compressed depth at limit',
)
const compressedMid = mapSliceDepth(250, depthLimit, 'compressed')
assert(
  compressedMid > 250 && compressedMid < depthLimit,
  'compressed depth should expand mid-range',
)
const compressedSamples = [0, 50, 200, 500, 900, 1000]
for (let index = 1; index < compressedSamples.length; index++) {
  const previous = mapSliceDepth(compressedSamples[index - 1], depthLimit, 'compressed')
  const current = mapSliceDepth(compressedSamples[index], depthLimit, 'compressed')
  assert(current >= previous, 'compressed depth must stay monotonic')
  assertFinite(current, 'compressed depth must stay finite')
}

// Stem projection preserves east/depth (x/z) and lands on the reference plane (y).
const localPosition = { x: 12, y: -4, z: 500 }
const stem = projectStemToReferencePlane(localPosition, -40)
assertClose(stem.tip.x, localPosition.x, 1e-12, 'stem tip x')
assertClose(stem.tip.y, localPosition.y, 1e-12, 'stem tip y')
assertClose(stem.tip.z, localPosition.z, 1e-12, 'stem tip z')
assertClose(stem.foot.x, localPosition.x, 1e-12, 'stem foot x')
assertClose(stem.foot.y, -40, 1e-12, 'stem foot y')
assertClose(stem.foot.z, localPosition.z, 1e-12, 'stem foot z')

// Interpolation clamps and preserves exact endpoints.
assertClose(clamp01(-0.5), 0, 1e-12, 'clamp01 lower')
assertClose(clamp01(1.5), 1, 1e-12, 'clamp01 upper')
assertClose(lerp(2, 8, 0.25), 3.5, 1e-12, 'lerp interior')
assertClose(lerp(2, 8, -1), 2, 1e-12, 'lerp clamp low')
assertClose(lerp(2, 8, 2), 8, 1e-12, 'lerp clamp high')
assertClose(easeInOutCubic(0), 0, 1e-12, 'ease at 0')
assertClose(easeInOutCubic(1), 1, 1e-12, 'ease at 1')
assert(easeInOutCubic(0.5) > 0 && easeInOutCubic(0.5) < 1, 'ease interior stays inside')
const from = { x: 0, y: 0, z: 1 }
const to = { x: 10, y: 20, z: 30 }
assertClose(interpolateVec3(from, to, 0).x, from.x, 1e-12, 'interpolate exact start x')
assertClose(interpolateVec3(from, to, 1).x, to.x, 1e-12, 'interpolate exact end x')
assertClose(interpolateVec3(from, to, -2).z, from.z, 1e-12, 'interpolate clamped start z')
assertClose(interpolateVec3(from, to, 3).z, to.z, 1e-12, 'interpolate clamped end z')

// Empty, single-point, and null-distance behavior.
const emptySlice = computeConstellationSlice([], [])
assert(emptySlice.measuredCount === 0, 'empty slice measured count')
assertClose(emptySlice.depthLimitLy, 0, 1e-12, 'empty slice depth limit')
assertFiniteVec3(emptySlice.centroid, 'empty slice centroid')
assertOrthonormalFrame(emptySlice.frame)

const singleDirection = [equatorialToUnitDirection(45, 20)]
const singlePosition = [equatorialToCartesianLy(45, 20, 50)]
const singleSlice = computeConstellationSlice(singleDirection, singlePosition)
assert(singleSlice.measuredCount === 1, 'single-point measured count')
assertOrthonormalFrame(singleSlice.frame)
const singleLocal = toLocalCoordinates(singlePosition[0], singleSlice.frame)
assertClose(singleLocal.z, 50, 0.5, 'single-point depth in local frame')
assert(
  Math.abs(singleLocal.x) < 1 && Math.abs(singleLocal.y) < 1,
  'single-point stays near depth axis',
)

const mixedSlice = computeConstellationSlice(
  [equatorialToUnitDirection(10, 5), equatorialToUnitDirection(12, 4)],
  [equatorialToCartesianLy(10, 5, 100), null],
)
assert(mixedSlice.measuredCount === 1, 'nullable distance must be excluded from measured positions')
assertFiniteVec3(mixedSlice.centroid, 'mixed slice centroid')
assertFinite(mixedSlice.bounds.maxZ, 'mixed slice bounds must stay finite')

// Finite-output contract: invalid numeric inputs on every exposed pathway.
const invalidDirection = equatorialToUnitDirection(Number.NaN, Number.POSITIVE_INFINITY)
assertFiniteVec3(invalidDirection, 'invalid equatorial direction')
assertUnit(invalidDirection, 'invalid equatorial direction unit')

const negativeDistance = equatorialToCartesianLy(0, 0, -25)
assertClose(negativeDistance.x, 0, 1e-12, 'negative distance x stays at Earth')
assertClose(negativeDistance.y, 0, 1e-12, 'negative distance y stays at Earth')
assertClose(negativeDistance.z, 0, 1e-12, 'negative distance z stays at Earth')

const invalidCartesian = equatorialToCartesianLy(Number.NaN, 45, Number.NaN)
assertFiniteVec3(invalidCartesian, 'invalid cartesian position')
assertClose(invalidCartesian.x, 0, 1e-12, 'invalid cartesian x')
assertClose(invalidCartesian.y, 0, 1e-12, 'invalid cartesian y')
assertClose(invalidCartesian.z, 0, 1e-12, 'invalid cartesian z')

assertFinite(clamp01(Number.NaN), 'clamp01 NaN')
assertClose(clamp01(Number.POSITIVE_INFINITY), 1, 1e-12, 'clamp01 +Infinity')
assertClose(clamp01(Number.NEGATIVE_INFINITY), 0, 1e-12, 'clamp01 -Infinity')
assertFinite(lerp(Number.NaN, 8, 0.5), 'lerp NaN endpoint')
assertFinite(lerp(2, Number.POSITIVE_INFINITY, 0.5), 'lerp infinite endpoint')
assertFinite(easeInOutCubic(Number.NaN), 'ease NaN')
assertFiniteVec3(lerpVec3({ x: Number.NaN, y: 0, z: 0 }, { x: 1, y: 2, z: 3 }, 0.5), 'lerpVec3 NaN')
assertFiniteVec3(
  interpolateVec3({ x: 0, y: 0, z: 0 }, { x: Number.NaN, y: 2, z: 3 }, Number.POSITIVE_INFINITY),
  'interpolateVec3 invalid',
)

const degenerateFrame = buildConstellationLocalFrame([
  { x: 0, y: 0, z: 0 },
  { x: Number.NaN, y: 1, z: 0 },
])
assertOrthonormalFrame(degenerateFrame)

assertFiniteVec3(toLocalCoordinates({ x: Number.NaN, y: 0, z: 0 }, fixtureFrame), 'toLocal invalid')
assertFiniteVec3(
  fromLocalCoordinates({ x: Number.POSITIVE_INFINITY, y: 0, z: 0 }, fixtureFrame),
  'fromLocal invalid',
)

const invalidSlice = computeConstellationSlice(
  [{ x: Number.NaN, y: 0, z: 0 }],
  [{ x: Number.NaN, y: 0, z: 10 }, { x: 1, y: 0, z: 20 }, null],
)
assert(invalidSlice.measuredCount === 1, 'non-finite measured positions must be excluded')
assertSliceFinite(invalidSlice)

assertFinite(mapSliceDepth(Number.NaN, 1000, 'true'), 'mapSliceDepth NaN depth')
assertFinite(mapSliceDepth(100, Number.NaN, 'compressed'), 'mapSliceDepth NaN limit')
assertFinite(
  mapSliceDepth(Number.POSITIVE_INFINITY, 1000, 'compressed'),
  'mapSliceDepth infinite depth',
)

const invalidStem = projectStemToReferencePlane(
  { x: Number.NaN, y: 2, z: 3 },
  Number.POSITIVE_INFINITY,
)
assertFiniteVec3(invalidStem.tip, 'invalid stem tip')
assertFiniteVec3(invalidStem.foot, 'invalid stem foot')
assertClose(invalidStem.foot.x, 0, 1e-12, 'invalid stem foot x fallback')
assertClose(invalidStem.foot.y, 0, 1e-12, 'invalid stem foot y fallback')
assertClose(invalidStem.foot.z, 3, 1e-12, 'invalid stem foot z preserves finite depth')

assertSliceFinite(orionSlice)
assertSliceFinite(emptySlice)
assertSliceFinite(singleSlice)
assertSliceFinite(mixedSlice)
assertSliceFinite(fixtureSlice)

// Finite overflow: MAX_VALUE-scale inputs must stay finite without breaking normal paths.
const huge = Number.MAX_VALUE
const hugeCartesian = equatorialToCartesianLy(0, 0, huge)
assertFiniteVec3(hugeCartesian, 'huge cartesian position')
assert(hugeCartesian.x === huge, 'huge cartesian must preserve finite requested distance')

const beyondGalaxyLy = 150_000
const beyondGalaxy = equatorialToCartesianLy(0, 0, beyondGalaxyLy)
assertClose(
  beyondGalaxy.x,
  beyondGalaxyLy,
  1e-6,
  'cartesian preserves distance beyond Milky Way cap',
)

const beyondSlice = computeConstellationSlice(
  [equatorialToUnitDirection(0, 0)],
  [equatorialToCartesianLy(0, 0, 120_000), equatorialToCartesianLy(0, 0, beyondGalaxyLy)],
)
assertSliceFinite(beyondSlice)
assertClose(
  beyondSlice.depthLimitLy,
  MILKY_WAY_DEPTH_CAP_LY,
  1e-6,
  'depth limit caps at Milky Way while positions stay uncapped',
)
assertClose(beyondSlice.bounds.maxZ, beyondGalaxyLy, 1e-3, 'bounds keep farthest uncapped depth')
assertClose(beyondSlice.centroid.z, 135_000, 1e-3, 'centroid uses uncapped measured depths')

const hugeSlice = computeConstellationSlice(
  [equatorialToUnitDirection(0, 0)],
  [equatorialToCartesianLy(0, 0, huge)],
)
assertSliceFinite(hugeSlice)
assertClose(
  hugeSlice.depthLimitLy,
  MILKY_WAY_DEPTH_CAP_LY,
  1e-6,
  'padded huge depth limit must cap at Milky Way rather than collapse to zero',
)
assert(hugeSlice.bounds.maxZ === huge, 'slice bounds preserve huge measured depth')

const largeLocalA = { x: huge, y: 0, z: MILKY_WAY_DEPTH_CAP_LY }
const largeLocalB = { x: -huge, y: 0, z: MILKY_WAY_DEPTH_CAP_LY / 2 }
const largeSlice = computeConstellationSlice(
  [{ x: 1, y: 0, z: 0 }],
  [
    fromLocalCoordinates(largeLocalA, fixtureFrame),
    fromLocalCoordinates(largeLocalB, fixtureFrame),
  ],
)
assertSliceFinite(largeSlice)
assertFiniteVec3(toLocalCoordinates(hugeCartesian, fixtureFrame), 'huge toLocal')
assertFiniteVec3(fromLocalCoordinates(largeLocalA, fixtureFrame), 'huge fromLocal')

const largeA = MILKY_WAY_DEPTH_CAP_LY * 0.25
const largeB = MILKY_WAY_DEPTH_CAP_LY * 0.75
assertClose(lerp(largeA, largeB, 0), largeA, 1e-12, 'lerp exact start at astronomy scale')
assertClose(lerp(largeA, largeB, 1), largeB, 1e-12, 'lerp exact end at astronomy scale')
assertFinite(lerp(largeA, huge, 0.5), 'lerp interior with MAX_VALUE endpoint')
assertClose(
  interpolateVec3({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }, 0).x,
  1,
  1e-12,
  'interpolate exact start',
)
assertClose(
  interpolateVec3({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }, 1).x,
  4,
  1e-12,
  'interpolate exact end',
)
assertFinite(mapSliceDepth(huge, MILKY_WAY_DEPTH_CAP_LY, 'true'), 'mapSliceDepth huge true mode')
assertClose(
  mapSliceDepth(MILKY_WAY_DEPTH_CAP_LY, MILKY_WAY_DEPTH_CAP_LY, 'compressed'),
  MILKY_WAY_DEPTH_CAP_LY,
  1e-6,
  'compressed depth at cap endpoint',
)

// Multi-axis MAX_VALUE radial distance must stay stable: Math.hypot across several
// MAX_VALUE axes overflows to Infinity, so the padded depth limit must still cap at the
// Milky Way limit instead of collapsing to zero.
const multiAxisSlice = computeConstellationSlice(
  [{ x: 1, y: 1, z: 1 }],
  [{ x: huge, y: huge, z: huge }],
)
assertSliceFinite(multiAxisSlice)
assertClose(
  multiAxisSlice.depthLimitLy,
  MILKY_WAY_DEPTH_CAP_LY,
  1e-6,
  'multi-axis MAX_VALUE radial distance must cap depth at Milky Way, not collapse to zero',
)

// Local-coordinate projection must stay numerically stable when the dot product overflows.
// A diagonal frame dotted with a MAX_VALUE diagonal position must keep the correct sign and
// saturate finitely rather than falling back to zero.
const diagonalFrame = buildConstellationLocalFrame([{ x: 1, y: 1, z: 1 }])
const hugeDiagonalLocal = toLocalCoordinates({ x: huge, y: huge, z: huge }, diagonalFrame)
assertFiniteVec3(hugeDiagonalLocal, 'huge diagonal local coordinates')
assert(
  hugeDiagonalLocal.z > 0,
  'positive diagonal depth must saturate positive instead of collapsing to zero',
)
const hugeNegativeDiagonalLocal = toLocalCoordinates(
  { x: -huge, y: -huge, z: -huge },
  diagonalFrame,
)
assertFiniteVec3(hugeNegativeDiagonalLocal, 'huge negative diagonal local coordinates')
assert(
  hugeNegativeDiagonalLocal.z < 0,
  'negative diagonal depth must saturate negative instead of collapsing to zero',
)

// Opposing ±MAX_VALUE measured positions must produce a centroid near zero, not a saturated
// half-MAX_VALUE artifact from incremental-mean overflow.
const opposingPositions = [
  fromLocalCoordinates({ x: huge, y: 0, z: 0 }, fixtureFrame),
  fromLocalCoordinates({ x: -huge, y: 0, z: 0 }, fixtureFrame),
]
const opposingSlice = computeConstellationSlice([{ x: 1, y: 0, z: 0 }], opposingPositions)
assertSliceFinite(opposingSlice)
assertClose(
  opposingSlice.centroid.x,
  0,
  1,
  'opposing ±MAX_VALUE positions must average to a centroid near zero',
)

console.log(
  'ok  constellation geometry: equatorial conversion, local frames, slice bounds, depth modes, stems, interpolation',
)
