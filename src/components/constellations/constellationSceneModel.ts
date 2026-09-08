import {
  CONSTELLATION_LANDMARKS,
  CONSTELLATION_STARS,
  constellationById,
  type Constellation,
  type ConstellationLandmark,
  type ConstellationStar,
} from '../../data/constellations.ts'
import {
  buildConstellationLocalFrame,
  computeConstellationSlice,
  equatorialToCartesianLy,
  equatorialToUnitDirection,
  mapSliceDepth,
  projectStemToReferencePlane,
  toLocalCoordinates,
  type ConstellationDepthMode,
  type ConstellationLocalFrame,
  type ConstellationSlice,
  type StemSegment,
} from '../../lib/constellationGeometry.ts'
import type { Vec3 } from '../../lib/kepler.ts'

/**
 * Pure catalog-to-renderer adapter for the constellation slice viewer. This module
 * owns every mapping from the static catalog into the numbers the Three.js scene
 * pushes onto the GPU: spectral color, brightness-driven point size, overview
 * sphere positions, selection lookup, physical/local/display positions, depth-mode
 * mapping, figure-edge resolution, landmark inclusion, unavailable-distance counting,
 * slice/scale statistics, and stem endpoints. It never imports Three.js so it can be
 * exercised by a plain Node check.
 */

/** Warm star-light base color (`#fff4d6`). Every star tint is anchored near it. */
export const STAR_LIGHT_COLOR = '#fff4d6'
/** Restrained slice/reference geometry color (`#73d5e8`). */
export const SLICE_GEOMETRY_COLOR = '#73d5e8'
/** Existing focus gold; reserved for interaction highlights only. */
export const FOCUS_GOLD_COLOR = '#f5c542'

/** Point-size bounds in device-independent pixels before pixel-ratio scaling. */
export const MIN_STAR_POINT_SIZE = 1.2
export const MAX_STAR_POINT_SIZE = 6.5

/** Apparent-magnitude window mapped onto the point-size range. */
const BRIGHTEST_MAGNITUDE = -1.5
const FAINTEST_MAGNITUDE = 8

/** Angular padding added to the figure's own angular radius when gathering context. */
const CONTEXT_ANGULAR_PADDING_DEG = 3
/** Multiplier applied to the figure's angular radius before padding. */
const CONTEXT_ANGULAR_SCALE = 1.35
/** Hard ceiling on the context-gathering cone so dense regions stay legible. */
const CONTEXT_MAX_RADIUS_DEG = 22
/** Maximum number of context stars kept around a figure, brightest first. */
const MAX_CONTEXT_STARS = 260

const DEG = Math.PI / 180

export type RgbColor = { readonly r: number; readonly g: number; readonly b: number }

export type OverviewStarField = {
  readonly count: number
  /** Unit-sphere positions, 3 floats per star (Earth-centered celestial sphere). */
  readonly positions: Float32Array
  /** Linear RGB in [0,1], 3 floats per star. */
  readonly colors: Float32Array
  /** One point size per star. */
  readonly sizes: Float32Array
  /** Catalog star ID per point, parallel to the buffers. */
  readonly ids: readonly string[]
  /** Constellation route ID a click on this point should select, or null if unselectable. */
  readonly pickIds: readonly (string | null)[]
}

export type SelectedStarKind = 'figure' | 'context'

export type SelectedStar = {
  readonly id: string
  readonly kind: SelectedStarKind
  readonly color: RgbColor
  readonly size: number
  /** Unit direction on the celestial sphere (overview morph start). */
  readonly direction: Vec3
  /** Earth-centered equatorial position in light-years, or null when distance is unavailable. */
  readonly physical: Vec3 | null
  /** Physical position expressed in the slice local frame, or null. */
  readonly local: Vec3 | null
  /** Local position with depth-mode mapping applied for rendering, or null. */
  readonly displayLocal: Vec3 | null
  /** Stem from the display position down to the reference plane, or null. */
  readonly stem: StemSegment | null
  readonly distanceLy: number | null
}

export type SelectedLandmark = {
  readonly id: string
  readonly name: string
  readonly type: ConstellationLandmark['type']
  readonly direction: Vec3
  readonly physical: Vec3
  readonly local: Vec3
  readonly displayLocal: Vec3
  readonly stem: StemSegment
  readonly distanceLy: number
}

export type ResolvedFigureEdge = {
  readonly fromIndex: number
  readonly toIndex: number
  readonly fromId: string
  readonly toId: string
}

export type StemFootSpot = {
  /** ID of the star or landmark whose stem produces this spot. */
  readonly sourceId: string
  /** Foot position on the reference plane, in the local frame. */
  readonly position: Vec3
}

export type ConstellationScaleData = {
  readonly mode: ConstellationDepthMode
  /** Farthest measured physical distance among selected objects, in light-years. */
  readonly maxLightYears: number
  /** Padded, Milky-Way-capped depth limit used for display mapping. */
  readonly depthLimitLy: number
  /** Count of measured objects contributing to slice statistics. */
  readonly measuredCount: number
  /** Count of selected objects omitted from physical depth for lack of distance. */
  readonly unavailableCount: number
}

export type ConstellationSelectionModel = {
  readonly id: string
  readonly name: string
  readonly frame: ConstellationLocalFrame
  readonly slice: ConstellationSlice
  /** Geometric centroid of measured objects in the local frame (OrbitControls target). */
  readonly centroidLocal: Vec3
  /** Figure stars first, then context stars; edge indices point into this list. */
  readonly stars: readonly SelectedStar[]
  readonly edges: readonly ResolvedFigureEdge[]
  readonly landmarks: readonly SelectedLandmark[]
  readonly unavailableCount: number
  readonly scale: ConstellationScaleData
}

// ---------------------------------------------------------------------------
// Spectral color
// ---------------------------------------------------------------------------

const BLUE_TINT: RgbColor = { r: 0.7, g: 0.8, b: 1.0 }
const WARM_TINT: RgbColor = { r: 1.0, g: 0.957, b: 0.839 }
const RED_TINT: RgbColor = { r: 1.0, g: 0.79, b: 0.62 }

/** Representative Gaia GBP−GRP color index per MK spectral class, used when bp-rp is absent. */
const SPECTRAL_CLASS_BP_RP: Record<string, number> = {
  O: -0.35,
  B: -0.15,
  A: 0.05,
  F: 0.4,
  G: 0.82,
  K: 1.4,
  M: 2.6,
}

/** bp-rp span mapped onto the blue→warm→red tint gradient. */
const BP_RP_BLUE = -0.4
const BP_RP_WARM = 0.82
const BP_RP_RED = 2.6

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return value > 0 ? 1 : 0
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function mixColor(from: RgbColor, to: RgbColor, t: number): RgbColor {
  const clamped = clamp01(t)
  return {
    r: clamp01(from.r + (to.r - from.r) * clamped),
    g: clamp01(from.g + (to.g - from.g) * clamped),
    b: clamp01(from.b + (to.b - from.b) * clamped),
  }
}

function spectralTypeToBpRp(spectralType: string | null): number | null {
  if (!spectralType) return null
  for (const character of spectralType) {
    const value = SPECTRAL_CLASS_BP_RP[character.toUpperCase()]
    if (value !== undefined) return value
  }
  return null
}

/**
 * Measured spectral color from Gaia bp-rp when available, else an MK spectral-class
 * estimate, else the warm base tint. The gradient runs blue → warm white → red so
 * hot stars read cool and cool stars read warm, all anchored near `#fff4d6`.
 */
export function spectralColor(input: {
  bpRp: number | null
  spectralType: string | null
}): RgbColor {
  const bpRp =
    input.bpRp !== null && Number.isFinite(input.bpRp)
      ? input.bpRp
      : spectralTypeToBpRp(input.spectralType)
  if (bpRp === null) return { ...WARM_TINT }
  if (bpRp <= BP_RP_WARM) {
    const t = (bpRp - BP_RP_BLUE) / (BP_RP_WARM - BP_RP_BLUE)
    return mixColor(BLUE_TINT, WARM_TINT, t)
  }
  const t = (bpRp - BP_RP_WARM) / (BP_RP_RED - BP_RP_WARM)
  return mixColor(WARM_TINT, RED_TINT, t)
}

// ---------------------------------------------------------------------------
// Brightness sizing
// ---------------------------------------------------------------------------

/**
 * Point size from apparent magnitude: brighter (lower magnitude) stars render
 * larger. The magnitude window is clamped so the whole catalog stays inside the
 * size bounds, and non-finite magnitudes fall back to the smallest size.
 */
export function starPointSize(apparentMagnitude: number): number {
  if (!Number.isFinite(apparentMagnitude)) return MIN_STAR_POINT_SIZE
  const clampedMag = Math.min(Math.max(apparentMagnitude, BRIGHTEST_MAGNITUDE), FAINTEST_MAGNITUDE)
  const brightness = (clampedMag - BRIGHTEST_MAGNITUDE) / (FAINTEST_MAGNITUDE - BRIGHTEST_MAGNITUDE)
  const size = MAX_STAR_POINT_SIZE - brightness * (MAX_STAR_POINT_SIZE - MIN_STAR_POINT_SIZE)
  return Math.min(Math.max(size, MIN_STAR_POINT_SIZE), MAX_STAR_POINT_SIZE)
}

// ---------------------------------------------------------------------------
// Overview star field
// ---------------------------------------------------------------------------

function starPickId(star: ConstellationStar): string | null {
  // A star is selectable when it belongs to at least one figure; the first ID in
  // its sorted membership list is a stable, valid route target.
  return star.constellationIds.length > 0 ? star.constellationIds[0] : null
}

/**
 * Build the overview point cloud: every catalog star projected onto the unit
 * celestial sphere with a spectral color, a brightness-driven size, and a pick ID.
 */
export function buildOverviewStarField(
  stars: readonly ConstellationStar[] = CONSTELLATION_STARS,
): OverviewStarField {
  const count = stars.length
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const ids: string[] = new Array(count)
  const pickIds: (string | null)[] = new Array(count)

  for (let index = 0; index < count; index++) {
    const star = stars[index]
    const direction = equatorialToUnitDirection(star.raDeg, star.decDeg)
    positions[index * 3] = direction.x
    positions[index * 3 + 1] = direction.y
    positions[index * 3 + 2] = direction.z

    const color = spectralColor({ bpRp: star.bpRp, spectralType: star.spectralType })
    colors[index * 3] = color.r
    colors[index * 3 + 1] = color.g
    colors[index * 3 + 2] = color.b

    sizes[index] = starPointSize(star.apparentMagnitude)
    ids[index] = star.id
    pickIds[index] = starPickId(star)
  }

  return { count, positions, colors, sizes, ids, pickIds }
}

// ---------------------------------------------------------------------------
// Selection model
// ---------------------------------------------------------------------------

function angleBetween(a: Vec3, b: Vec3): number {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z
  return Math.acos(Math.min(1, Math.max(-1, dot)))
}

function physicalPosition(star: ConstellationStar): Vec3 | null {
  if (star.distanceLy === null || !Number.isFinite(star.distanceLy) || star.distanceLy <= 0) {
    return null
  }
  return equatorialToCartesianLy(star.raDeg, star.decDeg, star.distanceLy)
}

function displayFromLocal(
  local: Vec3,
  slice: ConstellationSlice,
  mode: ConstellationDepthMode,
): Vec3 {
  return {
    x: local.x,
    y: local.y,
    z: mapSliceDepth(local.z, slice.depthLimitLy, mode),
  }
}

type PreparedStar = {
  star: ConstellationStar
  kind: SelectedStarKind
  direction: Vec3
  physical: Vec3 | null
}

function gatherContextStars(
  figureIds: Set<string>,
  centerDirection: Vec3,
  figureRadiusRad: number,
): ConstellationStar[] {
  const contextRadiusRad = Math.min(
    figureRadiusRad * CONTEXT_ANGULAR_SCALE + CONTEXT_ANGULAR_PADDING_DEG * DEG,
    CONTEXT_MAX_RADIUS_DEG * DEG,
  )
  const cosThreshold = Math.cos(contextRadiusRad)
  const candidates: { star: ConstellationStar; dot: number }[] = []
  for (const star of CONSTELLATION_STARS) {
    if (figureIds.has(star.id)) continue
    const direction = equatorialToUnitDirection(star.raDeg, star.decDeg)
    const dot =
      direction.x * centerDirection.x +
      direction.y * centerDirection.y +
      direction.z * centerDirection.z
    if (dot >= cosThreshold) candidates.push({ star, dot })
  }
  candidates.sort(
    (left, right) =>
      left.star.apparentMagnitude - right.star.apparentMagnitude || right.dot - left.dot,
  )
  return candidates.slice(0, MAX_CONTEXT_STARS).map(({ star }) => star)
}

/**
 * Build the full selection model for a constellation route ID and depth mode.
 * Returns null for a null or unknown ID so the caller never emits an invalid
 * selection. Distances are never invented: objects without a measured distance
 * are counted and rendered only in the angular overview, not in physical depth.
 */
export function buildSelectionModel(
  selectedId: string | null,
  mode: ConstellationDepthMode,
): ConstellationSelectionModel | null {
  if (selectedId === null) return null
  const constellation: Constellation | undefined = constellationById(selectedId)
  if (!constellation) return null

  const figureStars = CONSTELLATION_STARS.filter((star) =>
    star.constellationIds.includes(constellation.id),
  )
  const figureIds = new Set(figureStars.map((star) => star.id))
  const figureDirections = figureStars.map((star) =>
    equatorialToUnitDirection(star.raDeg, star.decDeg),
  )

  // The figure center anchors both the frame and the context cone. Reuse the
  // pole-stable averaged depth axis from the geometry module.
  const centerDirection =
    figureDirections.length > 0
      ? buildConstellationLocalFrame(figureDirections).depth
      : buildConstellationLocalFrame([]).depth
  const figureRadiusRad = figureDirections.reduce(
    (max, direction) => Math.max(max, angleBetween(direction, centerDirection)),
    0,
  )

  const contextStars =
    figureStars.length > 0 ? gatherContextStars(figureIds, centerDirection, figureRadiusRad) : []

  const prepared: PreparedStar[] = [
    ...figureStars.map((star, index) => ({
      star,
      kind: 'figure' as const,
      direction: figureDirections[index],
      physical: physicalPosition(star),
    })),
    ...contextStars.map((star) => ({
      star,
      kind: 'context' as const,
      direction: equatorialToUnitDirection(star.raDeg, star.decDeg),
      physical: physicalPosition(star),
    })),
  ]

  const landmarkRecords = CONSTELLATION_LANDMARKS.filter(
    (landmark) => landmark.constellationId === constellation.id,
  )

  // Anchors: measured object directions define the frame; fall back to figure
  // directions so an all-unavailable figure still yields a stable frame.
  const anchorDirections =
    figureDirections.length > 0
      ? figureDirections
      : prepared.filter((entry) => entry.physical !== null).map((entry) => entry.direction)

  // Measured positions feed the slice statistics: stars first, then landmarks.
  const measuredPositions: (Vec3 | null)[] = [
    ...prepared.map((entry) => entry.physical),
    ...landmarkRecords.map((landmark) =>
      equatorialToCartesianLy(landmark.raDeg, landmark.decDeg, landmark.distanceLy),
    ),
  ]

  const slice = computeConstellationSlice(anchorDirections, measuredPositions)
  const { frame } = slice

  let maxLightYears = 0
  const stars: SelectedStar[] = prepared.map((entry) => {
    const color = spectralColor({ bpRp: entry.star.bpRp, spectralType: entry.star.spectralType })
    const size = starPointSize(entry.star.apparentMagnitude)
    if (entry.physical === null) {
      return {
        id: entry.star.id,
        kind: entry.kind,
        color,
        size,
        direction: entry.direction,
        physical: null,
        local: null,
        displayLocal: null,
        stem: null,
        distanceLy: entry.star.distanceLy,
      }
    }
    const local = toLocalCoordinates(entry.physical, frame)
    const displayLocal = displayFromLocal(local, slice, mode)
    maxLightYears = Math.max(maxLightYears, entry.star.distanceLy ?? 0)
    return {
      id: entry.star.id,
      kind: entry.kind,
      color,
      size,
      direction: entry.direction,
      physical: entry.physical,
      local,
      displayLocal,
      stem: projectStemToReferencePlane(displayLocal, slice.referencePlaneY),
      distanceLy: entry.star.distanceLy,
    }
  })

  const landmarks: SelectedLandmark[] = landmarkRecords.map((landmark) => {
    const direction = equatorialToUnitDirection(landmark.raDeg, landmark.decDeg)
    const physical = equatorialToCartesianLy(landmark.raDeg, landmark.decDeg, landmark.distanceLy)
    const local = toLocalCoordinates(physical, frame)
    const displayLocal = displayFromLocal(local, slice, mode)
    maxLightYears = Math.max(maxLightYears, landmark.distanceLy)
    return {
      id: landmark.id,
      name: landmark.name,
      type: landmark.type,
      direction,
      physical,
      local,
      displayLocal,
      stem: projectStemToReferencePlane(displayLocal, slice.referencePlaneY),
      distanceLy: landmark.distanceLy,
    }
  })

  const indexById = new Map(stars.map((star, index) => [star.id, index]))
  const edges: ResolvedFigureEdge[] = []
  for (const [fromId, toId] of constellation.edges) {
    const fromIndex = indexById.get(fromId)
    const toIndex = indexById.get(toId)
    if (fromIndex === undefined || toIndex === undefined) continue
    edges.push({ fromIndex, toIndex, fromId, toId })
  }

  const unavailableCount = stars.filter((star) => star.physical === null).length

  const scale: ConstellationScaleData = {
    mode,
    maxLightYears: Number.isFinite(maxLightYears) ? maxLightYears : 0,
    depthLimitLy: slice.depthLimitLy,
    measuredCount: slice.measuredCount,
    unavailableCount,
  }

  return {
    id: constellation.id,
    name: constellation.name,
    frame,
    slice,
    centroidLocal: slice.centroid,
    stars,
    edges,
    landmarks,
    unavailableCount,
    scale,
  }
}

/**
 * Foot positions for every stem in a selection: one soft light spot belongs on
 * the reference plane at each placed star and landmark. The feet already sit at
 * `slice.referencePlaneY`, so a renderer can draw the spots directly from this
 * list and keep their resources in lockstep with the stems.
 */
export function collectStemFootSpots(model: ConstellationSelectionModel): StemFootSpot[] {
  const spots: StemFootSpot[] = []
  for (const star of model.stars) {
    if (star.stem !== null) spots.push({ sourceId: star.id, position: star.stem.foot })
  }
  for (const landmark of model.landmarks) {
    spots.push({ sourceId: landmark.id, position: landmark.stem.foot })
  }
  return spots
}
