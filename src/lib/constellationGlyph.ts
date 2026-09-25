import {
  constellationById,
  CONSTELLATION_STARS,
  type ConstellationFigureEdge,
} from '../data/constellations.ts'
import { obsoleteConstellationById } from '../data/obsoleteConstellations.ts'
import { buildConstellationLocalFrame, equatorialToUnitDirection } from './constellationGeometry.ts'

export type GlyphBox = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type GlyphSegment = {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
}

export type ConstellationGlyph = {
  readonly constellationId: string
  readonly segments: readonly GlyphSegment[]
}

export type DualConstellationGlyph = {
  readonly left: ConstellationGlyph
  readonly right: ConstellationGlyph
  readonly divider: GlyphSegment
}

type GlyphStar = {
  readonly id: string
  readonly raDeg: number
  readonly decDeg: number
}

const IAU_STAR_BY_ID = new Map(CONSTELLATION_STARS.map((star) => [star.id, star]))

/** Padding inside the target box so strokes do not kiss the rim. */
const FIT_PADDING = 0.12
/** Gap between dual halves as a fraction of total width. */
const DUAL_GAP_FRACTION = 0.06
/** Divider inset from the top/bottom of the dual box. */
const DIVIDER_INSET_FRACTION = 0.12

function resolveFigure(
  constellationId: string,
): { edges: readonly ConstellationFigureEdge[]; stars: Map<string, GlyphStar> } | null {
  const obsolete = obsoleteConstellationById(constellationId)
  if (obsolete) {
    const stars = new Map<string, GlyphStar>(
      obsolete.stars.map((star) => [
        star.id,
        { id: star.id, raDeg: star.raDeg, decDeg: star.decDeg },
      ]),
    )
    return { edges: obsolete.edges, stars }
  }

  const constellation = constellationById(constellationId)
  if (!constellation || constellation.edges.length === 0) return null
  const stars = new Map<string, GlyphStar>()
  for (const [fromId, toId] of constellation.edges) {
    for (const id of [fromId, toId]) {
      if (stars.has(id)) continue
      const star = IAU_STAR_BY_ID.get(id)
      if (!star) continue
      stars.set(id, { id: star.id, raDeg: star.raDeg, decDeg: star.decDeg })
    }
  }
  return { edges: constellation.edges, stars }
}

function projectStarsToPlane(stars: Iterable<GlyphStar>): Map<string, { x: number; y: number }> {
  const list = [...stars]
  const directions = list.map((star) => equatorialToUnitDirection(star.raDeg, star.decDeg))
  const frame = buildConstellationLocalFrame(directions)
  const projected = new Map<string, { x: number; y: number }>()
  for (let index = 0; index < list.length; index++) {
    const direction = directions[index]
    // Negate east so the glyph matches a sky chart (looking up from Earth:
    // east is left when north is up). The bare tangent frame is outside-in.
    projected.set(list[index].id, {
      x: -(direction.x * frame.east.x + direction.y * frame.east.y + direction.z * frame.east.z),
      y: direction.x * frame.north.x + direction.y * frame.north.y + direction.z * frame.north.z,
    })
  }
  return projected
}

function fitToBox(
  projected: Map<string, { x: number; y: number }>,
  box: GlyphBox,
): Map<string, { x: number; y: number }> {
  const points = [...projected.values()]
  if (points.length === 0) return new Map()

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const point of points) {
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.y < minY) minY = point.y
    if (point.y > maxY) maxY = point.y
  }

  const spanX = Math.max(maxX - minX, 1e-9)
  const spanY = Math.max(maxY - minY, 1e-9)
  const padX = box.width * FIT_PADDING
  const padY = box.height * FIT_PADDING
  const usableW = Math.max(box.width - padX * 2, 1e-9)
  const usableH = Math.max(box.height - padY * 2, 1e-9)
  const scale = Math.min(usableW / spanX, usableH / spanY)
  const midX = (minX + maxX) / 2
  const midY = (minY + maxY) / 2

  const fitted = new Map<string, { x: number; y: number }>()
  for (const [id, point] of projected) {
    fitted.set(id, {
      x: box.x + (point.x - midX) * scale,
      // Sky north is +Y in the tangent plane; SVG +Y is down — flip for upright figures.
      y: box.y - (point.y - midY) * scale,
    })
  }
  return fitted
}

function segmentsFromFitted(
  edges: readonly ConstellationFigureEdge[],
  fitted: Map<string, { x: number; y: number }>,
): GlyphSegment[] {
  const segments: GlyphSegment[] = []
  for (const [fromId, toId] of edges) {
    const from = fitted.get(fromId)
    const to = fitted.get(toId)
    if (!from || !to) continue
    segments.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y })
  }
  return segments
}

/**
 * Fitted star positions for a constellation glyph (sky-chart orientation).
 * Useful for orientation tests: east is left when north is up.
 */
export function buildConstellationGlyphPositions(
  constellationId: string,
  box: GlyphBox,
): ReadonlyMap<string, { x: number; y: number }> | null {
  const figure = resolveFigure(constellationId)
  if (!figure) return null
  const projected = projectStarsToPlane(figure.stars.values())
  const fitted = fitToBox(projected, box)
  return fitted.size > 0 ? fitted : null
}

/**
 * Orthographic stick-figure glyph fitted into `box` (center + size in SVG units).
 * Resolves IAU catalog figures or obsolete side-catalog entries.
 */
export function buildConstellationGlyph(
  constellationId: string,
  box: GlyphBox,
): ConstellationGlyph | null {
  const figure = resolveFigure(constellationId)
  if (!figure) return null
  const projected = projectStarsToPlane(figure.stars.values())
  const fitted = fitToBox(projected, box)
  const segments = segmentsFromFitted(figure.edges, fitted)
  if (segments.length === 0) return null
  return { constellationId, segments }
}

/**
 * Two figures side-by-side in `box` with a thin vertical divider on the midline.
 * `ids[0]` is left, `ids[1]` is right.
 */
export function buildDualConstellationGlyph(
  ids: readonly [string, string],
  box: GlyphBox,
): DualConstellationGlyph | null {
  const gap = box.width * DUAL_GAP_FRACTION
  const halfWidth = (box.width - gap) / 2
  const leftBox: GlyphBox = {
    x: box.x - gap / 2 - halfWidth / 2,
    y: box.y,
    width: halfWidth,
    height: box.height,
  }
  const rightBox: GlyphBox = {
    x: box.x + gap / 2 + halfWidth / 2,
    y: box.y,
    width: halfWidth,
    height: box.height,
  }

  const left = buildConstellationGlyph(ids[0], leftBox)
  const right = buildConstellationGlyph(ids[1], rightBox)
  if (!left || !right) return null

  const inset = (box.height / 2) * (1 - DIVIDER_INSET_FRACTION)
  return {
    left,
    right,
    divider: {
      x1: box.x,
      y1: box.y - inset,
      x2: box.x,
      y2: box.y + inset,
    },
  }
}
