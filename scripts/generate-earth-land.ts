import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

/**
 * Natural Earth 1:110m land, the public-domain coastline the small-multiple
 * atlases use. Polygons are already cut at the antimeridian, so no ring
 * straddles ±180° except through the south pole.
 */
const SOURCE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_land.geojson'
const OUTPUT = resolve('src/data/generated/earthLand.ts')

const EARTH_RADIUS_KM = 6371

/**
 * Douglas–Peucker tolerance for a continent. The disc spans 84 units of a
 * 100-unit viewBox, so one pixel covers roughly 30 km on a 480 px card and this
 * budget keeps coastline error near five pixels: enough to read as a coast
 * rather than a polygon, without paying for detail the disc cannot show.
 */
const TOLERANCE_KM = 150
/**
 * Smallest island worth a ring: roughly 175 km across, so about six pixels.
 * Taiwan and Vancouver Island clear it, Sicily and Sardinia do not.
 */
const MIN_AREA_KM2 = 30_000

/** Rings drawn as ice rather than vegetation, found by containment. */
const ICE_MARKERS = [
  { name: 'Greenland', lon: -42, lat: 72 },
  { name: 'Antarctica', lon: 0, lat: -82 },
]

type LonLat = { lon: number; lat: number }
type Vec3 = { x: number; y: number; z: number }

type GeoJson = {
  features: {
    geometry:
      | { type: 'Polygon'; coordinates: number[][][] }
      | { type: 'MultiPolygon'; coordinates: number[][][][] }
  }[]
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function toUnitVector(point: LonLat): Vec3 {
  const lat = degToRad(point.lat)
  const lon = degToRad(point.lon)
  return {
    x: Math.cos(lat) * Math.cos(lon),
    y: Math.cos(lat) * Math.sin(lon),
    z: Math.sin(lat),
  }
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

/**
 * Exterior rings only. Interior rings in this layer are inland seas — the
 * Caspian is the single hole at 110m — and the globe paints one flat fill per
 * ring, so a hole would come out as land either way.
 */
function exteriorRings(geojson: GeoJson): LonLat[][] {
  const rings: LonLat[][] = []
  for (const feature of geojson.features) {
    const geometry = feature.geometry
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    for (const polygon of polygons) {
      const ring = polygon[0].map(([lon, lat]) => ({ lon, lat }))
      // GeoJSON repeats the first vertex to close the ring; the renderer walks
      // rings cyclically, so the repeat would only be a zero-length edge.
      const last = ring[ring.length - 1]
      const first = ring[0]
      if (ring.length > 1 && last.lon === first.lon && last.lat === first.lat) ring.pop()
      if (ring.length >= 3) rings.push(ring)
    }
  }
  return rings
}

/** Longitudes made continuous along the ring, so seam edges do not read as 360° jumps. */
function unwrap(ring: readonly LonLat[]): LonLat[] {
  const unwrapped: LonLat[] = [{ ...ring[0] }]
  for (let index = 1; index < ring.length; index++) {
    const previous = unwrapped[index - 1].lon
    let lon = ring[index].lon
    while (lon - previous > 180) lon -= 360
    while (lon - previous < -180) lon += 360
    unwrapped.push({ lon, lat: ring[index].lat })
  }
  return unwrapped
}

function wrapLongitude(lon: number): number {
  let wrapped = lon
  while (wrapped > 180) wrapped -= 360
  while (wrapped <= -180) wrapped += 360
  return wrapped
}

/**
 * Spherical polygon area, km². The trapezoid sum measures each edge against
 * the equator, which leaves out a hemisphere when the ring runs all the way
 * around the globe instead of closing back on itself — Antarctica, whose ring
 * circles the pole. Its winding gives that case away.
 */
function areaKm2(ring: readonly LonLat[]): number {
  let sum = 0
  let winding = 0
  for (let index = 0; index < ring.length; index++) {
    const from = ring[index]
    const to = ring[(index + 1) % ring.length]
    let lonDelta = degToRad(to.lon - from.lon)
    if (lonDelta > Math.PI) lonDelta -= Math.PI * 2
    if (lonDelta < -Math.PI) lonDelta += Math.PI * 2
    winding += lonDelta
    sum += (lonDelta * (Math.sin(degToRad(from.lat)) + Math.sin(degToRad(to.lat)))) / 2
  }
  if (Math.abs(winding) > Math.PI) sum += Math.sign(winding) * Math.PI * 2
  return Math.abs(sum) * EARTH_RADIUS_KM * EARTH_RADIUS_KM
}

/**
 * Distance from a point to a great-circle segment, km. Cross-track distance
 * beyond either end of the arc would understate how far the point really is,
 * so those fall back to the nearer endpoint.
 */
function segmentDistanceKm(point: Vec3, from: Vec3, to: Vec3): number {
  const angle = (a: Vec3, b: Vec3) => Math.acos(clamp(dot(a, b), -1, 1)) * EARTH_RADIUS_KM
  const normal = cross(from, to)
  const length = Math.hypot(normal.x, normal.y, normal.z)
  if (length < 1e-12) return angle(point, from)
  const unit = { x: normal.x / length, y: normal.y / length, z: normal.z / length }
  const alongTrack = cross(unit, point)
  const inside = dot(alongTrack, cross(unit, from)) >= 0 && dot(alongTrack, cross(unit, to)) <= 0
  if (!inside) return Math.min(angle(point, from), angle(point, to))
  return Math.abs(Math.asin(clamp(dot(point, unit), -1, 1))) * EARTH_RADIUS_KM
}

/** Douglas–Peucker over an open chain of indices into `vectors`. */
function simplifyChain(
  vectors: readonly Vec3[],
  start: number,
  end: number,
  toleranceKm: number,
): number[] {
  let farthest = -1
  let worst = toleranceKm
  for (let index = start + 1; index < end; index++) {
    const distance = segmentDistanceKm(vectors[index], vectors[start], vectors[end])
    if (distance > worst) {
      worst = distance
      farthest = index
    }
  }
  if (farthest < 0) return [start]
  return [
    ...simplifyChain(vectors, start, farthest, toleranceKm),
    ...simplifyChain(vectors, farthest, end, toleranceKm),
  ]
}

/**
 * A tolerance that reads as detail on a continent would swallow an island
 * outright, so it is also capped at a fifth of the ring's own width. Small
 * rings are short to begin with, so that fidelity costs few points.
 */
function ringToleranceKm(area: number): number {
  return Math.min(TOLERANCE_KM, Math.sqrt(area) / 5)
}

/**
 * Douglas–Peucker on a closed ring. Splitting at the vertex farthest from the
 * first one gives two chains whose endpoints survive, which keeps the ring's
 * long axis instead of pinning it to wherever the source data happened to start.
 */
function simplifyRing(ring: readonly LonLat[], toleranceKm: number): LonLat[] {
  const vectors = ring.map(toUnitVector)
  let opposite = 1
  let minimumDot = Number.POSITIVE_INFINITY
  for (let index = 1; index < vectors.length; index++) {
    const alignment = dot(vectors[0], vectors[index])
    if (alignment < minimumDot) {
      minimumDot = alignment
      opposite = index
    }
  }
  // Repeating the first vertex turns the ring into two open chains that share
  // both endpoints, so the walk covers every edge including the closing one.
  const closed = [...vectors, vectors[0]]
  const kept = [
    ...simplifyChain(closed, 0, opposite, toleranceKm),
    ...simplifyChain(closed, opposite, closed.length - 1, toleranceKm),
  ]
  return kept.map((index) => ring[index])
}

/** Marker inside the ring's unwrapped extent, longitude shifted to reach it. */
function inBounds(ring: readonly LonLat[], marker: LonLat): boolean {
  const unwrapped = unwrap(ring)
  const lons = unwrapped.map((point) => point.lon)
  const lats = unwrapped.map((point) => point.lat)
  const low = Math.min(...lons)
  const high = Math.max(...lons)
  let lon = wrapLongitude(marker.lon)
  while (lon < low) lon += 360
  return lon <= high && marker.lat >= Math.min(...lats) && marker.lat <= Math.max(...lats)
}

/**
 * Winding number of the ring as seen from the marker: each edge subtends a
 * signed angle in the tangent plane at the marker, and the turns sum to ±2π
 * only when the ring encloses it. A ray cast in longitude would be simpler but
 * wrong for Antarctica, whose ring circles the globe and closes over the pole
 * rather than at the antimeridian. That ring also separates the sphere into two
 * regions that both wind, one per traversal sense, so the bounds test decides
 * which side the enclosed one is.
 */
function containsPoint(ring: readonly LonLat[], marker: LonLat): boolean {
  if (!inBounds(ring, marker)) return false
  const center = toUnitVector(marker)
  const tangent = (point: LonLat): Vec3 => {
    const r = toUnitVector(point)
    const height = dot(r, center)
    const flat = {
      x: r.x - center.x * height,
      y: r.y - center.y * height,
      z: r.z - center.z * height,
    }
    const length = Math.hypot(flat.x, flat.y, flat.z)
    return { x: flat.x / length, y: flat.y / length, z: flat.z / length }
  }
  let turned = 0
  for (let index = 0; index < ring.length; index++) {
    const from = tangent(ring[index])
    const to = tangent(ring[(index + 1) % ring.length])
    turned += Math.atan2(dot(cross(from, to), center), dot(from, to))
  }
  return Math.abs(turned) > Math.PI
}

function formatRing(ring: readonly LonLat[]): string {
  const round = (value: number) => Number(value.toFixed(2))
  const pairs = ring.map((point) => `${round(wrapLongitude(point.lon))}, ${round(point.lat)}`)
  return `  [${pairs.join(', ')}],`
}

async function main() {
  process.stdout.write(`Fetching ${SOURCE_URL}... `)
  const response = await fetch(SOURCE_URL)
  if (!response.ok) throw new Error(`Natural Earth HTTP ${response.status}`)
  const geojson = (await response.json()) as GeoJson
  const source = exteriorRings(geojson)
  console.log(
    `${source.length} rings, ${source.reduce((sum, ring) => sum + ring.length, 0)} points`,
  )

  const kept = source
    .map((ring) => ({ ring, area: areaKm2(ring) }))
    .filter((entry) => entry.area >= MIN_AREA_KM2)
    .sort((a, b) => b.area - a.area)
    .map((entry) => ({
      ...entry,
      simplified: simplifyRing(entry.ring, ringToleranceKm(entry.area)),
    }))
    .filter((entry) => entry.simplified.length >= 3)

  const ice = ICE_MARKERS.map((marker) => {
    const matches = kept
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => containsPoint(entry.simplified, marker))
    if (matches.length !== 1) {
      throw new Error(`${matches.length} rings contain ${marker.name}, expected exactly one`)
    }
    return { ...marker, index: matches[0].index }
  })

  const total = kept.reduce((sum, entry) => sum + entry.simplified.length, 0)
  console.log(
    `Kept ${kept.length} rings above ${MIN_AREA_KM2.toLocaleString()} km², ` +
      `${total} points at ${TOLERANCE_KM} km tolerance`,
  )
  kept.forEach((entry, index) => {
    const name = ice.find((marker) => marker.index === index)?.name ?? ''
    const area = Math.round(entry.area / 1000).toLocaleString()
    console.log(
      `  ${String(index).padStart(2)}: ${entry.ring.length} → ${entry.simplified.length} points, ` +
        `${area}k km² ${name}`,
    )
  })

  const iceNames = ice
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.name)
    .join(' and ')

  const file = `/**
 * Generated by scripts/generate-earth-land.ts from Natural Earth 1:110m land.
 * Closed coastline rings, Douglas–Peucker simplified to ${TOLERANCE_KM} km and
 * tighter on small islands, with anything under ${MIN_AREA_KM2.toLocaleString()} km² dropped.
 * Do not edit by hand.
 */
import type { LonLat } from '../../lib/globe.ts'

/** Flat [lon, lat, ...] degree pairs, east longitude, largest landmass first. */
const RING_COORDINATES: readonly (readonly number[])[] = [
${kept.map((entry) => formatRing(entry.simplified)).join('\n')}
]

export const EARTH_LAND_RINGS: readonly (readonly LonLat[])[] = RING_COORDINATES.map((ring) => {
  const points: LonLat[] = []
  for (let index = 0; index < ring.length; index += 2) {
    points.push({ lon: ring[index], lat: ring[index + 1] })
  }
  return points
})

/** ${iceNames} in \`EARTH_LAND_RINGS\`. */
export const EARTH_ICE_RING_INDICES = new Set([${ice
    .map((entry) => entry.index)
    .sort((a, b) => a - b)
    .join(', ')}])
`
  await mkdir(dirname(OUTPUT), { recursive: true })
  await writeFile(OUTPUT, file)
  console.log(`Wrote ${OUTPUT}`)
}

await main()
