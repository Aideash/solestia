import type { IauFrame } from '../data/planets.ts'
import { bodyFrame, equatorialToEcliptic, type Vec3 } from './kepler.ts'
import { cameraAxes, vecCross, vecDot, vecNormalize, vecScale, type CameraPose } from './camera.ts'

export type LonLat = { lon: number; lat: number }

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function combine(u: Vec3, v: Vec3, cu: number, cv: number): Vec3 {
  return {
    x: u.x * cu + v.x * cv,
    y: u.y * cu + v.y * cv,
    z: u.z * cu + v.z * cv,
  }
}

/**
 * Body-fixed axes at one epoch. A coastline is thousands of points that all
 * share an epoch, so the frame is built once and handed to each conversion.
 */
type GeographicBasis = { pole: Vec3; primeMeridian: Vec3; east: Vec3 }

function geographicBasis(iau: IauFrame, days: number): GeographicBasis {
  const { pole, primeMeridian } = bodyFrame(iau, days)
  return { pole, primeMeridian, east: vecCross(pole, primeMeridian) }
}

/** Geographic east-longitude / latitude to ecliptic-of-J2000, unit vector. */
function latLonToEcliptic(latDeg: number, lonDeg: number, basis: GeographicBasis): Vec3 {
  const lat = degToRad(latDeg)
  const lon = degToRad(lonDeg)
  const x = Math.cos(lat) * Math.cos(lon)
  const y = Math.cos(lat) * Math.sin(lon)
  const z = Math.sin(lat)
  const { pole, primeMeridian, east } = basis
  const icrf = {
    x: primeMeridian.x * x + east.x * y + pole.x * z,
    y: primeMeridian.y * x + east.y * y + pole.y * z,
    z: primeMeridian.z * x + east.z * y + pole.z * z,
  }
  return equatorialToEcliptic(icrf)
}

/**
 * A rough surface feature: an ellipse on the sphere about a center, aligned to
 * the local east and north and sized in angle rather than distance, so it
 * foreshortens on its own as the camera carries it toward the limb.
 */
export type SurfaceCap = {
  name: string
  /** East longitude and latitude of the center, degrees. */
  lon: number
  lat: number
  /** Angular semi-axis east-west, degrees. */
  semiEastDeg: number
  /** Angular semi-axis north-south, degrees. */
  semiNorthDeg: number
}

/**
 * Cap boundary as a lon/lat ring. The ellipse is laid out in the tangent plane
 * at the center and each offset is then swung out onto the sphere through its
 * own angular length. The wide caps need that: Oceanus Procellarum reaches 37°
 * from its center, and offsets taken as flat lon/lat would stretch it toward
 * the pole and hold it open where the sphere should be closing it.
 *
 * `atan2` returns longitudes in (-180°, 180°], so a cap spanning the
 * antimeridian would come back split. Nothing on the lunar near side does.
 */
export function capRing(cap: SurfaceCap, samples = 32): LonLat[] {
  const lat = degToRad(cap.lat)
  const lon = degToRad(cap.lon)
  const center: Vec3 = {
    x: Math.cos(lat) * Math.cos(lon),
    y: Math.cos(lat) * Math.sin(lon),
    z: Math.sin(lat),
  }
  const east = vecNormalize(vecCross({ x: 0, y: 0, z: 1 }, center))
  const north = vecCross(center, east)
  const semiEast = degToRad(cap.semiEastDeg)
  const semiNorth = degToRad(cap.semiNorthDeg)

  return Array.from({ length: samples }, (_, index) => {
    const theta = (Math.PI * 2 * index) / samples
    const offset = combine(east, north, semiEast * Math.cos(theta), semiNorth * Math.sin(theta))
    const rho = Math.hypot(offset.x, offset.y, offset.z)
    const point =
      rho < 1e-12
        ? center
        : combine(center, vecScale(offset, 1 / rho), Math.cos(rho), Math.sin(rho))
    return {
      lon: (Math.atan2(point.y, point.x) * 180) / Math.PI,
      lat: (Math.asin(Math.min(1, Math.max(-1, point.z))) * 180) / Math.PI,
    }
  })
}

export type ScreenPath = { d: string; depth: number }

function densifyRing(ring: readonly LonLat[], maxStepDeg = 3): LonLat[] {
  const dense: LonLat[] = []
  for (let index = 0; index < ring.length; index++) {
    const from = ring[index]
    const to = ring[(index + 1) % ring.length]
    let lonDelta = to.lon - from.lon
    if (lonDelta > 180) lonDelta -= 360
    if (lonDelta < -180) lonDelta += 360
    const latDelta = to.lat - from.lat
    const steps = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(lonDelta), Math.abs(latDelta)) / maxStepDeg),
    )
    for (let step = 0; step < steps; step++) {
      const fraction = step / steps
      dense.push({
        lon: from.lon + lonDelta * fraction,
        lat: from.lat + latDelta * fraction,
      })
    }
  }
  return dense
}

/**
 * Orthographic limb of a unit sphere: a screen circle. Visible hemisphere is
 * `look · r < 0` (near, facing the camera).
 */
export function projectFrontPath(
  ring: readonly LonLat[],
  iau: IauFrame,
  days: number,
  pose: CameraPose,
  cx: number,
  cy: number,
  radius: number,
): ScreenPath[] {
  const { look, right, up } = cameraAxes(pose)
  const basis = geographicBasis(iau, days)
  const projected = densifyRing(ring).map((point) => {
    const r = latLonToEcliptic(point.lat, point.lon, basis)
    return {
      x: cx + radius * vecDot(r, right),
      y: cy - radius * vecDot(r, up),
      depth: vecDot(r, look),
      direction: r,
    }
  })
  // Start on the hidden hemisphere so a visible fragment cannot wrap across
  // the array boundary and get closed as two separate wedges.
  const firstBack = projected.findIndex((point) => point.depth >= 0)
  const points =
    firstBack > 0 ? projected.slice(firstBack).concat(projected.slice(0, firstBack)) : projected

  const paths: ScreenPath[] = []
  type ProjectedDirection = {
    x: number
    y: number
    depth: number
    direction: Vec3
  }
  let buffer: ProjectedDirection[] = []
  const flush = () => {
    if (buffer.length < 3) {
      buffer = []
      return
    }
    const depth = buffer.reduce((sum, point) => sum + point.depth, 0) / buffer.length
    let d = buffer
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ')
    const first = buffer[0]
    const last = buffer[buffer.length - 1]
    const firstOnLimb = Math.abs(first.depth) < 1e-8
    const lastOnLimb = Math.abs(last.depth) < 1e-8
    if (firstOnLimb && lastOnLimb) {
      const startAngle = Math.atan2(last.y - cy, last.x - cx)
      const endAngle = Math.atan2(first.y - cy, first.x - cx)
      let delta = endAngle - startAngle
      while (delta <= -Math.PI) delta += Math.PI * 2
      while (delta > Math.PI) delta -= Math.PI * 2
      const sweep = delta > 0 ? 1 : 0
      d += ` A ${radius} ${radius} 0 0 ${sweep} ${first.x} ${first.y}`
    }
    d += ' Z'
    paths.push({ d, depth })
    buffer = []
  }

  const limbCrossing = (a: ProjectedDirection, b: ProjectedDirection): ProjectedDirection => {
    const t = a.depth / (a.depth - b.depth)
    const interpolated = {
      x: a.direction.x + t * (b.direction.x - a.direction.x),
      y: a.direction.y + t * (b.direction.y - a.direction.y),
      z: a.direction.z + t * (b.direction.z - a.direction.z),
    }
    const length = Math.hypot(interpolated.x, interpolated.y, interpolated.z)
    const direction = {
      x: interpolated.x / length,
      y: interpolated.y / length,
      z: interpolated.z / length,
    }
    return {
      x: cx + radius * vecDot(direction, right),
      y: cy - radius * vecDot(direction, up),
      depth: 0,
      direction,
    }
  }

  const n = points.length
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    const aFront = a.depth < 0
    const bFront = b.depth < 0
    if (aFront && bFront) {
      if (buffer.length === 0) buffer.push(a)
      buffer.push(b)
      continue
    }
    if (aFront && !bFront) {
      if (buffer.length === 0) buffer.push(a)
      buffer.push(limbCrossing(a, b))
      flush()
      continue
    }
    if (!aFront && bFront) {
      buffer.push(limbCrossing(a, b))
      buffer.push(b)
    }
  }
  flush()
  return paths
}

/**
 * Night side of the orthographic disc: the visible half of the terminator,
 * closed along the unlit arc of the limb. Once more than half the visible face
 * is dark the region is concave — a hull of its boundary points would swallow
 * the lit crescent and read as a fully dark body.
 */
export function nightFillPath(
  sunFromBody: Vec3,
  pose: CameraPose,
  cx: number,
  cy: number,
  radius: number,
  samples = 64,
): string {
  const { look, right, up } = cameraAxes(pose)
  const sun = vecNormalize(sunFromBody)
  if (Math.hypot(sun.x, sun.y, sun.z) < 0.5) return ''

  const project = (r: Vec3) => ({
    x: cx + radius * vecDot(r, right),
    y: cy - radius * vecDot(r, up),
  })

  // The terminator meets the limb perpendicular to both the Sun and the camera
  // axis. That direction vanishes when the Sun sits along the line of sight,
  // and the visible face is then wholly lit or wholly dark.
  const nodes = vecCross(sun, look)
  if (Math.hypot(nodes.x, nodes.y, nodes.z) < 1e-8) {
    if (vecDot(sun, look) <= 0) return ''
    return (
      `M ${cx - radius} ${cy} A ${radius} ${radius} 0 1 0 ${cx + radius} ${cy} ` +
      `A ${radius} ${radius} 0 1 0 ${cx - radius} ${cy} Z`
    )
  }

  const node = vecNormalize(nodes)
  const terminatorUp = vecCross(sun, node)
  // Sweep the half of the terminator that faces the camera, then the half of
  // the limb that is unlit, so the two arcs meet at the same limb points.
  const terminatorSign = vecDot(terminatorUp, look) < 0 ? 1 : -1
  const limbUp = vecNormalize(vecCross(look, node))
  const limbSign = vecDot(limbUp, sun) < 0 ? 1 : -1

  const points: { x: number; y: number }[] = []
  for (let i = 0; i <= samples; i++) {
    const theta = terminatorSign * Math.PI * (i / samples)
    points.push(project(combine(node, terminatorUp, Math.cos(theta), Math.sin(theta))))
  }
  for (let i = 1; i < samples; i++) {
    const psi = Math.PI * (1 - i / samples)
    points.push(project(combine(node, limbUp, Math.cos(psi), limbSign * Math.sin(psi))))
  }
  return `${points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')} Z`
}

/** A patch of a body's surface: its boundary ring, plus a membership test. */
export type SurfaceRegion = {
  /** Boundary in traversal order, unit vectors from the body center. */
  outline: Vec3[]
  contains: (direction: Vec3) => boolean
}

/** A run of boundary that shows, between the limb crossings that bracket it. */
type VisibleRun = {
  start: number
  length: number
  /** Limb azimuths, radians about the line of sight. */
  entry: number
  exit: number
}

type ScreenPoint = { x: number; y: number }

const PROBE_COUNT = 32
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

function wrapTurn(angle: number): number {
  const turn = angle % (Math.PI * 2)
  return turn < 0 ? turn + Math.PI * 2 : turn
}

/** Nonzero winding, as SVG fills a path of several closed subpaths. */
function windsAround(loops: ScreenPoint[][], point: ScreenPoint): boolean {
  let winding = 0
  for (const loop of loops) {
    for (let index = 0; index < loop.length; index++) {
      const from = loop[index]
      const to = loop[(index + 1) % loop.length]
      const side = (to.x - from.x) * (point.y - from.y) - (point.x - from.x) * (to.y - from.y)
      if (from.y <= point.y) {
        if (to.y > point.y && side > 0) winding++
      } else if (to.y <= point.y && side < 0) {
        winding--
      }
    }
  }
  return winding !== 0
}

/**
 * Region boundary in screen space, clipped to the camera-facing hemisphere and
 * closed along the limb where it runs off the visible face.
 *
 * Which way round the limb those closures run is the whole difficulty, and the
 * crossings that bracket a hidden stretch cannot settle it between them: a
 * boundary that follows a great circle — every shadow wide enough to engulf the
 * target has one — meets the limb at antipodes, leaving the two arcs equal in
 * length and bounding complementary halves of the disc. Nor can the choice be
 * made one closure at a time, since a region can show as several patches whose
 * closures must agree on which side the interior lies to fill as one shape.
 * So the whole boundary is closed both ways round and the two are put to the
 * region itself, over points spread across the disc.
 */
export function projectRegionPath(
  region: SurfaceRegion,
  pose: CameraPose,
  cx: number,
  cy: number,
  radius: number,
  limbSamples = 48,
): string | null {
  const ring = region.outline
  if (ring.length < 3) return null
  const { look, right, up } = cameraAxes(pose)
  const project = (r: Vec3) => ({
    x: cx + radius * vecDot(r, right),
    y: cy - radius * vecDot(r, up),
  })
  const draw = (points: { x: number; y: number }[]): string =>
    `${points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')} Z`
  const depths = ring.map((direction) => vecDot(direction, look))

  // Either the region takes the whole visible face or none of it, and its own
  // membership test is the only thing that can say which: a boundary that
  // never shows carries no evidence, and one seen exactly edge-on — a region
  // filling the sunward face, viewed down the shadow axis — puts every depth a
  // rounding error from zero.
  const facing = () =>
    region.contains(vecScale(look, -1))
      ? `M ${cx - radius} ${cy} A ${radius} ${radius} 0 1 0 ${cx + radius} ${cy} ` +
        `A ${radius} ${radius} 0 1 0 ${cx - radius} ${cy} Z`
      : null
  if (depths.every((depth) => Math.abs(depth) < 1e-9)) return facing()
  const front = depths.map((depth) => depth < 0)
  if (!front.some(Boolean)) return facing()
  if (front.every(Boolean)) return draw(ring.map(project))

  // The limb is the circle of directions square to the line of sight, so one
  // azimuth about that axis places a point on it: closures are angles here,
  // never differences of nearly opposite unit vectors.
  const n = ring.length
  const limbPoint = (azimuth: number): Vec3 =>
    combine(right, up, Math.cos(azimuth), Math.sin(azimuth))
  const crossingAzimuth = (index: number): number => {
    const next = (index + 1) % n
    const span = depths[index] - depths[next]
    const t = Math.min(1, Math.max(0, span === 0 ? 0 : depths[index] / span))
    const point = combine(ring[index], ring[next], 1 - t, t)
    return Math.atan2(vecDot(point, up), vecDot(point, right))
  }

  const runs: VisibleRun[] = []
  const origin = front.indexOf(false)
  for (let offset = 0; offset < n;) {
    const start = (origin + offset) % n
    if (!front[start]) {
      offset++
      continue
    }
    let length = 1
    while (length < n && front[(start + length) % n]) length++
    runs.push({
      start,
      length,
      entry: crossingAzimuth((start - 1 + n) % n),
      exit: crossingAzimuth((start + length - 1) % n),
    })
    offset += length
  }

  // Close every run the given way round the limb, each onto the first crossing
  // its arc reaches. Runs that close onto one another join into one subpath,
  // and a region showing as two patches at once yields two.
  const trace = (turn: number): ScreenPoint[][] => {
    const reach = (from: number, to: number) =>
      turn > 0 ? wrapTurn(to - from) : wrapTurn(from - to)
    const loops: ScreenPoint[][] = []
    const traced = runs.map(() => false)
    for (let first = 0; first < runs.length; first++) {
      if (traced[first]) continue
      const points: ScreenPoint[] = []
      let index = first
      while (!traced[index]) {
        traced[index] = true
        const run = runs[index]
        for (let step = 0; step < run.length; step++) {
          points.push(project(ring[(run.start + step) % n]))
        }
        let next = index
        let sweep = Math.PI * 2
        runs.forEach((other, candidate) => {
          const gap = reach(run.exit, other.entry)
          if (gap < sweep) {
            sweep = gap
            next = candidate
          }
        })
        const steps = Math.max(1, Math.round((limbSamples * sweep) / (Math.PI * 2)))
        for (let step = 0; step <= steps; step++) {
          points.push(project(limbPoint(run.exit + turn * ((sweep * step) / steps))))
        }
        index = next
      }
      if (points.length >= 3) loops.push(points)
    }
    return loops
  }

  // Sunflower spacing, so the vote is spread evenly over the disc rather than
  // crowding the center as a polar grid would.
  const probes = Array.from({ length: PROBE_COUNT }, (_, index) => {
    const distance = Math.sqrt((index + 0.5) / PROBE_COUNT)
    const azimuth = index * GOLDEN_ANGLE
    const u = distance * Math.cos(azimuth)
    const v = distance * Math.sin(azimuth)
    const depth = -Math.sqrt(Math.max(0, 1 - u * u - v * v))
    return {
      screen: { x: cx + radius * u, y: cy - radius * v },
      inside: region.contains(combine(combine(right, up, u, v), look, 1, depth)),
    }
  })
  const agreement = (loops: ScreenPoint[][]) =>
    probes.filter((probe) => windsAround(loops, probe.screen) === probe.inside).length
  const forward = trace(1)
  const backward = trace(-1)
  const loops = agreement(forward) >= agreement(backward) ? forward : backward
  return loops.length > 0 ? loops.map(draw).join(' ') : null
}
