import { PLANETS } from '../src/data/planets.ts'
import {
  cameraAxes,
  defaultShellCamera,
  projectOrthographic,
  shellPose,
  vecCross,
  vecDot,
  vecNormalize,
  type CameraPose,
} from '../src/lib/camera.ts'
import {
  LUNAR_LONGITUDE_ENVELOPE_RAD,
  R_EARTH_KM,
  R_MOON_KM,
  R_SUN_KM,
  activeCone,
  coneOnTarget,
  eclipseGeometryAt,
  envelopeHitSamples,
  shadowEnvelope,
  shadowFootprint,
} from '../src/lib/eclipses.ts'
import { nightFillPath, projectRegionPath, type SurfaceRegion } from '../src/lib/globe.ts'
import {
  bodyFrame,
  centuriesSinceJ2000,
  equatorialToEcliptic,
  KM_PER_AU,
  planetSystemAt,
  projectEdgeOn,
  type Vec3,
} from '../src/lib/kepler.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function deg(rad: number): number {
  return (rad * 180) / Math.PI
}

const earth = PLANETS.find((planet) => planet.id === 'earth')
assert(earth, 'Earth missing from planet table')
const earthIau = earth.iau

function geographicDirection(date: Date, latitudeDeg: number, longitudeDeg: number): Vec3 {
  const days = centuriesSinceJ2000(date) * 36525
  const { pole, primeMeridian } = bodyFrame(earthIau, days)
  const east = vecCross(pole, primeMeridian)
  const latitude = (latitudeDeg * Math.PI) / 180
  const longitude = (longitudeDeg * Math.PI) / 180
  const x = Math.cos(latitude) * Math.cos(longitude)
  const y = Math.cos(latitude) * Math.sin(longitude)
  const z = Math.sin(latitude)
  return equatorialToEcliptic({
    x: primeMeridian.x * x + east.x * y + pole.x * z,
    y: primeMeridian.y * x + east.y * y + pole.y * z,
    z: primeMeridian.z * x + east.z * y + pole.z * z,
  })
}

function distanceToRegionKm(region: SurfaceRegion, direction: Vec3): number {
  if (region.contains(direction)) return 0
  return (
    Math.min(
      ...region.outline.map((point) =>
        Math.acos(Math.min(1, Math.max(-1, vecDot(point, direction)))),
      ),
    ) * R_EARTH_KM
  )
}

const meanSunApparent = Math.asin(R_SUN_KM / KM_PER_AU)
assert(
  Math.abs(deg(meanSunApparent) - 0.266) < 0.02,
  `mean solar angular radius should be ~0.27°, got ${deg(meanSunApparent).toFixed(3)}°`,
)
const meanMoonApparent = Math.asin(R_MOON_KM / 384400)
assert(
  Math.abs(deg(meanMoonApparent) - 0.259) < 0.02,
  `mean lunar angular radius should be ~0.26°, got ${deg(meanMoonApparent).toFixed(3)}°`,
)

const j2000 = eclipseGeometryAt(new Date('2000-01-01T12:00:00Z'))
assert(j2000.sunApparent > 0.003 && j2000.sunApparent < 0.006, 'solar apparent size out of range')
assert(j2000.moonApparent > 0.003 && j2000.moonApparent < 0.007, 'lunar apparent size out of range')
assert(
  Math.abs(j2000.sunApparent - j2000.moonApparent) / j2000.sunApparent < 0.2,
  'Sun and Moon apparent sizes should be within ~20% at a typical epoch',
)

const far = { x: 1, y: 0, z: 0 }
const alignedMoon: Vec3 = { x: 1 - 384400 / KM_PER_AU, y: 0, z: 0 }
const solarHit = coneOnTarget(alignedMoon, R_MOON_KM, far, R_EARTH_KM, 'solar')
assert(solarHit.hit.alongKm > 0, 'Earth should sit down-Sun of the Moon in the aligned case')
assert(
  solarHit.hit.kind === 'total' ||
    solarHit.hit.kind === 'annular' ||
    solarHit.hit.kind === 'partial',
  `aligned new-moon geometry should eclipse Earth, got ${solarHit.hit.kind}`,
)
assert(
  solarHit.hit.penumbraRadiusKm > solarHit.hit.umbraRadiusKm,
  'penumbra should outspan the umbra',
)

const lunarHit = coneOnTarget(
  far,
  R_EARTH_KM,
  { x: 1 + 384400 / KM_PER_AU, y: 0, z: 0 },
  R_MOON_KM,
  'lunar',
)
assert(lunarHit.hit.alongKm > 0, 'Moon should sit down-Sun of Earth at full moon')
assert(
  lunarHit.hit.kind === 'total' ||
    lunarHit.hit.kind === 'partial' ||
    lunarHit.hit.kind === 'penumbral',
  `aligned full-moon geometry should eclipse the Moon, got ${lunarHit.hit.kind}`,
)
assert(
  lunarHit.hit.umbraRadiusKm > R_MOON_KM,
  'Earth’s umbra at the Moon should exceed the lunar radius',
)

const offsetMoon: Vec3 = { x: 1 - 384400 / KM_PER_AU, y: 0.02, z: 0 }
const miss = coneOnTarget(offsetMoon, R_MOON_KM, far, R_EARTH_KM, 'solar')
assert(
  miss.hit.kind === 'miss' || miss.hit.missKm > R_EARTH_KM,
  'a 0.02 AU miss should not be a central eclipse',
)

const snapshot = planetSystemAt(new Date('2000-01-01T12:00:00Z'), 'earth')
const moon = snapshot.satellites[0]
assert(moon, 'Moon missing')
const varpi = snapshot.earthPerihelionLongitude
const pose = shellPose(defaultShellCamera(varpi))
const scale = (distance: number) => distance * 40
const sample: Vec3 = moon.position
const edge = projectEdgeOn(50, 50, sample, varpi, scale)
const shell = projectOrthographic(50, 50, sample, pose, scale)
assert(Math.abs(edge.x - shell.x) < 1e-9, `edge X ${edge.x} should match shell ${shell.x}`)
assert(Math.abs(edge.y - shell.y) < 1e-9, `edge Y ${edge.y} should match shell ${shell.y}`)
assert(
  Math.abs(edge.depth - shell.depth) < 1e-9,
  `edge depth ${edge.depth} should match shell ${shell.depth}`,
)

assert(
  Math.abs(deg(LUNAR_LONGITUDE_ENVELOPE_RAD) - 1.8) < 0.01,
  `provisional envelope should remain ±1.8°, got ${deg(LUNAR_LONGITUDE_ENVELOPE_RAD).toFixed(2)}°`,
)
const envelopeWidthKm = 384400 * LUNAR_LONGITUDE_ENVELOPE_RAD
assert(envelopeWidthKm > 5000, `±1.8° at the Moon is ~${envelopeWidthKm.toFixed(0)} km each way`)
assert(
  envelopeWidthKm > Math.abs(solarHit.hit.umbraRadiusKm) || solarHit.hit.umbraRadiusKm < 0,
  'the longitude envelope should outspan a typical umbra radius at Earth',
)

assert(
  j2000.sunNodeSeparation >= 0 && j2000.sunNodeSeparation <= Math.PI / 2,
  'node separation is a smallest angle',
)
assert(
  envelopeHitSamples(j2000, 'moon').length === 0 && envelopeHitSamples(j2000, 'earth').length === 0,
  'the uncertainty envelope must disappear away from both syzygies',
)

const april2024 = eclipseGeometryAt(new Date('2024-04-08T18:00:00Z'))
assert(
  april2024.moonCast.kind !== 'miss',
  'the model should recognize the April 2024 solar eclipse',
)
assert(
  envelopeHitSamples(april2024, 'moon').length > 0,
  'solar uncertainty samples should appear around an eclipse',
)

const march2025 = eclipseGeometryAt(new Date('2025-03-14T06:00:00Z'))
assert(
  march2025.earthCast.kind !== 'miss',
  'the model should recognize the March 2025 lunar eclipse',
)
assert(
  envelopeHitSamples(march2025, 'earth').length > 0,
  'lunar uncertainty samples should appear around an eclipse',
)

// Independent greatest-eclipse coordinates from NASA/EclipseWise path tables.
// These catch a Moon whose mean phase still finds the eclipse day but puts the
// central shadow hundreds or thousands of kilometers away.
const catalogSolarEclipses = [
  {
    name: '1979 Feb 26 total',
    at: '1979-02-26T16:54:16Z',
    latitude: 52.1,
    longitude: -94.5,
    kind: 'total',
  },
  {
    name: '1991 Jul 11 total',
    at: '1991-07-11T19:06:03Z',
    latitude: 22,
    longitude: -105.2,
    kind: 'total',
  },
  {
    name: '2017 Aug 21 total',
    at: '2017-08-21T18:25:32Z',
    latitude: 36 + 58 / 60,
    longitude: -(87 + 40.3 / 60),
    kind: 'total',
  },
  {
    name: '2023 Oct 14 annular',
    at: '2023-10-14T17:59:29Z',
    latitude: 11 + 22.1 / 60,
    longitude: -(83 + 6.1 / 60),
    kind: 'annular',
  },
  {
    name: '2024 Apr 08 total',
    at: '2024-04-08T18:17:18Z',
    latitude: 25 + 17.2 / 60,
    longitude: -(104 + 8.3 / 60),
    kind: 'total',
  },
] as const

let worstCatalogPathErrorKm = 0
let catalogEnvelopeHits = 0
for (const event of catalogSolarEclipses) {
  const date = new Date(event.at)
  const geometry = eclipseGeometryAt(date)
  assert(
    geometry.moonCast.kind === event.kind,
    `${event.name}: expected ${event.kind} at greatest eclipse, got ${geometry.moonCast.kind}`,
  )
  const centralShadow = shadowFootprint(geometry.moonCone, 'umbra')
  assert(centralShadow, `${event.name}: central shadow should reach Earth`)
  const catalogDirection = geographicDirection(date, event.latitude, event.longitude)
  const errorKm = distanceToRegionKm(centralShadow, catalogDirection)
  worstCatalogPathErrorKm = Math.max(worstCatalogPathErrorKm, errorKm)
  assert(
    errorKm < 500,
    `${event.name}: central path is ${errorKm.toFixed(0)} km from the catalog point`,
  )
  const provisionalEnvelope = shadowEnvelope(geometry, 'moon', 'umbra')
  if (provisionalEnvelope?.contains(catalogDirection)) catalogEnvelopeHits++
}

// The night region turns concave past half phase, so its area is the check
// that matters: a convex approximation reads as a fully dark body.
const discR = 42
const discArea = Math.PI * discR * discR
/**
 * Filled area of a path of straight closed subpaths, taking one that arcs for
 * the whole disc: that is the only curve any of these paths draws, and it is
 * always the limb. Subpaths are summed as though disjoint, which the shapes
 * here are.
 */
function pathArea(d: string | null): number {
  if (!d) return 0
  if (d.includes('A')) return discArea
  let area = 0
  for (const subpath of d.split('M').filter((chunk) => chunk.trim().length > 0)) {
    const points = pathPoints(`M${subpath}`)
    if (points.length < 3) continue
    let sum = 0
    for (let index = 0; index < points.length; index++) {
      const [x1, y1] = points[index]
      const [x2, y2] = points[(index + 1) % points.length]
      sum += x1 * y2 - x2 * y1
    }
    area += Math.abs(sum) / 2
  }
  return area
}

let worstNightError = 0
for (const longitude of [0, 0.7, 2.4, 4.9]) {
  for (const latitude of [-0.9, 0, 0.5]) {
    const globePose = shellPose({ longitude, latitude })
    for (let k = 1; k <= 24; k++) {
      const t = (k / 24) * Math.PI * 2
      const sun: Vec3 = {
        x: Math.cos(t),
        y: Math.sin(t) * 0.8,
        z: Math.sin(t * 1.7) * 0.6,
      }
      const unit = vecNormalize(sun)
      const cosPhi = vecDot(unit, globePose.look)
      const expected = (discArea / 2) * (1 + cosPhi)
      const got = pathArea(nightFillPath(sun, globePose, 50, 50, discR))
      worstNightError = Math.max(worstNightError, Math.abs(got - expected) / discArea)
    }
  }
}
assert(
  worstNightError < 0.01,
  `night fill should match the analytic terminator area, off by ${(worstNightError * 100).toFixed(1)}% of the disc`,
)

const facingPose = shellPose({ longitude: 0, latitude: 0 })
assert(
  nightFillPath({ x: -1, y: 0, z: 0 }, facingPose, 50, 50, discR) === '',
  'a body with the Sun behind the camera has no night side',
)
assert(
  nightFillPath({ x: 1, y: 0, z: 0 }, facingPose, 50, 50, discR).includes('A'),
  'a body with the Sun exactly behind it is a full dark disc',
)

// A shadow footprint is only meaningful if it lands where the shadow axis
// actually pierces the target. Viewed down that axis the footprint projects
// back to the cone cross-section, so its offset and area are analytic.
function sunPose(axis: Vec3): CameraPose {
  return { look: vecNormalize(axis), up: { x: 0, y: 0, z: 1 } }
}

function pathPoints(d: string | null): number[][] {
  if (!d) return []
  return [...d.matchAll(/[ML] (-?[\d.e-]+) (-?[\d.e-]+)/g)].map((match) => [+match[1], +match[2]])
}

function pathCentroid(d: string | null): { x: number; y: number } | null {
  const points = pathPoints(d)
  if (!points.length) return null
  return {
    x: points.reduce((sum, point) => sum + point[0], 0) / points.length,
    y: points.reduce((sum, point) => sum + point[1], 0) / points.length,
  }
}

/** Area shared by two overlapping circles, radii in screen units. */
function lensArea(bigR: number, smallR: number, separation: number): number {
  if (separation >= bigR + smallR) return 0
  if (separation <= Math.abs(bigR - smallR)) return Math.PI * Math.min(bigR, smallR) ** 2
  const a = Math.acos((separation ** 2 + bigR ** 2 - smallR ** 2) / (2 * separation * bigR))
  const b = Math.acos((separation ** 2 + smallR ** 2 - bigR ** 2) / (2 * separation * smallR))
  return bigR ** 2 * (a - Math.sin(2 * a) / 2) + smallR ** 2 * (b - Math.sin(2 * b) / 2)
}

const totalSolar = eclipseGeometryAt(new Date('2024-04-08T18:20:00Z'))
const totalSolarCone = activeCone(totalSolar, 'moon')
const solarPose = sunPose(totalSolarCone.axis)
const totalSolarR = totalSolarCone.targetRadiusKm
const solarUmbra = shadowFootprint(totalSolarCone, 'umbra')
assert(solarUmbra, 'a total solar eclipse should put an umbra on Earth')
const solarUmbraPath = projectRegionPath(solarUmbra, solarPose, 50, 50, discR)
const solarUmbraSpot = pathCentroid(solarUmbraPath)
assert(solarUmbraSpot, 'the umbra footprint should project to a path')
const expectedOffset = (totalSolarCone.hit.missKm / totalSolarR) * discR
assert(
  Math.abs(Math.hypot(solarUmbraSpot.x - 50, solarUmbraSpot.y - 50) - expectedOffset) <
    0.02 * discR,
  `the umbra should sit ${expectedOffset.toFixed(1)} from the disc center, not ` +
    `${Math.hypot(solarUmbraSpot.x - 50, solarUmbraSpot.y - 50).toFixed(1)}`,
)
assert(
  pathArea(solarUmbraPath) < 0.005 * discArea,
  `a lunar umbra covers a fraction of a percent of Earth, got ${((pathArea(solarUmbraPath) / discArea) * 100).toFixed(2)}%`,
)
// The cone tapers by a third of the umbra's width over Earth's depth, so the
// footprint on the surface has to be wider than the cross-section at center.
assert(
  pathArea(solarUmbraPath) >
    Math.PI * ((totalSolarCone.hit.umbraRadiusKm / totalSolarR) * discR) ** 2,
  'the umbra on the sunward surface should outspan the cross-section at the target center',
)

const solarPenumbra = shadowFootprint(totalSolarCone, 'penumbra')
assert(solarPenumbra, 'a total solar eclipse should put a penumbra on Earth')
const solarPenumbraArea = pathArea(projectRegionPath(solarPenumbra, solarPose, 50, 50, discR))
const penumbraLens = lensArea(
  discR,
  (totalSolarCone.hit.penumbraRadiusKm / totalSolarR) * discR,
  expectedOffset,
)
assert(
  Math.abs(solarPenumbraArea - penumbraLens) < 0.05 * penumbraLens,
  `the penumbra should cover the cone-disc overlap ${penumbraLens.toFixed(0)}, got ${solarPenumbraArea.toFixed(0)}`,
)

// Earth's umbra swallows the Moon whole, so its footprint is the lit face.
const totalLunar = eclipseGeometryAt(new Date('2025-03-14T06:58:00Z'))
const lunarCone = activeCone(totalLunar, 'earth')
const lunarPenumbra = shadowFootprint(lunarCone, 'penumbra')
assert(lunarPenumbra, 'a lunar eclipse should put a penumbra on the Moon')
const lunarPenumbraArea = pathArea(
  projectRegionPath(lunarPenumbra, sunPose(lunarCone.axis), 50, 50, discR),
)
assert(
  lunarPenumbraArea > 0.99 * discArea,
  `an engulfed Moon should be fully shaded, got ${((lunarPenumbraArea / discArea) * 100).toFixed(1)}%`,
)

// From any camera, the drawn shadow has to be the shadow the region defines.
// Where its boundary runs off the visible face the path closes along the limb,
// and closing that the wrong way round is not a small error: it fills the disc
// where a sliver belongs, or empties it where the shadow engulfs the body. So
// the filled path is put against the region's own membership test point by
// point. Only the closure itself is left over, a hairline along the limb where
// a shadow reaching past the terminator is seen nearly edge-on.
function pathLoops(d: string): { x: number; y: number }[][] {
  return d
    .split('M')
    .filter((chunk) => chunk.trim().length > 0)
    .map((chunk) => pathPoints(`M${chunk}`).map(([x, y]) => ({ x, y })))
}

function filled(loops: { x: number; y: number }[][], point: { x: number; y: number }): boolean {
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

/** Share of the visible disc where the drawn path and the region disagree. */
function maskError(region: SurfaceRegion, globePose: CameraPose): number {
  const { look, right, up } = cameraAxes(globePose)
  const d = projectRegionPath(region, globePose, 50, 50, discR)
  const wholeDisc = d !== null && d.includes('A')
  const loops = d !== null && !wholeDisc ? pathLoops(d) : []
  const step = 0.03
  let mismatch = 0
  let total = 0
  for (let u = -1 + step / 2; u < 1; u += step) {
    for (let v = -1 + step / 2; v < 1; v += step) {
      const rho = u * u + v * v
      if (rho > 1) continue
      total++
      const depth = -Math.sqrt(1 - rho)
      const direction: Vec3 = {
        x: right.x * u + up.x * v + look.x * depth,
        y: right.y * u + up.y * v + look.y * depth,
        z: right.z * u + up.z * v + look.z * depth,
      }
      const drawn = wholeDisc || filled(loops, { x: 50 + discR * u, y: 50 - discR * v })
      if (drawn !== region.contains(direction)) mismatch++
    }
  }
  return mismatch / total
}

// A shadow whose boundary straddles the terminator is the hard case, so a
// partial and a penumbral lunar eclipse join the two that engulf their target.
const partialLunar = eclipseGeometryAt(new Date('2026-08-28T04:13:00Z'))
assert(partialLunar.earthCast.kind === 'partial', 'the August 2026 lunar eclipse should be partial')
const penumbralLunar = eclipseGeometryAt(new Date('2025-03-14T04:30:00Z'))
assert(penumbralLunar.earthCast.kind === 'penumbral', 'March 2025 opens penumbral')
const drawn = [
  [totalSolar, 'moon'],
  [totalLunar, 'earth'],
  [partialLunar, 'earth'],
  [penumbralLunar, 'earth'],
] as const

let worstMask = 0
let meanMask = 0
let masks = 0
for (const [geometry, caster] of drawn) {
  const cone = activeCone(geometry, caster)
  const regions = [
    shadowFootprint(cone, 'umbra'),
    shadowFootprint(cone, 'penumbra'),
    shadowEnvelope(geometry, caster, 'umbra'),
    shadowEnvelope(geometry, caster, 'penumbra'),
  ]
  for (let index = 0; index < 36; index++) {
    for (const latitude of [-1.2, -0.6, -0.2, 0, 0.2, 0.6, 1.2]) {
      const globePose = shellPose({ longitude: (index / 36) * Math.PI * 2, latitude })
      for (const region of regions) {
        if (!region) continue
        const error = maskError(region, globePose)
        worstMask = Math.max(worstMask, error)
        meanMask += error
        masks++
      }
    }
  }
}
assert(
  worstMask < 0.04,
  `one camera draws a shadow disagreeing with its region over ${(worstMask * 100).toFixed(1)}% of the disc`,
)
assert(
  meanMask / masks < 0.005,
  `drawn shadows disagree with their regions over ${((meanMask / masks) * 100).toFixed(2)}% of the disc on average`,
)

// The same closure, read as the camera turns: a shadow has to slide across the
// disc under a drag, not blink between a sliver and the whole face. A degree
// of longitude is well under one frame of a drag.
let worstBlink = 0
for (const [geometry, caster] of drawn) {
  const cone = activeCone(geometry, caster)
  const regions = [
    shadowFootprint(cone, 'umbra'),
    shadowFootprint(cone, 'penumbra'),
    shadowEnvelope(geometry, caster, 'umbra'),
    shadowEnvelope(geometry, caster, 'penumbra'),
  ]
  for (const region of regions) {
    if (!region) continue
    for (const latitude of [-0.9, 0, 0.9]) {
      let previous: number | null = null
      for (let step = 0; step <= 360; step++) {
        const globePose = shellPose({ longitude: (step / 360) * Math.PI * 2, latitude })
        const share = pathArea(projectRegionPath(region, globePose, 50, 50, discR)) / discArea
        if (previous !== null) worstBlink = Math.max(worstBlink, Math.abs(share - previous))
        previous = share
      }
    }
  }
}
assert(
  worstBlink < 0.02,
  `a degree of drag changes a drawn shadow by ${(worstBlink * 100).toFixed(1)}% of the disc`,
)

// The envelope is an error bound, so it has to contain the shadow it brackets
// rather than sit beside it, and it should read as a swept band, not a dot.
for (const [label, geometry, caster] of [
  ['solar', totalSolar, 'moon'],
  ['lunar', totalLunar, 'earth'],
] as const) {
  const cone = activeCone(geometry, caster)
  const envelope = shadowEnvelope(geometry, caster, 'umbra')
  assert(envelope, `${label}: a total eclipse should have an umbral envelope`)
  let spanKm = 0
  for (const a of envelope.outline) {
    for (const b of envelope.outline) {
      const dot = Math.min(1, Math.max(-1, vecDot(a, b)))
      spanKm = Math.max(spanKm, Math.acos(dot) * cone.targetRadiusKm)
    }
  }
  assert(
    spanKm > cone.targetRadiusKm,
    `${label}: the envelope spans only ${spanKm.toFixed(0)} km, less than the target radius`,
  )
}

/**
 * Share of the sunward face that `region` claims and `bound` does not, over a
 * grid square to the shadow axis. By area, because a shared boundary is where
 * these two nearly always meet: counting boundary points that land a rounding
 * error outside measures the sampling, not the geometry.
 */
function uncoveredShare(region: SurfaceRegion, bound: SurfaceRegion, axis: Vec3): number {
  const look = vecNormalize(axis)
  const { right, up } = cameraAxes({ look, up: { x: 0, y: 0, z: 1 } })
  const step = 0.02
  let uncovered = 0
  let total = 0
  for (let u = -1 + step / 2; u < 1; u += step) {
    for (let v = -1 + step / 2; v < 1; v += step) {
      const rho = u * u + v * v
      if (rho > 1) continue
      total++
      const depth = -Math.sqrt(1 - rho)
      const direction: Vec3 = {
        x: right.x * u + up.x * v + look.x * depth,
        y: right.y * u + up.y * v + look.y * depth,
        z: right.z * u + up.z * v + look.z * depth,
      }
      if (region.contains(direction) && !bound.contains(direction)) uncovered++
    }
  }
  return uncovered / total
}

// Every shadow drawn is bracketed by a band of its own, at every epoch. One
// band cannot cover both features: through a penumbral eclipse the umbra never
// lands, so an umbral band alone leaves the penumbra — the only shadow on the
// disc — unbounded for hours, blinking on and off on a schedule of its own.
let bandless = 0
let unbounded = 0
let worstUncovered = 0
let bracketed = 0
for (const [when, caster] of [
  ['2024-04-08T18:20:00Z', 'moon'],
  ['2025-03-14T06:58:00Z', 'earth'],
  ['2026-08-28T04:13:00Z', 'earth'],
  // The window a bug report walked through: a penumbral eclipse whose umbral
  // band comes and goes while the drawn penumbra stays.
  ['2027-02-20T22:40:00Z', 'earth'],
] as const) {
  for (let minute = -300; minute <= 300; minute += 20) {
    const geometry = eclipseGeometryAt(new Date(Date.parse(when) + minute * 60_000))
    const cone = activeCone(geometry, caster)
    for (const feature of ['penumbra', 'umbra'] as const) {
      const footprint = shadowFootprint(cone, feature)
      if (!footprint) continue
      bracketed++
      const band = shadowEnvelope(geometry, caster, feature)
      if (!band) {
        bandless++
        continue
      }
      const uncovered = uncoveredShare(footprint, band, cone.axis)
      worstUncovered = Math.max(worstUncovered, uncovered)
      if (uncovered > 0.005) unbounded++
    }
  }
}
assert(
  bandless === 0,
  `${bandless} of ${bracketed} drawn shadows have no envelope of their own to bound them`,
)
assert(
  unbounded === 0,
  `${unbounded} of ${bracketed} drawn shadows stray outside their own envelope, ` +
    `by up to ${(worstUncovered * 100).toFixed(2)}% of the sunward face`,
)

// A sweeping shadow, not one that pops in and out: the penumbra switches on
// once and off once, and the umbra walks a long way in small steps.
const sweepStart = Date.parse('2024-04-08T06:00:00Z')
let transitions = 0
let visibleSteps = 0
let previousOn = false
let travel = 0
let longestJump = 0
let lastSpot: { x: number; y: number } | null = null
for (let minute = 0; minute <= 24 * 60; minute += 5) {
  const geometry = eclipseGeometryAt(new Date(sweepStart + minute * 60_000))
  const cone = activeCone(geometry, 'moon')
  const pose = sunPose(cone.axis)
  const on = shadowFootprint(cone, 'penumbra') !== null
  if (on) visibleSteps++
  if (on !== previousOn) transitions++
  previousOn = on
  const umbra = shadowFootprint(cone, 'umbra')
  const spot = umbra && pathCentroid(projectRegionPath(umbra, pose, 50, 50, discR))
  if (spot && lastSpot) {
    const step = Math.hypot(spot.x - lastSpot.x, spot.y - lastSpot.y)
    travel += step
    longestJump = Math.max(longestJump, step)
  }
  lastSpot = spot
}
assert(
  transitions === 2,
  `the penumbra should appear once and leave once across the eclipse day, saw ${transitions} switches`,
)
assert(visibleSteps > 36, `the shadow should linger for hours, got ${(visibleSteps * 5) / 60} h`)
assert(travel > discR / 2, `the umbra should cross the disc, it moved ${travel.toFixed(1)} units`)
assert(
  longestJump < discR / 8,
  `the umbra should walk, not jump; worst step ${longestJump.toFixed(1)} units`,
)

console.log(
  `ok  eclipse geometry: Sun ${deg(j2000.sunApparent).toFixed(3)}°, Moon ${deg(j2000.moonApparent).toFixed(3)}°, ` +
    `solar ${solarHit.hit.kind}, lunar ${lunarHit.hit.kind}, node ${deg(j2000.sunNodeSeparation).toFixed(1)}°`,
)
console.log(
  `ok  catalog paths: ${catalogSolarEclipses.length} historical maxima within ` +
    `${worstCatalogPathErrorKm.toFixed(0)} km worst-case; provisional umbral envelope contains ` +
    `${catalogEnvelopeHits}/${catalogSolarEclipses.length}`,
)
console.log(
  `ok  footprints: umbra ${expectedOffset.toFixed(1)}/${discR} off center, ` +
    `${((pathArea(solarUmbraPath) / discArea) * 100).toFixed(2)}% of Earth’s disc, ` +
    `sweeping ${travel.toFixed(0)} units over ${((visibleSteps * 5) / 60).toFixed(1)} h`,
)
console.log(
  `ok  envelopes: ${bracketed} drawn shadows each bracketed by a band of their own, ` +
    `straying at most ${(worstUncovered * 100).toFixed(2)}% of the sunward face`,
)
console.log(
  `ok  limb closure: ${masks} cameras disagree with their region by ` +
    `${((meanMask / masks) * 100).toFixed(2)}% of the disc on average, ` +
    `${(worstMask * 100).toFixed(1)}% at worst, moving ${(worstBlink * 100).toFixed(1)}% per degree`,
)
