import {
  CONSTELLATIONS,
  CONSTELLATION_LANDMARKS,
  CONSTELLATION_STARS,
} from '../src/data/constellations.ts'
import type { Vec3 } from '../src/lib/kepler.ts'
import {
  MAX_STAR_POINT_SIZE,
  MIN_STAR_POINT_SIZE,
  buildOverviewFigureEdges,
  buildOverviewStarField,
  buildSelectionModel,
  collectNameWorthyPicks,
  collectStemFootSpots,
  spectralColor,
  starPointSize,
  type RgbColor,
} from '../src/components/constellations/constellationSceneModel.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertFinite(value: number, label: string): void {
  assert(Number.isFinite(value), `${label} must be finite, got ${value}`)
}

function assertClose(actual: number, expected: number, tolerance: number, label: string): void {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual} (±${tolerance})`,
  )
}

function assertFiniteVec3(v: Vec3, label: string): void {
  assert(
    Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z),
    `${label} must be finite`,
  )
}

function assertColorInBounds(color: RgbColor, label: string): void {
  for (const channel of ['r', 'g', 'b'] as const) {
    const value = color[channel]
    assertFinite(value, `${label}.${channel}`)
    assert(value >= 0 && value <= 1, `${label}.${channel} must be within [0,1], got ${value}`)
  }
}

const CONSTELLATION_IDS = new Set(CONSTELLATIONS.map(({ id }) => id))

// ---------------------------------------------------------------------------
// Spectral color: measured colors within bounds, bluer for negative bp-rp.
// ---------------------------------------------------------------------------
const baseColor = spectralColor({ bpRp: null, spectralType: null })
assertColorInBounds(baseColor, 'base spectral color')

const blueColor = spectralColor({ bpRp: -0.3, spectralType: null })
const redColor = spectralColor({ bpRp: 2.2, spectralType: null })
assertColorInBounds(blueColor, 'blue spectral color')
assertColorInBounds(redColor, 'red spectral color')
assert(blueColor.b > redColor.b, 'a hot blue star must carry more blue than a cool red star')
assert(redColor.r > blueColor.r, 'a cool red star must carry more red than a hot blue star')

// Spectral-type fallback when bp-rp is missing.
const oType = spectralColor({ bpRp: null, spectralType: 'O5V' })
const mType = spectralColor({ bpRp: null, spectralType: 'M2III' })
assertColorInBounds(oType, 'O-type spectral color')
assertColorInBounds(mType, 'M-type spectral color')
assert(oType.b > mType.b, 'an O-type star must be bluer than an M-type star from spectral type')

// Invalid inputs still yield an in-bounds color.
assertColorInBounds(
  spectralColor({ bpRp: Number.NaN, spectralType: '???' }),
  'invalid spectral color',
)
assertColorInBounds(
  spectralColor({ bpRp: Number.POSITIVE_INFINITY, spectralType: null }),
  'infinite bp-rp spectral color',
)

// ---------------------------------------------------------------------------
// Brightness sizing: bounded and monotonic (brighter is larger).
// ---------------------------------------------------------------------------
for (const magnitude of [-1.46, 0, 2.5, 6, 9]) {
  const size = starPointSize(magnitude)
  assertFinite(size, `star point size at magnitude ${magnitude}`)
  assert(
    size >= MIN_STAR_POINT_SIZE && size <= MAX_STAR_POINT_SIZE,
    `star point size at magnitude ${magnitude} must stay within bounds`,
  )
}
assert(
  starPointSize(-1.46) > starPointSize(2.5) && starPointSize(2.5) > starPointSize(6),
  'brighter (lower magnitude) stars must render larger',
)
assert(
  starPointSize(Number.NaN) >= MIN_STAR_POINT_SIZE &&
    starPointSize(Number.NaN) <= MAX_STAR_POINT_SIZE,
  'a non-finite magnitude must still produce an in-bounds size',
)
assert(
  starPointSize(-50) <= MAX_STAR_POINT_SIZE && starPointSize(50) >= MIN_STAR_POINT_SIZE,
  'extreme magnitudes must clamp to the size bounds',
)

// ---------------------------------------------------------------------------
// Overview star field: efficient finite buffers with valid pick IDs.
// ---------------------------------------------------------------------------
const overview = buildOverviewStarField()
assert(overview.count === CONSTELLATION_STARS.length, 'overview must render every catalog star')
assert(overview.positions.length === overview.count * 3, 'position buffer must be 3 per star')
assert(overview.colors.length === overview.count * 3, 'color buffer must be 3 per star')
assert(overview.sizes.length === overview.count, 'size buffer must be 1 per star')
assert(overview.ids.length === overview.count, 'ids must be 1 per star')
assert(overview.pickIds.length === overview.count, 'pick ids must be 1 per star')

for (let index = 0; index < overview.count; index++) {
  const x = overview.positions[index * 3]
  const y = overview.positions[index * 3 + 1]
  const z = overview.positions[index * 3 + 2]
  assert(
    Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z),
    `overview position ${index} must be finite`,
  )
  const length = Math.hypot(x, y, z)
  assert(Math.abs(length - 1) <= 1e-6, `overview position ${index} must sit on the unit sphere`)
  for (const channel of [0, 1, 2]) {
    const value = overview.colors[index * 3 + channel]
    assert(
      Number.isFinite(value) && value >= 0 && value <= 1,
      `overview color ${index} channel ${channel} must be within [0,1]`,
    )
  }
  const size = overview.sizes[index]
  assert(
    Number.isFinite(size) && size >= MIN_STAR_POINT_SIZE && size <= MAX_STAR_POINT_SIZE,
    `overview size ${index} must be within bounds`,
  )
}

let nonNullPickCount = 0
let nullPickCount = 0
for (const pickId of overview.pickIds) {
  if (pickId === null) {
    nullPickCount++
    continue
  }
  nonNullPickCount++
  assert(CONSTELLATION_IDS.has(pickId), `pick id ${pickId} must be a real constellation route ID`)
}
assert(nonNullPickCount > 0, 'some overview stars must be selectable')
assert(nullPickCount > 0, 'context-only stars must not be selectable')

// ---------------------------------------------------------------------------
// Invalid / null selection: never build a model, never emit an invalid ID.
// ---------------------------------------------------------------------------
assert(buildSelectionModel(null, 'compressed') === null, 'null selection must not build a model')
assert(
  buildSelectionModel('not-a-real-constellation', 'compressed') === null,
  'unknown selection must not build a model',
)
assert(
  buildSelectionModel('Orion', 'compressed') === null,
  'selection lookup must remain case-sensitive to route IDs',
)

// ---------------------------------------------------------------------------
// Orion: figure stars, edges, landmarks, physical/display positions, stems.
// ---------------------------------------------------------------------------
const orion = buildSelectionModel('orion', 'compressed')
assert(orion !== null, 'Orion must build a selection model')
assert(orion.id === 'orion' && orion.name === 'Orion', 'Orion model must carry its identity')

const orionConstellation = CONSTELLATIONS.find(({ id }) => id === 'orion')
assert(orionConstellation !== undefined, 'Orion must exist in the catalog')

const figureStars = orion.stars.filter((star) => star.kind === 'figure')
assert(figureStars.length > 0, 'Orion must have figure stars')
const orionFigureIds = new Set(
  CONSTELLATION_STARS.filter((star) => star.constellationIds.includes('orion')).map(
    (star) => star.id,
  ),
)
assert(
  figureStars.every((star) => orionFigureIds.has(star.id)),
  'every figure star must belong to the Orion figure',
)

// Edge resolution: each edge references two figure stars by index.
assert(
  orion.edges.length === orionConstellation.edges.length,
  'resolved edge count must match the catalog figure',
)
for (const edge of orion.edges) {
  assert(
    edge.fromIndex >= 0 && edge.fromIndex < orion.stars.length,
    'edge fromIndex must be in range',
  )
  assert(edge.toIndex >= 0 && edge.toIndex < orion.stars.length, 'edge toIndex must be in range')
  const from = orion.stars[edge.fromIndex]
  const to = orion.stars[edge.toIndex]
  assert(from.id === edge.fromId && to.id === edge.toId, 'edge indices must match their star IDs')
  assert(
    from.kind === 'figure' && to.kind === 'figure',
    'figure edges must only connect figure stars',
  )
}

// Landmark inclusion: Orion carries the Orion Nebula.
assert(
  orion.landmarks.some((landmark) => landmark.name === 'Orion Nebula'),
  'Orion selection must include the Orion Nebula landmark',
)
for (const landmark of orion.landmarks) {
  assertFiniteVec3(landmark.direction, `landmark ${landmark.id} direction`)
  assertFiniteVec3(landmark.physical, `landmark ${landmark.id} physical`)
  assertFiniteVec3(landmark.local, `landmark ${landmark.id} local`)
  assertFiniteVec3(landmark.displayLocal, `landmark ${landmark.id} displayLocal`)
  assert(landmark.distanceLy > 0, `landmark ${landmark.id} must carry a positive distance`)
}

// Physical positions, display positions, and stems stay finite.
assertFiniteVec3(orion.centroidLocal, 'Orion centroid')
assertFinite(orion.scale.maxLightYears, 'Orion max light-years')
assert(orion.scale.maxLightYears > 0, 'Orion must span a finite positive depth')
assert(orion.scale.mode === 'compressed', 'scale data must echo the requested mode')
assertFinite(orion.scale.depthLimitLy, 'Orion depth limit')

for (const star of orion.stars) {
  assertFiniteVec3(star.direction, `star ${star.id} direction`)
  assert(
    Math.abs(Math.hypot(star.direction.x, star.direction.y, star.direction.z) - 1) <= 1e-6,
    `star ${star.id} direction must be a unit vector`,
  )
  assertColorInBounds(star.color, `star ${star.id} color`)
  assert(
    star.size >= MIN_STAR_POINT_SIZE && star.size <= MAX_STAR_POINT_SIZE,
    `star ${star.id} size must be within bounds`,
  )
  if (star.distanceLy === null) {
    assert(
      star.physical === null,
      `star ${star.id} without distance must omit its physical position`,
    )
    assert(star.local === null, `star ${star.id} without distance must omit its local position`)
    assert(
      star.displayLocal === null && star.stem === null,
      `star ${star.id} without distance must omit its slice placement`,
    )
  } else {
    assert(star.physical !== null, `star ${star.id} with distance must carry a physical position`)
    assertFiniteVec3(star.physical, `star ${star.id} physical`)
    assert(
      star.displayLocal !== null && star.stem !== null,
      `star ${star.id} must place into the slice`,
    )
    assertFiniteVec3(star.displayLocal, `star ${star.id} displayLocal`)
    assert(
      star.displayLocal.z >= 0 && star.displayLocal.z <= orion.scale.depthLimitLy + 1e-6,
      `star ${star.id} display depth must stay within the slice depth limit`,
    )
    // Stems: preserve east/depth and land on the reference plane.
    assert(
      Math.abs(star.stem.tip.x - star.displayLocal.x) <= 1e-9 &&
        Math.abs(star.stem.tip.z - star.displayLocal.z) <= 1e-9,
      `star ${star.id} stem tip must match its display position`,
    )
    assert(
      Math.abs(star.stem.foot.x - star.displayLocal.x) <= 1e-9 &&
        Math.abs(star.stem.foot.z - star.displayLocal.z) <= 1e-9,
      `star ${star.id} stem foot must preserve east/depth`,
    )
    assert(
      Math.abs(star.stem.foot.y - orion.slice.referencePlaneY) <= 1e-9,
      `star ${star.id} stem foot must land on the reference plane`,
    )
  }
}

// Slice statistics use physical positions: measured count excludes unavailable objects.
const measuredStarCount = orion.stars.filter((star) => star.physical !== null).length
assert(
  orion.slice.measuredCount === measuredStarCount + orion.landmarks.length,
  'slice measured count must include measured stars and landmarks only',
)
assert(
  orion.scale.measuredCount === orion.slice.measuredCount,
  'scale must echo the measured count',
)

// Stem-foot spots: one soft light spot per placed star and landmark, all on the
// reference plane, each tied to a real source object and its stem foot.
const stemFootSpots = collectStemFootSpots(orion)
const placedStemCount = orion.stars.filter((star) => star.stem !== null).length
assert(
  stemFootSpots.length === placedStemCount + orion.landmarks.length,
  'a soft light spot must sit at every stem foot (placed stars and landmarks)',
)
const stemFootById = new Map<string, Vec3>()
for (const star of orion.stars) if (star.stem) stemFootById.set(star.id, star.stem.foot)
for (const landmark of orion.landmarks) stemFootById.set(landmark.id, landmark.stem.foot)
for (const spot of stemFootSpots) {
  assertFiniteVec3(spot.position, `stem-foot spot ${spot.sourceId}`)
  assertClose(
    spot.position.y,
    orion.slice.referencePlaneY,
    1e-9,
    `stem-foot spot ${spot.sourceId} must land on the reference plane`,
  )
  const foot = stemFootById.get(spot.sourceId)
  assert(foot !== undefined, `stem-foot spot ${spot.sourceId} must map to a real stem foot`)
  assert(
    foot.x === spot.position.x && foot.y === spot.position.y && foot.z === spot.position.z,
    `stem-foot spot ${spot.sourceId} must coincide with its stem foot`,
  )
}
assert(stemFootSpots.length > 0, 'Orion must exercise the stem-foot spot path')

// ---------------------------------------------------------------------------
// Depth modes: compressed expands interior depth; east/north are unchanged.
// ---------------------------------------------------------------------------
const orionTrue = buildSelectionModel('orion', 'true')
assert(orionTrue !== null, 'Orion must build in true depth mode')
assert(orionTrue.scale.mode === 'true', 'true-mode scale data must echo the mode')

const byIdTrue = new Map(orionTrue.stars.map((star) => [star.id, star]))
let comparedInteriorDepth = false
for (const compressedStar of orion.stars) {
  if (compressedStar.local === null || compressedStar.displayLocal === null) continue
  const trueStar = byIdTrue.get(compressedStar.id)
  if (!trueStar || trueStar.displayLocal === null) continue
  // East and north coordinates never change with depth mode.
  assert(
    Math.abs(compressedStar.displayLocal.x - trueStar.displayLocal.x) <= 1e-9 &&
      Math.abs(compressedStar.displayLocal.y - trueStar.displayLocal.y) <= 1e-9,
    `star ${compressedStar.id} east/north must not depend on depth mode`,
  )
  const depth = compressedStar.local.z
  if (depth > orion.scale.depthLimitLy * 0.05 && depth < orion.scale.depthLimitLy * 0.95) {
    assert(
      compressedStar.displayLocal.z >= trueStar.displayLocal.z - 1e-6,
      `star ${compressedStar.id} compressed depth must not fall below true depth in the interior`,
    )
    comparedInteriorDepth = true
  }
}
assert(comparedInteriorDepth, 'Orion must exercise an interior-depth comparison between modes')

// Explicit endpoint behavior. True mode is an identity clamp across the whole
// range; both modes must agree at the shared endpoints (0 and the depth limit).
const depthLimit = orion.scale.depthLimitLy
for (const trueStar of orionTrue.stars) {
  if (trueStar.local === null || trueStar.displayLocal === null) continue
  const clamped = Math.min(Math.max(trueStar.local.z, 0), depthLimit)
  assertClose(
    trueStar.displayLocal.z,
    clamped,
    1e-6,
    `star ${trueStar.id} true-mode depth must be the clamped identity`,
  )
}
for (const [modeLabel, model] of [
  ['compressed', orion],
  ['true', orionTrue],
] as const) {
  for (const star of model.stars) {
    if (star.local === null || star.displayLocal === null) continue
    if (star.local.z <= 0) {
      assertClose(
        star.displayLocal.z,
        0,
        1e-9,
        `star ${star.id} ${modeLabel} depth must pin to 0 at the near endpoint`,
      )
    }
    if (star.local.z >= depthLimit - 1e-9) {
      assertClose(
        star.displayLocal.z,
        depthLimit,
        1e-6,
        `star ${star.id} ${modeLabel} depth must pin to the limit at the far endpoint`,
      )
    }
  }
}

// The farthest placed object shares one depth endpoint across both modes.
function farthestPlaced(model: NonNullable<typeof orion>): { id: string; z: number } | null {
  let best: { id: string; z: number } | null = null
  for (const star of model.stars) {
    if (star.local === null || star.displayLocal === null) continue
    if (best === null || star.local.z > best.z) best = { id: star.id, z: star.local.z }
  }
  return best
}
const farthest = farthestPlaced(orion)
if (farthest !== null) {
  const compressedFar = orion.stars.find((star) => star.id === farthest.id)
  const trueFar = orionTrue.stars.find((star) => star.id === farthest.id)
  assert(
    compressedFar?.displayLocal != null && trueFar?.displayLocal != null,
    'farthest placed star must resolve in both modes',
  )
  assert(
    compressedFar.displayLocal.z <= depthLimit + 1e-6 &&
      trueFar.displayLocal.z <= depthLimit + 1e-6,
    'farthest display depth must stay within the depth limit in both modes',
  )
  assert(
    compressedFar.displayLocal.z >= trueFar.displayLocal.z - 1e-6,
    'compressed depth must not fall below true depth at the farthest object',
  )
}

// ---------------------------------------------------------------------------
// Empty-figure constellation: valid, finite, no edges, no invented figure.
// ---------------------------------------------------------------------------
const mensa = buildSelectionModel('mensa', 'compressed')
assert(mensa !== null, 'an empty-figure constellation must still build a model')
assert(mensa.name === 'Mensa', 'empty-figure model must carry its identity')
assert(mensa.edges.length === 0, 'an empty figure must resolve no edges')
assert(
  mensa.stars.every((star) => star.kind !== 'figure'),
  'an empty figure must contribute no figure stars',
)
assertFinite(mensa.scale.maxLightYears, 'empty-figure max light-years must be finite')
assertFiniteVec3(mensa.centroidLocal, 'empty-figure centroid')
assert(mensa.landmarks.length === 0, 'Mensa has no catalog landmark')

// ---------------------------------------------------------------------------
// Unavailable distances: preserved count, omitted from physical depth.
// ---------------------------------------------------------------------------
let unavailableExercised = false
for (const constellation of CONSTELLATIONS) {
  const model = buildSelectionModel(constellation.id, 'compressed')
  if (!model) continue
  const nullStars = model.stars.filter((star) => star.distanceLy === null)
  assert(
    model.unavailableCount === nullStars.length,
    `${constellation.id} unavailable count must match its distance-less stars`,
  )
  assert(
    model.scale.unavailableCount === model.unavailableCount,
    `${constellation.id} scale must echo the unavailable count`,
  )
  for (const star of nullStars) {
    assert(
      star.physical === null && star.displayLocal === null,
      `${constellation.id} distance-less star must be omitted from physical depth`,
    )
  }
  if (nullStars.length > 0) unavailableExercised = true
}
assert(
  unavailableExercised,
  'at least one constellation must exercise the unavailable-distance path',
)

// Every landmark in the catalog resolves to a known constellation.
for (const landmark of CONSTELLATION_LANDMARKS) {
  assert(
    CONSTELLATION_IDS.has(landmark.constellationId),
    `landmark ${landmark.id} must map to a known constellation`,
  )
}

console.log(
  `ok  constellation scene model: ${overview.count} overview stars, Orion ${figureStars.length} figure stars / ${orion.edges.length} edges / ${orion.landmarks.length} landmarks, depth modes and stems verified`,
)

// ---------------------------------------------------------------------------
// Overview figure preview and name-worthy picks
// ---------------------------------------------------------------------------
const orionEdges = buildOverviewFigureEdges('orion')
assert(orionEdges, 'Orion must expose overview figure edges')
assert(orionEdges.edgeCount === orion.edges.length, 'overview edge count must match the figure')
assert(
  orionEdges.positions.length === orionEdges.edgeCount * 6,
  'overview edge buffer must store two unit endpoints per edge',
)

const emptyEdges = buildOverviewFigureEdges('mensa')
assert(emptyEdges === null, 'empty IAU figures must not invent overview edges')

const orionNamed = collectNameWorthyPicks(orion)
assert(
  orionNamed.some((pick) => pick.name === 'Betelgeuse'),
  'Orion name-worthy picks must include Betelgeuse',
)
assert(
  orionNamed.some((pick) => pick.name === 'Orion Nebula'),
  'Orion name-worthy picks must include the Orion Nebula',
)
assert(
  orionNamed.every((pick) => pick.name.length > 0 && pick.detailLines.length > 0),
  'name-worthy picks must carry a name and at least one detail line',
)
assert(
  !orionNamed.some((pick) => /^HD\b/i.test(pick.name) || /^WASP/i.test(pick.name)),
  'catalog-only designations must not appear as name-worthy picks',
)

console.log(
  `ok  constellation hover helpers: Orion ${orionEdges.edgeCount} overview edges, ${orionNamed.length} name-worthy picks`,
)
